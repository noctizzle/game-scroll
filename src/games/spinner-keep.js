// Spinner Keep: a fidget spinner sits in the middle. Flick across it to spin it up: flick one way to speed
// it up, the other way to brake. It slows by itself. Keep its speed inside the moving band on the
// dial to fill the meter. Fill it to bank a point. Let the band starve too long and you lose a life.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes, bed } = gs.sound;
const { clamp, rnd } = gs.util;

const R = PAL.teal;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let spin, ang, band, fill, out, score, lives, t, last, hum, bt;
  const MAX = 30;                        // rad/s at the top of the dial
  const CX = () => Math.round(W / 2), CY = () => Math.round(H * .48);

  function newBand() {
    const w = Math.max(.12, .26 - score * .01);
    const lo = rnd(.1, .9 - w);
    band = { lo, hi: lo + w, drift: (Math.random() < .5 ? -1 : 1) * Math.min(.08, score * .006) };
    fill = 0; bt = 0;
  }

  return {
    reset() { spin = 0; ang = 0; score = 0; lives = 3; t = 0; out = 0; last = null; hum = null; newBand(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; bt += dt;
      if (!hum) hum = bed({ vol: 0, from: 200, filter: 'lowpass' });
      spin = Math.max(0, spin - (0.6 + spin * .06) * dt);
      ang += spin * dt;
      hum?.set({ vol: Math.min(.03, spin / 600), from: 120 + spin * 30 }, .1);
      // the band drifts once you're good at it
      band.lo += band.drift * dt; band.hi += band.drift * dt;
      if (band.lo < .05 || band.hi > .97) band.drift *= -1;
      const v = spin / MAX, inBand = v >= band.lo && v <= band.hi;
      if (inBand) { fill += dt / 3; out = 0; if (Math.random() < dt * 4) haptic('tick'); }
      else if (bt > 1.5) { out += dt; fill = Math.max(0, fill - dt * .1); }
      if (fill >= 1) { score++; api.score(score); notes('C5 E5 G5', { len: .05 }); feel.coin(CX(), CY()); haptic('success'); newBand(); }
      if (out > 5) { lives--; out = 0; feel.hurt(CX(), CY()); haptic('error'); sfx(140, .25, 'square', .04); if (lives <= 0) { feel.lose(); return api.over(); } newBand(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      const cx = CX(), cy = CY();
      // speed dial: an arc of dots with the target band thick
      const rD = Math.min(66, Math.round(W * .42)), a0 = Math.PI * .8, a1 = Math.PI * 2.2;
      for (let i = 0; i <= 60; i++) {
        const f = i / 60, a = a0 + (a1 - a0) * f, inb = f >= band.lo && f <= band.hi;
        c.fillStyle = inb ? R[0] : R[2]; const s = inb ? 3 : 2;
        c.fillRect(Math.round(cx + Math.cos(a) * rD) - 1, Math.round(cy + Math.sin(a) * rD) - 1, s, s);
      }
      const nv = clamp(spin / MAX, 0, 1), na = a0 + (a1 - a0) * nv;
      c.fillStyle = R[1]; for (let k = rD - 12; k < rD + 4; k += 1) c.fillRect(Math.round(cx + Math.cos(na) * k), Math.round(cy + Math.sin(na) * k), 2, 2);
      feel.begin(c);
      // the spinner: three lobes round a bearing, drawn from whole-pixel blobs
      for (let i = 0; i < 3; i++) {
        const a = ang + i * 2.094, x = Math.round(cx + Math.cos(a) * 20), y = Math.round(cy + Math.sin(a) * 20);
        for (let k = 4; k < 18; k += 3) { c.fillStyle = R[1]; c.fillRect(Math.round(cx + Math.cos(a) * k) - 3, Math.round(cy + Math.sin(a) * k) - 3, 6, 6); }
        c.fillStyle = R[0]; c.fillRect(x - 8, y - 8, 16, 16); c.fillStyle = R[2]; c.fillRect(x - 5, y - 5, 10, 10); c.fillStyle = R[3]; c.fillRect(x - 2, y - 4, 3, 2);
      }
      c.fillStyle = R[0]; c.fillRect(cx - 7, cy - 7, 14, 14); c.fillStyle = R[2]; c.fillRect(cx - 4, cy - 4, 8, 8);
      feel.end(c, W, H);
      // fill meter and warning
      c.fillStyle = R[1]; c.fillRect(16, H - 20, W - 32, 6); c.fillStyle = R[0]; c.fillRect(17, H - 19, Math.round((W - 34) * fill), 4);
      if (out > 2 && Math.floor(t * 6) % 2) text(c, 'TOO ' + (spin / MAX < band.lo ? 'SLOW' : 'FAST'), W / 2, H - 32, { align: 'center', color: R[0] });
      text(c, `${score}`, 4, 3, { color: R[0] });
      for (let i = 0; i < lives; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 3, 4, 4); }
      if (t < 5 && !score) text(c, 'FLICK ACROSS IT', W / 2, H - 32, { align: 'center', color: R[0] });
    },
    down(x, y) { last = { x, y, t }; },
    move(x, y, pr) {
      if (!pr || !last) return;
      // the push round the bearing: cross product of the finger's move with its offset from the middle
      const dx = x - last.x, dy = y - last.y, rx = x - CX(), ry = y - CY(), d = Math.max(12, Math.hypot(rx, ry));
      const torque = (rx * dy - ry * dx) / d;
      if (Math.abs(torque) > .5) { spin = clamp(spin + torque * .35, 0, MAX * 1.1); if (Math.random() < .3) sfx(300 + spin * 20, .02, 'triangle', .02); }
      last = { x, y, t };
    },
    up() { last = null; },
    key(k, d) { if (!d) return; if (k === 'ArrowRight' || k === 'ArrowUp') spin = clamp(spin + 2.5, 0, MAX * 1.1); if (k === 'ArrowLeft' || k === 'ArrowDown') spin = Math.max(0, spin - 2.5); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'spinner-keep',
  title: 'Spinner Keep',
  tag: 'Pocket · Touch',
  retro: true, pal: 'teal',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 12,
  hint: 'Flick across the spinner to speed it up (flick the other way to brake). Keep the needle in the thick band to fill the bar. Too long outside costs a life.',
  make,
};
