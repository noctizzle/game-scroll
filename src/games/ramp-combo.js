import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { View, G: GEO, part, grp, blob, THREE } = gs.toon;
const { Group, Shape, ExtrudeGeometry, Mesh } = THREE;

// A two-minute halfpipe session. The skater rolls back and forth on their own: tap as they cross
// the flat bottom (in the green zone) to pump and fly higher. In the air, swipe to throw tricks:
// up spins, down flips, left and right grab. Each trick takes time, so finish before you land or
// you bail. Land clean to bank the points; every extra trick in one air raises the multiplier.
const G = 300;
const TRICKS = { up: { n: 'SPIN 360', d: .42, p: 120 }, down: { n: 'KICKFLIP', d: .32, p: 80 }, left: { n: 'TAIL GRAB', d: .26, p: 60 }, right: { n: 'NOSE GRAB', d: .26, p: 60 } };
let W = 192, H = 160;

function make(api) {
  let side, phase, k, e, air, h, trick, combo, mult, score, time, t, parts, msg, dead, pumped, sw, last, bail, lastAirTricks;
  const lip = () => H * .42, bottom = () => H - 14, rampW = () => W * .26;
  function ridePos(u) {
    // u from 0 (top of the wall we came from) to 1 (top of the other wall)
    const L = 10, R = W - 10, rw = rampW(), from = side < 0 ? L : R, to = side < 0 ? R : L;
    const x = from + (to - from) * u, d = Math.min(x - L, R - x), y = d < rw ? bottom() - (bottom() - lip()) * Math.pow(1 - d / rw, 2) : bottom();
    return { x, y, a: d < rw ? Math.sign(to - from) * (x < W / 2 ? -1 : 1) * (1 - d / rw) * 1.2 * Math.sign(to - from) : 0 };
  }
  let v3, pipeKey, pipe;
  function buildPipe(v) {
    if (pipe) { v.scene.remove(pipe); pipe.traverse(o => o.geometry && o.geometry !== GEO.box && o.geometry.dispose()); }
    const sh = new Shape(), P = (x, y) => v.sv(x, y), rw = rampW(), add = (x, y, f) => { const q = P(x, y); sh[f ? 'moveTo' : 'lineTo'](q[0], q[1]); };
    add(-40, H + 40, true); add(-40, lip()); add(10, lip());
    for (let i = 0; i <= 24; i++) { const d = i / 24 * rw; add(10 + d, bottom() - (bottom() - lip()) * Math.pow(1 - d / rw, 2)); }
    for (let i = 0; i <= 24; i++) { const d = (1 - i / 24) * rw; add(W - 10 - d, bottom() - (bottom() - lip()) * Math.pow(1 - d / rw, 2)); }
    add(W + 40, lip()); add(W + 40, H + 40);
    const geo = new ExtrudeGeometry(sh, { depth: 70, bevelEnabled: false, curveSegments: 1 }); geo.translate(0, 0, -50);
    pipe = new Group(); pipe.add(part(geo, '#d8c8a8'));
    for (const x of [10, W - 10]) { const q = P(x, lip()); pipe.add(part(GEO.cyl, '#a0a0a8', { sx: 1.4, sy: 70, sz: 1.4, x: q[0], y: q[1] + 1, z: -15, rx: Math.PI / 2 })); }
    for (let i = 0; i < 6; i++) { const q = P(W * (i + .5) / 6, H * .2); pipe.add(part(GEO.box, '#304a70', { sx: W / 6 - 8, sy: H * .3, sz: 4, x: q[0], y: q[1], z: -80 }), part(GEO.ball, '#f8d060', { s: 3, x: q[0], y: q[1] + H * .17, z: -76, glow: 1, line: false })); }
    v.add(pipe);
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#1a2a48', sun: [-.4, 1, .7], sunI: 2.3, amb: 1, sky: '#a0c0ff', ground: '#403020' });
      v3.def('zoneOn', () => part(GEO.box, '#60e070', { sy: 1, sz: 30, glow: .8, line: false })).def('zoneOff', () => part(GEO.box, '#3a8a48', { sy: 1, sz: 30, line: false }));
      v3.def('blob', () => blob(1, .35));
      v3.def('skater', () => {
        const g = new Group(), board = new Group(), body = new Group(), legs = new Group();
        board.add(part(GEO.box, '#303030', { sx: 15, sy: 1.2, sz: 4.5, y: 1.6 }), part(GEO.box, '#f8f040', { sx: 15.2, sy: .3, sz: 4.7, y: 2.3, line: false }));
        for (const x of [-5, 5]) for (const z of [-2, 2]) board.add(part(GEO.cyl, '#f0f0f0', { sx: 1, sy: .8, sz: 1, x, y: .7, z, rx: Math.PI / 2, line: false }));
        for (const sx of [-1, 1]) legs.add(part(GEO.pill, '#2050a0', { sx: 2.4, sy: 8, sz: 2.4, x: sx * 2.2, y: 6.5 }));
        body.add(legs, part(GEO.box, '#e04848', { sx: 8, sy: 7.5, sz: 5, y: 13.5 }), part(GEO.ball, '#f8c890', { s: 3.4, y: 20 }), part(GEO.ball, '#f8e040', { sx: 3.7, sy: 2.4, sz: 3.7, y: 21.2 }));
        for (const sx of [-1, 1]) body.add(part(GEO.pill, '#f8c890', { sx: 2, sy: 7, sz: 2, x: sx * 6, y: 13, rz: sx * .9 }));
        const hand = part(GEO.ball, '#f8c890', { s: 1.6, y: 3 }); g.add(board, body, hand); g.userData = { board, body, legs, hand }; return g;
      });
    }
    v3.side(W, H, 38, 0, H * .35); return v3;
  }
  function bank() {
    if (combo > 0) { const pts = combo * mult; score += pts; api.score(score); parts.push({ txt: mult > 1 ? `${combo} x${mult} = ${pts}` : `+${pts}`, x: W / 2, y: H * .3, l: 1.4, col: mult > 2 ? '#80f8ff' : '#f8e040' }); if (mult > 2) haptic('success'); }
    combo = 0; mult = 0;
  }
  const self = {
    reset() { side = -1; phase = 'ride'; k = 0; e = 30; air = 0; h = 0; trick = null; combo = 0; mult = 0; score = 0; time = 90; t = 0; parts = []; msg = { txt: 'TAP IN THE GREEN TO PUMP', l: 2.4 }; dead = 0; pumped = false; sw = null; bail = 0; lastAirTricks = 0; },
    resize(w, h2) { W = w; H = h2; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; p.y -= 12 * dt; } parts = parts.filter(p => p.l > 0); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      time -= dt; if (time <= 0) { time = 0; if (phase !== 'air') { bank(); dead = .01; msg = { txt: 'SESSION OVER', l: 9 }; sfx(660, .4, 'square', .05, -200); return; } }
      if (bail > 0) { bail -= dt; return; }
      if (phase === 'ride') {
        k += dt / 1.15; if (k >= 1) { k = 1; side = -side; if (e > 4) { phase = 'air'; air = 0; h = e; lastAirTricks = 0; sfx(300, .05, 'square', .03, 200); } else { k = 0; e = Math.max(e, 0); } if (phase !== 'air') { k = 0; } }
        if (!pumped && k > .58 && k < .6) { /* missed pump window */ }
      } else if (phase === 'air') {
        const dur = 2 * Math.sqrt(2 * h / G); air += dt;
        if (trick) { trick.t += dt; if (trick.t >= trick.d) { combo += trick.p; mult++; lastAirTricks++; parts.push({ txt: trick.n, x: W / 2, y: H * .2, l: .8, col: '#f8f8f0' }); sfx(800 + mult * 60, .06, 'square', .04, 300); haptic('light'); trick = null; } }
        if (air >= dur) {
          if (trick) { bail = 1.2; time -= 2; combo = 0; mult = 0; trick = null; msg = { txt: 'BAIL! -2s', l: 1 }; haptic('heavy'); sfx(120, .4, 'sawtooth', .05, -60); e = Math.max(10, e * .5); }
          else { haptic('medium'); sfx(150, .08, 'square', .05); bank(); }
          phase = 'ride'; k = 0; pumped = false; e -= 3; if (time <= 0) { dead = .01; msg = { txt: 'SESSION OVER', l: 9 }; }
        }
      }
    },
    draw(c) {
      const v = view3d(); v.frame();
      const key = W + 'x' + H; if (pipeKey !== key) { pipeKey = key; buildPipe(v); }
      const pz = phase === 'ride' && k > .35 && k < .65;
      v.put(pz ? 'zoneOn' : 'zoneOff', v.sv(W / 2, bottom(), 2), { sx: W * .26 });
      let x, y, a = 0;
      if (phase === 'ride') { const p = ridePos(k); x = p.x; y = p.y; }
      else { const dur = 2 * Math.sqrt(2 * h / G), up = G * dur / 2, z = up * air - G * air * air / 2; x = side > 0 ? W - 14 : 14; y = lip() - z; if (trick && trick.k === 'up') a = trick.t / trick.d * Math.PI * 2; }
      // tilt the skater with the curve of the ramp while riding
      if (phase === 'ride') { const p1 = ridePos(clamp(k - .01, 0, 1)), p2 = ridePos(clamp(k + .01, 0, 1)), dx = p2.x - p1.x; a = Math.atan2(-(p2.y - p1.y) * Math.sign(dx || 1), Math.abs(dx)); }
      v.put('blob', v.sv(x, bottom(), 0), { s: 9 * clamp(1 - (bottom() - y) / 120, .3, 1) });
      if (bail > 0) v.put('skater', v.sv(W / 2, bottom() - 2, 0), { rz: Math.PI / 2, ry: .3 });
      else {
        const sk = v.put('skater', v.sv(x, y, 0), { rz: a, ry: (side > 0 ? -1 : 1) * .25 }), u = sk.userData;
        const flip = trick && trick.k === 'down' ? trick.t / trick.d : 0, grab = trick && (trick.k === 'left' || trick.k === 'right');
        u.board.rotation.x = flip * Math.PI * 2; u.body.position.y = grab ? -4 : 0; u.legs.scale.y = grab ? .45 : 1;
        u.hand.visible = !!grab; u.hand.position.x = trick && trick.k === 'left' ? -6 : 6;
      }
      v.render(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { c.fillStyle = '#101820'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); }
      c.fillStyle = '#10182080'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 9);
      c.textAlign = 'right'; c.fillStyle = '#f8e040'; c.fillText(combo ? `${combo} x${mult}` : '', W - 4, 9);
      // air meter
      c.fillStyle = '#ffffff30'; c.fillRect(W / 2 - 20, 4, 40, 3); c.fillStyle = '#80f8ff'; c.fillRect(W / 2 - 20, 4, 40 * clamp(e / 70, 0, 1), 3);
      if (msg) { c.fillStyle = '#000a'; c.fillRect(0, H * .5 - 9, W, 13); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, H * .5); }
      if (t < 8 && !msg) { c.textAlign = 'center'; c.fillStyle = '#f8f8f0'; c.fillText('SWIPE IN THE AIR', W / 2, H * .5); }
    },
    down(x, y) { sw = { x, y, used: false }; },
    move(x, y, p) { if (!p || !sw || sw.used) return; const dx = x - sw.x, dy = y - sw.y; if (Math.hypot(dx, dy) < 16) return; sw.used = true; self.trick(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')); },
    up() { if (sw && !sw.used) self.pump(); sw = null; },
    pump() {
      if (dead || bail > 0 || phase !== 'ride' || pumped) return; pumped = true;
      if (k > .35 && k < .65) { const good = Math.abs(k - .5) < .06; e = Math.min(80, e + (good ? 14 : 9)); parts.push({ txt: good ? 'BIG PUMP' : 'PUMP', x: W / 2, y: bottom() - 20, l: .6, col: '#60e070' }); sfx(good ? 520 : 420, .06, 'square', .04, 200); haptic(good ? 'medium' : 'light'); }
      else { e = Math.max(0, e - 4); sfx(160, .05, 'square', .03); }
    },
    trick(dir) { if (dead || phase !== 'air' || trick || bail > 0) return; trick = { ...TRICKS[dir], k: dir, t: 0 }; sfx(600, .04, 'square', .03, 200); },
    key(kk, d) { if (!d) return; const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[kk]; if (m) self.trick(m); if (kk === ' ') self.pump(); },
  };
  return self;
}

export default {
  id: 'ramp-combo', title: 'Ramp Combo', tag: 'Console · Sports', retro: true, era: 'console', pal: 'teal', w: 192, h: 160, maxW: 300, maxH: 240, goal: 12000,
  hint: 'The skater rolls on their own. Tap when they cross the green zone at the bottom to pump higher. In the air, swipe up (spin), down (kickflip), left or right (grabs). Tricks take time, so don\'t start one too late or you bail. Land clean to bank points: the more tricks in one air, the bigger the multiplier.',
  make,
};
