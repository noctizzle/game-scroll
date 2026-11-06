import { rnd, disc } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';

// Fixed turret in the middle: touch to aim and fire at rocks drifting in from every side. Big rocks split.
const R = PAL.ice, W = 160, H = 160, CX = 80, CY = 80;

function make(api) {
  let ang, rocks, shots, parts, firing, aim, cool, spawn, t, score, dead;
  function addRock(r) {
    const a = rnd(0, Math.PI * 2), x = CX + Math.cos(a) * 110, y = CY + Math.sin(a) * 110;
    const to = Math.atan2(CY - y, CX - x) + rnd(-.5, .5), s = rnd(14, 22) + t * .35;
    rocks.push({ x, y, vx: Math.cos(to) * s, vy: Math.sin(to) * s, r });
  }
  return {
    reset() { ang = -Math.PI / 2; rocks = []; shots = []; parts = []; firing = false; aim = null; cool = 0; spawn = .5; t = 0; score = 0; dead = 0; },
    update(dt) {
      t += dt; cool -= dt; spawn -= dt;
      if (spawn <= 0) { addRock(Math.random() < .6 ? 9 : 6); spawn = Math.max(.7, 2.2 - t / 25); }
      if (aim) { const target = Math.atan2(aim.y - CY, aim.x - CX); let d = target - ang; d = Math.atan2(Math.sin(d), Math.cos(d)); ang += Math.sign(d) * Math.min(Math.abs(d), dt * 14); }
      if (firing && cool <= 0) { cool = .2; shots.push({ x: CX + Math.cos(ang) * 8, y: CY + Math.sin(ang) * 8, vx: Math.cos(ang) * 170, vy: Math.sin(ang) * 170, life: .8 }); sfx(900, .04, 'square', .02, -400); }
      for (const s of shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
      for (const k of rocks) { k.x += k.vx * dt; k.y += k.vy * dt; }
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      parts = parts.filter(p => p.life > 0);
      for (const s of shots) for (const k of rocks) {
        if (s.life > 0 && !k.dead && Math.hypot(s.x - k.x, s.y - k.y) < k.r + 1) {
          s.life = 0; k.dead = true; score += k.r > 6 ? 1 : 2; api.score(score); sfx(180, .12, 'sawtooth', .04, -80);
          for (let i = 0; i < 6; i++) { const a = rnd(0, 7); parts.push({ x: k.x, y: k.y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: .4 }); }
          if (k.r > 6) for (const sgn of [1, -1]) rocks.push({ x: k.x, y: k.y, vx: k.vy * sgn * 1.2 + k.vx * .3, vy: -k.vx * sgn * 1.2 + k.vy * .3, r: 5 });
        }
      }
      shots = shots.filter(s => s.life > 0);
      rocks = rocks.filter(k => !k.dead && Math.hypot(k.x - CX, k.y - CY) < 140);
      for (const k of rocks) if (Math.hypot(k.x - CX, k.y - CY) < k.r + 5) { sfx(90, .5, 'sawtooth', .06, -50); return api.over(); }
    },
    fx(dt) { dead += dt; for (const k of rocks) { k.x += k.vx * dt; k.y += k.vy * dt; } },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let i = 0; i < 24; i++) c.fillRect((i * 67) % W, (i * 41 + 13) % H, 1, 1);
      c.fillStyle = R[2]; for (let a = 0; a < 6.28; a += .2) c.fillRect(Math.round(CX + Math.cos(a) * 18), Math.round(CY + Math.sin(a) * 18), 1, 1);
      for (const k of rocks) { c.fillStyle = R[0]; disc(c, k.x, k.y, k.r); c.fillStyle = R[1]; disc(c, k.x - 1, k.y - 1, k.r - 2); c.fillStyle = R[0]; c.fillRect(Math.round(k.x) + 1, Math.round(k.y) - 2, 2, 2); }
      c.fillStyle = R[0]; for (const s of shots) c.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
      c.fillStyle = R[1]; for (const p of parts) c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      if (!dead || (dead * 10 | 0) % 2) {
        c.fillStyle = R[0]; disc(c, CX, CY, 5); c.fillStyle = R[2]; disc(c, CX, CY, 2);
        c.fillStyle = R[0]; for (let i = 4; i < 10; i++) c.fillRect(Math.round(CX + Math.cos(ang) * i), Math.round(CY + Math.sin(ang) * i), 2, 2);
      }
    },
    down(x, y) { aim = { x, y }; firing = true; },
    move(x, y, p) { if (p) aim = { x, y }; },
    up() { firing = false; },
    key(k, d) { if (k === ' ') firing = d; if (d && k === 'ArrowLeft') ang -= .3; if (d && k === 'ArrowRight') ang += .3; },
  };
}

export default {
  id: 'rock-blaster', title: 'Rock Blaster', tag: 'Pocket · Shooter', retro: true, w: W, h: H, pal: 'ice',
  hint: 'Touch and hold where you want to shoot. Big rocks split in two.',
  goal: 40,
  make,
};
