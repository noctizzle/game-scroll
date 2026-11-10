// Lantern Maze: you're in a pitch-dark maze with a little lantern. Tap to flare it: the walls and the
// wandering wisps glow for a moment, then fade from memory. Swipe to walk a square at a time and find
// the exit before the oil runs out. Touch a wisp and your flame goes out.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;
const { Gestures, Keys } = gs.controls;

const R = PAL.ice;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let n, walls, px, py, ex, ey, glow, oil, wisps, level, score, t, seen, dead, moveT, banner, lightR;
  const g = new Gestures({ tap: () => flare(), swipe: dir => step(dir) });
  const keys = new Keys();

  function maze(size) {
    n = size; walls = Array.from({ length: n * n }, () => [1, 1, 1, 1]);   // up right down left
    const vis = new Set([0]), stack = [0];
    while (stack.length) {
      const c = stack[stack.length - 1], cx = c % n, cy = c / n | 0;
      const opts = [[0, cx, cy - 1], [1, cx + 1, cy], [2, cx, cy + 1], [3, cx - 1, cy]].filter(([, x, y]) => x >= 0 && y >= 0 && x < n && y < n && !vis.has(y * n + x));
      if (!opts.length) { stack.pop(); continue; }
      const [d, x, y] = opts[Math.random() * opts.length | 0], k = y * n + x;
      walls[c][d] = 0; walls[k][(d + 2) % 4] = 0; vis.add(k); stack.push(k);
    }
    // knock out a few extra walls so there are loops to dodge wisps in
    for (let i = 0; i < n; i++) { const c = Math.random() * n * n | 0, d = Math.random() * 4 | 0, cx = c % n + [0, 1, 0, -1][d], cy = (c / n | 0) + [-1, 0, 1, 0][d]; if (cx >= 0 && cy >= 0 && cx < n && cy < n) { walls[c][d] = 0; walls[cy * n + cx][(d + 2) % 4] = 0; } }
  }
  function newLevel() {
    maze(Math.min(10, 5 + level));
    px = 0; py = 0; ex = n - 1; ey = n - 1;
    if (Math.random() < .5) { ex = n - 1; ey = Math.random() * n | 0; }
    wisps = Array.from({ length: Math.min(4, level) }, () => ({ x: 2 + Math.random() * (n - 2) | 0, y: 2 + Math.random() * (n - 2) | 0, t: Math.random() }));
    seen = new Float32Array(n * n); glow = 0; oil = Math.max(4, 8 - level * .3 | 0) + 1;
    banner = { txt: `MAZE ${level}`, l: 1.2 }; flare(true);
  }
  function flare(free) {
    if (dead || banner?.next) return;
    if (!free) { if (oil <= 0) { sfx(120, .1, 'square', .03); haptic('warning'); return; } oil--; }
    glow = 1; lightR = 2.5 + level * .1;
    for (let i = 0; i < n * n; i++) { const d = Math.hypot(i % n - px, (i / n | 0) - py); if (d < lightR + 1.5) seen[i] = Math.max(seen[i], 1 - d / (lightR + 2.5)); }
    sfx(700, .25, 'sine', .04, 500); haptic('light');
  }
  function step(dir) {
    if (dead || banner?.next) return;
    const d = { up: 0, right: 1, down: 2, left: 3 }[dir]; if (d == null) return;
    if (walls[py * n + px][d]) { sfx(90, .06, 'square', .04); haptic('medium'); feel.juice.shake(2); seen[py * n + px] = 1; return; }
    px += [0, 1, 0, -1][d]; py += [-1, 0, 1, 0][d]; moveT = .1; sfx(240, .03, 'square', .02); haptic('tick');
    seen[py * n + px] = Math.max(seen[py * n + px], .9);
    if (px === ex && py === ey) { score += 3 + oil; api.score(score); feel.win(W / 2, H / 2); banner = { txt: 'OUT!', sub: `+${3 + oil}`, l: 1.3, next: true }; }
  }

  return {
    reset() { level = 1; score = 0; t = 0; dead = 0; moveT = 0; g.release(); keys.clear(); feel.clear(); newLevel(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); g.update(); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const nx = banner.next; banner = null; if (nx) { level++; newLevel(); } } }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      glow = Math.max(0, glow - dt * .7);
      for (let i = 0; i < seen.length; i++) seen[i] = Math.max(0, seen[i] - dt * .09);   // memory fades
      if (moveT > 0) moveT -= dt;
      // wisps drift through the maze, a cell at a time, not caring about walls
      for (const w of wisps) {
        w.t += dt * (.45 + level * .05);
        if (w.t >= 1) { w.t = 0; const dx = Math.sign(px - w.x), dy = Math.sign(py - w.y); if (Math.random() < .55) { if (Math.random() < .5 && dx) w.x += dx; else if (dy) w.y += dy; else w.x += dx; } else { const d = Math.random() * 4 | 0; w.x = Math.max(0, Math.min(n - 1, w.x + [0, 1, 0, -1][d])); w.y = Math.max(0, Math.min(n - 1, w.y + [-1, 0, 1, 0][d])); } }
        if (w.x === px && w.y === py && !banner?.next) { dead = .01; feel.lose(); haptic('error'); }
      }
    },
    draw(c) {
      c.fillStyle = R[0]; c.fillRect(0, 0, W, H);
      const top = 12, cs = Math.floor(Math.min((W - 8) / n, (H - top - 6) / n)), ox = Math.round((W - cs * n) / 2), oy = top + Math.round((H - top - cs * n) / 2);
      feel.begin(c);
      for (let i = 0; i < n * n; i++) {
        const cx = i % n, cy = i / n | 0, d = Math.hypot(cx - px, cy - py);
        const lit = Math.max(seen[i] * .9, glow * Math.max(0, 1 - d / (lightR + 1.5)));
        if (lit < .08) continue;
        const x = ox + cx * cs, y = oy + cy * cs, col = lit > .6 ? R[3] : lit > .3 ? R[2] : R[1];
        c.fillStyle = R[1]; if (lit > .4) c.fillRect(x + (cs >> 1), y + (cs >> 1), 1, 1);
        c.fillStyle = col; const wl = walls[i];
        if (wl[0]) c.fillRect(x, y, cs + 1, 1); if (wl[1]) c.fillRect(x + cs, y, 1, cs + 1); if (wl[2]) c.fillRect(x, y + cs, cs + 1, 1); if (wl[3]) c.fillRect(x, y, 1, cs + 1);
      }
      // exit door always faintly glows
      c.fillStyle = (t * 3 | 0) % 2 ? R[2] : R[3]; c.fillRect(ox + ex * cs + 2, oy + ey * cs + 2, cs - 3, cs - 3); c.fillStyle = R[0]; c.fillRect(ox + ex * cs + (cs >> 1), oy + ey * cs + 3, 1, cs - 5);
      // wisps show only in the light
      for (const w of wisps) { const d = Math.hypot(w.x - px, w.y - py), vis = glow * (1 - d / (lightR + 2)); if (vis > .1 || dead) { const x = ox + w.x * cs + (cs >> 1), y = oy + w.y * cs + (cs >> 1) + ((t * 4 | 0) % 2); c.fillStyle = R[3]; c.fillRect(x - 2, y - 2, 4, 4); c.fillRect(x - 1, y + 2, 2, 2); c.fillStyle = R[0]; c.fillRect(x - 1, y - 1, 1, 1); c.fillRect(x + 1, y - 1, 1, 1); } }
      // you and your lantern
      const x = ox + px * cs + (cs >> 1), y = oy + py * cs + (cs >> 1);
      c.fillStyle = dead ? R[1] : R[3]; c.fillRect(x - 2, y - 2, 4, 5); c.fillStyle = R[2]; c.fillRect(x + 2, y - 1, 2, 3);
      feel.end(c, W, H);
      text(c, 'OIL', 4, 3, { color: R[2] }); for (let i = 0; i < oil; i++) { c.fillStyle = R[3]; c.fillRect(18 + i * 5, 3, 3, 5); }
      text(c, `M${level}`, W - 4, 3, { color: R[2], align: 'right' });
      if (banner) { text(c, banner.txt, W / 2, H / 2 - 8, { font: 'big', align: 'center', color: R[3], outline: R[0] }); if (banner.sub) text(c, banner.sub, W / 2, H / 2 + 6, { align: 'center', color: R[3], outline: R[0] }); }
      else if (t < 3.5 && level === 1) { text(c, 'SWIPE TO WALK', W / 2, H - 20, { align: 'center', color: R[3], outline: R[0] }); text(c, 'TAP TO FLARE', W / 2, H - 12, { align: 'center', color: R[3], outline: R[0] }); }
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
    key(k, d) { if (!d) return; const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k]; if (m) step(m); if (k === ' ') flare(); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'lantern-maze',
  title: 'Lantern Maze',
  tag: 'Pocket · Maze',
  retro: true, pal: 'ice',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 20,
  hint: 'Swipe to walk the dark maze, tap to flare your lantern and see the walls for a moment. Find the door and dodge the wisps.',
  make,
};
