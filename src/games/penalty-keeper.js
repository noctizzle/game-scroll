import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// You're in goal. Read the striker's run-up and tap where the ball is going to dive there.
// Shots get faster, and later strikers sometimes fake their angle. Three goals against and you're out.
const W = 360, H = 640, GX = 30, GY = 400, GW = 300, GH = 150, REACH = 46;

function make(api) {
  let saves, conceded, shot, keeper, phase, wait, msg, t, striker, net;
  function nextShot() {
    const side = Math.random() < .5 ? -1 : 1, fake = saves >= 5 && Math.random() < .25;
    const tx = W / 2 + side * rnd(40, GW / 2 - 18) * (Math.random() < .15 ? 0 : 1), ty = rnd(GY + 20, GY + GH - 20);
    // The striker approaches from the opposite side to where they'll shoot (unless it's a fake).
    striker = { x: W / 2 - side * (fake ? -1 : 1) * 60, y: 140, run: 0 };
    shot = { tx, ty, k: 0, dur: Math.max(.42, .95 - saves * .035), curve: rnd(-30, 30) };
    keeper = { x: W / 2, y: GY + GH - 50, tx: W / 2, ty: GY + GH - 50, dive: 0 };
    phase = 'runup'; wait = rnd(.9, 1.4);
  }
  return {
    reset() { saves = 0; conceded = 0; msg = null; t = 0; net = 0; nextShot(); },
    update(dt) {
      t += dt; if (msg) msg.life -= dt; net = Math.max(0, net - dt * 2);
      const k = keeper; const dx = k.tx - k.x, dy = k.ty - k.y, d = Math.hypot(dx, dy), step = 900 * dt;
      if (d > step) { k.x += dx / d * step; k.y += dy / d * step; } else { k.x = k.tx; k.y = k.ty; }
      if (phase === 'runup') {
        wait -= dt; striker.run += dt; striker.x += (W / 2 - striker.x) * dt * 1.6; striker.y += (205 - striker.y) * dt * 1.6;
        if (wait <= 0) { phase = 'shot'; sfx(90, .1, 'triangle', .07); haptic('light'); }
      } else if (phase === 'shot') {
        shot.k += dt / shot.dur;
        if (shot.k >= 1) {
          const hands = Math.hypot(k.x - shot.tx, (k.y - 20) - shot.ty);
          if (hands < REACH || Math.hypot(k.x - shot.tx, k.y + 20 - shot.ty) < REACH - 10) {
            saves++; api.score(saves); msg = { txt: hands < 22 ? 'CAUGHT!' : 'SAVED', life: 1, good: true }; haptic('success'); sfx(500, .12, 'triangle', .06, 200);
          } else {
            conceded++; net = 1; msg = { txt: 'GOAL', life: 1, good: false }; haptic('error'); sfx(150, .4, 'sawtooth', .04, -40);
          }
          phase = 'after'; wait = .9;
        }
      } else if (phase === 'after') { wait -= dt; if (wait <= 0) { if (conceded >= 3) return api.over(); nextShot(); } }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d5c34'); g.addColorStop(1, '#2f8a4c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff12'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 80, W, 40);
      c.strokeStyle = '#ffffffaa'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 230); c.lineTo(W, 230); c.stroke(); c.beginPath(); c.arc(W / 2, 215, 3, 0, 7); c.fillStyle = '#fff'; c.fill();
      // striker (small, far away)
      const s = striker, legs = Math.sin(s.run * 18) * 4;
      c.fillStyle = '#ff5050'; c.fillRect(s.x - 6, s.y - 26, 12, 16); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(s.x, s.y - 31, 5, 0, 7); c.fill();
      c.strokeStyle = '#202040'; c.lineWidth = 3; c.beginPath(); c.moveTo(s.x - 3, s.y - 10); c.lineTo(s.x - 3 + legs, s.y); c.moveTo(s.x + 3, s.y - 10); c.lineTo(s.x + 3 - legs, s.y); c.stroke();
      // goal: net behind
      c.strokeStyle = '#ffffff40'; c.lineWidth = 1; const sway = net * 6 * Math.sin(t * 25);
      for (let x = GX; x <= GX + GW; x += 15) { c.beginPath(); c.moveTo(x, GY); c.lineTo(x + sway, GY + GH); c.stroke(); }
      for (let y = GY; y <= GY + GH; y += 15) { c.beginPath(); c.moveTo(GX, y + sway); c.lineTo(GX + GW, y + sway); c.stroke(); }
      c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.beginPath(); c.moveTo(GX, GY + GH + 10); c.lineTo(GX, GY); c.lineTo(GX + GW, GY); c.lineTo(GX + GW, GY + GH + 10); c.stroke();
      // ball
      let bx = W / 2, by = 215, br = 5;
      if (phase !== 'runup') { const k = Math.min(1, shot.k); bx = W / 2 + (shot.tx - W / 2) * k + Math.sin(k * Math.PI) * shot.curve; by = 215 + (shot.ty - 215) * k - Math.sin(k * Math.PI) * 50; br = 5 + k * 13; }
      const ballBehind = phase === 'after' && msg && !msg.good;
      const drawBall = () => { c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(bx + br * .2, by - br * .1, br * .35, 0, 7); c.fill(); };
      if (ballBehind) drawBall();
      // keeper (from behind, big)
      const k = keeper, lean = clamp((k.x - W / 2) / 120, -1, 1);
      c.save(); c.translate(k.x, k.y); c.rotate(lean * .7);
      c.fillStyle = '#ffd34a'; c.fillRect(-18, -30, 36, 46); c.fillStyle = '#202040'; c.fillRect(-16, 16, 32, 18);
      c.fillStyle = '#5a3a22'; c.beginPath(); c.arc(0, -42, 13, 0, 7); c.fill();
      c.strokeStyle = '#ffd34a'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-16, -24); c.lineTo(-36, -52); c.moveTo(16, -24); c.lineTo(36, -52); c.stroke();
      c.fillStyle = '#4ad3ff'; c.beginPath(); c.arc(-38, -56, 9, 0, 7); c.arc(38, -56, 9, 0, 7); c.fill(); c.lineCap = 'butt';
      c.restore();
      if (!ballBehind) drawBall();
      c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#ffffffcc'; c.fillText('GOALS', 12, 22);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < conceded ? '#ff5050' : '#ffffff40'; c.beginPath(); c.arc(20 + i * 18, 38, 6, 0, 7); c.fill(); }
      if (t < 4 && saves === 0) { c.fillStyle = '#ffffffcc'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('tap where the ball is going to dive', W / 2, H - 40); }
      if (msg && msg.life > 0) { c.globalAlpha = clamp(msg.life * 2, 0, 1); c.fillStyle = msg.good ? '#ffd34a' : '#ff6060'; c.font = '400 22px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 330); c.globalAlpha = 1; }
    },
    down(x, y) {
      if (phase === 'after' || keeper.dive) return;
      keeper.dive = 1; keeper.tx = clamp(x, GX + 10, GX + GW - 10); keeper.ty = clamp(y + 40, GY + 50, GY + GH + 10);
      haptic('medium'); sfx(200, .08, 'triangle', .05, -60);
    },
    key(k, d) { if (!d || keeper.dive) return; const dir = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0; if (k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ') { keeper.dive = 1; keeper.tx = W / 2 + dir * 110; } },
  };
}

export default {
  id: 'penalty-keeper', title: 'Penalty Keeper', tag: 'Casual · Sports', retro: false, w: W, h: H, goal: 8,
  hint: 'You are the keeper. Watch which way the striker runs in, then tap where the ball will go to dive. You only get one dive per shot.',
  make,
};
