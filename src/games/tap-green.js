import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A reaction test with tricks. Wait while the screen is red, then tap the instant it turns green.
// Fake-outs flash other colours later on. Tap early or on a fake and the run ends. Faster taps score more.
const W = 360, H = 640, ROUNDS = 8;
void clamp;
const FAKES = [['#3d6bff', 'BLUE'], ['#ffd34a', 'YELLOW'], ['#2fbf6a', 'TEAL']];

function make(api) {
  let state, wait, fake, shown, score, round, best, last, t, results, flash;
  function arm() { state = 'wait'; wait = rnd(1.2, 3.4); fake = round >= 2 && Math.random() < .45 ? { at: rnd(.4, wait - .3), k: FAKES[Math.random() * (round >= 5 ? 3 : 2) | 0], on: false } : null; shown = 0; }
  const self = {
    reset() { score = 0; round = 0; best = 0; last = null; t = 0; results = []; flash = 0; arm(); },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt * 3);
      if (state === 'wait') {
        wait -= dt;
        if (fake && !fake.on && fake.at >= wait) { fake.on = true; fake.end = wait - .45; haptic('tick'); }
        if (fake && fake.on && wait <= fake.end) fake.on = false;
        if (wait <= 0) { state = 'go'; shown = 0; haptic('medium'); sfx(880, .08, 'square', .05); }
      } else if (state === 'go') { shown += dt; if (shown > 1.2) { state = 'late'; haptic('error'); sfx(140, .3, 'square', .05, -40); return api.over(); } }
      else if (state === 'next') { wait -= dt; if (wait <= 0) { if (round >= ROUNDS) { haptic('success'); return api.over(); } arm(); } }
    },
    draw(c) {
      let bg = '#c8283c', big = 'WAIT', small = 'tap when it turns green';
      if (state === 'wait' && fake?.on) { bg = fake.k[0]; big = fake.k[1] + '?'; small = 'not green, hold on…'; }
      if (state === 'go') { bg = '#22c55e'; big = 'TAP!'; small = ''; }
      if (state === 'next') { bg = '#22324a'; big = `${last} ms`; small = last < 250 ? 'lightning!' : last < 350 ? 'quick' : 'okay'; }
      if (state === 'early' || state === 'late') { bg = '#22324a'; big = state === 'early' ? 'TOO SOON' : 'TOO SLOW'; small = ''; }
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = '400 26px "Press Start 2P", monospace'; c.fillText(big, W / 2, 320);
      c.font = '600 15px Rubik, sans-serif'; c.fillStyle = '#ffffffcc'; c.fillText(small, W / 2, 360);
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`ROUND ${Math.min(round + 1, ROUNDS)}/${ROUNDS}`, 12, 22);
      results.forEach((r, i) => { c.fillStyle = '#ffffff30'; c.fillRect(12 + i * 42, H - 60, 36, 40); c.fillStyle = '#fff'; c.font = '400 8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(String(r), 30 + i * 42, H - 36); });
      if (best) { c.textAlign = 'right'; c.fillStyle = '#ffffffaa'; c.font = '400 9px "Press Start 2P", monospace'; c.fillText(`BEST ${best}ms`, W - 12, 22); }
    },
    down() {
      if (state === 'wait') { state = 'early'; haptic('error'); sfx(140, .3, 'square', .05, -40); return api.over(); }
      if (state === 'go') {
        const ms = Math.round(shown * 1000); last = ms; best = best ? Math.min(best, ms) : ms; results.push(ms); round++;
        score += Math.max(5, Math.round((600 - ms) / 5)); api.score(score); haptic('success'); sfx(1200, .06, 'square', .04, 200);
        state = 'next'; wait = 1.1; flash = 1;
      }
    },
    key(k, d) { if (d && k === ' ') self.down(); },
  };
  return self;
}

export default {
  id: 'tap-green', title: 'Tap on Green', tag: 'Casual · Reflex', retro: false, w: W, h: H, goal: 500,
  hint: 'Wait on red. Tap the instant the screen turns green. Other colours are fakes. Eight rounds, faster taps score more.',
  make,
};
