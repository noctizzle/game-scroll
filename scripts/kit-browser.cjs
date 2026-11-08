// Checks the game kits that need a real browser (WebGL, audio, wasm): npm run kit-browser.
// Needs the face and hand tracking files first: npm run ml.
const { chromium } = require('playwright');
(async () => {
  const vite = await import('vite');
  const server = await vite.createServer({ server: { port: 4181 }, mode: 'bundled', logLevel: 'error' }); await server.listen();
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:4181/scripts/kit-browser/');
  await p.waitForFunction(() => window.result, null, { timeout: 400000 }).catch(() => {});
  const r = await p.evaluate(() => window.result || ['FAIL no result']);
  console.log(r.join('\n')); if (errs.length) console.log('page errors:\n  ' + errs.join('\n  '));
  await b.close(); await server.close();
  process.exit(r.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
