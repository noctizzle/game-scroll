// Drives games directly (no real-time wait) through odd screen sizes and long random play, so code
// that only runs late in a round or near a level's ends gets exercised. Fails if any game throws.
// Usage: npm run build:bundled && node scripts/sweep.cjs [id ...]   (default: all Console and Next Gen games)
// Example it catches: Suit Ops threw every frame once the chopper pad came into view.
const { chromium } = require('playwright');
(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4185 } });
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const pageErrs = []; p.on('pageerror', e => pageErrs.push(e.message));
  await p.goto('http://localhost:4185/'); await p.waitForTimeout(400);
  const ids = process.argv.slice(2).length ? process.argv.slice(2)
    : await p.evaluate(() => __gs.GAMES.filter(g => g.era === 'console' || g.era === 'nextgen').map(g => g.id));
  let failed = 0;
  for (const id of ids) {
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
    const res = await p.evaluate(async () => {
      const s = __gs.active, g = s.game, c = s.canvas.getContext('2d');
      // tall and wide extremes put a level's start and end on screen at once
      const sizes = [[200, 1400], [480, 200], [160, 300], [s.w || 200, s.h || 300]];
      for (const [w, h] of sizes) {
        try {
          g.resize && g.resize(w, h); g.reset();
          let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          for (let f = 0; f < 1500; f++) {
            if (f % 12 === 0) { const x = rnd() * w, y = rnd() * h; g.down && g.down(x, y); g.move && g.move(x, y - 40 * rnd(), true); }
            if (f % 12 === 6) g.up && g.up(rnd() * w, rnd() * h);
            g.update(1 / 30);
            if (f % 5 === 0) g.draw(c);
          }
        } catch (e) { return `${w}x${h}: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`; }
      }
      return null;
    });
    if (res || pageErrs.length) { failed++; console.log(`FAIL ${id.padEnd(16)} ${res || pageErrs.join(' | ')}`); }
    else console.log(`PASS ${id}`);
    pageErrs.length = 0;
  }
  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
