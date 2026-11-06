import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Hold the paint taps to pour red, yellow, blue and white into the glass, then serve when it
// matches the sample. Paint mixes like paint (blue + yellow makes green). Score under 75% and you're done.
const W = 360, H = 640, CAP = 12, RATE = 2.2;
const TAPS = [
  { k: 'r', name: 'RED', col: '#e8332d', x: 54 }, { k: 'y', name: 'YELLOW', col: '#ffd21f', x: 138 },
  { k: 'b', name: 'BLUE', col: '#2a5fd6', x: 222 }, { k: 'w', name: 'WHITE', col: '#f4f4f4', x: 306 },
];
// Red-yellow-blue paint cube corners (Gossett & Chen), blended trilinearly.
const C = { '000': [1, 1, 1], '100': [1, 0, 0], '010': [1, 1, 0], '001': [.163, .373, .6], '110': [1, .5, 0], '101': [.5, 0, .5], '011': [0, .66, .2], '111': [.2, .094, 0] };
function ryb(r, y, b) {
  const out = [0, 0, 0];
  for (const ir of [0, 1]) for (const iy of [0, 1]) for (const ib of [0, 1]) {
    const w = (ir ? r : 1 - r) * (iy ? y : 1 - y) * (ib ? b : 1 - b), c = C[`${ir}${iy}${ib}`];
    for (let i = 0; i < 3; i++) out[i] += w * c[i];
  }
  return out;
}
function mix(v) {
  const m = Math.max(v.r, v.y, v.b), tot = v.r + v.y + v.b + v.w; if (!tot) return null;
  let c = m ? ryb(v.r / m, v.y / m, v.b / m) : [1, 1, 1];
  const wf = v.w / tot * .85; c = c.map(x => x + (1 - x) * wf);
  return c;
}
const css = c => `rgb(${c.map(x => Math.round(clamp(x, 0, 1) * 255)).join(',')})`;

