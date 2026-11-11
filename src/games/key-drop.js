import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { PAL } = gs.palettes, { Feel } = gs.effects, { Ready } = gs.rounds, { clamp } = gs.util;
const text = gs.pixel.text;

// Key Drop: locked crates rise from the floor a row at a time. Drop a key down a column: if its shape
// matches the crate on top, the crate opens and the key falls on to the next one (a run of the same
// shape opens in one drop). A key that does not fit jams on top and has to be knocked out by a key of
// its own shape. A star key takes the shape of whatever it lands on. A stack that passes the top ends it.
const P = PAL.moss, W = 160, H = 160;
const COLS = 6, ROWS = 8, CS = 15, OX = 4, OY = 36, STAR = 9;
const cellY = h => OY + (ROWS - h) * CS;            // the top edge of the cell at height h (1 = bottom row)

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds; particles stay in the four shades
  const ready = new Ready({ eat: false });                               // crates only start to rise after the first key
  let stacks, cur, queue, aim, drop, riseT, rows, score, lift, t, pd, done;

  const level = () => 1 + Math.floor(rows / 4);
  const every = () => Math.max(3.2, 7.5 - (level() - 1) * .6);
  const kinds = () => level() >= 3 ? 4 : 3;
  const newKey = () => level() >= 2 && Math.random() < .08 ? STAR : Math.random() * kinds() | 0;
  function rise(quiet) {
    for (const s of stacks) s.unshift({ k: s.length && Math.random() < .35 ? s[0].k : Math.random() * kinds() | 0, key: false });
    if (quiet) return;
    rows++; lift = CS; sfx(110, .1, 'square', .04, -20); haptic('medium');
    if (stacks.some(s => s.length > ROWS)) return end();
    if (stacks.some(s => s.length === ROWS)) { sfx(880, .05, 'square', .03); sfx(880, .05, 'square', .03, 0); }
  }
  function end() { done = true; haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); feel.juice.shake(4); api.over(); }
  function next() { drop = null; cur = queue.shift(); queue.push(newKey()); }
  function land() {                                   // the falling key has reached the top of its stack
    const s = stacks[drop.col], top = s[s.length - 1], x = OX + drop.col * CS + 7;
    if (top && drop.k === STAR) drop.k = top.k;        // a star key becomes the shape it lands on
    if (top && top.k === drop.k) {
      s.pop(); drop.chain++; score += 10 * drop.chain; api.score(score);
      const y = cellY(s.length + 1) + 7;
      feel.juice.burst(x, y, { n: 7, speed: 55, life: .3, size: 2, color: [P[0], P[3]] });
      if (drop.chain > 1) feel.juice.pop(x, y - 4, 'x' + drop.chain, { color: P[0] });
      sfx(440 + drop.chain * 110, .06, 'square', .04, 160); haptic(drop.chain > 1 ? 'medium' : 'light');
      if (!s.length) { score += 50; api.score(score); feel.juice.pop(x, cellY(1) - 8, '+50', { color: P[0] }); sfx(990, .15, 'square', .04, 300); haptic('success'); next(); }
      return;                                          // the key carries on down
    }
    if (drop.chain === 0 && drop.k !== STAR) {         // it fits nothing: the key jams on top
      s.push({ k: drop.k, key: true }); sfx(170, .07, 'square', .04, -30); haptic('warning'); feel.juice.shake(1);
      if (s.length > ROWS) return end();
    }
    next();
  }

  return {
    reset() {
      rows = 0; stacks = Array.from({ length: COLS }, () => []); for (let i = 0; i < 3; i++) rise(true);
      cur = Math.random() * 3 | 0; queue = [Math.random() * 3 | 0, Math.random() * 3 | 0];
      aim = 2; drop = null; riseT = every(); score = 0; lift = 0; t = 0; pd = false; done = false;
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt; lift = Math.max(0, lift - 90 * dt);
      if (!ready.update(dt) || done) return;
      if (drop) {
        const stop = cellY(stacks[drop.col].length + 1);
        drop.y += 240 * dt;
        if (drop.y >= stop) { drop.y = stop; land(); }
      }
      riseT -= dt;
      if (riseT <= 0 && !done) { rise(); riseT = every(); if (drop) drop.y = Math.min(drop.y, cellY(stacks[drop.col].length + 1)); }
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[1]; c.fillRect(OX - 2, OY - 2, COLS * CS + 4, ROWS * CS + 4);
      c.fillStyle = P[2]; c.fillRect(OX, OY, COLS * CS, ROWS * CS);
      feel.begin(c);
      if (!drop && !done) {                            // the aimed column, and a dotted line down to where the key lands
        const x = OX + aim * CS, stop = cellY(stacks[aim].length + 1);
        c.fillStyle = P[3]; c.fillRect(x, OY, CS, Math.max(0, stop + CS - OY));
        c.fillStyle = P[1]; for (let y = OY + 2; y < stop + 4; y += 4) c.fillRect(x + 7, y, 1, 2);
      }
      c.save(); c.beginPath(); c.rect(OX, OY, COLS * CS, ROWS * CS); c.clip();
      const up = Math.round(lift), warn = (t * 6 | 0) % 2;
      for (let i = 0; i < COLS; i++) {
        const s = stacks[i], full = s.length >= ROWS;
        for (let j = 0; j < s.length; j++) (s[j].key ? jam : crate)(c, OX + i * CS, cellY(j + 1) + up, s[j].k, full && warn);
      }
      c.restore();
      if (drop) key(c, OX + drop.col * CS, Math.round(drop.y), drop.k);
      else if (!done) key(c, OX + aim * CS, OY - CS - 1, cur);
      feel.end(c, W, H);
      const px = OX + COLS * CS + 8;
      text(c, 'NEXT', px, 38, { color: P[0] });
      key(c, px, 46, queue[0]); key(c, px + 20, 46, queue[1]);
      text(c, 'LV ' + level(), px, 72, { color: P[0] });
      text(c, 'RISE', px, 88, { color: P[0] });
      c.fillStyle = P[1]; c.fillRect(px, 96, 44, 6); c.fillStyle = P[3]; c.fillRect(px + 1, 97, 42, 4);
      c.fillStyle = P[0]; c.fillRect(px + 1, 97, Math.round(42 * clamp(1 - riseT / every(), 0, 1)), 4);
      crate(c, px, 112, 0, 0); key(c, px + 20, 112, 0);
      text(c, 'SAME', px, 130, { color: P[1] }); text(c, 'SHAPE', px, 138, { color: P[1] }); text(c, 'OPENS', px, 146, { color: P[1] });
      ready.draw(c, W, H, { pixel: true, color: P[0], x: OX + COLS * CS / 2, y: OY + 34, text: 'TAP A COLUMN' });
    },
    down(x) { if (x < OX + COLS * CS + 4) { pd = true; aim = clamp(Math.floor((x - OX) / CS), 0, COLS - 1); } },
    move(x, y, pressed) { if (pressed && pd) { const n = clamp(Math.floor((x - OX) / CS), 0, COLS - 1); if (n !== aim) { aim = n; haptic('tick'); } } },
    up() { if (!pd) return; pd = false; this.fire(); },
    fire() { if (done || drop) return; ready.go(); drop = { col: aim, y: OY - CS - 1, k: cur, chain: 0 }; sfx(620, .03, 'square', .02, -200); },
    key(k, d) {
      if (!d) return;
      if (k === 'ArrowLeft') aim = clamp(aim - 1, 0, COLS - 1);
      if (k === 'ArrowRight') aim = clamp(aim + 1, 0, COLS - 1);
      if (k === 'ArrowDown' || k === ' ' || k === 'Enter') this.fire();
    },
  };
}

