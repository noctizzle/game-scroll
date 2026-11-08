import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { PAL } = gs.palettes;

// Climb a shaft by leaping between two walls. Tap to jump across. Spikes grow out of the walls
// and birds fly across the gap. Tapping mid-air does nothing, so time each leap.
const P = PAL.mono, W = 160, H = 160, LW = 22, RW = 138, NY = 112, JUMP = .32;

function make(api) {
  let side, air, things, dist, speed, t, gap, score, trail;
  return {
    reset() { side = 0; air = 0; things = []; dist = 0; speed = 38; t = 0; gap = 40; score = 0; trail = []; },
    update(dt) {
      t += dt; speed = Math.min(95, 38 + dist / 60); const dy = speed * dt; dist += dy;
      const s = Math.floor(dist / 10); if (s !== score) { score = s; api.score(score); }
      gap -= dy;
      if (gap <= 0) {
        const r = Math.random();
        if (r < .72) things.push({ k: 'spike', side: Math.random() < .5 ? 0 : 1, y: -40, len: rnd(16, 34) });
        else things.push({ k: 'bird', y: -10, x: Math.random() < .5 ? LW : RW, dir: 0, ph: 0 });
        gap = rnd(46, 70) * Math.max(.7, 1 - dist / 4000);
      }
      for (const o of things) { o.y += dy; if (o.k === 'bird') { o.ph += dt; if (o.y > 20) { o.dir ||= o.x < 80 ? 1 : -1; o.x += o.dir * 70 * dt; } } }
      things = things.filter(o => o.y < H + 40 && (o.k !== 'bird' || (o.x > 0 && o.x < W)));
      if (air > 0) { air -= dt; if (air <= 0) { air = 0; haptic('light'); sfx(260, .03, 'square', .03); } }
      const nx = air > 0 ? (side ? RW - (RW - LW) * (air / JUMP) : LW + (RW - LW) * (air / JUMP)) : (side ? RW : LW);
      trail.push([nx, NY]); if (trail.length > 6) trail.shift(); for (const p of trail) p[1] += dy;
      for (const o of things) {
        if (o.k === 'spike' && air === 0 && o.side === side && NY > o.y - 4 && NY - 10 < o.y + o.len) return die();
        if (o.k === 'bird' && Math.abs(o.x - nx) < 7 && Math.abs(o.y - (NY - 5)) < 7) return die();
      }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[1]; c.fillRect(0, 0, LW - 4, H); c.fillRect(RW + 4, 0, W - RW - 4, H);
      c.fillStyle = P[2]; for (let y = -16; y < H; y += 16) { const yy = Math.round((y + dist) % 16 + y - y % 16); c.fillRect(0, yy, LW - 4, 1); c.fillRect(RW + 4, yy, W - RW, 1); }
      for (const o of things) {
        c.fillStyle = P[0];
        if (o.k === 'spike') { const x0 = o.side ? RW + 4 : LW - 4, d = o.side ? -1 : 1; for (let y = 0; y < o.len; y += 4) { c.beginPath(); c.moveTo(x0, o.y + y); c.lineTo(x0 + d * 7, o.y + y + 2); c.lineTo(x0, o.y + y + 4); c.fill(); } }
        else { const f = Math.sin(o.ph * 20) > 0; c.fillRect(o.x - 3, o.y - 2, 6, 3); c.fillRect(o.x - 6, o.y - (f ? 4 : 0), 3, 2); c.fillRect(o.x + 3, o.y - (f ? 4 : 0), 3, 2); }
      }
      const nx = air > 0 ? (side ? RW - (RW - LW) * (air / JUMP) : LW + (RW - LW) * (air / JUMP)) : (side ? RW : LW);
      c.fillStyle = P[2]; for (const [x, y] of trail) c.fillRect(Math.round(x) - 2, Math.round(y) - 6, 4, 6);
      c.fillStyle = P[0]; const x = Math.round(nx);
      c.fillRect(x - 3, NY - 10, 7, 10); c.fillStyle = P[3]; c.fillRect(x - 2, NY - 8, 5, 1); c.fillStyle = P[0];
      c.fillRect(x + (side ? 4 : -6), NY - 9, 2, 1);   // headband tail
      if (t < 3) { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = P[1]; c.fillText('TAP TO LEAP', 80, 150); }
    },
    down() { if (air > 0) return; side = 1 - side; air = JUMP; haptic('tick'); sfx(520, .05, 'square', .03, 300); },
    key(k, d) { if (d && (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight') && air === 0) { side = 1 - side; air = JUMP; } },
  };
  function die() { haptic('error'); sfx(140, .3, 'square', .05, -60); api.over(); }
}

export default {
  id: 'ninja-wall', title: 'Ninja Wall', tag: 'Pocket · Action', retro: true, w: W, h: H, pal: 'mono', goal: 60,
  hint: 'Tap to leap to the other wall. Dodge spikes on the walls and birds in the gap. You cannot change direction mid-air.',
  make,
};
