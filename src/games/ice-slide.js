import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// On ice you can't stop until you hit a rock. Swipe to slide, and come to rest on the flag. Fewer moves score more.
const R = PAL.ice, W = 160, H = 160, N = 9, CS = 14, OX = (W - N * CS) / 2, OY = 22, D = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let rock, p, goal, par, moves, anim, time, score, t, dead, pd, solved, started;
  const isRock = (x, y) => x < 0 || y < 0 || x >= N || y >= N || rock[y * N + x];
  const slide = (x, y, d) => { while (!isRock(x + d[0], y + d[1])) { x += d[0]; y += d[1]; } return [x, y]; };
  function build() {
    for (let tries = 0; ; tries++) {
      rock = Array.from({ length: N * N }, () => Math.random() < .16); const sx = Math.random() * N | 0, sy = N - 1; rock[sy * N + sx] = false;
      const dist = new Map([[sy * N + sx, 0]]), q = [[sx, sy]];
      while (q.length) { const [x, y] = q.shift(), dd = dist.get(y * N + x); for (const d of D) { const [nx, ny] = slide(x, y, d); const k = ny * N + nx; if (!dist.has(k)) { dist.set(k, dd + 1); q.push([nx, ny]); } } }
      const want = Math.min(7, 3 + (score >> 1)), cands = [...dist].filter(([, v]) => v >= want);
      if (cands.length) { const [k, v] = cands[Math.random() * cands.length | 0]; p = { x: sx, y: sy, fx: sx, fy: sy }; goal = { x: k % N, y: k / N | 0 }; par = v; moves = 0; solved = 0; return; }
    }
  }
  return {
    reset() { time = 60; score = 0; t = 0; dead = 0; pd = null; anim = false; started = false; feel.clear(); build(); },
    update(dt) {
      feel.update(dt); t += dt; if (started) time -= dt;   // the clock waits for the first slide
      if (time <= 0) { haptic('warning'); feel.juice.shake(4); return api.over(); }
      const sp = dt * 22; p.fx += Math.sign(p.x - p.fx) * Math.min(Math.abs(p.x - p.fx), sp); p.fy += Math.sign(p.y - p.fy) * Math.min(Math.abs(p.y - p.fy), sp);
      if (anim && p.fx === p.x && p.fy === p.y) { anim = false; haptic('light'); sfx(220, .05, 'square', .03); if (p.x === goal.x && p.y === goal.y) { solved = .001; feel.juice.burst(OX + goal.x * CS + 7, OY + goal.y * CS + 7, { n: 12, speed: 55, life: .45, size: 2, color: [R[0], R[1]] }); } }
      if (solved) { solved += dt; if (solved > .5) { const bonus = Math.max(1, 3 - (moves - par)); score += bonus; api.score(score); time += 12; haptic('success'); sfx(880, .25, 'square', .05, 300); build(); } }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const X = OX + x * CS, Y = OY + y * CS;
        if (rock[y * N + x]) { c.fillStyle = R[0]; c.fillRect(X + 1, Y + 2, CS - 2, CS - 3); c.fillStyle = R[1]; c.fillRect(X + 3, Y + 3, 4, 2); }
        else { c.fillStyle = R[2]; if ((x + y) % 3 === 0) c.fillRect(X + 4, Y + 6, 5, 1); } }
      c.strokeStyle = R[1]; c.strokeRect(OX - .5, OY - .5, N * CS + 1, N * CS + 1);
      const GX = OX + goal.x * CS, GY = OY + goal.y * CS; c.fillStyle = R[0]; c.fillRect(GX + 4, GY + 2, 1, 11); c.fillRect(GX + 5, GY + 2, 6, 4);
      const X = OX + p.fx * CS, Y = OY + p.fy * CS; c.fillStyle = R[0]; c.fillRect(X + 3, Y + 2, 8, 10); c.fillStyle = R[3]; c.fillRect(X + 4, Y + 4, 2, 2); c.fillRect(X + 8, Y + 4, 2, 2); c.fillStyle = R[1]; c.fillRect(X + 3, Y + 10, 8, 2);
      feel.end(c, W, H);
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10); c.textAlign = 'right'; c.fillText(`${moves}/${par}`, W - 4, 10);
    },
    go(d) { if (anim || solved) return; const [nx, ny] = slide(p.x, p.y, d); if (nx === p.x && ny === p.y) return; p.x = nx; p.y = ny; moves++; anim = true; started = true; sfx(600, .08, 'triangle', .02, -300); },
    down(x, y) { pd = { x, y }; },
    up(x, y) { if (!pd) return; const dx = x - pd.x, dy = y - pd.y; pd = null; if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) { const px = OX + p.x * CS + 7, py = OY + p.y * CS + 7, ax = x - px, ay = y - py; this.go(Math.abs(ax) > Math.abs(ay) ? [Math.sign(ax), 0] : [0, Math.sign(ay)]); return; } this.go(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); },
    key(k, d) { if (!d) return; const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k]; if (m) this.go(m); },
  };
}

export default {
  id: 'ice-slide', title: 'Ice Slide', tag: 'Pocket · Puzzle', retro: true, w: W, h: H, pal: 'ice', goal: 6,
  hint: 'Swipe to slide across the ice. You only stop at a rock. Finish on the flag in as few moves as you can.',
  make,
};
