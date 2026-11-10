// Hammer Bell: the fairground strength tester. Hold to swing the hammer back; its power rises and falls
// while you hold. Let go to strike, and the puck shoots up the tower. Each round lights a prize band
// somewhere on the tower: stop the puck inside it. Ring the bell only when the band is at the top.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

const R = PAL.amber;
let W = 160, H = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let held, hold, power, puck, vy, phase, band, round, score, misses, t, msg, ml;
  const TOP = 18, BOT = () => H - 30;
  const towerH = () => BOT() - TOP;

  function newBand() {
    round++;
    const size = Math.max(.07, .2 - round * .01), top = round % 5 === 0;
    const lo = top ? 1 - size : .2 + Math.random() * (.75 - size);
    band = { lo, hi: lo + size, top };
    phase = 'ready'; puck = 0; vy = 0; hold = 0; power = 0;
  }

  return {
    reset() { round = 0; score = 0; misses = 0; t = 0; held = false; msg = ''; ml = 0; feel.clear(); newBand(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (phase === 'ready' && held) {
        hold += dt;
        const sp = 2.2 + round * .18;
        power = (1 - Math.cos(hold * sp)) / 2;
        if (Math.random() < dt * 10) haptic('tick');
      }
      if (phase === 'fly') {
        // the puck climbs, slows, and falls back; it "stops" at its peak
        puck += vy * dt; vy -= 2.2 * dt;
        if (puck >= 1) { puck = 1; vy = 0; phase = 'peak'; }
        if (vy <= 0 && phase === 'fly') phase = 'peak';
        if (phase === 'peak') judge();
      }
      if (phase === 'fall') { puck += vy * dt; vy -= 3 * dt; if (puck <= 0) { puck = 0; if (misses >= 3) return api.over(); newBand(); } }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      // bunting
      for (let x = 0; x < W; x += 12) { c.fillStyle = (x / 12) % 2 ? R[1] : R[2]; c.beginPath(); c.moveTo(x, 12); c.lineTo(x + 12, 12); c.lineTo(x + 6, 18); c.fill(); }
      c.fillStyle = R[0]; c.fillRect(0, 11, W, 1);
      const tx = Math.round(W / 2) - 6, y = v => Math.round(BOT() - v * towerH());
      feel.begin(c);
      // tower with marks
      c.fillStyle = R[1]; c.fillRect(tx, TOP, 12, towerH());
      c.fillStyle = R[2]; c.fillRect(tx + 2, TOP, 8, towerH());
      for (let k = 1; k < 10; k++) { c.fillStyle = R[1]; c.fillRect(tx + 2, y(k / 10), 3, 1); }
      // the prize band
      const blink = Math.floor(t * 4) % 2;
      c.fillStyle = blink ? R[0] : R[1]; c.fillRect(tx - 4, y(band.hi), 3, y(band.lo) - y(band.hi)); c.fillRect(tx + 13, y(band.hi), 3, y(band.lo) - y(band.hi));
      // bell
      c.fillStyle = band.top ? R[0] : R[1]; c.fillRect(tx - 2, TOP - 6, 16, 6); c.fillRect(tx + 2, TOP - 8, 8, 2);
      // puck
      c.fillStyle = R[0]; c.fillRect(tx + 1, y(puck) - 4, 10, 4);
      // pad and the strongman's hammer
      c.fillStyle = R[0]; c.fillRect(tx - 8, BOT(), 28, 4); c.fillRect(tx - 2, BOT() + 4, 16, H - BOT() - 4);
      const ang = phase === 'ready' ? .2 + power * 2.5 : .2, hx = tx + 34, hy = BOT() + 10;
      // drawn from whole-pixel dots so it stays crisp while it swings
      c.fillStyle = R[1]; for (let k = 0; k < 26; k += 2) c.fillRect(Math.round(hx - Math.cos(ang) * k) - 1, Math.round(hy - Math.sin(ang) * k) - 1, 3, 3);
      c.fillStyle = R[0]; c.fillRect(Math.round(hx - Math.cos(ang) * 28) - 5, Math.round(hy - Math.sin(ang) * 28) - 5, 10, 10);
      // power gauge
      c.fillStyle = R[0]; c.fillRect(W - 14, 30, 8, 82); c.fillStyle = R[2]; c.fillRect(W - 12, 32, 4, 78);
      c.fillStyle = R[0]; c.fillRect(W - 12, 32 + Math.round(78 * (1 - power)), 4, Math.round(78 * power));
      feel.end(c, W, H);
      text(c, `${score}`, 4, 3, { color: R[0] });
      for (let i = 0; i < 3 - misses; i++) { c.fillStyle = R[0]; c.fillRect(W - 8 - i * 6, 3, 4, 4); }
      if (ml > 0) text(c, msg, Math.round(W * .25), Math.round(H * .45), { align: 'center', color: R[0] });
      if (round === 1 && phase === 'ready' && !held) text(c, 'HOLD, LET GO', Math.round(W * .25), H - 12, { align: 'center', color: R[0] });
    },
    down() { if (phase === 'ready') { held = true; hold = 0; sfx(200, .1, 'triangle', .03, 120); } },
    up() {
      if (phase !== 'ready' || !held) return;
      held = false;
      if (power < .03) return;
      // strike: the puck rises to exactly "power" of the tower
      vy = Math.sqrt(2 * 2.2 * power * 1.02); puck = 0; phase = 'fly';
      feel.hit(W / 2 + 20, BOT()); haptic('heavy'); sfx(90, .12, 'square', .05);
    },
    key(k, d) { if (k === ' ' || k === 'Enter') d ? this.down() : this.up(); },
  };

  function judge() {
    const p = puck, inBand = p >= band.lo && p <= band.hi;
    if (inBand) {
      const mid = (band.lo + band.hi) / 2, near = Math.abs(p - mid) < (band.hi - band.lo) * .2;
      const pts = (near ? 3 : 2) + (band.top ? 3 : 0);
      score += pts; api.score(score); msg = band.top ? 'DING!' : near ? 'BULLSEYE' : 'PRIZE!'; ml = 1;
      if (band.top) { notes('C6 E6 G6 C7', { len: .07 }); feel.win(W / 2, TOP); } else { notes('E5 G5', { len: .06 }); feel.coin(W / 2, Math.round(BOT() - p * towerH())); }
      haptic('success');
    } else {
      misses++; msg = p > band.hi ? 'TOO HARD' : 'TOO SOFT'; ml = 1; feel.hurt(W / 2, Math.round(BOT() - p * towerH())); haptic('error'); sfx(140, .2, 'square', .04);
    }
    phase = 'fall'; vy = 0;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'hammer-bell',
  title: 'Hammer Bell',
  tag: 'Pocket · Timing',
  retro: true, pal: 'amber',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Hold to swing back; the power rises and falls. Let go so the puck stops inside the flashing band. Three misses and it is over.',
  make,
};
