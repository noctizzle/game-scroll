// Native AR without a phone: plays an AR game in world mode against a pretend AR plugin
// (scripts/lib/fake-native-ar.js) and checks that the "Find your floor" step ends the way it should in
// different rooms: a mapped floor, a plain floor with only feature points, a table in the way, sitting
// low, nothing found at all, a second round, lost tracking, lining the floor up by hand.
// Usage: npm run build:bundled && node scripts/ar-floor.cjs [name-filter] [--shots dir] [--size 884x1104]
// It can't tell how well ARCore or ARKit really see a room: that still needs a phone (Settings > AR test).
const { chromium, devices } = require('playwright');
const path = require('path');

const argv = process.argv.slice(2), opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const SHOTS = opt('--shots'), SIZE = opt('--size');   // --size 884x1104: another screen (an unfolded foldable, say) rather than a phone
const only = argv.find(a => !a.startsWith('--'));
const GAME = 'bin-flick';
const floorPts = (n, y, o = {}) => `Array.from({ length: ${n} }, () => ({ x: ${o.x ?? 0} + (s.rng() - .5) * ${o.w ?? 2.6}, y: ${y}, z: ${o.z ?? -2} + (s.rng() - .5) * ${o.d ?? 2.6} }))`;

// Each scene: set(s) arranges the pretend room (s = window.__ar, run in the page), then run(t) plays it.
const scenes = [
  { name: 'floor mapped, standing', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 2, d: 2 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.3); t.note(`found in ${r.secs} s`); t.ok(r.said === 'Floor found', `said "${r.said}"`); await t.shot('found'); } },
  { name: 'plain floor: no mapped surface, feature points only', set: `s.cloud = ${floorPts(60, -1.3)}`,
    async run(t) { const r = await t.settle(6); t.is(r.src, 'points'); t.near(r.floor, -1.3, .04); t.note(`found in ${r.secs} s`); } },
  { name: 'older app (no feature points): rough hit points agree', set: `s.sendPoints = false; s.pointHit = { y: -1.3, chance: .5, noise: .015 }`,
    async run(t) { const r = await t.settle(7); t.is(r.src, 'hits'); t.near(r.floor, -1.3, .04); } },
  { name: 'older app answering with one hit only still finds a mapped floor', set: `s.sendPoints = false; s.firstHitOnly = true; s.planes = [{ id: 'f', x: 0, y: -1.25, z: -2, w: 1.5, d: 1.5 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.25); } },
  { name: 'sitting low over the floor (phone 65 cm up)', set: `s.room.floor = -.65; s.planes = [{ id: 'f', x: 0, y: -.65, z: -1.5, w: 2.5, d: 2.5 }]`,
    async run(t) { const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -.65); } },
  { name: 'a table mapped first, floor points under it', set: `s.planes = [{ id: 't', x: 0, y: -.85, z: -1.4, w: 1.2, d: .8 }]; s.room.boxes = [{ x: 0, z: -1.4, w: 1.2, d: .8, top: -.85 }]; s.cloud = [...${floorPts(80, -.85, { z: -1.4, w: 1.2, d: .8 })}, ...${floorPts(30, -1.3, { w: 3, d: 3 })}]`,
    async run(t) { const r = await t.settle(6); t.is(r.src, 'points'); t.near(r.floor, -1.3, .04); await t.wait(1500); await t.shot('table'); t.near((await t.state()).floor, -1.3, .04, 'floor stays under the table'); } },
  { name: 'iPhone: a named table is never the floor, a named floor is', set: `s.sendPoints = false; s.planes = [{ id: 't', x: 0, y: -.9, z: -1.4, w: 1.5, d: 1, kind: 'table' }]`,
    async run(t) { await t.wait(2500); t.ok((await t.state()).scan, 'still searching past the table'); await t.page.evaluate(() => __ar.planes.push({ id: 'f', x: 0, y: -1.3, z: -2.5, w: .6, d: .6, kind: 'floor' })); const r = await t.settle(3); t.is(r.src, 'plane'); t.near(r.floor, -1.3); } },
  { name: 'nothing found: play starts on an estimate, no tap needed', set: ``,
    async run(t) {
      await t.wait(1500); const mid = await t.state(); t.ok(mid.scan && !mid.grid, 'no grid on the floor while still searching'); await t.shot('searching');
      const r = await t.settle(9); t.is(r.src, 'guess'); t.near(r.floor, -1.3); t.ok(r.secs > 3.5, `waited ${r.secs} s`); t.ok(/estimated/.test(r.said || ''), `said "${r.said}"`); t.ok(r.chip, 'Floor chip shows'); await t.shot('estimated');
      // the real floor (20 cm higher than guessed) is mapped during play: it takes over
      await t.page.evaluate(() => { __ar.room.floor = -1.1; __ar.planes = [{ id: 'f', x: 0, y: -1.1, z: -2, w: 2, d: 2 }]; });
      await t.until(s => s.src === 'plane', 4); const s = await t.state(); t.is(s.src, 'plane'); t.near(s.floor, -1.1);
    } },
  { name: 'Skip carries on at once', set: ``,
    async run(t) { await t.until(s => s.skip, 5); await t.tap('skip'); const r = await t.settle(1.5); t.ok(!r.scan, 'Skip ends the search'); t.is(r.src, 'guess'); t.note(`skipped at ${r.secs} s`); } },
  { name: 'the next round keeps the floor', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 2, d: 2 }]`,
    async run(t) {
      await t.settle(4);
      await t.page.evaluate(() => { __ar.planes = []; __gs.start(); });   // play again; the phone has lost its map of the room meanwhile
      await t.until(s => s.scan, 3); const again = Date.now();
      const r = await t.settle(4); r.secs = +((Date.now() - again) / 1000).toFixed(1); t.is(r.src, 'kept'); t.near(r.floor, -1.3); t.note(`kept after ${r.secs} s`);
    } },
  { name: 'tracking lost in a round: the game waits, then carries on', set: `s.planes = [{ id: 'f', x: 0, y: -1.3, z: -2, w: 2, d: 2 }]`,
    async run(t) {
      await t.settle(4); await t.page.evaluate(() => { __ar.tracking = 'PAUSED'; __ar.why = 'EXCESSIVE_MOTION'; });
      await t.until(s => s.lost, 4); let s = await t.state(); t.ok(s.lost && s.calibrating, 'game waits while tracking is lost'); await t.shot('lost');
      await t.page.evaluate(() => { __ar.tracking = 'TRACKING'; __ar.why = 'NONE'; });
      await t.until(s => !s.calibrating, 3); s = await t.state(); t.ok(!s.calibrating, 'game carries on'); t.is(s.src, 'plane');
    } },
  { name: 'a room that can\'t be tracked: carry on in look-around mode', set: `s.tracking = 'PAUSED'; s.why = 'INSUFFICIENT_LIGHT'`,
    async run(t) {
      await t.until(s => s.skip, 9); let s = await t.state(); t.ok(s.skip && s.scan, 'the way out is offered'); await t.shot('dark');
      await t.tap('skip'); await t.until(s => s.mode === 'look' && !s.nat, 4); s = await t.state(); t.is(s.mode, 'look'); t.ok(await t.page.evaluate(() => !__ar.running && __ar.stops >= 1), 'native AR stopped');
    } },
  { name: 'lining the floor up by hand, and scanning again', set: ``,
    async run(t) {
      await t.settle(9);
      await t.tap('chip'); await t.until(s => s.cal, 2); t.ok((await t.state()).cal, 'line-up opens from the Floor chip');
      await t.drag(150, 250, 150, 310); await t.shot('lineup');   // down: the floor is further below
      let s = await t.state(); t.is(s.src, 'hand'); t.ok(s.floor < -1.45, `floor lowered to ${s.floor}`);
      await t.tap('done'); await t.until(s => !s.cal, 2); s = await t.state(); t.ok(!s.cal && !s.calibrating, 'Done closes it'); const set = s.floor;
      // a surface mapped somewhere else doesn't move a floor set by hand
      await t.page.evaluate(() => { __ar.planes = [{ id: 'x', x: 0, y: -1.0, z: -2, w: 2, d: 2 }]; }); await t.wait(1200); t.near((await t.state()).floor, set, .001, 'hand-set floor stands');
      // scan again: now the mapped surface is found
      await t.tap('chip'); await t.until(s => s.cal, 2); await t.tap('again'); const r = await t.settle(4); t.is(r.src, 'plane'); t.near(r.floor, -1.0);
    } },
];

