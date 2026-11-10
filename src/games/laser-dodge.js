// Laser Dodge: you're a little spark in a vault full of sweeping lasers. Drag anywhere to slide the spark
// (it moves with your finger, not under it). Each laser blinks as a dotted line before it fires, then
// sweeps round. Grab the chips that pop up. Three zaps and the alarm goes off.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx } = gs.sound;
const { clamp, rnd } = gs.util;

const R = PAL.mono;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let p, beams, chip, score, lives, t, inv, last, nextBeam, keys;

  function addBeam() {
    // a pivot on the edge or in the middle, sweeping one way
    const side = Math.random() * 5 | 0, m = 12;
    const px = side === 0 ? m : side === 1 ? W - m : side === 4 ? W / 2 : rnd(m, W - m), py = side === 2 ? 14 + m : side === 3 ? H - m : side === 4 ? H / 2 : rnd(20, H - m);
    const a = Math.atan2(p.y - py, p.x - px) + rnd(-1.2, 1.2);
    beams.push({ x: Math.round(px), y: Math.round(py), a, spin: (Math.random() < .5 ? -1 : 1) * rnd(.5, .9 + t / 80), warn: 1.1, life: rnd(3.5, 6) });
  }
  function newChip() { chip = { x: Math.round(rnd(14, W - 14)), y: Math.round(rnd(26, H - 14)) }; }
  const segDist = (b, x, y) => { const dx = Math.cos(b.a), dy = Math.sin(b.a), u = (x - b.x) * dx + (y - b.y) * dy; if (u < 0) return Math.hypot(x - b.x, y - b.y); return Math.abs((x - b.x) * dy - (y - b.y) * dx); };

  return {
    reset() { p = { x: W / 2, y: H * .7 }; beams = []; score = 0; lives = 3; t = 0; inv = 1; last = null; nextBeam = 1; keys = {}; newChip(); feel.clear(); },
    resize(w, h) { W = w; H = h; p.x = clamp(p.x, 4, W - 4); p.y = clamp(p.y, 18, H - 4); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; inv = Math.max(0, inv - dt);
      const kx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), ky = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      p.x = clamp(p.x + kx * 70 * dt, 4, W - 4); p.y = clamp(p.y + ky * 70 * dt, 18, H - 4);
      nextBeam -= dt;
      const most = Math.min(5, 1 + Math.floor(t / 12));
      if (nextBeam <= 0 && beams.length < most) { addBeam(); nextBeam = Math.max(.8, 2.5 - t / 40); sfx(1200, .05, 'square', .02); }
      for (const b of beams) {
        if (b.warn > 0) { b.warn -= dt; if (b.warn <= 0) { sfx(140, .2, 'sawtooth', .03); haptic('light'); } continue; }
        b.a += b.spin * dt; b.life -= dt;
        if (!inv && segDist(b, p.x, p.y) < 2.5) {
          lives--; inv = 1.5; feel.hurt(p.x, p.y); haptic('error');
          if (lives <= 0) { feel.lose(); return api.over(); }
        }
      }
      beams = beams.filter(b => b.life > 0);
      if (Math.abs(p.x - chip.x) < 6 && Math.abs(p.y - chip.y) < 6) { score++; api.score(score); feel.coin(chip.x, chip.y); haptic('light'); newChip(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let x = 0; x < W; x += 16) c.fillRect(x, 0, 1, H); for (let y = 0; y < H; y += 16) c.fillRect(0, y, W, 1);
      feel.begin(c);
      const L = W + H;
      for (const b of beams) {
        const dx = Math.cos(b.a), dy = Math.sin(b.a);
        if (b.warn > 0) { if (Math.floor(b.warn * 8) % 2) { c.fillStyle = R[1]; for (let k = 6; k < L; k += 5) c.fillRect(Math.round(b.x + dx * k), Math.round(b.y + dy * k), 1, 1); } }
        else { c.fillStyle = R[0]; for (let k = 0; k < L; k++) c.fillRect(Math.round(b.x + dx * k) - 1, Math.round(b.y + dy * k) - 1, 2, 2); }
        c.fillStyle = R[0]; c.fillRect(b.x - 3, b.y - 3, 7, 7); c.fillStyle = R[2]; c.fillRect(b.x - 1, b.y - 1, 3, 3);
      }
      // chip
      c.fillStyle = R[1]; c.fillRect(chip.x - 3, chip.y - 3, 7, 7); c.fillStyle = R[3]; c.fillRect(chip.x - 1, chip.y - 1, 3, 3);
      // spark
      if (!inv || Math.floor(t * 12) % 2) { const x = Math.round(p.x), y = Math.round(p.y); c.fillStyle = R[0]; c.fillRect(x - 2, y - 1, 5, 3); c.fillRect(x - 1, y - 2, 3, 5); c.fillStyle = R[3]; c.fillRect(x, y, 1, 1); }
      feel.end(c, W, H);
      c.fillStyle = R[3]; c.fillRect(0, 0, 36, 11); c.fillRect(W - 24, 0, 24, 11);
      text(c, `${score}`, 4, 3, { color: R[0] });
      for (let i = 0; i < lives; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 3, 4, 4); }
      if (t < 3) text(c, 'DRAG TO MOVE', W / 2, H - 12, { align: 'center', color: R[0] });
    },
    down(x, y) { last = { x, y }; },
    move(x, y, pr) {
      if (!pr || !last) return;
      p.x = clamp(p.x + (x - last.x) * 1.2, 4, W - 4); p.y = clamp(p.y + (y - last.y) * 1.2, 18, H - 4);
      last = { x, y };
    },
    up() { last = null; },
    key(k, d) { keys[k] = d; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'laser-dodge',
  title: 'Laser Dodge',
  tag: 'Pocket · Dodge',
  retro: true, pal: 'mono',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 25,
  hint: 'Drag anywhere to slide your spark. Dotted lines turn into sweeping lasers: dodge them and grab the chips. Three zaps and it is over.',
  make,
};
