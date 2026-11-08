// api.away(): how long a game wasn't running, so idle games can pay out for time away without
// reading the clock themselves. The app notes when each game last ran (kept on the phone); away()
// gives the seconds since then, up to a week, and about 0 once the game has run on this card.
import { store } from './util.js';

const KEY = 'gs_last_run', WEEK = 7 * 86400;
let last = store.get(KEY, {}); if (!last || typeof last !== 'object') last = {};
let dirty = false, flushAt = 0;
const flush = () => { if (dirty) { store.set(KEY, last); dirty = false; } };
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/** Call every frame the game runs. */
export function ran(id, now = Date.now()) {
  last[id] = now; dirty = true;
  if (now > flushAt) { flushAt = now + 10000; flush(); }
}
/** The api for one card: away() in seconds. */
export function awayFor(id) {
  const since = last[id] || 0;   // when it last ran before this card was made
  return {
    away() {
      const ref = last[id] && last[id] > since ? last[id] : since;
      if (!ref) return 0;
      return Math.max(0, Math.min(WEEK, (Date.now() - ref) / 1000));
    },
  };
}
