import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { View, G, part, grp, blob, flat, toon, THREE } = gs.toon;
const { Group } = THREE;
const slitOn = toon('#101010'), slitOff = toon('#f86020', { glow: .8 });

// 1944, a grey dawn beach. A machine-gun nest at the top sweeps its fire across the sand; you can
// see where it's pointing. Tap a cover spot near you to sprint to it, and don't get caught in the
// open when the sweep comes past. Once you're close, flick up to lob a grenade through the bunker
// slit. Every beach is longer and the gunners get twitchier.
let W = 200, H = 260;

function make(api) {
  let covers, at, run, lvl, score, t, hp, inv, beam, guns, nade, msg, dead, done, flick, parts, levelT;
  const bunkerY = 30;
  function build() {
    covers = []; const rows = 5 + Math.min(5, lvl), y0 = H - 26, y1 = 92;
    covers.push({ x: W / 2, y: y0, row: 0, kind: 'start' });
    for (let r = 1; r <= rows; r++) {
      const y = y0 - (y0 - y1) * r / rows, n = r === rows ? 2 : 2 + (Math.random() < .5 ? 1 : 0), xs = [];
      for (let i = 0; i < n; i++) xs.push(W * (i + .5) / n + rnd(-W * .12, W * .12));
      for (const x of xs) covers.push({ x: clamp(x, 18, W - 18), y: y + rnd(-6, 6), row: r, kind: Math.random() < .5 ? 'hedge' : 'sand', med: r > 1 && r < rows && Math.random() < .12 });
    }
    at = covers[0]; run = null; nade = null; flick = null; levelT = 0;
    guns = [{ x: W / 2, a: rnd(-.6, .6), dir: 1, w: Math.max(.6, .9 - lvl * .04), pause: 0 }];
    if (lvl >= 2) guns.push({ x: W * .25, a: .5, dir: -1, w: .8, pause: 1 });
    if (lvl >= 4) guns.push({ x: W * .75, a: -.5, dir: 1, w: .8, pause: 2 });
    msg = { txt: `BEACH ${lvl + 1}`, l: 1.5 };
  }
  let v3;
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#a89a78', sun: [-.6, 1, .3], sunI: 2.1, amb: 1, sky: '#d0d8e0', ground: '#605840' });
      v3.def('beach', () => grp(part(G.plane, '#c8b890', { line: false }), part(G.plane, '#58687a', { sx: 1, sz: .06, z: .5, y: .2, line: false })));
      v3.def('bluff', () => grp(part(G.box, '#4a4636', { sy: 16, y: 8 }), ...[-.4, -.15, .2, .42].map(x => part(G.blob, '#3a5030', { s: 7, x: x * 200, y: 16 }))));
      v3.def('bunker', () => { const slit = part(G.box, '#101010', { sx: 28, sy: 4, sz: 2, y: 9, z: 12.5, line: false }); const g = grp(part(G.box, '#7a7868', { sx: 60, sy: 14, sz: 26, y: 7 }), part(G.box, '#8a8878', { sx: 64, sy: 3, sz: 30, y: 15 }), slit, part(G.cyl, '#303030', { sx: 1.2, sy: 10, sz: 1.2, y: 9, z: 16, rx: Math.PI / 2 })); g.userData.slit = slit; return g; });
      v3.def('pillbox', () => grp(part(G.cyl, '#6a6858', { sx: 12, sy: 14, sz: 10, y: 7 }), part(G.box, '#101010', { sx: 14, sy: 4, sz: 2, y: 9, z: 9, line: false })));
      v3.def('wave', () => part(G.box, '#8898a8', { sx: 8, sy: .6, sz: 1.5, line: false }));
      v3.def('tracer', () => part(G.ball, '#f8e080', { sx: 1.2, sy: 1.2, sz: 3, glow: 1, line: false }));
      v3.def('boat', () => grp(part(G.box, '#505848', { sx: 36, sy: 6, sz: 16, y: 3 }), part(G.box, '#606a58', { sx: 36, sy: 8, sz: 2, y: 7, z: -8 })));
      v3.def('ring', () => part(G.hoop, flat('#f8f8f0', .8)));
      v3.def('hedge', () => grp(...[0, 1, 2].map(k => part(G.box, '#383838', { sx: 2, sy: 2, sz: 20, y: 6, rx: .9, ry: k * Math.PI / 3 })), blob(9, .3)));
      v3.def('sand', () => grp(...[-1, 0, 1].map(k => part(G.pill, '#8a7a58', { sx: 5, sy: 4, sz: 7, x: k * 7.5, y: 2.5, rz: Math.PI / 2 })), ...[-.5, .5].map(k => part(G.pill, '#a89670', { sx: 4.6, sy: 4, sz: 6.4, x: k * 7.5, y: 6.5, rz: Math.PI / 2 })), blob(13, .3)));
      v3.def('med', () => grp(part(G.box, '#f8f8f0', { s: 6 }), part(G.box, '#e03030', { sx: 1.4, sy: 4.4, sz: 6.2, line: false }), part(G.box, '#e03030', { sx: 4.4, sy: 1.4, sz: 6.2, line: false })));
      v3.def('soldier', () => {
        const g = new Group(), body = new Group(); g.add(body);
        body.add(part(G.box, '#4a5a30', { sx: 6, sy: 7, sz: 4, y: 7 }), part(G.ball, '#e8c090', { s: 2.4, y: 12.4 }), part(G.ball, '#5a6a3a', { sx: 3, sy: 1.6, sz: 3, y: 13.4 }), part(G.box, '#3a3020', { sx: 1, sy: 1, sz: 9, x: 3, y: 8, z: 2 }));
        for (const sx of [-1, 1]) body.add(part(G.box, '#3a4a28', { sx: 2.4, sy: 5, sz: 2.4, x: sx * 1.6, y: 2.5 }));
        g.add(blob(5, .35)); g.userData.body = body; return g;
      });
      v3.def('nade', () => part(G.ball, '#3a5028', { s: 3 })).def('blob', () => blob(1, .3));
    }
    v3.board(W, H, .66); return v3;
  }
  const half = () => .075 + Math.min(.03, lvl * .005);
  function spot(x, y) { return guns.some(g => { const a = Math.atan2(x - g.x, y - bunkerY); return Math.abs(a - g.a) < half(); }); }
  function px() { return run ? run.x : at.x; } function py() { return run ? run.y : at.y; }
  function hit() {
    if (inv > 0) return; hp--; inv = 1; haptic('heavy'); sfx(110, .2, 'sawtooth', .06, -40);
    for (let i = 0; i < 8; i++) parts.push({ x: px(), y: py(), vx: rnd(-40, 40), vy: rnd(-50, 0), l: .4, col: '#c03030' });
    if (hp <= 0) { dead = .01; msg = { txt: 'MAN DOWN', l: 9 }; haptic('error'); }
  }
  const self = {
    reset() { lvl = 0; score = 0; t = 0; hp = 3; inv = 0; dead = 0; done = 0; parts = []; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (covers) build(); },
    update(dt) {
      t += dt; inv = Math.max(0, inv - dt); for (const p of parts) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 2) api.over(); return; }
      if (done) { done += dt; if (done > 2.2) { lvl++; build(); done = 0; } return; }
      levelT += dt;
      // gunners sweep, sometimes hold, sometimes snap back
      for (const g of guns) {
        if (g.pause > 0) { g.pause -= dt; continue; }
        g.a += g.dir * g.w * (1 + lvl * .07) * dt; const lim = 1.05;
        if (Math.abs(g.a) > lim) { g.a = Math.sign(g.a) * lim; g.dir *= -1; if (Math.random() < .5) g.pause = rnd(.3, 1.2); }
        if (Math.random() < dt * (.25 + lvl * .06)) g.dir *= -1;
      }
      if (run) {
        const dx = run.to.x - run.x, dy = run.to.y - run.y, d = Math.hypot(dx, dy), sp = 74;
        if (d < sp * dt) { at = run.to; run = null; score += 10; api.score(score); haptic('light'); if (at.med && hp < 3) { hp++; at.med = false; sfx(880, .1, 'triangle', .05, 300); parts.push({ txt: '+MED', x: at.x, y: at.y - 12, l: .8, vx: 0, vy: -10, col: '#58e858' }); } }
        else { run.x += dx / d * sp * dt; run.y += dy / d * sp * dt; if (spot(run.x, run.y)) hit(); if ((t * 8 | 0) % 2) sfx(90, .02, 'square', .02); }
      }
      if (nade) {
        nade.t += dt; const k = nade.t / nade.T; nade.x = nade.x0 + (nade.tx - nade.x0) * k; nade.y = nade.y0 + (nade.ty - nade.y0) * k; nade.z = Math.sin(k * Math.PI) * 30;
        if (k >= 1) {
          for (let i = 0; i < 14; i++) parts.push({ x: nade.tx, y: nade.ty, vx: rnd(-60, 60), vy: rnd(-80, 0), l: .6, col: i % 2 ? '#f8a020' : '#606060' });
          haptic('heavy'); sfx(70, .4, 'sawtooth', .07, -30);
          if (Math.abs(nade.tx - W / 2) < 16 && Math.abs(nade.ty - bunkerY) < 10) { const bonus = 100 + Math.max(0, Math.round(60 - levelT)) * 2 + hp * 20; score += bonus; api.score(score); done = .01; msg = { txt: `NEST CLEARED +${bonus}`, l: 2 }; haptic('success'); guns = []; }
          nade = null;
        }
      }
    },
    draw(c) {
      const v = view3d(), S = v.sin; v.frame();
      v.put('beach', v.at(W / 2, H / 2), { sx: W, sz: H / S });
      v.put('bluff', v.at(W / 2, 23), { sx: W + 20, sz: 46 / S });
      v.put('bunker', v.at(W / 2, 28)).userData.slit.material = guns.length ? slitOn : slitOff;
      for (const g of guns) if (g.x !== W / 2) v.put('pillbox', v.at(g.x, 30));
      for (let i = 0; i < 8; i++) v.put('wave', v.at(((i * 31 + t * 10) % (W + 20)) - 10, H - 6, .5));
      for (const g of guns) {
        const L = H * 1.3, a0 = g.a - half(), a1 = g.a + half();
        v.fan([[g.x, bunkerY], [g.x + Math.sin(a0) * L, bunkerY + Math.cos(a0) * L], [g.x + Math.sin(a1) * L, bunkerY + Math.cos(a1) * L]], g.pause > 0 ? '#f8c850' : '#f85028', g.pause > 0 ? .14 : .3, 1);
        if (g.pause <= 0) for (let i = 0; i < 6; i++) { const d = ((t * 400 + i * 47) % L); v.put('tracer', v.at(g.x + Math.sin(g.a) * d, bunkerY + Math.cos(g.a) * d, 4)); }
      }
      const reach = run ? [] : covers.filter(cv => cv !== at && Math.hypot(cv.x - at.x, cv.y - at.y) < 95 && cv.y <= at.y + 4);
      for (const cv of covers) {
        if (cv.kind === 'start') { v.put('boat', v.at(cv.x, cv.y + 2)); continue; }
        if (reach.includes(cv)) v.put('ring', v.at(cv.x, cv.y, .6), { s: 14, sz: 14 / S }).children[0].material.opacity = (t * 3 | 0) % 2 ? .9 : .4;
        v.put(cv.kind, v.at(cv.x, cv.y), { ry: cv.kind === 'hedge' ? cv.x : 0 });
        if (cv.med) v.put('med', v.at(cv.x + 11, cv.y - 6, 2), { ry: t });
      }
      const x = px(), y = py();
      if (!(inv > 0 && (t * 12 | 0) % 2)) { const o = v.put('soldier', v.at(x, y + 2), { ry: Math.PI }); o.userData.body.rotation.x = run ? -.5 : .2; o.userData.body.position.y = run ? 0 : -2; }
      if (nade) { v.put('nade', v.at(nade.x, nade.y, nade.z)); v.put('blob', v.at(nade.x, nade.y, .3), { s: 3 }); }
      v.render(c, W, H);
      if (flick) { c.strokeStyle = '#f8f8f080'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, y); const tg = aim(flick); c.lineTo(tg.x, tg.y); c.stroke(); c.setLineDash([]); c.strokeStyle = '#f8e04880'; c.beginPath(); c.arc(tg.x, tg.y, 6, 0, 7); c.stroke(); }
      for (const p of parts) { if (p.txt) { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // HUD
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#1a1a14c0'; c.fillRect(0, 0, W, 11);
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < hp ? '#e03030' : '#40403a'; c.fillRect(4 + i * 9, 3, 6, 5); }
      c.fillStyle = '#e8e0c8'; c.textAlign = 'left'; c.fillText(`B${lvl + 1}`, 34, 8); c.textAlign = 'right'; c.fillStyle = '#f8c060'; c.fillText(String(score), W - 4, 8);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H * .45 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e048'; c.fillText(msg.txt, W / 2, H * .45); }
      const inRange = !run && Math.hypot(W / 2 - at.x, bunkerY - at.y) < 120;
      if (inRange && !nade && !done && !msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 34, W, 12); c.fillStyle = '#f8e048'; c.fillText('FLICK UP: GRENADE!', W / 2, H - 25); }
      else if (t < 7 && lvl === 0 && !msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 44, W, 22); c.fillStyle = '#f8f8f0'; c.fillText('TAP A RING TO SPRINT', W / 2, H - 35); c.fillText('STAY OUT OF THE FIRE', W / 2, H - 26); }
    },
    down(x, y) { if (dead || done || run) return; flick = { x0: x, y0: y, x, y }; },
    move(x, y, p) { if (!p || !flick) return; flick.x = x; flick.y = y; },
    up() {
      if (!flick || dead || done || run) { flick = null; return; }
      const f = flick; flick = null; const dx = f.x - f.x0, dy = f.y - f.y0;
      if (dy < -24 && !nade) { const tg = aim(f); nade = { x0: at.x, y0: at.y, x: at.x, y: at.y, tx: tg.x, ty: tg.y, t: 0, T: .7, z: 0 }; sfx(400, .1, 'triangle', .04, -200); haptic('medium'); return; }
      if (Math.hypot(dx, dy) > 12) return;
      const cv = covers.find(cv => cv !== at && Math.hypot(cv.x - f.x0, cv.y - f.y0) < 18 && Math.hypot(cv.x - at.x, cv.y - at.y) < 95 && cv.y <= at.y + 4);
      if (cv) { run = { x: at.x, y: at.y, to: cv }; haptic('light'); }
    },
    key(k, d) { if (!d) return; if (k === ' ' && !run) { const nx = covers.filter(cv => cv.y < at.y - 4 && Math.hypot(cv.x - at.x, cv.y - at.y) < 95).sort((a, b) => Math.abs(a.x - at.x) - Math.abs(b.x - at.x))[0]; if (nx) run = { x: at.x, y: at.y, to: nx }; } },
  };
  // a flick sends the grenade further the longer it is, up to the bunker's range
  function aim(f) { const dx = f.x - f.x0, dy = f.y - f.y0, d = Math.min(130, Math.hypot(dx, dy) * 1.6), a = Math.atan2(dy, dx); return { x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d }; }
  return self;
}

export default {
  id: 'front-line', title: 'Front Line', tag: 'Console · WW2', retro: true, era: 'console', pal: 'amber', w: 200, h: 260, maxW: 300, maxH: 420, goal: 1000,
  hint: 'Storm the beach. Tap a ringed cover spot to sprint to it, and time your dash so the machine-gun sweep (the red cone) doesn\'t catch you in the open. Grab first-aid kits on the way. Once you\'re close, flick up to lob a grenade into the bunker slit; a longer flick throws further.',
  make,
};
