import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A side-scrolling platformer. Floating ledges can be jumped through from below. Drag left or right to run, flick up (or tap) to jump. Grab coins,
// bounce on bugs, hop the gaps and spikes, and reach the flag at the end of each stage.
const G = 640, JUMP = 250, RUN = 82;
let W = 160, H = 160;

function make(api) {
  let solids, coins, bugs, spikes, flagX, p, cam, stage, score, t, ctl, msg, dead, parts;
  const gy = () => H - 16;
  function build() {
    solids = []; coins = []; bugs = []; spikes = []; const g = gy(), len = 1300 + stage * 300;
    let x = -40; solids.push({ x, y: g, w: 220, h: 40 }); x += 220;
    while (x < len) {
      const gap = rnd(20, 28 + Math.min(18, stage * 4)), seg = rnd(60, 170);
      if (Math.random() < .55) { const py = g - rnd(26, 40), pw = rnd(28, 52); solids.push({ x: x + gap / 2 - pw / 2 + 10, y: py, w: pw, h: 8, float: true }); for (let i = 0; i < 3; i++) coins.push({ x: x + gap / 2 + i * 10, y: py - 10 }); }
      else for (let i = 0; i < 3; i++) coins.push({ x: x + gap / 2 - 10 + i * 10, y: g - 20 - Math.sin(i / 2 * Math.PI) * 14 });
      x += gap; const lift = Math.random() < .3 ? -rnd(8, 16) : 0;
      solids.push({ x, y: g + lift, w: seg, h: 40 - lift });
      const r = Math.random();
      if (r < .45 && seg > 70) bugs.push({ x: x + seg / 2, y: g + lift - 8, vx: -22 - stage * 3, lo: x + 2, hi: x + seg - 10, alive: true });
      else if (r < .7 && seg > 60) spikes.push({ x: x + seg / 2 - 6, y: g + lift - 5, w: 12 });
      if (Math.random() < .4) { const by = g + lift - rnd(30, 40), bw = rnd(24, 40); solids.push({ x: x + rnd(0, seg - bw), y: by, w: bw, h: 8, float: true }); }
      x += seg;
    }
    solids.push({ x, y: g, w: 260, h: 40 }); flagX = x + 120;
    p = { x: 20, y: g - 12, vx: 0, vy: 0, ground: true, face: 1 }; cam = 0;
  }
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function jump() { if (!p.ground || dead) return; p.vy = -JUMP; p.ground = false; haptic('light'); sfx(420, .08, 'square', .04, 400); }
  function die() { if (dead) return; dead = .9; p.vy = -200; haptic('error'); sfx(300, .5, 'square', .05, -250); }
  const self = {
    reset() { stage = 1; score = 0; t = 0; ctl = null; msg = null; dead = 0; parts = []; build(); },
    resize(w, h) { const d = h - H; W = w; H = h; if (solids) { for (const s of solids) s.y += d; for (const o of [...coins, ...bugs, ...spikes]) o.y += d; p.y += d; } },
    update(dt) {
      t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      for (const q of parts) { q.y += q.vy * dt; q.vy += 200 * dt; q.l -= dt; } parts = parts.filter(q => q.l > 0);
      if (dead) { p.vy += G * dt; p.y += p.vy * dt; dead -= dt; if (dead <= 0) return api.over(); return; }
      const dir = ctl ? ctl.dir : self.kdir || 0; const target = dir * RUN;
      p.vx += (target - p.vx) * Math.min(1, dt * (p.ground ? 12 : 5)); if (dir) p.face = dir;
      p.vy = Math.min(400, p.vy + G * dt * (p.vy < 0 && !(ctl && ctl.hold) && !self.khold ? 1.8 : 1));
      const box = { x: p.x + p.vx * dt, y: p.y, w: 8, h: 11 };
      for (const s of solids) if (!s.float && hit(box, s)) { box.x = p.vx > 0 ? s.x - 8 : s.x + s.w; p.vx = 0; }
      p.x = Math.max(cam, box.x); box.y = p.y + p.vy * dt; p.ground = false;
      for (const s of solids) if (hit(box, s)) { if (s.float && (p.vy < 0 || p.y + 11 > s.y + .5)) continue; if (p.vy >= 0) { box.y = s.y - 11; p.ground = true; } else box.y = s.y + s.h; p.vy = 0; }
      p.y = box.y;
      if (p.y > H + 10) return die();
      const me = { x: p.x, y: p.y, w: 8, h: 11 };
      for (const c of coins) if (!c.got && Math.abs(c.x - p.x - 4) < 7 && Math.abs(c.y - p.y - 5) < 8) { c.got = true; score++; api.score(score); sfx(1300, .06, 'square', .03, 300); haptic('tick'); }
      for (const s of spikes) if (hit(me, { x: s.x + 2, y: s.y + 1, w: s.w - 4, h: 4 })) return die();
      for (const b of bugs) {
        if (!b.alive) continue; b.x += b.vx * dt; if (b.x < b.lo || b.x > b.hi) { b.vx *= -1; b.x = clamp(b.x, b.lo, b.hi); }
        if (hit(me, { x: b.x, y: b.y, w: 8, h: 8 })) {
          if (p.vy > 0 && p.y + 11 - b.y < 6) { b.alive = false; p.vy = -JUMP * .75; score += 2; api.score(score); haptic('medium'); sfx(700, .1, 'square', .04, -300); for (let i = 0; i < 5; i++) parts.push({ x: b.x + rnd(0, 8), y: b.y + 4, vy: rnd(-80, -20), l: .5 }); }
          else return die();
        }
      }
      if (p.x > flagX - 4) { stage++; score += 5; api.score(score); msg = { txt: `STAGE ${stage}`, l: 1.5 }; haptic('success'); sfx(880, .4, 'square', .05, 600); build(); return; }
      cam = Math.max(cam, Math.min(p.x - W * .4, flagX + 60 - W));
    },
    fx(dt) { for (const q of parts) { q.y += q.vy * dt; q.l -= dt; } },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#78c8f8'); g.addColorStop(1, '#d8f0f8'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { const x = ((i * 90 - cam * .2) % (W + 90) + W + 90) % (W + 90) - 40, y = 16 + (i % 3) * 14; c.fillRect(x, y, 26, 6); c.fillRect(x + 6, y - 4, 13, 4); }
      for (let x = 0; x < W; x += 2) { const wx = x + cam * .4, hh = 26 + Math.sin(wx * .03) * 12 + Math.sin(wx * .011) * 8; c.fillStyle = '#88c870'; c.fillRect(x, gy() - hh, 2, hh); }
      c.save(); c.translate(-Math.round(cam), 0);
      for (const s of solids) { if (s.x > cam + W || s.x + s.w < cam) continue;
        if (s.float) { c.fillStyle = '#c06830'; c.fillRect(s.x, s.y, s.w, s.h); c.fillStyle = '#e09050'; for (let x = s.x; x < s.x + s.w; x += 8) c.fillRect(x, s.y, 7, 3); c.fillStyle = '#803818'; c.fillRect(s.x, s.y + s.h - 1, s.w, 1); }
        else { c.fillStyle = '#a06838'; c.fillRect(s.x, s.y, s.w, s.h); c.fillStyle = '#885028'; for (let y = s.y + 8; y < s.y + s.h; y += 6) for (let x = s.x + ((y / 6 | 0) % 2) * 4; x < s.x + s.w; x += 9) c.fillRect(x, y, 2, 2); c.fillStyle = '#48b838'; c.fillRect(s.x, s.y, s.w, 4); c.fillStyle = '#78e058'; c.fillRect(s.x, s.y, s.w, 1); }
      }
      for (const s of spikes) { c.fillStyle = '#d0d0e0'; for (let i = 0; i < s.w; i += 4) { c.fillRect(s.x + i + 1, s.y + 1, 2, 4); c.fillRect(s.x + i + 1.5 | 0, s.y, 1, 1); } }
      for (const k of coins) { if (k.got) continue; const w = Math.max(1, Math.abs(Math.cos(t * 5 + k.x)) * 5 | 0); c.fillStyle = '#f8c838'; c.fillRect(k.x - w / 2 | 0, k.y - 3, w, 7); c.fillStyle = '#fff0a0'; c.fillRect(k.x - w / 2 | 0, k.y - 3, 1, 3); }
      for (const b of bugs) { if (!b.alive) continue; const x = Math.round(b.x), y = Math.round(b.y), s = (t * 8 | 0) % 2; c.fillStyle = '#8848c8'; c.fillRect(x, y + 1, 8, 6); c.fillStyle = '#b078f0'; c.fillRect(x + 1, y, 6, 2); c.fillStyle = '#f8f8f0'; c.fillRect(x + (b.vx < 0 ? 1 : 5), y + 2, 2, 2); c.fillStyle = '#101018'; c.fillRect(x + (b.vx < 0 ? 1 : 6), y + 3, 1, 1); c.fillRect(x + 1 + s, y + 7, 2, 1); c.fillRect(x + 5 - s, y + 7, 2, 1); }
      // flag
      c.fillStyle = '#e8e8f0'; c.fillRect(flagX, gy() - 50, 2, 50); c.fillStyle = '#e04040'; c.fillRect(flagX + 2, gy() - 50 + Math.round(Math.sin(t * 6)), 12, 8); c.fillStyle = '#f8d838'; c.fillRect(flagX - 1, gy() - 53, 4, 3);
      // hero: a kid in a teal cap and red scarf
      const x = Math.round(p.x), y = Math.round(p.y), run = p.ground && Math.abs(p.vx) > 10 ? (t * 12 | 0) % 2 : 0, f = p.face;
      c.fillStyle = '#20a0a0'; c.fillRect(x, y, 8, 3); c.fillRect(f > 0 ? x + 5 : x - 2, y + 2, 5, 1);
      c.fillStyle = '#f8d0a8'; c.fillRect(x + 1, y + 3, 6, 3); c.fillStyle = '#101018'; c.fillRect(f > 0 ? x + 5 : x + 2, y + 4, 1, 1);
      c.fillStyle = '#e04040'; c.fillRect(x + 1, y + 6, 6, 1); c.fillStyle = '#f8f8f0'; c.fillRect(x + 1, y + 7, 6, 2);
      c.fillStyle = '#3858d8'; c.fillRect(x + 1 + run, y + 9, 2, 2); c.fillRect(x + 5 - run, y + 9, 2, 2);
      for (const q of parts) { c.fillStyle = '#b078f0'; c.fillRect(q.x | 0, q.y | 0, 2, 2); }
      c.restore();
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#101018'; c.fillText(`ST${stage}`, 3, 9);
      const prog = clamp(p.x / flagX, 0, 1); c.fillStyle = '#ffffff80'; c.fillRect(W - 44, 4, 40, 3); c.fillStyle = '#e04040'; c.fillRect(W - 44 + 38 * prog, 3, 2, 5);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(msg.txt, W / 2, H * .35); }
      if (t < 5 && stage === 1) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText('DRAG: RUN  FLICK UP: JUMP', W / 2, 22); }
    },
    down(x, y) { ctl = { sx: x, ay: y, dir: 0, hold: true, t: t, moved: false }; },
    move(x, y, pr) {
      if (!pr || !ctl) return; const dx = x - ctl.sx;
      if (Math.abs(dx) > 6) { ctl.dir = Math.sign(dx); ctl.moved = true; if (Math.abs(dx) > 30) ctl.sx = x - Math.sign(dx) * 30; } else if (Math.abs(dx) < 3) ctl.dir = 0;
      if (ctl.ay - y > 12) { jump(); ctl.ay = y; ctl.moved = true; } else if (y > ctl.ay) ctl.ay = y;
    },
    up() { if (ctl && !ctl.moved && t - ctl.t < .3) jump(); ctl = null; },
    key(k, d) {
      if (k === 'ArrowLeft' || k === 'ArrowRight') self.kdir = d ? (k === 'ArrowLeft' ? -1 : 1) : 0;
      if (k === ' ' || k === 'ArrowUp') { self.khold = d; if (d) jump(); }
    },
  };
  return self;
}

export default {
  id: 'hop-quest', title: 'Hop Quest', tag: 'Advance · Platformer', retro: true, era: 'advance', pal: 'teal', w: 160, h: 160, maxW: 260, maxH: 240, goal: 30,
  hint: 'Drag left or right to run. Flick up while dragging, or tap, to jump. Bounce on bugs, dodge spikes and gaps, grab coins and reach the flag.',
  make,
};
