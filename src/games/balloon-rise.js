import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Your balloon floats up on its own and can't be touched. Your finger is a shield: push the falling
// blocks, rolling balls and spinning bars out of its way. One touch of anything and it pops.
const W = 360, H = 640, BX = 180, BY = 470, BR = 22, SR = 34;

function make(api) {
  let objs, dist, speed, spawn, shield, t, score, popped, bx, wind;
  function spawnSet() {
    const kind = Math.random(); const y = -40;
    if (kind < .4) { const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) objs.push({ k: 'box', x: rnd(40, W - 40), y: y - i * 40, vx: 0, vy: 0, w: rnd(26, 44), h: rnd(20, 34), rot: 0, vr: 0 }); }
    else if (kind < .75) { for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) objs.push({ k: 'ball', x: rnd(30, W - 30), y: y - i * 30, vx: rnd(-20, 20), vy: 0, r: rnd(10, 18) }); }
    else objs.push({ k: 'bar', x: rnd(80, W - 80), y, vx: 0, vy: 0, len: rnd(110, 170), rot: rnd(0, 3), vr: rnd(-1.6, 1.6) });
  }
  return {
    reset() { objs = []; dist = 0; speed = 70; spawn = 1; shield = null; t = 0; score = 0; popped = 0; bx = BX; wind = 0; },
    update(dt) {
      t += dt; if (popped) return;
      speed = Math.min(170, 70 + dist / 60); dist += speed * dt; const s = Math.floor(dist / 50); if (s !== score) { score = s; api.score(score); }
      spawn -= dt; if (spawn <= 0) { spawn = Math.max(.9, 2.2 - dist / 3000); spawnSet(); }
      wind = Math.sin(t * .7) * 14; bx = BX + wind;
      for (const o of objs) {
        o.vy += 260 * dt; o.y += (o.vy + speed) * dt; o.x += o.vx * dt; o.vx *= Math.pow(.6, dt); if (o.vr != null) { o.rot += o.vr * dt; o.vr *= Math.pow(.7, dt); }
        o.vy = Math.min(o.vy, 300);
        // shield pushes things away
        if (shield) {
          const rad = o.k === 'ball' ? o.r : o.k === 'box' ? Math.max(o.w, o.h) / 2 : 10;
          let px = o.x, py = o.y;
          if (o.k === 'bar') { const ca = Math.cos(o.rot), sa = Math.sin(o.rot), u = clamp((shield.x - o.x) * ca + (shield.y - o.y) * sa, -o.len / 2, o.len / 2); px = o.x + ca * u; py = o.y + sa * u; }
          const dx = px - shield.x, dy = py - shield.y, d = Math.hypot(dx, dy);
          if (d < SR + rad && d > 0) {
            const push = (SR + rad - d); o.x += dx / d * push; o.y += dy / d * push; o.vx += dx / d * 420 * dt * 10; o.vy += dy / d * 420 * dt * 10;
            if (o.vr != null) o.vr += ((shield.x - o.x) * dy - (shield.y - o.y) * dx) * .0008;
          }
        }
        // hit the balloon?
        let hx = o.x, hy = o.y, rad = o.k === 'ball' ? o.r : o.k === 'box' ? Math.min(o.w, o.h) / 2 + 3 : 4;
        if (o.k === 'bar') { const ca = Math.cos(o.rot), sa = Math.sin(o.rot), u = clamp((bx - o.x) * ca + (BY - o.y) * sa, -o.len / 2, o.len / 2); hx = o.x + ca * u; hy = o.y + sa * u; }
        if (Math.hypot(hx - bx, hy - BY) < BR + rad - 2) { popped = .001; haptic('error'); sfx(900, .05, 'square', .06, -800); sfx(120, .3, 'sawtooth', .04, -50); return api.over(); }
      }
      objs = objs.filter(o => o.y < H + 80 && o.x > -100 && o.x < W + 100);
    },
    fx(dt) { popped += dt; },
    draw(c) {
      const k = clamp(dist / 12000, 0, 1); const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgb(${Math.round(120 - k * 100)},${Math.round(190 - k * 160)},${Math.round(255 - k * 160)})`); g.addColorStop(1, `rgb(${Math.round(200 - k * 150)},${Math.round(230 - k * 180)},255)`); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff50'; for (let i = 0; i < 6; i++) { const y = ((i * 160 + dist * .5) % (H + 100)) - 50; c.beginPath(); c.ellipse((i * 123) % W, y, 60, 18, 0, 0, 7); c.fill(); }
      for (const o of objs) {
        c.save(); c.translate(o.x, o.y);
        if (o.k === 'box') { c.rotate(o.rot || 0); c.fillStyle = '#7a5aa8'; c.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); c.fillStyle = '#9a7ac8'; c.fillRect(-o.w / 2, -o.h / 2, o.w, 5); }
        else if (o.k === 'ball') { c.fillStyle = '#e85a5a'; c.beginPath(); c.arc(0, 0, o.r, 0, 7); c.fill(); c.fillStyle = '#ffffff50'; c.beginPath(); c.arc(-o.r * .3, -o.r * .3, o.r * .3, 0, 7); c.fill(); }
        else { c.rotate(o.rot); c.fillStyle = '#4a4a5a'; c.fillRect(-o.len / 2, -5, o.len, 10); }
        c.restore();
      }
      // balloon
      if (!popped) {
        c.strokeStyle = '#ffffffaa'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(bx, BY + BR); c.quadraticCurveTo(bx + 8, BY + BR + 30, bx - 2, BY + BR + 60); c.stroke();
        c.fillStyle = '#ff4d8a'; c.beginPath(); c.ellipse(bx, BY, BR, BR * 1.15, 0, 0, 7); c.fill(); c.fillStyle = '#ffffff60'; c.beginPath(); c.ellipse(bx - 7, BY - 9, 5, 8, -.4, 0, 7); c.fill();
      } else { c.strokeStyle = '#ff4d8a'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, d = 20 + popped * 120; c.beginPath(); c.moveTo(bx + Math.cos(a) * d * .6, BY + Math.sin(a) * d * .6); c.lineTo(bx + Math.cos(a) * d, BY + Math.sin(a) * d); c.stroke(); } }
      if (shield) { c.fillStyle = '#ffffff30'; c.beginPath(); c.arc(shield.x, shield.y, SR, 0, 7); c.fill(); c.strokeStyle = '#ffffffcc'; c.lineWidth = 3; c.stroke(); }
      if (t < 5) { c.fillStyle = '#ffffffcc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('drag your shield to clear the way', W / 2, 620); }
    },
    down(x, y) { shield = { x, y }; },
    move(x, y) { if (shield) shield = { x, y }; },
    up() { shield = null; },
    key(k, d) { if (k === ' ') shield = d ? { x: bx, y: BY - 80 } : null; },
  };
}

export default {
  id: 'balloon-rise', title: 'Balloon Rise', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 40,
  hint: 'The balloon rises by itself. Hold and drag your shield to shove falling blocks, balls and bars aside. If anything touches the balloon, it pops.',
  make,
};
