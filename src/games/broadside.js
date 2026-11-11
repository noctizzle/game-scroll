import gs from '../gamescroll.js';
const { sfx } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util, { Feel } = gs.effects, { Ready } = gs.rounds;
const text = gs.pixel.text;

// Broadside: two ships side by side, seen from above. Tap a plank on your deck to hop there; tap the
// other ship to fire your deck gun straight up your column (two damage from the front planks, one from
// the back). Gunners fire down their column, mortar crews mark the plank you stand on, and boarders
// swing across and sweep your front planks. Barrels land on your deck: step on one and your next shot
// is grapeshot (wide), chain shot (goes through) or a shell (splash). Rum barrels patch you up.
const W = 160, H = 176, COLS = 4, PW = 30, PH = 22, OX = 20, EY = 24, MY = 104;
const SHOTS = { GRAPE: '#f8d838', CHAIN: '#80f8ff', SHELL: '#f86060', RUM: '#88f070' };
const cellE = (c, r) => ({ x: OX + c * PW + PW / 2, y: EY + r * PH + PH / 2 });        // their deck: row 1 is the front
const cellM = (c, r) => ({ x: OX + c * PW + PW / 2, y: MY + r * PH + PH / 2 });        // your deck: row 0 is the front

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // own sounds and buzzes
  const ready = new Ready({ eat: false });                               // the other crew waits for your first move
  let me, foes, balls, marks, fx, barrel, barrelT, armed, hp, wave, score, t, fireCd, msg, waveT;

  function newWave() {
    wave++; foes = []; const n = Math.min(3, 1 + (wave > 1) + (wave > 3)), kinds = wave < 2 ? ['gunner'] : wave < 4 ? ['gunner', 'mortar'] : ['gunner', 'mortar', 'boarder'];
    const used = new Set();
    for (let i = 0; i < n; i++) {
      let c, r; do { c = Math.random() * COLS | 0; r = Math.random() * 2 | 0; } while (used.has(c + ',' + r)); used.add(c + ',' + r);
      const k = kinds[Math.random() * kinds.length | 0], base = { gunner: 6, mortar: 7, boarder: 9 }[k], max = Math.round(base * (1 + wave * .18));
      foes.push({ k, c, r, hp: max, max, cd: rnd(1.4, 2.4), moveT: rnd(1, 2), warn: 0, hit: 0, swing: null });
    }
    msg = { txt: 'CREW ' + wave, l: 1.2 };
  }
  const taken = (c, r) => foes.some(f => !f.dead && f.c === c && f.r === r);
  function damage(f, n) {
    if (!f || f.dead) return; const p = cellE(f.c, f.r); f.hp -= n; f.hit = .15; feel.juice.pop(p.x, p.y - 12, String(n), { color: '#f8f8f0' });
    if (f.hp <= 0) { f.dead = true; score++; api.score(score); haptic('medium'); sfx(180, .25, 'square', .05, -60); feel.juice.burst(p.x, p.y, { n: 12, speed: 80, life: .45, size: 2, color: ['#f86060', '#f8d838', '#f8f8f0'] }); }
    else { haptic('light'); sfx(600, .04, 'square', .03); }
  }
  function hurt(n) {
    if (me.inv > 0) return; const p = cellM(me.c, me.r); hp -= n; me.inv = .6; haptic('heavy'); sfx(140, .2, 'sawtooth', .05, -60);
    feel.juice.shake(4).pop(p.x, p.y - 14, '-' + n, { color: '#f86060' });
  }
  function fire() {
    if (fireCd > 0) return; fireCd = .35;
    const col = foes.filter(f => !f.dead && !f.swing && f.c === me.c).sort((a, b) => b.r - a.r), kind = armed, from = cellM(me.c, me.r); armed = null;
    const first = col[0], to = first ? cellE(first.c, first.r).y : EY - 10;
    fx.push({ shot: true, x: from.x, y0: from.y - 10, y1: kind === 'CHAIN' ? EY - 10 : to, l: .12, col: kind ? SHOTS[kind] : '#101018' });
    if (!kind) { damage(first, me.r === 0 ? 2 : 1); sfx(160, .08, 'square', .05, -40); haptic('tick'); return; }
    haptic('medium'); feel.juice.shake(2);
    if (kind === 'CHAIN') { for (const f of col) damage(f, 4); sfx(900, .12, 'sawtooth', .04, -500); }
    else if (kind === 'GRAPE') { for (const f of foes.filter(f => !f.dead && !f.swing && Math.abs(f.c - me.c) <= 1)) damage(f, 2); for (const d of [-1, 1]) if (me.c + d >= 0 && me.c + d < COLS) fx.push({ shot: true, x: from.x + d * PW, y0: from.y - 10, y1: EY - 10, l: .12, col: SHOTS.GRAPE }); sfx(300, .15, 'square', .05, -100); }
    else { const c = me.c, r = first ? first.r : 1; damage(first, 5); for (const f of foes) if (f !== first && !f.swing && Math.abs(f.c - c) + Math.abs(f.r - r) === 1) damage(f, 2); fx.push({ boom: true, p: cellE(c, r), l: .25 }); sfx(100, .25, 'square', .06, -30); }
  }
  function hop(c, r) {
    if (c === me.c && r === me.r) return fire();
    me.c = c; me.r = r; haptic('tick'); sfx(300, .03, 'square', .02, 200);
    if (barrel && barrel.c === c && barrel.r === r) {
      const p = cellM(c, r);
      if (barrel.kind === 'RUM') { hp = Math.min(20, hp + 5); feel.juice.pop(p.x, p.y - 14, '+5', { color: SHOTS.RUM }); sfx(800, .2, 'triangle', .05, 400); }
      else { armed = barrel.kind; feel.juice.pop(p.x, p.y - 14, armed, { color: SHOTS[armed] }); sfx(1000, .08, 'square', .04, 300); }
      barrel = null; barrelT = rnd(4, 6); haptic('success');
    }
  }
  return {
    reset() {
      me = { c: 1, r: 0, inv: 0 }; foes = []; balls = []; marks = []; fx = []; barrel = null; barrelT = 3; armed = null; hp = 20; wave = 0; score = 0; t = 0; fireCd = 0; msg = null; waveT = .3;
      feel.clear(); ready.reset();
    },
    update(dt) {
      feel.update(dt); t += dt;
      for (const f of fx) f.l -= dt; fx = fx.filter(f => f.l > 0);
      if (!ready.update(dt)) return;
      fireCd -= dt; me.inv = Math.max(0, me.inv - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (!foes.length) { waveT -= dt; if (waveT <= 0) { newWave(); waveT = 1.6; } }
      if (!barrel) { barrelT -= dt; if (barrelT <= 0) { let c, r; do { c = Math.random() * COLS | 0; r = Math.random() * 2 | 0; } while (c === me.c && r === me.r); const k = Math.random(); barrel = { c, r, kind: hp <= 10 && k < .4 ? 'RUM' : k < .1 ? 'RUM' : ['GRAPE', 'CHAIN', 'SHELL'][Math.random() * 3 | 0], l: 9 }; sfx(240, .06, 'square', .03); } }
      else { barrel.l -= dt; if (barrel.l <= 0) { barrel = null; barrelT = rnd(2, 4); } }
      const pace = 1 + Math.min(.8, wave * .07);
      for (const f of foes) {
        f.hit = Math.max(0, f.hit - dt); if (f.dead) continue;
        if (f.swing) {                                   // a boarder sweeping along your front planks
          const s = f.swing; s.x += s.d * 150 * dt; const col = Math.floor((s.x - OX) / PW);
          if (!s.hit && me.r === 0 && col === me.c) { s.hit = true; hurt(3); }
          if (s.x < OX - 16 || s.x > OX + COLS * PW + 16) f.swing = null;
          continue;
        }
        f.moveT -= dt;
        if (f.moveT <= 0 && f.warn <= 0) {
          f.moveT = rnd(1, 2) / pace; const opts = [];
          for (let c = 0; c < COLS; c++) for (let r = 0; r < 2; r++) if (!taken(c, r) && Math.abs(c - f.c) + Math.abs(r - f.r) === 1) opts.push([c, r]);
          if (opts.length) { const aim = f.k === 'gunner' && Math.random() < .5 && opts.find(o => o[0] === me.c), o = aim || opts[Math.random() * opts.length | 0]; f.c = o[0]; f.r = o[1]; }
        }
        f.cd -= dt * pace;
        if (f.warn > 0) {
          f.warn -= dt;
          if (f.warn <= 0) {
            if (f.k === 'gunner') { balls.push({ c: f.c, y: cellE(f.c, f.r).y + 8 }); sfx(400, .06, 'square', .03, -200); }
            else if (f.k === 'mortar') { marks.push({ c: f.at.c, r: f.at.r, t: .8 }); sfx(500, .2, 'triangle', .04, -300); }
            else { const d = Math.random() < .5 ? 1 : -1; f.swing = { x: d > 0 ? OX - 14 : OX + COLS * PW + 14, d, hit: false }; sfx(250, .2, 'sawtooth', .04, -100); }
            f.cd = rnd(2, 3);
          }
        } else if (f.cd <= 0) { f.warn = f.k === 'boarder' ? .7 : .55; if (f.k === 'mortar') f.at = { c: me.c, r: me.r }; sfx(1500, .03, 'square', .02); }
      }
      if (foes.length && foes.every(f => f.dead && f.hit <= 0)) { score += 3; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 500); msg = { txt: 'CREW BEATEN +3', l: 1 }; foes = []; }
      for (const b of balls) { b.y += 120 * dt; if (!b.hit && b.c === me.c && Math.abs(b.y - cellM(me.c, me.r).y) < 8) { b.hit = true; hurt(2); } }
      balls = balls.filter(b => !b.hit && b.y < MY + PH * 2 + 8);
      for (const m of marks) { m.t -= dt; if (m.t <= 0) { m.done = true; fx.push({ boom: true, p: cellM(m.c, m.r), l: .25 }); sfx(100, .2, 'square', .05, -30); feel.juice.shake(2); if (me.c === m.c && me.r === m.r) hurt(3); } }
      marks = marks.filter(m => !m.done);
      if (hp <= 0) { haptic('error'); sfx(90, .6, 'sawtooth', .06, -40); return api.over(); }
    },
    fx(dt) { feel.update(dt); t += dt; },
    draw(c) {
      // the sea, with the two decks across it
      c.fillStyle = '#1a5a9a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2a74b8'; for (let i = 0; i < 26; i++) { const y = (i * 29) % H, x = ((i * 53 + t * (6 + i % 3)) % (W + 20)) - 10; c.fillRect(Math.round(x), y, 8, 1); }
      feel.begin(c);
      deck(c, EY, '#6a3c24', '#7c4a2c', '#a02c2c'); deck(c, MY, '#b07a44', '#c08a52', '#2a5ac0');
      for (const m of marks) if ((t * 12 | 0) % 2) { const p = cellM(m.c, m.r); c.fillStyle = '#f8f8f0'; c.fillRect(p.x - 9, p.y - 7, 18, 1); c.fillRect(p.x - 9, p.y + 6, 18, 1); c.fillRect(p.x - 9, p.y - 7, 1, 14); c.fillRect(p.x + 8, p.y - 7, 1, 14); }
      if (barrel && (barrel.l > 2 || (t * 8 | 0) % 2)) { const p = cellM(barrel.c, barrel.r), x = Math.round(p.x), y = Math.round(p.y); c.fillStyle = '#4a2c14'; c.fillRect(x - 5, y - 6, 10, 12); c.fillStyle = '#8a5a2c'; c.fillRect(x - 4, y - 5, 8, 10); c.fillStyle = SHOTS[barrel.kind]; c.fillRect(x - 5, y - 2, 10, 3); }
      for (const f of foes) {
        if (f.swing) { const x = Math.round(f.swing.x), y = MY + 8; c.fillStyle = '#e8e0d0'; c.fillRect(x, EY + PH * 2, 1, y - EY - PH * 2 - 6); pirate(c, x, y, '#e04848', false); c.fillStyle = '#e8e8f8'; c.fillRect(x + f.swing.d * 5, y - 2, 5, 1); continue; }
        const p = cellE(f.c, f.r), x = Math.round(p.x), y = Math.round(p.y), fl = f.hit > 0 && (t * 30 | 0) % 2, warn = f.warn > 0 && (t * 16 | 0) % 2;
        if (f.dead && !fl) continue;
        pirate(c, x, y - 1, f.k === 'gunner' ? '#e8a030' : f.k === 'mortar' ? '#a058e0' : '#e04848', fl || warn);
        c.fillStyle = '#101018';
        if (f.k === 'gunner') { c.fillRect(x - 2, y + 4, 5, 6); c.fillStyle = warn ? '#f8f070' : '#484858'; c.fillRect(x - 1, y + 5, 3, 6); }
        else if (f.k === 'mortar') { c.fillRect(x + 5, y - 1, 6, 6); c.fillStyle = warn ? '#f8f070' : '#484858'; c.fillRect(x + 6, y - 3, 4, 5); }
        else { c.fillStyle = '#e8e8f8'; c.fillRect(x + 5, y - 6, 1, 8); if (f.warn > 0) { c.fillStyle = '#f8f070'; c.fillRect(OX, MY - 3, COLS * PW, 1); } }
        c.fillStyle = '#101018'; c.fillRect(x - 8, y - 17, 16, 3); c.fillStyle = '#f86060'; c.fillRect(x - 7, y - 16, Math.round(14 * clamp(f.hp / f.max, 0, 1)), 1);
      }
      for (const b of balls) { c.fillStyle = '#101018'; c.fillRect(OX + b.c * PW + PW / 2 - 2, Math.round(b.y) - 2, 5, 5); c.fillStyle = '#787890'; c.fillRect(OX + b.c * PW + PW / 2 - 1, Math.round(b.y) - 1, 2, 2); }
      // you and your deck gun
      const p = cellM(me.c, me.r), x = Math.round(p.x), y = Math.round(p.y);
      if (!(me.inv > 0 && (t * 20 | 0) % 2)) {
        pirate(c, x - 3, y + 2, '#2a5ac0', false, true);
        c.fillStyle = '#101018'; c.fillRect(x + 4, y - 9, 6, 13); c.fillRect(x + 3, y + 1, 8, 4); c.fillStyle = armed ? SHOTS[armed] : '#70707e'; c.fillRect(x + 5, y - 10, 4, 10);   // the deck gun, lit up when a special shot is loaded
      }
      for (const f of fx) {
        if (f.shot) { const k = 1 - f.l / .12, yy = Math.round(f.y0 + (f.y1 - f.y0) * k); c.fillStyle = f.col; c.fillRect(f.x - 2, yy - 2, 4, 4); c.fillStyle = '#f8f8f0'; c.fillRect(f.x - 1, yy + 3, 2, 6); }
        if (f.boom) { c.fillStyle = (t * 20 | 0) % 2 ? '#f8f8f0' : '#f8a040'; c.fillRect(f.p.x - 12, f.p.y - 8, 24, 16); c.fillRect(f.p.x - 8, f.p.y - 11, 16, 22); }
      }
      feel.end(c, W, H);
      // HUD
      text(c, 'CREW ' + wave, 3, 6, { color: '#f8f8f0', shadow: '#101018' });
      c.fillStyle = '#101018'; c.fillRect(0, H - 22, W, 22);
      text(c, 'HULL', 4, H - 15, { color: '#f8f8f0' }); c.fillStyle = '#383848'; c.fillRect(24, H - 15, 62, 5); c.fillStyle = hp <= 6 ? '#f86060' : '#88f070'; c.fillRect(25, H - 14, Math.round(60 * clamp(hp / 20, 0, 1)), 3);
      text(c, armed ? armed + ' SHOT' : 'PLAIN SHOT', W - 4, H - 15, { color: armed ? SHOTS[armed] : '#a0a0b8', align: 'right' });
      if (msg) text(c, msg.txt, W / 2, 80, { color: '#f8f8f0', align: 'center', shadow: '#101018' });
      ready.draw(c, W, H, { pixel: true, color: '#f8f8f0', shadow: '#101018', y: 88, text: 'TAP A PLANK TO MOVE' });
    },
    down(x, y) {
      const col = clamp(Math.floor((x - OX) / PW), 0, COLS - 1);
      if (y >= MY - 4 && y < H - 22) { ready.go(); hop(col, y < MY + PH ? 0 : 1); }
      else if (y < MY - 4) { ready.go(); fire(); }
    },
    key(k, d) {
      if (!d) return; ready.go(); const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (m) hop(clamp(me.c + m[0], 0, COLS - 1), clamp(me.r + m[1], 0, 1));
      if (k === ' ') fire();
    },
  };
}

