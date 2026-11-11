import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util, { Feel } = gs.effects, { Ready } = gs.rounds;
const { View, G, part, grp, blob, THREE } = gs.toon;
const { Group } = THREE;
const text = gs.pixel.text;

// Picnic Panic: ants are marching up the blanket for your cake. There is nothing to buy: every few
// seconds a free piece is dealt into your tray of three. Tap a piece, then a square to put it down.
// Put a piece on another of the same kind and level and they merge into a stronger one (up to level
// 3), and you can pick up anything already on the blanket and move or merge it. Lemon squirters shoot
// along their row, jam catapults lob sticky jam over three rows, sandwiches block the way and fans
// blow a row of ants back. Three cake slices lost and the picnic is over.
const KINDS = {
  squirt: { n: 'LEMON', hp: 6, col: '#f2d030' },
  lob: { n: 'JAM', hp: 6, col: '#d83a50' },
  wall: { n: 'BREAD', hp: 30, col: '#d8a868' },
  fan: { n: 'FAN', hp: 6, col: '#58a8e8' },
};
const DEAL = ['squirt', 'squirt', 'squirt', 'squirt', 'lob', 'lob', 'wall', 'wall', 'fan'];
const ANTS = { worker: { hp: 10, sp: 4.5, dmg: 4, col: '#4a3030' }, soldier: { hp: 26, sp: 5, dmg: 4, col: '#7a2a20' }, flyer: { hp: 9, sp: 9, dmg: 3, col: '#5a4a6a', hop: true }, beetle: { hp: 60, sp: 3.5, dmg: 10, col: '#2a4a3a' } };
const W = 240, H = 176, COLS = 6, ROWS = 4, C = 30, OX = 54, OY = 22, TRAY = H - 28;
const cx = c => OX + (c + .5) * C, cy = r => OY + (r + .5) * C;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // the ants set off after your first tap
  let grid, ants, shots, tray, dealT, sel, cakes, wave, waveT, spawnQ, spawnT, kills, t, msg, dead;

  function startWave() {
    wave++; const n = 3 + wave * 2; spawnQ = [];
    for (let i = 0; i < n; i++) { const r = Math.random(); spawnQ.push(wave > 3 && i === n - 1 ? 'beetle' : r < .55 || wave < 2 ? 'worker' : r < .8 ? (wave > 2 ? 'soldier' : 'worker') : 'flyer'); }
    spawnT = 3; msg = { txt: 'WAVE ' + wave, l: 1.4 };
  }
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#58a848', sun: [-.7, 1, .5], sunI: 2.4, amb: 1.05 });
      v3.add(part(G.plane, '#58a848', { sx: 3000, sz: 3000, y: -2, line: false }));
      v3.def('clothA', () => part(G.box, '#e85a5a', { sy: 1.5, y: -.75, line: false })).def('clothB', () => part(G.box, '#fbf3ea', { sy: 1.5, y: -.75, line: false }));
      v3.def('hem', () => part(G.box, '#c84848', { sy: 1.2, y: -1 }));
      v3.def('basket', () => grp(part(G.box, '#b07a40', { sx: 26, sy: 12, sz: 30, y: 6 }), part(G.box, '#8a5a2a', { sx: 27, sy: 2, sz: 31, y: 12 }), part(G.ring, '#8a5a2a', { sx: 11, sy: 12, sz: 3, y: 14 })));
      v3.def('cake', () => grp(part(G.cyl, '#f8f0e0', { sx: 9, sy: 1, sz: 9, y: .5 }), part(G.cyl, '#f0a8c0', { sx: 6, sy: 5, sz: 6, y: 3.5 }), part(G.cyl, '#fff6e8', { sx: 6.2, sy: 1.2, sz: 6.2, y: 6.4 }), part(G.ball, '#e03048', { s: 1.6, y: 8 })));
      v3.def('crumbs', () => grp(part(G.cyl, '#f8f0e0', { sx: 9, sy: 1, sz: 9, y: .5 }), part(G.ball, '#d8a868', { s: 1, x: 2, y: 1.4 }), part(G.ball, '#d8a868', { s: .8, x: -3, y: 1.3, z: 2 })));
      const flash = g => { const f = part(G.ball, '#ffffff', { s: 9, y: 6, glow: 1, opacity: .6, line: false }); f.visible = false; g.add(f); g.userData.flash = f; return g; };
      v3.def('squirt', () => flash(grp(part(G.ball, '#f2d030', { sx: 5.5, sy: 4.5, sz: 5.5, y: 5 }), part(G.cyl, '#fff6a0', { sx: 1.2, sy: 4, sz: 1.2, x: 6, y: 6, rz: Math.PI / 2 }), part(G.cone, '#48a840', { sx: 2.2, sy: 3, sz: 1, x: -2, y: 10, rz: .6 }), ...[-1, 1].map(z => part(G.ball, '#14101c', { s: .8, x: 4.4, y: 7.2, z: z * 2, line: false })), blob(6, .25))));
      v3.def('lob', () => { const arm = new Group(); arm.position.set(-3, 3, 0); arm.add(part(G.box, '#c8c8d4', { sx: 12, sy: 1, sz: 2.4, x: 5, y: 0 }), part(G.ball, '#d83a50', { s: 2.4, x: 10, y: 1.6 })); const g = grp(part(G.cyl, '#d83a50', { sx: 4, sy: 7, sz: 4, x: -4, y: 3.5 }), part(G.cyl, '#f8f0e0', { sx: 4.3, sy: 1.6, sz: 4.3, x: -4, y: 7.8 }), arm, blob(7, .25)); g.userData.arm = arm; return flash(g); });
      v3.def('wall', () => flash(grp(part(G.box, '#d8a868', { sx: 9, sy: 3, sz: 13, y: 1.5 }), part(G.box, '#58b848', { sx: 9.6, sy: 1.4, sz: 13.6, y: 3.7, line: false }), part(G.box, '#f8d048', { sx: 9.2, sy: 1.6, sz: 13.2, y: 5.2, line: false }), part(G.box, '#e8a0a0', { sx: 9.4, sy: 1.4, sz: 13.4, y: 6.7, line: false }), part(G.box, '#d8a868', { sx: 9, sy: 3, sz: 13, y: 9 }))));
      v3.def('fan', () => { const spin = new Group(); spin.position.set(1.5, 9, 0); for (let i = 0; i < 4; i++) { const b = new Group(); b.rotation.x = i * Math.PI / 2; b.add(part(G.box, i % 2 ? '#58a8e8' : '#f8f0e0', { sx: .6, sy: 6, sz: 3, y: 3.4 })); spin.add(b); } const g = grp(part(G.cyl, '#8a6a4a', { sx: .9, sy: 9, sz: .9, y: 4.5 }), part(G.ball, '#f8d048', { s: 1.4, x: 1.5, y: 9 }), spin, blob(5, .25)); g.userData.spin = spin; return flash(g); });
      v3.def('drop', () => part(G.ball, '#fff27a', { s: 2.2, glow: .6 }));
      v3.def('jam', () => part(G.ball, '#d83a50', { s: 3 }));
      v3.def('splat', () => part(G.disc, '#d83a50', { s: 1, y: .2, line: false }));
      v3.def('pick', () => part(G.hoop, '#ffffff', { s: 1, y: .4, glow: 1, line: false }));
      v3.def('pip', () => part(G.ball, '#ffffff', { s: 1.3, glow: .8, line: false }));
      v3.def('blob', () => blob(1, .3));
      const ant = (col, extra) => () => {
        const g = new Group(), body = part(G.ball, col, { sx: 5, sy: 3.6, sz: 4, x: 4, y: 5 }), mid = part(G.ball, col, { sx: 3, sy: 2.6, sz: 2.8, x: -2, y: 5 }), head = part(G.ball, col, { s: 3, x: -7, y: 5.5 });
        for (const z of [-1, 1]) { head.add(part(G.ball, '#f8f8f0', { s: .3, x: -.7, y: .3, z: z * .5, line: false })); head.add(part(G.cyl, '#201818', { sx: .12, sy: 1.4, sz: .12, x: -.6, y: 1, z: z * .4, rz: .6, line: false })); }
        const legs = new Group(); for (let i = -1; i <= 1; i++) for (const z of [-1, 1]) legs.add(part(G.cyl, '#201818', { sx: .5, sy: 4, sz: .5, x: i * 3.5 - 1, y: 2, z: z * 4.5, rx: z * .7, line: false }));
        g.add(legs, body, mid, head); if (extra) extra(g); g.userData.legs = legs;
        const f = part(G.ball, '#ffffff', { sx: 9, sy: 6, sz: 7, y: 5, glow: 1, opacity: .7, line: false }); f.visible = false; g.add(f); g.userData.flash = f; return g;
      };
      v3.def('worker', ant('#4a3030'));
      v3.def('soldier', ant('#7a2a20', g => g.add(part(G.cyl, '#c0c8d0', { sx: 3.2, sy: 3, sz: 3.2, x: -7, y: 8 }))));
      v3.def('flyer', ant('#5a4a6a', g => { for (const z of [-1, 1]) g.add(part(G.ball, '#e8f4ff', { sx: 5, sy: .4, sz: 2.4, x: 1, y: 9, z: z * 3.4, rx: z * .5, opacity: .8, line: false })); }));
      v3.def('beetle', ant('#2a4a3a', g => g.add(part(G.cone, '#182a20', { sx: 1.2, sy: 7, sz: 1.2, x: -11, y: 7, rz: Math.PI / 2 + .5 }))));
    }
    v3.board(W, H, .62); return v3;
  }
  const sparks = (x, y, color, n = 8) => feel.juice.burst(x, y, { n, speed: 55, life: .4, size: 2, color });
  function hitAnt(b, d) {
    b.hp -= d; b.flash = .1;
    if (b.hp <= 0 && !b.dead) { b.dead = true; kills++; api.score(kills); sparks(b.x, b.y - 4, [b.col, '#f8f8f0']); sfx(300, .08, 'square', .04, -100); haptic('light'); }
  }
  function put(c, r) {                                   // a tap on a blanket square
    const u = grid[r][c];
    if (sel && sel.slot != null) {
      const k = tray[sel.slot];
      if (!u) grid[r][c] = { k, lvl: 1, hp: KINDS[k].hp, t: 0, hit: 0 };
      else if (u.k === k && u.lvl === 1) merge(u, c, r);
      else return nope();
      tray[sel.slot] = null; sel = null; placed(c, r); return;
    }
    if (sel) {
      const s = grid[sel.r][sel.c];
      if (!s || (sel.c === c && sel.r === r)) { sel = null; return; }
      if (!u) grid[r][c] = s; else if (u.k === s.k && u.lvl === s.lvl && u.lvl < 3) merge(u, c, r); else { sel = { c, r }; haptic('tick'); return; }
      grid[sel.r][sel.c] = null; sel = null; placed(c, r); return;
    }
    if (u) { sel = { c, r }; haptic('tick'); sfx(600, .04, 'square', .03); }
  }
  function merge(u, c, r) { u.lvl++; u.hp = KINDS[u.k].hp * u.lvl; feel.juice.pop(cx(c), cy(r) - 16, 'LEVEL ' + u.lvl, { color: '#fff2a0' }); sparks(cx(c), cy(r) - 6, ['#fff2a0', '#ffffff'], 14); sfx(880, .15, 'square', .04, 400); haptic('success'); }
  function placed(c, r) { haptic('medium'); sfx(400, .08, 'square', .04, 200); sparks(cx(c), cy(r), ['#ffffff', '#f8d0d0'], 5); }
  function nope() { haptic('error'); sfx(150, .06, 'square', .03); }

  return {
    reset() {
      grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); ants = []; shots = []; tray = ['squirt', 'squirt', 'wall']; dealT = 4; sel = null;
      cakes = 3; wave = 0; waveT = 0; kills = 0; t = 0; dead = 0; msg = null; feel.clear(); ready.reset(); startWave(); msg = null;
    },
    update(dt) {
      feel.update(dt); t += dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.5) api.over(); return; }
      if (!ready.update(dt)) return;
      if (tray.includes(null)) { dealT -= dt; if (dealT <= 0) { dealT = 4.5; tray[tray.indexOf(null)] = DEAL[Math.random() * DEAL.length | 0]; sfx(1000, .04, 'square', .03, 200); } }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const u = grid[r][c]; if (!u) continue; u.t += dt; u.hit = Math.max(0, u.hit - dt);
        const ahead = ants.filter(b => !b.dead && b.x > cx(c) - 4 && b.x < W + 4);
        if (u.k === 'squirt' && u.t > 1.5 && ahead.some(b => b.r === r)) { u.t = 0; shots.push({ k: 'drop', x: cx(c) + 6, r, d: [2, 5, 9][u.lvl - 1] }); sfx(700, .03, 'square', .02, 200); }
        if (u.k === 'lob' && u.t > 3) { const b = ahead.filter(b => Math.abs(b.r - r) <= 1).sort((a, b2) => a.x - b2.x)[0]; if (b) { u.t = 0; shots.push({ k: 'jam', x0: cx(c), y0: cy(r), x1: b.x - 4, y1: b.y, l: 0, d: 3 * u.lvl }); sfx(260, .12, 'triangle', .04, 300); } }
        if (u.k === 'fan' && u.t > [6, 4.5, 3][u.lvl - 1]) { const row = ahead.filter(b => b.r === r && b.x < cx(c) + C * 4); if (row.length) { u.t = 0; u.gust = .5; for (const b of row) b.x = Math.min(W + 4, b.x + C * 1.5); sfx(500, .3, 'sine', .04, -300); haptic('light'); } }
      }
      for (const s of shots) {
        if (s.k === 'drop') { s.x += 130 * dt; for (const b of ants) if (!b.dead && b.r === s.r && Math.abs(b.x - s.x) < 6) { hitAnt(b, s.d); s.done = true; break; } if (s.x > W + 6) s.done = true; }
        else { s.l += dt / .7; if (s.l >= 1) { s.done = true; for (const b of ants) if (!b.dead && Math.hypot(b.x - s.x1, b.y - s.y1) < C * .95) { hitAnt(b, s.d); b.slow = 1.5; } sparks(s.x1, s.y1, ['#d83a50', '#f8a0b0'], 10); sfx(160, .1, 'square', .04, -40); } }
      }
      shots = shots.filter(s => !s.done);
      if (spawnQ.length) { spawnT -= dt; if (spawnT <= 0) { const k = spawnQ.shift(), r = Math.random() * ROWS | 0; ants.push({ k, ...ANTS[k], max: ANTS[k].hp, x: W + 6, y: cy(r), r, eat: 0, flash: 0, slow: 0, hopped: false }); spawnT = Math.max(1.4, 5 - wave * .5) * rnd(.6, 1.3); } }
      else if (!ants.some(b => !b.dead)) { waveT += dt; if (waveT > 2.5) { waveT = 0; startWave(); } }
      for (const b of ants) {
        if (b.dead) continue; b.flash = Math.max(0, b.flash - dt); b.slow = Math.max(0, b.slow - dt);
        const c = Math.floor((b.x - OX - 2) / C), u = c >= 0 && c < COLS ? grid[b.r][c] : null;
        if (u && b.x - cx(c) < C * .5) {
          if (b.hop && !b.hopped) { b.hopped = true; b.x -= C; continue; }
          b.eat += dt; if (b.eat > 1) { b.eat = 0; u.hp -= b.dmg / 2; u.hit = .15; sfx(200, .03, 'square', .02); if (u.hp <= 0) { grid[b.r][c] = null; if (sel && sel.c === c && sel.r === b.r) sel = null; sparks(cx(c), cy(b.r), [KINDS[u.k].col, '#f8f8f0']); } }
        } else b.x -= b.sp * 1.5 * (b.slow > 0 ? .4 : 1) * dt;
        if (b.x < OX - 4) {
          b.dead = true; cakes--; haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); feel.juice.shake(4); msg = { txt: cakes > 0 ? 'THEY GOT A SLICE' : 'THE CAKE IS GONE', l: 1.4 };
          for (const o of ants) if (o.r === b.r) o.dead = true;
          if (cakes <= 0) { dead = .01; return; }
        }
      }
      ants = ants.filter(b => !b.dead);
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      const v = view3d(), S = v.sin; v.frame();
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) v.put((r + cc) % 2 ? 'clothA' : 'clothB', v.at(cx(cc), cy(r)), { sx: C, sz: C / S });
      v.put('hem', v.at(OX + COLS * C / 2, OY + ROWS * C / 2), { sx: COLS * C + 6, sz: (ROWS * C + 6) / S });
      v.put('basket', v.at(18, OY + 30), { s: 1 });
      for (let i = 0; i < 3; i++) v.put(i < cakes ? 'cake' : 'crumbs', v.at(36, OY + 62 + i * 22), { s: 1 });
      if (sel && sel.slot == null) v.put('pick', v.at(cx(sel.c), cy(sel.r)), { sx: C * .5, sz: C * .5 / S });
      for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
        const u = grid[r][cc]; if (!u) continue; const x = cx(cc), y = cy(r), k = 1 + (u.lvl - 1) * .22;
        const o = v.put(u.k, v.at(x, y), { s: k }); o.userData.flash.visible = u.hit > 0;
        if (o.userData.spin) o.userData.spin.rotation.x = t * (u.gust > 0 ? 30 : 5);
        if (o.userData.arm) o.userData.arm.rotation.z = u.t < .25 ? 1.1 : .15;
        if (u.gust > 0) u.gust -= .016;
        if (u.k === 'wall') o.scale.y = k * (.4 + .6 * clamp(u.hp / (30 * u.lvl), 0, 1));
        for (let i = 1; i < u.lvl; i++) v.put('pip', v.at(x - 8 + i * 5, y + 11, 2));
      }
      for (const s of shots) {
        if (s.k === 'drop') v.put('drop', v.at(s.x, cy(s.r), 6));
        else v.put('jam', v.at(s.x0 + (s.x1 - s.x0) * s.l, s.y0 + (s.y1 - s.y0) * s.l, 6 + Math.sin(s.l * Math.PI) * 34));
      }
      for (const b of ants) {
        const sc = b.k === 'beetle' ? 1.5 : 1, hop = b.k === 'flyer' && !b.hopped ? 5 + Math.abs(Math.sin(t * 6)) * 4 : 0;
        const o = v.put(b.k, v.at(b.x, b.y, hop), { s: sc }); o.userData.flash.visible = b.flash > 0;
        o.userData.legs.rotation.x = Math.sin(t * 16 + b.x) * .3; v.put('blob', v.at(b.x, b.y, .2), { s: 7 * sc });
        if (b.slow > 0) v.put('splat', v.at(b.x, b.y), { sx: 7, sz: 7 / S });
      }
      v.render(c, W, H);
      for (const b of ants) if (b.hp < b.max) { const s2 = b.k === 'beetle' ? 1.5 : 1, [bx, by] = v.over(b.x, b.y, 12 * s2); c.fillStyle = '#101018'; c.fillRect(bx - 7, by - 4, 14, 4); c.fillStyle = '#f86060'; c.fillRect(bx - 6, by - 3, Math.round(12 * b.hp / b.max), 2); }
      feel.begin(c); feel.end(c, W, H);
      // the tray: three dealt pieces, and how long until the next one
      c.fillStyle = '#3a2814'; c.fillRect(0, TRAY, W, H - TRAY); c.fillStyle = '#5a3e20'; c.fillRect(0, TRAY, W, 1);
      text(c, 'WAVE ' + wave, 4, TRAY + 6, { color: '#f8f0d0' });
      const k = tray.includes(null) ? clamp(1 - dealT / 4.5, 0, 1) : 1; c.fillStyle = '#5a3e20'; c.fillRect(4, TRAY + 16, 40, 4); c.fillStyle = '#f8d048'; c.fillRect(4, TRAY + 16, Math.round(40 * k), 4);
      tray.forEach((kind, i) => {
        const x = 54 + i * 60, on = sel && sel.slot === i;
        c.fillStyle = on ? '#fff2a0' : kind ? '#e8d8b8' : '#4a3418'; c.fillRect(x, TRAY + 4, 54, 21);
        if (!kind) return;
        const K = KINDS[kind]; c.fillStyle = '#101018'; c.fillRect(x + 3, TRAY + 7, 15, 15); c.fillStyle = K.col; c.fillRect(x + 4, TRAY + 8, 13, 13);
        c.fillStyle = '#ffffff'; if (kind === 'squirt') c.fillRect(x + 12, TRAY + 13, 6, 3); else if (kind === 'lob') c.fillRect(x + 6, TRAY + 9, 9, 3); else if (kind === 'wall') { c.fillStyle = '#58b848'; c.fillRect(x + 4, TRAY + 13, 13, 3); } else { c.fillRect(x + 10, TRAY + 9, 2, 11); c.fillRect(x + 5, TRAY + 14, 11, 2); }
        text(c, K.n, x + 22, TRAY + 12, { color: '#3a2814' });
      });
      if (msg) { c.fillStyle = '#101018'; c.fillRect(0, 76, W, 13); text(c, msg.txt, W / 2, 80, { color: dead ? '#f86060' : '#fff2a0', align: 'center' }); }
      ready.draw(c, W, H, { pixel: true, color: '#ffffff', shadow: '#101018', y: 84, text: 'TAP A PIECE, THEN A SQUARE' });
    },
    down(x, y) {
      if (dead) return; ready.go();
      if (y >= TRAY) { const i = Math.floor((x - 54) / 60); if (i >= 0 && i < 3 && x - 54 - i * 60 < 54 && tray[i]) { sel = sel && sel.slot === i ? null : { slot: i }; haptic('tick'); sfx(600, .04, 'square', .03); } return; }
      const c = Math.floor((x - OX) / C), r = Math.floor((y - OY) / C);
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) put(c, r);
    },
    move() {}, up() {},
    key(k, d) { if (!d) return; ready.go(); const i = '123'.indexOf(k); if (i >= 0 && tray[i]) sel = { slot: i }; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'picnic-panic', title: 'Picnic Panic', tag: 'Console · Defence', retro: true, era: 'console', pal: 'teal', w: W, h: H, goal: 30, music: 'silly',
  hint: 'Tap a piece in the tray, then a square on the blanket. Two of the same kind and level merge into a stronger one, and you can move pieces already down. Keep the ants off the cake.',
  make,
};
