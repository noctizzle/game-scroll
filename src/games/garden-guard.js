import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { backdrop } = gs.gfx;
const { View, G, part, grp, blob, THREE } = gs.toon;
const { Group } = THREE;

// Weed beetles are marching across your vegetable patch. Tap the glowing dew drops to collect
// them, tap a card at the top, then tap a square to plant it. Dew Lilies make more dew, Pea Pods
// shoot down their row, Bramble Walls hold beetles up and Pepper Pops blow up everything nearby.
// If a beetle reaches your house, you lose a garden gnome. Lose all three and the patch is lost.
const PLANTS = [
  { k: 'lily', n: 'LILY', cost: 25, hp: 6, col: '#f0d040', cd: 4 },
  { k: 'pod', n: 'POD', cost: 50, hp: 6, col: '#58c050', cd: 4 },
  { k: 'wall', n: 'WALL', cost: 50, hp: 40, col: '#7a5a30', cd: 12 },
  { k: 'pepper', n: 'POP', cost: 100, hp: 99, col: '#e04030', cd: 20 },
];
const BUGS = { beetle: { hp: 10, sp: 4.5, dmg: 4, col: '#6a4a8a' }, armour: { hp: 26, sp: 5, dmg: 4, col: '#4a5a6a' }, hopper: { hp: 9, sp: 9, dmg: 3, col: '#5a8a3a', hop: true }, stag: { hp: 60, sp: 3.5, dmg: 10, col: '#7a3020' } };
const COLS = 8, ROWS = 5;
let W = 240, H = 176;

