// Your own play history, kept on this phone only (never sent anywhere): when you last saw each
// game, how often it came up, how often you scrolled straight past it, and how often you played.
// The feed uses it so you don't keep getting the same games, games you always skip fade out,
// and games you've never seen get a turn.
//
// It also keeps a short "this session" list (in memory only): the last few games and whether you
// played or skipped them, so the feed can follow your mood right now, not just your long-term taste.
import { store } from './util.js';

const KEY = 'gs_history', MAX_GAMES = 2000, SESSION_LEN = 12;
let db = store.get(KEY, {}) || {};   // id -> { t: last seen (ms), v: views, k: quick skips, p: plays }
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set(KEY, db), 400); };
const row = id => (db[id] ||= { t: 0, v: 0, k: 0, p: 0 });

/** Recent games this session, newest last: { id, w } where w > 0 played, w < 0 skipped. */
const session = [];
const listeners = new Set();

function trim() {
  const ids = Object.keys(db);
  if (ids.length <= MAX_GAMES) return;
  ids.sort((a, b) => db[a].t - db[b].t).slice(0, ids.length - MAX_GAMES).forEach(id => delete db[id]);
}

export const history = {
  get: id => db[id] || null,
  session: () => session,
  /** Called after a view ends; f(id, w). Used to re-rank the queue as you scroll. */
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },

  /** A view ended: ms on screen, whether a round started, and seconds played during it. */
  viewed(id, ms, played, secs = 0) {
    const x = row(id); x.t = Date.now(); x.v++;
    const skip = !played && ms < 5000;
    if (skip) x.k++;
    if (played) x.p++;
    trim(); save();
    // Mood: a quick skip counts against, a real play for (more for longer), a slow look is neutral.
    const w = skip ? -1 : played ? Math.min(1.5, 0.4 + secs / 60) : 0;
    if (w) { session.push({ id, w }); if (session.length > SESSION_LEN) session.shift(); }
    listeners.forEach(f => { try { f(id, w); } catch (_) {} });
  },

  /** For tests and the QA panel. */
  _reset(d = {}) { db = d; session.length = 0; },
};
