// Yo-Yo Tricks: flick down to throw the yo-yo. At the end of the string it "sleeps", spinning, and
// slowly runs down. While it sleeps, swipe the way the card shows to pull off tricks (each one costs
// spin). Tap to call it back up before it stops: only a caught yo-yo banks its tricks.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp } = gs.util;

const R = PAL.rose;
let W = 160, H = 160;
const TRICKS = [
  { name: 'WALK THE DOG', dir: 'right', cost: .22 },
  { name: 'AROUND WORLD', dir: 'up', cost: .3 },
  { name: 'ROCK CRADLE', dir: 'left', cost: .25 },
  { name: 'BREAKAWAY', dir: 'down', cost: .18 },
];

function make(api) {
  const feel = new Feel({ pixel: true });
  let phase, y, vy, spin, ang, card, bank, score, drops, t, swipe, msg, ml, done, wobble;
  const HAND = () => ({ x: Math.round(W / 2), y: 22 }), END = () => H - 34;

  function newCard() { card = TRICKS[Math.random() * TRICKS.length | 0]; }
  function lose(why) { drops++; msg = why; ml = 1.2; bank = 0; feel.hurt(W / 2, y); haptic('error'); sfx(130, .25, 'square', .04); phase = 'hand'; y = HAND().y + 8; if (drops >= 3) { feel.lose(); api.over(); } }

  return {
    reset() { phase = 'hand'; y = 30; vy = 0; spin = 0; ang = 0; bank = 0; score = 0; drops = 0; t = 0; swipe = null; msg = ''; ml = 0; done = 0; wobble = 0; newCard(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; wobble = Math.max(0, wobble - dt);
      ang += spin * 30 * dt;
      if (phase === 'down') { y += vy * dt; if (y >= END()) { y = END(); phase = 'sleep'; sfx(300, .1, 'triangle', .03); haptic('light'); } }
      if (phase === 'sleep') {
        spin -= (.07 + done * .01) * dt;
        if (spin < .25 && Math.random() < dt * 6) haptic('tick');
        if (spin <= 0) { spin = 0; lose('IT STOPPED'); }
      }
      if (phase === 'up') { y -= 260 * dt; if (y <= HAND().y + 8) { y = HAND().y + 8; phase = 'hand'; if (bank) { score += bank; api.score(score); msg = `CAUGHT +${bank}`; ml = 1; notes('C5 E5 G5', { len: .05 }); feel.coin(W / 2, y); haptic('success'); } bank = 0; done = 0; } }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let i = 0; i < 12; i++) c.fillRect((i * 53) % W, 30 + (i * 37) % (H - 50), 2, 2);
      const h = HAND();
      feel.begin(c);
      // hand
      c.fillStyle = R[1]; c.fillRect(h.x - 8, h.y - 12, 16, 10); c.fillRect(h.x - 4, h.y - 2, 8, 4);
      // string and the yo-yo (sways during tricks)
      const sway = wobble > 0 ? Math.round(Math.sin(wobble * 12) * 16 * wobble) : 0, yx = h.x + sway, yy = Math.round(y);
      c.fillStyle = R[0]; for (let k = h.y; k < yy - 6; k += 2) c.fillRect(Math.round(h.x + sway * (k - h.y) / Math.max(1, yy - h.y)), k, 1, 1);
      c.fillStyle = R[0]; c.fillRect(yx - 7, yy - 7, 14, 14); c.fillStyle = R[1]; c.fillRect(yx - 5, yy - 5, 10, 10);
      const sx = Math.round(Math.cos(ang) * 3), sy = Math.round(Math.sin(ang) * 3); c.fillStyle = R[3]; c.fillRect(yx + sx - 1, yy + sy - 1, 2, 2); c.fillStyle = R[0]; c.fillRect(yx - 1, yy - 1, 2, 2);
      feel.end(c, W, H);
      // spin meter on the left
      c.fillStyle = R[0]; c.fillRect(4, 30, 6, 90); c.fillStyle = R[3]; c.fillRect(5, 31, 4, 88);
      c.fillStyle = spin < .25 ? R[0] : R[1]; const sh = Math.round(88 * clamp(spin, 0, 1)); c.fillRect(5, 31 + 88 - sh, 4, sh);
      // the trick card
      if (phase === 'sleep') {
        c.fillStyle = R[0]; c.fillRect(W - 66, 30, 62, 32);
        text(c, card.name, W - 35, 34, { align: 'center', color: R[3], font: 'small' });
        const ax = W - 35, ay = 50, d = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[card.dir];
        c.fillStyle = R[3]; for (let k = -6; k <= 6; k++) c.fillRect(ax + d[0] * k, ay + d[1] * k, 1, 1); c.fillRect(ax + d[0] * 6 - 1, ay + d[1] * 6 - 1, 3, 3);
        text(c, bank ? `+${bank}` : '', W - 35, 66, { align: 'center', color: R[0] });
      }
      text(c, `${score}`, 4, 3, { color: R[0] });
      for (let i = 0; i < 3 - drops; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 3, 4, 4); }
      if (ml > 0) text(c, msg, W / 2, H - 14, { align: 'center', color: R[0] });
      else if (phase === 'hand') text(c, 'FLICK DOWN', W / 2, H - 14, { align: 'center', color: R[0] });
      else if (phase === 'sleep' && score === 0 && t < 20) text(c, 'SWIPE TRICK, TAP TO CATCH', W / 2, H - 14, { align: 'center', color: R[0] });
    },
    down(x, y0) { swipe = { x, y: y0, t }; },
    up(x, y1) {
      if (!swipe) return;
      const dx = x - swipe.x, dy = y1 - swipe.y, d = Math.hypot(dx, dy), fast = d / Math.max(.05, t - swipe.t); swipe = null;
      if (phase === 'hand') { if (dy > 20) { phase = 'down'; spin = clamp(fast / 900, .35, 1); vy = 200 + spin * 140; sfx(500, .1, 'triangle', .03, -200); haptic('medium'); } return; }
      if (phase !== 'sleep') return;
      if (d < 12) { phase = 'up'; sfx(400, .08, 'triangle', .03, 300); return; }
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (dir === card.dir) {
        done++; bank += done + 1; spin -= card.cost; wobble = .8;
        feel.juice.pop(W / 2, Math.round(H * .4), card.name, { color: R[0] }); notes(['C5', 'D5', 'E5', 'G5', 'A5'][Math.min(4, done - 1)], { len: .06 }); haptic('light');
        if (spin <= 0) { spin = 0; lose('OUT OF SPIN'); return; }
        newCard();
      } else { spin -= .12; wobble = .4; sfx(200, .1, 'square', .03); haptic('warning'); msg = 'WRONG WAY'; ml = .7; }
    },
    key(k, d) {
      if (!d) return;
      const map = { ArrowRight: [30, 0], ArrowLeft: [-30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30], ' ': [0, 0] };
      const m = map[k]; if (!m) return; swipe = { x: 80, y: 80, t: t - .05 }; this.up(80 + m[0], 80 + m[1]);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'yoyo-tricks',
  title: 'Yo-Yo Tricks',
  tag: 'Pocket · Tricks',
  retro: true, pal: 'rose',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Flick down to throw. While the yo-yo sleeps, swipe the way the card shows for tricks, then tap to catch it before it stops. Only caught tricks score.',
  make,
};
