// Draws the fixed scenes in scripts/look-compare/ (Next Gen at every tier, Classic Console) and saves
// them as PNGs, or compares them with a saved set: the check that an engine change (a three.js
// update, a refactor, later WebGPU) keeps the look.
//   node scripts/look-compare.cjs save <dir>        draw and save
//   node scripts/look-compare.cjs check <dir>       draw and compare with <dir> (fails on a visible change)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [mode, dir] = process.argv.slice(2);
  if (!['save', 'check'].includes(mode) || !dir) { console.log('usage: look-compare.cjs save|check <dir>'); process.exit(2); }
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4183 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  const errs = [], warns = new Set(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'warning' && /THREE/.test(m.text())) warns.add(m.text()); });
  await p.goto('http://localhost:4183/scripts/look-compare/'); await p.waitForFunction(() => window.result, null, { timeout: 400000 });
  const res = await p.evaluate(() => window.result);
  if (res.error || errs.length) { console.log('FAIL', res.error || errs.join('\n')); process.exit(1); }
  for (const w of warns) console.log('three.js warning:', w);
  fs.mkdirSync(dir, { recursive: true });
  let bad = 0;
  for (const [name, url] of Object.entries(res)) {
    const file = path.join(dir, name + '.png'), png = Buffer.from(url.split(',')[1], 'base64');
    if (mode === 'save') { fs.writeFileSync(file, png); console.log('saved', file); continue; }
    if (!fs.existsSync(file)) { console.log('MISSING', file); bad++; continue; }
    const old = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const d = await p.evaluate(async ([a, c]) => {
      const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [A, C] = await Promise.all([load(a), load(c)]), w = A.width, h = A.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
      x.drawImage(A, 0, 0); const pa = x.getImageData(0, 0, w, h).data; x.clearRect(0, 0, w, h); x.drawImage(C, 0, 0); const pc = x.getImageData(0, 0, w, h).data;
      let sum = 0, big = 0; for (let i = 0; i < pa.length; i += 4) { const e = (Math.abs(pa[i] - pc[i]) + Math.abs(pa[i + 1] - pc[i + 1]) + Math.abs(pa[i + 2] - pc[i + 2])) / 3; sum += e; if (e > 24) big++; }
      return { mean: sum / (pa.length / 4), big: big / (pa.length / 4) };
    }, [old, url]);
    // grain and dithering move a little between runs; a real change moves a lot of pixels a lot
    const ok = d.mean < 2.5 && d.big < .01;
    if (!ok) bad++;
    console.log(`${ok ? 'same' : 'CHANGED'}  ${name}: mean difference ${d.mean.toFixed(2)}/255, ${(d.big * 100).toFixed(2)}% of pixels clearly different`);
    fs.writeFileSync(path.join(dir, name + '.new.png'), png);
  }
  await b.close(); await server.close();
  process.exit(bad ? 1 : 0);
})();