function make(api) {
  let vol, target, pour, time, score, glasses, t, msg, judge, drips;
  function newTarget() {
    let v; do { v = { r: rnd(0, 4) | 0, y: rnd(0, 4) | 0, b: rnd(0, 4) | 0, w: Math.random() < .4 ? rnd(1, 3) | 0 : 0 }; } while (v.r + v.y + v.b === 0 || v.r + v.y + v.b + v.w > CAP);
    target = mix(v); vol = { r: 0, y: 0, b: 0, w: 0 }; time = Math.max(10, 22 - glasses); judge = null;
  }
  function serve() {
    const c = mix(vol); if (!c) return;
    const d = Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2]), acc = clamp(1 - d / .55, 0, 1), pct = Math.round(acc * 100);
    judge = { pct, l: 1.4, c };
    if (pct >= 75) { glasses++; score += Math.round(pct / 10) + (pct >= 95 ? 5 : 0); api.score(score); haptic('success'); sfx(700 + pct * 3, .2, 'triangle', .06, 200); msg = pct >= 95 ? 'PERFECT +5' : 'SERVED'; }
    else { haptic('error'); sfx(150, .3, 'triangle', .06, -50); msg = 'NOT QUITE'; }
  }
  return {
    reset() { score = 0; glasses = 0; t = 0; pour = null; msg = null; drips = []; newTarget(); },
    update(dt) {
      t += dt;
      if (judge) { judge.l -= dt; if (judge.l <= 0) { if (judge.pct < 75) return api.over(); newTarget(); } return; }
      time -= dt; if (time <= 0) { time = 0; if (vol.r + vol.y + vol.b + vol.w) serve(); else { judge = { pct: 0, l: .8, c: [1, 1, 1] }; msg = 'TOO SLOW'; haptic('error'); } return; }
      if (pour) {
        const tot = vol.r + vol.y + vol.b + vol.w;
        if (tot < CAP) { vol[pour] += Math.min(RATE * dt, CAP - tot); if (Math.random() < dt * 20) haptic('tick'); }
        drips.push({ x: TAPS.find(q => q.k === pour).x, y: 290, k: pour, l: 1 });
      }
      for (const d of drips) { d.y += dt * 700; d.x += (180 - d.x) * dt * 6; } drips = drips.filter(d => d.y < 490);
    },
    draw(c) {
      c.fillStyle = '#25202e'; c.fillRect(0, 0, W, H);
      // sample card (top-left)
      c.fillStyle = '#ffffff14'; c.beginPath(); c.roundRect(12, 40, 120, 110, 12); c.fill();
      c.fillStyle = css(target); c.beginPath(); c.roundRect(24, 52, 96, 66, 8); c.fill();
      c.fillStyle = '#ffffffaa'; c.font = '400 8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('MATCH THIS', 72, 138);
      // timer (top-right)
      c.textAlign = 'right'; c.font = '400 14px "Press Start 2P", monospace'; c.fillStyle = time < 5 ? '#ff6060' : '#ffffffcc'; c.fillText(`${Math.ceil(time)}s`, W - 14, 60);
      // taps
      for (const tp of TAPS) {
        c.fillStyle = '#8a8a96'; c.fillRect(tp.x - 8, 240, 16, 34); c.fillRect(tp.x - 24, 240, 48, 10);
        c.fillStyle = tp.col; c.beginPath(); c.roundRect(tp.x - 30, 178, 60, 64, 10); c.fill();
        c.fillStyle = pour === tp.k ? '#ffffff' : '#00000060'; c.font = '400 7px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(tp.name, tp.x, 220);
        if (pour === tp.k) { c.fillStyle = tp.col; c.fillRect(tp.x - 3, 274, 6, 16); }
      }
      for (const d of drips) { const tp = TAPS.find(q => q.k === d.k); c.fillStyle = tp.col; c.beginPath(); c.arc(d.x, d.y, 4, 0, 7); c.fill(); }
      // glass
      const gx = 110, gy = 310, gw = 140, gh = 190, tot = vol.r + vol.y + vol.b + vol.w, lv = tot / CAP * (gh - 10), col = mix(vol);
      if (col) { c.fillStyle = css(col); c.beginPath(); c.moveTo(gx + 6, gy + gh - lv); c.lineTo(gx + gw - 6, gy + gh - lv); c.lineTo(gx + gw - 14, gy + gh - 4); c.lineTo(gx + 14, gy + gh - 4); c.fill(); }
      c.strokeStyle = '#ffffffcc'; c.lineWidth = 4; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 12, gy + gh); c.lineTo(gx + gw - 12, gy + gh); c.lineTo(gx + gw, gy); c.stroke();
      c.fillStyle = '#ffffff20'; c.fillRect(gx + 16, gy + 10, 6, gh - 30);
      // buttons
      c.fillStyle = '#ffffff18'; c.beginPath(); c.roundRect(24, 520, 130, 56, 14); c.fill(); c.beginPath(); c.roundRect(206, 520, 130, 56, 14); c.fill();
      c.fillStyle = '#ffffffaa'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('EMPTY', 89, 553);
      c.fillStyle = tot ? '#7dff9a' : '#ffffff40'; c.fillText('SERVE', 271, 553);
      if (t < 4 && glasses === 0) { c.fillStyle = '#ffffff88'; c.font = '600 13px Rubik, sans-serif'; c.fillText('hold a paint tap to pour', W / 2, 610); }
      if (judge) {
        c.fillStyle = '#000000a0'; c.fillRect(0, 310, W, 150); c.fillStyle = judge.pct >= 75 ? '#7dff9a' : '#ff6060'; c.font = '400 30px "Press Start 2P", monospace'; c.textAlign = 'center';
        c.fillText(`${judge.pct}%`, W / 2, 385); c.font = '400 11px "Press Start 2P", monospace'; c.fillText(msg, W / 2, 420);
      }
    },
    down(x, y) {
      if (judge) return;
      if (y > 170 && y < 295) { const tp = TAPS.find(q => Math.abs(q.x - x) < 42); if (tp) { pour = tp.k; sfx(300, .1, 'sine', .03, -100); } return; }
      if (y > 510 && y < 586) { if (x < W / 2) { vol = { r: 0, y: 0, b: 0, w: 0 }; time = Math.max(0, time - 1.5); haptic('warning'); sfx(200, .15, 'sine', .04, -100); } else serve(); }
    },
    up() { pour = null; },
    key(k, d) { const m = { r: 'r', y: 'y', b: 'b', w: 'w' }[k]; if (m) pour = d ? m : null; if (d && k === 'Enter') serve(); if (d && k === ' ') { vol = { r: rnd(0, 3), y: rnd(0, 3), b: rnd(0, 3), w: 0 }; serve(); } },
  };
}

export default {
  id: 'liquid-mixer', title: 'Liquid Mixer', tag: 'Casual · Puzzle', retro: false, w: W, h: H, goal: 50,
  hint: 'Hold the paint taps to pour, then press Serve when your glass matches the sample. Blue and yellow make green, just like real paint. Under 75% ends the game.',
  make,
};
