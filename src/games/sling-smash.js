import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;

// Pull back the slingshot and fling stones at the grumpy blobs hiding in wood, glass and stone
// forts. Blocks break on hard hits and crush whatever they land on. Clear every blob to move on.
const MAT = {
  glass: { hp: 45, d: .7, col: '#a8e8ff', hi: '#e8faff', lo: '#58a8d0' },
  wood: { hp: 95, d: 1, col: '#d89048', hi: '#f0b870', lo: '#8a5020' },
  stone: { hp: 210, d: 2, col: '#a8a8b8', hi: '#d0d0dc', lo: '#606074' },
  grump: { hp: 22, d: .8 },
};
const G = 210, PULL = 34, POWER = 6.4;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let bodies, ball, drag, shots, level, score, t, msg, settle, still;
  const ground = () => H - 14, sling = () => ({ x: 24, y: H - 42 });

  function body(x, y, w, h, mat) { const m = MAT[mat]; return { x, y, w, h, vx: 0, vy: 0, m: w * h * m.d, hp: m.hp, mat, awake: false, rest: 0 }; }
  function build() {
    bodies = []; const gy = ground(), x0 = Math.max(70, Math.round(W * .45)), room = W - 8 - x0;
    const forts = clamp(1 + (level > 1) + (level > 3), 1, Math.max(1, Math.floor(room / 34)));
    const mats = level < 2 ? ['wood'] : level < 4 ? ['wood', 'glass'] : ['wood', 'glass', 'stone'];
    for (let f = 0; f < forts; f++) {
      let x = x0 + f * 34 + (room - forts * 34) / 2 | 0, y = gy;
      const storeys = level > 2 && Math.random() < .5 ? 2 : 1;
      for (let s = 0; s < storeys; s++) {
        const mat = mats[Math.random() * mats.length | 0];
        bodies.push(body(x, y - 16, 4, 16, mat), body(x + 20, y - 16, 4, 16, mat));
        bodies.push(body(x + 8, y - 8, 8, 8, 'grump'));
        bodies.push(body(x - 2, y - 20, 28, 4, mats[Math.random() * mats.length | 0]));
        y -= 20;
      }
      if (Math.random() < .5 + level * .05) bodies.push(body(x + 8, y - 8, 8, 8, 'grump'));
    }
    shots = Math.min(5, 2 + forts); ball = null; settle = 0;
  }
  const grumps = () => bodies.filter(b => b.mat === 'grump').length;
  function hurt(b, dmg) {
    if (dmg <= 0) return; b.hp -= dmg; b.awake = true;
    if (b.hp <= 0 && !b.dead) {
      b.dead = true; const col = b.mat === 'grump' ? '#68d048' : MAT[b.mat].col;
      feel.juice.burst(b.x + b.w / 2, b.y + b.h / 2, { n: 8, speed: 80, spread: Math.PI, angle: -Math.PI / 2, life: .7, size: 2, gravity: G, color: [col] });
      if (b.mat === 'grump') { score += 1; api.score(score); haptic('medium'); sfx(880, .12, 'square', .05, 300); feel.juice.pop(b.x + 4, b.y - 2, '+1', { color: '#f8d838', size: 8 }); }
      else { haptic('light'); sfx(b.mat === 'glass' ? 1400 : b.mat === 'stone' ? 160 : 320, .08, 'square', .04, -100); }
    }
  }
  const supported = b => b.y + b.h >= ground() - .5 || bodies.some(o => o !== b && !o.dead && Math.abs(o.y - (b.y + b.h)) < 1 && o.x < b.x + b.w - .5 && o.x + o.w > b.x + .5);
  function step(h) {
    const gy = ground();
    for (const b of bodies) {
      if (!b.awake) { if (!supported(b)) b.awake = true; else continue; }
      b.vy += G * h; b.x += b.vx * h; b.y += b.vy * h;
      if (b.y + b.h > gy) { b.y = gy - b.h; if (b.vy > 70) hurt(b, (b.vy - 70) * .9); b.vy = 0; b.vx *= Math.max(0, 1 - 7 * h); }
      if (b.y > H + 20 || b.x > W + 30 || b.x < -30) { if (b.mat === 'grump') { b.hp = 0; hurt(b, 1); } b.dead = true; }
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j]; if (!a.awake && !b.awake) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox <= .01 || oy <= .01) continue;
      const ia = a.awake ? 1 / a.m : 0, ib = b.awake ? 1 / b.m : 0, sum = ia + ib || 1;
      let nx = 0, ny = 0;
      if (ox < oy) nx = a.x + a.w / 2 < b.x + b.w / 2 ? 1 : -1; else ny = a.y + a.h / 2 < b.y + b.h / 2 ? 1 : -1;
      const pen = Math.min(ox, oy); a.x -= nx * pen * ia / sum; a.y -= ny * pen * ia / sum; b.x += nx * pen * ib / sum; b.y += ny * pen * ib / sum;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        if (!b.awake && -rv > 30) { b.awake = true; } if (!a.awake && -rv > 30) a.awake = true;
        const ja = a.awake ? 1 / a.m : 0, jb = b.awake ? 1 / b.m : 0, j = -1.1 * rv / ((ja + jb) || 1);
        a.vx -= j * nx * ja; a.vy -= j * ny * ja; b.vx += j * nx * jb; b.vy += j * ny * jb;
        if (-rv > 45) { hurt(a, (-rv - 35) * clamp(b.m / 60, .4, 2.5)); hurt(b, (-rv - 35) * clamp(a.m / 60, .4, 2.5)); }
        if (ny) { const f = Math.max(0, 1 - 6 * h); const avg = (a.vx * a.m + b.vx * b.m) / (a.m + b.m); if (a.awake) a.vx = avg + (a.vx - avg) * f; if (b.awake) b.vx = avg + (b.vx - avg) * f; }
      }
    }
    if (ball) {
      ball.vy += G * h; ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (ball.y + 3 > gy) { ball.y = gy - 3; ball.vy *= -.3; ball.vx *= Math.max(0, 1 - 5 * h); }
      for (const b of bodies) {
        if (b.dead) continue;
        const cx = clamp(ball.x, b.x, b.x + b.w), cy = clamp(ball.y, b.y, b.y + b.h); let dx = ball.x - cx, dy = ball.y - cy; const d = Math.hypot(dx, dy);
        if (d >= 3) continue;
        if (d < .001) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
        ball.x += dx * (3 - d); ball.y += dy * (3 - d);
        const rv = (ball.vx - b.vx) * dx + (ball.vy - b.vy) * dy; if (rv >= 0) continue;
        b.awake = true; const BM = 70, j = -1.25 * rv / (1 / BM + 1 / b.m);
        ball.vx += j * dx / BM; ball.vy += j * dy / BM; b.vx -= j * dx / b.m; b.vy -= j * dy / b.m;
        hurt(b, (-rv - 25) * 1.1); if (-rv > 60) { haptic('heavy'); sfx(120, .1, 'square', .05, -40); feel.juice.shake(2); }
      }
      ball.t += h;
    }
    bodies = bodies.filter(b => !b.dead);
    for (const b of bodies) if (b.awake) { if (Math.abs(b.vx) + Math.abs(b.vy) < 5 && supported(b)) { b.rest += h; if (b.rest > .35) { b.awake = false; b.vx = b.vy = 0; b.rest = 0; } } else b.rest = 0; }
  }
  function aim() { if (!drag) return null; let dx = drag.x - drag.cx, dy = drag.y - drag.cy; const l = Math.hypot(dx, dy); if (l > PULL) { dx *= PULL / l; dy *= PULL / l; } return { dx, dy, l: Math.min(l, PULL) }; }
  const self = {
    reset() { level = 1; score = 0; t = 0; msg = null; drag = null; still = 0; feel.clear(); build(); },
    resize(w, h) { const old = H; W = w; H = h; if (bodies) for (const b of bodies) b.y += h - old; },
    update(dt) {
      feel.update(dt); t += dt; const n = 4; for (let i = 0; i < n; i++) step(dt / n);
      if (msg) { msg.l -= dt; msg.y -= 12 * dt; if (msg.l <= 0) msg = null; }
      if (ball) {
        still = Math.hypot(ball.vx, ball.vy) < 10 ? still + dt : 0;
        if (still > .5 || ball.x > W + 8 || ball.x < -8 || ball.t > 6) { ball = null; settle = 1.2; }
      } else if (settle > 0) {
        settle -= dt; const busy = bodies.some(b => b.awake);
        if (settle <= 0 || (!busy && settle < .9)) {
          settle = 0;
          if (!grumps()) { score += shots; api.score(score); level++; msg = { txt: `LEVEL ${level}`, x: W / 2, y: H / 2 - 20, l: 1.4 }; haptic('success'); sfx(990, .3, 'square', .05, 500); build(); }
          else if (shots <= 0) { haptic('error'); sfx(140, .4, 'square', .05, -60); return api.over(); }
        }
      }
    },
    fx(dt) { feel.update(dt); },
    draw(c) {
      const gy = ground(), s = sling();
      const g = c.createLinearGradient(0, 0, 0, gy); g.addColorStop(0, '#58b8f8'); g.addColorStop(1, '#c8f0ff'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#f8f8f0'; for (let i = 0; i < 4; i++) { const x = ((i * 70 + t * 4) % (W + 60)) - 30, y = 18 + (i % 2) * 14; c.fillRect(x, y, 22, 5); c.fillRect(x + 5, y - 3, 12, 3); }
      feel.begin(c);
      c.fillStyle = '#78c860'; for (let x = 0; x < W; x += 2) { const hh = 10 + Math.sin(x * .05) * 5 + Math.sin(x * .13) * 3; c.fillRect(x, gy - hh, 2, hh); }
      c.fillStyle = '#48a838'; c.fillRect(0, gy, W, 3); c.fillStyle = '#a06838'; c.fillRect(0, gy + 3, W, H - gy); c.fillStyle = '#804820'; for (let x = 3; x < W; x += 9) c.fillRect(x, gy + 7 + (x % 4), 2, 2);
      // slingshot back arm, bands, stone, front arm
      c.fillStyle = '#784018'; c.fillRect(s.x - 1, s.y + 4, 3, gy - s.y - 4); c.fillRect(s.x - 5, s.y - 4, 2, 9); c.fillRect(s.x + 4, s.y - 4, 2, 9); c.fillRect(s.x - 4, s.y + 3, 9, 2);
      const a = aim(), rest = shots > 0 && !ball && settle <= 0;
      if (rest) {
        const bx = s.x - (a ? a.dx : 0), by = s.y - (a ? a.dy : 0);
        c.strokeStyle = '#402010'; c.lineWidth = 1; c.beginPath(); c.moveTo(s.x - 4, s.y - 3); c.lineTo(bx, by); c.lineTo(s.x + 5, s.y - 3); c.stroke();
        c.fillStyle = '#585868'; c.fillRect(bx - 3, by - 3, 6, 6); c.fillStyle = '#9898a8'; c.fillRect(bx - 2, by - 2, 2, 2);
        if (a && a.l > 5) { let x = bx, y = by, vx = a.dx * POWER, vy = a.dy * POWER; c.fillStyle = '#ffffffc0'; for (let i = 0; i < 14; i++) { for (let k = 0; k < 3; k++) { vy += G * .02; x += vx * .02; y += vy * .02; } if (i % 2 === 0) c.fillRect(x | 0, y | 0, 1, 1); } }
      }
      for (const b of bodies) {
        const x = Math.round(b.x), y = Math.round(b.y);
        if (b.mat === 'grump') {
          const hurtK = b.hp < MAT.grump.hp; c.fillStyle = '#58c040'; c.beginPath(); c.arc(x + 4, y + 4.5, 4, 0, 7); c.fill();
          c.fillStyle = '#90e070'; c.fillRect(x + 2, y + 1, 2, 1); c.fillStyle = '#f8f8f0'; c.fillRect(x + 1, y + 3, 2, 2); c.fillRect(x + 5, y + 3, 2, 2);
          c.fillStyle = '#101018'; c.fillRect(x + 2, y + 4, 1, 1); c.fillRect(x + 5, y + 4, 1, 1); c.fillRect(x + 1, y + 2, 2, 1); c.fillRect(x + 5, y + 2, 2, 1); c.fillRect(x + 3, y + 7, 2, 1);
          if (hurtK) { c.fillStyle = '#e04040'; c.fillRect(x + 6, y + 6, 1, 1); }
          continue;
        }
        const m = MAT[b.mat]; c.fillStyle = m.lo; c.fillRect(x, y, b.w, b.h); c.fillStyle = m.col; c.fillRect(x, y, b.w - 1, b.h - 1); c.fillStyle = m.hi; c.fillRect(x, y, b.w - 1, 1);
        if (b.hp < m.hp * .55) { c.fillStyle = m.lo; c.fillRect(x + (b.w >> 1), y + 1, 1, Math.max(1, b.h - 3)); }
      }
      if (ball) { c.fillStyle = '#585868'; c.beginPath(); c.arc(ball.x, ball.y, 3, 0, 7); c.fill(); c.fillStyle = '#9898a8'; c.fillRect(ball.x - 2 | 0, ball.y - 2 | 0, 1, 1); }
      // front arm
      c.fillStyle = '#904c20'; c.fillRect(s.x + 4, s.y - 4, 2, 9);
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left';
      for (let i = 0; i < shots - (rest ? 1 : 0); i++) { c.fillStyle = '#585868'; c.fillRect(4 + i * 7, gy + 5, 5, 5); }
      c.fillStyle = '#101018'; c.fillText(`L${level}`, 4, 9); c.textAlign = 'right'; c.fillStyle = '#208858'; c.fillText(`${grumps()}`, W - 12, 9); c.fillStyle = '#58c040'; c.fillRect(W - 10, 3, 6, 6);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(msg.txt, msg.x + 1, msg.y + 1); c.fillStyle = '#f8d838'; c.fillText(msg.txt, msg.x, msg.y); }
      if (t < 4 && level === 1 && shots > 0 && !ball) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText('DRAG BACK + LET GO', W / 2, 30); }
    },
    down(x, y) { if (ball || settle > 0 || shots <= 0) return; drag = { x, y, cx: x, cy: y }; },
    move(x, y, p) { if (drag && p) { drag.cx = x; drag.cy = y; } },
    up() {
      const a = aim(); drag = null; if (!a || a.l < 6) return; const s = sling();
      ball = { x: s.x - a.dx, y: s.y - a.dy, vx: a.dx * POWER, vy: a.dy * POWER, t: 0 }; shots--; still = 0;
      haptic('medium'); sfx(300, .12, 'triangle', .05, 500);
    },
    key(k, d) { if (!d) return; if (k === ' ' && !ball && settle <= 0 && shots > 0) { drag = { x: 0, y: 0, cx: -26, cy: 22 }; self.up(); } },
  };
  return self;
}

export default {
  id: 'sling-smash', title: 'Sling Smash', tag: 'Color · Physics', retro: true, era: 'color', pal: 'teal', w: 160, h: 160, maxW: 260, maxH: 230, goal: 12,
  hint: 'Drag back anywhere and let go to fling a stone. Knock blocks onto the grumpy blobs or hit them straight on. Clear them all to reach the next fort; unused stones are bonus points.',
  make,
};
