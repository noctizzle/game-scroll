// Checks the location api's privacy rules in the real app (bundled build):
//  - before Play, a game gets the stand-in and the browser is never asked;
//  - during a round it gets a position rounded to its declared level (coarse ≈ 1 km);
//  - after the round, or with location refused or switched off, it gets the stand-in again.
// Usage: npm run build:bundled && node scripts/location-test.cjs
const { chromium, devices } = require('playwright');
const HERE = { latitude: 51.507351, longitude: -0.127758, accuracy: 15 };   // somewhere in London
(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4183 } });
  const b = await chromium.launch();
  let failed = 0;
  const check = (name, ok, got) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : '  got ' + JSON.stringify(got)}`); };
  const open = async perms => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, geolocation: HERE, permissions: perms });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:4183/'); await p.waitForTimeout(400);
    await p.evaluate(() => __gs.only('street-lamps')); await p.waitForTimeout(200);
    return { ctx, p, errs };
  };
  const loc = p => p.evaluate(() => __gs.active.api.location());

  // 1. allowed
  { const { ctx, p, errs } = await open(['geolocation']);
    const before = await loc(p);
    check('before Play: stand-in, no prompt', before.real === false && before.reason === 'not-playing', before);
    const note = await p.evaluate(() => !!__gs.active.overlay.querySelector('.ov-loc'));
    check('ready screen says the game uses location', note, note);
    await p.evaluate(() => __gs.start());
    const during = await loc(p);
    check('during a round: rounded to 0.01°', during.real === true && during.lat === 51.51 && during.lon === -0.13 && during.precision === 'coarse' && during.accuracy >= 1100, during);
    const seen = await p.evaluate(() => new Promise(r => { const out = []; const stop = __gs.active.api.watchLocation(x => out.push(x)); setTimeout(() => { stop(); r(out); }, 1500); }));
    check('watchLocation: one rounded update while still', seen.length === 1 && seen[0].lat === 51.51, seen);
    const lamps = await p.evaluate(() => new Promise(r => setTimeout(() => r(__gs.active.state), 600)));
    check('Street Lamps plays with a real area', lamps === 'playing', lamps);
    await p.evaluate(() => { const s = __gs.active; s.game.update(999); });   // time runs out -> api.over()
    await p.waitForTimeout(100);
    const after = await loc(p);
    check('after the round: stand-in again', after.real === false && after.reason === 'not-playing', after);
    check('no page errors', errs.length === 0, errs);
    await ctx.close(); }

  // 2. refused (no permission granted: headless Chromium answers "denied")
  { const { ctx, p, errs } = await open([]);
    await p.evaluate(() => __gs.start());
    const got = await loc(p);
    check('refused: stand-in with reason', got.real === false && got.lat === 0 && got.lon === 0 && (got.reason === 'denied' || got.reason === 'unavailable'), got);
    const st = await p.evaluate(() => new Promise(r => setTimeout(() => r(__gs.active.state), 600)));
    check('Street Lamps still plays when refused', st === 'playing', st);
    check('no page errors', errs.length === 0, errs);
    await ctx.close(); }

  // 3. switched off in Settings
  { const { ctx, p } = await open(['geolocation']);
    await p.evaluate(() => localStorage.setItem('gs_location_off', 'true'));
    await p.evaluate(() => __gs.start());
    const got = await loc(p);
    check('switched off in Settings: stand-in', got.real === false && got.reason === 'off', got);
    await ctx.close(); }

  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
