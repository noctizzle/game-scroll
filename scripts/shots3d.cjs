// Close-up screenshots of games mid-play (canvas only, 2x). Usage: npm run build:bundled && node scripts/shots3d.cjs outdir id ...
const { chromium } = require('playwright');
(async () => {
  const [out, ...ids] = process.argv.slice(2);
  const server = await (await import('vite')).preview({ preview: { port: 4182 } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4182/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(300);
  for (const id of ids) {
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
    await p.evaluate(() => __gs.start());
    const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
    for (let i = 0; i < 8; i++) { await p.mouse.move(r.x + r.w * (.3 + Math.random() * .4), r.y + r.h * (.4 + Math.random() * .4)); await p.mouse.down(); await p.waitForTimeout(120); await p.mouse.up(); await p.waitForTimeout(150); }
    await p.screenshot({ path: `${out}/${id}.png`, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
    const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
    console.log(id, 'fps', fps, errs.splice(0).join(' | '));
  }
  await b.close(); server.httpServer.close();
})();
