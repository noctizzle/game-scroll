import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { rnd } = gs.util, { Feel } = gs.effects, { Ready } = gs.rounds;
const text = gs.pixel.text;

// Boomerang Fox: a fox trots through an autumn wood on its own. Tap the right side to jump (once
// more in the air), tap the left side to throw the boomerang: it flies out, turns and comes back, and
// you cannot throw again until you have caught it. It hits on the way out and on the way back, so
// jump and throw to reach the crows. Hedgehogs are too prickly to land on. Glowing beetles drop a
// charm that changes the boomerang for a while: WIDE weaves high and low, FIRE goes through everything
// and flies further, TWIN throws a second one up at an angle.
const W = 176, H = 160, GY = H - 18, HERO = 52, GRAV = 520, JUMP = 185, HOP = 150;
const CHARM = { WIDE: '#70d8f0', FIRE: '#f86838', TWIN: '#c890ff' }, NAMES = Object.keys(CHARM);

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // the fox waits for the first tap
  let grounds, foes, thorns, nuts, charms, rangs, p, cam, genX, score, dist, t, hp, power, powT, msg, dead;

  function gen(to) {
    const lvl = Math.min(1, dist / 3000);
    while (genX < to) {
      const gap = genX < 200 ? 0 : rnd(18, 30 + lvl * 24), seg = rnd(80, 170 - lvl * 40), lift = genX < 200 || Math.random() > .3 ? 0 : -rnd(8, 18);
      genX += gap; grounds.push({ x: genX, y: GY + lift, w: seg });
      if (genX > 160) {
        const r = Math.random(), x = genX + rnd(24, seg - 20);
        if (r < .6) { const k = Math.random() < .35 ? 'hog' : 'beetle'; foes.push({ k, x, y: GY + lift - 5, vx: -12 - lvl * 14, lo: genX + 4, hi: genX + seg - 4, charm: k === 'beetle' && Math.random() < .4 ? NAMES[Math.random() * 3 | 0] : null }); }
        else if (r < .78 && seg > 90) thorns.push({ x: genX + seg / 2 - 6, y: GY + lift, w: 12 });
        if (Math.random() < .35 + lvl * .2) foes.push({ k: 'crow', x: genX + seg + rnd(0, 40), y: GY - rnd(36, 62), vx: -24 - lvl * 16, ph: rnd(0, 6) });
        if (Math.random() < .5) for (let i = 0; i < 3; i++) nuts.push({ x: genX - gap / 2 + i * 10 - 10, y: GY - 26 - Math.sin(i / 2 * Math.PI) * 10 });
      }
      genX += seg;
    }
  }
  function groundAt(x, y0, y1) { for (const s of grounds) if (x + 5 > s.x && x - 5 < s.x + s.w && y0 <= s.y + 1 && y1 >= s.y) return s; return null; }
  function hurt() {
    if (p.inv > 0) return; hp--; p.inv = 1.4; haptic('heavy'); sfx(150, .25, 'sawtooth', .05, -60); feel.juice.shake(4);
    if (hp <= 0) { dead = .01; sfx(110, .7, 'square', .05, -50); }
  }
  const sx = x => x - cam;                                 // world to screen
  function kill(f, pts) {
    f.dead = true; score += pts; api.score(score); sfx(700, .07, 'square', .04, 300); haptic('medium');
    feel.juice.burst(sx(f.x), f.y, { n: 8, speed: 70, life: .4, size: 2, color: f.k === 'crow' ? ['#3a3048', '#f8f8f0'] : f.k === 'hog' ? ['#8a6a4a', '#f8f8f0'] : ['#48a060', '#f8f8f0'] }).pop(sx(f.x), f.y - 10, '+' + pts, { color: '#fff2a0' });
    if (f.charm) charms.push({ kind: f.charm, x: f.x, y: f.y - 4 });
  }
  function fling() {
    if (dead || rangs.length) return;
    const fire = power === 'FIRE', v = fire ? 330 : 250;
    rangs.push({ x: p.x + 6, y: p.y - 2, vx: v, vy: 0, t: 0, y0: p.y - 2, back: false });
    if (power === 'TWIN') rangs.push({ x: p.x + 6, y: p.y - 2, vx: v * .8, vy: -150, t: 0, y0: p.y - 2, back: false, up: true });
    sfx(fire ? 300 : 520, .12, 'triangle', .04, 400); haptic('light');
  }
  function jump() {
    if (dead) return;
    if (p.ground) { p.vy = -JUMP; p.ground = false; p.hop = 1; sfx(500, .07, 'square', .04, 300); haptic('light'); }
    else if (p.hop > 0) { p.hop--; p.vy = -HOP; sfx(640, .05, 'square', .03, 200); haptic('tick'); feel.juice.burst(sx(p.x), p.y + 5, { n: 4, speed: 40, life: .25, size: 2, color: ['#f8f8f0'] }); }
  }

  return {
    reset() {
      grounds = []; foes = []; thorns = []; nuts = []; charms = []; rangs = []; genX = -60; score = 0; dist = 0; t = 0; hp = 4; power = null; powT = 0; dead = 0; msg = null; cam = 40 - HERO;
      gen(W + 200); p = { x: 40, y: GY - 6, vy: 0, ground: true, hop: 1, inv: 0 };
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; p.vy += GRAV * dt; p.y += p.vy * dt; if (dead > 1.3) return api.over(); return; }
      if (!ready.update(dt)) return;
      p.inv = Math.max(0, p.inv - dt);
      if (power) { powT -= dt; if (powT <= 0) { msg = { txt: power + ' WORE OFF', l: 1 }; power = null; } }
      const walk = 46 + Math.min(34, dist / 120); p.x += walk * dt;
      for (const s of grounds) if (p.x + 6 > s.x && p.x - 6 < s.x + 4 && p.y + 5 > s.y + 1) p.x = s.x - 6;      // a step up is a wall until you jump
      dist = Math.max(dist, p.x);
      p.vy += GRAV * dt; const y0 = p.y; p.y += p.vy * dt; p.ground = false;
      if (p.vy >= 0) { const s = groundAt(p.x, y0 + 6, p.y + 6); if (s) { p.y = s.y - 6; p.vy = 0; p.ground = true; p.hop = 1; } }
      if (p.y > H + 20) { hurt(); if (!dead) { const s = grounds.find(s => s.x + s.w > p.x + 10) || grounds[grounds.length - 1]; p.x = Math.max(p.x, s.x + 8); p.y = s.y - 40; p.vy = 0; p.hop = 1; } }
      cam = p.x - HERO; gen(cam + W + 200);
      grounds = grounds.filter(s => s.x + s.w > cam - 40); thorns = thorns.filter(s => s.x > cam - 40);
      for (const n of nuts) if (Math.abs(n.x - p.x) < 8 && Math.abs(n.y - p.y) < 9) { n.got = true; score += 2; api.score(score); sfx(1200, .05, 'square', .03, 200); }
      nuts = nuts.filter(n => n.x > cam - 40 && !n.got);
      for (const ch of charms) {                             // a charm drifts to the fox
        const dx = p.x - ch.x, dy = p.y - ch.y, d = Math.hypot(dx, dy) || 1; ch.x += dx / d * 110 * dt; ch.y += dy / d * 110 * dt;
        if (d < 9) { ch.got = true; power = ch.kind; powT = 15; msg = { txt: power + ' BOOMERANG', l: 1.2 }; haptic('success'); sfx(900, .3, 'square', .05, 600); feel.juice.burst(sx(p.x), p.y, { n: 12, speed: 80, life: .5, size: 2, color: [CHARM[power], '#f8f8f0'] }); }
      }
      charms = charms.filter(ch => !ch.got);
      for (const b of rangs) {
        b.t += dt;
        if (!b.back) {
          b.vx -= 620 * dt; b.x += (b.vx + walk) * dt;
          if (b.up) { b.vy += 260 * dt; b.y += b.vy * dt; } else if (power === 'WIDE') b.y = b.y0 + Math.sin(b.t * 13) * 20;
          if (b.vx <= 0) b.back = true;
        } else { const dx = p.x - b.x, dy = p.y - 2 - b.y, d = Math.hypot(dx, dy) || 1, v = 250 + walk; b.x += dx / d * v * dt; b.y += dy / d * v * dt; if (d < 9) { b.done = true; sfx(380, .04, 'square', .03, 100); haptic('tick'); } }
        const reach = power === 'WIDE' ? 12 : 9;
        for (const f of foes) if (!f.dead && Math.abs(f.x - b.x) < reach && Math.abs(f.y - b.y) < reach) { kill(f, 5); if (power !== 'FIRE') b.back = true; }
      }
      rangs = rangs.filter(b => !b.done);
      for (const f of foes) {
        if (f.dead || f.x < cam - 40) continue;
        f.x += f.vx * dt; if (f.k === 'crow') f.y += Math.sin(t * 3 + f.ph) * 22 * dt; else if (f.x < f.lo || f.x > f.hi) f.vx *= -1;
        const dx = f.x - p.x, dy = f.y - p.y;
        if (Math.hypot(dx, dy) < 10) { if (f.k === 'beetle' && p.vy > 60 && dy > 3) { kill(f, 4); p.vy = -150; p.hop = 1; } else hurt(); }
      }
      foes = foes.filter(f => !f.dead && f.x > cam - 60);
      for (const s of thorns) if (p.x + 4 > s.x && p.x - 4 < s.x + s.w && p.y + 6 > s.y - 5 && p.y < s.y) hurt();
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      const ox = -Math.round(cam);
      ['#f8e0a8', '#f8d090', '#f4bc78', '#eea868'].forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 36, W, 36); });
      c.fillStyle = '#d88848'; for (let i = 0; i < 5; i++) { const x = ((i * 130 - cam * .25) % (W + 140) + W + 140) % (W + 140) - 70; for (let j = 0; j < 20; j++) c.fillRect(Math.round(x - 50 + j * 2.5), GY - j * 2 + 4, Math.round(100 - j * 5), 2); }
      for (let i = 0; i < 7; i++) {                           // trees further back
        const x = Math.round(((i * 83 - cam * .5) % (W + 80) + W + 80) % (W + 80) - 40), h = 44 + (i * 17) % 26, col = ['#d05830', '#e88830', '#c04028', '#e8a838'][i % 4];
        c.fillStyle = '#6a4028'; c.fillRect(x - 2, GY - h, 4, h); c.fillStyle = col; c.fillRect(x - 12, GY - h - 14, 24, 18); c.fillRect(x - 8, GY - h - 20, 16, 30); c.fillStyle = '#f8c868'; c.fillRect(x - 8, GY - h - 14, 5, 3);
      }
      for (const s of grounds) {
        const x = s.x + ox; if (x > W || x + s.w < 0) continue;
        c.fillStyle = '#7a4a2a'; c.fillRect(x, s.y, s.w, H - s.y); c.fillStyle = '#8a9a38'; c.fillRect(x, s.y, s.w, 3);
        for (let i = 3; i < s.w - 3; i += 7) { c.fillStyle = ['#e88830', '#d05830', '#f8c848'][(i + (s.x | 0)) % 3]; c.fillRect(x + i, s.y + 1 + (i % 2), 3, 2); }
        c.fillStyle = '#5e3820'; for (let i = 6; i < s.w; i += 14) c.fillRect(x + i, s.y + 9 + (i % 3) * 3, 3, 2);
      }
      for (const s of thorns) { const x = s.x + ox; c.fillStyle = '#5a6a28'; c.fillRect(x, s.y - 3, s.w, 3); c.fillStyle = '#3a4418'; for (let i = 0; i < s.w; i += 4) { c.fillRect(x + i + 1, s.y - 6, 2, 3); c.fillRect(x + i + 1.5 | 0, s.y - 7, 1, 1); } }
      for (const n of nuts) { const x = n.x + ox; c.fillStyle = '#6a4028'; c.fillRect(x - 2, n.y - 3, 5, 2); c.fillStyle = '#c88840'; c.fillRect(x - 2, n.y - 1, 5, 4); c.fillRect(x - 1, n.y + 3, 3, 1); }
      feel.begin(c);
      for (const f of foes) {
        const x = Math.round(f.x + ox), y = Math.round(f.y); if (x < -20 || x > W + 20) continue;
        if (f.charm && (t * 5 | 0) % 2) { c.fillStyle = CHARM[f.charm]; c.fillRect(x - 8, y - 8, 16, 1); c.fillRect(x - 8, y + 6, 16, 1); c.fillRect(x - 8, y - 8, 1, 15); c.fillRect(x + 7, y - 8, 1, 15); }
        if (f.k === 'crow') { c.fillStyle = '#3a3048'; c.fillRect(x - 5, y - 3, 10, 6); c.fillRect(x - 2, (t * 8 | 0) % 2 ? y - 7 : y + 2, 7, 3); c.fillStyle = '#f8a020'; c.fillRect(x - 8, y - 1, 3, 2); c.fillStyle = '#f8f8f0'; c.fillRect(x - 4, y - 2, 1, 1); }
        else if (f.k === 'hog') { c.fillStyle = '#5a4030'; c.fillRect(x - 6, y - 5, 12, 9); for (let i = -6; i < 6; i += 3) c.fillRect(x + i, y - 7 - ((i + 6) / 3 % 2), 2, 3); c.fillStyle = '#d8b088'; c.fillRect(x - 8, y, 4, 4); c.fillStyle = '#101018'; c.fillRect(x - 7, y + 1, 1, 1); c.fillRect(x - 9, y + 2, 1, 1); }
        else { c.fillStyle = f.charm ? CHARM[f.charm] : '#48a060'; c.fillRect(x - 5, y - 4, 10, 8); c.fillRect(x - 4, y - 5, 8, 10); c.fillStyle = '#101018'; c.fillRect(x, y - 5, 1, 10); c.fillRect(x - 7, y - 1, 2, 3); c.fillRect(x - 6, y + 5, 2, 1); c.fillRect(x + 3, y + 5, 2, 1); }
      }
      for (const ch of charms) { const x = Math.round(ch.x + ox), y = Math.round(ch.y); c.fillStyle = '#f8f8f0'; c.fillRect(x - 3, y - 1, 7, 3); c.fillRect(x - 1, y - 3, 3, 7); c.fillStyle = CHARM[ch.kind]; c.fillRect(x - 1, y - 1, 3, 3); }
      // the fox
      const hx = Math.round(p.x + ox), hy = Math.round(p.y), step = p.ground && ready.playing ? (t * 10 | 0) % 2 : 0;
      if (!(p.inv > 0 && (t * 16 | 0) % 2)) {
        c.fillStyle = '#e06a28'; c.fillRect(hx - 12, hy - 3 + step, 6, 4); c.fillStyle = '#f8f8f0'; c.fillRect(hx - 14, hy - 4 + step, 3, 4);            // tail
        c.fillStyle = '#e06a28'; c.fillRect(hx - 6, hy - 3, 11, 7); c.fillRect(hx + 1, hy - 8, 7, 7); c.fillRect(hx + 1, hy - 11, 2, 3); c.fillRect(hx + 6, hy - 11, 2, 3);
        c.fillStyle = '#f8f8f0'; c.fillRect(hx + 5, hy - 4, 4, 3); c.fillRect(hx - 2, hy + 2, 6, 2);
        c.fillStyle = '#101018'; c.fillRect(hx + 5, hy - 6, 1, 2); c.fillRect(hx + 9, hy - 4, 1, 1);
        c.fillStyle = power ? CHARM[power] : '#3a6ac0'; c.fillRect(hx, hy - 2, 6, 2);                                                                      // scarf, the colour of the charm
        c.fillStyle = '#5e3820'; c.fillRect(hx - 5, hy + 4, 2, 2 - step); c.fillRect(hx + 2, hy + 4, 2, 1 + step);
      }
      for (const b of rangs) {
        const x = Math.round(b.x + ox), y = Math.round(b.y), f = (b.t * 22 | 0) % 4, col = power ? CHARM[power] : '#f8e8c0';
        const L = [[[-3, -3, 7, 2], [-3, -3, 2, 7]], [[-3, -3, 7, 2], [2, -3, 2, 7]], [[-3, 2, 7, 2], [2, -3, 2, 7]], [[-3, 2, 7, 2], [-3, -3, 2, 7]]][f];   // the bent stick, a quarter turn a frame
        c.fillStyle = '#101018'; for (const [dx, dy, w, h] of L) c.fillRect(x + dx - 1, y + dy - 1, w + 2, h + 2);
        c.fillStyle = col; for (const [dx, dy, w, h] of L) c.fillRect(x + dx, y + dy, w, h);
      }
      feel.end(c, W, H);
      for (let i = 0; i < 4; i++) { c.fillStyle = '#101018'; c.fillRect(3 + i * 8, 3, 7, 7); c.fillStyle = i < hp ? '#f85878' : '#6a5a50'; c.fillRect(4 + i * 8, 4, 5, 5); }
      if (power) { text(c, power, W - 4, 3, { color: CHARM[power], align: 'right', shadow: '#101018' }); c.fillStyle = '#101018'; c.fillRect(W - 35, 10, 32, 3); c.fillStyle = CHARM[power]; c.fillRect(W - 34, 11, Math.round(30 * powT / 15), 1); }
      if (ready.playing && ready.since < 8 && !dead) { text(c, 'TAP HERE: THROW', 3, H - 8, { color: '#f8f8f0', shadow: '#101018' }); text(c, 'TAP HERE: JUMP', W - 3, H - 8, { color: '#f8f8f0', align: 'right', shadow: '#101018' }); }
      if (msg) text(c, msg.txt, W / 2, 50, { color: '#f8f8f0', align: 'center', shadow: '#101018' });
      ready.draw(c, W, H, { pixel: true, color: '#f8f8f0', shadow: '#101018', y: 60, text: 'LEFT: THROW  RIGHT: JUMP' });
    },
    down(x) { ready.go(); if (x < W * .45) fling(); else jump(); },
    key(k, d) { if (!d) return; ready.go(); if (k === 'x' || k === 'z' || k === 'Shift' || k === 'ArrowLeft') fling(); else if (k === ' ' || k === 'ArrowUp') jump(); },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'boomerang-fox', title: 'Boomerang Fox', tag: 'Advance · Platformer', retro: true, era: 'advance', pal: 'lemon', w: W, h: H, goal: 150, music: 'happy',
  hint: 'The fox trots on its own. Tap the right side to jump, the left side to throw the boomerang, which comes back. Glowing beetles drop a charm that changes it for a while.',
  make,
};
