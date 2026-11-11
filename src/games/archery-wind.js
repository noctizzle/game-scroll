// Archery Wind: a long-range target down the field. Drag to aim the sight; let go to shoot. The arrow
// drops on the way and the wind pushes it sideways, so aim high and into the wind; the farther the
// target, the more they matter. Your aim sways, and holding too long makes your arm shake. Ten arrows.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let aim, held, holdT, arrows, score, t, wind, dist, flight, hits, last, msg, ml, start;
  const TX = () => W / 2, TY = () => H * .4;
  const ringR = () => 110 * 30 / dist;            // target size on screen shrinks with distance

  function newEnd() {
    dist = 30 + Math.min(40, (10 - arrows) * 4) + rnd(0, 10);
    wind = rnd(-1, 1) * Math.min(1.8, 1 + (10 - arrows) * .1);
  }

  return {
    reset() { aim = { x: W / 2, y: H * .55 }; held = false; holdT = 0; arrows = 10; score = 0; t = 0; flight = null; hits = []; last = null; msg = ''; ml = 0; newEnd(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (held) holdT += dt;
      if (flight) {
        flight.k += dt / flight.dur;
        if (flight.k >= 1) {
          const { x, y } = flight, d = Math.hypot(x - TX(), y - TY()) / ringR(), ring = Math.max(0, 10 - Math.floor(d * 10));
          hits.push({ x: (x - TX()) / ringR(), y: (y - TY()) / ringR() });
          score += ring; api.score(score); msg = ring === 10 ? 'BULLSEYE!' : ring ? `${ring}` : 'Miss'; ml = 1.1;
          if (ring >= 9) { notes('C5 E5 G5 C6', { len: .05 }); feel.coin(x, y); haptic('success'); }
          else if (ring) { sfx(300, .06, 'square', .04); haptic('medium'); feel.hit(x, y, { power: .4 }); }
          else { haptic('warning'); }
          flight = null; arrows--;
          if (arrows <= 0) { api.over(); return; }
          if (arrows % 2 === 0) { newEnd(); hits = []; }
        }
      }
    },
    draw(c) {
      // sky, hills, field
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#a8dadc'); g.addColorStop(.45, '#f1faee'); g.addColorStop(.46, '#95d5b2'); g.addColorStop(1, '#2d6a4f'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#74c69d'; c.beginPath(); c.moveTo(0, H * .46); for (let x = 0; x <= W; x += 20) c.lineTo(x, H * .44 - Math.sin(x * .02) * 12); c.lineTo(W, H * .46); c.fill();
      // wind flag on a pole, and a windsock reading
      const fx = W - 50, fy = H * .2;
      c.strokeStyle = '#495057'; c.lineWidth = 3; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, H * .45); c.stroke();
      const flap = Math.sin(t * 8) * 3, len = 10 + Math.abs(wind) * 18, dir = Math.sign(wind) || 1;
      c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + dir * len, fy + 6 + flap); c.lineTo(fx, fy + 14); c.fill();
      c.fillStyle = '#1d3557'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`wind ${Math.abs(wind * 10).toFixed(0)} ${wind < 0 ? '◀' : '▶'}`, fx, fy - 8);
      c.fillText(`${dist.toFixed(0)} m`, 50, H * .2);
      feel.begin(c);
      // the target on its stand
      const tx = TX(), ty = TY(), r = ringR();
      c.fillStyle = '#6c584c'; c.fillRect(tx - r * .6, ty + r * .7, 4, r * .6 + 10); c.fillRect(tx + r * .6 - 4, ty + r * .7, 4, r * .6 + 10);
      const cols = ['#ffffff', '#ffffff', '#212529', '#212529', '#457b9d', '#457b9d', '#e63946', '#e63946', '#ffd166', '#ffd166'];
      for (let i = 0; i < 10; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(tx, ty, r * (1 - i / 10), 0, 7); c.fill(); }
      c.strokeStyle = '#00000040'; c.lineWidth = 1; for (let i = 0; i < 10; i++) { c.beginPath(); c.arc(tx, ty, r * (1 - i / 10), 0, 7); c.stroke(); }
      for (const h of hits) { c.fillStyle = '#3d2b1f'; c.beginPath(); c.arc(tx + h.x * r, ty + h.y * r, 2.5, 0, 7); c.fill(); }
      // arrow in flight, shrinking into the distance
      if (flight) { const k = flight.k, x = W / 2 + (flight.x - W / 2) * k, y = H + (flight.y - H) * k - Math.sin(k * Math.PI) * 60, s = 1 - k * .85; c.strokeStyle = '#3d2b1f'; c.lineWidth = 3 * s + 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 30 * s); c.stroke(); }
      feel.end(c, W, H);
      // the sight: sways with breath, shakes when held too long
      if (!flight) {
        const s = sight();
        c.strokeStyle = held ? '#d00000' : '#00000080'; c.lineWidth = 2; c.beginPath(); c.arc(s.x, s.y, 14, 0, 7); c.moveTo(s.x - 22, s.y); c.lineTo(s.x + 22, s.y); c.moveTo(s.x, s.y - 22); c.lineTo(s.x, s.y + 22); c.stroke();
      }
      // bow at the bottom
      c.strokeStyle = '#7f4f24'; c.lineWidth = 7; c.beginPath(); c.arc(W / 2, H + 140, 190, Math.PI * 1.32, Math.PI * 1.68); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 2; for (let i = 0; i < arrows; i++) { const x = 18 + i * 12; c.beginPath(); c.moveTo(x, H - 18); c.lineTo(x, H - 40); c.moveTo(x - 3, H - 35); c.lineTo(x, H - 40); c.lineTo(x + 3, H - 35); c.stroke(); }
      c.textAlign = 'center';
      if (ml > 0) { c.fillStyle = '#1d3557'; c.font = '800 28px Rubik, sans-serif'; c.fillText(msg, W / 2, H * .12 + 30); }
      if (t < 5 && arrows === 10) { c.fillStyle = '#fff'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Drag to aim, let go to shoot', W / 2, H - 70); c.font = '500 14px Rubik, sans-serif'; c.fillText('Aim high and into the wind', W / 2, H - 50); }
    },
    down(x, y) { if (flight) return; held = true; holdT = 0; last = { x, y }; sfx(200, .2, 'triangle', .02, 60); },
    move(x, y, pr) { if (!pr || !held || !last) return; aim.x = clamp(aim.x + (x - last.x) * .6, 0, W); aim.y = clamp(aim.y + (y - last.y) * .6, 0, H); last = { x, y }; },
    up() {
      if (!held) return; held = false; last = null;
      const s = sight();
      // drop and drift grow with distance
      const drop = dist * 1.5, drift = wind * dist * .9;
      flight = { x: s.x + drift, y: s.y + drop, k: 0, dur: .35 + dist / 160 };
      noise(.08, { vol: .05, from: 3000, to: 800 }); haptic('light');
    },
    key(k, d) { if (!d) { if (k === ' ') this.up(); return; } if (k === ' ') { if (!held) this.down(0, 0); } const m = 6; if (k === 'ArrowLeft') aim.x -= m; if (k === 'ArrowRight') aim.x += m; if (k === 'ArrowUp') aim.y -= m; if (k === 'ArrowDown') aim.y += m; },
  };

  function sight() {
    const tired = Math.max(0, holdT - 3) * 4, sway = 4 + tired;
    return { x: aim.x + Math.sin(t * 1.3) * sway + (tired ? Math.sin(t * 23) * tired * .6 : 0), y: aim.y + Math.sin(t * 1.7 + 1) * sway * .7 + (tired ? Math.cos(t * 19) * tired * .5 : 0) };
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'archery-wind',
  title: 'Archery Wind',
  tag: 'Casual · Aim',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 60,
  hint: 'Drag to aim and let go to shoot. Arrows drop and drift with the wind, more at long range, so aim high and into the wind. Ten arrows.',
  make,
};
