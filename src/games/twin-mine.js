// Twin Mine: two screens, one cave. The top screen is a sweeping radar that pings the buried gems,
// blurry at first and sharper the closer you dig. The bottom screen is the rock face: tap to chip
// a block (hard rock takes more hits). Every hit shakes the roof; find the gems before it caves in.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds, noise } = gs.sound;
const { clamp } = gs.util;

let W = 176, H = 240;
const COLS = 8, ROWS = 7;
const ROCK = [null, ['#a0704c', '#7c5236'], ['#8a8a96', '#62626e'], ['#5a4a6e', '#3c3050']];
const GEMS = ['#ff4f6d', '#4fd8ff', '#7dff6a', '#ffd84f', '#d27bff'];

function make(api) {
  const feel = new Feel({ pixel: true });
  let cells, gems, roof, sweep, pings, score, level, t, banner, dead, found;

  const top = () => Math.round(H * .4);
  const cs = () => Math.floor(Math.min((W - 8) / COLS, (H - top() - 10) / ROWS));
  const gx = () => Math.round((W - COLS * cs()) / 2), gy = () => top() + 6;

  function newCave() {
    cells = Array.from({ length: COLS * ROWS }, () => ({ hp: 1 + (Math.random() < .35 + level * .05 ? 1 : 0) + (Math.random() < .1 + level * .04 ? 1 : 0), hit: 0, gas: Math.random() < .05 + level * .01 }));
    for (const c of cells) c.max = c.hp;
    gems = []; const n = Math.min(5, 2 + Math.floor(level / 2));
    while (gems.length < n) { const i = Math.random() * COLS * ROWS | 0; if (!gems.some(g => g.i === i) && !cells[i].gas) gems.push({ i, col: GEMS[gems.length % GEMS.length], found: false }); }
    roof = 0; pings = []; found = 0;
    banner = { txt: `CAVE ${level}`, sub: `${n} GEMS`, l: 1.6 };
  }
  // how blurry the radar is for a gem: sharp once you've dug next to it
  function blur(g) {
    const gc = g.i % COLS, gr = g.i / COLS | 0; let best = 9;
    cells.forEach((c, i) => { if (c.hp <= 0) best = Math.min(best, Math.max(Math.abs(i % COLS - gc), Math.abs((i / COLS | 0) - gr))); });
    return best >= 9 ? 2.2 : clamp(best - .6, 0, 2.2);
  }

  function dig(i) {
    const c = cells[i]; if (!c || c.hp <= 0 || dead) return;
    c.hp--; c.hit = .15;
    const x = gx() + (i % COLS) * cs() + cs() / 2, y = gy() + (i / COLS | 0) * cs() + cs() / 2;
    roof += c.gas && c.hp <= 0 ? 22 : 2.4 + level * .25;
    if (c.hp > 0) { sfx(180 + c.hp * 40, .05, 'square', .04, -60); haptic('tick'); feel.juice.burst(x, y, { n: 4, speed: 40, size: 1, color: ROCK[c.max][0], gravity: 120 }); return; }
    const g = gems.find(g => g.i === i);
    feel.juice.burst(x, y, { n: 8, speed: 60, size: 2, color: ROCK[c.max], gravity: 200 });
    if (c.gas) { feel.boom(x, y, { size: .6 }); feel.juice.pop(x, y - 8, 'GAS!', { color: '#ffd84f' }); haptic('error'); }
    else if (g) {
      g.found = true; found++; score++; api.score(score); roof = Math.max(0, roof - 14);
      feel.coin(x, y); feel.juice.pop(x, y - 10, 'GEM!', { color: g.col }); haptic('success');
      if (found === gems.length) { score += 2; api.score(score); feel.win(W / 2, top() / 2); banner = { txt: 'ALL FOUND!', sub: '+2 BONUS', l: 1.4, next: true }; }
    } else {
      sfx(120, .07, 'square', .05, -40); haptic('light');
      // a soft click when the empty block touched a gem
      const near = gems.some(g => !g.found && Math.abs(g.i % COLS - i % COLS) <= 1 && Math.abs((g.i / COLS | 0) - (i / COLS | 0)) <= 1);
      if (near) { sfx(1400, .04, 'sine', .03); haptic('medium'); feel.juice.pop(x, y - 6, '!', { color: '#ffffff' }); }
    }
    if (roof >= 100) { dead = .01; roof = 100; noise(.9, { vol: .2, from: 900, to: 50 }); feel.lose(); feel.juice.shake(6); haptic('error'); }
    else if (roof > 70) haptic('warning');
  }

  return {
    reset() { score = 0; level = 1; t = 0; sweep = 0; dead = 0; feel.clear(); newCave(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { if (banner.next) { level++; newCave(); } else banner = null; } }
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      for (const c of cells) if (c.hit > 0) c.hit -= dt;
      const prev = sweep; sweep = (sweep + dt * 2.4) % (Math.PI * 2);
      // gems ping as the sweep passes their direction from the cave's middle
      for (const g of gems) {
        if (g.found) continue;
        const a = (Math.atan2((g.i / COLS | 0) - (ROWS - 1) / 2, g.i % COLS - (COLS - 1) / 2) + Math.PI * 2) % (Math.PI * 2);
        const passed = prev <= sweep ? a > prev && a <= sweep : a > prev || a <= sweep;
        if (passed) { const b = blur(g), an = Math.random() * 7; pings.push({ c: g.i % COLS + Math.cos(an) * b * Math.random(), r: (g.i / COLS | 0) + Math.sin(an) * b * Math.random(), l: 1.6, col: g.col, b }); sfx(b < .5 ? 1500 : 1100, .04, 'sine', .02); }
      }
      for (const p of pings) p.l -= dt; pings = pings.filter(p => p.l > 0);
    },
    draw(c) {
      const T = top(), S = cs(), X0 = gx(), Y0 = gy();
      c.fillStyle = '#10141c'; c.fillRect(0, 0, W, H);
      // top screen: radar
      c.fillStyle = '#0c2a1c'; c.fillRect(4, 4, W - 8, T - 8);
      const rx = W / 2, ry = T / 2, rr = Math.min(W / 2 - 10, T / 2 - 8), sc = rr * 2 / Math.max(COLS, ROWS) * .95;
      c.fillStyle = '#16402a'; for (let k = 1; k <= 3; k++) for (let a = 0; a < 64; a++) { const an = a / 64 * Math.PI * 2; c.fillRect(Math.round(rx + Math.cos(an) * rr * k / 3), Math.round(ry + Math.sin(an) * rr * k / 3), 1, 1); }
      for (let a = 0; a < 18; a++) { const k = a / 18; c.fillStyle = `rgba(80,255,140,${.5 * (1 - k)})`; for (let d = 0; d < rr; d += 2) c.fillRect(Math.round(rx + Math.cos(sweep - k * .5) * d), Math.round(ry + Math.sin(sweep - k * .5) * d), 1, 1); }
      // the cave outline and dug holes on the radar
      cells.forEach((cl, i) => { if (cl.hp <= 0) { c.fillStyle = '#2a7a4a'; c.fillRect(Math.round(rx + (i % COLS - (COLS - 1) / 2) * sc) - 1, Math.round(ry + ((i / COLS | 0) - (ROWS - 1) / 2) * sc) - 1, 3, 3); } });
      for (const p of pings) { const x = Math.round(rx + (p.c - (COLS - 1) / 2) * sc), y = Math.round(ry + (p.r - (ROWS - 1) / 2) * sc), s = p.b < .5 ? 4 : 3; c.globalAlpha = Math.min(1, p.l); c.fillStyle = p.b < .5 ? p.col : '#a8ffc8'; c.fillRect(x - s, y - s, s * 2, s * 2); c.globalAlpha = 1; }
      text(c, 'RADAR', 8, 7, { color: '#50ff8c' });
      text(c, `${found}/${gems.length}`, W - 8, 7, { color: '#50ff8c', align: 'right' });
      // hinge between the screens, with the roof meter
      c.fillStyle = '#2a2e3a'; c.fillRect(0, T - 4, W, 6);
      c.fillStyle = roof > 70 && (t * 8 | 0) % 2 ? '#ff4f4f' : '#ffb347'; c.fillRect(0, T - 3, Math.round(W * roof / 100), 4);
      feel.begin(c);
      // bottom screen: rock face
      c.fillStyle = '#1c1410'; c.fillRect(X0 - 2, Y0 - 2, COLS * S + 4, ROWS * S + 4);
      const shake = dead ? 0 : roof > 70 ? Math.round(Math.sin(t * 50)) : 0;
      cells.forEach((cl, i) => {
        const x = X0 + (i % COLS) * S + shake, y = Y0 + (i / COLS | 0) * S, g = gems.find(g => g.i === i);
        if (cl.hp <= 0) {
          c.fillStyle = '#2a1e18'; c.fillRect(x, y, S, S);
          if (g) { const m = S / 2; c.fillStyle = g.col; c.fillRect(x + m - 4, y + m - 3, 8, 6); c.fillRect(x + m - 2, y + m - 5, 4, 10); c.fillStyle = '#ffffff'; c.fillRect(x + m - 2, y + m - 2, 2, 2); }
          if (cl.gas) { c.fillStyle = '#5a5020'; c.fillRect(x + 3, y + 3, S - 6, S - 6); }
          return;
        }
        const [a, b] = ROCK[cl.max];
        c.fillStyle = cl.hit > 0 ? '#ffffff' : a; c.fillRect(x, y, S - 1, S - 1);
        c.fillStyle = b; c.fillRect(x, y + S - 3, S - 1, 2); c.fillRect(x + S - 3, y, 2, S - 1);
        c.fillStyle = '#00000040'; if (cl.hp < cl.max) { c.fillRect(x + 3, y + 4, S - 8, 1); c.fillRect(x + S / 2, y + 4, 1, S - 8); }
      });
      if (dead) { c.fillStyle = '#5a4030'; const k = Math.min(1, dead * 1.5); c.fillRect(X0 - 2, Y0 - 2, COLS * S + 4, Math.round((ROWS * S + 4) * k)); }
      feel.end(c, W, H);
      if (banner) text(c, banner.txt, W / 2, T + (H - T) / 2 - 8, { font: 'big', align: 'center', color: '#ffffff', outline: '#000000' }), text(c, banner.sub, W / 2, T + (H - T) / 2 + 6, { align: 'center', color: '#ffd84f', outline: '#000000' });
    },
    down(x, y) {
      if (banner?.next) return;
      const S = cs(), col = Math.floor((x - gx()) / S), row = Math.floor((y - gy()) / S);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) dig(row * COLS + col);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'twin-mine',
  title: 'Twin Mine',
  tag: 'Advance · Digging',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 240, maxW: 240, maxH: 300,
  goal: 8,
  hint: 'The top radar pings buried gems, sharper as you dig close. Tap blocks to dig them out before the roof caves in.',
  make,
};
