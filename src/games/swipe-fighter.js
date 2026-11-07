import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A one-on-one arena fighter built for thumbs. Tap to jab, swipe forward for a heavy blow, swipe
// down to sweep low, swipe up to hop, swipe back to step away, and hold still to guard. Guard
// stops jabs and heavies but not sweeps; hop over sweeps. Rivals flash before they strike: red
// means guard, blue means hop. Hit them while they wind up for a double-damage counter.
const MOVES = {
  jab: { wind: .1, act: .1, rec: .15, dmg: 4, reach: 26, kind: 'high' },
  heavy: { wind: .32, act: .12, rec: .35, dmg: 11, reach: 34, kind: 'high', push: 20 },
  sweep: { wind: .26, act: .12, rec: .4, dmg: 8, reach: 32, kind: 'low', down: true },
};
const RIVALS = [
  { name: 'BRAWN', col: '#c84838', skin: '#e8b080', speed: .75, aggro: .7 },
  { name: 'VEX', col: '#4878d0', skin: '#f0c8a0', speed: .9, aggro: .9 },
  { name: 'KOJI', col: '#38a048', skin: '#d8a070', speed: 1.05, aggro: 1.1 },
  { name: 'MARA', col: '#a848c8', skin: '#f8d0b0', speed: 1.2, aggro: 1.3 },
  { name: 'IRONJAW', col: '#808890', skin: '#c89060', speed: 1.35, aggro: 1.5 },
];
let W = 192, H = 160;

