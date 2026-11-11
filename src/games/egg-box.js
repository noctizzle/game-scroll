import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { PAL } = gs.palettes, { Feel } = gs.effects, { Ready } = gs.rounds, { clamp } = gs.util;
const text = gs.pixel.text;

// Egg Box: two hens on a beam drop eggs, and you slide a five-cup egg box along the floor.
// An egg only fits in an EMPTY cup, so the fuller the box gets the more exactly it has to be placed.
// Fill all five cups and the box is packed and sent off for a bonus. A crow drops pebbles to dodge.
const P = PAL.amber, W = 160, H = 160;
const CW = 10, CUPS = 5, MAXC = 16 - CUPS;     // columns are 10 px; the box's left cup sits in column 0..11
const LO = 4, HI = 11;                          // eggs fall in columns 4..11, so every cup can reach every egg
const BEAM = 40, TOP = BEAM + 6, RIM = 134, FLOOR = 148;   // the hens' beam, where eggs start, the box's rim, the floor

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds; particles in the four shades
  const ready = new Ready({ eat: false });                               // nothing drops until the first drag
  let hens, crow, eggs, cups, col, cx, pd, score, breaks, boxes, spawn, t, packed, splats;

  const speed = () => Math.min(95, 42 + score * .55);
  function smash(x, y) {
    breaks++; haptic('error'); sfx(130, .22, 'square', .05, -50);
    feel.juice.shake(3).burst(x, y, { n: 8, speed: 50, life: .4, size: 2, color: [P[3], P[1]] });
    if (breaks >= 3) api.over();
  }
  function land(e) {
    const x = e.col * CW + 5, i = e.col - col;
    if (i < 0 || i >= CUPS) {                                   // missed the box
      if (e.kind === 'rock') { sfx(180, .04, 'square', .02); return; }   // a pebble on the floor does no harm
      splats.push({ x, l: 1.4 }); return smash(x, FLOOR - 2);
    }
    if (e.kind === 'rock') {                                    // a pebble in the box: it cracks what is in that cup
      if (cups[i]) cups[i] = 0;
      return smash(x, RIM);
    }
    if (cups[i]) return smash(x, RIM - 2);                      // the cup already has an egg
    cups[i] = e.kind === 'gold' ? 2 : 1;
    const pts = e.kind === 'gold' ? 3 : 1; score += pts; api.score(score);
    haptic(e.kind === 'gold' ? 'medium' : 'light'); sfx(e.kind === 'gold' ? 990 : 700 + i * 40, .05, 'square', .04, 120);
    feel.juice.burst(x, RIM, { n: 4, speed: 30, life: .25, size: 1, color: [P[3], P[0]] });
    if (pts > 1) feel.juice.pop(x, RIM - 12, '+3', { color: P[0] });
    if (cups.every(v => v)) {                                   // a full box is packed and sent off
      boxes++; score += 5; api.score(score); packed = { x: col * CW, y: RIM, l: .7, cups: cups.slice() }; cups = cups.map(() => 0);
      haptic('success'); sfx(520, .08, 'square', .04, 300); sfx(780, .12, 'square', .04, 300);
      feel.juice.pop(col * CW + 25, RIM - 14, 'BOX +5', { color: P[0] });
    }
  }
  function lay() {
    const h = hens[Math.random() * hens.length | 0];
    const gold = score > 6 && Math.random() < .1;
    h.squat = .25; eggs.push({ col: h.col, y: TOP, kind: gold ? 'gold' : 'egg' });
    sfx(gold ? 660 : 420, .03, 'square', .02);
  }

  return {
    reset() {
      hens = [{ col: 5, to: 5, lo: LO, hi: 7, wait: 0, squat: 0, x: 50 }, { col: 10, to: 10, lo: 8, hi: HI, wait: 0, squat: 0, x: 100 }];
      crow = null; eggs = []; cups = Array(CUPS).fill(0); col = 5; cx = col * CW; pd = null;
      score = 0; breaks = 0; boxes = 0; spawn = .5; t = 0; packed = null; splats = [];
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt;
      cx += clamp(col * CW - cx, -260 * dt, 260 * dt);           // the box slides to its column
      if (!ready.update(dt)) return;
      for (const h of hens) {                                    // hens wander along their half of the beam
        h.squat = Math.max(0, h.squat - dt);
        const tx = h.to * CW; h.x += clamp(tx - h.x, -30 * dt, 30 * dt);
        if (Math.abs(tx - h.x) < .5) { h.col = h.to; h.wait -= dt; if (h.wait <= 0) { h.to = h.lo + (Math.random() * (h.hi - h.lo + 1) | 0); h.wait = .4 + Math.random() * .8; } }
      }
      spawn -= dt;
      if (spawn <= 0) { spawn = Math.max(.5, 1.35 - score * .012) * (.75 + Math.random() * .5); lay(); }
      if (!crow && score >= 12 && Math.random() < dt * .16) { const d = Math.random() < .5 ? 1 : -1; crow = { x: d > 0 ? -10 : W + 10, d, at: LO + (Math.random() * (HI - LO + 1) | 0), done: false }; }
      if (crow) {
        crow.x += crow.d * 62 * dt;
        if (!crow.done && (crow.x - (crow.at * CW + 5)) * crow.d >= 0) { crow.done = true; eggs.push({ col: crow.at, y: 30, kind: 'rock' }); sfx(240, .05, 'square', .03, -80); }
        if (crow.x < -14 || crow.x > W + 14) crow = null;
      }
      const v = speed();
      for (const e of eggs) {
        e.y += v * (e.kind === 'rock' ? 1.25 : 1) * dt;
        const i = e.col - col, over = i >= 0 && i < CUPS;
        if (!e.hit && over && e.y >= RIM - 4) { e.hit = true; land(e); }
        else if (!e.hit && e.y >= FLOOR - 4) { e.hit = true; land(e); }
      }
      eggs = eggs.filter(e => !e.hit);
      for (const s of splats) s.l -= dt; splats = splats.filter(s => s.l > 0);
      if (packed) { packed.l -= dt; packed.y -= 50 * dt; if (packed.l <= 0) packed = null; }
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      c.fillStyle = P[2]; c.fillRect(0, 0, W, H);                                   // barn wall
      c.fillStyle = P[1]; for (let x = 19; x < W; x += 40) c.fillRect(x, BEAM + 2, 1, FLOOR - BEAM - 2);   // plank joins
      c.fillStyle = P[1]; c.fillRect(0, BEAM, W, 3); c.fillStyle = P[0]; c.fillRect(0, BEAM + 3, W, 1);   // the beam
      c.fillStyle = P[1]; c.fillRect(0, FLOOR, W, H - FLOOR); c.fillStyle = P[0]; c.fillRect(0, FLOOR, W, 1);   // floor
      c.fillStyle = P[2]; for (let i = 0; i < 9; i++) c.fillRect(6 + i * 18, FLOOR + 4 + (i % 3) * 3, 7, 1);    // straw
      feel.begin(c);
      for (const h of hens) hen(c, Math.round(h.x), BEAM - 11 + (h.squat > 0 ? 2 : 0), (t * 2 + h.lo | 0) % 2);
      if (crow) bird(c, Math.round(crow.x), 20, crow.d, (t * 8 | 0) % 2);
      for (const e of eggs) {
        const x = e.col * CW + 2, y = Math.round(e.y) - 4;
        if (e.kind === 'rock') { c.fillStyle = P[0]; c.fillRect(x, y + 1, 6, 5); c.fillRect(x + 1, y, 4, 7); c.fillStyle = P[1]; c.fillRect(x + 1, y + 1, 2, 2); }
        else egg(c, x, y, e.kind === 'gold' ? P[1] : P[3]);
      }
      for (const s of splats) { c.fillStyle = P[3]; c.fillRect(s.x - 5, FLOOR - 1, 10, 2); c.fillStyle = P[2]; c.fillRect(s.x - 2, FLOOR - 2, 4, 2); }
      box(c, Math.round(cx), RIM, cups);
      if (packed) { box(c, Math.round(packed.x), Math.round(packed.y), packed.cups); c.fillStyle = P[0]; c.fillRect(Math.round(packed.x), Math.round(packed.y) + 3, CUPS * CW, 2); }
      feel.end(c, W, H);
      for (let i = 0; i < 3; i++) egg(c, W - 9 - i * 9, 3, i < breaks ? P[0] : P[3]);   // eggs you can still break
      text(c, 'BOX ' + boxes, 3, 4, { color: P[0] });
      ready.draw(c, W, H, { pixel: true, color: P[0], y: 80, text: 'DRAG TO START' });
    },
    down(x) { ready.go(); pd = { x, col, moved: false }; },
    move(x, y, pressed) {
      if (!pressed || !pd) return;
      const n = clamp(pd.col + Math.round((x - pd.x) / CW), 0, MAXC);
      if (Math.abs(x - pd.x) > 3) pd.moved = true;
      if (n !== col) { col = n; haptic('tick'); }
    },
    up(x) { if (pd && !pd.moved) { const n = clamp(Math.floor(x / CW) - 2, 0, MAXC); if (n !== col) { col = n; sfx(300, .02, 'square', .02); haptic('tick'); } } pd = null; },   // a tap brings the box under your finger
    key(k, d) {
      if (!d) return; ready.go();
      if (k === 'ArrowLeft') col = clamp(col - 1, 0, MAXC);
      if (k === 'ArrowRight') col = clamp(col + 1, 0, MAXC);
    },
  };
}

