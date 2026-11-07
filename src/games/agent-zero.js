import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { View, G, part, grp, flat, THREE } from '../kit/toon3d.js';
const { Group } = THREE;

// A tuxedoed secret agent is pinned behind a marble counter at a villain's gala. Hold to lean out
// and aim; your silenced pistol fires whenever the sights cross a henchman. Let go to duck back
// behind cover, where you heal and reload. Never hit the guests in white. Every few takedowns
// your wristwatch charges: swipe up to fire a stun pulse that drops everyone in sight.
let W = 192, H = 160;
const SPOTS = [[.12, .42], [.3, .32], [.5, .42], [.7, .32], [.88, .42], [.2, .6], [.8, .6], [.5, .62]];

function make(api) {
  let foes, hp, ammo, out, aimX, aimY, fireT, reloadT, watch, kills, wave, waveLeft, spawnT, t, parts, msg, dead, flash, hurtT, sw, scene;
  function spawn() {
    const free = SPOTS.map((s, i) => i).filter(i => !foes.some(f => f.spot === i)); if (!free.length) return;
    const i = free[Math.random() * free.length | 0], [sx, sy] = SPOTS[i], guest = Math.random() < .2 && wave > 1;
    foes.push({ spot: i, x: sx * W, y: sy * H, up: 0, st: 'rise', hp: guest ? 1 : wave > 3 && Math.random() < .3 ? 2 : 1, guest, aimT: rnd(.9, 1.5) - Math.min(.4, wave * .05), stay: rnd(2, 3.5), flash: 0, stun: 0 });
  }
  const warn = () => Math.max(.22, .5 - wave * .025);
  let v3;
  function person(suit, shirt, hair, tie) {
    const g = new Group();
    g.add(part(G.box, suit, { sx: 12, sy: 15, sz: 7, y: 8 }), part(G.box, shirt, { sx: 3.6, sy: 6, sz: 1, y: 12.5, z: 3.6 }), part(G.ball, '#e8b890', { s: 4.4, y: 20 }));
    g.add(part(G.ball, hair, { sx: 4.7, sy: 2.6, sz: 4.7, y: 22 }));
    for (const sx of [-1, 1]) g.add(part(G.ball, '#14101c', { s: .7, x: sx * 1.6, y: 20.4, z: 4, line: false }));
    if (tie) g.add(part(G.box, tie, { sx: 3, sy: 1.6, sz: 1, y: 15, z: 4 }));
    const flash = part(G.box, '#ffffff', { sx: 13, sy: 26, sz: 8, y: 12, glow: 1, line: false }); g.add(flash); g.userData.flash = flash;
    return g;
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#2a1424', sun: [-.4, .8, 1], sunI: 2.3, amb: 1 });
      const rooms = [['#4a2438', '#6a3450', '#c8a050'], ['#203040', '#34506c', '#a0b0c0'], ['#101830', '#283460', '#f8d070']];
      rooms.forEach(([wall, door, trim], i) => {
        v3.def('room' + i, () => {
          const g = new Group();
          g.add(part(G.box, wall, { sx: 400, sy: 300, sz: 4, z: -40, line: false }));
          if (i === 2) { for (let k = 0; k < 9; k++) g.add(part(G.box, '#283860', { sx: 22, sy: 40 + (k * 37) % 50, sz: 10, x: -100 + k * 25, y: 30 - (k % 3) * 8, z: -30 })); for (let k = 0; k < 30; k++) g.add(part(G.ball, '#f8f0c0', { s: .7, x: -110 + (k * 37) % 220, y: 50 + (k * 23) % 40, z: -36, glow: 1, line: false })); }
          else for (let k = -4; k <= 4; k++) g.add(part(G.box, trim, { sx: 4, sy: 300, sz: 4, x: k * 26, z: -36 }));
          g.add(part(G.box, i === 1 ? '#506070' : '#3a2018', { sx: 400, sy: 4, sz: 120, y: -82, z: -20 }));
          return g;
        });
        v3.def('door' + i, () => grp(part(G.box, door, { sx: 26, sy: 34, sz: 4, y: 7, z: -8 }), part(G.box, '#0c0810', { sx: 20, sy: 26, sz: 2, y: 5, z: -5.5, line: false }), part(G.box, trim, { sx: 28, sy: 3, sz: 5, y: 25, z: -7.5 })));
        v3.def('ledge' + i, () => grp(part(G.box, door, { sx: 28, sy: 30, sz: 10, y: -15, z: 2 }), part(G.box, trim, { sx: 31, sy: 3, sz: 13, y: -1, z: 2 })));
      });
      v3.def('lamp', () => { const g = grp(part(G.cyl, '#c8a050', { sx: .4, sy: 10, sz: .4, y: 6 }), part(G.ring, '#c8a050', { sx: 6, sy: 6, sz: 3, rx: Math.PI / 2 })); for (let k = 0; k < 5; k++) g.add(part(G.ball, '#fff0b0', { s: 1.4, x: Math.cos(k * 1.26) * 6, z: Math.sin(k * 1.26) * 6, y: 1, glow: 1 })); return g; });
      v3.def('hench', () => { const g = person('#26262e', '#f8f8f0', '#202020', '#c02030'); const gun = part(G.box, '#18181c', { sx: 7, sy: 2, sz: 2, x: 8, y: 12, z: 3 }), warn = part(G.ball, '#f84040', { s: 2.2, x: 12, y: 12, z: 3, glow: 1, line: false }); g.add(gun, warn); g.userData.gun = gun; g.userData.warn = warn; return g; });
      v3.def('guest', () => person('#f0f0e8', '#e0a0c0', '#c09030', '#e0a0c0'));
      v3.def('counter', () => grp(part(G.box, '#d8cfbc', { sx: 210, sy: 30, sz: 14 }), part(G.box, '#efe8da', { sx: 212, sy: 3, sz: 16, y: 15 }), ...[-3, -2, -1, 0, 1, 2, 3].map(k => part(G.box, '#c4b9a2', { sx: 1, sy: 26, sz: 1, x: k * 28, z: 7.2, line: false }))));
      v3.def('agent', () => {
        const g = grp(part(G.box, '#24242c', { sx: 14, sy: 14, sz: 8, y: 0 }), part(G.box, '#f8f8f0', { sx: 4, sy: 6, sz: 1, y: 4, z: 4.2 }), part(G.box, '#18181c', { sx: 3, sy: 1.6, sz: 1, y: 6, z: 4.8 }), part(G.ball, '#e8b890', { s: 4.4, y: 11 }), part(G.ball, '#382418', { sx: 4.7, sy: 2.6, sz: 4.7, y: 13 }));
        const arm = new Group(); arm.position.set(5, 3, 4); arm.add(part(G.box, '#24242c', { sx: 3, sy: 12, sz: 3, y: 6 }), part(G.box, '#18181c', { sx: 2.4, sy: 6, sz: 2.4, y: 14 })); g.add(arm); g.userData.arm = arm; return g;
      });
    }
    v3.side(W, H, 46, 0, H * .7); return v3;
  }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-60, 10), l: .4, col }); }
  const self = {
    reset() { foes = []; hp = 100; ammo = 8; out = false; aimX = W / 2; aimY = H * .4; fireT = 0; reloadT = 0; watch = 0; kills = 0; wave = 1; waveLeft = 6; spawnT = 1.5; t = 0; parts = []; msg = { txt: 'HOLD TO LEAN OUT', l: 2 }; dead = 0; flash = 0; hurtT = 0; sw = null; scene = 0; },
    resize(w, h) { const sx = w / W, sy = h / H; W = w; H = h; if (foes) { for (const f of foes) { f.x = SPOTS[f.spot][0] * W; f.y = SPOTS[f.spot][1] * H; } aimX *= sx; aimY *= sy; } },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); hurtT = Math.max(0, hurtT - dt);
      for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) api.over(); return; }
      if (!out) { hp = Math.min(100, hp + dt * 6); if (ammo < 8) { reloadT += dt; if (reloadT > .9) { ammo = 8; reloadT = 0; sfx(500, .05, 'square', .03, 200); } } }
      fireT -= dt;
      if (out && ammo > 0 && fireT <= 0) {
        const f = foes.find(f => !f.stun && (f.st === 'aim' || f.st === 'rise') ? f.up > .6 && Math.abs(f.x - aimX) < 7 && Math.abs(f.y - 6 - aimY) < 10 : false);
        if (f) { fireT = .28; ammo--; flash = .05; sfx(900, .05, 'square', .04, -600); haptic('light'); f.hp--; f.flash = .1; burst(aimX, aimY, f.guest ? '#f8f8f0' : '#e04040', 5);
          if (f.hp <= 0) { if (f.guest) { hp -= 35; hurtT = .4; msg = { txt: 'NOT THE GUESTS!', l: 1.2 }; haptic('error'); sfx(150, .3, 'sawtooth', .05, -60); } else { kills++; watch = Math.min(1, watch + .2); api.score(kills); sfx(300, .1, 'square', .04, -100); } f.st = 'down'; f.up = 1; }
        }
      }
      spawnT -= dt; if (spawnT <= 0 && waveLeft > 0 && foes.filter(f => f.st !== 'down').length < 2 + Math.min(3, wave >> 1)) { spawn(); waveLeft--; spawnT = rnd(.7, 1.5) - Math.min(.4, wave * .04); }
      for (const f of foes) {
        f.flash = Math.max(0, f.flash - dt);
        if (f.stun > 0) { f.stun -= dt; if (f.stun <= 0) { f.st = 'down'; } continue; }
        if (f.st === 'rise') { f.up = Math.min(1, f.up + dt * 3); if (f.up >= 1) { f.st = 'aim'; f.t = 0; } }
        else if (f.st === 'aim') { f.t += dt; if (!f.guest && f.t >= f.aimT) { f.t = 0; f.aimT = rnd(.8, 1.4) - Math.min(.4, wave * .04); sfx(200, .06, 'square', .04, -80); if (out) { hp -= 14 + wave * 2; hurtT = .3; haptic('heavy'); } else parts.push({ txt: 'MISS', x: f.x, y: f.y - 20, l: .5, col: '#a0a0a0' }); } if (f.t > f.stay && f.guest) f.st = 'sink'; }
        else if (f.st === 'sink' || f.st === 'down') { f.up -= dt * (f.st === 'down' ? 2 : 3); if (f.up <= 0) f.gone = true; }
      }
      foes = foes.filter(f => !f.gone);
      if (hp <= 0) { hp = 0; dead = .01; msg = { txt: 'AGENT DOWN', l: 9 }; haptic('error'); sfx(110, .8, 'sawtooth', .05, -40); return; }
      if (waveLeft <= 0 && !foes.length) { wave++; waveLeft = 5 + wave * 2; scene = (scene + 1) % 3; msg = { txt: ['THE GALA', 'THE VAULT', 'THE ROOFTOP'][scene] + ` · ${wave}`, l: 1.4 }; haptic('success'); sfx(880, .3, 'square', .05, 400); spawnT = 1.8; }
    },
    draw(c) {
      const v = view3d(); v.frame();
      v.put('room' + scene, [0, 0, 0], { sx: W / 192, sy: H / 160, sz: 1 });
      for (const [sx, sy] of SPOTS) { const p = v.sv(sx * W, sy * H); v.put('door' + scene, p); v.put('ledge' + scene, v.sv(sx * W, sy * H + 6)); }
      if (scene === 0) for (let i = 0; i < 3; i++) v.put('lamp', v.sv(W * (.25 + i * .25), 6, -14), { ry: t * .5 + i });
      for (const f of foes) {
        const u = clamp(f.up, 0, 1), by = f.y + 6 - u * 30;
        const o = v.put(f.guest ? 'guest' : 'hench', v.sv(f.x, by + 24, -1), { rz: f.st === 'down' ? (1 - u) * .8 : f.stun > 0 ? Math.sin(t * 30) * .15 : 0 });
        o.userData.flash.visible = f.flash > 0;
        if (o.userData.gun) o.userData.gun.visible = !f.stun && f.st === 'aim', o.userData.warn.visible = f.st === 'aim' && f.t > f.aimT - warn() && !f.stun && (t * 16 | 0) % 2 === 0;
      }
      v.put('counter', v.sv(W / 2, H - 15, 6), { sx: W / 192 });
      const ay = out ? H - 44 : H - 26, ag = v.put('agent', v.sv(W * .5, ay + 11, 16));
      ag.userData.arm.visible = out; if (out) ag.userData.arm.rotation.z = Math.atan2(-(aimY - ay - 8), aimX - W * .5) - Math.PI / 2;
      v.render(c, W, H);
      for (const f of foes) if (f.stun > 0) { const by = f.y + 6 - clamp(f.up, 0, 1) * 30; c.fillStyle = '#80e0ff'; for (let i = 0; i < 3; i++) c.fillRect(f.x - 6 + ((t * 30 + i * 4) % 12), by - 4 - i, 2, 2); }
      // sights
      if (out) { c.strokeStyle = '#f8f8f0c0'; c.beginPath(); c.arc(aimX, aimY, 6, 0, 7); c.moveTo(aimX - 9, aimY); c.lineTo(aimX - 3, aimY); c.moveTo(aimX + 3, aimY); c.lineTo(aimX + 9, aimY); c.moveTo(aimX, aimY - 9); c.lineTo(aimX, aimY - 3); c.moveTo(aimX, aimY + 3); c.lineTo(aimX, aimY + 9); c.stroke(); }
      if (flash > 0) { c.fillStyle = '#f8f0c040'; c.fillRect(0, 0, W, H); }
      if (hurtT > 0) { c.fillStyle = `rgba(200,0,0,${hurtT})`; c.fillRect(0, 0, W, H); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.fillStyle = '#000a'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = '#402020'; c.fillRect(4, 4, 40, 4); c.fillStyle = hp < 35 ? '#f84040' : '#58d870'; c.fillRect(4, 4, 40 * hp / 100, 4);
      for (let i = 0; i < 8; i++) { c.fillStyle = i < ammo ? '#e8c860' : '#40382c'; c.fillRect(50 + i * 3, 3, 2, 6); }
      c.fillStyle = watch >= 1 ? ((t * 4 | 0) % 2 ? '#80e0ff' : '#f8f8f0') : '#80e0ff'; c.fillRect(W - 44, 4, 30 * watch, 4); c.strokeStyle = '#80e0ff'; c.strokeRect(W - 44.5, 3.5, 31, 5);
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(String(kills), W - 4, 9);
      if (!out && ammo < 8) { c.textAlign = 'center'; c.fillStyle = '#e8c860'; c.fillText('RELOADING', W / 2, H - 10); }
      if (watch >= 1) { c.textAlign = 'center'; c.fillStyle = '#80e0ff'; c.fillText('SWIPE UP: STUN PULSE', W / 2, 22); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .5 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H * .5); }
    },
    down(x, y) { sw = { x, y, used: false }; out = true; aimX = x; aimY = y - 24; reloadT = 0; sfx(250, .03, 'square', .02); },
    move(x, y, p) { if (!p || !sw) return; aimX = clamp(x, 0, W); aimY = clamp(y - 24, 12, H - 30); if (!sw.used && sw.y - y > 40 && Math.abs(x - sw.x) < 30 && watch >= 1) { sw.used = true; self.pulse(); } },
    up() { out = false; sw = null; },
    pulse() { watch = 0; for (const f of foes) if (f.st !== 'down' && !f.guest) { f.stun = .8; kills++; } api.score(kills); flash = .3; haptic('success'); sfx(1400, .4, 'sine', .05, -1000); parts.push({ txt: 'STUN PULSE!', x: W / 2, y: H * .3, l: 1, col: '#80e0ff' }); },
    key(k, d) { if (k === ' ') { if (d) { out = true; } else out = false; } if (d && k === 'ArrowUp' && watch >= 1) self.pulse(); const st = { ArrowLeft: [-12, 0], ArrowRight: [12, 0] }[k]; if (d && st) aimX = clamp(aimX + st[0], 0, W); },
  };
  return self;
}

export default {
  id: 'agent-zero', title: 'Agent Zero', tag: 'Console · Spy', retro: true, era: 'console', pal: 'grape', w: 192, h: 160, maxW: 300, maxH: 240, goal: 60,
  hint: 'Hold to lean out from cover: your sights sit just above your finger and fire when they cross a henchman. Let go to duck, heal and reload. Henchmen flash before they shoot, so duck in time. Never hit the guests in white. Fill the watch bar, then swipe up for a stun pulse.',
  make,
};
