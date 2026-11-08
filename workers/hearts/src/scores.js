// Leaderboards for every game: each install's best score, all time and for today (UTC days).
//
//   POST /score  body { device, game, score, secs } (+ pass, like /heart) -> { all: { rank, of, best }, day: {...} }
//   GET  /board?game=<id>&device=<id>&when=all|day -> { top: [{ name, score, me }], me: { rank, score } | null, of }
//
// No accounts or typed names: each install gets a made-up, family-friendly name worked out from its
// device id (the same everywhere), so nobody can put words on a public board.
//
// Quick checks (checkScore, before a score is kept) turn away scores that can't be real: higher
// than the game allows, piled up faster than it allows, a round longer than the time since this
// device's last one, or far above everyone else on a busy board. A game can set its own limits
// with scoreMax and scoreRate (points a second) in its definition; otherwise they come from its
// goal, loosely. Turned-away scores are logged in score_flags, never shown.

const ADJ = ['Brave', 'Swift', 'Lucky', 'Clever', 'Mighty', 'Sunny', 'Jolly', 'Zippy', 'Cosmic', 'Turbo', 'Pixel', 'Bouncy', 'Quiet',
  'Daring', 'Fuzzy', 'Golden', 'Happy', 'Nimble', 'Rapid', 'Shiny', 'Steady', 'Super', 'Witty', 'Bold', 'Calm', 'Eager', 'Frosty', 'Gentle',
  'Hyper', 'Keen', 'Mellow', 'Neon', 'Plucky', 'Royal', 'Sly', 'Spry', 'Tiny', 'Vivid', 'Wild', 'Zesty'];
const NOUN = ['Otter', 'Falcon', 'Panda', 'Comet', 'Fox', 'Koala', 'Rocket', 'Tiger', 'Robin', 'Badger', 'Gecko', 'Llama', 'Moose', 'Narwhal',
  'Owl', 'Penguin', 'Quokka', 'Raven', 'Seal', 'Turtle', 'Walrus', 'Yak', 'Zebra', 'Bison', 'Crane', 'Dolphin', 'Eagle', 'Ferret', 'Hare',
  'Ibis', 'Jaguar', 'Kiwi', 'Lemur', 'Mole', 'Newt', 'Orca', 'Puffin', 'Squid', 'Toucan', 'Wombat'];