function deck(c, y, dark, light, trim) {
  c.fillStyle = '#101018'; c.fillRect(OX - 6, y - 4, COLS * PW + 12, PH * 2 + 8);
  c.fillStyle = trim; c.fillRect(OX - 5, y - 3, COLS * PW + 10, PH * 2 + 6);
  for (let i = 0; i < COLS; i++) for (let r = 0; r < 2; r++) {
    const x = OX + i * PW, yy = y + r * PH;
    c.fillStyle = dark; c.fillRect(x + 1, yy + 1, PW - 2, PH - 2); c.fillStyle = light; c.fillRect(x + 2, yy + 2, PW - 4, PH - 5);
    c.fillStyle = dark; c.fillRect(x + 2, yy + 8, PW - 4, 1); c.fillRect(x + 2, yy + 14, PW - 4, 1); c.fillRect(x + 10 + (r * 9), yy + 2, 1, 6);
  }
}
function pirate(c, x, y, coat, flash, cap) {
  c.fillStyle = flash ? '#f8f8f0' : coat; c.fillRect(x - 5, y - 4, 10, 8);
  c.fillStyle = '#f2c8a0'; c.fillRect(x - 3, y - 9, 6, 5); c.fillStyle = '#101018'; c.fillRect(x - 2, y - 7, 1, 1); c.fillRect(x + 1, y - 7, 1, 1);
  c.fillStyle = cap ? '#f8f8f0' : '#101018'; c.fillRect(x - 4, y - 11, 8, 2); if (!cap) c.fillRect(x - 2, y - 13, 4, 2);
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'broadside', title: 'Broadside', tag: 'Advance · Battle', retro: true, era: 'advance', pal: 'teal', w: W, h: H, goal: 30, music: 'heroic',
  hint: 'Tap a plank on your deck to hop there, and tap the other ship to fire up your column. Step on a barrel to load a special shot. Flashing crew are about to attack.',
  make,
};
