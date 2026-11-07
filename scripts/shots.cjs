// Screenshots games at phone, unfolded and folded sizes. Usage: npm run build:bundled && node scripts/shots.cjs outdir id ...
// usage: node shots.cjs outdir id1 id2 ...   (screenshots at phone + fold inner + fold outer)
const { chromium, devices } = require('playwright');
(async () => {
  const [out, ...ids] = process.argv.slice(2);
  const server = await (await import('vite')).preview({ preview: { port: 4181 } });
  const b = await chromium.launch();
  const sizes = { phone: { width: 390, height: 844 }, foldin: { width: 904, height: 1050 }, foldout: { width: 344, height: 882 } };
  for (const [name, vp] of Object.entries(sizes)) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true });
    const p = await ctx.newPage(); await p.goto('http://localhost:4181/'); await p.waitForTimeout(300);
    for (const id of ids) {
      await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(150);
      await p.evaluate(() => __gs.start()); await p.waitForTimeout(700);
      await p.screenshot({ path: `${out}/${name}-${id}.png` });
    }
    await ctx.close();
  }
  await b.close(); server.httpServer.close();
})();
