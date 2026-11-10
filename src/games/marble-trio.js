// Marble Trio: three marbles roll round a wooden tray with three holes. Tilt the phone to roll them all
// at once, and drop each marble into the hole of its own colour; a wrong hole spits it back out. Roll
// slowly over a hole to drop in. No tilt? Hold and drag to tip the tray.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic, tilt, want } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 360, H = 640;
const COLS = ['#e63946', '#2a9d8f', '#f4a261'];

function make(api) {
  const feel = new Feel();
  let marbles, holes, pegs, score, trays, time, tmax, t, drag, tx, ty, banner, ended;
  want('motion');
  const TR = () => ({ x: 20, y: 90, w: W - 40, h: H - 180 });

  function newTray() {
    trays++;
    const tr = TR(), place = r => { for (let k = 0; k < 60; k++) { const p = { x: rnd(tr.x + r + 20, tr.x + tr.w - r - 20), y: rnd(tr.y + r + 20, tr.y + tr.h - r - 20) }; if ([...holes, ...marbles, ...pegs].every(o => Math.hypot(o.x - p.x, o.y - p.y) > 70)) return p; } return { x: tr.x + tr.w / 2, y: tr.y + tr.h / 2 }; };
    holes = []; marbles = []; pegs = [];
    for (let i = 0; i < 3; i++) holes.push({ ...place(18), col: i, full: false });
    for (let i = 0; i < Math.min(6, trays - 1); i++) pegs.push({ ...place(14), r: 12 });
    for (let i = 0; i < 3; i++) marbles.push({ ...place(13), vx: 0, vy: 0, col: i, in: false, fall: 0 });
    tmax = time = 35;
  }

  return {
    reset() { score = 0; trays = 0; t = 0; drag = null; tx = 0; ty = 0; banner = null; ended = false; holes = []; marbles = []; pegs = []; newTray(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newTray(); } return; }
      time -= dt;
      if (time <= 0 && !ended) { ended = true; feel.lose(); banner = { txt: 'Time up', l: 1.2, over: true }; return; }
      // tilt from the phone, or from your finger
      let gx = 0, gy = 0;
      if (drag) { gx = clamp((drag.x - drag.x0) / 80, -1, 1); gy = clamp((drag.y - drag.y0) / 80, -1, 1); }
      else { const tl = tilt(); if (tl) { gx = clamp(tl.x * 1.5, -1, 1); gy = clamp(tl.y * 1.5, -1, 1); } else { gx = tx; gy = ty; } }
      const tr = TR();
      for (const m of marbles) {
        if (m.in) { m.fall = Math.min(1, m.fall + dt * 4); continue; }
        m.vx += gx * 520 * dt; m.vy += gy * 520 * dt; m.vx *= Math.pow(.5, dt); m.vy *= Math.pow(.5, dt);
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.x < tr.x + 13) { m.x = tr.x + 13; m.vx = Math.abs(m.vx) * .5; } if (m.x > tr.x + tr.w - 13) { m.x = tr.x + tr.w - 13; m.vx = -Math.abs(m.vx) * .5; }
        if (m.y < tr.y + 13) { m.y = tr.y + 13; m.vy = Math.abs(m.vy) * .5; } if (m.y > tr.y + tr.h - 13) { m.y = tr.y + tr.h - 13; m.vy = -Math.abs(m.vy) * .5; }
        for (const p of pegs) { const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy), md = 13 + p.r; if (d < md && d > 0) { const nx = dx / d, ny = dy / d, vn = m.vx * nx + m.vy * ny; m.x = p.x + nx * md; m.y = p.y + ny * md; if (vn < 0) { m.vx -= 1.6 * vn * nx; m.vy -= 1.6 * vn * ny; if (-vn > 80) sfx(900, .02, 'square', .02); } } }
        for (const h of holes) {
          if (h.full) continue;
          const d = Math.hypot(m.x - h.x, m.y - h.y), sp = Math.hypot(m.vx, m.vy);
          if (d < 10 && sp < 170) {
            if (h.col === m.col) { m.in = true; m.x = h.x; m.y = h.y; h.full = true; notes(['C5', 'E5', 'G5'][marbles.filter(q => q.in).length - 1], { len: .08 }); haptic('medium'); feel.coin(h.x, h.y); }
            else { const a = Math.atan2(m.y - h.y, m.x - h.x) || 1; m.vx = Math.cos(a) * 260; m.vy = Math.sin(a) * 260; sfx(220, .08, 'square', .03); haptic('warning'); }
          } else if (d < 18) { m.vx += (h.x - m.x) * 3 * dt; m.vy += (h.y - m.y) * 3 * dt; }
        }
      }
      // marbles knock each other
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const a = marbles[i], b = marbles[j]; if (a.in || b.in) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < 26 && d > 0) { const nx = dx / d, ny = dy / d, o = (26 - d) / 2; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o; const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; if (rv < 0) { a.vx += rv * nx; a.vy += rv * ny; b.vx -= rv * nx; b.vy -= rv * ny; if (-rv > 60) { sfx(1400, .02, 'square', .02); haptic('tick'); } } }
      }
      if (marbles.every(m => m.in)) { const pts = 3 + Math.floor(time / 7); score += pts; api.score(score); feel.win(W / 2, H / 2); haptic('success'); banner = { txt: `Tray done! +${pts}`, l: 1.2 }; }
    },
    draw(c) {
      c.fillStyle = '#3e2723'; c.fillRect(0, 0, W, H);
      const tr = TR();
      c.fillStyle = '#5d4037'; c.beginPath(); c.roundRect(tr.x - 10, tr.y - 10, tr.w + 20, tr.h + 20, 18); c.fill();
      c.fillStyle = '#d7a86e'; c.beginPath(); c.roundRect(tr.x, tr.y, tr.w, tr.h, 10); c.fill();
      c.strokeStyle = '#c4935a'; c.lineWidth = 2; for (let y = tr.y + 20; y < tr.y + tr.h; y += 26) { c.beginPath(); c.moveTo(tr.x, y); c.bezierCurveTo(tr.x + tr.w * .3, y + 6, tr.x + tr.w * .6, y - 6, tr.x + tr.w, y + 3); c.stroke(); }
      for (const h of holes) { c.fillStyle = '#2b1d14'; c.beginPath(); c.arc(h.x, h.y, 17, 0, 7); c.fill(); c.strokeStyle = COLS[h.col]; c.lineWidth = 4; c.beginPath(); c.arc(h.x, h.y, 20, 0, 7); c.stroke(); }
      for (const p of pegs) { c.fillStyle = '#6d4c41'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); c.fillStyle = '#8d6e63'; c.beginPath(); c.arc(p.x - 3, p.y - 3, p.r * .5, 0, 7); c.fill(); }
      feel.begin(c);
      for (const m of marbles) {
        const r = 13 * (1 - m.fall * .35);
        if (!m.in) { c.fillStyle = '#00000040'; c.beginPath(); c.arc(m.x + 3, m.y + 4, r, 0, 7); c.fill(); }
        c.fillStyle = COLS[m.col]; c.beginPath(); c.arc(m.x, m.y, r, 0, 7); c.fill();
        c.fillStyle = '#ffffffa0'; c.beginPath(); c.arc(m.x - r * .35, m.y - r * .35, r * .3, 0, 7); c.fill();
      }
      feel.end(c, W, H);
      c.fillStyle = '#00000050'; c.fillRect(20, 54, W - 40, 10); c.fillStyle = time / tmax < .25 ? '#e63946' : '#ffd166'; c.fillRect(20, 54, (W - 40) * Math.max(0, time / tmax), 10);
      c.textAlign = 'center'; c.fillStyle = '#ffffffc0'; c.font = '600 14px Rubik, sans-serif';
      c.fillText(drag ? 'tipping the tray' : `tray ${trays}`, W / 2, H - 50);
      if (trays === 1 && t < 5) c.fillText('Tilt, or hold and drag, to roll', W / 2, H - 28);
      if (drag) { c.strokeStyle = '#ffffff60'; c.lineWidth = 3; c.beginPath(); c.moveTo(drag.x0, drag.y0); c.lineTo(drag.x, drag.y); c.stroke(); }
      if (banner) { c.fillStyle = '#000000b0'; c.fillRect(0, H * .45 - 34, W, 64); c.fillStyle = '#fff'; c.font = '800 24px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .45 + 6); }
    },
    down(x, y) { drag = { x0: x, y0: y, x, y }; },
    move(x, y, pr) { if (drag && pr) { drag.x = x; drag.y = y; } },
    up() { drag = null; },
    key(k, d) { const v = d ? .8 : 0; if (k === 'ArrowLeft') tx = -v; if (k === 'ArrowRight') tx = v; if (k === 'ArrowUp') ty = -v; if (k === 'ArrowDown') ty = v; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'marble-trio',
  title: 'Marble Trio',
  tag: 'Casual · Tilt',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 25,
  hint: 'Tilt the phone (or hold and drag) to roll all three marbles at once. Drop each slowly into the hole of its colour before time runs out.',
  make,
};
