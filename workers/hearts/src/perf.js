// Anonymous performance and crash reports from real phones.
//
//   POST /perf  body { device, info: { platform, model, os, app, form },
//                      games: { "<id>": { r, f, ms, w, sl, h, x } },          per game, since the last batch
//                      errors: [ { kind, game, msg, place, n } ] }            at most 10
//   GET  /perf  -> { days, games: [...], errors: [...] }                       last 14 days, cached 5 min
//   GET  /perf/report -> the same as a web page, worst first
//
// Game fields: r rounds, f frames, ms frame time, w work time, sl slow frames (>= 25 ms),
// h hitches (>= 70 ms), x the longest frame. Like play stats, nothing is stored per person:
// the device id is only a rate-limit key, and rows are added up per day, game, phone model and app build.

export const PERF_DAYS = 14;
const MAX_GAMES = 40, MAX_ERRORS = 10;
const CAP = { r: 50, f: 200_000, ms: 3_600_000, w: 3_600_000, sl: 200_000, h: 50_000, x: 60_000 };
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PLATFORMS = new Set(['ios', 'android', 'web']);
const FORMS = new Set(['phone', 'wide']);

const day = (t = Date.now()) => Math.floor(t / 86400000);
const n = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
/** Short printable text only (no control characters), trimmed to max. */
const txt = (v, max) => typeof v === 'string' ? v.replace(/[^\x20-\x7e -ɏ]/g, '').trim().slice(0, max) : '';

/** Clean a client batch. Returns { info, games: [[...]], errors: [[...]] } or null if it's malformed. */
export function cleanPerf(b, known) {
  if (!b || typeof b !== 'object') return null;
  const i = b.info || {};
  const info = {
    platform: PLATFORMS.has(i.platform) ? i.platform : 'web',
    model: txt(i.model, 40) || 'unknown',
    os: txt(i.os, 40),
    app: txt(i.app, 40) || 'unknown',
    form: FORMS.has(i.form) ? i.form : 'phone',
  };
  const g = b.games ?? {}, e = b.errors ?? [];
  if (typeof g !== 'object' || Array.isArray(g) || !Array.isArray(e)) return null;
  const games = [];
  for (const [id, c] of Object.entries(g)) {
    if (games.length >= MAX_GAMES) break;
    if (!GAME_RE.test(id) || (known && !known.has(id)) || !c || typeof c !== 'object') continue;
    const f = n(c.f, CAP.f), ms = n(c.ms, CAP.ms);
    if (!f || !ms) continue;
    // Keep the numbers consistent with each other: no more slow frames than frames, and so on.
    const sl = Math.min(n(c.sl, CAP.sl), f), h = Math.min(n(c.h, CAP.h), sl);
    games.push([id, n(c.r, CAP.r), f, ms, Math.min(n(c.w, CAP.w), ms), sl, h, Math.min(n(c.x, CAP.x), ms)]);
  }
  const errors = [];
  for (const x of e.slice(0, MAX_ERRORS)) {
    if (!x || typeof x !== 'object') continue;
    const kind = x.kind === 'crash' ? 'crash' : 'error';
    const game = typeof x.game === 'string' && GAME_RE.test(x.game) && (!known || known.has(x.game)) ? x.game : '';
    const msg = txt(x.msg, 160);
    if (!msg) continue;
    errors.push([kind, game, msg, txt(x.place, 80), Math.max(1, n(x.n, 50))]);
  }
  return { info, games, errors };
}

export async function savePerf(db, { info, games, errors }, t = Date.now()) {
  const d = day(t), { platform, model, os, app, form } = info;
  const q = [
    ...games.map(([g, r, f, ms, w, sl, h, x]) => db.prepare(
      'INSERT INTO perf (day, game, platform, model, form, app, rounds, frames, ms, work_ms, slow, hitches, worst_ms) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) ON CONFLICT(day, game, platform, model, form, app) DO UPDATE SET ' +
      'rounds = rounds + ?7, frames = frames + ?8, ms = ms + ?9, work_ms = work_ms + ?10, slow = slow + ?11, hitches = hitches + ?12, worst_ms = MAX(worst_ms, ?13)'
    ).bind(d, g, platform, model, form, app, r, f, ms, w, sl, h, x)),
    ...errors.map(([kind, g, msg, place, cnt]) => db.prepare(
      'INSERT INTO crashes (day, kind, game, msg, place, platform, model, os, app, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) ' +
      'ON CONFLICT(day, kind, game, msg, place, platform, model, os, app) DO UPDATE SET n = n + ?10'
    ).bind(d, kind, g, msg, place, platform, model, os, app, cnt)),
  ];
  if (q.length) await db.batch(q);
}

