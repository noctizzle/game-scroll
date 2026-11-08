// Where Tiny Brains (src/kit/brains.js) keep what they learned: a slot per game, apart from the game's
// own save, on the phone and in the player's cloud save (so a brain follows them to a new phone).
// Newer wins when two phones have one, like saves. Shared learning: a brain that has learned enough
// now and then sends its numbers (nothing about the player) to the API, and a fresh brain starts from
// the average of everyone's (workers/hearts/src/brains.js). Games get this as api.brains through the
// kit; they never call it themselves.
import { store } from './util.js';
import { progress } from './kit/progress.js';
import { HEARTS_URL, apiPost } from './hearts.js';

const KEY = 'gs_brains';
/** Most one game's brains may keep, as text. */
export const BRAIN_MAX = 4096;
const NAME_RE = /^[a-z0-9_-]{1,24}$/i, SHAPE_RE = /^\d+(x\d+){1,5}$/;

// gameId -> { t: time saved, b: { name: text } }
let B = store.get(KEY, {});
if (!B || typeof B !== 'object' || Array.isArray(B)) B = {};
let pending = 0;
const changed = () => { store.set(KEY, B); if (!pending) pending = setTimeout(() => { pending = 0; progress.touch(); }, 3000); };
const sharedCache = new Map();

export function brainsFor(id) {
  return {
    load(name) { return B[id]?.b?.[name] ?? null; },
    save(name, text) {
      if (!NAME_RE.test(name) || typeof text !== 'string') return false;
      const b = { ...(B[id]?.b || {}), [name]: text };
      if (JSON.stringify(b).length > BRAIN_MAX) { console.warn(`[brains] ${id}: brains too big to keep (${BRAIN_MAX} bytes)`); return false; }
      B[id] = { t: Math.max(Date.now(), (B[id]?.t || 0) + 1), b };
      changed(); return true;
    },
    /** Everyone's average brain of this shape, or null (offline, none yet, dev builds). */
    shared(name, shape) {
      if (!HEARTS_URL || !NAME_RE.test(name) || !SHAPE_RE.test(shape)) return Promise.resolve(null);
      const k = `${id}/${name}/${shape}`;
      if (!sharedCache.has(k)) sharedCache.set(k, fetch(`${HEARTS_URL}/brain?game=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&shape=${shape}`)
        .then(r => (r.ok ? r.json() : null)).then(j => (j && typeof j.w === 'string' ? j.w : null)).catch(() => null));
      return sharedCache.get(k);
    },
    /** Adds this phone's brain to the average (only the numbers). */
    share(name, shape, w, steps) {
      if (!HEARTS_URL || !NAME_RE.test(name) || !SHAPE_RE.test(shape) || typeof w !== 'string' || w.length > 3000) return;
      apiPost('/brain', { game: id, name, shape, w, steps: steps | 0 }).catch(() => {});
    },
  };
}

progress.section('brains', {
  snapshot: () => B,
  merge(other) {
    if (!other || typeof other !== 'object') return;
    let any = false;
    for (const [id, v] of Object.entries(other)) {
      if (!v || typeof v !== 'object' || typeof v.t !== 'number' || !(v.t > (B[id]?.t || 0)) || !v.b || typeof v.b !== 'object') continue;
      if (JSON.stringify(v.b).length > BRAIN_MAX) continue;
      B[id] = { t: v.t, b: v.b }; any = true;
    }
    if (any) store.set(KEY, B);
  },
});
