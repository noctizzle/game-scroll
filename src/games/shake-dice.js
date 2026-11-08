import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { onShake, haptic } = gs.device;
const { rnd } = gs.util;

// A push-your-luck dice duel against the house. Shake the phone (or tap ROLL) to roll: every roll adds
// to your pot, but a 1 wipes the pot and ends your turn. BANK to keep it. First to 40 wins.
const W = 360, H = 640, GOAL = 40;
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

function make(api) {
  let me, cpu, pot, turn, die, rolling, msg, t, off, wait, cpuPlan, wins;
  function roll() {
    if (rolling > 0 || wait > 0) return; rolling = .7; haptic('medium'); sfx(200, .1, 'square', .04, 300);
  }
  function settle() {
    die = 1 + (Math.random() * 6 | 0); haptic(die === 1 ? 'error' : 'light'); sfx(die === 1 ? 140 : 500 + die * 40, .12, 'square', .05, die === 1 ? -50 : 100);
    if (die === 1) { pot = 0; msg = { txt: 'BUST!', l: 1.2 }; endTurn(); }
    else { pot += die; if ((turn === 'me' ? me : cpu) + pot >= GOAL) bank(); }
  }
  function bank() {
    if (rolling > 0 || wait > 0) return;
    if (turn === 'me') { me += pot; api.score(me); } else cpu += pot;
    if (pot) { msg = { txt: `+${pot} BANKED`, l: 1 }; haptic('success'); sfx(880, .15, 'triangle', .05, 200); }
    pot = 0;
    if (me >= GOAL || cpu >= GOAL) { wins = me >= GOAL; msg = { txt: wins ? 'YOU WIN!' : 'HOUSE WINS', l: 9 }; if (wins) { me += 20; api.score(me); } wait = 1.6; turn = 'end'; return; }
    endTurn();
  }
  function endTurn() { turn = turn === 'me' ? 'cpu' : 'me'; wait = 1; cpuPlan = cpu > me + 8 ? 10 : me >= GOAL - 10 ? 25 : rnd(12, 20); }
  return {
    reset() { me = 0; cpu = 0; pot = 0; turn = 'me'; die = 6; rolling = 0; msg = null; t = 0; wait = 0; wins = false; off?.(); off = onShake(() => { if (turn === 'me') roll(); }); },
    update(dt) {
      t += dt; if (msg) msg.l -= dt;
      if (wait > 0) { wait -= dt; if (wait <= 0 && turn === 'end') { off?.(); return api.over(); } return; }
      if (rolling > 0) { rolling -= dt; if (Math.random() < dt * 20) { die = 1 + (Math.random() * 6 | 0); haptic('tick'); } if (rolling <= 0) settle(); return; }
      if (turn === 'cpu') { if (pot >= cpuPlan) bank(); else roll(); }
    },
    draw(c) {
      c.fillStyle = '#123524'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffffff08'; c.beginPath(); c.arc(W / 2, 320, 200, 0, 7); c.fill();
      const bar = (y, v, col, name, active) => {
        c.fillStyle = '#ffffff18'; c.fillRect(30, y, 300, 16); c.fillStyle = col; c.fillRect(30, y, 300 * Math.min(1, v / GOAL), 16);
        if (active && pot) { c.fillStyle = col + '60'; c.fillRect(30 + 300 * Math.min(1, v / GOAL), y, 300 * Math.min(pot, GOAL - v) / GOAL, 16); }
        c.fillStyle = active ? '#fff' : '#ffffff80'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${name} ${v}`, 30, y - 6);
      };
      bar(90, me, '#ffd34a', 'YOU', turn === 'me'); bar(140, cpu, '#ff6b6b', 'HOUSE', turn === 'cpu');
      c.textAlign = 'right'; c.fillStyle = '#ffffff60'; c.fillText(`FIRST TO ${GOAL}`, 330, 84);
      // die
      const s = 110, jit = rolling > 0 ? rnd(-8, 8) : 0;
      c.save(); c.translate(W / 2 + jit, 310 + jit); c.rotate(rolling > 0 ? rnd(-.3, .3) : 0);
      c.fillStyle = '#fafafa'; c.beginPath(); c.roundRect(-s / 2, -s / 2, s, s, 18); c.fill();
      c.fillStyle = die === 1 && rolling <= 0 ? '#e33' : '#222'; for (const [px, py] of PIPS[die]) { c.beginPath(); c.arc(px * 28, py * 28, 10, 0, 7); c.fill(); }
      c.restore();
      c.fillStyle = '#fff'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(`POT ${pot}`, W / 2, 420);
      if (turn === 'me' && wait <= 0) {
        c.fillStyle = '#ffd34a'; c.beginPath(); c.roundRect(30, 480, 140, 70, 16); c.fill(); c.fillStyle = pot ? '#7dff9a' : '#ffffff30'; c.beginPath(); c.roundRect(190, 480, 140, 70, 16); c.fill();
        c.fillStyle = '#123524'; c.font = '400 12px "Press Start 2P", monospace'; c.fillText('ROLL', 100, 521); c.fillText('BANK', 260, 521);
        c.fillStyle = '#ffffff80'; c.font = '500 13px Rubik, sans-serif'; c.fillText('shake your phone to roll', W / 2, 590);
      } else if (turn === 'cpu') { c.fillStyle = '#ffffff80'; c.font = '500 14px Rubik, sans-serif'; c.fillText('the house is rolling…', W / 2, 520); }
      if (msg && msg.l > 0) { c.globalAlpha = Math.min(1, msg.l * 2); c.fillStyle = msg.txt.includes('BUST') || msg.txt.includes('HOUSE') ? '#ff6b6b' : '#7dff9a'; c.font = '400 16px "Press Start 2P", monospace'; c.fillText(msg.txt, W / 2, 220); c.globalAlpha = 1; }
    },
    down(x, y) { if (turn !== 'me' || wait > 0 || y < 470 || y > 560) return; if (x < W / 2) roll(); else if (pot) bank(); },
    key(k, d) { if (!d || turn !== 'me') return; if (k === ' ' || k === 'r') roll(); if (k === 'b' || k === 'Enter') bank(); },
  };
}

export default {
  id: 'shake-dice', title: 'Shake Dice', tag: 'Casual · Shake', retro: false, w: W, h: H, goal: 40,
  hint: 'Shake your phone (or tap ROLL) to roll. Each roll adds to your pot, but a 1 loses it. BANK to keep it. First to 40 beats the house.',
  make,
};
