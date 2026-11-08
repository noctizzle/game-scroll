import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { clamp, rnd, pix } = gs.util;
const { PAL } = gs.palettes;

// Hold to climb through a scrolling cave.
function make(api, p) {
  const R = PAL[p.pal], W = 160, H = 160, CW = 4, PX = 34;
  const SHIP = ['.00....', '0110...', '0111100', '0110...', '.00....'];
  let go, cols, obs, off, speed, y, vy, hold, dist, center, drift, gap, trail, since, dead, shields, safe;
  function col() {
    drift = clamp(drift + rnd(-p.wobble, p.wobble), -1.6, 1.6); center += drift;
    const lo = gap / 2 + 4, hi = H - gap / 2 - 4;
    if (center < lo) { center = lo; drift = Math.abs(drift); }
    if (center > hi) { center = hi; drift = -Math.abs(drift); }
    if (++since > 34 && dist > 140 && Math.random() < p.obstacles) { since = 0; obs.push({ x: W + 4, y: center + rnd(-gap * .22, gap * .22) - 8, w: 6, h: 16 }); }
    return { top: Math.round(center - gap / 2), bot: Math.round(center + gap / 2) };
  }
  return {
    reset() { go = false; off = 0; speed = p.speed; y = H / 2; vy = 0; hold = false; dist = 0; center = H / 2; drift = 0; gap = p.gap; obs = []; trail = []; since = 0; dead = 0; shields = api.has('shield') ? 1 : 0; safe = 0; cols = []; for (let i = 0; i <= W / CW + 2; i++) cols.push(col()); },
    update(dt) {
      gap = Math.max(p.gapMin, p.gap - dist / 28); speed = Math.min(p.speedMax, p.speed + dist / 40);
      const dx = speed * dt; off += dx; dist += dx;
      while (off >= CW) { off -= CW; cols.shift(); cols.push(col()); }
      for (const o of obs) o.x -= dx; obs = obs.filter(o => o.x > -10);
      if (!go && dist > 120) go = true;   // a short hover so you are never dead before your first touch
      if (go) { vy += (hold ? -p.thrust : p.gravity) * dt; vy = clamp(vy, -110, 130); y += vy * dt; } else { y = H / 2 + Math.sin(dist / 12) * 3; vy = 0; }
      trail.push({ x: PX - 4, y: y + rnd(-1, 1), life: .45 });
      for (const q of trail) { q.x -= dx; q.life -= dt; } trail = trail.filter(q => q.life > 0);
      api.score(Math.floor(dist / 8));
      const i = Math.floor((PX + off) / CW), hit = c => c && (y - 2 < c.top || y + 2 > c.bot);
      if (safe > 0) { safe -= dt; return; }
      let crash = hit(cols[i]) || hit(cols[i + 1]) || y < 0 || y > H;
      for (const o of obs) if (PX + 3 > o.x && PX - 3 < o.x + o.w && y + 2 > o.y && y - 2 < o.y + o.h) crash = true;
      if (!crash) return;
      // A shield from the shop soaks one crash: pop back to the middle of the cave and blink.
      if (shields > 0) { shields--; safe = 1.5; const k = cols[i] || cols[i + 1]; y = k ? (k.top + k.bot) / 2 : H / 2; vy = 0; obs = obs.filter(o => o.x > PX + 30); sfx(700, .25, 'square', .05, -400); return; }
      return api.over();
    },
    fx(dt) { dead += dt; },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      c.fillStyle = R[2]; for (let i = 0; i < 7; i++) { const x = ((i * 41 - dist * .35) % (W + 24) + W + 24) % (W + 24) - 12; c.fillRect(Math.round(x), 30 + (i * 53) % 100, 10, 1); }
      for (let i = 0; i < cols.length; i++) { const x = Math.round(i * CW - off), k = cols[i]; c.fillStyle = R[1]; c.fillRect(x, 0, CW, k.top); c.fillRect(x, k.bot, CW, H - k.bot); c.fillStyle = R[0]; c.fillRect(x, k.top - 2, CW, 2); c.fillRect(x, k.bot, CW, 2); }
      for (const o of obs) { c.fillStyle = R[0]; c.fillRect(Math.round(o.x), Math.round(o.y), o.w, o.h); c.fillStyle = R[1]; c.fillRect(Math.round(o.x) + 2, Math.round(o.y) + 2, o.w - 4, o.h - 4); }
      c.fillStyle = R[2]; for (const q of trail) c.fillRect(Math.round(q.x), Math.round(q.y), 2, 1);
      if (shields > 0) { c.fillStyle = R[1]; c.fillRect(PX - 6, Math.round(y) - 5, 1, 11); }
      if ((!dead || (dead * 10 | 0) % 2) && !(safe > 0 && (safe * 12 | 0) % 2)) pix(c, SHIP, PX - 3, Math.round(y) - 2, { 0: R[0], 1: R[1] });
    },
    down() { hold = true; go = true; sfx(200, .05, 'square', .02); },
    up() { hold = false; },
    key(k, d) { if (k === ' ' || k === 'ArrowUp') { hold = d; if (d) go = true; } },
  };
}

const base = { pal: 'moss', gap: 108, gapMin: 52, speed: 42, speedMax: 95, gravity: 240, thrust: 320, obstacles: .06, wobble: .6 };

export default {
  id: 'cave', title: 'Cave Flyer', tag: 'Pocket · Arcade', retro: true, w: 160, h: 160,
  hint: 'Hold to climb, let go to dive. Stay off the walls.',
  pal: base.pal,
  goal: 100,
  board: true,
  shop: [{ id: 'shield', name: 'Shield', price: 25, kind: 'boost', desc: 'Survive one crash.' }],
  make: api => make(api, base),
};
