import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A dinosaur skeleton is buried in the quarry. Rub with your finger to brush the dirt away
// gently. Tap to swing the pick, which clears a big hole at once but cracks any bone it hits.
// While you brush, your phone ticks when there's bone under the dirt. Uncover the whole skeleton
// before the light goes; cracked bones lower your score.
const CS = 4;
let W = 176, H = 176;

function make(api) {
  let cols, rows, dirt, bone, crack, total, time, digs, score, t, parts, msg, dead, done, brush, last, tapStart, tickT;
  const top = 14;
  function line(x0, y0, x1, y1, w) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let dx = -w; dx <= w; dx++) for (let dy = -w; dy <= w; dy++) { const cx = Math.round(x + dx), cy = Math.round(y + dy); if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) bone[cy * cols + cx] = 1; } } }
  function build() {
    cols = Math.floor(W / CS); rows = Math.floor((H - top) / CS); dirt = new Float32Array(cols * rows); bone = new Uint8Array(cols * rows); crack = new Uint8Array(cols * rows);
    for (let i = 0; i < dirt.length; i++) dirt[i] = 2 + Math.random() * 1.2;
    // a skeleton: curved spine, skull, ribs, legs and a tail, sized to the pit
    const cx = cols / 2 + rnd(-3, 3), cy = rows * .45, len = cols * rnd(.32, .4), dir = Math.random() < .5 ? 1 : -1, bend = rnd(-.15, .15);
    const sp = i => ({ x: cx + dir * (i - .5) * len * 2, y: cy + Math.sin(i * Math.PI) * -rows * .08 + (i - .5) * rows * bend });
    for (let i = 0; i < 12; i++) { const a = sp(i / 12), b = sp((i + 1) / 12); line(a.x, a.y, b.x, b.y, i > 2 && i < 9 ? 1 : 0); }
    const head = sp(1); line(head.x, head.y, head.x + dir * 5, head.y - 2, 1); line(head.x + dir * 5, head.y - 2, head.x + dir * 9, head.y + 1, 1);
    for (let i = 4; i <= 8; i++) { const p = sp(i / 12); line(p.x, p.y + 1, p.x - dir, p.y + rows * .14, 0); }
    for (const k of [.32, .7]) { const p = sp(k); line(p.x, p.y + 1, p.x + rnd(-2, 2), p.y + rows * .25, 1); line(p.x + rnd(-2, 2), p.y + rows * .25, p.x + dir * 3, p.y + rows * .38, 0); }
    total = bone.reduce((a, b) => a + b, 0); time = Math.max(16, 34 - digs * 2.5); done = 0; msg = { txt: `DIG ${digs + 1}`, l: 1 };
  }
  function exposed() { let n = 0; for (let i = 0; i < bone.length; i++) if (bone[i] && dirt[i] <= 0) n++; return n / total; }
  function cracked() { let n = 0; for (let i = 0; i < bone.length; i++) if (crack[i]) n++; return n / total; }
  function finish(ok) {
    const e = exposed(), cr = cracked(), pts = Math.round(e * 100 * (1 - cr * 1.5) + Math.max(0, time) * 1.5);
    if (ok) { score += Math.max(0, pts); api.score(score); digs++; done = .01; haptic('success'); sfx(880, .4, 'square', .05, 500); msg = { txt: cr < .02 ? 'MUSEUM QUALITY!' : `${Math.round((1 - cr) * 100)}% INTACT`, l: 1.8 }; }
    else { score += Math.round(e * 40); api.score(score); dead = .01; haptic('error'); sfx(140, .5, 'square', .05, -60); msg = { txt: `DARK! ${Math.round(e * 100)}% DUG`, l: 9 }; }
  }
  function brushAt(x, y, dt) {
    const c0 = Math.floor(x / CS), r0 = Math.floor((y - top) / CS); let feel = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const c = c0 + dx, r = r0 + dy; if (c < 0 || r < 0 || c >= cols || r >= rows || dx * dx + dy * dy > 5) continue; const i = r * cols + c; if (dirt[i] > 0) { dirt[i] -= dt * 5.5; if (dirt[i] <= 0) { dirt[i] = 0; if (Math.random() < .2) parts.push({ x: c * CS + 2, y: top + r * CS, vx: rnd(-20, 20), vy: rnd(-30, -5), l: .3, col: '#a07850' }); } if (bone[i]) feel = true; } }
    tickT -= dt; if (feel && tickT <= 0) { haptic('tick'); tickT = .09; } if ((t * 14 | 0) % 3 === 0) sfx(1800 + Math.random() * 600, .015, 'triangle', .008);
  }
  function pickAt(x, y) {
    const c0 = Math.floor(x / CS), r0 = Math.floor((y - top) / CS); let hit = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const c = c0 + dx, r = r0 + dy; if (c < 0 || r < 0 || c >= cols || r >= rows || dx * dx + dy * dy > 10) continue; const i = r * cols + c; if (bone[i] && dirt[i] > 0 && !crack[i]) { crack[i] = 1; hit++; } dirt[i] = 0; }
    for (let i = 0; i < 8; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-70, -10), l: .4, col: '#806040' });
    if (hit) { haptic('heavy'); sfx(900, .1, 'square', .05, -500); parts.push({ txt: 'CRACK!', x, y: y - 8, l: .8, col: '#f86060' }); } else { haptic('medium'); sfx(160, .06, 'square', .05, -60); }
  }
  const self = {
    reset() { digs = 0; score = 0; t = 0; parts = []; dead = 0; brush = null; tickT = 0; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (dirt) build(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.8) api.over(); return; }
      if (done) { done += dt; if (done > 1.9) build(); return; }
      time -= dt; if (time <= 0) { time = 0; finish(exposed() >= .8); return; }
      if (brush && brush.on) brushAt(brush.x, brush.y, dt);
      if (exposed() >= .97) finish(true);
    },
    draw(c) {
      c.fillStyle = '#3a2a1c'; c.fillRect(0, 0, W, H);
      const shade = ['#6a4c30', '#7c5a38', '#8c6840', '#9c7648'];
      for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
        const i = r * cols + cc, d = dirt[i], x = cc * CS, y = top + r * CS;
        if (d > 0) { c.fillStyle = shade[clamp(Math.ceil(d), 0, 3)]; c.fillRect(x, y, CS, CS); if (((cc * 7 + r * 13) % 17) === 0) { c.fillStyle = '#5a4028'; c.fillRect(x + 1, y + 1, 1, 1); } }
        else if (bone[i]) { c.fillStyle = crack[i] ? '#b8a890' : '#f0e8d0'; c.fillRect(x, y, CS, CS); if (crack[i]) { c.fillStyle = '#504030'; c.fillRect(x + (r % 2), y + 1, 2, 1); } }
        else { c.fillStyle = '#4a3624'; c.fillRect(x, y, CS, CS); }
      }
      if (brush && brush.on) { c.strokeStyle = '#f8f0d0a0'; c.beginPath(); c.arc(brush.x, brush.y, 9, 0, 7); c.stroke(); }
      for (const p of parts) { if (p.txt) { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // light fades as time runs out
      if (time < 10) { c.fillStyle = `rgba(10,6,20,${(1 - time / 10) * .55})`; c.fillRect(0, top, W, H - top); }
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#1c140c'; c.fillRect(0, 0, W, top);
      c.textAlign = 'left'; c.fillStyle = time < 8 && (t * 4 | 0) % 2 ? '#f86060' : '#f0e8d0'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
      c.fillStyle = '#403020'; c.fillRect(30, 4, 50, 6); c.fillStyle = '#f0e8d0'; c.fillRect(30, 4, 50 * exposed(), 6);
      c.textAlign = 'right'; c.fillStyle = '#f8c060'; c.fillText(String(score), W - 4, 10);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 7 && !msg && digs === 0) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 22, W, 20); c.fillStyle = '#f0e8d0'; c.fillText('RUB: BRUSH (SAFE)', W / 2, H - 14); c.fillText('TAP: PICK (CRACKS BONE)', W / 2, H - 5); }
    },
    down(x, y) { tapStart = { x, y, t: performance.now() }; brush = { x, y, on: false }; },
    move(x, y, p) { if (!p || !brush) return; brush.x = x; brush.y = y; if (Math.hypot(x - tapStart.x, y - tapStart.y) > 5) brush.on = true; },
    up() { const quick = tapStart && performance.now() - tapStart.t < 200 && !(brush && brush.on); brush = null; if (quick && !dead && !done) pickAt(tapStart.x, tapStart.y); },
    key() {},
  };
  return self;
}

export default {
  id: 'fossil-dig', title: 'Fossil Dig', tag: 'Advance · Dinosaur', retro: true, era: 'advance', pal: 'lemon', w: 176, h: 176, maxW: 260, maxH: 300, goal: 300,
  hint: 'Rub to brush the dirt off gently; your phone ticks when there\'s bone underneath. Tap to swing the pick, which clears a big hole fast but cracks any bone it hits. Uncover the whole skeleton before the light goes. Cracked bones cost points.',
  make,
};