function shape(c, k, x, y) {                          // 7 x 7 pixels
  if (k === 0) { c.fillRect(x + 2, y, 3, 7); c.fillRect(x + 1, y + 1, 5, 5); c.fillRect(x, y + 2, 7, 3); }                                        // disc
  else if (k === 1) c.fillRect(x, y, 7, 7);                                                                                                       // square
  else if (k === 2) { c.fillRect(x + 3, y, 1, 7); c.fillRect(x + 2, y + 2, 3, 5); c.fillRect(x + 1, y + 4, 5, 3); c.fillRect(x, y + 6, 7, 1); }   // triangle
  else if (k === 3) { c.fillRect(x + 3, y, 1, 7); c.fillRect(x + 2, y + 1, 3, 5); c.fillRect(x + 1, y + 2, 5, 3); c.fillRect(x, y + 3, 7, 1); }   // diamond
  else { c.fillRect(x + 3, y, 1, 7); c.fillRect(x, y + 3, 7, 1); c.fillRect(x + 2, y + 2, 3, 3); c.fillRect(x + 1, y + 1, 1, 1); c.fillRect(x + 5, y + 1, 1, 1); c.fillRect(x + 1, y + 5, 1, 1); c.fillRect(x + 5, y + 5, 1, 1); }   // star
}
function crate(c, x, y, k, warn) {                    // a locked crate with its keyhole
  c.fillStyle = P[0]; c.fillRect(x + 1, y + 1, 13, 13);
  c.fillStyle = warn ? P[0] : P[1]; c.fillRect(x + 1, y + 1, 12, 12);
  c.fillStyle = P[3]; shape(c, k, x + 4, y + 4);
}
function jam(c, x, y, k, warn) {                      // a key stuck on a stack
  c.fillStyle = P[0]; c.fillRect(x + 1, y + 1, 13, 13);
  c.fillStyle = warn ? P[1] : P[3]; c.fillRect(x + 2, y + 2, 11, 11);
  key(c, x, y, k);
}
function key(c, x, y, k) {                            // the shape is the key's head, with a short toothed stem
  c.fillStyle = P[0]; shape(c, k, x + 2, y + 4);
  c.fillRect(x + 9, y + 7, 4, 1); c.fillRect(x + 10, y + 8, 1, 2); c.fillRect(x + 12, y + 8, 1, 2);
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'key-drop', title: 'Key Drop', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'moss', goal: 900, music: 'puzzle',
  hint: 'Tap a column to drop the key down it. A key opens crates of its own shape and jams on any other. Do not let a stack reach the top.',
  make,
};
