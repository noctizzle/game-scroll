// Hex Merge: tap an empty hex to place the next numbered tile. Three or more touching tiles with the same
// number merge into one tile one higher, right where you placed the last one, and merges can chain.
// Plan ahead: when the board fills up, it's over. You can swap the next tile with the held one.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { HexMap } = gs.hex;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 360, H = 640;
const COLS = ['#ffffff', '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffd166', '#06d6a0'];

function make(api) {
  const feel = new Feel();
  let map, next, held, score, t, best, ended, pops;

  function build() {
    const size = Math.min(30, (W - 30) / 13);
    map = new HexMap({ size, shape: 'hex', radius: 3, pointy: true, x: (W - 7 * Math.sqrt(3) * size) / 2, y: H * .44 - size * 5.5 });
    map.each(c => { c.data.v = 0; });
  }
  const roll = () => { const top = Math.min(4, 1 + Math.floor(best / 3)); const r = Math.random(); return r < .5 ? 1 : r < .8 ? Math.min(2, top) : 1 + (Math.random() * top | 0); };
  function group(cell) {
    const v = cell.data.v, seen = new Set([cell]), q = [cell];
    while (q.length) { const c = q.pop(); for (const n of map.neighbours(c)) if (!seen.has(n) && n.data.v === v) { seen.add(n); q.push(n); } }
    return [...seen];
  }

  return {
    reset() { score = 0; t = 0; best = 1; ended = false; pops = []; build(); next = 1; held = 2; feel.clear(); },
    resize(w, h) { W = w; H = h; if (map) { const old = map.list.map(c => [c.q, c.r, c.data.v]); build(); for (const [q, r, v] of old) { const c = map.cell(q, r); if (c) c.data.v = v; } } },
    update(dt) { feel.update(dt); if (feel.frozen) return; t += dt; for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0); },
    draw(c) {
      c.fillStyle = '#2b2d42'; c.fillRect(0, 0, W, H);
      feel.begin(c);
      map.each(cell => {
        c.beginPath(); cell.corners.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
        c.fillStyle = cell.data.v ? COLS[Math.min(COLS.length - 1, cell.data.v)] : '#3d405b'; c.fill();
        c.strokeStyle = '#2b2d42'; c.lineWidth = 3; c.stroke();
        if (cell.data.v) { c.fillStyle = '#2b2d42'; c.font = `800 ${Math.round(map.size * .8)}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(cell.data.v, cell.x, cell.y + map.size * .28); }
      });
      for (const p of pops) { c.strokeStyle = `rgba(255,255,255,${p.l * 2})`; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, map.size * (1.6 - p.l * 2), 0, 7); c.stroke(); }
      feel.end(c, W, H);
      // next and held tiles
      const tile = (v, x, y, label, big) => { const r = big ? 34 : 26; c.fillStyle = COLS[v]; c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.fill(); c.fillStyle = '#2b2d42'; c.font = `800 ${big ? 28 : 22}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(v, x, y + (big ? 10 : 8)); c.fillStyle = '#ffffffa0'; c.font = '600 12px Rubik, sans-serif'; c.fillText(label, x, y + r + 18); };
      tile(next, W / 2, H - 110, 'NEXT', true);
      tile(held, W / 2 + 100, H - 110, 'HELD · tap to swap', false);
      c.fillStyle = '#ffffffa0'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'center';
      if (t < 6 && score === 0) c.fillText('Tap a hex to place. Three alike merge!', W / 2, H - 40);
    },
    down(x, y) {
      if (ended) return;
      if (Math.hypot(x - (W / 2 + 100), y - (H - 110)) < 40) { [next, held] = [held, next]; sfx(600, .04, 'triangle', .03); haptic('tick'); return; }
      const cell = map.at(x, y); if (!cell || cell.data.v) return;
      cell.data.v = next; sfx(400 + next * 60, .05, 'triangle', .03); haptic('light');
      // merge, and keep merging while the new tile makes another group
      let chain = 0;
      for (;;) {
        const g = group(cell); if (g.length < 3) break;
        chain++; const v = cell.data.v;
        for (const o of g) if (o !== cell) { o.data.v = 0; pops.push({ x: o.x, y: o.y, l: .5 }); }
        cell.data.v = v + 1; best = Math.max(best, v + 1);
        const pts = (v + 1) * g.length * chain; score += pts; api.score(score);
        feel.coin(cell.x, cell.y); notes(['C5', 'E5', 'G5', 'C6', 'E6'][Math.min(4, chain - 1)], { len: .06 }); haptic(chain > 1 ? 'medium' : 'success');
        if (chain > 1) feel.juice.pop(cell.x, cell.y - 30, `CHAIN x${chain}`, { color: '#ffd166' });
      }
      next = roll();
      if (map.list.every(c => c.data.v)) { ended = true; feel.lose(); api.over(); }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'hex-merge',
  title: 'Hex Merge',
  tag: 'Casual · Merge',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 120,
  hint: 'Tap an empty hex to place the next tile. Three or more touching alike merge into one higher, and merges chain. Swap with the held tile. A full board ends it.',
  make,
};
