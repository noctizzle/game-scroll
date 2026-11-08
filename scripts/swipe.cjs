// Checks feed swipes while a game is running: a deliberate flick outside the game screen changes
// game, but a flick right after in-game input, or a drag that starts on the game, does not.
// Usage: npm run build:bundled && node scripts/swipe.cjs
const { chromium } = require('playwright');
(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4185 } });
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto('http://localhost:4185/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(400); let fails = 0;
  const where = () => p.evaluate(() => [...document.querySelectorAll('.slide')].indexOf(__gs.active.el));
  const rects = () => p.evaluate(() => { const r = q => { const b = __gs.active.el.querySelector(q).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }; return { cap: r('.caption'), scr: r('.screen') }; });
  const flick = async (x, y0, y1, ms = 200) => { await p.mouse.move(x, y0); await p.mouse.down(); for (let i = 1; i <= 6; i++) { await p.mouse.move(x, y0 + (y1 - y0) * i / 6); await p.waitForTimeout(ms / 6); } await p.mouse.up(); await p.waitForTimeout(900); };
  const check = async (label, fn, expect) => {
    await p.evaluate(() => __gs.start()); await p.waitForTimeout(1200); const a = await where(); await fn(await rects()); const z = await where();
    const moved = z - a, ok = moved === expect; if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', label, `${a} -> ${z}`);
  };
  await check('flick up from caption -> next', r => flick(r.cap.x + 20, r.cap.y + r.cap.h / 2, r.cap.y - 220), 1);
  await check('flick down from top bar -> previous', r => flick(30, 30, 300), -1);
  await check('drag starting on the game stays', r => flick(r.scr.x + r.scr.w / 2, r.scr.y + r.scr.h - 20, r.scr.y + 40), 0);
  await check('flick right after a game tap stays', async r => { await p.mouse.click(r.scr.x + r.scr.w / 2, r.scr.y + r.scr.h / 2); await flick(r.cap.x + 20, r.cap.y + r.cap.h / 2, r.cap.y - 220); }, 0);
  await check('slow drag on caption stays', r => flick(r.cap.x + 20, r.cap.y + r.cap.h / 2, r.cap.y - 220, 1500), 0);
  await b.close(); server.httpServer.close(); process.exit(fails ? 1 : 0);
})();
