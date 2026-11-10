// Slide Ten: swipe to slide every tile on the 4x4 board. Two tiles that bump together add up, as long
// as they make 10 or less. Make exactly 10 and the tile clears for a point. A new tile drops in after
// every slide; fill the board with no adds left and it's over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { Board } = gs.board;
const { Gestures } = gs.controls;

const R = PAL.berry;
let W = 160, H = 160;
const N = 4;

function make(api) {
  const feel = new Feel({ pixel: true });
  let b, score, t, dead, moves, lastTen;
  const g = new Gestures({ swipe: dir => slide(dir) });
  const geo = () => { const s = Math.floor(Math.min(W - 12, H - 30) / N), x = Math.round((W - s * N) / 2), y = Math.round(18 + (H - 24 - s * N) / 2); return { s, x, y }; };

  function drop() {
    const free = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!b.get(c, r)) free.push([c, r]);
    if (!free.length) return;
    const [c, r] = free[Math.random() * free.length | 0], k = Math.random();
    const v = k < .35 ? 1 : k < .6 ? 2 : k < .8 ? 3 : k < .93 ? 4 : 5;
    b.put(c, r, { v, pop: .25 });
  }
  function stuck() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = b.get(c, r); if (!p) return false;
      const rt = b.get(c + 1, r), dn = b.get(c, r + 1);
      if ((rt && rt.v + p.v <= 10) || (dn && dn.v + p.v <= 10)) return false;
    }
    return true;
  }
  function slide(dir) {
    if (dead || b.busy) return;
    const res = b.slide(dir, { merge: (a, q) => a.v + q.v <= 10 && { v: a.v + q.v, pop: .2 } });
    if (!res.moved) { haptic('tick'); return; }
    moves++;
    let tens = 0;
    for (const m of res.merged) if (m.v === 10) {
      tens++; const { s, x, y } = geo();
      b.take(m.col, m.row);
      feel.juice.burst(x + (m.col + .5) * s, y + (m.row + .5) * s, { n: 12, speed: 70, size: 2, color: [R[0], R[1], R[2]], gravity: 80 });
    }
    if (tens) {
      const pts = tens * tens; score += pts; api.score(score); lastTen = .4;
      const { s, x, y } = geo(); feel.juice.pop(W / 2, y - 4, tens > 1 ? `DOUBLE TEN! +${pts}` : 'TEN!', { color: R[0] });
      notes(tens > 1 ? 'C5 E5 G5 C6' : 'E5 A5', { len: .06 }); haptic(tens > 1 ? 'success' : 'medium');
    } else if (res.merged.length) { sfx(500 + Math.max(...res.merged.map(m => m.v)) * 60, .05, 'square', .03); haptic('light'); }
    else { sfx(220, .03, 'square', .02); }
    drop();
    if (moves % 12 === 0) drop();   // the board fills a little faster as you go
    if (stuck()) { dead = .01; feel.lose(); haptic('error'); }
  }

  return {
    reset() { b = new Board(N, N, { speed: 16 }); score = 0; t = 0; dead = 0; moves = 0; lastTen = 0; g.release(); feel.clear(); for (let i = 0; i < 5; i++) drop(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); g.update(); if (feel.frozen) return;
      t += dt; b.update(dt); if (lastTen > 0) lastTen -= dt;
      b.each(p => { if (p.pop > 0) p.pop -= dt; });
      if (dead) { dead += dt; if (dead > 1.2) api.over(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const { s, x: X, y: Y } = geo();
      feel.begin(c);
      c.fillStyle = R[2]; c.fillRect(X - 3, Y - 3, s * N + 6, s * N + 6);
      for (let r = 0; r < N; r++) for (let q = 0; q < N; q++) { c.fillStyle = R[3]; c.fillRect(X + q * s + 1, Y + r * s + 1, s - 2, s - 2); }
      b.each(p => {
        const grow = p.pop > 0 ? Math.round(p.pop * 8) : 0, x = Math.round(X + p.x * s) + 2 - grow, y = Math.round(Y + p.y * s) + 2 - grow, w = s - 4 + grow * 2;
        const hi = p.v >= 8, mid = p.v >= 5;
        c.fillStyle = hi ? R[0] : mid ? R[1] : R[2]; c.fillRect(x, y, w, w);
        c.fillStyle = hi || mid ? R[2] : R[3]; c.fillRect(x, y, w, 2);
        text(c, String(p.v), x + w / 2, y + w / 2 - 4, { font: 'big', align: 'center', color: hi || mid ? R[3] : R[0] });
        // dots showing how far from ten
        c.fillStyle = hi || mid ? R[3] : R[0]; for (let i = 0; i < 10 - p.v && i < 9; i++) c.fillRect(x + 3 + i * 3, y + w - 4, 1, 1);
      });
      feel.end(c, W, H);
      text(c, `TENS ${score}`, 4, 4, { color: R[0] });
      text(c, `${moves}`, W - 4, 4, { color: R[1], align: 'right' });
      if (t < 4 && !moves) text(c, 'SWIPE: ADD UP TO 10', W / 2, H - 9, { align: 'center', color: R[0] });
      if (dead) text(c, 'NO MORE ADDS', W / 2, H / 2 - 4, { font: 'big', align: 'center', color: R[3], outline: R[0] });
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
    key(k, d) { if (!d) return; const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k]; if (m) slide(m); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'slide-ten',
  title: 'Slide Ten',
  tag: 'Pocket · Merge',
  retro: true, pal: 'berry',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 15,
  hint: 'Swipe to slide all the tiles. Tiles that bump add up if they make 10 or less; make exactly 10 to clear it. Jam the board and it is over.',
  make,
};
