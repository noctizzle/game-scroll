// Penguin Slide: a penguin belly-slides over rolling snow. Hold to dive: you press into the slopes and
// gain speed going down. Let go at the top of a rise and you fly. Crevasses split the ice, so build
// speed to jump them, and grab the fish in the air.
import gs from '../gamescroll.js';
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;
const { clamp } = gs.util;

const R = PAL.mint;
let W = 160, H = 160;
const G = 260;

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: false });                              // the slide waits for the first touch
  let p, gaps, fish, nextGap, score, best, t, dive, dead, camY, trail, fishN;
  const base = () => H * .62;
  const ground = x => {
    for (const g of gaps) if (x > g.a && x < g.b) return H * 3;
    return base() + Math.sin(x * .021) * 18 + Math.sin(x * .0067 + 2) * 14 + Math.sin(x * .053) * 3;
  };
  const slope = x => (ground(x + 1) - ground(x - 1)) / 2;

  function more() {
    while (nextGap < p.x + W * 3) {
      // a gap sits just after a crest, so a good jump clears it
      let x = nextGap; for (let i = 0; i < 200 && !(slope(x) < 0 && slope(x + 2) >= 0); i++) x += 2;
      const w = 26 + Math.min(40, p.x / 400);
      gaps.push({ a: x + 4, b: x + 4 + w });
      for (let k = 0; k < 3; k++) fish.push({ x: x + 4 + w * (k + 1) / 4, y: ground(x) - 20 - Math.sin((k + 1) / 4 * Math.PI) * 18, got: false });
      nextGap = x + 220 + Math.random() * 260;
    }
  }

  return {
    reset() { gaps = []; fish = []; nextGap = 400; p = { x: 20, y: 0, vx: 70, vy: 0, air: false, a: 0 }; p.y = ground(p.x); score = 0; fishN = 0; best = 0; t = 0; dive = false; dead = 0; camY = 0; trail = []; more(); feel.clear(); ready.reset(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt) || feel.frozen) return;
      t += dt;
      if (dead) { dead += dt; p.vy += G * dt; p.y += p.vy * dt; if (dead > 1.2) api.over(); return; }
      const g = G * (dive ? 2.6 : 1);
      if (!p.air) {
        const s = slope(p.x);
        p.vx += s * g * .9 * dt * (dive && s > 0 ? 1.5 : 1) - (dive && s < 0 ? 0 : 0);
        p.vx = clamp(p.vx, 35, 320);
        const nx = p.x + p.vx * dt, gy = ground(nx);
        const vy = (gy - p.y) / dt, fly = p.y + s * p.vx * dt;   // keep the speed it had along the slope
        // the ground drops away faster than gravity pulls: take off (unless diving)
        if (!dive && gy - fly > g * dt * dt * 2 + .4 && s < .4) { p.air = true; p.vy = s * p.vx; p.x = nx; p.y = fly; sfx(500, .1, 'triangle', .03, 300); }
        else { p.x = nx; p.y = gy; p.vy = vy; }
        if (gy > H * 2) { p.air = true; p.vy = 0; }
        p.a = Math.atan(s);
      } else {
        p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        p.a = Math.atan2(p.vy, p.vx) * .7;
        const gy = ground(p.x);
        if (p.y >= gy && gy < H * 2) {
          // landing: matching the slope keeps speed, a flat crash loses it
          const s = slope(p.x), match = Math.abs(Math.atan(s) - Math.atan2(p.vy, p.vx));
          p.air = false; p.y = gy;
          if (match < .35) { p.vx *= 1.08; feel.juice.pop(p.x - camX(), p.y - camY - 10, 'SMOOTH', { color: R[0] }); sfx(900, .05, 'square', .03); haptic('light'); score += 2; api.score(score); }
          else { p.vx *= .7; feel.land(Math.round(p.x - camX()), Math.round(p.y - camY), 120); haptic('medium'); }
        }
      }
      // crevasse
      if (p.y > base() + 60) { dead = .01; feel.lose(); haptic('error'); return; }
      for (const f of fish) if (!f.got && Math.hypot(f.x - p.x, f.y - p.y) < 8) { f.got = true; fishN++; score += 3; api.score(score); feel.coin(Math.round(f.x - camX()), Math.round(f.y - camY)); }
      const d = Math.floor(p.x / 120); if (d > best) { score += d - best; best = d; api.score(score); }
      camY += (Math.min(0, p.y - H * .35) - camY) * Math.min(1, dt * 4);
      if (Math.random() < dt * 20) trail.push({ x: p.x, y: p.y, l: .5 });
      for (const tr of trail) tr.l -= dt; trail = trail.filter(tr => tr.l > 0);
      gaps = gaps.filter(gp => gp.b > p.x - W); fish = fish.filter(f => f.x > p.x - W);
      more();
    },
    draw(c) {
      const cx = camX(), cy = Math.round(camY);
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      // far mountains
      c.fillStyle = R[2]; for (let x = 0; x < W; x++) { const h = 20 + Math.abs(((x + cx * .2) % 60) - 30) * .8; c.fillRect(x, Math.round(H * .5 - h - cy * .3), 1, Math.round(h + 40)); }
      feel.begin(c);
      // snow ground, crevasses dark
      for (let x = 0; x < W; x++) {
        const wx = x + cx, gy = ground(wx);
        if (gy > H * 2) { c.fillStyle = R[0]; c.fillRect(x, Math.round(base() + 20 - cy), 1, H); continue; }
        c.fillStyle = R[1]; c.fillRect(x, Math.round(gy - cy) + 3, 1, H);
        c.fillStyle = R[3]; c.fillRect(x, Math.round(gy - cy), 1, 3);
        if ((Math.floor(wx) % 9) === 0) { c.fillStyle = R[2]; c.fillRect(x, Math.round(gy - cy) + 6, 1, 2); }
      }
      for (const f of fish) if (!f.got) { const x = Math.round(f.x - cx), y = Math.round(f.y - cy); c.fillStyle = R[0]; c.fillRect(x - 3, y - 1, 5, 3); c.fillRect(x + 2, y - 2, 2, 5); c.fillStyle = R[3]; c.fillRect(x - 2, y - 1, 1, 1); }
      for (const tr of trail) { c.fillStyle = R[2]; c.fillRect(Math.round(tr.x - cx), Math.round(tr.y - cy), 1, 1); }
      // penguin: a little belly-down blob turned to the slope
      c.save(); c.translate(Math.round(p.x - cx), Math.round(p.y - cy) - 3); c.rotate(Math.round(p.a / .26) * .26);
      c.fillStyle = R[0]; c.fillRect(-7, -4, 13, 6); c.fillRect(-5, -6, 9, 2); c.fillStyle = R[3]; c.fillRect(-5, -2, 9, 3); c.fillStyle = R[0]; c.fillRect(6, -4, 3, 2); c.fillRect(2, -5, 1, 1);
      if (dive) { c.fillStyle = R[1]; c.fillRect(-9, -2, 2, 2); }
      c.restore();
      feel.end(c, W, H);
      text(c, `${fishN} FISH`, 4, 4, { color: R[0] });
      text(c, `${Math.round(p.vx / 3)}KMH`, W - 4, 4, { color: R[0], align: 'right' });
      if (t < 4) { text(c, 'HOLD TO DIVE DOWNHILL', W / 2, 26, { align: 'center', color: R[0] }); text(c, 'LET GO TO FLY', W / 2, 34, { align: 'center', color: R[0] }); }
      ready.draw(c, W, H, { text: 'HOLD TO START', pixel: true, color: R[0], y: 48 });
    },
    fx(dt) { feel.update(dt); },
    down() { ready.go(); dive = true; },
    up() { dive = false; },
    key(k, d) { if (k === ' ' || k === 'ArrowDown') { if (d) ready.go(); dive = d; } },
  };
  function camX() { return Math.round(p.x - W * .3); }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'penguin-slide',
  title: 'Penguin Slide',
  tag: 'Pocket · Slide',
  retro: true, pal: 'mint',
  w: 160, h: 160, maxW: 240, maxH: 220,
  goal: 80,
  hint: 'Hold to dive down the slopes for speed, let go over the crests to fly. Jump the crevasses and catch fish in the air.',
  make,
};
