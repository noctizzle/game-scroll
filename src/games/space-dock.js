import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';
import { haptic } from '../kit/device.js';

// Fly your capsule into the station's docking port. Hold on the screen and the thruster pushes
// AWAY from your finger, so touch behind the ship to push it forward. Arrive slow and lined up. Fuel is limited.
const P = PAL.mono, W = 160, H = 160, MAXV = 14;

function make(api) {
  let ship, port, fuel, score, t, thrust, msg, wait, docked;
  function setup() {
    port = { x: rnd(30, 130), y: 22, drift: rnd(-6, 6) * Math.min(1, score / 3) };
    ship = { x: rnd(30, 130), y: 130, vx: rnd(-6, 6), vy: rnd(-4, 2) }; fuel = Math.max(.45, 1 - score * .05); msg = null; wait = 0; docked = false;
  }
  return {
    reset() { score = 0; t = 0; thrust = null; setup(); },
    update(dt) {
      t += dt; if (msg) msg.l -= dt;
      if (wait > 0) { wait -= dt; if (wait <= 0) { if (!docked) return api.over(); setup(); } return; }
      port.x += port.drift * dt; if (port.x < 24 || port.x > 136) port.drift *= -1;
      if (thrust && fuel > 0) {
        const dx = ship.x - thrust.x, dy = ship.y - thrust.y, d = Math.hypot(dx, dy) || 1;
        ship.vx += dx / d * 24 * dt; ship.vy += dy / d * 24 * dt; fuel = Math.max(0, fuel - dt * .12); if (Math.random() < dt * 15) haptic('tick');
      }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      if (ship.x < 4 || ship.x > W - 4 || ship.y > H - 4 || ship.y < 4) { msg = { txt: 'LOST IN SPACE', l: 2 }; haptic('error'); sfx(120, .4, 'square', .05, -40); wait = 1.4; return; }
      // contact with the station's underside
      if (ship.y - 6 <= port.y + 10) {
        const sp = Math.hypot(ship.vx, ship.vy), off = Math.abs(ship.x - port.x);
        if (off < 5 && sp < MAXV) {
          docked = true; const pts = 3 + (sp < MAXV / 2 ? 2 : 0) + Math.round(fuel * 5); score += pts; api.score(score);
          msg = { txt: sp < MAXV / 2 ? 'SOFT DOCK' : 'DOCKED', l: 1.2 }; haptic('success'); sfx(880, .25, 'square', .05, 300); wait = 1.2; ship.y = port.y + 16;
        } else { msg = { txt: off >= 5 ? 'MISSED PORT' : 'TOO FAST', l: 2 }; haptic('error'); sfx(80, .5, 'square', .06, -20); wait = 1.4; }
      }
    },
    draw(c) {
      c.fillStyle = P[0]; c.fillRect(0, 0, W, H);
      c.fillStyle = P[2]; for (let i = 0; i < 30; i++) c.fillRect((i * 53) % W, (i * 37 + 11) % H, 1, 1);
      // station
      c.fillStyle = P[2]; c.fillRect(0, port.y - 14, W, 14); c.fillStyle = P[1]; for (let x = 0; x < W; x += 12) c.fillRect(x, port.y - 12, 8, 4);
      c.fillStyle = P[3]; c.fillRect(Math.round(port.x) - 7, port.y, 14, 10); c.fillStyle = P[0]; c.fillRect(Math.round(port.x) - 4, port.y + 4, 8, 6);
      c.fillStyle = P[1]; c.fillRect(Math.round(port.x), port.y + 12, 1, 60);
      // ship
      const sx = Math.round(ship.x), sy = Math.round(ship.y);
      c.fillStyle = P[3]; c.fillRect(sx - 3, sy - 6, 6, 12); c.fillRect(sx - 1, sy - 8, 2, 2); c.fillRect(sx - 5, sy + 2, 2, 4); c.fillRect(sx + 3, sy + 2, 2, 4);
      if (thrust && fuel > 0) { const dx = thrust.x - ship.x, dy = thrust.y - ship.y, d = Math.hypot(dx, dy) || 1; c.fillStyle = P[2]; for (let k = 1; k < 4; k++) c.fillRect(Math.round(ship.x + dx / d * (7 + k * 3)), Math.round(ship.y + dy / d * (7 + k * 3)), 2, 2); }
      // speed + fuel bars at the bottom
      const sp = Math.hypot(ship.vx, ship.vy);
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[3]; c.fillText('SPD', 4, 150); c.fillText('FUEL', 80, 150);
      c.fillStyle = P[1]; c.fillRect(26, 145, 46, 5); c.fillStyle = sp > MAXV ? P[3] : P[2]; c.fillRect(26, 145, Math.min(46, sp / (MAXV * 2) * 46), 5); c.fillStyle = P[3]; c.fillRect(26 + 23, 143, 1, 9);
      c.fillStyle = P[1]; c.fillRect(110, 145, 46, 5); c.fillStyle = P[3]; c.fillRect(110, 145, 46 * fuel, 5);
      if (msg && msg.l > 0) { c.fillStyle = P[3]; c.textAlign = 'center'; c.fillText(msg.txt, 80, 90); }
      if (t < 5 && score === 0) { c.fillStyle = P[2]; c.textAlign = 'center'; c.fillText('HOLD BEHIND TO PUSH', 80, 104); }
    },
    down(x, y) { thrust = { x, y }; },
    move(x, y) { if (thrust) thrust = { x, y }; },
    up() { thrust = null; },
    key(k, d) { if (k === ' ') thrust = d ? { x: ship.x - (port.x - ship.x) * .2, y: ship.y + 30 } : null; },
  };
}

export default {
  id: 'space-dock', title: 'Space Docking', tag: 'Pocket · Skill', retro: true, w: W, h: H, pal: 'mono', goal: 20,
  hint: 'Hold the screen and the ship thrusts away from your finger, so touch below it to go up. Line up under the port and arrive gently. Watch your speed and fuel.',
  make,
};
