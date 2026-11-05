import { clamp, rnd, pix } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';

// Fixed shooter: drag to move your cannon, it fires on its own. Clear each marching formation before it lands.
const R = PAL.amber, W = 160, H = 160, PY = 146;
const ALIEN = [['.0..0.', '011110', '101101', '011110', '0....0'], ['.0..0.', '011110', '101101', '011110', '.0..0.']];
const GUN = ['..00..', '.0110.', '011110'];

function make(api) {
  let px, tx, foes, dir, step, stepT, shots, bombs, cool, wave, score, frame, dead;
  function build() { foes = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) foes.push({ x: 20 + c * 18, y: 18 + r * 12 }); dir = 1; step = Math.max(.12, .5 - wave * .06); stepT = step; }
  return {
    reset() { px = tx = W / 2; shots = []; bombs = []; cool = .3; wave = 1; score = 0; frame = 0; dead = 0; build(); },
    update(dt) {
      px += (tx - px) * Math.min(1, dt * 18); px = clamp(px, 6, W - 6);
      cool -= dt; if (cool <= 0) { cool = .38; shots.push({ x: px, y: PY - 3 }); sfx(1000, .03, 'square', .015, -500); }
      stepT -= dt;
      if (stepT <= 0) {
        stepT = step * Math.max(.35, foes.length / 18); frame ^= 1;
        const edge = foes.some(f => (dir > 0 && f.x > W - 12) || (dir < 0 && f.x < 6));
        if (edge) { dir = -dir; for (const f of foes) f.y += 5; } else for (const f of foes) f.x += dir * 3;
        if (foes.length && Math.random() < .5 + wave * .05) { const f = foes[Math.random() * foes.length | 0]; bombs.push({ x: f.x + 3, y: f.y + 5, v: rnd(40, 60) + wave * 5 }); }
      }
      for (const s of shots) s.y -= 150 * dt; for (const b of bombs) b.y += b.v * dt;
      for (const s of shots) for (const f of foes) if (!s.hit && !f.hit && s.x >= f.x - 1 && s.x <= f.x + 7 && s.y >= f.y && s.y <= f.y + 6) { s.hit = f.hit = true; score += 10; api.score(score); sfx(240, .08, 'sawtooth', .03, -100); }
      shots = shots.filter(s => !s.hit && s.y > -4); foes = foes.filter(f => !f.hit); bombs = bombs.filter(b => b.y < H + 4);
      if (!foes.length) { wave++; build(); sfx(700, .25, 'square', .04, 500); }
      for (const b of bombs) if (Math.abs(b.x - px) < 5 && b.y > PY - 2 && b.y < PY + 4) { sfx(100, .5, 'sawtooth', .06, -50); return api.over(); }
      if (foes.some(f => f.y > PY - 10)) { sfx(100, .5, 'sawtooth', .06, -50); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let i = 0; i < 20; i++) c.fillRect((i * 53) % W, (i * 29) % 130, 1, 1);
      c.fillRect(0, PY + 6, W, 1);
      for (const f of foes) pix(c, ALIEN[frame], f.x, f.y, { 0: R[0], 1: R[1] });
      c.fillStyle = R[0]; for (const s of shots) c.fillRect(Math.round(s.x), Math.round(s.y), 1, 3);
      c.fillStyle = R[1]; for (const b of bombs) { c.fillRect(Math.round(b.x), Math.round(b.y), 2, 2); c.fillRect(Math.round(b.x) + ((b.y | 0) % 4 < 2 ? -1 : 1), Math.round(b.y) - 2, 2, 2); }
      if (!dead || (dead * 10 | 0) % 2) pix(c, GUN, Math.round(px) - 3, PY, { 0: R[0], 1: R[1] });
      c.fillStyle = R[1]; for (let i = 0; i < wave && i < 10; i++) c.fillRect(3 + i * 4, H - 5, 2, 2);
    },
    down(x) { tx = x; }, move(x, y, p) { if (p) tx = x; },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') tx = px - 20; if (k === 'ArrowRight') tx = px + 20; },
  };
}

export default {
  id: 'sky-defense', title: 'Sky Defense', tag: 'Pocket · Shooter', retro: true, w: W, h: H, pal: 'amber',
  hint: 'Drag to move. Your cannon fires on its own. Dodge the falling sparks.',
  goal: 300,
  make,
};
