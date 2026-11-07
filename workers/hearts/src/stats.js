// Anonymous play stats: daily totals per game (views, plays, quick skips, seconds played).
//
//   POST /stats  body { device, games: { "<id>": { v, p, k, s }, ... } }   -> { ok: true }
//   GET  /stats  -> { days, games: { "<id>": { v, p, k, s, wv, wp } } }      last 30 days, cached 10 min
//                   wv, wp: views and plays in the last 7 days only (the feed uses them for "trending")
//
// Nothing is stored per person: the device id is used only as a rate-limit key. Each batch is
// capped (at most 60 games, small per-game numbers) so one phone can't swing the totals much.

export const STATS_DAYS = 30, RECENT_DAYS = 7;
const MAX_GAMES = 60;
const CAP = { v: 30, p: 60, k: 30, s: 3600 };
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const day = (t = Date.now()) => Math.floor(t / 86400000);
const n = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));

/** Clean a client batch: [[game, v, p, k, s], ...] with only known games and capped numbers. */
export function cleanBatch(games, known) {
  if (!games || typeof games !== 'object' || Array.isArray(games)) return null;
  const rows = [];
  for (const [id, c] of Object.entries(games)) {
    if (rows.length >= MAX_GAMES) break;
    if (!GAME_RE.test(id) || (known && !known.has(id)) || !c || typeof c !== 'object') continue;
    const r = [id, n(c.v, CAP.v), n(c.p, CAP.p), n(c.k, CAP.k), n(c.s, CAP.s)];
    if (r[3] > r[1]) r[3] = r[1];   // can't skip more often than it was shown
    if (r[1] || r[2] || r[4]) rows.push(r);
  }
  return rows;
}

export async function saveBatch(db, rows, t = Date.now()) {
  if (!rows.length) return;
  const d = day(t);
  await db.batch(rows.map(([g, v, p, k, s]) => db.prepare(
    'INSERT INTO play_stats (game, day, views, plays, skips, secs) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
    'ON CONFLICT(game, day) DO UPDATE SET views = views + ?3, plays = plays + ?4, skips = skips + ?5, secs = secs + ?6'
  ).bind(g, d, v, p, k, s)));
}

export async function totals(db, t = Date.now()) {
  const { results } = await db.prepare(
    'SELECT game, SUM(views) v, SUM(plays) p, SUM(skips) k, SUM(secs) s, ' +
    'SUM(CASE WHEN day > ?2 THEN views ELSE 0 END) wv, SUM(CASE WHEN day > ?2 THEN plays ELSE 0 END) wp ' +
    'FROM play_stats WHERE day > ?1 GROUP BY game'
  ).bind(day(t) - STATS_DAYS, day(t) - RECENT_DAYS).all();
  const games = {};
  for (const r of results) games[r.game] = { v: r.v, p: r.p, k: r.k, s: r.s, wv: r.wv, wp: r.wp };
  return { days: STATS_DAYS, games };
}

/** Old rows aren't needed: drop anything older than the window (run now and then). */
export const prune = (db, t = Date.now()) => db.prepare('DELETE FROM play_stats WHERE day <= ?1').bind(day(t) - STATS_DAYS - 1).run();
