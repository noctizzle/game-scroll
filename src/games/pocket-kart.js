import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A flat-plane kart racer in the style of the early-2000s handheld scaling tricks. Hold either side
// to steer. Grass slows you down. Overtake rivals for points and finish each lap before the clock
// runs out; every lap adds time.
const WORLD = 1024, CELL = 4, N = WORLD / CELL, PTS = 240, HALF = 34;
const RIVAL = ['#e04040', '#38b8e8', '#f8d838'];
let W = 160, H = 160;

function buildTrack() {
  const a1 = rnd(0, 6), a2 = rnd(0, 6), k1 = rnd(.15, .26), k2 = rnd(.06, .14);
  const line = [];
  for (let i = 0; i < PTS; i++) { const th = i / PTS * Math.PI * 2, r = 330 * (1 + k1 * Math.sin(2 * th + a1) + k2 * Math.sin(3 * th + a2)); line.push({ x: 512 + Math.cos(th) * r, y: 512 + Math.sin(th) * r * .8 }); }
  const tex = new Uint8Array(N * N); // 0 grass, 1 road, 2 kerb, 3 start
  for (let i = 0; i < PTS; i++) {
    const a = line[i], b = line[(i + 1) % PTS];
    for (let s = 0; s < 1; s += .25) { const x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s;
      const R = (HALF + 5) / CELL | 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const cx = (x / CELL | 0) + dx, cy = (y / CELL | 0) + dy; if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue; const d = Math.hypot(dx, dy) * CELL, k = cy * N + cx;
        if (d < HALF) tex[k] = i < 2 ? 3 : (tex[k] === 3 ? 3 : 1); else if (d < HALF + 5 && tex[k] === 0) tex[k] = 2; }
    }
  }
  return { line, tex };
}

