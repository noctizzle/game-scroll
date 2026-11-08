import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd, pix } = gs.util;
const { PAL } = gs.palettes;

// Top-down four-lane racer: tap the left or right half to switch lanes and dodge traffic.
const R = PAL.mono, W = 160, H = 160, L0 = 16, LW = 32, PY = 128;
const CAR = ['.0000.', '011110', '0.11.0', '011110', '011110', '011110', '0.11.0', '011110', '.0000.'];
const laneX = l => L0 + l * LW + LW / 2;

function make(api) {
  let lane, x, cars, speed, spawn, stripe, score, dead;
  return {
    reset() { lane = 1; x = laneX(1); cars = []; speed = 60; spawn = .6; stripe = 0; score = 0; dead = 0; },
    update(dt) {
      speed = Math.min(170, speed + dt * 3); stripe = (stripe + speed * dt) % 16;
      x += (laneX(lane) - x) * Math.min(1, dt * 16);
      spawn -= dt;
      if (spawn <= 0) {
        spawn = clamp(rnd(.45, 1.1) * 70 / speed, .22, 1.2);
        const free = [0, 1, 2, 3].filter(l => !cars.some(c => c.lane === l && c.y < 30));
        if (free.length > 1) cars.push({ lane: free[Math.random() * free.length | 0], y: -20, v: rnd(.55, .85) });
      }
      for (const c of cars) c.y += speed * c.v * dt;
      cars = cars.filter(c => { if (c.y > H + 20) { score++; api.score(score); return false; } return true; });
      for (const c of cars) if (Math.abs(laneX(c.lane) - x) < 11 && Math.abs(c.y - PY) < 17) { sfx(120, .4, 'sawtooth', .05, -60); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[2]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[3]; c.fillRect(L0, 0, LW * 4, H);
      c.fillStyle = R[1]; c.fillRect(L0 - 2, 0, 2, H); c.fillRect(L0 + LW * 4, 0, 2, H);
      for (let l = 1; l < 4; l++) for (let y = -16 + stripe; y < H; y += 16) c.fillRect(L0 + l * LW - 1, Math.round(y), 2, 8);
      c.fillStyle = R[1]; for (let y = -16 + stripe; y < H; y += 16) { c.fillRect(4, Math.round(y), 4, 4); c.fillRect(W - 8, Math.round(y) + 8, 4, 4); }
      for (const k of cars) pix(c, CAR, laneX(k.lane) - 3, Math.round(k.y) - 4, { 0: R[0], 1: R[1] }), pix(c, CAR, laneX(k.lane) - 3, Math.round(k.y) + 5, { 0: R[0], 1: R[1] });
      if (!dead || (dead * 10 | 0) % 2) { const m = { 0: R[0], 1: R[2] }; pix(c, CAR, Math.round(x) - 3, PY - 9, m); pix(c, CAR, Math.round(x) - 3, PY, m); }
    },
    down(px) { lane = clamp(lane + (px < W / 2 ? -1 : 1), 0, 3); sfx(400, .03); },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') this.down(0); if (k === 'ArrowRight') this.down(W); },
  };
}

export default {
  id: 'lane-racer', title: 'Lane Racer', tag: 'Pocket · Racing', retro: true, w: W, h: H, pal: 'mono',
  hint: 'Tap left or right to switch lanes. Pass as many cars as you can.',
  goal: 30,
  make,
};
