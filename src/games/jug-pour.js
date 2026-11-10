// Jug Pour: measure an exact amount with jugs that have no marks. Tap a jug to pick it up, then tap
// another jug to pour into it (until it's full or the first is empty), the tap to fill it, or the
// drain to empty it. Hit the target in any jug. Fewer moves than par earns a bonus.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { ease } = gs.juice;

let W = 360, H = 640;
const COLS = ['#4cc9f0', '#f72585', '#7209b7'];

function make(api) {
  const feel = new Feel();
  let caps, water, target, par, moves, held, level, score, time, t, banner, pourFx;

  function bfs(caps, target) {
    const start = caps.map(() => 0), seen = new Map([[start.join(), 0]]), q = [start];
    while (q.length) {
      const s = q.shift(), d = seen.get(s.join());
      if (s.includes(target)) return d;
      const nexts = [];
      for (let i = 0; i < caps.length; i++) {
        const f = [...s]; f[i] = caps[i]; nexts.push(f);
        const e = [...s]; e[i] = 0; nexts.push(e);
        for (let j = 0; j < caps.length; j++) if (i !== j) { const p = [...s], m = Math.min(s[i], caps[j] - s[j]); p[i] -= m; p[j] += m; nexts.push(p); }
      }
      for (const nx of nexts) { const k = nx.join(); if (!seen.has(k)) { seen.set(k, d + 1); q.push(nx); } }
    }
    return -1;
  }
  function newPuzzle() {
    for (let tries = 0; tries < 400; tries++) {
      const n = level < 4 ? 2 : 3;
      caps = Array.from({ length: n }, () => 2 + Math.random() * (level < 3 ? 8 : 12) | 0).sort((a, b) => a - b);
      if (new Set(caps).size < n) continue;
      target = 1 + Math.random() * (caps[n - 1] - 1) | 0;
      if (caps.includes(target)) continue;
      par = bfs(caps, target);
      if (par >= Math.min(8, 2 + level) && par <= 4 + level * 2) break;
    }
    water = caps.map(() => 0); moves = 0; held = -1; pourFx = null;
    banner = { txt: `Make ${target} L`, sub: `par ${par}`, l: 1.3 };
  }
  const layout = () => { const n = caps.length, gap = W / (n + 1), mx = Math.max(...caps); return caps.map((cap, i) => { const h = 60 + cap / mx * 170, w = 60 + cap / mx * 30; return { x: gap * (i + 1), y: H * .7, w, h }; }); };
  const tapRect = () => ({ x: 40, y: 118, w: 90, h: 64 }), drainRect = () => ({ x: W - 130, y: 118, w: 90, h: 64 });
  const inR = (r, x, y) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

  function act(kind, j) {
    const i = held; held = -1;
    if (kind === 'tap') { if (water[i] === caps[i]) return; water[i] = caps[i]; noise(.35, { vol: .05, from: 2500, to: 1200 }); }
    else if (kind === 'drain') { if (!water[i]) return; water[i] = 0; noise(.3, { vol: .05, from: 900, to: 200 }); }
    else { const m = Math.min(water[i], caps[j] - water[j]); if (!m) { haptic('warning'); return; } water[i] -= m; water[j] += m; pourFx = { from: i, to: j, l: .5 }; noise(.3, { vol: .04, from: 1800, to: 900 }); }
    moves++; haptic('light');
    const hit = water.indexOf(target);
    if (hit >= 0) {
      const bonus = Math.max(0, par + 2 - moves), pts = 3 + bonus;
      score += pts; api.score(score); time += 15;
      const L = layout()[hit]; feel.win(L.x, L.y - L.h / 2); notes('C5 E5 G5 C6:2', { len: .07 }); haptic('success');
      banner = { txt: moves <= par ? 'Perfect pour!' : 'Measured!', sub: `+${pts}`, l: 1.5, next: true };
    }
  }

  return {
    reset() { level = 1; score = 0; time = 60; t = 0; feel.clear(); newPuzzle(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (pourFx) { pourFx.l -= dt; if (pourFx.l <= 0) pourFx = null; }
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.next) { level++; newPuzzle(); } } if (banner?.next) return; }
      time -= dt; if (time <= 0) { feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = '#eef4f8'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#d9e4ec'; c.fillRect(0, H * .7, W, H * .3);
      c.fillStyle = '#1d3557'; c.font = '800 26px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`Make exactly ${target} L`, W / 2, 70);
      c.font = '600 15px Rubik, sans-serif'; c.fillStyle = '#457b9d'; c.fillText(`moves ${moves} · par ${par} · ${Math.ceil(time)}s`, W / 2, 100);
      // tap and drain
      const tp = tapRect(), dr = drainRect();
      c.fillStyle = held >= 0 ? '#a8dadc' : '#dfe7ec'; c.beginPath(); c.roundRect(tp.x, tp.y, tp.w, tp.h, 14); c.fill(); c.beginPath(); c.roundRect(dr.x, dr.y, dr.w, dr.h, 14); c.fill();
      c.fillStyle = '#6c757d'; c.fillRect(tp.x + 25, tp.y + 18, 40, 12); c.fillRect(tp.x + 55, tp.y + 18, 10, 26); c.fillRect(tp.x + 35, tp.y + 10, 20, 8);
      c.fillStyle = '#1d3557'; c.font = '700 13px Rubik, sans-serif'; c.fillText('FILL', tp.x + tp.w / 2, tp.y + tp.h - 10);
      c.strokeStyle = '#6c757d'; c.lineWidth = 3; c.beginPath(); c.arc(dr.x + dr.w / 2, dr.y + 28, 14, 0, 7); c.stroke(); for (let k = -1; k <= 1; k++) c.fillRect(dr.x + dr.w / 2 + k * 6 - 1, dr.y + 20, 2, 16);
      c.fillText('EMPTY', dr.x + dr.w / 2, dr.y + dr.h - 10);
      feel.begin(c);
      layout().forEach((L, i) => {
        const lift = i === held ? 26 : 0, x = L.x - L.w / 2, y = L.y - L.h - lift;
        // glass
        c.fillStyle = '#ffffffb0'; c.beginPath(); c.roundRect(x, y, L.w, L.h, [6, 6, 14, 14]); c.fill();
        const fh = (L.h - 8) * water[i] / caps[i];
        c.fillStyle = COLS[i % COLS.length]; c.beginPath(); c.roundRect(x + 4, y + L.h - 4 - fh, L.w - 8, fh, [2, 2, 10, 10]); c.fill();
        c.fillStyle = '#ffffff40'; c.fillRect(x + 8, y + 6, 6, L.h - 16);
        c.strokeStyle = i === held ? '#1d3557' : '#8aa1b1'; c.lineWidth = i === held ? 4 : 3; c.beginPath(); c.roundRect(x, y, L.w, L.h, [6, 6, 14, 14]); c.stroke();
        c.fillStyle = '#1d3557'; c.font = '800 22px Rubik, sans-serif'; c.fillText(`${water[i]}`, L.x, y - 12);
        c.font = '600 13px Rubik, sans-serif'; c.fillStyle = '#6c757d'; c.fillText(`holds ${caps[i]}`, L.x, L.y + 24);
      });
      if (pourFx) { const L = layout(), a = L[pourFx.from], b = L[pourFx.to]; c.strokeStyle = COLS[pourFx.from % 3]; c.lineWidth = 6; c.beginPath(); c.moveTo(a.x, a.y - a.h); c.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y - a.h, b.y - b.h) - 60, b.x, b.y - b.h); c.stroke(); }
      feel.end(c, W, H);
      c.textAlign = 'center';
      if (held < 0 && level === 1 && t < 6) { c.fillStyle = '#457b9d'; c.font = '600 15px Rubik, sans-serif'; c.fillText('Tap a jug, then tap where it goes', W / 2, H - 40); }
      if (banner) { c.fillStyle = '#1d3557e0'; c.fillRect(0, H * .38 - 40, W, 84); c.fillStyle = '#fff'; c.font = '800 30px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .38); c.font = '600 17px Rubik, sans-serif'; if (banner.sub) c.fillText(banner.sub, W / 2, H * .38 + 28); }
    },
    down(x, y) {
      if (banner?.next) return;
      const L = layout(), j = L.findIndex(l => x > l.x - l.w / 2 - 10 && x < l.x + l.w / 2 + 10 && y > l.y - l.h - 40 && y < l.y + 40);
      if (held < 0) { if (j >= 0) { held = j; sfx(500, .04, 'sine', .03); haptic('tick'); } return; }
      if (inR(tapRect(), x, y)) return act('tap');
      if (inR(drainRect(), x, y)) return act('drain');
      if (j >= 0 && j !== held) return act('pour', j);
      held = -1;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'jug-pour',
  title: 'Jug Pour',
  tag: 'Casual · Logic',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 25,
  hint: 'Tap a jug, then tap another jug to pour into it, or FILL or EMPTY. Measure exactly the target amount in any jug.',
  make,
};
