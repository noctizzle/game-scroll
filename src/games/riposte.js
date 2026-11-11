import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util, { Feel } = gs.effects;
const text = gs.pixel.text;

// Riposte: a string of sword duels on a castle wall, taken in turns. On your turn pick FLURRY or LUNGE.
// Flurry: three marks slide to a notch, tap as each one arrives (all three dead on adds a bonus hit).
// Lunge: a pendulum swings, tap as it passes the bottom for one heavy hit. On the foe's turn the cut
// comes HIGH or LOW: tap the top or the bottom half of the screen as it lands to parry, and a parry
// that is dead on hits back. Shields turn a flurry aside; acrobats flip away from a lunge; the
// captain feints.
const FOES = [
  { k: 'squire', name: 'SQUIRE', hp: 8, atk: 3, coat: '#4878d0' },
  { k: 'guard', name: 'SHIELD GUARD', hp: 10, atk: 3, coat: '#8a8a9a', shield: true },
  { k: 'acrobat', name: 'ACROBAT', hp: 7, atk: 3, coat: '#a860d8', nimble: true },
  { k: 'captain', name: 'CAPTAIN', hp: 20, atk: 5, coat: '#2a2438', feint: true },
];
const W = 160, H = 176, GY = H - 46, HX = 46, FX = 114;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  let hp, maxHp, foe, state, st, score, t, fight, msg, bonus;

  function newFoe() {
    fight++; const pool = fight < 2 ? [0] : fight < 4 ? [0, 1, 2] : [0, 1, 2], f = FOES[fight % 5 === 0 ? 3 : pool[Math.random() * pool.length | 0]];
    const s = 1 + (fight - 1) * .15; foe = { ...f, hp: Math.round(f.hp * s), max: Math.round(f.hp * s), atk: Math.round(f.atk * (1 + (fight - 1) * .14)), hit: 0, flip: 0 };
    state = 'menu'; st = { t: 0 }; msg = { txt: foe.name, l: 1.1 };
  }
  const pop = (txt, x, y, color = '#f8f8f0') => feel.juice.pop(x, y, txt, { color });
  const sparks = (x, y, color) => feel.juice.burst(x, y, { n: 7, speed: 70, life: .35, size: 2, color });
  function hitFoe(n) {
    foe.hp -= n; foe.hit = .2; pop(String(n), FX, GY - 34, '#f8d838'); sparks(FX - 6, GY - 14, ['#f8f8f0', '#f8d838']);
    haptic(n >= 4 ? 'heavy' : 'medium'); sfx(240 + n * 40, .1, 'square', .05, -100); feel.juice.shake(n >= 4 ? 4 : 2);
  }
  function hurt(n) { hp -= n; feel.juice.shake(5); pop('-' + n, HX, GY - 34, '#f86060'); haptic('heavy'); sfx(120, .25, 'sawtooth', .05, -60); }
  function excellent() { pop('DEAD ON', W / 2, GY - 52, '#80f8ff'); bonus = Math.min(3, bonus + 1); haptic('success'); sfx(1320, .1, 'square', .04, 300); }
  function clang(txt) { pop(txt, FX, GY - 34, '#c8c8d8'); sparks(FX - 8, GY - 16, ['#f8f8f0', '#a8a8c0']); sfx(1500, .05, 'square', .03, -300); haptic('light'); }
  function endPlayerTurn() {
    if (foe.hp <= 0) { state = 'win'; st = { t: 0 }; score += 1 + bonus; bonus = 0; api.score(score); haptic('success'); sfx(880, .4, 'square', .05, 500); feel.juice.burst(FX, GY - 12, { n: 16, speed: 90, life: .6, size: 2, color: [foe.coat, '#f8f8f0'] }); return; }
    const high = Math.random() < .5;
    state = 'foe'; st = { t: 0, high, shown: foe.feint && Math.random() < .6 ? !high : high, at: rnd(1.2, 1.9) - Math.min(.4, fight * .02), w: Math.max(.08, .2 - fight * .008) };
  }

  return {
    reset() { hp = maxHp = 24; score = 0; t = 0; fight = 0; bonus = 0; feel.clear(); newFoe(); },
    update(dt) {
      feel.update(dt); t += dt; if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      foe.hit = Math.max(0, foe.hit - dt); foe.flip = Math.max(0, foe.flip - dt); st.t += dt;
      if (state === 'flurry') {
        if (st.i < 3 && st.t > st.marks[st.i] + .12) { st.i++; pop('MISS', FX - 20, GY - 30, '#a0a0c0'); }
        if (st.i >= 3 && st.end == null) { st.end = st.t + .45; if (st.perfect === 3 && !foe.shield && foe.hp > 0) { hitFoe(2); excellent(); } }
        if (st.end != null && st.t >= st.end) { state = 'back'; st = { t: 0 }; }
      } else if (state === 'lunge') {
        if (st.end == null && st.t > 2.8) { st.end = st.t + .4; pop('TOO SLOW', HX + 30, GY - 34, '#a0a0c0'); }
        if (st.end != null && st.t >= st.end) { state = 'back'; st = { t: 0 }; }
      } else if (state === 'back') { if (st.t > .4) endPlayerTurn(); }
      else if (state === 'foe') {
        const at = st.at;
        if (st.shown !== st.high && st.t >= at - .34) { st.shown = st.high; sfx(700, .04, 'square', .03); }        // the feint drops away
        if (!st.resolved && st.t >= at + .14) {
          st.resolved = true; const tp = st.tap, ok = tp && tp.hi === st.high && tp.t >= at - st.w && tp.t <= at + .1, perfect = ok && tp.t >= at - st.w * .45;
          if (!ok) hurt(foe.atk);
          else { st.parried = true; pop('PARRY', HX, GY - 34, '#88f070'); sparks(HX + 14, GY - (st.high ? 20 : 8), ['#f8f8f0', '#88f070']); sfx(900, .08, 'square', .04, 300); haptic('light'); if (perfect) { hitFoe(2); excellent(); } }
        }
        if (st.resolved && st.t >= at + .8) { if (hp <= 0) { state = 'dead'; st = { t: 0 }; } else if (foe.hp <= 0) endPlayerTurn(); else { state = 'menu'; st = { t: 0 }; } }
      } else if (state === 'win') { if (st.t > 1.3) { hp = Math.min(maxHp, hp + 4); newFoe(); } }
      else if (state === 'dead') { if (st.t > .8) { haptic('error'); return api.over(); } }
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      // dusk over the castle
      ['#1c1840', '#2c2258', '#4a2c6c', '#7a3a70', '#b85a62', '#e08a5a'].forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 20, W, 20); });
      c.fillStyle = '#f0b068'; c.fillRect(0, 120, W, GY - 120);
      c.fillStyle = '#fff4d0'; c.fillRect(74, 44, 12, 16); c.fillRect(72, 46, 16, 12); c.fillRect(76, 42, 8, 20);
      c.fillStyle = '#241c3c'; for (const [x, w, h] of [[8, 14, 46], [30, 10, 30], [96, 12, 38], [140, 16, 54]]) { c.fillRect(x, GY - h, w, h); c.fillRect(x - 2, GY - h - 4, 4, 4); c.fillRect(x + w - 2, GY - h - 4, 4, 4); c.fillRect(x + (w >> 1) - 2, GY - h - 4, 4, 4); }
      c.fillStyle = '#4a4460'; for (let x = 0; x < W; x += 20) c.fillRect(x, GY - 12, 11, 12); c.fillRect(0, GY - 5, W, 5);
      c.fillStyle = '#6a6478'; c.fillRect(0, GY, W, H - GY); c.fillStyle = '#8a8498'; c.fillRect(0, GY, W, 2);
      c.fillStyle = '#585268'; for (let i = 0; i < 4; i++) for (let x = (i % 2) * 12; x < W; x += 24) c.fillRect(x, GY + 8 + i * 9, 1, 9); for (let i = 1; i < 5; i++) c.fillRect(0, GY + 8 + i * 9 - 1, W, 1);
      feel.begin(c);
      // where the two stand, and how their blades point
      let hx = HX, fx = FX, hb = -.5, hr = 12, fb = Math.PI + .5, fr = 12, hy = GY, fy = GY;
      if (state === 'flurry') { hx = FX - 26; const d = st.last != null ? st.t - st.last : 9; hb = d < .12 ? 0 : -.5; hr = d < .12 ? 16 : 12; }
      else if (state === 'lunge') { hx = FX - 30; if (st.tap != null) { const d = st.t - st.tap; hx += d < .15 ? 8 : 0; hb = 0; hr = 17; } else { hb = -1.2 + Math.sin(st.t * st.om) * .2; } }
      else if (state === 'back') hx = HX + (FX - 28 - HX) * Math.max(0, 1 - st.t / .4);
      else if (state === 'foe') {
        const k = st.t, at = st.at;
        if (k > at - .7 && k < at - .12) fb = Math.PI + (st.shown ? 1.15 : -.75);                                       // the tell: blade up for high, down for low
        if (k >= at - .12 && k < at + .3) { fx = FX - (FX - HX - 26) * clamp((k - (at - .12)) / .12, 0, 1); fb = Math.PI + (st.high ? .35 : -.3); fr = 16; }
        else if (k >= at + .3) fx = HX + 26 + (FX - HX - 26) * clamp((k - at - .3) / .4, 0, 1);
        if (st.parried) { hb = st.high ? -1.1 : .5; hr = 13; }
      }
      if (foe.flip > 0) fy = GY - Math.sin((1 - foe.flip / .4) * Math.PI) * 22;
      if (state !== 'win' || (t * 10 | 0) % 2) fencer(c, fx, fy, -1, foe, foe.hit > 0 && (t * 30 | 0) % 2, fb, fr);
      fencer(c, hx, hy, 1, { k: 'you', coat: '#c83848' }, false, hb, hr);
      if (state === 'foe' && !st.resolved) {                                                                          // which way the cut is coming, and the moment to parry
        const up = st.shown, ax = HX - 20, ay = up ? GY - 40 : GY - 6, on = st.t > st.at - .7;
        if (on) { c.fillStyle = st.t > st.at - st.w ? '#f8f8f0' : '#f8d838'; for (let i = 0; i < 4; i++) c.fillRect(ax - i, up ? ay + i : ay - i, 1 + i * 2, 1); c.fillRect(ax - 1, up ? ay + 4 : ay - 8, 3, 5); }
      }
      feel.end(c, W, H);
      if (state === 'flurry') {                                                                                       // three marks slide to the notch
        const bx = 30, bw = 100, by = 52, nx = bx + 80;
        c.fillStyle = '#101018'; c.fillRect(bx - 1, by - 1, bw + 2, 9); c.fillStyle = '#3a3458'; c.fillRect(bx, by, bw, 7);
        c.fillStyle = '#f8f8f0'; c.fillRect(nx - 1, by - 3, 3, 13);
        st.marks.forEach((a, i) => { if (i < st.i) return; const x = Math.round(nx - (a - st.t) * 110); if (x < bx || x > bx + bw) return; c.fillStyle = '#f8d838'; c.fillRect(x - 2, by + 1, 5, 5); c.fillRect(x - 1, by, 3, 7); });
      }
      if (state === 'lunge' && st.tap == null) {                                                                      // the pendulum: tap at the bottom
        const px = W / 2, py = 40, L = 30, a = Math.sin(st.t * st.om) * 1.15, bx = Math.round(px + Math.sin(a) * L), by = Math.round(py + Math.cos(a) * L);
        c.fillStyle = '#101018'; c.fillRect(px - 2, py - 2, 5, 5);
        c.fillStyle = '#58c040'; c.fillRect(px - 4, py + L + 5, 9, 3);
        c.fillStyle = '#c8c8d8'; for (let i = 0; i < L; i += 2) c.fillRect(Math.round(px + Math.sin(a) * i), Math.round(py + Math.cos(a) * i), 1, 1);
        c.fillStyle = '#101018'; c.fillRect(bx - 4, by - 3, 9, 7); c.fillRect(bx - 3, by - 4, 7, 9); c.fillStyle = '#f8d838'; c.fillRect(bx - 3, by - 3, 7, 7);
      }
      // health plates
      const plate = (px, label, v, max, col) => { c.fillStyle = '#101018'; c.fillRect(px, 19, 60, 15); text(c, label, px + 3, 21, { color: '#f8f8f0' }); c.fillStyle = '#383848'; c.fillRect(px + 3, 29, 54, 3); c.fillStyle = col; c.fillRect(px + 3, 29, Math.round(54 * clamp(v / max, 0, 1)), 3); };
      plate(3, 'YOU ' + Math.max(0, hp), hp, maxHp, '#88f070'); plate(W - 63, foe.name, foe.hp, foe.max, '#f86060');
      text(c, 'DUEL ' + fight, 3, 8, { color: '#f8f8f0' });
      if (state === 'menu') {
        const bw = (W - 12) / 2, by = H - 30;
        [['FLURRY', '#3878e0', foe.shield], ['LUNGE', '#e08030', foe.nimble]].forEach(([l, col, weak], i) => {
          const x = 4 + i * (bw + 4); c.fillStyle = '#101018'; c.fillRect(x, by, bw, 24); c.fillStyle = col; c.fillRect(x + 1, by + 1, bw - 2, 22); c.fillStyle = '#ffffff'; c.globalAlpha = .25; c.fillRect(x + 1, by + 1, bw - 2, 2); c.globalAlpha = 1;
          text(c, l, x + bw / 2, by + (weak ? 5 : 9), { color: '#f8f8f0', align: 'center' });
          if (weak) text(c, i ? 'HE FLIPS AWAY' : 'SHIELD STOPS IT', x + bw / 2, by + 14, { color: '#101018', align: 'center' });
        });
      } else {
        const tip = state === 'foe' ? (st.shown ? 'TAP UP HERE TO PARRY HIGH' : 'TAP DOWN HERE TO PARRY LOW') : state === 'flurry' ? 'TAP AS EACH MARK ARRIVES' : state === 'lunge' && st.tap == null ? 'TAP AT THE BOTTOM' : '';
        if (tip) text(c, tip, W / 2, state === 'foe' && st.shown ? 44 : H - 14, { color: '#f8f8f0', align: 'center', shadow: '#101018' });
      }
      if (msg) { c.fillStyle = '#101018'; c.fillRect(0, 62, W, 13); text(c, msg.txt, W / 2, 66, { color: '#f8f8f0', align: 'center' }); }
    },
    down(x, y) {
      if (state === 'menu' && y >= H - 34) {
        if (msg && msg.l > .8) return; const i = x < W / 2 ? 0 : 1; haptic('tick');
        if (i === 0) { const a = .75, b = a + rnd(.32, .5); state = 'flurry'; st = { t: 0, marks: [a, b, b + rnd(.32, .5)], i: 0, perfect: 0, last: null, end: null }; sfx(400, .1, 'square', .04, 300); }
        else { state = 'lunge'; st = { t: 0, tap: null, end: null, om: 2 * Math.PI / Math.max(.8, 1.15 - fight * .02) }; sfx(300, .1, 'square', .04, 100); }
        return;
      }
      if (state === 'flurry' && st.i < 3) {
        const d = st.t - st.marks[st.i]; if (d < -.3) return;                    // far too early: not counted
        st.i++; st.last = st.t;
        if (Math.abs(d) > .1) { pop('MISS', FX - 20, GY - 30, '#a0a0c0'); sfx(200, .05, 'square', .03); return; }
        if (Math.abs(d) < .05) st.perfect++;
        if (foe.shield) clang('BLOCKED'); else if (foe.hp > 0) hitFoe(1);
      } else if (state === 'lunge' && st.tap == null && st.end == null) {
        st.tap = st.t; st.end = st.t + .6; const a = Math.abs(Math.sin(st.t * st.om) * 1.15);
        if (foe.nimble) { foe.flip = .4; pop('FLIPPED AWAY', FX, GY - 40, '#c8c8d8'); sfx(600, .12, 'sine', .04, 500); }
        else if (a < .16) { hitFoe(6); excellent(); } else if (a < .45) hitFoe(3); else { hitFoe(1); pop('GLANCE', FX, GY - 46, '#a0a0c0'); }
      } else if (state === 'foe' && !st.tap) { st.tap = { t: st.t, hi: y < H / 2 }; sfx(500, .05, 'square', .03, 300); }
    },
    up() {},
    key(k, d) {
      if (!d) return;
      if (state === 'menu') { if (k === '1' || k === 'ArrowLeft') this.down(10, H - 10); if (k === '2' || k === 'ArrowRight') this.down(W - 10, H - 10); return; }
      if (state === 'foe') { if (k === 'ArrowUp') this.down(W / 2, 10); if (k === 'ArrowDown') this.down(W / 2, H - 40); return; }
      if (k === ' ') this.down(W / 2, 60);
    },
  };
}

