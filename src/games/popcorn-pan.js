// Popcorn Pan: a pan of kernels sits on the hob. Hold to turn the heat up, let go to let it cool.
// Kernels pop when they get hot enough, but popped corn sitting in a hot pan scorches. Swipe sideways
// to shake the pan and keep it moving. Serve each pan when it's done; ten burnt bits set off the alarm.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 160, H = 192;
const K = C16;

function make(api) {
  const feel = new Feel({ pixel: true });
  let sy0 = null, corn, heat, held, shake, shakeX, score, burnt, round, t, pt, msg, ml, sx0, smoke, serving;
  const PX = () => Math.round(W / 2), PY = () => Math.round(H * .6), PR = () => Math.min(56, Math.round(W * .36));

  function fill() {
    round++;
    corn = []; const n = Math.min(24, 10 + round * 2);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (PR() - 8); corn.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * .4, heat: 0, need: rnd(.6, 2), popped: false, char: 0, z: 0, vz: 0 }); }
    pt = 0; serving = 0;
  }

  return {
    reset() { heat = 0; held = false; shake = 0; shakeX = 0; score = 0; burnt = 0; round = 0; t = 0; msg = ''; ml = 0; sx0 = null; smoke = []; fill(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; pt += dt; if (ml > 0) ml -= dt;
      if (serving > 0) { serving -= dt; if (serving <= 0) { if (burnt >= 10) { feel.lose(); return api.over(); } fill(); } return; }
      heat = clamp(heat + (held ? .45 : -.3) * dt, 0, 1);
      shake = Math.max(0, shake - dt); shakeX *= Math.pow(.01, dt);
      for (const k of corn) {
        k.vz -= 300 * dt; k.z = Math.max(0, k.z + k.vz * dt); if (k.z === 0) k.vz = 0;
        if (!k.popped) {
          k.heat += heat * heat * .55 * dt * (shake > 0 ? .8 : 1);
          if (k.heat >= k.need) { k.popped = true; k.vz = rnd(60, 120); k.x += rnd(-4, 4); sfx(rnd(700, 1100), .03, 'square', .03); if (Math.random() < .5) haptic('tick'); }
        } else if (k.char < 1) {
          // popped corn scorches while it sits still on a hot pan
          if (shake <= 0 && k.z === 0) k.char += Math.max(0, heat - .35) * .5 * dt;
          if (k.char >= 1) { burnt++; smoke.push({ x: k.x, y: k.y, l: 1.5 }); sfx(120, .2, 'sawtooth', .02); haptic('warning'); }
        }
      }
      if (heat > .9) for (const k of corn) if (!k.popped) k.need -= dt * .02;
      for (const s of smoke) s.l -= dt; smoke = smoke.filter(s => s.l > 0);
      if (heat > .6 && Math.random() < dt * heat * 6) smoke.push({ x: rnd(-PR(), PR()) * .5, y: 0, l: .8, wisp: true });
      // done when every kernel has popped or burnt, when you swipe up to serve, or after a long time
      if (corn.every(k => k.popped || k.char >= 1) && corn.filter(k => k.char < 1).every(k => k.z === 0) && pt > 1 || pt > 30) serve();
    },
    draw(c) {
      c.fillStyle = K[14]; c.fillRect(0, 0, W, H);
      c.fillStyle = K[13]; for (let x = 0; x < W; x += 20) for (let y = 0; y < Math.round(H * .4); y += 20) c.fillRect(x + ((y / 20) % 2) * 10, y, 9, 9);
      c.fillStyle = K[0]; c.fillRect(0, Math.round(H * .66), W, H);
      // hob and flame
      const px = PX() + Math.round(shakeX), py = PY(), r = PR();
      c.fillStyle = K[13]; c.fillRect(px - r, py + 12, r * 2, 4);
      const fl = Math.round(heat * 10);
      for (let i = -r + 8; i < r - 8; i += 6) { c.fillStyle = heat > .75 ? K[3] : K[7]; c.fillRect(px + i, py + 12 - fl - (Math.floor(t * 20 + i) % 3), 3, fl); }
      // pan
      c.fillStyle = K[0]; c.fillRect(px + r, py - 2, 30, 5);
      c.fillStyle = K[13]; c.fillRect(px - r, py - 6, r * 2, 14); c.fillStyle = K[0]; c.fillRect(px - r + 2, py - 6, r * 2 - 4, 3);
      const hot = heat > .8 ? K[12] : K[13]; c.fillStyle = hot; c.fillRect(px - r + 2, py - 3, r * 2 - 4, 8);
      feel.begin(c);
      for (const k of corn) {
        const x = Math.round(px + k.x), y = Math.round(py + k.y - k.z);
        if (!k.popped) { c.fillStyle = k.heat > k.need * .8 ? K[3] : K[4]; c.fillRect(x, y, 2, 2); }
        else { const col = k.char >= 1 ? K[0] : k.char > .6 ? K[11] : k.char > .3 ? K[4] : K[1]; c.fillStyle = col; c.fillRect(x - 2, y - 2, 5, 4); c.fillRect(x - 1, y - 3, 3, 6); }
      }
      for (const s of smoke) { c.fillStyle = s.wisp ? K[13] : K[0]; c.fillRect(Math.round(px + s.x), Math.round(py - 10 - (1.5 - s.l) * 30), 3, 3); }
      feel.end(c, W, H);
      // heat gauge
      c.fillStyle = K[13]; c.fillRect(8, H - 22, W - 16, 8); c.fillStyle = heat > .75 ? K[2] : heat > .4 ? K[3] : K[7]; c.fillRect(9, H - 21, Math.round((W - 18) * heat), 6);
      text(c, 'HEAT', 8, H - 31, { color: K[1] });
      const popped = corn.filter(k => k.popped && k.char < 1).length;
      text(c, `${score}`, 4, 3, { color: K[0] });
      text(c, `BURNT ${burnt}/10`, W - 4, 3, { align: 'right', color: burnt > 6 ? K[2] : K[0] });
      text(c, `POPPED ${popped}/${corn.length}`, W / 2, Math.round(H * .66) + 6, { align: 'center', color: K[4] });
      if (!serving && popped > corn.length / 2 && Math.floor(t * 2) % 2) text(c, 'SWIPE UP TO SERVE', W / 2, Math.round(H * .66) + 16, { align: 'center', color: K[1] });
      if (ml > 0) text(c, msg, W / 2, Math.round(H * .25), { font: 'big', align: 'center', color: K[0] });
      else if (round === 1 && t < 6) text(c, 'HOLD: HEAT  SIDEWAYS: SHAKE', W / 2, Math.round(H * .25), { align: 'center', color: K[0] });
    },
    down(x, y) { held = true; sx0 = x; sy0 = y; },
    move(x, y, pr) { if (!pr || sx0 == null) return; if (Math.abs(x - sx0) > 14) { doShake(Math.sign(x - sx0)); sx0 = x; } if (sy0 != null && sy0 - y > 50 && corn.some(k => k.popped)) { sy0 = null; serve(); } },
    up() { held = false; sx0 = null; sy0 = null; },
    key(k, d) { if (k === ' ') held = d; if (d && (k === 'ArrowLeft' || k === 'ArrowRight')) doShake(k === 'ArrowLeft' ? -1 : 1); },
  };

  function doShake(dir) {
    shake = 1.1; shakeX = dir * 6;
    for (const k of corn) if (k.popped && k.z === 0) { k.vz = rnd(20, 60); k.x = clamp(k.x + dir * rnd(1, 4), -PR() + 6, PR() - 6); }
    noise(.05, { vol: .03, from: 2000, to: 500 }); haptic('light');
  }
  function serve() {
    if (serving > 0) return;
    const good = corn.filter(k => k.popped && k.char < 1).length;
    score += good; api.score(score);
    msg = good === corn.length ? 'PERFECT PAN!' : `${good} SERVED`; ml = 1.2; serving = 1.3;
    if (good === corn.length) { score += 3; api.score(score); notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, PY()); haptic('success'); } else { notes('E5 G5', { len: .06 }); feel.coin(W / 2, PY()); }
    held = false; heat = Math.min(heat, .3);
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'popcorn-pan',
  title: 'Popcorn Pan',
  tag: 'Color · Cooking',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 192, maxW: 220, maxH: 260,
  goal: 60,
  hint: 'Hold for heat so kernels pop, swipe sideways to shake so popped corn does not scorch, swipe up to serve. Ten burnt bits and it is over.',
  make,
};
