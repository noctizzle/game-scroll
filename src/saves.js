// Save slots: every game gets its own save (unlocked levels, settings, a run to continue), through
// api.save(data) / api.load(fallback) / api.clearSave() in make(api).
//
// Saves are kept per game, so one game can't read or change another's, and ride along in the
// player's cloud save (Game Center / Play Games, via progress.section) so they follow the player to
// a new phone. When two devices both saved a game, the newer save wins (a clear counts as a save).
//
// A save may be SAVE_MAX of JSON (8 KB; it was 2 KB). They're kept packed (deflate, by fflate), which
// makes typical save data (the same keys over and over, lots of small numbers) three to six times
// smaller, so the bigger limit costs the cloud save about what the old one did.
//
// For more than that there's a second, larger slot that stays on this phone: api.saveLocal(data) /
// api.loadLocal(fallback) / api.clearLocal(), LOCAL_MAX of JSON (512 KB) each. It's for things that
// are big and wouldn't be missed on a new phone: a built world, drawings, recorded runs to race.
// It lives in the phone's database (IndexedDB), packed by the browser, and is read the first time a
// game asks, which takes a moment: loadLocal() in make() or reset() makes the app wait for it the way
// it waits for the physics engine (the card says "Loading…", then the game is made again).
//
// This is app-only code: games never import it (see src/game-modules.js), they only get the api.
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { store } from './util.js';
import { progress } from './kit/progress.js';
import { StillLoading } from './kit/lazy.js';
import { currentOwner } from './kit/cleanup.js';

const KEY = 'gs_saves';
/** Most a single game may save to its cloud slot, as JSON text. Saves for every game must fit in one cloud save. */
export const SAVE_MAX = 8192;
/** Most a single game may keep in its phone-only slot, as JSON text. */
export const LOCAL_MAX = 512 * 1024;

// Packed saves: { t, v, z } where z is the JSON deflated, as base64 text. A save that packing doesn't
// shrink (short ones) stays { t, v, d }. In memory every save is { t, v, d }.
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const b = atob(s), u8 = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i); return u8; };
const packedOf = new WeakMap();   // a save in memory -> how it's stored (worked out once per save)
function pack(rec) {
  if (!rec || rec.gone || rec.d === undefined) return rec;
  let p = packedOf.get(rec);
  if (!p) {
    p = rec;
    try { const text = JSON.stringify(rec.d); if (text.length > 200) { const z = b64(deflateSync(strToU8(text), { level: 6 })); if (z.length < text.length * .9) p = { t: rec.t, ...(rec.v > 1 ? { v: rec.v } : {}), z }; } } catch { p = rec; }
    packedOf.set(rec, p);
  }
  return p;
}
/** A stored save back to { t, v, d }, or null if it can't be read or is over the limit. */
function unpack(rec) {
  if (!rec || typeof rec !== 'object' || typeof rec.t !== 'number') return null;
  if (rec.gone) return { t: rec.t, gone: true };
  const v = Number.isInteger(rec.v) && rec.v > 1 ? { v: rec.v } : {};
  try {
    if (typeof rec.z === 'string') {
      if (rec.z.length > SAVE_MAX * 1.5) return null;
      const text = strFromU8(inflateSync(unb64(rec.z)));
      if (text.length > SAVE_MAX) return null;
      const out = { t: rec.t, ...v, d: JSON.parse(text) }; packedOf.set(out, rec); return out;
    }
    if (JSON.stringify(rec.d ?? null).length > SAVE_MAX) return null;
    return { t: rec.t, ...v, d: rec.d ?? null };
  } catch { return null; }
}
const packAll = () => { const out = {}; for (const [id, rec] of Object.entries(S)) out[id] = pack(rec); return out; };

// gameId -> { t: time saved, d: the game's data } or { t, gone: true } after clearSave()
let S = {};
{
  const kept = store.get(KEY, {});
  if (kept && typeof kept === 'object' && !Array.isArray(kept)) for (const [id, rec] of Object.entries(kept)) { const r = unpack(rec); if (r) S[id] = r; }
}
const persist = () => store.set(KEY, packAll());

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
  snapshot: packAll,
  merge(other) {
    if (!other || typeof other !== 'object') return;
    let any = false;
    for (const [id, v] of Object.entries(other)) {
      if (!v || typeof v !== 'object' || typeof v.t !== 'number' || !(v.t > (S[id]?.t || 0))) continue;
      const r = unpack(v); if (!r) continue;   // unreadable, or over the limit
      S[id] = r;
      any = true;
    }
    if (any) persist();
  },
});

/** Test hook: wipe every game's save. */
export function _resetSaves() { S = {}; persist(); }

