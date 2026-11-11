import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// A fresh one-hole course every time. Drag back from the ball and let go to putt. Sink it within five strokes.
const W = 360, H = 640, BR = 8, HR = 12, X0 = 30, X1 = 330, Y0 = 110, Y1 = 600;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let ball, hole, walls, aim, strokes, holes, score, t, dead, sunk, last;
  function course() {
    walls = []; const n = Math.min(5, 1 + holes);
    for (let i = 0; i < n; i++) { const horiz = Math.random() < .6, w = horiz ? rnd(80, 170) : 16, h = horiz ? 16 : rnd(70, 150); walls.push({ x: rnd(X0 + 10, X1 - w - 10), y: rnd(Y0 + 90, Y1 - 150), w, h }); }
    hole = { x: rnd(X0 + 40, X1 - 40), y: rnd(Y0 + 30, Y0 + 90) }; if (holes % 3 === 2) walls.push({ x: hole.x - 50, y: hole.y + 34, w: 100, h: 12 });
    ball = { x: rnd(X0 + 40, X1 - 40), y: Y1 - 40, vx: 0, vy: 0 }; strokes = 0; sunk = 0; last = { x: ball.x, y: ball.y };
  }
  const moving = () => Math.hypot(ball.vx, ball.vy) > 4;
  return {
    reset() { holes = 0; score = 0; t = 0; dead = 0; aim = null; feel.clear(); course(); },
    update(dt) {
      feel.update(dt); t += dt;
      if (sunk) { sunk += dt; if (sunk > .9) { holes++; course(); } return; }
      const steps = 6, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        ball.x += ball.vx * h; ball.y += ball.vy * h;
        if (ball.x < X0 + BR) { ball.x = X0 + BR; ball.vx = Math.abs(ball.vx) * .8; } if (ball.x > X1 - BR) { ball.x = X1 - BR; ball.vx = -Math.abs(ball.vx) * .8; }
        if (ball.y < Y0 + BR) { ball.y = Y0 + BR; ball.vy = Math.abs(ball.vy) * .8; } if (ball.y > Y1 - BR) { ball.y = Y1 - BR; ball.vy = -Math.abs(ball.vy) * .8; }
        for (const w of walls) { const cx = clamp(ball.x, w.x, w.x + w.w), cy = clamp(ball.y, w.y, w.y + w.h), dx = ball.x - cx, dy = ball.y - cy, d = Math.hypot(dx, dy);
          if (d < BR && d > 0) { const nx = dx / d, ny = dy / d, dot = ball.vx * nx + ball.vy * ny; ball.x = cx + nx * BR; ball.y = cy + ny * BR; if (dot < 0) { ball.vx -= 1.8 * dot * nx; ball.vy -= 1.8 * dot * ny; feel.juice.burst(cx, cy, { n: 4, speed: 90, life: .2, size: 2.5, color: ['#c9a26b', '#ffffff'], shape: 'spark' }); haptic('tick'); sfx(300, .03, 'triangle', .03); } } }
        const dh = Math.hypot(ball.x - hole.x, ball.y - hole.y), sp = Math.hypot(ball.vx, ball.vy);
        if (dh < HR && sp < 520) { sunk = .001; const pts = Math.max(1, 6 - strokes); score += strokes === 1 ? 10 : pts; api.score(score); feel.juice.burst(hole.x, hole.y, { n: strokes === 1 ? 40 : 18, speed: 220, life: .7, size: 4, color: ['#ffd34a', '#ffffff', '#ff5d73'], gravity: 300 }).pop(hole.x, hole.y - 56, strokes === 1 ? 'HOLE IN ONE +10' : `+${pts}`, { color: '#ffd34a', size: strokes === 1 ? 20 : 18 }); haptic('success'); sfx(strokes === 1 ? 1200 : 880, .3, 'triangle', .06, 300); return; }
        if (dh < HR + 6 && sp < 700) { ball.vx += (hole.x - ball.x) * 6 * h; ball.vy += (hole.y - ball.y) * 6 * h; }
      }
      const f = Math.pow(.42, dt); ball.vx *= f; ball.vy *= f; if (!moving()) { ball.vx = ball.vy = 0; if (strokes >= 5 && !sunk) { feel.juice.shake(6); haptic('error'); sfx(150, .5, 'sawtooth', .05, -60); return api.over(); } }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#123821'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#2e8b4a'; c.beginPath(); c.roundRect(X0, Y0, X1 - X0, Y1 - Y0, 18); c.fill();
      c.fillStyle = '#339a52'; for (let y = Y0; y < Y1; y += 40) c.fillRect(X0, y, X1 - X0, 20);
      c.fillStyle = '#c9a26b'; for (const w of walls) { c.beginPath(); c.roundRect(w.x, w.y, w.w, w.h, 5); c.fill(); }
      c.fillStyle = '#0b1f12'; c.beginPath(); c.arc(hole.x, hole.y, HR, 0, 7); c.fill(); c.fillStyle = '#fff'; c.fillRect(hole.x, hole.y - 46, 2, 46); c.fillStyle = '#ff5d73'; c.beginPath(); c.moveTo(hole.x + 2, hole.y - 46); c.lineTo(hole.x + 24, hole.y - 39); c.lineTo(hole.x + 2, hole.y - 32); c.fill();
      if (aim && !moving()) { const dx = aim.sx - aim.x, dy = aim.sy - aim.y, p = Math.min(1, Math.hypot(dx, dy) / 160); c.strokeStyle = `hsl(${120 - p * 120} 90% 60%)`; c.lineWidth = 4; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(ball.x, ball.y); c.lineTo(ball.x + dx * 1.2, ball.y + dy * 1.2); c.stroke(); c.setLineDash([]); }
      if (!sunk) { c.fillStyle = '#0005'; c.beginPath(); c.arc(ball.x + 2, ball.y + 3, BR, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(ball.x, ball.y, BR, 0, 7); c.fill(); }
      feel.end(c, W, H);
      c.fillStyle = '#ffffffcc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`Hole ${holes + 1} · Stroke ${strokes}/5`, W / 2, 92);
    },
    down(x, y) { if (moving() || sunk) return; aim = { sx: x, sy: y, x, y }; },
    move(x, y) { if (aim) { aim.x = x; aim.y = y; } },
    up() {
      if (!aim) return; const dx = aim.sx - aim.x, dy = aim.sy - aim.y, d = Math.hypot(dx, dy); aim = null; if (d < 8) return;
      const p = Math.min(160, d) / 160 * 1100; ball.vx = dx / d * p; ball.vy = dy / d * p; strokes++; last = { x: ball.x, y: ball.y }; haptic('medium'); sfx(500, .05, 'triangle', .05);
    },
  };
}

export default {
  id: 'mini-golf', title: 'Mini Golf', tag: 'Casual · Sports', retro: false, w: W, h: H, goal: 25,
  hint: 'Drag anywhere to pull back, aim and set power, then let go to putt. Five strokes per hole.',
  make,
};
