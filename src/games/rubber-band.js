import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// A shooting gallery with a rubber band. Drag back from the bottom to aim and stretch, let go to fire.
// Tins slide along three shelves; knock them off. A bigger stretch flies straighter. 15 bands.
const P = PAL.amber, W = 160, H = 160, SHELVES = [34, 62, 90], BANDS = 15, OX = 80, OY = 150;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let tins, bands, score, t, aim, shots, wait, falls;
  function fill() {
    tins = [];
    SHELVES.forEach((y, i) => { const dir = i % 2 ? -1 : 1, sp = rnd(14, 26) + score; for (let k = 0; k < 3; k++) tins.push({ x: rnd(0, W) + k * 50, y, dir, sp, gold: Math.random() < .12 }); });
  }
  return {
    reset() { bands = BANDS; score = 0; t = 0; aim = null; shots = []; wait = 0; falls = []; feel.clear(); fill(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt;
      for (const tn of tins) { tn.x += tn.dir * tn.sp * dt; if (tn.x > W + 8) tn.x -= W + 16; if (tn.x < -8) tn.x += W + 16; }
      for (const s of shots) {
        s.vy += 40 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.spin += dt * 20;
        for (const tn of tins) if (!tn.hit && Math.abs(s.x - tn.x) < 5 && s.y < tn.y && s.y > tn.y - 10) {
          tn.hit = true; s.dead = true; const pts = tn.gold ? 5 : 1; score += pts; api.score(score);
          falls.push({ x: tn.x, y: tn.y - 5, vx: s.vx * .2, vy: -40, gold: tn.gold, r: 0 }); haptic(tn.gold ? 'success' : 'medium'); sfx(tn.gold ? 1100 : 700, .08, 'square', .04, -200); feel.juice.burst(tn.x, tn.y - 5, { n: tn.gold ? 12 : 6, speed: 50, life: .4, size: 2, color: [P[0], P[1]] }); if (tn.gold) feel.juice.pop(tn.x, tn.y - 16, '+5', { color: P[0], size: 6 });
        }
        if (s.y < -10 || s.x < -10 || s.x > W + 10) s.dead = true;
      }
      shots = shots.filter(s => !s.dead); tins = tins.filter(tn => !tn.hit);
      if (!tins.length) { haptic('success'); fill(); }
      for (const f of falls) { f.vy += 300 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += dt * 8; } falls = falls.filter(f => f.y < H + 10);
      if (bands <= 0 && !shots.length) { wait += dt; if (wait > .6) return api.over(); }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (const y of SHELVES) { c.fillStyle = P[1]; c.fillRect(0, y, W, 3); c.fillStyle = P[2]; c.fillRect(0, y + 3, W, 2); }
      for (const tn of tins) { c.fillStyle = tn.gold ? P[2] : P[0]; c.fillRect(Math.round(tn.x) - 4, tn.y - 10, 8, 10); c.fillStyle = P[3]; c.fillRect(Math.round(tn.x) - 4, tn.y - 7, 8, 2); if (tn.gold) { c.fillStyle = P[0]; c.fillRect(Math.round(tn.x) - 1, tn.y - 4, 2, 2); } }
      for (const f of falls) { c.save(); c.translate(f.x, f.y); c.rotate(f.r); c.fillStyle = f.gold ? P[2] : P[0]; c.fillRect(-4, -5, 8, 10); c.restore(); }
      for (const s of shots) { c.strokeStyle = P[0]; c.lineWidth = 1; c.beginPath(); c.ellipse(s.x, s.y, 3, 1.5, s.spin, 0, 7); c.stroke(); }
      // hand + band
      c.fillStyle = P[1]; c.fillRect(OX - 2, OY - 14, 4, 14); c.fillRect(OX - 7, OY - 18, 3, 8); c.fillRect(OX + 4, OY - 18, 3, 8);
      if (aim) {
        const dx = aim.x - OX, dy = aim.y - (OY - 16), len = Math.min(40, Math.hypot(dx, dy)), a = Math.atan2(dy, dx), px = OX + Math.cos(a) * len, py = OY - 16 + Math.sin(a) * len;
        c.strokeStyle = P[0]; c.beginPath(); c.moveTo(OX - 6, OY - 18); c.lineTo(px, py); c.lineTo(OX + 6, OY - 18); c.stroke();
        c.fillStyle = P[1]; for (let i = 1; i < 6; i++) c.fillRect(Math.round(OX - Math.cos(a) * i * 10), Math.round(OY - 16 - Math.sin(a) * i * 10), 1, 1);
      } else { c.strokeStyle = P[0]; c.beginPath(); c.moveTo(OX - 6, OY - 18); c.lineTo(OX + 6, OY - 18); c.stroke(); }
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[0]; c.fillText(`x${bands}`, 4, 10);
      if (t < 4) { c.fillText('DRAG DOWN, LET GO', 4, 130); }
    },
    down(x, y) { if (bands > 0) aim = { x, y }; },
    move(x, y) { if (aim) { const was = Math.round(Math.hypot(aim.x - OX, aim.y - OY) / 10); aim = { x, y }; if (Math.round(Math.hypot(x - OX, y - OY) / 10) !== was) haptic('tick'); } },
    up() {
      if (!aim) return; const dx = aim.x - OX, dy = aim.y - (OY - 16), len = Math.min(40, Math.hypot(dx, dy)); aim = null;
      if (len < 6 || bands <= 0) return;
      const a = Math.atan2(dy, dx) + Math.PI, sp = 120 + len * 6; bands--;
      shots.push({ x: OX, y: OY - 18, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, spin: 0 }); haptic('light'); sfx(300, .06, 'square', .04, 500);
    },
    key(k, d) { if (d && k === ' ' && bands > 0) { const tn = tins[Math.random() * tins.length | 0]; const a = Math.atan2(tn.y - 6 - OY, tn.x - OX); bands--; shots.push({ x: OX, y: OY - 18, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, spin: 0 }); } },
  };
}

export default {
  id: 'rubber-band', title: 'Rubber Band Shot', tag: 'Pocket · Aim', retro: true, w: W, h: H, pal: 'amber', goal: 15,
  hint: 'Drag down from your hand to stretch the band, aim, and let go to fire. Knock tins off the moving shelves. Gold tins are worth 5. 15 bands.',
  make,
};
