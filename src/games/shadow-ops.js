import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { View, G, part, grp, blob, flat, THREE } = gs.toon;
const { Group } = THREE;

// Top-down stealth. Hold to creep toward your finger and reach the exit hatch. Guards patrol with
// torch cones that walls block; stay in a cone too long and you're caught. Tap anywhere away from
// you to throw a pebble: guards nearby go to look. Tap yourself to duck under a crate and stay
// still while they pass. Grab the files on the way for bonus points.
let W = 176, H = 192;

function make(api) {
  let walls, guards, pl, exit, intel, room, score, lives, t, hold, tapStart, crate, noise, parts, msg, dead, caught, alertAll;
  const top = 14;
  const inWall = (x, y, pad = 0) => x < 2 + pad || x > W - 2 - pad || y < top + 2 + pad || y > H - 2 - pad || walls.some(w => x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad);
  function sees(g, x, y) {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy); if (d > g.range) return false;
    let da = Math.abs(((Math.atan2(dy, dx) - g.a) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da > g.fov) return false;
    for (let s = 4; s < d; s += 3) if (inWall(g.x + dx / d * s, g.y + dy / d * s)) return false;
    return true;
  }
  function openSpot(pad) { for (let i = 0; i < 80; i++) { const x = rnd(10, W - 10), y = rnd(top + 10, H - 10); if (!inWall(x, y, pad)) return { x, y }; } return { x: W / 2, y: H / 2 }; }
  function build() {
    walls = []; guards = []; parts = []; noise = null; crate = false; caught = 0; alertAll = 0;
    const n = 4 + Math.min(5, room);
    for (let i = 0; i < n; i++) { const hz = Math.random() < .5, w = hz ? rnd(30, W * .45) : 8, h = hz ? 8 : rnd(26, H * .35); walls.push({ x: rnd(10, W - w - 10), y: rnd(top + 26, H - h - 26), w, h }); }
    pl = { x: 14, y: H - 14, a: -Math.PI / 2 }; exit = { x: W - 14, y: top + 12 };
    walls = walls.filter(w => !(pl.x > w.x - 14 && pl.x < w.x + w.w + 14 && pl.y > w.y - 14 && pl.y < w.y + w.h + 14) && !(exit.x > w.x - 14 && exit.x < w.x + w.w + 14 && exit.y > w.y - 14 && exit.y < w.y + w.h + 14));
    intel = { ...openSpot(6), got: false };
    const ng = 1 + Math.min(4, Math.floor((room + 1) / 2));
    for (let i = 0; i < ng; i++) {
      let a, b, tries = 0;
      do { a = openSpot(6); const hz = Math.random() < .5, len = rnd(40, 90); b = { x: clamp(a.x + (hz ? len : 0) * (Math.random() < .5 ? -1 : 1), 10, W - 10), y: clamp(a.y + (hz ? 0 : len) * (Math.random() < .5 ? -1 : 1), top + 10, H - 10) }; tries++; }
      while (tries < 60 && (Math.hypot(a.x - pl.x, a.y - pl.y) < 60 || !clearLine(a, b)));
      guards.push({ x: a.x, y: a.y, pts: [a, b], i: 1, a: 0, range: 52 + room * 2, fov: .55, wait: 0, sp: 20 + room * 1.5, sus: 0, look: null, turn: 0 });
    }
    msg = { txt: `ROOM ${room}`, l: 1.2 };
  }
  function clearLine(a, b) { const d = Math.hypot(b.x - a.x, b.y - a.y); for (let s = 0; s < d; s += 3) if (inWall(a.x + (b.x - a.x) * s / d, a.y + (b.y - a.y) * s / d, 5)) return false; return true; }
  let v3;
  function legs(g, col, w = 1.6) { const ls = [-1, 1].map(sx => { const l = new Group(); l.position.set(sx * 1.5, 3.4, 0); l.add(part(G.pill, col, { sx: w, sy: 2.4, sz: w, y: -1.9 })); return l; }); g.add(...ls); g.userData.legs = ls; }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#262e38', sun: [-.6, 1, .4], sunI: 2.2, amb: .8, sky: '#a8b8e0', ground: '#303040' });
      v3.add(part(G.plane, '#2e3844', { sx: 3000, sz: 3000, y: -.3, line: false }));
      v3.def('tile', () => part(G.plane, '#36414f', { line: false }));
      v3.def('blob', () => blob(1, .35));
      v3.def('wall', () => { const g = grp(part(G.box, '#6c7c94', { y: 7, sy: 14 })); g.add(part(G.box, '#8a9ab4', { y: 14.2, sy: .6, sx: .9, sz: .9, line: false })); return g; });
      v3.def('rim', () => part(G.box, '#4a5868', { sy: 5, y: 2.5 }));
      v3.def('hatch', () => { const lamp = part(G.ball, '#60ff90', { s: 1.6, y: 4.2, glow: .9 }); const g = grp(part(G.box, '#2fa85a', { sx: 14, sy: 2, sz: 14, y: 1 }), part(G.box, '#183020', { sx: 9, sy: .6, sz: 9, y: 2.1, line: false }), part(G.cyl, '#7dffa8', { sx: .6, sy: 2, sz: .6, y: 2.6 }), lamp); g.userData.lamp = lamp; return g; });
      v3.def('files', () => grp(part(G.box, '#f0d060', { sx: 7, sy: 1.6, sz: 8, y: 1.2, glow: .25 }), part(G.box, '#ffffff', { sx: 6, sy: .4, sz: 7, y: 2.1, line: false }), blob(4, .3)));
      v3.def('ripple', () => part(G.hoop, flat('#ffffff', .7, { side: 1 }), { line: false }));
      v3.def('guard', () => {
        const g = new Group(); legs(g, '#3a2828');
        g.add(part(G.pill, '#b03838', { sx: 5.6, sy: 4.4, sz: 4.4, y: 6.6 }), part(G.ball, '#e8c090', { s: 2.9, y: 11 }));
        const cap = part(G.cyl, '#401818', { sx: 3.1, sy: 1.4, sz: 3.1, y: 12.6 }); cap.add(part(G.box, '#401818', { sx: 1.2, sy: .3, sz: .8, z: .9, y: -.3 })); g.add(cap);
        g.add(part(G.cyl, '#303030', { sx: .7, sy: 4, sz: .7, x: 2.6, y: 7.5, z: 2.2, rx: Math.PI / 2 }), part(G.ball, '#fff8c0', { s: .9, x: 2.6, y: 7.5, z: 4.3, glow: 1 }));
        return g;
      });
      v3.def('spy', () => {
        const g = new Group(); legs(g, '#1a2238', 1.5);
        g.add(part(G.pill, '#4f80f0', { sx: 5, sy: 4, sz: 4, y: 6.2 }), part(G.ball, '#3a5aa0', { s: 2.8, y: 10.2 }), part(G.box, '#1a1a22', { sx: 4.2, sy: 1.2, sz: 1.2, y: 10.6, z: 2.3 }));
        g.add(part(G.box, '#283868', { sx: 3, sy: 3.4, sz: 1.6, y: 7, z: -2.4 })); return g;
      });
      v3.def('crate', () => grp(part(G.box, '#b08850', { s: 12, y: 6 }), part(G.box, '#806030', { sx: 12.4, sy: 1.6, sz: 12.4, y: 6, line: false }), part(G.box, '#806030', { sx: 1.6, sy: 12.4, sz: 12.4, y: 6, line: false }), blob(8, .35)));
    }
    v3.board(W, H, 1.0, 34); return v3;
  }
  function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), l: .4, col }); }
  const self = {
    reset() { room = 1; score = 0; lives = 3; t = 0; hold = null; dead = 0; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (walls) build(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (noise) { noise.l -= dt; if (noise.l <= 0) noise = null; }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      if (caught) { caught += dt; if (caught > 1.2) { if (lives <= 0) { dead = .01; return; } build(); } return; }
      let moving = false;
      if (hold && hold.walk && !crate) {
        const dx = hold.x - pl.x, dy = hold.y - pl.y, d = Math.hypot(dx, dy);
        if (d > 3) { const sp = 46, nx = pl.x + dx / d * Math.min(d, sp * dt), ny = pl.y + dy / d * Math.min(d, sp * dt); if (!inWall(nx, pl.y, 4)) pl.x = nx; if (!inWall(pl.x, ny, 4)) pl.y = ny; pl.a = Math.atan2(dy, dx); moving = true; }
      }
      if (!intel.got && Math.hypot(intel.x - pl.x, intel.y - pl.y) < 8) { intel.got = true; score += 5; api.score(score); haptic('medium'); sfx(1200, .1, 'square', .04, 300); parts.push({ txt: 'FILES +5', x: intel.x, y: intel.y - 8, l: 1, col: '#f8e070' }); }
      if (Math.hypot(exit.x - pl.x, exit.y - pl.y) < 9) { score += 10 + (lives === 3 ? 0 : 0); room++; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 500); build(); return; }
      let seen = false;
      for (const g of guards) {
        // patrol, or walk to a noise and look around
        let tx, ty;
        if (g.look) { tx = g.look.x; ty = g.look.y; } else { const p = g.pts[g.i]; tx = p.x; ty = p.y; }
        const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
        if (g.wait > 0) { g.wait -= dt; g.a += Math.sin(t * 2.5) * dt * 1.6; if (g.wait <= 0 && g.look) g.look = null; }
        else if (d > 2) { const ta = Math.atan2(dy, dx); let da = ((ta - g.a) + Math.PI * 3) % (Math.PI * 2) - Math.PI; g.a += clamp(da, -4 * dt, 4 * dt); if (Math.abs(da) < .5) { const sp = g.look ? g.sp * 1.6 : g.sp, nx = g.x + dx / d * sp * dt, ny = g.y + dy / d * sp * dt; if (!inWall(nx, ny, 3)) { g.x = nx; g.y = ny; } else { g.look = null; g.wait = 1; } } }
        else if (g.look) g.wait = 1.6; else { g.i = (g.i + 1) % 2; g.wait = .8; }
        const visible = sees(g, pl.x, pl.y) && !(crate && Math.hypot(g.x - pl.x, g.y - pl.y) > 18);
        if (visible) { const near = 1 - Math.hypot(g.x - pl.x, g.y - pl.y) / g.range; g.sus += dt * (moving ? 2.4 : 1.4) * (.6 + near * 1.6); seen = true; g.look = { x: pl.x, y: pl.y }; }
        else g.sus = Math.max(0, g.sus - dt * .5);
        if (g.sus >= 1) { caught = .01; lives--; haptic('error'); sfx(200, .4, 'sawtooth', .05, 300); msg = { txt: lives > 0 ? 'SPOTTED!' : 'CAUGHT!', l: 1.2 }; g.sus = 1; return; }
      }
      if (seen && (t * 6 | 0) % 2) haptic('tick');
    },
    draw(c) {
      const v = view3d(), S = v.sin;
      v.frame();
      for (let x = 0; x < W; x += 16) for (let y = top; y < H; y += 16) if (((x + y) / 16) % 2) v.put('tile', v.at(x + 8, y + 8), { sx: 15.4, sz: 15.4 / S });
      // torch cones, clipped by walls
      for (const g of guards) {
        const pts = [[g.x, g.y]], N = 18;
        for (let i = 0; i <= N; i++) { const a = g.a - g.fov + i / N * g.fov * 2; let r = 4; while (r < g.range && !inWall(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r)) r += 2; pts.push([g.x + Math.cos(a) * r, g.y + Math.sin(a) * r]); }
        v.fan(pts, g.sus > .5 ? '#f84040' : g.look ? '#f8a040' : '#f8f0a0', .3 + Math.min(.25, g.sus * .3), 1.2);
      }
      for (const w of walls) v.put('wall', v.at(w.x + w.w / 2, w.y + w.h / 2), { sx: w.w, sy: 1, sz: w.h / S });
      for (const [x, y, w, h] of [[W / 2, top + 1, W, 2], [W / 2, H - 1, W, 2], [1, (top + H) / 2, 2, H - top], [W - 1, (top + H) / 2, 2, H - top]]) v.put('rim', v.at(x, y), { sx: w, sz: h / S });
      const ex = v.put('hatch', v.at(exit.x, exit.y)); ex.userData.lamp.scale.setScalar(1 + Math.sin(t * 5) * .15);
      if (!intel.got) v.put('files', v.at(intel.x, intel.y, 2 + Math.sin(t * 3)), { ry: t * 1.5 });
      if (noise) v.put('ripple', v.at(noise.x, noise.y, .6), { s: (1.2 - noise.l) * 40, sz: (1.2 - noise.l) * 40 / S });
      for (const g of guards) {
        const o = v.put('guard', v.at(g.x, g.y), { ry: Math.PI / 2 - g.a }); o.userData.legs.forEach((l, i) => l.rotation.x = g.wait > 0 ? 0 : Math.sin(t * 10 + i * Math.PI) * .5);
        v.put('blob', v.at(g.x, g.y, .2), { s: 6 });
      }
      if (crate) v.put('crate', v.at(pl.x, pl.y));
      else {
        const o = v.put('spy', v.at(pl.x, pl.y), { ry: Math.PI / 2 - pl.a }), walk = hold && hold.walk; o.userData.legs.forEach((l, i) => l.rotation.x = walk ? Math.sin(t * 12 + i * Math.PI) * .6 : 0);
        v.put('blob', v.at(pl.x, pl.y, .2), { s: 6 });
      }
      v.render(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const g of guards) {
        const [gx, hy] = v.over(g.x, g.y, 16);
        if (g.sus > 0) { c.fillStyle = '#000a'; c.fillRect(gx - 6, hy, 12, 3); c.fillStyle = g.sus > .6 ? '#f84040' : '#f8c040'; c.fillRect(gx - 6, hy, 12 * Math.min(1, g.sus), 3); }
        if (g.look && !g.sus) { c.fillStyle = '#000'; c.fillText('?', gx + 1, hy + 3); c.fillStyle = '#f8c040'; c.fillText('?', gx, hy + 2); }
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { const [px, py] = v.over(p.x, p.y, 4); if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, px + 1, py + 1); c.fillStyle = p.col; c.fillText(p.txt, px, py); } }
      c.fillStyle = '#0c1014e0'; c.fillRect(0, 0, W, top);
      for (let i = 0; i < 3; i++) { c.fillStyle = '#000'; c.beginPath(); c.arc(7 + i * 8, 7, 3.6, 0, 7); c.fill(); c.fillStyle = i < lives ? '#3878e0' : '#384048'; c.beginPath(); c.arc(7 + i * 8, 7, 2.8, 0, 7); c.fill(); }
      c.textAlign = 'left';
      c.textAlign = 'right'; c.fillStyle = '#e0e8f0'; c.fillText(`ROOM ${room}`, W - 4, 10);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000c'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = caught ? '#f86060' : '#e0e8f0'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 7 && !msg && room === 1) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 30, W, 28); c.fillStyle = '#e0e8f0'; c.fillText('HOLD: SNEAK TO HATCH', W / 2, H - 21); c.fillText('TAP AWAY: PEBBLE', W / 2, H - 13); c.fillText('TAP YOU: CRATE', W / 2, H - 5); }
    },
    down(x, y) { [x, y] = view3d().pick(x, y); tapStart = { x, y, t: performance.now() }; hold = { x, y, walk: false, t0: performance.now() }; },
    move(x, y, p) { if (!p || !hold) return; [x, y] = view3d().pick(x, y); hold.x = x; hold.y = y; if (Math.hypot(x - tapStart.x, y - tapStart.y) > 8 || performance.now() - hold.t0 > 160) hold.walk = true; },
    up() {
      const quick = tapStart && performance.now() - tapStart.t < 220 && !(hold && hold.walk); hold = null;
      if (!quick || dead || caught) return;
      if (Math.hypot(tapStart.x - pl.x, tapStart.y - pl.y) < 14) { crate = !crate; haptic('light'); sfx(crate ? 160 : 260, .08, 'square', .04); return; }
      if (crate) return;
      noise = { x: tapStart.x, y: tapStart.y, l: 1.2 }; sfx(700, .05, 'square', .03, -300); haptic('tick');
      for (const g of guards) if (Math.hypot(g.x - noise.x, g.y - noise.y) < 70) { g.look = { x: noise.x, y: noise.y }; g.wait = 0; }
    },
    key(k, d) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (step) { if (d) { tapStart = null; hold = { x: pl.x + step[0] * 400, y: pl.y + step[1] * 400, walk: true }; } else hold = null; }
      if (k === ' ' && d) { crate = !crate; sfx(crate ? 160 : 260, .08, 'square', .04); }
    },
  };
  return self;
}

export default {
  id: 'shadow-ops', title: 'Shadow Ops', tag: 'Console · Stealth', retro: true, era: 'console', pal: 'grape', w: 176, h: 192, maxW: 260, maxH: 320, goal: 60,
  hint: 'Hold to sneak toward your finger and reach the green hatch. Guards see down their torch cones; walls block them. Stay in a cone and their meter fills until you\'re spotted. Tap away from you to throw a pebble and lure guards, or tap yourself to hide under a crate. Grab the yellow files for a bonus.',
  make,
};
