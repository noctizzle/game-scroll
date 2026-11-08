import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Tower defense, pocket-console style. Bugs march down the winding road toward your picnic.
// Tap grass to build one of five towers, tap a tower to upgrade or sell it. Each wave mixes
// runners, armoured shells, moths, splitting slimes and, every fifth wave, a big boss bug.
const T = 16, TOP = 12, PANEL = 34;
const TOWERS = [
  { k: 'arrow', name: 'ARROW', cost: 25, range: 40, rate: .45, dmg: 1.4, col: '#58c040', hi: '#a8f070' },
  { k: 'frost', name: 'FROST', cost: 35, range: 34, rate: .8, dmg: .5, slow: .45, col: '#38b8e8', hi: '#c8f0ff' },
  { k: 'cannon', name: 'CANNON', cost: 50, range: 44, rate: 1.4, dmg: 4, splash: 18, col: '#e08030', hi: '#f8c070' },
  { k: 'zap', name: 'ZAP', cost: 60, range: 38, rate: 1, dmg: 2.2, chain: 3, col: '#a858e8', hi: '#e8b8ff' },
  { k: 'sniper', name: 'SNIPER', cost: 70, range: 90, rate: 2, dmg: 9, col: '#e04848', hi: '#f8a0a0' },
];
const BUGS = {
  beetle: { hp: 6, sp: 18, armor: 0, bounty: 3, col: '#c04030', r: 4 },
  runner: { hp: 3, sp: 34, armor: 0, bounty: 2, col: '#f8c838', r: 3 },
  shell: { hp: 10, sp: 13, armor: 1.2, bounty: 5, col: '#7888a0', r: 5 },
  moth: { hp: 5, sp: 24, armor: 0, bounty: 4, col: '#e868b8', r: 4, fly: true },
  slime: { hp: 8, sp: 16, armor: 0, bounty: 3, col: '#48c048', r: 5, split: true },
  baby: { hp: 3, sp: 24, armor: 0, bounty: 1, col: '#78e070', r: 3 },
  boss: { hp: 90, sp: 10, armor: 2, bounty: 40, col: '#882058', r: 8, boss: true },
};
let W = 160, H = 176;

