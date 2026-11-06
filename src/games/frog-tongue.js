import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// A hungry frog on a lily pad. Tap anywhere to flick its tongue that way: it takes a moment to
// reach, so lead your target. Flies are food, wasps sting. The frog gets hungrier as time goes on.
const P = PAL.moss, W = 160, H = 160, FX = 80, FY = 128, REACH = 110;

function make(api) {
  let bugs, tongue, hunger, score, t, spawn, stings, pops;
  function add() {
    const wasp = Math.random() < Math.min(.3, .1 + score * .01), y = rnd(20, 100), dir = Math.random() < .5 ? 1 : -1;
    bugs.push({ x: dir > 0 ? -6 : W + 6, y, dir, sp: rnd(22, 40) + score * .8, ph: rnd(0, 6), wasp, big: !wasp && Math.random() < .15 });
  }
  const self = {
    reset() { bugs = []; tongue = null; hunger = 1; score = 0; t = 0; spawn = .4; stings = 0; pops = []; },
    update(dt) {
      t += dt; hunger -= dt * (.05 + Math.min(.06, t / 900)); if (hunger <= 0) { haptic('error'); return api.over(); }
      spawn -= dt; if (spawn <= 0) { spawn = rnd(.5, 1.1); if (bugs.length < 7) add(); }
      for (const b of bugs) { b.ph += dt * 3; b.x += b.dir * b.sp * dt; b.y += Math.sin(b.ph) * 18 * dt; }
      bugs = bugs.filter(b => b.x > -10 && b.x < W + 10 && !b.eaten);
      if (tongue) {
        tongue.k += dt * (tongue.back ? 5 : 3.6);
        const ext = tongue.back ? Math.max(0, 1 - (tongue.k - 1)) : Math.min(1, tongue.k), tx = FX + Math.cos(tongue.a) * tongue.len * ext, ty = FY - 6 + Math.sin(tongue.a) * tongue.len * ext;
        tongue.tx = tx; tongue.ty = ty;
        if (!tongue.held) for (const b of bugs) if (Math.hypot(b.x - tx, b.y - ty) < (b.big ? 7 : 5)) {
          tongue.held = b; tongue.back = true; tongue.k = 2 - Math.min(1, tongue.k);
          if (b.wasp) { stings++; hunger -= .25; haptic('error'); sfx(200, .3, 'sawtooth', .04, -60); pops.push({ x: tx, y: ty, txt: 'OW', l: .8 }); }
          else { haptic('success'); sfx(700, .06, 'square', .04, 200); }
          break;
        }
        if (tongue.k >= 1 && !tongue.back) tongue.back = true;
        if (tongue.held) { tongue.held.x = tx; tongue.held.y = ty; }
        if (tongue.back && tongue.k >= 2) {
          const b = tongue.held; if (b && !b.wasp) { const v = b.big ? 3 : 1; score += v; hunger = Math.min(1, hunger + (b.big ? .3 : .14)); api.score(score); pops.push({ x: FX, y: FY - 20, txt: `+${v}`, l: .8 }); sfx(400, .05, 'square', .03); }
          if (b) b.eaten = true; tongue = null;
          if (hunger <= 0) return api.over();
        }
      }
      for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0);
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[2]; c.fillRect(0, 110, W, 50); for (let i = 0; i < 8; i++) c.fillRect((i * 23 + t * 6) % W, 118 + (i % 3) * 12, 10, 1);
      c.fillStyle = P[1]; c.beginPath(); c.ellipse(FX, FY + 6, 26, 8, 0, 0, 7); c.fill();
      for (const b of bugs) {
        const x = Math.round(b.x), y = Math.round(b.y), f = Math.sin(b.ph * 8) > 0;
        if (b.wasp) { c.fillStyle = P[0]; c.fillRect(x - 3, y - 2, 7, 4); c.fillStyle = P[2]; c.fillRect(x - 1, y - 2, 1, 4); c.fillRect(x + 2, y - 2, 1, 4); }
        else { c.fillStyle = P[0]; c.fillRect(x - (b.big ? 3 : 2), y - (b.big ? 2 : 1), b.big ? 6 : 4, b.big ? 4 : 3); }
        c.fillStyle = P[1]; c.fillRect(x - 3, y - (f ? 4 : 3), 2, 1); c.fillRect(x + 2, y - (f ? 4 : 3), 2, 1);
      }
      if (tongue) { c.strokeStyle = P[0]; c.lineWidth = 2; c.beginPath(); c.moveTo(FX, FY - 6); c.lineTo(tongue.tx, tongue.ty); c.stroke(); c.fillStyle = P[0]; c.fillRect(Math.round(tongue.tx) - 2, Math.round(tongue.ty) - 2, 4, 4); }
      // frog
      c.fillStyle = P[0]; c.fillRect(FX - 10, FY - 8, 20, 12); c.fillRect(FX - 9, FY - 13, 6, 6); c.fillRect(FX + 3, FY - 13, 6, 6);
      c.fillStyle = P[3]; c.fillRect(FX - 7, FY - 11, 2, 2); c.fillRect(FX + 5, FY - 11, 2, 2); c.fillStyle = P[1]; c.fillRect(FX - 6, FY - 3, 12, 1);
      c.fillStyle = P[0]; c.fillRect(FX - 14, FY + 2, 5, 3); c.fillRect(FX + 9, FY + 2, 5, 3);
      // hunger bar top-left
      c.fillStyle = P[0]; c.fillRect(4, 4, 42, 6); c.fillStyle = hunger < .3 ? P[3] : P[2]; c.fillRect(5, 5, 40 * clamp(hunger, 0, 1), 4);
      for (const p of pops) { c.globalAlpha = Math.min(1, p.l * 2); c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(p.txt, p.x, p.y - (1 - p.l) * 10); c.globalAlpha = 1; }
      if (t < 4) { c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('TAP TO FLICK', 80, 154); }
    },
    down(x, y) {
      if (tongue) return; const a = Math.atan2(Math.min(y, FY - 10) - (FY - 6), x - FX), len = Math.min(REACH, Math.hypot(x - FX, y - (FY - 6)) + 8);
      tongue = { a, len, k: 0, back: false, held: null, tx: FX, ty: FY - 6 }; haptic('tick'); sfx(300, .05, 'square', .03, 400);
    },
    key(k, d) { if (d && k === ' ' && !tongue) { const b = bugs.find(q => !q.wasp); if (b) self.down(b.x + b.dir * 12, b.y); } },
  };
  return self;
}

export default {
  id: 'frog-tongue', title: 'Frog Tongue', tag: 'Pocket · Aim', retro: true, w: W, h: H, pal: 'moss', goal: 30,
  hint: 'Tap where you want the frog to flick its tongue. It takes a moment to get there, so aim ahead of the bugs. Flies feed you, wasps sting. Do not go hungry.',
  make,
};