/** Totals for the last PERF_DAYS days: smoothness per game and phone, and the most common errors. */
export async function perfTotals(db, t = Date.now()) {
  const since = day(t) - PERF_DAYS;
  const [g, e] = await db.batch([
    db.prepare(
      'SELECT game, platform, model, form, SUM(rounds) rounds, SUM(frames) frames, SUM(ms) ms, SUM(work_ms) work, ' +
      'SUM(slow) slow, SUM(hitches) hitches, MAX(worst_ms) worst FROM perf WHERE day > ?1 ' +
      'GROUP BY game, platform, model, form ORDER BY SUM(slow) * 1.0 / SUM(frames) DESC LIMIT 500').bind(since),
    db.prepare(
      'SELECT kind, game, msg, place, SUM(n) n, MAX(day) last, GROUP_CONCAT(DISTINCT model) models, GROUP_CONCAT(DISTINCT app) apps ' +
      'FROM crashes WHERE day > ?1 GROUP BY kind, game, msg, place ORDER BY SUM(n) DESC LIMIT 200').bind(since),
  ]);
  return {
    days: PERF_DAYS,
    games: g.results.map(r => ({ ...r, fps: r.ms ? Math.round(10 * 1000 * r.frames / r.ms) / 10 : 0 })),
    errors: e.results.map(r => ({ ...r, last: new Date(r.last * 86400000).toISOString().slice(0, 10) })),
  };
}

export const prunePerf = (db, t = Date.now()) => db.batch([
  db.prepare('DELETE FROM perf WHERE day <= ?1').bind(day(t) - PERF_DAYS - 1),
  db.prepare('DELETE FROM crashes WHERE day <= ?1').bind(day(t) - PERF_DAYS - 1),
]);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '–';

/** The totals as a plain web page (no scripts), for reading on a computer or phone. */
export function perfPage({ days, games, errors }, titles = new Map()) {
  const name = id => id ? esc(titles.get(id)?.title || id) : '<i>feed</i>';
  // Smoothness rows with enough frames to mean something, worst first.
  const rows = games.filter(r => r.frames >= 300);
  const crashes = errors.filter(r => r.kind === 'crash'), scripts = errors.filter(r => r.kind === 'error');
  const errTable = list => list.length ? `<table><tr><th>Game</th><th>Times</th><th>What</th><th>Where</th><th>Phones</th><th>Builds</th><th>Last</th></tr>
    ${list.map(r => `<tr><td>${name(r.game)}</td><td class=n>${r.n}</td><td><code>${esc(r.msg)}</code></td><td><code>${esc(r.place)}</code></td><td>${esc(r.models)}</td><td>${esc(r.apps)}</td><td>${esc(r.last)}</td></tr>`).join('')}</table>`
    : '<p class=ok>None reported.</p>';
  return `<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Game Scroll performance</title><meta name=robots content=noindex>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#16181d;--mute:#667;--line:#dde;--bad:#c62828;--warn:#a15c00;--good:#2e7d32}
@media (prefers-color-scheme:dark){:root{--bg:#0c0e12;--fg:#e8eaf0;--mute:#99a;--line:#2a2e38;--bad:#ff6b6b;--warn:#ffb74d;--good:#81c784}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:1100px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}p{margin:4px 0;color:var(--mute)}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mute);font-weight:600;white-space:nowrap}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}.ok{color:var(--good)}code{font-size:12px;word-break:break-word}
</style>
<h1>Game Scroll performance</h1>
<p>Anonymous reports from phones with play stats switched on, last ${days} days. Frames are timed only while a round is playing.
“Slow” frames took 25 ms or more (under 40 fps); “freezes” took 70 ms or more and are what players feel as a stutter. “Wide” is a tablet-sized screen such as an unfolded Fold.</p>
<h2>Crashes (${crashes.reduce((a, r) => a + r.n, 0)})</h2>
<p>The app closed or reloaded while it was open on screen. On a phone this is usually the system killing it for using too much memory.</p>
<div class=wrap>${errTable(crashes)}</div>
<h2>Script errors (${scripts.reduce((a, r) => a + r.n, 0)})</h2>
<p>A game threw an error. The app ends that round and carries on.</p>
<div class=wrap>${errTable(scripts)}</div>
<h2>Smoothness by game and phone</h2>
<p>Worst first. Rows with fewer than 300 frames are left out.</p>
<div class=wrap>${rows.length ? `<table><tr><th>Game</th><th>Phone</th><th>Screen</th><th class=n>Rounds</th><th class=n>Avg fps</th><th class=n>Slow</th><th class=n>Freezes</th><th class=n>Freezes/min</th><th class=n>Longest</th><th class=n>Busy</th></tr>
${rows.map(r => {
    const slow = r.slow / r.frames, perMin = r.hitches / (r.ms / 60000);
    const cls = slow > 0.1 || perMin > 6 ? 'bad' : slow > 0.03 || perMin > 2 ? 'warn' : 'ok';
    return `<tr><td>${name(r.game)}</td><td>${esc(r.model)} <small>${esc(r.platform)}</small></td><td>${esc(r.form)}</td><td class=n>${r.rounds}</td>
<td class="n ${cls}">${r.fps}</td><td class="n ${cls}">${pct(r.slow, r.frames)}</td><td class=n>${r.hitches}</td><td class=n>${perMin.toFixed(1)}</td><td class=n>${r.worst} ms</td><td class=n>${pct(r.work, r.ms)}</td></tr>`;
  }).join('')}</table>` : '<p>No reports yet.</p>'}</div>
<p style="margin-top:20px">“Busy” is how much of each frame the app spent running the game’s code and drawing. High busy with low fps means the game’s code or drawing is too heavy; low busy with low fps points at the GPU or the phone itself (heat, battery saver).</p>
</html>`;
}
