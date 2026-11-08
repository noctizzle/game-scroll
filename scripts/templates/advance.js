// __TITLE__: a starter Advance (Pocket) game made with `npm run new`. Change anything you like.
// Rich pixel colours. Shows real 2D physics (crates that tumble), pixel text, pixel juice, sounds and a save slot.
import gs from '../gamescroll.js';
const { sounds } = gs.sound;
const { haptic } = gs.device;
const { C16 } = gs.palettes;
const { Juice } = gs.juice;
const { Physics } = gs.physics;
const { text } = gs.pixel;

let W = 192, H = 160;

function make(api) {
  const fx = new Juice({ pixel: true });
  let world, hook, held, score, fallen, t, settle;
  let best = api.load({ tallest: 0 }).tallest;   // this game's save slot: the tallest tower ever

  function setup() {
    world = new Physics({ gravity: 500, scale: 16 });   // Rapier: made in reset(), so the engine has loaded
    world.box(W / 2, H - 8, 70, 16, { fixed: true, tag: 'base' });
    world.onHit((a, b, speed) => { if (speed > 90) { sounds.hit(.6 + Math.random() * .3); fx.shake(Math.min(3, speed / 80)); } });
  }
  const newCrate = () => { held = { w: 18 + (Math.random() * 3 | 0) * 6, h: 12 + (Math.random() * 2 | 0) * 4, col: C16[2 + (Math.random() * 8 | 0)] }; };
  const towerTop = () => world.things.reduce((m, b) => b.tag === 'crate' && b.sleeping ? Math.min(m, b.y - b.h / 2) : m, H - 16);

  return {
    reset() { setup(); hook = { x: W / 2, dir: 1 }; score = 0; fallen = 0; t = 0; settle = 0; newCrate(); fx.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      fx.update(dt); t += dt;
      world.step(dt);
      hook.x += hook.dir * (40 + score * 3) * dt;
      if (hook.x < 20 || hook.x > W - 20) hook.dir *= -1;
      if (!held) { settle -= dt; if (settle <= 0) newCrate(); }
      for (const b of world.things) if (b.tag === 'crate' && b.y > H + 20) {
        world.remove(b); fallen++; fx.flash(C16[2], .3); sounds.hurt(); haptic('warning');
        if (fallen >= 3) { sounds.lose(); api.over(); }
      }
      // score: how many crates high the settled tower is
      const height = Math.round((H - 16 - towerTop()) / 12);
      if (height > score) { score = height; api.score(score); sounds.levelup(); fx.pop(W / 2, towerTop() - 8, 'HIGHER!', { color: C16[4] });
        if (score > best) { best = score; api.save({ tallest: best }); } }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3858d8'); g.addColorStop(1, '#88c8f8'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      fx.begin(c);
      // the camera stays put; you could scroll up as the tower grows
      for (const b of world.things) {   // crates can tip over: draw each turned by its angle
        c.save(); c.translate(Math.round(b.x), Math.round(b.y)); c.rotate(b.angle);
        const x = -b.w / 2, y = -b.h / 2;
        c.fillStyle = b.tag === 'base' ? C16[12] : b.col; c.fillRect(x, y, b.w, b.h);
        c.fillStyle = '#ffffff55'; c.fillRect(x, y, b.w, 2); c.fillStyle = '#00000044'; c.fillRect(x, y + b.h - 2, b.w, 2);
        c.restore();
      }
      c.fillStyle = C16[13]; c.fillRect(0, 10, W, 2); c.fillRect(Math.round(hook.x) - 1, 12, 2, 8);
      if (held) { c.fillStyle = held.col; c.fillRect(Math.round(hook.x - held.w / 2), 20, held.w, held.h); }
      fx.end(c, W, H);
      text(c, `BEST ${best}`, 4, 2, { color: C16[1] });                       // crisp pixel text
      text(c, 'X'.repeat(fallen), W - 4, 2, { color: C16[2], align: 'right' });
      if (t < 3) text(c, 'TAP TO DROP', W / 2, H / 2, { font: 'big', color: C16[1], align: 'center', outline: C16[0] });
    },
    down() {
      if (!held) return;
      const b = world.box(hook.x, 20 + held.h / 2, held.w, held.h, { tag: 'crate', bounce: .1, friction: .8 });
      b.col = held.col; b.vx = hook.dir * 20; held = null; settle = .6;
      sounds.select(); haptic('light');
    },
    key(k, d) { if (d && k === ' ') this.down(); },
    debug(c) { world.debugDraw(c); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Advance · Stacking',
  retro: true, era: 'advance', pal: 'grape',
  w: 192, h: 160, maxH: 240,
  goal: 8,
  hint: 'Tap to drop a crate from the moving hook and build the tallest tower you can. Lose three crates and it is over.',
  creator: '__CREATOR__',
  make,
};
