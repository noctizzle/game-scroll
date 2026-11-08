import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// A jelly on a trampoline. Tap right as it squashes into the mat to bounce higher; a sloppy tap
// loses height. Collect the stars hanging at different heights. Drag sideways in the air to drift.
const W = 360, H = 640, MAT = 560, G = 1400;

function make(api) {
  let j, cam, stars, score, t, msg, contact, tapped, peak, best, squash, drift, misses;
  function seed() { stars = []; for (let i = 0; i < 60; i++) stars.push({ x: rnd(40, W - 40), h: 140 + i * 90 + rnd(-30, 30), got: false }); }
  return {
    reset() { j = { x: W / 2, h: 220, vh: 0, vx: 0 }; cam = 0; score = 0; t = 0; msg = null; contact = 0; tapped = false; peak = 0; best = 0; squash = 0; drift = null; misses = 0; seed(); },
    update(dt) {
      t += dt; if (msg) msg.l -= dt;
      if (contact > 0) {
        contact -= dt; squash = Math.sin((1 - contact / .16) * Math.PI);
        if (contact <= 0) {
          // leave the mat: the timing of your tap decides the boost
          const v = j.vin; let mult = .82;
          if (tapped) { const off = Math.abs(tapped - .08); mult = off < .03 ? 1.18 : off < .06 ? 1.06 : .9; msg = { txt: off < .03 ? 'PERFECT' : off < .06 ? 'GOOD' : 'EARLY/LATE', l: .7 }; haptic(off < .03 ? 'success' : 'light'); sfx(off < .03 ? 880 : 600, .08, 'triangle', .05, 300); }
          else { misses++; }
          j.vh = Math.min(2900, Math.max(520, v * mult)); squash = 0; tapped = false; peak = 0;
          if (j.vh <= 540 && misses > 2) { msg = { txt: 'OUT OF BOUNCE', l: 1.2 }; haptic('error'); return api.over(); }
        }
        return;
      }
      j.vh -= G * dt; j.h += j.vh * dt; peak = Math.max(peak, j.h);
      if (drift) j.vx += clamp((drift.x - j.x) * 6, -900, 900) * dt; j.vx *= Math.pow(.2, dt); j.x = clamp(j.x + j.vx * dt, 30, W - 30);
      if (j.h <= 0 && j.vh < 0) {
        j.h = 0; if (Math.abs(j.x - W / 2) > 150) { msg = { txt: 'MISSED THE MAT', l: 1.2 }; haptic('error'); sfx(120, .4, 'triangle', .05, -40); return api.over(); }
        j.vin = -j.vh; contact = .16; tapped = tapped === 'early' ? .08 - .045 : false;   // a tap just before landing still counts as GOOD haptic('tick'); sfx(160, .1, 'sine', .05, -40);
        if (peak > best) { best = peak; }
      }
      cam += (Math.max(0, j.h - 260) - cam) * Math.min(1, dt * 6);
      for (const s of stars) if (!s.got && Math.abs(s.h - j.h) < 30 && Math.abs(s.x - j.x) < 34) { s.got = true; score++; api.score(score); haptic('medium'); sfx(1200 + score * 10, .08, 'triangle', .04, 200); }
    },
    draw(c) {
      const k = clamp(cam / 4000, 0, 1); c.fillStyle = `rgb(${Math.round(255 - k * 200)},${Math.round(200 - k * 150)},${Math.round(230 - k * 120)})`; c.fillRect(0, 0, W, H);
      const sy = h => MAT - (h - cam);
      for (const s of stars) { const y = sy(s.h); if (y < -20 || y > H + 20 || s.got) continue; c.fillStyle = '#ffd34a'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 - 1.571, r = i % 2 ? 6 : 13; c.lineTo(s.x + Math.cos(a) * r, y + Math.sin(a) * r); } c.fill(); }
      const my = sy(0);
      if (my < H + 40) {
        c.strokeStyle = '#555'; c.lineWidth = 6; c.beginPath(); c.moveTo(W / 2 - 150, my + 6); c.lineTo(W / 2 - 160, my + 60); c.moveTo(W / 2 + 150, my + 6); c.lineTo(W / 2 + 160, my + 60); c.stroke();
        c.strokeStyle = '#3a6aff'; c.lineWidth = 8; c.beginPath(); c.moveTo(W / 2 - 150, my); c.quadraticCurveTo(j.x, my + squash * 40, W / 2 + 150, my); c.stroke();
      }
      const jy = sy(j.h) + (contact > 0 ? squash * 20 : 0), sx = 1 + squash * .4, syy = 1 - squash * .35, str = contact > 0 ? 1 : 1 + clamp(Math.abs(j.vh) / 6000, 0, .2);
      c.save(); c.translate(j.x, jy); c.scale(sx / str, syy * str);
      c.fillStyle = '#7dff9acc'; c.beginPath(); c.moveTo(-30, 0); c.quadraticCurveTo(-32, -50, 0, -52); c.quadraticCurveTo(32, -50, 30, 0); c.closePath(); c.fill();
      c.fillStyle = '#ffffff70'; c.beginPath(); c.ellipse(-12, -34, 6, 10, -.4, 0, 7); c.fill();
      c.fillStyle = '#1a3a2a'; c.beginPath(); c.arc(-9, -22, 3, 0, 7); c.arc(9, -22, 3, 0, 7); c.fill();
      c.restore();
      c.fillStyle = '#00000080'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.round(j.h / 10)} m`, 12, 22);
      if (t < 5) { c.fillStyle = '#00000090'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap as it squashes into the mat', W / 2, 625); }
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.txt === 'PERFECT' ? '#ff6b8a' : '#333'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 160); c.globalAlpha = 1; }
    },
    down(x) {
      if (contact > 0 && !tapped) tapped = .16 - contact + .001;
      else if (contact <= 0 && j.h < 60 && j.vh < 0) { tapped = 'early'; }
      drift = { x };
    },
    move(x) { if (drift) drift.x = x; },
    up() { drift = null; },
    key(k, d) { if (d && k === ' ' && contact > 0 && !tapped) tapped = .08; },
  };
}

export default {
  id: 'jelly-bounce', title: 'Jelly Bounce', tag: 'Casual · Timing', retro: false, w: W, h: H, goal: 15,
  hint: 'Tap the moment the jelly squashes into the trampoline to bounce higher. Badly timed taps lose height. Hold and drag in the air to drift toward the stars.',
  make,
};
