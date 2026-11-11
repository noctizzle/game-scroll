import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { clamp } = gs.util, { Feel } = gs.effects, { Ready } = gs.rounds;
const { View, G, part, grp, blob } = gs.toon;

// Row Call: four lanes of toy blocks queue up on a wooden table. Each time the bell rings the front
// row marches off into the toy box, and it has to match: four of a colour is a full row (+10, and it
// wins back a miss), three is fine (+4), anything less is a miss. Tap a lane to hop its front block
// to the back of the queue. Stone blocks cannot hop and match nothing; white blocks match anything.
let W = 160, H = 192;
const COLS = 4, ROWS = 6, STONE = 8, WILD = 9;
const COLORS = ['#e8503c', '#3a7ae0', '#f2c230', '#46b85a'];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });
  const ready = new Ready({ eat: false });               // the bell only starts counting after the first hop
  let lanes, gone, timer, done, misses, score, t, msg, dead, deny;

  const tile = () => Math.max(14, Math.min(28, Math.floor((W - 16) / COLS), Math.floor((H - 54) / ROWS)));
  const ox = () => (W - COLS * tile()) >> 1, oy = () => 26 + ((H - 50 - ROWS * tile()) >> 1);
  const period = () => Math.max(2.6, 4.6 - done * .07);
  function pick(c) {
    const kinds = done < 6 ? 3 : 4, r = Math.random();
    if (done >= 8 && r < .07 && !lanes[c].some(q => q.k === STONE) && lanes.flat().filter(q => q.k === STONE).length < 2) return STONE;
    if (done >= 5 && r > .94) return WILD;
    return Math.random() * kinds | 0;
  }
  function hop(c) {
    const l = lanes[c], q = l[0];
    if (dead || q.air) return;
    ready.go();
    if (q.k === STONE) { deny = { c, l: .25 }; sfx(140, .08, 'square', .04, -20); haptic('warning'); return; }
    l.push(l.shift()); q.air = .001; q.from = q.row;
    sfx(520, .05, 'square', .03, 180); haptic('light');
  }
  function march() {
    const front = lanes.map(l => l[0]), n = COLORS.map((_, k) => front.filter(q => q.k === k).length), wild = front.filter(q => q.k === WILD).length;
    const best = Math.max(...n) + wild, T = tile(), [sx, sy] = view3d().over(W / 2, oy() + (ROWS - .5) * T, T);
    if (best >= 4) { score += 10; misses = Math.max(0, misses - 1); msg = { txt: 'FULL ROW +10', l: 1.1, good: true }; haptic('success'); sfx(660, .08, 'square', .04, 200); sfx(990, .14, 'square', .04, 200); feel.juice.burst(sx, sy, { n: 22, speed: 90, life: .6, size: 2, color: ['#fff6c0', '#f2c230', '#ffffff'] }); }
    else if (best === 3) { score += 4; msg = { txt: 'THREE +4', l: .9, good: true }; haptic('medium'); sfx(620, .1, 'square', .04, 120); feel.juice.burst(sx, sy, { n: 8, speed: 60, life: .4, size: 2, color: ['#ffffff', '#f2c230'] }); }
    else { misses++; msg = { txt: 'MIXED ROW', l: 1.1 }; haptic('error'); sfx(130, .3, 'sawtooth', .05, -50); feel.juice.shake(4); }
    api.score(score); done++;
    for (let c = 0; c < COLS; c++) {
      const q = lanes[c].shift(); gone.push({ k: q.k, c, row: q.row, fall: 0, l: 0 });
      lanes[c].push({ k: pick(c), row: -1.3, air: 0, from: 0 });
    }
    if (misses >= 3) { dead = .01; msg = { txt: 'THREE MISSES', l: 9 }; }
  }
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#bfe3ff', sun: [-.4, 1, .7], sunI: 2.2, amb: 1.15, sky: '#ffffff', ground: '#c8a878' });
      v3.def('tileA', () => part(G.box, '#dcb070', { y: -.5 })).def('tileB', () => part(G.box, '#cfa264', { y: -.5 }));
      v3.def('edge', () => part(G.box, '#f6e7b4', { y: -.5 })).def('edgeHot', () => part(G.box, '#ff9a6a', { y: -.5, glow: .5 }));
      v3.def('base', () => part(G.box, '#8a6034', { sy: 10, y: -6 }));
      v3.def('leg', () => part(G.box, '#74502a', { y: -.5 }));
      v3.def('box', () => grp(part(G.box, '#c0392b', { y: -.5 }), part(G.box, '#7c2018', { sx: .86, sy: .1, sz: .8, y: .01, line: false })));
      v3.def('cloud', () => grp(part(G.ball, '#ffffff', { sx: 1.6, sy: .7, line: false }), part(G.ball, '#ffffff', { s: .8, x: 1.1, y: .15, line: false }), part(G.ball, '#ffffff', { s: .7, x: -1.1, y: .1, line: false })));
      // a block pivots on the table, with two eyes on its front and a hat that tells the colours apart
      const eyes = () => [-1, 1].map(s => part(G.box, '#1c1c28', { sx: .12, sy: .18, sz: .04, x: s * .2, y: .62, z: .51, line: false }));
      const hats = [                                     // a bar, a disc, two dots, a cross: the colours also differ by shape
        () => part(G.box, '#fff4ea', { sx: .74, sy: .14, sz: .22, y: 1.07 }),
        () => part(G.cyl, '#eaf2ff', { sx: .34, sy: .14, sz: .34, y: 1.07 }),
        () => grp(part(G.ball, '#fffbe0', { s: .17, x: -.22, y: 1.1 }), part(G.ball, '#fffbe0', { s: .17, x: .22, y: 1.1 })),
        () => grp(part(G.box, '#eaffea', { sx: .7, sy: .14, sz: .2, y: 1.07 }), part(G.box, '#eaffea', { sx: .2, sy: .14, sz: .7, y: 1.07 })),
      ];
      COLORS.forEach((col, k) => v3.def('b' + k, () => grp(part(G.box, col, { y: .5 }), ...eyes(), hats[k](), blob(.75, .25))));
      v3.def('b' + STONE, () => grp(part(G.rock, '#8c8c98', { sx: .62, sy: .55, sz: .62, y: .5 }), blob(.75, .25)));
      v3.def('b' + WILD, () => grp(part(G.box, '#ffffff', { y: .5, glow: .35 }), ...eyes(), part(G.gem, '#ff8ad0', { s: .3, y: 1.3, glow: .6 }), blob(.75, .25)));
    }
    v3.board(W, H, .95, 34); return v3;
  }

  const self = {
    reset() {
      done = 0; lanes = Array.from({ length: COLS }, () => []);
      for (let c = 0; c < COLS; c++) for (let i = 0; i < ROWS; i++) lanes[c].push({ k: Math.random() * 3 | 0, row: ROWS - 1 - i, air: 0, from: 0 });
      gone = []; timer = 0; misses = 0; score = 0; t = 0; msg = null; dead = 0; deny = null;
      feel.clear(); ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); t += dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (deny) { deny.l -= dt; if (deny.l <= 0) deny = null; }
      for (const l of lanes) l.forEach((q, i) => {            // blocks shuffle up to their place; a hopping one flies to the back
        const to = ROWS - 1 - i;
        if (q.air) { q.air += dt / .32; if (q.air >= 1) { q.air = 0; q.row = to; } else q.row = q.from + (to - q.from) * q.air; }
        else q.row += clamp(to - q.row, -7 * dt, 7 * dt);
      });
      for (const g of gone) { g.l += dt; g.row += 3.2 * dt; if (g.row > ROWS - .45) g.fall += 240 * dt * g.l; }
      gone = gone.filter(g => g.l < .9);
      if (dead) { dead += dt; if (dead > 1) api.over(); return; }
      if (!ready.update(dt)) return;
      timer += dt;
      if (timer >= period()) { timer = 0; march(); }
    },
    fx(dt) { feel.update(dt); t += dt; for (const g of gone) { g.l += dt; g.row += 3.2 * dt; if (g.row > ROWS - .45) g.fall += 240 * dt * g.l; } gone = gone.filter(g => g.l < .9); },
    draw(c) {
      const T = tile(), X = ox(), Y = oy(), v = view3d(), bw = COLS * T, bh = ROWS * T; v.frame();
      const left = period() - timer, hot = ready.playing && !dead && left < .9 && (t * 8 | 0) % 2;
      for (let i = 0; i < 4; i++) v.put('cloud', v.at((i * 97 + t * 3) % (W + 80) - 40, -30 - i * 26, -70), { s: 10 + i * 2 });
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) v.put(r === ROWS - 1 ? (hot ? 'edgeHot' : 'edge') : (r + cc) % 2 ? 'tileA' : 'tileB', v.at(X + (cc + .5) * T, Y + (r + .5) * T), { sx: T - 1, sy: 1, sz: T - 1 });
      v.put('base', v.at(X + bw / 2, Y + bh / 2), { sx: bw + 2, sz: bh + 2 });
      for (const [lx, ly] of [[X + 3, Y + bh - 3], [X + bw - 3, Y + bh - 3]]) v.put('leg', v.at(lx, ly, -11), { sx: 4, sy: 60, sz: 4 });
      v.put('box', v.at(X + bw / 2, Y + bh + T * .75, -T * 1.6), { sx: bw + 8, sy: T * .9, sz: T * 1.2 });
      for (let cc = 0; cc < COLS; cc++) for (const q of lanes[cc]) {
        if (q.row < -1.4) continue;
        const k = q.air, shake = deny && deny.c === cc && q === lanes[cc][0] ? Math.sin(t * 60) * 1.5 : 0;
        v.put('b' + q.k, v.at(X + (cc + .5) * T + shake, Y + (q.row + .5) * T, k ? Math.sin(k * Math.PI) * T * 1.7 : 0), { s: T - 3, rx: k ? -k * Math.PI * 2 : 0 });
      }
      for (const g of gone) v.put('b' + g.k, v.at(X + (g.c + .5) * T, Y + (g.row + .5) * T, -g.fall + Math.abs(Math.sin(g.l * 18)) * 2 * (g.fall ? 0 : 1)), { s: T - 3, rx: g.fall ? g.fall * .03 : 0 });
      v.render(c, W, H);
      feel.begin(c); feel.end(c, W, H);
      // HUD: misses on the left, the bell's countdown along the bottom
      c.font = '6px "Press Start 2P", monospace'; c.textBaseline = 'alphabetic';
      for (let i = 0; i < 3; i++) { c.fillStyle = '#20304a'; c.fillRect(4 + i * 9, 4, 7, 7); c.fillStyle = i < misses ? '#e8503c' : '#ffffff'; c.fillRect(5 + i * 9, 5, 5, 5); }
      const bx = 10, by = H - 9, bl = W - 20, k = ready.playing ? clamp(left / period(), 0, 1) : 1;
      c.fillStyle = '#20304a'; c.fillRect(bx - 1, by - 1, bl + 2, 6); c.fillStyle = '#ffffff'; c.fillRect(bx, by, bl, 4);
      c.fillStyle = left < .9 && ready.playing ? '#e8503c' : '#3a7ae0'; c.fillRect(bx, by, Math.round(bl * k), 4);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#20304ad0'; c.fillRect(0, 17, W, 12); c.fillStyle = msg.good ? '#fff2a0' : '#ff9a8a'; c.fillText(msg.txt, W / 2, 26); }
      ready.draw(c, W, H, { text: 'TAP A LANE', pixel: true, color: '#ffffff', shadow: '#20304a', y: 23 });
    },
    down(x, y) {
      const [px] = view3d().pick(x, y), cc = Math.floor((px - ox()) / tile());
      if (cc >= 0 && cc < COLS) hop(cc);
    },
    move() {}, up() {},
    key(k, d) { if (!d) return; const i = '1234'.indexOf(k); if (i >= 0) hop(i); },
  };
  return self;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'row-call', title: 'Row Call', tag: 'Console · Puzzle', retro: true, era: 'console', pal: 'grape', w: 160, h: 192, maxW: 240, maxH: 320, goal: 80, music: 'puzzle',
  hint: 'Tap a lane to hop its front block to the back. When the bell rings the front row marches off: line up three or four of one colour. Three mixed rows and it is over.',
  make,
};
