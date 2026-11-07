import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { ball, glow, backdrop } from '../kit/gfx.js';
import { brick, stud, BRICK_KEYS } from '../kit/bricks.js';

// A giant brick robot stomps along the ceiling, dropping bricks on you. Drag to dodge (watch the
// shadows). Fallen bricks pile up on the floor: stand on a pile to build it into a launcher. Tap
// to fire every launcher you've built straight up. Hit the robot while its core glows to damage
// it. Beat each robot to face a tougher one.
let W = 176, H = 192;

function make(api) {
  let px, tx, boss, drops, piles, launchers, shots, hp, inv, beaten, score, t, parts, msg, dead, tapStart, between;
  const fy = () => H - 14, bossY = () => 30;
  function newBoss() { const n = beaten; boss = { x: W / 2, dir: 1, sp: 30 + n * 8, hp: 3 + Math.min(3, n), max: 3 + Math.min(3, n), core: 0, coreT: 2.5, dropT: 1.2, hit: 0, slam: 0, col: BRICK_KEYS[n % BRICK_KEYS.length] }; drops = []; shots = []; between = 1.4; msg = { txt: `ROBOT ${beaten + 1}`, l: 1.4 }; }
  function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-70, 70), vy: rnd(-90, 20), l: .5, col }); }
  function hurt() { if (inv > 0) return; hp--; inv = 1.3; haptic('heavy'); sfx(130, .3, 'sawtooth', .05, -60); if (hp <= 0) { dead = .01; msg = { txt: 'FLATTENED!', l: 9 }; sfx(90, .8, 'square', .05, -40); } }
  const self = {
    reset() { px = tx = W / 2; piles = []; launchers = []; hp = 3; inv = 0; beaten = 0; score = 0; t = 0; parts = []; dead = 0; newBoss(); },
    resize(w, h) { const s = w / W; W = w; H = h; if (boss) { px *= s; tx *= s; boss.x *= s; for (const a of [piles, launchers]) for (const o of a) o.x *= s; } },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.5) api.over(); return; }
      inv = Math.max(0, inv - dt);
      px += clamp(tx - px, -110 * dt, 110 * dt); px = clamp(px, 8, W - 8);
      if (between > 0) { between -= dt; return; }
      // boss
      const b = boss; b.hit = Math.max(0, b.hit - dt);
      b.x += b.dir * b.sp * dt; if (b.x < 26 || b.x > W - 26) b.dir *= -1; b.x = clamp(b.x, 26, W - 26);
      b.coreT -= dt; if (b.coreT <= 0) { b.core = b.core ? 0 : 1; b.coreT = b.core ? 2.2 - Math.min(1, beaten * .15) : rnd(2, 3.4); }
      b.dropT -= dt; if (b.dropT <= 0) { b.dropT = Math.max(.45, 1.3 - beaten * .12 - (b.max - b.hp) * .08); const n = Math.random() < .25 ? 3 : 1; for (let i = 0; i < n; i++) drops.push({ x: clamp(n > 1 ? px + (i - 1) * 22 : (Math.random() < .6 ? px : rnd(10, W - 10)), 8, W - 8), y: bossY() + 10, vy: 0, warn: .5, col: BRICK_KEYS[Math.random() * 6 | 0] }); sfx(300, .05, 'square', .03, -100); }
      for (const d of drops) {
        if (d.warn > 0) { d.warn -= dt; continue; }
        d.vy += 380 * dt; d.y += d.vy * dt;
        if (d.y >= fy() - 4) { d.done = true; burst(d.x, fy() - 4, '#c8ccd4', 6); sfx(160, .06, 'square', .04, -40); const p = piles.find(p => Math.abs(p.x - d.x) < 12); if (p) p.n = Math.min(4, p.n + 1); else piles.push({ x: d.x, n: 1, prog: 0, col: d.col }); }
        else if (Math.abs(d.x - px) < 9 && d.y > fy() - 20) { d.done = true; hurt(); burst(d.x, d.y, '#f86060'); }
      }
      drops = drops.filter(d => !d.done);
      // standing on a pile builds a launcher
      for (const p of piles) { if (Math.abs(p.x - px) < 10 && Math.abs(tx - px) < 2) { p.prog += dt / (.9 + p.n * .1); if ((t * 20 | 0) % 3 === 0) haptic('tick'); if (p.prog >= 1) { p.built = true; launchers.push({ x: p.x, power: p.n }); haptic('success'); sfx(700, .2, 'square', .05, 400); parts.push({ txt: 'LAUNCHER!', x: p.x, y: fy() - 24, l: .9, col: '#f0c020' }); } } }
      piles = piles.filter(p => !p.built);
      if (launchers.length > 4) launchers.shift();
      for (const s of shots) { s.y -= 260 * dt; if (!s.done && s.y < bossY() + 14 && Math.abs(s.x - b.x) < 26) { s.done = true; if (b.core) { b.hp -= 1; b.hit = .3; score += 10; api.score(score); burst(s.x, bossY() + 10, '#f8e040', 14); haptic('success'); sfx(200, .25, 'square', .06, -100); parts.push({ txt: 'CORE HIT!', x: b.x, y: bossY() + 30, l: .9, col: '#f8e040' }); b.core = 0; b.coreT = 1.5; } else { burst(s.x, bossY() + 14, '#c8ccd4', 6); sfx(800, .05, 'square', .03); parts.push({ txt: 'CLANG', x: s.x, y: bossY() + 30, l: .6, col: '#c8ccd4' }); } } }
      shots = shots.filter(s => !s.done && s.y > -10);
      if (b.hp <= 0) { beaten++; score += 25; api.score(score); haptic('success'); sfx(880, .6, 'square', .05, 600); burst(b.x, bossY(), '#f0c020', 30); hp = Math.min(3, hp + 1); newBoss(); }
    },
    draw(c) {
      backdrop(c, 0, 0, W, H, '#3a2a52', '#140e20');
      for (let i = 0; i < W; i += 16) brick(c, i, 0, 16, 12, 'black', 0);
      c.fillStyle = '#585c64'; c.fillRect(0, 12, W, 2);
      // boss
      const b = boss, bx = Math.round(b.x), by = bossY();
      c.fillStyle = '#383840'; c.fillRect(bx - 2, 12, 4, by - 12);
      if (!(b.hit > 0 && (t * 20 | 0) % 2)) {
        brick(c, bx - 24, by, 48, 14, b.col, 8); brick(c, bx - 18, by + 14, 36, 8, 'grey', 6);
        if (b.core) glow(c, bx, by + 7, 14 + Math.sin(t * 12) * 3, '#f8c040', .6); ball(c, bx, by + 7, 5, b.core ? ((t * 10 | 0) % 2 ? '#f8e040' : '#f8a020') : '#404048');
        glow(c, bx - 14, by + 5.5, 6, '#ff4040', .5); glow(c, bx + 14, by + 5.5, 6, '#ff4040', .5); c.fillStyle = '#ff5050'; c.fillRect(bx - 16, by + 4, 4, 3); c.fillRect(bx + 12, by + 4, 4, 3);
        c.fillStyle = '#585c64'; c.fillRect(bx - 22, by + 22, 6, 6); c.fillRect(bx + 16, by + 22, 6, 6);
      }
      for (let i = 0; i < b.max; i++) { c.fillStyle = i < b.hp ? '#f84040' : '#403848'; c.fillRect(W / 2 - b.max * 5 + i * 10, 3, 8, 5); }
      // drops & shadows
      for (const d of drops) { c.fillStyle = '#00000060'; c.fillRect(d.x - 7, fy() - 1, 14, 3); if (d.warn > 0) { c.fillStyle = (t * 12 | 0) % 2 ? '#f84040' : '#f8a040'; c.fillRect(d.x - 1, fy() - 10, 2, 6); } else brick(c, d.x - 6, d.y - 4, 12, 6, d.col, 4); }
      // floor, piles, launchers
      for (let i = 0; i < W; i += 16) brick(c, i, fy(), 16, H - fy(), 'grey', 8);
      for (const p of piles) { for (let i = 0; i < p.n; i++) brick(c, p.x - 7 + (i % 2) * 3, fy() - 4 - i * 4, 10, 4, p.col, 4); if (p.prog > 0) { c.fillStyle = '#00000080'; c.fillRect(p.x - 10, fy() - 26, 20, 3); c.fillStyle = '#f0c020'; c.fillRect(p.x - 10, fy() - 26, 20 * p.prog, 3); } }
      for (const l of launchers) { brick(c, l.x - 7, fy() - 6, 14, 6, 'orange', 4); c.fillStyle = '#585c64'; c.fillRect(l.x - 2, fy() - 16, 4, 10); c.fillStyle = '#f0c020'; c.fillRect(l.x - 3, fy() - 18, 6, 3); }
      for (const s of shots) { glow(c, s.x, s.y, 8, '#f8e040', .45); c.fillStyle = '#f8e040'; c.fillRect(s.x - 2, s.y - 4, 4, 8); c.fillStyle = '#fff8c0'; c.fillRect(s.x - 1, s.y - 4, 2, 3); }
      // hero
      if (!(inv > 0 && (t * 14 | 0) % 2)) { const x = Math.round(px), y = fy(); c.fillStyle = '#2c64c8'; c.fillRect(x - 3, y - 5, 2, 5); c.fillRect(x + 1, y - 5, 2, 5); c.fillStyle = '#f0c020'; c.fillRect(x - 4, y - 11, 8, 6); c.fillRect(x - 3, y - 17, 6, 6); c.fillStyle = '#202020'; c.fillRect(x - 1, y - 15, 1, 2); c.fillRect(x + 1, y - 15, 1, 2); c.fillStyle = '#f07818'; c.fillRect(x - 4, y - 19, 8, 3); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < hp ? '#f84858' : '#403848'; c.fillRect(4 + i * 7, 3, 5, 5); }
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(String(score), W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H * .45 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f0c020'; c.fillText(msg.txt, W / 2, H * .45); }
      if (t < 8 && !msg) { c.textAlign = 'center'; c.fillStyle = '#f8f8f0'; c.fillText('DRAG · STAND ON PILES', W / 2, H * .45); c.fillText('TAP TO FIRE AT THE CORE', W / 2, H * .45 + 10); }
    },
    down(x, y) { tapStart = { x, y, t: performance.now() }; },
    move(x, y, p) { if (p) tx = x; },
    up() { if (tapStart && performance.now() - tapStart.t < 200) self.fire(); tapStart = null; },
    fire() { if (dead || !launchers.length) { sfx(200, .03, 'square', .02); return; } for (const l of launchers) shots.push({ x: l.x, y: fy() - 18 }); launchers = []; haptic('medium'); sfx(500, .15, 'square', .05, 600); },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') tx = px - 24; if (k === 'ArrowRight') tx = px + 24; if (k === ' ') self.fire(); },
  };
  return self;
}

export default {
  id: 'boss-brickfall', title: 'Boss Brickfall', tag: 'Bricks · Boss', retro: true, era: 'console', pal: 'grape', w: 176, h: 192, maxW: 260, maxH: 320, goal: 120,
  hint: 'Drag to move and dodge the falling bricks (red marks show where). Fallen bricks make piles: stand on one to build a launcher. Tap to fire all your launchers straight up. Only hits while the robot\'s core glows yellow do damage.',
  make,
};
