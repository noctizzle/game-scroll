import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { glow } = gs.gfx;
const { View, G, part, grp, blob, THREE } = gs.toon;
const { Group } = THREE;

// Survival horror in a dark old house. Drag to sweep your torch beam, tap to fire where you
// tap. Head shots do double damage. Your pistol holds six shots: swipe down to reload, and keep an
// eye on your spare ammo. Tap boxes of shells and green herbs in the light to pick them up. When
// you're out of bullets, tap a creature that's right in your face to slash it with a knife.
const KINDS = {
  shambler: { hp: 3, sp: .085, w: 14, h: 34, col: '#7c9c70', dmg: 1 },
  crawler: { hp: 2, sp: .15, w: 16, h: 12, col: '#a08870', dmg: 1, low: true },
  hound: { hp: 2, sp: .22, w: 18, h: 14, col: '#986050', dmg: 1, zig: true },
  brute: { hp: 8, sp: .06, w: 22, h: 42, col: '#6a7898', dmg: 2 },
};
let W = 176, H = 176;

function make(api) {
  let foes, items, clip, spare, hp, room, kills, t, light, reload, parts, msg, dead, sw, flash, toSpawn, spawnT, hurtT, doorT;
  const hor = () => H * .38, flo = () => H - 8;
  const proj = (x, z) => { const s = 1 / (1 + z * 3.2); return { x: W / 2 + x * W * .5 * s, y: hor() + (flo() - hor()) * s, s }; };
  function newRoom() {
    room++; foes = []; items = []; const n = 3 + room;
    toSpawn = Array.from({ length: n }, (_, i) => { const r = Math.random(); return room > 3 && i === n - 1 && Math.random() < .6 ? 'brute' : r < .55 ? 'shambler' : r < .8 || room < 3 ? 'crawler' : 'hound'; });
    spawnT = 1.2; doorT = 0;
    const nItems = 1 + (Math.random() < .5 ? 1 : 0); for (let i = 0; i < nItems; i++) items.push({ k: Math.random() < .6 ? 'ammo' : 'herb', x: rnd(-.8, .8), z: rnd(.3, .9) });
    msg = { txt: `ROOM ${room}`, l: 1.2 };
  }
  // 3D camera that matches proj() exactly: eye 1.6 up, nearest floor (z = 0) 1.2 ahead
  let v3, camKey;
  function cam() {
    const hc = 1.6, d0 = 1.2, f = (flo() - hor()) * d0 / hc, xs = W * .5 * hc / (flo() - hor()), key = W + ',' + H;
    if (camKey !== key) {
      camKey = key; const Hf = 2 * (H - hor()), c = v3.persp(W, H, 2 * Math.atan(Hf / 2 / f) * 180 / Math.PI, .05, 40).cam;
      c.position.set(0, hc, 0); c.lookAt(0, hc, -1); c.aspect = W / Hf; c.setViewOffset(W, Hf, 0, Hf / 2 - hor(), W, H); c.updateProjectionMatrix();
    }
    return { f, xs, d0 };
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#0c0a10', fog: ['#0c0a10', 3, 7], sun: [.3, 1, .8], sunI: 1.8, amb: .7, sky: '#8070a0', ground: '#201010' });
      v3.def('hall', () => {
        const g = new Group(), L = 7, zc = -1.2 - L / 2;
        g.add(part(G.box, '#4a3430', { sx: 2, sy: .05, sz: L, y: -.025, z: zc }), part(G.box, '#30243c', { sx: .1, sy: 3, sz: L, x: -1.05, y: 1.5, z: zc }), part(G.box, '#30243c', { sx: .1, sy: 3, sz: L, x: 1.05, y: 1.5, z: zc }), part(G.box, '#181020', { sx: 2.2, sy: .1, sz: L, y: 3, z: zc }));
        for (let i = 0; i < 9; i++) { g.add(part(G.box, '#3a2a28', { sx: 2, sy: .06, sz: .04, z: -1.2 - i * .6, line: false })); }
        for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { g.add(part(G.box, '#5a4060', { sx: .06, sy: .5, sz: .4, x: sx * .99, y: 1.5, z: -2 - i * 1.4 })); g.add(part(G.box, '#26182c', { sx: .12, sy: .12, sz: L, x: sx * .99, y: .9, z: zc, line: false })); }
        return g;
      });
      v3.def('door', () => { const lit = part(G.box, '#f8d080', { sx: .55, sy: 1.25, sz: .02, y: .62, glow: 1.2, line: false }); const g = grp(part(G.box, '#4a3020', { sx: .7, sy: 1.4, sz: .05, y: .7 }), part(G.ball, '#c8a040', { s: .04, x: .22, y: .7, z: .04 }), lit); g.userData.lit = lit; return g; });
      v3.def('ammo', () => grp(part(G.box, '#806838', { sx: 1, sy: .55, sz: .7, y: .28 }), part(G.box, '#d8b860', { sx: 1.02, sy: .14, sz: .72, y: .5, line: false }), blob(.7, .4)));
      v3.def('herb', () => grp(part(G.cyl, '#8a5a3a', { sx: .3, sy: .3, sz: .3, y: .15 }), part(G.blob, '#40a040', { s: .35, y: .5 }), part(G.cone, '#60c060', { sx: .1, sy: .4, sz: .1, y: .8, line: false }), blob(.5, .4)));
      const flash = (g, h) => { const f = part(G.box, '#ffffff', { sx: 1.2, sy: h, sz: 1.2, y: h / 2, glow: 1, opacity: .7, line: false }); f.visible = false; g.add(f); g.userData.flash = f; return g; };
      // creature models are unit sized (width 1, height 1); put() scales them to the game's w/h
      const walker = (col, skin) => () => {
        const g = new Group(), legs = [-1, 1].map(sx => { const l = new Group(); l.position.set(sx * .22, .3, 0); l.add(part(G.box, col, { sx: .28, sy: .32, sz: .3, y: -.15 })); return l; });
        g.add(...legs, part(G.box, col, { sx: 1, sy: .5, sz: .6, y: .55 }), part(G.ball, skin, { sx: .42, sy: .16, sz: .42, y: .9 }));
        for (const sx of [-1, 1]) g.add(part(G.ball, '#f8e040', { sx: .07, sy: .025, sz: .07, x: sx * .12, y: .92, z: .38, glow: 1, line: false }));
        const arms = new Group(); arms.position.y = .76; for (const sx of [-1, 1]) arms.add(part(G.box, skin, { sx: .22, sy: .4, sz: .22, x: sx * .55, y: -.2 })); g.add(arms);
        g.userData.legs = legs; g.userData.arms = arms; return flash(g, 1.1);
      };
      v3.def('shambler', walker('#5c7c50', '#9cbc90')).def('brute', walker('#4a5878', '#8a98b8'));
      v3.def('crawler', () => { const g = grp(part(G.ball, '#a08870', { sx: .5, sy: .5, sz: .9, y: .5 }), part(G.ball, '#c0a890', { s: .3, y: .6, z: .6 }), part(G.ball, '#f8e040', { s: .07, x: -.1, y: .7, z: .85, glow: 1, line: false }), part(G.ball, '#f8e040', { s: .07, x: .1, y: .7, z: .85, glow: 1, line: false })); for (const sx of [-1, 1]) for (const z of [-.3, .3]) g.add(part(G.box, '#806850', { sx: .1, sy: .45, sz: .1, x: sx * .55, y: .25, z, rz: sx * .6 })); return flash(g, 1); });
      v3.def('hound', () => {
        const g = new Group(), legs = []; for (const sx of [-1, 1]) for (const z of [-.5, .5]) { const l = new Group(); l.position.set(sx * .3, .5, z); l.add(part(G.box, '#784838', { sx: .16, sy: .5, sz: .16, y: -.25 })); legs.push(l); }
        g.add(...legs, part(G.box, '#986050', { sx: .7, sy: .45, sz: 1.3, y: .7 }), part(G.box, '#a87060', { sx: .5, sy: .45, sz: .5, y: .95, z: .75 }), part(G.ball, '#f84040', { s: .06, x: .14, y: 1.05, z: 1.01, glow: 1, line: false }), part(G.ball, '#f84040', { s: .06, x: -.14, y: 1.05, z: 1.01, glow: 1, line: false }));
        g.userData.legs = legs; return flash(g, 1.2);
      });
    }
    return v3;
  }
  function lit(x, y) { return Math.hypot(x - light.x, y - light.y) < Math.max(W, H) * .2; }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-60, 10), l: .4, col }); }
  function hitFoe(f, dmg, x, y, head) {
    f.hp -= dmg; f.flash = .12; f.z += .04; burst(x, y, '#a02020', head ? 12 : 6); if (head) parts.push({ txt: 'HEAD!', x, y: y - 10, l: .6, col: '#f8e070' });
    if (f.hp <= 0) { f.dead = .01; kills++; api.score(kills); haptic('medium'); sfx(90, .25, 'sawtooth', .05, -30); if (Math.random() < .25) items.push({ k: Math.random() < .7 ? 'ammo' : 'herb', x: f.x, z: Math.max(.15, f.z) }); }
  }
  const self = {
    reset() { foes = []; items = []; clip = 6; spare = 12; hp = 5; room = 0; kills = 0; t = 0; light = { x: W / 2, y: H * .55 }; reload = 0; parts = []; dead = 0; sw = null; flash = 0; hurtT = 0; newRoom(); },
    resize(w, h) { W = w; H = h; if (light) light = { x: W / 2, y: H * .55 }; },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); hurtT = Math.max(0, hurtT - dt);
      for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      if (reload > 0) { reload -= dt; if (reload <= 0) { const n = Math.min(6 - clip, spare); clip += n; spare -= n; sfx(600, .06, 'square', .04, 200); haptic('light'); } }
      spawnT -= dt; if (spawnT <= 0 && toSpawn.length) { const k = toSpawn.shift(); foes.push({ k, ...KINDS[k], x: rnd(-.7, .7), z: 1.1, hp: KINDS[k].hp, ph: rnd(0, 6), flash: 0, atk: 0 }); spawnT = rnd(1.4, 2.6) - Math.min(.8, room * .08); sfx(70, .3, 'sawtooth', .03, 20); }
      for (const f of foes) {
        if (f.dead) { f.dead += dt; continue; }
        f.flash = Math.max(0, f.flash - dt);
        f.z -= f.sp * (1 + room * .03) * dt; if (f.zig) f.x = clamp(f.x + Math.sin(t * 4 + f.ph) * .6 * dt, -.8, .8);
        if (f.z <= 0) { f.z = 0; f.atk += dt; if (f.atk > .7) { f.atk = 0; hp -= f.dmg; hurtT = .4; haptic('heavy'); sfx(140, .3, 'sawtooth', .06, -60); f.z = .12; if (hp <= 0) { dead = .01; msg = { txt: 'YOU DIED', l: 9 }; sfx(60, 1, 'sawtooth', .06, -20); } } }
      }
      foes = foes.filter(f => !f.dead || f.dead < .6);
      if (!toSpawn.length && !foes.some(f => !f.dead)) { doorT += dt; if (doorT > 1.5) { spare += 2; newRoom(); } }
    },
    draw(c) {
      const v = view3d(), k = cam(); v.frame();
      const X = x => x * k.xs, Z = z => -k.d0 * (1 + z * 3.2), u = k.d0 / k.f; // world units per screen px at the front
      v.put('hall', [0, 0, 0], { sx: k.xs, sy: 1, sz: 1 });
      const dr = v.put('door', [0, 0, Z(1.2) + .02]); dr.userData.lit.visible = doorT > 0;
      for (const it of items) v.put(it.k, [X(it.x), 0, Z(it.z)], { s: 14 * u, ry: t + it.x * 3 });
      for (const f of foes) {
        const sway = Math.sin(t * 3 + f.ph) * .12, al = f.dead ? 1 - f.dead / .6 : 1;
        const o = v.put(f.k, [X(f.x), f.dead ? -(1 - al) * .3 : 0, Z(f.z)], { sx: f.w * 2.6 * u, sy: f.h * 2.6 * u * (f.dead ? Math.max(.1, al) : 1), sz: f.w * 2.6 * u, rz: f.low || f.k === 'hound' ? 0 : sway });
        o.userData.flash.visible = f.flash > 0;
        if (o.userData.arms) o.userData.arms.rotation.x = -1.3 + Math.sin(t * 4 + f.ph) * .2;
        if (o.userData.legs) o.userData.legs.forEach((l, i) => l.rotation.x = Math.sin(t * 10 + f.ph + i * Math.PI) * .5);
      }
      v.render(c, W, H);
      // darkness with a torch beam
      const r = Math.max(W, H) * .22, g = c.createRadialGradient(light.x, light.y, r * .3, light.x, light.y, r * 1.3);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.6, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,.93)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      glow(c, light.x, light.y, r * .9, '#f8e0b0', .12); if (flash > 0) { c.fillStyle = '#f8e0a040'; c.fillRect(0, 0, W, H); glow(c, light.x, light.y, r, '#f8d080', .6); }
      if (hurtT > 0) { c.fillStyle = `rgba(200,0,0,${hurtT})`; c.fillRect(0, 0, W, H); }
      c.strokeStyle = '#f8f8f080'; c.lineWidth = 1; c.beginPath(); c.moveTo(light.x - 4, light.y); c.lineTo(light.x + 4, light.y); c.moveTo(light.x, light.y - 4); c.lineTo(light.x, light.y + 4); c.stroke();
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // HUD
      c.fillStyle = '#000c'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = hp <= 2 ? '#f84040' : hp <= 3 ? '#f8a040' : '#60d060'; c.fillText(hp <= 2 ? 'DANGER' : hp <= 3 ? 'CAUTION' : 'FINE', 4, 9);
      c.textAlign = 'right'; for (let i = 0; i < 6; i++) { c.fillStyle = i < clip ? '#e8c860' : '#383028'; c.fillRect(W - 40 + i * 4, 3, 2, 6); }
      c.fillStyle = '#c0b0a0'; c.fillText(String(spare), W - 44, 9);
      if (reload > 0) { c.textAlign = 'center'; c.fillStyle = '#e8c860'; c.fillText('RELOADING', W / 2, H - 6); }
      else if (clip === 0) { c.textAlign = 'center'; c.fillStyle = (t * 3 | 0) % 2 ? '#f86060' : '#e8c860'; c.fillText(spare ? 'SWIPE DOWN: RELOAD' : 'NO AMMO: KNIFE UP CLOSE', W / 2, H - 6); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000c'; c.fillRect(0, H * .3 - 9, W, 13); c.fillStyle = dead ? '#c02020' : '#d8d0c0'; c.fillText(msg.txt, W / 2, H * .3); }
      if (t < 7 && !msg) { c.textAlign = 'center'; c.fillStyle = '#d8d0c0'; c.fillText('DRAG: TORCH  TAP: SHOOT', W / 2, H * .25); }
    },
    down(x, y) { sw = { x, y, t: performance.now(), moved: false }; },
    move(x, y, p) { if (!p || !sw) return; if (Math.hypot(x - sw.x, y - sw.y) > 10) sw.moved = true; light = { x, y }; if (y - sw.y > 40 && Math.abs(x - sw.x) < 30 && !sw.rl) { sw.rl = true; self.reload(); } },
    up(x, y) { if (sw && !sw.moved && performance.now() - sw.t < 300) self.fire(sw.x, sw.y); sw = null; },
    reload() { if (reload > 0 || clip === 6 || !spare || dead) return; reload = 1.1; sfx(300, .08, 'square', .04, -100); },
    fire(x, y) {
      if (dead) return; light = { x, y };
      // pick up items first
      for (const it of items) { const p = proj(it.x, it.z), s = p.s * 14; if (Math.abs(x - p.x) < s && Math.abs(y - (p.y - s * .4)) < s) { items.splice(items.indexOf(it), 1); if (it.k === 'ammo') { spare += 6; parts.push({ txt: '+6 SHELLS', x: p.x, y: p.y - 12, l: .9, col: '#e8c860' }); } else { hp = Math.min(5, hp + 2); parts.push({ txt: 'HEALED', x: p.x, y: p.y - 12, l: .9, col: '#60d060' }); } sfx(900, .08, 'square', .04, 300); haptic('light'); return; } }
      const target = [...foes].filter(f => !f.dead).sort((a, b) => a.z - b.z).find(f => { const p = proj(f.x, f.z), s = p.s * 2.6, w = f.w * s + 6, h = f.h * s + (f.low || f.k === 'hound' ? 6 : f.w * s * .6); return Math.abs(x - p.x) < w / 2 && y > p.y - h - 2 && y < p.y + 2; });
      if (clip === 0 || reload > 0) {
        if (target && target.z < .25) { hitFoe(target, 1, x, y, false); sfx(1200, .05, 'square', .03, -600); haptic('medium'); }
        else { sfx(200, .03, 'square', .02); if (!reload) self.reload(); }
        return;
      }
      clip--; flash = .05; sfx(180, .12, 'square', .07, -120); haptic('medium');
      if (target) { const p = proj(target.x, target.z), s = p.s * 2.6, head = !target.low && target.k !== 'hound' && y < p.y - target.h * s; hitFoe(target, head ? 2 : 1, x, y, head); }
      else burst(x, y, '#a09080', 4);
      if (clip === 0 && spare) self.reload();
    },
    key(k, d) { if (!d) return; if (k === 'r' || k === 'ArrowDown') self.reload(); if (k === ' ') { const f = foes.filter(f => !f.dead).sort((a, b) => a.z - b.z)[0]; if (f) { const p = proj(f.x, f.z); self.fire(p.x, p.y - f.h * p.s * 2.6 * .5); } } },
  };
  return self;
}

export default {
  id: 'mansion-night', title: 'Mansion Night', tag: 'Console · Horror', retro: true, era: 'console', pal: 'grape', w: 176, h: 176, maxW: 280, maxH: 300, goal: 30,
  hint: 'Drag to sweep your torch, tap to shoot where you tap. Head shots do double damage. Six shots per clip: it reloads when empty, or swipe down to reload early. Tap shell boxes and green herbs to pick them up. Out of ammo? Tap a creature right in front of you to slash it.',
  make,
};