/** A made-up name for a device id: "Brave Otter 42". */
export function nameFor(device) {
  let h = 2166136261; for (const ch of String(device)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h >>>= 0;
  return `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]} ${(h >>> 16) % 100}`;
}
export const dayOf = (t = Date.now()) => Math.floor(t / 86400000);
const MAX_SCORE = 1e9;

/** A clean score, or null. */
export function cleanScore(s) { return Number.isFinite(s) && s > 0 && s <= MAX_SCORE ? Math.floor(s) : null; }

const MIN_SECS = 2, MAX_SECS = 3 * 3600, SLACK_MS = 15_000;
export const LIMITS = { maxPerGoal: 1000, ratePerGoal: 2, outlierBoard: 20, outlier: 5 };

/** A clean round length in seconds, or null. */
export function cleanSecs(s) { return Number.isFinite(s) && s >= 0 && s <= MAX_SECS ? s : null; }

/**
 * The quick checks that need no database: null if the score could be real, else why not.
 * meta: the game's catalogue entry (goal, scoreMax, scoreRate), or null when it isn't known.
 */
export function plausible(score, secs, meta, L = LIMITS) {
  if (secs < MIN_SECS) return 'round too short';
  const goal = Number(meta?.goal) > 0 ? Number(meta.goal) : null;
  const max = Number(meta?.scoreMax) > 0 ? Number(meta.scoreMax) : goal ? goal * L.maxPerGoal : null;
  if (max && score > max) return 'higher than the game allows';
  const rate = Number(meta?.scoreRate) > 0 ? Number(meta.scoreRate) : goal ? goal * L.ratePerGoal : null;
  if (rate && score > rate * Math.max(secs, 1) + (goal || 0)) return 'scored too fast';
  return null;
}

/** All the quick checks: null if it may go on the boards, else why not (and it's logged). */
export async function checkScore(db, game, device, score, secs, meta, now = Date.now(), L = LIMITS) {
  let why = plausible(score, secs, meta, L);
  if (!why) {
    const last = await db.prepare('SELECT at FROM score_last WHERE game = ?1 AND device = ?2').bind(game, device).first();
    if (last && now - last.at + SLACK_MS < secs * 1000) why = 'round longer than the time since the last one';
  }
  if (!why) {
    const top = await db.prepare("SELECT MAX(score) AS top, COUNT(*) AS n FROM scores WHERE game = ?1 AND board = 'all'").bind(game).first();
    if ((top?.n ?? 0) >= L.outlierBoard && score > top.top * L.outlier) why = 'far above everyone else';
  }
  if (why) await db.prepare('INSERT INTO score_flags (game, device, score, secs, why, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(game, device, score, secs, why, now).run();
  else await db.prepare('INSERT INTO score_last (game, device, at) VALUES (?1, ?2, ?3) ON CONFLICT(game, device) DO UPDATE SET at = excluded.at').bind(game, device, now).run();
  return why;
}

async function rankOf(db, game, board, score) {
  const r = await db.prepare('SELECT (SELECT COUNT(*) FROM scores WHERE game = ?1 AND board = ?2 AND score > ?3) AS above, (SELECT COUNT(*) FROM scores WHERE game = ?1 AND board = ?2) AS n')
    .bind(game, board, score).first();
  return { rank: (r?.above ?? 0) + 1, of: r?.n ?? 0 };
}

/** Saves a score on the all-time and today boards (keeping each device's best). */
export async function saveScore(db, game, device, score, now = Date.now()) {
  const day = 'd' + dayOf(now), up = board => db.prepare(
    'INSERT INTO scores (game, board, device, score, at) VALUES (?1, ?2, ?3, ?4, ?5) ' +
    'ON CONFLICT(game, board, device) DO UPDATE SET score = excluded.score, at = excluded.at WHERE excluded.score > scores.score')
    .bind(game, board, device, score, now);
  await db.batch([up('all'), up(day)]);
  const best = async board => (await db.prepare('SELECT score FROM scores WHERE game = ?1 AND board = ?2 AND device = ?3').bind(game, board, device).first())?.score ?? score;
  const [ba, bd] = await Promise.all([best('all'), best(day)]);
  const [all, today] = await Promise.all([rankOf(db, game, 'all', ba), rankOf(db, game, day, bd)]);
  return { all: { ...all, best: ba }, day: { ...today, best: bd } };
}

/** The top 10 (and where this device is). */
export async function board(db, game, when, device, now = Date.now()) {
  const b = when === 'day' ? 'd' + dayOf(now) : 'all';
  const { results } = await db.prepare('SELECT device, score FROM scores WHERE game = ?1 AND board = ?2 ORDER BY score DESC, at ASC LIMIT 10').bind(game, b).all();
  const top = results.map(r => ({ name: nameFor(r.device), score: r.score, me: r.device === device }));
  let me = null, of;
  const mine = device ? await db.prepare('SELECT score FROM scores WHERE game = ?1 AND board = ?2 AND device = ?3').bind(game, b, device).first() : null;
  if (mine) { const r = await rankOf(db, game, b, mine.score); me = { rank: r.rank, score: mine.score, name: nameFor(device) }; of = r.of; }
  else of = (await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ?1 AND board = ?2').bind(game, b).first())?.n ?? 0;
  return { when: when === 'day' ? 'day' : 'all', top, me, of };
}

/** Drops daily boards older than a week. */
export async function pruneScores(db, now = Date.now()) {
  const days = [];
  for (let d = dayOf(now) - 30; d < dayOf(now) - 7; d++) days.push('d' + d);
  await db.prepare(`DELETE FROM scores WHERE board IN (${days.map(() => '?').join(',')})`).bind(...days).run();
  await db.prepare('DELETE FROM score_flags WHERE at < ?1').bind(now - 30 * 86400000).run();
}
