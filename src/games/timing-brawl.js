import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// A turn-based brawl where timing is everything. On your turn pick JUMP or BASH. Jump: tap as you
// land to bounce for another hit. Bash: hold to wind up and let go in the green zone. On the
// foe's turn, watch the tell and tap at the flash to dodge (or swat a thrown rock back) for a
// counter. Spiky foes hurt to land on; flying foes are out of bash reach.
const FOES = [
  { k: 'cap', name: 'CAPLING', hp: 8, atk: 3, col: '#e05050', moves: ['charge'] },
  { k: 'spike', name: 'SPIKEBACK', hp: 10, atk: 3, col: '#58a048', moves: ['charge', 'throw'], spiky: true },
  { k: 'wing', name: 'FLAPPER', hp: 7, atk: 3, col: '#a868e0', moves: ['throw', 'swoop'], fly: true },
  { k: 'brute', name: 'BIG BRUTE', hp: 22, atk: 5, col: '#c08040', moves: ['charge', 'throw', 'stomp'] },
];
let W = 160, H = 176;

function make(api) {
  let hp, maxHp, foe, state, st, score, t, fight, msg, shake, parts, tapped, hold, bonus;
  const gy = () => H - 46, hx = () => W * .25, fx = () => W * .72;
  function newFoe() {
    fight++; const pool = fight < 2 ? [0] : fight < 4 ? [0, 1, 2] : [0, 1, 2, 3], f = FOES[fight % 5 === 0 ? 3 : pool[Math.random() * pool.length | 0]];
    const s = 1 + (fight - 1) * .15; foe = { ...f, hp: Math.round(f.hp * s), max: Math.round(f.hp * s), atk: Math.round(f.atk * (1 + (fight - 1) * .14)), x: fx(), y: gy(), hit: 0 };
    state = 'menu'; st = { t: 0 }; msg = { txt: `${foe.name} APPEARS!`, l: 1.2 };
  }
  function pop(txt, x, y, col = '#f8f8f0') { parts.push({ txt, x, y, l: .9, col }); }
  function burst(x, y, col) { for (let i = 0; i < 8; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-80, 0), l: .4, col }); }
  function hitFoe(n, x, y) {
    foe.hp -= n; foe.hit = .2; pop(`${n}`, x, y - 20, '#f8d838'); burst(x, y - 8, '#f8f8f0'); haptic(n >= 4 ? 'heavy' : 'medium'); sfx(240 + n * 40, .1, 'square', .05, -100); shake = n >= 4 ? .2 : .1;
  }
  function hurt(n) { hp -= n; shake = .3; pop(`-${n}`, hx(), gy() - 30, '#f86060'); haptic('heavy'); sfx(120, .25, 'sawtooth', .05, -60); }
  function endPlayerTurn() { if (foe.hp <= 0) { state = 'win'; st = { t: 0 }; score += 1 + bonus; bonus = 0; api.score(score); haptic('success'); sfx(880, .4, 'square', .05, 500); burst(foe.x, foe.y - 10, foe.col); } else { state = 'foe'; st = { t: 0, move: foe.moves[Math.random() * foe.moves.length | 0], at: rnd(1.1, 1.9) - Math.min(.4, fight * .02), w: Math.max(.07, .2 - fight * .009) }; } }
  function excellent(x, y) { pop('EXCELLENT!', x, y - 34, '#80f8ff'); bonus = Math.min(3, bonus + 1); haptic('success'); sfx(1320, .1, 'square', .04, 300); }
  const self = {
    reset() { hp = maxHp = 24; score = 0; t = 0; fight = 0; parts = []; shake = 0; bonus = 0; hold = false; newFoe(); },
    resize(w, h) { W = w; H = h; if (foe) { foe.x = fx(); foe.y = gy(); } },
    update(dt) {
      t += dt; shake = Math.max(0, shake - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; } foe.hit = Math.max(0, foe.hit - dt);
      for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } else p.y -= 18 * dt; } parts = parts.filter(p => p.l > 0);
      st.t += dt;
      if (state === 'jump') {
        // run in (0..0.5), arc (0.5..1.0) landing at 1.0 + 0.45 per bounce
        const land = 1 + st.n * .45;
        if (st.t >= land && !st.landed) {
          st.landed = true;
          if (foe.spiky) { hurt(2); pop('OUCH! SPIKES', hx(), gy() - 40, '#f86060'); st.end = st.t + .5; }
          else { hitFoe(st.n === 0 ? 2 : 3, foe.x, foe.y); if (st.tap != null && Math.abs(st.tap - land) < .12 && st.n < 2 && foe.hp > 0) { excellent(foe.x, foe.y); st.n++; st.landed = false; st.tap = null; } else st.end = st.t + .4; }
        }
        if (st.end && st.t >= st.end) { state = 'back'; st = { t: 0, from: 'jump' }; }
      } else if (state === 'bash') {
        if (st.release != null) { if (st.t >= st.release + .2 && !st.done) { st.done = true; const m = st.meter; if (foe.fly) { pop('TOO HIGH!', foe.x, foe.y - 30, '#a0a0c0'); sfx(200, .1, 'square', .03); } else if (m > 1) { pop('FUMBLE', hx() + 30, gy() - 30, '#a0a0c0'); } else if (m > .72) { hitFoe(6, foe.x, foe.y); excellent(foe.x, foe.y); } else hitFoe(m > .4 ? 3 : 2, foe.x, foe.y); }
          if (st.t >= st.release + .7) { state = 'back'; st = { t: 0 }; } }
        else { st.meter = st.t / 1; if (st.t > 1.4) { st.release = st.t; st.meter = 2; } }
      } else if (state === 'back') { if (st.t > .4) endPlayerTurn(); }
      else if (state === 'foe') {
        const at = st.at;
        if (!st.resolved && st.t >= at + .14) { st.resolved = true; const ok = st.tap != null && st.tap >= at - st.w && st.tap <= at + .1, perfect = ok && st.tap >= at - st.w * .45;
          if (!ok) hurt(foe.atk + (st.move === 'stomp' ? 2 : 0));
          else { pop(st.move === 'throw' ? 'SWAT!' : 'DODGE!', hx(), gy() - 34, '#88f070'); sfx(900, .08, 'square', .04, 300); haptic('light'); if (perfect) { hitFoe(2, foe.x, foe.y); excellent(hx(), gy()); } } }
        if (st.resolved && st.t >= at + .8) { if (hp <= 0) { state = 'dead'; st = { t: 0 }; } else if (foe.hp <= 0) endPlayerTurn(); else { state = 'menu'; st = { t: 0 }; } }
      } else if (state === 'win') { if (st.t > 1.3) { hp = Math.min(maxHp, hp + 4); newFoe(); } }
      else if (state === 'dead') { if (st.t > .8) { haptic('error'); return api.over(); } }
    },
    draw(c) {
      const g = gy(), sx = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
      const sky = c.createLinearGradient(0, 0, 0, g); sky.addColorStop(0, '#f8a868'); sky.addColorStop(1, '#f8e0a0'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      c.save(); c.translate(sx, 0);
      c.fillStyle = '#d89058'; for (let x = 0; x < W; x += 2) { const hh = 18 + Math.sin(x * .04) * 8; c.fillRect(x, g - hh - 10, 2, hh); }
      c.fillStyle = '#88c048'; c.fillRect(0, g, W, H - g); c.fillStyle = '#68a038'; c.fillRect(0, g, W, 2);
      // hero position by state
      let x = hx(), y = g, pose = 'stand';
      if (state === 'jump') { const k = st.t; if (k < .5) x = hx() + (foe.x - 18 - hx()) * k / .5; else { const land = 1 + st.n * .45, start = land - (st.n === 0 ? .5 : .45), p = clamp((k - start) / (land - start), 0, 1); x = st.n === 0 ? foe.x - 18 + 18 * p : foe.x; y = g - 28 + (k < land ? -Math.sin(p * Math.PI) * 24 + 28 * p * (st.n === 0 ? 1 : 0) : 28) - (st.n > 0 ? -Math.sin(p * Math.PI) * 0 : 0); if (st.n > 0) y = g - 28 - Math.sin(p * Math.PI) * 26; if (k >= land) y = g - 28; pose = 'air'; } }
      else if (state === 'bash') { x = foe.x - 22; pose = st.release != null ? 'swing' : 'wind'; }
      else if (state === 'back') { x = hx() + (foe.x - 20 - hx()) * Math.max(0, 1 - st.t / .4); }
      else if (state === 'foe' && st.tap != null && st.t - st.tap < .35 && st.move !== 'throw') { y = g - Math.sin((st.t - st.tap) / .35 * Math.PI) * 26; pose = 'air'; }
      // foe
      let fxp = foe.x, fy = g; const fl = foe.hit > 0 && (t * 30 | 0) % 2;
      if (state === 'foe') { const at = st.at, k = st.t; if (st.move === 'charge' || st.move === 'stomp') { if (k > at - .45 && k < at + .3) fxp = foe.x + (hx() - foe.x) * clamp((k - (at - .45)) / .45, 0, 1); else if (k >= at + .3) fxp = hx() + (foe.x - hx()) * clamp((k - at - .3) / .4, 0, 1); if (st.move === 'stomp' && k > at - .45 && k < at) fy = g - Math.sin(clamp((k - (at - .45)) / .45, 0, 1) * Math.PI) * 30; } if (st.move === 'swoop' && k > at - .45 && k < at + .3) fxp = foe.x + (hx() - foe.x) * clamp((k - (at - .45)) / .45, 0, 1); }
      if (state !== 'win' || (t * 10 | 0) % 2) {
        const fyy = foe.fly ? fy - 30 + Math.sin(t * 4) * 3 : fy, s = foe.k === 'brute' ? 1.6 : 1;
        c.fillStyle = fl ? '#f8f8f0' : foe.col; c.fillRect(fxp - 8 * s, fyy - 14 * s, 16 * s, 14 * s);
        if (foe.k === 'cap') { c.fillStyle = fl ? '#f8f8f0' : '#f8f0e0'; c.fillRect(fxp - 5, fyy - 6, 10, 6); c.fillStyle = '#f8f8f0'; c.fillRect(fxp - 5, fyy - 12, 3, 3); c.fillRect(fxp + 2, fyy - 13, 3, 3); }
        if (foe.spiky) { c.fillStyle = '#f8f8f0'; for (let i = -6; i <= 6; i += 4) { c.fillRect(fxp + i, fyy - 17, 2, 3); c.fillRect(fxp + i + .5, fyy - 18, 1, 1); } }
        if (foe.fly) { const f2 = (t * 10 | 0) % 2 * 3; c.fillStyle = '#d8c0f8'; c.fillRect(fxp - 14, fyy - 12 + f2, 6, 3); c.fillRect(fxp + 8, fyy - 12 + f2, 6, 3); }
        c.fillStyle = '#101018'; c.fillRect(fxp - 5 * s, fyy - 9 * s, 2, 3); c.fillRect(fxp + 2 * s, fyy - 9 * s, 2, 3); c.fillRect(fxp - 3 * s, fyy - 9 * s - 2, 3, 1);
        if (state === 'foe' && !st.resolved && st.t > st.at - st.w && st.t < st.at + .1) { c.fillStyle = '#f8f8f0'; c.font = '12px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('!', hx(), g - 44); }
        if (state === 'foe' && st.move === 'throw') { const at = st.at, k = st.t; if (k > at - .5 && k < at + .05) { const p = clamp((k - (at - .5)) / .5, 0, 1), rx = foe.x + (hx() - foe.x) * p, ry = g - 18 - Math.sin(p * Math.PI) * 24; c.fillStyle = '#787890'; c.fillRect(rx - 3, ry - 3, 6, 6); } }
      }
      // hero: an original plucky plumber-free adventurer in a teal tunic with a big mallet
      c.fillStyle = '#20a0a0'; c.fillRect(x - 5, y - 16, 10, 10); c.fillStyle = '#f8d0a8'; c.fillRect(x - 4, y - 23, 8, 7); c.fillStyle = '#e8c038'; c.fillRect(x - 5, y - 25, 10, 3); c.fillStyle = '#101018'; c.fillRect(x + 1, y - 21, 1, 2);
      c.fillStyle = '#704020'; c.fillRect(x - 4, y - 6, 3, 6); c.fillRect(x + 1, y - 6, 3, 6);
      if (pose === 'wind' || pose === 'swing') { const a = pose === 'wind' ? -2.4 - Math.min(1, st.meter || 0) * .6 : 0.3; c.save(); c.translate(x + 4, y - 14); c.rotate(a); c.fillStyle = '#8a5a30'; c.fillRect(0, -1, 12, 2); c.fillStyle = '#a0a0b0'; c.fillRect(10, -4, 6, 8); c.restore(); }
      for (const p of parts) { if (p.txt) { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x | 0, p.y | 0, 2, 2); } }
      // jump timing ring
      if (state === 'jump' && !st.end) { const land = 1 + st.n * .45, k = clamp((land - st.t) / .45, 0, 1); c.strokeStyle = '#f8f8f0'; c.lineWidth = 1; c.beginPath(); c.arc(foe.x, foe.y - 16, 6 + k * 18, 0, 7); c.stroke(); c.strokeStyle = '#80f8ff'; c.beginPath(); c.arc(foe.x, foe.y - 16, 6, 0, 7); c.stroke(); }
      if (state === 'bash' && st.release == null) { const m = clamp(st.meter, 0, 1.4) / 1.4, bx = x - 20, by = y - 44; c.fillStyle = '#101018'; c.fillRect(bx, by, 40, 6); c.fillStyle = '#58c040'; c.fillRect(bx + 1 + 38 * .72 / 1.4, by + 1, 38 * .28 / 1.4, 4); c.fillStyle = '#f8d838'; c.fillRect(bx + 1, by + 1, 38 * m, 4); }
      c.restore();
      // HP plates
      c.font = '6px "Press Start 2P", monospace';
      const plate = (px, py, label, v, max, col) => { c.fillStyle = '#101018c0'; c.fillRect(px, py, 70, 16); c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(label, px + 3, py + 7); c.fillStyle = '#383848'; c.fillRect(px + 3, py + 10, 64, 3); c.fillStyle = col; c.fillRect(px + 3, py + 10, 64 * clamp(v / max, 0, 1), 3); };
      plate(3, 18, `YOU ${Math.max(0, hp)}`, hp, maxHp, '#88f070'); plate(W - 73, 18, foe.name, foe.hp, foe.max, '#f86060');
      c.textAlign = 'left'; c.fillStyle = '#101018'; c.fillText(`FIGHT ${fight}`, 3, 11);
      // command buttons
      if (state === 'menu') { const bw = (W - 12) / 2, by = H - 30; [['JUMP', '#3878e0'], ['BASH', '#e08030']].forEach(([l, col], i) => { c.fillStyle = col; c.fillRect(4 + i * (bw + 4), by, bw, 24); c.fillStyle = '#ffffff40'; c.fillRect(4 + i * (bw + 4), by, bw, 2); c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText(l, 4 + i * (bw + 4) + bw / 2, by + 15); }); }
      else { c.textAlign = 'center'; c.fillStyle = '#304020'; c.fillText(state === 'foe' ? 'TAP AT THE FLASH!' : state === 'jump' ? 'TAP AS YOU LAND' : state === 'bash' && st.release == null ? 'LET GO IN THE GREEN' : '', W / 2, H - 14); }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018c0'; c.fillRect(0, H * .3 - 9, W, 14); c.fillStyle = '#f8f8f0'; c.fillText(msg.txt, W / 2, H * .3 + 1); }
    },
    down(x, y) {
      if (state === 'menu' && y >= H - 34) { if (msg && msg.l > .9) return; const bw = (W - 12) / 2, i = x < 4 + bw + 2 ? 0 : 1; haptic('tick'); if (i === 0) { state = 'jump'; st = { t: 0, n: 0 }; sfx(400, .1, 'square', .04, 300); } else { state = 'bash'; st = { t: 0, meter: 0 }; hold = true; sfx(300, .1, 'square', .04, 100); } return; }
      if (state === 'jump' && st.tap == null) st.tap = st.t;
      if (state === 'foe' && st.tap == null) { st.tap = st.t; sfx(500, .05, 'square', .03, 300); }
    },
    up() { if (state === 'bash' && st.release == null) { st.release = st.t; st.meter = Math.min(st.meter, 2); haptic('medium'); sfx(200, .1, 'square', .05, -100); } hold = false; },
    key(k, d) { if (d && state === 'menu') { if (k === '1') self.down(10, H - 10); if (k === '2') self.down(W - 10, H - 10); } if (k === ' ') { if (d) self.down(W / 2, 0); else self.up(); } },
  };
  return self;
}

export default {
  id: 'timing-brawl', title: 'Timing Brawl', tag: 'Advance · RPG', retro: true, era: 'advance', pal: 'lemon', w: 160, h: 176, maxW: 240, maxH: 260, goal: 10,
  hint: 'Pick JUMP or BASH. Jump: tap as you land to bounce for extra hits. Bash: hold, then let go in the green. On the foe\'s turn, tap when the ! flashes to dodge or swat for a counter. Don\'t jump on spiky foes; bash can\'t reach fliers.',
  make,
};
