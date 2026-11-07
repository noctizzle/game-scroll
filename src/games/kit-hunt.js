import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { backdrop, box, shadow, glow } from '../kit/gfx.js';
import { brick, stud, BRICK_KEYS } from '../kit/bricks.js';

// Five kit pieces are hidden inside the brick furniture in this room. Hold and drag your finger
// around to use the detector: the meter climbs, it beeps faster and your phone buzzes harder as
// you get close. Tap an object to smash it open. You only have so many hammer swings, so use the
// detector first. The detector battery is short, so sweep smartly. Find enough pieces to unlock the next room.
let W = 176, H = 192;

function make(api) {
  let objs, swings, found, battery, need, room, total, score, t, probe, parts, msg, dead, end, tapStart, pulseT;
  const top = 26;
  function build() {
    objs = []; const cols = 5, rows = 5 + (H > 230 ? 1 : 0), cw = (W - 12) / cols, rh = (H - top - 8) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (Math.random() < .15) continue; const w = rnd(cw * .55, cw * .85), h = rnd(rh * .5, rh * .8); objs.push({ x: 6 + c * cw + (cw - w) / 2 + rnd(-3, 3), y: top + r * rh + (rh - h), w, h, col: BRICK_KEYS[Math.random() * BRICK_KEYS.length | 0], piece: false, open: 0 }); }
    const idx = objs.map((_, i) => i).sort(() => Math.random() - .5).slice(0, 5); for (const i of idx) objs[i].piece = true;
    swings = Math.max(6, 10 - Math.floor(room / 2)); battery = Math.max(3.5, 7.5 - room * .4); need = room > 4 ? 4 : 3; found = 0; end = 0; msg = { txt: `ROOM ${room}: FIND ${need} OF 5`, l: 1.6 };
  }
  function nearest(x, y) { let d = 1e9; for (const o of objs) if (o.piece && !o.open) d = Math.min(d, Math.hypot(o.x + o.w / 2 - x, o.y + o.h / 2 - y)); return d; }
  function burst(x, y, col) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-80, 10), l: .5, col }); }
  function finish() {
    end = .01;
    if (found >= need) { score += found * 10 + swings * 3; api.score(score); msg = { txt: found === 5 ? 'FULL KIT! BONUS' : `${found}/5 FOUND`, l: 1.6 }; if (found === 5) { score += 20; api.score(score); } haptic('success'); sfx(880, .4, 'square', .05, 500); }
    else { msg = { txt: `ONLY ${found}/5...`, l: 9 }; dead = .01; haptic('error'); sfx(140, .5, 'square', .05, -60); }
  }
  const self = {
    reset() { room = 1; score = 0; t = 0; probe = null; parts = []; dead = 0; pulseT = 0; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (objs) build(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      for (const o of objs) if (o.open) o.open += dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.8) api.over(); return; }
      if (end) { end += dt; if (end > 1.8) { room++; build(); } return; }
      if (probe && probe.on && battery > 0) {
        battery = Math.max(0, battery - dt); const d = nearest(probe.x, probe.y), k = d < 22 ? 1 : d < 40 ? .66 : d < 70 ? .33 : .05; probe.k = k;
        pulseT -= dt; if (pulseT <= 0) { pulseT = .55 - k * .47; sfx(400 + k * 900, .03, 'square', .03); haptic(k > .8 ? 'heavy' : k > .5 ? 'medium' : k > .25 ? 'light' : 'tick'); }
      }
    },
    draw(c) {
      backdrop(c, 0, 0, W, H, '#e0c8a0', '#a88860');
      for (let y = top; y < H; y += 8) { c.fillStyle = (y / 8) % 2 ? '#0000000c' : '#ffffff0c'; c.fillRect(0, y, W, 8); c.fillStyle = '#00000018'; c.fillRect(0, y + 7, W, 1); }
      box(c, 0, top - 5, W, 5, '#8c6c48', { r: 0, drop: false });
      for (const o of objs) if (!o.open) shadow(c, o.x + o.w / 2, o.y + o.h, o.w * .6, 3, .3);
      for (const o of objs) {
        if (o.open) { const k = Math.min(1, o.open * 3); for (let i = 0; i < 3; i++) brick(c, o.x + i * o.w / 3 + (i - 1) * k * 6, o.y + o.h - 4 + k * 2, o.w / 3, 4, o.col, 4); if (o.piece) { const py = o.y + o.h / 2 - Math.min(10, o.open * 30); glow(c, o.x + o.w / 2, py, 14, '#f8e040', .5); c.fillStyle = '#f8e040'; c.beginPath(); c.moveTo(o.x + o.w / 2, py - 6); c.lineTo(o.x + o.w / 2 + 5, py); c.lineTo(o.x + o.w / 2, py + 6); c.lineTo(o.x + o.w / 2 - 5, py); c.fill(); c.fillStyle = '#fff8c0'; c.fillRect(o.x + o.w / 2 - 1, py - 3, 2, 2); } continue; }
        const n = Math.max(1, Math.round(o.h / 7)), bh = o.h / n; for (let i = 0; i < n; i++) brick(c, o.x + (i % 2) * 1, o.y + i * bh, o.w - (i % 2) * 2, bh, o.col, 5);
      }
      if (probe && probe.on && battery > 0) { const k = probe.k || 0, r = 10 + Math.sin(t * (6 + k * 20)) * 2; c.strokeStyle = k > .8 ? '#f84040' : k > .5 ? '#f8a020' : '#40a0f8'; glow(c, probe.x, probe.y, r * 2, k > .8 ? '#f84040' : k > .5 ? '#f8a020' : '#40a0f8', .35); c.lineWidth = 2; c.beginPath(); c.arc(probe.x, probe.y, r, 0, 7); c.stroke(); c.lineWidth = 1; }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); }
      c.font = '6px "Press Start 2P", monospace'; backdrop(c, 0, 0, W, top - 4, '#4a3624', '#281a10');
      c.textAlign = 'left'; for (let i = 0; i < 5; i++) { c.fillStyle = i < found ? '#f8e040' : '#584838'; c.beginPath(); const x = 6 + i * 10, y = 7; c.moveTo(x, y - 4); c.lineTo(x + 4, y); c.lineTo(x, y + 4); c.lineTo(x - 4, y); c.fill(); }
      c.fillStyle = '#e0d0b0'; c.fillText(`ROOM ${room}`, 4, 19); c.fillStyle = battery > 0 ? '#a0d0ff' : '#f86060'; c.fillText(battery > 0 ? `${Math.ceil(battery)}s` : 'FLAT', 60, 19);
      c.textAlign = 'right'; c.fillText(`SWINGS ${swings}`, W - 4, 9);
      const k = probe && probe.on && battery > 0 ? probe.k || 0 : 0; c.fillStyle = '#584838'; c.fillRect(W - 54, 13, 50, 5);  c.fillStyle = k > .8 ? '#f84040' : k > .5 ? '#f8a020' : '#40a0f8'; c.fillRect(W - 54, 13, 50 * k, 5);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 7 && !msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#f8f8f0'; c.fillText('HOLD + DRAG: DETECTOR', W / 2, H - 14); c.fillText('TAP: SMASH', W / 2, H - 5); }
    },
    down(x, y) { tapStart = { x, y, t: performance.now() }; probe = { x, y, on: false, t0: performance.now() }; },
    move(x, y, p) { if (!p || !probe) return; probe.x = x; probe.y = y; if (!probe.on && (Math.hypot(x - tapStart.x, y - tapStart.y) > 8 || performance.now() - probe.t0 > 200)) probe.on = true; },
    up() {
      const quick = tapStart && performance.now() - tapStart.t < 220 && !(probe && probe.on); probe = null;
      if (!quick || dead || end) return;
      const o = objs.find(o => !o.open && tapStart.x > o.x - 2 && tapStart.x < o.x + o.w + 2 && tapStart.y > o.y - 2 && tapStart.y < o.y + o.h + 2); if (!o || swings <= 0) return;
      swings--; o.open = .01; burst(o.x + o.w / 2, o.y + o.h / 2, '#f0c020'); sfx(220, .1, 'square', .05, -80);
      if (o.piece) { found++; score += 5; api.score(score); haptic('success'); sfx(1200, .25, 'square', .05, 600); parts.push({ txt: 'PIECE!', x: o.x, y: o.y }); }
      else { score += 1; api.score(score); haptic('medium'); }
      if (found >= 5 || swings <= 0) finish();
    },
    key(k, d) {},
  };
  return self;
}

export default {
  id: 'kit-hunt', title: 'Kit Hunt', tag: 'Bricks · Phone', retro: true, era: 'advance', pal: 'lemon', w: 176, h: 192, maxW: 260, maxH: 320, goal: 150,
  hint: 'Five kit pieces hide in the brick furniture. Hold and drag to sweep the detector: it beeps faster, the bar fills and your phone buzzes harder as you get close. Tap an object to smash it open, but swings are limited. The detector battery only lasts a few seconds per room. Find the number of pieces shown to reach the next room.',
  make,
};
