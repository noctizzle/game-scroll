import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { backdrop, box, ball, shadow, glow } from '../kit/gfx.js';

// A two-minute halfpipe session. The skater rolls back and forth on their own: tap as they cross
// the flat bottom (in the green zone) to pump and fly higher. In the air, swipe to throw tricks:
// up spins, down flips, left and right grab. Each trick takes time, so finish before you land or
// you bail. Land clean to bank the points; every extra trick in one air raises the multiplier.
const G = 300;
const TRICKS = { up: { n: 'SPIN 360', d: .42, p: 120 }, down: { n: 'KICKFLIP', d: .32, p: 80 }, left: { n: 'TAIL GRAB', d: .26, p: 60 }, right: { n: 'NOSE GRAB', d: .26, p: 60 } };
let W = 192, H = 160;

function make(api) {
  let side, phase, k, e, air, h, trick, combo, mult, score, time, t, parts, msg, dead, pumped, sw, last, bail, lastAirTricks;
  const lip = () => H * .42, bottom = () => H - 14, rampW = () => W * .26;
  function ridePos(u) {
    // u from 0 (top of the wall we came from) to 1 (top of the other wall)
    const L = 10, R = W - 10, rw = rampW(), from = side < 0 ? L : R, to = side < 0 ? R : L;
    const x = from + (to - from) * u, d = Math.min(x - L, R - x), y = d < rw ? bottom() - (bottom() - lip()) * Math.pow(1 - d / rw, 2) : bottom();
    return { x, y, a: d < rw ? Math.sign(to - from) * (x < W / 2 ? -1 : 1) * (1 - d / rw) * 1.2 * Math.sign(to - from) : 0 };
  }
  function bank() {
    if (combo > 0) { const pts = combo * mult; score += pts; api.score(score); parts.push({ txt: mult > 1 ? `${combo} x${mult} = ${pts}` : `+${pts}`, x: W / 2, y: H * .3, l: 1.4, col: mult > 2 ? '#80f8ff' : '#f8e040' }); if (mult > 2) haptic('success'); }
    combo = 0; mult = 0;
  }
  const self = {
    reset() { side = -1; phase = 'ride'; k = 0; e = 30; air = 0; h = 0; trick = null; combo = 0; mult = 0; score = 0; time = 90; t = 0; parts = []; msg = { txt: 'TAP IN THE GREEN TO PUMP', l: 2.4 }; dead = 0; pumped = false; sw = null; bail = 0; lastAirTricks = 0; },
    resize(w, h2) { W = w; H = h2; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; p.y -= 12 * dt; } parts = parts.filter(p => p.l > 0); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      time -= dt; if (time <= 0) { time = 0; if (phase !== 'air') { bank(); dead = .01; msg = { txt: 'SESSION OVER', l: 9 }; sfx(660, .4, 'square', .05, -200); return; } }
      if (bail > 0) { bail -= dt; return; }
      if (phase === 'ride') {
        k += dt / 1.15; if (k >= 1) { k = 1; side = -side; if (e > 4) { phase = 'air'; air = 0; h = e; lastAirTricks = 0; sfx(300, .05, 'square', .03, 200); } else { k = 0; e = Math.max(e, 0); } if (phase !== 'air') { k = 0; } }
        if (!pumped && k > .58 && k < .6) { /* missed pump window */ }
      } else if (phase === 'air') {
        const dur = 2 * Math.sqrt(2 * h / G); air += dt;
        if (trick) { trick.t += dt; if (trick.t >= trick.d) { combo += trick.p; mult++; lastAirTricks++; parts.push({ txt: trick.n, x: W / 2, y: H * .2, l: .8, col: '#f8f8f0' }); sfx(800 + mult * 60, .06, 'square', .04, 300); haptic('light'); trick = null; } }
        if (air >= dur) {
          if (trick) { bail = 1.2; time -= 2; combo = 0; mult = 0; trick = null; msg = { txt: 'BAIL! -2s', l: 1 }; haptic('heavy'); sfx(120, .4, 'sawtooth', .05, -60); e = Math.max(10, e * .5); }
          else { haptic('medium'); sfx(150, .08, 'square', .05); bank(); }
          phase = 'ride'; k = 0; pumped = false; e -= 3; if (time <= 0) { dead = .01; msg = { txt: 'SESSION OVER', l: 9 }; }
        }
      }
    },
    draw(c) {
      backdrop(c, 0, 0, W, H, '#1a2a48', '#3a5a88');
      for (let i = 0; i < 8; i++) box(c, i * W / 8 + 4, H * .1, W / 8 - 8, H * .25, '#304a70', { r: 2, drop: false });
      for (let i = 0; i < 8; i++) glow(c, i * W / 8 + W / 16, H * .1, 16, '#f8d060', .35);
      // ramp
      { const g = c.createLinearGradient(0, lip(), 0, H); g.addColorStop(0, '#d8c8a8'); g.addColorStop(1, '#887858'); c.fillStyle = g; } c.beginPath(); c.moveTo(0, H); c.lineTo(0, lip()); c.lineTo(10, lip());
      const rw = rampW(); for (let i = 0; i <= 20; i++) { const d = i / 20 * rw; c.lineTo(10 + d, bottom() - (bottom() - lip()) * Math.pow(1 - d / rw, 2)); }
      for (let i = 0; i <= 20; i++) { const d = (1 - i / 20) * rw; c.lineTo(W - 10 - d, bottom() - (bottom() - lip()) * Math.pow(1 - d / rw, 2)); }
      c.lineTo(W, lip()); c.lineTo(W, H); c.fill();
      c.fillStyle = '#d0c0a0'; c.fillRect(0, lip() - 2, 12, 3); c.fillRect(W - 12, lip() - 2, 12, 3);
      c.fillStyle = '#a0a0a8'; c.fillRect(8, lip() - 3, 4, 2); c.fillRect(W - 12, lip() - 3, 4, 2);
      // pump zone on the flat
      const pz = phase === 'ride' && k > .35 && k < .65;
      c.fillStyle = pz ? '#60e070' : '#60e07050'; c.fillRect(W * .37, bottom() + 2, W * .26, 3);
      // skater
      let x, y, a = 0;
      if (phase === 'ride') { const p = ridePos(k); x = p.x; y = p.y; a = 0; }
      else { const dur = 2 * Math.sqrt(2 * h / G), up = G * dur / 2, z = up * air - G * air * air / 2; x = side > 0 ? W - 14 : 14; y = lip() - z; if (trick && trick.k === 'up') a = trick.t / trick.d * Math.PI * 2; }
      shadow(c, x, bottom() + 1, 9 * clamp(1 - (bottom() - y) / 120, .3, 1), 2.5, .4);
      if (bail > 0) { c.fillStyle = '#e04848'; c.fillRect(W / 2 - 8, bottom() - 4, 16, 4); c.fillStyle = '#f8c890'; c.fillRect(W / 2 + 8, bottom() - 5, 4, 4); }
      else {
        c.save(); c.translate(x, y); c.rotate(a);
        const flip = trick && trick.k === 'down' ? trick.t / trick.d : 0, grab = trick && (trick.k === 'left' || trick.k === 'right');
        c.fillStyle = '#303030'; c.fillRect(-7, -2, 14, 2); c.fillStyle = '#f8f040'; c.fillRect(-7 + 14 * flip * 0, -2 - Math.abs(Math.sin(flip * Math.PI)) * 4, 14, 1);
        c.fillStyle = '#2050a0'; c.fillRect(-3, grab ? -7 : -9, 2, grab ? 5 : 7); c.fillRect(1, grab ? -7 : -9, 2, grab ? 5 : 7);
        box(c, -4, grab ? -14 : -16, 8, 7, '#e04848', { r: 2, drop: false });
        ball(c, 0, grab ? -17 : -19, 3.4, '#f8c890', { gloss: .4 }); c.fillStyle = '#f8e040'; c.beginPath(); c.arc(0, grab ? -18 : -20, 3.5, Math.PI, 0); c.fill();
        if (grab) { c.fillStyle = '#f8c890'; c.fillRect(trick.k === 'left' ? -7 : 5, -4, 2, 3); }
        c.restore();
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { c.fillStyle = '#101820'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); }
      c.fillStyle = '#10182080'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 9);
      c.textAlign = 'right'; c.fillStyle = '#f8e040'; c.fillText(combo ? `${combo} x${mult}` : '', W - 4, 9);
      // air meter
      c.fillStyle = '#ffffff30'; c.fillRect(W / 2 - 20, 4, 40, 3); c.fillStyle = '#80f8ff'; c.fillRect(W / 2 - 20, 4, 40 * clamp(e / 70, 0, 1), 3);
      if (msg) { c.fillStyle = '#000a'; c.fillRect(0, H * .5 - 9, W, 13); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, H * .5); }
      if (t < 8 && !msg) { c.textAlign = 'center'; c.fillStyle = '#f8f8f0'; c.fillText('SWIPE IN THE AIR', W / 2, H * .5); }
    },
    down(x, y) { sw = { x, y, used: false }; },
    move(x, y, p) { if (!p || !sw || sw.used) return; const dx = x - sw.x, dy = y - sw.y; if (Math.hypot(dx, dy) < 16) return; sw.used = true; self.trick(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')); },
    up() { if (sw && !sw.used) self.pump(); sw = null; },
    pump() {
      if (dead || bail > 0 || phase !== 'ride' || pumped) return; pumped = true;
      if (k > .35 && k < .65) { const good = Math.abs(k - .5) < .06; e = Math.min(80, e + (good ? 14 : 9)); parts.push({ txt: good ? 'BIG PUMP' : 'PUMP', x: W / 2, y: bottom() - 20, l: .6, col: '#60e070' }); sfx(good ? 520 : 420, .06, 'square', .04, 200); haptic(good ? 'medium' : 'light'); }
      else { e = Math.max(0, e - 4); sfx(160, .05, 'square', .03); }
    },
    trick(dir) { if (dead || phase !== 'air' || trick || bail > 0) return; trick = { ...TRICKS[dir], k: dir, t: 0 }; sfx(600, .04, 'square', .03, 200); },
    key(kk, d) { if (!d) return; const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[kk]; if (m) self.trick(m); if (kk === ' ') self.pump(); },
  };
  return self;
}

export default {
  id: 'ramp-combo', title: 'Ramp Combo', tag: 'Console · Sports', retro: true, era: 'console', pal: 'teal', w: 192, h: 160, maxW: 300, maxH: 240, goal: 12000,
  hint: 'The skater rolls on their own. Tap when they cross the green zone at the bottom to pump higher. In the air, swipe up (spin), down (kickflip), left or right (grabs). Tricks take time, so don\'t start one too late or you bail. Land clean to bank points: the more tricks in one air, the bigger the multiplier.',
  make,
};
