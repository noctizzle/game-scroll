import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { View, G, part, grp, blob, flat, THREE } = gs.toon;
const { Group, Mesh, CircleGeometry } = THREE;

// Cheeky imps have escaped into the park. Hold to walk toward your finger, tap to swing your net
// toward the spot you tapped. Imps doze, wander and peek around; get too close or too loud and
// they bolt, but they tire quickly. Creep up from behind for an easy catch. Catch every imp in
// the park before the clock runs out to move on.
let W = 176, H = 176;
const NET = 20, ARC = 1.05;

function make(api) {
  let pl, imps, rocks, stage, caught, time, t, hold, swing, parts, msg, dead, tapStart;
  function place(r) { for (let i = 0; i < 40; i++) { const x = rnd(14, W - 14), y = rnd(24, H - 14); if (Math.hypot(x - pl.x, y - pl.y) > 50 && !rocks.some(o => Math.hypot(o.x - x, o.y - y) < o.r + r + 4)) return { x, y }; } return { x: rnd(14, W - 14), y: rnd(24, H - 14) }; }
  function build() {
    pl = { x: W / 2, y: H - 20, a: -Math.PI / 2 }; rocks = [];
    const nr = 3 + Math.min(4, stage); for (let i = 0; i < nr; i++) { const r = rnd(7, 12), p = place(r); rocks.push({ ...p, r, bush: Math.random() < .6 }); }
    imps = []; const n = 3 + Math.min(5, stage);
    for (let i = 0; i < n; i++) { const p = place(5), fast = stage > 1 && Math.random() < .25 + stage * .06; imps.push({ ...p, a: rnd(0, 6.28), st: Math.random() < .4 ? 'doze' : 'wander', tt: rnd(1, 3), sp: (fast ? 1.3 : 1) + Math.min(.4, stage * .04), stam: 1, fast, look: rnd(0, 6.28), alert: 0, gone: 0 }); }
    time = Math.max(time || 0, 0) + 18 + n * 2; msg = { txt: `PARK ${stage}: ${n} IMPS`, l: 1.6 };
  }
  function collide(o, r) { for (const k of rocks) { const dx = o.x - k.x, dy = o.y - k.y, d = Math.hypot(dx, dy), m = k.r + r; if (d < m && d > 0) { o.x = k.x + dx / d * m; o.y = k.y + dy / d * m; } } o.x = clamp(o.x, 6, W - 6); o.y = clamp(o.y, 18, H - 6); }
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#5cb84c', sun: [-.8, 1, .35], sunI: 2.6, amb: .9 });
      v3.add(part(G.plane, '#62c050', { sx: 2000, sz: 2000, y: -.5, line: false }));
      v3.def('blob', () => blob(1, .28));
      v3.def('bush', () => grp(part(G.blob, '#2e8a2e', { s: 1, y: .8 }), part(G.blob, '#46b046', { s: .62, x: -.45, y: 1.25, z: .3 }), part(G.blob, '#3a9c3a', { s: .55, x: .5, y: 1.1, z: .1 }), part(G.ball, '#e84060', { s: .14, x: .2, y: 1.6, z: .7, line: false }), blob(1.25, .3)));
      v3.def('rock', () => grp(part(G.rock, '#8a92a4', { sx: 1, sy: .75, sz: .9, y: .55 }), part(G.rock, '#a0a8b8', { s: .4, x: .7, y: .25, z: .5, ry: 1 }), blob(1.2, .3)));
      const imp = (col, dark) => () => {
        const g = new Group(), body = part(G.ball, col, { s: 5, y: 5 }); g.add(body);
        for (const sx of [-1, 1]) {
          body.add(part(G.cone, dark, { sx: .28, sy: .7, sz: .28, x: sx * .6, y: .95, rz: -sx * .5 }));
          const eye = part(G.ball, '#f8f8f0', { s: .28, x: sx * .34, y: .2, z: .82 }); eye.add(part(G.ball, '#14101c', { s: .5, z: .62, line: false })); body.add(eye);
          body.add(part(G.ball, dark, { s: .28, x: sx * .55, y: -.9, z: .3 }));
        }
        const lids = grp(...[-1, 1].map(sx => part(G.ball, col, { sx: .33, sy: .2, sz: .33, x: sx * .34, y: .25, z: .84 }))); body.add(lids);
        const sweat = part(G.ball, '#80c8ff', { sx: .14, sy: .22, sz: .14, x: .8, y: .7, z: .4 }); body.add(sweat);
        g.userData = { lids, sweat }; return g;
      };
      v3.def('imp', imp('#a860d8', '#6a3098')).def('impf', imp('#e85050', '#a02828'));
      v3.def('keeper', () => {
        const g = new Group(), legs = [-1, 1].map(sx => { const l = new Group(); l.position.set(sx * 1.8, 4, 0); l.add(part(G.pill, '#283848', { sx: 1.6, sy: 2.6, sz: 1.6, y: -2.2 })); return l; });
        g.add(...legs, part(G.pill, '#2f6a8c', { sx: 5.4, sy: 4.2, sz: 4.4, y: 6.8 }), part(G.ball, '#f8c890', { s: 3.2, y: 11.4 }));
        const cap = part(G.ball, '#e8a020', { sx: 3.4, sy: 1.7, sz: 3.4, y: 12.6 }); cap.add(part(G.cyl, '#e8a020', { sx: .9, sy: .12, sz: .7, z: .9, y: -.5 })); g.add(cap);
        for (const sx of [-1, 1]) g.add(part(G.ball, '#14101c', { s: .5, x: sx * 1.1, y: 11.8, z: 2.9, line: false }));
        g.userData = { legs }; return g;
      });
      v3.def('net', () => { const arm = new Group(); arm.add(part(G.cyl, '#a07040', { sx: .55, sy: 14, sz: .55, y: 7, line: true }), part(G.ring, '#f8f8f0', { s: 3.4, y: 16.5, rx: Math.PI / 2 })); arm.rotation.order = 'YXZ'; const g = new Group(); arm.rotation.x = .7; g.add(arm); return g; });
      v3.def('cone', () => grp(new Mesh(new CircleGeometry(46, 16, Math.PI / 2 - .9, 1.8).rotateX(-Math.PI / 2), flat('#ffffff', .22))));
      v3.def('swing', () => grp(new Mesh(new CircleGeometry(NET, 16, Math.PI / 2 - ARC, ARC * 2).rotateX(-Math.PI / 2), flat('#ffffff', .35))));
      v3.def('tuft', () => grp(...[-1, 0, 1].map(i => part(G.cone, i ? '#4aa83c' : '#58bc48', { sx: .7, sy: 3 - Math.abs(i), sz: .7, x: i * 1.1, y: 1.4 - Math.abs(i) * .5, rz: -i * .35, line: false }))));
      for (const [i, col] of ['#f8f070', '#f8a0c8', '#ffffff'].entries()) v3.def('flower' + i, () => grp(part(G.cyl, '#3a9030', { sx: .25, sy: 3, sz: .25, y: 1.5, line: false }), part(G.ball, col, { sx: 1.6, sy: .6, sz: 1.6, y: 3.2, line: false }), part(G.ball, '#f0a020', { s: .6, y: 3.6, line: false })));
      v3.def('hedge', () => grp(part(G.box, '#2c7a2c', { sy: 7, y: 3.5 }), part(G.box, '#a07040', { sy: 1.5, y: .75, sx: 1.01, sz: 1.01, line: false })));
      v3.def('mark', () => grp(part(G.ring, '#ffffff', { s: 3, rx: Math.PI / 2, line: false })));
      // a sandy clearing where the keeper starts
      v3.def('sand', () => part(G.disc, '#e0c888', { line: false }));
    }
    v3.board(W, H, .95, 36); return v3;
  }
  function burst(x, y, col) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-60, 20), l: .5, col }); }
  const self = {
    reset() { stage = 1; caught = 0; time = 0; t = 0; hold = null; swing = 0; parts = []; dead = 0; build(); },
    resize(w, h) { const sx = w / W, sy = h / H; W = w; H = h; if (pl) { for (const o of [pl, ...imps, ...rocks]) { o.x *= sx; o.y *= sy; } } },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      time -= dt; if (time <= 0) { time = 0; dead = .01; haptic('error'); sfx(140, .5, 'square', .05, -60); msg = { txt: 'TIME UP!', l: 9 }; return; }
      swing = Math.max(0, swing - dt);
      let moving = false;
      if (hold && hold.walk) { const dx = hold.x - pl.x, dy = hold.y - pl.y, d = Math.hypot(dx, dy); if (d > 3) { const sp = 62; pl.x += dx / d * Math.min(d, sp * dt); pl.y += dy / d * Math.min(d, sp * dt); pl.a = Math.atan2(dy, dx); moving = true; } }
      collide(pl, 5);
      for (const m of imps) {
        if (m.gone) { m.gone += dt; continue; }
        m.tt -= dt; const dx = m.x - pl.x, dy = m.y - pl.y, d = Math.hypot(dx, dy);
        // imps notice you if you're close, and from further if you're in front of them and moving
        const facing = Math.cos(Math.atan2(-dy, -dx) - m.look) > .4, hide = rocks.some(k => k.bush && Math.hypot(k.x - pl.x, k.y - pl.y) < k.r + 2);
        const range = (m.st === 'doze' ? 14 : 22) + (moving ? 10 : 0) + (facing ? 24 : 0) - (hide ? 14 : 0);
        if (d < range && m.st !== 'flee' && m.st !== 'tired') { m.alert += dt * (m.st === 'doze' ? 2 : 5); if (m.alert > 1) { m.st = 'flee'; m.tt = 1.7 + stage * .12; m.alert = 0; sfx(900, .08, 'square', .03, 400); parts.push({ txt: '!', x: m.x, y: m.y - 10, l: .6, col: '#f8f040' }); } }
        else m.alert = Math.max(0, m.alert - dt);
        let sp = 0;
        if (m.st === 'wander') { sp = 16; if (m.tt <= 0) { m.a = rnd(0, 6.28); m.tt = rnd(1, 3); if (Math.random() < .3) { m.st = 'doze'; m.tt = rnd(2, 4); } } m.look = m.a + Math.sin(t * 2 + m.x) * .8; }
        else if (m.st === 'doze') { m.look += dt * .3; if (m.tt <= 0) { m.st = 'wander'; m.tt = rnd(1, 3); } }
        else if (m.st === 'flee') { m.a = Math.atan2(dy, dx) + Math.sin(t * 5 + m.y) * .5; m.look = m.a + Math.PI; sp = 86 * m.sp; if (m.x < 14 || m.x > W - 14) m.a = Math.PI - m.a; if (m.tt <= 0) { m.st = 'tired'; m.tt = Math.max(.45, 1 - stage * .07); } }
        else if (m.st === 'tired') { m.look = Math.atan2(-dy, -dx); if (m.tt <= 0) { m.st = d < 40 ? 'flee' : 'wander'; m.tt = m.st === 'flee' ? 1.1 : 2; } }
        m.x += Math.cos(m.a) * sp * dt; m.y += Math.sin(m.a) * sp * dt;
        const ox = m.x, oy = m.y; collide(m, 5); if (Math.abs(ox - m.x) + Math.abs(oy - m.y) > .01 || m.x <= 6.5 || m.x >= W - 6.5 || m.y <= 18.5 || m.y >= H - 6.5) m.a += rnd(1.5, 3);
      }
      imps = imps.filter(m => m.gone < .5);
      if (!imps.length) { stage++; haptic('success'); sfx(880, .4, 'square', .05, 500); time += 3; build(); }
    },
    draw(c) {
      const v = view3d(), S = v.sin;
      v.frame();
      v.put('sand', v.at(W / 2, H - 14, .05), { sx: W * .35, sz: 10 / S });
      for (const [x, y, w, h] of [[W / 2, 13, W + 8, 4], [W / 2, H + 2, W + 8, 4], [-2, H / 2 + 6, 4, H], [W + 2, H / 2 + 6, 4, H]]) v.put('hedge', v.at(x, y), { sx: w, sz: h / S });
      for (let i = 0; i < 46; i++) { const gx = (i * 53 + 11) % W, gy = 14 + (i * 37) % (H - 14); v.put(i % 5 ? 'tuft' : 'flower' + (i % 3), v.at(gx, gy), { ry: i, s: .8 + (i % 4) * .15 }); }
      for (const k of rocks) v.put(k.bush ? 'bush' : 'rock', v.at(k.x, k.y), { s: k.r, ry: k.x });
      for (const m of imps) {
        const s = m.gone ? Math.max(.05, 1 - m.gone * 2) : 1, hop = m.st === 'flee' ? Math.abs(Math.sin(t * 18 + m.x)) * 3 : m.st === 'wander' ? Math.abs(Math.sin(t * 8 + m.x)) * 1.2 : 0;
        const o = v.put(m.fast ? 'impf' : 'imp', v.at(m.x, m.y, hop), { s: s * 1.2, ry: Math.PI / 2 - m.look });
        o.userData.lids.visible = m.st === 'doze'; o.userData.sweat.visible = m.st === 'tired';
        v.put('blob', v.at(m.x, m.y, .1), { s: 5 * s });
        if (m.st !== 'doze' && !m.gone) v.put('cone', v.at(m.x, m.y, .3), { sz: 1 / S }).children[0].rotation.y = Math.PI / 2 - m.look;
      }
      const na = swing > 0 ? pl.a - ARC + (1 - swing / .22) * ARC * 2 : pl.a + .7, reach = swing > 0 ? NET - 4 : 9;
      const kp = v.put('keeper', v.at(pl.x, pl.y), { s: 1.15, ry: Math.PI / 2 - pl.a });
      kp.userData.legs.forEach((l, i) => l.rotation.x = hold && hold.walk ? Math.sin(t * 14 + i * Math.PI) * .6 : 0);
      v.put('blob', v.at(pl.x, pl.y, .1), { s: 6.5 });
      const net = v.put('net', v.at(pl.x, pl.y, 5)); net.rotation.y = Math.PI / 2 - na; net.children[0].rotation.x = swing > 0 ? 1.35 : .7; net.children[0].scale.z = reach / 14;
      if (swing > 0) v.put('swing', v.at(pl.x, pl.y, .4), { sz: 1 / S }).children[0].rotation.y = Math.PI / 2 - pl.a;
      if (hold && hold.walk) v.put('mark', v.at(hold.x, hold.y, .3), { sz: 1 / S, ry: t * 3 });
      v.render(c, W, H);
      // 2D overlay: sleepy z's and alert meters float over the 3D imps
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const m of imps) {
        if (m.gone) continue; const [mx, top] = v.over(m.x, m.y, 14);
        if (m.st === 'doze') { c.fillStyle = '#ffffff'; c.fillText('z', mx + 6, top - (t * 4 % 4)); }
        if (m.alert > 0) { c.fillStyle = '#00000080'; c.fillRect(mx - 5, top - 3, 10, 3); c.fillStyle = '#f8f040'; c.fillRect(mx - 4, top - 2, 8 * m.alert, 1); }
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { const [px, py] = v.over(p.x, p.y, 4); if (p.txt) { c.fillStyle = '#203020'; c.fillText(p.txt, px + 1, py + 1); c.fillStyle = p.col; c.fillText(p.txt, px, py); } else { c.fillStyle = p.col; c.fillRect(px, py, 2, 2); } }
      c.fillStyle = '#183018c0'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 9);
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(`LEFT ${imps.filter(m => !m.gone).length}`, W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#183018c0'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = '#f8f040'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 6 && !msg) { c.textAlign = 'center'; c.fillStyle = '#183018a0'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#f8f8f0'; c.fillText('HOLD TO WALK', W / 2, H - 14); c.fillText('TAP TO SWING NET', W / 2, H - 5); }
    },
    down(x, y) { [x, y] = view3d().pick(x, y); tapStart = { x, y, t: performance.now() }; hold = { x, y, walk: false }; setTimeout(() => { if (hold && !hold.done) hold.walk = true; }, 140); },
    move(x, y, p) { if (!p || !hold) return; [x, y] = view3d().pick(x, y); hold.x = x; hold.y = y; if (Math.hypot(x - tapStart.x, y - tapStart.y) > 8) hold.walk = true; },
    up(x, y) {
      if (x != null) [x, y] = view3d().pick(x, y);
      const quick = tapStart && performance.now() - tapStart.t < 220 && !(hold && hold.walk && Math.hypot((x ?? tapStart.x) - tapStart.x, (y ?? tapStart.y) - tapStart.y) > 8);
      if (hold) hold.done = true; hold = null;
      if (quick && !dead && swing <= 0) {
        pl.a = Math.atan2(tapStart.y - pl.y, tapStart.x - pl.x); swing = .22; sfx(300, .08, 'triangle', .05, 300); haptic('light');
        let got = 0;
        for (const m of imps) { if (m.gone) continue; const dx = m.x - pl.x, dy = m.y - pl.y, d = Math.hypot(dx, dy), da = Math.abs(((Math.atan2(dy, dx) - pl.a + 9.42) % 6.283) - 3.14); if (d < NET + 4 && da < ARC + .2) { m.gone = .01; got++; caught++; burst(m.x, m.y, '#f8f040'); parts.push({ txt: m.st === 'doze' ? 'SNOOZER!' : 'GOTCHA!', x: m.x, y: m.y - 12, l: .9, col: '#f8f8f0' }); time += m.fast ? 3 : 2; } }
        if (got) { api.score(caught); haptic('success'); sfx(1000, .15, 'square', .05, 400); }
      }
    },
    key(k, d) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (step) { if (d) { hold = { x: pl.x + step[0] * 400, y: pl.y + step[1] * 400, walk: true }; pl.a = Math.atan2(step[1], step[0]); } else hold = null; }
      if (k === ' ' && d) { tapStart = { x: pl.x + Math.cos(pl.a) * 10, y: pl.y + Math.sin(pl.a) * 10, t: performance.now() }; hold = null; self.up(); }
    },
  };
  return self;
}

export default {
  id: 'net-catch', title: 'Net Catch', tag: 'Console · Action', retro: true, era: 'console', pal: 'teal', w: 176, h: 176, maxW: 260, maxH: 300, goal: 25,
  hint: 'Hold to walk toward your finger, tap to swing your net that way. Imps see in front of them (the pale cone) and bolt when they notice you, but they tire fast. Sneak up from behind, hide in bushes, and catch dozing imps for an easy grab. Every catch adds time.',
  make,
};
