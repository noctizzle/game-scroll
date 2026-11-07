import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Run into the screen down a jungle path. Swipe left or right to change lanes, swipe up to jump,
// tap to spin. Spin through wooden crates and critters to smash them for gems, jump the logs and
// pits, and steer clear of red boom crates, which blow up if you touch or spin them. Bouncy crates
// launch you high. Every 100 gems is an extra life.
const FAR = 40, F = 6;
let W = 176, H = 176;

function make(api) {
  let objs, lane, lx, jumpT, spinT, speed, dist, gems, lives, t, nextZ, inv, parts, msg, dead, sw, bounce;
  const hor = () => H * .3, gnd = () => H - 6;
  const proj = (x, z, y = 0) => { const s = F / (z + F); return { x: W / 2 + x * W * .26 * s, y: hor() + (gnd() - hor()) * s - y * (gnd() - hor()) * .5 * s, s }; };
  function spawn(z) {
    const r = Math.random(), lvl = Math.min(1, dist / 1500), L = [-1, 0, 1][Math.random() * 3 | 0];
    if (r < .32) { const n = 1 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) objs.push({ k: Math.random() < .15 ? 'bouncy' : 'crate', lane: L, z: z + i * 1.4 }); }
    else if (r < .42 + lvl * .12) objs.push({ k: 'boom', lane: L, z });
    else if (r < .6) objs.push({ k: 'critter', lane: L, z, ph: rnd(0, 6) });
    else if (r < .72) { for (const l of [-1, 0, 1]) objs.push({ k: 'log', lane: l, z }); }
    else if (r < .8 + lvl * .06) objs.push({ k: 'pit', lane: L, z, len: 2.2 });
    else for (let i = 0; i < 5; i++) objs.push({ k: 'gem', lane: L, z: z + i * .9, y: 0 });
    if (Math.random() < .35) for (let i = 0; i < 3; i++) objs.push({ k: 'gem', lane: [-1, 0, 1][Math.random() * 3 | 0], z: z + 2 + i * .9, y: .4 });
  }
  const air = () => jumpT > 0 ? Math.sin(Math.PI * (1 - jumpT / (bounce ? 1.1 : .62))) * (bounce ? 1.7 : 1) : 0;
  function hurt(txt) {
    if (inv > 0) return; lives--; inv = 1.6; haptic('heavy'); sfx(130, .3, 'sawtooth', .05, -60); msg = { txt, l: 1 };
    if (lives <= 0) { dead = .01; sfx(100, .7, 'square', .05, -40); }
  }
  function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-90, 0), l: .5, col }); }
  function addGems(n, x, y) { const before = Math.floor(gems / 100); gems += n; api.score(gems + Math.floor(dist / 10)); if (Math.floor(gems / 100) > before) { lives++; msg = { txt: 'EXTRA LIFE!', l: 1.2 }; haptic('success'); } if (x != null) parts.push({ txt: `+${n}`, x, y, l: .7, col: '#f8e040' }); }
  const self = {
    reset() { objs = []; lane = 0; lx = 0; jumpT = 0; spinT = 0; speed = 9; dist = 0; gems = 0; lives = 3; t = 0; nextZ = 14; inv = 0; parts = []; dead = 0; sw = null; bounce = false; msg = { txt: 'SWIPE · TAP TO SPIN', l: 2 }; },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; } else p.y -= 16 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.3) api.over(); return; }
      speed = Math.min(18, 9 + dist / 180); const dz = speed * dt; dist += dz;
      inv = Math.max(0, inv - dt); spinT = Math.max(0, spinT - dt); if (jumpT > 0) { jumpT -= dt; if (jumpT <= 0) { jumpT = 0; bounce = false; } }
      lx += (lane - lx) * Math.min(1, dt * 14);
      for (const o of objs) o.z -= dz;
      nextZ -= dz; if (nextZ < FAR) { spawn(nextZ + 0); nextZ += rnd(5, 9) - Math.min(2.5, dist / 800); }
      const y = air(), me = Math.round(lx);
      for (const o of objs) {
        if (o.done) continue;
        if (o.k === 'pit') { if (o.z < .2 && o.z + o.len > -.2 && o.lane === me && y < .15) { o.done = true; hurt('FELL IN!'); jumpT = .62; } continue; }
        if (o.z > .5 || o.z < -.5 || o.lane !== me) continue;
        const p = proj(o.lane, Math.max(o.z, 0));
        if (o.k === 'gem') { if (Math.abs(y - o.y) < .55) { o.done = true; addGems(1); sfx(1300, .04, 'square', .03, 300); } continue; }
        if (o.k === 'log') { if (Math.abs(o.z) < .3 && y < .3) { o.done = true; hurt('TRIPPED!'); } continue; }
        if (o.k === 'boom') { if (y < .5 || spinT > 0) { o.done = true; burst(p.x, p.y - 8, '#f86030', 16); sfx(80, .4, 'sawtooth', .06, -30); hurt('BOOM!'); } continue; }
        if (o.k === 'critter') { if (spinT > 0) { o.done = true; burst(p.x, p.y - 6, '#60c060'); addGems(3, p.x, p.y - 16); sfx(600, .08, 'square', .04, 400); haptic('medium'); } else if (y > .3 && jumpT < .3) { o.done = true; jumpT = .5; addGems(3, p.x, p.y - 16); sfx(500, .08, 'square', .04, 300); } else if (y < .5) { o.done = true; hurt('OUCH!'); } continue; }
        if (o.k === 'crate' || o.k === 'bouncy') {
          if (spinT > 0 || (y > .2 && jumpT < .35 && o.k === 'crate')) { o.done = true; burst(p.x, p.y - 6, '#c88840'); addGems(o.k === 'bouncy' ? 5 : 2, p.x, p.y - 16); sfx(300, .08, 'square', .05, -100); haptic('medium'); if (y > .2) jumpT = .45; }
          else if (o.k === 'bouncy' && y > .1) { o.done = true; bounce = true; jumpT = 1.1; addGems(5, p.x, p.y - 16); sfx(700, .2, 'square', .05, 600); haptic('success'); }
          else if (y < .3) { o.done = true; burst(p.x, p.y - 6, '#c88840'); sfx(200, .08, 'square', .04); addGems(1); }
        }
      }
      objs = objs.filter(o => o.z + (o.len || 0) > -2 && !(o.done && o.k !== 'pit'));
      api.score(gems + Math.floor(dist / 10));
    },
    draw(c) {
      const hz = hor();
      const sky = c.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, '#2888d8'); sky.addColorStop(1, '#a8e0f8'); c.fillStyle = sky; c.fillRect(0, 0, W, hz);
      c.fillStyle = '#287838'; for (let i = 0; i < 9; i++) { const x = (i * 37 + 10) % W; c.beginPath(); c.arc(x, hz, 14 + (i % 3) * 6, Math.PI, 0); c.fill(); }
      c.fillStyle = '#3c9c3c'; c.fillRect(0, hz, W, H - hz);
      // path with scrolling stripes
      const a = proj(-1.6, FAR), b = proj(1.6, FAR), cc = proj(-1.6, 0), d = proj(1.6, 0);
      c.fillStyle = '#c8a060'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x + 30, H); c.lineTo(cc.x - 30, H); c.fill();
      for (let z = (-dist % 2 + 2) % 2; z < FAR; z += 2) { const p = proj(-1.6, z), q = proj(1.6, z), p2 = proj(-1.6, z + 1), q2 = proj(1.6, z + 1); c.fillStyle = '#b89050'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineTo(q2.x, q2.y); c.lineTo(p2.x, p2.y); c.fill(); }
      for (let z = (-dist % 3 + 3) % 3; z < FAR; z += 3) for (const s of [-1, 1]) { const p = proj(s * 2.1, z); c.fillStyle = '#1c6828'; c.beginPath(); c.arc(p.x, p.y - 10 * p.s * 3, 10 * p.s * 3, 0, 7); c.fill(); c.fillStyle = '#704020'; c.fillRect(p.x - p.s * 3, p.y - 4 * p.s * 3, p.s * 6, 4 * p.s * 3); }
      const list = objs.filter(o => o.z < FAR && !o.done || o.k === 'pit').sort((p, q) => q.z - p.z);
      for (const o of list) {
        if (o.z > FAR) continue;
        if (o.k === 'pit') { const n = proj(o.lane - .5, Math.max(0, o.z)), m = proj(o.lane + .5, Math.max(0, o.z)), f1 = proj(o.lane - .5, Math.max(0, o.z + o.len)), f2 = proj(o.lane + .5, Math.max(0, o.z + o.len)); if (o.z + o.len < 0) continue; c.fillStyle = '#181008'; c.beginPath(); c.moveTo(n.x, n.y); c.lineTo(m.x, m.y); c.lineTo(f2.x, f2.y); c.lineTo(f1.x, f1.y); c.fill(); continue; }
        const p = proj(o.lane, Math.max(o.z, -.4), o.y || 0), s = p.s * 18;
        if (o.k === 'gem') { c.fillStyle = '#f84890'; c.beginPath(); c.moveTo(p.x, p.y - s * .9); c.lineTo(p.x + s * .3, p.y - s * .55); c.lineTo(p.x, p.y - s * .2); c.lineTo(p.x - s * .3, p.y - s * .55); c.fill(); c.fillStyle = '#ffc0e0'; c.fillRect(p.x - s * .1, p.y - s * .75, s * .12, s * .12); }
        else if (o.k === 'log') { const l = proj(-1.5, Math.max(o.z, 0)), r = proj(1.5, Math.max(o.z, 0)); c.fillStyle = '#804820'; c.fillRect(l.x, l.y - s * .4, r.x - l.x, s * .4); c.fillStyle = '#a06830'; c.fillRect(l.x, l.y - s * .4, r.x - l.x, s * .1); }
        else if (o.k === 'critter') { const hop = Math.abs(Math.sin(t * 6 + o.ph)) * s * .2; c.fillStyle = '#48a048'; c.beginPath(); c.arc(p.x, p.y - s * .3 - hop, s * .3, 0, 7); c.fill(); c.fillStyle = '#f8f8f0'; c.fillRect(p.x - s * .18, p.y - s * .45 - hop, s * .12, s * .12); c.fillRect(p.x + s * .06, p.y - s * .45 - hop, s * .12, s * .12); }
        else { const col = o.k === 'boom' ? ['#d83020', '#f86048', '#801810'] : o.k === 'bouncy' ? ['#3878d8', '#78a8f8', '#183878'] : ['#c88840', '#e8b060', '#805020'];
          c.fillStyle = col[0]; c.fillRect(p.x - s * .4, p.y - s * .8, s * .8, s * .8); c.fillStyle = col[1]; c.fillRect(p.x - s * .4, p.y - s * .8, s * .8, s * .1); c.fillStyle = col[2]; c.fillRect(p.x - s * .4, p.y - s * .45, s * .8, s * .08); c.fillRect(p.x - s * .04, p.y - s * .8, s * .08, s * .8);
          if (o.k === 'boom') { c.fillStyle = '#f8f040'; c.font = `${Math.max(4, s * .35 | 0)}px "Press Start 2P", monospace`; c.textAlign = 'center'; c.fillText('!', p.x, p.y - s * .25); }
          if (o.k === 'bouncy') { c.fillStyle = '#f8f8f0'; c.fillRect(p.x - s * .2, p.y - s * .7, s * .4, s * .08); } }
      }
      // runner
      const pp = proj(lx, 0, air()), s = 22, x = pp.x, yy = pp.y, sh = proj(lx, 0);
      c.fillStyle = '#00000040'; c.beginPath(); c.ellipse(sh.x, sh.y, 8, 3, 0, 0, 7); c.fill();
      if (!(inv > 0 && (t * 14 | 0) % 2)) {
        if (spinT > 0) { c.fillStyle = '#e87020'; c.beginPath(); c.ellipse(x, yy - s * .5, s * .55, s * .45, 0, 0, 7); c.fill(); c.strokeStyle = '#f8f8f0'; c.lineWidth = 1; for (let i = 0; i < 3; i++) { const a = t * 30 + i * 2; c.beginPath(); c.arc(x, yy - s * .5, s * .5, a, a + .8); c.stroke(); } }
        else { const run = (t * 12 | 0) % 2; c.fillStyle = '#2858c0'; c.fillRect(x - 4, yy - 7, 3, 7 - run * 2); c.fillRect(x + 1, yy - 7, 3, 5 + run * 2); c.fillStyle = '#e87020'; c.fillRect(x - 5, yy - 16, 10, 10); c.fillStyle = '#f8a050'; c.fillRect(x - 4, yy - 22, 8, 7); c.fillStyle = '#202020'; c.fillRect(x - 3, yy - 20, 2, 2); c.fillRect(x + 1, yy - 20, 2, 2); c.fillStyle = '#c84020'; c.fillRect(x - 5, yy - 24, 10, 3); }
      }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#301808'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      c.fillStyle = '#00000060'; c.fillRect(0, 0, W, 12); c.textAlign = 'left';
      for (let i = 0; i < Math.min(lives, 6); i++) { c.fillStyle = '#e87020'; c.fillRect(4 + i * 8, 3, 6, 6); }
      c.textAlign = 'right'; c.fillStyle = '#f84890'; c.fillText(`◆${gems}`, W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .45 - 9, W, 13); c.fillStyle = '#f8f040'; c.fillText(msg.txt, W / 2, H * .45); }
    },
    down(x, y) { sw = { x, y, t: performance.now(), used: false }; },
    move(x, y, p) {
      if (!p || !sw || sw.used || dead) return; const dx = x - sw.x, dy = y - sw.y;
      if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy)) { sw.used = true; lane = clamp(lane + Math.sign(dx), -1, 1); sfx(400, .03, 'square', .03); haptic('tick'); }
      else if (dy < -18 && Math.abs(dy) > Math.abs(dx)) { sw.used = true; self.jump(); }
    },
    up() { if (sw && !sw.used && performance.now() - sw.t < 300) self.spin(); sw = null; },
    jump() { if (jumpT <= 0 && !dead) { jumpT = .62; sfx(500, .08, 'square', .04, 400); haptic('light'); } },
    spin() { if (spinT <= 0 && !dead) { spinT = .38; sfx(250, .2, 'triangle', .05, 300); haptic('light'); } },
    key(k, d) { if (!d) return; if (k === 'ArrowLeft') lane = Math.max(-1, lane - 1); if (k === 'ArrowRight') lane = Math.min(1, lane + 1); if (k === 'ArrowUp' || k === 'z') self.jump(); if (k === ' ' || k === 'x') self.spin(); },
  };
  return self;
}

export default {
  id: 'crate-dash', title: 'Crate Dash', tag: 'Advance · Runner', retro: true, era: 'advance', pal: 'lemon', w: 176, h: 176, maxW: 260, maxH: 320, goal: 250,
  hint: 'Swipe left or right to change lanes, swipe up to jump, tap to spin. Spin or jump on crates and critters for gems. Jump the logs and pits. Never touch the red boom crates. Blue crates bounce you sky-high. 100 gems gives an extra life.',
  make,
};
