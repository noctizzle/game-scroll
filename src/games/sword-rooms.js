import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Top-down dungeon crawl. Hold and drag to walk toward your finger; tap to swing your sword that way.
// Clear every monster to open the door at the top, then step through to the next room.
const T = 16;
let W = 160, H = 160;

function make(api) {
  let map, C, R, hero, foes, room, score, t, touch, swing, hearts, parts, drops, open, msg, shake;
  const oy = () => H - R * T;
  const solid = (x, y) => { const c = Math.floor(x / T), r = Math.floor((y - oy()) / T); if (c < 0 || c >= C || r < 0 || r >= R) return true; return map[r][c] === 1 || (map[r][c] === 2 && !open); };
  const hitsWall = (x, y, s) => solid(x - s, y - s) || solid(x + s, y - s) || solid(x - s, y + s) || solid(x + s, y + s);
  function moveBody(b, dx, dy, s) { if (!hitsWall(b.x + dx, b.y, s)) b.x += dx; else if (b.vx != null) b.vx *= -1; if (!hitsWall(b.x, b.y + dy, s)) b.y += dy; else if (b.vy != null) b.vy *= -1; }
  function buildRoom(keep) {
    C = Math.floor(W / T); R = Math.floor((H - 10) / T); const mid = C >> 1;
    map = Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => (r === 0 || c === 0 || c === C - 1 || r === R - 1) ? 1 : 0));
    map[0][mid] = 2; if (C % 2 === 0) map[0][mid - 1] = 2;
    const rocks = 2 + Math.min(6, room) + (R > 11 ? 3 : 0);
    for (let i = 0; i < rocks; i++) { const c = 2 + Math.random() * (C - 4) | 0, r = 2 + Math.random() * (R - 5) | 0; if (Math.abs(c - mid) > 0 || r > 2) map[r][c] = 1; }
    if (keep) { hero.x = clamp(hero.x, T * 1.5, W - T * 1.5); hero.y = clamp(hero.y, oy() + T * 1.5, H - T * 1.5); return; }
    hero = { x: mid * T + (C % 2 === 0 ? 0 : 8), y: H - T * 1.5, face: [0, -1], inv: 1, kb: null };
    for (let r = R - 3; r < R - 1; r++) for (let c = mid - 1; c <= mid + 1; c++) map[r][c] = 0;
    foes = []; open = false; drops = [];
    const n = Math.min(9, 2 + room + (R > 11)), kinds = room < 2 ? ['slime'] : room < 4 ? ['slime', 'bat'] : ['slime', 'bat', 'charger'];
    for (let i = 0; i < n; i++) { let x, y, k = 0; do { x = rnd(T * 1.5, W - T * 1.5); y = rnd(oy() + T * 1.5, H - T * 4); k++; } while (k < 40 && hitsWall(x, y, 6)); const kind = kinds[Math.random() * kinds.length | 0]; foes.push({ kind, x, y, hp: kind === 'slime' ? 1 : 2, vx: 0, vy: 0, t: rnd(0, 2), hurt: 0 }); }
  }
  function hurtHero(fx, fy) {
    if (hero.inv > 0) return; hearts--; hero.inv = 1.1; shake = .25; const d = Math.hypot(hero.x - fx, hero.y - fy) || 1; hero.kb = { x: (hero.x - fx) / d * 140, y: (hero.y - fy) / d * 140, t: .15 };
    haptic('heavy'); sfx(160, .2, 'square', .05, -80); if (hearts <= 0) { sfx(100, .5, 'square', .05, -40); haptic('error'); }
  }
  function attack(tx, ty) {
    if (swing) return; const dx = tx - hero.x, dy = ty - hero.y, d = Math.hypot(dx, dy) || 1; hero.face = [dx / d, dy / d]; swing = { t: .18, a: Math.atan2(dy, dx) };
    sfx(900, .05, 'sawtooth', .03, -400); haptic('light');
    for (const f of foes) {
      const ex = f.x - hero.x, ey = f.y - hero.y, dist = Math.hypot(ex, ey); if (dist > 20) continue;
      let da = Math.atan2(ey, ex) - swing.a; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > 1.3 && dist > 7) continue;
      f.hp--; f.hurt = .25; f.vx = ex / (dist || 1) * 160; f.vy = ey / (dist || 1) * 160; f.kb = .12; sfx(500, .06, 'square', .05, -200);
      if (f.hp <= 0) { f.dead = true; score += 1; api.score(score); haptic('medium'); for (let i = 0; i < 6; i++) parts.push({ x: f.x, y: f.y, vx: rnd(-50, 50), vy: rnd(-50, 50), l: .4 }); if (Math.random() < .18 && hearts < 3) drops.push({ x: f.x, y: f.y }); }
    }
    foes = foes.filter(f => !f.dead);
    if (!foes.length && !open) { open = true; score += 2; api.score(score); msg = { txt: 'DOOR OPEN!', l: 1.2 }; haptic('success'); sfx(700, .3, 'square', .05, 400); }
  }
  const self = {
    reset() { room = 0; score = 0; t = 0; touch = null; swing = null; hearts = 3; parts = []; msg = null; shake = 0; buildRoom(false); },
    resize(w, h) { W = w; H = h; if (hero) { buildRoom(true); foes = foes.filter(f => !hitsWall(f.x, f.y, 5)); } },
    update(dt) {
      t += dt; shake = Math.max(0, shake - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (hearts <= 0) return api.over();
      hero.inv = Math.max(0, hero.inv - dt); if (swing) { swing.t -= dt; if (swing.t <= 0) swing = null; }
      if (hero.kb) { moveBody(hero, hero.kb.x * dt, hero.kb.y * dt, 5); hero.kb.t -= dt; if (hero.kb.t <= 0) hero.kb = null; }
      else if (touch && touch.walk) { const dx = touch.x - hero.x, dy = touch.y - hero.y, d = Math.hypot(dx, dy); if (d > 3) { const sp = 62 * dt; hero.face = [dx / d, dy / d]; moveBody(hero, dx / d * Math.min(sp, d), dy / d * Math.min(sp, d), 5); } }
      else if (touch && !touch.walk) { touch.t += dt; if (touch.t > .2) touch.walk = true; }
      if (self.keys) { const [kx, ky] = self.keys; if (kx || ky) { hero.face = [kx, ky]; moveBody(hero, kx * 62 * dt, ky * 62 * dt, 5); } }
      if (open && hero.y < oy() + T * .7) { room++; msg = { txt: `ROOM ${room + 1}`, l: 1.2 }; sfx(400, .2, 'square', .05, 400); buildRoom(false); return; }
      const sp = 1 + room * .06;
      for (const f of foes) {
        f.t += dt; f.hurt = Math.max(0, f.hurt - dt);
        if (f.kb > 0) { f.kb -= dt; moveBody(f, f.vx * dt, f.vy * dt, 5); continue; }
        const dx = hero.x - f.x, dy = hero.y - f.y, d = Math.hypot(dx, dy) || 1;
        if (f.kind === 'slime') { if (f.t % 1.2 < .5) moveBody(f, dx / d * 30 * sp * dt, dy / d * 30 * sp * dt, 5); }
        else if (f.kind === 'bat') { const a = f.t * 3; moveBody(f, (dx / d * 34 + Math.cos(a) * 40) * sp * dt, (dy / d * 34 + Math.sin(a * 1.3) * 40) * sp * dt, 4); }
        else { if (!f.dash && f.t > 1.6) { f.dash = { x: dx / d, y: dy / d, t: .5 }; f.t = 0; sfx(250, .05, 'square', .03); } if (f.dash) { moveBody(f, f.dash.x * 120 * dt, f.dash.y * 120 * dt, 5); f.dash.t -= dt; if (f.dash.t <= 0) f.dash = null; } }
        if (d < 9) hurtHero(f.x, f.y);
      }
      for (const dr of drops) if (Math.hypot(dr.x - hero.x, dr.y - hero.y) < 9) { dr.got = true; hearts = Math.min(3, hearts + 1); haptic('success'); sfx(1000, .15, 'triangle', .05, 300); }
      drops = drops.filter(d => !d.got);
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; } parts = parts.filter(p => p.l > 0);
    },
    draw(c) {
      const o = oy(), sx = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
      c.fillStyle = '#101018'; c.fillRect(0, 0, W, H); c.save(); c.translate(sx, 0);
      for (let r = 0; r < R; r++) for (let cc = 0; cc < C; cc++) {
        const v = map[r][cc], X = cc * T, Y = o + r * T;
        if (v === 0) { c.fillStyle = (r + cc) % 2 ? '#c8a878' : '#d0b080'; c.fillRect(X, Y, T, T); c.fillStyle = '#b89868'; c.fillRect(X, Y, T, 1); c.fillRect(X, Y, 1, T); }
        else if (v === 2) { c.fillStyle = open ? '#181010' : '#784020'; c.fillRect(X, Y, T, T); if (!open) { c.fillStyle = '#f8c838'; c.fillRect(X + 7, Y + 7, 2, 3); } }
        else { const edge = r === 0 || cc === 0 || cc === C - 1 || r === R - 1; c.fillStyle = edge ? '#585878' : '#787890'; c.fillRect(X, Y, T, T); c.fillStyle = edge ? '#40405a' : '#9898b0'; c.fillRect(X + 1, Y + 1, T - 2, 2); c.fillStyle = '#383850'; c.fillRect(X, Y + T - 2, T, 2); if (edge) { c.fillStyle = '#48486a'; c.fillRect(X + (r % 2 ? 4 : 10), Y + 6, 1, 6); } }
      }
      for (const dr of drops) { c.fillStyle = '#e04050'; c.fillRect(dr.x - 3, dr.y - 2, 2, 2); c.fillRect(dr.x + 1, dr.y - 2, 2, 2); c.fillRect(dr.x - 3, dr.y, 6, 2); c.fillRect(dr.x - 1, dr.y + 2, 2, 1); }
      for (const f of foes) {
        const x = Math.round(f.x), y = Math.round(f.y), fl = f.hurt > 0 && (t * 30 | 0) % 2;
        if (f.kind === 'slime') { const sq = f.t % 1.2 < .5 ? 1 : 0; c.fillStyle = fl ? '#f8f8f0' : '#48c048'; c.fillRect(x - 6, y - 3 + sq, 12, 8 - sq); c.fillRect(x - 4, y - 5 + sq, 8, 2); c.fillStyle = '#101018'; c.fillRect(x - 3, y - 1 + sq, 2, 2); c.fillRect(x + 1, y - 1 + sq, 2, 2); }
        else if (f.kind === 'bat') { const fw = (t * 10 | 0) % 2 ? 3 : -1; c.fillStyle = fl ? '#f8f8f0' : '#8848c8'; c.fillRect(x - 3, y - 3, 6, 6); c.fillRect(x - 8, y - 3 + fw, 5, 2); c.fillRect(x + 3, y - 3 + fw, 5, 2); c.fillStyle = '#f8d838'; c.fillRect(x - 2, y - 1, 1, 1); c.fillRect(x + 1, y - 1, 1, 1); }
        else { c.fillStyle = fl ? '#f8f8f0' : f.dash ? '#f86030' : '#c04030'; c.fillRect(x - 5, y - 6, 10, 12); c.fillStyle = '#e8e8f0'; c.fillRect(x - 5, y - 6, 10, 3); c.fillStyle = '#101018'; c.fillRect(x - 3, y - 2, 2, 2); c.fillRect(x + 1, y - 2, 2, 2); if (!f.dash && f.t > 1.1) { c.fillStyle = '#f8f8f0'; c.fillRect(x - 1, y - 12, 2, 4); } }
      }
      // hero
      if (!(hero.inv > 0 && (t * 16 | 0) % 2)) {
        const x = Math.round(hero.x), y = Math.round(hero.y);
        c.fillStyle = '#208858'; c.fillRect(x - 5, y - 7, 10, 4); c.fillStyle = '#f8d0a8'; c.fillRect(x - 4, y - 3, 8, 4); c.fillStyle = '#38b858'; c.fillRect(x - 5, y + 1, 10, 5); c.fillStyle = '#683820'; c.fillRect(x - 4, y + 6, 3, 2); c.fillRect(x + 1, y + 6, 3, 2);
        c.fillStyle = '#101018'; c.fillRect(x - 2 + Math.round(hero.face[0]), y - 2 + Math.max(0, Math.round(hero.face[1])), 1, 1); c.fillRect(x + 1 + Math.round(hero.face[0]), y - 2 + Math.max(0, Math.round(hero.face[1])), 1, 1);
      }
      if (swing) { const k = 1 - swing.t / .18, a = swing.a - 1.1 + k * 2.2; c.strokeStyle = '#f8f8f0'; c.lineWidth = 2; c.beginPath(); c.moveTo(hero.x + Math.cos(a) * 5, hero.y + Math.sin(a) * 5); c.lineTo(hero.x + Math.cos(a) * 17, hero.y + Math.sin(a) * 17); c.stroke(); c.strokeStyle = '#ffffff60'; c.beginPath(); c.arc(hero.x, hero.y, 15, swing.a - 1.1, a); c.stroke(); }
      for (const p of parts) { c.fillStyle = '#f8f8f0'; c.fillRect(p.x | 0, p.y | 0, 2, 2); }
      c.restore();
      c.fillStyle = '#101018'; c.fillRect(0, 0, W, o);
      for (let i = 0; i < 3; i++) { const x = 4 + i * 9, y = o - 7; c.fillStyle = i < hearts ? '#e04050' : '#404050'; c.fillRect(x, y, 3, 2); c.fillRect(x + 4, y, 3, 2); c.fillRect(x, y + 2, 7, 2); c.fillRect(x + 2, y + 4, 3, 1); }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(`RM${room + 1}`, W - 3, o - 2);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(msg.txt, W / 2 + 1, o + 31); c.fillStyle = '#f8d838'; c.fillText(msg.txt, W / 2, o + 30); }
      if (t < 5 && room === 0) { c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText('HOLD: WALK  TAP: SWING', W / 2, H - 20); }
    },
    down(x, y) { touch = { x, y, sx: x, sy: y, t: 0, walk: false }; },
    move(x, y, p) { if (!p || !touch) return; touch.x = x; touch.y = y; if (Math.hypot(x - touch.sx, y - touch.sy) > 6) touch.walk = true; },
    up(x, y) { if (touch && !touch.walk) attack(touch.sx, touch.sy); touch = null; },
    key(k, d) {
      const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (m) self.keys = d ? m : [0, 0];
      if (d && k === ' ') { const f = foes[0]; attack(f ? f.x : hero.x + hero.face[0] * 10, f ? f.y : hero.y + hero.face[1] * 10); }
    },
  };
  return self;
}

export default {
  id: 'sword-rooms', title: 'Sword Rooms', tag: 'Color · Adventure', retro: true, era: 'color', pal: 'lemon', w: 160, h: 160, maxW: 240, maxH: 300, goal: 25, step: 16,
  hint: 'Hold and drag to walk toward your finger. Tap to swing your sword toward the tap. Clear every monster to open the top door, then walk through. Hearts sometimes drop.',
  make,
};
