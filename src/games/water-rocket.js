import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// Pump up a bottle rocket and launch it. More pressure flies higher, but every bottle has a burst
// point you can only feel (the pump gets stiff and the phone rumbles). Drag to steer through rings. Three launches.
const W = 360, H = 640, LAUNCHES = 3;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let psi, burstAt, phase, rocket, cam, best, total, n, t, rings, pumpAnim, drag, msg, water;
  function pad() { psi = 0; burstAt = rnd(.72, 1); phase = 'pump'; rocket = { x: W / 2, y: 0, vy: 0, vx: 0 }; cam = 0; rings = []; for (let i = 1; i < 30; i++) rings.push({ x: rnd(70, W - 70), y: i * 140 + rnd(-30, 30), got: false }); pumpAnim = 0; water = []; }
  function launch() {
    if (phase !== 'pump' || psi < .08) return; phase = 'fly'; rocket.vy = 300 + psi * 1300; haptic('heavy'); sfx(150, .6, 'sawtooth', .06, 400); feel.juice.shake(3 + psi * 5);
  }
  return {
    reset() { total = 0; n = 0; t = 0; best = 0; msg = null; drag = null; feel.clear(); pad(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; pumpAnim = Math.max(0, pumpAnim - dt * 4); if (msg) msg.l -= dt;
      if (phase === 'fly') {
        const fuel = rocket.y < 60 + psi * 140; rocket.vy += (fuel ? 600 : -900) * dt; rocket.vy *= Math.pow(.92, dt);
        if (drag) rocket.vx += clamp((drag.x - W / 2) * 3, -500, 500) * dt; rocket.vx *= Math.pow(.3, dt);
        rocket.y += rocket.vy * dt; rocket.x = clamp(rocket.x + rocket.vx * dt, 20, W - 20);
        if (fuel) water.push({ x: rocket.x, y: rocket.y, vy: -200, l: .5 });
        cam = Math.max(0, rocket.y - 260);
        for (const r of rings) if (!r.got && Math.abs(r.y - rocket.y) < 14 && Math.abs(r.x - rocket.x) < 34) { r.got = true; total += 5; api.score(total); haptic('success'); sfx(990, .1, 'triangle', .05, 200); feel.juice.burst(r.x, H - 90 - (r.y - cam), { n: 12, speed: 170, life: .4, size: 3.5, color: ['#ffd34a', '#ffffff'] }).pop(r.x, H - 120 - (r.y - cam), '+5', { color: '#ffd34a', size: 16 }); }
        if (rocket.vy < 0 && rocket.y <= 0) {
          const hgt = Math.round(Math.max(...[rocket.peak || 0])); total += hgt; api.score(total); n++; msg = { txt: `${hgt} m`, l: 1.4 }; phase = 'land'; rocket.y = 0; haptic('medium');
        }
        rocket.peak = Math.max(rocket.peak || 0, rocket.y / 10);
      } else if (phase === 'land' || phase === 'burst') {
        if (msg.l <= 0) { if (n >= LAUNCHES) return api.over(); pad(); }
      }
      for (const w of water) { w.vy += 400 * dt; w.y -= w.vy * dt; w.l -= dt; } water = water.filter(w => w.l > 0);
    },
    draw(c) {
      const k = clamp(cam / 3000, 0, 1); c.fillStyle = `rgb(${Math.round(140 - k * 120)},${Math.round(200 - k * 170)},${Math.round(255 - k * 155)})`; c.fillRect(0, 0, W, H);
      feel.begin(c);
      const sy = y => H - 90 - (y - cam);
      c.fillStyle = '#ffffff60'; for (let i = 0; i < 12; i++) { const yy = sy(i * 400 + 200); if (yy > -40 && yy < H) { c.beginPath(); c.ellipse((i * 97) % W, yy, 50, 16, 0, 0, 7); c.fill(); } }
      if (sy(0) < H + 20) { c.fillStyle = '#5ab84a'; c.fillRect(0, sy(0) + 30, W, 200); }
      for (const r of rings) { const yy = sy(r.y); if (yy < -30 || yy > H + 30) continue; c.strokeStyle = r.got ? '#ffffff40' : '#ffd34a'; c.lineWidth = 5; c.beginPath(); c.ellipse(r.x, yy, 34, 10, 0, 0, 7); c.stroke(); }
      for (const w of water) { c.fillStyle = '#9ad8ffaa'; c.beginPath(); c.arc(w.x + rnd(-4, 4), sy(w.y) + 30, 4, 0, 7); c.fill(); }
      const rx = rocket.x, ry = sy(rocket.y);
      c.save(); c.translate(rx, ry); c.rotate(clamp(rocket.vx / 600, -.4, .4));
      c.fillStyle = phase === 'burst' ? '#ff8080' : '#bfe8ffdd'; c.beginPath(); c.roundRect(-14, -40, 28, 60, 10); c.fill();
      c.fillStyle = '#5ab0ff'; c.fillRect(-12, -10 + (1 - psi) * 20, 24, 28 - (1 - psi) * 20);
      c.fillStyle = '#ff5a5a'; c.beginPath(); c.moveTo(-14, -34); c.lineTo(0, -60); c.lineTo(14, -34); c.fill();
      c.beginPath(); c.moveTo(-14, 6); c.lineTo(-26, 26); c.lineTo(-14, 20); c.fill(); c.beginPath(); c.moveTo(14, 6); c.lineTo(26, 26); c.lineTo(14, 20); c.fill();
      c.restore();
      if (phase === 'pump') {
        c.fillStyle = '#555'; c.fillRect(260, sy(0) - 40 + pumpAnim * 20, 40, 8); c.fillRect(276, sy(0) - 32 + pumpAnim * 20, 8, 50); c.fillRect(266, sy(0) + 18, 28, 14);
        c.strokeStyle = '#333'; c.lineWidth = 3; c.beginPath(); c.moveTo(280, sy(0) + 25); c.quadraticCurveTo(230, sy(0) + 40, rx, sy(0) + 22); c.stroke();
        c.fillStyle = '#00000040'; c.fillRect(20, 120, 20, 300); c.fillStyle = psi > .7 ? '#ff7a3d' : '#5ad17a'; c.fillRect(20, 420 - 300 * psi, 20, 300 * psi);
        c.fillStyle = '#fff'; c.font = '400 8px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText('PSI', 18, 110);
        c.fillStyle = '#ff5a5a'; c.beginPath(); c.roundRect(100, 560, 160, 56, 14); c.fill(); c.fillStyle = '#fff'; c.font = '400 12px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('LAUNCH', 180, 594);
        c.font = '600 13px Rubik, sans-serif'; c.fillText('tap the pump to add pressure', W / 2, 545);
      }
      feel.end(c, W, H);
      c.fillStyle = '#ffffffcc'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'right'; c.fillText(`ROCKET ${Math.min(n + 1, LAUNCHES)}/${LAUNCHES}`, W - 12, 22);
      if (phase === 'fly') { c.textAlign = 'left'; c.fillText(`${Math.round(rocket.y / 10)} m`, 12, 22); }
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = '#fff'; c.font = '400 20px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 260); c.globalAlpha = 1; }
    },
    down(x, y) {
      if (phase === 'fly') { drag = { x }; return; }
      if (phase !== 'pump') return;
      if (y > 556 && y < 620 && x > 96 && x < 264) return launch();
      // pump: pressure rises, getting stiffer near the limit
      psi = Math.min(1.05, psi + .05 * (1 - psi * .4)); pumpAnim = 1; sfx(200 + psi * 300, .08, 'sine', .04, 80);
      haptic(psi > burstAt - .12 ? 'heavy' : psi > burstAt - .25 ? 'medium' : 'light');
      if (psi >= burstAt) { phase = 'burst'; n++; msg = { txt: 'BURST!', l: 1.4 }; haptic('error'); sfx(80, .5, 'sawtooth', .07, -30); feel.juice.shake(10).flash('#ffffff', .3).burst(rocket.x, H - 110, { n: 26, speed: 260, life: .6, size: 4, color: ['#9ad8ff', '#ffffff', '#5ab0ff'], gravity: 500 }); for (let i = 0; i < 20; i++) water.push({ x: rocket.x + rnd(-20, 20), y: rnd(0, 40), vy: rnd(-200, 200), l: .8 }); }
    },
    move(x) { if (drag) drag.x = x; },
    up() { drag = null; },
    key(k, d) { if (!d) return; if (k === ' ') { psi = .6; launch(); } },
  };
}

export default {
  id: 'water-rocket', title: 'Water Rocket', tag: 'Casual · Physics', retro: false, w: W, h: H, goal: 200,
  hint: 'Tap the pump to add pressure, then press Launch. More pressure flies higher, but push too far and it bursts: the rumble gets stronger as you get close. Drag to steer through rings.',
  make,
};
