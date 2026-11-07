import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { backdrop, glow } from '../kit/gfx.js';
import { brick, stud, BRICK_KEYS } from '../kit/bricks.js';

// A little builder walks right toward the flag, stopping at anything in the way. Press and hold a
// pile of bouncing bricks to build what's needed: a bridge over a gap, steps up a ledge, a lever
// to open a gate or a spring to clear a wall. Some piles are locked in crates: tap the crate to
// smash it first. Reach the flag before the clock runs out; every stage adds time.
let W = 192, H = 144;

function make(api) {
  let obs, hero, stage, time, t, hold, parts, msg, dead, score, flying, done;
  const g = () => H - 22;
  const SLOT = ['gap', 'step', 'gate', 'wall'];
  function build() {
    obs = []; const n = Math.min(4, 2 + (stage / 2 | 0)), kinds = [];
    for (let i = 0; i < n; i++) kinds.push(SLOT[Math.random() * (stage < 2 ? 2 : 4) | 0]);
    let lift = 0;
    kinds.forEach((k, i) => {
      const x = W * (.24 + i * (.66 / n)) + 10, py = g() - lift, pxMin = i ? obs[i - 1].x + 18 : 26;
      const o = { k, x, base: lift, prog: 0, built: false, pile: { x: clamp(rnd(pxMin, x - 22), pxMin, x - 14), crate: stage > 1 && Math.random() < .35, hits: 0 }, cols: Array.from({ length: 8 }, () => BRICK_KEYS[Math.random() * BRICK_KEYS.length | 0]) };
      if (k === 'step') lift += 14;
      o.top = lift; obs.push(o);
    });
    hero = { x: 8, y: g(), vy: 0, air: 0, wait: 0, state: 'walk', lift: 0 };
    flying = []; done = false; time = Math.max(time || 0, 0) + (stage === 1 ? 16 : 2) + n * 1.5; msg = { txt: `STAGE ${stage}`, l: 1 };
  }
  const groundAt = x => { let lift = 0; for (const o of obs) if (x > o.x + (o.k === 'step' ? -1 : 0) && o.k === 'step') lift = o.top; return g() - lift; };
  function pileY(o) { return g() - o.base; }
  function burst(x, y, col) { for (let i = 0; i < 10; i++) parts.push({ x, y, vx: rnd(-50, 50), vy: rnd(-80, 0), l: .5, col }); }
  const self = {
    reset() { stage = 1; time = 0; t = 0; hold = null; parts = []; dead = 0; score = 0; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (obs) build(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 250 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.3) api.over(); return; }
      if (done) { done += dt; if (done > 1.2) { stage++; build(); } return; }
      time -= dt; if (time <= 0) { time = 0; dead = .01; msg = { txt: 'OUT OF TIME', l: 9 }; haptic('error'); sfx(140, .5, 'square', .05, -60); return; }
      // building
      if (hold) { const o = obs.find(o => !o.built && !(o.pile.crate) && Math.abs(hold.x - o.pile.x) < 18 && Math.abs(hold.y - (pileY(o) - 6)) < 22); if (o) { o.prog += dt / (.8 + Math.min(.8, stage * .05)); if ((t * 20 | 0) % 2) flying.push({ x: o.pile.x + rnd(-4, 4), y: pileY(o) - 4, tx: o.x + rnd(-8, 4), ty: pileY(o) - rnd(0, 20), l: 0, col: o.cols[Math.random() * 8 | 0] }); if ((t * 15 | 0) % 3 === 0) haptic('tick'); if (o.prog >= 1) { o.built = true; o.prog = 1; score += 1; api.score(score + (stage - 1) * 5); haptic('success'); sfx(700, .25, 'square', .05, 500); burst(o.x, pileY(o) - 10, '#f0c020'); } } }
      for (const f of flying) f.l += dt * 3; flying = flying.filter(f => f.l < 1);
      // hero
      const h = hero;
      if (h.state === 'walk') {
        const next = obs.find(o => o.x > h.x - 2 && !(o.passed));
        const stopAt = next ? next.x - (next.k === 'gap' ? 14 : next.k === 'wall' ? 12 : 9) : W - 10;
        if (next && h.x >= stopAt - .5 && !next.built) { h.x = stopAt; h.wait += dt; }
        else if (next && h.x >= stopAt - .5 && next.built) {
          next.passed = true; h.wait = 0;
          if (next.k === 'wall') { h.state = 'jump'; h.vy = -150; h.vx = 30; sfx(500, .2, 'square', .04, 500); }
          else if (next.k === 'gate') { sfx(300, .2, 'square', .04, 100); }
        }
        else { h.wait = 0; h.x += 26 * dt; h.y = groundAt(h.x); if (next && next.k === 'step' && next.built && h.x > next.x - 9 && h.x < next.x) h.y = g() - next.base - (h.x - (next.x - 9)) / 9 * 14; }
        if (h.x >= W - 12) { done = .01; score += 5; api.score(score + (stage - 1) * 5); time += 0; haptic('success'); sfx(880, .4, 'square', .05, 600); msg = { txt: 'FLAG!', l: 1 }; }
      } else if (h.state === 'jump') { h.vy += 300 * dt; h.x += h.vx * dt; h.y += h.vy * dt; const gy = groundAt(h.x); if (h.vy > 0 && h.y >= gy) { h.y = gy; h.state = 'walk'; haptic('light'); } }
    },
    draw(c) {
      const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#68b8f8'); sky.addColorStop(1, '#d0ecff'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 4; i++) { const x = (i * 61 + t * 4) % (W + 40) - 20; brick(c, x, 18 + (i % 2) * 14, 24, 6, 'white', 6); }
      // ground pieces
      let x0 = 0, lift = 0;
      const seg = (a, b, lf) => { for (let x = a; x < b; x += 16) brick(c, x, g() - lf, Math.min(16, b - x), H - g() + lf, 'green', 8); };
      for (const o of obs) {
        if (o.k === 'gap') { seg(x0, o.x - 12, lift); x0 = o.x + 12; backdrop(c, o.x - 12, g() - lift + 4, 24, H, '#183048', '#04080c'); if (o.built) brick(c, o.x - 13, g() - lift, 26, 4, o.cols[0], 4); }
        else if (o.k === 'step') { seg(x0, o.x, lift); x0 = o.x; lift = o.top; if (o.built) { for (let i = 0; i < 3; i++) brick(c, o.x - 9 + i * 3, g() - o.base - (i + 1) * 5 + 1, 9 - i * 3, (i + 1) * 5, o.cols[i], 3); } }
      }
      seg(x0, W, lift);
      for (const o of obs) {
        const by = g() - o.base;
        if (o.k === 'gate') { if (!o.built || !o.passed) { c.fillStyle = '#585c64'; for (let i = 0; i < 3; i++) c.fillRect(o.x - 4 + i * 4, by - (o.built ? 6 : 28), 2, o.built ? 6 : 28); c.fillRect(o.x - 5, by - (o.built ? 8 : 30), 12, 2); } if (o.built) { brick(c, o.x - 18, by - 6, 6, 6, o.cols[1], 3); c.strokeStyle = '#d83a2c'; c.lineWidth = 2; c.beginPath(); c.moveTo(o.x - 15, by - 6); c.lineTo(o.x - 10, by - 14); c.stroke(); c.lineWidth = 1; } else { c.strokeStyle = '#ffffff60'; c.setLineDash([2, 2]); c.strokeRect(o.x - 18.5, by - 14.5, 8, 9); c.setLineDash([]); } }
        if (o.k === 'wall') { for (let i = 0; i < 5; i++) brick(c, o.x - 4, by - 6 - i * 6, 10, 6, 'grey', 5); if (o.built) { brick(c, o.x - 18, by - 4, 10, 4, o.cols[2], 5); c.strokeStyle = '#f0c020'; c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(o.x - 17, by - 4 - i * 2); c.lineTo(o.x - 9, by - 5 - i * 2); } c.stroke(); } }
        if (!o.built && o.k !== 'gate') { c.strokeStyle = '#ffffff70'; c.setLineDash([2, 2]); if (o.k === 'gap') c.strokeRect(o.x - 12.5, by - .5, 25, 4); else if (o.k === 'step') c.strokeRect(o.x - 9.5, by - 14.5, 9, 15); else c.strokeRect(o.x - 18.5, by - 4.5, 10, 5); c.setLineDash([]); }
        // pile or crate
        if (!o.built) {
          const px = o.pile.x, py = pileY(o);
          if (o.pile.crate) { brick(c, px - 8, py - 14, 16, 14, 'tan', 8); c.fillStyle = '#907040'; c.fillRect(px - 8, py - 8, 16, 1); c.fillRect(px - 1, py - 14, 1, 14); }
          else { const left = 1 - o.prog; for (let i = 0; i < 6 * left + 1; i++) { const bx = px - 8 + (i % 3) * 5, byy = py - 4 - (i / 3 | 0) * 4 - Math.abs(Math.sin(t * 6 + i)) * 3; brick(c, bx, byy, 6, 4, o.cols[i % 8], 3); }
            if (o.prog > 0) { c.fillStyle = '#00000060'; c.fillRect(px - 10, py - 24, 20, 4); c.fillStyle = '#f0c020'; c.fillRect(px - 10, py - 24, 20 * o.prog, 4); } }
        }
      }
      for (const f of flying) { const k = f.l, x = f.x + (f.tx - f.x) * k, y = f.y + (f.ty - f.y) * k - Math.sin(k * Math.PI) * 18; brick(c, x - 2, y - 2, 5, 3, f.col, 0); }
      // flag
      const fy = g() - (obs.length ? obs[obs.length - 1].top : 0); c.fillStyle = '#e8e8e0'; c.fillRect(W - 8, fy - 30, 2, 30); c.fillStyle = '#d83a2c'; c.beginPath(); c.moveTo(W - 6, fy - 30); c.lineTo(W - 6 - 12, fy - 26); c.lineTo(W - 6, fy - 22); c.fill();
      // hero
      const hx = Math.round(hero.x), hy = Math.round(hero.y), step = hero.state === 'walk' && !hero.wait ? (t * 8 | 0) % 2 : 0;
      c.fillStyle = '#2c64c8'; c.fillRect(hx - 3, hy - 5, 2, 5 - step); c.fillRect(hx + 1, hy - 5, 2, 4 + step);
      c.fillStyle = '#f07818'; c.fillRect(hx - 4, hy - 11, 8, 6); c.fillStyle = '#f0c020'; c.fillRect(hx - 3, hy - 17, 6, 6); c.fillStyle = '#202020'; c.fillRect(hx, hy - 15, 1, 2); c.fillRect(hx + 2, hy - 15, 1, 2);
      c.fillStyle = '#f0c020'; c.fillRect(hx - 4, hy - 19, 8, 2); c.fillRect(hx - 2, hy - 21, 4, 2);
      if (hero.wait > .3) { c.fillStyle = '#ffffff'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('?', hx, hy - 24); }
      for (const p of parts) { if (p.txt) continue; c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#00000060'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = time < 6 && (t * 4 | 0) % 2 ? '#f86060' : '#f8f8f0'; c.fillText(`${Math.ceil(time)}s`, 4, 9);
      c.textAlign = 'right'; c.fillText(`STAGE ${stage}`, W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .42 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f0c020'; c.fillText(msg.txt, W / 2, H * .42); }
      if (t < 7 && !msg && stage === 1) { c.textAlign = 'center'; c.fillStyle = '#183048'; c.fillText('HOLD THE BOUNCING BRICKS', W / 2, H * .38); }
    },
    down(x, y) {
      if (dead || done) return;
      for (const o of obs) if (!o.built && o.pile.crate && Math.abs(x - o.pile.x) < 14 && Math.abs(y - (pileY(o) - 7)) < 16) { o.pile.hits++; haptic('medium'); sfx(260, .06, 'square', .05, -60); if (o.pile.hits >= 2) { o.pile.crate = false; burst(o.pile.x, pileY(o) - 8, '#d0b078'); sfx(200, .12, 'square', .05, -80); } return; }
      hold = { x, y };
    },
    move(x, y, p) { if (p && hold) { hold.x = x; hold.y = y; } },
    up() { hold = null; },
    key(k, d) { if (k !== ' ') return; if (!d) { hold = null; return; } const o = obs.find(o => !o.built); if (!o) return; if (o.pile.crate) self.down(o.pile.x, pileY(o) - 7); else hold = { x: o.pile.x, y: pileY(o) - 6 }; },
  };
  return self;
}

export default {
  id: 'pile-builder', title: 'Pile Builder', tag: 'Bricks · Puzzle', retro: true, era: 'console', pal: 'teal', w: 192, h: 144, maxW: 320, maxH: 220, goal: 30,
  hint: 'Your builder walks to the flag on their own and stops at anything in the way. Press and hold the bouncing brick piles to build a bridge, steps, a lever for the gate or a spring over the wall. Tap crates twice to break them open first. Beat the clock; every stage adds time.',
  make,
};
