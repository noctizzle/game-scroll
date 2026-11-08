// Leaderboards for every game: each install's best score, all time and for today (UTC days).
//
//   POST /score  body { device, game, score } (+ pass, like /heart) -> { all: { rank, of, best }, day: {...} }
//   GET  /board?game=<id>&device=<id>&when=all|day -> { top: [{ name, score, me }], me: { rank, score } | null, of }
//
// No accounts or typed names: each install gets a made-up, family-friendly name worked out from its
// device id (the same everywhere), so nobody can put words on a public board.

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
}
