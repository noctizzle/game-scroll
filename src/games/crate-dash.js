import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { View, G, part, grp, blob, THREE } = gs.toon;
const { Group } = THREE;
const LANE = 1.15;

// Run into the screen down a jungle path. Swipe left or right to change lanes, swipe up to jump,
// tap to spin. Spin through wooden crates and critters to smash them for gems, jump the logs and
// pits, and steer clear of red boom crates, which blow up if you touch or spin them. Bouncy crates
// launch you high. Every 100 gems is an extra life.
const FAR = 40, F = 6;
let W = 176, H = 176;

function make(api) {
  let objs, lane, lx, jumpT, spinT, speed, dist, gems, lives, t, nextZ, inv, parts, msg, dead, sw, bounce;
  const hor = () => H * .3, gnd = () => H - 6;
  // screen position of a lane/depth point (for the 2D pop-up text and sparks over the 3D view)
  const proj = (x, z, y = 0) => { const [sx, sy] = view3d().toScreen(x * LANE, y * 1.1, -z); return { x: sx, y: sy, s: F / (z + F) }; };
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#68b8f0', fog: ['#a8dcf8', 14, FAR], sun: [-.6, 1, .5], sunI: 2.4, amb: 1 });
      v3.add(part(G.plane, '#3e9c40', { sx: 60, sz: 120, z: -50, line: false }), part(G.plane, '#d0a464', { sx: 3.7, sz: 120, z: -50, y: .005, line: false }));
      for (const sx of [-1, 1]) v3.add(part(G.box, '#a07848', { sx: .25, sy: .18, sz: 120, x: sx * 1.95, y: .09, z: -50 }));
      for (let i = 0; i < 12; i++) v3.add(part(G.ball, '#2c7a34', { sx: 5, sy: 3 + (i % 3), sz: 3, x: -28 + i * 5, y: 0, z: -FAR - 4, line: false }));
      v3.def('stripe', () => part(G.plane, '#bc9050', { sx: 3.7, sz: 1, line: false }));
      v3.def('tree', () => grp(part(G.cyl, '#70401c', { sx: .14, sy: 1.1, sz: .14, y: .55 }), part(G.blob, '#2a8a36', { s: .7, y: 1.4 }), part(G.blob, '#38a040', { s: .45, y: 1.9, x: .15 })));
      v3.def('palm', () => grp(part(G.cyl, '#90602c', { sx: .1, sy: 1.8, sz: .1, y: .9, rz: .1 }), ...[0, 1, 2, 3, 4].map(k => part(G.cone, '#36a83c', { sx: .25, sy: 1.1, sz: .08, x: Math.cos(k * 1.26) * .45 + .1, y: 1.75, z: Math.sin(k * 1.26) * .45, rz: Math.PI / 2 + .3, ry: -k * 1.26 }))));
      v3.def('pit', () => grp(part(G.box, '#140c06', { sx: 1.05, sy: .04, sz: 1 }), part(G.box, '#5a3818', { sx: 1.15, sy: .06, sz: .1, z: .5 })));
      v3.def('log', () => grp(part(G.cyl, '#804820', { sx: .22, sy: 3.4, sz: .22, rz: Math.PI / 2 }), ...[-1, 1].map(k => part(G.cyl, '#d8a868', { sx: .2, sy: .02, sz: .2, x: k * 1.71, rz: Math.PI / 2, line: false }))));
      v3.def('gem', () => part(G.gem, '#f84890', { sx: .2, sy: .28, sz: .2, glow: .45 }));
      v3.def('critter', () => { const b = part(G.ball, '#48a048', { s: .32, y: .32 }); for (const k of [-1, 1]) { const e = part(G.ball, '#f8f8f0', { s: .3, x: k * .35, y: .35, z: .8 }); e.add(part(G.ball, '#14101c', { s: .5, z: .6, line: false })); b.add(e); } return grp(b, blob(.35)); });
      const crate = (col, band, extra) => () => { const g = grp(part(G.box, col, { s: .78, y: .39 }), part(G.box, band, { sx: .8, sy: .1, sz: .8, y: .39, line: false }), part(G.box, band, { sx: .1, sy: .8, sz: .8, y: .39, line: false }), blob(.55)); if (extra) g.add(extra()); return g; };
      v3.def('crate', crate('#c88840', '#805020'));
      v3.def('bouncy', crate('#3878d8', '#183878', () => part(G.cyl, '#f8f8f0', { sx: .3, sy: .08, sz: .3, y: .82 })));
      v3.def('boom', crate('#d83020', '#801810', () => grp(part(G.box, '#f8f040', { sx: .12, sy: .3, sz: .02, y: .5, z: .4, line: false }), part(G.box, '#f8f040', { sx: .12, sy: .1, sz: .02, y: .25, z: .4, line: false }))));
      v3.def('runner', () => {
        const g = new Group(), l = [-1, 1].map(k => { const leg = new Group(); leg.position.set(k * .12, .38, 0); leg.add(part(G.pill, '#2858c0', { sx: .16, sy: .3, sz: .16, y: -.18 })); return leg; });
        g.add(...l, part(G.pill, '#e87020', { sx: .46, sy: .4, sz: .36, y: .62 }), part(G.ball, '#f8a050', { s: .27, y: 1.02 }), part(G.ball, '#c84020', { sx: .3, sy: .15, sz: .3, y: 1.18 }));
        for (const k of [-1, 1]) g.add(part(G.ball, '#14101c', { s: .05, x: k * .1, y: 1.06, z: -.25, line: false }));
        g.userData.l = l; return g;
      });
      v3.def('spin', () => grp(part(G.ball, '#e87020', { sx: .55, sy: .45, sz: .55, y: .55 }), part(G.ring, '#f8f8f0', { sx: .6, sy: .6, sz: .3, y: .55, rx: Math.PI / 2, line: false })));
      v3.def('blob', () => blob(1, .3));
    }
    v3.persp(W, H, 58, .1, 80); return v3;
  }
  function spawn(z) {
    const r = Math.random(), lvl = Math.min(1, dist / 1500), L = [-1, 0, 1][Math.random() * 3 | 0];
    if (r < .32) { const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) objs.push({ k: Math.random() < .15 ? 'bouncy' : 'crate', lane: L, z: z + i * 1.4 }); }
    else if (r < .42 + lvl * .12) objs.push({ k: 'boom', lane: L, z });
    else if (r < .6) objs.push({ k: 'critter', lane: L, z, ph: rnd(0, 6) });
    else if (r < .72) { for (const l of [-1, 0, 1]) objs.push({ k: 'log', lane: l, z }); }
    else if (r < .8 + lvl * .06) objs.push({ k: 'pit', lane: L, z, len: 2.2 });
    else for (let i = 0; i < 5; i++) objs.push({ k: 'gem', lane: L, z: z + i * .9, y: 0 });
    if (Math.random() < .35) for (let i = 0; i < 3; i++) objs.push({ k: 'gem', lane: [-1, 0, 1][Math.random() * 3 | 0], z: z + 2 + i * .9, y: .4 });
  }
  const air = () => jumpT > 0 ? Math.sin(Math.PI * (1 - jumpT / (bounce ? 1.1 : .62))) * (bounce ? 1.7 : 1) : 0;
  function hurt(txt) {
    if (inv > 0) return; lives--; inv = 1.6; haptic('heavy'); sfx(130, .3, 'sawtooth', .05, -60); msg = { txt, l: 1 };
    if (lives <= 0) { dead = .01; sfx(100, .7, 'square', .05, -40); }
  }
  function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-90, 0), l: .5, col }); }
  function addGems(n, x, y) { const before = Math.floor(gems / 100); gems += n; api.score(gems + Math.floor(dist / 10)); if (Math.floor(gems / 100) > before) { lives++; msg = { txt: 'EXTRA LIFE!', l: 1.2 }; haptic('success'); } if (x != null) parts.push({ txt: `+${n}`, x, y, l: .7, col: '#f8e040' }); }
  const self = {
    reset() { objs = []; lane = 0; lx = 0; jumpT = 0; spinT = 0; speed = 9; dist = 0; gems = 0; lives = 3; t = 0; nextZ = 14; inv = 0; parts = []; dead = 0; sw = null; bounce = false; msg = { txt: 'SWIPE · TAP TO SPIN', l: 2 }; },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.3) api.over(); return; }
      speed = Math.min(18, 9 + dist / 180); const dz = speed * dt; dist += dz;
      inv = Math.max(0, inv - dt); spinT = Math.max(0, spinT - dt); if (jumpT > 0) { jumpT -= dt; if (jumpT <= 0) { jumpT = 0; bounce = false; } }
      lx += (lane - lx) * Math.min(1, dt * 14);
      for (const o of objs) o.z -= dz;
      nextZ -= dz; if (nextZ < FAR) { spawn(nextZ + 0); nextZ += rnd(5, 9) - Math.min(2.5, dist / 800); }
      const y = air(), me = Math.round(lx);
      for (const o of objs) {
        if (o.done) continue;
        if (o.k === 'pit') { if (o.z < .2 && o.z + o.len > -.2 && o.lane === me && y < .15) { o.done = true; hurt('FELL IN!'); jumpT = .62; } continue; }
        if (o.z > .5 || o.z < -.5 || o.lane !== me) continue;
        const p = proj(o.lane, Math.max(o.z, 0));
        if (o.k === 'gem') { if (Math.abs(y - o.y) < .55) { o.done = true; addGems(1); sfx(1300, .04, 'square', .03, 300); } continue; }
        if (o.k === 'log') { if (Math.abs(o.z) < .3 && y < .3) { o.done = true; hurt('TRIPPED!'); } continue; }
        if (o.k === 'boom') { if (y < .5 || spinT > 0) { o.done = true; burst(p.x, p.y - 8, '#f86030', 16); sfx(80, .4, 'sawtooth', .06, -30); hurt('BOOM!'); } continue; }
        if (o.k === 'critter') { if (spinT > 0) { o.done = true; burst(p.x, p.y - 6, '#60c060'); addGems(3, p.x, p.y - 16); sfx(600, .08, 'square', .04, 400); haptic('medium'); } else if (y > .3 && jumpT < .3) { o.done = true; jumpT = .5; addGems(3, p.x, p.y - 16); sfx(500, .08, 'square', .04, 300); } else if (y < .5) { o.done = true; hurt('OUCH!'); } continue; }
        if (o.k === 'crate' || o.k === 'bouncy') {
          if (spinT > 0 || (y > .2 && jumpT < .35 && o.k === 'crate')) { o.done = true; burst(p.x, p.y - 6, '#c88840'); addGems(o.k === 'bouncy' ? 5 : 2, p.x, p.y - 16); sfx(300, .08, 'square', .05, -100); haptic('medium'); if (y > .2) jumpT = .45; }
          else if (o.k === 'bouncy' && y > .1) { o.done = true; bounce = true; jumpT = 1.1; addGems(5, p.x, p.y - 16); sfx(700, .2, 'square', .05, 600); haptic('success'); }
          else if (y < .3) { o.done = true; burst(p.x, p.y - 6, '#c88840'); sfx(200, .08, 'square', .04); addGems(1); }
        }
      }
      objs = objs.filter(o => o.z + (o.len || 0) > -2 && !(o.done && o.k !== 'pit'));
      api.score(gems + Math.floor(dist / 10));
    },
    draw(c) {
      const v = view3d(); v.frame();
      const off = dist % 2;
      for (let z = -off - 2; z < FAR; z += 2) v.put('stripe', [0, .01, -z]);
      for (let z = -(dist % 3) - 3; z < FAR; z += 3) for (const sd of [-1, 1]) v.put((Math.floor((z + dist) / 3) + (sd > 0)) % 2 ? 'tree' : 'palm', [sd * (2.6 + ((Math.floor(z + dist) * 7) % 3) * .3), 0, -z], { ry: z + dist });
      for (const o of objs) {
        if (o.z > FAR || (o.done && o.k !== 'pit')) continue;
        const X = o.lane * LANE, Z = -o.z;
        if (o.k === 'pit') { if (o.z + o.len < -2) continue; v.put('pit', [X, .02, Z - o.len / 2], { sz: o.len }); continue; }
        if (o.k === 'gem') { v.put('gem', [X, .45 + (o.y || 0) * 1.1 + Math.sin(t * 4 + o.z) * .06, Z], { ry: t * 3 + o.z }); continue; }
        if (o.k === 'log') { v.put('log', [0, .2, Z], { rx: dist * 1.5 }); continue; }
        if (o.k === 'critter') { v.put('critter', [X, Math.abs(Math.sin(t * 6 + o.ph)) * .25, Z], { ry: Math.sin(t * 3 + o.ph) * .5 }); continue; }
        v.put(o.k, [X, 0, Z]);
      }
      const y = air(), run = v.put(spinT > 0 ? 'spin' : 'runner', [lx * LANE, y * 1.1, 0], { ry: spinT > 0 ? t * 30 : 0 });
      if (spinT <= 0) { const sw = Math.sin(t * 14); run.userData.l[0].rotation.x = sw * .8; run.userData.l[1].rotation.x = -sw * .8; }
      run.visible = !(inv > 0 && (t * 14 | 0) % 2);
      v.put('blob', [lx * LANE, .03, 0], { s: .45 * (1 - Math.min(.5, y * .4)) });
      v.cam.position.set(lx * LANE * .3, 3, 5.4); v.cam.lookAt(lx * LANE * .15, 0, -8);
      v.render(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#301808'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.fillStyle = '#00000060'; c.fillRect(0, 0, W, 12); c.textAlign = 'left';
      for (let i = 0; i < Math.min(lives, 6); i++) { c.fillStyle = '#e87020'; c.fillRect(4 + i * 8, 3, 6, 6); }
      c.textAlign = 'right'; c.fillStyle = '#f84890'; c.fillText(`◆${gems}`, W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .45 - 9, W, 13); c.fillStyle = '#f8f040'; c.fillText(msg.txt, W / 2, H * .45); }
    },
    down(x, y) { sw = { x, y, t: performance.now(), used: false }; },
    move(x, y, p) {
      if (!p || !sw || sw.used || dead) return; const dx = x - sw.x, dy = y - sw.y;
      if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) { sw.used = true; lane = clamp(lane + Math.sign(dx), -1, 1); sfx(400, .03, 'square', .03); haptic('tick'); }
      else if (dy < -18 && Math.abs(dy) > Math.abs(dx)) { sw.used = true; self.jump(); }
    },
    up() { if (sw && !sw.used && performance.now() - sw.t < 300) self.spin(); sw = null; },
    jump() { if (jumpT <= 0 && !dead) { jumpT = .62; sfx(500, .08, 'square', .04, 400); haptic('light'); } },
    spin() { if (spinT <= 0 && !dead) { spinT = .38; sfx(250, .2, 'triangle', .05, 300); haptic('light'); } },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') lane = Math.max(-1, lane - 1); if (k === 'ArrowRight') lane = Math.min(1, lane + 1); if (k === 'ArrowUp' || k === 'z') self.jump(); if (k === ' ' || k === 'x') self.spin(); },
  };
  return self;
}

export default {
  id: 'crate-dash', title: 'Crate Dash', tag: 'Console · Runner', retro: true, era: 'console', pal: 'lemon', w: 176, h: 176, maxW: 260, maxH: 320, goal: 250,
  hint: 'Swipe left or right to change lanes, swipe up to jump, tap to spin. Spin or jump on crates and critters for gems. Jump the logs and pits. Never touch the red boom crates. Blue crates bounce you sky-high. 100 gems gives an extra life.',
  make,
};
