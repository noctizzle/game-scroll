import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Feel } = gs.effects;

// Stop the stopwatch exactly on the target time. After the first few, the display blanks out
// part-way so you have to count in your head. Within a tenth scores; three bigger misses end it.
const P = PAL.mono, W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  let clock, target, running, hideAt, score, strikes, t, res, round, wait;
  function next() { round++; target = [1, 2, 3, 4, 5][Math.random() * Math.min(5, 2 + round / 2) | 0] + (round > 6 ? [0, .5][Math.random() * 2 | 0] : 0); clock = 0; running = false; hideAt = round > 2 ? Math.max(.5, target * (round > 8 ? .3 : .55)) : 99; res = null; wait = 0; }
  const self = {
    reset() { score = 0; strikes = 0; t = 0; round = 0; feel.clear(); next(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (running) { clock += dt; if (clock > target + 2) stop(); }
      if (wait > 0) { wait -= dt; if (wait <= 0) { if (strikes >= 3) return api.over(); next(); } }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`STOP AT ${target.toFixed(2)}`, 80, 30);
      // watch face
      c.fillStyle = P[1]; c.fillRect(70, 38, 20, 6); c.beginPath(); c.arc(80, 90, 44, 0, 7); c.fill(); c.fillStyle = P[2]; c.beginPath(); c.arc(80, 90, 38, 0, 7); c.fill();
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; c.fillStyle = P[0]; c.fillRect(80 + Math.cos(a) * 33 - 1, 90 + Math.sin(a) * 33 - 1, 2, 2); }
      const hidden = running && clock > hideAt;
      if (!hidden) { const a = clock / 5 * 6.283 - 1.571; c.strokeStyle = P[0]; c.lineWidth = 2; c.beginPath(); c.moveTo(80, 90); c.lineTo(80 + Math.cos(a) * 30, 90 + Math.sin(a) * 30); c.stroke(); }
      c.fillStyle = P[0]; c.fillRect(70, 100, 20, 10); c.fillStyle = P[3]; c.font = '6px "Press Start 2P", monospace';
      c.fillText(hidden ? '?.??' : clock.toFixed(2), 80, 108);
      if (res) { c.fillStyle = P[0]; c.fillText(res.txt, 80, 148); c.fillText((res.d >= 0 ? '+' : '') + res.d.toFixed(2), 80, 157); }
      else c.fillText(running ? 'TAP TO STOP' : 'TAP TO START', 80, 148);
      feel.end(c, W, H);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < strikes ? P[0] : P[2]; c.fillRect(W - 10 - i * 8, 4, 5, 5); }
    },
    down() {
      if (wait > 0) return;
      if (!running) { running = true; clock = 0; haptic('light'); sfx(600, .04, 'square', .03); return; }
      stop();
    },
    key(k, d) { if (d && k === ' ') self.down(); },
  };
  return self;
  function stop() {
    running = false; const d = clock - target, ad = Math.abs(d);
    if (ad <= .1) { const pts = ad <= .02 ? 5 : ad <= .05 ? 3 : 1; score += pts; api.score(score); res = { txt: pts === 5 ? 'BULLSEYE' : pts === 3 ? 'CLOSE' : 'OK', d }; haptic(pts === 5 ? 'success' : 'medium'); sfx(700 + pts * 80, .1, 'square', .04, 200);
      feel.juice.burst(80, 90, { n: 4 + pts * 3, speed: 70, life: .45, size: 2, color: [P[0], P[1]] }).pop(80, 62, `+${pts}`, { color: P[0], size: 6 }); }
    else { strikes++; res = { txt: 'MISS', d }; haptic('error'); sfx(150, .25, 'square', .05, -40); feel.juice.shake(3); }
    wait = 1.3;
  }
}

export default {
  id: 'stop-clock', title: 'Stop the Clock', tag: 'Pocket · Timing', retro: true, w: W, h: H, pal: 'mono', goal: 20,
  hint: 'Tap to start the stopwatch and tap again to stop it on the target time. Later the hand vanishes, so count in your head. Three misses ends it.',
  make,
};