function make(api) {
  let grid, bugs, seeds, dews, dew, sel, cds, gnomes, wave, waveT, spawnQ, spawnT, kills, t, parts, msg, dead, skyT;
  const top = 26, cell = () => Math.min(Math.floor((W - 20) / COLS), Math.floor((H - top - 4) / ROWS)), ox = () => W - COLS * cell() - 4, oy = () => top + ((H - top - ROWS * cell()) >> 1);
  const cx = c => ox() + (c + .5) * cell(), cy = r => oy() + (r + .5) * cell();
  function startWave() {
    wave++; const n = 2 + wave * 2; spawnQ = [];
    for (let i = 0; i < n; i++) { const r = Math.random(); spawnQ.push(wave > 4 && i === n - 1 ? 'stag' : r < .55 || wave < 2 ? 'beetle' : r < .8 ? (wave > 2 ? 'armour' : 'beetle') : 'hopper'); }
    spawnT = wave === 1 ? 8 : 3; msg = { txt: wave === 1 ? 'PLANT LILIES FIRST!' : `WAVE ${wave}`, l: 1.6 };
  }
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#4a8a3a', sun: [-.7, 1, .5], sunI: 2.4, amb: 1 });
      v3.add(part(G.plane, '#4a8a3a', { sx: 3000, sz: 3000, y: -2, line: false }));
      v3.def('lawnA', () => part(G.box, '#86c65c', { sy: 1.5, y: -.75, line: false })).def('lawnB', () => part(G.box, '#70b04c', { sy: 1.5, y: -.75, line: false }));
      v3.def('soil', () => part(G.box, '#6a4a2a', { sy: 3, y: -2 }));
      v3.def('house', () => grp(part(G.box, '#a07040', { y: .5 }), ...[-.4, -.2, 0, .2, .4].map(z => part(G.box, '#c09060', { sx: 1.04, sy: .2, sz: .16, y: 1, z, line: false }))));
      const gnome = on => () => grp(part(G.cyl, on ? '#3858a0' : '#606070', { sx: 2.4, sy: 3.5, sz: 2.4, y: 1.8 }), part(G.ball, on ? '#f8f0e0' : '#808088', { s: 2.6, y: 4.8 }), part(G.ball, '#f8c8a0', { s: 1.5, y: 5.8, z: 1.2 }), part(G.cone, on ? '#e04040' : '#707078', { sx: 2.4, sy: 6, sz: 2.4, y: 9.5 }));
      v3.def('gnome', gnome(true)).def('gnomeOff', gnome(false));
      const flash = g => { const f = part(G.ball, '#ffffff', { s: 9, y: 6, glow: 1, opacity: .6, line: false }); f.visible = false; g.add(f); g.userData.flash = f; return g; };
      v3.def('lily', () => { const g = grp(part(G.cyl, '#3a9a30', { sx: .6, sy: 5, sz: .6, y: 2.5 }), part(G.ball, '#f89020', { sx: 2.4, sy: 1.4, sz: 2.4, y: 6 })); for (let i = 0; i < 6; i++) g.add(part(G.ball, '#f0d040', { sx: 2.4, sy: .9, sz: 1.5, x: Math.cos(i * 1.05) * 3.5, z: Math.sin(i * 1.05) * 3.5, y: 5.6, ry: -i * 1.05 })); return flash(g); });
      v3.def('pod', () => { const head = part(G.ball, '#58c050', { sx: 4.5, sy: 4, sz: 4, y: 8 }); head.add(part(G.cyl, '#48a840', { sx: .45, sy: .8, sz: .45, x: 1.1, rz: Math.PI / 2 })); for (const z of [-1, 1]) head.add(part(G.ball, '#14101c', { s: .18, x: .4, y: .35, z: z * .45, line: false })); head.add(part(G.cone, '#3a8a30', { sx: .5, sy: .8, sz: .3, x: -.9, y: .5, rz: .9 })); return flash(grp(part(G.cyl, '#3a9a30', { sx: .8, sy: 6, sz: .8, y: 3 }), part(G.cone, '#3a9a30', { sx: 3, sy: 1, sz: 3, y: .5 }), head)); });
      v3.def('wall', () => { const g = grp(part(G.box, '#7a5a30', { sx: 12, sy: 14, sz: 9, y: 7 })); for (let i = 0; i < 5; i++) g.add(part(G.cone, '#4a3418', { sx: 1, sy: 3, sz: 1, x: -5 + i * 2.5, y: 14 + (i % 2), rz: (i - 2) * .2 })); return flash(g); });
      v3.def('pepper', () => flash(grp(part(G.ball, '#e04030', { sx: 5, sy: 7, sz: 5, y: 7 }), part(G.cyl, '#38a038', { sx: .8, sy: 3, sz: .8, y: 15 }), part(G.ball, '#ffffff', { s: 1, x: -1.6, y: 9, z: 4, line: false }))));
      v3.def('seed', () => part(G.ball, '#90e060', { s: 2.2, glow: .6 }));
      v3.def('dew', () => grp(part(G.ball, '#80d8ff', { sx: 5, sy: 5.5, sz: 5, glow: .35 }), part(G.ball, '#ffffff', { s: 1.4, x: -1.6, y: 2, z: 3, line: false })));
      v3.def('blob', () => blob(1, .3));
      v3.def('picket', () => grp(part(G.box, '#f8f0e0', { sx: 2.2, sy: 7, sz: 1.2, y: 3.5 }), part(G.cone, '#f8f0e0', { sx: 1.1, sy: 1.6, sz: .6, y: 7.8, ry: Math.PI / 4 }), part(G.box, '#e8e0d0', { sx: 6, sy: 1, sz: .8, y: 4.5, z: -.8, line: false })));
      for (const [i, col] of ['#f8f070', '#f8a0c8', '#ffffff'].entries()) v3.def('flower' + i, () => grp(part(G.cyl, '#3a9030', { sx: .3, sy: 4, sz: .3, y: 2 }), part(G.ball, col, { sx: 2, sy: .8, sz: 2, y: 4.2 }), part(G.ball, '#f0a020', { s: .8, y: 4.6, line: false })));
      const bug = (col, extra) => () => {
        const g = new Group(), body = part(G.ball, col, { sx: 7, sy: 4.5, sz: 5.5, y: 5 }), head = part(G.ball, '#2a2030', { s: 3, x: -7, y: 5 });
        for (const z of [-1, 1]) head.add(part(G.ball, '#f8f040', { s: .35, x: -.7, y: .3, z: z * .5, glow: .6, line: false }));
        const legs = new Group(); for (let i = -1; i <= 1; i++) for (const z of [-1, 1]) legs.add(part(G.cyl, '#202020', { sx: .5, sy: 4, sz: .5, x: i * 4, y: 2, z: z * 5, rx: z * .7, line: false }));
        g.add(legs, body, head); if (extra) extra(g); g.userData.legs = legs;
        const f = part(G.ball, '#ffffff', { sx: 8, sy: 6, sz: 7, y: 5, glow: 1, opacity: .7, line: false }); f.visible = false; g.add(f); g.userData.flash = f; return g;
      };
      v3.def('beetle', bug('#6a4a8a', g => g.add(part(G.box, '#4a3060', { sx: .6, sy: 1, sz: 9, y: 9.4, line: false }))));
      v3.def('armour', bug('#4a5a6a', g => g.add(part(G.ball, '#c0c8d0', { sx: 6, sy: 3, sz: 5, y: 8.5 }))));
      v3.def('hopper', bug('#5a8a3a', g => { for (const z of [-1, 1]) g.add(part(G.cyl, '#3a6a20', { sx: .8, sy: 9, sz: .8, x: 3, y: 6, z: z * 5, rz: -1 })); }));
      v3.def('stag', bug('#7a3020', g => { for (const z of [-1, 1]) g.add(part(G.cone, '#3a1810', { sx: 1, sy: 7, sz: 1, x: -11, y: 6, z: z * 2, rz: Math.PI / 2 + z * .3 })); }));
    }
    v3.board(W, H, .62); return v3;
  }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-60, 10), l: .45, col }); }
  function hitBug(b, d) { b.hp -= d; b.flash = .1; if (b.hp <= 0 && !b.dead) { b.dead = true; kills++; api.score(kills); burst(b.x, b.y, b.col); sfx(300, .08, 'square', .04, -100); } }
  const self = {
    reset() { grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); bugs = []; seeds = []; dews = []; dew = 150; sel = -1; cds = PLANTS.map(() => 0); gnomes = 3; wave = 0; waveT = 0; kills = 0; t = 0; parts = []; dead = 0; skyT = 3; startWave(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      cds = cds.map(v => Math.max(0, v - dt)); const C = cell();
      // dew falls from the sky now and then; lilies make it too
      skyT -= dt; if (skyT <= 0) { skyT = rnd(4, 6.5); dews.push({ x: rnd(ox() + 8, W - 8), y: top, ty: rnd(oy() + 10, H - 10), l: 9, v: 25 }); }
      for (const d of dews) { if (d.y < d.ty) d.y += 30 * dt; d.l -= dt; } dews = dews.filter(d => d.l > 0);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p = grid[r][c]; if (!p) continue; p.t += dt;
        if (p.k === 'lily' && p.t > 9) { p.t = 0; dews.push({ x: cx(c) + rnd(-4, 4), y: cy(r) - 6, ty: cy(r) + 4, l: 8, v: 25 }); }
        if (p.k === 'pod' && p.t > 1.5 && bugs.some(b => !b.dead && b.r === r && b.x > cx(c) && b.x < W + 4)) { p.t = 0; seeds.push({ x: cx(c) + 5, r }); sfx(700, .03, 'square', .02, 200); }
        if (p.k === 'pepper' && p.t > .8) { grid[r][c] = null; for (const b of bugs) if (Math.abs(b.r - r) <= 1 && Math.abs(b.x - cx(c)) < C * 1.6) hitBug(b, 90); burst(cx(c), cy(r), '#f86020', 24); haptic('heavy'); sfx(80, .4, 'sawtooth', .06, -30); }
      }
      for (const s of seeds) { s.x += 120 * dt; for (const b of bugs) if (!b.dead && b.r === s.r && Math.abs(b.x - s.x) < 5) { hitBug(b, 2); s.done = true; break; } }
      seeds = seeds.filter(s => !s.done && s.x < W + 6);
      // spawn
      if (spawnQ.length) { spawnT -= dt; if (spawnT <= 0) { const k = spawnQ.shift(); bugs.push({ k, ...BUGS[k], max: BUGS[k].hp, x: W + 6, y: 0, r: Math.random() * ROWS | 0, eat: 0, flash: 0, hopped: false }); spawnT = Math.max(2.2, 9 - wave * .6) * rnd(.6, 1.3); } }
      else if (!bugs.some(b => !b.dead)) { waveT += dt; if (waveT > 3) { waveT = 0; startWave(); } }
      for (const b of bugs) {
        if (b.dead) continue; b.flash = Math.max(0, b.flash - dt); b.y = cy(b.r);
        const c = Math.floor((b.x - ox() - 2) / C), p = c >= 0 && c < COLS ? grid[b.r][c] : null;
        if (p && p.k !== 'pepper' && b.x - cx(c) < C * .5) {
          if (b.hop && !b.hopped) { b.hopped = true; b.x -= C; continue; }
          b.eat += dt; if (b.eat > 1) { b.eat = 0; p.hp -= b.dmg / 2; p.hit = .15; sfx(200, .03, 'square', .02); if (p.hp <= 0) { grid[b.r][c] = null; burst(cx(c), cy(b.r), p.col); } }
        } else b.x -= b.sp * (C / 20) * dt;
        if (b.x < ox() - 4) { b.dead = true; gnomes--; haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); msg = { txt: gnomes > 0 ? 'A GNOME GOT EATEN!' : 'THE PATCH IS LOST', l: 1.4 }; for (const o of bugs) if (o.r === b.r) o.dead = true; if (gnomes <= 0) { dead = .01; return; } }
      }
      bugs = bugs.filter(b => !b.dead);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] && grid[r][c].hit) grid[r][c].hit = Math.max(0, grid[r][c].hit - dt);
    },
    draw(c) {
      const C = cell(), X = ox(), Y = oy(), v = view3d(), S = v.sin, k = C / 15; v.frame();
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) v.put((r + cc) % 2 ? 'lawnA' : 'lawnB', v.at(X + (cc + .5) * C, Y + (r + .5) * C), { sx: C, sz: C / S });
      v.put('soil', v.at(X + COLS * C / 2, Y + ROWS * C / 2), { sx: COLS * C + 4, sz: (ROWS * C + 4) / S });
      for (let i = 0; i <= COLS * 2; i++) { v.put('picket', v.at(X + i * C / 2, Y - 3)); v.put('picket', v.at(X + i * C / 2, Y + ROWS * C + 3)); }
      for (let i = 0; i < 10; i++) v.put('flower' + (i % 3), v.at(X + ((i * 37) % (COLS * C)), i % 2 ? Y - 8 : Y + ROWS * C + 8), { ry: i });
      v.put('house', v.at((X - 2) / 2, Y + ROWS * C / 2), { sx: Math.max(6, X - 4), sy: 3, sz: ROWS * C / S });
      for (let i = 0; i < 3; i++) v.put(i < gnomes ? 'gnome' : 'gnomeOff', v.at((X - 2) / 2, Y + 14 + i * ((ROWS * C - 20) / 3), 3), { s: 1.1 });
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
        const p = grid[r][cc]; if (!p) continue; const x = cx(cc), y = cy(r);
        const sq = p.k === 'pepper' ? 1 + Math.sin(p.t * 30) * .15 * p.t : 1, o = v.put(p.k, v.at(x, y), { s: k * sq, ry: p.k === 'lily' ? t : 0 });
        if (o.userData.flash) o.userData.flash.visible = !!p.hit;
        if (p.k === 'wall') o.scale.y = k * (.35 + .65 * p.hp / 40);
      }
      for (const sd of seeds) v.put('seed', v.at(sd.x, cy(sd.r), 6 * k));
      for (const b of bugs) {
        const sc = k * (b.k === 'stag' ? 1.4 : 1), hop = b.k === 'hopper' && !b.hopped ? Math.abs(Math.sin(t * 6)) * 4 : 0;
        const o = v.put(b.k, v.at(b.x, b.y, hop), { s: sc }); o.userData.flash.visible = b.flash > 0;
        o.userData.legs.rotation.x = Math.sin(t * 16 + b.x) * .3; v.put('blob', v.at(b.x, b.y, .2), { s: 7 * sc });
      }
      for (const d of dews) v.put('dew', v.at(d.x, d.y, 3), { s: (d.l < 2 ? d.l / 2 : 1) * (1 + Math.sin(t * 6) * .1), ry: t });
      v.render(c, W, H);
      for (const b of bugs) if (b.hp < b.max) { const s2 = k * (b.k === 'stag' ? 1.4 : 1), [bx, by] = v.over(b.x, b.y, 12 * s2); c.fillStyle = '#000a'; c.fillRect(bx - 6, by - 3, 12, 2); c.fillStyle = '#f86060'; c.fillRect(bx - 6, by - 3, 12 * b.hp / b.max, 2); }
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); }
      // cards
      backdrop(c, 0, 0, W, top - 2, '#4a3620', '#2a1c0e');
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#80d8ff'; c.fillText(`◆${dew}`, 4, 15);
      const cw = Math.min(44, (W - 44) / 4 - 3);
      PLANTS.forEach((p, i) => { const x = 40 + i * (cw + 3), can = dew >= p.cost && cds[i] <= 0; c.fillStyle = sel === i ? '#f8e8b0' : can ? '#c8b088' : '#6a5a48'; c.fillRect(x, 3, cw, top - 8); c.fillStyle = p.col; c.beginPath(); c.arc(x + 7, 12, 4, 0, 7); c.fill(); c.fillStyle = '#2a1a08'; c.textAlign = 'left'; c.fillText(String(p.cost), x + 13, 11); c.fillText(p.n, x + 13, 19); if (cds[i] > 0) { c.fillStyle = '#0008'; c.fillRect(x, 3, cw, (top - 8) * cds[i] / p.cd); } });
      c.textAlign = 'right'; c.fillStyle = '#f8f0d0'; c.fillText(`W${wave}`, W - 4, 15);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H / 2 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H / 2); }
    },
    down(x, y) {
      if (dead) return;
      for (const d of dews) if (Math.hypot(d.x - x, d.y - y) < 12) { d.l = 0; dew += d.v; haptic('light'); sfx(1200, .06, 'triangle', .04, 400); return; }
      if (y < top) { const cw = Math.min(44, (W - 44) / 4 - 3), i = Math.floor((x - 40) / (cw + 3)); if (i >= 0 && i < 4 && x - 40 - i * (cw + 3) < cw) { if (dew >= PLANTS[i].cost && cds[i] <= 0) { sel = sel === i ? -1 : i; haptic('tick'); sfx(600, .04, 'square', .03); } else { haptic('error'); sfx(150, .06, 'square', .03); } } return; }
      const C = cell(), c = Math.floor((x - ox()) / C), r = Math.floor((y - oy()) / C);
      if (sel < 0 || c < 0 || c >= COLS || r < 0 || r >= ROWS || grid[r][c]) return;
      const P = PLANTS[sel]; if (dew < P.cost) return;
      dew -= P.cost; cds[sel] = P.cd; grid[r][c] = { ...P, t: P.k === 'lily' ? 6 : 0, hit: 0 }; sel = -1; haptic('medium'); sfx(400, .08, 'square', .04, 200); burst(cx(c), cy(r) + 4, '#8a6a40', 5);
    },
    move() {}, up() {},
    key(k, d) { if (d && '1234'.includes(k)) sel = +k - 1; },
  };
  return self;
}

export default {
  id: 'garden-guard', title: 'Garden Guard', tag: 'Console · Defence', retro: true, era: 'console', pal: 'teal', w: 240, h: 176, maxW: 360, maxH: 260, goal: 60,
  hint: 'Tap glowing dew drops to collect them. Tap a card at the top, then a square to plant it. Lilies make more dew, Pea Pods shoot along their row, Walls hold beetles back and Pepper Pops blow up everything nearby. Each beetle that reaches the house eats a gnome: lose three and it\'s over.',
  make,
};
