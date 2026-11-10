// Buzz Wire: a wiggly wire runs up through the loop you hold. Slide your finger left and right to keep
// the loop round the wire as it scrolls. Touch the wire and it buzzes and sparks; too many sparks and
// the fuse blows. The wire gets wigglier and the loop tighter as you go.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, bed } = gs.sound;
const { clamp } = gs.util;
const { approach } = gs.juice;
const { noise2 } = gs.math;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let x, target, dist, score, fuse, t, touching, speed, hum, sparks, held;
  const wire = y => W / 2 + noise2(y * .0035, 1.7) * W * .32 + Math.sin(y * .011) * W * .06 * Math.min(1, dist / 3000);
  const loopY = () => H * .72;
  const gapNow = () => Math.max(16, 40 - dist / 400);

  return {
    reset() { x = W / 2; target = null; dist = 0; score = 0; fuse = 1; t = 0; touching = 0; speed = 70; sparks = []; held = false; hum = null; feel.clear(); x = wire(0); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (!hum) hum = bed({ vol: 0, from: 120, filter: 'lowpass' });
      if (!held && dist < 1) return;
      speed = 70 + Math.min(110, dist / 60);
      dist += speed * dt;
      if (target != null) x = approach(x, target, 18, dt);
      const wy = dist, wx = wire(wy), gap = gapNow();
      const off = Math.abs(x - wx);
      if (off > gap) {
        touching += dt; fuse -= dt * .55;
        if (Math.random() < dt * 30) { sparks.push({ x: x + Math.sign(wx - x) * gap, y: loopY(), vx: (Math.random() - .5) * 200, vy: -Math.random() * 200, l: .4 }); haptic('tick'); }
        hum?.set({ vol: .07, from: 900 }, .05);
        if (fuse <= 0) { feel.boom(x, loopY(), { size: 1 }); feel.lose(); hum?.set({ vol: 0 }, .1); return api.over(); }
      } else { touching = 0; hum?.set({ vol: 0 }, .1); fuse = Math.min(1, fuse + dt * .04); }
      const s = Math.floor(dist / 100); if (s > score) { score = s; api.score(score); if (score % 10 === 0) { feel.juice.pop(W / 2, H * .3, `${score}!`, { color: '#ffd166' }); sfx(900, .1, 'triangle', .04, 300); } }
      for (const p of sparks) { p.l -= dt; p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; } sparks = sparks.filter(p => p.l > 0);
    },
    draw(c) {
      c.fillStyle = '#1b263b'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#22304a'; for (let y = -(dist % 40); y < H; y += 40) c.fillRect(0, y, W, 1);
      feel.begin(c);
      // the wire: world y = dist + (loopY - screenY)
      c.strokeStyle = '#c9a227'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath();
      for (let sy = -10; sy <= H + 10; sy += 6) { const wy = dist + (loopY() - sy), wx = wire(wy); sy < -5 ? c.moveTo(wx, sy) : c.lineTo(wx, sy); }
      c.stroke();
      c.strokeStyle = '#f4e285'; c.lineWidth = 2; c.stroke();
      // start and finish posts
      if (dist < H) { c.fillStyle = '#6c757d'; c.fillRect(wire(0) - 18, loopY() + dist, 36, 14); }
      // the loop on its handle
      const gap = gapNow(), ly = loopY(), hot = touching > 0;
      c.strokeStyle = '#adb5bd'; c.lineWidth = 8; c.beginPath(); c.moveTo(x, ly + gap); c.lineTo(x, H + 20); c.stroke();
      c.strokeStyle = hot ? '#ff4d6d' : '#e9ecef'; c.lineWidth = 5; c.beginPath(); c.ellipse(x, ly, gap + 4, 12, 0, 0, 7); c.stroke();
      for (const p of sparks) { c.fillStyle = '#ffd166'; c.globalAlpha = p.l * 2.5; c.fillRect(p.x - 2, p.y - 2, 4, 4); } c.globalAlpha = 1;
      if (hot) { c.fillStyle = '#ff4d6d20'; c.fillRect(0, 0, W, H); }
      feel.end(c, W, H);
      // fuse
      c.fillStyle = '#ffffff20'; c.fillRect(20, H - 30, W - 40, 10); c.fillStyle = fuse < .3 ? '#ff4d6d' : '#06d6a0'; c.fillRect(20, H - 30, (W - 40) * fuse, 10);
      c.fillStyle = '#ffffffb0'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('FUSE', 20, H - 36);
      if (dist < 1) { c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = '700 18px Rubik, sans-serif'; c.fillText('Hold and slide to steer the loop', W / 2, H * .35); c.font = '500 14px Rubik, sans-serif'; c.fillText("Don't touch the wire", W / 2, H * .35 + 24); }
    },
    down(px) { held = true; target = px; },
    move(px, py, p) { if (p) target = px; },
    up() { },
    key(k, d) { if (!d) return; held = true; if (k === 'ArrowLeft') target = (target ?? x) - 20; if (k === 'ArrowRight') target = (target ?? x) + 20; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'buzz-wire',
  title: 'Buzz Wire',
  tag: 'Casual · Skill',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 60,
  hint: 'Slide your finger to keep the loop round the wiggly wire as it scrolls. Touching it buzzes and burns the fuse.',
  make,
};
