import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;

// Run the lift in a six-floor block. Tap a floor to send the lift there. Riders get off at their
// floor and anyone waiting gets on (four at most). Leave someone waiting too long and they storm off.
const P = PAL.mint, W = 160, H = 160, FLOORS = 6, FH = 22, BASE = 150, SX = 62, SW = 22, CAP = 4;
const fy = f => BASE - f * FH;   // floor line y

function make(api) {
  let lift, waiting, riders, score, lives, t, spawn, dwell, storm, mood;
  return {
    reset() { lift = { y: fy(0), to: 0, at: 0 }; waiting = []; riders = []; score = 0; lives = 3; t = 0; spawn = .5; dwell = 0; storm = []; },
    update(dt) {
      t += dt; spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(1.1, 3 - t / 40) * rnd(.7, 1.3);
        const from = Math.random() * FLOORS | 0; let to = Math.random() * (FLOORS - 1) | 0; if (to >= from) to++;
        if (waiting.filter(w => w.f === from).length < 4) waiting.push({ f: from, to, wait: 0, max: Math.max(9, 18 - t / 15) });
      }
      const ty = fy(lift.to), d = ty - lift.y;
      if (Math.abs(d) > .5) { lift.y += clamp(d, -60 * dt, 60 * dt); dwell = 0; }
      else if (lift.y !== ty) {
        lift.y = ty; lift.at = lift.to; dwell = .4; sfx(880, .05, 'square', .03); haptic('light');
        const out = riders.filter(r => r.to === lift.at); riders = riders.filter(r => r.to !== lift.at);
        if (out.length) { score += out.length; api.score(score); haptic('success'); sfx(660, .1, 'square', .04, 200); }
        const here = waiting.filter(w => w.f === lift.at);
        for (const w of here) { if (riders.length >= CAP) break; riders.push(w); waiting.splice(waiting.indexOf(w), 1); }
      }
      if (dwell > 0) dwell -= dt;
      for (const w of waiting) w.wait += dt;
      for (const w of waiting.filter(w => w.wait > w.max)) {
        waiting.splice(waiting.indexOf(w), 1); lives--; storm.push({ f: w.f, x: SX - 10, l: 1.2 }); haptic('error'); sfx(150, .25, 'square', .05, -40);
        if (lives <= 0) return api.over();
      }
      for (const s of storm) { s.l -= dt; s.x -= dt * 40; } storm = storm.filter(s => s.l > 0);
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[2]; c.fillRect(SX - 2, fy(FLOORS - 1) - FH + 2, SW + 4, BASE - fy(FLOORS - 1) + FH - 2);
      c.font = '6px "Press Start 2P", monospace';
      for (let f = 0; f < FLOORS; f++) {
        const y = fy(f); c.fillStyle = P[1]; c.fillRect(4, y, W - 8, 2);
        c.fillStyle = P[1]; c.textAlign = 'left'; c.fillText(String(f), 6, y - 6);
        const q = waiting.filter(w => w.f === f);
        q.forEach((w, i) => {
          const x = SX - 12 - i * 10, k = w.wait / w.max;
          c.fillStyle = k > .7 && (t * 6 | 0) % 2 ? P[1] : P[0]; c.fillRect(x, y - 12, 5, 8); c.fillRect(x + 1, y - 15, 3, 3);
          c.fillStyle = P[0]; c.fillRect(x - 1, y - 21, 7, 5); c.fillStyle = P[3]; c.fillText(String(w.to), x, y - 16);
        });
      }
      // lift car
      const ly = Math.round(lift.y); c.fillStyle = P[0]; c.fillRect(SX, ly - FH + 3, SW, FH - 3); c.fillStyle = P[3]; c.fillRect(SX + 2, ly - FH + 5, SW - 4, FH - 7);
      riders.forEach((r, i) => { const x = SX + 3 + i * 5; c.fillStyle = P[0]; c.fillRect(x, ly - 10, 3, 8); c.fillRect(x, ly - 13, 3, 2); });
      c.fillStyle = P[1]; c.fillRect(SX + SW / 2, 0, 1, ly - FH + 3);
      // rider destinations on the right panel
      c.fillStyle = P[0]; c.textAlign = 'left'; c.fillText('TO', 100, 22); riders.forEach((r, i) => { c.fillText(String(r.to), 100 + i * 10, 32); });
      for (const s of storm) { c.globalAlpha = Math.min(1, s.l); c.fillStyle = P[0]; c.fillText('!', s.x, fy(s.f) - 6); c.globalAlpha = 1; }
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? P[0] : P[2]; c.fillRect(W - 10 - i * 8, 4, 5, 5); }
      if (t < 4) { c.fillStyle = P[1]; c.textAlign = 'left'; c.fillText('TAP A FLOOR', 100, 50); }
    },
    down(x, y) { const f = clamp(Math.floor((BASE - y) / FH), 0, FLOORS - 1); if (f !== lift.to) { lift.to = f; haptic('tick'); sfx(400, .03, 'square', .03); } },
    key(k, d) { if (!d) return; if (k === 'ArrowUp') lift.to = Math.min(FLOORS - 1, lift.to + 1); if (k === 'ArrowDown') lift.to = Math.max(0, lift.to - 1); },
  };
}

export default {
  id: 'lift-operator', title: 'Lift Operator', tag: 'Pocket · Strategy', retro: true, w: W, h: H, pal: 'mint', goal: 30,
  hint: 'Tap a floor to send the lift there. People show the floor they want above their heads. Four riders at a time. Three people storming off ends your shift.',
  make,
};
