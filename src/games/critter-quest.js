import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// A tiny monster-catching adventure. Pick a starter, walk through tall grass, and battle the wild
// critters that jump out. Weaken them and throw a jar to catch them for your team. Ember beats
// Sprout, Sprout beats Ripple, Ripple beats Ember. Reach the top of each route to go further.
const T = 16;
const TYPES = ['EMBER', 'SPROUT', 'RIPPLE'], TCOL = ['#e05030', '#48a838', '#3888e0'];
const MOVE = ['SPARK', 'VINE', 'SPLASH'];
const pad = rows => rows.map(r => (r + '            ').slice(0, 12));
const SPECIES = [
  { name: 'FLAREPUP', type: 0, hp: 20, atk: 6, c: ['#f08830', '#f8d838'], s: pad(['..1......1..', '.131....131.', '.1221111221.', '122222222221', '124122224121', '121122221121', '122223322221', '.1222332221.', '..12222221..', '.1221111221.', '.121....121.', '.11......11.']) },
  { name: 'CINDERMOTH', type: 0, hp: 16, atk: 7, c: ['#c84830', '#f8b838'], s: pad(['1..........1', '31........13', '331.1111.133', '33312222 333', '.3312422133.', '..31222213..', '.3312222133.', '33312332 333', '331.1221.133', '31...11...13', '1..........1', '............']) },
  { name: 'LEAFLET', type: 1, hp: 21, atk: 5, c: ['#58c040', '#a8e868'], s: pad(['....1111....', '...133331...', '..13311331..', '...111111...', '..12222221..', '.1222222221.', '.1241221421.', '.1211221121.', '.1222222221.', '..12211221..', '..121..121..', '..11....11..']) },
  { name: 'MOSSBACK', type: 1, hp: 26, atk: 5, c: ['#a07040', '#48a838'], s: pad(['............', '...111111...', '..13313331..', '.1333133331.', '.1331331331.', '111111111111', '122222222241', '122222222211', '.1221..1221.', '.111....111.', '............', '............']) },
  { name: 'DRIZZLET', type: 2, hp: 19, atk: 6, c: ['#48a0f0', '#c8e8ff'], s: pad(['.....11.....', '....1221....', '...122221...', '..12222221..', '..12222221..', '.1242222421.', '.1211221121.', '.1222222221.', '.1223333221.', '..12222221..', '...111111...', '............']) },
  { name: 'PUDDLEFIN', type: 2, hp: 18, atk: 7, c: ['#3070c8', '#88d0f8'], s: pad(['............', '..111.......', '.13321...11.', '1222221.131.', '12242221331.', '12211222221.', '122222222331', '.1233322221.', '..1222221.1.', '...11111....', '............', '............']) },
];
let W = 160, H = 160;

function sprite(c, sp, x, y, k = 1, flip = false, alpha = 1) {
  const pal = { 1: '#181820', 2: sp.c[0], 3: sp.c[1], 4: '#f8f8f0' }; c.globalAlpha = alpha;
  for (let r = 0; r < 12; r++) for (let q = 0; q < 12; q++) { const ch = sp.s[r][flip ? 11 - q : q]; if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x + q * k, y + r * k, k, k); } }
  c.globalAlpha = 1;
}
const mon = (spI, lvl) => { const sp = SPECIES[spI]; const max = sp.hp + lvl * 3; return { sp, lvl, hp: max, max, xp: 0 }; };
const atkOf = m => m.sp.atk + m.lvl * 1.2;

