// Checks WebGPU frame generation (src/kit/framegen.js) against the truth: a test scene is drawn at two
// real moments, the frame in between is made, and it is scored against the scene really drawn then.
// Error is the mean difference out of 255 and broken is the share of pixels off by more than 40 (a
// visible break); both should beat showing the last frame again. Uses SwiftShader's Vulkan driver, so
// it runs without a GPU (ms is software time, a rough guide only).
//   node scripts/framegen-test.cjs [--scale 1.5] [--mode ahead] [--shots dir]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const scale = opt('--scale') || '1', mode = opt('--mode') || 'blend', shots = opt('--shots');
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4187 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto(`http://localhost:4187/scripts/framegen-test/?scale=${scale}&mode=${mode}${shots ? '&shots' : ''}`);
  await p.waitForFunction(() => window.result, null, { timeout: 600000 }).catch(() => {});
  const res = await p.evaluate(() => window.result || { error: 'no result' });
  await b.close(); await server.close();
  if (res.error) { console.log('FAIL', res.error, errs.join('\n')); process.exit(1); }
  console.log(`${res.mode}, drawn at 1/${res.scale} size; error out of 255 and broken % (lower is better)`);
  let bad = 0;
  for (const [k, s] of Object.entries(res.scenes)) {
    const f = s.framegen, rp = s.repeat;
    console.log(`  ${k.padEnd(7)} framegen ${String(f.error).padStart(5)} / ${String(f.broken).padStart(5)}%   repeat ${String(rp.error).padStart(5)} / ${String(rp.broken).padStart(5)}%` + (s.mix ? `   mix ${String(s.mix.error).padStart(5)} / ${String(s.mix.broken).padStart(5)}%` : '') + `   ${s.ms} ms`);
    // made frames must be closer to the truth than repeating a frame, with fewer visible breaks
    if (k !== 'still' && (f.error >= rp.error || f.broken >= rp.broken)) bad++;
    if (k === 'still' && f.error > rp.error + .5) bad++;
  }
  if (errs.length) console.log('console:\n  ' + [...new Set(errs)].slice(0, 12).join('\n  '));
  if (shots) { fs.mkdirSync(shots, { recursive: true }); for (const [k, u] of Object.entries(res.shots)) fs.writeFileSync(path.join(shots, k + '.png'), Buffer.from(u.split(',')[1], 'base64')); console.log('shots in', shots); }
  console.log(bad ? `FAIL ${bad} scene(s) not better than repeating a frame` : 'ok');
  process.exit(bad ? 1 : 0);
})();
