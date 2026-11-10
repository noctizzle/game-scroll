// Pin Pull: gold, lava and water are held up by pins. Tap a pin to pull it out, and whatever sat on it
// pours down. Gold that touches lava turns to useless stone, but water poured on lava cools it to stone
// too. Pull the pins in the right order to get the gold into the pot. Stuck? Tap RETRY (costs a heart).
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Physics } = gs.physics;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 360, H = 640;
const LEVELS = [
  ['#########', '##.....##', '##.ggg.##', '##.ggg.##', '##11111##', '#.......#', '#.......#', '#.......#', '#.......#', '##.....##', '###...###', '###UUU###', '#########'],
  ['#########', '#ggg#lll#', '#ggg#lll#', '#111#222#', '#.......#', '#.......#', '#.......#', '#.......#', '##.....##', '###...###', '###UUU###', '#########'],
  ['#########', '#www#ggg#', '#www#ggg#', '#111#222#', '#.......#', '#.lllll.#', '#.33333.#', '#.......#', '##.....##', '###...###', '###UUU###', '#########'],
  ['#########', '#ggg#www#', '#ggg#www#', '#111#222#', '#...#...#', '#...#lll#', '#...#333#', '#.......#', '##.....##', '###...###', '###UUU###', '#########'],
  ['#########', '#lll#ggg#', '#111#ggg#', '#...#222#', '#...#...#', '#...#...#', '#.###...#', '#.#.....#', '#.#.....#', '#.##...##', '#.##UUU##', '#########'],
];
const COL = { gold: '#ffc300', lava: '#f94144', water: '#4cc9f0', stone: '#6c757d' };

