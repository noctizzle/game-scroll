import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { startCamera, stopCamera, haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Point your camera at something in the real world that matches the colour card and tap to snap it.
// Without a camera you hunt through a painted scene instead (drag to look around).
const W = 360, H = 640;
const TARGETS = [['Tomato', 220, 60, 50], ['Sky', 90, 160, 230], ['Leaf', 70, 160, 70], ['Sunflower', 240, 200, 40], ['Night', 30, 30, 40], ['Snow', 235, 235, 235], ['Grape', 120, 60, 150], ['Sand', 210, 180, 130], ['Ocean', 30, 90, 140], ['Pink', 240, 140, 180], ['Coffee', 100, 65, 40], ['Orange', 245, 140, 40]];

function make(api) {
  let cam, asked, target, time, score, t, last, snapFx, pan, dragX, scene, dead, sampler;
  function pick() { let n; do { n = TARGETS[Math.random() * TARGETS.length | 0]; } while (target && n[0] === target[0]); target = n; }
  function makeScene() { scene = Array.from({ length: 26 }, () => { const k = TARGETS[Math.random() * TARGETS.length | 0]; return { x: rnd(0, W * 3), y: rnd(80, H - 120), r: rnd(30, 90), c: `rgb(${k[1] + rnd(-25, 25) | 0},${k[2] + rnd(-25, 25) | 0},${k[3] + rnd(-25, 25) | 0})` }; }); }
  return {
    reset() { stopCamera(); cam = null; asked = false; time = 45; score = 0; t = 0; last = null; snapFx = 0; pan = 0; dragX = null; dead = 0; target = null; pick(); makeScene(); sampler = sampler || Object.assign(document.createElement('canvas'), { width: 24, height: 24 }); },
    update(dt) {
      t += dt; snapFx = Math.max(0, snapFx - dt * 2);
      if (!asked) { asked = true; startCamera().then(c => { cam = c; }); }
      time -= dt; if (time <= 0) { time = 0; stopCamera(); haptic('warning'); return api.over(); }
    },
    fx(dt) { dead += dt; },
    draw(c) {
      this._c = c;
      c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
      if (cam) { const v = cam.video, s = Math.max(W / v.videoWidth, H / v.videoHeight) || 1; c.drawImage(v, (W - v.videoWidth * s) / 2, (H - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s); }
      else { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8fb8de'); g.addColorStop(1, '#c9b38a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
        for (const b of scene) { const x = ((b.x - pan) % (W * 3) + W * 3) % (W * 3) - W; c.fillStyle = b.c; c.beginPath(); c.arc(x, b.y, b.r, 0, 7); c.fill(); } }
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, H / 2, 26, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.fillRect(W / 2 - 1, H / 2 - 40, 2, 10); c.fillRect(W / 2 - 1, H / 2 + 30, 2, 10);
      // colour card
      c.fillStyle = '#000a'; c.beginPath(); c.roundRect(16, 56, W - 32, 74, 16); c.fill();
      c.fillStyle = `rgb(${target[1]},${target[2]},${target[3]})`; c.beginPath(); c.roundRect(28, 68, 50, 50, 10); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '700 20px Rubik, sans-serif'; c.fillText(`Find: ${target[0]}`, 92, 92);
      c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#ffffffb0'; c.fillText(cam ? 'Aim the circle and tap to snap' : 'Drag to look around, tap to snap', 92, 112);
      c.textAlign = 'right'; c.font = '400 14px "Press Start 2P", monospace'; c.fillStyle = time < 8 ? '#ff6b6b' : '#fff'; c.fillText(`${Math.ceil(time)}`, W - 30, 98);
      if (last) { c.fillStyle = '#000a'; c.beginPath(); c.roundRect(16, H - 96, W - 32, 56, 14); c.fill(); c.fillStyle = last.rgb; c.beginPath(); c.roundRect(28, H - 86, 36, 36, 8); c.fill();
        c.fillStyle = last.ok ? '#7dffb2' : '#ff8a8a'; c.textAlign = 'left'; c.font = '700 16px Rubik, sans-serif'; c.fillText(`${last.pct}% match${last.ok ? ' · +1' : ''}`, 76, H - 62); }
      if (snapFx > 0) { c.fillStyle = `rgba(255,255,255,${snapFx * .8})`; c.fillRect(0, 0, W, H); }
    },
    down(x) { dragX = x; this._moved = false; },
    move(x, y, p) { if (p && dragX != null && !cam) { pan -= x - dragX; dragX = x; this._moved = true; } },
    up() {
      dragX = null; if (this._moved || !this._c) return;
      // sample the reticle from what's on screen
      const k = this._c.getTransform().a, sx = this._c.canvas;
      const sc = sampler.getContext('2d', { willReadFrequently: true }); sc.drawImage(sx, (W / 2 - 18) * k, (H / 2 - 18) * k, 36 * k, 36 * k, 0, 0, 24, 24);
      const d = sc.getImageData(4, 4, 16, 16).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; r /= n; g /= n; b /= n;
      const dist = Math.sqrt(2 * (r - target[1]) ** 2 + 4 * (g - target[2]) ** 2 + 3 * (b - target[3]) ** 2) / 3, pct = clamp(Math.round(100 - dist / 2.2), 0, 100), ok = pct >= 72;
      last = { rgb: `rgb(${r | 0},${g | 0},${b | 0})`, pct, ok }; snapFx = 1;
      if (ok) { score++; api.score(score); time += 4; haptic('success'); sfx(880, .15, 'triangle', .05, 300); pick(); } else { haptic('light'); sfx(300, .08, 'triangle', .04, -80); }
    },
  };
}

export default {
  id: 'color-hunt', title: 'Colour Hunt', tag: 'Casual · Camera', retro: false, w: W, h: H, goal: 3,
  hint: 'Find something around you that matches the colour card, aim the circle at it and tap.',
  make,
};
