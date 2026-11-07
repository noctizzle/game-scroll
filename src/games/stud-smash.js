import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { backdrop, glow } from '../kit/gfx.js';
import { brick, stud, BRICK_KEYS } from '../kit/bricks.js';

// Smash the brick-built town square into studs. Hold to walk toward your finger, tap to whack the
// nearest thing. Lamps, crates, bins and benches burst into studs; walk near studs to pull them
// in. Gold things drop gold studs. Wind-up robots wander about: whack them before they bump you,
// or you'll spill studs. Fill the HERO bar before the clock runs out to open the next square.
const KINDS = [
  { k: 'crate', w: 14, h: 14, hp: 1, col: 'tan', studs: 4 },
  { k: 'lamp', w: 6, h: 24, hp: 2, col: 'black', studs: 5 },
  { k: 'bin', w: 10, h: 12, hp: 1, col: 'green', studs: 3 },
  { k: 'bench', w: 22, h: 8, hp: 2, col: 'orange', studs: 6 },
  { k: 'plant', w: 12, h: 14, hp: 1, col: 'green', studs: 4 },
  { k: 'statue', w: 14, h: 22, hp: 3, col: 'yellow', studs: 6, gold: true },
];
let W = 176, H = 192;

function make(api) {
  let pl, things, studs, bots, total, bank, target, time, square, t, hold, tapStart, parts, msg, dead, swing, bump, cleared;
  const top = 14;
  function free(w, h) { for (let i = 0; i < 60; i++) { const x = rnd(8, W - w - 8), y = rnd(top + 14, H - h - 8); if (Math.hypot(x + w / 2 - pl.x, y + h / 2 - pl.y) > 26 && !things.some(o => x < o.x + o.w + 4 && x + w + 4 > o.x && y < o.y + o.h + 4 && y + h + 4 > o.y)) return { x, y }; } return null; }
  function build() {
    things = []; studs = []; bots = [];
    const n = 10 + Math.min(8, square * 2);
    for (let i = 0; i < n; i++) { const K = KINDS[Math.random() < .12 ? 5 : Math.random() * 5 | 0]; const p = free(K.w, K.h); if (p) things.push({ ...K, ...p, hit: 0, col: K.k === 'crate' || K.k === 'bin' ? K.col : K.gold ? 'yellow' : K.k === 'plant' ? 'green' : BRICK_KEYS[Math.random() * BRICK_KEYS.length | 0], wob: 0 }); }
    for (let i = 0; i < Math.min(4, square); i++) bots.push({ x: rnd(20, W - 20), y: rnd(top + 20, H - 20), a: rnd(0, 6.28), hp: 2, hit: 0, stun: 0 });
    bank = 0; target = 80 + square * 70; time = Math.max(time || 0, 0) + 30; cleared = false;
    msg = { txt: `SQUARE ${square}`, l: 1.2 };
  }
  function spill(x, y, n, gold) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), sp = rnd(30, 70); studs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, kind: gold && i < 2 ? 'gold' : Math.random() < .08 ? 'gold' : 'silver', age: 0 }); } }
  function burst(x, y, col) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-60, 30), l: .45, col }); }
  function whack() {
    if (swing > 0 || dead) return; swing = .22; sfx(260, .06, 'square', .04, -60);
    let best = null, bd = 26;
    for (const o of things) { const d = Math.hypot(o.x + o.w / 2 - pl.x, o.y + o.h / 2 - pl.y) - Math.max(o.w, o.h) / 2; if (d < bd) { bd = d; best = o; } }
    for (const b of bots) { const d = Math.hypot(b.x - pl.x, b.y - pl.y) - 6; if (d < bd) { bd = d; best = b; } }
    if (!best) return;
    pl.a = Math.atan2((best.y + (best.h || 0) / 2) - pl.y, (best.x + (best.w || 0) / 2) - pl.x);
    if (best.w) { best.hit++; best.wob = .2; haptic('light'); sfx(400, .05, 'square', .04); if (best.hit >= best.hp) { things.splice(things.indexOf(best), 1); spill(best.x + best.w / 2, best.y + best.h / 2, best.studs + (Math.random() * 3 | 0), best.gold); burst(best.x + best.w / 2, best.y + best.h / 2, best.col === 'black' ? '#585868' : '#f0c020'); haptic('medium'); sfx(220, .12, 'square', .05, -100); } }
    else { best.hp--; best.hit = .2; best.stun = .8; haptic('medium'); if (best.hp <= 0) { bots.splice(bots.indexOf(best), 1); spill(best.x, best.y, 8, true); burst(best.x, best.y, '#b8bcc4'); sfx(180, .2, 'sawtooth', .05, -60); } }
  }
  const self = {
    reset() { pl = { x: W / 2, y: H - 20, a: -1.57 }; square = 1; total = 0; time = 0; t = 0; hold = null; parts = []; dead = 0; swing = 0; bump = 0; build(); },
    resize(w, h) { const sx = w / W, sy = h / H; W = w; H = h; if (things) for (const o of [pl, ...things, ...studs, ...bots]) { o.x *= sx; o.y *= sy; } },
    update(dt) {
      t += dt; swing = Math.max(0, swing - dt); bump = Math.max(0, bump - dt);
      for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.4) api.over(); return; }
      time -= dt; if (time <= 0) { time = 0; dead = .01; msg = { txt: 'TIME UP', l: 9 }; haptic('error'); sfx(140, .5, 'square', .05, -60); return; }
      if (hold && hold.walk) { const dx = hold.x - pl.x, dy = hold.y - pl.y, d = Math.hypot(dx, dy); if (d > 3) { const sp = 70 * dt; pl.x += dx / d * Math.min(d, sp); pl.y += dy / d * Math.min(d, sp); pl.a = Math.atan2(dy, dx); } }
      for (const o of things) { o.wob = Math.max(0, o.wob - dt); const cx = clamp(pl.x, o.x, o.x + o.w), cy = clamp(pl.y, o.y, o.y + o.h), dx = pl.x - cx, dy = pl.y - cy, d = Math.hypot(dx, dy); if (d < 5) { if (d > 0) { pl.x = cx + dx / d * 5; pl.y = cy + dy / d * 5; } else pl.y = o.y + o.h + 5; } }
      pl.x = clamp(pl.x, 5, W - 5); pl.y = clamp(pl.y, top + 5, H - 5);
      for (const s of studs) {
        s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .9; s.vy *= .9; s.x = clamp(s.x, 4, W - 4); s.y = clamp(s.y, top + 4, H - 4);
        const dx = pl.x - s.x, dy = pl.y - s.y, d = Math.hypot(dx, dy);
        if (s.age > .35 && d < 30) { s.x += dx / d * 140 * dt; s.y += dy / d * 140 * dt; }
        if (s.age > .35 && d < 6) { s.got = true; const v = s.kind === 'gold' ? 10 : 1; bank += v; total += v; api.score(total); sfx(s.kind === 'gold' ? 1500 : 1200 + Math.random() * 200, .03, 'square', .02, 200); }
      }
      studs = studs.filter(s => !s.got);
      for (const b of bots) {
        b.hit = Math.max(0, b.hit - dt); if (b.stun > 0) { b.stun -= dt; continue; }
        const dx = pl.x - b.x, dy = pl.y - b.y, d = Math.hypot(dx, dy);
        if (d < 50) b.a += clamp(((Math.atan2(dy, dx) - b.a + 9.42) % 6.283) - 3.14, -2 * dt, 2 * dt); else b.a += Math.sin(t + b.x) * dt;
        b.x += Math.cos(b.a) * (22 + square * 2) * dt; b.y += Math.sin(b.a) * (22 + square * 2) * dt;
        if (b.x < 8 || b.x > W - 8) b.a = Math.PI - b.a; if (b.y < top + 8 || b.y > H - 8) b.a = -b.a; b.x = clamp(b.x, 8, W - 8); b.y = clamp(b.y, top + 8, H - 8);
        if (d < 10 && bump <= 0) { bump = 1.2; const lose = Math.min(bank, 8 + square * 2); bank -= lose; total -= lose; api.score(total); spill(pl.x, pl.y, Math.min(10, lose), false); b.stun = 1; haptic('heavy'); sfx(150, .3, 'sawtooth', .05, -60); parts.push({ txt: `-${lose}`, x: pl.x, y: pl.y - 12, l: .8, col: '#f86060' }); }
      }
      if (!cleared && bank >= target) { cleared = true; haptic('success'); sfx(880, .5, 'square', .05, 500); msg = { txt: 'HERO! NEXT SQUARE...', l: 1.6 }; setTimeout(() => { if (!dead) { square++; build(); } }, 1600); }
      if (!cleared && !things.length && !studs.length && !bots.length) { for (let i = 0; i < 6; i++) { const K = KINDS[Math.random() * 5 | 0], p = free(K.w, K.h); if (p) things.push({ ...K, ...p, hit: 0, col: K.col, wob: 0 }); } msg = { txt: 'MORE TO SMASH!', l: 1 }; }
    },
    draw(c) {
      backdrop(c, 0, 0, W, H, '#c0c8b8', '#88907e');
      c.fillStyle = '#ffffff18'; for (let x = 0; x < W; x += 16) for (let y = top; y < H; y += 16) if (((x + y) / 16) % 2) c.fillRect(x, y, 16, 16);
      c.fillStyle = '#00000018'; for (let x = 4; x < W; x += 8) for (let y = top + 4; y < H; y += 8) c.fillRect(x, y, 2, 2);
      for (const o of [...things].sort((a, b) => a.y + a.h - b.y - b.h)) {
        const wx = o.wob > 0 ? Math.sin(o.wob * 60) * 1.5 : 0, x = Math.round(o.x + wx), y = Math.round(o.y);
        c.fillStyle = '#00000025'; c.fillRect(x + 2, y + o.h - 2, o.w, 4);
        if (o.k === 'lamp') { brick(c, x, y + o.h - 4, o.w, 4, 'black', 0); c.fillStyle = '#383840'; c.fillRect(x + 2, y + 4, 2, o.h - 6); brick(c, x - 1, y, o.w + 2, 5, 'yellow', 4); }
        else if (o.k === 'bench') { brick(c, x, y + 2, o.w, 4, o.col, 4); c.fillStyle = '#383840'; c.fillRect(x + 2, y + 6, 2, 2); c.fillRect(x + o.w - 4, y + 6, 2, 2); }
        else if (o.k === 'plant') { brick(c, x + 2, y + 8, o.w - 4, 6, 'tan', 4); c.fillStyle = '#38a040'; c.beginPath(); c.arc(x + o.w / 2, y + 5, 6, 0, 7); c.fill(); c.fillStyle = '#d83a2c'; c.fillRect(x + o.w / 2 - 1, y + 3, 2, 2); }
        else if (o.k === 'statue') { brick(c, x, y + o.h - 6, o.w, 6, 'grey', 4); brick(c, x + 3, y + 6, o.w - 6, o.h - 12, 'yellow', 4); brick(c, x + 4, y, o.w - 8, 6, 'yellow', 3); }
        else { const n = Math.max(1, Math.round(o.h / 6)), bh = o.h / n; for (let i = 0; i < n; i++) brick(c, x, Math.round(y + i * bh), o.w, Math.round(bh), o.col, 4); }
        if (o.hit) { c.fillStyle = '#202020'; c.fillRect(x + o.w / 2 - 2, y + 2, 1, 4); c.fillRect(x + o.w / 2 - 1, y + 5, 3, 1); }
      }
      for (const s of studs) stud(c, s.x, s.y, s.kind === 'gold' ? 3 : 2.5, s.kind, t);
      for (const b of bots) { const x = Math.round(b.x), y = Math.round(b.y); c.fillStyle = b.hit > 0 ? '#ffffff' : '#8c9098'; c.fillRect(x - 5, y - 6, 10, 10); c.fillStyle = '#b8bcc4'; c.fillRect(x - 5, y - 6, 10, 2); c.fillStyle = b.stun > 0 ? '#f8e040' : '#f84040'; c.fillRect(x - 3, y - 3, 2, 2); c.fillRect(x + 1, y - 3, 2, 2); c.fillStyle = '#585c64'; c.save(); c.translate(x, y - 8); c.rotate(t * 8); c.fillRect(-3, -1, 6, 2); c.restore(); }
      // hero
      if (!(bump > .6 && (t * 14 | 0) % 2)) {
        const x = Math.round(pl.x), y = Math.round(pl.y);
        c.fillStyle = '#00000030'; c.fillRect(x - 4, y + 3, 8, 2);
        c.fillStyle = '#2c64c8'; c.fillRect(x - 3, y - 1, 6, 4); c.fillStyle = '#d83a2c'; c.fillRect(x - 4, y - 7, 8, 6); c.fillStyle = '#f0c020'; c.fillRect(x - 3, y - 13, 6, 6); c.fillStyle = '#202020'; c.fillRect(x - 2, y - 11, 1, 2); c.fillRect(x + 1, y - 11, 1, 2);
        const a = swing > 0 ? pl.a - 1 + (1 - swing / .22) * 2 : pl.a + .8, hx = x + Math.cos(a) * 9, hy = y - 4 + Math.sin(a) * 9;
        c.strokeStyle = '#805020'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(hx, hy); c.stroke(); c.lineWidth = 1; c.fillStyle = '#585c64'; c.fillRect(hx - 3, hy - 3, 6, 6);
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.fillStyle = '#202830'; c.fillRect(0, 0, W, top);
      c.textAlign = 'left'; c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 3, 10);
      const bx = 34, bw = W - bx - 30; c.fillStyle = '#404850'; c.fillRect(bx, 4, bw, 6); c.fillStyle = cleared ? '#38f070' : '#f0c020'; c.fillRect(bx, 4, bw * clamp(bank / target, 0, 1), 6); c.fillStyle = '#f8f8f0'; c.textAlign = 'right'; c.fillText('HERO', W - 3, 10);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f0c020'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 6 && !msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#f8f8f0'; c.fillText('HOLD TO WALK', W / 2, H - 14); c.fillText('TAP TO SMASH', W / 2, H - 5); }
    },
    down(x, y) { tapStart = { x, y, t: performance.now() }; hold = { x, y, walk: false, t0: performance.now() }; },
    move(x, y, p) { if (!p || !hold) return; hold.x = x; hold.y = y; if (Math.hypot(x - tapStart.x, y - tapStart.y) > 8 || performance.now() - hold.t0 > 150) hold.walk = true; },
    up() { const quick = tapStart && performance.now() - tapStart.t < 220 && !(hold && hold.walk); hold = null; if (quick) whack(); },
    key(k, d) { const st = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k]; if (st) { hold = d ? { x: pl.x + st[0] * 400, y: pl.y + st[1] * 400, walk: true } : null; } if (k === ' ' && d) whack(); },
  };
  return self;
}

export default {
  id: 'stud-smash', title: 'Stud Smash', tag: 'Bricks · Action', retro: true, era: 'console', pal: 'lemon', w: 176, h: 192, maxW: 260, maxH: 320, goal: 800,
  hint: 'Hold to walk toward your finger, tap to smash the nearest thing. Everything bursts into studs: walk close to pull them in. Gold statues drop gold studs worth 10. Whack the wind-up robots before they bump you and spill your studs. Fill the HERO bar before time runs out to reach the next square.',
  make,
};
