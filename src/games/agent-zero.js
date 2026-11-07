import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

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
      const pal = [['#3a1c2c', '#5a2c40', '#c8a050'], ['#1c2a3a', '#2c4058', '#a0b0c0'], ['#101830', '#202c50', '#f8d070']][scene];
      c.fillStyle = pal[0]; c.fillRect(0, 0, W, H);
      if (scene === 2) { c.fillStyle = '#f8f0c0'; for (let i = 0; i < 20; i++) c.fillRect((i * 37) % W, (i * 23) % (H * .3), 1, 1); c.fillStyle = '#304068'; for (let i = 0; i < 6; i++) c.fillRect(i * W / 6, H * .22 - (i % 3) * 8, W / 6 - 4, H); }
      c.fillStyle = pal[1]; for (const [sx, sy] of SPOTS) c.fillRect(sx * W - 12, sy * H - 22, 24, 30);
      c.fillStyle = pal[2]; for (const [sx, sy] of SPOTS) c.fillRect(sx * W - 13, sy * H + 6, 26, 3);
      if (scene === 0) { c.fillStyle = '#f8e8a0'; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(W * (.25 + i * .25), 8, 5, 0, 7); c.fill(); } }
      for (const f of foes) {
        const x = Math.round(f.x), y = Math.round(f.y), u = clamp(f.up, 0, 1);
        c.save(); c.beginPath(); c.rect(x - 14, y - 26, 28, 32); c.clip();
        const by = y + 6 - u * 30;
        c.fillStyle = f.flash > 0 ? '#ffffff' : f.guest ? '#f0f0e8' : '#202028'; c.fillRect(x - 6, by + 8, 12, 16);
        c.fillStyle = f.guest ? '#e0a0c0' : '#f8f8f0'; c.fillRect(x - 2, by + 8, 4, 6); if (!f.guest) { c.fillStyle = '#c02030'; c.fillRect(x - 1, by + 9, 2, 2); }
        c.fillStyle = '#e8b890'; c.fillRect(x - 4, by, 8, 8); c.fillStyle = f.guest ? '#c09030' : '#303030'; c.fillRect(x - 4, by - 1, 8, 3);
        if (!f.guest && f.st === 'aim' && f.t > f.aimT - warn() && !f.stun) { c.fillStyle = (t * 16 | 0) % 2 ? '#f84040' : '#f8f040'; c.fillRect(x + 6, by + 12, 6, 2); }
        if (f.stun > 0) { c.fillStyle = '#80e0ff'; c.fillRect(x - 6 + (t * 30 % 12), by - 4, 2, 2); }
        c.restore();
      }
      // counter (cover) and agent
      c.fillStyle = '#e8e0d0'; c.fillRect(0, H - 30, W, 30); c.fillStyle = '#c8c0b0'; c.fillRect(0, H - 30, W, 3); c.fillStyle = '#a8a090'; for (let i = 0; i < W; i += 24) c.fillRect(i, H - 26, 1, 26);
      const ax = W * .5, ay = out ? H - 44 : H - 26;
      c.fillStyle = '#18181c'; c.fillRect(ax - 7, ay + 4, 14, 14); c.fillStyle = '#f8f8f0'; c.fillRect(ax - 2, ay + 4, 4, 6); c.fillStyle = '#18181c'; c.fillRect(ax - 1, ay + 5, 2, 2);
      c.fillStyle = '#e8b890'; c.fillRect(ax - 4, ay - 4, 8, 8); c.fillStyle = '#382418'; c.fillRect(ax - 4, ay - 5, 8, 3);
      if (out) { c.strokeStyle = '#18181c'; c.lineWidth = 2; c.beginPath(); c.moveTo(ax + 4, ay + 8); c.lineTo(ax + (aimX - ax) * .12, ay + (aimY - ay) * .12); c.stroke(); c.lineWidth = 1; }
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
