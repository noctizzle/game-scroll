import { clamp, rnd, disc } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { tilt, calibrateTilt, want, haptic } from '../kit/device.js';

// A spirit level: tilt the phone to steer the bubble into the wandering ring and keep it there. No tilt sensor? Drag.
const R = PAL.ice, W = 160, H = 160, CX = 80, CY = 84, RAD = 62;

function make(api) {
  want('motion');
  let b, ring, fill, health, score, t, drag, dead, inside;
  function newRing() { const a = rnd(0, 6.28), d = rnd(10, RAD - 24); ring = { x: CX + Math.cos(a) * d, y: CY + Math.sin(a) * d, r: Math.max(9, 18 - score), vx: rnd(-1, 1) * (4 + score * 1.5), vy: rnd(-1, 1) * (4 + score * 1.5) }; fill = 0; }
  return {
    reset() { calibrateTilt(); b = { x: CX, y: CY, vx: 0, vy: 0 }; score = 0; health = 1; t = 0; drag = null; dead = 0; inside = false; newRing(); },
    update(dt) {
      t += dt;
      let ax = 0, ay = 0; const tl = tilt();
      if (drag && drag.cur) { ax = clamp((drag.cur.x - drag.x) / 25, -1, 1); ay = clamp((drag.cur.y - drag.y) / 25, -1, 1); }
      else if (tl) { ax = -tl.x; ay = -tl.y; }   // a bubble floats to the high side
      b.vx = (b.vx + ax * 260 * dt) * Math.pow(.08, dt); b.vy = (b.vy + ay * 260 * dt) * Math.pow(.08, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      const d = Math.hypot(b.x - CX, b.y - CY); if (d > RAD - 6) { b.x = CX + (b.x - CX) / d * (RAD - 6); b.y = CY + (b.y - CY) / d * (RAD - 6); }
      ring.x += ring.vx * dt; ring.y += ring.vy * dt; const rd = Math.hypot(ring.x - CX, ring.y - CY); if (rd > RAD - ring.r - 4) { ring.vx = -ring.vx; ring.vy = -ring.vy; ring.x = CX + (ring.x - CX) / rd * (RAD - ring.r - 5); ring.y = CY + (ring.y - CY) / rd * (RAD - ring.r - 5); }
      const now = Math.hypot(b.x - ring.x, b.y - ring.y) < ring.r - 3;
      if (now !== inside) { inside = now; haptic(now ? 'light' : 'tick'); }
      if (inside) { fill += dt / 2; health = Math.min(1, health + dt * .05); } else health -= dt / 6;
      if (fill >= 1) { score++; api.score(score); haptic('success'); sfx(880, .2, 'square', .04, 300); newRing(); }
      if (health <= 0) { haptic('error'); sfx(120, .5, 'sawtooth', .05, -60); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[1]; disc(c, CX, CY, RAD + 3); c.fillStyle = R[2]; disc(c, CX, CY, RAD);
      c.fillStyle = R[1]; c.fillRect(CX - RAD, CY, RAD * 2, 1); c.fillRect(CX, CY - RAD, 1, RAD * 2);
      for (let a = 0; a < 6.28; a += .08) { c.fillStyle = (a / 6.28 < fill) ? R[0] : R[1]; c.fillRect(Math.round(ring.x + Math.cos(a - 1.57) * ring.r), Math.round(ring.y + Math.sin(a - 1.57) * ring.r), 1 + (a / 6.28 < fill), 1 + (a / 6.28 < fill)); }
      if (!dead || (dead * 10 | 0) % 2) { c.fillStyle = R[3]; disc(c, b.x, b.y, 6); c.fillStyle = R[2]; disc(c, b.x + 1, b.y + 1, 3); c.fillStyle = R[3]; c.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 3, 2, 2); }
      c.fillStyle = R[1]; c.fillRect(16, 152, 128, 4); c.fillStyle = health < .3 && (t * 4 | 0) % 2 ? R[1] : R[0]; c.fillRect(16, 152, 128 * Math.max(0, health), 4);
      if (!tilt()) { c.fillStyle = R[1]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText('DRAG', 4, 10); }
    },
    down(x, y) { drag = { x, y, cur: null }; }, move(x, y, p) { if (p && drag) drag.cur = { x, y }; }, up() { drag = null; },
  };
}

export default {
  id: 'bubble-level', title: 'Bubble Level', tag: 'Pocket · Motion', retro: true, w: W, h: H, pal: 'ice', goal: 3,
  hint: 'Tilt so the bubble sits inside the ring until it fills. The bubble rises to the high side.',
  make,
};
