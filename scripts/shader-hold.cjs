// A new kind of thing appearing mid-round: does the frame it appears in stop while its shader builds?
// Draws scripts/shader-hold/ with shaders built in the background (v.holdNew, the default) and in the
// frame (HD.hold = false), on WebGL or WebGPU, and prints how long that frame took and how many frames
// the thing waited. Usage: node scripts/shader-hold.cjs [--webgpu]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const gpu = process.argv.includes('--webgpu');
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4187 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch(gpu
    ? { args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } }
    : { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0;
  for (const hold of [1, 0]) {
    const p = await b.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(`http://localhost:4187/scripts/shader-hold/?hold=${hold}${gpu ? '&gpu' : ''}`); await p.waitForFunction(() => window.result, null, { timeout: 300000 });
    const r = await p.evaluate(() => window.result);
    if (r.error || errs.length) { console.log('FAIL', r.error || errs.join('\n')); bad++; await p.close(); continue; }
    const ok = hold ? r.heldAtFirst === 1 && r.stillHeld === 0 : r.heldAtFirst === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.backend} ${hold ? 'built in the background' : 'built in the frame     '}: the frame it appears in ${r.first.toFixed(0)} ms, waited ${r.shownAfter} frames (${r.waitMs.toFixed(0)} ms), frames after ${r.after.toFixed(0)} ms`);
    await p.close();
  }
  await b.close(); await server.close();
  process.exit(bad ? 1 : 0);
})();
