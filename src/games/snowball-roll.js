import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// Roll a snowball down the slope. It grows on fresh snow and shrinks on bare patches. Small balls
// shatter on fences, big ones smash through. Rocks stop anything. Drag to steer.
const P = PAL.ice, W = 160, H = 160, BY = 46;

function make(api) {
  let bx, size, things, dist, t, drag, spawn, score, smash, trail;
  function add() {
    const r = Math.random(), x = rnd(12, W - 12);
    if (r < .35) things.push({ k: 'snow', x, y: H + 10, w: rnd(20, 40), h: rnd(14, 26) });
    else if (r < .55) things.push({ k: 'bare', x, y: H + 10, w: rnd(24, 44), h: rnd(10, 20) });
    else if (r < .8) things.push({ k: 'fence', x, y: H + 10, w: rnd(24, 46), need: Math.round(rnd(6, 9 + dist / 400)) });
    else things.push({ k: 'rock', x, y: H + 10, r: rnd(4, 7) });
  }
  return {
    reset() { bx = 80; size = 4; things = []; dist = 0; t = 0; drag = null; spawn = 0; score = 0; smash = []; trail = []; },
    update(dt) {
      t += dt; const speed = 45 + size * 4 + Math.min(40, dist / 60), dy = speed * dt; dist += dy;
      const s = Math.floor(dist / 25); if (s !== score) { score = s; api.score(score); }
      if (drag) bx += clamp(drag.x - bx, -90 * dt, 90 * dt); bx = clamp(bx, size, W - size);
      spawn -= dy; if (spawn <= 0) { spawn = rnd(18, 34); add(); }
      for (const o of things) o.y -= dy;
      trail.push({ x: bx, y: BY, r: size }); for (const p of trail) p.y -= dy; trail = trail.filter(p => p.y > -10);
      size = Math.max(2.5, size - dt * .25);
      for (const o of things) {
        if (o.done) continue;
        if (o.k === 'snow' || o.k === 'bare') { if (Math.abs(o.x - bx) < o.w / 2 && Math.abs(o.y - BY) < o.h / 2) { size = clamp(size + (o.k === 'snow' ? 3.5 : -4) * dt, 2.5, 16); if (o.k === 'snow' && Math.random() < dt * 8) haptic('tick'); } }
        else if (o.k === 'fence' && Math.abs(o.y - BY) < size && Math.abs(o.x - bx) < o.w / 2 + size * .6) {
          o.done = true;
          if (size >= o.need) { size -= 1; haptic('medium'); sfx(160, .15, 'square', .05, -60); for (let i = 0; i < 6; i++) smash.push({ x: bx + rnd(-8, 8), y: BY, vx: rnd(-60, 60), vy: rnd(-80, -20), l: .6 }); }
          else { haptic('error'); sfx(110, .4, 'square', .05, -40); return api.over(); }
        }
        else if (o.k === 'rock' && Math.hypot(o.x - bx, o.y - BY) < o.r + size * .8) { haptic('error'); sfx(90, .4, 'square', .06, -30); return api.over(); }
      }
      things = things.filter(o => o.y > -30);
      for (const p of smash) { p.vy += 200 * dt; p.x += p.vx * dt; p.y += p.vy * dt - dy; p.l -= dt; } smash = smash.filter(p => p.l > 0);
    },
    draw(c) {
      c.fillStyle = P[2]; c.fillRect(0, 0, W, H);
      for (const o of things) {
        if (o.k === 'snow') { c.fillStyle = P[3]; c.beginPath(); c.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, 7); c.fill(); }
        if (o.k === 'bare') { c.fillStyle = P[1]; c.beginPath(); c.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, 7); c.fill(); }
      }
      for (const p of trail) { c.fillStyle = P[1]; c.fillRect(Math.round(p.x - p.r * .6), Math.round(p.y), Math.max(1, Math.round(p.r * 1.2)), 1); }
      for (const o of things) {
        if (o.k === 'fence' && !o.done) {
          c.fillStyle = P[0]; c.fillRect(Math.round(o.x - o.w / 2), Math.round(o.y) - 1, Math.round(o.w), 2); for (let x = -o.w / 2; x <= o.w / 2; x += 6) c.fillRect(Math.round(o.x + x), Math.round(o.y) - 4, 2, 6);
          c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(String(o.need), o.x, o.y + 11);
        }
        if (o.k === 'rock') { c.fillStyle = P[0]; c.beginPath(); c.arc(o.x, o.y, o.r, 0, 7); c.fill(); }
      }
      c.fillStyle = P[3]; c.beginPath(); c.arc(bx, BY, size, 0, 7); c.fill(); c.strokeStyle = P[1]; c.lineWidth = 1; c.stroke();
      c.fillStyle = P[2]; const a = dist / Math.max(3, size); c.fillRect(Math.round(bx + Math.cos(a) * size * .5), Math.round(BY + Math.sin(a) * size * .5), 2, 2);
      for (const p of smash) { c.fillStyle = P[0]; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 1); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[0]; c.fillText(`SIZE ${Math.floor(size)}`, 4, 10);
      if (t < 4) { c.textAlign = 'center'; c.fillText('DRAG TO STEER', 80, 154); }
    },
    down(x) { drag = { x }; },
    move(x) { if (drag) drag.x = x; },
    up() { drag = null; },
    key(k, d) { if (k === 'ArrowLeft' || k === 'ArrowRight') drag = d ? { x: k === 'ArrowLeft' ? 0 : W } : null; },
  };
}

export default {
  id: 'snowball-roll', title: 'Snowball Roll', tag: 'Pocket · Action', retro: true, w: W, h: H, pal: 'ice', goal: 40,
  hint: 'Drag to steer. White patches grow your snowball, bare ground shrinks it. Fences show the size you need to smash through. Rocks stop you dead.',
  make,
};