// A duellist: dir 1 faces right. The blade runs from the sword hand at angle a for len pixels.
function fencer(c, x, y, dir, who, flash, a, len) {
  const big = who.k === 'captain' ? 2 : 0, col = flash ? '#f8f8f0' : who.coat;
  c.fillStyle = '#2a2030'; c.fillRect(x - 4, y - 6, 3, 6); c.fillRect(x + 1, y - 6, 3, 6);
  c.fillStyle = col; c.fillRect(x - 5 - big, y - 17 - big, 10 + big * 2, 11 + big);
  c.fillStyle = '#f2c8a0'; c.fillRect(x - 3, y - 23 - big, 6, 6); c.fillStyle = '#101018'; c.fillRect(x + dir, y - 21 - big, 1, 1);
  if (who.k === 'you') { c.fillStyle = '#2a2030'; c.fillRect(x - 6, y - 25, 12, 2); c.fillRect(x - 3, y - 28, 6, 3); c.fillStyle = '#f8f8f0'; c.fillRect(x - 5 * dir - 1, y - 30, 3, 4); c.fillRect(x - 7 * dir - 1, y - 28, 3, 3); }
  else if (who.k === 'squire') { c.fillStyle = '#b8b8c8'; c.fillRect(x - 4, y - 26, 8, 4); c.fillStyle = '#101018'; c.fillRect(x - 3 + (dir > 0 ? 3 : 0), y - 24, 3, 1); }
  else if (who.k === 'guard') { c.fillStyle = '#b8b8c8'; c.fillRect(x - 4, y - 27, 8, 5); c.fillRect(x - 1, y - 29, 2, 2); c.fillStyle = '#6a5a3a'; c.fillRect(x + dir * 5 - 4, y - 17, 8, 12); c.fillStyle = '#d8b858'; c.fillRect(x + dir * 5 - 3, y - 16, 6, 10); c.fillStyle = '#6a5a3a'; c.fillRect(x + dir * 5 - 1, y - 13, 2, 4); }
  else if (who.k === 'acrobat') { c.fillStyle = '#f8d838'; c.fillRect(x - 5, y - 26, 4, 3); c.fillRect(x + 1, y - 26, 4, 3); c.fillRect(x - 6, y - 27, 2, 2); c.fillRect(x + 4, y - 27, 2, 2); }
  else { c.fillStyle = '#101018'; c.fillRect(x - 7, y - 27, 14, 2); c.fillRect(x - 4, y - 30, 8, 3); c.fillStyle = '#e04848'; c.fillRect(x - 7, y - 13, 14, 2); c.fillRect(x + 5 * -dir - 1, y - 32, 3, 3); }
  const hx = x + dir * 6, hy = y - 13 - big;                                  // sword hand, then the blade pixel by pixel
  c.fillStyle = '#f2c8a0'; c.fillRect(hx - 1, hy - 1, 3, 3);
  c.fillStyle = '#e8e8f8'; for (let i = 2; i < len; i++) c.fillRect(Math.round(hx + Math.cos(a) * i), Math.round(hy + Math.sin(a) * i), 1, 1);
  c.fillStyle = '#d8b858'; c.fillRect(Math.round(hx + Math.cos(a) * 2) - 1, Math.round(hy + Math.sin(a) * 2) - 1, 3, 3);
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'riposte', title: 'Riposte', tag: 'Advance · Duel', retro: true, era: 'advance', pal: 'berry', w: W, h: H, goal: 10, music: 'heroic',
  hint: 'Pick FLURRY (tap as each mark reaches the notch) or LUNGE (tap as the pendulum passes the bottom). When the foe cuts, tap the top half to parry high or the bottom half to parry low.',
  make,
};
