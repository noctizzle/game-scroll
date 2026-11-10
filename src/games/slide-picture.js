// Slide Picture: a little pixel picture is cut into tiles and shuffled, with one tile missing. Tap a
// tile next to the gap to slide it in. Put the picture back together; the fewer moves, the more it
// scores. Pictures grow from 3x3 to 4x4 boards.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 160, H = 176;

// Pictures drawn in code onto a 96 x 96 square (made from fillRects so they stay crisp)
const PICS = [
  (c, t) => { // sunset over the sea
    c.fillStyle = C16[3]; c.fillRect(0, 0, 96, 48); c.fillStyle = C16[2]; c.fillRect(0, 30, 96, 18); c.fillStyle = C16[4]; c.fillRect(34, 26, 28, 28);
    c.fillStyle = C16[8]; c.fillRect(0, 48, 96, 48); c.fillStyle = C16[7]; for (let y = 52; y < 96; y += 6) c.fillRect((y * 7) % 30, y, 40, 2);
    c.fillStyle = C16[0]; c.fillRect(14, 60, 22, 6); c.fillRect(24, 46, 2, 14); c.fillStyle = C16[1]; c.fillRect(26, 48, 10, 10);
    c.fillStyle = C16[1]; c.fillRect(70, 12, 6, 2); c.fillRect(66, 10, 4, 2); c.fillRect(76, 10, 4, 2);
  },
  (c) => { // cottage
    c.fillStyle = C16[7]; c.fillRect(0, 0, 96, 60); c.fillStyle = C16[5]; c.fillRect(0, 60, 96, 36); c.fillStyle = C16[6]; c.fillRect(0, 60, 96, 4);
    c.fillStyle = C16[1]; c.fillRect(10, 10, 18, 6); c.fillRect(14, 6, 10, 4); c.fillRect(62, 16, 22, 6);
    c.fillStyle = C16[14]; c.fillRect(24, 40, 48, 34); c.fillStyle = C16[2]; for (let i = 0; i < 18; i++) c.fillRect(20 + i, 40 - i, 56 - i * 2, 1);
    c.fillStyle = C16[11]; c.fillRect(42, 54, 12, 20); c.fillStyle = C16[7]; c.fillRect(28, 46, 10, 10); c.fillRect(58, 46, 10, 10);
    c.fillStyle = C16[4]; c.fillRect(8, 78, 4, 4); c.fillRect(80, 82, 4, 4); c.fillStyle = C16[10]; c.fillRect(16, 84, 4, 4); c.fillRect(70, 76, 4, 4);
  },
  (c) => { // goldfish bowl
    c.fillStyle = C16[9]; c.fillRect(0, 0, 96, 96); c.fillStyle = C16[11]; c.fillRect(0, 80, 96, 16);
    c.fillStyle = C16[7]; c.fillRect(18, 24, 60, 56); c.fillRect(24, 18, 48, 68); c.fillStyle = C16[8]; c.fillRect(24, 70, 48, 10);
    c.fillStyle = C16[3]; c.fillRect(36, 40, 22, 14); c.fillRect(58, 36, 10, 22); c.fillStyle = C16[1]; c.fillRect(40, 44, 4, 4); c.fillStyle = C16[0]; c.fillRect(41, 45, 2, 2);
    c.fillStyle = C16[1]; c.fillRect(30, 30, 4, 4); c.fillRect(28, 22, 2, 2); c.fillStyle = C16[5]; c.fillRect(66, 62, 4, 12); c.fillRect(30, 60, 4, 14);
  },
  (c) => { // rocket at night
    c.fillStyle = C16[0]; c.fillRect(0, 0, 96, 96); c.fillStyle = C16[1]; for (let i = 0; i < 30; i++) c.fillRect((i * 37) % 96, (i * 53) % 96, 1, 1);
    c.fillStyle = C16[14]; c.fillRect(70, 10, 16, 16); c.fillStyle = C16[13]; c.fillRect(74, 14, 4, 4);
    c.fillStyle = C16[14]; c.fillRect(38, 24, 20, 44); c.fillStyle = C16[2]; for (let i = 0; i < 12; i++) c.fillRect(48 - i, 12 + i, i * 2, 1); c.fillRect(30, 56, 8, 16); c.fillRect(58, 56, 8, 16);
    c.fillStyle = C16[7]; c.fillRect(43, 34, 10, 10); c.fillStyle = C16[3]; c.fillRect(40, 68, 16, 8); c.fillStyle = C16[4]; c.fillRect(44, 76, 8, 10);
  },
  (c) => { // mushroom forest
    c.fillStyle = C16[6]; c.fillRect(0, 0, 96, 96); c.fillStyle = C16[15]; for (let x = 0; x < 96; x += 16) c.fillRect(x + 4, 0, 6, 70);
    c.fillStyle = C16[11]; c.fillRect(0, 70, 96, 26);
    c.fillStyle = C16[14]; c.fillRect(40, 54, 16, 20); c.fillStyle = C16[2]; c.fillRect(24, 36, 48, 18); c.fillRect(30, 30, 36, 6);
    c.fillStyle = C16[1]; c.fillRect(32, 38, 8, 6); c.fillRect(54, 34, 6, 6); c.fillRect(46, 44, 6, 4);
    c.fillStyle = C16[4]; c.fillRect(12, 64, 8, 6); c.fillRect(76, 60, 10, 10); c.fillStyle = C16[14]; c.fillRect(15, 70, 2, 6); c.fillRect(80, 70, 2, 6);
  },
];