function make(api) {
  let you, foe, rival, ko, t, parts, msg, dead, sw, between, flash, wins;
  const floor = () => H - 22;
  const mk = (x, dir, col, skin) => ({ x, dir, hp: 60, max: 60, st: 'idle', mv: null, tt: 0, guard: false, air: 0, down: 0, stun: 0, col, skin, hitDone: false });
  function startFight() { const r = RIVALS[wins % RIVALS.length], lap = Math.floor(wins / RIVALS.length); rival = { ...r, speed: r.speed + lap * .2, aggro: r.aggro + lap * .3 }; foe = mk(W * .7, -1, r.col, r.skin); foe.hp = foe.max = 50 + wins * 6; foe.think = .8; you.x = W * .3; you.st = 'idle'; you.mv = null; between = 1.4; msg = { txt: `VS ${rival.name}`, l: 1.4 }; }
  function act(f, name) { if (f.st !== 'idle' || f.down > 0 || f.stun > 0 || f.air > 0) return false; f.st = 'wind'; f.mv = name; f.tt = 0; f.hitDone = false; f.guard = false; if (name === 'heavy') f.x += f.dir * 10; return true; }
  function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-70, 10), l: .35, col }); }
  function strike(a, b) {
    const m = MOVES[a.mv], d = Math.abs(a.x - b.x); if (d > m.reach || a.hitDone) return; a.hitDone = true;
    if (m.kind === 'low' && b.air > 0) { burst(b.x, floor() - 4, '#ffffff'); return; }
    if (m.kind === 'high' && b.guard && b.st === 'idle') { b.x += a.dir * 6; sfx(900, .05, 'square', .03); parts.push({ txt: 'BLOCK', x: b.x, y: floor() - 46, l: .6, col: '#a0c8ff' }); if (b === you) haptic('light'); a.st = 'rec'; a.tt = 0; return; }
    const counter = b.st === 'wind', dmg = m.dmg * (counter ? 2 : 1);
    b.hp -= dmg; b.st = 'idle'; b.mv = null; b.stun = .3 + (counter ? .25 : 0); b.guard = false; b.x += a.dir * (m.push || 6); if (m.down) b.down = .8;
    burst(b.x, floor() - (m.kind === 'low' ? 6 : 30), counter ? '#f8e040' : '#ffffff'); parts.push({ txt: counter ? `COUNTER ${dmg}` : `${dmg}`, x: b.x, y: floor() - 50, l: .7, col: counter ? '#f8e040' : '#f8f8f0' });
    flash = .08; sfx(counter ? 160 : 220, .12, 'square', .06, -80); haptic(b === you ? 'heavy' : counter ? 'success' : 'medium');
  }
  function step(f, o, dt) {
    f.stun = Math.max(0, f.stun - dt); f.down = Math.max(0, f.down - dt);
    if (f.air > 0) { f.air += dt; if (f.air > .55) f.air = 0; }
    if (f.st !== 'idle') { const m = MOVES[f.mv]; f.tt += dt; const sp = f === foe ? rival.speed : 1;
      if (f.st === 'wind' && f.tt >= m.wind / sp) { f.st = 'act'; f.tt = 0; sfx(f.mv === 'jab' ? 500 : 300, .05, 'square', .03, -100); }
      else if (f.st === 'act') { strike(f, o); if (f.tt >= m.act) { f.st = 'rec'; f.tt = 0; } }
      else if (f.st === 'rec' && f.tt >= m.rec / sp) { f.st = 'idle'; f.mv = null; } }
    f.x = clamp(f.x, 12, W - 12); f.dir = o.x > f.x ? 1 : -1;
    if (Math.abs(f.x - o.x) < 16) { const push = (16 - Math.abs(f.x - o.x)) / 2; f.x -= f.dir * push; }
  }
  function ai(dt) {
    foe.think -= dt; const d = Math.abs(foe.x - you.x);
    if (foe.st === 'idle' && !foe.stun && !foe.down) {
      // react to your wind-ups sometimes, based on aggression
      if (you.st === 'wind' && foe.think < .3 && Math.random() < .03 * rival.aggro) { if (you.mv === 'sweep') foe.air = .01; else foe.guard = true; }
      if (foe.think <= 0) {
        foe.guard = false; foe.think = rnd(.35, .9) / rival.aggro;
        if (d > 32) { foe.walk = rnd(.25, .6); }
        else { const r = Math.random(); if (r < .3) act(foe, 'jab'); else if (r < .55) act(foe, 'heavy'); else if (r < .78) act(foe, 'sweep'); else if (r < .9) foe.guard = true, foe.think = .6; else foe.back = .3; }
      }
      if (foe.walk > 0) { foe.walk -= dt; foe.x += foe.dir * 40 * rival.speed * dt; }
      if (foe.back > 0) { foe.back -= dt; foe.x -= foe.dir * 50 * dt; }
    }
  }
  const self = {
    reset() { you = mk(W * .3, 1, '#e8e8f0', '#f0c090'); you.hp = you.max = 70; wins = 0; t = 0; parts = []; dead = 0; sw = null; flash = 0; ko = 0; startFight(); },
    resize(w, h) { const s = w / W; W = w; H = h; if (you) { you.x *= s; foe.x *= s; } },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.5) api.over(); return; }
      if (between > 0) { between -= dt; return; }
      if (ko) { ko += dt; if (ko > 1.6) { ko = 0; wins++; api.score(wins); you.hp = Math.min(you.max, you.hp + 25); startFight(); } return; }
      if (sw && !sw.used && performance.now() - sw.t > 160 && you.st === 'idle') you.guard = true;
      if (you.walk) { you.x += you.walk * 60 * dt; }
      step(you, foe, dt); ai(dt); step(foe, you, dt);
      if (foe.hp <= 0) { foe.hp = 0; ko = .01; msg = { txt: 'K.O.!', l: 1.5 }; haptic('success'); sfx(880, .5, 'square', .05, 400); }
      else if (you.hp <= 0) { you.hp = 0; dead = .01; msg = { txt: 'DOWN AND OUT', l: 9 }; haptic('error'); sfx(110, .7, 'sawtooth', .05, -40); }
    },
    draw(c) {
      c.fillStyle = flash > 0 ? '#f8f8f0' : '#382848'; c.fillRect(0, 0, W, H);
      if (!flash) { c.fillStyle = '#48385a'; for (let i = 0; i < 6; i++) c.fillRect(i * W / 6 + 6, H * .25, W / 6 - 12, H * .3); c.fillStyle = '#f8c84030'; c.beginPath(); c.arc(W / 2, H * .18, 40, 0, 7); c.fill(); }
      c.fillStyle = '#806048'; c.fillRect(0, floor(), W, H - floor()); c.fillStyle = '#a07858'; c.fillRect(0, floor(), W, 2);
      const fig = f => {
        const x = Math.round(f.x), base = floor() - (f.air > 0 ? Math.sin(f.air / .55 * Math.PI) * 22 : 0), d = f.dir;
        if (f.down > 0) { c.fillStyle = f.col; c.fillRect(x - 14, base - 6, 24, 6); c.fillStyle = f.skin; c.fillRect(x + 10 * d - 3, base - 7, 6, 6); return; }
        const crouch = f.mv === 'sweep' && f.st !== 'wind' ? 10 : 0, by = base - 34 + crouch;
        // telegraph glow during wind-up
        if (f.st === 'wind' && f === foe) { c.fillStyle = MOVES[f.mv].kind === 'low' ? '#4890ff70' : '#ff484870'; c.beginPath(); c.arc(x, base - 18, 22, 0, 7); c.fill(); }
        c.fillStyle = '#302030'; c.fillRect(x - 5, by + 20, 4, 14 - crouch); c.fillRect(x + 1, by + 20, 4, 14 - crouch);
        c.fillStyle = f.col; c.fillRect(x - 6, by + 6, 12, 15);
        c.fillStyle = f.skin; c.fillRect(x - 4, by - 2, 8, 8); c.fillStyle = '#202020'; c.fillRect(x + d * 2 - 1, by + 1, 2, 2);
        c.fillStyle = f.skin;
        if (f.guard && f.st === 'idle') { c.fillRect(x + d * 6 - 2, by + 2, 4, 12); }
        else if (f.st === 'act' || (f.st === 'rec' && f.tt < .1)) { const m = MOVES[f.mv]; if (f.mv === 'sweep') { c.fillStyle = '#302030'; c.fillRect(d > 0 ? x : x - m.reach + 6, base - 4, m.reach - 6, 4); } else { const ly = f.mv === 'heavy' ? by + 12 : by + 6; c.fillRect(d > 0 ? x + 4 : x - m.reach + 6, ly, m.reach - 10, 4); } }
        else if (f.st === 'wind') { c.fillRect(x - d * 9 - 2, by + 8, 4, 4); }
        else { c.fillRect(x + d * 6 - 2, by + 8, 4, 4); }
        if (f.stun > 0) { c.fillStyle = '#f8e040'; c.fillRect(x - 6 + (t * 20 % 12), by - 6, 2, 2); }
      };
      fig(foe); fig(you);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // health bars
      const bw = W / 2 - 14;
      c.fillStyle = '#100818'; c.fillRect(4, 4, bw + 2, 7); c.fillRect(W - bw - 6, 4, bw + 2, 7);
      c.fillStyle = you.hp / you.max < .3 ? '#f84848' : '#f8d040'; c.fillRect(5, 5, bw * you.hp / you.max, 5);
      c.fillStyle = '#f8d040'; const fw = bw * foe.hp / foe.max; c.fillRect(W - 5 - fw, 5, fw, 5);
      c.fillStyle = '#f8f8f0'; c.textAlign = 'left'; c.fillText('YOU', 5, 19); c.textAlign = 'right'; c.fillText(rival.name, W - 5, 19);
      c.textAlign = 'center'; c.fillStyle = '#f8d040'; c.fillText(`${wins}`, W / 2, 10);
      if (msg) { c.fillStyle = '#000a'; c.fillRect(0, H * .4 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f8f8f0'; c.fillText(msg.txt, W / 2, H * .4); }
      if (t < 9 && !msg) { c.fillStyle = '#000a'; c.fillRect(0, H - 20, W, 18); c.fillStyle = '#f8f8f0'; c.fillText('TAP JAB · SWIPE FWD HEAVY', W / 2, H - 12); c.fillText('DOWN SWEEP · UP HOP · HOLD GUARD', W / 2, H - 4); }
    },
    down(x, y) { sw = { x, y, t: performance.now(), used: false }; },
    move(x, y, p) {
      if (!p || !sw || sw.used || dead) return; const dx = x - sw.x, dy = y - sw.y; if (Math.hypot(dx, dy) < 16) return; sw.used = true; you.guard = false;
      if (Math.abs(dx) > Math.abs(dy)) { if (Math.sign(dx) === you.dir) self.cmd('heavy'); else self.cmd('back'); } else self.cmd(dy > 0 ? 'sweep' : 'hop');
    },
    up() { if (sw && !sw.used && performance.now() - sw.t < 160) self.cmd('jab'); you.guard = false; you.walk = 0; sw = null; },
    cmd(c2) {
      if (dead || ko || between > 0) return;
      if (c2 === 'hop') { if (you.st === 'idle' && you.air === 0 && !you.down) { you.air = .01; sfx(500, .05, 'square', .03, 200); } return; }
      if (c2 === 'back') { if (you.st === 'idle') { you.x -= you.dir * 20; sfx(300, .04, 'square', .02); } return; }
      if (act(you, c2)) haptic('tick');
    },
    key(k, d) { if (k === 'ArrowDown' && d) self.cmd('sweep'); if (k === 'ArrowUp' && d) self.cmd('hop'); if (k === 'x' && d) self.cmd('heavy'); if (k === 'z' && d) self.cmd('jab'); if (k === 'c') you.guard = d; if (k === 'ArrowRight') you.walk = d ? 1 : 0; if (k === 'ArrowLeft') you.walk = d ? -1 : 0; },
  };
  return self;
}

export default {
  id: 'swipe-fighter', title: 'Swipe Fighter', tag: 'Advance · Fighting', retro: true, era: 'advance', pal: 'berry', w: 192, h: 160, maxW: 300, maxH: 240, goal: 5,
  hint: 'Tap to jab, swipe toward your rival for a heavy blow, swipe down to sweep, swipe up to hop, swipe away to step back, and hold still to guard. Guard stops jabs and heavies but not sweeps, so hop those. Red flash means guard, blue means hop. Hit a rival while they wind up for a double-damage counter.',
  make,
};
