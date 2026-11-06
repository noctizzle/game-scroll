import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A space knight with a light blade holds the hangar floor. Tap the left or right side to swing
// that way: a swing that meets an incoming bolt knocks it back, and a late, close swing sends it
// straight back at the drone that fired it. Swing at walkers before they strike. Deflects fill
// your Focus; hold anywhere when it is full to release a push that clears the room.
const KNIGHT_W = 6;
let W = 160, H = 176;

function make(api) {
  let drones, walkers, bolts, parts, swing, hp, focus, score, combo, t, spawnT, holdT, held, msg, shake, hurtT, pushFx;
  const ground = () => H - 22, kx = () => W / 2;
  function spawnDrone() {
    const side = Math.random() < .5 ? -1 : 1, hx = W / 2 + side * rnd(W * .2, W * .42), hy = rnd(26, ground() - 50);
    drones.push({ x: W / 2 + side * (W / 2 + 12), y: hy, hx, hy, side, cd: rnd(1.2, 2), warn: 0, hp: 1, bob: rnd(0, 6) });
  }
  function spawnWalker() { const side = Math.random() < .5 ? -1 : 1, big = t > 40 && Math.random() < .25; walkers.push({ x: W / 2 + side * (W / 2 + 10), side, hp: big ? 3 : 1, big, wind: 0, kb: 0 }); }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-70, 20), l: rnd(.2, .5), col }); }
  function hurt() {
    if (hurtT > 0) return; hp--; hurtT = .9; combo = 0; shake = .3; haptic('heavy'); sfx(140, .25, 'sawtooth', .05, -60); burst(kx(), ground() - 12, '#f8f8f0', 6);
  }
  function doSwing(dir) {
    if (swing && swing.t > .06) return; swing = { dir, t: .2 }; sfx(520 + Math.random() * 60, .08, 'sawtooth', .025, 500); haptic('light');
    // melee: walkers in reach on that side
    for (const w of walkers) if (Math.sign(w.x - kx()) === dir && Math.abs(w.x - kx()) < 22) {
      w.hp--; w.kb = .15; w.x += dir * 8; burst(w.x, ground() - 8, '#e05048', 5); sfx(220, .06, 'square', .04, -80);
      if (w.hp <= 0) { w.dead = true; combo++; score += w.big ? 3 : 1; api.score(score); haptic('medium'); }
    }
  }
  function push() {
    focus = 0; pushFx = .5; shake = .4; haptic('success'); sfx(80, .6, 'sawtooth', .06, 600); msg = { txt: 'PUSH!', l: .8 };
    for (const d of drones) { d.hp = 0; d.dead = true; burst(d.x, d.y, '#f86040', 10); score += 1; }
    for (const w of walkers) { w.dead = true; burst(w.x, ground() - 8, '#e05048', 8); score += w.big ? 3 : 1; }
    bolts = []; api.score(score);
  }
  const self = {
    reset() { drones = []; walkers = []; bolts = []; parts = []; swing = null; hp = 5; focus = 0; score = 0; combo = 0; t = 0; spawnT = 1; holdT = 0; held = null; msg = null; shake = 0; hurtT = 0; pushFx = 0; },
    resize(w, h) { const dx = (w - W) / 2, dy = h - H; W = w; H = h; if (drones) { for (const d of drones) { d.x += dx; d.hx += dx; d.y = Math.min(d.y + dy, ground() - 40); d.hy = Math.min(d.hy + dy, ground() - 40); } for (const w2 of walkers) w2.x += dx; for (const b of bolts) { b.x += dx; b.y += dy; } } },
    update(dt) {
      t += dt; shake = Math.max(0, shake - dt); hurtT = Math.max(0, hurtT - dt); pushFx = Math.max(0, pushFx - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (swing) { swing.t -= dt; if (swing.t <= 0) swing = null; }
      if (held) { held.t += dt; if (held.t > .45 && focus >= 1) { held = null; push(); } }
      const level = Math.min(1, t / 120);
      spawnT -= dt; if (spawnT <= 0) { if (Math.random() < .62) spawnDrone(); else spawnWalker(); spawnT = Math.max(.7, 2.4 - level * 1.6) * rnd(.7, 1.2); }
      for (const d of drones) {
        d.x += (d.hx - d.x) * Math.min(1, dt * 2); d.y += (d.hy - d.y) * Math.min(1, dt * 2) + Math.sin(t * 3 + d.bob) * 6 * dt;
        d.cd -= dt; if (d.cd < .35 && d.cd + dt >= .35) { d.warn = .35; sfx(1200, .04, 'square', .02); }
        d.warn = Math.max(0, d.warn - dt);
        if (d.cd <= 0) { const tx = kx(), ty = ground() - 12, dx = tx - d.x, dy = ty - d.y, l = Math.hypot(dx, dy), sp = 70 + level * 50; bolts.push({ x: d.x, y: d.y, vx: dx / l * sp, vy: dy / l * sp, from: d }); d.cd = rnd(1.6, 2.6) - level * .6; sfx(900, .05, 'square', .02, -400); }
      }
      for (const w of walkers) {
        if (w.kb > 0) { w.kb -= dt; continue; }
        const dist = Math.abs(w.x - kx());
        if (dist > 16) w.x -= w.side * (w.big ? 16 : 24) * dt; else { w.wind += dt; if (w.wind > (w.big ? .9 : .7)) { w.wind = 0; hurt(); w.x += w.side * 10; } }
      }
      for (const b of bolts) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.refl) { for (const d of drones) if (!d.dead && Math.hypot(d.x - b.x, d.y - b.y) < 7) { d.dead = true; b.dead = true; combo++; score += 1 + (combo >= 5 ? 1 : 0); api.score(score); burst(d.x, d.y, '#f86040', 10); haptic('medium'); sfx(160, .2, 'square', .05, -40); if (combo % 5 === 0) msg = { txt: `COMBO x${combo}`, l: .8 }; } continue; }
        const dx = b.x - kx(), side = Math.sign(dx) || 1, near = Math.abs(dx);
        if (swing && swing.dir === side && near < 18 && b.y > ground() - 34) {
          const perfect = near < 11; b.refl = true;
          if (perfect && !b.from.dead) { const ex = b.from.x - b.x, ey = b.from.y - b.y, l = Math.hypot(ex, ey), sp = Math.hypot(b.vx, b.vy) * 1.6; b.vx = ex / l * sp; b.vy = ey / l * sp; }
          else { b.vx = -b.vx * 1.3; b.vy = -Math.abs(b.vy) * rnd(.4, 1.2); }
          focus = Math.min(1, focus + (perfect ? .14 : .08)); burst(b.x, b.y, '#80f8ff', 4); haptic(perfect ? 'medium' : 'light'); sfx(perfect ? 1500 : 1100, .06, 'square', .03, 200);
          continue;
        }
        if (near < KNIGHT_W && b.y > ground() - 22 && b.y < ground()) { b.dead = true; hurt(); }
      }
      bolts = bolts.filter(b => !b.dead && b.x > -10 && b.x < W + 10 && b.y > -10 && b.y < H + 10);
      drones = drones.filter(d => !d.dead); walkers = walkers.filter(w => !w.dead);
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.l -= dt; } parts = parts.filter(p => p.l > 0);
      if (hp <= 0) { haptic('error'); sfx(90, .7, 'sawtooth', .06, -40); return api.over(); }
    },
    fx(dt) { for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; } parts = parts.filter(p => p.l > 0); },
    draw(c) {
      const g = ground(), sx = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
      c.fillStyle = '#0c0c20'; c.fillRect(0, 0, W, H); c.save(); c.translate(sx, 0);
      for (let i = 0; i < 40; i++) { c.fillStyle = i % 3 ? '#404070' : '#8080c0'; c.fillRect((i * 37) % W, (i * 23) % (g - 40), 1, 1); }
      // hangar: window frame and floor
      c.fillStyle = '#202040'; c.fillRect(0, g - 70, W, 3); for (let x = 0; x < W; x += 32) c.fillRect(x, 10, 3, g - 77);
      c.fillStyle = '#282848'; c.fillRect(0, g, W, H - g); c.fillStyle = '#383868'; c.fillRect(0, g, W, 2); c.fillStyle = '#202040'; for (let x = (t * 0) % 16; x < W; x += 16) c.fillRect(x, g + 6, 8, 2);
      if (pushFx > 0) { c.strokeStyle = `rgba(128,248,255,${pushFx * 2})`; c.lineWidth = 2; c.beginPath(); c.arc(kx(), g - 12, (1 - pushFx * 2) * W * .8 + 10, 0, 7); c.stroke(); }
      for (const d of drones) {
        const x = Math.round(d.x), y = Math.round(d.y);
        c.fillStyle = '#585878'; c.fillRect(x - 6, y - 3, 12, 6); c.fillStyle = '#9090b8'; c.fillRect(x - 6, y - 3, 12, 1); c.fillRect(x - 8, y - 1, 2, 3); c.fillRect(x + 6, y - 1, 2, 3);
        c.fillStyle = d.warn > 0 && (t * 20 | 0) % 2 ? '#f8f8f0' : '#f84040'; c.fillRect(x - 1, y - 1, 3, 3);
      }
      for (const w of walkers) {
        const x = Math.round(w.x), y = g, s = w.big ? 1.4 : 1, step = (t * 8 | 0) % 2, raise = w.wind > .35;
        c.fillStyle = w.kb > 0 ? '#f8f8f0' : w.big ? '#a04848' : '#c8c8d8'; c.fillRect(x - 4 * s, y - 16 * s, 8 * s, 10 * s); c.fillStyle = '#303040'; c.fillRect(x - 3 * s, y - 14 * s, 6 * s, 2);
        c.fillStyle = '#585868'; c.fillRect(x - 3 * s, y - 6 * s, 2 * s, 6 * s - step); c.fillRect(x + 1 * s, y - 6 * s, 2 * s, 6 * s - 1 + step);
        c.fillStyle = raise ? '#f8c838' : '#404050'; const ax = x - w.side * 6; c.fillRect(ax - 1, raise ? y - 22 * s : y - 12 * s, 2, 9);
      }
      // knight
      const x = kx(), y = g, blink = hurtT > 0 && (t * 16 | 0) % 2;
      if (!blink) {
        c.fillStyle = '#e8e0d0'; c.fillRect(x - 4, y - 20, 8, 6); c.fillStyle = '#c09060'; c.fillRect(x - 3, y - 19, 6, 4); c.fillStyle = '#101018'; c.fillRect(x - 2, y - 18, 1, 1); c.fillRect(x + 1, y - 18, 1, 1);
        c.fillStyle = '#806048'; c.fillRect(x - 5, y - 14, 10, 9); c.fillStyle = '#e8e0d0'; c.fillRect(x - 3, y - 14, 6, 8); c.fillStyle = '#504030'; c.fillRect(x - 5, y - 8, 10, 1);
        c.fillStyle = '#403020'; c.fillRect(x - 4, y - 5, 3, 5); c.fillRect(x + 1, y - 5, 3, 5);
      }
      const dir = swing ? swing.dir : held ? 0 : 1, k = swing ? 1 - swing.t / .2 : 0;
      const ang = swing ? (dir > 0 ? -2.2 + k * 2.6 : -0.94 - k * 2.6) : -1.2, hx = x + (swing ? dir * 4 : 5), hy = y - 11, L = 15;
      c.strokeStyle = '#80f8ff'; c.lineWidth = 3; c.globalAlpha = .45; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(ang) * L, hy + Math.sin(ang) * L); c.stroke();
      c.globalAlpha = 1; c.strokeStyle = '#f0ffff'; c.lineWidth = 1; c.stroke();
      if (swing) { c.strokeStyle = '#80f8ff60'; c.beginPath(); c.arc(hx, hy, L, dir > 0 ? -2.2 : -0.94 - k * 2.6, dir > 0 ? ang : -0.94); c.stroke(); }
      c.fillStyle = '#a0a0b0'; c.fillRect(hx - 1, hy - 1, 3, 3);
      for (const b of bolts) { c.fillStyle = b.refl ? '#80f8ff' : '#f84040'; const l = Math.hypot(b.vx, b.vy); c.fillRect(Math.round(b.x - b.vx / l * 3), Math.round(b.y - b.vy / l * 3), 2, 2); c.fillStyle = '#f8f8f0'; c.fillRect(Math.round(b.x), Math.round(b.y), 2, 2); }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x | 0, p.y | 0, 2, 2); }
      c.restore();
      c.font = '6px "Press Start 2P", monospace';
      for (let i = 0; i < 5; i++) { c.fillStyle = i < hp ? '#80f8ff' : '#303050'; c.fillRect(4 + i * 6, 4, 4, 5); }
      c.fillStyle = '#303050'; c.fillRect(W - 44, 4, 40, 5); c.fillStyle = focus >= 1 && (t * 6 | 0) % 2 ? '#f8f8f0' : '#a858e8'; c.fillRect(W - 44, 4, 40 * focus, 5);
      c.textAlign = 'right'; c.fillStyle = '#a0a0d0'; c.fillText(focus >= 1 ? 'HOLD!' : 'FOCUS', W - 4, 17);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#80f8ff'; c.fillText(msg.txt, W / 2, H * .35); }
      if (t < 5) { c.textAlign = 'center'; c.fillStyle = '#a0a0d0'; c.fillText('TAP A SIDE TO SWING', W / 2, H - 6); }
    },
    down(x) { held = { t: 0, x }; doSwing(x < W / 2 ? -1 : 1); },
    up() { held = null; },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') doSwing(-1); if (k === 'ArrowRight') doSwing(1); if (k === ' ' && focus >= 1) push(); },
  };
  return self;
}

export default {
  id: 'saber-knight', title: 'Saber Knight', tag: 'Advance · Action', retro: true, era: 'advance', pal: 'grape', w: 160, h: 176, maxW: 240, maxH: 280, goal: 30,
  hint: 'Tap the left or right side to swing your light blade that way. Swing into red bolts to knock them back; swing late and close to send them straight at the drone. Hit walkers before they strike. When Focus is full, hold to push everything away.',
  make,
};
