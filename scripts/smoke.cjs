// Plays every game (or the ids given as args) with random input on a phone-sized screen
// and fails if any game throws. Usage: npm run build && node scripts/smoke.cjs [id ...]
const { chromium, devices } = require('playwright');
(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4179 } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(); let errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:4179/'); await p.waitForTimeout(400);
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : await p.evaluate(() => __gs.GAMES.map(g => g.id));
  let failed = 0;
  for (const id of ids) {
    errs = [];
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    let rounds = 0, maxScore = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const st = await p.evaluate(() => __gs.active.state);
      if (st !== 'playing') { await p.evaluate(() => __gs.start()); rounds++; }
      const x = r.x + Math.random() * r.w, y = r.y + Math.random() * r.h;
      await p.mouse.move(x, y); await p.mouse.down();
      await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 3 });
      await p.waitForTimeout(Math.random() * 120); await p.mouse.up();
      maxScore = Math.max(maxScore, await p.evaluate(() => __gs.active.score));
    }
    const ok = errs.length === 0; if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(14)} rounds=${rounds} best=${maxScore}${ok ? '' : '\n   ' + errs.join('\n   ')}`);
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${id}.png` });
  }
  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
