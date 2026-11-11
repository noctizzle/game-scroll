// The chess computer opponent behind gs.tabletop.Chess: an alpha-beta search over chess.js positions
// with a simple reading of the board (material and where the pieces stand). It runs in a worker
// (chess-worker.js) so a 3D game keeps drawing while it thinks, or straight here where there is none.
//
// chess.js's public moves() writes every move out in chess notation, which makes it about 25 times
// slower than the search needs, so the search uses its inner move list (_moves, _makeMove,
// _undoMove). The package version is pinned and scripts/kit-test.mjs checks these are still there.

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Where each piece likes to stand, from white's side, rank 8 first (the usual simple tables).
const PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const MATE = 100000;
const FILES = 'abcdefgh';
/** A chess.js inner square number as 'e4'. */
export const squareName = i => FILES[i & 7] + (8 - (i >> 4));

// How strong each level plays: how far it looks, how long it may think (ms), and how far below its
// best move it will sometimes settle (centipawns), so the lower levels make human-looking slips.
export const LEVELS = [
  { name: 'Novice', depth: 1, time: 120, slack: 220, wild: .3 },
  { name: 'Casual', depth: 2, time: 250, slack: 90, wild: .08 },
  { name: 'Club', depth: 3, time: 500, slack: 35, wild: 0 },
  { name: 'Sharp', depth: 4, time: 1000, slack: 12, wild: 0 },
  { name: 'Master', depth: 5, time: 1800, slack: 0, wild: 0 },
];

/** The position's worth to white in hundredths of a pawn. */
export function evaluate(g) {
  const b = g._board; let v = 0;
  for (let i = 0; i < 120; i++) {
    if (i & 0x88) { i += 7; continue; }
    const p = b[i]; if (!p) continue;
    const sq = (i >> 4) * 8 + (i & 7);
    v += p.color === 'w' ? VAL[p.type] + PST[p.type][sq] : -(VAL[p.type] + PST[p.type][63 - sq]);
  }
  return v;
}

/**
 * The move to play for the side to move: { from, to, promotion, score, depth, nodes }, or null when
 * there is none. g is a chess.js game (left as it was). level 1..5 (LEVELS), time overrides the
 * level's thinking time in milliseconds, rng a random function.
 */
export function bestMove(g, { level = 2, time = null, rng = Math.random, now = () => performance.now() } = {}) {
  const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.round(level) - 1))];
  const deadline = now() + (time ?? L.time);
  let nodes = 0, out = false;
  const order = ms => ms.sort((a, b) => (b.captured ? VAL[b.captured] * 10 - VAL[b.piece] : b.promotion ? 800 : 0) - (a.captured ? VAL[a.captured] * 10 - VAL[a.piece] : a.promotion ? 800 : 0));
  const side = () => (g._turn === 'w' ? 1 : -1);
  // only captures past the last full move, so it doesn't stop looking halfway through a swap
  const quiet = (alpha, beta, ply, left) => {
    const stand = evaluate(g) * side();
    if (stand >= beta || left <= 0) return stand;
    if (stand > alpha) alpha = stand;
    const ms = order(g._moves({ legal: true }).filter(m => m.captured));
    for (const m of ms) {
      g._makeMove(m); const v = -quiet(-beta, -alpha, ply + 1, left - 1); g._undoMove();
      if (v > alpha) { alpha = v; if (alpha >= beta) break; }
    }
    return alpha;
  };
  const search = (depth, alpha, beta, ply) => {
    if ((++nodes & 511) === 0 && now() > deadline) out = true;
    if (out) return 0;
    const ms = g._moves({ legal: true });
    if (!ms.length) return g._isKingAttacked(g._turn) ? -MATE + ply : 0;
    if (depth <= 0) return quiet(alpha, beta, ply, 3);
    order(ms);
    for (const m of ms) {
      g._makeMove(m); const v = -search(depth - 1, -beta, -alpha, ply + 1); g._undoMove();
      if (out) return 0;
      if (v > alpha) { alpha = v; if (alpha >= beta) break; }
    }
    return alpha;
  };
  let ranked = order(g._moves({ legal: true })).map(m => ({ m, v: 0 }));
  if (!ranked.length) return null;
  let reached = 0;
  for (let d = 1; d <= L.depth && ranked.length > 1; d++) {
    const next = []; let alpha = -Infinity;
    for (const x of ranked) {
      g._makeMove(x.m); const v = -search(d - 1, -Infinity, -alpha + L.slack + 1, 1); g._undoMove();   // (a wide window: the slips below need true values near the best)
      if (out) break;
      next.push({ m: x.m, v }); if (v > alpha) alpha = v;
    }
    if (out && d > 1) break;
    if (out) { for (const x of ranked.slice(next.length)) next.push(x); }
    ranked = next.sort((a, b) => b.v - a.v); reached = d;
    if (out || ranked[0].v > MATE - 50) break;
  }
  // the pick: the best, or (lower levels) another that's nearly as good, or now and then anything
  let pick = ranked[0];
  if (pick.v < MATE - 50) {
    if (L.wild && rng() < L.wild) pick = ranked[Math.floor(rng() * ranked.length)];
    else if (L.slack) { const near = ranked.filter(x => x.v >= ranked[0].v - L.slack); pick = near[Math.floor(rng() * near.length)]; }
  }
  return { from: squareName(pick.m.from), to: squareName(pick.m.to), promotion: pick.m.promotion || undefined, score: pick.v, depth: reached, nodes };
}