function make(api) {
  const feel = new Feel({ pixel: true });
  let time, n, tiles, gap, pic, moves, score, t, done, level, slide, peek;
  const geo = () => { const k = Math.max(1, Math.floor(Math.min(W - 16, H - 44) / 96)), s = 96 * k / n, x = Math.round((W - s * n) / 2), y = Math.round(22 + (H - 34 - s * n) / 2); return { s, x, y }; };
  const solvedNow = () => tiles.every((v, i) => v === i);

  function newPic() {
    n = level < 3 ? 3 : 4; pic = PICS[(level - 1) % PICS.length];
    tiles = Array.from({ length: n * n }, (_, i) => i); gap = n * n - 1;
    // shuffle by real moves so it can always be solved
    let last = -1;
    for (let k = 0; k < (n === 3 ? 40 : 90); k++) {
      const gx = gap % n, gy = gap / n | 0;
      const opts = [[gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && y * n + x !== last);
      const [x, y] = opts[Math.random() * opts.length | 0], j = y * n + x;
      [tiles[gap], tiles[j]] = [tiles[j], tiles[gap]]; last = gap; gap = j;
    }
    if (solvedNow()) return newPic();
    moves = 0; done = 0; slide = null; peek = 1.2;
  }

  return {
    reset() { level = 1; score = 0; t = 0; time = 75; feel.clear(); newPic(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (peek > 0) peek -= dt;
      if (slide) { slide.k += dt * 12; if (slide.k >= 1) slide = null; }
      if (done) { done -= dt; if (done <= 0) { level++; newPic(); } return; }
      if (peek <= 0) { time -= dt; if (time <= 0) { feel.lose(); return api.over(); } if (time < 6 && Math.floor(time + dt) !== Math.floor(time)) sfx(900, .04, 'square', .03); }
    },
    draw(c) {
      c.fillStyle = C16[12]; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[11]; for (let y = 0; y < H; y += 8) c.fillRect(0, y, W, 1);
      const { s, x: X, y: Y } = geo(), sc = s * n / 96;
      c.fillStyle = C16[0]; c.fillRect(X - 3, Y - 3, s * n + 6, s * n + 6);
      feel.begin(c);
      if (peek > 0 || done) {
        c.save(); c.translate(X, Y); c.scale(sc, sc); pic(c, t); c.restore();
      } else {
        for (let i = 0; i < n * n; i++) {
          const v = tiles[i]; if (v === n * n - 1) continue;
          let tx = X + (i % n) * s, ty = Y + (i / n | 0) * s;
          if (slide && slide.to === i) { tx += (slide.fx - (i % n)) * s * (1 - slide.k); ty += (slide.fy - (i / n | 0)) * s * (1 - slide.k); }
          tx = Math.round(tx); ty = Math.round(ty);
          c.save(); c.beginPath(); c.rect(tx, ty, s, s); c.clip();
          c.translate(tx - (v % n) * s, ty - (v / n | 0) * s); c.scale(sc, sc); pic(c, t); c.restore();
          c.fillStyle = '#ffffff50'; c.fillRect(tx, ty, s, 1); c.fillRect(tx, ty, 1, s); c.fillStyle = '#00000060'; c.fillRect(tx, ty + s - 1, s, 1); c.fillRect(tx + s - 1, ty, 1, s);
        }
      }
      feel.end(c, W, H);
      text(c, `MOVES ${moves}`, 4, 4, { color: C16[1] });
      text(c, `${Math.max(0, Math.ceil(time))}S`, W - 4, 4, { color: time < 10 ? C16[2] : C16[4], align: 'right' });
      if (done) text(c, 'PERFECT!', W / 2, H - 12, { font: 'big', align: 'center', color: C16[4], outline: C16[0] });
      else if (peek > 0) text(c, 'REMEMBER IT...', W / 2, H - 10, { align: 'center', color: C16[1] });
      else if (level === 1 && moves === 0) text(c, 'TAP A TILE BY THE GAP', W / 2, H - 10, { align: 'center', color: C16[1] });
    },
    down(x, y) {
      if (done || peek > 0) return;
      const { s, x: X, y: Y } = geo(), cx = Math.floor((x - X) / s), cy = Math.floor((y - Y) / s);
      if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
      const gx = gap % n, gy = gap / n | 0;
      // a tap in the gap's row or column slides the whole line toward it
      if (cx !== gx && cy !== gy) { sfx(120, .04, 'square', .02); return; }
      const dx = Math.sign(cx - gx), dy = Math.sign(cy - gy);
      let steps = 0;
      while (gap !== cy * n + cx) { const j = gap + dx + dy * n; [tiles[gap], tiles[j]] = [tiles[j], tiles[gap]]; slide = { to: gap, fx: j % n, fy: j / n | 0, k: 0 }; gap = j; steps++; }
      moves += steps; sfx(400 + steps * 60, .04, 'square', .03); haptic('tick');
      if (solvedNow()) {
        const par = n === 3 ? 30 : 80, pts = 5 + Math.max(0, Math.round((par - moves) / (n === 3 ? 5 : 10)));
        score += pts; api.score(score); done = 1.8; time += n === 3 ? 25 : 45; notes('C5 E5 G5 C6:2', { len: .07 }); feel.win(W / 2, H / 2); haptic('success');
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'slide-picture',
  title: 'Slide Picture',
  tag: 'Color · Puzzle',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 20,
  hint: 'Tap a tile in line with the gap to slide it across. Rebuild the picture in as few moves as you can.',
  make,
};
