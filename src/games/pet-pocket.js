// Pet Pocket: look after a little round pet. Pick a tool at the bottom: FOOD (tap the pet), SOAP (rub
// it, or tap a mess), BALL (flick it and the pet chases) and LAMP (lights out for a nap). Its four
// needs drop faster and faster. Keep them all up to earn hearts; let one empty and it runs off.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { clamp, rnd } = gs.util;

let W = 160, H = 192;
const TOOLS = ['FOOD', 'SOAP', 'BALL', 'LAMP'], NEEDS = ['food', 'clean', 'fun', 'rest'], NCOL = [C16[3], C16[7], C16[10], C16[9]];

function make(api) {
  const feel = new Feel({ pixel: true });
  let pet, need, tool, ball, messes, dark, score, t, happy, rub, flick, bubbles, eat, gone;
  const floorY = () => H - 44;

  function bump(k, v, x, y) { need[k] = clamp(need[k] + v, 0, 100); if (v > 0) feel.juice.pop(x, y, '+', { color: NCOL[NEEDS.indexOf(k)] }); }

  return {
    reset() {
      pet = { x: W / 2, y: floorY(), vx: 0, hop: 0, look: 1, blink: 2 };
      need = { food: 70, clean: 80, fun: 60, rest: 75 };
      tool = 0; ball = null; messes = []; dark = false; score = 0; t = 0; happy = 0; rub = 0; flick = null; bubbles = []; eat = 0; gone = 0;
      feel.clear();
    },
    resize(w, h) { W = w; H = h; if (pet) pet.y = Math.min(pet.y, floorY()); },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (gone) { gone += dt; pet.x += 60 * dt; if (gone > 2) api.over(); return; }
      const k = 1 + t / 70;   // needs fall faster as time goes on
      need.food -= 2.2 * k * dt; need.fun -= (dark ? 3.4 : 2.4) * k * dt;
      need.rest += dark ? 9 * dt : -1.8 * k * dt; need.clean -= (.9 + messes.length * 1.6) * k * dt;
      if (dark && need.rest >= 100) need.fun -= 4 * dt;   // bored when it's wide awake in the dark
      for (const n of NEEDS) need[n] = clamp(need[n], 0, 100);
      const low = NEEDS.find(n => need[n] <= 0);
      if (low) { gone = .01; feel.lose(); feel.juice.pop(pet.x, pet.y - 30, low === 'rest' ? 'TOO TIRED' : low === 'food' ? 'HUNGRY!' : low === 'fun' ? 'BORED!' : 'TOO DIRTY', { color: C16[2] }); haptic('error'); return; }
      // hearts while everything is above a third
      if (NEEDS.every(n => need[n] > 33)) { happy += dt; if (happy >= 3) { happy = 0; score++; api.score(score); feel.juice.pop(pet.x, pet.y - 26, '♥', { color: C16[10] }); sfx(1200, .06, 'sine', .03, 300); } }
      // full tummy makes a mess later
      if (need.food > 85 && Math.random() < dt * .25 && messes.length < 4) { messes.push({ x: clamp(pet.x + rnd(-30, 30), 10, W - 10) }); sfx(150, .15, 'square', .03, -40); }
      // pet behaviour: chase the ball, wander, sleep in the dark
      pet.blink -= dt; if (pet.blink < 0) pet.blink = 2 + Math.random() * 3;
      if (eat > 0) eat -= dt;
      if (ball) {
        ball.vy += 400 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.vx *= .995;
        if (ball.y > floorY() - 3) { ball.y = floorY() - 3; ball.vy *= -.6; ball.vx *= .8; if (Math.abs(ball.vy) > 40) sfx(300, .03, 'square', .02); }
        if (ball.x < 4 || ball.x > W - 4) { ball.vx *= -1; ball.x = clamp(ball.x, 4, W - 4); }
        if (!dark) { pet.vx = clamp((ball.x - pet.x) * 3, -90, 90); pet.look = Math.sign(ball.x - pet.x) || 1; }
        if (Math.abs(ball.x - pet.x) < 12 && ball.y > floorY() - 20) { bump('fun', 22, pet.x, pet.y - 24); feel.coin(pet.x, pet.y - 10); haptic('light'); pet.hop = 1; ball = null; }
        else { ball.l -= dt; if (ball.l <= 0) ball = null; }
      } else if (!dark && Math.random() < dt * .5) pet.vx = rnd(-30, 30);
      if (dark) pet.vx = 0;
      pet.x = clamp(pet.x + pet.vx * dt, 16, W - 16); pet.vx *= .98; if (Math.abs(pet.vx) > 5) pet.look = Math.sign(pet.vx);
      pet.hop = Math.max(0, pet.hop - dt * 3);
      for (const b of bubbles) { b.y -= 20 * dt; b.l -= dt; } bubbles = bubbles.filter(b => b.l > 0);
    },
    draw(c) {
      const fy = floorY();
      c.fillStyle = dark ? '#283048' : '#f8e8c8'; c.fillRect(0, 0, W, fy);
      c.fillStyle = dark ? '#384060' : '#e8c898'; for (let x = 0; x < W; x += 20) c.fillRect(x, 0, 10, fy);
      c.fillStyle = dark ? '#403830' : C16[11]; c.fillRect(0, fy, W, H - fy);
      c.fillStyle = dark ? '#302820' : C16[12]; for (let x = 0; x < W; x += 14) c.fillRect(x, fy, 1, 22);
      // window with sun or moon
      c.fillStyle = C16[12]; c.fillRect(W - 46, 36, 34, 28); c.fillStyle = dark ? '#101830' : C16[7]; c.fillRect(W - 44, 38, 30, 24);
      c.fillStyle = dark ? C16[14] : C16[4]; c.fillRect(W - 34, 44, 8, 8);
      feel.begin(c);
      for (const m of messes) { c.fillStyle = C16[11]; c.fillRect(Math.round(m.x) - 4, fy - 4, 8, 4); c.fillRect(Math.round(m.x) - 2, fy - 7, 4, 3); c.fillStyle = C16[5]; if ((t * 4 | 0) % 2) c.fillRect(Math.round(m.x) + 3, fy - 12, 1, 3); }
      if (ball) { c.fillStyle = C16[2]; c.fillRect(Math.round(ball.x) - 3, Math.round(ball.y) - 3, 6, 6); c.fillStyle = C16[1]; c.fillRect(Math.round(ball.x) - 1, Math.round(ball.y) - 2, 2, 1); }
      // the pet: a squishy round critter
      const hop = Math.sin(pet.hop * Math.PI) * 10, sq = need.rest < 25 ? 2 : 0, px = Math.round(pet.x), py = Math.round(pet.y - hop);
      const sad = NEEDS.some(n => need[n] < 25), sleep = dark && need.rest < 100;
      c.fillStyle = C16[0]; c.fillRect(px - 13, py - 20 + sq, 26, 20 - sq); c.fillRect(px - 11, py - 22 + sq, 22, 24 - sq);
      c.fillStyle = need.clean < 30 ? '#a8a070' : C16[5]; c.fillRect(px - 12, py - 19 + sq, 24, 18 - sq); c.fillRect(px - 10, py - 21 + sq, 20, 22 - sq);
      c.fillStyle = C16[6]; c.fillRect(px - 10, py - 4, 20, 3);
      c.fillStyle = '#ffffff60'; c.fillRect(px - 8, py - 18 + sq, 4, 3);
      if (need.clean < 30) { c.fillStyle = C16[11]; c.fillRect(px - 6, py - 10, 2, 2); c.fillRect(px + 5, py - 15, 2, 2); }
      const ex = px + pet.look * 3;
      c.fillStyle = C16[0];
      if (sleep || pet.blink < .12) { c.fillRect(ex - 6, py - 12, 4, 1); c.fillRect(ex + 2, py - 12, 4, 1); }
      else { c.fillRect(ex - 6, py - 14, 3, 4); c.fillRect(ex + 3, py - 14, 3, 4); c.fillStyle = C16[1]; c.fillRect(ex - 5, py - 14, 1, 1); c.fillRect(ex + 4, py - 14, 1, 1); }
      c.fillStyle = C16[0];
      if (eat > 0) c.fillRect(ex - 2, py - 8, 4, (t * 10 | 0) % 2 ? 3 : 1);
      else if (sad) { c.fillRect(ex - 2, py - 7, 4, 1); c.fillRect(ex - 3, py - 6, 1, 1); c.fillRect(ex + 2, py - 6, 1, 1); }
      else { c.fillRect(ex - 2, py - 7, 4, 1); c.fillRect(ex - 3, py - 8, 1, 1); c.fillRect(ex + 2, py - 8, 1, 1); }
      if (sleep) text(c, 'Z', px + 12, py - 30 - Math.round((t * 6) % 6), { color: C16[1] });
      for (const b of bubbles) { c.fillStyle = C16[1]; c.fillRect(Math.round(b.x), Math.round(b.y), 3, 3); c.fillStyle = C16[7]; c.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
      if (flick) { c.fillStyle = C16[2]; c.fillRect(Math.round(flick.x) - 3, Math.round(flick.y) - 3, 6, 6); }
      feel.end(c, W, H);
      // needs bars
      NEEDS.forEach((n, i) => { const x = 4 + i * 38, v = need[n]; c.fillStyle = C16[0]; c.fillRect(x, 17, 34, 6); c.fillStyle = v < 25 && (t * 6 | 0) % 2 ? C16[2] : NCOL[i]; c.fillRect(x + 1, 18, Math.round(32 * v / 100), 4); text(c, n.toUpperCase(), x + 17, 25, { color: dark ? C16[1] : C16[0], align: 'center' }); });
      // tool bar
      const by = H - 20, bw = W / 4;
      TOOLS.forEach((name, i) => { c.fillStyle = i === tool ? C16[4] : C16[14]; c.fillRect(Math.round(i * bw) + 2, by, Math.round(bw) - 4, 17); c.fillStyle = C16[0]; c.fillRect(Math.round(i * bw) + 2, by + 16, Math.round(bw) - 4, 1); text(c, name === 'LAMP' && dark ? 'WAKE' : name, Math.round(i * bw + bw / 2), by + 6, { color: C16[0], align: 'center' }); });
      if (t < 4) text(c, ['TAP PET TO FEED', 'RUB PET TO WASH', 'FLICK THE BALL', 'TAP LAMP: NAP'][tool], W / 2, 70, { align: 'center', color: dark ? C16[1] : C16[0] });
    },
    down(x, y) {
      if (gone) return;
      if (y > H - 22) { const i = clamp(Math.floor(x / (W / 4)), 0, 3); if (i === 3) { dark = !dark; sfx(dark ? 300 : 600, .06, 'square', .03); haptic('tick'); tool = 3; } else { tool = i; sfx(800, .03, 'square', .02); } return; }
      rub = 0;
      const onPet = Math.abs(x - pet.x) < 16 && Math.abs(y - (pet.y - 10)) < 16;
      if (dark && tool !== 3) { dark = false; }
      if (tool === 0 && onPet) {
        if (need.food > 95) { feel.juice.pop(pet.x, pet.y - 30, 'FULL', { color: C16[2] }); haptic('warning'); return; }
        bump('food', 18, pet.x, pet.y - 26); eat = .6; notes('C5 E5', { len: .05 }); haptic('light');
      }
      if (tool === 1) { const m = messes.find(m => Math.abs(m.x - x) < 10 && y > floorY() - 16); if (m) { messes = messes.filter(q => q !== m); bump('clean', 8, m.x, floorY() - 12); sfx(900, .05, 'sine', .03, 400); haptic('light'); } }
      if (tool === 2) flick = { x, y, t: 0, sx: x, sy: y };
    },
    move(x, y, p) {
      if (!p || gone) return;
      if (tool === 1 && Math.abs(x - pet.x) < 18 && Math.abs(y - (pet.y - 10)) < 18) {
        rub += 1; if (rub % 3 === 0) { bubbles.push({ x: x + rnd(-4, 4), y, l: .8 }); need.clean = clamp(need.clean + 1.4, 0, 100); if (rub % 12 === 0) { haptic('tick'); sfx(1000 + Math.random() * 400, .03, 'sine', .02); } }
      }
      if (flick) { flick.vx = (x - flick.x) * 30; flick.vy = (y - flick.y) * 30; flick.x = x; flick.y = y; }
    },
    up() {
      if (flick && tool === 2) { ball = { x: flick.x, y: Math.min(flick.y, floorY() - 4), vx: clamp(flick.vx || 0, -300, 300), vy: clamp(flick.vy || -100, -400, 200), l: 5 }; sfx(500, .05, 'triangle', .03, 200); }
      flick = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'pet-pocket',
  title: 'Pet Pocket',
  tag: 'Color · Pet',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 192, maxW: 220, maxH: 240,
  goal: 20,
  hint: 'Feed, wash, play ball and put your pet down for naps. Keep all four needs up to earn hearts; let one run out and it leaves.',
  make,
};
