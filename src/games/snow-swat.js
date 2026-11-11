import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { rnd } = gs.util, { Feel } = gs.effects, { Ready } = gs.rounds;
const text = gs.pixel.text;

// Snow Swat: a snowball fight at dusk, and all you have is a sledge lid. Kids pop up behind the snow
// forts and lob snowballs in high arcs. Tap the left or right side to swat that way: a swat that meets
// a snowball knocks it away, and a late, close one sends it right back at whoever threw it. Giant
// snowballs roll in along the ground and need a swat (big ones need three). Hold, then let go, to spin
// and swat both sides at once, but you are dizzy for a moment afterwards.
const W = 160, H = 176, GY = 154, KX = 80, GRAV = 230;
const SLOTS = [{ x: 22, y: GY - 20, side: -1 }, { x: 9, y: GY - 58, side: -1 }, { x: 138, y: GY - 20, side: 1 }, { x: 151, y: GY - 58, side: 1 }];
const HATS = ['#e04848', '#48b060', '#a060d8', '#f0a030'];
const lob = (x, y, tx, ty, T) => ({ vx: (tx - x) / T, vy: (ty - y) / T - .5 * GRAV * T });

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // nobody throws until the first swat
  let kids, rollers, balls, swing, hp, score, combo, t, spawnT, held, msg, hurtT, dizzy;

  const snow = (x, y, n = 6) => feel.juice.burst(x, y, { n, speed: 60, life: .4, size: 2, color: ['#ffffff', '#c8d8f0'] });
  function hurt() {
    if (hurtT > 0) return; hp--; hurtT = .9; combo = 0; haptic('heavy'); sfx(140, .25, 'sawtooth', .05, -60);
    feel.juice.shake(4); snow(KX, GY - 12, 10);
  }
  function swat(dir) {                                   // dir -1 or 1; 0 is the spin, which reaches both sides
    if (dizzy > 0 || (swing && swing.t > .06)) return;
    swing = { dir, t: dir ? .2 : .36 }; sfx(dir ? 520 + Math.random() * 60 : 300, dir ? .08 : .3, 'sawtooth', .025, 500); haptic('light');
    for (const r of rollers) if ((!dir || Math.sign(r.x - KX) === dir) && Math.abs(r.x - KX) < 24 + r.size) {
      r.hp--; r.kb = .18; r.x += Math.sign(r.x - KX) * 10; snow(r.x, GY - r.size, 6); sfx(220, .06, 'square', .04, -80);
      if (r.hp <= 0) { r.dead = true; combo++; score += r.big ? 3 : 1; api.score(score); haptic('medium'); snow(r.x, GY - r.size, 14); }
    }
  }
  return {
    reset() {
      kids = []; rollers = []; balls = []; swing = null; hp = 5; score = 0; combo = 0; t = 0; spawnT = .6; held = null; msg = null; hurtT = 0; dizzy = 0;
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt;
      if (!ready.update(dt)) return;
      hurtT = Math.max(0, hurtT - dt); dizzy = Math.max(0, dizzy - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (swing) { swing.t -= dt; if (swing.t <= 0) { if (!swing.dir) dizzy = .9; swing = null; } }
      if (held) held.t += dt;
      const lv = Math.min(1, ready.since / 110);
      spawnT -= dt;
      if (spawnT <= 0) {
        const free = SLOTS.filter(s => !kids.some(k => k.slot === s));
        if (free.length && kids.length < 3 && Math.random() < .64) kids.push({ slot: free[Math.random() * free.length | 0], up: 0, cd: rnd(.9, 1.5), hat: Math.random() * HATS.length | 0, out: 0 });
        else { const side = Math.random() < .5 ? -1 : 1, big = ready.since > 40 && Math.random() < .25; rollers.push({ x: KX + side * (W / 2 + 12), side, big, size: big ? 9 : 6, hp: big ? 3 : 1, kb: 0, roll: 0 }); }
        spawnT = Math.max(.8, 2.4 - lv * 1.5) * rnd(.7, 1.2);
      }
      for (const k of kids) {
        if (k.out) { k.out += dt; continue; }
        k.up = Math.min(1, k.up + dt * 4); k.cd -= dt;
        if (k.cd < .4 && k.cd + dt >= .4) sfx(1200, .04, 'square', .02);
        if (k.cd <= 0) {
          const T = 1.5 - lv * .45 + rnd(-.1, .1), s = k.slot;
          balls.push({ x: s.x - s.side * 4, y: s.y - 12, ...lob(s.x - s.side * 4, s.y - 12, KX, GY - 12, T), from: k });
          k.cd = rnd(1.8, 2.8) - lv * .6; sfx(700, .05, 'square', .02, -300);
        }
      }
      for (const r of rollers) {
        if (r.kb > 0) { r.kb -= dt; continue; }
        const sp = r.big ? 17 : 26; r.x -= r.side * sp * dt; r.roll += sp * dt / r.size;
        if (Math.abs(r.x - KX) < 7) { r.dead = true; snow(r.x, GY - r.size, 12); hurt(); }
      }
      for (const b of balls) {
        b.vy += GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y >= GY) { b.dead = true; snow(b.x, GY - 1, 3); continue; }
        if (b.back) {                                    // on its way back to the kid who threw it
          const k = b.from, s = k.slot;
          if (!k.out && Math.hypot(s.x - b.x, s.y - 8 - b.y) < 8) {
            k.out = .01; b.dead = true; combo++; score += 1 + (combo >= 5 ? 1 : 0); api.score(score);
            snow(s.x, s.y - 8, 12); haptic('medium'); sfx(160, .2, 'square', .05, -40);
            if (combo % 5 === 0) { msg = { txt: `STREAK ${combo}`, l: .9 }; feel.juice.pop(KX, GY - 44, 'x2', { color: '#fff2a0' }); }
          }
          continue;
        }
        if (b.stray) continue;
        const dx = b.x - KX, side = Math.sign(dx) || 1, near = Math.abs(dx);
        if (swing && (!swing.dir || swing.dir === side) && near < 19 && b.y > GY - 38) {
          const sweet = swing.dir && near < 12 && !b.from.out;                  // a late, close swat goes straight back
          if (sweet) { const s = b.from.slot; Object.assign(b, lob(b.x, b.y, s.x, s.y - 8, .55)); b.back = true; }
          else { b.stray = true; b.vx = side * rnd(60, 110); b.vy = -rnd(90, 150); }
          snow(b.x, b.y, 4); haptic(sweet ? 'medium' : 'light'); sfx(sweet ? 1500 : 1000, .06, 'square', .03, 200);
          continue;
        }
        if (near < 5 && b.y > GY - 22) { b.dead = true; hurt(); }
      }
      balls = balls.filter(b => !b.dead && b.x > -12 && b.x < W + 12 && b.y > -60);
      kids = kids.filter(k => k.out < .7); rollers = rollers.filter(r => !r.dead);
      if (hp <= 0) { haptic('error'); sfx(90, .7, 'sawtooth', .06, -40); return api.over(); }
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      // dusk sky, far pines, the snow
      const bands = ['#2a2350', '#3c2c62', '#5a3a74', '#8a4a78', '#c0646a', '#e89060'];
      bands.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 22, W, 22); });
      c.fillStyle = '#f6c890'; c.fillRect(0, 130, W, GY - 130);
      c.fillStyle = '#fff6d8'; for (let i = 0; i < 14; i++) c.fillRect((i * 47) % W, (i * 29) % 50, 1, 1);
      c.fillStyle = '#1e2c46'; for (let i = 0; i < 11; i++) { const x = i * 16 - 4, h = 14 + (i * 7) % 12; for (let j = 0; j < h; j += 2) c.fillRect(x + 8 - (j >> 1) % 8, GY - h + j - 4, 2 * ((j >> 1) % 8) + 1, 2); }
      c.fillStyle = '#e8f0fa'; c.fillRect(0, GY - 4, W, H - GY + 4); c.fillStyle = '#c0d0ea'; for (let i = 0; i < 9; i++) c.fillRect((i * 41) % W, GY + 4 + (i * 5) % 14, 9, 1);
      feel.begin(c);
      // kids behind the mounds and the fort walls
      for (const k of kids.filter(k => k.slot.y < GY - 40)) thrower(c, k, t);
      for (const s of [-1, 1]) { const x = s < 0 ? 0 : W - 22; c.fillStyle = '#d4e0f4'; c.fillRect(x, GY - 52, 22, 52); c.fillRect(x + (s < 0 ? 0 : -4), GY - 34, 26, 34); c.fillStyle = '#ffffff'; c.fillRect(x, GY - 52, 22, 3); }
      for (const k of kids.filter(k => k.slot.y >= GY - 40)) thrower(c, k, t);
      for (const s of [-1, 1]) { const x = s < 0 ? 8 : W - 36; c.fillStyle = '#d4e0f4'; c.fillRect(x, GY - 16, 28, 16); c.fillStyle = '#ffffff'; c.fillRect(x, GY - 16, 28, 2); c.fillStyle = '#aebfe0'; for (let i = 0; i < 3; i++) { c.fillRect(x + 4 + i * 9, GY - 10, 1, 4); c.fillRect(x + i * 9, GY - 5, 1, 4); } c.fillRect(x, GY - 11, 28, 1); c.fillRect(x, GY - 6, 28, 1); }
      for (const r of rollers) {
        const x = Math.round(r.x), y = GY - r.size, s = r.size;
        c.fillStyle = r.kb > 0 ? '#ffffff' : '#f4f8ff'; c.fillRect(x - s, y - s + 2, s * 2, s * 2 - 4); c.fillRect(x - s + 2, y - s, s * 2 - 4, s * 2);
        c.fillStyle = '#b4c6e6'; c.fillRect(x - s + 2, y + s - 2, s * 2 - 4, 2);
        for (let i = 0; i < 3; i++) { const a = r.roll * -r.side + i * 2.1; c.fillRect(Math.round(x + Math.cos(a) * s * .55), Math.round(y + Math.sin(a) * s * .55), 2, 2); }
      }
      // you, with the sledge lid
      const y = GY, blink = hurtT > 0 && (t * 16 | 0) % 2, crouch = held && held.t > .4 && !swing ? 2 : 0;
      if (!blink) {
        c.fillStyle = '#3a2a22'; c.fillRect(KX - 4, y - 4, 3, 4); c.fillRect(KX + 1, y - 4, 3, 4);
        c.fillStyle = '#2a9d8f'; c.fillRect(KX - 5, y - 14 + crouch, 10, 10 - crouch); c.fillStyle = '#1f7a70'; c.fillRect(KX - 5, y - 6, 10, 2);
        c.fillStyle = '#f08830'; c.fillRect(KX - 5, y - 15 + crouch, 10, 2);
        c.fillStyle = '#f2c8a0'; c.fillRect(KX - 3, y - 20 + crouch, 6, 5); c.fillStyle = '#101018'; c.fillRect(KX - 2, y - 18 + crouch, 1, 1); c.fillRect(KX + 1, y - 18 + crouch, 1, 1);
        c.fillStyle = '#f8d838'; c.fillRect(KX - 4, y - 23 + crouch, 8, 3); c.fillStyle = '#ffffff'; c.fillRect(KX - 1, y - 25 + crouch, 2, 2);
      }
      let a = -1.57, reach = 9;                           // where the lid is: up when ready, sweeping when swatting
      if (swing && swing.dir) { const k = 1 - swing.t / .2; a = -1.57 + swing.dir * (-.5 + k * 2.3); reach = 13; }
      else if (swing) { a = -1.57 + (1 - swing.t / .36) * 6.283; reach = 13; }
      else if (dizzy > 0) { a = 1.2; reach = 8; }
      const lx = Math.round(KX + Math.cos(a) * reach), ly = Math.round(y - 12 + Math.sin(a) * reach);
      c.fillStyle = '#7a4a20'; c.fillRect(lx - 4, ly - 4, 8, 8); c.fillRect(lx - 5, ly - 2, 10, 4); c.fillRect(lx - 2, ly - 5, 4, 10);
      c.fillStyle = '#c88a48'; c.fillRect(lx - 3, ly - 3, 6, 6); c.fillStyle = '#e8b878'; c.fillRect(lx - 2, ly - 2, 2, 2);
      if (crouch && (t * 10 | 0) % 2) { c.fillStyle = '#fff2a0'; c.fillRect(lx - 7, ly - 7, 2, 2); c.fillRect(lx + 5, ly - 6, 2, 2); c.fillRect(lx - 1, ly - 9, 2, 2); }
      if (dizzy > 0) for (let i = 0; i < 3; i++) { const d = t * 7 + i * 2.1; c.fillStyle = '#fff2a0'; c.fillRect(Math.round(KX + Math.cos(d) * 7), Math.round(y - 27 + Math.sin(d) * 2), 2, 2); }
      for (const b of balls) {
        c.fillStyle = '#7890c0'; c.fillRect(Math.round(b.x) - 2, GY - 1, 4, 1);          // its shadow on the snow
        const x = Math.round(b.x), by = Math.round(b.y);
        c.fillStyle = b.back ? '#fff2a0' : '#ffffff'; c.fillRect(x - 2, by - 1, 4, 3); c.fillRect(x - 1, by - 2, 2, 5);
        c.fillStyle = '#b4c6e6'; c.fillRect(x - 1, by + 1, 3, 1);
      }
      feel.end(c, W, H);
      for (let i = 0; i < 5; i++) { c.fillStyle = '#101018'; c.fillRect(3 + i * 8, 3, 7, 7); c.fillStyle = i < hp ? '#e04848' : '#4a3a5a'; c.fillRect(4 + i * 8, 4, 5, 5); if (i < hp) { c.fillStyle = '#f8a0a0'; c.fillRect(4 + i * 8, 4, 2, 2); } }
      if (combo >= 2) text(c, 'STREAK ' + combo, W - 3, 4, { color: '#fff2a0', align: 'right', shadow: '#101018' });
      if (msg) text(c, msg.txt, W / 2, 60, { color: '#ffffff', align: 'center', shadow: '#101018' });
      ready.draw(c, W, H, { pixel: true, color: '#ffffff', shadow: '#101018', y: 96, text: 'TAP A SIDE TO SWAT' });
    },
    down(x) { ready.go(); held = { t: 0 }; swat(x < W / 2 ? -1 : 1); },
    up() { if (held && held.t > .4) swat(0); held = null; },
    key(k, d) {
      if (k === ' ') { if (d) { ready.go(); held = held || { t: 0 }; } else { if (held && held.t > .4) swat(0); held = null; } return; }
      if (!d) return; ready.go();
      if (k === 'ArrowLeft') swat(-1); if (k === 'ArrowRight') swat(1);
    },
  };
}

