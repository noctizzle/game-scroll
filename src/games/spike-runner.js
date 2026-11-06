import { rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// You run along the floor or the ceiling of a tunnel. Tap to flip gravity and fall to the other side.
// Spikes line both surfaces, so flip at the right moment. You can only flip while touching a surface.
const P = PAL.ice, W = 160, H = 160, TOPY = 24, BOTY = 136, PX = 36, G = 900;

function make(api) {
  let y, vy, grav, onSurf, spikes, dist, speed, t, nextAt, score, trail;
  const self = {
    reset() { y = BOTY - 8; vy = 0; grav = 1; onSurf = true; spikes = []; dist = 0; speed = 60; t = 0; nextAt = 120; score = 0; trail = []; },
    update(dt) {
      t += dt; speed = Math.min(130, 60 + dist / 40); const dx = speed * dt; dist += dx;
      const s = Math.floor(dist / 20); if (s !== score) { score = s; api.score(score); }
      if (dist > nextAt) {
        const side = Math.random() < .5 ? 'top' : 'bot', len = rnd(10, 22 + Math.min(30, dist / 80));
        spikes.push({ x: W + 10, len, side });
        // sometimes a matching spike on the other side, leaving a gap you must flip through
        if (dist > 500 && Math.random() < .35) spikes.push({ x: W + 10 + len + rnd(26, 40), len: rnd(10, 18), side: side === 'top' ? 'bot' : 'top' });
        nextAt = dist + rnd(50, 90) * (1 - Math.min(.35, dist / 6000));
      }
      for (const sp of spikes) sp.x -= dx; spikes = spikes.filter(sp => sp.x + sp.len > -5);
      if (!onSurf) {
        vy += G * grav * dt; y += vy * dt;
        if (grav > 0 && y >= BOTY - 8) { y = BOTY - 8; vy = 0; onSurf = true; haptic('light'); sfx(220, .03, 'square', .03); }
        if (grav < 0 && y <= TOPY) { y = TOPY; vy = 0; onSurf = true; haptic('light'); sfx(260, .03, 'square', .03); }
      }
      trail.push(y); if (trail.length > 8) trail.shift();
      for (const sp of spikes) {
        if (PX + 5 < sp.x || PX > sp.x + sp.len) continue;
        if ((sp.side === 'bot' && y + 8 > BOTY - 6) || (sp.side === 'top' && y < TOPY + 6)) { haptic('error'); sfx(110, .4, 'square', .05, -40); return api.over(); }
      }
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[1]; c.fillRect(0, 0, W, TOPY); c.fillRect(0, BOTY, W, H - BOTY);
      c.fillStyle = P[2]; for (let x = -(dist % 16); x < W; x += 16) { c.fillRect(x, TOPY - 3, 8, 1); c.fillRect(x + 8, BOTY + 2, 8, 1); }
      c.fillStyle = P[0];
      for (const sp of spikes) for (let x = 0; x < sp.len; x += 5) {
        const sx = Math.round(sp.x + x);
        if (sp.side === 'bot') { c.beginPath(); c.moveTo(sx, BOTY); c.lineTo(sx + 2.5, BOTY - 7); c.lineTo(sx + 5, BOTY); c.fill(); }
        else { c.beginPath(); c.moveTo(sx, TOPY); c.lineTo(sx + 2.5, TOPY + 7); c.lineTo(sx + 5, TOPY); c.fill(); }
      }
      c.fillStyle = P[2]; trail.forEach((ty, i) => c.fillRect(PX - (trail.length - i) * 3, Math.round(ty) + 2, 2, 4));
      const yy = Math.round(y), legs = onSurf ? ((t * 12 | 0) % 2) : 0;
      c.fillStyle = P[0]; c.fillRect(PX, yy, 6, 8);
      c.fillStyle = P[3]; c.fillRect(PX + 3, grav > 0 ? yy + 2 : yy + 4, 2, 2);
      c.fillStyle = P[0]; if (grav > 0) { c.fillRect(PX + legs, yy + 8, 2, 1); c.fillRect(PX + 4 - legs, yy + 8, 2, 1); } else { c.fillRect(PX + legs, yy - 1, 2, 1); c.fillRect(PX + 4 - legs, yy - 1, 2, 1); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[3]; if (t < 4) c.fillText('TAP TO FLIP', 4, 150);
    },
    down() { if (!onSurf) return; grav = -grav; onSurf = false; vy = 0; haptic('tick'); sfx(grav > 0 ? 400 : 600, .05, 'square', .03, grav > 0 ? -200 : 200); },
    key(k, d) { if (d && k === ' ') self.down(); },
  };
  return self;
}

export default {
  id: 'spike-runner', title: 'Gravity Runner', tag: 'Pocket · Action', retro: true, w: W, h: H, pal: 'ice', goal: 60,
  hint: 'Tap to flip gravity and fall to the ceiling (or back to the floor). Dodge the spikes on both sides. You can only flip while your feet touch a surface.',
  make,
};
