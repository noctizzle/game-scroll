// Checks the For you ranking (src/recommend.js) with made-up players and stats.
// Run: npm run recommend
import { createServer } from 'vite';
import assert from 'node:assert/strict';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const vite = await createServer({ mode: 'bundled', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/recommend.js');
const ok = m => console.log('  ✓ ' + m);

// A catalogue of 60 games: 6 genres x 10, half pocket, half casual.
const GENRES = ['puzzle', 'racing', 'shooter', 'platform', 'rhythm', 'sports'];
const games = [];
for (const [gi, gname] of GENRES.entries()) for (let i = 0; i < 10; i++)
  games.push({ id: `${gname}-${i}`, title: `${gname} ${i}`, tag: `${i % 2 ? 'Pocket' : 'Casual'} · ${gname}`, retro: !!(i % 2), hint: gi % 2 ? 'Tap to jump' : 'Drag to aim' });

const NOW = 1_800_000_000_000;
function signals({ ratings = {}, mine = {}, seen = {}, session = [], global = {}, hearts = {} } = {}) {
  return {
    rating: id => ratings[id] || 0, mine: id => mine[id] || { secs: 0 }, seen: id => seen[id] || null,
    session: () => session, global: id => global[id] || null, hearts: id => hearts[id] || 0, now: () => NOW,
  };
}
// Average position of a set of games over many shuffles (0 = top of the feed).
function avgPos(S, pick, runs = 400) {
  let sum = 0, n = 0;
  for (let r = 0; r < runs; r++) { const q = R.rankQueue(games, games, S); q.forEach((g, i) => { if (pick(g)) { sum += i; n++; } }); }
  return sum / n;
}
const mid = (games.length - 1) / 2;

try {
  // Nothing known: everything is roughly even, and every game appears exactly once.
  const S0 = signals();
  const q0 = R.rankQueue(games, games, S0);
  assert.equal(new Set(q0.map(g => g.id)).size, games.length);
  for (const gname of GENRES) assert.ok(Math.abs(avgPos(S0, g => g.id.startsWith(gname)) - mid) < 4, gname + ' is near the middle with no data');
  ok('with no data every game comes once and no genre is favoured');

  // Hearting racing games brings racing forward.
  const S1 = signals({ ratings: { 'racing-0': 1, 'racing-1': 1 } });
  assert.ok(avgPos(S1, g => g.id.startsWith('racing') && !/racing-[01]$/.test(g.id)) < mid - 8);
  ok('hearts bring similar games sooner');

  // Skipping shooters this session pushes shooters back; playing rhythm brings rhythm forward.
  const S2 = signals({ session: [{ id: 'shooter-1', w: -1 }, { id: 'shooter-2', w: -1 }, { id: 'shooter-3', w: -1 }, { id: 'rhythm-1', w: 1.2 }] });
  assert.ok(avgPos(S2, g => g.id.startsWith('shooter')) > mid + 6, 'skipped genre goes back');
  assert.ok(avgPos(S2, g => g.id.startsWith('rhythm')) < mid - 6, 'played genre comes forward');
  ok('this session\'s skips and plays steer the next games');

  // A game you saw a minute ago waits; one you keep skipping fades; never-seen games get a turn.
  const seen = {}; for (const g of games.slice(0, 30)) seen[g.id] = { t: NOW - 3 * 864e5, v: 1, k: 0, p: 1 };
  seen['puzzle-0'] = { t: NOW - 60_000, v: 1, k: 0, p: 1 };
  seen['puzzle-2'] = { t: NOW - 5 * 864e5, v: 6, k: 6, p: 0 };
  const S3 = signals({ seen });
  assert.ok(avgPos(S3, g => g.id === 'puzzle-0') > mid + 10, 'just seen waits');
  assert.ok(avgPos(S3, g => g.id === 'puzzle-2') > mid + 8, 'always skipped fades');
  assert.ok(avgPos(S3, g => !seen[g.id]) < avgPos(S3, g => !!seen[g.id] && g.id !== 'puzzle-0' && g.id !== 'puzzle-2') - 4, 'unseen first');
  ok('freshness: just-seen games wait, always-skipped fade, new-to-you come sooner');

  // Everyone's stats: a well-loved game rises, a game everyone skips sinks, 5 views barely move anything.
  const global = {}; for (const g of games) global[g.id] = { v: 200, p: 120, k: 70, s: 5000, wv: 47, wp: 28 };
  global['sports-3'] = { v: 400, p: 380, k: 20, s: 30000, wv: 90, wp: 85 };
  global['sports-4'] = { v: 400, p: 60, k: 330, s: 800, wv: 90, wp: 14 };
  global['sports-5'] = { v: 5, p: 0, k: 5, s: 0 };
  const S4 = signals({ global, hearts: { 'sports-3': 60 } });
  const B = R.baseline(games, S4);
  assert.ok(R.popularity('sports-3', B, S4) > 1.4, 'loved');
  assert.ok(R.popularity('sports-4', B, S4) < .7, 'skipped by all');
  assert.ok(Math.abs(R.popularity('sports-5', B, S4) - 1) < .25, 'few views stay near neutral');
  assert.ok(R.discovery('sports-5', S4) > 1.3 && R.discovery('sports-3', S4) === 1, 'new games get discovery lift');
  const trend = { ...global, 'sports-6': { v: 200, p: 120, k: 70, s: 5000, wv: 150, wp: 90 } };
  assert.ok(R.popularity('sports-6', B, signals({ global: trend })) > R.popularity('sports-7', B, signals({ global: trend })) + .05, 'trending this week gets a lift');
  ok('everyone\'s stats and hearts: smoothed, with trending and a discovery lift');

  // Genres are spread out: back-to-back repeats are rare even when one genre dominates taste.
  const S5 = signals({ ratings: Object.fromEntries(games.filter(g => g.id.startsWith('puzzle')).slice(0, 5).map(g => [g.id, 1])) });
  let repeats = 0; const runs = 100;
  for (let r = 0; r < runs; r++) { const q = R.rankQueue(games, games, S5); for (let i = 1; i < 15; i++) if (q[i].id.split('-')[0] === q[i - 1].id.split('-')[0]) repeats++; }
  assert.ok(repeats / runs < 1, `few back-to-back genre repeats (${(repeats / runs).toFixed(2)} per 15 games)`);
  ok('the same genre rarely shows twice in a row');

  // Meh still sinks the whole genre a lot.
  const S6 = signals({ ratings: { 'platform-0': -1, 'platform-1': -1 } });
  assert.ok(avgPos(S6, g => g.id.startsWith('platform') && !/platform-[01]$/.test(g.id)) > mid + 8);
  ok('Meh pushes similar games back');

  console.log('recommend: all checks passed');
} finally { await vite.close(); }
