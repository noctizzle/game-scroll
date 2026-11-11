// Plays Next Gen and AR games on WebGPU and on WebGL and compares them: which games draw on WebGPU
// (the rest stay on WebGL by themselves, hd3d.js gpuFits), errors on either, and how different the
// first moments of play look (each game's own randomness moves things a little, so it's a guide, not a test). Uses SwiftShader's Vulkan driver, so it runs in CI without a GPU.
//   npm run build:bundled && node scripts/gpu-games.cjs [id ...] [--shots dir] [--tier 0..3]
// Without ids it plays every Next Gen and AR game. Fails if a game throws on WebGPU.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), si = argv.indexOf('--shots'), shots = si >= 0 ? argv.splice(si, 2)[1] : null;
  const ti = argv.indexOf('--tier'), tier = ti >= 0 ? +argv.splice(ti, 2)[1] : null;   // pin a quality tier (0..3) for both
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const server = await (await import('vite')).preview({ preview: { port: 4185 } });
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(); let errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if ((m.type() === 'error' && !/^Failed to load resource/.test(m.text())) || /WebGPU did not start|WebGPU:/.test(m.text())) errs.push(m.text()); });
  await p.goto('http://localhost:4185/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(400);
  const ids = argv.length ? argv : await p.evaluate(() => __gs.GAMES.filter(g => g.era === 'nextgen' || g.era === 'ar' || g.era === 'board').map(g => g.id));
  const pick = async v => p.evaluate(async v => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick(v); return v === 'webgpu' ? !!(await window.__gpu.ready()) : true; }, v);
  const card = async () => { const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, width: c.width, height: c.height }; }); return p.screenshot({ clip: r }); };
  const diff = (a, c) => p.evaluate(async ([a, c]) => {
    const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + u; });
    const [A, C] = await Promise.all([load(a), load(c)]), w = A.width, h = A.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
    x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(C, 0, 0); const pc = x.getImageData(0, 0, w, h).data;
    let sum = 0; for (let i = 0; i < pa.length; i += 4) sum += (Math.abs(pa[i] - pc[i]) + Math.abs(pa[i + 1] - pc[i + 1]) + Math.abs(pa[i + 2] - pc[i + 2])) / 3;
    return sum / (pa.length / 4);
  }, [a.toString('base64'), c.toString('base64')]);
  // the 3D parts load with the first 3D game; WebGPU starts once they're in
  await p.evaluate(id => __gs.only(id), ids[0]); await p.waitForTimeout(1500);
  if (tier != null) await p.evaluate(t => { window.__hd.force = t; }, tier);
  if (!await pick('webgpu')) { console.log('FAIL WebGPU did not start in this browser'); process.exit(1); }
  let failed = 0; const on = [];
  for (const id of ids) {
    const look = {}, back = {}, bad = {};
    for (const v of ['webgl', 'webgpu']) {
      errs = [];
      await pick(v);
      // the first moments of play with no input (the HUD and the waiting card's text cover less of the 3D)
      await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(800); await p.evaluate(() => __gs.start()); await p.waitForTimeout(1500);
      look[v] = await card();
      // then play it with random input for a few seconds
      const r = await p.evaluate(() => { const c = __gs.active.canvas.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; });
      const t0 = Date.now();
      while (Date.now() - t0 < 2500) {
        if (await p.evaluate(() => __gs.active.state) !== 'playing') await p.evaluate(() => __gs.start());
        await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h); await p.mouse.down();
        await p.mouse.move(r.x + Math.random() * r.w, r.y + Math.random() * r.h, { steps: 3 });
        await p.waitForTimeout(Math.random() * 120); await p.mouse.up();
      }
      back[v] = await p.evaluate(() => window.__hd?.info.backend); if (v === 'webgpu') back.why = await p.evaluate(() => window.__hd?.info.webgl);
      bad[v] = errs.slice();
    }
    const d = await diff(look.webgl, look.webgpu), ok = !bad.webgpu.length;
    if (!ok) failed++;
    if (back.webgpu === 'webgpu') on.push(id);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id.padEnd(16)} ${back.webgpu === 'webgpu' ? 'draws on WebGPU' : `stays on WebGL (${back.why || '?'})`}  picture differs ${d.toFixed(1)}/255${bad.webgl.length ? '  (WebGL errors too)' : ''}${ok ? '' : '\n   ' + bad.webgpu.join('\n   ')}`);
    if (shots) { fs.writeFileSync(path.join(shots, id + '.webgl.png'), look.webgl); fs.writeFileSync(path.join(shots, id + '.webgpu.png'), look.webgpu); }
  }
  console.log(`${on.length} of ${ids.length} games draw on WebGPU: ${on.join(', ')}`);
  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
