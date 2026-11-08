import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Drop fruit into the jar. Two of the same that touch merge into the next size up. Don't let the pile cross the line.
const W = 360, H = 640, L = 36, RGT = W - 36, BOT = 600, LINE = 170, G = 1500;
const SIZES = [13, 18, 24, 31, 39, 48, 58, 69, 81];
const COLS = ['#ff5d73', '#ffb020', '#ffe14d', '#7be38a', '#3ddcc6', '#5aa8ff', '#9a8cff', '#ff7ad9', '#f2f2f2'];

function make(api) {
  let balls, cur, next, aimX, score, cool, over, t, pops, dead;
  const pick = () => Math.random() * 4 | 0;
  function add(x, y, lv) { balls.push({ x, y, px: x, py: y, lv, r: SIZES[lv], born: t }); }
  return {
    reset() { balls = []; cur = pick(); next = pick(); aimX = W / 2; score = 0; cool = 0; over = 0; t = 0; pops = []; dead = 0; },
    update(dt) {
      t += dt; cool -= dt;
      const steps = 6, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (const b of balls) { const vx = (b.x - b.px) * .995, vy = (b.y - b.py) * .995; b.px = b.x; b.py = b.y; b.x += vx; b.y += vy + G * h * h; }
        for (let it = 0; it < 3; it++) {
          for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
            if (d < m && d > .01) { const k = (m - d) / d * .5, wa = b.r * b.r / (a.r * a.r + b.r * b.r), wb = 1 - wa; a.x -= dx * k * wa * 2; a.y -= dy * k * wa * 2; b.x += dx * k * wb * 2; b.y += dy * k * wb * 2; }
          }
          for (const b of balls) { if (b.x < L + b.r) b.x = L + b.r; if (b.x > RGT - b.r) b.x = RGT - b.r; if (b.y > BOT - b.r) b.y = BOT - b.r; }
        }
      }
      // merges
      outer: for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        if (a.lv === b.lv && a.lv < SIZES.length - 1 && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 1) {
          balls.splice(j, 1); balls.splice(i, 1); const lv = a.lv + 1;
          add((a.x + b.x) / 2, (a.y + b.y) / 2, lv); score += (lv + 1) * (lv + 2) / 2; api.score(score);
          pops.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: SIZES[lv], life: .4, c: COLS[lv] });
          haptic(lv > 4 ? 'medium' : 'light'); sfx(300 + lv * 90, .1, 'triangle', .05, 120); break outer;
        }
      }
      for (const p of pops) p.life -= dt; pops = pops.filter(p => p.life > 0);
      const high = balls.some(b => t - b.born > 1.2 && b.y - b.r < LINE);
      over = high ? over + dt : 0;
      if (over > 1.6) { haptic('error'); sfx(140, .5, 'sawtooth', .05, -60); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = '#1a1626'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2a2340'; c.beginPath(); c.roundRect(L - 8, LINE - 30, RGT - L + 16, BOT - LINE + 38, [6, 6, 26, 26]); c.fill();
      c.fillStyle = '#120f1c'; c.fillRect(L, LINE - 30, RGT - L, BOT - LINE + 30);
      c.strokeStyle = over > 0 && (t * 6 | 0) % 2 ? '#ff5d73' : '#ffffff40'; c.setLineDash([8, 8]); c.lineWidth = 2; c.beginPath(); c.moveTo(L, LINE); c.lineTo(RGT, LINE); c.stroke(); c.setLineDash([]);
      const ball = (x, y, lv, a = 1) => { const r = SIZES[lv]; c.globalAlpha = a; c.fillStyle = COLS[lv]; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(x - r * .35, y - r * .35, r * .3, 0, 7); c.fill();
        c.fillStyle = '#1a1626'; c.beginPath(); c.arc(x - r * .25, y + r * .05, Math.max(1.5, r * .08), 0, 7); c.arc(x + r * .25, y + r * .05, Math.max(1.5, r * .08), 0, 7); c.fill(); c.globalAlpha = 1; };
      for (const b of balls) ball(b.x, b.y, b.lv);
      for (const p of pops) { c.strokeStyle = p.c; c.globalAlpha = p.life * 2; c.lineWidth = 4; c.beginPath(); c.arc(p.x, p.y, p.r * (1.6 - p.life), 0, 7); c.stroke(); c.globalAlpha = 1; }
      if (!dead) { const x = clamp(aimX, L + SIZES[cur], RGT - SIZES[cur]); c.strokeStyle = '#ffffff22'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 110); c.lineTo(x, BOT); c.stroke(); ball(x, 110, cur, cool > 0 ? .4 : 1); }
      c.fillStyle = '#ffffff88'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('NEXT', W - 30, 60); ball(W - 46, 86, next, .9);
      c.textAlign = 'left'; c.fillText('Drag to aim, let go to drop', 24, H - 14);
    },
    down(x) { aimX = x; }, move(x, y, p) { if (p) aimX = x; },
    up(x) { aimX = x; if (cool > 0) return; const r = SIZES[cur]; add(clamp(x, L + r, RGT - r), 110, cur); cur = next; next = pick(); cool = .45; sfx(500, .04, 'triangle', .03); },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') aimX -= 20; if (k === 'ArrowRight') aimX += 20; if (k === ' ') this.up(aimX); },
  };
}

export default {
  id: 'merge-drop', title: 'Merge Drop', tag: 'Casual · Merge', retro: false, w: W, h: H, goal: 120,
  hint: 'Drop fruit in the jar. Matching fruit merge into bigger ones. Keep the pile under the line.',
  make,
};
