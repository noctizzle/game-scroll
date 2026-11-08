import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { heading, want, haptic } = gs.device;
const { clamp, rnd, disc } = gs.util;
const { PAL } = gs.palettes;

// A signal appears somewhere around you. Physically turn until it's dead ahead and hold steady to lock on. No compass? Drag sideways to turn.
const R = PAL.mint, W = 160, H = 160, CX = 80, CY = 86, RAD = 58;

function make(api) {
  want('motion');
  let target, lock, timer, score, t, manual, dragX, sweep, dead, lastTick;
  const my = () => { const h = heading(); return h == null ? manual : h; };
  function next() { target = (my() + rnd(70, 290)) % 360; lock = 0; timer = Math.max(4, 9 - score * .4); }
  return {
    reset() { score = 0; t = 0; manual = 0; dragX = null; sweep = 0; dead = 0; lastTick = 0; next(); },
    update(dt) {
      t += dt; timer -= dt; sweep = (sweep + dt * 220) % 360;
      let diff = ((target - my() + 540) % 360) - 180;
      if (Math.abs(diff) < 12) { lock += dt; if (t - lastTick > .15) { lastTick = t; haptic('tick'); } }
      else { lock = Math.max(0, lock - dt * 2); if (t - lastTick > clamp(Math.abs(diff) / 180, .15, 1)) { lastTick = t; sfx(300 + (180 - Math.abs(diff)) * 4, .03, 'square', .02); } }
      if (lock > .7) { score++; api.score(score); haptic('success'); sfx(990, .2, 'square', .05, 300); next(); }
      if (timer <= 0) { haptic('error'); sfx(110, .5, 'sawtooth', .05, -50); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; disc(c, CX, CY, RAD); c.fillStyle = R[3]; disc(c, CX, CY, RAD - 2);
      c.fillStyle = R[2]; for (const k of [20, 40]) for (let a = 0; a < 6.28; a += .12) c.fillRect(Math.round(CX + Math.cos(a) * k), Math.round(CY + Math.sin(a) * k), 1, 1);
      for (let i = 0; i < RAD; i++) { const a = (sweep - 90) * Math.PI / 180; c.fillStyle = R[2]; c.fillRect(Math.round(CX + Math.cos(a) * i), Math.round(CY + Math.sin(a) * i), 1, 1); }
      // north marker rotates opposite to your heading
      const nA = (-my() - 90) * Math.PI / 180; c.fillStyle = R[1]; c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('N', Math.round(CX + Math.cos(nA) * (RAD - 8)), Math.round(CY + Math.sin(nA) * (RAD - 8)) + 3);
      const rel = ((target - my() + 540) % 360) - 180, tA = (rel - 90) * Math.PI / 180, tr = RAD - 14;
      if ((t * 6 | 0) % 2 || Math.abs(rel) < 12) { c.fillStyle = R[0]; disc(c, CX + Math.cos(tA) * tr, CY + Math.sin(tA) * tr, 3); }
      c.fillStyle = R[0]; c.fillRect(CX - 1, CY - RAD - 6, 2, 8); c.fillRect(CX - 3, CY - 1, 6, 2); c.fillRect(CX - 1, CY - 3, 2, 6);
      c.fillStyle = R[1]; c.fillRect(20, 147, 120, 3); c.fillStyle = R[0]; c.fillRect(20, 147, 120 * clamp(lock / .7, 0, 1), 3);
      c.fillStyle = timer < 2 && (t * 4 | 0) % 2 ? R[1] : R[0]; c.fillRect(20, 153, Math.max(0, 120 * timer / 9), 3);
      if (heading() == null) { c.fillStyle = R[1]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText('DRAG', 4, 10); }
    },
    down(x) { dragX = x; },
    move(x, y, p) { if (p && dragX != null) { manual = (manual + (x - dragX) * 2.2 + 360) % 360; dragX = x; } },
    up() { dragX = null; },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') manual = (manual - 15 + 360) % 360; if (k === 'ArrowRight') manual = (manual + 15) % 360; },
  };
}

export default {
  id: 'compass-hunt', title: 'Compass Hunt', tag: 'Pocket · Motion', retro: true, w: W, h: H, pal: 'mint', goal: 5,
  hint: 'Turn your whole body until the blip is straight ahead, then hold still to lock on.',
  make,
};
