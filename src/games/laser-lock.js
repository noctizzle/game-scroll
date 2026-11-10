// Laser Lock: a laser sits in the middle of a vault lock made of rings, each with one gap. Line every
// gap up with the exit on the right and the beam escapes. Drag a ring round to turn it, but the rings
// are geared together: turning one nudges the ring outside it too.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 176, H = 200;
const STEPS = 8, PAL = ['#f85878', '#f8b838', '#58d878', '#38b8f8', '#b878f8'];

function make(api) {
  const feel = new Feel({ pixel: true });
  let rings, link, level, score, moves, par, t, done, grab, beam, time;
  const centre = () => [Math.round(W / 2), Math.round(18 + (H - 18) / 2)];
  const radius = i => { const R = Math.min(W / 2 - 8, (H - 18) / 2 - 6); return Math.round(R * (i + 2) / (rings.length + 1.4)); };

  function turn(i, d) {
    rings[i] = (rings[i] + d + STEPS) % STEPS;
    if (i + 1 < rings.length) rings[i + 1] = (rings[i + 1] + d * link[i] + STEPS) % STEPS;
  }
  function newLock() {
    const n = Math.min(5, 2 + Math.floor((level + 1) / 2));
    rings = new Array(n).fill(0);
    link = Array.from({ length: n - 1 }, () => Math.random() < .5 ? 1 : -1);
    // scramble with real turns, so it can always be opened
    par = Math.min(10, 2 + level);
    for (let k = 0; k < par; k++) turn(Math.random() * n | 0, Math.random() < .5 ? 1 : -1);
    if (rings.every(v => v === 0)) turn(0, 1);
    moves = 0; done = 0; beam = 0; grab = null;
  }
  const open = () => rings.every(v => v === 0);

  return {
    reset() { level = 1; score = 0; t = 0; time = 50; feel.clear(); newLock(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (done) { beam = Math.min(1, beam + dt * 3); done -= dt; if (done <= 0) { level++; newLock(); } return; }
      time -= dt;
      if (time <= 0) { feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = '#101020'; c.fillRect(0, 0, W, H);
      const [cx, cy] = centre();
      // exit port
      c.fillStyle = '#383858'; c.fillRect(W - 10, cy - 8, 10, 16); c.fillStyle = done ? '#f8f8f0' : '#f85878'; c.fillRect(W - 6, cy - 3, 6, 6);
      feel.begin(c);
      // rings, drawn as rings of pixel blocks with a gap
      for (let i = 0; i < rings.length; i++) {
        const r = radius(i), col = PAL[i % PAL.length], held = grab && grab.i === i;
        const segs = Math.max(24, Math.round(r * .9));
        for (let k = 0; k < segs; k++) {
          const a = k / segs * Math.PI * 2, slot = Math.round(a / (Math.PI * 2) * STEPS - rings[i] + STEPS * 4) % STEPS;
          if (slot === 0) continue;   // the gap
          const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
          c.fillStyle = held ? '#f8f8f0' : col; c.fillRect(x - 2, y - 2, 4, 4);
        }
        // a notch shows where its gap is, even under others
        const ga = rings[i] / STEPS * Math.PI * 2;
        c.fillStyle = col; c.fillRect(Math.round(cx + Math.cos(ga) * (r - 6)) - 1, Math.round(cy + Math.sin(ga) * (r - 6)) - 1, 2, 2);
      }
      // the beam: out to the first ring that blocks it
      let reach = W; for (let i = 0; i < rings.length; i++) if (rings[i] !== 0) { reach = cx + radius(i) - 3; break; }
      c.fillStyle = '#f85878'; c.fillRect(cx, cy - 1, Math.max(0, reach - cx), 2);
      c.fillStyle = '#ffd0d8'; c.fillRect(cx, cy, Math.max(0, reach - cx), 1);
      if (reach < W) { c.fillStyle = (t * 10 | 0) % 2 ? '#f8f8f0' : '#f85878'; c.fillRect(reach - 1, cy - 2, 3, 4); }
      c.fillStyle = '#f8f8f0'; c.fillRect(cx - 3, cy - 3, 6, 6); c.fillStyle = '#f85878'; c.fillRect(cx - 1, cy - 1, 2, 2);
      if (done) { c.fillStyle = `rgba(248,88,120,${beam * .3})`; c.fillRect(0, 0, W, H); }
      feel.end(c, W, H);
      text(c, `L${level}`, 4, 4, { color: '#f8f8f0' });
      text(c, `${Math.max(0, Math.ceil(time))}S`, W - 4, 4, { color: time < 10 ? '#f85878' : '#f8d838', align: 'right' });
      if (done) text(c, 'UNLOCKED!', W / 2, H - 14, { font: 'big', align: 'center', color: '#f8f8f0' });
      else if (level === 1 && t < 5) text(c, 'DRAG RINGS ROUND', W / 2, H - 10, { align: 'center', color: '#a8a8c8' });
    },
    down(x, y) {
      if (done) return;
      const [cx, cy] = centre(), d = Math.hypot(x - cx, y - cy);
      let best = -1, bd = 12; for (let i = 0; i < rings.length; i++) { const e = Math.abs(d - radius(i)); if (e < bd) { bd = e; best = i; } }
      if (best < 0) { best = d < radius(0) ? 0 : rings.length - 1; }
      grab = { i: best, a: Math.atan2(y - cy, x - cx), acc: 0 };
      sfx(600, .02, 'square', .02);
    },
    move(x, y, p) {
      if (!p || !grab || done) return;
      const [cx, cy] = centre(), a = Math.atan2(y - cy, x - cx);
      let d = a - grab.a; d = Math.atan2(Math.sin(d), Math.cos(d)); grab.a = a; grab.acc += d;
      const step = Math.PI * 2 / STEPS;
      while (Math.abs(grab.acc) >= step * .6) {
        const s = Math.sign(grab.acc); grab.acc -= s * step; turn(grab.i, s); moves++;
        sfx(300 + grab.i * 80, .03, 'square', .03); haptic('tick');
        if (open()) {
          const pts = 3 + Math.max(0, par - moves); score += pts; api.score(score); time += 12; done = 1.4; grab = null;
          notes('C5 G5 C6', { len: .07 }); feel.win(W / 2, H / 2); haptic('success'); return;
        }
      }
    },
    up() { grab = null; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'laser-lock',
  title: 'Laser Lock',
  tag: 'Advance · Puzzle',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 200, maxW: 240, maxH: 260,
  goal: 30,
  hint: 'Drag the rings round to line every gap up with the exit on the right. Turning a ring also turns the one outside it.',
  make,
};
