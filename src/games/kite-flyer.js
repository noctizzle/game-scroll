// Kite Flyer: hold to tug the string and the kite climbs, let go and it drifts down. Keep it inside the
// moving band of good wind to score. Tug too hard in a gust and the string snaps; let it sink and it
// crashes. Birds cross the sky too. Three kites.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;
const { clamp } = gs.util;
const { noise2 } = gs.math;

const R = PAL.rose;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let k, pull, tension, band, kites, score, t, inBand, birds, birdT, hurt, tailT, gust;

  function lose(why) {
    kites--; hurt = 1.4; feel.hurt(Math.round(k.x), Math.round(k.y)); feel.juice.pop(Math.round(k.x), Math.round(k.y) - 10, why, { color: R[0] }); haptic('error');
    k = { x: W * .55, y: H * .4, vx: 0, vy: 0 }; tension = 0;
    if (kites <= 0) { feel.lose(); api.over(); }
  }

  return {
    reset() { k = { x: W * .55, y: H * .45, vx: 0, vy: 0 }; pull = false; tension = 0; band = { y: H * .35, h: 34 }; kites = 3; score = 0; t = 0; inBand = 0; birds = []; birdT = 4; hurt = 0; tailT = 0; gust = 0; feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (hurt > 0) hurt -= dt;
      // the good-wind band wanders and narrows
      band.h = Math.max(18, 38 - t * .15);
      band.y = clamp(H * .4 + noise2(t * .12, 3) * H * .28, 22, H - 50 - band.h);
      gust = Math.max(0, noise2(t * .7, 9)) * (1 + t / 60);
      const wind = .4 + gust;                                   // stronger wind lifts more and pulls harder
      // flight: tug climbs, slack sinks; gusts shove it sideways
      k.vy += ((pull ? -70 : 34) * (pull ? wind : 1) - k.vy * 1.6) * dt;
      k.vx += ((W * .6 + noise2(t * .5, 1) * W * .25 - k.x) * .8 + gust * 30 - k.vx * 1.2) * dt;
      k.x = clamp(k.x + k.vx * dt, 20, W - 8); k.y += k.vy * dt;
      if (k.y < 10) { k.y = 10; k.vy = 0; }
      // tension rises with tugging into a gust
      tension = clamp(tension + (pull ? (.25 + gust * .9) : -.7) * dt, 0, 1.2);
      if (pull && tension > .8 && Math.random() < dt * 15) haptic('tick');
      if (hurt <= 0) {
        if (tension >= 1) { sfx(1800, .05, 'square', .04, -1500); lose('SNAP!'); return; }
        if (k.y > H - 24) { sounds.hurt(); lose('CRASH!'); return; }
      }
      // birds
      birdT -= dt; if (birdT <= 0) { birdT = Math.max(1.6, 5 - t / 25); const left = Math.random() < .5; birds.push({ x: left ? -10 : W + 10, y: 16 + Math.random() * (H - 60), vx: (left ? 1 : -1) * (30 + Math.random() * 20 + t * .3) }); }
      for (const b of birds) { b.x += b.vx * dt; if (hurt <= 0 && Math.abs(b.x - k.x) < 8 && Math.abs(b.y - k.y) < 7) { b.hit = true; lose('TANGLED!'); return; } }
      birds = birds.filter(b => b.x > -20 && b.x < W + 20 && !b.hit);
      // scoring: a point for each second inside the band
      if (hurt <= 0 && k.y > band.y && k.y < band.y + band.h) { inBand += dt; if (inBand >= 1) { inBand -= 1; score++; api.score(score); sfx(700 + (score % 5) * 80, .04, 'square', .03); if (score % 10 === 0) feel.juice.pop(Math.round(k.x), Math.round(k.y) - 12, `${score}!`, { color: R[0] }); } }
      tailT += dt;
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      // wind band: a dotted field with dashed streaks
      c.fillStyle = R[2]; for (let y = Math.round(band.y); y < band.y + band.h; y += 2) for (let x = (y & 2); x < W; x += 4) c.fillRect(x, y, 1, 1);
      c.fillStyle = R[1]; for (let i = 0; i < 18; i++) { const x = Math.round(((i * 41 + t * (40 + gust * 60)) % (W + 30)) - 15), y = Math.round(band.y + (i * 7) % band.h); c.fillRect(x, y, 8, 1); }
      c.fillStyle = R[2]; c.fillRect(0, Math.round(band.y), 3, Math.round(band.h)); c.fillRect(W - 3, Math.round(band.y), 3, Math.round(band.h));
      // hill and the kid
      c.fillStyle = R[2]; c.fillRect(0, H - 14, W, 14); c.fillStyle = R[1]; for (let x = 0; x < W; x += 5) c.fillRect(x, H - 14, 2, 1);
      const hx = 18, hy = H - 22;
      c.fillStyle = R[0]; c.fillRect(hx - 2, hy - 8, 5, 5); c.fillRect(hx - 3, hy - 3, 7, 8); c.fillRect(hx - 3, hy + 5, 2, 4); c.fillRect(hx + 2, hy + 5, 2, 4); c.fillRect(hx + 3, hy - 2 - (pull ? 2 : 0), 4, 2);
      feel.begin(c);
      // string, sagging when slack
      c.fillStyle = R[1]; const sag = (1 - Math.min(1, tension * 1.3)) * 14;
      for (let i = 0; i <= 30; i++) { const u = i / 30, x = hx + 6 + (k.x - hx - 6) * u, y = hy - 3 + (k.y - hy + 3) * u + Math.sin(u * Math.PI) * sag; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
      // birds
      for (const b of birds) { const x = Math.round(b.x), y = Math.round(b.y), f = (t * 8 | 0) % 2; c.fillStyle = R[0]; c.fillRect(x - 3, y - f, 2, 1); c.fillRect(x - 1, y, 3, 2); c.fillRect(x + 2, y - f, 2, 1); }
      // kite diamond with a wavy tail
      if (!(hurt > 0 && (t * 10 | 0) % 2)) {
        const x = Math.round(k.x), y = Math.round(k.y);
        for (let i = 0; i < 10; i++) { c.fillStyle = i % 3 === 0 ? R[0] : R[1]; c.fillRect(x - 1 - Math.round(i * 1.5), y + 6 + i + Math.round(Math.sin(tailT * 8 - i * .8) * 2), 1, 1); }
        c.fillStyle = R[0]; for (let r = -6; r <= 6; r++) { const w = 5 - Math.abs(r) * .8; c.fillRect(Math.round(x - w), y + r, Math.max(1, Math.round(w * 2)), 1); }
        c.fillStyle = R[2]; for (let r = -4; r <= 4; r++) { const w = 3 - Math.abs(r) * .75; if (w > 0) c.fillRect(Math.round(x - w), y + r, Math.round(w * 2), 1); }
        c.fillStyle = R[0]; c.fillRect(x, y - 6, 1, 13); c.fillRect(x - 4, y, 9, 1);
      }
      feel.end(c, W, H);
      // tension meter and kites left
      c.fillStyle = R[0]; c.fillRect(W - 46, 4, 42, 6); c.fillStyle = R[3]; c.fillRect(W - 45, 5, 40, 4);
      c.fillStyle = tension > .8 && (t * 8 | 0) % 2 ? R[0] : R[1]; c.fillRect(W - 45, 5, Math.round(40 * Math.min(1, tension)), 4);
      text(c, 'PULL', W - 48, 4, { color: R[0], align: 'right' });
      for (let i = 0; i < kites; i++) { c.fillStyle = R[0]; c.fillRect(6 + i * 7, 4, 3, 1); c.fillRect(5 + i * 7, 5, 5, 2); c.fillRect(6 + i * 7, 7, 3, 1); }
      if (t < 4) { text(c, 'HOLD TO TUG, LET GO TO DRIFT', W / 2, H - 9, { align: 'center', color: R[0] }); }
    },
    down() { pull = true; sfx(400, .03, 'square', .02); },
    up() { pull = false; },
    key(k2, d) { if (k2 === ' ' || k2 === 'ArrowUp') pull = d; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'kite-flyer',
  title: 'Kite Flyer',
  tag: 'Pocket · Skill',
  retro: true, pal: 'rose',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 45,
  hint: 'Hold to tug the kite up, let go to let it drift down. Keep it in the band of wind to score, without snapping the string or crashing.',
  make,
};
