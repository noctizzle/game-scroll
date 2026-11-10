// Ferry Crossing: get everyone across the river in a little boat that only carries so much. Tap someone on
// the boat's side to climb in, tap them again to climb out, and tap GO to row across. Each river has its
// own rule (who can't be left together, who can row, how heavy the boat can be). Break it and start over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 160, H = 176;
const K = C16;

const PUZZLES = [
  { rule: 'ONLY THE FARMER ROWS. FOX EATS GOOSE, GOOSE EATS GRAIN.', cap: 2, par: 7,
    who: [{ n: 'FARMER', c: 8, row: true }, { n: 'FOX', c: 3 }, { n: 'GOOSE', c: 1 }, { n: 'GRAIN', c: 4 }],
    bad(bank, all) { const has = n => bank.some(i => all[i].n === n); if (has('FARMER')) return null; if (has('FOX') && has('GOOSE')) return 'THE FOX ATE THE GOOSE'; if (has('GOOSE') && has('GRAIN')) return 'THE GOOSE ATE THE GRAIN'; return null; } },
  { rule: 'ANYONE ROWS. TROLLS MUST NEVER OUTNUMBER KNIGHTS ON A BANK.', cap: 2, par: 11,
    who: [{ n: 'KNIGHT', c: 14, row: true }, { n: 'KNIGHT', c: 14, row: true }, { n: 'KNIGHT', c: 14, row: true }, { n: 'TROLL', c: 6, row: true }, { n: 'TROLL', c: 6, row: true }, { n: 'TROLL', c: 6, row: true }],
    bad(bank, all) { const k = bank.filter(i => all[i].n === 'KNIGHT').length, tr = bank.filter(i => all[i].n === 'TROLL').length; return k && tr > k ? 'THE TROLLS WON' : null; } },
  { rule: 'BOAT HOLDS 80 KG. ANYONE CAN ROW.', cap: 2, max: 80, par: 9,
    who: [{ n: 'DAD', c: 8, row: true, kg: 80 }, { n: 'MUM', c: 10, row: true, kg: 80 }, { n: 'TIM', c: 5, row: true, kg: 40 }, { n: 'SUE', c: 2, row: true, kg: 40 }],
    bad() { return null; } },
  { rule: 'ONLY GROWN-UPS ROW. THE CAT EATS THE MOUSE IF ALONE.', cap: 2, par: 7,
    who: [{ n: 'GRAN', c: 9, row: true }, { n: 'CAT', c: 13 }, { n: 'MOUSE', c: 14 }, { n: 'CHEESE', c: 4 }],
    bad(bank, all) { const has = n => bank.some(i => all[i].n === n); if (has('GRAN')) return null; if (has('CAT') && has('MOUSE')) return 'THE CAT CAUGHT THE MOUSE'; if (has('MOUSE') && has('CHEESE')) return 'THE MOUSE ATE THE CHEESE'; return null; } },
];

