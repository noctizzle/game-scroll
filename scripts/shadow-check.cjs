// Checks the still/moving shadow split (hd3d.js shadowLights): plays each game for a few seconds so
// shadows are drawn from the kept copy plus the moving things, stops the game, takes a picture, then
// turns the split off and redraws every shadow in full and takes another. The two should match (the
// few pixels that differ are the game's own flicker, grain or sparkles, not shadows: look at the pictures).
//   npm run build:bundled && node scripts/shadow-check.cjs <id ...> [--gpu]
const { chromium, devices } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const vite = await import('vite'); const server = await vite.preview({ preview: { port: 4194 } });
  const gpu = process.argv.includes('--gpu'), ids = process.argv.slice(2).filter(a => !a.startsWith('--')), out = require('os').tmpdir();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const p = await (await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:4194/'); await p.waitForFunction(() => window.__gs);
  await p.evaluate(id => __gs.only(id), ids[0]); await p.waitForTimeout(1000);
  await p.evaluate(async g => { __hd.force = 3; while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick(g ? 'webgpu' : 'webgl'); if (g) await window.__gpu.ready(); }, gpu);
  for (const id of ids) {
    await p.evaluate(id => __gs.only(id), id);
    for (let i = 0; i < 120 && await p.evaluate(() => !__gs.active || __gs.active.loading); i++) await p.waitForTimeout(100);
    await p.evaluate(() => { __hd.shadowStill = 3; __hd.shadowCache = true; __gs.start(); });
    const box = await p.evaluate(() => { const r = __gs.active.canvas.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const s0 = await p.evaluate(() => __hd.info.shSplit || 0);
    const end = Date.now() + 6000; while (Date.now() < end) { if (await p.evaluate(() => __gs.active.state !== 'playing')) await p.evaluate(() => __gs.start()).catch(() => {}); await p.mouse.click(box[0] + Math.random() * box[2], box[1] + Math.random() * box[3]); await p.waitForTimeout(150); }
    const split = await p.evaluate(() => __hd.info.shSplit || 0) - s0;
    await p.evaluate(() => { const g = __gs.active.game; g.update = () => {}; });
    await p.waitForTimeout(1500);
    const shot = async () => { const d = await p.evaluate(() => __gs.active.canvas.toDataURL('image/png')); return d; };
    const A = await shot();
    await p.evaluate(() => { __hd.shadowCache = false; window.__hdView?.shadowsDirty(); });
    await p.waitForTimeout(1500);
    const B = await shot();
    const diff = await p.evaluate(async ([a, b]) => {
      const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [ia, ib] = await Promise.all([load(a), load(b)]); const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const x = c.getContext('2d');
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data; x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let bad = 0, max = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (d > 24) bad++; if (d > max) max = d; }
      return { bad, total: da.length / 4, max };
    }, [A, B]);
    fs.writeFileSync(`${out}/${id}-${gpu ? 'gpu' : 'gl'}-split.png`, Buffer.from(A.split(',')[1], 'base64')); fs.writeFileSync(`${out}/${id}-${gpu ? 'gpu' : 'gl'}-full.png`, Buffer.from(B.split(',')[1], 'base64'));
    console.log(`${gpu ? 'webgpu' : 'webgl'} ${id}: ${split} split shadow draws, ${diff.bad} of ${diff.total} pixels differ (most ${diff.max}/255) from a full redraw; pictures in ${out}/${id}-*-split.png / -full.png`);
  }
  await b.close(); server.httpServer.close();
})();
