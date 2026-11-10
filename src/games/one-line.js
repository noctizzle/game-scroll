// One Line: draw over every line of the shape in one stroke, never going over a line twice. Start on a
// dot and drag from dot to dot. Lift your finger and the stroke starts again. Odd dots (an odd number
// of lines) are the only places a full stroke can start and end.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 160, H = 176;
const GX = 4, GY = 4;

function make(api) {
  const feel = new Feel({ pixel: true });
  let edges, used, path, level, score, time, t, done, finger;
  const geo = () => { const s = Math.floor(Math.min((W - 24) / (GX - 1), (H - 50) / (GY - 1))), x = Math.round((W - s * (GX - 1)) / 2), y = Math.round(26 + (H - 40 - s * (GY - 1)) / 2); return { s, x, y }; };
  const pos = i => { const { s, x, y } = geo(); return [x + (i % GX) * s, y + (i / GX | 0) * s]; };
  const ek = (a, b) => a < b ? a + '-' + b : b + '-' + a;

  function newShape() {
    // a random walk over the dot grid (moves to any of the 8 neighbours) is always drawable in one go
    const want = Math.min(16, 5 + level);
    for (let tries = 0; tries < 200; tries++) {
      edges = new Map(); let cur = Math.random() * GX * GY | 0, stuck = 0;
      while (edges.size < want && stuck < 50) {
        const cx = cur % GX, cy = cur / GX | 0, dx = (Math.random() * 3 | 0) - 1, dy = (Math.random() * 3 | 0) - 1, nx = cx + dx, ny = cy + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= GX || ny >= GY) { stuck++; continue; }
        const nxt = ny * GX + nx, k = ek(cur, nxt);
        // no crossing diagonals (the two diagonals of one square)
        if (dx && dy && edges.has(ek(cy * GX + nx, ny * GX + cx))) { stuck++; continue; }
        if (edges.has(k)) { stuck++; continue; }
        edges.set(k, [cur, nxt]); cur = nxt; stuck = 0;
      }
      if (edges.size >= want) break;
    }
    used = new Set(); path = []; done = 0;
  }
  const degree = i => [...edges.values()].filter(([a, b]) => a === i || b === i).length;
  const dotAt = (x, y) => { for (let i = 0; i < GX * GY; i++) { const [px, py] = pos(i); if (Math.hypot(px - x, py - y) < 11 && degree(i) > 0) return i; } return -1; };

  return {
    reset() { level = 1; score = 0; time = 60; t = 0; finger = null; feel.clear(); newShape(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (done) { done -= dt; if (done <= 0) { level++; newShape(); } return; }
      time -= dt;
      if (time <= 0) { feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = C16[0]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (const [k, [a, b]] of edges) {
        const [x1, y1] = pos(a), [x2, y2] = pos(b), n = Math.ceil(Math.hypot(x2 - x1, y2 - y1)), on = used.has(k);
        c.fillStyle = on ? C16[4] : C16[13];
        for (let i = 0; i <= n; i += on ? 1 : 3) { const u = i / n; c.fillRect(Math.round(x1 + (x2 - x1) * u) - 1, Math.round(y1 + (y2 - y1) * u) - 1, on ? 3 : 2, on ? 3 : 2); }
      }
      if (finger && path.length) { const [x1, y1] = pos(path[path.length - 1]), n = Math.ceil(Math.hypot(finger[0] - x1, finger[1] - y1)); c.fillStyle = C16[3]; for (let i = 0; i <= n; i += 2) { const u = i / Math.max(1, n); c.fillRect(Math.round(x1 + (finger[0] - x1) * u), Math.round(y1 + (finger[1] - y1) * u), 1, 1); } }
      for (let i = 0; i < GX * GY; i++) {
        const d = degree(i); if (!d) continue; const [x, y] = pos(i), odd = d % 2 === 1, head = path[path.length - 1] === i;
        c.fillStyle = head ? C16[4] : odd ? C16[10] : C16[14]; c.fillRect(x - 3, y - 3, 7, 7); c.fillStyle = C16[0]; c.fillRect(x - 1, y - 1, 3, 3);
        if (head) { c.fillStyle = C16[4]; c.fillRect(x - 1, y - 1, 3, 3); }
      }
      feel.end(c, W, H);
      text(c, `${used.size}/${edges.size}`, 4, 4, { color: C16[14] });
      text(c, `${Math.max(0, Math.ceil(time))}S`, W - 4, 4, { color: time < 10 ? C16[2] : C16[4], align: 'right' });
      if (done) text(c, 'ONE LINE!', W / 2, H - 14, { font: 'big', align: 'center', color: C16[4] });
      else if (level <= 2 && t < 6) text(c, 'PINK DOTS: START OR END', W / 2, H - 10, { align: 'center', color: C16[10] });
    },
    down(x, y) {
      if (done) return;
      used = new Set(); path = [];
      const i = dotAt(x, y); if (i >= 0) { path = [i]; finger = [x, y]; sfx(500, .03, 'square', .02); haptic('tick'); }
    },
    move(x, y, p) {
      if (!p || done || !path.length) return;
      finger = [x, y];
      const i = dotAt(x, y), cur = path[path.length - 1];
      if (i < 0 || i === cur) return;
      const k = ek(cur, i);
      if (!edges.has(k)) return;
      if (used.has(k)) { haptic('warning'); return; }
      used.add(k); path.push(i); sfx(500 + used.size * 40, .04, 'square', .03); haptic('light');
      if (used.size === edges.size) {
        const pts = 2 + Math.floor(edges.size / 3); score += pts; api.score(score); time += 8; done = 1.2;
        notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, H / 2); haptic('success'); finger = null;
      }
    },
    up() {
      if (done || !path.length) return;
      if (used.size && used.size < edges.size) { feel.juice.pop(W / 2, H - 20, 'TRY AGAIN', { color: C16[2] }); sfx(160, .1, 'square', .03); }
      used = new Set(); path = []; finger = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'one-line',
  title: 'One Line',
  tag: 'Color · Puzzle',
  retro: true, era: 'color', pal: 'berry',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Drag from dot to dot to trace every line in one stroke without going over any line twice. Start on a pink dot if there is one.',
  make,
};
