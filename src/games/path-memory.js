import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// A path lights up across the grid, one square at a time. Then retrace it by tapping the squares
// in the same order. Each round the path gets one step longer. One wrong square ends it.
const P = PAL.rose, W = 160, H = 160, N = 5, CS = 26, OX = 15, OY = 20;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let path, shown, phase, timer, pos, score, t, lit, bad;
  function grow() {
    if (!path.length) { path = [Math.random() * N * N | 0]; }
    while (path.length < 3 + score) {
      const last = path[path.length - 1], x = last % N, y = last / N | 0;
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N).map(([a, b]) => b * N + a).filter(i => i !== path[path.length - 2]);
      path.push(opts[Math.random() * opts.length | 0]);
    }
    phase = 'show'; shown = 0; timer = .6; pos = 0; lit = [];
  }
  const self = {
    reset() { path = []; score = 0; t = 0; bad = null; feel.clear(); grow(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt;
      for (const l of lit) l.l -= dt; lit = lit.filter(l => l.l > 0);
      if (phase === 'show') {
        timer -= dt;
        if (timer <= 0) {
          if (shown < path.length) { lit.push({ i: path[shown], l: .45 }); sfx(300 + shown * 60, .1, 'square', .03); haptic('tick'); shown++; timer = Math.max(.25, .5 - score * .02); }
          else { phase = 'input'; }
        }
      } else if (phase === 'pause') { timer -= dt; if (timer <= 0) { path = path.slice(); grow(); } }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (let i = 0; i < N * N; i++) {
        const x = OX + (i % N) * CS, y = OY + (i / N | 0) * CS, on = lit.find(l => l.i === i);
        c.fillStyle = bad === i ? P[0] : on ? P[0] : P[2]; c.fillRect(x, y, CS - 3, CS - 3);
        if (on) { c.fillStyle = P[3]; c.fillRect(x + 8, y + 8, CS - 19, CS - 19); }
      }
      feel.end(c, W, H);
      c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left';
      c.fillText(phase === 'show' ? 'WATCH' : phase === 'input' ? `YOUR TURN ${pos}/${path.length}` : 'NICE', 4, 10);
    },
    down(x, y) {
      if (phase !== 'input') return; const cx = Math.floor((x - OX) / CS), cy = Math.floor((y - OY) / CS); if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
      const i = cy * N + cx; lit.push({ i, l: .2 });
      if (i !== path[pos]) { bad = path[pos]; lit.push({ i: path[pos], l: 2 }); haptic('error'); sfx(130, .35, 'square', .05, -40); feel.juice.shake(5); phase = 'over'; return api.over(); }
      pos++; haptic('light'); sfx(300 + pos * 60, .06, 'square', .04);
      if (pos >= path.length) { score++; api.score(score); haptic('success'); sfx(990, .15, 'square', .05, 300); phase = 'pause'; timer = .7; feel.juice.burst(OX + cx * CS + 11, OY + cy * CS + 11, { n: 12, speed: 55, life: .5, size: 2, color: [P[0], P[1]] }); }
    },
    key(k, d) { if (d && k === ' ' && phase === 'input') { const i = path[pos]; self.down(OX + (i % N) * CS + 5, OY + (i / N | 0) * CS + 5); } },
  };
  return self;
}

export default {
  id: 'path-memory', title: 'Path Memory', tag: 'Pocket · Memory', retro: true, w: W, h: H, pal: 'rose', goal: 8,
  hint: 'Watch the path light up square by square, then tap the same squares in the same order. Each round adds a step.',
  make,
};