(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4183 } });
  const b = await chromium.launch();
  let failed = 0;
  for (const sc of scenes) {
    if (only && !sc.name.includes(only)) continue;
    const [vw, vh] = (SIZE || '').split('x').map(Number);
    const ctx = await b.newContext({ ...devices['iPhone 13'], ...(vw && vh ? { viewport: { width: vw, height: vh } } : {}), deviceScaleFactor: SHOTS && !SIZE ? 2 : 1 });   // (sharp screenshots at phone size; a big screen drawn in software at 2x is too slow to play)
    await ctx.addInitScript({ path: path.join(__dirname, 'lib/fake-native-ar.js') });
    const page = await ctx.newPage(), errs = [], bad = [], notes = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto('http://localhost:4183/'); await page.waitForFunction(() => window.__gs, null, { timeout: 60000 });
    await page.evaluate(`{ const s = window.__ar; s.picture = ${!!SHOTS}; ${sc.set} }`);
    await page.evaluate(id => __gs.only(id), GAME); await page.waitForTimeout(300);
    await page.evaluate(() => __gs.start());
    const t0 = Date.now();
    const state = () => page.evaluate(() => {
      const v = window.__hdView, n = v && v.nat, f = n && n.ff;
      return { mode: v ? v.mode : null, nat: !!n, scan: !!(n && n.scan), lost: !!(n && n.lost), calibrating: !!(v && v.calibrating), cal: !!(v && v.cal), src: f ? f.src : null, floor: f ? f.floor : null,
        said: n ? n.say : null, grid: !!(v && v.calGrid.visible), chip: !!(v && v.chip), skip: !!(n && n.skip), yOff: n ? n.yOff : null, camY: v ? v.cam.position.y : null };
    });
    const t = {
      page, state,
      wait: ms => page.waitForTimeout(ms),
      async until(fn, secs) { const end = Date.now() + secs * 1000; for (;;) { const s = await state(); if (fn(s) || Date.now() > end) return s; await page.waitForTimeout(80); } },
      // wait for the floor search to end; says how long it took and what the player was told
      async settle(secs) { const s = await t.until(s => s.nat && !s.scan && s.src, secs); return { ...s, secs: +((Date.now() - t0) / 1000).toFixed(1) }; },
      ok(c, msg) { if (!c) bad.push(msg); },
      note(msg) { notes.push(msg); },   // timings are shown, not judged: a slow test machine isn't a bug
      is(a, e) { if (a !== e) bad.push(`expected ${e}, got ${a}`); },
      near(a, e, tol = .02, msg = '') { if (a == null || Math.abs(a - e) > tol) bad.push(`${msg} expected about ${e}, got ${a}`.trim()); },
      // game units -> page pixels
      async at(x, y) { return page.evaluate(([x, y]) => { const r = __gs.active.canvas.getBoundingClientRect(), [w, h] = __gs.size; return [r.x + x / w * r.width, r.y + y / h * r.height]; }, [x, y]); },
      async tap(what) {
        const k = await page.evaluate(what => { const v = __hdView, b = what === 'skip' ? v.nat.skip : what === 'chip' ? v.chip : v.cal[what]; return b && [b.x + b.w / 2, b.y + b.h / 2]; }, what);
        if (!k) { bad.push(`no ${what} button to tap`); return; }
        const [x, y] = await t.at(...k); await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(150);
      },
      async drag(x0, y0, x1, y1) { const a = await t.at(x0, y0), z = await t.at(x1, y1); await page.mouse.move(...a); await page.mouse.down(); await page.mouse.move(...z, { steps: 8 }); await page.waitForTimeout(200); await page.mouse.up(); await page.waitForTimeout(150); },
      async shot(name) { if (SHOTS) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOTS, `ar-floor-${name}.png`) }); } },
    };
    try { await sc.run(t); } catch (e) { bad.push('threw: ' + e.message); }
    bad.push(...errs.map(e => 'page error: ' + e));
    console.log(`${bad.length ? 'FAIL' : 'PASS'} ${sc.name}${notes.length ? ` (${notes.join(', ')})` : ''}${bad.length ? '\n   ' + bad.join('\n   ') : ''}`);
    if (bad.length) failed++;
    await ctx.close();
  }
  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
