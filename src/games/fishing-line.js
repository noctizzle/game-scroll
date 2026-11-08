import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { PAL } = gs.palettes;

// Hold to sink the hook, let go to reel it in. The first fish it touches on the way UP is caught,
// so slip past the small ones on the way down. Deeper fish are worth more. Jellyfish cut the line.
const P = PAL.ice, W = 160, H = 160, SURF = 26, BOTTOM = 152;

function make(api) {
  let hook, fish, time, score, lines, t, held, boatX, pop, caught;
  function spawn() {
    const depth = rnd(SURF + 14, BOTTOM - 6), dir = Math.random() < .5 ? 1 : -1, d = (depth - SURF) / (BOTTOM - SURF);
    const jelly = Math.random() < .12 + d * .1;
    fish.push({ x: dir > 0 ? -12 : W + 12, y: depth, dir, sp: rnd(14, 26) + d * 18, size: jelly ? 0 : d < .35 ? 1 : d < .7 ? 2 : 3, jelly, ph: rnd(0, 6) });
  }
  return {
    reset() { hook = { y: SURF, state: 'idle', fish: null }; fish = []; for (let i = 0; i < 6; i++) { spawn(); fish[i].x = rnd(10, 150); } time = 45; score = 0; lines = 3; t = 0; held = false; boatX = 80; pop = []; caught = null; },
    update(dt) {
      t += dt; time -= dt; if (time <= 0) { haptic('success'); return api.over(); }
      if (Math.random() < dt * 1.1 && fish.length < 9) spawn();
      for (const f of fish) { f.x += f.dir * f.sp * dt; f.ph += dt * 6; if (f.jelly) f.y += Math.sin(f.ph * .4) * dt * 8; }
      fish = fish.filter(f => f.x > -20 && f.x < W + 20);
      if (held && !hook.fish) { hook.y = Math.min(BOTTOM, hook.y + 60 * dt); hook.state = 'down'; }
      else if (hook.y > SURF) { hook.y = Math.max(SURF, hook.y - (hook.fish ? 50 : 90) * dt); hook.state = 'up'; }
      else { hook.state = 'idle'; if (hook.fish) { const v = [0, 1, 3, 6][hook.fish.size]; score += v; api.score(score); pop.push({ txt: '+' + v, l: 1 }); haptic('success'); sfx(880, .12, 'square', .04, 200); hook.fish = null; } }
      for (const f of fish) {
        if (f === hook.fish) continue;
        const near = Math.abs(f.x - boatX) < (f.jelly ? 6 : 4 + f.size * 2) && Math.abs(f.y - hook.y) < 4;
        if (!near) continue;
        if (f.jelly) { lines--; hook.fish = null; hook.y = SURF; haptic('error'); sfx(110, .3, 'square', .05, -40); pop.push({ txt: 'SNAP', l: 1 }); if (lines <= 0) return api.over(); break; }
        if (hook.state === 'up' && !hook.fish) { hook.fish = f; f.hooked = true; haptic('medium'); sfx(400, .08, 'square', .04, 300); }
      }
      if (hook.fish) { hook.fish.x = boatX; hook.fish.y = hook.y + 3; }
      fish = fish.filter(f => !(f.hooked && f !== hook.fish));
      for (const p of pop) p.l -= dt; pop = pop.filter(p => p.l > 0);
    },
    draw(c) {
      c.fillStyle = P[3]; c.fillRect(0, 0, W, SURF);
      const g = c.createLinearGradient(0, SURF, 0, H); g.addColorStop(0, P[2]); g.addColorStop(1, P[1]); c.fillStyle = g; c.fillRect(0, SURF, W, H - SURF);
      c.fillStyle = P[3]; for (let x = 0; x < W; x += 8) c.fillRect(x + Math.round(Math.sin(t * 2 + x) * 2), SURF, 4, 1);
      c.fillStyle = P[0]; c.fillRect(0, BOTTOM + 2, W, 6); for (let x = 4; x < W; x += 22) c.fillRect(x, BOTTOM - 4, 2, 6);
      // boat + angler
      c.fillStyle = P[0]; c.fillRect(boatX - 22, SURF - 6, 30, 6); c.fillRect(boatX - 18, SURF - 14, 6, 8); c.fillRect(boatX - 17, SURF - 18, 4, 4);
      c.strokeStyle = P[0]; c.lineWidth = 1; c.beginPath(); c.moveTo(boatX - 12, SURF - 14); c.lineTo(boatX, SURF - 22); c.lineTo(boatX, hook.y); c.stroke();
      c.fillStyle = P[0]; c.fillRect(boatX - 1, hook.y, 3, 2); c.fillRect(boatX + 1, hook.y - 2, 1, 2);
      for (const f of fish) {
        if (f.jelly) { c.fillStyle = P[3]; c.beginPath(); c.arc(f.x, f.y, 5, Math.PI, 0); c.fill(); for (let i = -4; i <= 4; i += 2) c.fillRect(f.x + i, f.y, 1, 4 + Math.round(Math.sin(f.ph + i))); continue; }
        const L = 4 + f.size * 3, hgt = 2 + f.size;
        c.fillStyle = f.size === 3 ? P[0] : f.size === 2 ? P[0] : P[3];
        c.fillRect(Math.round(f.x - L / 2), Math.round(f.y - hgt / 2), L, hgt);
        const tx = f.dir > 0 ? f.x - L / 2 - 3 : f.x + L / 2; c.fillRect(Math.round(tx), Math.round(f.y - hgt / 2 - 1), 3, hgt + 2);
        c.fillStyle = P[2]; c.fillRect(Math.round(f.x + f.dir * (L / 2 - 2)), Math.round(f.y - 1), 1, 1);
      }
      c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lines ? P[0] : P[2]; c.fillRect(W - 8 - i * 7, 4, 2, 7); }
      for (const p of pop) { c.globalAlpha = Math.min(1, p.l * 2); c.fillStyle = P[0]; c.textAlign = 'center'; c.fillText(p.txt, boatX + 30, SURF - 8 - (1 - p.l) * 10); c.globalAlpha = 1; }
      if (t < 3) { c.fillStyle = P[1]; c.textAlign = 'center'; c.fillText('HOLD TO SINK', 80, BOTTOM - 10); }
    },
    down() { held = true; },
    up() { held = false; },
    key(k, d) { if (k === ' ' || k === 'ArrowDown') held = d; },
  };
}

export default {
  id: 'fishing-line', title: 'Fishing Line', tag: 'Pocket · Timing', retro: true, w: W, h: H, pal: 'ice', goal: 20,
  hint: 'Hold to sink the hook and let go to reel up. You catch the first fish you touch on the way up. Deep fish are worth more. Jellyfish snap your line.',
  make,
};
