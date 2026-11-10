// Lasso Loop: calves run across the ranch. Circle your finger round and round over where you want the
// rope to land; the faster you circle, the wider the loop. Let go to throw, and the loop drops where
// you were circling. Calves keep running while the rope flies, so lead them. Don't rope a skunk.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 176, H = 224;

function make(api) {
  const feel = new Feel({ pixel: true });
  let critters, pts, spin, rope, score, misses, t, spawn, msg, ml, held;
  const FIELD = 30;

  function addCritter() {
    const left = Math.random() < .5, kind = Math.random() < .14 ? 'skunk' : Math.random() < .12 ? 'gold' : 'calf';
    const sp = rnd(22, 34) + Math.min(30, t * .5);
    critters.push({ x: left ? -10 : W + 10, y: rnd(FIELD + 14, H - 60), vx: (left ? 1 : -1) * sp * (kind === 'gold' ? 1.5 : 1), kind, ph: Math.random() * 6, hop: 0 });
  }
  const centre = () => { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; };

  return {
    reset() { critters = []; pts = []; spin = 0; rope = null; score = 0; misses = 0; t = 0; spawn = .5; msg = ''; ml = 0; held = false; feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      spawn -= dt; if (spawn <= 0 && critters.length < 5) { addCritter(); spawn = rnd(.8, 1.8); }
      for (const k of critters) { k.x += k.vx * dt; k.ph += dt * 12; if (Math.random() < dt * .3) k.vx *= -1; }
      critters = critters.filter(k => k.x > -20 && k.x < W + 20 && !k.caught);
      if (!held) spin = Math.max(0, spin - dt * .8);
      if (rope) {
        rope.k += dt / .4;
        if (rope.k >= 1 && !rope.done) {
          rope.done = true; let got = null, bd = 1e9;
          for (const k of critters) { const d = Math.hypot(k.x - rope.x, k.y - rope.y); if (d < rope.r && d < bd) { bd = d; got = k; } }
          if (!got) { misses++; msg = 'MISSED'; ml = .8; sfx(200, .15, 'triangle', .03, -80); haptic('warning'); }
          else if (got.kind === 'skunk') { got.caught = true; misses++; msg = 'PHEW! A SKUNK'; ml = 1.2; feel.hurt(got.x, got.y); haptic('error'); }
          else { got.caught = true; const p = got.kind === 'gold' ? 3 : 1; score += p; api.score(score); msg = got.kind === 'gold' ? 'GOLDEN! +3' : 'YEE-HAW!'; ml = .8; notes('G5 C6', { len: .06 }); feel.coin(got.x, got.y); haptic('success'); }
          if (misses >= 3) { feel.lose(); return api.over(); }
        }
        if (rope.k > 1.4) rope = null;
      }
    },
    draw(c) {
      c.fillStyle = '#88c070'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#f8c890'; c.fillRect(0, 0, W, FIELD);
      c.fillStyle = '#e8a860'; c.fillRect(0, FIELD - 4, W, 4);
      // fence
      c.fillStyle = '#a06838'; c.fillRect(0, FIELD, W, 2); c.fillRect(0, FIELD + 6, W, 2); for (let x = 4; x < W; x += 16) c.fillRect(x, FIELD - 2, 3, 12);
      c.fillStyle = '#78a860'; for (let i = 0; i < 50; i++) c.fillRect((i * 41) % W, FIELD + 14 + (i * 29) % (H - FIELD - 40), 2, 2);
      feel.begin(c);
      for (const k of [...critters].sort((a, b) => a.y - b.y)) {
        const x = Math.round(k.x), y = Math.round(k.y - Math.abs(Math.sin(k.ph * .5)) * 2), f = k.vx > 0 ? 1 : -1;
        c.fillStyle = '#00000030'; c.fillRect(x - 6, Math.round(k.y) + 4, 12, 2);
        if (k.kind === 'skunk') {
          c.fillStyle = '#202028'; c.fillRect(x - 6, y - 4, 11, 7); c.fillRect(x + f * 5 - 1, y - 3, 3, 4);
          c.fillStyle = '#f8f8f8'; c.fillRect(x - 5, y - 5, 9, 2); c.fillStyle = '#202028'; c.fillRect(x - f * 8 - 1, y - 9, 3, 8); c.fillStyle = '#f8f8f8'; c.fillRect(x - f * 8, y - 9, 1, 6);
        } else {
          c.fillStyle = k.kind === 'gold' ? '#f8d038' : '#f8f0e0'; c.fillRect(x - 6, y - 4, 12, 7);
          c.fillStyle = k.kind === 'gold' ? '#c89818' : '#704828'; c.fillRect(x - 3, y - 4, 4, 3); c.fillRect(x + f * 6 - (f < 0 ? 4 : 0), y - 6, 4, 5);
          c.fillStyle = '#202028'; c.fillRect(x + f * 7 - (f < 0 ? 1 : 0), y - 5, 1, 1);
          const leg = Math.floor(k.ph) % 2; c.fillStyle = '#704828'; c.fillRect(x - 5, y + 3, 1, 2 + leg); c.fillRect(x + 4, y + 3, 1, 3 - leg);
        }
      }
      // the swirl you're drawing and the loop that will drop there
      if (held && pts.length > 4) {
        const ce = centre(), r = Math.round(8 + spin * 16);
        c.fillStyle = '#f8f8f0'; for (let a = 0; a < 24; a++) if ((a + Math.floor(t * 20)) % 3) c.fillRect(Math.round(ce.x + Math.cos(a / 24 * 6.283) * r), Math.round(ce.y + Math.sin(a / 24 * 6.283) * r * .6), 1, 1);
      }
      // the rancher at the bottom
      const rx = Math.round(W / 2), ry = H - 26;
      c.fillStyle = '#583018'; c.fillRect(rx - 8, ry - 14, 16, 3); c.fillRect(rx - 5, ry - 18, 10, 4);
      c.fillStyle = '#f0b888'; c.fillRect(rx - 3, ry - 11, 6, 5); c.fillStyle = '#3858d8'; c.fillRect(rx - 5, ry - 6, 10, 10); c.fillStyle = '#704828'; c.fillRect(rx - 4, ry + 4, 3, 6); c.fillRect(rx + 1, ry + 4, 3, 6);
      // spinning rope over the rancher's head
      if (held) { const a = t * (4 + spin * 14), r = 6 + Math.round(spin * 6); c.fillStyle = '#c89858'; for (let i = 0; i < 12; i++) c.fillRect(Math.round(rx + 6 + Math.cos(a + i / 2) * r), Math.round(ry - 22 + Math.sin(a + i / 2) * r * .4), 1, 1); }
      // rope in flight
      if (rope) {
        const k = Math.min(1, rope.k), x = Math.round(rx + (rope.x - rx) * k), y = Math.round(ry - 20 + (rope.y - ry + 20) * k - Math.sin(k * Math.PI) * 30), r = Math.round(rope.r * (k < 1 ? .5 + k * .5 : 1));
        c.fillStyle = '#c89858'; for (let i = 0; i < 10; i++) { const kk = i / 10; c.fillRect(Math.round(rx + (x - rx) * kk), Math.round(ry - 20 + (y - ry + 20) * kk - Math.sin(kk * Math.PI) * 6), 1, 1); }
        for (let a = 0; a < 28; a++) c.fillRect(Math.round(x + Math.cos(a / 28 * 6.283) * r), Math.round(y + Math.sin(a / 28 * 6.283) * r * .6), 1, 1);
      }
      feel.end(c, W, H);
      text(c, `${score}`, 4, 3, { color: '#683820' });
      for (let i = 0; i < 3 - misses; i++) { c.fillStyle = '#a06838'; c.fillRect(W - 9 - i * 7, 3, 5, 5); }
      // spin meter
      c.fillStyle = '#00000040'; c.fillRect(8, H - 10, 50, 4); c.fillStyle = spin > .7 ? '#f8d038' : '#f8f8f0'; c.fillRect(8, H - 10, Math.round(50 * spin), 4);
      if (ml > 0) text(c, msg, W / 2, 16, { align: 'center', color: '#683820' });
      else if (t < 6 && !score) text(c, 'CIRCLE YOUR FINGER, LET GO', W / 2, H - 46, { align: 'center', color: '#f8f8f0', outline: '#284028' });
    },
    down(x, y) { held = true; pts = [{ x, y }]; spin = Math.max(spin, .05); },
    move(x, y, pr) {
      if (!pr || !held) return;
      const prev = pts[pts.length - 1]; pts.push({ x, y }); if (pts.length > 24) pts.shift();
      const ce = centre(), a0 = Math.atan2(prev.y - ce.y, prev.x - ce.x), a1 = Math.atan2(y - ce.y, x - ce.x);
      let da = a1 - a0; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      if (Math.hypot(x - ce.x, y - ce.y) > 5) spin = clamp(spin + Math.abs(da) * .05, 0, 1);
      if (Math.random() < .2) { sfx(300 + spin * 500, .03, 'triangle', .015); }
    },
    up() {
      if (!held) return; held = false;
      if (rope || pts.length < 4 || spin < .1) { pts = []; return; }
      const ce = centre();
      rope = { x: clamp(ce.x, 6, W - 6), y: clamp(ce.y, FIELD + 6, H - 40), r: 8 + spin * 16, k: 0 };
      spin = 0; pts = []; sfx(500, .2, 'triangle', .03, -300); haptic('light');
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'lasso-loop',
  title: 'Lasso Loop',
  tag: 'Advance · Ranch',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 224, maxW: 240, maxH: 280,
  goal: 15,
  hint: 'Circle your finger over where the rope should land (faster makes a wider loop), then let go. Rope calves, skip skunks. Three misses and it is over.',
  make,
};
