// Prints the game screen size at several viewports. Usage: npm run build && node scripts/measure.cjs [id]
const { chromium } = require('playwright');
(async () => {
  const id = process.argv[2] || 'stack';
  const server = await (await import('vite')).preview({ preview: { port: 4183 } });
  const b = await chromium.launch();
  for (const [name, vp] of Object.entries({ phone: { width: 390, height: 844 }, foldout: { width: 344, height: 882 }, foldin: { width: 904, height: 1050 }, small: { width: 360, height: 640 } })) {
    const p = await (await b.newContext({ viewport: vp })).newPage(); await p.goto('http://localhost:4183/'); await p.waitForTimeout(300);
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const s = __gs.active.el, c = s.querySelector('.screen').getBoundingClientRect(), m = s.querySelector('.meta').getBoundingClientRect(), cap = s.querySelector('.caption').getBoundingClientRect(); return { screen: [Math.round(c.width), Math.round(c.height)], meta: Math.round(m.height), capW: Math.round(cap.width) }; });
    console.log(name.padEnd(8), JSON.stringify(r));
  }
  await b.close(); server.httpServer.close();
})();
