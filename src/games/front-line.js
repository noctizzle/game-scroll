import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { box, ball, glow, shadow } from '../kit/gfx.js';

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
      // sea at the bottom, sand, the bluff and the bunker on top
      const sand = c.createLinearGradient(0, 0, 0, H); sand.addColorStop(0, '#6a6450'); sand.addColorStop(.25, '#a89a78'); sand.addColorStop(1, '#c8b890'); c.fillStyle = sand; c.fillRect(0, 0, W, H);
      c.fillStyle = '#58687a'; c.fillRect(0, H - 10, W, 10); c.fillStyle = '#8898a8'; for (let x = (t * 10) % 16 - 16; x < W; x += 16) c.fillRect(x, H - 10, 8, 1);
      c.fillStyle = '#4a4636'; c.fillRect(0, 0, W, 46); box(c, W / 2 - 30, 14, 60, 28, '#7a7868', { r: 4 });
      c.fillStyle = guns.length ? '#101010' : '#402010'; c.fillRect(W / 2 - 14, 26, 28, 7);
      for (const g of guns) { if (g.x !== W / 2) { box(c, g.x - 12, 22, 24, 16, '#6a6858', { r: 3 }); c.fillStyle = '#101010'; c.fillRect(g.x - 7, 28, 14, 5); } }
      // sweeping fire
      for (const g of guns) {
        const L = H * 1.3, a0 = g.a - half(), a1 = g.a + half();
        c.fillStyle = g.pause > 0 ? 'rgba(248,200,80,.12)' : 'rgba(248,80,40,.2)'; c.beginPath(); c.moveTo(g.x, bunkerY); c.lineTo(g.x + Math.sin(a0) * L, bunkerY + Math.cos(a0) * L); c.lineTo(g.x + Math.sin(a1) * L, bunkerY + Math.cos(a1) * L); c.fill();
        if (g.pause <= 0) { glow(c, g.x, bunkerY, 10 + Math.random() * 4, '#f8c060', .7); c.fillStyle = '#f8e080'; for (let i = 0; i < 6; i++) { const d = ((t * 400 + i * 47) % L); c.fillRect(g.x + Math.sin(g.a) * d, bunkerY + Math.cos(g.a) * d, 2, 2); } }
      }
      // covers
      const reach = run ? [] : covers.filter(cv => cv !== at && Math.hypot(cv.x - at.x, cv.y - at.y) < 95 && cv.y <= at.y + 4);
      for (const cv of covers) {
        if (cv.kind === 'start') { c.fillStyle = '#505848'; c.fillRect(cv.x - 18, cv.y - 4, 36, 10); continue; }
        if (reach.includes(cv)) { c.strokeStyle = '#f8f8f0' + ((t * 3 | 0) % 2 ? 'c0' : '60'); c.beginPath(); c.arc(cv.x, cv.y, 14, 0, 7); c.stroke(); }
        if (cv.kind === 'hedge') { c.strokeStyle = '#383838'; c.lineWidth = 3; c.beginPath(); c.moveTo(cv.x - 9, cv.y + 5); c.lineTo(cv.x + 9, cv.y - 5); c.moveTo(cv.x + 9, cv.y + 5); c.lineTo(cv.x - 9, cv.y - 5); c.moveTo(cv.x, cv.y - 8); c.lineTo(cv.x, cv.y + 6); c.stroke(); c.lineWidth = 1; }
        else { shadow(c, cv.x + 2, cv.y + 5, 14, 3); box(c, cv.x - 12, cv.y - 3, 24, 8, '#8a7a58', { r: 3, drop: false }); box(c, cv.x - 10, cv.y - 7, 20, 5, '#a89670', { r: 2, drop: false }); }
        if (cv.med) { c.fillStyle = '#f8f8f0'; c.fillRect(cv.x + 8, cv.y - 12, 7, 7); c.fillStyle = '#e03030'; c.fillRect(cv.x + 11, cv.y - 11, 1, 5); c.fillRect(cv.x + 9, cv.y - 9, 5, 1); }
      }
      // you
      const x = px(), y = py(); if (!(inv > 0 && (t * 12 | 0) % 2)) { shadow(c, x + 1, y + 1, 5, 2); c.fillStyle = '#4a5a30'; c.fillRect(x - 3, y - 9 + (run ? 0 : 3), 6, run ? 9 : 6); c.fillStyle = '#5a6a3a'; c.beginPath(); c.arc(x, y - 10 + (run ? 0 : 3), 3.5, Math.PI, 0); c.fill(); }
      if (flick) { c.strokeStyle = '#f8f8f080'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, y); const tg = aim(flick); c.lineTo(tg.x, tg.y); c.stroke(); c.setLineDash([]); c.strokeStyle = '#f8e04880'; c.beginPath(); c.arc(tg.x, tg.y, 6, 0, 7); c.stroke(); }
      if (nade) { c.fillStyle = '#00000040'; c.fillRect(nade.x - 2, nade.y, 4, 2); ball(c, nade.x, nade.y - nade.z, 3, '#3a5028'); }
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