/* ---------- the larger slot that stays on this phone ---------- */
// IndexedDB 'gs-local', one record per game: { t, v, z } (z: the JSON packed by the browser's own
// CompressionStream, as bytes) or { t, v, text } where there's no CompressionStream.
const L = new Map();        // gameId -> { v, d } read so far (d undefined: this game has none)
const reading = new Map();  // gameId -> the promise of its first read
let dbp = null;
const db = () => dbp ||= new Promise((res, rej) => {
  const rq = indexedDB.open('gs-local', 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore('saves');
  rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error('blocked'));
}).catch(e => { dbp = null; throw e; });
const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('saves', mode), rq = fn(t.objectStore('saves')); t.oncomplete = () => res(rq.result); t.onerror = t.onabort = () => rej(t.error); }));
async function squeeze(text) {
  if (typeof CompressionStream !== 'function') return { text };
  const z = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  return { z };
}
async function unsqueeze(rec) {
  if (rec.z) return new Response(new Blob([rec.z]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  return rec.text;
}
// The first read of a game's slot. Never fails: a database that can't be opened or a record that can't
// be read counts as "nothing saved", so the game still starts.
function readLocal(id) {
  let p = reading.get(id);
  if (!p) reading.set(id, p = (async () => {
    let got = { v: 1, d: undefined };
    try { const rec = await tx('readonly', s => s.get(id)); if (rec) { const text = await unsqueeze(rec); if (typeof text === 'string' && text.length <= LOCAL_MAX) got = { v: Number.isInteger(rec.v) && rec.v > 0 ? rec.v : 1, d: JSON.parse(text) }; } }
    catch (e) { console.warn(`[save] ${id}: couldn't read the phone's save`, e); }
    if (!L.has(id)) L.set(id, got);   // (a save made while it was being read is newer: keep that)
  })());
  return p;
}
// Writes are queued per game: the newest data waiting is what's written, one write at a time.
const queue = new Map(), writing = new Set();
function writeLocal(id) {
  if (writing.has(id)) return;
  writing.add(id);
  (async () => {
    while (queue.has(id)) {
      const job = queue.get(id); queue.delete(id);
      try { if (job.gone) await tx('readwrite', s => s.delete(id)); else { const packed = await squeeze(job.text); await tx('readwrite', s => s.put({ t: Date.now(), v: job.v, ...packed }, id)); } }
      catch (e) { console.warn(`[save] ${id}: couldn't write the phone's save`, e); }
    }
    writing.delete(id);
  })();
}
/** Resolves when every phone save waiting to be written is on disk (tests; the app doesn't wait). */
export async function _localFlushed() { while (queue.size || writing.size) await new Promise(r => setTimeout(r, 10)); }
/** Test hook: forget what's been read, so the next loadLocal() reads the disk again. */
export function _forgetLocal() { L.clear(); reading.clear(); }

/** The phone-only save api for one game: saveLocal / loadLocal / clearLocal. Data must be JSON. */
export function localSavesFor(game) {
  const id = typeof game === 'string' ? game : game.id;
  const ver = () => { const v = typeof game === 'object' && game.save && game.save.version; return Number.isInteger(v) && v > 0 ? v : 1; };
  // what's on disk for this game, read if need be: inside make() / reset() the app waits and makes the game again
  const have = () => {
    if (L.has(id)) return L.get(id);
    if (typeof indexedDB === 'undefined') { const none = { v: 1, d: undefined }; L.set(id, none); return none; }
    const p = readLocal(id);
    if (currentOwner()) throw new StillLoading('this game\'s save', p);
    return null;   // asked for mid-round before it's in: nothing yet (ask in make() or reset())
  };
  const slot = {
    /** Replaces the game's phone-only save. Returns false (and saves nothing) if it isn't JSON or is too big. */
    saveLocal(data) {
      let text;
      try { text = JSON.stringify(data); } catch { console.warn(`[save] ${id}: data is not JSON`); return false; }
      if (text === undefined) return false;
      if (text.length > LOCAL_MAX) { console.warn(`[save] ${id}: ${text.length} bytes, the phone save's limit is ${LOCAL_MAX}`); return false; }
      const cur = L.get(id);
      if (cur && cur.d !== undefined && cur.v > ver()) { console.warn(`[save] ${id}: the phone save is from a newer version of this game, so it is kept`); return false; }
      L.set(id, { v: ver(), d: JSON.parse(text) });
      if (typeof indexedDB !== 'undefined') { queue.set(id, { text, v: ver() }); writeLocal(id); }
      return true;
    },
    /** A fresh copy of the game's phone-only save (brought up to this version), or `fallback` when it has none. Call it in make() or reset(). */
    loadLocal(fallback = null) {
      const rec = have();
      if (!rec) { console.warn(`[save] ${id}: loadLocal() before the save was read; call it in make() or reset()`); return fallback; }
      if (rec.d === undefined || rec.v > ver()) return fallback;
      let d = JSON.parse(JSON.stringify(rec.d));
      if (rec.v < ver()) {
        const m = typeof game === 'object' && game.save && game.save.migrateLocal;
        if (typeof m !== 'function') { console.warn(`[save] ${id}: the phone save is version ${rec.v}, the game is ${ver()} and has no save.migrateLocal()`); return fallback; }
        try { d = m(d, rec.v); } catch (e) { console.warn(`[save] ${id}: migrateLocal failed`, e); return fallback; }
        if (d === undefined || !slot.saveLocal(d)) return fallback;
        d = JSON.parse(JSON.stringify(L.get(id).d));
      }
      return d;
    },
    /** Deletes the game's phone-only save. */
    clearLocal() {
      L.set(id, { v: 1, d: undefined });
      if (typeof indexedDB !== 'undefined') { queue.set(id, { gone: true }); writeLocal(id); }
    },
  };
  return slot;
}
