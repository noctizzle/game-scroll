import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';

// Pairs of jelly blobs drop into a well. Slide them with your finger, tap to spin, flick down to
// drop. Four or more touching blobs of one colour pop, and blobs that fall into new groups pop as
// chains for big points. Grey junk blobs drop in after a while and only clear when a pop touches them.
const COLS = 6, ROWS = 12;
const COL = [['#e84848', '#ffa0a0', '#901818'], ['#48c048', '#b0f8a0', '#186818'], ['#4880f0', '#b0d0ff', '#183890'], ['#f8c830', '#fff0a0', '#987010'], ['#b058e0', '#e8b0ff', '#582880']];
const JUNK = 9;
let W = 160, H = 192, CS = 14;

function make(api) {
  let g, cur, next, score, t, fallT, speed, lock, phase, chain, pops, msg, drag, kinds, junkT, dead;
  const L = () => Math.max(4, (W - COLS * CS - 48) >> 1), T = () => H - ROWS * CS - 4;
  const size = () => { CS = Math.max(10, Math.min(22, Math.floor((H - 8) / ROWS), Math.floor((W - 56) / COLS))); };
  const pair = () => ({ a: Math.random() * kinds | 0, b: Math.random() * kinds | 0 });
  const offs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const cells = p => [[p.x, p.y, p.a], [p.x + offs[p.r][0], p.y + offs[p.r][1], p.b]];
  const free = (x, y) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !g[y][x]);
  const fits = p => cells(p).every(([x, y]) => free(x, y));
  function spawn() {
    cur = { ...next, x: 2, y: 0, r: 0, land: 0 }; next = pair();
    if (!fits(cur) || g[0][2] || g[0][3]) { dead = 1; haptic('error'); sfx(110, .6, 'square', .05, -40); }
  }
  function tryMove(dx, dy) { const p = { ...cur, x: cur.x + dx, y: cur.y + dy }; if (fits(p)) { cur = p; return true; } return false; }
  function spin() {
    const r = (cur.r + 1) % 4; for (const kick of [0, -1, 1, 0]) { const p = { ...cur, r, x: cur.x + kick, y: cur.y - (kick === 0 && r === 2 ? 0 : 0) }; if (fits(p)) { cur = p; sfx(700, .03, 'square', .03); haptic('tick'); return; } }
    const p = { ...cur, r, y: cur.y - 1 }; if (fits(p)) { cur = p; sfx(700, .03, 'square', .03); }
  }
  function place() {
    for (const [x, y, k] of cells(cur)) if (y >= 0) g[y][x] = { k, pop: 0 }; else { dead = 1; }
    cur = null; chain = 0; phase = 'fall'; haptic('light'); sfx(220, .05, 'square', .04);
  }
  function gravity() {
    let moved = false;
    for (let y = ROWS - 2; y >= 0; y--) for (let x = 0; x < COLS; x++) if (g[y][x] && !g[y + 1][x]) { g[y + 1][x] = g[y][x]; g[y][x] = null; moved = true; }
    return moved;
  }
  function findGroups() {
    const seen = new Set(), hit = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const b = g[y][x]; if (!b || b.k === JUNK || seen.has(y * COLS + x)) continue;
      const grp = [], st = [[x, y]]; seen.add(y * COLS + x);
      while (st.length) { const [cx, cy] = st.pop(); grp.push([cx, cy]); for (const [dx, dy] of offs) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(ny * COLS + nx)) continue; const n = g[ny][nx]; if (n && n.k === b.k) { seen.add(ny * COLS + nx); st.push([nx, ny]); } } }
      if (grp.length >= 4) hit.push(grp);
    }
    return hit;
  }
  function popGroups(hit) {
    chain++; let n = 0; const junk = new Set();
    for (const grp of hit) for (const [x, y] of grp) { g[y][x].pop = .4; n++; for (const [dx, dy] of offs) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && g[ny][nx] && g[ny][nx].k === JUNK) junk.add(ny * COLS + nx); } }
    for (const i of junk) g[i / COLS | 0][i % COLS].pop = .4;
    const pts = n * 10 * chain * chain + (hit.length > 1 ? 20 * hit.length : 0); score += pts; api.score(score);
    const [px, py] = hit[0][0]; pops.push({ x: L() + px * CS + CS / 2, y: T() + py * CS, txt: chain > 1 ? `${chain} CHAIN!` : `+${pts}`, l: 1, big: chain > 1 });
    haptic(chain > 1 ? 'success' : 'medium'); sfx(440 + chain * 160, .14, 'square', .05, 300);
  }
  function dropJunk() {
    const n = 2 + Math.min(4, score / 800 | 0); const xs = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - .5).slice(0, n);
    for (const x of xs) if (!g[0][x]) g[0][x] = { k: JUNK, pop: 0 };
    msg = { txt: 'JUNK!', l: 1 }; sfx(160, .2, 'square', .04, -60); haptic('medium');
  }
  const self = {
    reset() { size(); g = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); kinds = 4; score = 0; t = 0; fallT = 0; speed = .7; chain = 0; pops = []; msg = { txt: 'MATCH 4 TO POP', l: 2 }; drag = null; junkT = 45; dead = 0; phase = 'play'; next = pair(); spawn(); },
    resize(w, h) { W = w; H = h; size(); },
    update(dt) {
      t += dt; for (const p of pops) p.l -= dt; pops = pops.filter(p => p.l > 0); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.6) return api.over(); return; }
      if (t > 60 && kinds === 4) { kinds = 5; msg = { txt: 'NEW COLOUR!', l: 1.5 }; }
      speed = Math.max(.12, .7 - t / 300);
      if (phase === 'fall') { fallT -= dt; if (fallT > 0) return; fallT = .05; if (gravity()) return; const hit = findGroups(); if (hit.length) { popGroups(hit); phase = 'pop'; fallT = .4; } else { phase = 'play'; junkT -= 1; if (junkT <= 0 && t > 40) { junkT = Math.max(6, 14 - t / 40 | 0); dropJunk(); phase = 'fall'; return; } spawn(); } return; }
      if (phase === 'pop') { fallT -= dt; for (const row of g) for (let x = 0; x < COLS; x++) if (row[x] && row[x].pop > 0) { row[x].pop -= dt; if (row[x].pop <= 0) row[x] = null; } if (fallT <= 0) { phase = 'fall'; fallT = .08; } return; }
      if (!cur) return;
      fallT += dt * (self.soft ? 10 : 1);
      if (fallT >= speed) { fallT = 0; if (!tryMove(0, 1)) { cur.land += speed; } else cur.land = 0; }
      if (!tryMove(0, 0) || (cur.land > 0 && !fits({ ...cur, y: cur.y + 1 }))) { cur.land += dt; if (cur.land > .5 || self.soft) place(); }
    },
    draw(c) {
      const l = L(), tp = T();
      c.fillStyle = '#281838'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#30204a' : '#2a1c40'; c.beginPath(); c.arc((i * 47) % W, (i * 71 + t * 5) % (H + 40) - 20, 14 + (i % 3) * 6, 0, 7); c.fill(); }
      c.fillStyle = '#100818'; c.fillRect(l - 3, tp - 3, COLS * CS + 6, ROWS * CS + 6);
      c.fillStyle = '#1c1028'; c.fillRect(l, tp, COLS * CS, ROWS * CS);
      c.fillStyle = '#ff404040'; c.fillRect(l + 2 * CS, tp, CS * 2, CS);
      const blob = (k, x, y, sq = 0, glow = 0) => {
        const r = CS / 2 - .5, cx = x + CS / 2, cy = y + CS / 2;
        if (k === JUNK) { c.fillStyle = '#787888'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.fillStyle = '#a8a8b8'; c.fillRect(cx - r / 2, cy - r / 2, 2, 2); c.fillStyle = '#484858'; c.fillRect(cx + 1, cy + 1, r / 2, 2); return; }
        const col = COL[k]; c.fillStyle = glow ? '#ffffff' : col[0]; c.beginPath(); c.ellipse(cx, cy + sq, r + sq, r - sq, 0, 0, 7); c.fill();
        c.fillStyle = col[1]; c.beginPath(); c.arc(cx - r * .35, cy - r * .35, r * .28, 0, 7); c.fill();
        c.fillStyle = col[2]; c.fillRect(cx - r * .45, cy + r * .05, Math.max(1, r * .2), Math.max(2, r * .3)); c.fillRect(cx + r * .25, cy + r * .05, Math.max(1, r * .2), Math.max(2, r * .3));
      };
      // links between same-colour neighbours make groups readable
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const b = g[y][x]; if (!b || b.k === JUNK) continue; c.fillStyle = COL[b.k][0]; if (x < COLS - 1 && g[y][x + 1] && g[y][x + 1].k === b.k) c.fillRect(l + x * CS + CS / 2, tp + y * CS + CS * .3, CS, CS * .4); if (y < ROWS - 1 && g[y + 1][x] && g[y + 1][x].k === b.k) c.fillRect(l + x * CS + CS * .3, tp + y * CS + CS / 2, CS * .4, CS); }
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const b = g[y][x]; if (b) { if (b.pop > 0 && (b.pop * 20 | 0) % 2) continue; blob(b.k, l + x * CS, tp + y * CS, 0, b.pop > 0); } }
      if (cur && !dead) {
        // ghost shows where the pair will land
        let gy = { ...cur }; while (fits({ ...gy, y: gy.y + 1 })) gy.y++;
        c.globalAlpha = .3; for (const [x, y, k] of cells(gy)) if (y >= 0) blob(k, l + x * CS, tp + y * CS); c.globalAlpha = 1;
        const off = Math.min(1, fallT / speed) * (fits({ ...cur, y: cur.y + 1 }) ? CS * .6 : 0);
        c.save(); c.beginPath(); c.rect(l, tp, COLS * CS, ROWS * CS); c.clip();
        for (const [x, y, k] of cells(cur)) blob(k, l + x * CS, tp + y * CS + off);
        c.restore();
      }
      // next pair and score
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left';
      const side = true, nx = l + COLS * CS + 8, ny = tp + 12;
      c.fillStyle = '#f8f0ff'; if (side) c.fillText('NEXT', nx, tp + 6);
      c.fillStyle = '#100818'; c.fillRect(nx - 2, ny - 2, CS + 4, CS * 2 + 4);
      blob(next.a, nx, ny + CS); blob(next.b, nx, ny);
      c.fillStyle = '#f8f0ff'; c.textAlign = side ? 'left' : 'right'; if (side) { c.fillText('SCORE', nx, ny + CS * 2 + 16); c.fillStyle = '#f8c830'; c.fillText(String(score), nx, ny + CS * 2 + 26); }
      c.textAlign = 'center';
      for (const p of pops) { const y = p.y - (1 - p.l) * 18; c.font = (p.big ? 8 : 6) + 'px "Press Start 2P", monospace'; c.fillStyle = '#100818'; c.fillText(p.txt, p.x + 1, y + 1); c.fillStyle = p.big ? '#80f8ff' : '#f8c830'; c.fillText(p.txt, p.x, y); }
      c.font = '6px "Press Start 2P", monospace';
      if (msg) { c.fillStyle = '#100818'; c.fillRect(l, tp + ROWS * CS / 2 - 9, COLS * CS, 14); c.fillStyle = '#f8f0ff'; c.fillText(msg.txt, l + COLS * CS / 2, tp + ROWS * CS / 2); }
      if (t < 6 && !msg) { c.fillStyle = '#100818c0'; c.fillRect(l, tp + ROWS * CS - 26, COLS * CS, 22); c.fillStyle = '#f8f0ff'; c.fillText('SLIDE · TAP SPIN', l + COLS * CS / 2, tp + ROWS * CS - 17); c.fillText('FLICK DOWN DROP', l + COLS * CS / 2, tp + ROWS * CS - 8); }
      if (dead) { c.fillStyle = '#000a'; c.fillRect(0, H / 2 - 12, W, 22); c.fillStyle = '#f84848'; c.font = '8px "Press Start 2P", monospace'; c.fillText('TOPPED OUT', W / 2, H / 2 + 2); }
    },
    down(x, y) { drag = { x0: x, y0: y, x, y, t: performance.now(), col: cur ? cur.x : 0, moved: false }; },
    move(x, y, p) {
      if (!p || !drag || !cur || phase !== 'play') return; drag.x = x; drag.y = y;
      const dx = Math.round((x - drag.x0) / (CS * 1.1)); if (Math.abs(x - drag.x0) > 6) drag.moved = true;
      const want = drag.col + dx; let guard = 6; while (cur.x !== want && guard--) { if (!tryMove(Math.sign(want - cur.x), 0)) break; sfx(500, .02, 'square', .02); }
      if (y - drag.y0 > CS * 1.5 && Math.abs(y - drag.y0) > Math.abs(x - drag.x0) * 1.5) { drag.moved = true; self.soft = true; }
    },
    up() {
      if (drag && cur && phase === 'play') { const dt = performance.now() - drag.t, dy = drag.y - drag.y0; if (dy > CS * 2 && dt < 260) { while (tryMove(0, 1)); place(); sfx(180, .08, 'square', .05, -80); } else if (!drag.moved && dt < 300) spin(); }
      drag = null; self.soft = false;
    },
    key(k, d) { if (!d) { if (k === 'ArrowDown') self.soft = false; return; } if (!cur || phase !== 'play') return; if (k === 'ArrowLeft') tryMove(-1, 0); if (k === 'ArrowRight') tryMove(1, 0); if (k === 'ArrowUp' || k === ' ') spin(); if (k === 'ArrowDown') self.soft = true; },
  };
  return self;
}

export default {
  id: 'blob-pairs', title: 'Blob Pairs', tag: 'Advance · Puzzle', retro: true, era: 'advance', pal: 'berry', w: 160, h: 192, maxW: 240, maxH: 320, goal: 1500,
  hint: 'Pairs of blobs fall into the well. Drag sideways to slide them, tap to spin, flick down to drop. Four or more touching blobs of one colour pop. Set up chains so falling blobs make new groups for huge points. Grey junk only clears when a pop touches it.',
  make,
};
