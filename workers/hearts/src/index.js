// Game Scroll hearts API (Cloudflare Worker + D1).
//
//   GET  /counts          -> { counts: { "<game id>": n, ... }, at }   cached ~60 s at the edge
//   POST /heart           body { device, game, on }  -> { game, n }    n is the fresh count
//
// No accounts: each install sends a random anonymous device id, and (game, device) is unique,
// so a phone counts once per game and un-hearting takes it back. Writes are rate-limited per
// address, and only games in the live catalogue are accepted.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const COUNTS_TTL = 60;
const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

/** Game ids in the live catalogue, fetched at most every 5 minutes per Worker location. */
let known = null, knownAt = 0;
async function gameIds(env) {
  if (known && Date.now() - knownAt < 300_000) return known;
  try {
    const r = await fetch(env.MANIFEST_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) { const m = await r.json(); known = new Set((m.games || []).map(g => g.id)); knownAt = Date.now(); }
  } catch (_) { /* keep the last list */ }
  return known;
}

async function counts(env, ctx, req) {
  const cache = caches.default, key = new Request(new URL('/counts', req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const { results } = await env.DB.prepare('SELECT game, n FROM counts WHERE n > 0').all();
  const out = {};
  for (const r of results) out[r.game] = r.n;
  const res = json({ counts: out, at: Date.now() }, 200, { 'Cache-Control': `public, max-age=${COUNTS_TTL}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function heart(env, ctx, req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (env.LIMIT) { const { success } = await env.LIMIT.limit({ key: ip }); if (!success) return json({ error: 'slow down' }, 429); }
  let b;
  try { b = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400); }
  const { device, game } = b || {}, on = b && b.on === true;
  if (typeof device !== 'string' || !DEVICE_RE.test(device)) return json({ error: 'bad device' }, 400);
  if (typeof game !== 'string' || !GAME_RE.test(game)) return json({ error: 'bad game' }, 400);
  const ids = await gameIds(env);
  if (ids && !ids.has(game)) return json({ error: 'unknown game' }, 404);

  const change = on
    ? env.DB.prepare('INSERT OR IGNORE INTO hearts (game, device, at) VALUES (?1, ?2, ?3)').bind(game, device, Date.now())
    : env.DB.prepare('DELETE FROM hearts WHERE game = ?1 AND device = ?2').bind(game, device);
  // Recount from the hearts table (an index range on the primary key), so the total can't drift.
  const recount = env.DB.prepare(
    'INSERT INTO counts (game, n) SELECT ?1, COUNT(*) FROM hearts WHERE game = ?1 ' +
    'ON CONFLICT(game) DO UPDATE SET n = excluded.n RETURNING n').bind(game);
  const [, res] = await env.DB.batch([change, recount]);
  // Drop this location's cached list so nearby players see the change soon (others within a minute).
  ctx.waitUntil(caches.default.delete(new Request(new URL('/counts', req.url).toString())));
  return json({ game, n: res.results[0]?.n ?? 0 });
}

export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'GET' && pathname === '/counts') return await counts(env, ctx, req);
      if (req.method === 'POST' && pathname === '/heart') return await heart(env, ctx, req);
      if (req.method === 'GET' && pathname === '/') return json({ ok: true, service: 'game-scroll-hearts' });
      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'server error' }, 500);
    }
  },
};
