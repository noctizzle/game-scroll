// Gear Train: the motor turns one way, the clock wheel has to turn the way its arrow shows. Tap the
// hex pegs to place gears (tap again to take one off). Touching gears turn opposite ways, so the
// length of your chain decides which way the end turns, and three gears that all touch jam solid.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { HexMap } = gs.hex;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let map, motor, target, need, gears, budget, level, score, time, t, banner, spin, jam, solved;

  const key = c => c.q + ',' + c.r;
  function build() {
    const cols = 6, rows = Math.max(7, Math.min(10, Math.floor((H - 200) / 46)));
    const size = Math.min((W - 30) / (cols * 1.732 + .9), 30);
    map = new HexMap({ size, shape: 'rect', w: cols, h: rows, x: 0, y: 0 });
    let mx = Infinity, Mx = -Infinity, my = Infinity, My = -Infinity; map.each(c => { mx = Math.min(mx, c.x); Mx = Math.max(Mx, c.x); my = Math.min(my, c.y); My = Math.max(My, c.y); });
    const dx = (W - (Mx - mx)) / 2 - mx, dy = 150 + (H - 230 - (My - my)) / 2 - my;
    map.each(c => { c.x += dx; c.y += dy; for (const p of c.corners) { p[0] += dx; p[1] += dy; } });
    map.ox += dx; map.oy += dy;
    // a chord-free random walk from the motor gives a chain that works; its length sets the target's way
    const all = []; map.each(c => all.push(c));
    for (let tries = 0; tries < 300; tries++) {
      const start = all[Math.random() * all.length | 0], path = [start], used = new Set([key(start)]);
      const want = Math.min(9, 3 + level);
      while (path.length < want + 2) {
        const cur = path[path.length - 1];
        const opts = map.neighbours(cur).filter(n => !used.has(key(n)) && map.neighbours(n).filter(m => used.has(key(m))).length === 1);
        if (!opts.length) break;
        const n = opts[Math.random() * opts.length | 0]; path.push(n); used.add(key(n));
      }
      if (path.length < want + 2 || map.distance(path[0], path[path.length - 1]) < 3) continue;
      motor = path[0]; target = path[path.length - 1];
      const chain = path.length - 2; need = chain % 2 === 0 ? -1 : 1;   // motor turns +1 (clockwise)
      map.each(c => { c.data = {}; });
      for (const c of all) if (!used.has(key(c)) && Math.random() < .22 + Math.min(.12, level * .015)) c.data.rock = true;
      budget = chain + (level < 4 ? 2 : 1); break;
    }
    gears = new Set(); spin = new Map(); jam = false; solved = false;
    time = 40 + level * 4;
    banner = { txt: `Level ${level}`, sub: `${budget} gears`, l: 1.2 };
    solve();
  }
  // work out which way every gear connected to the motor turns
  function solve() {
    spin = new Map([[key(motor), 1]]); jam = false;
    const q = [motor];
    while (q.length) {
      const c = q.shift(), d = spin.get(key(c));
      for (const n of map.neighbours(c)) {
        const k = key(n); if (!gears.has(k) && n !== target) continue;
        if (spin.has(k)) { if (spin.get(k) === d) jam = true; continue; }
        spin.set(k, -d); if (n !== target) q.push(n);
      }
    }
    const ts = spin.get(key(target));
    if (!jam && ts === need && !solved) {
      solved = true; const left = budget - gears.size, pts = 3 + left * 2 + Math.floor(time / 10);
      score += pts; api.score(score); feel.win(target.x, target.y); notes('C5 E5 G5 C6:2', { len: .07 }); haptic('success');
      banner = { txt: 'Ticking!', sub: `+${pts}`, l: 1.6, next: true };
    } else if (jam) { haptic('error'); sfx(90, .2, 'sawtooth', .04); feel.juice.shake(5); }
    else if (ts && ts !== need) { sfx(200, .15, 'square', .03, -80); haptic('warning'); feel.juice.pop(target.x, target.y - 34, 'Wrong way!', { color: '#e63946' }); }
  }

  function drawGear(c, x, y, r, a, col, teeth = 9) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const an = i / (teeth * 2) * Math.PI * 2, rr = i % 2 ? r * .78 : r; c.lineTo(Math.cos(an - .12) * rr, Math.sin(an - .12) * rr); c.lineTo(Math.cos(an + .12) * rr, Math.sin(an + .12) * rr); }
    c.closePath(); c.fill();
    c.fillStyle = '#00000030'; c.beginPath(); c.arc(0, 0, r * .55, 0, 7); c.fill();
    c.fillStyle = '#2b2d42'; c.beginPath(); c.arc(0, 0, r * .18, 0, 7); c.fill();
    c.restore();
  }

  return {
    reset() { level = 1; score = 0; t = 0; feel.clear(); build(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); if (b.next) { level++; build(); } } if (banner?.next || banner?.over) return; }
      time -= dt;
      if (time <= 0) { feel.lose(); banner = { txt: 'Out of time', l: 1.4, over: true }; }
    },
    draw(c) {
      c.fillStyle = '#f1e3c8'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#e6d3ae'; for (let y = 0; y < H; y += 24) c.fillRect(0, y, W, 12);
      // header: the clock face wants this way
      c.fillStyle = '#2b2d42'; c.font = '800 22px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(`Gears left: ${budget - gears.size}`, 20, 52);
      c.textAlign = 'right'; c.fillStyle = time < 10 ? '#e63946' : '#2b2d42'; c.fillText(`${Math.ceil(time)}s`, W - 20, 52);
      c.font = '500 14px Rubik, sans-serif'; c.fillStyle = '#5c5f7a'; c.textAlign = 'center'; c.fillText(`Make the brass wheel turn ${need > 0 ? 'clockwise ↻' : 'anticlockwise ↺'}`, W / 2, 84);
      feel.begin(c);
      const r = map.size;
      map.each(cell => {
        c.beginPath(); cell.corners.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
        c.fillStyle = cell.data.rock ? '#8d7b68' : '#d9c4a0'; c.fill(); c.strokeStyle = '#c4ab82'; c.lineWidth = 2; c.stroke();
        if (cell.data.rock) { c.fillStyle = '#6d5d4b'; c.beginPath(); c.arc(cell.x - 4, cell.y + 2, r * .35, 0, 7); c.arc(cell.x + 6, cell.y - 3, r * .25, 0, 7); c.fill(); }
        else if (cell !== motor && cell !== target) { c.fillStyle = '#b39b74'; c.beginPath(); c.arc(cell.x, cell.y, 3, 0, 7); c.fill(); }
      });
      const rot = k => (spin.get(k) || 0) * (jam ? 0 : 1);
      const jit = () => jam ? (Math.random() - .5) * 3 : 0;
      for (const k of gears) { const [q, rr] = k.split(',').map(Number), cell = map.cell(q, rr); drawGear(c, cell.x + jit(), cell.y + jit(), r * .98, t * 2 * rot(k) * (k.length % 2 ? 1 : 1) + (cell.q + cell.r) * .35, spin.has(k) ? (jam ? '#c1121f' : '#8d99ae') : '#adb5bd'); }
      drawGear(c, motor.x, motor.y, r * .98, t * 2, '#e9c46a', 9);
      c.fillStyle = '#2b2d42'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('MOTOR', motor.x, motor.y + r + 14);
      const ts = spin.get(key(target)) || 0;
      drawGear(c, target.x, target.y, r * .98, t * 2 * (jam ? 0 : ts), solved ? '#2a9d8f' : '#d4a373', 12);
      c.strokeStyle = '#2b2d42'; c.lineWidth = 3; c.beginPath(); c.arc(target.x, target.y, r * 1.25, need > 0 ? -2.4 : -.7, need > 0 ? -.7 : -2.4, need < 0); c.stroke();
      const ea = -.7, ex = target.x + Math.cos(need > 0 ? ea : -2.4) * r * 1.25, ey = target.y + Math.sin(need > 0 ? ea : -2.4) * r * 1.25;
      c.fillStyle = '#2b2d42'; c.beginPath(); c.arc(ex, ey, 5, 0, 7); c.fill();
      feel.end(c, W, H);
      c.textAlign = 'center';
      if (jam) { c.fillStyle = '#c1121f'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('Jammed! Three gears touching can\'t turn', W / 2, H - 40); }
      else if (level === 1 && t < 5 && !banner) { c.fillStyle = '#5c5f7a'; c.font = '600 15px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('Tap pegs to add gears from the motor', W / 2, H - 40); }
      if (banner) { c.fillStyle = '#2b2d42e0'; c.fillRect(0, H * .4 - 40, W, 84); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 30px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .4); c.font = '600 17px Rubik, sans-serif'; if (banner.sub) c.fillText(banner.sub, W / 2, H * .4 + 28); }
    },
    down(x, y) {
      if (banner?.next || banner?.over || solved) return;
      const cell = map.at(x, y); if (!cell || cell === motor || cell === target || cell.data.rock) return;
      const k = key(cell);
      if (gears.has(k)) { gears.delete(k); sfx(300, .05, 'square', .03); haptic('tick'); }
      else { if (gears.size >= budget) { feel.juice.pop(x, y - 20, 'No gears left', { color: '#e63946' }); haptic('warning'); return; } gears.add(k); sfx(700, .04, 'square', .03); haptic('light'); feel.juice.burst(cell.x, cell.y, { n: 6, speed: 80, color: '#8d99ae', gravity: 200 }); }
      solve();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'gear-train',
  title: 'Gear Train',
  tag: 'Casual · Puzzle',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Tap pegs to lay a chain of gears from the motor to the brass wheel. Touching gears turn opposite ways; make the wheel spin the way its arrow shows.',
  make,
};
