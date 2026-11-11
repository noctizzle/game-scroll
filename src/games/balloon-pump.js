import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { Feel } = gs.effects;

// Hold to pump the balloon, let go to cash it in. The bigger it gets, the more it's worth,
// but every balloon has a secret bursting point. Colours hint at how tough they are. Ten balloons.
const W = 360, H = 640, COUNT = 10;
const KINDS = [
  { col: '#ff5a7a', name: 'red', lo: .25, hi: .7 },
  { col: '#ffd34a', name: 'yellow', lo: .4, hi: .9 },
  { col: '#4ad3ff', name: 'blue', lo: .55, hi: 1 },
];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let size, pop, kind, pumping, score, n, t, state, wait, bank, burst, creak;
  function next() { kind = KINDS[Math.random() * 3 | 0]; size = .08; pop = rnd(kind.lo, kind.hi); pumping = false; state = 'pump'; burst = null; creak = 0; }
  const self = {
    reset() { score = 0; n = 0; t = 0; bank = []; feel.clear(); next(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt;
      if (state === 'wait') { wait -= dt; if (burst) burst.l += dt; if (wait <= 0) { if (n >= COUNT) { haptic('success'); return api.over(); } next(); } return; }
      if (pumping) {
        size += dt * .32; creak -= dt;
        if (size > pop * .85 && creak <= 0) { creak = .15; haptic('tick'); }   // the balloon creaks when it's close
        if (Math.random() < dt * 8) sfx(200 + size * 500, .05, 'sine', .02);
        if (size >= pop) {
          feel.juice.burst(W / 2, 330 - size * 40, { n: 22, speed: 260, life: .6, size: 5, color: [kind.col, '#ffffff'], gravity: 300 }).shake(9).flash(kind.col, .25);
          n++; bank.push(0); state = 'wait'; wait = 1; burst = { l: 0 }; haptic('heavy'); sfx(90, .3, 'sawtooth', .07, -40); sfx(1800, .05, 'square', .04, -1500);
        }
      }
    },
    draw(c) {
      c.fillStyle = '#1d2540'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      const r = 30 + size * 140, cx = W / 2, cy = 330 - size * 40, wob = pumping && size > pop * .85 ? Math.sin(t * 50) * 2 : 0;
      c.fillStyle = '#ffffff40'; c.fillRect(cx - 2, cy + r, 4, 520 - cy - r);
      c.fillStyle = '#6a6a7a'; c.fillRect(cx - 30, 520, 60, 70); c.fillRect(cx - 6, 470, 12, 52);
      c.fillStyle = '#9a9aaa'; c.fillRect(cx - 40, 470 + (pumping ? (Math.sin(t * 20) * 14 + 14) : 0) - 20, 80, 10);
      if (!burst) {
        c.fillStyle = kind.col; c.beginPath(); c.ellipse(cx + wob, cy, r, r * 1.12, 0, 0, 7); c.fill();
        c.beginPath(); c.moveTo(cx - 8, cy + r * 1.1); c.lineTo(cx + 8, cy + r * 1.1); c.lineTo(cx, cy + r * 1.1 + 12); c.fill();
        c.fillStyle = '#ffffff50'; c.beginPath(); c.ellipse(cx - r * .4, cy - r * .5, r * .15, r * .25, -.5, 0, 7); c.fill();
        c.fillStyle = '#ffffff'; c.font = `800 ${Math.round(14 + size * 30)}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(String(Math.round(size * 100)), cx, cy + 10);
      } else {
        c.strokeStyle = kind.col; c.lineWidth = 5; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, d = 40 + burst.l * 300; c.beginPath(); c.moveTo(cx + Math.cos(a) * d * .7, cy + Math.sin(a) * d * .7); c.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); c.stroke(); }
        c.fillStyle = '#fff'; c.font = '400 20px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('POP!', cx, cy);
      }
      feel.end(c, W, H);
      if (state === 'wait' && !burst) { c.fillStyle = '#7dff9a'; c.font = '400 18px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`+${bank[bank.length - 1]}`, cx, 140); }
      c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffaa'; c.fillText(`BALLOON ${Math.min(n + 1, COUNT)}/${COUNT}`, 12, 22);
      bank.forEach((v, i) => { c.fillStyle = v ? '#7dff9a' : '#ff5a7a'; c.fillRect(12 + i * 14, 30, 10, 10); });
      KINDS.forEach((k, i) => { c.fillStyle = k.col; c.beginPath(); c.arc(W - 70 + i * 22, 26, 7, 0, 7); c.fill(); });
      c.fillStyle = '#ffffff80'; c.font = '400 6px "Press Start 2P", monospace'; c.textAlign = 'right'; c.fillText('WEAK → TOUGH', W - 12, 46);
      if (n === 0 && t < 5) { c.fillStyle = '#ffffffaa'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('hold to pump, let go to cash in', W / 2, 620); }
    },
    down() { if (state === 'pump') pumping = true; },
    up() {
      if (state !== 'pump' || !pumping) return; pumping = false;
      if (size < .12) return;
      const pts = Math.round(size * 100); score += pts; n++; bank.push(pts); api.score(score); state = 'wait'; wait = .9; haptic('success');
      feel.juice.burst(W / 2, 330 - size * 40, { n: 8 + Math.round(size * 20), speed: 150, life: .6, size: 3, color: ['#7dff9a', '#ffffff', kind.col], gravity: 220 }); sfx(600 + pts * 4, .15, 'triangle', .05, 300);
    },
    key(k, d) { if (k === ' ') { if (d) self.down(); else self.up(); } },
  };
  return self;
}

export default {
  id: 'balloon-pump', title: 'Balloon Pump', tag: 'Casual · Risk', retro: false, w: W, h: H, goal: 450,
  hint: 'Hold to pump and let go to cash in. Bigger balloons score more, but each one bursts at a secret size. Red is weakest, blue is toughest. It creaks when close.',
  make,
};
