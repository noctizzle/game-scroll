// Checks the face, hand and sound steps that run on the phone's AI chip (src/kit/vision-npu.js, the
// ONNX models from scripts/npu-models/convert.py) against MediaPipe's own results on test photos.
// Needs npm run ml (MediaPipe files) and the ONNX models in ml-cache/<NPU_VERSION>/ (convert.py, or
// --fetch to download them from the games host). The test photos are MediaPipe's own (Apache-2.0).
//   node scripts/npu-test.cjs [--fetch]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..'), imgs = path.join(root, 'ml-cache', 'npu-test');
  const { NPU_VERSION, NPU_FILES } = await import('../src/kit/npu-files.js');
  fs.mkdirSync(imgs, { recursive: true });
  for (const f of ['portrait.jpg', 'thumb_up.jpg', 'pointing_up.jpg', 'right_hands.jpg']) {
    const p = path.join(imgs, f); if (fs.existsSync(p)) continue;
    const r = await fetch('https://storage.googleapis.com/mediapipe-assets/' + f); if (!r.ok) throw new Error(f + ' ' + r.status);
    fs.writeFileSync(p, Buffer.from(await r.arrayBuffer()));
  }
  const dir = path.join(root, 'ml-cache', NPU_VERSION);
  if (process.argv.includes('--fetch')) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of NPU_FILES) { if (fs.existsSync(path.join(dir, f))) continue; const r = await fetch(`https://assets.game-scroll.com/ml/${NPU_VERSION}/${f}`); if (!r.ok) throw new Error(f + ' ' + r.status); fs.writeFileSync(path.join(dir, f), Buffer.from(await r.arrayBuffer())); }
  }
  const missing = NPU_FILES.filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) { console.log(`FAIL missing ${missing.join(', ')} in ml-cache/${NPU_VERSION}: run scripts/npu-models/convert.py (or --fetch)`); process.exit(1); }
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4188 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4188/scripts/npu-test/');
  await p.waitForFunction(() => window.result, null, { timeout: 600000 }).catch(() => {});
  const r = await p.evaluate(() => window.result || { lines: ['FAIL no result'], fail: 1 });
  console.log(r.lines.join('\n')); if (errs.length) console.log('page errors:\n  ' + errs.join('\n  '));
  await b.close(); await server.close();
  process.exit(r.fail || errs.length ? 1 : 0);
})();
