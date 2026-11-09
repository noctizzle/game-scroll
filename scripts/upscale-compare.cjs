// Compares the upscalers on a fixed Next Gen scene: plain stretch, SGSR 1 and SGSR 2, each drawn at
// 1/scale size and upscaled, scored against the same frame drawn at full size (error: mean difference
// out of 255, lower is closer; flicker: change between frames, lower is steadier; ms: time per frame
// in this software-rendered browser, a rough guide to cost only). Also SGSR 2 at full size as
// anti-aliasing (aa) against the plain full-size picture (native).
//   node scripts/upscale-compare.cjs [--scale 1.5] [--shots dir]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const scale = opt('--scale') || '1.5', shots = opt('--shots');
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4186 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:4186/scripts/upscale-compare/?scale=${scale}${shots ? '&shots' : ''}`);
  await p.waitForFunction(() => window.result, null, { timeout: 600000 });
  const res = await p.evaluate(() => window.result);
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  console.log(`drawn at 1/${res.scale} size and upscaled; error and flicker out of 255 (lower is better)`);
  for (const [name, r] of Object.entries(res.scenes)) {
    console.log(name);
    for (const [m, s] of Object.entries(r)) console.log(`  ${m.padEnd(6)} error ${String(s.error).padStart(5)}  flicker ${String(s.flicker).padStart(5)}  ${s.ms} ms  (${s.used || 'stretch'})`);
  }
  if (shots) { fs.mkdirSync(shots, { recursive: true }); for (const [k, u] of Object.entries(res.shots)) fs.writeFileSync(path.join(shots, k + '.png'), Buffer.from(u.split(',')[1], 'base64')); console.log('shots in', shots); }
  // SGSR 2 must not be further from the reference than a plain stretch (or than no AA at full size)
  let bad = 0; for (const r of Object.values(res.scenes)) { if (r.sgsr2 && r.sgsr2.error > r.plain.error * 1.05) bad++; if (r.aa && r.aa.error > r.native.error * 1.05) bad++; }
  await b.close(); await server.close(); process.exit(bad ? 1 : 0);
})();
