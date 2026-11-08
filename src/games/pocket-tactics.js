import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;

// Turn-based war on a tiny map. Tap one of your blue units to see where it can go, tap a square to
// move, then tap a red unit in range to attack (or anywhere to wait). Forests slow movement but
// protect. Artillery fires 2-3 squares away, but only if it has not moved. Wipe out the red army.
const T = 16;
const KIND = { inf: { mv: 3, atk: 5.5, r: [1, 1] }, tank: { mv: 4, atk: 7, r: [1, 1] }, art: { mv: 2, atk: 6.5, r: [2, 3] } };
let W = 160, H = 160;

function make(api) {
  let C, R, map, units, sel, phase, queue, qT, battle, score, t, msg, fx, gridKey;
  const oy = () => H - R * T, at = (x, y) => units.find(u => u.hp > 0 && u.x === x && u.y === y);
  const inside = (x, y) => x >= 0 && y >= 0 && x < C && y < R;
  function reach(u) {
    const best = new Map([[u.x + ',' + u.y, 0]]), open = [[u.x, u.y, 0]];
    while (open.length) { const [x, y, c0] = open.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!inside(nx, ny) || map[ny][nx] === 2) continue; const o = at(nx, ny); if (o && o.team !== u.team) continue; const c = c0 + (map[ny][nx] === 1 ? 2 : 1); if (c > KIND[u.k].mv) continue; const key = nx + ',' + ny; if (best.has(key) && best.get(key) <= c) continue; best.set(key, c); open.push([nx, ny, c]); } }
    for (const k of [...best.keys()]) { const [x, y] = k.split(',').map(Number); const o = at(x, y); if (o && o !== u) best.delete(k); }
    return best;
  }
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  function targets(u, moved) { const r = KIND[u.k].r; if (u.k === 'art' && moved) return []; return units.filter(o => o.hp > 0 && o.team !== u.team && dist(u, o) >= r[0] && dist(u, o) <= r[1]); }
  function dmg(a, d) { const def = map[d.y][d.x] === 1 ? .7 : 1; return Math.max(1, Math.round(KIND[a.k].atk * (a.hp / 10) * def * rnd(.85, 1.1) * (a.k === 'tank' && d.k === 'inf' ? 1.2 : 1))); }
  function strike(a, d) {
    const n = dmg(a, d); d.hp -= n; fx.push({ x: d.x, y: d.y, txt: `-${n}`, l: .8 }); haptic(a.team === 0 ? 'medium' : 'heavy'); sfx(a.k === 'inf' ? 700 : 200, .12, 'square', .05, -100);
    if (d.hp <= 0) { d.hp = 0; sfx(120, .3, 'sawtooth', .05, -50); if (d.team === 1) { score += 1; api.score(score); } }
    else if (dist(a, d) === 1 && KIND[d.k].r[0] === 1) { const m = dmg(d, a); a.hp -= m; fx.push({ x: a.x, y: a.y, txt: `-${m}`, l: .8 }); if (a.hp <= 0) { a.hp = 0; if (a.team === 1) { score += 1; api.score(score); } } }
  }
  function newBattle() {
    C = Math.floor(W / T); R = Math.max(8, Math.floor((H - 12) / T)); gridKey = C + 'x' + R;
    for (let tries = 0; tries < 30; tries++) {
      map = Array.from({ length: R }, () => Array.from({ length: C }, () => Math.random() < .2 ? 1 : 0));
      for (let l = 0; l < 2; l++) { const cx = 1 + Math.random() * (C - 2) | 0, cy = 2 + Math.random() * (R - 4) | 0; for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx; x++) if (inside(x, y) && Math.random() < .8) map[y][x] = 2; }
      for (let x = 0; x < C; x++) { map[0][x] = map[0][x] === 2 ? 0 : map[0][x]; map[R - 1][x] = map[R - 1][x] === 2 ? 0 : map[R - 1][x]; map[1][x] = map[1][x] === 2 ? 0 : map[1][x]; map[R - 2][x] = map[R - 2][x] === 2 ? 0 : map[R - 2][x]; }
      // connected?
      const seen = new Set(['0,' + (R - 1)]), open = [[0, R - 1]]; while (open.length) { const [x, y] = open.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (inside(nx, ny) && map[ny][nx] !== 2 && !seen.has(k)) { seen.add(k); open.push([nx, ny]); } } }
      if (seen.has((C - 1) + ',0')) break;
    }
    const keep = (units || []).filter(u => u.team === 0 && u.hp > 0);
    const mine = keep.length ? keep : [{ k: 'inf' }, { k: 'tank' }, { k: 'art' }, { k: 'inf' }];
    const mid = C >> 1; const slotsP = [[mid - 1, R - 1], [mid, R - 2], [mid + 1, R - 1], [mid - 2, R - 2], [mid + 2, R - 2], [mid, R - 1]];
    units = mine.map((u, i) => ({ team: 0, k: u.k, hp: Math.min(10, (u.hp || 10) + 4), x: slotsP[i][0], y: slotsP[i][1] }));
    if (keep.length && keep.length < 3 && battle > 1) units.push({ team: 0, k: 'inf', hp: 10, x: slotsP[units.length][0], y: slotsP[units.length][1] });
    const ne = Math.min(6, 1 + battle), ek = ['inf', 'inf', 'tank', 'art', 'inf', 'tank'];
    const slotsE = [[mid, 0], [mid - 2, 1], [mid + 2, 1], [mid - 1, 0], [mid + 1, 1], [mid + 3, 0]];
    for (let i = 0; i < ne; i++) units.push({ team: 1, k: ek[i], hp: 10, x: Math.min(C - 1, Math.max(0, slotsE[i][0])), y: slotsE[i][1] });
    for (const u of units) if (map[u.y][u.x] === 2) map[u.y][u.x] = 0;
    sel = null; phase = 'player'; queue = []; for (const u of units) u.done = false;
    msg = { txt: `BATTLE ${battle}`, l: 1.4 };
  }
  function endTurn() {
    if (phase !== 'player') return; sel = null; phase = 'enemy';
    queue = units.filter(u => u.team === 1 && u.hp > 0); qT = .5; sfx(300, .1, 'square', .04, -100);
  }
  function enemyAct(u) {
    if (u.hp <= 0) return; const foes = units.filter(o => o.team === 0 && o.hp > 0); if (!foes.length) return;
    let pick = null;
    if (u.k === 'art') { const tg = targets(u, false); if (tg.length) { strike(u, tg.sort((a, b) => a.hp - b.hp)[0]); return; } }
    const opts = reach(u);
    for (const [k] of opts) { const [x, y] = k.split(',').map(Number); const ghost = { ...u, x, y }; const moved = x !== u.x || y !== u.y;
      const tg = targets(ghost, moved).sort((a, b) => a.hp - b.hp)[0]; const near = Math.min(...foes.map(f => dist(ghost, f)));
      const s = (tg ? 100 - tg.hp * 3 : 0) - near * 2 + (map[y][x] === 1 ? 1 : 0); if (!pick || s > pick.s) pick = { x, y, tg, s }; }
    if (pick) { u.x = pick.x; u.y = pick.y; if (pick.tg) strike(u, pick.tg); }
  }
  function checkEnd() {
    if (!units.some(u => u.team === 1 && u.hp > 0)) { score += 3; api.score(score); battle++; haptic('success'); sfx(880, .4, 'square', .05, 500); newBattle(); return true; }
    if (!units.some(u => u.team === 0 && u.hp > 0)) { phase = 'lost'; qT = 1.2; haptic('error'); return true; }
    return false;
  }
  const endBtn = () => ({ x: W - 30, y: oy() - 11, w: 28, h: 10 });
  const self = {
    reset() { units = null; battle = 1; score = 0; t = 0; fx = []; newBattle(); },
    resize(w, h) { W = w; H = h; if (units && gridKey !== Math.floor(w / T) + 'x' + Math.max(8, Math.floor((h - 12) / T))) newBattle(); },
    update(dt) {
      t += dt; for (const f of fx) f.l -= dt; fx = fx.filter(f => f.l > 0); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (phase === 'lost') { qT -= dt; if (qT <= 0) return api.over(); return; }
      if (phase === 'enemy') {
        qT -= dt; if (qT > 0) return;
        if (queue.length) { enemyAct(queue.shift()); qT = .55; if (checkEnd()) return; }
        else { phase = 'player'; for (const u of units) u.done = false; msg = { txt: 'YOUR TURN', l: .9 }; haptic('light'); }
      }
    },
    draw(c) {
      const o = oy(); c.fillStyle = '#101018'; c.fillRect(0, 0, W, H);
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        const v = map[y][x], X = x * T, Y = o + y * T;
        if (v === 2) { c.fillStyle = '#3070d0'; c.fillRect(X, Y, T, T); c.fillStyle = '#68a8f0'; c.fillRect(X + 2 + ((t * 2 + x) | 0) % 6, Y + 5, 4, 1); c.fillRect(X + 8 - ((t * 2 + y) | 0) % 5, Y + 11, 4, 1); }
        else { c.fillStyle = (x + y) % 2 ? '#98d070' : '#a0d878'; c.fillRect(X, Y, T, T); if (v === 1) { c.fillStyle = '#287830'; c.fillRect(X + 2, Y + 3, 6, 7); c.fillRect(X + 8, Y + 6, 6, 7); c.fillStyle = '#48a040'; c.fillRect(X + 3, Y + 3, 3, 3); c.fillRect(X + 9, Y + 6, 3, 3); c.fillStyle = '#704820'; c.fillRect(X + 4, Y + 10, 2, 3); c.fillRect(X + 10, Y + 13, 2, 2); } }
      }
      if (sel) {
        if (!sel.moved) for (const k of sel.reach.keys()) { const [x, y] = k.split(',').map(Number); c.fillStyle = '#ffffff60'; c.fillRect(x * T + 1, o + y * T + 1, T - 2, T - 2); }
        else for (const tg of sel.tg) { c.strokeStyle = (t * 6 | 0) % 2 ? '#f84040' : '#f8d838'; c.lineWidth = 1; c.strokeRect(tg.x * T + .5, o + tg.y * T + .5, T - 1, T - 1); }
        if (sel.u.k === 'art' && !sel.moved) for (const tg of targets(sel.u, false)) { c.strokeStyle = '#f84040'; c.strokeRect(tg.x * T + .5, o + tg.y * T + .5, T - 1, T - 1); }
      }
      for (const u of units) {
        if (u.hp <= 0) continue; const X = u.x * T, Y = o + u.y * T, main = u.team ? '#e04838' : '#3868e0', dark = u.team ? '#902818' : '#183890', dim = u.team === 0 && u.done && phase === 'player';
        c.globalAlpha = dim ? .55 : 1; const bob = sel && sel.u === u ? ((t * 6 | 0) % 2) : 0;
        if (u.k === 'inf') { c.fillStyle = dark; c.fillRect(X + 5, Y + 2 - bob, 6, 4); c.fillStyle = '#f8d0a8'; c.fillRect(X + 6, Y + 5 - bob, 4, 3); c.fillStyle = main; c.fillRect(X + 5, Y + 8 - bob, 6, 5); c.fillStyle = '#383838'; c.fillRect(X + 11, Y + 7 - bob, 1, 6); c.fillStyle = dark; c.fillRect(X + 5, Y + 13, 2, 2); c.fillRect(X + 9, Y + 13, 2, 2); }
        else if (u.k === 'tank') { c.fillStyle = '#383838'; c.fillRect(X + 2, Y + 11, 12, 3); c.fillStyle = main; c.fillRect(X + 2, Y + 7 - bob, 12, 5); c.fillStyle = dark; c.fillRect(X + 5, Y + 4 - bob, 6, 4); c.fillRect(u.team ? X + 1 : X + 10, Y + 5 - bob, 5, 2); }
        else { c.fillStyle = '#383838'; c.fillRect(X + 3, Y + 12, 3, 3); c.fillRect(X + 10, Y + 12, 3, 3); c.fillStyle = main; c.fillRect(X + 3, Y + 8 - bob, 10, 5); c.fillStyle = dark; c.save(); c.translate(X + 8, Y + 9 - bob); c.rotate(u.team ? 2.4 : -.8); c.fillRect(0, -1, 8, 3); c.restore(); }
        c.globalAlpha = 1;
        if (u.hp < 10) { c.fillStyle = '#101018'; c.fillRect(X + 10, Y + 10, 6, 6); c.fillStyle = '#f8f8f0'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(Math.ceil(u.hp), X + 10, Y + 16); }
      }
      c.font = '6px "Press Start 2P", monospace';
      for (const f of fx) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(f.txt, f.x * T + 9, o + f.y * T - 1 - (1 - f.l) * 8); c.fillStyle = '#f8d838'; c.fillText(f.txt, f.x * T + 8, o + f.y * T - 2 - (1 - f.l) * 8); }
      c.fillStyle = '#101018'; c.fillRect(0, 0, W, o); c.textAlign = 'left'; c.fillStyle = phase === 'enemy' ? '#f86048' : '#88a8f8'; c.fillText(phase === 'enemy' ? 'RED TURN' : `B${battle}`, 3, o - 3);
      if (phase === 'player') { const b = endBtn(); c.fillStyle = '#f8d838'; c.fillRect(b.x, b.y, b.w, b.h); c.fillStyle = '#101018'; c.textAlign = 'center'; c.fillText('END', b.x + b.w / 2, b.y + 8); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018c0'; c.fillRect(0, o + R * T / 2 - 9, W, 14); c.fillStyle = '#f8f8f0'; c.fillText(msg.txt, W / 2, o + R * T / 2 + 1); }
      if (t < 5 && battle === 1 && phase === 'player' && !sel) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText('TAP A BLUE UNIT', W / 2, o + R * T * .62); }
    },
    down(px, py) {
      if (phase !== 'player') return; const b = endBtn(); if (px >= b.x && px <= b.x + b.w && py >= b.y - 4 && py <= b.y + b.h + 4) { endTurn(); return; }
      const x = Math.floor(px / T), y = Math.floor((py - oy()) / T); if (!inside(x, y)) return; const u = at(x, y);
      if (!sel) { if (u && u.team === 0 && !u.done) { sel = { u, reach: reach(u), moved: false }; haptic('tick'); sfx(600, .03, 'square', .03); } return; }
      if (!sel.moved) {
        if (sel.reach.has(x + ',' + y)) { const moved = x !== sel.u.x || y !== sel.u.y; sel.u.x = x; sel.u.y = y; sel.moved = true; sel.tg = targets(sel.u, moved); sfx(400, .05, 'square', .03); if (!sel.tg.length) { sel.u.done = true; sel = null; autoEnd(); } }
        else if (u && u.team === 0 && !u.done) sel = { u, reach: reach(u), moved: false };
        else if (u && u.team === 1 && sel.u.k === 'art') { const tg = targets(sel.u, false); if (tg.includes(u)) { strike(sel.u, u); sel.u.done = true; sel = null; if (!checkEnd()) autoEnd(); } }
        else sel = null;
        return;
      }
      if (u && sel.tg.includes(u)) { strike(sel.u, u); }
      sel.u.done = true; sel = null; if (!checkEnd()) autoEnd();
    },
    key(k, d) { if (!d) return; if (k === 'Enter' || k === ' ') endTurn(); },
  };
  function autoEnd() { if (phase === 'player' && !units.some(u => u.team === 0 && u.hp > 0 && !u.done)) endTurn(); }
  return self;
}

export default {
  id: 'pocket-tactics', title: 'Pocket Tactics', tag: 'Advance · Strategy', retro: true, era: 'advance', pal: 'berry', w: 160, h: 160, maxW: 240, maxH: 240, goal: 15, step: 16,
  hint: 'Tap a blue unit, tap a lit square to move, then tap a red unit to attack or anywhere to wait. Forests protect. Artillery hits 2-3 squares away but only if it stays put. Tap END to finish your turn.',
  make,
};
