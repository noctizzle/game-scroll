import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd } = gs.util;

// Hold to fire a rope at the nearest hook ahead and swing; let go to fly. Touch the floor and you're out.
const W = 360, H = 640, G = 1300, FLOOR = H - 60;

function make(api) {
  let p, hooks, rope, camX, best, t, dead, sparks;
  function more() { let x = hooks.length ? hooks[hooks.length - 1].x : 120; while (x < camX + W * 2) { x += rnd(150, 230); hooks.push({ x, y: rnd(110, 210) }); } }
  return {
    reset() { hooks = []; camX = 0; more(); p = { x: 60, y: 260, vx: 260, vy: -150 }; rope = null; { const k = hooks.filter(k => k.x > p.x - 20).sort((a, b) => a.x - b.x)[0]; if (k) rope = { x: k.x, y: k.y, len: clamp(Math.hypot(k.x - p.x, k.y - p.y), 60, 330) }; } best = 0; t = 0; dead = 0; sparks = []; },
    update(dt) {
      t += dt;
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        p.vy += G * h; p.x += p.vx * h; p.y += p.vy * h;
        if (rope) {   // keep rope length fixed: project position, remove outward velocity
          const dx = p.x - rope.x, dy = p.y - rope.y, d = Math.hypot(dx, dy);
          if (d > rope.len) { const nx = dx / d, ny = dy / d; p.x = rope.x + nx * rope.len; p.y = rope.y + ny * rope.len; const vr = p.vx * nx + p.vy * ny; if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; } }
        }
      }
      if (p.y < 20) { p.y = 20; p.vy = Math.abs(p.vy) * .3; }
      camX += ((p.x - 120) - camX) * Math.min(1, dt * 5); more(); hooks = hooks.filter(k => k.x > camX - 80);
      const dist = Math.floor(p.x / 20); if (dist > best) { best = dist; api.score(best); }
      for (const q of sparks) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; } sparks = sparks.filter(q => q.life > 0);
      if (p.y > FLOOR - 10) { sfx(120, .4, 'sawtooth', .05, -60); for (let i = 0; i < 16; i++) sparks.push({ x: p.x, y: FLOOR, vx: rnd(-150, 150), vy: rnd(-260, -60), life: rnd(.3, .7) }); return api.over(); }
    },
    fx(dt) { dead += dt; for (const q of sparks) { q.vy += G * .5 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; } sparks = sparks.filter(q => q.life > 0); },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0f3b4a'); g.addColorStop(1, '#0a1820'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // parallax city
      for (const [k, col, hgt] of [[.25, '#123441', 220], [.5, '#0f2a35', 160]]) { c.fillStyle = col; for (let i = -1; i < 12; i++) { const bx = i * 70 - (camX * k) % 70, bh = hgt * (.5 + ((i + Math.floor(camX * k / 70)) * 37 % 10) / 20); c.fillRect(bx, FLOOR - bh, 52, bh); } }
      c.save(); c.translate(-camX, 0);
      c.fillStyle = '#1d5361'; c.fillRect(camX, 0, W, 14);
      // lava floor
      c.fillStyle = '#ff5a36'; c.fillRect(camX, FLOOR, W, H - FLOOR); c.fillStyle = '#ffb347'; for (let x = Math.floor(camX / 24) * 24; x < camX + W; x += 24) c.fillRect(x, FLOOR + Math.sin(t * 4 + x * .05) * 3, 12, 3);
      const near = rope ? null : this._target();
      for (const k of hooks) { c.fillStyle = k === near ? '#ffd34a' : '#9fd6e0'; c.beginPath(); c.arc(k.x, k.y, 7, 0, 7); c.fill(); c.strokeStyle = '#ffffff30'; c.lineWidth = 2; c.beginPath(); c.moveTo(k.x, 14); c.lineTo(k.x, k.y - 7); c.stroke(); }
      if (rope) { c.strokeStyle = '#f2e6c9'; c.lineWidth = 3; c.beginPath(); c.moveTo(rope.x, rope.y); c.lineTo(p.x, p.y); c.stroke(); }
      if (!dead || (dead * 10 | 0) % 2) { c.fillStyle = '#ffd34a'; c.beginPath(); c.arc(p.x, p.y, 11, 0, 7); c.fill(); c.fillStyle = '#0a1820'; const a = Math.atan2(p.vy, p.vx); c.fillRect(p.x + Math.cos(a) * 4 - 2, p.y + Math.sin(a) * 4 - 4, 3, 3); }
      for (const q of sparks) { c.fillStyle = `rgba(255,180,70,${q.life * 1.5})`; c.fillRect(q.x, q.y, 4, 4); }
      c.restore();
    },
    _target() { let bestK = null, bd = 1e9; for (const k of hooks) { if (k.x < p.x - 20 || k.x > p.x + 260) continue; const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < bd) { bd = d; bestK = k; } } return bestK; },
    down() { const k = this._target(); if (!k) return; rope = { x: k.x, y: k.y, len: clamp(Math.hypot(k.x - p.x, k.y - p.y), 60, 330) }; sfx(700, .05, 'square', .03, -300); },
    up() { if (rope) { rope = null; p.vx *= 1.05; p.vy -= 60; } },
    key(k, d) { if (k === ' ') d ? this.down() : this.up(); },
  };
}

export default {
  id: 'rope-swing', title: 'Rope Swing', tag: 'Casual · Physics', retro: false, w: W, h: H,
  hint: 'Hold to grab the glowing hook and swing. Let go at the top of the arc to fly further.',
  goal: 200,
  make,
};
