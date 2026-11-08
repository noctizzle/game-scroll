import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;

// Tap to throw darts into the spinning wheel. Hit a dart that's already there and the run ends. Fill the quota to break the wheel.
const W = 360, H = 640, CX = W / 2, CY = 230, RAD = 78, DL = 64, THROW_Y = 560;

function make(api) {
  let ang, spin, stuck, flying, quota, left, stage, score, t, dead, shards, gems, bounce, phase;
  function stageSetup() {
    ang = 0; stuck = []; left = quota = Math.min(12, 5 + stage); flying = null; shards = []; phase = rnd(0, 6);
    const pre = Math.min(5, stage - 1); for (let i = 0; i < pre; i++) stuck.push(i / pre * Math.PI * 2 + rnd(-.2, .2));
    gems = Math.random() < .6 ? [rnd(0, 6.28)] : [];
  }
  const spinAt = tt => { const base = 2 + stage * .25; if (stage % 3 === 0) return base * Math.sin(tt * 1.3 + phase) * 1.4; if (stage % 3 === 2) return (Math.sin(tt * .7 + phase) > 0 ? 1 : -1) * base; return base; };
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return {
    reset() { stage = 1; score = 0; t = 0; dead = 0; bounce = null; stageSetup(); },
    update(dt) {
      t += dt; spin = spinAt(t); ang += spin * dt;
      for (const s of shards) { s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.vr * dt; } shards = shards.filter(s => s.y < H + 40);
      if (!flying) return;
      flying.y -= 2200 * dt;
      if (flying.y <= CY + RAD) {
        const hitAng = Math.PI / 2 - ang;   // the wheel's local angle that's at the bottom right now
        if (stuck.some(a => angDiff(a, hitAng) < .2)) { bounce = { x: CX, y: CY + RAD + DL / 2, vx: rnd(-200, 200), vy: 300, r: 0 }; flying = null; haptic('error'); sfx(160, .3, 'sawtooth', .06, -60); return api.over(); }
        stuck.push(hitAng); flying = null; left--; score++; haptic('light'); sfx(420, .05, 'square', .04, -200);
        const gi = gems.findIndex(g => angDiff(g, hitAng) < .22); if (gi >= 0) { gems.splice(gi, 1); score += 5; haptic('medium'); sfx(1100, .12, 'triangle', .05); }
        api.score(score);
        if (!left) { for (let i = 0; i < 10; i++) shards.push({ x: CX, y: CY, vx: rnd(-300, 300), vy: rnd(-500, -100), r: 0, vr: rnd(-8, 8) }); stage++; score += 10; api.score(score); haptic('success'); sfx(700, .35, 'sawtooth', .05, 400); stageSetup(); }
      }
    },
    fx(dt) { dead += dt; if (bounce) { bounce.vy += 1200 * dt; bounce.x += bounce.vx * dt; bounce.y += bounce.vy * dt; bounce.r += 10 * dt; } },
    draw(c) {
      c.fillStyle = '#20141c'; c.fillRect(0, 0, W, H);
      const dart = (x, y, r, col = '#e8ecf5') => { c.save(); c.translate(x, y); c.rotate(r); c.fillStyle = '#9aa3b5'; c.fillRect(-1.5, -DL / 2, 3, DL * .55); c.fillStyle = col; c.fillRect(-4, 0, 8, DL / 2 - 10); c.fillStyle = '#ff5d73'; c.beginPath(); c.moveTo(0, DL / 2 - 12); c.lineTo(-9, DL / 2); c.lineTo(9, DL / 2); c.fill(); c.restore(); };
      c.save(); c.translate(CX, CY); c.rotate(ang);
      for (const a of stuck) { c.save(); c.rotate(a - Math.PI / 2); dart(0, RAD + DL / 2 - 6, 0); c.restore(); }
      const wg = c.createRadialGradient(-20, -20, 10, 0, 0, RAD); wg.addColorStop(0, '#d8a46a'); wg.addColorStop(1, '#8a5a2b'); c.fillStyle = wg; c.beginPath(); c.arc(0, 0, RAD, 0, 7); c.fill();
      c.strokeStyle = '#6b4220'; c.lineWidth = 2; for (const r of [RAD * .7, RAD * .4]) { c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); }
      for (const g of gems) { c.save(); c.rotate(g - Math.PI / 2); c.fillStyle = '#5ae0ff'; c.beginPath(); c.moveTo(0, RAD + 4); c.lineTo(8, RAD + 14); c.lineTo(0, RAD + 24); c.lineTo(-8, RAD + 14); c.fill(); c.restore(); }
      c.restore();
      for (const s of shards) { c.save(); c.translate(s.x, s.y); c.rotate(s.r); c.fillStyle = '#b07a42'; c.fillRect(-14, -8, 28, 16); c.restore(); }
      if (flying) dart(CX, flying.y + DL / 2, 0); else if (!dead) dart(CX, THROW_Y, 0);
      if (bounce) dart(bounce.x, bounce.y, bounce.r, '#ff9a9a');
      for (let i = 0; i < quota; i++) { c.fillStyle = i < quota - left ? '#ffffff22' : '#ffd34a'; c.fillRect(24, H - 40 - i * 16, 6, 12); }
      c.fillStyle = '#ffffff99'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`Wheel ${stage}`, W / 2, 96);
    },
    down() { if (flying || dead) return; flying = { y: THROW_Y }; sfx(800, .03, 'triangle', .03, -300); },
    key(k, d) { if (d && k === ' ') this.down(); },
  };
}

export default {
  id: 'dart-wheel', title: 'Dart Wheel', tag: 'Casual · Timing', retro: false, w: W, h: H, goal: 25,
  hint: 'Tap to throw. Land every dart in the wheel without touching another dart. Blue gems are bonus points.',
  make,
};
