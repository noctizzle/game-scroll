// Gloomwick Hall: explore an old house one room at a time, by candlelight. The rooms lie face down;
// step onto one and it turns over. Three relics are hidden in the house: a number on a room you've
// seen says how many relics lie in the rooms round it (slants included), so you can work out where to
// look. Some rooms hold a spare candle; some are traps, and a real die decides if you get through.
// At midnight a ghost wakes and comes for you, faster as the night goes on: it snuffs a candle if it
// reaches you. Find all three relics and get back to the front door. Your game is kept.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { rng } = gs.math;
const { Table, slab, decal, pawn, stone, dot, ring, eyes, sounds } = gs.tabletop;
const { pbr, rbox } = gs.hd;
const { Mesh, Group } = gs.THREE;

let W = 300, H = 460;
const N = 5, CELL = 1.34, BZ = -.55, ENT = 22, TOP = .08, MIDNIGHT = 10, GOAL = 4;
const RELICS = ['silver bell', 'iron key', 'moon locket'];
const PLAIN = ['Library', 'Parlour', 'Pantry', 'Gallery', 'Nursery', 'Study', 'Scullery', 'Music Room', 'Bedchamber', 'Linen Room', 'Trophy Room', 'Chapel', 'Conservatory', 'Wine Cellar'];
const xy = i => [i % N, (i / N) | 0];
const at = i => ({ x: (i % N - 2) * CELL, z: (((i / N) | 0) - 2) * CELL + BZ });
const dist = (a, b) => Math.abs(xy(a)[0] - xy(b)[0]) + Math.abs(xy(a)[1] - xy(b)[1]);
const beside = i => { const [x, y] = xy(i), o = []; if (y > 0) o.push(i - N); if (x > 0) o.push(i - 1); if (x < N - 1) o.push(i + 1); if (y < N - 1) o.push(i + N); return o; };
const around = i => { const [x, y] = xy(i), o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if ((dx || dy) && a >= 0 && a < N && b >= 0 && b < N) o.push(b * N + a); } return o; };

function house(seed) {                                              // what's in each room, from a seed (so a kept game comes back the same)
  const R = rng(seed);
  for (;;) {
    const kinds = R.shuffle(['relic', 'relic', 'relic', 'draught', 'draught', 'draught', 'floor', 'floor', 'cup', 'cup', ...PLAIN.map(() => 'plain')]), names = R.shuffle(PLAIN);
    let k = 0, p = 0, n = 0;
    const rooms = Array.from({ length: N * N }, (_, i) => { if (i === ENT) return { kind: 'ent', name: 'Front Hall', up: true, look: 0 }; const kind = kinds[k++]; return { kind, name: kind === 'plain' ? names[p++] : kind === 'relic' ? 'Hidden Room' : kind === 'cup' ? 'Candle Cupboard' : kind === 'draught' ? 'Draughty Landing' : 'Rotten Floor', up: false, look: Math.floor(R() * 6), n: kind === 'relic' ? n++ : 0 }; });
    if (beside(ENT).every(i => rooms[i].kind !== 'draught' && rooms[i].kind !== 'floor')) return rooms;
  }
}

