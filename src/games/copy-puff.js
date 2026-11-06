import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A round little puff walks right on its own. Tap the right side to jump, and keep tapping in the
// air to flap and float over gaps. Hold the left side to suck in the critter ahead; swallow a
// glowing one to copy its power for a while: SPARK (an electric ring), BLADE (a slashing dash) or
// ROCK (drop as a heavy stone that nothing can hurt). With a power, holding left uses it.
const GRAV = 520, JUMP = 185, FLAP = 125, FLAPS = 5;
const KINDS = {
  walker: { col: '#e88040', pow: null },
  sparky: { col: '#f8e040', pow: 'SPARK' },
  bladey: { col: '#a0c8f8', pow: 'BLADE' },
  stoney: { col: '#a09080', pow: 'ROCK' },
  bird: { col: '#e868a8', pow: null, fly: true },
};
const POWCOL = { SPARK: '#f8e040', BLADE: '#a0d0ff', ROCK: '#b0a090' };
let W = 176, H = 160;

function make(api) {
  let grounds, foes, spikes, stars, p, cam, genX, score, dist, t, hp, power, powT, using, inh, held, msg, parts, dead, ctl;
  const gy = () => H - 18, heroX = () => Math.min(80, W * .3);
  function gen(to) {
    const g = gy(), lvl = Math.min(1, dist / 3000);
    while (genX < to) {
      const gap = genX < 200 ? 0 : rnd(18, 30 + lvl * 26), seg = rnd(70, 170 - lvl * 40), lift = genX < 200 || Math.random() > .3 ? 0 : -rnd(8, 18);
      genX += gap; grounds.push({ x: genX, y: g + lift, w: seg });
      if (genX > 160) {
        const r = Math.random(), x = genX + rnd(20, seg - 20);
        if (r < .55) { const k = Math.random() < .3 ? 'walker' : ['sparky', 'bladey', 'stoney'][Math.random() * 3 | 0]; foes.push({ k, x, y: g + lift - 6, vx: -12 - lvl * 14, lo: genX + 2, hi: genX + seg - 2, alive: true, glow: Math.random() * 6 }); }
        else if (r < .75 && seg > 80) spikes.push({ x: genX + seg / 2 - 6, y: g + lift, w: 12 });
        if (Math.random() < .35 + lvl * .2) foes.push({ k: 'bird', x: genX + seg + rnd(0, 40), y: g - rnd(34, 60), y0: 0, vx: -22 - lvl * 16, alive: true, ph: rnd(0, 6) });
        if (Math.random() < .5) for (let i = 0; i < 3; i++) stars.push({ x: genX + gap * 0 - gap / 2 + i * 10 - 10, y: g - 26 - Math.sin(i / 2 * Math.PI) * 10, got: false });
      }
      genX += seg;
    }
  }
  function groundAt(x, y0, y1) { for (const s of grounds) if (x + 5 > s.x && x - 5 < s.x + s.w && y0 <= s.y + 1 && y1 >= s.y) return s; return null; }
  function hurt() {
    if (p.inv > 0 || (using && power === 'ROCK')) return;
    hp--; p.inv = 1.4; haptic('heavy'); sfx(150, .25, 'sawtooth', .05, -60);
    if (power) { msg = { txt: `LOST ${power}`, l: 1 }; power = null; using = false; }
    if (hp <= 0) { dead = .01; sfx(110, .7, 'square', .05, -50); }
  }
  function burst(x, y, col, n = 8) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-70, 70), vy: rnd(-90, 10), l: .45, col }); }
  function pop(txt, x, y, col = '#f8f8f0') { parts.push({ txt, x, y, l: .9, col }); }
  function kill(f, pts = 5) { f.alive = false; score += pts; burst(f.x, f.y, KINDS[f.k].col); pop(`+${pts}`, f.x, f.y - 10, '#f8e040'); sfx(700, .07, 'square', .04, 300); haptic('medium'); }
  const total = () => score + Math.floor(dist / 10);
  const self = {
    reset() {
      grounds = []; foes = []; spikes = []; stars = []; parts = []; genX = -60; score = 0; dist = 0; t = 0; hp = 4; power = null; powT = 0; using = false; inh = null; held = null; dead = 0; ctl = { pow: false };
      msg = { txt: 'RIGHT: JUMP  LEFT: INHALE', l: 2.5 };
      gen(W + 200); p = { x: 40, y: gy() - 6, vy: 0, ground: true, flaps: FLAPS, inv: 0, squash: 0 }; cam = 0;
    },
    resize(w, h) { const dy = h - H; W = w; H = h; if (grounds && dy) { for (const a of [grounds, spikes]) for (const s of a) s.y += dy; for (const a of [foes, stars]) for (const s of a) s.y += dy; p.y += dy; } },
    update(dt) {
      t += dt; for (const q of parts) { q.l -= dt; if (q.vx != null) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; } else q.y -= 18 * dt; } parts = parts.filter(q => q.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; p.vy += GRAV * dt; p.y += p.vy * dt; if (dead > 1.4) return api.over(); return; }
      p.inv = Math.max(0, p.inv - dt); p.squash = Math.max(0, p.squash - dt);
      if (power) { powT -= dt; if (powT <= 0) { msg = { txt: `${power} WORE OFF`, l: 1 }; power = null; using = false; } }
      using = !!power && ctl.pow;
      inh = !power && ctl.pow && !held ? (inh || { t: 0 }) : null; if (inh) inh.t += dt;
      // walk: stop while inhaling, crawl while sparking, dash with blade, rock stops dead
      let sp = 46 + Math.min(34, dist / 120);
      if (inh) sp = 0; else if (using && power === 'SPARK') sp *= .5; else if (using && power === 'BLADE') sp *= 2.6; else if (using && power === 'ROCK') sp = 0;
      p.x += sp * dt;
      // a raised step or the far side of a pit is a wall until you jump
      for (const s of grounds) if (p.x + 6 > s.x && p.x - 6 < s.x + 4 && p.y + 5 > s.y + 1) p.x = s.x - 6;
      dist = Math.max(dist, p.x);
      if (using && power === 'ROCK') { p.vy = Math.max(p.vy, 260); }
      p.vy += GRAV * dt; if (!p.ground && p.flaps < FLAPS && p.vy > 55 && !(using && power === 'ROCK')) p.vy = 55;
      const y0 = p.y; p.y += p.vy * dt; p.ground = false;
      if (p.vy >= 0) { const s = groundAt(p.x, y0 + 6, p.y + 6); if (s) { p.y = s.y - 6; if (p.vy > 200) { p.squash = .15; if (using && power === 'ROCK') { haptic('heavy'); sfx(90, .15, 'square', .05, -30); burst(p.x, s.y, '#b0a090', 6); } } p.vy = 0; p.ground = true; p.flaps = FLAPS; } }
      // walking into a raised step
      if (p.y > H + 20) { hurt(); if (!dead) { const s = grounds.find(s => s.x + s.w > p.x + 10) || grounds[grounds.length - 1]; p.x = Math.max(p.x, s.x + 8); p.y = s.y - 40; p.vy = 0; p.flaps = FLAPS; } }
      cam = p.x - heroX(); gen(cam + W + 200);
      grounds = grounds.filter(s => s.x + s.w > cam - 40); spikes = spikes.filter(s => s.x > cam - 40); stars = stars.filter(s => s.x > cam - 40 && !s.got);
      // inhale pulls critters in front
      if (inh && inh.t > .1) for (const f of foes) { if (!f.alive) continue; const dx = f.x - p.x, dy = f.y - p.y; if (dx > -4 && dx < 54 && Math.abs(dy) < 20 + dx * .2) { f.x -= (90 - dx) * dt; f.y -= dy * 3 * dt; f.pulled = true; if (dx < 9) { f.alive = false; held = f.k; haptic('medium'); sfx(300, .1, 'square', .04, -100); } } }
      for (const s of stars) if (!s.got && Math.abs(s.x - p.x) < 8 && Math.abs(s.y - p.y) < 9) { s.got = true; score += 2; sfx(1200, .05, 'square', .03, 200); }
      for (const f of foes) {
        if (!f.alive || f.x < cam - 40) continue;
        if (!f.pulled) { f.x += f.vx * dt; if (KINDS[f.k].fly) f.y += Math.sin(t * 3 + f.ph) * 22 * dt; else if (f.x < f.lo || f.x > f.hi) f.vx *= -1; }
        f.pulled = false;
        const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy);
        if (using && power === 'SPARK' && d < 26) { kill(f, 6); continue; }
        if (using && power === 'BLADE' && dx > -4 && dx < 22 && Math.abs(dy) < 12) { kill(f, 6); continue; }
        if (using && power === 'ROCK' && d < 12) { kill(f, 6); continue; }
        if (d < 10) { if (p.vy > 60 && dy > 3 && !KINDS[f.k].fly) { kill(f, 4); p.vy = -150; } else hurt(); }
      }
      foes = foes.filter(f => f.alive && f.x > cam - 60);
      for (const s of spikes) if (p.x + 4 > s.x && p.x - 4 < s.x + s.w && p.y + 6 > s.y - 5 && p.y < s.y) hurt();
      api.score(total());
    },
    draw(c) {
      const g = gy(), ox = -Math.round(cam);
      const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#80c8f8'); sky.addColorStop(1, '#d8f0ff'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) { const x = ((i * 97 - cam * .2) % (W + 60) + W + 60) % (W + 60) - 30, y = 14 + (i * 23) % 50; c.beginPath(); c.arc(x, y, 8, 0, 7); c.arc(x + 10, y + 2, 7, 0, 7); c.arc(x - 9, y + 3, 6, 0, 7); c.fill(); }
      c.fillStyle = '#90d080'; for (let i = 0; i < 5; i++) { const x = ((i * 130 - cam * .4) % (W + 140) + W + 140) % (W + 140) - 70; c.beginPath(); c.arc(x, g + 10, 50, Math.PI, 0); c.fill(); }
      for (const s of grounds) { const x = s.x + ox; if (x > W || x + s.w < 0) continue; c.fillStyle = '#c88850'; c.fillRect(x, s.y, s.w, H - s.y); c.fillStyle = '#58c048'; c.fillRect(x, s.y, s.w, 4); c.fillStyle = '#309028'; for (let i = 2; i < s.w; i += 8) c.fillRect(x + i, s.y + 4, 3, 2); c.fillStyle = '#a06838'; for (let i = 6; i < s.w; i += 14) c.fillRect(x + i, s.y + 10 + (i % 3) * 4, 3, 3); }
      c.fillStyle = '#b8b8c8'; for (const s of spikes) { const x = s.x + ox; for (let i = 0; i < s.w; i += 4) { c.beginPath(); c.moveTo(x + i, s.y); c.lineTo(x + i + 2, s.y - 6); c.lineTo(x + i + 4, s.y); c.fill(); } }
      for (const s of stars) { const x = s.x + ox; c.fillStyle = '#f8e040'; c.fillRect(x - 1, s.y - 3, 2, 6); c.fillRect(x - 3, s.y - 1, 6, 2); }
      for (const f of foes) {
        const x = Math.round(f.x + ox), y = Math.round(f.y), K = KINDS[f.k]; if (x < -20 || x > W + 20) continue;
        if (K.pow && (t * 4 + f.glow | 0) % 2) { c.fillStyle = POWCOL[K.pow] + '50'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
        c.fillStyle = K.col;
        if (f.k === 'bird') { c.fillRect(x - 4, y - 3, 8, 6); const w = (t * 8 | 0) % 2 ? -4 : 1; c.fillRect(x - 2, y + w, 6, 2); c.fillStyle = '#f8a020'; c.fillRect(x - 6, y - 1, 2, 2); }
        else if (f.k === 'stoney') { c.fillRect(x - 6, y - 6, 12, 12); c.fillStyle = '#787060'; c.fillRect(x - 6, y + 4, 12, 2); c.fillRect(x + 2, y - 4, 3, 2); }
        else if (f.k === 'bladey') { c.fillRect(x - 5, y - 5, 10, 11); c.fillStyle = '#e8f0ff'; c.fillRect(x - 9, y - 2, 4, 2); c.fillRect(x - 10, y - 4, 2, 6); }
        else if (f.k === 'sparky') { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = '#fff8c0'; for (let i = 0; i < 4; i++) { const a = t * 6 + i * 1.57; c.fillRect(x + Math.cos(a) * 8 - 1, y + Math.sin(a) * 8 - 1, 2, 2); } }
        else { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = '#804018'; c.fillRect(x - 5, y + 4, 4, 2); c.fillRect(x + 1, y + 4, 4, 2); }
        c.fillStyle = '#202020'; if (f.k !== 'bird') { c.fillRect(x - 3, y - 2, 2, 3); c.fillRect(x + 1, y - 2, 2, 3); } else c.fillRect(x - 3, y - 2, 1, 1);
      }
      // hero
      const hx = Math.round(p.x + ox), hy = Math.round(p.y);
      if (!(p.inv > 0 && (t * 16 | 0) % 2)) {
        if (inh && inh.t > .1) { c.fillStyle = '#ffffff60'; for (let i = 0; i < 4; i++) { const k = ((t * 3 + i / 4) % 1); c.fillRect(hx + 50 - k * 44, hy - 10 + (i * 7) % 20, 6 * (1 - k) + 2, 1); } }
        if (using && power === 'SPARK') { c.strokeStyle = (t * 20 | 0) % 2 ? '#f8e040' : '#ffffff'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283, r = 20 + ((i + (t * 30 | 0)) % 2) * 5; c.lineTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r); } c.stroke(); }
        if (using && power === 'BLADE') { c.fillStyle = '#e8f4ff'; c.beginPath(); c.arc(hx + 8, hy, 14, -1.1, 1.1); c.arc(hx + 6, hy, 9, 1.1, -1.1, true); c.fill(); }
        if (using && power === 'ROCK') { c.fillStyle = '#9a8a78'; c.beginPath(); c.moveTo(hx - 8, hy + 6); c.lineTo(hx - 7, hy - 5); c.lineTo(hx, hy - 9); c.lineTo(hx + 7, hy - 5); c.lineTo(hx + 8, hy + 6); c.fill(); c.fillStyle = '#c0b0a0'; c.fillRect(hx - 4, hy - 5, 4, 2); }
        else {
          const sq = p.squash > 0 ? 2 : 0, full = held ? 2 : 0, puffed = !p.ground && p.flaps < FLAPS ? 2 : 0, rx = 6 + sq + full + puffed, ry = 6 - sq + full + puffed;
          c.fillStyle = '#f8a8c8'; c.beginPath(); c.ellipse(hx, hy + sq, rx, ry, 0, 0, 7); c.fill();
          c.fillStyle = '#ffd8e8'; c.fillRect(hx - 3, hy - ry + 2, 3, 2);
          c.fillStyle = '#d02050'; c.fillRect(hx - 5, hy + ry - 2 + sq, 4, 2); c.fillRect(hx + 2, hy + ry - 2 + sq, 4, 2);
          c.fillStyle = '#202040'; c.fillRect(hx + 1, hy - 3, 1, 3); c.fillRect(hx + 4, hy - 3, 1, 3);
          if (inh) { c.fillStyle = '#802040'; c.beginPath(); c.arc(hx + rx - 2, hy + 1, 2.5, 0, 7); c.fill(); }
          if (power) { c.fillStyle = POWCOL[power]; c.fillRect(hx - 5, hy - ry - 3, 10, 2); }
        }
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const q of parts) { const x = q.x + ox; if (q.txt) { c.fillStyle = '#203040'; c.fillText(q.txt, x + 1, q.y + 1); c.fillStyle = q.col; c.fillText(q.txt, x, q.y); } else { c.fillStyle = q.col; c.fillRect(x - 1, q.y - 1, 2, 2); } }
      // HUD
      c.fillStyle = '#20304080'; c.fillRect(0, 0, W, 12);
      for (let i = 0; i < 4; i++) { c.fillStyle = i < hp ? '#f85878' : '#405060'; c.fillRect(4 + i * 8, 3, 6, 6); }
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(String(total()), W - 4, 9);
      if (power) { c.textAlign = 'center'; c.fillStyle = POWCOL[power]; c.fillText(power, W / 2, 9); c.fillRect(W / 2 - 16, 10, 32 * powT / 18, 1); }
      else if (held) { c.textAlign = 'center'; c.fillStyle = '#f8f8f0'; c.fillText('LET GO: SWALLOW', W / 2, 9); }
      for (let i = 0; i < FLAPS; i++) if (!p.ground) { c.fillStyle = i < p.flaps ? '#ffffff' : '#ffffff30'; c.fillRect(hx - 9 + i * 4, hy - 16, 2, 2); }
      if (t < 8) { c.globalAlpha = .55; c.fillStyle = '#203040'; c.fillRect(2, H - 12, 56, 10); c.fillRect(W - 46, H - 12, 44, 10); c.globalAlpha = 1; c.fillStyle = '#f8f8f0'; c.textAlign = 'left'; c.fillText(power ? 'HOLD:POWER' : 'HOLD:SUCK', 4, H - 5); c.textAlign = 'right'; c.fillText('TAP:JUMP', W - 4, H - 5); }
      if (msg) { c.textAlign = 'center'; const w = Math.min(W - 8, msg.txt.length * 6 + 10); c.fillStyle = '#203040c0'; c.fillRect(W / 2 - w / 2, H / 2 - 30, w, 12); c.fillStyle = '#f8f8f0'; c.fillText(msg.txt, W / 2, H / 2 - 22); }
    },
    down(x) {
      if (dead) return;
      if (x < W * .45) { ctl.pow = true; return; }
      if (p.ground) { p.vy = -JUMP; p.ground = false; sfx(500, .07, 'square', .04, 300); haptic('light'); }
      else if (p.flaps > 0) { p.flaps--; p.vy = -FLAP; sfx(620, .05, 'square', .03, 200); haptic('tick'); }
    },
    move() {},
    up(x) {
      if (ctl.pow) {
        ctl.pow = false;
        if (held) { const pow = KINDS[held].pow; if (pow) { power = pow; powT = 18; msg = { txt: `GOT ${pow}!`, l: 1.2 }; haptic('success'); sfx(900, .3, 'square', .05, 600); } else { score += 5; pop('+5', p.x, p.y - 12, '#f8e040'); sfx(400, .1, 'square', .04, -100); } held = null; }
      }
    },
    key(k, d) { if (k === 'x' || k === 'z' || k === 'Shift') { if (d) self.down(0); else self.up(0); } else if ((k === ' ' || k === 'ArrowUp') && d) self.down(W); },
  };
  return self;
}

export default {
  id: 'copy-puff', title: 'Copy Puff', tag: 'Advance · Platformer', retro: true, era: 'advance', pal: 'berry', w: 176, h: 160, maxW: 300, maxH: 240, goal: 150,
  hint: 'The puff walks on its own. Tap the right side to jump, and keep tapping in the air to flap over gaps (watch the flap dots). Hold the left side to suck in the critter ahead, then let go to swallow it. Glowing critters give you their power for a while: SPARK ring, BLADE dash or ROCK drop. With a power, hold left to use it.',
  make,
};
