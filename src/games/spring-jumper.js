import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;

// Bounce along rooftops on a pogo stick. You hop forward on your own; hold to squeeze the spring
// and let go for a bigger jump. Wide gaps need big jumps, and too big overshoots short roofs.
const P = PAL.mint, W = 160, H = 160, G = 420, PX = 40, RUN = 46;

function make(api) {
  let roofs, y, vy, onRoof, charge, holding, dist, t, score, squash, dead;
  function addRoof() {
    const last = roofs[roofs.length - 1], gap = rnd(12, 20 + Math.min(36, dist / 50)), w = rnd(26, 60);
    roofs.push({ x: last.x + last.w + gap, w, y: clamp(last.y + rnd(-22, 22), 70, 135) });
  }
  return {
    reset() { roofs = [{ x: 0, w: 90, y: 120 }]; dist = 0; for (let i = 0; i < 6; i++) addRoof(); y = 120; vy = 0; onRoof = true; charge = 0; holding = false; t = 0; score = 0; squash = 0; dead = 0; },
    update(dt) {
      t += dt; squash = Math.max(0, squash - dt * 4);
      if (onRoof) {
        if (holding) { charge = Math.min(1, charge + dt * 1.4); if ((charge * 10 | 0) !== ((charge - dt * 1.4) * 10 | 0)) haptic('tick'); }
        else { vy = -(110 + charge * 150); onRoof = false; sfx(300 + charge * 400, .08, 'square', .03, 300); charge = 0; }
      }
      // the world scrolls while airborne (you always hop forward)
      if (!onRoof) {
        const dx = RUN * dt * (1 + Math.min(1, dist / 1500)); dist += dx; for (const r of roofs) r.x -= dx;
        const prevY = y; vy += G * dt; y += vy * dt;
        const r = roofs.find(q => PX + 3 > q.x && PX - 3 < q.x + q.w);
        if (r && vy > 0 && prevY <= r.y && y >= r.y) {
          y = r.y; vy = 0; onRoof = true; squash = 1; haptic('light'); sfx(200, .04, 'square', .03);
          if (!r.counted) { r.counted = true; score++; api.score(score); }
        }
        if (r && y > r.y + 2 && prevY > r.y - 1 && Math.abs(PX - r.x) < 4) { /* hit the wall */ vy = Math.max(vy, 60); }
        if (y > H + 10) { haptic('error'); sfx(120, .4, 'square', .05, -40); return api.over(); }
      }
      roofs = roofs.filter(q => q.x + q.w > -10); while (roofs.length < 7) addRoof();
    },
    fx(dt) { vy += G * dt; y = Math.min(H + 20, y + vy * dt); },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[2]; for (let i = 0; i < 8; i++) { const x = ((i * 31 - dist * .3) % 200 + 200) % 200 - 20; c.fillRect(x, 60 + (i % 3) * 10, 14, 100); }
      for (const r of roofs) { c.fillStyle = P[0]; c.fillRect(Math.round(r.x), r.y, Math.round(r.w), H - r.y); c.fillStyle = P[1]; c.fillRect(Math.round(r.x), r.y, Math.round(r.w), 2); for (let wy = r.y + 8; wy < H; wy += 10) for (let wx = r.x + 4; wx < r.x + r.w - 4; wx += 8) c.fillRect(Math.round(wx), wy, 3, 4); }
      const sq = onRoof ? charge * 6 + squash * 2 : 0, top = Math.round(y) - 22 + sq;
      c.fillStyle = P[0]; c.fillRect(PX - 1, Math.round(y) - 10 + sq * .5, 2, 10 - sq * .5);
      c.fillStyle = P[1]; for (let k = 0; k < 3; k++) c.fillRect(PX - 2, Math.round(y) - 9 + k * 3, 4, 1);
      c.fillStyle = P[0]; c.fillRect(PX - 4, Math.round(y) - 12 + sq * .5, 8, 2);
      c.fillRect(PX - 3, top, 6, 8); c.fillRect(PX - 2, top - 5, 4, 4); c.fillStyle = P[3]; c.fillRect(PX, top - 4, 1, 1);
      if (onRoof && holding) {   // landing preview: dotted arc of the jump you'd get if you let go now
        const sp = RUN * (1 + Math.min(1, dist / 1500)); let px = PX, py = y, pv = -(110 + charge * 150); c.fillStyle = P[1];
        for (let k = 0; k < 40 && py < H; k++) { const h = 1 / 30; px += sp * h; pv += G * h; py += pv * h; if (k % 2) c.fillRect(Math.round(px), Math.round(py) - 6, 1, 1); }
      }
      if (onRoof && charge > 0) { c.fillStyle = P[0]; c.fillRect(PX - 8, top - 12, 16, 3); c.fillStyle = P[2]; c.fillRect(PX - 7, top - 11, Math.round(14 * charge), 1); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[0]; if (t < 4) { c.fillStyle = P[3]; c.fillText('HOLD = BIGGER JUMP', 4, 154); }
    },
    down() { holding = true; },
    up() { holding = false; },
    key(k, d) { if (k === ' ') holding = d; },
  };
}

export default {
  id: 'spring-jumper', title: 'Spring Jumper', tag: 'Pocket · Timing', retro: true, w: W, h: H, pal: 'mint', goal: 30,
  hint: 'You hop forward by yourself. Hold to squeeze the spring for a bigger jump and let go to launch. The dotted arc shows where you will land. Read each gap and land on the next roof.',
  make,
};
