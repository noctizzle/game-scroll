// Sprint Feet: a 100 metre dash. Tap the left and right feet buttons one after the other to run; keep a
// steady left-right rhythm, because the same foot twice makes you stumble. Real steps count too, if your
// phone has a step counter and you'd like to run on the spot. Finish in the top two to reach the next heat.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic, steps } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd } = gs.util;

let W = 176, H = 176;
const RACE = 100;

function make(api) {
  const feel = new Feel({ pixel: true });
  let you, rivals, phase, cd, t, heat, score, lastFoot, stumble, flashL, flashR, lastSteps, msg, ml;

  function newHeat() {
    heat++;
    you = { d: 0, v: 0, ph: 0 };
    rivals = [0, 1, 2].map(i => ({ d: 0, v: 0, top: 7 + heat * .35 + rnd(-.4, .6) + (i === 0 ? .3 : 0), ph: Math.random() * 6, col: ['#e04040', '#4080e0', '#40a040'][i], done: 0 }));
    phase = 'set'; cd = 2.4; lastFoot = null; stumble = 0; lastSteps = steps()?.count ?? null; you.done = 0;
  }
  function stride(foot) {
    if (phase !== 'run' || stumble > 0) { if (phase === 'set' && cd < 2) { msg = 'FALSE START!'; ml = 1; cd = 2.4; sfx(150, .2, 'square', .04); haptic('error'); } return; }
    if (foot && foot === lastFoot) { stumble = .5; you.v *= .4; sfx(140, .1, 'square', .04); haptic('warning'); msg = 'STUMBLE'; ml = .6; lastFoot = null; return; }
    lastFoot = foot; you.v = Math.min(11.5, you.v + 1.1); you.ph += 1; sfx(foot === 'L' ? 220 : 260, .03, 'square', .03); haptic('tick');
  }

  return {
    reset() { t = 0; heat = 0; score = 0; msg = ''; ml = 0; flashL = 0; flashR = 0; newHeat(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; flashL = Math.max(0, flashL - dt * 6); flashR = Math.max(0, flashR - dt * 6); stumble = Math.max(0, stumble - dt);
      if (phase === 'set') { const was = cd; cd -= dt; if (Math.ceil(was) !== Math.ceil(cd) && cd > 0) sfx(440, .1, 'square', .04); if (cd <= 0) { phase = 'run'; sfx(880, .25, 'square', .05); haptic('heavy'); } return; }
      if (phase === 'done') { cd -= dt; if (cd <= 0) { if (you.place > 2) return api.over(); newHeat(); } return; }
      // real steps add strides too
      const s = steps(); if (s && lastSteps != null && s.count > lastSteps) { for (let i = lastSteps; i < s.count; i++) stride(null); lastSteps = s.count; }
      you.v = Math.max(0, you.v - 3.2 * dt); you.d += you.v * dt;
      for (const r of rivals) { r.v = Math.min(r.top, r.v + 4 * dt); r.d += r.v * dt; r.ph += r.v * dt * .8; if (r.d >= RACE && !r.done) r.done = t; }
      if (you.d >= RACE && !you.done) {
        you.done = t; const place = 1 + rivals.filter(r => r.done && r.done < you.done).length; you.place = place;
        const pts = [0, 5, 3, 1, 0][place]; score += pts; api.score(score);
        msg = ['', '1ST!', '2ND', '3RD', '4TH'][place]; ml = 2; phase = 'done'; cd = 2.2;
        if (place <= 2) { notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, 60); haptic('success'); } else { feel.lose(); haptic('error'); }
      }
    },
    draw(c) {
      c.fillStyle = '#58a858'; c.fillRect(0, 0, W, H);
      // crowd stand
      c.fillStyle = '#585868'; c.fillRect(0, 0, W, 30); for (let x = 2; x < W; x += 6) for (let y = 4; y < 28; y += 7) { c.fillStyle = ['#e04040', '#f8d038', '#4080e0', '#f8f8f0'][(x * 3 + y) % 4]; c.fillRect(x, y + (Math.floor(t * 6 + x) % 2), 3, 3); }
      // four lanes, scrolling with you
      const cam = you.d * 6 - 50, lane = i => 44 + i * 22;
      c.fillStyle = '#c86040'; c.fillRect(0, 36, W, 90);
      c.fillStyle = '#f8f8f0'; for (let i = 0; i <= 4; i++) c.fillRect(0, 36 + i * 22, W, 1);
      for (let m = 0; m <= RACE; m += 10) { const x = Math.round(m * 6 - cam); if (x > -4 && x < W) { c.fillStyle = m === RACE ? '#f8f8f0' : '#e8a080'; c.fillRect(x, 36, m === RACE ? 3 : 1, 88); } }
      feel.begin(c);
      const runner = (d, i, col, ph) => { const x = Math.round(d * 6 - cam), y = lane(i) + 4, leg = Math.floor(ph) % 2; c.fillStyle = col; c.fillRect(x - 2, y - 10, 5, 7); c.fillStyle = '#f0b888'; c.fillRect(x - 1, y - 14, 4, 4); c.fillStyle = '#202028'; c.fillRect(x - 2 + leg * 2, y - 3, 2, 5); c.fillRect(x + 2 - leg * 2, y - 3, 2, 5); };
      rivals.forEach((r, i) => runner(r.d, i + 1, r.col, r.ph));
      runner(you.d, 0, '#f8d038', you.ph);
      feel.end(c, W, H);
      // feet buttons
      const bw = Math.floor(W / 2) - 6;
      c.fillStyle = flashL ? '#f8f8f0' : '#383848'; c.fillRect(4, H - 44, bw, 40); c.fillStyle = flashR ? '#f8f8f0' : '#383848'; c.fillRect(W - 4 - bw, H - 44, bw, 40);
      text(c, 'LEFT', 4 + bw / 2, H - 28, { align: 'center', color: flashL ? '#383848' : '#f8f8f0' }); text(c, 'RIGHT', W - 4 - bw / 2, H - 28, { align: 'center', color: flashR ? '#383848' : '#f8f8f0' });
      text(c, `HEAT ${heat}`, 4, 3, { color: '#f8f8f0' }); text(c, `${Math.min(RACE, Math.floor(you.d))}M`, W - 4, 3, { align: 'right', color: '#f8f8f0' });
      if (phase === 'set') text(c, cd > 1.2 ? 'ON YOUR MARKS' : 'GET SET', W / 2, 74, { font: 'big', align: 'center', color: '#f8f8f0', outline: '#202028' });
      if (ml > 0) text(c, msg, W / 2, 74, { font: 'big', align: 'center', color: '#f8d038', outline: '#202028' });
      if (heat === 1 && phase !== 'done' && t < 6) text(c, 'TAP LEFT, RIGHT, LEFT...', W / 2, H - 54, { align: 'center', color: '#f8f8f0', outline: '#202028' });
    },
    down(x, y) { if (y < H - 60) return; if (x < W / 2) { flashL = 1; stride('L'); } else { flashR = 1; stride('R'); } },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft' || k === 'z') { flashL = 1; stride('L'); } if (k === 'ArrowRight' || k === 'x') { flashR = 1; stride('R'); } },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'sprint-feet',
  title: 'Sprint Feet',
  tag: 'Advance · Sport',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 176, maxW: 240, maxH: 240,
  goal: 15,
  hint: 'Tap LEFT and RIGHT one after the other to sprint 100 metres; the same foot twice makes you stumble. Finish in the top two to reach the next heat.',
  make,
};
