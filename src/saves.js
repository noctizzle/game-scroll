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

// Save versions: a game that changes what it saves gives its definition
//   save: { version: 2, migrate(data, from) { ...return the data in the new shape } }
// Each save remembers the version it was written with. load() hands older saves to migrate() first
// (once per version step is up to the game: `from` says which version the data is), and keeps the
// result. A save from a newer version of the game (the player's other phone has an update this one
// doesn't) is left alone: load() returns the fallback and save() won't write over it until this
// copy of the game is updated too. A migrate that throws or returns undefined gives the fallback.

/** The save api for one game (its definition, or just its id). Data must be JSON. */
export function savesFor(game) {
  const id = typeof game === 'string' ? game : game.id;
  const ver = () => { const v = typeof game === 'object' && game.save && game.save.version; return Number.isInteger(v) && v > 0 ? v : 1; };
  const verOf = rec => (Number.isInteger(rec?.v) && rec.v > 0 ? rec.v : 1);
  const newer = () => S[id] && !S[id].gone && verOf(S[id]) > ver();
  const write = d => { S[id] = { t: Math.max(Date.now(), (S[id]?.t || 0) + 1), v: ver(), d }; changed(); };
  return {
    /** Replaces the game's save. Returns false (and saves nothing) if it isn't JSON, is too big, or a newer version of the game saved last. */
    save(data) {
      let text;
      try { text = JSON.stringify(data); } catch { console.warn(`[save] ${id}: data is not JSON`); return false; }
      if (text === undefined) return false;
      if (text.length > SAVE_MAX) { console.warn(`[save] ${id}: ${text.length} bytes, the limit is ${SAVE_MAX}`); return false; }
      if (newer()) { console.warn(`[save] ${id}: the save is from a newer version of this game (${verOf(S[id])} > ${ver()}), so it is kept`); return false; }
      write(JSON.parse(text));
      return true;
    },
    /** A fresh copy of the game's save (brought up to this version), or `fallback` when it has none. */
    load(fallback = null) {
      const rec = S[id];
      if (!rec || rec.gone) return fallback;
      const from = verOf(rec), to = ver();
      if (from > to) return fallback;
      let d = JSON.parse(JSON.stringify(rec.d));
      if (from < to) {
        const m = typeof game === 'object' && game.save && game.save.migrate;
        if (typeof m !== 'function') { console.warn(`[save] ${id}: save is version ${from}, the game is ${to} and has no migrate()`); return fallback; }
        try { d = m(d, from); } catch (e) { console.warn(`[save] ${id}: migrate failed`, e); return fallback; }
        if (d === undefined) return fallback;
        let text; try { text = JSON.stringify(d); } catch { return fallback; }
        if (text === undefined || text.length > SAVE_MAX) return fallback;
        write(JSON.parse(text));
        d = JSON.parse(text);
      }
      return d;
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
      S[id] = v.gone ? { t: v.t, gone: true } : { t: v.t, d: v.d, ...(Number.isInteger(v.v) && v.v > 1 ? { v: v.v } : {}) };
      any = true;
    }
    if (any) persist();
  },
});

/** Test hook: wipe every game's save. */
export function _resetSaves() { S = {}; persist(); }