function make(api) {
  let C, R, grid, way, plen, towers, bugs, shots, fx, coins, lives, wave, queue, spawnT, breakT, sel, score, t, speed, shake, msg, lastLeak;
  const oy = TOP, fieldH = () => H - TOP - PANEL;
  function buildMap() {
    C = Math.floor(W / T); R = Math.floor(fieldH() / T);
    grid = Array.from({ length: R }, () => Array(C).fill(0)); // 0 grass, 1 road, 2 rock/tree, 3 tower
    let c = 1 + Math.random() * (C - 2) | 0, r = 0; const pts = [[c, -1]];
    grid[0][c] = 1;
    while (r < R - 1) {
      const down = Math.min(R - 1 - r, 2 + (Math.random() * 2 | 0)); for (let i = 0; i < down; i++) { r++; grid[r][c] = 1; }
      if (r >= R - 1) break; pts.push([c, r]);
      let nc; do { nc = 1 + Math.random() * (C - 2) | 0; } while (Math.abs(nc - c) < 3);
      while (c !== nc) { c += Math.sign(nc - c); grid[r][c] = 1; } pts.push([c, r]);
    }
    pts.push([c, R - 1], [c, R + .6]);
    way = pts.map(([x, y]) => ({ x: x * T + 8, y: oy + y * T + 8 }));
    plen = 0; for (let i = 1; i < way.length; i++) plen += Math.hypot(way[i].x - way[i - 1].x, way[i].y - way[i - 1].y);
    for (let i = 0; i < C * R * .06; i++) { const x = Math.random() * C | 0, y = Math.random() * R | 0; if (!grid[y][x]) grid[y][x] = 2; }
    towers = [];
  }
  function at(d) { for (let i = 1; i < way.length; i++) { const a = way[i - 1], b = way[i], l = Math.hypot(b.x - a.x, b.y - a.y); if (d <= l) return { x: a.x + (b.x - a.x) * d / l, y: a.y + (b.y - a.y) * d / l }; d -= l; } return way[way.length - 1]; }
  function planWave() {
    wave++; queue = []; const n = 6 + wave * 2, pick = [];
    pick.push('beetle'); if (wave >= 2) pick.push('runner'); if (wave >= 3) pick.push('slime'); if (wave >= 4) pick.push('shell'); if (wave >= 6) pick.push('moth');
    const theme = pick[Math.random() * pick.length | 0];
    for (let i = 0; i < n; i++) queue.push(Math.random() < .45 ? theme : pick[Math.random() * pick.length | 0]);
    if (wave % 5 === 0) queue.push('boss');
    spawnT = 0; msg = { txt: wave % 5 === 0 ? `WAVE ${wave}: BOSS!` : `WAVE ${wave}`, l: 1.5 };
  }
  function spawn(k, d = 0) {
    const b = BUGS[k], scale = Math.pow(1 + (wave - 1) * .22, 1.18) * Math.pow(1.09, Math.max(0, wave - 8));
    bugs.push({ k, d, hp: b.hp * scale, max: b.hp * scale, sp: b.sp * (1 + Math.min(.4, wave * .015)), slowT: 0, hit: 0, wob: rnd(0, 6) });
  }
  const tw = tt => TOWERS[tt.type];
  const stat = tt => { const b = tw(tt), lv = tt.lv; return { range: b.range * (1 + (lv - 1) * .12), rate: b.rate * (1 - (lv - 1) * .14), dmg: b.dmg * Math.pow(1.7, lv - 1), splash: b.splash, slow: b.slow ? b.slow - (lv - 1) * .08 : 0, chain: b.chain ? b.chain + lv - 1 : 0 }; };
  const upCost = tt => Math.round(tw(tt).cost * (.7 + tt.lv * .45));
  const worth = tt => { let v = tw(tt).cost; for (let l = 1; l < tt.lv; l++) v += Math.round(tw(tt).cost * (.7 + l * .45)); return v; };
  function damage(b, n, kind) {
    const base = BUGS[b.k]; const real = Math.max(n * .25, n - base.armor * (kind === 'zap' ? .3 : 1)); b.hp -= real; b.hit = .1;
    if (b.hp <= 0 && !b.dead) {
      b.dead = true; coins += base.bounty; score += base.boss ? 10 : 1; api.score(score);
      fx.push({ x: b.x, y: b.y - 4, txt: `+${base.bounty}`, l: .7, col: '#f8d838' });
      for (let i = 0; i < (base.boss ? 18 : 5); i++) fx.push({ x: b.x, y: b.y, vx: rnd(-40, 40), vy: rnd(-40, 30), l: rnd(.2, .5), col: base.col });
      if (base.split) { spawn('baby', b.d + 3); spawn('baby', Math.max(0, b.d - 3)); }
      if (base.boss) { shake = .4; haptic('success'); sfx(200, .5, 'square', .06, 400); } else { haptic('tick'); sfx(260 + Math.random() * 80, .05, 'square', .03, -100); }
    }
  }
  function fire(tt) {
    const s = stat(tt), b0 = tw(tt), inR = bugs.filter(b => !b.dead && Math.hypot(b.x - tt.x, b.y - tt.y) <= s.range && !(b0.k === 'cannon' && BUGS[b.k].fly));
    if (!inR.length) return false;
    const target = b0.k === 'sniper' ? inR.reduce((a, b) => b.hp > a.hp ? b : a) : inR.reduce((a, b) => b.d > a.d ? b : a);
    tt.aim = Math.atan2(target.y - tt.y, target.x - tt.x); tt.kick = .12;
    if (b0.k === 'zap') {
      let cur = target; const hit = [target];
      for (let i = 1; i < s.chain; i++) { const nx = bugs.filter(b => !b.dead && !hit.includes(b) && Math.hypot(b.x - cur.x, b.y - cur.y) < 26).sort((a, b) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y))[0]; if (!nx) break; hit.push(nx); cur = nx; }
      fx.push({ zap: [{ x: tt.x, y: tt.y - 4 }, ...hit.map(b => ({ x: b.x, y: b.y }))], l: .15 }); for (const b of hit) damage(b, s.dmg, 'zap'); sfx(1200, .05, 'sawtooth', .025, -600); return true;
    }
    shots.push({ x: tt.x, y: tt.y - 3, tg: target, k: b0.k, dmg: s.dmg, splash: s.splash, slow: s.slow, sp: b0.k === 'sniper' ? 400 : b0.k === 'cannon' ? 110 : 170, sx: tt.x, sy: tt.y });
    sfx(b0.k === 'cannon' ? 120 : b0.k === 'sniper' ? 900 : b0.k === 'frost' ? 1500 : 700, .03, 'square', .02, b0.k === 'cannon' ? -40 : -200);
    return true;
  }
  function tileAt(x, y) { const c = Math.floor(x / T), r = Math.floor((y - oy) / T); return c >= 0 && r >= 0 && c < C && r < R ? { c, r } : null; }
  const panelY = () => H - PANEL;
  function panelButtons() {
    const y = panelY() + 3, h = PANEL - 6;
    if (sel && sel.build) { const w = W / 5; return TOWERS.map((tp, i) => ({ x: i * w + 1, y, w: w - 2, h, act: 'build', i })); }
    if (sel && sel.tower) { const half = (W - 6) / 2; return [{ x: 2, y, w: half, h, act: 'up' }, { x: 4 + half, y, w: half, h, act: 'sell' }]; }
    return [{ x: W - 46, y, w: 44, h, act: 'go' }, { x: W - 76, y, w: 28, h, act: 'speed' }];
  }
  const self = {
    reset() { coins = 90; lives = 15; wave = 0; bugs = []; shots = []; fx = []; queue = []; sel = null; score = 0; t = 0; speed = 1; shake = 0; msg = null; breakT = 8; lastLeak = 0; buildMap(); },
    resize(w, h) { const changed = Math.floor(w / T) !== C || Math.floor((h - TOP - PANEL) / T) !== R; W = w; H = h; if (changed && grid) { const keepCoins = coins + (towers || []).reduce((a, tt) => a + worth(tt), 0); buildMap(); coins = keepCoins; bugs = []; shots = []; sel = null; if (queue.length || wave) breakT = Math.max(breakT, 4); } },
    update(dt0) {
      t += dt0; shake = Math.max(0, shake - dt0); if (msg) { msg.l -= dt0; if (msg.l <= 0) msg = null; }
      for (const f of fx) { f.l -= dt0; if (f.vx != null) { f.x += f.vx * dt0; f.y += f.vy * dt0; } else if (f.txt) f.y -= 14 * dt0; } fx = fx.filter(f => f.l > 0);
      const steps = speed; const dt = dt0;
      for (let st = 0; st < steps; st++) {
        if (!queue.length && !bugs.length) { breakT -= dt; if (breakT <= 0) { planWave(); } }
        if (queue.length) { spawnT -= dt; if (spawnT <= 0) { const k = queue.shift(); spawn(k); spawnT = k === 'boss' ? 2 : Math.max(.35, 1 - wave * .03) * (k === 'runner' ? .6 : 1); } }
        for (const b of bugs) {
          if (b.dead) continue; const base = BUGS[b.k]; b.slowT = Math.max(0, b.slowT - dt); b.hit = Math.max(0, b.hit - dt);
          b.d += base.sp * (b.slowT > 0 && !base.boss ? b.slowF : b.slowT > 0 ? .8 : 1) * dt * (b.sp / base.sp);
          const p = at(b.d); b.x = p.x + (base.fly ? Math.sin(t * 4 + b.wob) * 4 : 0); b.y = p.y;
          if (b.d >= plen) { b.dead = true; b.leaked = true; const loss = base.boss ? 5 : 1; lives -= loss; shake = .25; haptic('heavy'); sfx(150, .25, 'square', .05, -60); lastLeak = t; fx.push({ x: b.x, y: b.y - 10, txt: `-${loss}`, l: .9, col: '#f84040' }); }
        }
        bugs = bugs.filter(b => !b.dead);
        for (const tt of towers) { tt.cd -= dt; tt.kick = Math.max(0, (tt.kick || 0) - dt); if (tt.cd <= 0 && fire(tt)) tt.cd = stat(tt).rate; }
        for (const s of shots) {
          const tg = s.tg; if (!tg.dead) { s.tx = tg.x; s.ty = tg.y; }
          const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), mv = s.sp * dt;
          if (d <= mv + 2) {
            s.done = true;
            if (s.splash) { for (const b of bugs) if (!BUGS[b.k].fly && Math.hypot(b.x - s.tx, b.y - s.ty) < s.splash) damage(b, s.dmg, 'cannon'); fx.push({ ring: true, x: s.tx, y: s.ty, r: s.splash, l: .25 }); haptic('light'); sfx(90, .12, 'square', .05, -30); }
            else if (!tg.dead) { damage(tg, s.dmg, s.k); if (s.slow) { tg.slowT = 1.6; tg.slowF = s.slow; } }
          } else { s.x += dx / d * mv; s.y += dy / d * mv; }
        }
        shots = shots.filter(s => !s.done);
      }
      if (lives <= 0) { haptic('error'); sfx(110, .6, 'sawtooth', .06, -40); return api.over(); }
    },
    draw(c) {
      const sx = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
      c.fillStyle = '#101018'; c.fillRect(0, 0, W, H); c.save(); c.translate(sx, 0);
      for (let r = 0; r < R; r++) for (let cc = 0; cc < C; cc++) {
        const v = grid[r][cc], X = cc * T, Y = oy + r * T;
        if (v === 1) { c.fillStyle = '#c8a068'; c.fillRect(X, Y, T, T); c.fillStyle = '#b08850'; c.fillRect(X + ((r * 7 + cc * 3) % 11), Y + ((r * 5 + cc) % 13), 2, 1); c.fillRect(X + ((r * 3 + cc * 7) % 13), Y + ((r + cc * 5) % 11), 1, 1);
          c.fillStyle = '#987040'; if (r > 0 && grid[r - 1][cc] !== 1) c.fillRect(X, Y, T, 1); if (r < R - 1 && grid[r + 1][cc] !== 1) c.fillRect(X, Y + T - 1, T, 1); if (cc > 0 && grid[r][cc - 1] !== 1) c.fillRect(X, Y, 1, T); if (cc < C - 1 && grid[r][cc + 1] !== 1) c.fillRect(X + T - 1, Y, 1, T); }
        else { c.fillStyle = (r + cc) % 2 ? '#68b848' : '#70c050'; c.fillRect(X, Y, T, T); c.fillStyle = '#58a038'; c.fillRect(X + (cc * 5 % 12) + 1, Y + (r * 7 % 12) + 2, 1, 2);
          if (v === 2) { if ((r + cc) % 3) { c.fillStyle = '#286830'; c.fillRect(X + 3, Y + 2, 10, 9); c.fillStyle = '#389840'; c.fillRect(X + 4, Y + 3, 5, 4); c.fillStyle = '#704820'; c.fillRect(X + 7, Y + 11, 2, 4); } else { c.fillStyle = '#787890'; c.fillRect(X + 3, Y + 6, 10, 7); c.fillStyle = '#a0a0b8'; c.fillRect(X + 4, Y + 6, 5, 2); } } }
      }
      // picnic blanket at the end of the road
      const end = way[way.length - 2]; c.fillStyle = '#e04848'; c.fillRect(end.x - 7, end.y - 5, 14, 10); c.fillStyle = '#f8f8f0'; for (let i = 0; i < 4; i++) c.fillRect(end.x - 7 + i * 4, end.y - 5 + (i % 2) * 5, 3, 5);
      if (sel && (sel.build || sel.tower)) { const X = sel.c * T, Y = oy + sel.r * T; c.strokeStyle = '#f8f8f0'; c.lineWidth = 1; c.strokeRect(X + .5, Y + .5, T - 1, T - 1); }
      if (sel && sel.tower) { const s = stat(sel.tower); c.fillStyle = '#ffffff20'; c.beginPath(); c.arc(sel.tower.x, sel.tower.y, s.range, 0, 7); c.fill(); c.strokeStyle = '#ffffff80'; c.stroke(); }
      for (const tt of towers) {
        const b = tw(tt), X = tt.x - 8, Y = tt.y - 8, k = tt.kick > 0 ? 1 : 0;
        c.fillStyle = '#585868'; c.fillRect(X + 2, Y + 9, 12, 6); c.fillStyle = '#787890'; c.fillRect(X + 2, Y + 9, 12, 2);
        c.fillStyle = b.col; c.fillRect(X + 4, Y + 3 + k, 8, 8); c.fillStyle = b.hi; c.fillRect(X + 4, Y + 3 + k, 8, 2);
        const ax = Math.cos(tt.aim || -1.57), ay = Math.sin(tt.aim || -1.57); c.fillStyle = '#202028'; c.fillRect(Math.round(tt.x + ax * 5) - 1, Math.round(tt.y - 2 + k + ay * 5) - 1, 3, 3);
        for (let l = 0; l < tt.lv; l++) { c.fillStyle = '#f8d838'; c.fillRect(X + 4 + l * 3, Y + 13, 2, 2); }
      }
      for (const b of bugs) {
        const base = BUGS[b.k], x = Math.round(b.x), y = Math.round(b.y), r = base.r, step = (t * 10 + b.wob | 0) % 2;
        if (base.fly) { c.fillStyle = '#00000030'; c.fillRect(x - r, y + 5, r * 2, 2); }
        const yy = base.fly ? y - 5 : y;
        c.fillStyle = b.hit > 0 ? '#f8f8f0' : b.slowT > 0 ? '#a8e0f8' : base.col; c.fillRect(x - r, yy - r + 1, r * 2, r * 2 - 1); c.fillRect(x - r + 1, yy - r, r * 2 - 2, r * 2 + 1);
        if (base.fly) { c.fillStyle = '#f8f8f0a0'; c.fillRect(x - r - 3, yy - 2 - step, 3, 3); c.fillRect(x + r, yy - 2 - step, 3, 3); }
        else { c.fillStyle = '#101018'; c.fillRect(x - r, yy + r - 1 + step, 1, 2); c.fillRect(x + r - 1, yy + r - step, 1, 2); }
        if (b.k === 'shell') { c.fillStyle = '#a8b8d0'; c.fillRect(x - r + 1, yy - r + 1, r * 2 - 2, 2); }
        c.fillStyle = '#101018'; c.fillRect(x - 2, yy - 1, 1, 1); c.fillRect(x + 1, yy - 1, 1, 1);
        if (b.hp < b.max) { c.fillStyle = '#101018'; c.fillRect(x - r, yy - r - 4, r * 2, 2); c.fillStyle = b.hp / b.max > .4 ? '#58e048' : '#f84040'; c.fillRect(x - r, yy - r - 4, Math.max(1, r * 2 * b.hp / b.max), 2); }
      }
      for (const s of shots) { c.fillStyle = s.k === 'cannon' ? '#202028' : s.k === 'frost' ? '#c8f0ff' : s.k === 'sniper' ? '#f8f8f0' : '#f8e070'; const z = s.k === 'cannon' ? 3 : 2; c.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, z, z); if (s.k === 'sniper') { c.strokeStyle = '#f8f8f060'; c.beginPath(); c.moveTo(s.sx, s.sy); c.lineTo(s.x, s.y); c.stroke(); } }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const f of fx) {
        if (f.zap) { c.strokeStyle = (t * 30 | 0) % 2 ? '#e8b8ff' : '#f8f8f0'; c.lineWidth = 1; c.beginPath(); c.moveTo(f.zap[0].x, f.zap[0].y); for (const p of f.zap.slice(1)) c.lineTo(p.x + rnd(-1, 1), p.y + rnd(-1, 1)); c.stroke(); }
        else if (f.ring) { c.strokeStyle = '#f8c070'; c.beginPath(); c.arc(f.x, f.y, f.r * (1.2 - f.l * 2), 0, 7); c.stroke(); }
        else if (f.txt) { c.fillStyle = '#101018'; c.fillText(f.txt, f.x + 1, f.y + 1); c.fillStyle = f.col; c.fillText(f.txt, f.x, f.y); }
        else { c.fillStyle = f.col; c.fillRect(f.x | 0, f.y | 0, 2, 2); }
      }
      c.restore();
      // top bar
      c.fillStyle = '#101018'; c.fillRect(0, 0, W, TOP); c.textAlign = 'left'; c.fillStyle = '#f8d838'; c.fillText(`$${coins}`, 2, 9);
      c.textAlign = 'right'; c.fillStyle = t - lastLeak < .5 && (t * 10 | 0) % 2 ? '#f8f8f0' : '#f84858'; c.fillText(`♥${lives}`, W - 2, 9);
      // bottom panel
      const py = panelY(); c.fillStyle = '#282848'; c.fillRect(0, py, W, PANEL); c.fillStyle = '#383868'; c.fillRect(0, py, W, 1);
      const btns = panelButtons();
      if (sel && sel.build) {
        for (const b of btns) { const tp = TOWERS[b.i], ok = coins >= tp.cost; c.fillStyle = ok ? '#404070' : '#303048'; c.fillRect(b.x, b.y, b.w, b.h); c.globalAlpha = ok ? 1 : .4;
          c.fillStyle = tp.col; c.fillRect(b.x + b.w / 2 - 4, b.y + 3, 8, 8); c.fillStyle = tp.hi; c.fillRect(b.x + b.w / 2 - 4, b.y + 3, 8, 2); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText(tp.name.slice(0, 5), b.x + b.w / 2, b.y + 19); c.fillStyle = '#f8d838'; c.fillText(`$${tp.cost}`, b.x + b.w / 2, b.y + 27); c.globalAlpha = 1; }
      } else if (sel && sel.tower) {
        const tt = sel.tower, up = tt.lv < 3, cost = upCost(tt); c.textAlign = 'center';
        c.fillStyle = up && coins >= cost ? '#58a040' : '#404058'; c.fillRect(btns[0].x, btns[0].y, btns[0].w, btns[0].h); c.fillStyle = '#f8f8f0'; c.fillText(up ? `UPGRADE` : 'MAX LEVEL', btns[0].x + btns[0].w / 2, btns[0].y + 12); if (up) { c.fillStyle = '#f8d838'; c.fillText(`$${cost}`, btns[0].x + btns[0].w / 2, btns[0].y + 22); }
        c.fillStyle = '#a04040'; c.fillRect(btns[1].x, btns[1].y, btns[1].w, btns[1].h); c.fillStyle = '#f8f8f0'; c.fillText(`SELL`, btns[1].x + btns[1].w / 2, btns[1].y + 12); c.fillStyle = '#f8d838'; c.fillText(`+$${Math.round(worth(tt) * .7)}`, btns[1].x + btns[1].w / 2, btns[1].y + 22);
      } else {
        c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(`WAVE ${wave}`, 4, py + 13);
        c.fillStyle = '#a0a0c8'; c.fillText(queue.length || bugs.length ? `${queue.length + bugs.length} BUGS` : `NEXT IN ${Math.ceil(breakT)}`, 4, py + 25);
        const [go, sp] = btns; const idle = !queue.length && !bugs.length;
        c.fillStyle = idle ? '#58a040' : '#404058'; c.fillRect(go.x, go.y, go.w, go.h); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText(idle ? 'GO!' : '...', go.x + go.w / 2, go.y + 17);
        c.fillStyle = speed > 1 ? '#e08030' : '#404070'; c.fillRect(sp.x, sp.y, sp.w, sp.h); c.fillStyle = '#f8f8f0'; c.fillText(`x${speed}`, sp.x + sp.w / 2, sp.y + 17);
      }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018c0'; c.fillRect(0, oy + fieldH() / 2 - 9, W, 14); c.fillStyle = msg.txt.includes('BOSS') ? '#f86060' : '#f8f8f0'; c.fillText(msg.txt, W / 2, oy + fieldH() / 2 + 1); }
      if (wave === 0 && !towers.length && !sel) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText('TAP GRASS TO BUILD', W / 2 + 1, oy + 31); c.fillStyle = '#f8f8f0'; c.fillText('TAP GRASS TO BUILD', W / 2, oy + 30); }
    },
    down(x, y) {
      if (y >= panelY()) {
        for (const b of panelButtons()) if (x >= b.x && x <= b.x + b.w && y >= b.y - 3 && y <= b.y + b.h + 3) {
          if (b.act === 'build') { const tp = TOWERS[b.i]; if (coins < tp.cost) { haptic('warning'); sfx(150, .08, 'square', .03); return; } coins -= tp.cost; grid[sel.r][sel.c] = 3; const tt = { type: b.i, lv: 1, x: sel.c * T + 8, y: oy + sel.r * T + 8, cd: 0, c: sel.c, r: sel.r }; towers.push(tt); sel = null; haptic('medium'); sfx(500, .1, 'square', .04, 300); for (let i = 0; i < 6; i++) fx.push({ x: tt.x, y: tt.y + 4, vx: rnd(-30, 30), vy: rnd(-30, -5), l: .3, col: '#c8a068' }); }
          else if (b.act === 'up') { const tt = sel.tower, cost = upCost(tt); if (tt.lv >= 3 || coins < cost) { haptic('warning'); return; } coins -= cost; tt.lv++; haptic('success'); sfx(700 + tt.lv * 150, .15, 'square', .04, 300); fx.push({ x: tt.x, y: tt.y - 10, txt: `LV${tt.lv}`, l: .8, col: '#f8d838' }); }
          else if (b.act === 'sell') { const tt = sel.tower; coins += Math.round(worth(tt) * .7); towers = towers.filter(o => o !== tt); grid[tt.r][tt.c] = 0; sel = null; haptic('light'); sfx(400, .1, 'square', .04, -200); }
          else if (b.act === 'go') { if (!queue.length && !bugs.length) { coins += Math.max(0, Math.ceil(breakT)); planWave(); haptic('medium'); } }
          else if (b.act === 'speed') { speed = speed === 1 ? 2 : 1; haptic('tick'); }
          return;
        }
        return;
      }
      const tl = tileAt(x, y); if (!tl) { sel = null; return; }
      const tt = towers.find(o => o.c === tl.c && o.r === tl.r);
      if (tt) { sel = sel && sel.tower === tt ? null : { tower: tt, c: tl.c, r: tl.r }; haptic('tick'); return; }
      if (grid[tl.r][tl.c] === 0) { sel = sel && sel.build && sel.c === tl.c && sel.r === tl.r ? null : { build: true, c: tl.c, r: tl.r }; haptic('tick'); return; }
      sel = null;
    },
    key(k, d) { if (!d) return; if (k === ' ' && !queue.length && !bugs.length) planWave(); },
  };
  return self;
}

export default {
  id: 'tiny-tower', title: 'Tiny Tower Defense', tag: 'Advance · Strategy', retro: true, era: 'advance', pal: 'teal', w: 160, h: 176, maxW: 240, maxH: 320, step: 16, goal: 80,
  hint: 'Tap grass to build: Arrow is quick, Frost slows, Cannon splashes, Zap chains between bugs, Sniper hits hard from far. Tap a tower to upgrade or sell it. Tap GO to start the next wave early for bonus coins.',
  make,
};
