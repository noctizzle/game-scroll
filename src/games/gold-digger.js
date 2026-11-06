import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// Dig down through the dirt for gold. Tap left, right or below the miner to dig that way. Boulders
// fall when you dig out what holds them up, so don't stand under one. Your lamp oil runs low as you go.
const P = PAL.amber, W = 160, CS = 10, COLS = 16;
let H = 160, VIEW = 15;

function make(api) {
  let map, mx, my, cam, oil, gold, t, rocks, deepest, flash;
  // 0 empty, 1 dirt, 2 gold, 3 boulder, 4 oil can
  function row(y) {
    if (y < 2) return Array(COLS).fill(0);
    return Array.from({ length: COLS }, () => { const r = Math.random(); return r < .06 + Math.min(.08, y / 400) ? 3 : r < .14 + Math.min(.06, y / 500) ? 2 : r < .155 ? 4 : 1; });
  }
  const at = (x, y) => { while (map.length <= y) map.push(row(map.length)); return x < 0 || x >= COLS ? 9 : map[y][x]; };
  function set(x, y, v) { at(x, y); map[y][x] = v; }
  function dig(dx, dy) {
    const nx = mx + dx, ny = my + dy, cell = at(nx, ny);
    if (cell === 9 || cell === 3 || ny < 0) { haptic('tick'); return; }
    if (cell === 2) { gold += 1; api.score(gold); haptic('success'); sfx(1000, .08, 'square', .04, 200); flash = .2; }
    if (cell === 4) { oil = Math.min(1, oil + .35); haptic('medium'); sfx(500, .1, 'square', .04, 200); }
    if (cell === 1) { haptic('light'); sfx(150, .03, 'square', .03); oil -= .004; }
    set(nx, ny, 0); mx = nx; my = ny;
    while (at(mx, my + 1) === 0) my++;   // fall down open shafts
    if (my > deepest) { deepest = my; }
    // wake any boulders that just lost their support
    for (let y = Math.max(0, my - 6); y <= my + 1; y++) for (let x = 0; x < COLS; x++) if (at(x, y) === 3 && at(x, y + 1) === 0 && !rocks.some(r => r.x === x && Math.round(r.y) === y)) rocks.push({ x, y, vy: 0, wait: .5 });
  }
  return {
    reset() { map = []; mx = 8; my = 1; cam = 0; oil = 1; gold = 0; t = 0; rocks = []; deepest = 1; flash = 0; at(0, 30); },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); oil -= dt * (.018 + Math.min(.02, my / 3000)); if (oil <= 0) { haptic('error'); return api.over(); }
      for (const r of rocks) {
        if (r.wait > 0) { r.wait -= dt; continue; }
        const cy = Math.round(r.y); if (map[cy]?.[r.x] === 3) map[cy][r.x] = 0;
        r.vy += 60 * dt; r.y += r.vy * dt; const ny = Math.floor(r.y);
        if (r.x === mx && Math.abs(r.y - my) < .8) { haptic('heavy'); sfx(70, .5, 'square', .06, -20); return api.over(); }
        if (at(r.x, ny + 1) !== 0 || (r.x === mx && ny + 1 === my && false)) { r.done = true; set(r.x, ny, 3); sfx(90, .15, 'square', .04); haptic('medium'); }
      }
      rocks = rocks.filter(r => !r.done);
      cam += (Math.max(0, my - Math.floor(VIEW * .4)) - cam) * Math.min(1, dt * 6);
    },
    draw(c) {
      c.fillStyle = flash ? P[3] : P[2]; c.fillRect(0, 0, W, H);
      const y0 = Math.floor(cam);
      for (let y = y0; y < y0 + VIEW + 2; y++) for (let x = 0; x < COLS; x++) {
        const v = at(x, y), px = x * CS, py = Math.round((y - cam) * CS) + 10; if (v === 0) continue;
        if (v === 1) { c.fillStyle = P[1]; c.fillRect(px, py, CS, CS); c.fillStyle = P[0]; c.fillRect(px + 2, py + 3, 1, 1); c.fillRect(px + 6, py + 7, 1, 1); }
        if (v === 2) { c.fillStyle = P[1]; c.fillRect(px, py, CS, CS); c.fillStyle = P[3]; c.fillRect(px + 3, py + 3, 4, 3); c.fillRect(px + 2, py + 5, 2, 2); }
        if (v === 3) { const falling = rocks.some(r => r.x === x && Math.floor(r.y) === y); if (!falling) { c.fillStyle = P[0]; c.beginPath(); c.arc(px + 5, py + 5, 5, 0, 7); c.fill(); } }
        if (v === 4) { c.fillStyle = P[1]; c.fillRect(px, py, CS, CS); c.fillStyle = P[0]; c.fillRect(px + 3, py + 2, 4, 6); c.fillStyle = P[3]; c.fillRect(px + 4, py + 4, 2, 2); }
      }
      for (const r of rocks) { const py = Math.round((r.y - cam) * CS) + 10; c.fillStyle = P[0]; c.beginPath(); c.arc(r.x * CS + 5 + (r.wait > 0 ? Math.sin(t * 60) : 0), py + 5, 5, 0, 7); c.fill(); }
      const px = mx * CS, py = Math.round((my - cam) * CS) + 10;
      c.fillStyle = P[0]; c.fillRect(px + 2, py + 2, 6, 8); c.fillStyle = P[3]; c.fillRect(px + 2, py, 6, 3); c.fillRect(px + 4, py - 1, 2, 1);
      // lamp glow: darken far away
      const g = c.createRadialGradient(px + 5, py + 5, 10, px + 5, py + 5, 30 + oil * 70); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, P[0]); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = P[0]; c.fillRect(0, 0, W, 10); c.font = '6px "Press Start 2P", monospace'; c.fillStyle = P[3]; c.textAlign = 'left'; c.fillText(`${my}m`, 3, 8);
      c.fillStyle = P[1]; c.fillRect(110, 3, 46, 4); c.fillStyle = oil < .25 ? P[2] : P[3]; c.fillRect(110, 3, 46 * Math.max(0, oil), 4);
      if (t < 4) { c.fillStyle = P[3]; c.textAlign = 'center'; c.fillText('TAP A SIDE TO DIG', 80, H - 6); }
    },
    resize(w, h) { H = h; VIEW = Math.ceil(h / CS); },
    down(x, y) {
      const px = mx * CS + 5, py = (my - cam) * CS + 15, dx = x - px, dy = y - py;
      if (Math.abs(dx) > Math.abs(dy)) dig(dx > 0 ? 1 : -1, 0); else if (dy > 0) dig(0, 1); else { haptic('tick'); }
    },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') dig(-1, 0); if (k === 'ArrowRight') dig(1, 0); if (k === 'ArrowDown' || k === ' ') dig(0, 1); },
  };
}

export default {
  id: 'gold-digger', title: 'Gold Digger', tag: 'Pocket · Puzzle', retro: true, w: 160, h: 160, maxH: 240, pal: 'amber', goal: 20,
  hint: 'Tap left, right or below the miner to dig. Grab gold and oil cans for your lamp. Boulders fall when you dig out what is under them, so step aside.',
  make,
};
