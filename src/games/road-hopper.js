import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { rnd } = gs.util;
const { PAL } = gs.palettes;
const { haptic } = gs.device;
const { Feel } = gs.effects;
const { Ready } = gs.rounds;

// Hop forward through endless roads and fields. Tap to hop up, swipe left/right to sidestep. Don't fall behind.
const R = PAL.mint, W = 160, H = 160, S = 10, COLS = 16;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false, text: 'TAP TO HOP' });         // the screen doesn't creep up until the first hop
  let rows, pc, pr, cam, best, t, pd, hop, dead;
  function row(r) {
    if (rows[r]) return rows[r];
    let o;
    if (r < 3 || Math.random() < .35) { o = { type: 'grass', trees: [] }; if (r > 2) for (let i = 0; i < 3; i++) o.trees.push(Math.random() * COLS | 0); }
    else {
      const dir = Math.random() < .5 ? 1 : -1, speed = rnd(18, 34) + Math.min(40, r * .4), len = Math.random() < .3 ? 3 : 2, gap = rnd(4, 7);
      o = { type: 'road', dir, speed, cars: [] };
      for (let x = rnd(0, 6); x < COLS + 4; x += len + gap) o.cars.push({ x, len });
    }
    return rows[r] = o;
  }
  const blocked = (c, r) => c < 0 || c >= COLS || (row(r).type === 'grass' && row(r).trees.includes(c));
  function go(dc, dr) {
    const nc = pc + dc, nr = pr + dr;
    if (nr < 0 || blocked(nc, nr)) return;
    pc = nc; pr = nr; hop = .1; sfx(500 + dr * 120, .04, 'square', .02); haptic('tick');
    if (pr > best) { best = pr; api.score(best); }
  }
  return {
    reset() { rows = {}; pc = 8; pr = 1; cam = 0; best = 0; t = 0; pd = null; hop = 0; dead = 0; feel.clear(); ready.reset(); },
    update(dt) {
      feel.update(dt); t += dt; hop = Math.max(0, hop - dt);
      if (ready.update(dt)) cam += dt * (.25 + Math.min(.6, best / 120));   // traffic always moves; the creep waits for you
      cam = Math.max(cam, pr - 9);
      for (let r = Math.floor(cam); r < cam + 18; r++) {
        const o = row(r); if (o.type !== 'road') continue;
        for (const k of o.cars) { k.x += o.dir * o.speed * dt / S; if (o.dir > 0 && k.x > COLS + 2) k.x -= COLS + 6; if (o.dir < 0 && k.x < -4) k.x += COLS + 6; }
      }
      const o = row(pr);
      if (o.type === 'road' && o.cars.some(k => pc + .8 > k.x && pc + .2 < k.x + k.len)) { sfx(120, .4, 'sawtooth', .05, -60); haptic('error'); feel.juice.shake(6).burst(pc * S + 5, H - (pr - cam + 1) * S + 5, { n: 10, speed: 55, life: .45, size: 2, color: [R[0], R[1]] }); return api.over(); }
      if (pr < cam - .3) { sfx(160, .4, 'triangle', .05, -80); haptic('error'); feel.juice.shake(4); return api.over(); }
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      const yOf = r => Math.round(H - (r - cam + 1) * S);
      feel.begin(c);
      for (let r = Math.floor(cam) - 1; r < cam + 17; r++) {
        const o = row(Math.max(0, r)), y = yOf(r);
        if (o.type === 'grass') { c.fillStyle = R[3]; c.fillRect(0, y, W, S); c.fillStyle = R[2]; for (let i = 0; i < COLS; i += 3) c.fillRect(i * S + (r % 2) * 4 + 3, y + 4, 1, 2);
          for (const tc of o.trees) { c.fillStyle = R[1]; c.fillRect(tc * S + 1, y + 1, 8, 8); c.fillStyle = R[0]; c.fillRect(tc * S + 4, y + 6, 2, 3); } }
        else { c.fillStyle = R[2]; c.fillRect(0, y, W, S); c.fillStyle = R[3]; if (row(r + 1).type === 'road') for (let i = 0; i < COLS; i += 2) c.fillRect(i * S + 2, y, 5, 1);
          for (const k of o.cars) { const x = Math.round(k.x * S); c.fillStyle = R[0]; c.fillRect(x, y + 2, k.len * S - 2, 6); c.fillStyle = R[1]; c.fillRect(x + (o.dir > 0 ? k.len * S - 6 : 2), y + 3, 2, 4); } }
      }
      if (!dead || (dead * 10 | 0) % 2) {
        const x = pc * S, y = yOf(pr) - (hop > 0 ? 3 : 0);
        c.fillStyle = R[0]; c.fillRect(x + 2, y + 2, 6, 7); c.fillStyle = R[3]; c.fillRect(x + 3, y + 3, 1, 1); c.fillRect(x + 6, y + 3, 1, 1);
      }
      feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: R[0], y: 60 });
    },
    down(x, y) { ready.go(); pd = { x, y }; },
    up(x, y) {
      if (!pd) return; const dx = x - pd.x, dy = y - pd.y; pd = null;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) go(Math.sign(dx), 0);
      else if (dy > 8) go(0, -1);
      else go(0, 1);
    },
    key(k, d) { if (!d) return; ready.go(); ({ ArrowUp: () => go(0, 1), ArrowDown: () => go(0, -1), ArrowLeft: () => go(-1, 0), ArrowRight: () => go(1, 0) })[k]?.(); },
  };
}

export default {
  id: 'road-hopper', title: 'Road Hopper', tag: 'Pocket · Arcade', retro: true, w: W, h: H, pal: 'mint',
  hint: 'Tap to hop forward, swipe sideways to dodge. Keep moving or the screen leaves you behind.',
  goal: 30,
  make,
};