function make(api) {
  let mode, party, map, px, py, route, steps, jars, berries, foe, queue, qT, score, t, held, holdT, flash, shake, pickI;
  const cols = () => Math.floor(W / T), rows = () => Math.floor((H - 10) / T), oy = () => H - rows() * T;
  function newMap() {
    const C = cols(), R = rows(); map = [];
    for (let y = 0; y < R; y++) { map.push([]); for (let x = 0; x < C; x++) { const n = Math.sin(x * .9 + route * 3) + Math.cos(y * .8 + route); map[y].push(Math.random() < .15 ? 2 : n > .2 || Math.random() < .2 ? 1 : 0); } }
    px = C >> 1; py = R - 1; let x = px, ex = Math.random() * C | 0;
    for (let y = R - 1; y >= 0; y--) { map[y][x] = map[y][x] === 2 ? 1 : map[y][x]; while (x !== ex && Math.random() < .6) { x += Math.sign(ex - x); map[y][x] = map[y][x] === 2 ? 0 : map[y][x]; } }
    map[0][x] = 5; map[R - 1][px] = 0;
    for (let i = 0; i < 3; i++) { const ix = Math.random() * C | 0, iy = 1 + Math.random() * (R - 2) | 0; if (map[iy][ix] !== 5) map[iy][ix] = i === 2 ? 4 : 3; }
  }
  const lead = () => party.find(m => m.hp > 0);
  function say(txt, fn, d = .9) { queue.push({ txt, fn, d }); }
  function hit(att, def, power, type) {
    const mult = type == null ? 1 : (type + 1) % 3 === def.sp.type ? 1.6 : (def.sp.type + 1) % 3 === type ? .6 : 1;
    const dmg = Math.max(1, Math.round((power + atkOf(att) * .6) * mult * rnd(.85, 1.15) * (att === foe ? .7 : 1)));
    def.hp = Math.max(0, def.hp - dmg); return mult;
  }
  function foeTurn() {
    const me = lead(), useType = Math.random() < .55;
    say(`${foe.sp.name} USED ${useType ? MOVE[foe.sp.type] : 'TACKLE'}`, () => {
      const m = hit(foe, me, useType ? 8 : 6, useType ? foe.sp.type : null); shake = .3; haptic('medium'); sfx(180, .1, 'square', .05, -60);
      if (m > 1) say('IT HIT HARD!'); if (m < 1) say('NOT VERY STRONG...');
      if (me.hp <= 0) {
        say(`${me.sp.name} FAINTED`, () => { haptic('error'); });
        if (!lead()) say('YOUR TEAM IS OUT!', () => { mode = 'end'; }, 1.2);
        else say(`GO, ${lead().sp.name}!`);
      }
    });
  }
  function act(i) {
    if (queue.length || mode !== 'battle') return; const me = lead();
    if (i < 2) {
      const type = i === 1 ? me.sp.type : null;
      say(`${me.sp.name} USED ${type == null ? 'TACKLE' : MOVE[type]}`, () => {
        const m = hit(me, foe, type == null ? 6 : 8, type); flash = .3; haptic('light'); sfx(type == null ? 300 : 600, .1, 'square', .05, 200);
        if (m > 1) say('IT HIT HARD!'); if (m < 1) say('NOT VERY STRONG...');
        if (foe.hp <= 0) win(); else foeTurn();
      });
    } else if (i === 2) {
      if (!jars) { say('NO JARS LEFT!'); return; }
      jars--; const chance = clamp(1.1 - foe.hp / foe.max, .12, .92);
      say('YOU THREW A JAR...', () => {
        sfx(500, .3, 'triangle', .04, -200);
        if (Math.random() < chance) say(`CAUGHT ${foe.sp.name}!`, () => {
          haptic('success'); sfx(990, .3, 'square', .05, 400); score += 2; api.score(score);
          foe.hp = Math.max(foe.hp, foe.max >> 1); if (party.length < 4) party.push(foe); else { party.sort((a, b) => a.lvl - b.lvl || a.hp - b.hp); party[0] = foe; }
          foe = null; mode = 'walk';
        }, 1.1);
        else { say('IT BROKE FREE!'); foeTurn(); }
      });
    } else {
      say(Math.random() < .85 ? 'GOT AWAY SAFELY' : 'COULD NOT ESCAPE!', function () { if (this.txt[0] === 'G') { foe = null; mode = 'walk'; } else foeTurn(); });
    }
  }
  function win() {
    const me = lead();
    say(`${foe.sp.name} FAINTED`, () => {
      score += 1; api.score(score); me.xp += foe.lvl * 2 + 2; me.hp = Math.min(me.max, me.hp + (me.max >> 3)); sfx(800, .2, 'square', .04, 300);
      if (me.xp >= me.lvl * 4) { me.xp = 0; me.lvl++; me.max += 3; me.hp = Math.min(me.max, me.hp + (me.max >> 2)); say(`${me.sp.name} GREW TO LV${me.lvl}!`, () => haptic('success')); }
      say('', () => { foe = null; mode = 'walk'; }, .01);
    });
  }
  function walk(dx, dy) {
    if (mode !== 'walk') return; const nx = px + dx, ny = py + dy, C = cols(), R = rows();
    if (nx < 0 || nx >= C || ny >= R) return; if (ny < 0) return;
    const cell = map[ny][nx]; if (cell === 2) { haptic('tick'); return; }
    px = nx; py = ny; steps++; sfx(120, .02, 'square', .02);
    if (cell === 3) { map[ny][nx] = 0; for (const m of party) if (m.hp > 0) m.hp = Math.min(m.max, m.hp + Math.ceil(m.max / 2)); haptic('success'); sfx(700, .15, 'triangle', .05, 300); msgWalk('BERRY! TEAM HEALED'); }
    if (cell === 4) { map[ny][nx] = 0; jars++; haptic('light'); sfx(900, .1, 'square', .04, 200); msgWalk('FOUND A JAR'); }
    if (cell === 5) { route++; score += 1; api.score(score); for (const m of party) if (m.hp > 0) m.hp = Math.min(m.max, m.hp + (m.max >> 2)); newMap(); haptic('medium'); msgWalk(`ROUTE ${route}`); return; }
    if (cell === 1 && steps > 2 && Math.random() < .13) {
      const lvl = Math.max(1, route - 1 + (Math.random() * 2 | 0)); foe = mon(Math.random() * SPECIES.length | 0, lvl);
      mode = 'battle'; held = null; queue = []; haptic('heavy'); sfx(220, .3, 'sawtooth', .05, 400); flash = .5;
      say(`A WILD ${foe.sp.name} APPEARED!`, null, 1.1);
    }
  }
  let note;
  function msgWalk(txt) { note = { txt, l: 1.3 }; }
  function pickRect(i) { const s = Math.min(3, Math.floor((W - 16) / 3 / 12)), w = 12 * s; return { x: (W - 3 * w - 16) / 2 + i * (w + 8), y: H / 2 - w / 2, w, s }; }
  const MENU = 42;
  const btn = i => { const bw = (W - 12) / 2 | 0, bh = 16, by = H - MENU + 5; return { x: 4 + (i % 2) * (bw + 4), y: by + (i >> 1) * (bh + 2), w: bw, h: bh }; };
  function layout() {
    const menu = H - MENU, k = Math.max(2, Math.min(4, Math.floor(Math.min(W / 52, (menu - 30) / 40)))), S = 12 * k, pw = Math.min(W - 8, Math.max(76, Math.floor(W * .55)));
    const fy = 18, fx = W - S - 8, py1 = fy + 2, px1 = 4;
    const my = menu - S - 8, mx = 8, py2 = menu - 30, px2 = W - pw - 4;
    return { menu, k, fx, fy: Math.min(fy + Math.max(0, (my - fy - S - 10) * .15) | 0, fy + 20), mx, my, pw, px1, py1, px2, py2: Math.min(py2, my + S - 26) };
  }
  const self = {
    reset() { mode = 'pick'; party = []; route = 1; steps = 0; jars = 3; queue = []; qT = 0; score = 0; t = 0; held = null; holdT = 0; flash = 0; shake = 0; foe = null; note = null; pickI = -1; newMap(); },
    resize(w, h) { W = w; H = h; if (map) { const keep = { px, py }; newMap(); if (mode !== 'pick') { px = Math.min(keep.px, cols() - 1); py = rows() - 1; } } },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt); if (note) { note.l -= dt; if (note.l <= 0) note = null; }
      if (queue.length) { const q = queue[0]; if (!q.started) { q.started = true; } qT += dt; if (qT >= q.d) { qT = 0; queue.shift(); if (q.fn) q.fn.call(q); } }
      if (mode === 'end' && !queue.length) return api.over();
      if (mode === 'walk' && held) { holdT -= dt; if (holdT <= 0) { holdT = .17; walk(held.dx, held.dy); } }
    },
    draw(c) {
      c.font = '6px "Press Start 2P", monospace'; c.textBaseline = 'alphabetic';
      if (mode === 'pick') {
        c.fillStyle = '#f8f0d8'; c.fillRect(0, 0, W, H); c.fillStyle = '#181820'; c.textAlign = 'center'; c.fillText('CHOOSE A PARTNER', W / 2, H / 2 - 30);
        [0, 2, 4].forEach((sI, i) => { const r = pickRect(i); c.fillStyle = TCOL[SPECIES[sI].type] + '40'; c.fillRect(r.x - 2, r.y - 2, r.w + 4, r.w + 4); sprite(c, SPECIES[sI], r.x, r.y + Math.round(Math.sin(t * 4 + i) * 1.5), r.s); c.fillStyle = TCOL[SPECIES[sI].type]; c.fillText(TYPES[SPECIES[sI].type], r.x + r.w / 2, r.y + r.w + 12); });
        return;
      }
      if (mode === 'walk' || (!foe && mode !== 'battle')) {
        const C = cols(), R = rows(), o = oy();
        c.fillStyle = '#181820'; c.fillRect(0, 0, W, H);
        for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
          const v = map[y][x], X = x * T, Y = o + y * T;
          c.fillStyle = '#a8d878'; c.fillRect(X, Y, T, T); c.fillStyle = '#98c868'; if ((x + y) % 2) c.fillRect(X + 3, Y + 9, 2, 1);
          if (v === 1) { c.fillStyle = '#389830'; for (let k = 0; k < 4; k++) { const gx = X + 1 + (k % 2) * 8, gy = Y + 2 + (k >> 1) * 7; c.fillRect(gx, gy + 2, 6, 4); c.fillStyle = '#60c048'; c.fillRect(gx + 1, gy, 1, 3); c.fillRect(gx + 4, gy, 1, 3); c.fillStyle = '#389830'; } }
          if (v === 2) { c.fillStyle = '#704820'; c.fillRect(X + 6, Y + 10, 4, 6); c.fillStyle = '#207030'; c.fillRect(X + 1, Y + 1, 14, 10); c.fillStyle = '#309840'; c.fillRect(X + 3, Y + 2, 6, 4); }
          if (v === 3) { c.fillStyle = '#e04050'; c.fillRect(X + 5, Y + 6, 6, 6); c.fillStyle = '#58c040'; c.fillRect(X + 7, Y + 3, 2, 3); c.fillStyle = '#ffffff'; c.fillRect(X + 6, Y + 7, 1, 1); }
          if (v === 4) { c.fillStyle = '#c8e8ff'; c.fillRect(X + 5, Y + 5, 6, 8); c.fillStyle = '#a06838'; c.fillRect(X + 5, Y + 4, 6, 2); }
          if (v === 5) { c.fillStyle = '#d8b878'; c.fillRect(X, Y, T, T); c.fillStyle = '#181820'; c.fillRect(X + 6, Y + 2, 4, 1); c.fillRect(X + 5, Y + 3, 6, 1); }
        }
        // trainer
        const X = px * T, Y = o + py * T, bob = held && (t * 8 | 0) % 2;
        c.fillStyle = '#e04040'; c.fillRect(X + 4, Y + 1 - bob, 8, 4); c.fillStyle = '#f8d0a8'; c.fillRect(X + 5, Y + 5 - bob, 6, 4); c.fillStyle = '#3858d8'; c.fillRect(X + 4, Y + 9 - bob, 8, 5); c.fillStyle = '#181820'; c.fillRect(X + 5, Y + 14, 2, 2); c.fillRect(X + 9, Y + 14, 2, 2); c.fillRect(X + 6, Y + 6 - bob, 1, 1); c.fillRect(X + 9, Y + 6 - bob, 1, 1);
        c.fillStyle = '#181820'; c.fillRect(0, 0, W, o); c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(`R${route}`, 3, o - 2);
        c.textAlign = 'right'; c.fillText(`JAR${jars}`, W - 3, o - 2);
        // party pips
        for (let i = 0; i < party.length; i++) { const m = party[i]; c.fillStyle = m.hp > 0 ? TCOL[m.sp.type] : '#555'; c.fillRect(24 + i * 6, o - 7, 4, 4); }
        if (note) { c.textAlign = 'center'; c.fillStyle = '#181820c0'; c.fillRect(0, H / 2 - 8, W, 13); c.fillStyle = '#f8d838'; c.fillText(note.txt, W / 2, H / 2 + 1); }
        if (t < 5 && route === 1 && steps < 3) { c.textAlign = 'center'; c.fillStyle = '#181820'; c.fillText('TAP A SIDE TO WALK', W / 2, o + 12); }
        return;
      }
      // battle: GBA-style layout with boxed name plates, clear HP numbers and a 2x2 move menu
      const me = lead(), sx = shake > 0 ? Math.round(Math.sin(t * 80) * 2) : 0, L = layout();
      c.fillStyle = flash > 0 && (t * 20 | 0) % 2 ? '#f8f8f0' : '#f0e8c8'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#e4dab4'; for (let y = 16; y < L.menu; y += 8) c.fillRect(0, y, W, 1);
      const S = 12 * L.k;
      c.fillStyle = '#b8d090'; c.beginPath(); c.ellipse(L.fx + S / 2, L.fy + S - 1, S * .75, S * .16 + 2, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(L.mx + S / 2, L.my + S - 1, S * .8, S * .16 + 2, 0, 0, 7); c.fill();
      if (foe) sprite(c, foe.sp, L.fx, L.fy, L.k, false, foe.hp > 0 ? 1 : .3);
      if (me) sprite(c, me.sp, L.mx + sx, L.my, L.k, true);
      const plate = (x, y, w, m, showNums) => {
        const h = showNums ? 26 : 18; c.fillStyle = '#181820'; c.fillRect(x, y, w, h); c.fillStyle = '#f8f8f0'; c.fillRect(x + 1, y + 1, w - 2, h - 2);
        c.fillStyle = TCOL[m.sp.type]; c.fillRect(x + 1, y + 1, 2, h - 2);
        const lv = `L${m.lvl}`, room = Math.floor((w - 12) / 6) - lv.length - 1, name = m.sp.name.length > room ? m.sp.name.slice(0, Math.max(3, room - 1)) + '.' : m.sp.name;
        c.fillStyle = '#181820'; c.textAlign = 'left'; c.fillText(name, x + 5, y + 8); c.textAlign = 'right'; c.fillText(lv, x + w - 3, y + 8);
        const bw = w - 10, f = m.hp / m.max; c.fillStyle = '#181820'; c.fillRect(x + 5, y + 11, bw, 5); c.fillStyle = '#585868'; c.fillRect(x + 6, y + 12, bw - 2, 3);
        c.fillStyle = f > .5 ? '#48c040' : f > .2 ? '#f0c030' : '#e04040'; c.fillRect(x + 6, y + 12, Math.round((bw - 2) * f), 3);
        if (showNums) { c.fillStyle = '#181820'; c.textAlign = 'right'; c.fillText(`${m.hp}/${m.max}`, x + w - 3, y + 24); }
      };
      if (foe) plate(L.px1, L.py1, L.pw, foe, false);
      if (me) plate(L.px2, L.py2, L.pw, me, true);
      c.fillStyle = '#181820'; c.fillRect(0, L.menu, W, H - L.menu); c.fillStyle = '#f8f8f0'; c.fillRect(2, L.menu + 2, W - 4, H - L.menu - 4);
      if (queue.length && queue[0].txt) {
        c.fillStyle = '#181820'; c.textAlign = 'left'; const words = queue[0].txt.split(' '); let line = '', ly = L.menu + 13; const max = Math.floor((W - 14) / 6);
        for (const w of words) { if ((line + w).length > max) { c.fillText(line.trim(), 7, ly); line = ''; ly += 10; } line += w + ' '; } c.fillText(line.trim(), 7, ly);
        if ((t * 3 | 0) % 2) { c.fillStyle = '#e04040'; c.fillRect(W - 10, H - 9, 4, 3); c.fillRect(W - 9, H - 6, 2, 1); }
      }
      else if (!queue.length && me) {
        const labels = ['TACKLE', MOVE[me.sp.type], `JAR x${jars}`, 'RUN'];
        for (let i = 0; i < 4; i++) { const b = btn(i); c.fillStyle = i === 1 ? TCOL[me.sp.type] : i === 2 && !jars ? '#585868' : '#282838'; c.fillRect(b.x, b.y, b.w, b.h); c.fillStyle = '#ffffff30'; c.fillRect(b.x, b.y, b.w, 1); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText(labels[i], b.x + b.w / 2, b.y + b.h / 2 + 3); }
      }
    },
    down(x, y) {
      if (mode === 'pick') { for (let i = 0; i < 3; i++) { const r = pickRect(i); if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 8 && y <= r.y + r.w + 16) { party = [mon(i * 2, 4)]; mode = 'walk'; haptic('success'); sfx(880, .2, 'square', .05, 200); } } return; }
      if (mode === 'battle') { if (queue.length) { if (qT > .25) qT = queue[0].d; return; } for (let i = 0; i < 4; i++) { const b = btn(i); if (x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 1) { haptic('tick'); act(i); } } return; }
      const X = px * T + 8, Y = oy() + py * T + 8, dx = x - X, dy = y - Y;
      held = Math.abs(dx) > Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) || -1 }; holdT = .22; walk(held.dx, held.dy);
    },
    move(x, y, p) { if (p && held && mode === 'walk') { const X = px * T + 8, Y = oy() + py * T + 8, dx = x - X, dy = y - Y; if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; held = Math.abs(dx) > Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) }; } },
    up() { held = null; },
    key(k, d) {
      if (!d) return;
      if (mode === 'pick') { const n = '123'.indexOf(k); if (n >= 0 || k === ' ') { party = [mon(Math.max(0, n) * 2, 4)]; mode = 'walk'; } return; }
      if (mode === 'battle') { if (queue.length) { qT = queue[0].d; return; } const n = '1234'.indexOf(k); if (n >= 0) act(n); if (k === ' ') act(1); return; }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]; if (dir) walk(...dir);
    },
  };
  return self;
}

export default {
  id: 'critter-quest', title: 'Critter Quest', tag: 'Color · RPG', retro: true, era: 'color', pal: 'berry', w: 160, h: 160, maxW: 240, maxH: 300, goal: 15, step: 16,
  hint: 'Pick a partner, then tap a side to walk. Wild critters hide in tall grass: fight them for XP, or weaken them and throw a jar to catch them. Ember beats Sprout, Sprout beats Ripple, Ripple beats Ember. Berries heal your team.',
  make,
};
