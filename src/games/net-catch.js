import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Cheeky imps have escaped into the park. Hold to walk toward your finger, tap to swing your net
// toward the spot you tapped. Imps doze, wander and peek around; get too close or too loud and
// they bolt, but they tire quickly. Creep up from behind for an easy catch. Catch every imp in
// the park before the clock runs out to move on.
let W = 176, H = 176;
const NET = 20, ARC = 1.05;

function make(api) {
  let pl, imps, rocks, stage, caught, time, t, hold, swing, parts, msg, dead, tapStart;
  function place(r) { for (let i = 0; i < 40; i++) { const x = rnd(14, W - 14), y = rnd(24, H - 14); if (Math.hypot(x - pl.x, y - pl.y) > 50 && !rocks.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 4)) return { x, y }; } return { x: rnd(14, W - 14), y: rnd(24, H - 14) }; }
  function build() {
    pl = { x: W / 2, y: H - 20, a: -Math.PI / 2 }; rocks = [];
    const nr = 3 + Math.min(4, stage); for (let i = 0; i < nr; i++) { const r = rnd(7, 12), p = place(r); rocks.push({ ...p, r, bush: Math.random() < .6 }); }
    imps = []; const n = 3 + Math.min(5, stage);
    for (let i = 0; i < n; i++) { const p = place(5), fast = stage > 1 && Math.random() < .25 + stage * .06; imps.push({ ...p, a: rnd(0, 6.28), st: Math.random() < .4 ? 'doze' : 'wander', tt: rnd(1, 3), sp: (fast ? 1.3 : 1) + Math.min(.4, stage * .04), stam: 1, fast, look: rnd(0, 6.28), alert: 0, gone: 0 }); }
    time = Math.max(time || 0, 0) + 18 + n * 2; msg = { txt: `PARK ${stage}: ${n} IMPS`, l: 1.6 };
  }
  function collide(o, r) { for (const k of rocks) { const dx = o.x - k.x, dy = o.y - k.y, d = Math.hypot(dx, dy), m = k.r + r; if (d < m && d > 0) { o.x = k.x + dx / d * m; o.y = k.y + dy / d * m; } } o.x = clamp(o.x, 6, W - 6); o.y = clamp(o.y, 18, H - 6); }
  function burst(x, y, col) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-60, 20), l: .5, col }); }
  const self = {
    reset() { stage = 1; caught = 0; time = 0; t = 0; hold = null; swing = 0; parts = []; dead = 0; build(); },
    resize(w, h) { const sx = w / W, sy = h / H; W = w; H = h; if (pl) { for (const o of [pl, ...imps, ...rocks]) { o.x *= sx; o.y *= sy; } } },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      time -= dt; if (time <= 0) { time = 0; dead = .01; haptic('error'); sfx(140, .5, 'square', .05, -60); msg = { txt: 'TIME UP!', l: 9 }; return; }
      swing = Math.max(0, swing - dt);
      let moving = false;
      if (hold && hold.walk) { const dx = hold.x - pl.x, dy = hold.y - pl.y, d = Math.hypot(dx, dy); if (d > 3) { const sp = 62; pl.x += dx / d * Math.min(d, sp * dt); pl.y += dy / d * Math.min(d, sp * dt); pl.a = Math.atan2(dy, dx); moving = true; } }
      collide(pl, 5);
      for (const m of imps) {
        if (m.gone) { m.gone += dt; continue; }
        m.tt -= dt; const dx = m.x - pl.x, dy = m.y - pl.y, d = Math.hypot(dx, dy);
        // imps notice you if you're close, and from further if you're in front of them and moving
        const facing = Math.cos(Math.atan2(-dy, -dx) - m.look) > .4, hide = rocks.some(k => k.bush && Math.hypot(k.x - pl.x, k.y - pl.y) < k.r + 2);
        const range = (m.st === 'doze' ? 14 : 22) + (moving ? 10 : 0) + (facing ? 24 : 0) - (hide ? 14 : 0);
        if (d < range && m.st !== 'flee' && m.st !== 'tired') { m.alert += dt * (m.st === 'doze' ? 2 : 5); if (m.alert > 1) { m.st = 'flee'; m.tt = 1.7 + stage * .12; m.alert = 0; sfx(900, .08, 'square', .03, 400); parts.push({ txt: '!', x: m.x, y: m.y - 10, l: .6, col: '#f8f040' }); } }
        else m.alert = Math.max(0, m.alert - dt);
        let sp = 0;
        if (m.st === 'wander') { sp = 16; if (m.tt <= 0) { m.a = rnd(0, 6.28); m.tt = rnd(1, 3); if (Math.random() < .3) { m.st = 'doze'; m.tt = rnd(2, 4); } } m.look = m.a + Math.sin(t * 2 + m.x) * .8; }
        else if (m.st === 'doze') { m.look += dt * .3; if (m.tt <= 0) { m.st = 'wander'; m.tt = rnd(1, 3); } }
        else if (m.st === 'flee') { m.a = Math.atan2(dy, dx) + Math.sin(t * 5 + m.y) * .5; m.look = m.a + Math.PI; sp = 86 * m.sp; if (m.x < 14 || m.x > W - 14) m.a = Math.PI - m.a; if (m.tt <= 0) { m.st = 'tired'; m.tt = Math.max(.45, 1 - stage * .07); } }
        else if (m.st === 'tired') { m.look = Math.atan2(-dy, -dx); if (m.tt <= 0) { m.st = d < 40 ? 'flee' : 'wander'; m.tt = m.st === 'flee' ? 1.1 : 2; } }
        m.x += Math.cos(m.a) * sp * dt; m.y += Math.sin(m.a) * sp * dt;
        const ox = m.x, oy = m.y; collide(m, 5); if (Math.abs(ox - m.x) + Math.abs(oy - m.y) > .01 || m.x <= 6.5 || m.x >= W - 6.5 || m.y <= 18.5 || m.y >= H - 6.5) m.a += rnd(1.5, 3);
      }
      imps = imps.filter(m => m.gone < .5);
      if (!imps.length) { stage++; haptic('success'); sfx(880, .4, 'square', .05, 500); time += 3; build(); }
    },
    draw(c) {
      c.fillStyle = '#58b848'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#68c858'; for (let i = 0; i < 40; i++) c.fillRect((i * 53) % W, (i * 37) % H, 2, 3);
      c.fillStyle = '#c8b070'; c.beginPath(); c.ellipse(W / 2, H - 14, W * .35, 10, 0, 0, 7); c.fill();
      for (const k of rocks) { if (k.bush) { c.fillStyle = '#287828'; c.beginPath(); c.arc(k.x, k.y, k.r, 0, 7); c.fill(); c.fillStyle = '#389838'; c.beginPath(); c.arc(k.x - k.r * .3, k.y - k.r * .3, k.r * .55, 0, 7); c.fill(); } else { c.fillStyle = '#808890'; c.beginPath(); c.arc(k.x, k.y, k.r, 0, 7); c.fill(); c.fillStyle = '#a8b0b8'; c.fillRect(k.x - k.r * .5, k.y - k.r * .5, k.r * .5, 2); } }
      for (const m of imps) {
        const x = Math.round(m.x), y = Math.round(m.y), s = m.gone ? 1 - m.gone * 2 : 1;
        if (m.st !== 'doze' && !m.gone) { c.fillStyle = '#ffffff20'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, 22 + 24, m.look - .9, m.look + .9); c.fill(); }
        c.fillStyle = m.fast ? '#e05050' : '#a860d8'; c.beginPath(); c.arc(x, y, 5 * s, 0, 7); c.fill();
        c.fillRect(x - 5 * s, y - 6 * s, 2, 3); c.fillRect(x + 3 * s, y - 6 * s, 2, 3);
        c.fillStyle = '#f8f8f0'; if (m.st === 'doze') { c.fillRect(x - 3, y - 1, 2, 1); c.fillRect(x + 1, y - 1, 2, 1); c.fillStyle = '#ffffff'; c.font = '6px "Press Start 2P", monospace'; c.fillText('z', x + 5, y - 6 - (t * 4 % 4)); }
        else { const ex = Math.cos(m.look), ey = Math.sin(m.look); c.fillRect(x - 3 + ex, y - 2 + ey, 2, 2); c.fillRect(x + 1 + ex, y - 2 + ey, 2, 2); }
        if (m.st === 'tired') { c.fillStyle = '#80c8ff'; c.fillRect(x + 5, y - 7 + (t * 8 | 0) % 3, 1, 2); }
        if (m.alert > 0) { c.fillStyle = '#f8f040'; c.fillRect(x - 4, y - 10, 8 * m.alert, 1); }
      }
      // keeper and net
      const x = Math.round(pl.x), y = Math.round(pl.y);
      c.fillStyle = '#20384c'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = '#f8c890'; c.beginPath(); c.arc(x, y - 1, 4, 0, 7); c.fill(); c.fillStyle = '#e8a020'; c.fillRect(x - 4, y - 5, 8, 2);
      const na = swing > 0 ? pl.a - ARC + (1 - swing / .22) * ARC * 2 : pl.a + .7, nx = x + Math.cos(na) * (swing > 0 ? NET - 4 : 9), ny = y + Math.sin(na) * (swing > 0 ? NET - 4 : 9);
      c.strokeStyle = '#a07040'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      c.strokeStyle = '#f8f8f0'; c.lineWidth = 1; c.beginPath(); c.arc(nx + Math.cos(na) * 4, ny + Math.sin(na) * 4, 4, 0, 7); c.stroke();
      if (swing > 0) { c.fillStyle = '#ffffff30'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, NET, pl.a - ARC, pl.a + ARC); c.fill(); }
      if (hold && hold.walk) { c.strokeStyle = '#ffffff60'; c.strokeRect(hold.x - 3, hold.y - 3, 6, 6); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#203020'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.fillStyle = '#183018c0'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 9);
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(`LEFT ${imps.filter(m => !m.gone).length}`, W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#183018c0'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = '#f8f040'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 6 && !msg) { c.textAlign = 'center'; c.fillStyle = '#183018a0'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#f8f8f0'; c.fillText('HOLD TO WALK', W / 2, H - 14); c.fillText('TAP TO SWING NET', W / 2, H - 5); }
    },
    down(x, y) { tapStart = { x, y, t: performance.now() }; hold = { x, y, walk: false }; setTimeout(() => { if (hold && !hold.done) hold.walk = true; }, 140); },
    move(x, y, p) { if (!p || !hold) return; hold.x = x; hold.y = y; if (Math.hypot(x - tapStart.x, y - tapStart.y) > 8) hold.walk = true; },
    up(x, y) {
      const quick = tapStart && performance.now() - tapStart.t < 220 && !(hold && hold.walk && Math.hypot((x ?? tapStart.x) - tapStart.x, (y ?? tapStart.y) - tapStart.y) > 8);
      if (hold) hold.done = true; hold = null;
      if (quick && !dead && swing <= 0) {
        pl.a = Math.atan2(tapStart.y - pl.y, tapStart.x - pl.x); swing = .22; sfx(300, .08, 'triangle', .05, 300); haptic('light');
        let got = 0;
        for (const m of imps) { if (m.gone) continue; const dx = m.x - pl.x, dy = m.y - pl.y, d = Math.hypot(dx, dy), da = Math.abs(((Math.atan2(dy, dx) - pl.a + 9.42) % 6.283) - 3.14); if (d < NET + 4 && da < ARC + .2) { m.gone = .01; got++; caught++; burst(m.x, m.y, '#f8f040'); parts.push({ txt: m.st === 'doze' ? 'SNOOZER!' : 'GOTCHA!', x: m.x, y: m.y - 12, l: .9, col: '#f8f8f0' }); time += m.fast ? 3 : 2; } }
        if (got) { api.score(caught); haptic('success'); sfx(1000, .15, 'square', .05, 400); }
      }
    },
    key(k, d) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (step) { if (d) { hold = { x: pl.x + step[0] * 400, y: pl.y + step[1] * 400, walk: true }; pl.a = Math.atan2(step[1], step[0]); } else hold = null; }
      if (k === ' ' && d) { tapStart = { x: pl.x + Math.cos(pl.a) * 10, y: pl.y + Math.sin(pl.a) * 10, t: performance.now() }; hold = null; self.up(); }
    },
  };
  return self;
}

export default {
  id: 'net-catch', title: 'Net Catch', tag: 'Advance · Action', retro: true, era: 'advance', pal: 'teal', w: 176, h: 176, maxW: 260, maxH: 300, goal: 25,
  hint: 'Hold to walk toward your finger, tap to swing your net that way. Imps see in front of them (the pale cone) and bolt when they notice you, but they tire fast. Sneak up from behind, hide in bushes, and catch dozing imps for an easy grab. Every catch adds time.',
  make,
};
