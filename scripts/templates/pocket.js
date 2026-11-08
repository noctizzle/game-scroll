// __TITLE__: a starter Dot matrix (Pocket) game made with `npm run new`. Change anything you like.
// Four shades only, crisp pixels. Shows the controls kit (a slider stick), pixel juice and music.
import gs from '../gamescroll.js';
const { sounds, music } = gs.sound;
const { haptic } = gs.device;
const { PAL } = gs.palettes;
const { Juice } = gs.juice;
const { Stick, Keys } = gs.controls;

const R = PAL.moss;            // R[0] darkest ... R[3] lightest (the background)
let W = 160, H = 160;

function make(api) {
  const fx = new Juice({ pixel: true });
  const stick = new Stick({ r: 24, floating: true, axis: 'x', color: R[1] });
  const keys = new Keys();
  const tune = music({ tempo: 132, lead: 'E5 . G5 . A5 - G5 . E5 . D5 . C5 - . .', bass: 'C3 . C3 . G2 . G2 . A2 . A2 . F2 . G2 .', drums: 'k . h . s . h . k . h . s . h h' });
  let px, drops, score, t, spawn, lives, started;

  return {
    reset() { px = W / 2; drops = []; score = 0; t = 0; spawn = 0; lives = 3; started = false; fx.clear(); stick.release(); keys.clear(); stick.place(W / 2, H - 20, [0, 0, W, H]); },
    resize(w, h) { W = w; H = h; stick.place(W / 2, H - 20, [0, 0, W, H]); },
    update(dt) {
      if (!started) { started = true; tune.start(); }   // start music in update, not reset (reset runs before play)
      fx.update(dt); t += dt; spawn -= dt;
      const dir = stick.active ? stick.x : keys.axis().x;
      px = Math.max(8, Math.min(W - 8, px + dir * 110 * dt));
      if (spawn <= 0) { spawn = Math.max(.3, .9 - t / 60); drops.push({ x: 6 + Math.random() * (W - 12), y: -6, v: 40 + t * 1.5, bad: Math.random() < .25 }); }
      for (const d of drops) d.y += d.v * dt;
      for (const d of drops) {
        if (d.y > H - 22 && d.y < H - 12 && Math.abs(d.x - px) < 10) {
          d.y = H + 99;
          if (d.bad) { lives--; fx.shake(3); sounds.hurt(); haptic('warning'); }
          else { score++; api.score(score); fx.burst(d.x, H - 18, { n: 8, speed: 50, size: 2, color: R[1], gravity: 80 }).pop(d.x, H - 30, '+1', { color: R[0] }); sounds.coin(); haptic('light'); }
        }
      }
      drops = drops.filter(d => d.y < H + 10);
      tune.speed(1 + Math.min(.4, t / 120));
      if (lives <= 0) { tune.stop(); api.over(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      fx.begin(c);
      c.fillStyle = R[2]; c.fillRect(0, H - 10, W, 10);
      for (const d of drops) { c.fillStyle = d.bad ? R[0] : R[1]; c.fillRect(Math.round(d.x) - 2, Math.round(d.y) - 2, 5, 5); if (d.bad) { c.fillStyle = R[3]; c.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); } }
      c.fillStyle = R[0]; c.fillRect(Math.round(px) - 8, H - 18, 16, 6); c.fillRect(Math.round(px) - 8, H - 22, 2, 4); c.fillRect(Math.round(px) + 6, H - 22, 2, 4);
      fx.end(c, W, H);
      c.fillStyle = R[0]; for (let i = 0; i < lives; i++) c.fillRect(4 + i * 7, 4, 5, 5);
      if (t < 3) { c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('DRAG TO MOVE', W / 2, H / 2); }
    },
    down: (x, y, id) => stick.down(x, y, id),
    move: (x, y, p, id) => stick.move(x, y, p, id),
    up: (x, y, id) => stick.up(x, y, id),
    key: (k, d) => keys.key(k, d),
    debug(c) { c.strokeStyle = '#f00'; c.strokeRect(px - 10, H - 22, 20, 10); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Pocket · Arcade',
  retro: true, pal: 'moss',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Drag left and right to catch the light drops. Dodge the dark ones: three and it is over.',
  creator: '__CREATOR__',
  make,
};
