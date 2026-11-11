import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Ready } = gs.rounds;
const { ball, glow, backdrop } = gs.gfx;
const { brick, stud, brick3d, BRICK, BRICK_KEYS } = gs.bricks;
const { View, G, part, grp, blob, toon, THREE } = gs.toon;
const { Group } = THREE;
const coreA = toon('#f8e040', { glow: 1 }), coreB = toon('#f8a020', { glow: 1 }), coreOff = toon('#404048');

// A giant brick robot stomps along the ceiling, dropping bricks on you. Drag to dodge (watch the
// shadows). Fallen bricks pile up on the floor: stand on a pile to build it into a launcher. Tap
// to fire every launcher you've built straight up. Hit the robot while its core glows to damage
// it. Beat each robot to face a tougher one.
let W = 176, H = 192;

function make(api) {
  let px, tx, boss, drops, piles, launchers, shots, hp, inv, beaten, score, t, parts, msg, dead, tapStart, between;
  const ready = new Ready({ eat: false });                              // the robot waits for the first touch
  const fy = () => H - 14, bossY = () => 30;
  function newBoss() { const n = beaten; boss = { x: W / 2, dir: 1, sp: 30 + n * 8, hp: 3 + Math.min(3, n), max: 3 + Math.min(3, n), core: 0, coreT: 2.5, dropT: 1.2, hit: 0, slam: 0, col: BRICK_KEYS[n % BRICK_KEYS.length] }; drops = []; shots = []; between = 1.4; msg = { txt: `ROBOT ${beaten + 1}`, l: 1.4 }; }
  let v3;
  function robot(col) {
    const g = new Group(), rail = part(G.box, '#383840', { sx: 4, sy: 1, sz: 4, y: .5 }); const rg = new Group(); rg.add(rail); rg.position.y = 0; g.add(rg);
    const body = brick3d(col, 48, 14, 20, 8); body.position.y = -14; g.add(body);
    const jaw = brick3d('grey', 36, 8, 16, 6); jaw.position.y = -22; g.add(jaw);
    const core = part(G.ball, '#404048', { s: 5, y: -7, z: 10 }); g.add(core);
    for (const sx of [-1, 1]) g.add(part(G.box, '#ff5050', { sx: 5, sy: 3, sz: 1, x: sx * 14, y: -5.5, z: 10.2, glow: 1, line: false }));
    const legs = [-1, 1].map(sx => { const l = new Group(); l.position.set(sx * 19, -22, 0); l.add(part(G.box, '#585c64', { sx: 6, sy: 8, sz: 6, y: -4 })); g.add(l); return l; });
    // the rail it hangs from runs up to the ceiling: scale.y set per frame
    rail.parent.position.y = 0; g.userData = { core, legs, rail: rg }; rg.children[0].position.y = .5; return g;
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#22183a', sun: [-.4, .9, .9], sunI: 2.3, amb: .9, sky: '#c0a8ff', ground: '#302040' });
      v3.add(part(G.box, '#2c2044', { sx: 3000, sy: 3000, sz: 2, z: -60, line: false }));
      for (let i = -8; i <= 8; i++) v3.add(part(G.box, '#3a2a52', { sx: 10, sy: 400, sz: 6, x: i * 28, z: -55 }));
      v3.def('ceiling', () => { const g = new Group(); for (let i = -12; i <= 12; i++) { const b = brick3d('black', 16, 12, 30, 0); b.position.set(i * 16, 0, 0); g.add(b); } return g; });
      v3.def('floor', () => { const g = new Group(); for (let i = -12; i <= 12; i++) { const b = brick3d('grey', 16, 14, 34, 8); b.position.set(i * 16, -14, -4); g.add(b); } return g; });
      v3.def('warn', () => part(G.cone, '#f84040', { sx: 2.4, sy: 6, sz: 2.4, rx: Math.PI, glow: .8 }));
      v3.def('blob', () => blob(1, .45));
      for (const col of BRICK_KEYS.concat(['grey', 'tan', 'black'])) { v3.def('drop:' + col, () => brick3d(col, 12, 6, 10, 4)); v3.def('pb:' + col, () => brick3d(col, 10, 4, 10, 5)); }
      v3.def('launcher', () => grp(brick3d('orange', 14, 6, 12, 7), part(G.cyl, '#585c64', { sx: 2, sy: 10, sz: 2, y: 11 }), part(G.cyl, '#f0c020', { sx: 3, sy: 3, sz: 3, y: 17 })));
      v3.def('shot', () => grp(part(G.cyl, '#f8e040', { sx: 2, sy: 8, sz: 2, glow: .9 }), part(G.cone, '#fff8c0', { sx: 2, sy: 3, sz: 2, y: 5.5, glow: 1, line: false })));
      v3.def('hero', () => {
        const g = new Group(), legs = [-1, 1].map(sx => { const l = new Group(); l.position.set(sx * 1.6, 5, 0); l.add(part(G.box, '#2c64c8', { sx: 2.6, sy: 5, sz: 3, y: -2.5 })); return l; });
        g.add(...legs, part(G.box, '#f0c020', { sx: 8, sy: 6, sz: 5, y: 8 }), part(G.cyl, '#f0c020', { sx: 3, sy: 6, sz: 3, y: 14 }), part(G.cyl, '#f07818', { sx: 3.4, sy: 2.4, sz: 3.4, y: 17.6 }));
        for (const sx of [-1, 1]) g.add(part(G.box, '#202020', { sx: .7, sy: 1.4, sz: .5, x: sx * 1.1, y: 14.5, z: 2.9, line: false }));
        g.userData.legs = legs; return g;
      });
    }
    v3.side(W, H, 36, 0, H * .3); return v3;
  }
  function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-70, 70), vy: rnd(-90, 20), l: .5, col }); }
  function hurt() { if (inv > 0) return; hp--; inv = 1.3; haptic('heavy'); sfx(130, .3, 'sawtooth', .05, -60); if (hp <= 0) { dead = .01; msg = { txt: 'FLATTENED!', l: 9 }; sfx(90, .8, 'square', .05, -40); } }
  const self = {
    reset() { px = tx = W / 2; piles = []; launchers = []; hp = 3; inv = 0; beaten = 0; score = 0; t = 0; parts = []; dead = 0; newBoss(); ready.reset(); },
    resize(w, h) { const s = w / W; W = w; H = h; if (boss) { px *= s; tx *= s; boss.x *= s; for (const a of [piles, launchers]) for (const o of a) o.x *= s; } },
    update(dt) {
      if (!ready.update(dt)) return;
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.5) api.over(); return; }
      inv = Math.max(0, inv - dt);
      px += clamp(tx - px, -110 * dt, 110 * dt); px = clamp(px, 8, W - 8);
      if (between > 0) { between -= dt; return; }
      // boss
      const b = boss; b.hit = Math.max(0, b.hit - dt);
      b.x += b.dir * b.sp * dt; if (b.x < 26 || b.x > W - 26) b.dir *= -1; b.x = clamp(b.x, 26, W - 26);
      b.coreT -= dt; if (b.coreT <= 0) { b.core = b.core ? 0 : 1; b.coreT = b.core ? 2.2 - Math.min(1, beaten * .15) : rnd(2, 3.4); }
      b.dropT -= dt; if (b.dropT <= 0) { b.dropT = Math.max(.45, 1.3 - beaten * .12 - (b.max - b.hp) * .08); const n = Math.random() < .25 ? 3 : 1; for (let i = 0; i < n; i++) drops.push({ x: clamp(n > 1 ? px + (i - 1) * 22 : (Math.random() < .6 ? px : rnd(10, W - 10)), 8, W - 8), y: bossY() + 10, vy: 0, warn: .5, col: BRICK_KEYS[Math.random() * 6 | 0] }); sfx(300, .05, 'square', .03, -100); }
      for (const d of drops) {
        if (d.warn > 0) { d.warn -= dt; continue; }
        d.vy += 380 * dt; d.y += d.vy * dt;
        if (d.y >= fy() - 4) { d.done = true; burst(d.x, fy() - 4, '#c8ccd4', 6); sfx(160, .06, 'square', .04, -40); const p = piles.find(p => Math.abs(p.x - d.x) < 12); if (p) p.n = Math.min(4, p.n + 1); else piles.push({ x: d.x, n: 1, prog: 0, col: d.col }); }
        else if (Math.abs(d.x - px) < 9 && d.y > fy() - 20) { d.done = true; hurt(); burst(d.x, d.y, '#f86060'); }
      }
      drops = drops.filter(d => !d.done);
      // standing on a pile builds a launcher
      for (const p of piles) { if (Math.abs(p.x - px) < 10 && Math.abs(tx - px) < 2) { p.prog += dt / (.9 + p.n * .1); if ((t * 20 | 0) % 3 === 0) haptic('tick'); if (p.prog >= 1) { p.built = true; launchers.push({ x: p.x, power: p.n }); haptic('success'); sfx(700, .2, 'square', .05, 400); parts.push({ txt: 'LAUNCHER!', x: p.x, y: fy() - 24, l: .9, col: '#f0c020' }); } } }
      piles = piles.filter(p => !p.built);
      if (launchers.length > 4) launchers.shift();
      for (const s of shots) { s.y -= 260 * dt; if (!s.done && s.y < bossY() + 14 && Math.abs(s.x - b.x) < 26) { s.done = true; if (b.core) { b.hp -= 1; b.hit = .3; score += 10; api.score(score); burst(s.x, bossY() + 10, '#f8e040', 14); haptic('success'); sfx(200, .25, 'square', .06, -100); parts.push({ txt: 'CORE HIT!', x: b.x, y: bossY() + 30, l: .9, col: '#f8e040' }); b.core = 0; b.coreT = 1.5; } else { burst(s.x, bossY() + 14, '#c8ccd4', 6); sfx(800, .05, 'square', .03); parts.push({ txt: 'CLANG', x: s.x, y: bossY() + 30, l: .6, col: '#c8ccd4' }); } } }
      shots = shots.filter(s => !s.done && s.y > -10);
      if (b.hp <= 0) { beaten++; score += 25; api.score(score); haptic('success'); sfx(880, .6, 'square', .05, 600); burst(b.x, bossY(), '#f0c020', 30); hp = Math.min(3, hp + 1); newBoss(); }
    },
    draw(c) {
      const v = view3d(); v.frame();
      v.put('ceiling', v.sv(W / 2, 12, 0)); v.put('floor', v.sv(W / 2, fy(), 0));
      const b = boss, by = bossY(), k = 'boss:' + b.col;
      if (!v.kinds.has(k)) v.def(k, () => robot(b.col));
      const r = v.put(k, v.sv(b.x, by, 0)), u = r.userData; r.visible = !(b.hit > 0 && (t * 20 | 0) % 2);
      u.core.material = b.core ? ((t * 10 | 0) % 2 ? coreA : coreB) : coreOff; u.core.scale.setScalar(b.core ? 5 + Math.sin(t * 12) * .6 : 5);
      u.legs.forEach((l, i) => l.rotation.z = Math.sin(t * 6 + i * Math.PI) * .3); u.rail.scale.y = by - 12;
      for (const d of drops) { if (d.warn > 0) { if ((t * 12 | 0) % 2) v.put('warn', v.sv(d.x, fy() - 7, 0)); } else v.put('drop:' + d.col, v.sv(d.x, d.y + 2, 0), { rz: d.y * .02 }); v.put('blob', v.sv(d.x, fy(), 0), { s: 7 }); }
      for (const p of piles) { for (let i = 0; i < p.n; i++) v.put('pb:' + p.col, v.sv(p.x - 1.5 + (i % 2) * 3, fy() - i * 4, 0), { ry: i * .4 }); }
      for (const l of launchers) v.put('launcher', v.sv(l.x, fy(), 0));
      for (const sh of shots) v.put('shot', v.sv(sh.x, sh.y, 0));
      if (!(inv > 0 && (t * 14 | 0) % 2)) { const h = v.put('hero', v.sv(px, fy(), 0), { ry: clamp((tx - px) * .05, -1.2, 1.2) }); h.userData.legs.forEach((l, i) => l.rotation.x = Math.abs(tx - px) > 2 ? Math.sin(t * 16 + i * Math.PI) * .6 : 0); }
      v.render(c, W, H);
      for (let i = 0; i < b.max; i++) { c.fillStyle = i < b.hp ? '#f84040' : '#403848'; c.fillRect(W / 2 - b.max * 5 + i * 10, 3, 8, 5); }
      for (const p of piles) if (p.prog > 0) { c.fillStyle = '#00000080'; c.fillRect(p.x - 10, fy() - 26, 20, 3); c.fillStyle = '#f0c020'; c.fillRect(p.x - 10, fy() - 26, 20 * p.prog, 3); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < hp ? '#f84858' : '#403848'; c.fillRect(4 + i * 7, 3, 5, 5); }
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(String(score), W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H * .45 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f0c020'; c.fillText(msg.txt, W / 2, H * .45); }
      if (t < 8 && !msg) { c.textAlign = 'center'; c.fillStyle = '#f8f8f0'; c.fillText('DRAG · STAND ON PILES', W / 2, H * .45); c.fillText('TAP TO FIRE AT THE CORE', W / 2, H * .45 + 10); }
      ready.draw(c, W, H, { text: 'TAP TO START', pixel: true, color: '#f8f8f0', shadow: '#101018', y: Math.round(H * .7) });
    },
    down(x, y) { ready.go(); tapStart = { x, y, t: performance.now() }; },
    move(x, y, p) { if (p) tx = x; },
    up() { if (tapStart && performance.now() - tapStart.t < 200) self.fire(); tapStart = null; },
    fire() { if (dead || !launchers.length) { sfx(200, .03, 'square', .02); return; } for (const l of launchers) shots.push({ x: l.x, y: fy() - 18 }); launchers = []; haptic('medium'); sfx(500, .15, 'square', .05, 600); },
    key(k, d) { if (!d) return; ready.go(); if (k === 'ArrowLeft') tx = px - 24; if (k === 'ArrowRight') tx = px + 24; if (k === ' ') self.fire(); },
  };
  return self;
}

export default {
  id: 'boss-brickfall', title: 'Boss Brickfall', tag: 'Bricks · Boss', retro: true, era: 'console', pal: 'grape', w: 176, h: 192, maxW: 260, maxH: 320, goal: 120,
  hint: 'Drag to move and dodge the falling bricks (red marks show where). Fallen bricks make piles: stand on one to build a launcher. Tap to fire all your launchers straight up. Only hits while the robot\'s core glows yellow do damage.',
  make,
};