function egg(c, x, y, fill) {                       // 6 x 7 pixels
  c.fillStyle = P[0]; c.fillRect(x + 1, y, 4, 7); c.fillRect(x, y + 2, 6, 4);
  c.fillStyle = fill; c.fillRect(x + 2, y + 1, 2, 5); c.fillRect(x + 1, y + 2, 4, 3);
}
function hen(c, x, y, peck) {                       // sits on the beam, centred on its column
  c.fillStyle = P[0]; c.fillRect(x, y + 3, 11, 8); c.fillRect(x + 7, y + (peck ? 1 : 0), 5, 5);
  c.fillStyle = P[3]; c.fillRect(x + 1, y + 4, 9, 6); c.fillRect(x + 8, y + 1 + (peck ? 1 : 0), 3, 3);
  c.fillStyle = P[1]; c.fillRect(x + 2, y + 6, 5, 3); c.fillRect(x + 8, y - 1 + (peck ? 1 : 0), 3, 1); c.fillRect(x + 12, y + 2 + (peck ? 1 : 0), 2, 1);
  c.fillStyle = P[0]; c.fillRect(x + 10, y + 2 + (peck ? 1 : 0), 1, 1);
}
function bird(c, x, y, d, flap) {
  c.fillStyle = P[0]; c.fillRect(x - 4, y + 2, 9, 4); c.fillRect(x + (d > 0 ? 4 : -6), y + 1, 3, 3);
  c.fillRect(x - 2, y + (flap ? -2 : 5), 5, 3);
  c.fillStyle = P[1]; c.fillRect(x + (d > 0 ? 7 : -8), y + 2, 2, 1);
}
function box(c, x, y, cups) {                       // five cups, each one column wide
  c.fillStyle = P[0]; c.fillRect(x, y + 3, CUPS * CW, 11);
  c.fillStyle = P[3]; c.fillRect(x + 1, y + 4, CUPS * CW - 2, 9);
  for (let i = 0; i < CUPS; i++) {
    const X = x + i * CW;
    c.fillStyle = P[0]; c.fillRect(X, y + 3, 1, 11); c.fillRect(X + CW - 1, y + 3, 1, 11);
    c.fillStyle = P[1]; c.fillRect(X + 2, y + 9, 6, 3);
    if (cups[i]) egg(c, X + 2, y - 1, cups[i] === 2 ? P[1] : P[3]);
    if (cups[i]) { c.fillStyle = P[3]; c.fillRect(X + 1, y + 5, 8, 8); c.fillStyle = P[0]; c.fillRect(X + 1, y + 5, 8, 1); }   // the cup hides the egg's lower half
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'egg-box', title: 'Egg Box', tag: 'Pocket · Reflex', retro: true, w: W, h: H, pal: 'amber', goal: 60, music: 'silly',
  hint: 'Drag the egg box so each falling egg lands in an empty cup. Fill all five to pack the box. Three broken eggs and it is over.',
  make,
};
