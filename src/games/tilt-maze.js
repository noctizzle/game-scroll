import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { tilt, calibrateTilt, want, haptic } = gs.device;
const { clamp } = gs.util;

// Tilt the phone to roll a marble through a fresh maze to the hole. Each maze adds time. No tilt sensor? Drag instead.
const W = 360, H = 640, C = 7, Rw = 11, CS = 46, OX = (W - C * CS) / 2, OY = 92, BR = 11;

function maze() {
  const cells = Array.from({ length: C * Rw }, () => ({ n: 1, s: 1, e: 1, w: 1, v: 0 }));
  const at = (x, y) => cells[y * C + x], st = [[0, 0]]; at(0, 0).v = 1;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const nb = [[0, -1, 'n', 's'], [0, 1, 's', 'n'], [1, 0, 'e', 'w'], [-1, 0, 'w', 'e']].filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < C && ny < Rw && !at(nx, ny).v; });
    if (!nb.length) { st.pop(); continue; }
    const [dx, dy, a, b] = nb[Math.random() * nb.length | 0]; at(x, y)[a] = 0; at(x + dx, y + dy)[b] = 0; at(x + dx, y + dy).v = 1; st.push([x + dx, y + dy]);
  }
  return { cells, at };
}

function make(api) {
  want('motion');
  let m, ball, hole, time, score, t, drag, dead, lastWall;
  function next() { m = maze(); ball = { x: OX + CS / 2, y: OY + CS / 2, vx: 0, vy: 0 }; hole = { x: OX + (C - .5) * CS, y: OY + (Rw - .5) * CS }; }
  return {
    reset() { calibrateTilt(); score = 0; time = 30; t = 0; drag = null; dead = 0; lastWall = 0; next(); },
    update(dt) {
      t += dt; time -= dt; if (time <= 0) { time = 0; haptic('error'); return api.over(); }
      const tl = tilt(); let ax = 0, ay = 0;
      if (drag && drag.cur) { ax = clamp((drag.cur.x - drag.x) / 50, -1, 1); ay = clamp((drag.cur.y - drag.y) / 50, -1, 1); }
      else if (tl) { ax = tl.x; ay = tl.y; }
      ball.vx = (ball.vx + ax * 1400 * dt) * Math.pow(.25, dt); ball.vy = (ball.vy + ay * 1400 * dt) * Math.pow(.25, dt);
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
        const cx = clamp(Math.floor((ball.x - OX) / CS), 0, C - 1), cy = clamp(Math.floor((ball.y - OY) / CS), 0, Rw - 1), c = m.at(cx, cy);
        const L = OX + cx * CS, T = OY + cy * CS; let hit = 0;
        if (c.w && ball.x < L + BR + 2) { ball.x = L + BR + 2; hit = Math.abs(ball.vx); ball.vx = Math.abs(ball.vx) * .3; }
        if (c.e && ball.x > L + CS - BR - 2) { ball.x = L + CS - BR - 2; hit = Math.abs(ball.vx); ball.vx = -Math.abs(ball.vx) * .3; }
        if (c.n && ball.y < T + BR + 2) { ball.y = T + BR + 2; hit = Math.abs(ball.vy); ball.vy = Math.abs(ball.vy) * .3; }
        if (c.s && ball.y > T + CS - BR - 2) { ball.y = T + CS - BR - 2; hit = Math.abs(ball.vy); ball.vy = -Math.abs(ball.vy) * .3; }
        for (const px of [L, L + CS]) for (const py of [T, T + CS]) {   // corner posts
          const dx = ball.x - px, dy = ball.y - py, d = Math.hypot(dx, dy);
          if (d < BR + 2 && d > 0) { ball.x = px + dx / d * (BR + 2); ball.y = py + dy / d * (BR + 2); }
        }
        if (hit > 120 && t - lastWall > .12) { lastWall = t; haptic(hit > 300 ? 'medium' : 'light'); sfx(160 + hit * .2, .03, 'triangle', .03); }
      }
      if (Math.hypot(ball.x - hole.x, ball.y - hole.y) < 14) { score++; api.score(score); time += 12; haptic('success'); sfx(660, .2, 'triangle', .06, 500); next(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = '#1c2a24'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#e9dcc0'; c.fillRect(OX - 6, OY - 6, C * CS + 12, Rw * CS + 12);
      c.fillStyle = '#d6c6a3'; for (let i = 0; i < 40; i++) c.fillRect(OX + (i * 97) % (C * CS), OY + (i * 59) % (Rw * CS), 22, 1);
      const g = c.createRadialGradient(hole.x, hole.y, 2, hole.x, hole.y, 16); g.addColorStop(0, '#000'); g.addColorStop(1, '#3d2c18'); c.fillStyle = g; c.beginPath(); c.arc(hole.x, hole.y, 15, 0, 7); c.fill();
      c.strokeStyle = '#5a3d22'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath();
      for (let y = 0; y < Rw; y++) for (let x = 0; x < C; x++) {
        const k = m.at(x, y), L = OX + x * CS, T = OY + y * CS;
        if (k.n) { c.moveTo(L, T); c.lineTo(L + CS, T); } if (k.w) { c.moveTo(L, T); c.lineTo(L, T + CS); }
        if (y === Rw - 1 && k.s) { c.moveTo(L, T + CS); c.lineTo(L + CS, T + CS); } if (x === C - 1 && k.e) { c.moveTo(L + CS, T); c.lineTo(L + CS, T + CS); }
      }
      c.stroke();
      c.fillStyle = '#0006'; c.beginPath(); c.arc(ball.x + 3, ball.y + 4, BR, 0, 7); c.fill();
      const bg = c.createRadialGradient(ball.x - 4, ball.y - 4, 1, ball.x, ball.y, BR); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#8aa0b8'); c.fillStyle = bg; c.beginPath(); c.arc(ball.x, ball.y, BR, 0, 7); c.fill();
      c.fillStyle = time < 6 && (t * 4 | 0) % 2 ? '#ff6b6b' : '#e9dcc0'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, OX, OY - 22);
      if (!tilt()) { c.textAlign = 'right'; c.fillStyle = '#e9dcc099'; c.font = '500 12px Rubik, sans-serif'; c.fillText('drag to roll', W - OX, OY - 24); }
    },
    down(x, y) { drag = { x, y, cur: null }; },
    move(x, y, p) { if (p && drag) drag.cur = { x, y }; },
    up() { drag = null; },
  };
}

export default {
  id: 'tilt-maze', title: 'Tilt Maze', tag: 'Casual · Motion', retro: false, w: W, h: H, goal: 3,
  hint: 'Tilt your phone to roll the marble into the hole. No tilt sensor? Drag to roll.',
  make,
};
