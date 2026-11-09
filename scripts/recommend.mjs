// Checks the For you ranking (src/recommend.js) with made-up players and stats.
// Run: npm run recommend
import { createServer } from 'vite';
import assert from 'node:assert/strict';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const vite = await createServer({ mode: 'bundled', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const R = await vite.ssrLoadModule('/src/recommend.js');
const { FeedBrain, timeOfDay } = await vite.ssrLoadModule('/src/feedbrain.js');
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
// A player who scrolls the feed: likes(g, hour) is how likely they are to play it. The brain
// learns from each view, the way feedsignals.js wires it.
function scroll(brain, likes, { views = 600, hours = [9, 20], rand = mulberry(7) } = {}) {
  const seen = {}; let t = NOW, session = [];
  for (let n = 0; n < views;) {
    const hour = hours[Math.floor(n / 12) % hours.length];
    const at = new Date(NOW); at.setHours(hour, 0, 0, 0); t = at.getTime() + n * 1000;
    const S = { ...signals({ seen, session }), now: () => t, brain };
    const q = R.rankQueue(games, games, S, rand);
    for (const g of q.slice(0, 4)) {
      const played = rand() < likes(g, hour, seen[g.id]);
      const h = seen[g.id] ||= { t: 0, v: 0, k: 0, p: 0 }; h.t = t; h.v++; if (played) h.p++; else h.k++;
      const w = played ? 1 : -1; session.push({ id: g.id, w }); if (session.length > 12) session.shift();
      brain.outcome(g.id, w); n++;
    }
    if (n % 12 === 0) session = [];
  }
  return brain;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function atHour(S, hour) { const d = new Date(NOW); d.setHours(hour, 0, 0, 0); return { ...S, now: () => d.getTime() }; }
// Average position of a set of games over many shuffles (0 = top of the feed).
function avgPos(S, pick, runs = 400, rand = Math.random) {
  let sum = 0, n = 0;
  for (let r = 0; r < runs; r++) { const q = R.rankQueue(games, games, S, rand); q.forEach((g, i) => { if (pick(g)) { sum += i; n++; } }); }
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

  // ---------------------------------------------------------------- the feed brain
  {
    const empty = new FeedBrain();
    const S = { ...signals(), brain: empty };
    for (const g of games) assert.equal(R.explain(g, games, S).brain, 1, 'a new brain is neutral');
    for (const gname of GENRES) assert.ok(Math.abs(avgPos(S, g => g.id.startsWith(gname)) - mid) < 4, gname + ' still near the middle');
    ok('feed brain: starts neutral, so a new player gets the plain ranking');
  }
  {
    // puzzles in the evening, racing in the morning, the rest now and then
    const likes = (g, hour) => g.id.startsWith('puzzle') ? (hour >= 18 ? .85 : .1) : g.id.startsWith('racing') ? (hour < 12 ? .85 : .1) : .25;
    const b = scroll(new FeedBrain(), likes, { views: 900 });
    assert.ok(b.sure === 1, 'it has seen enough to have its full say');
    const eve = atHour({ ...signals(), brain: b }, 20), morn = atHour({ ...signals(), brain: b }, 9);
    // seeded, so the check can't pass or fail by luck
    const puzE = avgPos(eve, g => g.id.startsWith('puzzle'), 400, mulberry(11)), racE = avgPos(eve, g => g.id.startsWith('racing'), 400, mulberry(12));
    const puzM = avgPos(morn, g => g.id.startsWith('puzzle'), 400, mulberry(13)), racM = avgPos(morn, g => g.id.startsWith('racing'), 400, mulberry(14));
    assert.ok(puzE < racE - 5 && racM < puzM - 5, `evening puzzles ${puzE.toFixed(1)} vs racing ${racE.toFixed(1)}; morning racing ${racM.toFixed(1)} vs puzzles ${puzM.toFixed(1)}`);
    ok(`feed brain: learns the time of day (evenings: puzzles at ${puzE.toFixed(0)} vs racing ${racE.toFixed(0)}; mornings: racing at ${racM.toFixed(0)} vs puzzles ${puzM.toFixed(0)})`);

    // guard rails: never more than 2x or less than 0.5x, nothing ever left out
    for (const g of games) { const x = R.explain(g, games, eve).brain; assert.ok(x >= .5 - 1e-9 && x <= 2 + 1e-9, 'boost in range: ' + x); }
    for (let r = 0; r < 50; r++) assert.equal(new Set(R.rankQueue(games, games, eve).map(g => g.id)).size, games.length);
    ok('feed brain: stays between 0.5x and 2x, and every game still comes round');

    // old habits fade: a long spell of liking only sports pulls the evening puzzle lean back
    const lean = () => R.explain(games.find(g => g.id === 'puzzle-3'), games, eve).brain;
    const before = lean();
    scroll(b, g => g.id.startsWith('sports') ? .8 : .1, { views: 900, hours: [20] });
    assert.ok(lean() < before, `puzzles fade from ${before.toFixed(2)} to ${lean().toFixed(2)}`);
    ok('feed brain: habits that stop fade back');

    // saved and loaded on the phone; anything broken is ignored
    const copy = new FeedBrain(JSON.parse(JSON.stringify(b.pack())));
    assert.ok(Math.abs(R.explain(games[0], games, { ...eve, brain: copy }).brain - R.explain(games[0], games, eve).brain) < 1e-3, 'pack and unpack');
    assert.equal(new FeedBrain({ v: 1, w: [1, 2], d: [0] }).n, 0, 'bad save ignored');
    const odd = b.pack(); odd.w[0] = 1e9; odd.d[1] = NaN; const o = new FeedBrain(odd);
    assert.ok(o.w[0] <= 1.5 && o.d[1] === 0, 'values clamped');
    assert.equal(b.reset().n, 0); assert.equal(R.explain(games[0], games, eve).brain, 1, 'reset is neutral again');
    ok('feed brain: saves, loads, rejects bad data and resets');
  }
  {
    // a player who only wants games they haven't seen learns to lean on freshness
    const b = scroll(new FeedBrain(), (g, h, seen) => (!seen || !seen.v ? .9 : .1), { views: 600 });
    const st = b.stats();
    assert.ok(st.fresh > .2 && st.fresh > st.everyone, 'leans on freshness: ' + JSON.stringify(st));
    ok(`feed brain: a novelty seeker leans on freshness (${st.fresh})`);
  }
  assert.equal(timeOfDay(23), 'evening'); assert.equal(timeOfDay(0), 'night'); assert.equal(timeOfDay(-1), 'evening');

  console.log('recommend: all checks passed');
} finally { await vite.close(); }
