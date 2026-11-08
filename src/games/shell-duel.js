import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { box } = gs.gfx;
const { View, G: GEO, part, grp, toon, THREE } = gs.toon;
const { Group, Mesh, BufferGeometry, BufferAttribute } = THREE;

// Turn-based artillery between two squads of battle spuds on hills you can blow apart. On your
// turn, hold the arrows to shuffle along, tap the weapon to switch, then drag back from your spud
// like a slingshot and let go to fire. Rockets drift with the wind, grenades bounce and pop after
// three seconds, and clusters burst into bomblets. Knock enemy spuds into the sea or wipe their
// health out to win the round.
const WEAPONS = [
  { n: 'ROCKET', r: 16, dmg: 45, wind: 1, fuse: 0 },
  { n: 'GRENADE', r: 14, dmg: 40, wind: 0, fuse: 3, bounce: true },
  { n: 'CLUSTER', r: 10, dmg: 22, wind: .5, fuse: 0, split: 4 },
];
const G = 160, POWER = 190;
let W = 240, H = 160;

function make(api) {
  let hgt, units, turn, phase, wind, weapon, shot, aim, timer, score, round, t, parts, msg, dead, aiPlan, walk, settleT, cam;
  const sea = () => H - 8;
  function genTerrain() {
    hgt = new Float32Array(W); const a = rnd(0, 6), b = rnd(0, 6), base = H * .62;
    for (let x = 0; x < W; x++) hgt[x] = base - Math.sin(x / W * Math.PI * 2 + a) * H * .14 - Math.sin(x / W * Math.PI * 5 + b) * H * .07 - Math.sin(x / W * Math.PI) * H * .1;
  }
  // 3D: the hills are a strip mesh rebuilt from the height map every frame (it changes with every blast)
  let v3, hill;
  const STEP = 2, DEP = 26;
  function land(v) {
    const n = Math.ceil(W / STEP) + 1, need = n * 18 * 3;
    if (!hill || hill.front.geometry.attributes.position.array.length < need) {
      if (hill) { v.scene.remove(hill.front, hill.top); }
      const mk = col => { const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(need), 3)); const m = new Mesh(g, toon(col)); m.frustumCulled = false; v.scene.add(m); return m; };
      hill = { front: mk('#8a6844'), top: mk('#58b048') };
    }
    const F = hill.front.geometry.attributes.position.array, T = hill.top.geometry.attributes.position.array; let f = 0, q = 0;
    const tri = (A, a, b, cc) => { A.set(a, A === F ? f : q); A.set(b, (A === F ? f : q) + 3); A.set(cc, (A === F ? f : q) + 6); if (A === F) f += 9; else q += 9; };
    for (let i = 0; i < n - 1; i++) {
      const x0 = i * STEP, x1 = Math.min(W - 1, x0 + STEP), y0 = ground(x0), y1 = ground(x1); if (y0 >= sea() + 6 && y1 >= sea() + 6) continue;
      const a0 = v.sv(x0, y0, DEP / 2), a1 = v.sv(x1, y1, DEP / 2), b0 = v.sv(x0, H + 20, DEP / 2), b1 = v.sv(x1, H + 20, DEP / 2), c0 = v.sv(x0, y0, -DEP / 2), c1 = v.sv(x1, y1, -DEP / 2);
      tri(F, a0, b0, b1); tri(F, a0, b1, a1); tri(T, c0, a0, a1); tri(T, c0, a1, c1);
    }
    for (const [m, k] of [[hill.front, f], [hill.top, q]]) { m.geometry.setDrawRange(0, k / 3); m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); }
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#f8c890', sun: [-.3, .9, .9], sunI: 2.2, amb: 1.1, sky: '#ffe0b0', ground: '#604020' });
      v3.add(part(GEO.ball, '#f89860', { s: 30, x: 60, y: 30, z: -400, glow: 1, line: false }));
      for (let i = 0; i < 7; i++) v3.add(part(GEO.ball, '#c09070', { sx: 70, sy: 30 + (i % 3) * 12, sz: 20, x: -220 + i * 75, y: -40, z: -300, line: false }));
      v3.def('sea', () => part(GEO.box, '#3878c8', { sy: 60, sz: 120, z: -20, opacity: .92 }));
      v3.def('wave', () => part(GEO.box, '#90c8f8', { sx: 5, sy: .6, sz: 2, line: false }));
      const spud = col => () => {
        const g = grp(part(GEO.ball, '#d8a868', { sx: 5, sy: 6.2, sz: 5, y: 6 }), part(GEO.ball, col, { sx: 5.4, sy: 2.6, sz: 5.4, y: 10.5 }), part(GEO.box, col, { sx: 7, sy: 1, sz: 7, y: 10, line: false }));
        for (const sx of [-1, 1]) g.add(part(GEO.ball, '#202020', { s: .7, x: sx * 1.6, y: 7.5, z: 4.6, line: false }));
        g.add(part(GEO.ball, '#a07838', { s: .5, x: 2, y: 4, z: 4.6, line: false }));
        const arrow = part(GEO.cone, '#f8f8f0', { sx: 2.4, sy: 4, sz: 2.4, y: 20, rx: Math.PI }); g.add(arrow); g.userData.arrow = arrow; return g;
      };
      v3.def('spudB', spud('#4880e0')).def('spudR', spud('#e05848'));
      v3.def('shell', () => grp(part(GEO.pill, '#505060', { sx: 2.4, sy: 6, sz: 2.4, rz: -Math.PI / 2 }), part(GEO.cone, '#e04040', { sx: 1.3, sy: 2, sz: 1.3, x: 4, rz: -Math.PI / 2 })));
      v3.def('nade', () => grp(part(GEO.ball, '#487838', { s: 2.6 }), part(GEO.cyl, '#303030', { sx: .8, sy: 1.4, sz: .8, y: 2.6 })));
    }
    v3.side(W, H, 34, 0, H * .3); return v3;
  }
  const ground = x => hgt[clamp(Math.round(x), 0, W - 1)];
  function newRound() {
    genTerrain(); units = [];
    const xs = [W * .12, W * .3, W * .7, W * .88];
    xs.forEach((x, i) => { const tm = i < 2 ? 0 : 1; units.push({ team: tm, x: x + rnd(-8, 8), y: 0, vy: 0, hp: 100, dead: false, face: tm ? -1 : 1, name: tm ? ['RUSTY', 'MOSS'][i - 2] : ['SPUD', 'TATER'][i] }); });
    for (const u of units) u.y = ground(u.x);
    turn = { team: 0, idx: [0, 0] }; wind = rnd(-1, 1); phase = 'aim'; timer = 25; weapon = 0; msg = { txt: `ROUND ${round}`, l: 1.2 }; cam = 0;
  }
  const active = () => { const team = units.filter(u => u.team === turn.team && !u.dead); return team[turn.idx[turn.team] % team.length]; };
  function blast(x, y, w) {
    const r = w.r; for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(W - 1, Math.ceil(x + r)); i++) { const dy = Math.sqrt(Math.max(0, r * r - (i - x) * (i - x))); if (hgt[i] < y + dy) hgt[i] = Math.max(hgt[i], y + dy); }
    for (let i = 0; i < 18; i++) parts.push({ x, y, vx: rnd(-80, 80), vy: rnd(-110, 10), l: .6, col: i % 2 ? '#f8a020' : '#806040' });
    for (const u of units) { if (u.dead) continue; const d = Math.hypot(u.x - x, u.y - 5 - y); if (d < r * 1.8) { const k = 1 - d / (r * 1.8), dmg = Math.round(w.dmg * k); u.hp -= dmg; u.vy = -90 * k; u.vx = Math.sign(u.x - x || 1) * 70 * k; parts.push({ txt: `-${dmg}`, x: u.x, y: u.y - 16, l: 1, col: u.team ? '#f86060' : '#80c0ff' }); if (u.team === 1) { score += dmg; api.score(Math.floor(score / 10) + (round - 1) * 20); } } }
    haptic('heavy'); sfx(70, .4, 'sawtooth', .07, -30);
  }
  function fire(ang, pow) {
    const u = active(), w = WEAPONS[weapon];
    shot = [{ x: u.x + Math.cos(ang) * 8, y: u.y - 6 + Math.sin(ang) * 8, vx: Math.cos(ang) * pow * POWER, vy: Math.sin(ang) * pow * POWER, w, fuse: w.fuse, t: 0 }];
    phase = 'fly'; u.face = Math.cos(ang) < 0 ? -1 : 1; sfx(300, .15, 'square', .05, 300); haptic('medium');
  }
  function stepShot(s, dt) {
    s.t += dt; s.vx += wind * 40 * s.w.wind * dt; s.vy += G * dt;
    const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
    if (nx < -40 || nx > W + 40 || ny > H + 10) return 'gone';
    if (ny >= ground(nx) && nx >= 0 && nx < W) {
      if (s.w.bounce) { s.vy = -Math.abs(s.vy) * .45; s.vx *= .7; s.y = ground(nx) - 1; s.x = nx; sfx(500, .03, 'square', .02); }
      else return 'hit';
    } else { s.x = nx; s.y = ny; }
    if (!s.w.bounce) for (const u of units) if (!u.dead && Math.hypot(u.x - s.x, u.y - 5 - s.y) < 6 && s.t > .15) return 'hit';
    if (s.w.fuse && s.t >= s.w.fuse) return 'hit';
    return null;
  }
  function endTurn() {
    phase = 'settle'; settleT = .6;
  }
  function nextTurn() {
    const alive = tm => units.some(u => u.team === tm && !u.dead);
    if (!alive(0)) { dead = .01; msg = { txt: 'YOUR SQUAD IS SPUD MASH', l: 9 }; haptic('error'); sfx(110, .8, 'square', .05, -40); return; }
    if (!alive(1)) { round++; score += 200; api.score(Math.floor(score / 10) + (round - 1) * 20); haptic('success'); sfx(880, .5, 'square', .05, 500); newRound(); return; }
    turn.idx[turn.team]++; turn.team = 1 - turn.team; wind = clamp(wind + rnd(-.5, .5), -1, 1); timer = 25; weapon = turn.team === 0 ? weapon : 0; aim = null;
    phase = turn.team === 0 ? 'aim' : 'ai'; aiPlan = null; msg = { txt: turn.team === 0 ? `${active().name}'S TURN` : 'ENEMY TURN', l: .9 };
  }
  function planAI() {
    const u = active(), foe = 1 - u.team, targets = units.filter(v => v.team === foe && !v.dead); let best = null;
    const err = Math.max(.05, .24 - round * .03);
    for (let i = 0; i < 260; i++) {
      const wi = Math.random() < .7 ? 0 : Math.random() < .5 ? 1 : 2, w = WEAPONS[wi], ang = -Math.PI / 2 + rnd(-1.4, 1.4), pow = rnd(.35, 1);
      let s = { x: u.x + Math.cos(ang) * 8, y: u.y - 6 + Math.sin(ang) * 8, vx: Math.cos(ang) * pow * POWER, vy: Math.sin(ang) * pow * POWER, w, t: 0 }, res = null;
      for (let k = 0; k < 400 && !res; k++) { s.t += 1 / 30; s.vx += wind * 40 * w.wind / 30; s.vy += G / 30; s.x += s.vx / 30; s.y += s.vy / 30; if (s.x < -40 || s.x > W + 40 || s.y > H) res = 'gone'; else if (s.x >= 0 && s.x < W && s.y >= ground(s.x)) res = 'hit'; else if (w.fuse && s.t >= w.fuse) res = 'hit'; }
      if (res !== 'hit') continue;
      let val = 0; for (const v of units) { if (v.dead) continue; const d = Math.hypot(v.x - s.x, v.y - 5 - s.y); if (d < w.r * 1.8) val += (1 - d / (w.r * 1.8)) * w.dmg * (v.team === foe ? 1 : -1.3); }
      if (!best || val > best.val) best = { val, ang, pow, wi };
    }
    if (!best) best = { ang: -Math.PI / 2 + (targets[0] && targets[0].x < u.x ? -.6 : .6), pow: .7, wi: 0 };
    best.ang += rnd(-err, err); best.pow = clamp(best.pow + rnd(-err, err) * .6, .2, 1); return best;
  }
  function settle(dt) {
    let moving = false;
    for (const u of units) {
      if (u.dead) continue; const gy = ground(u.x);
      if (u.vx) { u.x = clamp(u.x + u.vx * dt, 2, W - 2); u.vx *= .9; if (Math.abs(u.vx) < 2) u.vx = 0; else moving = true; }
      if (u.y < gy || u.vy < 0) { u.vy += G * 1.6 * dt; u.y += u.vy * dt; moving = true; if (u.y >= ground(u.x) && u.vy > 0) { if (u.vy > 140) { const d = Math.round((u.vy - 140) / 6); u.hp -= d; parts.push({ txt: `-${d}`, x: u.x, y: u.y - 16, l: 1, col: '#f8f8f0' }); } u.y = ground(u.x); u.vy = 0; } }
      else u.y = gy;
      if (u.y > sea() || u.hp <= 0) { u.dead = true; u.hp = 0; for (let i = 0; i < 10; i++) parts.push({ x: u.x, y: Math.min(u.y, sea()), vx: rnd(-40, 40), vy: rnd(-80, -20), l: .6, col: u.team ? '#e05848' : '#4880e0' }); sfx(200, .3, 'square', .05, -100); }
    }
    return moving;
  }
  const self = {
    reset() { score = 0; round = 1; t = 0; parts = []; dead = 0; aim = null; walk = 0; newRound(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (units) newRound(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.8) api.over(); return; }
      if (phase === 'aim' || phase === 'ai') {
        timer -= dt; if (timer <= 0) { endTurn(); return; }
        const u = active();
        if (phase === 'aim' && walk) { const nx = clamp(u.x + walk * 22 * dt, 3, W - 3); if (ground(nx) > u.y - 5) { u.x = nx; u.face = walk; u.y = ground(u.x); } }
        settle(dt);
        if (phase === 'ai') { if (!aiPlan) { aiPlan = planAI(); aiPlan.wait = 1.2; } aiPlan.wait -= dt; aim = { ang: aiPlan.ang, pow: aiPlan.pow * Math.min(1, (1.2 - aiPlan.wait) / .8) }; weapon = aiPlan.wi; if (aiPlan.wait <= 0) { fire(aiPlan.ang, aiPlan.pow); aim = null; } }
      } else if (phase === 'fly') {
        const next = [];
        for (const s of shot) { const r = stepShot(s, dt); if (r === 'hit') { blast(s.x, s.y, s.w); if (s.w.split) for (let i = 0; i < s.w.split; i++) next.push({ x: s.x, y: s.y - 3, vx: rnd(-60, 60), vy: rnd(-110, -60), w: { n: 'BIT', r: 8, dmg: 16, wind: 0, fuse: 0 }, t: 0, fuse: 0 }); } else if (r !== 'gone') next.push(s); }
        shot = next; cam = shot.length ? shot[0].x : cam;
        settle(dt);
        if (!shot.length) endTurn();
      } else if (phase === 'settle') { settleT -= dt; const m = settle(dt); if (!m && settleT <= 0) nextTurn(); }
    },
    draw(c) {
      const v = view3d(); v.frame(); land(v);
      v.put('sea', v.sv(W / 2, sea() + 30, 0), { sx: W + 200 });
      for (let i = 0; i < 12; i++) v.put('wave', v.sv(((i * 29 + t * 10) % (W + 40)) - 20, sea() - .5, 10 - (i % 3) * 8));
      const cur = (phase === 'aim' || phase === 'ai') ? active() : null;
      for (const u of units) {
        if (u.dead) continue;
        const o = v.put(u.team ? 'spudR' : 'spudB', v.sv(u.x, u.y, 0), { ry: u.face > 0 ? .5 : -.5 }); o.userData.arrow.visible = u === cur && (t * 3 | 0) % 2 === 0;
        o.userData.arrow.rotation.y = t * 3;
      }
      if (shot) for (const sh of shot) v.put(sh.w.bounce ? 'nade' : 'shell', v.sv(sh.x, sh.y, 0), { s: sh.w.n === 'BIT' ? .6 : 1, rz: Math.atan2(-sh.vy, sh.vx) });
      v.render(c, W, H);
      for (const u of units) { if (u.dead) continue; c.fillStyle = '#000a'; c.fillRect(u.x - 8, u.y - 22, 16, 4); c.fillStyle = u.team ? '#f86060' : '#80c0ff'; c.fillRect(u.x - 7, u.y - 21, 14 * Math.max(0, u.hp) / 100, 2); }
      // aim line
      if (aim && cur) { const steps = 14; c.fillStyle = '#ffffffb0'; let x = cur.x, y = cur.y - 6, vx = Math.cos(aim.ang) * aim.pow * POWER, vy = Math.sin(aim.ang) * aim.pow * POWER; for (let i = 0; i < steps; i++) { for (let k = 0; k < 4; k++) { vx += wind * 40 * WEAPONS[weapon].wind / 60; vy += G / 60; x += vx / 60; y += vy / 60; } c.fillRect(x - 1, y - 1, 2, 2); } }
      if (shot) for (const s of shot) { if (!s.w.bounce) { c.fillStyle = '#f8a02080'; c.fillRect(s.x - s.vx * .02 - 1, s.y - s.vy * .02 - 1, 2, 2); } else if (s.w.fuse) { c.fillStyle = '#f8f8f0'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(String(Math.ceil(s.w.fuse - s.t)), s.x, s.y - 5); } }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // HUD: wind, timer, weapon, walk buttons
      c.fillStyle = '#00000070'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(`${Math.ceil(timer)}`, 4, 9);
      c.fillText('WIND', 22, 9); c.fillStyle = '#ffffff30'; c.fillRect(50, 4, 40, 4); c.fillStyle = '#80e0ff'; const wv = wind * 20; c.fillRect(70 + Math.min(0, wv), 4, Math.abs(wv), 4);
      c.textAlign = 'right'; c.fillStyle = '#f8e040'; c.fillText(`R${round}`, W - 4, 9);
      if (phase === 'aim') {
        const bh = 18, by = H - bh - 2; c.globalAlpha = .85;
        box(c, 2, by, 22, bh, '#384860', { r: 4 }); box(c, 26, by, 22, bh, '#384860', { r: 4 }); box(c, W - 58, by, 56, bh, '#384860', { r: 4 }); c.globalAlpha = 1;
        c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText('◀', 13, by + 12); c.fillText('▶', 37, by + 12); c.fillText(WEAPONS[weapon].n, W - 30, by + 12);
      }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .3 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H * .3); }
      if (t < 8 && phase === 'aim' && !msg) { c.textAlign = 'center'; c.fillStyle = '#202020'; c.fillText('DRAG BACK FROM YOUR SPUD', W / 2, H * .22); }
    },
    down(x, y) {
      if (dead || phase !== 'aim') return; const bh = 18, by = H - bh - 2;
      if (y > by) { if (x < 24) { walk = -1; return; } if (x < 48) { walk = 1; return; } if (x > W - 58) { weapon = (weapon + 1) % WEAPONS.length; haptic('tick'); sfx(700, .04, 'square', .03); return; } }
      aim = { sx: x, sy: y, ang: 0, pow: 0, drag: true };
    },
    move(x, y, p) { if (!p || !aim || !aim.drag || phase !== 'aim') return; const dx = aim.sx - x, dy = aim.sy - y, d = Math.hypot(dx, dy); aim.ang = Math.atan2(dy, dx); aim.pow = clamp(d / 70, 0, 1); },
    up() { walk = 0; if (aim && aim.drag && phase === 'aim') { if (aim.pow > .12) fire(aim.ang, aim.pow); aim = null; } },
    key(k, d) { if (phase !== 'aim') return; if (k === 'ArrowLeft') walk = d ? -1 : 0; if (k === 'ArrowRight') walk = d ? 1 : 0; if (d && k === 'Tab') weapon = (weapon + 1) % 3; if (d && k === ' ') { const u = active(); fire(u.face > 0 ? -.8 : -Math.PI + .8, .75); } },
  };
  return self;
}

export default {
  id: 'shell-duel', title: 'Shell Duel', tag: 'Console · Artillery', retro: true, era: 'console', pal: 'berry', w: 240, h: 160, maxW: 360, maxH: 240, goal: 30,
  hint: 'Your squad of battle spuds takes turns with the enemy. Hold the arrows to shuffle along, tap the weapon name to switch, then drag back like a slingshot and let go to fire. Rockets drift with the wind, grenades bounce for three seconds, clusters split. Blasts dig into the hills. Knock every enemy spud out to win the round.',
  make,
};