function thrower(c, k, t) {
  const s = k.slot, x = s.x, rise = Math.round((1 - k.up) * 14), wind = k.cd < .4 && !k.out;
  const y = s.y + rise + (k.out ? Math.round(k.out * 60) : 0), lean = k.out ? s.side * Math.round(k.out * 14) : 0;
  c.fillStyle = '#4858a8'; c.fillRect(x - 4 + lean, y - 8, 8, 9);
  c.fillStyle = '#f2c8a0'; c.fillRect(x - 3 + lean, y - 13, 6, 5); c.fillStyle = '#101018'; c.fillRect(x - s.side * 2 + lean, y - 11, 1, 1);
  c.fillStyle = HATS[k.hat]; c.fillRect(x - 4 + lean, y - 16, 8, 3); c.fillStyle = '#ffffff'; c.fillRect(x - 1 + lean, y - 18, 2, 2);
  if (!k.out) {                                           // the throwing arm, with a snowball in the mitten while winding up
    c.fillStyle = '#4858a8'; c.fillRect(x - s.side * 6, wind ? y - 14 : y - 7, 2, 6);
    if (wind && (t * 20 | 0) % 2) { c.fillStyle = '#ffffff'; c.fillRect(x - s.side * 6 - 1, y - 18, 4, 4); }
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'snow-swat', title: 'Snow Swat', tag: 'Advance · Action', retro: true, era: 'advance', pal: 'grape', w: W, h: H, goal: 30, music: 'happy',
  hint: 'Tap the left or right side to swat that way. A late, close swat sends a snowball back at the kid who threw it. Swat the giant snowballs before they reach you. Hold and let go to spin.',
  make,
};
