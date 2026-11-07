import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { brick, stud } from '../kit/bricks.js';

// Build a brick car, then race it. Pick a body in the garage: the zippy Racer, the tough Truck or
// the grippy Buggy. Drag to steer down the track. Smash brick piles your armour can handle for
// studs (bigger piles need more armour), bump past rival cars, and reach each checkpoint before
// the clock runs out. At the pit stop, spend studs on speed, grip or armour.
const BODIES = [
  { n: 'RACER', col: 'red', speed: 3, grip: 3, armour: 1 },
  { n: 'TRUCK', col: 'blue', speed: 1, grip: 1, armour: 3 },
  { n: 'BUGGY', col: 'green', speed: 2, grip: 2, armour: 2 },
];
let W = 160, H = 192;

function make(api) {
  let mode, car, x, tx, dist, time, objs, nextObj, cp, studs, total, hp, t, parts, msg, dead, hitT, bodyI, speed;
  const road = () => ({ l: W * .14, r: W * .86 }), carY = () => H - 34;
  const cost = s => 20 + car[s] * 15;
  const cpAt = n => n * 1800 + n * (n - 1) * 120;
  function startRace() { mode = 'race'; x = tx = W / 2; time = Math.max(time, 0) + (cp ? 14.5 : 20); msg = { txt: cp ? `CHECKPOINT ${cp}` : 'GO!', l: 1 }; sfx(880, .2, 'square', .05, 200); }
  function spawn() {
    const R = road(), r = Math.random(), lvl = Math.min(1, dist / 8000), px = rnd(R.l + 10, R.r - 10);
    if (r < .38) { const size = 1 + (Math.random() * (1 + lvl * 2.5) | 0); objs.push({ k: 'pile', x: px, y: -20, size, w: 10 + size * 4 }); }
    else if (r < .62) objs.push({ k: 'car', x: px, y: -20, sp: rnd(.45, .7), col: ['yellow', 'orange', 'white', 'black'][Math.random() * 4 | 0], w: 12, drift: rnd(-10, 10) });
    else if (r < .7) objs.push({ k: 'oil', x: px, y: -20, w: 16 });
    else for (let i = 0; i < 5; i++) objs.push({ k: 'stud', x: px + Math.sin(i) * 6, y: -20 - i * 12, gold: i === 2 && Math.random() < .4, w: 6 });
  }
  function burst(x0, y0, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x: x0, y: y0, vx: rnd(-70, 70), vy: rnd(-90, 20), l: .5, col }); }
  function crash(txt) { if (hitT > 0) return; hp--; hitT = 1.2; speed *= .4; haptic('heavy'); sfx(120, .3, 'sawtooth', .05, -60); msg = { txt, l: .8 }; }
  const self = {
    reset() { mode = 'garage'; bodyI = 0; dist = 0; time = 0; objs = []; nextObj = 0; cp = 0; studs = 0; total = 0; hp = 3; t = 0; parts = []; msg = null; dead = 0; hitT = 0; speed = 0; car = null; },
    resize(w, h) { const s = w / W; W = w; H = h; if (objs) { for (const o of objs) o.x *= s; x *= s; tx *= s; } },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.4) api.over(); return; }
      if (mode !== 'race') return;
      hitT = Math.max(0, hitT - dt);
      time -= dt; if (time <= 0) { time = 0; dead = .01; msg = { txt: 'OUT OF TIME', l: 9 }; haptic('error'); sfx(140, .5, 'square', .05, -60); return; }
      const R = road(), top = 110 + car.speed * 16 + Math.min(60, cp * 6); speed += (top - speed) * dt * .8;
      const offroad = x < R.l || x > R.r; if (offroad) speed = Math.min(speed, top * .5);
      const grip = 3 + car.grip * 2.2; x += (tx - x) * Math.min(1, dt * grip); x = clamp(x, 8, W - 8);
      const dy = speed * dt; dist += dy;
      nextObj -= dy; if (nextObj <= 0) { spawn(); nextObj = rnd(40, 75) - Math.min(20, dist / 600); }
      for (const o of objs) { o.y += dy * (o.k === 'car' ? 1 - o.sp : 1); if (o.k === 'car') o.x = clamp(o.x + Math.sin(t + o.drift) * 12 * dt, R.l + 8, R.r - 8); }
      const cy = carY();
      for (const o of objs) {
        if (o.done || Math.abs(o.y - cy) > 12 || Math.abs(o.x - x) > (o.w + 12) / 2) continue;
        if (o.k === 'stud') { o.done = true; const v = o.gold ? 10 : 1; studs += v; total += v; api.score(total); sfx(o.gold ? 1500 : 1250, .03, 'square', .02, 200); }
        else if (o.k === 'pile') { o.done = true; if (car.armour >= o.size) { const v = o.size * 3; studs += v; total += v; api.score(total); burst(o.x, o.y, '#f0c020', 12); haptic('medium'); sfx(200, .12, 'square', .05, -80); parts.push({ txt: `+${v}`, x: o.x, y: o.y - 10, l: .7, col: '#f0c020' }); speed *= .9; } else { burst(o.x, o.y, '#d83a2c', 8); crash('NEED MORE ARMOUR'); } }
        else if (o.k === 'car') { o.done = true; if (car.armour >= 3) { burst(o.x, o.y, '#e8e8e0'); studs += 5; total += 5; api.score(total); haptic('medium'); sfx(160, .15, 'square', .05, -60); } else { o.y -= 20; crash('BUMP!'); } }
        else if (o.k === 'oil') { o.done = true; tx = x + rnd(-40, 40); speed *= .7; haptic('light'); sfx(300, .2, 'triangle', .04, -200); }
      }
      objs = objs.filter(o => o.y < H + 30 && !(o.done && o.k !== 'oil'));
      if (hp <= 0) { dead = .01; msg = { txt: 'WRECKED!', l: 9 }; return; }
      if (dist >= cpAt(cp + 1)) { cp++; mode = 'pit'; haptic('success'); sfx(880, .3, 'square', .05, 400); hp = Math.min(3, hp + 1); }
    },
    draw(c) {
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      if (mode === 'garage' || mode === 'pit') {
        c.fillStyle = '#303848'; c.fillRect(0, 0, W, H);
        for (let i = 0; i < W; i += 16) brick(c, i, H - 10, 16, 10, 'grey', 8);
        c.fillStyle = '#f0c020'; c.fillText(mode === 'garage' ? 'PICK YOUR CAR' : `PIT STOP · ◆${studs}`, W / 2, 24);
        if (mode === 'garage') {
          const ch = Math.min(46, (H - 46) / 3 - 4);
          BODIES.forEach((b, i) => { const y = 30 + i * (ch + 4); c.fillStyle = '#404858'; c.fillRect(8, y, W - 16, ch); drawCar(c, 28, y + ch / 2 + 6, b.col, 1.4); c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(b.n, 50, y + 12); [['SPD', b.speed], ['GRP', b.grip], ['ARM', b.armour]].forEach(([l, v], j) => { c.fillStyle = '#a0a8b8'; c.fillText(l, 50, y + 22 + j * 8); for (let k = 0; k < 3; k++) { c.fillStyle = k < v ? '#f0c020' : '#2a3040'; c.fillRect(74 + k * 8, y + 17 + j * 8, 6, 5); } }); c.textAlign = 'center'; });
        } else {
          const rows = [['speed', 'SPEED'], ['grip', 'GRIP'], ['armour', 'ARMOUR']];
          rows.forEach(([k, l], i) => { const y = 30 + i * 34, can = studs >= cost(k) && car[k] < 6; c.fillStyle = can ? '#406848' : '#404858'; c.fillRect(8, y, W - 16, 28); c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(l, 14, y + 12); for (let j = 0; j < 6; j++) { c.fillStyle = j < car[k] ? '#f0c020' : '#2a3040'; c.fillRect(14 + j * 9, y + 17, 7, 5); } c.textAlign = 'right'; c.fillStyle = can ? '#f0c020' : '#808898'; c.fillText(car[k] >= 6 ? 'MAX' : `◆${cost(k)}`, W - 14, y + 16); });
          c.textAlign = 'center'; c.fillStyle = '#d83a2c'; c.fillRect(W / 2 - 34, 30 + 3 * 34, 68, 22); c.fillStyle = '#f8f8f0'; c.fillText('RACE ON', W / 2, 30 + 3 * 34 + 14);
        }
        if (msg) { c.fillStyle = '#f8f8f0'; c.fillText(msg.txt, W / 2, H - 16); }
        return;
      }
      const R = road(), off = dist % 32;
      c.fillStyle = '#48a048'; c.fillRect(0, 0, W, H); c.fillStyle = '#3c903c'; for (let y = -32 + off; y < H; y += 32) { c.fillRect(0, y, R.l, 16); c.fillRect(R.r, y, W - R.r, 16); }
      c.fillStyle = '#585c64'; c.fillRect(R.l, 0, R.r - R.l, H);
      for (let y = -32 + off; y < H; y += 32) { c.fillStyle = '#d83a2c'; c.fillRect(R.l - 4, y, 4, 16); c.fillRect(R.r, y, 4, 16); c.fillStyle = '#e8e8e0'; c.fillRect(R.l - 4, y + 16, 4, 16); c.fillRect(R.r, y + 16, 4, 16); c.fillRect(W / 2 - 1, y, 2, 14); }
      const cpY = carY() - (cpAt(cp + 1) - dist); if (cpY > -10 && cpY < H) { for (let i = 0; i < (R.r - R.l) / 8; i++) { c.fillStyle = i % 2 ? '#202020' : '#f8f8f0'; c.fillRect(R.l + i * 8, cpY, 8, 6); } }
      for (const o of objs) {
        if (o.k === 'stud') stud(c, o.x, o.y, o.gold ? 3.5 : 2.5, o.gold ? 'gold' : 'silver', t);
        else if (o.k === 'pile') { for (let i = 0; i < o.size; i++) brick(c, o.x - o.w / 2 + i * 2, o.y - 4 - i * 5, o.w - i * 4, 5, ['tan', 'grey', 'black', 'black'][o.size - 1], 4); c.fillStyle = car.armour >= o.size ? '#58e070' : '#f86060'; c.fillText(String(o.size), o.x, o.y - 6 - o.size * 5); }
        else if (o.k === 'car') drawCar(c, o.x, o.y, o.col, 1);
        else if (o.k === 'oil') { c.fillStyle = '#181820'; c.beginPath(); c.ellipse(o.x, o.y, 9, 5, 0, 0, 7); c.fill(); c.fillStyle = '#383850'; c.fillRect(o.x - 3, o.y - 2, 3, 1); }
      }
      if (!(hitT > 0 && (t * 14 | 0) % 2)) drawCar(c, x, carY(), BODIES[bodyI].col, 1, car.armour);
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.fillStyle = '#000a'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = time < 6 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 9);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < hp ? '#f84858' : '#403848'; c.fillRect(34 + i * 7, 3, 5, 6); }
      c.textAlign = 'right'; c.fillStyle = '#f0c020'; c.fillText(`◆${studs}`, W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .4 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f0c020'; c.fillText(msg.txt, W / 2, H * .4); }
    },
    down(px, py) {
      if (dead) return;
      if (mode === 'garage') { const ch = Math.min(46, (H - 46) / 3 - 4), i = Math.floor((py - 30) / (ch + 4)); if (i >= 0 && i < 3) { bodyI = i; const b = BODIES[i]; car = { speed: b.speed, grip: b.grip, armour: b.armour }; haptic('medium'); sfx(600, .1, 'square', .04, 200); startRace(); } return; }
      if (mode === 'pit') { const i = Math.floor((py - 30) / 34); if (i >= 0 && i < 3) { const k = ['speed', 'grip', 'armour'][i]; if (studs >= cost(k) && car[k] < 6) { studs -= cost(k); car[k]++; haptic('success'); sfx(900, .1, 'square', .04, 300); } else { haptic('error'); sfx(150, .08, 'square', .03); } } else if (i === 3) startRace(); return; }
      tx = px;
    },
    move(px, py, p) { if (p && mode === 'race') tx = px; },
    up() {},
    key(k, d) { if (!d) return; if (mode === 'garage' && '123'.includes(k)) self.down(0, 30 + (+k - .5) * (Math.min(46, (H - 40) / 3 - 4) + 4)); else if (mode === 'pit' && k === ' ') startRace(); else if (mode === 'race') { if (k === 'ArrowLeft') tx = x - 30; if (k === 'ArrowRight') tx = x + 30; } },
  };
  function drawCar(c, cx, cy, col, s, armour = 0) {
    const w = 12 * s, h = 18 * s; c.fillStyle = '#181818'; c.fillRect(cx - w / 2 - 2 * s, cy - h / 2 + 2 * s, 3 * s, 5 * s); c.fillRect(cx + w / 2 - s, cy - h / 2 + 2 * s, 3 * s, 5 * s); c.fillRect(cx - w / 2 - 2 * s, cy + h / 2 - 7 * s, 3 * s, 5 * s); c.fillRect(cx + w / 2 - s, cy + h / 2 - 7 * s, 3 * s, 5 * s);
    brick(c, cx - w / 2, cy - h / 2, w, h, col, 0); c.fillStyle = '#88c8f8'; c.fillRect(cx - w / 2 + 2 * s, cy - h / 2 + 4 * s, w - 4 * s, 4 * s);
    if (armour >= 3) { c.fillStyle = '#b8bcc4'; c.fillRect(cx - w / 2 - 1, cy - h / 2 - 2, w + 2, 3); }
  }
  return self;
}

export default {
  id: 'kit-racer', title: 'Kit Racer', tag: 'Bricks · Racing', retro: true, era: 'advance', pal: 'berry', w: 160, h: 192, maxW: 240, maxH: 320, goal: 300,
  hint: 'Tap a car in the garage, then drag to steer. Smash brick piles your armour can handle (green number) for studs, dodge the red ones, bump past rivals and avoid oil. Reach each checkpoint before time runs out, then spend studs at the pit stop on speed, grip or armour.',
  make,
};
