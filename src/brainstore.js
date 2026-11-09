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
  const fun = new Map();   // this card's brains that listen for fun signals: name -> fn
  const slot = {
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
    /**
     * Tells this brain how fun the last round looked to the app (about -1..1): played again soon,
     * hearted, or left the game-over screen in a hurry. The newest listener for a name wins, so a
     * game remade after a reload doesn't hear it twice. Each card has its own (two cards of one game
     * don't hear each other's rounds). Returns a function that stops listening.
     */
    onFun(name, fn) {
      if (!NAME_RE.test(name) || typeof fn !== 'function') return () => {};
      fun.set(name, fn);
      return () => { if (fun.get(name) === fn) fun.delete(name); };
    },
    /** The player profile every game's brains share (see playerProfile). */
    player: playerProfile,
    /** Adds this phone's brain to the average (only the numbers). */
    share(name, shape, w, steps) {
      if (!HEARTS_URL || !NAME_RE.test(name) || !SHAPE_RE.test(shape) || typeof w !== 'string' || w.length > 3000) return;
      apiPost('/brain', { game: id, name, shape, w, steps: steps | 0 }).catch(() => {});
    },
  };
  funOf.set(slot, fun);
  return slot;
}

// ---------------------------------------------------------------- fun signals
// The app watches what people do around a round (main.js) and passes it on to the game's brains.
const funOf = new WeakMap();   // a card's brains slot (brainsFor) -> its listeners
/** The app: how fun the round on the card with this brains slot (its api.brains) looked, -1..1. */
export function sendFun(slot, x) {
  const m = funOf.get(slot); if (!m || !isFinite(x)) return;
  x = Math.max(-1, Math.min(1, x));
  for (const fn of [...m.values()]) try { fn(x); } catch (e) { console.warn('[brains] fun', e); }
}

// ---------------------------------------------------------------- the player profile
// One small record of how this player plays, shared by every game's brains: the skill their brains
// settle at, reaction time, aim. It stays on the phone (and the player's own cloud save); it's never
// shared. Kept small: a few numbers per kind.
const PKEY = 'gs_player', PMAX = 1024, KIND_RE = /^[a-z0-9_-]{1,16}$/i;
let P = store.get(PKEY, null);
if (!P || typeof P !== 'object' || Array.isArray(P) || typeof P.k !== 'object') P = { t: 0, k: {} };
export const playerProfile = {
  /** { kind: { v: value, n: how many notes } } (a copy). */
  read() { return JSON.parse(JSON.stringify(P.k)); },
  /** Saves one kind's numbers. */
  write(kind, v, n) {
    if (!KIND_RE.test(kind) || !isFinite(v) || !isFinite(n)) return false;
    const k = { ...P.k, [kind]: { v: +(+v).toFixed(4), n: Math.min(1e6, Math.max(0, n | 0)) } };
    if (JSON.stringify(k).length > PMAX) return false;
    P = { t: Math.max(Date.now(), P.t + 1), k }; store.set(PKEY, P);
    if (!pending) pending = setTimeout(() => { pending = 0; progress.touch(); }, 3000);
    return true;
  },
  /** Forgets the profile (Settings, or a test). */
  clear() { P = { t: Math.max(Date.now(), P.t + 1), k: {} }; store.set(PKEY, P); progress.touch(); },
};
progress.section('player', {
  snapshot: () => P,
  merge(other) {
    if (!other || typeof other !== 'object' || typeof other.t !== 'number' || !(other.t > P.t) || !other.k || typeof other.k !== 'object') return;
    if (JSON.stringify(other.k).length > PMAX) return;
    const k = {};
    for (const [kind, e] of Object.entries(other.k)) if (KIND_RE.test(kind) && e && isFinite(e.v) && isFinite(e.n)) k[kind] = { v: +e.v, n: e.n | 0 };
    P = { t: other.t, k }; store.set(PKEY, P);
  },
});

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
