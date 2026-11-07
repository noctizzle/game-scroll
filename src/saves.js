// Save slots: every game gets its own small save (unlocked levels, settings, a run to continue),
// through api.save(data) / api.load(fallback) / api.clearSave() in make(api).
//
// Saves are kept per game, so one game can't read or change another's, and ride along in the
// player's cloud save (Game Center / Play Games, via progress.section) so they follow the player to
// a new phone. When two devices both saved a game, the newer save wins (a clear counts as a save).
//
// This is app-only code: games never import it (see src/game-modules.js), they only get the api.
import { store } from './util.js';
import { progress } from './kit/progress.js';

const KEY = 'gs_saves';
/** Most a single game may save, as JSON text. Saves for every game must fit in one cloud save. */
export const SAVE_MAX = 2048;

// gameId -> { t: time saved, d: the game's data } or { t, gone: true } after clearSave()
let S = store.get(KEY, {});
if (!S || typeof S !== 'object' || Array.isArray(S)) S = {};
const persist = () => store.set(KEY, S);

let pending = 0;
function changed() {   // tell the cloud save, a moment later so a burst of saves is one write
  persist();
  if (!pending) pending = setTimeout(() => { pending = 0; progress.touch(); }, 1500);
}

/** The save api for one game. Data must be JSON: numbers, strings, booleans, arrays, plain objects. */
export function savesFor(id) {
  return {
    /** Replaces the game's save. Returns false (and saves nothing) if it isn't JSON or is too big. */
    save(data) {
      let text;
      try { text = JSON.stringify(data); } catch { console.warn(`[save] ${id}: data is not JSON`); return false; }
      if (text === undefined) return false;
      if (text.length > SAVE_MAX) { console.warn(`[save] ${id}: ${text.length} bytes, the limit is ${SAVE_MAX}`); return false; }
      S[id] = { t: Math.max(Date.now(), (S[id]?.t || 0) + 1), d: JSON.parse(text) };
      changed();
      return true;
    },
    /** A fresh copy of the game's save, or `fallback` when it has none. */
    load(fallback = null) {
      const v = S[id];
      return v && !v.gone ? JSON.parse(JSON.stringify(v.d)) : fallback;
    },
    /** Deletes the game's save (on every device, once they sync). */
    clearSave() {
      if (!S[id] || S[id].gone) return;
      S[id] = { t: Math.max(Date.now(), S[id].t + 1), gone: true };
      changed();
    },
  };
}

progress.section('saves', {
  snapshot: () => S,
  merge(other) {
    if (!other || typeof other !== 'object') return;
    let any = false;
    for (const [id, v] of Object.entries(other)) {
      if (!v || typeof v !== 'object' || typeof v.t !== 'number' || !(v.t > (S[id]?.t || 0))) continue;
      if (!v.gone && JSON.stringify(v.d ?? null).length > SAVE_MAX) continue;
      S[id] = v.gone ? { t: v.t, gone: true } : { t: v.t, d: v.d };
      any = true;
    }
    if (any) persist();
  },
});

/** Test hook: wipe every game's save. */
export function _resetSaves() { S = {}; persist(); }