function make(api) {
  const feel = new Feel();
  let phys, balls, pins, cells, cup, lvl, score, hearts, t, banner, cs, ox, oy, pulls, mirror;

  function load() {
    phys?.free?.();
    phys = new Physics({ gravity: 900 });
    const L = LEVELS[lvl % LEVELS.length]; mirror = Math.floor(lvl / LEVELS.length) % 2 === 1;
    const rows = L.length, cols = L[0].length;
    cs = Math.min(Math.floor((W - 20) / cols), Math.floor((H - 130) / rows)); ox = Math.round((W - cs * cols) / 2); oy = 80;
    balls = []; pins = {}; cells = []; cup = null; pulls = 0;
    for (let r = 0; r < rows; r++) for (let c0 = 0; c0 < cols; c0++) {
      const c = mirror ? cols - 1 - c0 : c0, ch = L[r][c0], x = ox + c * cs + cs / 2, y = oy + r * cs + cs / 2;
      if (ch === '#') { cells.push({ x, y }); phys.box(x, y, cs, cs, { fixed: true, friction: .1 }); }
      else if (ch >= '1' && ch <= '9') { const p = pins[ch] ||= { id: ch, parts: [], gone: false }; p.parts.push({ x, y, body: phys.box(x, y, cs, cs * .3, { fixed: true, friction: .1 }) }); }
      else if ('glw'.includes(ch)) {
        const m = ch === 'g' ? 'gold' : ch === 'l' ? 'lava' : 'water', br = cs / 4 - .5;
        for (let i = 0; i < 4; i++) { const b = phys.circle(x + (i % 2 ? .5 : -.5) * cs / 2, y + (i < 2 ? -.5 : .5) * cs / 2, br, { friction: .05, bounce: .05, density: m === 'gold' ? 2 : 1 }); b.m = m; b.orig = m; balls.push(b); }
      } else if (ch === 'U') { cup = cup ? { x0: Math.min(cup.x0, x - cs / 2), x1: Math.max(cup.x1, x + cs / 2), y0: y - cs / 2, y1: y + cs / 2 } : { x0: x - cs / 2, x1: x + cs / 2, y0: y - cs / 2, y1: y + cs / 2 }; }
    }
    phys.onHit((a, b) => {
      if (!a.m || !b.m) return;
      const pair = m => (a.m === m ? a : b.m === m ? b : null), lava = pair('lava'); if (!lava) return;
      const other = lava === a ? b : a;
      if (other.m === 'gold') { other.m = 'stone'; sfx(120, .1, 'sawtooth', .03); }
      else if (other.m === 'water') { other.m = 'stone'; lava.m = 'stone'; sfx(1800, .08, 'triangle', .02, -1200); }
    });
  }
  const inCup = b => cup && b.x > cup.x0 - 4 && b.x < cup.x1 + 4 && b.y > cup.y0 - cs * 1.4 && b.y < cup.y1;

  return {
    reset() { lvl = 0; score = 0; hearts = 3; t = 0; banner = { txt: 'Level 1', l: 1 }; load(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; phys.step(dt);
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); if (b.next) { lvl++; load(); banner = { txt: `Level ${lvl + 1}`, l: .8 }; } if (b.retry) { load(); } } return; }
      const golds = balls.filter(b => b.orig === 'gold'), total = golds.length, home = golds.filter(b => b.m === 'gold' && inCup(b) && Math.hypot(b.vx, b.vy) < 40).length, ruined = golds.filter(b => b.m === 'stone').length;
      if (pulls && home + ruined >= total) {
        const share = home / total;
        if (share >= .6) { const pts = share > .9 ? 3 : 2; score += pts; api.score(score); notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, cup.y0); haptic('success'); banner = { txt: share > .9 ? 'All the gold!' : 'Got the gold', sub: `+${pts}`, l: 1.3, next: true }; }
        else fail('Gold turned to stone');
      }
    },
    draw(c) {
      c.fillStyle = '#1d1b2f'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      for (const w of cells) { c.fillStyle = '#3d3a5c'; c.fillRect(w.x - cs / 2, w.y - cs / 2, cs, cs); c.fillStyle = '#4a4670'; c.fillRect(w.x - cs / 2, w.y - cs / 2, cs, 3); }
      if (cup) { c.fillStyle = '#8d6e63'; c.fillRect(cup.x0, cup.y0 + cs * .3, cup.x1 - cup.x0, cs * .7); c.fillStyle = '#a1887f'; c.fillRect(cup.x0 - 4, cup.y0 + cs * .3, cup.x1 - cup.x0 + 8, 6); }
      for (const p of Object.values(pins)) {
        if (p.gone) continue;
        for (const q of p.parts) { c.fillStyle = '#ced4da'; c.fillRect(q.x - cs / 2, q.y - cs * .15, cs, cs * .3); c.fillStyle = '#adb5bd'; c.fillRect(q.x - cs / 2, q.y + cs * .05, cs, cs * .1); }
        // the pin's ring handle at its end
        const end = p.parts.reduce((a, b) => (mirror ? b.x < a.x : b.x > a.x) ? b : a);
        c.strokeStyle = '#f8f9fa'; c.lineWidth = 4; c.beginPath(); c.arc(end.x + (mirror ? -1 : 1) * cs * .25, end.y, cs * .22, 0, 7); c.stroke();
      }
      for (const b of balls) { c.fillStyle = COL[b.m] || COL.stone; c.beginPath(); c.arc(b.x, b.y, cs / 4 - .5, 0, 7); c.fill(); if (b.m === 'gold') { c.fillStyle = '#fff3b0'; c.fillRect(b.x - 3, b.y - 3, 2, 2); } }
      feel.end(c, W, H);
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '700 15px Rubik, sans-serif'; c.fillText(`Level ${lvl + 1}`, 16, 50);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < hearts ? '#f94144' : '#ffffff30'; c.beginPath(); c.arc(W - 20 - i * 20, 46, 6, 0, 7); c.fill(); }
      // retry button
      c.fillStyle = '#ffffff20'; c.beginPath(); c.roundRect(W / 2 - 50, H - 44, 100, 30, 8); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '700 14px Rubik, sans-serif'; c.fillText('RETRY', W / 2, H - 24);
      if (banner) { c.fillStyle = '#000000b0'; c.fillRect(0, H * .4 - 34, W, 70); c.fillStyle = '#fff'; c.font = '800 24px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .4); if (banner.sub) { c.font = '600 16px Rubik, sans-serif'; c.fillText(banner.sub, W / 2, H * .4 + 24); } }
      else if (lvl === 0 && !pulls) { c.font = '600 14px Rubik, sans-serif'; c.fillStyle = '#ffffffc0'; c.fillText('Tap a pin to pull it', W / 2, H - 58); }
    },
    down(x, y) {
      if (banner) return;
      if (y > H - 48 && Math.abs(x - W / 2) < 54) return fail('Retry');
      let best = null, bd = 1e9;
      for (const p of Object.values(pins)) if (!p.gone) for (const q of p.parts) { const d = Math.hypot(x - q.x, y - q.y); if (d < bd) { bd = d; best = p; } }
      if (!best || bd > cs * .9) return;
      best.gone = true; pulls++;
      for (const q of best.parts) phys.remove(q.body);
      sfx(700, .08, 'triangle', .04, -400); haptic('medium');
    },
    key(k, d) { if (d && k >= '1' && k <= '9' && pins[k] && !pins[k].gone) { const q = pins[k].parts[0]; this.down(q.x, q.y); } },
  };

  function fail(why) {
    hearts--; feel.hurt(W / 2, H / 2); haptic('error'); sfx(130, .25, 'square', .04);
    banner = hearts <= 0 ? { txt: why, l: 1.3, over: true } : { txt: why, sub: 'Try again', l: 1.1, retry: true };
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'pin-pull',
  title: 'Pin Pull',
  tag: 'Casual · Puzzle',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 12,
  hint: 'Tap pins to pull them so the gold pours into the pot. Lava turns gold to stone; pour water on lava first. Stuck? RETRY costs a heart.',
  make,
};
