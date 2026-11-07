import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Top-down stealth. Hold to creep toward your finger and reach the exit hatch. Guards patrol with
// torch cones that walls block; stay in a cone too long and you're caught. Tap anywhere away from
// you to throw a pebble: guards nearby go to look. Tap yourself to duck under a crate and stay
// still while they pass. Grab the files on the way for bonus points.
let W = 176, H = 192;

function make(api) {
  let walls, guards, pl, exit, intel, room, score, lives, t, hold, tapStart, crate, noise, parts, msg, dead, caught, alertAll;
  const top = 14;
  const inWall = (x, y, pad = 0) => x < 2 + pad || x > W - 2 - pad || y < top + 2 + pad || y > H - 2 - pad || walls.some(w => x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad);
  function sees(g, x, y) {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy); if (d > g.range) return false;
    let da = Math.abs(((Math.atan2(dy, dx) - g.a) + Math.PI * 3) % (Math.PI * 2) - Math.PI); if (da > g.fov) return false;
    for (let s = 4; s < d; s += 3) if (inWall(g.x + dx / d * s, g.y + dy / d * s)) return false;
    return true;
  }
  function openSpot(pad) { for (let i = 0; i < 80; i++) { const x = rnd(10, W - 10), y = rnd(top + 10, H - 10); if (!inWall(x, y, pad)) return { x, y }; } return { x: W / 2, y: H / 2 }; }
  function build() {
    walls = []; guards = []; parts = []; noise = null; crate = false; caught = 0; alertAll = 0;
    const n = 4 + Math.min(5, room);
    for (let i = 0; i < n; i++) { const hz = Math.random() < .5, w = hz ? rnd(30, W * .45) : 8, h = hz ? 8 : rnd(26, H * .35); walls.push({ x: rnd(10, W - w - 10), y: rnd(top + 26, H - h - 26), w, h }); }
    pl = { x: 14, y: H - 14, a: -Math.PI / 2 }; exit = { x: W - 14, y: top + 12 };
    walls = walls.filter(w => !(pl.x > w.x - 14 && pl.x < w.x + w.w + 14 && pl.y > w.y - 14 && pl.y < w.y + w.h + 14) && !(exit.x > w.x - 14 && exit.x < w.x + w.w + 14 && exit.y > w.y - 14 && exit.y < w.y + w.h + 14));
    intel = { ...openSpot(6), got: false };
    const ng = 1 + Math.min(4, Math.floor((room + 1) / 2));
    for (let i = 0; i < ng; i++) {
      let a, b, tries = 0;
      do { a = openSpot(6); const hz = Math.random() < .5, len = rnd(40, 90); b = { x: clamp(a.x + (hz ? len : 0) * (Math.random() < .5 ? -1 : 1), 10, W - 10), y: clamp(a.y + (hz ? 0 : len) * (Math.random() < .5 ? -1 : 1), top + 10, H - 10) }; tries++; }
      while (tries < 60 && (Math.hypot(a.x - pl.x, a.y - pl.y) < 60 || !clearLine(a, b)));
      guards.push({ x: a.x, y: a.y, pts: [a, b], i: 1, a: 0, range: 52 + room * 2, fov: .55, wait: 0, sp: 20 + room * 1.5, sus: 0, look: null, turn: 0 });
    }
    msg = { txt: `ROOM ${room}`, l: 1.2 };
  }
  function clearLine(a, b) { const d = Math.hypot(b.x - a.x, b.y - a.y); for (let s = 0; s < d; s += 3) if (inWall(a.x + (b.x - a.x) * s / d, a.y + (b.y - a.y) * s / d, 5)) return false; return true; }
  function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: rnd(-40, 40), vy: rnd(-40, 40), l: .4, col }); }
  const self = {
    reset() { room = 1; score = 0; lives = 3; t = 0; hold = null; dead = 0; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (walls) build(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (noise) { noise.l -= dt; if (noise.l <= 0) noise = null; }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      if (caught) { caught += dt; if (caught > 1.2) { if (lives <= 0) { dead = .01; return; } build(); } return; }
      let moving = false;
      if (hold && hold.walk && !crate) {
        const dx = hold.x - pl.x, dy = hold.y - pl.y, d = Math.hypot(dx, dy);
        if (d > 3) { const sp = 46, nx = pl.x + dx / d * Math.min(d, sp * dt), ny = pl.y + dy / d * Math.min(d, sp * dt); if (!inWall(nx, pl.y, 4)) pl.x = nx; if (!inWall(pl.x, ny, 4)) pl.y = ny; pl.a = Math.atan2(dy, dx); moving = true; }
      }
      if (!intel.got && Math.hypot(intel.x - pl.x, intel.y - pl.y) < 8) { intel.got = true; score += 5; api.score(score); haptic('medium'); sfx(1200, .1, 'square', .04, 300); parts.push({ txt: 'FILES +5', x: intel.x, y: intel.y - 8, l: 1, col: '#f8e070' }); }
      if (Math.hypot(exit.x - pl.x, exit.y - pl.y) < 9) { score += 10 + (lives === 3 ? 0 : 0); room++; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 500); build(); return; }
      let seen = false;
      for (const g of guards) {
        // patrol, or walk to a noise and look around
        let tx, ty;
        if (g.look) { tx = g.look.x; ty = g.look.y; } else { const p = g.pts[g.i]; tx = p.x; ty = p.y; }
        const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
        if (g.wait > 0) { g.wait -= dt; g.a += Math.sin(t * 2.5) * dt * 1.6; if (g.wait <= 0 && g.look) g.look = null; }
        else if (d > 2) { const ta = Math.atan2(dy, dx); let da = ((ta - g.a) + Math.PI * 3) % (Math.PI * 2) - Math.PI; g.a += clamp(da, -4 * dt, 4 * dt); if (Math.abs(da) < .5) { const sp = g.look ? g.sp * 1.6 : g.sp, nx = g.x + dx / d * sp * dt, ny = g.y + dy / d * sp * dt; if (!inWall(nx, ny, 3)) { g.x = nx; g.y = ny; } else { g.look = null; g.wait = 1; } } }
        else if (g.look) g.wait = 1.6; else { g.i = (g.i + 1) % 2; g.wait = .8; }
        const visible = sees(g, pl.x, pl.y) && !(crate && Math.hypot(g.x - pl.x, g.y - pl.y) > 18);
        if (visible) { const near = 1 - Math.hypot(g.x - pl.x, g.y - pl.y) / g.range; g.sus += dt * (moving ? 2.4 : 1.4) * (.6 + near * 1.6); seen = true; g.look = { x: pl.x, y: pl.y }; }
        else g.sus = Math.max(0, g.sus - dt * .5);
        if (g.sus >= 1) { caught = .01; lives--; haptic('error'); sfx(200, .4, 'sawtooth', .05, 300); msg = { txt: lives > 0 ? 'SPOTTED!' : 'CAUGHT!', l: 1.2 }; g.sus = 1; return; }
      }
      if (seen && (t * 6 | 0) % 2) haptic('tick');
    },
    draw(c) {
      c.fillStyle = '#283038'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2e3842'; for (let x = 0; x < W; x += 16) for (let y = top; y < H; y += 16) if (((x + y) / 16) % 2) c.fillRect(x, y, 16, 16);
      // cones
      for (const g of guards) {
        c.fillStyle = g.sus > .5 ? '#f8404060' : g.look ? '#f8a04050' : '#f8f0a038';
        c.beginPath(); c.moveTo(g.x, g.y); const N = 18;
        for (let i = 0; i <= N; i++) { const a = g.a - g.fov + i / N * g.fov * 2; let r = 4; while (r < g.range && !inWall(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r)) r += 2; c.lineTo(g.x + Math.cos(a) * r, g.y + Math.sin(a) * r); }
        c.closePath(); c.fill();
      }
      c.fillStyle = '#586878'; for (const w of walls) c.fillRect(w.x, w.y, w.w, w.h); c.fillStyle = '#7888a0'; for (const w of walls) c.fillRect(w.x, w.y, w.w, 2);
      c.fillStyle = '#586878'; c.fillRect(0, top, W, 2); c.fillRect(0, H - 2, W, 2); c.fillRect(0, top, 2, H - top); c.fillRect(W - 2, top, 2, H - top);
      c.fillStyle = (t * 3 | 0) % 2 ? '#40d870' : '#30a858'; c.fillRect(exit.x - 7, exit.y - 7, 14, 14); c.fillStyle = '#183020'; c.fillRect(exit.x - 4, exit.y - 4, 8, 8); c.fillStyle = '#40d870'; c.fillRect(exit.x - 1, exit.y - 4, 2, 8);
      if (!intel.got) { c.fillStyle = '#f8e070'; c.fillRect(intel.x - 3, intel.y - 4, 7, 8); c.fillStyle = '#a08030'; c.fillRect(intel.x - 2, intel.y - 2, 5, 1); c.fillRect(intel.x - 2, intel.y, 5, 1); }
      if (noise) { c.strokeStyle = `rgba(255,255,255,${noise.l})`; c.beginPath(); c.arc(noise.x, noise.y, (1.2 - noise.l) * 40, 0, 7); c.stroke(); }
      for (const g of guards) {
        c.fillStyle = '#a03030'; c.beginPath(); c.arc(g.x, g.y, 5, 0, 7); c.fill(); c.fillStyle = '#e8c090'; c.beginPath(); c.arc(g.x + Math.cos(g.a) * 2, g.y + Math.sin(g.a) * 2, 2.5, 0, 7); c.fill();
        if (g.sus > 0) { c.fillStyle = '#000a'; c.fillRect(g.x - 6, g.y - 11, 12, 3); c.fillStyle = g.sus > .6 ? '#f84040' : '#f8c040'; c.fillRect(g.x - 6, g.y - 11, 12 * Math.min(1, g.sus), 3); }
        if (g.look && !g.sus) { c.fillStyle = '#f8c040'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('?', g.x, g.y - 8); }
      }
      if (crate) { c.fillStyle = '#b08850'; c.fillRect(pl.x - 6, pl.y - 6, 12, 12); c.fillStyle = '#806030'; c.fillRect(pl.x - 6, pl.y - 1, 12, 2); c.fillRect(pl.x - 1, pl.y - 6, 2, 12); }
      else { c.fillStyle = '#3858a8'; c.beginPath(); c.arc(pl.x, pl.y, 5, 0, 7); c.fill(); c.fillStyle = '#202020'; c.fillRect(pl.x + Math.cos(pl.a) * 2 - 2, pl.y + Math.sin(pl.a) * 2 - 1, 4, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } }
      c.fillStyle = '#101418'; c.fillRect(0, 0, W, top);
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? '#3878e0' : '#384048'; c.fillRect(4 + i * 8, 4, 6, 6); }
      c.textAlign = 'right'; c.fillStyle = '#e0e8f0'; c.fillText(`ROOM ${room}`, W - 4, 10);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000c'; c.fillRect(0, H / 2 - 10, W, 14); c.fillStyle = caught ? '#f86060' : '#e0e8f0'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 7 && !msg && room === 1) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - 30, W, 28); c.fillStyle = '#e0e8f0'; c.fillText('HOLD: SNEAK TO HATCH', W / 2, H - 21); c.fillText('TAP AWAY: PEBBLE', W / 2, H - 13); c.fillText('TAP YOU: CRATE', W / 2, H - 5); }
    },
    down(x, y) { tapStart = { x, y, t: performance.now() }; hold = { x, y, walk: false, t0: performance.now() }; },
    move(x, y, p) { if (!p || !hold) return; hold.x = x; hold.y = y; if (Math.hypot(x - tapStart.x, y - tapStart.y) > 8 || performance.now() - hold.t0 > 160) hold.walk = true; },
    up() {
      const quick = tapStart && performance.now() - tapStart.t < 220 && !(hold && hold.walk); hold = null;
      if (!quick || dead || caught) return;
      if (Math.hypot(tapStart.x - pl.x, tapStart.y - pl.y) < 14) { crate = !crate; haptic('light'); sfx(crate ? 160 : 260, .08, 'square', .04); return; }
      if (crate) return;
      noise = { x: tapStart.x, y: tapStart.y, l: 1.2 }; sfx(700, .05, 'square', .03, -300); haptic('tick');
      for (const g of guards) if (Math.hypot(g.x - noise.x, g.y - noise.y) < 70) { g.look = { x: noise.x, y: noise.y }; g.wait = 0; }
    },
    key(k, d) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (step) { if (d) { tapStart = null; hold = { x: pl.x + step[0] * 400, y: pl.y + step[1] * 400, walk: true }; } else hold = null; }
      if (k === ' ' && d) { crate = !crate; sfx(crate ? 160 : 260, .08, 'square', .04); }
    },
  };
  return self;
}

export default {
  id: 'shadow-ops', title: 'Shadow Ops', tag: 'Advance · Stealth', retro: true, era: 'advance', pal: 'grape', w: 176, h: 192, maxW: 260, maxH: 320, goal: 60,
  hint: 'Hold to sneak toward your finger and reach the green hatch. Guards see down their torch cones; walls block them. Stay in a cone and their meter fills until you\'re spotted. Tap away from you to throw a pebble and lure guards, or tap yourself to hide under a crate. Grab the yellow files for a bonus.',
  make,
};