function make(api) {
  const feel = new Feel({ pixel: true });
  let pz, side, at, boat, moves, score, lives, solved, t, banner, rowing;
  const RIV = () => [Math.round(W * .36), Math.round(W * .64)];

  function load() { pz = PUZZLES[solved % PUZZLES.length]; side = 0; at = pz.who.map(() => 0); boat = []; moves = 0; rowing = 0; }
  const pos = i => { // where a person stands
    if (boat.includes(i)) { const [a, b] = RIV(), bx = side === 0 ? a + 4 : b - 26; return [bx + 4 + boat.indexOf(i) * 12, 96]; }
    const list = pz.who.map((_, k) => k).filter(k => at[k] === at[i] && !boat.includes(k)), j = list.indexOf(i);
    return [at[i] === 0 ? 8 + (j % 2) * 24 : W - 32 + (j % 2) * 24 - 8, 40 + Math.floor(j / 2) * 22];
  };

  return {
    reset() { score = 0; lives = 3; solved = 0; t = 0; banner = null; load(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (rowing > 0) { rowing -= dt; if (rowing <= 0) arrive(); }
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); load(); } }
    },
    draw(c) {
      const [a, b] = RIV();
      c.fillStyle = K[5]; c.fillRect(0, 0, W, H); c.fillStyle = K[7]; c.fillRect(a, 0, b - a, H);
      c.fillStyle = K[14]; for (let i = 0; i < 8; i++) c.fillRect(a + 4 + (i * 13) % (b - a - 8), (i * 29 + Math.floor(t * 10)) % H, 4, 1);
      feel.begin(c);
      // boat
      const k = rowing > 0 ? 1 - rowing / .8 : 0, bx = Math.round((side === 0 ? a + 4 : b - 26) + (side === 0 ? 1 : -1) * k * (b - a - 30));
      c.fillStyle = K[11]; c.fillRect(bx, 104, 26, 6); c.fillStyle = K[12]; c.fillRect(bx + 2, 110, 22, 2);
      pz.who.forEach((p, i) => {
        let [x, y] = pos(i); if (boat.includes(i)) x += bx - (side === 0 ? a + 4 : b - 26);
        c.fillStyle = K[p.c]; c.fillRect(x, y, 10, 10); c.fillStyle = K[0]; c.fillRect(x + 2, y + 3, 2, 2); c.fillRect(x + 6, y + 3, 2, 2);
        text(c, p.n.slice(0, 2), x + 5, y + 12, { align: 'center', color: K[0], font: 'small' });
      });
      feel.end(c, W, H);
      // GO button and rule card
      c.fillStyle = boat.some(i => pz.who[i].row) && !rowing ? K[2] : K[13]; c.fillRect(W / 2 - 14, 126, 28, 14); text(c, 'GO', W / 2, 130, { align: 'center', color: K[1] });
      c.fillStyle = K[0]; c.fillRect(0, H - 30, W, 30);
      const words = pz.rule.split(' '); let line = '', ly = H - 27;
      for (const w of words) { if ((line + ' ' + w).length > 30) { text(c, line.trim(), W / 2, ly, { align: 'center', color: K[1], font: 'small' }); ly += 8; line = ''; } line += ' ' + w; }
      text(c, line.trim(), W / 2, ly, { align: 'center', color: K[1], font: 'small' });
      text(c, `${score}`, 4, 3, { color: K[0] });
      text(c, `MOVES ${moves}/${pz.par}`, W - 4, 3, { align: 'right', color: K[0] });
      for (let i = 0; i < lives; i++) { c.fillStyle = K[2]; c.fillRect(4 + i * 6, 12, 4, 4); }
      if (banner) { c.fillStyle = K[0]; c.fillRect(0, 58, W, 20); text(c, banner.txt, W / 2, 65, { align: 'center', color: K[4] }); }
    },
    down(x, y) {
      if (banner || rowing > 0) return;
      if (y > 122 && y < 144 && Math.abs(x - W / 2) < 18) return go();
      let best = -1, bd = 1e9;
      pz.who.forEach((p, i) => { const [px, py] = pos(i); const d = Math.hypot(px + 5 - x, py + 5 - y); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || bd > 14) return;
      if (boat.includes(best)) { boat = boat.filter(i => i !== best); sfx(400, .03, 'square', .02); return; }
      if (at[best] !== side) return;
      const kg = boat.reduce((s, i) => s + (pz.who[i].kg || 0), 0) + (pz.who[best].kg || 0);
      if (boat.length >= pz.cap || (pz.max && kg > pz.max)) { sfx(150, .08, 'square', .03); haptic('warning'); return; }
      boat.push(best); sfx(600, .03, 'square', .02); haptic('tick');
    },
  };

  function go() {
    if (!boat.some(i => pz.who[i].row)) { sfx(150, .08, 'square', .03); return; }
    rowing = .8; moves++; sfx(300, .3, 'triangle', .03, -100);
  }
  function arrive() {
    side = 1 - side; for (const i of boat) at[i] = side;
    // check both banks: the one left behind and the one arrived at (everyone off the boat counts there)
    for (const s of [0, 1]) { const bank = pz.who.map((_, i) => i).filter(i => at[i] === s); const why = pz.bad(bank, pz.who); if (why) { lives--; feel.hurt(W / 2, 70); haptic('error'); banner = { txt: why, l: 1.6, over: lives <= 0 }; return; } }
    boat = [];
    if (at.every(v => v === 1)) {
      solved++; const pts = 3 + (moves <= pz.par ? 2 : 0); score += pts; api.score(score);
      notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, 70); haptic('success');
      banner = { txt: moves <= pz.par ? `PERFECT! +${pts}` : `ALL ACROSS +${pts}`, l: 1.4 };
    }
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ferry-crossing',
  title: 'Ferry Crossing',
  tag: 'Color · Logic',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 176, maxW: 220, maxH: 240,
  goal: 15,
  hint: 'Tap people to put them in the boat, tap GO to row across. Follow the river\'s rule about who can be left together, who rows and the weight limit. Get everyone over.',
  make,
};
