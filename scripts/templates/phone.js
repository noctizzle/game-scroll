// __TITLE__: a starter Phone (Casual) game made with `npm run new`. Change anything you like.
// It shows the maker kits in use: juice (particles, shake, pop-up text), sound and a save slot.
import { haptic } from '../kit/device.js';
import { Juice, ease } from '../kit/juice.js';
import { sounds, noise } from '../kit/sound.js';

let W = 360, H = 640;

function make(api) {
  const fx = new Juice();
  let orbs, score, t, lives, combo, spawn;
  // The save slot is this game's own: here it keeps a running total of orbs popped, ever.
  let total = api.load({ popped: 0 }).popped;

  return {
    reset() { orbs = []; score = 0; t = 0; lives = 3; combo = 0; spawn = 0; fx.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      fx.update(dt);
      if (fx.frozen) return;                      // hit-stop: freeze the action for a moment
      t += dt; spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(.35, 1.1 - t / 40);
        const o = { x: 40 + Math.random() * (W - 80), y: 120 + Math.random() * (H - 240), r: 0, life: 2.4, gold: Math.random() < .12 };
        fx.tween(o, { r: o.gold ? 22 : 28 }, .35, ease.outBack);   // orbs pop in with a little overshoot
        orbs.push(o);
      }
      for (const o of orbs) o.life -= dt;
      const missed = orbs.filter(o => o.life <= 0);
      if (missed.length) {
        orbs = orbs.filter(o => o.life > 0);
        lives -= missed.length; combo = 0;
        fx.shake(8).flash('#ff3050', .25); sounds.hurt(); haptic('warning');
        if (lives <= 0) { api.save({ popped: total }); sounds.lose(); api.over(); }
      }
    },
    draw(c) {
      c.fillStyle = '#141a2b'; c.fillRect(0, 0, W, H);
      fx.begin(c);                                // everything between begin and end shakes
      for (const o of orbs) {
        const warn = o.life < .7 && (o.life * 10 | 0) % 2;
        c.fillStyle = o.gold ? '#ffd23f' : warn ? '#ff6b81' : '#4fc3ff';
        c.beginPath(); c.arc(o.x, o.y, o.r, 0, 7); c.fill();
        c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(o.x - o.r * .3, o.y - o.r * .3, o.r * .3, 0, 7); c.fill();
      }
      fx.end(c, W, H);                            // particles, pop-up text, flash
      c.fillStyle = '#ffffffcc'; c.font = '700 16px Rubik, sans-serif'; c.textAlign = 'left';
      c.fillText('♥'.repeat(Math.max(0, lives)), 16, H - 24);
      c.textAlign = 'right'; c.font = '500 13px Rubik, sans-serif'; c.fillText(`${total} popped ever`, W - 16, H - 24);
    },
    down(x, y) {
      const i = orbs.findIndex(o => Math.hypot(o.x - x, o.y - y) < o.r + 12);
      if (i < 0) { combo = 0; return; }
      const o = orbs.splice(i, 1)[0], pts = (o.gold ? 5 : 1) * (1 + Math.min(4, combo >> 2));
      combo++; total++; score += pts; api.score(score);
      fx.burst(o.x, o.y, { n: o.gold ? 24 : 14, speed: 160, color: o.gold ? ['#ffd23f', '#fff'] : ['#4fc3ff', '#b8ecff'], gravity: 260 })
        .pop(o.x, o.y - 20, '+' + pts, { color: o.gold ? '#ffd23f' : '#fff' });
      if (o.gold) { fx.shake(4).freeze(.05); noise(.2, { vol: .06, from: 6000, to: 1500 }); }
      sounds.coin(1 + Math.min(combo, 12) * .04); haptic(o.gold ? 'medium' : 'light');
      if (total % 10 === 0) api.save({ popped: total });   // save now and then, not every tap
    },
    // Debug overlay (press ` in npm run dev, then H): outline the tap areas.
    debug(c) { c.strokeStyle = '#0f8'; for (const o of orbs) { c.beginPath(); c.arc(o.x, o.y, o.r + 12, 0, 7); c.stroke(); } },
  };
}

export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Casual · Reflex',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 40,
  hint: 'Tap the orbs before they fade. Gold ones are worth more. Miss three and it is over.',
  creator: '__CREATOR__',
  make,
};
