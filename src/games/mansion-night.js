import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { box, ball, shadow, glow, shade } from '../kit/gfx.js';

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
      c.fillStyle = '#0c0a10'; c.fillRect(0, 0, W, H);
      // corridor
      const fl = proj(-1, 1.2), fr = proj(1, 1.2), nl = proj(-1, 0), nr = proj(1, 0);
      { const g = c.createLinearGradient(0, fl.y, 0, H); g.addColorStop(0, '#1a1414'); g.addColorStop(1, '#4a3430'); c.fillStyle = g; } c.beginPath(); c.moveTo(fl.x, fl.y); c.lineTo(fr.x, fr.y); c.lineTo(W, H); c.lineTo(0, H); c.fill();
      { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#30243c'); g.addColorStop(.5, '#120c18'); g.addColorStop(1, '#30243c'); c.fillStyle = g; } c.beginPath(); c.moveTo(0, 0); c.lineTo(fl.x, fl.y - (fl.y - hor()) - 40 * fl.s); c.lineTo(fl.x, fl.y); c.lineTo(0, H); c.fill(); c.beginPath(); c.moveTo(W, 0); c.lineTo(fr.x, fr.y - (fr.y - hor()) - 40 * fr.s); c.lineTo(fr.x, fr.y); c.lineTo(W, H); c.fill();
      c.fillStyle = '#181020'; c.fillRect(fl.x, hor() - 40 * fl.s - 20, fr.x - fl.x, fl.y - hor() + 40 * fl.s + 20);
      const dp = proj(0, 1.2); box(c, dp.x - 10 * dp.s * 1.5, dp.y - 34 * dp.s * 1.5, 20 * dp.s * 1.5, 34 * dp.s * 1.5, doorT > 0 ? '#c8a060' : '#4a3020', { r: 1, drop: false }); if (doorT > 0) glow(c, dp.x, dp.y - 17 * dp.s * 1.5, 30 * dp.s * 1.5, '#f8d080', .5);
      for (let z = 0; z < 1.2; z += .2) { const a = proj(-1, z), b = proj(1, z); c.fillStyle = '#3a2a28'; c.fillRect(a.x, a.y, b.x - a.x, 1); }
      // items
      for (const it of items) { const p = proj(it.x, it.z), s = p.s * 14; shadow(c, p.x, p.y, s * .6, s * .18, .4); if (it.k === 'ammo') { box(c, p.x - s / 2, p.y - s * .6, s, s * .6, '#806838', { r: s * .08, drop: false }); c.fillStyle = '#d8b860'; c.fillRect(p.x - s / 2, p.y - s * .6, s, s * .15); } else { ball(c, p.x, p.y - s * .4, s * .4, '#40a040'); c.fillStyle = '#c0f0c0'; c.fillRect(p.x - 1, p.y - s * .8, 2, s * .4); } }
      // creatures, far first
      for (const f of [...foes].sort((a, b) => b.z - a.z)) {
        const p = proj(f.x, f.z), s = p.s * 2.6, w = f.w * s, h = f.h * s, sway = Math.sin(t * 3 + f.ph) * 2 * s, al = f.dead ? 1 - f.dead / .6 : 1;
        c.globalAlpha = al; shadow(c, p.x, p.y, w * .7, w * .18, .5); { const g = c.createLinearGradient(p.x - w, 0, p.x + w, 0), base = f.flash > 0 ? '#f8f8f8' : f.col; g.addColorStop(0, shade(base, .25)); g.addColorStop(1, shade(base, -.45)); c.fillStyle = g; }
        if (f.low) { c.fillRect(p.x - w / 2, p.y - h, w, h); c.fillRect(p.x - w / 2 - 3 * s, p.y - 3 * s, 3 * s, 3 * s); c.fillStyle = '#f8e040'; c.fillRect(p.x - w / 2 + 2 * s, p.y - h + 2 * s, 2 * s, 2 * s); }
        else if (f.k === 'hound') { c.fillRect(p.x - w / 2, p.y - h, w, h * .6); c.fillRect(p.x - w / 2 - 4 * s, p.y - h - 3 * s, 6 * s, 6 * s); c.fillRect(p.x - w / 2, p.y - h * .4, 2 * s, h * .4); c.fillRect(p.x + w / 2 - 2 * s, p.y - h * .4, 2 * s, h * .4); c.fillStyle = '#f84040'; c.fillRect(p.x - w / 2 - 3 * s, p.y - h - 2 * s, 1.5 * s, 1.5 * s); }
        else { c.fillRect(p.x - w / 2 + sway, p.y - h, w, h * .75); c.fillRect(p.x - w * .35, p.y - h * .25, w * .25, h * .25); c.fillRect(p.x + w * .1, p.y - h * .25, w * .25, h * .25);
          c.fillRect(p.x - w * .3 + sway, p.y - h - w * .55, w * .6, w * .6); c.fillRect(p.x - w / 2 - 3 * s + sway, p.y - h * .85, 3 * s, h * .4); c.fillRect(p.x + w / 2 + sway, p.y - h * .85, 3 * s, h * .4);
          c.fillStyle = '#f8e040'; c.fillRect(p.x - w * .2 + sway, p.y - h - w * .35, 1.5 * s, 1.5 * s); c.fillRect(p.x + w * .08 + sway, p.y - h - w * .35, 1.5 * s, 1.5 * s); glow(c, p.x + sway, p.y - h - w * .3, w * .5, '#f8e040', .25); }
        c.globalAlpha = 1;
      }
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
