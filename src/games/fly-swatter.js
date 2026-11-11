import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { Feel } = gs.effects;

// Flies zig-zag round the picnic table. Tap to swat them. Leave the bees alone, and don't
// let flies land on the cake for long. 40 seconds; three stings or a ruined cake ends it.
const W = 360, H = 640, CAKE = { x: 180, y: 380, r: 60 };

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let bugs, time, score, stings, t, swats, spawn, cake, combo;
  function add() {
    const bee = score > 4 && Math.random() < .25, side = Math.random() * 4 | 0;
    const x = side === 0 ? -20 : side === 1 ? W + 20 : rnd(0, W), y = side === 2 ? -20 : side === 3 ? H + 20 : rnd(100, 600);
    bugs.push({ x, y, vx: 0, vy: 0, tx: rnd(40, W - 40), ty: rnd(140, 600), retarget: rnd(.3, .9), bee, dead: 0, land: 0, sp: bee ? 140 : rnd(170, 260) + score * 3 });
  }
  return {
    reset() { bugs = []; time = 40; score = 0; stings = 0; t = 0; swats = []; spawn = .3; cake = 1; combo = 0; feel.clear(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); t += dt; time -= dt; if (time <= 0) { haptic('success'); return api.over(); }
      spawn -= dt; if (spawn <= 0) { spawn = Math.max(.35, 1.1 - t / 50); if (bugs.filter(b => !b.dead).length < 9) add(); }
      for (const b of bugs) {
        if (b.dead) { b.dead += dt; continue; }
        b.retarget -= dt;
        if (b.retarget <= 0) { b.retarget = rnd(.25, .8); const goCake = !b.bee && Math.random() < .3; b.tx = goCake ? CAKE.x + rnd(-30, 30) : rnd(30, W - 30); b.ty = goCake ? CAKE.y + rnd(-20, 20) : rnd(130, 610); }
        const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy) || 1;
        if (d < 8 && Math.hypot(b.x - CAKE.x, b.y - CAKE.y) < CAKE.r) { b.land += dt; cake -= dt * .06; const k = Math.pow(.8, dt * 60); b.vx *= k; b.vy *= k; }   // the same braking at 60 and 120 Hz
        else { b.land = 0; b.vx += (dx / d * b.sp - b.vx) * dt * 6 + rnd(-300, 300) * dt; b.vy += (dy / d * b.sp - b.vy) * dt * 6 + rnd(-300, 300) * dt; }
        b.x += b.vx * dt; b.y += b.vy * dt;
      }
      bugs = bugs.filter(b => b.dead < .6);
      for (const s of swats) s.l -= dt; swats = swats.filter(s => s.l > 0);
      if (cake <= 0) { cake = 0; haptic('error'); return api.over(); }
    },
    draw(c) {
      c.fillStyle = '#e8d3a8'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#d9534f'; for (let y = 0; y < H; y += 40) for (let x = (y / 40 % 2) * 40; x < W; x += 80) c.fillRect(x, y, 40, 40);
      c.fillStyle = '#ffffff90'; c.beginPath(); c.arc(CAKE.x, CAKE.y + 8, CAKE.r + 12, 0, 7); c.fill();
      c.fillStyle = '#ffe6f0'; c.beginPath(); c.arc(CAKE.x, CAKE.y, CAKE.r, 0, 7); c.fill();
      c.fillStyle = '#ff5a8a'; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; c.beginPath(); c.arc(CAKE.x + Math.cos(a) * 40, CAKE.y + Math.sin(a) * 40, 7, 0, 7); c.fill(); }
      c.fillStyle = '#5a3a22'; c.font = '400 9px "Press Start 2P", monospace'; c.textAlign = 'center';
      feel.begin(c);
      for (const b of bugs) {
        c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx));
        if (b.dead) { c.globalAlpha = 1 - b.dead / .6; c.fillStyle = '#222'; c.beginPath(); c.ellipse(0, 0, 9, 4, 0, 0, 7); c.fill(); c.restore(); c.globalAlpha = 1; continue; }
        const flap = Math.sin(t * 60 + b.x) > 0 ? 6 : 3;
        c.fillStyle = '#ffffffb0'; c.beginPath(); c.ellipse(-2, -flap, 7, 4, -.4, 0, 7); c.ellipse(-2, flap, 7, 4, .4, 0, 7); c.fill();
        if (b.bee) { c.fillStyle = '#ffcc1a'; c.beginPath(); c.ellipse(0, 0, 10, 7, 0, 0, 7); c.fill(); c.fillStyle = '#222'; c.fillRect(-4, -7, 3, 14); c.fillRect(2, -7, 3, 14); }
        else { c.fillStyle = '#2a2a33'; c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, 7); c.fill(); c.fillStyle = '#c03030'; c.beginPath(); c.arc(7, -2, 2, 0, 7); c.arc(7, 2, 2, 0, 7); c.fill(); }
        c.restore();
      }
      for (const s of swats) { c.globalAlpha = s.l * 3; c.strokeStyle = s.bad ? '#ff2020' : '#3a2a1a'; c.lineWidth = 3; c.strokeRect(s.x - 30, s.y - 30, 60, 60); c.beginPath(); for (let i = -20; i <= 20; i += 10) { c.moveTo(s.x + i, s.y - 30); c.lineTo(s.x + i, s.y + 30); c.moveTo(s.x - 30, s.y + i); c.lineTo(s.x + 30, s.y + i); } c.stroke(); c.globalAlpha = 1; }
      feel.end(c, W, H);
      c.fillStyle = '#00000080'; c.fillRect(0, 0, W, 50); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 12, 22);
      c.fillText('CAKE', 12, 40); c.fillStyle = '#ffffff40'; c.fillRect(56, 32, 80, 8); c.fillStyle = cake > .3 ? '#ff8ab0' : '#ff3030'; c.fillRect(56, 32, 80 * cake, 8);
      c.textAlign = 'right'; for (let i = 0; i < 3; i++) { c.fillStyle = i < stings ? '#ffcc1a' : '#ffffff30'; c.beginPath(); c.arc(W - 18 - i * 18, 26, 6, 0, 7); c.fill(); }
    },
    down(x, y) {
      let hit = 0, bee = false;
      for (const b of bugs) if (!b.dead && Math.abs(b.x - x) < 34 && Math.abs(b.y - y) < 34) { b.dead = .001; if (b.bee) bee = true; else hit++; }
      swats.push({ x, y, l: .25, bad: bee });
      if (bee) { stings++; feel.juice.shake(7).flash('#ffcc1a', .25).pop(x, y - 34, 'OUCH!', { color: '#ff3030', size: 20 }); haptic('error'); sfx(180, .3, 'sawtooth', .05, -60); if (stings >= 3) return api.over(); }
      if (hit) { feel.juice.burst(x, y, { n: 8 + hit * 5, speed: 160, life: .35, size: 3, color: ['#2a2a33', '#ffffff'] }).pop(x, y - 34, `+${hit * hit}`, { color: hit > 1 ? '#ffd34a' : '#ffffff', size: hit > 1 ? 24 : 16 }).shake(hit > 1 ? 5 : 2); combo = hit > 1 ? combo + 1 : combo; score += hit * hit; api.score(score); haptic(hit > 1 ? 'success' : 'medium'); sfx(260, .06, 'square', .05, -100); }
      else if (!bee) { haptic('tick'); sfx(120, .04, 'square', .03); }
    },
  };
}

export default {
  id: 'fly-swatter', title: 'Fly Swatter', tag: 'Casual · Reflex', retro: false, w: W, h: H, goal: 30,
  hint: 'Tap to swat flies before they spoil the cake. Two in one swat scores 4. Never swat a bee: three stings and you are out.',
  make,
};
