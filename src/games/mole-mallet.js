import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { PAL } = gs.palettes;

// Whack the critters as they pop up. Leave the ones in helmets alone. 40 seconds, three bumps allowed.
const R = PAL.rose, W = 160, H = 160, HOLES = [...Array(9)].map((_, i) => ({ x: 30 + (i % 3) * 50, y: 46 + (i / 3 | 0) * 40 }));

function make(api) {
  let moles, spawn, time, score, lives, t, hits, dead, combo;
  return {
    reset() { moles = []; spawn = .5; time = 40; score = 0; lives = 3; t = 0; hits = []; dead = 0; combo = 0; },
    update(dt) {
      t += dt; time -= dt; if (time <= 0) { haptic('success'); return api.over(); }
      spawn -= dt;
      if (spawn <= 0) { spawn = Math.max(.28, .9 - t / 60); const free = HOLES.map((_, i) => i).filter(i => !moles.some(m => m.i === i)); if (free.length) { const up = Math.max(.55, 1.3 - t / 50); moles.push({ i: free[Math.random() * free.length | 0], age: 0, up, helmet: Math.random() < .22, hit: 0 }); } }
      for (const m of moles) { m.age += dt; if (m.hit) m.hit += dt; }
      moles = moles.filter(m => { if (m.hit > .25) return false; if (m.age > m.up + .3) { if (!m.helmet) combo = 0; return false; } return true; });
      for (const h of hits) h.l -= dt; hits = hits.filter(h => h.l > 0);
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[2]; c.fillRect(0, 0, W, H); c.fillStyle = R[3]; for (let i = 0; i < 40; i++) c.fillRect((i * 41) % W, 20 + (i * 23) % 140, 2, 1);
      for (const [i, hole] of HOLES.entries()) {
        const m = moles.find(q => q.i === i); c.fillStyle = R[0]; c.beginPath(); c.ellipse(hole.x, hole.y + 10, 16, 6, 0, 0, 7); c.fill();
        if (m) {
          const k = m.hit ? 1 - m.hit * 4 : Math.min(1, m.age / .12, (m.up + .3 - m.age) / .12), top = hole.y + 10 - 18 * Math.max(0, k);
          c.save(); c.beginPath(); c.rect(hole.x - 18, hole.y - 30, 36, 40); c.clip();
          c.fillStyle = R[1]; c.beginPath(); c.roundRect(hole.x - 10, top, 20, 24, 8); c.fill();
          c.fillStyle = R[3]; if (m.hit) { c.fillRect(hole.x - 6, top + 7, 4, 1); c.fillRect(hole.x + 2, top + 7, 4, 1); } else { c.fillRect(hole.x - 5, top + 6, 2, 3); c.fillRect(hole.x + 3, top + 6, 2, 3); }
          c.fillStyle = R[0]; c.fillRect(hole.x - 2, top + 11, 4, 2);
          if (m.helmet) { c.fillStyle = R[0]; c.beginPath(); c.arc(hole.x, top + 4, 11, Math.PI, 0); c.fill(); c.fillStyle = R[3]; c.fillRect(hole.x - 1, top - 5, 2, 5); }
          c.restore();
        }
        c.fillStyle = R[1]; c.beginPath(); c.ellipse(hole.x, hole.y + 12, 18, 4, 0, 0, Math.PI); c.fill();
      }
      for (const h of hits) { c.fillStyle = R[3]; c.globalAlpha = h.l * 3; for (let a = 0; a < 6.28; a += .9) c.fillRect(h.x + Math.cos(a) * 12, h.y + Math.sin(a) * 12, 2, 2); c.globalAlpha = 1; }
      c.fillStyle = R[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 4, 10);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < lives ? R[0] : R[3]; c.fillRect(W - 10 - i * 8, 4, 5, 5); }
      if (combo > 2) { c.textAlign = 'center'; c.fillStyle = R[0]; c.fillText(`x${combo}`, W / 2, 10); }
    },
    down(x, y) {
      let best = null, bd = 22;
      for (const m of moles) { if (m.hit) continue; const h = HOLES[m.i], d = Math.hypot(x - h.x, y - (h.y - 2)); if (d < bd) { bd = d; best = m; } }
      if (!best) return;
      best.hit = .001; hits.push({ x: HOLES[best.i].x, y: HOLES[best.i].y - 6, l: .3 });
      if (best.helmet) { lives--; combo = 0; haptic('error'); sfx(120, .2, 'square', .05, -40); if (lives <= 0) return api.over(); }
      else { combo++; score += 1 + Math.floor(combo / 5); api.score(score); haptic('medium'); sfx(500 + combo * 30, .06, 'square', .04, -200); }
    },
  };
}

export default {
  id: 'mole-mallet', title: 'Mole Mallet', tag: 'Pocket · Reflex', retro: true, w: W, h: H, pal: 'rose', goal: 30,
  hint: 'Tap critters as they pop up. Never hit one wearing a helmet. Keep a streak going for bonus points.',
  make,
};