function make(api) {
  let trk, x, y, a, v, steer, rivals, lap, prog, timer, score, t, img, flash, held, pos, msg, go;
  const at = (wx, wy) => { const cx = wx / CELL | 0, cy = wy / CELL | 0; return cx < 0 || cy < 0 || cx >= N || cy >= N ? 0 : trk.tex[cy * N + cx]; };
  function nearest(px, py, from) { let best = from, bd = 1e9; for (let k = -12; k <= 12; k++) { const i = (from + k + PTS) % PTS, p = trk.line[i], d = (p.x - px) ** 2 + (p.y - py) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
  const total = () => lap * PTS + prog;
  function place() { let ahead = 0; for (const r of rivals) if (r.p > total()) ahead++; return ahead + 1; }
  const self = {
    reset() {
      trk = buildTrack(); const p0 = trk.line[2], p1 = trk.line[4]; a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      x = p0.x; y = p0.y; v = 0; steer = 0; lap = 0; prog = 2; timer = 30; score = 0; t = 0; flash = 0; held = null; msg = null; go = 1.5;
      rivals = RIVAL.map((col, i) => ({ p: 8 + i * 7, lane: (i - 1) * 14, sp: 92 + i * 6 + rnd(0, 6), col }));
      pos = place();
    },
    resize(w, h) { W = w; H = h; img = null; },
    update(dt) {
      t += dt; flash = Math.max(0, flash - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (go > 0) { go -= dt; if (go <= 0) { sfx(880, .2, 'square', .05); haptic('medium'); } return; }
      timer -= dt; if (timer <= 0) { haptic('error'); sfx(140, .5, 'square', .05, -60); return api.over(); }
      const target = held ? held.s : 0; steer += (target - steer) * Math.min(1, dt * 10);
      const ground = at(x, y), top = ground === 0 ? 55 : 150;
      v += (v < top ? 70 : -160) * dt; v = clamp(v, 0, 160);
      a += steer * dt * (1.4 + v / 120) * .9;
      x += Math.cos(a) * v * dt; y += Math.sin(a) * v * dt; x = clamp(x, 4, WORLD - 4); y = clamp(y, 4, WORLD - 4);
      if (ground === 0 && v > 60 && (t * 20 | 0) % 3 === 0) haptic('tick');
      const np = nearest(x, y, prog);
      if (prog > PTS * .8 && np < PTS * .2) { lap++; const add = Math.max(10, 24 - lap * 2); timer += add; score += 2; api.score(score); msg = { txt: `LAP ${lap}  +${add}s`, l: 1.4 }; haptic('success'); sfx(990, .25, 'square', .05, 300); }
      else if (np > PTS * .8 && prog < PTS * .2) lap--;
      prog = np;
      for (const r of rivals) {
        const gap = r.p - total(), rubber = gap > 40 ? .8 : gap < -60 ? 1.25 : 1;
        r.p += r.sp * rubber * (1 + lap * .04) * dt / (330 * Math.PI * 2 / PTS);
        const i = Math.floor(r.p) % PTS, q = trk.line[i], q2 = trk.line[(i + 1) % PTS], nx = -(q2.y - q.y), ny = q2.x - q.x, nl = Math.hypot(nx, ny) || 1;
        r.x = q.x + nx / nl * r.lane; r.y = q.y + ny / nl * r.lane;
        if (Math.hypot(r.x - x, r.y - y) < 9) { v *= .6; flash = .2; haptic('medium'); sfx(160, .08, 'square', .05); r.p += .4; }
      }
      for (const r of rivals) { r.cool = Math.max(0, (r.cool || 0) - dt); const ahead = r.p > total(); if (r.ahead && !ahead && !r.cool) { r.cool = 8; score += 1; api.score(score); haptic('light'); sfx(700, .1, 'square', .04, 200); msg = { txt: 'OVERTAKE!', l: .8 }; } r.ahead = ahead; }
      pos = place();
    },
    fx(dt) { t += dt; },
    draw(c) {
      const hy = Math.round(H * .34), f = W * .9, camH = 22, d = camH * f / (H - 16 - hy), ca = Math.cos(a), sa = Math.sin(a), cx = x - ca * d, cy = y - sa * d;
      // sky + distant hills that slide as you turn
      const g = c.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, '#3858d8'); g.addColorStop(1, '#a8d8f8'); c.fillStyle = g; c.fillRect(0, 0, W, hy);
      for (let i = 0; i < W + 40; i += 2) { const wx = i - ((a * 120) % 80 + 80) % 80; const hh = 8 + Math.sin(wx * .08 + 1) * 4 + Math.sin(wx * .021) * 6; c.fillStyle = '#6870c8'; c.fillRect(i, hy - hh, 2, hh); }
      for (let i = 0; i < W + 40; i += 2) { const wx = i - ((a * 220) % 60 + 60) % 60; const hh = 4 + Math.sin(wx * .15) * 3; c.fillStyle = '#287838'; c.fillRect(i, hy - hh, 2, hh); }
      // ground plane
      const gh = H - hy; if (!img || img.width !== W || img.height !== gh) img = c.createImageData(W, gh);
      const px = img.data;
      for (let sy = 0; sy < gh; sy++) {
        const rd = camH * f / (sy + 1), sc = rd / f;
        let wx = cx + ca * rd - sa * (-W / 2) * sc, wy = cy + sa * rd + ca * (-W / 2) * sc; const stx = -sa * sc, sty = ca * sc;
        const fog = sy < 6 ? 1 - sy / 6 : 0;
        for (let sx = 0; sx < W; sx++, wx += stx, wy += sty) {
          const v2 = at(wx, wy), o = (sy * W + sx) * 4; let r, gg, b;
          if (v2 === 1) { r = 120; gg = 120; b = 136; if (((wx / 16 | 0) + (wy / 16 | 0)) & 1) { r += 8; gg += 8; b += 8; } }
          else if (v2 === 2) { const s = ((wx / 8 | 0) + (wy / 8 | 0)) & 1; r = s ? 232 : 248; gg = s ? 64 : 248; b = s ? 64 : 240; }
          else if (v2 === 3) { const s = ((wx / 6 | 0) + (wy / 6 | 0)) & 1; r = gg = b = s ? 240 : 24; }
          else { const s = ((wx / 32 | 0) + (wy / 32 | 0)) & 1; r = s ? 72 : 88; gg = s ? 168 : 184; b = s ? 56 : 64; }
          if (fog) { r += (168 - r) * fog; gg += (216 - gg) * fog; b += (248 - b) * fog; }
          px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
        }
      }
      c.putImageData(img, 0, hy);
      // rivals, far first
      const vis = rivals.map(r => { const rx = r.x - cx, ry = r.y - cy, fw = rx * ca + ry * sa, lt = -rx * sa + ry * ca; return { r, fw, lt }; }).filter(o => o.fw > 6).sort((p, q) => q.fw - p.fw);
      for (const o of vis) { const s = f / o.fw, sx = W / 2 + o.lt * s, sy = hy + camH * s, w = Math.max(3, 30 * s * .9), h = w * .6; if (sx < -w || sx > W + w) continue; kart(c, sx, sy, w, h, o.r.col, 0); }
      kart(c, W / 2, H - 16, 30, 17, '#58c040', steer);
      if (flash) { c.fillStyle = '#ffffff60'; c.fillRect(0, 0, W, H); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#101018'; c.fillText(`${pos}${['ST', 'ND', 'RD', 'TH'][pos - 1]}`, 4, 9); c.fillStyle = '#f8f8f0'; c.fillText(`${pos}${['ST', 'ND', 'RD', 'TH'][pos - 1]}`, 3, 8);
      c.textAlign = 'right'; c.fillStyle = timer < 8 && (t * 4 | 0) % 2 ? '#e04040' : '#f8f8f0'; c.fillText(`${Math.ceil(timer)}`, W - 3, 8);
      if (go > 0) { c.textAlign = 'center'; c.fillStyle = '#f8d838'; c.font = '12px "Press Start 2P", monospace'; c.fillText(go > 1 ? 'READY' : 'GO!', W / 2, H * .55); }
      if (msg) { c.textAlign = 'center'; c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#101018'; c.fillText(msg.txt, W / 2 + 1, hy + 15); c.fillStyle = '#f8d838'; c.fillText(msg.txt, W / 2, hy + 14); }
      if (t < 5 && lap === 0) { c.textAlign = 'center'; c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#f8f8f0'; c.fillText('HOLD LEFT / RIGHT', W / 2, hy + 28); }
    },
    down(px) { held = { s: px < W / 2 ? -1 : 1 }; },
    move(px, py, p) { if (p && held) held.s = px < W / 2 ? -1 : 1; },
    up() { held = null; },
    key(k, d) { if (k === 'ArrowLeft' || k === 'ArrowRight') held = d ? { s: k === 'ArrowLeft' ? -1 : 1 } : null; },
  };
  return self;
}

function kart(c, x, y, w, h, col, tilt) {
  x = Math.round(x); y = Math.round(y); const hw = w / 2 | 0;
  c.fillStyle = '#101018'; c.fillRect(x - hw, y - (h * .45 | 0), 3 + (w > 12), h * .45 | 0); c.fillRect(x + hw - 3 - (w > 12), y - (h * .45 | 0), 3 + (w > 12), h * .45 | 0);
  c.fillStyle = col; c.fillRect(x - hw + 2, y - h + 1, w - 4, h * .7 | 0);
  c.fillStyle = '#f8d0a8'; c.fillRect(x - 2 + Math.round(tilt * 2), y - h - (h * .35 | 0), 4, h * .4 | 0);
  c.fillStyle = '#f8f8f0'; c.fillRect(x - hw + 3, y - h + 2, Math.max(1, w / 5 | 0), 1);
}

export default {
  id: 'pocket-kart', title: 'Pocket Kart', tag: 'Advance · Racing', retro: true, era: 'advance', pal: 'grape', w: 160, h: 160, maxW: 240, maxH: 280, goal: 10,
  hint: 'Hold the left or right side to steer. Stay on the road; grass slows you down. Overtake rivals for points, and finish each lap before the clock hits zero to get more time.',
  make,
};
