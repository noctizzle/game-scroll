// __TITLE__: a starter Classic · Console game made with `npm run new`. Change anything you like.
// Real-time cel-shaded 3D (src/kit/toon3d.js, see docs/console-3d.md) with game logic in plain 2D
// units. Shows the on-screen joystick, juice for the 2D effects on top, and sounds.
import { haptic } from '../kit/device.js';
import { View, G, part, grp, blob } from '../kit/toon3d.js';
import { Juice } from '../kit/juice.js';
import { sounds } from '../kit/sound.js';
import { Stick, Keys } from '../kit/controls.js';

let W = 192, H = 160;

let v3;
function view3d() {
  if (!v3) {
    v3 = new View({ bg: '#5cb84c', sun: [-.6, 1, .4] });
    v3.def('hero', () => grp(part(G.pill, '#3060c0', { sx: 7, sy: 6, sz: 7, y: 6 }), part(G.ball, '#f8c890', { s: 5, y: 13 }), blob(5)));
    v3.def('gem', () => grp(part(G.gem, '#f8d838', { s: 5, y: 6, glow: .5 }), blob(3)));
    v3.def('spike', () => grp(part(G.box, '#a03040', { sx: 9, sy: 9, sz: 9, y: 4.5 }), blob(5)));
    v3.def('tile', () => part(G.box, '#68c858', { y: -.5 }));
  }
  v3.board(W, H, .8);   // tilted top-down: floor point (x, y) lands exactly on screen (x, y)
  return v3;
}

function make(api) {
  const fx = new Juice();
  const stick = new Stick({ r: 26, floating: true, zone: [0, 0, 9999, 9999] });
  const keys = new Keys();
  let p, gems, spikes, score, t, hurt;
  const place = () => ({ x: 16 + Math.random() * (W - 32), y: 16 + Math.random() * (H - 32) });

  return {
    reset() { p = { x: W / 2, y: H / 2 }; gems = [place(), place(), place()]; spikes = []; score = 0; t = 0; hurt = 0; fx.clear(); stick.release(); keys.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      fx.update(dt); t += dt; hurt = Math.max(0, hurt - dt);
      const a = stick.active ? stick : keys.axis();
      p.x = Math.max(8, Math.min(W - 8, p.x + a.x * 80 * dt)); p.y = Math.max(8, Math.min(H - 8, p.y + a.y * 80 * dt));
      for (const g of gems) if (Math.hypot(g.x - p.x, g.y - p.y) < 10) {
        score++; api.score(score); sounds.coin(1 + score * .02); haptic('light');
        fx.burst(g.x, g.y - 6, { n: 12, speed: 70, size: 3, color: ['#f8d838', '#fff'] }).pop(g.x, g.y - 14, '+1');
        Object.assign(g, place());
        if (score % 3 === 0) spikes.push({ ...place(), vx: (Math.random() < .5 ? -1 : 1) * 30, vy: (Math.random() < .5 ? -1 : 1) * 24 });
      }
      for (const s of spikes) {
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < 8 || s.x > W - 8) s.vx *= -1; if (s.y < 8 || s.y > H - 8) s.vy *= -1;
        if (!hurt && Math.hypot(s.x - p.x, s.y - p.y) < 11) { sounds.boom(); haptic('error'); fx.shake(6).flash('#ff4040', .4); api.over(); }
      }
    },
    draw(c) {
      const v = view3d(); v.frame();
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) if ((x + y) % 32 === 0) v.put('tile', v.at(x + 8, y + 8), { sx: 16, sy: 1, sz: 16 / v.sin });
      for (const g of gems) v.put('gem', v.at(g.x, g.y, Math.sin(t * 4 + g.x) * 2), { ry: t * 2 });
      for (const s of spikes) v.put('spike', v.at(s.x, s.y), { ry: t * 3 });
      v.put('hero', v.at(p.x, p.y), { ry: stick.active ? -stick.angle - Math.PI / 2 : 0 });
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);   // 3D frame, then 2D effects and HUD on top
      stick.draw(c);
      if (t < 3) { c.fillStyle = '#000a'; c.fillRect(0, H - 18, W, 16); c.fillStyle = '#fff'; c.font = '600 9px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('Drag anywhere to move', W / 2, H - 7); }
    },
    down: (x, y, id) => stick.down(x, y, id),
    move: (x, y, pr, id) => stick.move(x, y, pr, id),
    up: (x, y, id) => stick.up(x, y, id),
    key: (k, d) => keys.key(k, d),
    debug(c) { c.strokeStyle = '#0f8'; c.beginPath(); c.arc(p.x, p.y, 10, 0, 7); c.stroke(); for (const s of spikes) { c.beginPath(); c.arc(s.x, s.y, 11, 0, 7); c.stroke(); } },
  };
}

export default {
  id: '__ID__',
  title: '__TITLE__',
  tag: 'Console · Arcade',
  retro: true, era: 'console', pal: 'grape',
  w: 192, h: 160, maxW: 300, maxH: 240,
  goal: 20,
  hint: 'Drag to run around and grab the gems. Every third gem adds a bouncing spike block, so do not touch one.',
  creator: '__CREATOR__',
  make,
};
