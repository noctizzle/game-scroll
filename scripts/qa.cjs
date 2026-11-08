// Automated QA pass: plays every game (or the ids given) with simple bots on a phone-sized
// screen and records how each one behaves, so weak or broken games stand out.
//
//   npm run qa                  -> all games, writes docs/qa/auto-report.json + .md
//   npm run qa -- worm bricks   -> just these
//   SHOTS=dir npm run qa        -> also saves a mid-play screenshot per game
//
// Bots: "idle" starts the game and never touches it. "tapper" mashes random taps and
// short drags. Neither is a real player; the numbers are signals for a human to judge.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const IDLE_MS = 6000, TAP_MS = 9000, WORKERS = 4;

async function probe(p) {
  // Tiny fingerprint of the canvas so we can tell whether anything is moving.
  return p.evaluate(() => {
    const src = __gs.active.canvas, c = document.createElement('canvas'); c.width = c.height = 24;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data; let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + (d[i] >> 4) * 7 + (d[i + 1] >> 4) * 3 + (d[i + 2] >> 4)) | 0;
    return h;
  });
}

async function runGame(p, id, errs) {
  errs.length = 0;
  await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
  const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
  const out = { id };

  // 1. idle bot
  await p.evaluate(() => __gs.start());
  let t0 = Date.now(), frames = new Set(), idleOver = null;
  while (Date.now() - t0 < IDLE_MS) {
    frames.add(await probe(p));
    if (await p.evaluate(() => __gs.active.state) !== 'playing') { idleOver = Date.now() - t0; break; }
    await p.waitForTimeout(250);
  }
  out.idleEndsMs = idleOver;               // null = survives with no input
  out.idleScore = await p.evaluate(() => __gs.active.score);
  out.idleFrames = frames.size;            // 1-2 = static screen until you touch it

  // 2. random tapper bot
  await p.evaluate(() => __gs.start());
  const rounds = []; let roundStart = Date.now(), maxScore = 0, shot = false, tapFrames = new Set();
  t0 = Date.now();
  while (Date.now() - t0 < TAP_MS) {
    if (await p.evaluate(() => __gs.active.state) !== 'playing') {
      rounds.push({ ms: Date.now() - roundStart, score: await p.evaluate(() => __gs.active.score) });
      await p.waitForTimeout(600); await p.evaluate(() => __gs.start()); roundStart = Date.now();
    }
    const x = r.x + Math.random() * r.w, y = r.y + Math.random() * r.h;
    await p.mouse.move(x, y); await p.mouse.down();
    if (Math.random() < .4) await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 4 });
    await p.waitForTimeout(Math.random() * 140); await p.mouse.up();
    await p.waitForTimeout(60 + Math.random() * 160);
    maxScore = Math.max(maxScore, await p.evaluate(() => __gs.active.score));
    tapFrames.add(await probe(p));
    if (!shot && process.env.SHOTS && Date.now() - t0 > 2500) {
      await p.screenshot({ path: path.join(process.env.SHOTS, `${id}.png`) }); shot = true;
    }
  }
  out.tapRounds = rounds.length;           // completed rounds in TAP_MS
  out.tapMedianRoundMs = rounds.length ? rounds.map(r => r.ms).sort((a, b) => a - b)[rounds.length >> 1] : null;
  out.tapBest = maxScore;
  out.tapFrames = tapFrames.size;
  out.errors = [...new Set(errs)];
  return out;
}

function flags(g) {
  const f = [];
  if (g.errors.length) f.push('ERRORS');
  if (g.idleEndsMs !== null && g.idleEndsMs < 1500) f.push('dies-instantly-idle');
  if (g.tapMedianRoundMs !== null && g.tapMedianRoundMs < 2500 && g.tapRounds >= 3) f.push('very-short-rounds');
  if (g.tapBest === 0 && g.tapRounds === 0) f.push('no-score-no-end');      // random input gets nowhere and it never ends
  if (g.idleScore > 0) f.push('scores-without-input');
  if (g.idleFrames <= 2 && g.tapFrames <= 3) f.push('static-screen');
  return f;
}

(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4181 } });
  const b = await chromium.launch();
  const mk = async () => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://localhost:4181/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(400);
    return { p, errs };
  };
  const first = await mk();
  let ids = process.argv.slice(2);
  if (!ids.length) ids = await first.p.evaluate(() => __gs.GAMES.map(g => g.id));
  if (process.env.SHOTS) fs.mkdirSync(process.env.SHOTS, { recursive: true });
  const queue = [...ids], results = [];
  const workers = [first, ...await Promise.all(Array.from({ length: Math.min(WORKERS, ids.length) - 1 }, mk))];
  await Promise.all(workers.map(async w => {
    while (queue.length) {
      const id = queue.shift();
      const g = await runGame(w.p, id, w.errs); g.flags = flags(g); results.push(g);
      console.log(`${g.flags.length ? 'FLAG' : ' ok '} ${id.padEnd(16)} idleEnds=${g.idleEndsMs ?? '-'} rounds=${g.tapRounds} median=${g.tapMedianRoundMs ?? '-'} best=${g.tapBest} ${g.flags.join(',')}`);
    }
  }));
  results.sort((a, b) => a.id.localeCompare(b.id));
  if (process.argv.length <= 2) {
    const dir = path.join(__dirname, '..', 'docs', 'qa'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'auto-report.json'), JSON.stringify(results, null, 1) + '\n');
    const rows = results.map(g => `| ${g.id} | ${g.idleEndsMs ?? 'never'} | ${g.tapRounds} | ${g.tapMedianRoundMs ?? '-'} | ${g.tapBest} | ${g.flags.join(', ')} |`);
    fs.writeFileSync(path.join(dir, 'auto-report.md'),
      `# Automated QA report\n\nGenerated by \`npm run qa\`. Idle bot: ${IDLE_MS / 1000}s with no input. Tapper bot: ${TAP_MS / 1000}s of random taps and drags.\nThese are signals for a human, not verdicts. A puzzle that "never ends" under random taps is normal.\n\n| game | idle ends (ms) | tapper rounds | median round (ms) | tapper best | flags |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
  }
  await b.close(); server.httpServer.close();
  process.exit(results.some(g => g.errors.length) ? 1 : 0);
})();
