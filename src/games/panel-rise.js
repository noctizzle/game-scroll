import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;

// Coloured panels rise from the bottom. Drag a panel sideways to swap it with its neighbour and line
// up three or more of a colour across or down. Cleared panels let the ones above drop, and drops that
// make new lines score chain bonuses. Don't let the stack touch the top.
const COLS = 6;
let CS = 16;
const COL = [['#e04848', '#f89090', '#902020'], ['#f8c838', '#fff0a0', '#a07810'], ['#48b848', '#a0f0a0', '#206820'], ['#4878e8', '#a0c0ff', '#203890'], ['#b058d8', '#e0a8ff', '#602888'], ['#38c8c8', '#a8f8f0', '#107070']];
let W = 160, H = 160;

function make(api) {
  let g, R, rise, speed, preview, score, t, drag, chain, pop, stop, danger, fallT, kinds, msg;
  const bottom = () => H - 12, left = () => (W - COLS * CS) >> 1;
  const rows = () => Math.max(7, Math.floor((H - 26) / CS));
  const sizeCells = () => { CS = Math.max(16, Math.min(24, Math.floor((W - 24) / COLS))); };
  function newRow(avoidAbove) {
    const r = [];
    for (let c = 0; c < COLS; c++) { let k, n = 0; do { k = Math.random() * kinds | 0; n++; } while (n < 20 && ((c >= 2 && r[c - 1].k === k && r[c - 2].k === k) || (avoidAbove && avoidAbove[c] && avoidAbove[c].k === k))); r.push({ k, clr: 0 }); }
    return r;
  }
  function build() { R = rows(); g = Array.from({ length: R }, () => Array(COLS).fill(null)); for (let i = 0; i < 4; i++) { g.splice(0, 1); g.push(newRow(g[R - 2])); } for (let r = 0; r < R; r++) for (let c = 0; c < COLS; c++) if (r < R - 4 && g[r][c]) g[r][c] = null; for (let c = 0; c < COLS; c++) if (Math.random() < .5) g[R - 4][c] = null; settleAll(); preview = newRow(g[R - 1]); }
  function settleAll() { for (let c = 0; c < COLS; c++) { const col = []; for (let r = R - 1; r >= 0; r--) if (g[r][c]) col.push(g[r][c]); for (let r = R - 1, i = 0; r >= 0; r--, i++) g[r][c] = col[i] || null; } }
  function fallStep() { let moved = false; for (let r = R - 2; r >= 0; r--) for (let c = 0; c < COLS; c++) { const p = g[r][c]; if (p && !p.clr && !g[r + 1][c]) { g[r + 1][c] = p; g[r][c] = null; p.fell = true; moved = true; } } return moved; }
  function findMatches() {
    const hit = new Set();
    const ok = (r, c) => g[r][c] && !g[r][c].clr && (r === R - 1 || g[r + 1][c]);
    for (let r = 0; r < R; r++) for (let c = 0; c < COLS; c++) {
      if (!ok(r, c)) continue; const k = g[r][c].k;
      let n = 1; while (c + n < COLS && ok(r, c + n) && g[r][c + n].k === k) n++; if (n >= 3) for (let i = 0; i < n; i++) hit.add(r * COLS + c + i);
      n = 1; while (r + n < R && ok(r + n, c) && g[r + n][c].k === k) n++; if (n >= 3) for (let i = 0; i < n; i++) hit.add((r + i) * COLS + c);
    }
    return hit;
  }
  function resolve() {
    const hit = findMatches(); if (!hit.size) { for (const row of g) for (const p of row) if (p) p.fell = false; return false; }
    let fromFall = false; for (const i of hit) { const p = g[i / COLS | 0][i % COLS]; if (p.fell) fromFall = true; p.clr = .45; }
    chain = fromFall ? chain + 1 : 1; const pts = hit.size * chain + (hit.size > 3 ? hit.size - 3 : 0); score += pts; api.score(score);
    stop = Math.max(stop, .6 + (hit.size - 3) * .4 + (chain - 1) * .8);
    const i0 = [...hit][0]; pop.push({ x: left() + (i0 % COLS) * CS + (CS >> 1), y: (i0 / COLS | 0), txt: chain > 1 ? `CHAIN x${chain}` : hit.size > 3 ? `${hit.size} COMBO` : `+${pts}`, l: .9 });
    haptic(chain > 1 ? 'success' : 'medium'); sfx(500 + chain * 120 + hit.size * 20, .12, 'square', .05, 200);
    for (const row of g) for (const p of row) if (p && !hit.has(g.indexOf(row) * COLS + row.indexOf(p))) p.fell = false;
    return true;
  }
  function pushRow() {
    if (g[0].some(Boolean)) return false;
    g.shift(); g.push(preview); preview = newRow(g[R - 1]); if (drag) drag.r--; return true;
  }
  const busy = () => g.some(row => row.some(p => p && p.clr > 0));
  const self = {
    reset() { kinds = 5; rise = 0; speed = .12; score = 0; t = 0; drag = null; chain = 1; pop = []; stop = 1.5; danger = 0; fallT = 0; msg = null; build(); },
    resize(w, h) { W = w; H = h; sizeCells(); if (g) { const nr = rows(); while (R < nr) { g.unshift(Array(COLS).fill(null)); R++; } while (R > nr && !g[0].some(Boolean)) { g.shift(); R--; } if (R > nr) build(); } },
    update(dt) {
      t += dt; for (const p of pop) p.l -= dt; pop = pop.filter(p => p.l > 0);
      let clearing = false;
      for (const row of g) for (let c = 0; c < COLS; c++) { const p = row[c]; if (p && p.clr > 0) { p.clr -= dt; clearing = true; if (p.clr <= 0) { row[c] = null; for (let r = g.indexOf(row) - 1; r >= 0; r--) if (g[r][c]) g[r][c].fell = true; } } }
      fallT -= dt; if (fallT <= 0) { fallT = .05; const moved = fallStep(); if (!moved && !clearing) resolve(); }
      if (clearing || busy()) return;
      if (stop > 0) { stop -= dt; return; }
      speed = .12 + Math.min(.5, t / 400) + (kinds > 5 ? .05 : 0); if (t > 90 && kinds === 5) { kinds = 6; msg = { txt: 'NEW COLOUR!', l: 1.5 }; }
      const top = g[0].some(Boolean); danger = top ? danger + dt : 0;
      if (!top) rise += speed * (self.boost ? 6 : 1) * dt;
      if (danger > 2) { haptic('error'); sfx(130, .5, 'square', .05, -40); return api.over(); }
      if (rise >= 1) { if (pushRow()) rise -= 1; else rise = 1; }
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
    },
    draw(c) {
      const L = left(), B = bottom(), top = B - R * CS, off = rise * CS;
      c.fillStyle = '#20183a'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 18; i++) { c.fillStyle = i % 2 ? '#2c2450' : '#262046'; c.fillRect(0, (i * 23 + t * 6) % (H + 23) - 23, W, 11); }
      c.fillStyle = '#100c20'; c.fillRect(L - 3, top - 3, COLS * CS + 6, R * CS + 15);
      c.save(); c.beginPath(); c.rect(L, top, COLS * CS, R * CS + 12); c.clip();
      c.fillStyle = danger > 0 && (t * 8 | 0) % 2 ? '#401828' : '#181430'; c.fillRect(L, top, COLS * CS, R * CS);
      const panel = (p, x, y, dim) => {
        const k = COL[p.k], fl = p.clr > 0 && (p.clr * 20 | 0) % 2; c.fillStyle = fl ? '#f8f8f0' : k[0]; c.fillRect(x, y, CS - 1, CS - 1);
        if (!fl) { c.fillStyle = k[1]; c.fillRect(x, y, CS - 1, 2); c.fillRect(x, y, 2, CS - 1); c.fillStyle = k[2]; c.fillRect(x + 2, y + CS - 3, CS - 3, 2); c.fillRect(x + CS - 3, y + 2, 2, CS - 3);
          c.fillStyle = k[1]; const m = x + (CS >> 1) - 1, n = y + (CS >> 1) - 1; if (p.k === 0) c.fillRect(m - 2, n - 2, 4, 4); else if (p.k === 1) { c.fillRect(m - 1, n - 3, 2, 6); c.fillRect(m - 3, n - 1, 6, 2); } else if (p.k === 2) { c.fillRect(m - 3, n + 1, 6, 2); c.fillRect(m - 1, n - 3, 2, 4); } else if (p.k === 3) { c.fillRect(m - 3, n - 3, 2, 2); c.fillRect(m + 1, n + 1, 2, 2); c.fillRect(m - 1, n - 1, 2, 2); } else if (p.k === 4) { c.fillRect(m - 3, n - 1, 6, 2); } else { c.fillRect(m - 2, n - 3, 4, 2); c.fillRect(m - 2, n + 1, 4, 2); } }
        if (dim) { c.fillStyle = '#0008'; c.fillRect(x, y, CS - 1, CS - 1); }
      };
      for (let r = 0; r < R; r++) for (let cc = 0; cc < COLS; cc++) { const p = g[r][cc]; if (p) panel(p, L + cc * CS, top + r * CS - off + CS * 0, false); }
      for (let cc = 0; cc < COLS; cc++) panel(preview[cc], L + cc * CS, B - off + 0, true);
      if (drag) { c.strokeStyle = '#f8f8f0'; c.lineWidth = 1; c.strokeRect(L + drag.c * CS - .5, top + drag.r * CS - off - .5, CS, CS); }
      c.restore();
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of pop) { const y = top + p.y * CS - off - (1 - p.l) * 14; c.fillStyle = '#100c20'; c.fillText(p.txt, p.x + 1, y + 1); c.fillStyle = '#f8d838'; c.fillText(p.txt, p.x, y); }
      if (stop > 0 && t > 2 && !busy()) { c.fillStyle = '#a0f0a0'; c.fillText('STOP', W / 2, top - 6 > 12 ? top - 6 : H - 2); }
      if (msg) { c.fillStyle = '#f8d838'; c.fillText(msg.txt, W / 2, H / 2); }
      if (t < 5) { c.fillStyle = '#f8f8f0'; c.fillText('DRAG TO SWAP', W / 2, H - 2); }
    },
    down(x, y) {
      const L = left(), top = bottom() - R * CS, cc = Math.floor((x - L) / CS), r = Math.floor((y - top + rise * CS) / CS);
      if (r >= R) { self.boost = true; return; }
      if (cc < 0 || cc >= COLS || r < 0) return; drag = { c: cc, r };
    },
    move(x, y, p) {
      if (!p || !drag) return; const cc = Math.floor((x - left()) / CS);
      if (cc === drag.c || cc < 0 || cc >= COLS) return; const d = Math.sign(cc - drag.c), r = drag.r, a = g[r] && g[r][drag.c], b = g[r] && g[r][drag.c + d];
      if (!g[r] || (a && a.clr) || (b && b.clr) || (!a && !b)) { drag.c += d; return; }
      if (r > 0 && !b && g[r - 1][drag.c + d] && g[r - 1][drag.c + d].clr) return;
      g[r][drag.c] = b; g[r][drag.c + d] = a; if (a) a.fell = false; if (b) b.fell = false; drag.c += d; chain = 1; haptic('tick'); sfx(400, .03, 'square', .03);
      fallT = .06;
    },
    up() { drag = null; self.boost = false; },
    key(k, d) { if (k === 'ArrowUp') self.boost = d; if (d && k === ' ') { const h = findMatches(); if (!h.size) self.boost = !self.boost; } },
  };
  return self;
}

export default {
  id: 'panel-rise', title: 'Panel Rise', tag: 'Color · Puzzle', retro: true, era: 'color', pal: 'grape', w: 160, h: 160, maxW: 220, maxH: 300, goal: 100,
  hint: 'Drag a panel left or right to swap it. Line up three or more of a colour, across or down. Drops that make new lines are chains worth more. Hold below the stack to raise it faster. Don\'t let it reach the top.',
  make,
};
