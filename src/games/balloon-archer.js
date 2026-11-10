// Balloon Archer: balloons drift up across the field. Pull back anywhere to draw the bow (the dotted
// arc shows the shot), let go to loose an arrow. Arrows fly through balloons, so line them up: a shot
// that pops two or more wins arrows back. Run out of arrows and it's over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;
const { clamp } = gs.util;

const R = PAL.amber;
let W = 160, H = 160;
const G = 160;

function make(api) {
  const feel = new Feel({ pixel: true });
  let arrows, quiver, balloons, aim, score, t, spawn, end, bow;

  return {
    reset() { arrows = []; quiver = 12; balloons = []; aim = null; score = 0; t = 0; spawn = .3; end = 0; bow = { x: 16, y: H - 34 }; feel.clear(); },
    resize(w, h) { W = w; H = h; bow = { x: 16, y: H - 34 }; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(.45, 1.3 - t / 60);
        const k = Math.random(), x = 50 + Math.random() * (W - 60);
        balloons.push({ x, y: H + 8, vy: -(14 + Math.random() * 10 + t * .2), wob: Math.random() * 6, kind: k < .1 ? 'gold' : k < .22 ? 'bomb' : 'red' });
      }
      for (const b of balloons) { b.y += b.vy * dt; b.x += Math.sin(t * 1.5 + b.wob) * 6 * dt; }
      balloons = balloons.filter(b => b.y > -12 && !b.popped);
      for (const a of arrows) {
        a.vy += G * dt; a.x += a.vx * dt; a.y += a.vy * dt;
        for (const b of balloons) if (!b.popped && Math.abs(a.x - b.x) < 5 && Math.abs(a.y - b.y) < 6) {
          b.popped = true;
          if (b.kind === 'bomb') { quiver = Math.max(0, quiver - 2); feel.boom(Math.round(b.x), Math.round(b.y), { size: .6 }); feel.juice.pop(b.x, b.y - 8, '-2', { color: R[0] }); haptic('error'); continue; }
          a.hits++; const pts = b.kind === 'gold' ? 3 : 1; score += pts * a.hits; api.score(score);
          feel.juice.burst(b.x, b.y, { n: 8, speed: 50, size: 2, color: [R[0], R[1]], gravity: 60 }).pop(b.x, b.y - 8, `+${pts * a.hits}`, { color: R[0] });
          sfx(800 + a.hits * 200, .06, 'square', .04, -300); haptic(a.hits > 1 ? 'medium' : 'light');
          if (b.kind === 'gold') { quiver += 2; feel.juice.pop(b.x, b.y - 16, '+2 ARROWS', { color: R[1] }); }
        }
        if (a.y > H || a.x > W + 10 || a.y < -60 && a.vy > 0) { a.gone = true; if (a.hits >= 2) { quiver += a.hits - 1; feel.juice.pop(W / 2, 30, `MULTI x${a.hits}!`, { color: R[0] }); sounds.powerup(); } }
      }
      arrows = arrows.filter(a => !a.gone);
      if (quiver <= 0 && !arrows.length && !aim) { end += dt; if (end > .6) { feel.lose(); api.over(); } }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let i = 0; i < 5; i++) { const x = ((i * 47 - t * 4) % (W + 30) + W + 30) % (W + 30) - 20; c.fillRect(Math.round(x), 16 + i * 9, 16, 3); }
      c.fillStyle = R[2]; c.fillRect(0, H - 18, W, 18); c.fillStyle = R[1]; for (let x = 0; x < W; x += 6) c.fillRect(x, H - 18, 3, 2);
      feel.begin(c);
      for (const b of balloons) {
        const x = Math.round(b.x), y = Math.round(b.y);
        c.fillStyle = R[1]; c.fillRect(x, y + 6, 1, 6);
        c.fillStyle = b.kind === 'bomb' ? R[0] : b.kind === 'gold' ? R[2] : R[1];
        c.fillRect(x - 3, y - 5, 7, 10); c.fillRect(x - 4, y - 3, 9, 6);
        c.fillStyle = b.kind === 'gold' ? R[0] : R[3]; c.fillRect(x - 2, y - 3, 2, 2);
        if (b.kind === 'bomb') { c.fillStyle = R[3]; c.fillRect(x - 1, y - 1, 3, 1); c.fillRect(x, y - 2, 1, 3); }
        if (b.kind === 'gold') { c.fillStyle = R[0]; c.fillRect(x - 4, y - 6, 9, 1); }
      }
      // the archer and bow
      const ang = aim ? aim.a : -.6, pull = aim ? aim.p : 0;
      c.fillStyle = R[0]; c.fillRect(bow.x - 6, bow.y - 2, 5, 12); c.fillRect(bow.x - 6, bow.y - 8, 5, 5); c.fillRect(bow.x - 7, bow.y + 10, 3, 6); c.fillRect(bow.x - 3, bow.y + 10, 3, 6);
      for (let i = -6; i <= 6; i++) { const a = ang + i * .18; c.fillRect(Math.round(bow.x + Math.cos(a) * 7), Math.round(bow.y + Math.sin(a) * 7), 1, 1); }
      const sx = Math.round(bow.x - Math.cos(ang) * pull * 6), sy = Math.round(bow.y - Math.sin(ang) * pull * 6);
      c.fillStyle = R[1]; for (const e of [-1, 1]) { const ex = bow.x + Math.cos(ang + e * 1.08) * 7, ey = bow.y + Math.sin(ang + e * 1.08) * 7; for (let k = 0; k <= 6; k++) c.fillRect(Math.round(ex + (sx - ex) * k / 6), Math.round(ey + (sy - ey) * k / 6), 1, 1); }
      if (aim) {
        // dotted flight path
        let x = bow.x, y = bow.y, vx = Math.cos(ang) * aim.v, vy = Math.sin(ang) * aim.v;
        c.fillStyle = R[1]; for (let i = 0; i < 26; i++) { for (let k = 0; k < 3; k++) { vy += G * .02; x += vx * .02; y += vy * .02; } if (i % 2 === 0) c.fillRect(Math.round(x), Math.round(y), 1, 1); }
      }
      for (const a of arrows) { const an = Math.atan2(a.vy, a.vx); c.fillStyle = R[0]; for (let k = 0; k < 8; k++) c.fillRect(Math.round(a.x - Math.cos(an) * k), Math.round(a.y - Math.sin(an) * k), 1, 1); c.fillRect(Math.round(a.x) - 1, Math.round(a.y) - 1, 2, 2); }
      feel.end(c, W, H);
      text(c, 'ARROWS', 4, 4, { color: R[0] });
      c.fillStyle = R[0]; for (let i = 0; i < Math.min(quiver, 16); i++) c.fillRect(32 + i * 3, 3, 1, 6);
      if (t < 3.5) text(c, 'PULL BACK, LET GO', W / 2 + 10, H / 2, { align: 'center', color: R[0] });
    },
    down(x, y) { if (quiver <= 0) return; aim = { x0: x, y0: y, a: -.6, p: 0, v: 0 }; sfx(300, .03, 'square', .02); },
    move(x, y, p) {
      if (!p || !aim) return;
      const dx = aim.x0 - x, dy = aim.y0 - y, d = Math.hypot(dx, dy);
      if (d > 3) aim.a = clamp(Math.atan2(dy, dx), -1.5, .5);
      aim.p = clamp(d / 40, 0, 1); aim.v = 70 + aim.p * 160;
      if (Math.random() < .2) haptic('tick');
    },
    up() {
      if (!aim) return;
      if (aim.p > .15 && quiver > 0) { quiver--; arrows.push({ x: bow.x, y: bow.y, vx: Math.cos(aim.a) * aim.v, vy: Math.sin(aim.a) * aim.v, hits: 0 }); sfx(900, .08, 'triangle', .04, -500); haptic('light'); }
      aim = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'balloon-archer',
  title: 'Balloon Archer',
  tag: 'Pocket · Aim',
  retro: true, pal: 'amber',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 40,
  hint: 'Pull back and let go to shoot an arrow along the dotted arc. Pop two balloons with one arrow to win arrows back. Avoid the dark bombs.',
  make,
};
