// Belt Sorter: parcels ride three conveyor belts down to three bins, each marked with a shape. Swipe a
// parcel left or right to hop it onto the next belt so it lands in the bin with its shape. The bins
// swap their labels now and then. Three wrong drops and the shift is over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;

const R = PAL.teal;
let W = 160, H = 160;
const SHAPES = ['ROUND', 'BOX', 'TRI'];

function make(api) {
  const feel = new Feel({ pixel: true });
  let items, bins, strikes, score, t, spawn, speed, swapT, grabbed, combo, flashBin;
  const laneX = l => Math.round(W * (l + .5) / 3), binY = () => H - 22;

  function shape(c, s, x, y, col, r = 5) {
    c.fillStyle = col;
    if (s === 0) { c.fillRect(x - r + 1, y - r, r * 2 - 2, r * 2); c.fillRect(x - r, y - r + 1, r * 2, r * 2 - 2); }
    else if (s === 1) c.fillRect(x - r, y - r, r * 2, r * 2);
    else for (let i = 0; i < r * 2; i++) c.fillRect(x - Math.round(i / 2), y - r + i, Math.round(i / 2) * 2 + 1, 1);
  }

  return {
    reset() { items = []; bins = [0, 1, 2]; strikes = 0; score = 0; t = 0; spawn = .5; speed = 22; swapT = 20; grabbed = null; combo = 0; flashBin = [0, 0, 0]; feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; spawn -= dt; swapT -= dt;
      speed = 22 + t * .45;
      if (spawn <= 0) { spawn = Math.max(.55, 1.6 - t / 50); items.push({ lane: Math.random() * 3 | 0, x: 0, y: -8, s: Math.random() * 3 | 0 }); items[items.length - 1].x = laneX(items[items.length - 1].lane); }
      if (swapT <= 0) { swapT = Math.max(9, 18 - t / 15); const a = Math.random() * 3 | 0, b = (a + 1 + (Math.random() * 2 | 0)) % 3; [bins[a], bins[b]] = [bins[b], bins[a]]; sounds.powerup(); feel.juice.pop(W / 2, binY() - 16, 'BINS SWAPPED!', { color: R[0] }); haptic('warning'); flashBin = [1, 1, 1]; }
      for (let i = 0; i < 3; i++) flashBin[i] = Math.max(0, flashBin[i] - dt);
      for (const it of items) {
        it.y += speed * dt;
        it.x += (laneX(it.lane) - it.x) * Math.min(1, dt * 14);
        if (it.y >= binY() - 4) {
          it.done = true;
          if (bins[it.lane] === it.s) { combo++; const pts = 1 + Math.floor(combo / 8); score += pts; api.score(score); feel.coin(Math.round(it.x), binY() - 6); if (combo % 8 === 0) feel.juice.pop(Math.round(it.x), binY() - 20, `x${1 + combo / 8}`, { color: R[0] }); }
          else { strikes++; combo = 0; flashBin[it.lane] = .6; feel.hurt(Math.round(it.x), binY() - 6); haptic('error'); if (strikes >= 3) { feel.lose(); api.over(); } }
        }
      }
      items = items.filter(it => !it.done);
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      // belts with moving slats
      for (let l = 0; l < 3; l++) {
        const x = laneX(l); c.fillStyle = R[2]; c.fillRect(x - 12, 0, 24, binY());
        c.fillStyle = R[1]; for (let y = Math.round((t * speed) % 8) - 8; y < binY(); y += 8) c.fillRect(x - 12, y, 24, 1);
        c.fillStyle = R[0]; c.fillRect(x - 13, 0, 1, binY()); c.fillRect(x + 12, 0, 1, binY());
      }
      // bins with their labels
      for (let l = 0; l < 3; l++) {
        const x = laneX(l), y = binY(), f = flashBin[l] > 0 && (t * 10 | 0) % 2;
        c.fillStyle = f ? R[1] : R[0]; c.fillRect(x - 16, y, 32, 20); c.fillStyle = R[3]; c.fillRect(x - 14, y + 2, 28, 16);
        shape(c, bins[l], x, y + 10, R[0], 5);
      }
      for (const it of items) {
        const x = Math.round(it.x), y = Math.round(it.y);
        c.fillStyle = R[0]; c.fillRect(x - 8, y - 8, 16, 16); c.fillStyle = it === grabbed ? R[1] : R[3]; c.fillRect(x - 7, y - 7, 14, 14);
        shape(c, it.s, x, y, R[0], 4);
      }
      feel.end(c, W, H);
      for (let i = 0; i < 3; i++) text(c, i < strikes ? 'X' : '-', 4 + i * 6, 4, { color: R[0] });
      if (combo >= 4) text(c, `${combo} IN A ROW`, W - 4, 4, { color: R[0], align: 'right' });
      if (t < 4) text(c, 'SWIPE PARCELS TO THE RIGHT BIN', W / 2, Math.max(20, Math.ceil(api.scoreArea().bottom) + 2), { align: 'center', color: R[0], outline: R[3] });
    },
    down(x, y) {
      // grab the parcel nearest the touch on that belt (forgiving)
      let best = null, bd = 30; for (const it of items) { const d = Math.hypot(it.x - x, (it.y - y) * .7); if (d < bd) { bd = d; best = it; } }
      grabbed = best ? { it: best, x } : null;
      if (best) { grabbed = best; best.gx = x; }
    },
    move(x, y, p) {
      if (!p || !grabbed) return;
      const d = x - grabbed.gx;
      if (Math.abs(d) > 12) { const nl = Math.max(0, Math.min(2, grabbed.lane + Math.sign(d))); if (nl !== grabbed.lane) { grabbed.lane = nl; sfx(500, .04, 'square', .03); haptic('tick'); } grabbed.gx = x; }
    },
    up() { grabbed = null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'belt-sorter',
  title: 'Belt Sorter',
  tag: 'Pocket · Sorting',
  retro: true, pal: 'teal',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 40,
  hint: 'Swipe parcels left or right onto the belt that ends in the bin with their shape. The bins swap labels sometimes. Three wrong drops ends it.',
  make,
};
