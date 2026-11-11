import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// Draw a line of dominoes from the start tile with one stroke, passing close to the bells, then
// watch them topple. You only have so many dominoes, and they can't stand on the rocks.
const W = 360, H = 640, GAP = 18, RING = 22, TOP = 70;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let start, bells, rocks, line, budget, phase, fallI, fallT, score, level, t, drawing, msg;
  function layout() {
    start = { x: rnd(50, 310), y: rnd(520, 580) }; bells = []; rocks = [];
    const nb = Math.min(5, 2 + Math.floor(level / 2));
    while (bells.length < nb) { const b = { x: rnd(40, 320), y: rnd(130, 470), rung: false }; if (Math.hypot(b.x - start.x, b.y - start.y) > 120 && bells.every(o => Math.hypot(o.x - b.x, o.y - b.y) > 90)) bells.push(b); }
    for (let i = 0; i < 40 && rocks.length < Math.min(6, 1 + level); i++) { const r = { x: rnd(30, 330), y: rnd(120, 520), r: rnd(16, 26) }; if ([start, ...bells].every(o => Math.hypot(o.x - r.x, o.y - r.y) > r.r + 40)) rocks.push(r); }
    // budget: a tour from the start through every bell (nearest-first) plus slack
    let len = 0, p = start; const left = bells.slice();
    while (left.length) { left.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); const q = left.shift(); len += Math.hypot(q.x - p.x, q.y - p.y); p = q; }
    budget = Math.ceil(len / GAP * Math.max(1.25, 1.6 - level * .05)) + 3;
    line = [{ x: start.x, y: start.y, fall: 0 }]; phase = 'draw'; fallI = 0; fallT = 0; drawing = false;
  }
  function extend(x, y) {
    let last = line[line.length - 1];
    while (Math.hypot(x - last.x, y - last.y) >= GAP && line.length < budget) {
      const a = Math.atan2(y - last.y, x - last.x), p = { x: last.x + Math.cos(a) * GAP, y: last.y + Math.sin(a) * GAP, a, fall: 0 };
      if (p.y < TOP || p.y > H - 10 || p.x < 10 || p.x > W - 10) return;
      if (rocks.some(r => Math.hypot(r.x - p.x, r.y - p.y) < r.r + 6)) { haptic('warning'); return; }
      line.push(p); last = p; haptic('tick'); sfx(900 + line.length * 4, .015, 'square', .015);
    }
  }
  return {
    reset() { score = 0; level = 0; t = 0; msg = null; feel.clear(); layout(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; if (msg) msg.l -= dt;
      if (phase === 'fall') {
        fallT += dt;
        while (fallT > .07 && fallI < line.length) {
          fallT -= .07; const d = line[fallI]; d.fall = 1; sfx(500 + (fallI % 8) * 40, .02, 'square', .02);
          for (const b of bells) if (!b.rung && Math.hypot(b.x - d.x, b.y - d.y) < RING) { b.rung = true; score++; api.score(score); feel.juice.burst(b.x, b.y, { n: 16, speed: 170, life: .5, size: 3.5, color: ['#ffd34a', '#7dff9a', '#ffffff'] }).pop(b.x, b.y - 22, '+1', { color: '#7dff9a' }).shake(2); haptic('success'); sfx(1300, .3, 'triangle', .05); }
          fallI++;
        }
        if (fallI >= line.length && fallT > .5) {
          const all = bells.every(b => b.rung);
          if (all) { level++; msg = { txt: 'ALL RUNG!', l: 1.2 }; feel.win(W / 2, 300); layout(); }
          else { msg = { txt: 'MISSED A BELL', l: 1.2 }; phase = 'done'; fallT = 0; feel.juice.shake(6); haptic('error'); }
        }
      } else if (phase === 'done') { fallT += dt; if (fallT > 1.2) return api.over(); }
    },
    draw(c) {
      c.fillStyle = '#2e2a24'; c.fillRect(0, 0, W, H); c.fillStyle = '#3a342c'; for (let y = 0; y < H; y += 40) c.fillRect(0, y, W, 20);
      feel.begin(c);
      for (const r of rocks) { c.fillStyle = '#7a7268'; c.beginPath(); c.arc(r.x, r.y, r.r, 0, 7); c.fill(); c.fillStyle = '#958c80'; c.beginPath(); c.arc(r.x - r.r * .3, r.y - r.r * .3, r.r * .4, 0, 7); c.fill(); }
      for (const b of bells) {
        c.strokeStyle = b.rung ? '#7dff9a60' : '#ffd34a40'; c.lineWidth = 2; c.setLineDash([3, 4]); c.beginPath(); c.arc(b.x, b.y, RING, 0, 7); c.stroke(); c.setLineDash([]);
        c.fillStyle = b.rung ? '#7dff9a' : '#ffd34a'; c.beginPath(); c.moveTo(b.x - 12, b.y + 8); c.quadraticCurveTo(b.x - 12, b.y - 14, b.x, b.y - 14); c.quadraticCurveTo(b.x + 12, b.y - 14, b.x + 12, b.y + 8); c.fill(); c.beginPath(); c.arc(b.x, b.y + 10, 3, 0, 7); c.fill();
      }
      line.forEach((d, i) => {
        c.save(); c.translate(d.x, d.y); c.rotate((d.a ?? -Math.PI / 2) + Math.PI / 2);
        if (d.fall) { c.fillStyle = '#d8d0c0'; c.fillRect(-7, -16, 14, 18); } else { c.fillStyle = i === 0 ? '#ff6b6b' : '#f6f0e4'; c.fillRect(-7, -3, 14, 6); c.fillStyle = '#222'; c.fillRect(-1, -3, 2, 6); }
        c.restore();
      });
      feel.end(c, W, H);
      c.fillStyle = '#ffffffcc'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`DOMINOES ${budget - line.length}`, 12, 22); c.fillText(`LEVEL ${level + 1}`, 12, 40);
      if (phase === 'draw') {
        c.fillStyle = line.length > 1 ? '#ff6b6b' : '#ffffff30'; c.beginPath(); c.roundRect(W - 112, 18, 100, 36, 10); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText('PUSH', W - 62, 41);
        if (line.length === 1) { c.font = '600 14px Rubik, sans-serif'; c.fillStyle = '#ffffffaa'; c.fillText('drag from the red tile past every bell', W / 2, 625); }
      }
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.txt.startsWith('ALL') ? '#7dff9a' : '#ff6b6b'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 100); c.globalAlpha = 1; }
    },
    down(x, y) {
      if (phase !== 'draw') return;
      if (x > W - 112 && y < 60) { if (line.length > 1) { phase = 'fall'; haptic('medium'); } return; }
      const last = line[line.length - 1]; if (Math.hypot(x - last.x, y - last.y) < 40) drawing = true;
    },
    move(x, y) { if (drawing) extend(x, y); },
    up() { drawing = false; },
    key(k, d) {
      if (!d || k !== ' ' || phase !== 'draw') return;
      for (const b of bells.slice().sort((a, q) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(q.x - start.x, q.y - start.y))) for (let s = 0; s < 40; s++) extend(b.x, b.y);
      phase = 'fall';
    },
  };
}

export default {
  id: 'domino-chain', title: 'Domino Chain', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 10,
  hint: 'Drag from the red domino to lay a line that passes by every bell, steering round the rocks. Then press Push and watch them fall. Dominoes are limited.',
  make,
};
