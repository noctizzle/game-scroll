import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects, { Ready } = gs.rounds, { clamp } = gs.util;
const { sprite, text } = gs.pixel;

// Tide Turn: sea creatures in a rock pool. Tap a group of three or more of a kind to clear it: three
// score 1, four 4, five 9 and so on, so it pays to wait for a big group. A tap on a smaller group hurries the tide.
// When the tide comes in everything floats up against the top; when it goes out everything sinks
// to the floor. The columns line up differently at each end, so a turn of the tide makes new groups,
// and it also washes in a fresh row. Tap the moon to turn the tide early. A full column ends it.
const W = 160, H = 192, COLS = 8, ROWS = 10, CS = 16, L = 28, T = 26, B = T + ROWS * CS;
const INK = '#101018';
const ART = [
  [`......oo......
    .....oaao.....
    .....oabo.....
    .oo..oaao..oo.
    oaaooaaaaooaao
    oabaaaaaaaabao
    .oaaaabbaaaao.
    ..ooaaaaaaoo..
    ...oaaaaaao...
    ...oaaaaaao...
    ..oaaaooaaao..
    ..oabo..obao..
    ..oao....oao..
    ...o......o...`, { o: INK, a: '#e04040', b: '#f08830' }],            // starfish
  [`..............
    .....oooo.....
    ...ooabbaoo...
    ..oabaabaabo..
    .oabaabbaabao.
    .oaabaabaabao.
    oabaabaabaabao
    oaabaabbaabaao
    oabaabaabaabao
    .oaabaabaabao.
    ..oabaabaabo..
    ...oooaaooo...
    .....oaao.....
    .....oooo.....`, { o: INK, a: '#f8f8f0', b: '#c8c8d0' }],            // shell
  [`..............
    ..............
    oo....ooooo...
    oao..oaaaaao..
    oaaooaaaaaaao.
    oaaaaaabaakao.
    oaaaaaaaaaaaao
    oaaaaaabaaaao.
    oaaooaaaaaao..
    oao..oaaaao...
    oo....oooo....
    ..............
    ..............
    ..............`, { o: INK, a: '#f8d838', b: '#f08830', k: INK }],    // fish
  [`..............
    .oo........oo.
    oaao......oaao
    oabo......obao
    .oao.oooo.oao.
    ..oaoaaaaoao..
    ..oaakaakaao..
    .oaaaaaaaaaao.
    .oaabaaaabaao.
    ..oaaaaaaaao..
    .o.oooooooo.o.
    o..o.o..o.o..o
    ..............
    ..............`, { o: INK, a: '#58c040', b: '#208858', k: INK }],    // crab
  [`......oo......
    ..o...oo...o..
    ...o.oooo.o...
    ....oaaaao....
    ...oaabaaao...
    .ooaabaaaaaoo.
    oooaaaaaaaaooo
    oooaaaaaaaaooo
    .ooaaaaaaaaoo.
    ...oaaaaaao...
    ....oaaaao....
    ...o.oooo.o...
    ..o...oo...o..
    ......oo......`, { o: INK, a: '#8848c8', b: '#e868b8' }],            // urchin
];
const TINT = ['#e04040', '#f8f8f0', '#f8d838', '#58c040', '#8848c8'];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // the tide only starts to turn after the first tap
  const SPR = ART.map(([art, pal]) => sprite(art, pal));
  let tiles, dir, timer, turns, score, t, level, cool, done, cur, wig;

  const kinds = () => turns >= 6 ? 5 : 4;
  const every = () => Math.max(4.5, 8 - turns * .25);
  const column = c => tiles.filter(q => q.c === c).sort((a, b) => a.r - b.r);
  function pack() { for (let c = 0; c < COLS; c++) { const l = column(c); l.forEach((q, i) => { q.r = dir > 0 ? ROWS - l.length + i : i; }); } }
  function group(q) {                                    // every creature of q's kind joined to it, edge to edge
    const map = new Map(tiles.map(p => [p.r * COLS + p.c, p])), out = [q], seen = new Set([q]);
    for (let i = 0; i < out.length; i++) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = out[i], cc = p.c + dc; if (cc < 0 || cc >= COLS) continue;
      const n = map.get((p.r + dr) * COLS + cc); if (n && n.k === q.k && !seen.has(n)) { seen.add(n); out.push(n); }
    }
    return out;
  }
  function tap(q) {
    ready.go(); const g = group(q);
    if (g.length < 3) {                                  // a wasted tap washes in a row there and then
      if (wig) return;
      wig = { set: new Set(g), l: .4 }; sfx(200, .08, 'square', .04, -60); haptic('warning'); feel.juice.shake(1); wash(); return;
    }
    const pts = (g.length - 2) ** 2; score += pts; api.score(score);
    tiles = tiles.filter(p => !g.includes(p));
    for (const p of g) feel.juice.burst(L + p.c * CS + 8, T + p.y * CS + 8, { n: 4, speed: 50, life: .35, size: 2, color: [TINT[p.k], '#f8f8f0'] });
    feel.juice.pop(L + q.c * CS + 8, T + q.y * CS + 2, '+' + pts, { color: '#f8f8f0' });
    if (g.length >= 6) feel.juice.shake(2);
    sfx(420 + g.length * 60, .1, 'square', .04, 220); haptic(g.length >= 5 ? 'success' : 'medium');
    pack();
  }
  function turn() {                                      // the tide turns: everything drifts to the other end, and a row washes in
    if (done) return;
    dir = -dir; turns++; timer = 0; cool = 1.2; pack();
    if (wash()) { sfx(dir < 0 ? 300 : 500, .25, 'sine', .05, dir < 0 ? 260 : -260); haptic('medium'); }
  }
  function wash() {                                      // a new row at the open end; a column with no room ends the round
    if (done) return false;
    if (tiles.length && Array.from({ length: COLS }, (_, c) => column(c).length).some(n => n >= ROWS)) {
      done = true; haptic('error'); sfx(130, .5, 'sawtooth', .05, -50); feel.juice.shake(4); api.over(); return false;
    }
    for (let c = 0; c < COLS; c++) {
      const n = column(c).length;
      tiles.push({ k: Math.random() * kinds() | 0, c, r: dir > 0 ? ROWS - n - 1 : n, y: dir > 0 ? -1.2 - Math.random() : ROWS + .2 + Math.random() });
    }
    return true;
  }

  return {
    reset() {
      tiles = []; dir = 1; timer = 0; turns = 0; score = 0; t = 0; level = .1; cool = 0; done = false; cur = null; wig = null;
      for (let r = ROWS - 4; r < ROWS; r++) for (let c = 0; c < COLS; c++) tiles.push({ k: Math.random() * 4 | 0, c, r, y: r });
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt;
      for (const q of tiles) q.y += clamp(q.r - q.y, -13 * dt, 13 * dt);
      level += clamp((dir < 0 ? 1 : .1) - level, -1.6 * dt, 1.6 * dt);
      if (wig) { wig.l -= dt; if (wig.l <= 0) wig = null; }
      if (!ready.update(dt) || done) return;
      cool = Math.max(0, cool - dt); timer += dt;
      if (timer >= every()) turn();
    },
    fx(dt) { feel.update(dt); t += dt; for (const q of tiles) q.y += clamp(q.r - q.y, -13 * dt, 13 * dt); },
    draw(c) {
      c.fillStyle = '#683820'; c.fillRect(0, 0, W, H);                                   // rock
      c.fillStyle = '#a86838'; for (let i = 0; i < 26; i++) c.fillRect((i * 53) % W, (i * 37) % H, 5 + i % 4, 2);
      c.fillStyle = '#bfe6f5'; c.fillRect(L, T, COLS * CS, ROWS * CS);                   // the pool: air above, water below
      const top = B - Math.round(level * ROWS * CS);
      c.fillStyle = '#3858d8'; c.fillRect(L, top, COLS * CS, B - top);
      c.fillStyle = '#38b8e8'; for (let x = 0; x < COLS * CS; x += 4) c.fillRect(L + x, top + ((x / 4 + t * 3 | 0) % 2), 4, 2);
      c.fillStyle = '#f0d890'; c.fillRect(L, B, COLS * CS, 3); c.fillStyle = '#a86838'; c.fillRect(L, B + 3, COLS * CS, H - B - 3);
      feel.begin(c);
      const warn = (t * 6 | 0) % 2;
      for (const q of tiles) {
        const shake = wig && wig.set.has(q) ? ((t * 40 | 0) % 2 ? 1 : -1) : 0;
        SPR[q.k].draw(c, L + q.c * CS + 1 + shake, T + Math.round(q.y * CS) + 1);
      }
      for (let cc = 0; cc < COLS; cc++) if (warn && !done && tiles.filter(q => q.c === cc).length >= ROWS - 1) { c.fillStyle = '#e04040'; c.fillRect(L + cc * CS + 5, dir > 0 ? T - 5 : B + 1, 6, 3); }
      if (cur) { c.strokeStyle = '#f8f8f0'; c.lineWidth = 1; c.strokeRect(L + cur.c * CS + .5, T + cur.r * CS + .5, CS - 1, CS - 1); }
      feel.end(c, W, H);
      // the moon: tap it to turn the tide now; the bar under it fills until the tide turns by itself
      const k = ready.playing ? clamp(timer / every(), 0, 1) : 0, by = 50, bh = B - by;
      text(c, 'TIDE', 6, 4, { color: '#f8f8f0' });
      c.fillStyle = INK; c.fillRect(6, 12, 16, 16); c.fillRect(4, 14, 20, 12); c.fillRect(8, 10, 12, 20);
      c.fillStyle = cool > 0 ? '#c8c8d0' : '#f8d838'; c.fillRect(7, 13, 14, 14); c.fillRect(5, 15, 18, 10); c.fillRect(9, 11, 10, 18);
      c.fillStyle = INK; c.fillRect(14, 14, 5, 5); c.fillRect(16, 19, 4, 5);       // the dark side of the moon
      c.fillStyle = '#f8f8f0';
      for (let i = 0; i < 4; i++) c.fillRect(13 - i, dir > 0 ? 36 + i : 42 - i, 2 + i * 2, 1);      // which way the tide goes next
      c.fillRect(13, 37, 2, 5);
      c.fillStyle = INK; c.fillRect(9, by - 1, 10, bh + 2); c.fillStyle = '#bfe6f5'; c.fillRect(10, by, 8, bh);
      c.fillStyle = k > .8 && warn ? '#f8f8f0' : '#3858d8'; const fh = Math.round(bh * k); c.fillRect(10, by + bh - fh, 8, fh);
      ready.draw(c, W, H, { pixel: true, color: '#101018', x: L + COLS * CS / 2, y: T + 44, text: 'TAP 3 OR MORE' });
    },
    down(x, y) {
      if (done) return;
      if (x < L - 3) { if (cool <= 0) { ready.go(); turn(); } return; }
      const q = tiles.find(q => x >= L + q.c * CS && x < L + (q.c + 1) * CS && y >= T + q.y * CS && y < T + (q.y + 1) * CS);
      if (q) tap(q);
    },
    move() {}, up() {},
    key(k, d) {
      if (!d || done) return;
      if (k === 't' || k === 'T' || k === 'Tab') { if (cool <= 0) { ready.go(); turn(); } return; }
      if (!cur) cur = { r: ROWS - 1, c: 0 };
      if (k === 'ArrowLeft') cur.c = clamp(cur.c - 1, 0, COLS - 1); if (k === 'ArrowRight') cur.c = clamp(cur.c + 1, 0, COLS - 1);
      if (k === 'ArrowUp') cur.r = clamp(cur.r - 1, 0, ROWS - 1); if (k === 'ArrowDown') cur.r = clamp(cur.r + 1, 0, ROWS - 1);
      if (k === ' ' || k === 'Enter') { const q = tiles.find(q => q.r === cur.r && q.c === cur.c); if (q) tap(q); }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'tide-turn', title: 'Tide Turn', tag: 'Color · Puzzle', retro: true, era: 'color', pal: 'teal', w: W, h: H, goal: 200, music: 'calm',
  hint: 'Tap three or more of the same creature to clear them: bigger groups score far more, and a tap on fewer washes in a row. Each turn of the tide floats or sinks the lot and adds a row. Tap the moon to turn it early. A full column ends it.',
  make,
};
