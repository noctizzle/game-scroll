// Fire Brigade: you run the fire station in a little town. Fires break out in houses and spread to the
// neighbours if left. Tap a fire engine, then tap a burning house to send it; it drives the roads and
// sprays when it gets there. Engines run dry, so send them to a hydrant to refill. Five houses lost ends it.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { rnd } = gs.util;

let W = 176, H = 208;
const N = 10;

function make(api) {
  const feel = new Feel({ pixel: true });
  let tiles, trucks, sel, score, lost, t, nextFire, hydrants, smoke;
  const TS = () => Math.floor(Math.min(W - 4, H - 40) / N), OX = () => Math.round((W - TS() * N) / 2), OY = 18;
  const road = (r, c) => r % 3 === 0 || c % 3 === 0;
  const tile = (r, c) => (r >= 0 && c >= 0 && r < N && c < N) ? tiles[r * N + c] : null;
  const nb = (r, c) => [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N);

  function path(from, goals) {
    // breadth-first along the roads to the nearest goal tile
    const key = (r, c) => r * N + c, prev = new Map([[key(...from), null]]), q = [from];
    while (q.length) {
      const [r, c] = q.shift();
      if (goals.some(([a, b]) => a === r && b === c)) { const out = []; let k = key(r, c); while (k != null) { out.unshift([Math.floor(k / N), k % N]); k = prev.get(k); } return out; }
      for (const [a, b] of nb(r, c)) if (road(a, b) && !prev.has(key(a, b))) { prev.set(key(a, b), key(r, c)); q.push([a, b]); }
    }
    return null;
  }
  const roadNext = (r, c) => nb(r, c).filter(([a, b]) => road(a, b));

  return {
    reset() {
      tiles = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) tiles.push({ r, c, road: road(r, c), fire: 0, burnt: false, burnT: 0 });
      hydrants = [[0, 9], [9, 0], [9, 9], [3, 6]];
      trucks = [{ r: 6, c: 3, x: 0, y: 0, path: [], water: 1, job: null }, { r: 3, c: 3, x: 0, y: 0, path: [], water: 1, job: null }];
      for (const tk of trucks) { tk.x = tk.c; tk.y = tk.r; }
      sel = null; score = 0; lost = 0; t = 0; nextFire = 2; smoke = []; feel.clear();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      nextFire -= dt;
      if (nextFire <= 0) { const homes = tiles.filter(x => !x.road && !x.burnt && !x.fire); if (homes.length) { homes[Math.random() * homes.length | 0].fire = .2; sfx(200, .2, 'sawtooth', .03); haptic('warning'); } nextFire = Math.max(3, 8 - t / 25) + rnd(0, 2); }
      for (const x of tiles) {
        if (!x.fire) continue;
        x.fire = Math.min(1, x.fire + dt * .05);
        if (x.fire > .6 && Math.random() < dt * .08) { const n = nb(x.r, x.c).map(([a, b]) => tile(a, b)).filter(y => !y.road && !y.burnt && !y.fire); if (n.length) n[Math.random() * n.length | 0].fire = .15; }
        if (x.fire >= 1) { x.burnT += dt; if (x.burnT > 6) { x.fire = 0; x.burnt = true; lost++; feel.hurt(OX() + x.c * TS(), OY + x.r * TS()); haptic('error'); if (lost >= 5) { feel.lose(); return api.over(); } } }
        if (Math.random() < dt * 4 * x.fire) smoke.push({ x: x.c + .5 + rnd(-.3, .3), y: x.r + .3, l: 1 });
      }
      for (const s of smoke) { s.y -= dt * .8; s.l -= dt; } smoke = smoke.filter(s => s.l > 0);
      for (const tk of trucks) {
        if (tk.path.length) {
          const [r, c] = tk.path[0], dx = c - tk.x, dy = r - tk.y, d = Math.hypot(dx, dy), sp = 3.2 * dt;
          if (d <= sp) { tk.x = c; tk.y = r; tk.r = r; tk.c = c; tk.path.shift(); } else { tk.x += dx / d * sp; tk.y += dy / d * sp; }
          continue;
        }
        // at a hydrant: refill
        if (hydrants.some(([a, b]) => a === tk.r && b === tk.c) && tk.water < 1) { tk.water = Math.min(1, tk.water + dt * .5); if (tk.water >= 1) sfx(800, .05, 'triangle', .03); }
        // spray any fire next door
        if (tk.water > 0) {
          const f = nb(tk.r, tk.c).map(([a, b]) => tile(a, b)).find(y => y.fire > 0);
          if (f) { f.fire = Math.max(0, f.fire - dt * .35); tk.water = Math.max(0, tk.water - dt * .12); tk.spray = f; if (Math.random() < dt * 8) noise(.05, { vol: .02, from: 4000, to: 2000 }); if (f.fire === 0) { f.burnT = 0; score++; api.score(score); notes('E5 G5', { len: .05 }); feel.coin(OX() + (f.c + .5) * TS(), OY + (f.r + .5) * TS()); haptic('success'); tk.spray = null; } }
          else tk.spray = null;
        } else tk.spray = null;
      }
    },
    draw(c) {
      c.fillStyle = '#58a848'; c.fillRect(0, 0, W, H);
      const ts = TS(), ox = OX();
      feel.begin(c);
      for (const x of tiles) {
        const px = ox + x.c * ts, py = OY + x.r * ts;
        if (x.road) { c.fillStyle = '#585868'; c.fillRect(px, py, ts, ts); if (x.r % 3 === 0 && x.c % 3 !== 0 && x.c % 2) { c.fillStyle = '#c8c8d0'; c.fillRect(px + 2, py + Math.floor(ts / 2), ts - 4, 1); } continue; }
        if (x.burnt) { c.fillStyle = '#383838'; c.fillRect(px + 1, py + 2, ts - 2, ts - 3); c.fillStyle = '#202020'; c.fillRect(px + 2, py + 1, 2, ts - 3); continue; }
        c.fillStyle = ['#e8d0a0', '#f0b8b8', '#b8d0f0'][(x.r * 3 + x.c) % 3]; c.fillRect(px + 1, py + 3, ts - 2, ts - 4);
        c.fillStyle = '#a03838'; c.fillRect(px, py + 1, ts, 3); c.fillStyle = '#383848'; c.fillRect(px + Math.floor(ts / 2) - 1, py + ts - 5, 3, 4);
        if (x.fire) { const f = Math.ceil(x.fire * 4), fl = Math.floor(t * 10 + x.c) % 2; for (let i = 0; i < f; i++) { c.fillStyle = i % 2 ? '#f8d038' : '#f06020'; c.fillRect(px + 1 + i * 3, py + ts - 4 - (i % 2 + fl) * 2 - Math.round(x.fire * 6), 2, 3 + Math.round(x.fire * 4)); } if (x.fire >= 1 && Math.floor(t * 4) % 2) { c.fillStyle = '#f8f8f0'; c.fillRect(px, py, ts, 1); } }
      }
      for (const [r, cc] of hydrants) { c.fillStyle = '#e83838'; c.fillRect(ox + cc * ts + Math.floor(ts / 2) - 2, OY + r * ts + 2, 4, 6); c.fillRect(ox + cc * ts + Math.floor(ts / 2) - 3, OY + r * ts + 4, 6, 2); }
      for (const tk of trucks) {
        const px = Math.round(ox + tk.x * ts), py = Math.round(OY + tk.y * ts);
        if (tk === sel) { c.fillStyle = '#f8f8f0'; c.fillRect(px - 1, py - 1, ts + 2, ts + 2); }
        c.fillStyle = '#e02020'; c.fillRect(px + 1, py + 3, ts - 2, ts - 6); c.fillStyle = '#f8f8f0'; c.fillRect(px + 2, py + 4, 3, 2); c.fillStyle = Math.floor(t * 6) % 2 && tk.path.length ? '#3880f8' : '#f8d038'; c.fillRect(px + ts - 4, py + 2, 2, 2);
        c.fillStyle = '#202028'; c.fillRect(px + 1, py + ts - 3, ts - 2, 1);
        c.fillStyle = '#3880f8'; c.fillRect(px + 1, py + ts - 2, Math.round((ts - 2) * tk.water), 1);
        if (tk.spray) { c.fillStyle = '#98d8f8'; const sx = ox + (tk.spray.c + .5) * ts, sy = OY + (tk.spray.r + .5) * ts; for (let k = 0; k < 6; k++) c.fillRect(Math.round(px + ts / 2 + (sx - px - ts / 2) * k / 6 + rnd(-1, 1)), Math.round(py + ts / 2 + (sy - py - ts / 2) * k / 6 + rnd(-1, 1)), 1, 1); }
      }
      for (const s of smoke) { c.fillStyle = '#88889880'; c.fillRect(Math.round(ox + s.x * ts), Math.round(OY + s.y * ts), 2, 2); }
      feel.end(c, W, H);
      text(c, `${score}`, 4, 3, { color: '#f8f8f0' });
      for (let i = 0; i < 5 - lost; i++) { c.fillStyle = '#f8f8f0'; c.fillRect(W - 8 - i * 6, 4, 4, 4); }
      const tip = sel ? (sel.water < .15 ? 'EMPTY: TAP A RED HYDRANT' : 'NOW TAP A FIRE OR HYDRANT') : t < 8 ? 'TAP A FIRE ENGINE' : '';
      if (tip) text(c, tip, W / 2, H - 14, { align: 'center', color: '#f8f8f0', outline: '#203820' });
    },
    down(x, y) {
      const ts = TS(), c0 = Math.floor((x - OX()) / ts), r0 = Math.floor((y - OY) / ts);
      const tk = trucks.find(k => Math.abs(k.x - (x - OX()) / ts + .5) < .9 && Math.abs(k.y - (y - OY) / ts + .5) < .9);
      if (tk) { sel = tk; sfx(600, .04, 'square', .03); haptic('tick'); return; }
      if (!sel) return;
      const tl = tile(r0, c0); if (!tl) return;
      let goals;
      if (hydrants.some(([a, b]) => Math.abs(a - r0) + Math.abs(b - c0) <= 1)) goals = hydrants.filter(([a, b]) => Math.abs(a - r0) + Math.abs(b - c0) <= 1);
      else if (!tl.road) goals = roadNext(r0, c0);
      else goals = [[r0, c0]];
      const p = path([sel.r, sel.c], goals);
      if (p) { sel.path = p.slice(1); sfx(500, .1, 'square', .03, 300); haptic('light'); sel = null; }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'fire-brigade',
  title: 'Fire Brigade',
  tag: 'Advance · Strategy',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 208, maxW: 240, maxH: 280,
  goal: 20,
  hint: 'Tap a fire engine, then tap a burning house to send it; it sprays when it arrives. Refill empty engines at a red hydrant. Five houses lost and it is over.',
  make,
};
