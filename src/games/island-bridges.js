// Island Bridges: each island's number says how many bridges touch it. Drag from one island to another in
// a straight line to build a bridge; drag again for a double bridge, and a third time to take it away.
// Bridges can't cross. Match every number and link all the islands into one group.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 160, H = 192;
const K = C16;

function make(api) {
  const feel = new Feel({ pixel: true });
  let N, isl, need, links, drag, score, solved, time, t, banner, ended;
  const CS = () => Math.floor(Math.min(W - 12, H - 40) / N), GX = () => Math.round((W - CS() * N) / 2), GY = () => 18 + Math.round((H - 30 - CS() * N) / 2);
  const at = (r, c) => isl.findIndex(p => p.r === r && p.c === c);
  const key = (a, b) => a < b ? a + '-' + b : b + '-' + a;

  function cellsBetween(a, b) {
    const A = isl[a], B = isl[b], out = [];
    if (A.r === B.r) for (let c = Math.min(A.c, B.c) + 1; c < Math.max(A.c, B.c); c++) out.push([A.r, c, 'h']);
    else for (let r = Math.min(A.r, B.r) + 1; r < Math.max(A.r, B.r); r++) out.push([r, A.c, 'v']);
    return out;
  }
  function used(skip) { const m = new Map(); for (const [k, n] of links) if (n && k !== skip) { const [a, b] = k.split('-').map(Number); for (const [r, c, o] of cellsBetween(a, b)) m.set(r + ',' + c, o); } return m; }

  function newPuzzle() {
    N = solved < 3 ? 5 : solved < 7 ? 6 : 7;
    const want = Math.min(12, 5 + solved);
    for (let attempt = 0; attempt < 50; attempt++) {
      isl = [{ r: Math.random() * N | 0, c: Math.random() * N | 0 }]; need = [0];
      const occ = new Map([[isl[0].r + ',' + isl[0].c, 'I']]);
      for (let tries = 0; tries < 400 && isl.length < want; tries++) {
        const i = Math.random() * isl.length | 0, [dr, dc] = [[0, 1], [0, -1], [1, 0], [-1, 0]][Math.random() * 4 | 0], L = 2 + (Math.random() * 3 | 0);
        const r = isl[i].r + dr * L, c = isl[i].c + dc * L;
        if (r < 0 || c < 0 || r >= N || c >= N || occ.has(r + ',' + c)) continue;
        let clear = true; for (let k = 1; k < L; k++) if (occ.has((isl[i].r + dr * k) + ',' + (isl[i].c + dc * k))) clear = false;
        if (!clear) continue;
        // keep islands from touching side by side
        if ([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([a, b]) => occ.get((r + a) + ',' + (c + b)) === 'I')) continue;
        for (let k = 1; k < L; k++) occ.set((isl[i].r + dr * k) + ',' + (isl[i].c + dc * k), dr ? 'v' : 'h');
        occ.set(r + ',' + c, 'I'); isl.push({ r, c }); need.push(0);
        const n = Math.random() < .4 ? 2 : 1; need[i] += n; need[isl.length - 1] += n;
      }
      if (isl.length >= Math.min(want, 5)) break;
    }
    links = new Map(); drag = null; time = 40 + isl.length * 6;
  }
  const count = i => { let s = 0; for (const [k, n] of links) { const [a, b] = k.split('-').map(Number); if (a === i || b === i) s += n; } return s; };
  function connected() {
    const seen = new Set([0]), q = [0];
    while (q.length) { const i = q.pop(); for (const [k, n] of links) if (n) { const [a, b] = k.split('-').map(Number); const o = a === i ? b : b === i ? a : -1; if (o >= 0 && !seen.has(o)) { seen.add(o); q.push(o); } } }
    return seen.size === isl.length;
  }

  return {
    reset() { score = 0; solved = 0; t = 0; banner = null; ended = false; feel.clear(); newPuzzle(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newPuzzle(); } return; }
      time -= dt;
      if (time <= 0 && !ended) { ended = true; feel.lose(); banner = { txt: 'TIME UP', l: 1.2, over: true }; }
    },
    draw(c) {
      c.fillStyle = K[8]; c.fillRect(0, 0, W, H);
      const cs = CS(), gx = GX(), gy = GY(), P = i => [gx + isl[i].c * cs + Math.floor(cs / 2), gy + isl[i].r * cs + Math.floor(cs / 2)];
      c.fillStyle = K[7]; for (let i = 0; i < 30; i++) c.fillRect((i * 47) % W, (i * 31) % H, 3, 1);
      feel.begin(c);
      for (const [k, n] of links) {
        if (!n) continue; const [a, b] = k.split('-').map(Number), [x1, y1] = P(a), [x2, y2] = P(b);
        c.fillStyle = K[11];
        if (y1 === y2) { const xa = Math.min(x1, x2), w = Math.abs(x2 - x1); if (n === 1) c.fillRect(xa, y1 - 1, w, 3); else { c.fillRect(xa, y1 - 3, w, 2); c.fillRect(xa, y1 + 2, w, 2); } }
        else { const ya = Math.min(y1, y2), h = Math.abs(y2 - y1); if (n === 1) c.fillRect(x1 - 1, ya, 3, h); else { c.fillRect(x1 - 3, ya, 2, h); c.fillRect(x1 + 2, ya, 2, h); } }
      }
      if (drag && drag.to != null) { const [x1, y1] = P(drag.from), [x2, y2] = P(drag.to); c.fillStyle = K[4]; c.fillRect(Math.min(x1, x2) - 1, Math.min(y1, y2) - 1, Math.abs(x2 - x1) + 3, Math.abs(y2 - y1) + 3); }
      const r = Math.max(6, Math.floor(cs * .38));
      isl.forEach((p, i) => {
        const [x, y] = P(i), have = count(i), col = have === need[i] ? K[5] : have > need[i] ? K[2] : K[4];
        c.fillStyle = K[6]; c.fillRect(x - r, y - r + 2, r * 2, r * 2 - 4); c.fillRect(x - r + 2, y - r, r * 2 - 4, r * 2);
        c.fillStyle = col; c.fillRect(x - r + 2, y - r + 2, r * 2 - 4, r * 2 - 4);
        text(c, String(need[i]), x, y - 3, { align: 'center', color: K[0] });
      });
      feel.end(c, W, H);
      c.fillStyle = K[0]; c.fillRect(4, 4, 40, 5); c.fillStyle = time < 10 ? K[2] : K[5]; c.fillRect(4, 4, Math.round(40 * Math.max(0, time / (40 + isl.length * 6))), 5);
      text(c, `${score}`, W - 4, 3, { align: 'right', color: K[1] });
      if (banner) { c.fillStyle = K[0]; c.fillRect(0, H / 2 - 10, W, 20); text(c, banner.txt, W / 2, H / 2 - 5, { font: 'big', align: 'center', color: K[4] }); }
      else if (solved === 0 && t < 6) text(c, 'DRAG ISLAND TO ISLAND', W / 2, H - 9, { align: 'center', color: K[1] });
    },
    down(x, y) { if (banner) return; const i = hitIsland(x, y); if (i >= 0) drag = { from: i, to: null }; },
    move(x, y, pr) { if (!drag || !pr) return; const j = target(drag.from, x, y); drag.to = j; },
    up(x, y) {
      if (!drag) return; const j = drag.to ?? target(drag.from, x, y), a = drag.from; drag = null;
      if (j == null || j === a) return;
      const k = key(a, j), n = ((links.get(k) || 0) + 1) % 3;
      if (n > 0) { const u = used(k); if (cellsBetween(a, j).some(([r, c]) => u.has(r + ',' + c))) { sfx(150, .1, 'square', .03); haptic('warning'); return; } }
      links.set(k, n); sfx(n ? 500 + n * 200 : 300, .05, 'triangle', .03); haptic('light');
      if (isl.every((p, i) => count(i) === need[i]) && connected()) {
        solved++; const pts = 2 + Math.floor(isl.length / 3) + (time > 20 ? 1 : 0); score += pts; api.score(score);
        notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, H / 2); haptic('success'); banner = { txt: `LINKED +${pts}`, l: 1.1 };
      }
    },
  };

  function hitIsland(x, y) { const cs = CS(), c0 = Math.floor((x - GX()) / cs), r0 = Math.floor((y - GY()) / cs); return at(r0, c0); }
  // the nearest island in a straight line from "from", in the direction the finger has gone, with nothing in between
  function target(from, x, y) {
    const cs = CS(), A = isl[from], ax = GX() + (A.c + .5) * cs, ay = GY() + (A.r + .5) * cs, dx = x - ax, dy = y - ay;
    if (Math.hypot(dx, dy) < cs * .6) return null;
    const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, Math.sign(dx)] : [Math.sign(dy), 0];
    for (let k = 1; k < N; k++) { const j = at(A.r + dr * k, A.c + dc * k); if (j >= 0) return j; }
    return null;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'island-bridges',
  title: 'Island Bridges',
  tag: 'Color · Logic',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 192, maxW: 220, maxH: 260,
  goal: 20,
  hint: 'Drag between islands in straight lines to build bridges (again for double, again to remove). Match every number, link them all, and never cross bridges.',
  make,
};