/* ----- the rooms' pictures, painted in code ----- */
const FLOORS = ['#8e6548', '#7c6c5a', '#96724e', '#78626c', '#866a50', '#68776a'];
function paintFace(c, S, r) {
  const w = S * .07, floor = r.kind === 'ent' ? '#aaa496' : r.kind === 'relic' ? '#7c5698' : r.kind === 'draught' ? '#6682a2' : r.kind === 'floor' ? '#7c5e44' : r.kind === 'cup' ? '#90784a' : FLOORS[r.look % FLOORS.length];
  c.fillStyle = '#5a5470'; c.fillRect(0, 0, S, S); c.fillStyle = floor; c.fillRect(w, w, S - w * 2, S - w * 2);
  c.fillRect(S * .4, 0, S * .2, w); c.fillRect(S * .4, S - w, S * .2, w); c.fillRect(0, S * .4, w, S * .2); c.fillRect(S - w, S * .4, w, S * .2);   // doorways
  c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = S / 128; for (let y = w; y < S - w; y += S * .11) { c.beginPath(); c.moveTo(w, y); c.lineTo(S - w, y); c.stroke(); }
  const box = (x, y, bw, bh, col) => { c.fillStyle = col; c.beginPath(); c.roundRect(x * S, y * S, bw * S, bh * S, S * .02); c.fill(); };
  const round = (x, y, rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(x * S, y * S, rr * S, 0, 7); c.fill(); };
  if (r.kind === 'ent') { for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2) box(.1 + x * .135, .1 + y * .135, .13, .13, '#77726a'); box(.36, .7, .28, .16, '#8a2f2a'); box(.38, .92, .24, .08, '#b0834a'); }
  else if (r.kind === 'relic') { round(.5, .5, .3, '#56386c'); c.strokeStyle = '#f2c84a'; c.lineWidth = S * .025; c.beginPath(); c.arc(S / 2, S / 2, S * .25, 0, 7); c.stroke(); c.fillStyle = '#f2c84a'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, q = k % 2 ? .07 : .17; c.lineTo(S / 2 + Math.cos(a) * q * S, S / 2 + Math.sin(a) * q * S); } c.fill(); }
  else if (r.kind === 'draught') { box(.3, .0, .4, .09, '#bfe0ff'); c.strokeStyle = '#e6f3ff'; c.lineWidth = S * .022; c.lineCap = 'round'; for (const [y, a] of [[.3, 0], [.5, .12], [.7, -.06]]) { c.beginPath(); c.moveTo(S * (.2 + a), S * y); c.bezierCurveTo(S * .4, S * (y - .12), S * .55, S * (y + .12), S * (.8 + a), S * y); c.stroke(); } }
  else if (r.kind === 'floor') { c.fillStyle = '#0a0806'; c.beginPath(); for (const [x, y] of [[.3, .32], [.45, .26], [.52, .36], [.7, .3], [.74, .5], [.62, .58], [.7, .74], [.5, .68], [.36, .76], [.4, .56], [.24, .5]]) c.lineTo(x * S, y * S); c.fill(); c.strokeStyle = '#2a1c10'; c.lineWidth = S * .015; c.stroke(); }
  else if (r.kind === 'cup') { box(.2, .1, .6, .2, '#4a3220'); box(.22, .12, .27, .16, '#6a4a2c'); box(.51, .12, .27, .16, '#6a4a2c'); box(.46, .5, .08, .24, '#f2ead0'); c.fillStyle = '#ffb640'; c.beginPath(); c.ellipse(S * .5, S * .44, S * .04, S * .07, 0, 0, 7); c.fill(); }
  else if (r.look === 0) { c.fillStyle = '#8a3a3a'; c.beginPath(); c.ellipse(S / 2, S / 2, S * .3, S * .2, 0, 0, 7); c.fill(); c.strokeStyle = '#d8b070'; c.lineWidth = S * .015; c.stroke(); }
  else if (r.look === 1) { box(.3, .36, .4, .28, '#4a3020'); for (const [x, y] of [[.22, .42], [.72, .42], [.4, .26], [.52, .68]]) box(x, y, .08, .08, '#7a5a3a'); }
  else if (r.look === 2) { box(.1, .1, .8, .12, '#3a2618'); for (let k = 0; k < 12; k++) box(.12 + k * .064, .11, .05, .1, ['#8a3a3a', '#3a5a8a', '#4a7a4a', '#b89a4a'][k % 4]); box(.36, .52, .28, .2, '#4a3020'); }
  else if (r.look === 3) { box(.26, .18, .48, .62, '#d8d0c0'); box(.3, .2, .4, .16, '#f4f0e8'); box(.26, .5, .48, .3, '#4a5a8a'); }
  else if (r.look === 4) { round(.5, .5, .2, '#4a3020'); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .6; round(.5 + Math.cos(a) * .3, .5 + Math.sin(a) * .3, .055, '#7a5a3a'); } }
  else { box(.14, .14, .26, .72, '#3a4a40'); box(.6, .14, .26, .3, '#4a3020'); round(.73, .7, .1, '#8a6a3a'); }
}
function paintBack(c, S) {
  c.fillStyle = '#23202c'; c.fillRect(0, 0, S, S); c.strokeStyle = '#5a5470'; c.lineWidth = S * .03; c.strokeRect(S * .08, S * .08, S * .84, S * .84);
  c.strokeStyle = '#3c3850'; c.lineWidth = S * .012; for (let k = -6; k < 12; k++) { c.beginPath(); c.moveTo(S * (.1 + k * .12), S * .1); c.lineTo(S * (.1 + k * .12 + .8), S * .9); c.stroke(); }
  c.fillStyle = '#23202c'; c.beginPath(); c.arc(S / 2, S / 2, S * .2, 0, 7); c.fill(); c.strokeStyle = '#8a80b0'; c.lineWidth = S * .02; c.stroke();
  c.fillStyle = '#8a80b0'; c.font = `800 ${S * .26}px Rubik, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', S / 2, S * .52);
}

function make(api) {
  let T, die, tiles, back, me, flame, ghost, gem, dots, here, rooms, seed, pos, ticks, candles, ghostAt, hunt, state, note, bad;

  function setup() {
    T = new Table(api, { span: 9.6, room: 'attic', table: 'square', pitch: 60, look: [0, 0, .45], frame: [7.6, 9.5] });
    die = T.dice(1, { size: .6, tray: { x: 0, z: 4.1, w: 3.4, d: 1.5 }, body: '#e6dcc8', pips: '#3a2030' });
    T.board.add(slab({ w: 7, d: 7, rim: .2, wood: '#3a2c2a', paint(g, Z) { g.col.fillStyle = '#16131c'; g.col.fillRect(0, 0, Z, Z); g.col.strokeStyle = '#2c2838'; g.col.lineWidth = Z / 200; for (let k = 1; k < N; k++) { const q = (k * CELL + .15) / 7 * Z; g.col.beginPath(); g.col.moveTo(q, 0); g.col.lineTo(q, Z); g.col.moveTo(0, q); g.col.lineTo(Z, q); g.col.stroke(); } } }).translateZ(BZ));
    T.board.add(slab({ w: 3.6, d: 1.7, rim: .12, thick: .3, wood: '#3a2c2a', paint(g, Z) { g.col.fillStyle = '#3c2440'; g.col.fillRect(0, 0, Z, Z); for (let i = 0; i < 1800; i++) { g.col.fillStyle = Math.random() < .5 ? '#46304a' : '#341e38'; g.col.fillRect(Math.random() * Z, Math.random() * Z, 3, 3); } g.r.fillStyle = '#d8d8d8'; g.r.fillRect(0, 0, Z, Z); } }).translateZ(4.1));
    back = decal(1.18, 1.18, paintBack, { px: 128, lift: .037 });
    me = new Group(); me.add(pawn('#e2a23c', { r: .27, h: .8 })); flame = stone('#ffd88a', { r: .075, glow: 2.6 }); flame.position.y = .9; flame.castShadow = false; me.add(flame); T.board.add(me);
    bad = pbr('#ff4030', { glow: 3, rough: .4 });
    ghost = new Group(); ghost.add(pawn('#cfe2ff', { r: .32, h: .95, transparent: true, opacity: .62, glow: .5, rough: .2 }), eyes(bad, { y: .8, z: .17, gap: .07, r: .04 })); ghost.children[0].castShadow = false; T.board.add(ghost);
    gem = stone('#ffd24a', { r: .2, glow: 1.4 }); gem.visible = false; T.board.add(gem);
    dots = [0, 1, 2, 3].map(() => { const d = dot('#ffe08a', { r: .17, glow: 1 }); d.visible = false; T.board.add(d); return d; });
    here = ring('#ffe08a', { r: .42, w: .03, glow: .8 }); T.board.add(here);
  }
  function build() {                                                // a tile for every room: its picture underneath until it's turned over
    for (const t of tiles || []) t.removeFromParent();
    const body = pbr('#2a2632', { rough: .8 }), geo = rbox(1.22, .07, 1.22, .02);
    tiles = rooms.map((r, i) => {
      const g = new Group(), p = at(i), slabM = new Mesh(geo, body); slabM.receiveShadow = true; g.add(slabM);
      const b = back.clone(); g.add(b);
      const f = decal(1.18, 1.18, (c, S) => paintFace(c, S, r), { px: 128, lift: 0 }); f.rotation.x = Math.PI; f.position.y = -.037; g.add(f);
      g.position.set(p.x, .04, p.z); g.rotation.x = r.up ? Math.PI : 0; T.board.add(g); return g;
    });
  }
  const found = () => rooms.filter(r => r.kind === 'relic' && r.up).length;
  const hint = i => around(i).filter(j => rooms[j].kind === 'relic' && !rooms[j].up).length;
  const far = () => { let b = 0, bd = -1; for (let i = 0; i < N * N; i++) { const d = i === ENT ? -1 : dist(i, pos) + Math.random() * .5; if (d > bd) { bd = d; b = i; } } return b; };
  const steps = () => (state === 'you' ? beside(pos).filter(i => i !== ghostAt) : []);
  function show() {
    const s = steps(); dots.forEach((d, k) => { d.visible = k < s.length; if (d.visible) { const p = at(s[k]); d.position.set(p.x, TOP + .02, p.z); } });
  }
  const keep = () => api.save({ seed, up: rooms.reduce((m, r, i) => m + (r.up ? 2 ** i : 0), 0), pos, ticks, candles, ghost: ghostAt, hunt });
  async function end(won) {
    state = 'done'; show();
    if (won) { api.score(GOAL); api.win(); sounds.gong(); haptic('success'); const p = at(pos); T.puff({ x: p.x, y: .6, z: p.z }, { col: '#ffe08a', glow: true, n: 26, speed: 2.2, up: 2.2, size: .22 }); }
    else { flame.visible = false; sounds.thud(1.4); haptic('error'); }
    await T.wait(2); api.clearSave(); T.stop(); api.over();
  }
  async function enter(r, i) {                                      // what a room does the first time you see it
    const p = at(i);
    if (r.kind === 'relic') {
      gem.visible = true; gem.position.set(p.x, TOP + .15, p.z); sounds.chime(); haptic('success');
      T.puff({ x: p.x, y: .4, z: p.z }, { col: '#ffe08a', glow: true, n: 16, speed: 1.6, up: 1.6, size: .18 });
      await T.hop(gem, { y: .95 }, { h: .9, time: .55, sound: false }); gem.visible = false;
      api.score(found()); note = found() === 3 ? 'The last relic! Now back to the front door' : `You found the ${RELICS[r.n]}`;
    } else if (r.kind === 'cup') { candles = Math.min(4, candles + 1); sounds.clink(1.2); haptic('medium'); note = 'A cupboard with a spare candle'; }
    else if (r.kind === 'draught' || r.kind === 'floor') {
      note = r.kind === 'draught' ? 'A cold draught! Roll 4 or more to shield the flame' : 'The floor gives! Roll 4 or more to keep your feet'; haptic('warning'); await T.wait(.7);
      const [v] = await die.roll();
      if (v >= 4) { note = `A ${v}: safe`; sounds.chime(.6); }
      else { T.shake(.5); sounds.thud(1.2); haptic('heavy'); if (r.kind === 'draught') { candles--; note = `A ${v}: a candle blows out`; } else { ticks += 3; note = `A ${v}: you lose time climbing out`; } }
      await T.wait(.7);
    } else note = `The ${r.name}`;
  }
  async function night() {                                          // the clock, and the ghost once it's up
    if (ghostAt < 0) {
      if (ticks < MIDNIGHT) return;
      ghostAt = far(); hunt = 0; const p = at(ghostAt); ghost.visible = true; ghost.position.set(p.x, TOP + .2, p.z);
      sounds.gong(); T.shake(.5); haptic('heavy'); note = 'Midnight. Something wakes…'; await T.pop(ghost, { by: .5, time: .5 }); return;
    }
    hunt++;
    for (let k = 0; k < (hunt % 2 ? 1 : 2) && ghostAt !== pos; k++) {
      const o = beside(ghostAt).filter(i => i !== ENT && dist(i, pos) < dist(ghostAt, pos)); if (!o.length) break;
      ghostAt = o[Math.floor(Math.random() * o.length)]; const p = at(ghostAt); await T.slide(ghost, { x: p.x, z: p.z }, { time: .24, sound: false });
    }
    if (ghostAt === pos) {
      candles--; T.shake(.7); sounds.thud(1.4); haptic('error'); note = 'The ghost sweeps through you: a candle dies'; await T.wait(.6);
      if (candles > 0) { ghostAt = far(); const p = at(ghostAt); await T.tween(.25, k => ghost.scale.setScalar(1 - k)); ghost.position.set(p.x, TOP + .2, p.z); await T.tween(.25, k => ghost.scale.setScalar(k)); }
    }
  }
  async function step(to) {
    state = 'busy'; note = ''; show();
    const p = at(to), r = rooms[to];
    await T.hop(me, { x: p.x, y: TOP, z: p.z }, { h: .55, time: .26 }); pos = to; ticks++;
    if (!r.up) {
      const t = tiles[to]; sounds.flip();
      await T.tween(.36, k => { t.rotation.x = k * Math.PI; t.position.y = .04 + Math.sin(k * Math.PI) * .75; me.position.y = TOP + Math.sin(k * Math.PI) * 1.1; }); t.rotation.x = Math.PI; t.position.y = .04; me.position.y = TOP;
      r.up = true; await enter(r, to);
      if (candles <= 0) { note = 'Your last candle gutters out'; return end(false); }
    }
    if (to === ENT && found() === 3) { note = 'Out into the night, relics in hand!'; return end(true); }
    await night();
    if (candles <= 0) { note = 'Your last candle gutters out'; return end(false); }
    state = 'you'; keep(); show();
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const v = api.load(null), ok = v && Number.isFinite(v.seed) && Number.isInteger(v.up) && v.up >= 0 && v.up < 2 ** 25 && [v.pos, v.ghost].every(n => Number.isInteger(n) && n >= -1 && n < 25) && v.pos >= 0 && Number.isInteger(v.ticks) && v.ticks >= 0 && v.ticks < 999 && Number.isInteger(v.candles) && v.candles >= 1 && v.candles <= 4;
      seed = ok ? v.seed : Math.floor(Math.random() * 1e9); rooms = house(seed);
      if (ok) rooms.forEach((r, i) => { if (Math.floor(v.up / 2 ** i) % 2) r.up = true; });
      pos = ok && rooms[v.pos].up ? v.pos : ENT; ticks = ok ? v.ticks : 0; candles = ok ? v.candles : 3; ghostAt = ok && v.ghost !== pos && v.ghost !== ENT ? v.ghost : -1; hunt = ok ? v.hunt | 0 : 0;
      if (ghostAt < 0 && ticks >= MIDNIGHT) ghostAt = far();
      state = 'you'; note = '';
      build(); const p = at(pos); me.position.set(p.x, TOP, p.z); flame.visible = true; gem.visible = false;
      ghost.visible = ghostAt >= 0; ghost.scale.setScalar(1); if (ghostAt >= 0) { const q = at(ghostAt); ghost.position.set(q.x, TOP + .2, q.z); }
      die.park(0, { x: 0, z: 4.1 }); show(); if (found()) api.score(found());
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      here.position.set(me.position.x, TOP + .01, me.position.z); here.visible = state !== 'done';
      flame.scale.setScalar(1 + Math.sin(T.t * 11) * .12); flame.material.emissiveIntensity = 2.2 + Math.sin(T.t * 17) * .5;
      if (ghost.visible && !T.busy) ghost.position.y = TOP + .2 + Math.sin(T.t * 3) * .07;
      bad.emissiveIntensity = 2.4 + Math.sin(T.t * 8) * .9;
      dots.forEach((d, k) => { if (d.visible) d.scale.setScalar(1 + Math.sin(T.t * 5 + k) * .12); });
    },
    draw(c) {
      T.draw(c, W, H);
      const left = MIDNIGHT - ticks;
      const y = T.strip(c, W, [{ name: 'Candles', col: '#ffd88a', score: candles }, { name: 'Relics', col: '#f2c84a', score: `${found()}/3` }, ghostAt >= 0 ? { name: 'Ghost', col: '#ff5a48', score: '!' } : { name: 'Midnight', col: '#9aa6e0', score: Math.max(0, left) }], ghostAt >= 0 ? 2 : -1);
      T.status(c, W, y, note || (state === 'you' ? (found() === 3 ? 'Get back to the front door' : 'Tap a room next to you') : ''), /blows out|dies|gutters|lose time/.test(note) ? '#ff9a8a' : '#fff');
      if (!T.hidden) {                                              // how many relics lie round each room you've seen
        c.save(); c.font = '800 10px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        rooms.forEach((r, i) => {
          if (!r.up || tiles[i].position.y > .05) return; const n = hint(i); if (!n) return;
          const p = at(i), [sx, sy, sz] = T.toScreen({ x: p.x - .4, y: TOP, z: p.z - .4 }); if (sz >= 1) return;
          c.fillStyle = '#f2c84a'; c.beginPath(); c.arc(sx, sy, 7.5, 0, 7); c.fill(); c.strokeStyle = '#1a1206'; c.lineWidth = 1; c.stroke(); c.fillStyle = '#1a1206'; c.fillText(String(n), sx, sy + .5);
        });
        c.restore();
      }
      T.hud(c, W, H);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip || state !== 'you' || T.busy) return;
      const p = T.pick(tap.x, tap.y, TOP), s = steps();
      let to = -1;
      if (p) { const cx = Math.round(p.x / CELL + 2), cy = Math.round((p.z - BZ) / CELL + 2); if (cx >= 0 && cx < N && cy >= 0 && cy < N) to = cy * N + cx; }
      if (to === ghostAt && beside(pos).includes(to)) { haptic('warning'); return T.say('The ghost is in there'); }
      if (!s.includes(to)) { const k = T.nearest(tap.x, tap.y, s.map(i => ({ ...at(i), y: TOP })), 30); to = k < 0 ? -1 : s[k]; }
      if (to >= 0) T.run(() => step(to));
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'gloomwick-hall',
  title: 'Gloomwick Hall',
  tag: 'Board · Adventure',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'spooky', vol: .5 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: GOAL,
  hint: 'Tap a room beside you to step in and turn it over. Find the 3 relics (a number counts the relics in the rooms round it) and get back to the front door. Traps roll a die; at midnight a ghost hunts you and snuffs your candles.',
  creator: 'Game Scroll',
  make,
};
