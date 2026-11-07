// __TITLE__: a starter Color (Pocket) game made with `npm run new`. Change anything you like.
// Bright 16-colour pixels. Shows gestures (tap to jump, hold to jump higher), pixel juice and sounds.
import { C16 } from '../palettes.js';
import { haptic } from '../kit/device.js';
import { Juice } from '../kit/juice.js';
import { sounds } from '../kit/sound.js';
import { Gestures } from '../kit/controls.js';

let W = 160, H = 176;
const GROUND = () => H - 24;

function make(api) {
  const fx = new Juice({ pixel: true });
  let y, vy, rocks, score, t, spawn, speed, holdJump, dead;
  const jump = big => { if (y < GROUND() - .5 || dead) return; vy = big ? -190 : -150; sounds.jump(big ? 1.2 : 1); haptic('tick'); fx.burst(30, GROUND(), { n: 5, speed: 40, size: 2, color: C16[13], arc: 2, angle: -Math.PI / 2 }); };
  const g = new Gestures({ tap: () => jump(false), hold: () => { holdJump = true; jump(true); } });

  return {
    reset() { y = GROUND(); vy = 0; rocks = []; score = 0; t = 0; spawn = 1; speed = 70; holdJump = false; dead = 0; fx.clear(); g.release(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      fx.update(dt); g.update();
      if (dead) { dead += dt; if (dead > .8) api.over(); return; }
      t += dt; speed = 70 + t * 2.5; spawn -= dt;
      vy += 520 * dt; y = Math.min(GROUND(), y + vy * dt); if (y >= GROUND()) vy = 0;
      if (spawn <= 0) { spawn = .8 + Math.random() * 1.1; rocks.push({ x: W + 8, h: Math.random() < .3 ? 14 : 8, passed: false }); }
      for (const r of rocks) {
        r.x -= speed * dt;
        if (!r.passed && r.x < 24) { r.passed = true; score++; api.score(score); fx.pop(30, y - 16, '+1', { color: C16[4] }); sounds.blip(1 + score * .01); }
        if (Math.abs(r.x - 30) < 7 && y > GROUND() - r.h) { dead = .01; fx.shake(5).flash(C16[2], .4).burst(30, y - 4, { n: 16, speed: 90, size: 2, color: [C16[2], C16[3], C16[4]], gravity: 200 }); sounds.boom(); haptic('error'); }
      }
      rocks = rocks.filter(r => r.x > -10);
    },
    draw(c) {
      c.fillStyle = C16[7]; c.fillRect(0, 0, W, H);
      c.fillStyle = C16[1]; for (let i = 0; i < 4; i++) { const x = ((i * 53 - t * 12) % (W + 40) + W + 40) % (W + 40) - 20; c.fillRect(Math.round(x), 20 + i * 11, 18, 5); }
      fx.begin(c);
      c.fillStyle = C16[5]; c.fillRect(0, GROUND(), W, 4); c.fillStyle = C16[11]; c.fillRect(0, GROUND() + 4, W, H);
      for (const r of rocks) { c.fillStyle = C16[13]; c.fillRect(Math.round(r.x) - 5, GROUND() - r.h, 10, r.h); c.fillStyle = C16[14]; c.fillRect(Math.round(r.x) - 5, GROUND() - r.h, 10, 2); }
      if (!dead) { const yy = Math.round(y); c.fillStyle = C16[9]; c.fillRect(24, yy - 12, 12, 12); c.fillStyle = C16[1]; c.fillRect(31, yy - 10, 3, 3); c.fillStyle = C16[0]; c.fillRect(32, yy - 9, 1, 1); }
      fx.end(c, W, H);
      if (t < 3) { c.fillStyle = C16[0]; c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('TAP: JUMP', W / 2, 70); c.fillText('HOLD: BIG JUMP', W / 2, 82); }
    },
    down: (x, y, id) => g.down(x, y, id),
    move: (x, y, p, id) => g.move(x, y, p, id),
    up: (x, y, id) => g.up(x, y, id),
    key(k, d) { if (d && (k === ' ' || k === 'ArrowUp')) jump(false); },
    debug(c) { c.strokeStyle = '#f0f'; c.strokeRect(23, y - 12, 14, 12); for (const r of rocks) c.strokeRect(r.x - 5, GROUND() - r.h, 10, r.h); },
  };
}

export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Color · Runner',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 240,
  goal: 25,
  hint: 'Tap to jump over the rocks. Hold for a big jump over the tall ones.',
  creator: '__CREATOR__',
  make,
};
