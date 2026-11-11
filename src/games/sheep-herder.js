import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// Drag the dog around the field. Sheep run away from it, so circle behind them and drive the
// flock through the gate into the pen. Clear the field for more time and a bigger flock.
const P = PAL.moss, W = 160, H = 160, PEN = { x: 112, y: 6, w: 42, h: 40 }, GATE = { x0: 112, x1: 142 };

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let dog, sheep, time, score, t, target, level, started;
  function field() {
    sheep = []; const n = Math.min(10, 3 + level);
    for (let i = 0; i < n; i++) sheep.push({ x: rnd(20, 100), y: rnd(70, 140), vx: 0, vy: 0, in: false, ph: rnd(0, 6), bleat: 0 });
  }
  const inPen = s => s.x > PEN.x + 2 && s.x < PEN.x + PEN.w - 2 && s.y > PEN.y + 2 && s.y < PEN.y + PEN.h - 2;
  const self = {
    get _s() { return { sheep, dog }; },
    reset() { dog = { x: 30, y: 40 }; target = null; time = 40; score = 0; t = 0; level = 0; started = false; feel.clear(); field(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (started) time -= dt;   // the clock waits for the first drag
      if (time <= 0) { haptic('success'); return api.over(); }
      if (target) { const dx = target.x - dog.x, dy = target.y - dog.y, d = Math.hypot(dx, dy), sp = Math.min(d, 90 * dt); if (d > .5) { dog.x += dx / d * sp; dog.y += dy / d * sp; } }
      for (const s of sheep) {
        s.ph += dt; s.bleat -= dt;
        let ax = Math.cos(s.ph * .7) * 6, ay = Math.sin(s.ph * .9) * 6;
        const dx = s.x - dog.x, dy = s.y - dog.y, d = Math.hypot(dx, dy);
        if (d < 34 && d > 0) { const f = (34 - d) * 9; ax += dx / d * f; ay += dy / d * f; if (s.bleat <= 0 && d < 16) { s.bleat = 1.5; sfx(rnd(500, 700), .1, 'square', .02, -100); } }
        for (const o of sheep) { if (o === s) continue; const ox = s.x - o.x, oy = s.y - o.y, od = Math.hypot(ox, oy); if (od < 7 && od > 0) { ax += ox / od * 60; ay += oy / od * 60; } else if (od < 30) { ax -= ox * .4; ay -= oy * .4; } }
        s.vx = (s.vx + ax * dt) * Math.pow(.15, dt); s.vy = (s.vy + ay * dt) * Math.pow(.15, dt);
        const sp = Math.hypot(s.vx, s.vy); if (sp > 55) { s.vx *= 55 / sp; s.vy *= 55 / sp; }
        const nx = clamp(s.x + s.vx * dt, 4, W - 4), ny = clamp(s.y + s.vy * dt, 14, H - 4);
        // pen walls: only the gate on the bottom side is open
        const wasIn = s.in, crossing = (s.y >= PEN.y + PEN.h) !== (ny >= PEN.y + PEN.h) && nx > PEN.x && nx < PEN.x + PEN.w;
        const sideHit = (ny < PEN.y + PEN.h && ny > PEN.y) && ((s.x <= PEN.x) !== (nx <= PEN.x) || (s.x >= PEN.x + PEN.w) !== (nx >= PEN.x + PEN.w));
        if (crossing && !(nx > GATE.x0 && nx < GATE.x1)) s.vy *= -.5; else if (sideHit) s.vx *= -.5; else { s.x = nx; s.y = ny; }
        if (s.in) { s.x = clamp(s.x, PEN.x + 3, PEN.x + PEN.w - 3); s.y = clamp(s.y, PEN.y + 3, PEN.y + PEN.h - 3); }
        if (!wasIn && inPen(s)) { s.in = true; score++; api.score(score); haptic('success'); sfx(880, .08, 'square', .04, 200); feel.juice.burst(s.x, s.y, { n: 6, speed: 40, life: .4, size: 2, color: [P[0], P[1]] }); }
      }
      if (sheep.every(s => s.in)) { level++; time += 15; haptic('success'); sfx(990, .2, 'square', .05, 300); feel.juice.pop(PEN.x + PEN.w / 2, PEN.y + PEN.h + 12, '+15S', { color: P[0], size: 6 }); field(); }
    },
    draw(c) {
      c.fillStyle = P[2]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = P[1]; for (let i = 0; i < 60; i++) c.fillRect((i * 53) % W, 12 + (i * 37) % 148, 1, 2);
      c.fillStyle = P[3]; c.fillRect(PEN.x, PEN.y, PEN.w, PEN.h);
      c.fillStyle = P[0]; c.fillRect(PEN.x, PEN.y, 2, PEN.h); c.fillRect(PEN.x + PEN.w - 2, PEN.y, 2, PEN.h); c.fillRect(PEN.x, PEN.y, PEN.w, 2);
      c.fillRect(GATE.x1, PEN.y + PEN.h - 2, PEN.x + PEN.w - GATE.x1, 2);
      for (let x = PEN.x; x < PEN.x + PEN.w; x += 6) { c.fillRect(x, PEN.y - 2, 2, 4); if (x >= GATE.x1) c.fillRect(x, PEN.y + PEN.h - 4, 2, 4); }
      for (const s of sheep) {
        const x = Math.round(s.x), y = Math.round(s.y), dir = s.vx >= 0 ? 1 : -1;
        c.fillStyle = P[3]; c.fillRect(x - 4, y - 3, 8, 6); c.fillRect(x - 3, y - 4, 6, 8);
        c.fillStyle = P[0]; c.fillRect(x + dir * 4 - (dir < 0 ? 2 : 0), y - 2, 2, 3); c.fillRect(x - 3, y + 3, 1, 2); c.fillRect(x + 2, y + 3, 1, 2);
      }
      const dx = Math.round(dog.x), dy = Math.round(dog.y); c.fillStyle = P[0]; c.fillRect(dx - 4, dy - 2, 8, 4); c.fillRect(dx + 3, dy - 4, 3, 3); c.fillRect(dx - 5, dy - 3, 2, 2); c.fillRect(dx - 3, dy + 2, 1, 2); c.fillRect(dx + 2, dy + 2, 1, 2);
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = P[0]; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
      if (t < 4 || !started) { c.fillStyle = P[0]; c.fillText('DRAG THE DOG', 4, 154); }
    },
    down(x, y) { started = true; target = { x, y }; },
    move(x, y, p) { if (p) target = { x, y }; },
    up() { target = null; },
    key(k, d) { const m = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[k]; if (d && m) { started = true; target = { x: dog.x + m[0], y: dog.y + m[1] }; } },
  };
  return self;
}

export default {
  id: 'sheep-herder', title: 'Sheep Herder', tag: 'Pocket · Action', retro: true, w: W, h: H, pal: 'moss', goal: 8,
  hint: 'Drag the dog around. Sheep run away from it, so get behind them and drive them through the gap into the pen. A full pen adds time.',
  make,
};
