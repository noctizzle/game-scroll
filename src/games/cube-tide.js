import { clamp } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Waves of stone cubes tumble down a floating floor toward the edge. Tap a tile to set a trap,
// then tap it again when a cube is on it to sink the cube. Grey cubes must be caught: every few
// that roll off the edge, the floor loses a row. Green cubes leave a big 3x3 trap where they sank
// (tap anywhere to spring it). Never sink a black cube - let those roll away - or the floor
// crumbles. When the floor is too short to stand on, it's over.
let W = 160, H = 192;

function make(api) {
  let cols, rows, cubes, trap, big, rollT, period, wave, score, t, esc, parts, msg, dead, fallRows, waveClean;
  const tile = () => Math.max(12, Math.min(28, Math.floor((W - 16) / cols), Math.floor((H - 30) / rows)));
  const ox = () => (W - cols * tile()) >> 1, oy = () => 16 + ((H - 22 - rows * tile()) >> 1);
  function newWave() {
    wave++; const depth = Math.min(4, 2 + (wave / 3 | 0)), blackP = wave < 2 ? 0 : Math.min(.22, .08 + wave * .015), greenP = .1;
    for (let r = 0; r < depth; r++) for (let c = 0; c < cols; c++) { const k = Math.random(); cubes.push({ c, r: -1 - r, k: k < blackP ? 'black' : k < blackP + greenP ? 'green' : 'grey', sink: 0 }); }
    period = Math.max(.75, 1.7 - wave * .07); waveClean = true; msg = { txt: `WAVE ${wave}`, l: 1 };
  }
  function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: (Math.random() - .5) * 80, vy: -Math.random() * 70, l: .5, col }); }
  function capture(cells) {
    let got = 0, bad = 0, green = null;
    for (const q of cubes) if (!q.sink && cells.some(([c, r]) => q.c === c && q.r === r)) { q.sink = .01; if (q.k === 'black') bad++; else { got++; if (q.k === 'green') green = { c: q.c, r: q.r }; } burst(ox() + (q.c + .5) * tile(), oy() + (q.r + .5) * tile(), q.k === 'black' ? '#303040' : q.k === 'green' ? '#60e070' : '#c0c0d0'); }
    if (got) { score += got * (got > 1 ? 2 : 1); api.score(score); haptic(got > 1 ? 'success' : 'medium'); sfx(500 + got * 80, .12, 'square', .05, 300); }
    if (bad) { waveClean = false; for (let i = 0; i < bad; i++) loseRow('BLACK CUBE!'); }
    if (green) { big = { ...green }; sfx(900, .2, 'square', .04, 400); }
  }
  function loseRow(txt) { rows--; fallRows.push({ r: rows, l: .8 }); msg = { txt, l: 1.2 }; haptic('heavy'); sfx(120, .4, 'sawtooth', .05, -60); for (const q of cubes) if (q.r >= rows) q.r = 99; if (trap && trap.r >= rows) trap = null; if (rows < 5) { dead = .01; msg = { txt: 'THE FLOOR FELL!', l: 9 }; } }
  const self = {
    reset() { cols = 4; rows = 11; cubes = []; trap = null; big = null; rollT = 0; wave = 0; score = 0; t = 0; esc = 0; parts = []; dead = 0; fallRows = []; newWave(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } parts = parts.filter(p => p.l > 0);
      for (const f of fallRows) f.l -= dt; fallRows = fallRows.filter(f => f.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.4) api.over(); return; }
      for (const q of cubes) if (q.sink) q.sink += dt;
      cubes = cubes.filter(q => q.sink < .5 && q.r < 99);
      rollT += dt;
      if (rollT >= period) {
        rollT = 0;
        for (const q of cubes) if (!q.sink) q.r++;
        for (const q of cubes) if (!q.sink && q.r >= rows) { q.r = 99; if (q.k !== 'black') { esc++; waveClean = false; parts.push({ x: ox() + (q.c + .5) * tile(), y: oy() + rows * tile(), vx: 0, vy: 40, l: .6, col: '#909098' }); if (esc >= 3) { esc = 0; loseRow('TOO MANY GOT AWAY'); } } }
        sfx(160, .05, 'square', .03, -20);
        if (!cubes.some(q => !q.sink && q.r < 99)) { if (waveClean && wave > 0) { score += 5; api.score(score); msg = { txt: 'PERFECT WAVE +5', l: 1.2 }; haptic('success'); } newWave(); }
      }
    },
    draw(c) {
      const T = tile(), X = ox(), Y = oy();
      c.fillStyle = '#181828'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 30; i++) { c.fillStyle = i % 3 ? '#303050' : '#5050a0'; c.fillRect((i * 61) % W, (i * 43 + t * 4) % H, 1, 1); }
      // floor
      for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) { c.fillStyle = (r + cc) % 2 ? '#7880a8' : '#8890b8'; c.fillRect(X + cc * T, Y + r * T, T - 1, T - 1); }
      c.fillStyle = '#4a5078'; c.fillRect(X, Y + rows * T, cols * T, 5);
      for (const f of fallRows) { c.globalAlpha = f.l; c.fillStyle = '#7880a8'; c.fillRect(X, Y + f.r * T + (1 - f.l) * 60, cols * T, T - 1); c.globalAlpha = 1; }
      if (big) { c.fillStyle = (t * 6 | 0) % 2 ? '#60e07080' : '#60e07040'; c.fillRect(X + (big.c - 1) * T, Y + (big.r - 1) * T, T * 3, T * 3); c.save(); c.beginPath(); c.rect(X, Y, cols * T, rows * T); c.clip(); c.strokeStyle = '#60e070'; c.lineWidth = 2; c.strokeRect(X + (big.c - 1) * T + 1, Y + (big.r - 1) * T + 1, T * 3 - 2, T * 3 - 2); c.restore(); }
      if (trap) { c.fillStyle = '#4080f8a0'; c.fillRect(X + trap.c * T, Y + trap.r * T, T - 1, T - 1); c.strokeStyle = '#a0c8ff'; c.lineWidth = 1; c.strokeRect(X + trap.c * T + 2.5, Y + trap.r * T + 2.5, T - 6, T - 6); }
      // cubes roll: draw slightly lifted while tumbling between rows
      const k = rollT / period, tumble = k > .75 ? (k - .75) / .25 : 0;
      c.save(); c.beginPath(); c.rect(0, Y - T * 1.2, W, rows * T + T * 1.2 + 6); c.clip();
      for (const q of [...cubes].sort((a, b) => a.r - b.r)) {
        const sk = q.sink ? q.sink / .5 : 0, ty = q.sink ? 0 : tumble, x = X + q.c * T, y = Y + (q.r + ty) * T - Math.sin(ty * Math.PI) * T * .3, s = T - 1, inset = sk * s / 2;
        const col = q.k === 'black' ? ['#303040', '#505068', '#181820'] : q.k === 'green' ? ['#40b050', '#80e888', '#207028'] : ['#b0b0c0', '#d8d8e8', '#787888'];
        c.fillStyle = col[2]; c.fillRect(x + inset, y + inset - 4 * (1 - sk), s - inset * 2, s - inset * 2 + 4 * (1 - sk));
        c.fillStyle = col[0]; c.fillRect(x + inset, y + inset - 4 * (1 - sk), s - inset * 2, s - inset * 2);
        c.fillStyle = col[1]; c.fillRect(x + inset, y + inset - 4 * (1 - sk), s - inset * 2, 2);
        if (q.k === 'black' && !sk) { c.fillStyle = '#f84040'; c.fillRect(x + s / 2 - 1, y + s / 2 - 6, 2, 5); c.fillRect(x + s / 2 - 1, y + s / 2 + 1 - 2, 2, 2); }
      }
      c.restore();
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); }
      c.fillStyle = '#10101c'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = '#e0e0f0'; c.fillText(`ROWS ${rows}`, 4, 9);
      c.textAlign = 'right'; for (let i = 0; i < 3; i++) { c.fillStyle = i < esc ? '#f86060' : '#404058'; c.fillRect(W - 8 - i * 7, 3, 5, 6); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000c'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f8e070'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 7 && !msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#e0e0f0'; c.fillText('TAP: SET TRAP', W / 2, H - 14); c.fillText('TAP IT AGAIN: SINK', W / 2, H - 5); }
    },
    down(x, y) {
      if (dead) return;
      if (big) { capture([-1, 0, 1].flatMap(dc => [-1, 0, 1].map(dr => [big.c + dc, big.r + dr]))); big = null; return; }
      const T = tile(), cc = Math.floor((x - ox()) / T), r = Math.floor((y - oy()) / T);
      if (cc < 0 || cc >= cols || r < 0 || r >= rows) { if (trap) { capture([[trap.c, trap.r]]); trap = null; } return; }
      if (trap && trap.c === cc && trap.r === r) { capture([[cc, r]]); trap = null; return; }
      trap = { c: cc, r }; sfx(700, .03, 'square', .03); haptic('tick');
    },
    move() {}, up() {},
    key(k, d) { if (!d) return; if (!trap) trap = { c: 0, r: rows - 2 }; if (k === 'ArrowLeft') trap.c = clamp(trap.c - 1, 0, cols - 1); else if (k === 'ArrowRight') trap.c = clamp(trap.c + 1, 0, cols - 1); else if (k === 'ArrowUp') trap.r = clamp(trap.r - 1, 0, rows - 1); else if (k === 'ArrowDown') trap.r = clamp(trap.r + 1, 0, rows - 1); else if (k === ' ') { if (big) self.down(0, 0); else { capture([[trap.c, trap.r]]); trap = null; } } },
  };
  return self;
}

export default {
  id: 'cube-tide', title: 'Cube Tide', tag: 'Advance · Puzzle', retro: true, era: 'advance', pal: 'grape', w: 160, h: 192, maxW: 240, maxH: 320, goal: 60,
  hint: 'Tap a tile to set a trap, then tap it again while a cube sits on it to sink the cube. Grey cubes must be caught: three escapes cost a row. Green cubes leave a 3x3 trap, tap anywhere to spring it. Never sink black cubes, let them roll off. The floor falls when it gets too short.',
  make,
};
