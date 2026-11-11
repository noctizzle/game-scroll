// Checks what the app itself does around a game (not what a game does): keeping the screen on during a
// round, finer touch, even pixels and the LCD look for pocket games, the one-line soundtrack, the bigger
// save that stays on the phone.
// Usage: npm run build:bundled && node scripts/app-test.cjs [awake|touch|pixels|music|saves]
const { chromium } = require('playwright');

let failed = 0;
const check = (ok, what, more = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !more ? '' : '\n     ' + more}`); };
const PIXEL = 'arrow-maze', CASUAL = 'stack';

async function open(b, { width = 390, height = 844, dpr = 3, before } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: dpr });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  if (before) await p.addInitScript(before);
  await p.goto('http://localhost:4184/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(300);
  p.game = async (id, change) => {
    if (change) await p.evaluate(([id, change]) => Object.assign(__gs.GAMES.find(g => g.id === id), change), [id, change]);
    await p.evaluate(id => __gs.only(id), id); await p.waitForTimeout(250);
    await p.waitForFunction(() => __gs.active && !__gs.active.loading, null, { timeout: 60000 });
  };
  p.done = async () => { check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await ctx.close(); };
  return p;
}

/* ---------- the screen stays on during a round, and only then ---------- */
async function awake(b) {
  console.log('\nKeep awake');
  // a stand-in for the browser's screen wake lock that counts what's asked of it
  const p = await open(b, { before: () => {
    window.__wl = { asked: 0, freed: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.asked++; return { release: async () => { __wl.freed++; }, addEventListener() {} }; } } });
  } });
  const wl = () => p.evaluate(() => ({ ...__wl, on: __gs.awake.on, can: __gs.awake.can }));
  await p.game(CASUAL); await p.waitForTimeout(300);
  let s = await wl(); check(s.asked === 0 && !s.on, 'a card waiting in the feed asks for nothing', JSON.stringify(s));
  await p.evaluate(() => __gs.start()); await p.waitForTimeout(400);
  s = await wl(); check(s.asked === 1 && s.freed === 0 && s.on && s.can === true, 'starting a round keeps the screen on (asked once)', JSON.stringify(s));
  await p.waitForTimeout(600);
  s = await wl(); check(s.asked === 1, 'and it is not asked again every frame', JSON.stringify(s));
  // the page goes to the background: the round pauses, the screen may sleep
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  s = await wl(); const paused = await p.evaluate(() => !!__gs.active.paused);
  check(paused && !s.on && s.freed >= 1, 'a paused round lets the screen sleep', JSON.stringify({ paused, ...s }));
  await p.evaluate(() => { delete document.hidden; });
  await p.done();

  const q = await open(b, { before: () => {
    window.__wl = { asked: 0, freed: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => { __wl.asked++; return { release: async () => { __wl.freed++; }, addEventListener() {} }; } } });
  } });
  await q.game(CASUAL); await q.evaluate(() => __gs.start()); await q.waitForTimeout(400);
  await q.evaluate(() => __gs.api(__gs.active).over()); await q.waitForTimeout(400);
  s = await q.evaluate(() => ({ ...__wl, on: __gs.awake.on }));
  check(s.asked === 1 && s.freed === 1 && !s.on, 'game over lets the screen sleep again', JSON.stringify(s));
  await q.done();

  // a browser with no wake lock: asked once, then left alone (and the game still plays)
  const r = await open(b, { before: () => { try { delete Navigator.prototype.wakeLock; } catch (_) {} } });
  await r.game(CASUAL); await r.evaluate(() => __gs.start()); await r.waitForTimeout(500);
  s = await r.evaluate(() => ({ has: 'wakeLock' in navigator, on: __gs.awake.on, can: __gs.awake.can, state: __gs.active.state }));
  check(!s.has && !s.on && s.can === false && s.state === 'playing', 'a browser that cannot keep the screen on is asked once and the round plays on', JSON.stringify(s));
  await r.done();
}

/* ---------- finer touch ---------- */
async function touch(b) {
  console.log('\nFiner touch');
  const run = async fine => {
    const p = await open(b);
    await p.game(CASUAL, { touch: fine ? 'fine' : undefined });
    await p.evaluate(() => __gs.start()); await p.waitForTimeout(200);
    const out = await p.evaluate(async () => {
      const s = __gs.active, cv = s.canvas, r = cv.getBoundingClientRect(), got = [];
      s.game.down = () => {}; s.game.up = () => {}; s.game.move = (x, y, pressed, id) => got.push([Math.round(x), Math.round(y), pressed, id]);
      const ev = (type, x, y, more) => new PointerEvent(type, { pointerId: 7, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, pointerType: 'touch', isPrimary: true, ...more });
      const k = r.width / s.w;                                    // page pixels per game unit
      cv.dispatchEvent(ev('pointerdown', 10 * k, 10 * k));
      const part = (x, y) => ev('pointermove', x * k, y * k);
      // one move from the browser with four readings inside it, and a guess at where the finger is going
      const guess = [part(60, 60), part(70, 70)]; for (const g of guess) Object.defineProperty(g, 'timeStamp', { value: performance.now() + 4 });
      cv.dispatchEvent(ev('pointermove', 50 * k, 50 * k, { coalescedEvents: [part(20, 20), part(30, 30), part(40, 40), part(50, 50)], predictedEvents: guess }));
      const four = got.splice(0), ahead = s.api.ahead(7), any = s.api.ahead();
      // twelve readings: only the newest eight are handed over
      cv.dispatchEvent(ev('pointermove', 132 * k, 132 * k, { coalescedEvents: Array.from({ length: 12 }, (_, i) => part(22 + i * 10, 22 + i * 10)) }));
      const twelve = got.splice(0);
      cv.dispatchEvent(ev('pointerup', 132 * k, 132 * k));
      const after = s.api.ahead(7);
      return { four, twelve, ahead, any, after };
    });
    await p.done();
    return out;
  };
  const f = await run(true), plain = await run(false);
  check(f.four.length === 4 && f.four.map(m => m[0]).join() === '20,30,40,50' && f.four.every(m => m[2] === true && m[3] === 7), "touch: 'fine' gets every reading, oldest first", JSON.stringify(f.four));
  check(f.twelve.length === 8 && f.twelve[0][0] === 62 && f.twelve[7][0] === 132, 'never more than the newest eight in one move', JSON.stringify(f.twelve));
  check(plain.four.length === 1 && plain.four[0][0] === 50 && plain.twelve.length === 1, 'a game that did not ask gets one move per refresh, as before', JSON.stringify(plain.four));
  check(Array.isArray(f.ahead) && Math.abs(f.ahead[0] - 70) < 1.5 && Array.isArray(plain.ahead) && Array.isArray(f.any), 'api.ahead() is where the finger is heading, in game units', JSON.stringify([f.ahead, plain.ahead, f.any]));
  check(f.after === null, 'and nothing once the finger is up', JSON.stringify(f.after));
}

/* ---------- even pixels and the LCD look ---------- */
async function pixels(b) {
  console.log('\nEven pixels');
  const look = p => p.evaluate(() => {
    const s = __gs.active, r = s.canvas.getBoundingClientRect(), n = s.n, o = s.canvas.getContext('2d'), g = s.ctx;
    // every game pixel must be one flat n x n block on the card's canvas, the colour the game drew
    let bad = 0, tried = 0;
    const big = o.getImageData(0, 0, s.canvas.width, s.canvas.height).data, small = g.getImageData(0, 0, s.w, s.h).data;
    const at = (x, y) => { const i = (y * s.canvas.width + x) * 4; return big[i] << 16 | big[i + 1] << 8 | big[i + 2]; };
    for (let y = 0; y < s.h; y += 3) for (let x = 0; x < s.w; x += 3) {
      const i = (y * s.w + x) * 4, want = small[i] << 16 | small[i + 1] << 8 | small[i + 2]; tried++;
      if (at(x * n, y * n) !== want || at(x * n + (n >> 1), y * n + (n >> 1)) !== want || (!s.lcd && at(x * n + n - 1, y * n + n - 1) !== want)) bad++;
    }
    // with the grid on, the last row and column of a block are tinted towards the grid colour
    let lines = 0; if (s.lcd) for (let y = 0; y < s.h; y += 3) for (let x = 0; x < s.w; x += 3) if (at(x * n + n - 1, y * n + 1) !== at(x * n + 1, y * n + 1)) lines++;
    return { w: s.w, h: s.h, n, cw: s.canvas.width, ch: s.canvas.height, cssW: r.width, cssH: r.height, dpr: devicePixelRatio, smooth: getComputedStyle(s.canvas).imageRendering, bad, tried, lines, lcd: s.lcd, ghost: !!s.gbuf };
  });
  for (const [width, height, dpr] of [[390, 844, 3], [412, 915, 2.625], [374, 591, 3], [549, 735, 3], [1280, 800, 1]]) {
    const p = await open(b, { width, height, dpr });
    await p.game(PIXEL); await p.evaluate(() => __gs.start()); await p.waitForTimeout(500);
    const v = await look(p), sx = v.cssW * v.dpr / v.w, sy = v.cssH * v.dpr / v.h, name = `${width}x${height} @${dpr}`;
    check(Number.isInteger(v.n) && v.cw === v.w * v.n && v.ch === v.h * v.n && v.bad === 0, `${name}: each game pixel is a whole ${v.n} x ${v.n} block`, JSON.stringify(v));
    check(Math.abs(sx - sy) < .02, `${name}: pixels are square on screen (${sx.toFixed(3)} by ${sy.toFixed(3)} screen pixels)`);
    check((v.n >= sx - .03 || v.w * v.h * (v.n + 1) ** 2 > 2.4e6) && v.n < sx + 1 && v.smooth === 'auto', `${name}: copied up to the next whole size (or the biggest allowed), then smoothed`, JSON.stringify(v));
    check(v.cw * v.ch <= 2.4e6, `${name}: the card's canvas stays under 2.4 million pixels`);
    await p.done();
  }
  console.log('\nLCD look');
  for (const [dpr, lcd] of [[3, true], [2.625, true], [3, { grid: 0, ghost: .5 }], [3, { ghost: false }]]) {
    const p = await open(b, { dpr });
    await p.game(PIXEL, { lcd }); await p.evaluate(() => __gs.start()); await p.waitForTimeout(500);
    const v = await look(p), sx = v.cssW * v.dpr / v.w, name = `@${dpr} lcd: ${JSON.stringify(lcd)}`;
    const grid = lcd === true || lcd.grid !== 0, ghost = lcd === true || lcd.ghost !== false;
    check(v.bad === 0 && (!grid || Math.abs(sx - Math.round(sx)) < .01 && v.n === Math.round(sx)), `${name}: ${grid ? 'a game pixel is a whole number of screen pixels (' + sx.toFixed(3) + ')' : 'pixels still whole blocks'}`, JSON.stringify(v));
    check(grid ? v.lines > v.tried * .2 : v.lines === 0, `${name}: ${grid ? 'grid lines are drawn between pixels' : 'no grid'}`, `${v.lines} of ${v.tried}`);
    check(v.ghost === ghost, `${name}: ${ghost ? 'ghosting is running' : 'no ghosting'}`);
    await p.done();
  }
  // a ghosting screen settles on exactly the game's picture once nothing moves (no marks left behind)
  const p = await open(b);
  await p.game(PIXEL, { lcd: { grid: 0, ghost: .8 } }); await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
  const settle = await p.evaluate(async () => {
    const s = __gs.active, g = s.ctx, o = s.canvas.getContext('2d'), n = s.n, real = s.game.draw; let col = '#000';
    s.game.update = () => {}; s.game.draw = c => { c.fillStyle = col; c.fillRect(0, 0, s.w, s.h); };
    const frames = k => new Promise(r => { const f = () => (k-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    const mid = () => o.getImageData((s.w >> 1) * n + 1, (s.h >> 1) * n + 1, 1, 1).data[0];
    await frames(40); const black = mid(); col = '#fff'; await frames(2); const soon = mid(); await frames(90); const white = mid();
    s.game.draw = real; return { black, soon, white };
  });
  check(settle.black === 0 && settle.soon > 20 && settle.soon < 235 && settle.white === 255, 'ghosting fades in over a few frames and settles on the true colour', JSON.stringify(settle));
  await p.done();
}

/* ---------- a soundtrack in one line ---------- */
async function music(b) {
  console.log('\nOne-line soundtrack');
  const now = p => p.evaluate(() => __gs.soundtrack.now);
  let p = await open(b);
  await p.game(CASUAL); await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
  check(await now(p) === null, 'a game with no music in its definition gets none');
  await p.done();

  p = await open(b);
  await p.game(PIXEL, { music: 'puzzle' }); await p.waitForTimeout(200);
  check(await now(p) === null, 'nothing plays while the card waits in the feed');
  await p.evaluate(() => __gs.start()); await p.waitForTimeout(900);
  let a = await now(p);
  check(a && a.id === PIXEL && a.playing && a.mood === 'puzzle' && a.set === 'chip' && a.tuned && a.pos > 0, "music: 'puzzle' plays through the round; a pocket game gets the chip sound", JSON.stringify(a));
  await p.waitForTimeout(500); const b2 = await now(p);
  check(b2.pos > a.pos, 'and the tune moves on', `${a.pos} then ${b2.pos}`);
  // scoring lifts it; getting near the goal builds it
  const calm = b2.tension;
  await p.evaluate(() => { const s = __gs.active, api = __gs.api(s); api.score(Math.max(1, Math.round(s.def.goal * .6))); }); await p.waitForTimeout(700);
  const up = await now(p);
  check(up.tension > calm + .2 && up.level > b2.level, 'scoring towards the goal builds the music', `tension ${calm.toFixed(2)} then ${up.tension.toFixed(2)}, level ${b2.level.toFixed(2)} then ${up.level.toFixed(2)}`);
  // pause holds it, resume carries on
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await p.waitForTimeout(300);
  const held = await now(p);
  check(held && !held.playing, 'pause holds the music', JSON.stringify(held));
  await p.evaluate(() => { delete document.hidden; });
  await p.evaluate(() => __gs.api(__gs.active).over()); await p.waitForTimeout(300);
  check(await now(p) === null, 'and it stops at game over');
  await p.done();

  p = await open(b);
  await p.game(CASUAL, { music: { mood: 'heroic', vol: .6 } }); await p.waitForTimeout(300); await p.evaluate(() => __gs.start());
  await p.waitForFunction(() => __gs.soundtrack.now && __gs.soundtrack.now.tuned, null, { timeout: 30000 }).catch(() => {});
  a = await now(p);
  check(a && a.playing && a.set === 'orchestra' && a.tuned, 'a phone-style game with a heroic tune gets the orchestra, once its instruments are in', JSON.stringify(a));
  await p.game(PIXEL, {}); await p.waitForTimeout(400);
  check(await now(p) === null, 'leaving the game stops it');
  await p.done();

  p = await open(b);
  await p.game(CASUAL, { music: 'polka' }); await p.evaluate(() => __gs.start()); await p.waitForTimeout(300);
  check(await now(p) === null && await p.evaluate(() => __gs.active.state) === 'playing', 'a mood that does not exist plays nothing and breaks nothing');
  await p.done();
}

/* ---------- the bigger save that stays on the phone ---------- */
async function saves(b) {
  console.log('\nPhone-only save');
  // the game asks for its phone save in make(), as a real one would, and notes what it got
  const patch = () => p => p.evaluate(id => {
    const d = __gs.GAMES.find(g => g.id === id), make = d.make; window.__ll = { makes: 0, got: [], told: null };
    d.maxH = 900;   // a game that fills tall screens: it is told its size through resize(w, h)
    d.make = api => { __ll.makes++; __ll.got.push(api.loadLocal('nothing yet')); const g = make(api), rs = g.resize; g.resize = (w, h) => { g._told = [w, h]; rs && rs.call(g, w, h); }; return g; };
  }, CASUAL);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = async () => {
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('http://localhost:4184/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(300);
    await patch()(p);
    await p.evaluate(id => __gs.only(id), CASUAL);
    return p;
  };
  const settled = p => p.waitForFunction(() => __gs.active && !__gs.active.loading && __ll.got.length, null, { timeout: 30000 });
  let p = await page();
  const first = await p.evaluate(() => ({ loading: !!__gs.active.loading, makes: __ll.makes, got: __ll.got.length }));
  await settled(p);
  let s = await p.evaluate(() => ({ ...__ll, loading: !!__gs.active.loading }));
  // (the feed may hold more than one card of the game, so count makes per card: each is made, waits, and is made again)
  check(first.makes >= 1 && first.got === 0 && first.loading, 'the first loadLocal() in make() shows "Loading…" while the phone\'s save is read', JSON.stringify(first));
  // (a card made after the read finished doesn't wait, so makes is at most twice the answers given)
  check(s.makes >= first.makes * 2 && s.got.length >= first.makes && s.makes > s.got.length && s.got.every(g => g === 'nothing yet') && !s.loading, 'then the game is made again and gets its fallback (nothing saved yet)', JSON.stringify(s));
  const size = await p.evaluate(() => ({ card: [__gs.active.w, __gs.active.h], told: __gs.active.game._told, def: [__gs.active.def.w, __gs.active.def.h] }));
  check(size.card[1] > size.def[1] && size.told && size.told[0] === size.card[0] && size.told[1] === size.card[1], 'and the game made again is told the size its card has (a tall screen is filled)', JSON.stringify(size));
  // a big world: far over the cloud slot's 8 KB
  const big = await p.evaluate(() => {
    const api = __gs.api(__gs.active), world = { name: 'my island', tiles: Array.from({ length: 60000 }, (_, i) => (i * 7919) % 23) };
    const text = JSON.stringify(world);
    return { size: text.length, cloud: api.save(world), local: api.saveLocal(world), tooBig: api.saveLocal({ a: 'x'.repeat(600 * 1024) }), back: JSON.stringify(api.loadLocal(null)) === text };
  });
  check(big.size > 100000 && !big.cloud && big.local && !big.tooBig && big.back, `a ${Math.round(big.size / 1024)} KB world is too big for the cloud save, fits the phone save, and reads back at once (over 512 KB is turned away)`, JSON.stringify(big));
  await p.waitForTimeout(600);
  const disk = await p.evaluate(() => new Promise(res => { const rq = indexedDB.open('gs-local'); rq.onsuccess = () => { const g = rq.result.transaction('saves').objectStore('saves').get('stack'); g.onsuccess = () => res(g.result ? { z: g.result.z ? g.result.z.byteLength : 0, text: !!g.result.text } : null); }; }));
  check(disk && disk.z > 0 && disk.z < big.size / 2, `it is on the phone's database, packed (${disk && disk.z} bytes)`, JSON.stringify(disk));
  check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await p.close();

  // the app is opened again: the save is there, after the same short wait
  p = await page(); await settled(p);
  s = await p.evaluate(() => ({ makes: __ll.makes, n: __ll.got.length, all: __ll.got.every(g => g && g.name === 'my island' && g.tiles && g.tiles.length === 60000), t5: __ll.got[0] && __ll.got[0].tiles && __ll.got[0].tiles[5] }));
  check(s.n >= 1 && s.makes > s.n && s.all && s.t5 === (5 * 7919) % 23, 'after the app is opened again the game gets its world back', JSON.stringify(s));
  // Play again (reset) and a new round read it without waiting again
  await p.evaluate(() => __gs.start()); await p.waitForTimeout(200);
  s = await p.evaluate(() => ({ state: __gs.active.state, again: __gs.api(__gs.active).loadLocal(null).name }));
  check(s.state === 'playing' && s.again === 'my island', 'once read, loadLocal() answers straight away, mid-round too', JSON.stringify(s));
  await p.evaluate(() => __gs.api(__gs.active).clearLocal()); await p.waitForTimeout(500);
  check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await p.close();

  p = await page(); await settled(p);
  s = await p.evaluate(() => __ll.got[0]);
  check(s === 'nothing yet', 'clearLocal() removes it for good', JSON.stringify(s));
  check(!p.errs.length, 'no page errors', p.errs.join('\n     ')); await ctx.close();

  // a browser whose database can't be opened (private modes): the game still starts, with its fallback
  const q = await open(b, { before: () => { IDBFactory.prototype.open = function () { const rq = {}; setTimeout(() => rq.onerror && rq.onerror(), 20); return rq; }; } });
  await q.evaluate(id => { const d = __gs.GAMES.find(g => g.id === id), make = d.make; window.__ll = { got: [] }; d.make = api => { __ll.got.push(api.loadLocal('fallback')); return make(api); }; }, CASUAL);
  await q.evaluate(id => __gs.only(id), CASUAL);
  await q.waitForFunction(() => __gs.active && !__gs.active.loading && __ll.got.length, null, { timeout: 30000 });
  s = await q.evaluate(() => ({ got: __ll.got, ok: __gs.api(__gs.active).saveLocal({ a: 1 }), back: __gs.api(__gs.active).loadLocal(null) }));
  await q.evaluate(() => __gs.start()); await q.waitForTimeout(200);
  check(s.got[0] === 'fallback' && s.ok && s.back && s.back.a === 1 && await q.evaluate(() => __gs.active.state) === 'playing', 'with no database the game starts with its fallback and keeps the save for this session', JSON.stringify(s));
  q.errs = q.errs.filter(e => !/indexedDB|IDB/i.test(e)); await q.done();
}

(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4184 } });
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), only = process.argv.slice(2);
  const parts = { awake, touch, pixels, music, saves };
  for (const [name, fn] of Object.entries(parts)) if (!only.length || only.includes(name)) await fn(b);
  await b.close(); server.httpServer.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall app checks passed'); process.exit(failed ? 1 : 0);
})();
