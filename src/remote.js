// Streams every game in over the network, like a video feed loads the next clip.
//
// The app ships with no games inside. It reads a catalogue (manifest.json) from the game host
// (Cloudflare R2, VITE_GAMES_URL at build time) with each game's title, hint, era and so on, and
// downloads a game's code (one small file) just before it comes up in the feed. Downloaded games
// are kept in IndexedDB, up to CACHE_MAX of them (the least recently played are dropped first),
// so they open instantly and still play offline. scripts/build-games.mjs makes the files.
//
// Local dev and the test scripts build with VITE_GAMES_URL empty (vite --mode bundled): then the
// games in src/games/ are built in and this module stays out of the way.

export const BASE = String(import.meta.env.VITE_GAMES_URL || '').replace(/\/+$/, '');
export const CACHE_MAX = 100;
const MANIFEST_KEY = 'gs_manifest', INDEX_KEY = 'gs_cache_index';

// The app's shared code, handed to downloaded games so they use the same sound, haptics, wallet...
const KIT = {};
for (const [p, m] of Object.entries(import.meta.glob(['./*.js', '!./main.js', '!./remote.js', './kit/*.js'], { eager: true })))
  KIT[p.slice(2)] = m;

/* ---------- tiny IndexedDB store: file path -> code ---------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, no) => {
    if (!globalThis.indexedDB) return no(new Error('no indexedDB'));
    const r = indexedDB.open('gs_games', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((ok, no) => { const t = d.transaction('files', mode), q = fn(t.objectStore('files')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); });
}

/* ---------- cache index: file -> [last used, bytes], kept in localStorage so it's readable at once ---------- */
let index = {};
try { index = JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') || {}; } catch (_) {}
const saveIndex = () => { try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch (_) {} };

const cacheGet = f => idb('readonly', s => s.get(f)).catch(() => undefined);
async function cacheDrop(files) {
  if (!files.length) return;
  for (const f of files) delete index[f];
  saveIndex();
  try { await idb('readwrite', s => files.forEach(f => s.delete(f))); } catch (_) {}
}
async function cachePut(f, code) {
  index[f] = [Date.now(), code.length]; saveIndex();
  try { await idb('readwrite', s => s.put(code, f)); } catch (_) { delete index[f]; saveIndex(); return; }
  const files = Object.keys(index);
  if (files.length > CACHE_MAX)   // over the limit: drop the games played longest ago
    await cacheDrop(files.sort((a, b) => index[a][0] - index[b][0]).slice(0, files.length - CACHE_MAX));
}

/* ---------- state ---------- */
const entries = new Map();   // id -> manifest entry
const loaded = new Map();    // id -> { hash, def }
const inflight = new Map();  // id -> Promise
const failed = new Map();    // id -> time of the last failed download (skipped for a while, e.g. offline)
let addGame = null, onChange = null;
const known = new Map();   // id -> the app's entry for it (metadata, likes)

// Can this app run the game? It must only use shared exports this build actually has.
function compatible(g) {
  for (const [mod, names] of Object.entries(g.needs || {})) { const m = KIT[mod]; if (!m || names.some(n => !(n in m))) return false; }
  return true;
}

function apply(m) {
  const added = [];
  if (!m || m.v !== 1 || !Array.isArray(m.games)) return added;
  for (const g of m.games) {
    if (!g || !g.id || !g.file || !g.hash || !g.meta || g.meta.id !== g.id || !compatible(g)) continue;
    entries.set(g.id, g);
    if (!known.has(g.id)) { const e = addGame({ ...g.meta }); known.set(g.id, e); added.push(e); }
  }
  return added;
}

async function sha12(code) {
  if (!globalThis.crypto || !crypto.subtle) return null;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

function evaluate(id, code) {
  const module = { exports: {} };
  const require = spec => { const m = spec.startsWith('gs:') && KIT[spec.slice(3)]; if (!m) throw new Error('missing shared module ' + spec); return m; };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  const def = module.exports.default;
  if (!def || def.id !== id || typeof def.make !== 'function') throw new Error('bad game file for ' + id);
  return def;
}

async function fetchCode(g) {
  let code = await cacheGet(g.file);
  if (typeof code === 'string') { if (index[g.file]) { index[g.file][0] = Date.now(); saveIndex(); } return code; }
  const r = await fetch(`${BASE}/${g.file}`);
  if (!r.ok) throw new Error(`${r.status} for ${g.file}`);
  code = await r.text();
  const h = await sha12(code);
  if (h && h !== g.hash) throw new Error('hash mismatch for ' + g.file);
  cachePut(g.file, code);
  return code;
}

export const remote = {
  enabled: !!BASE,

  /** add(meta): put a game into the app's list and return it. changed(games): new games arrived later. */
  init(add, changed) {
    addGame = add; onChange = changed;
    try { apply(JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null')); } catch (_) {}
  },

  /** Fetch the latest catalogue. Resolves true if it got one. Runs at start-up and on return to the app. */
  async refresh() {
    failed.clear();   // give games that failed to download (e.g. while offline) another go
    try {
      const r = await fetch(`${BASE}/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return false;
      const text = await r.text(), m = JSON.parse(text);
      if (!Array.isArray(m.games)) return false;
      try { localStorage.setItem(MANIFEST_KEY, text); } catch (_) {}
      for (const id of [...entries.keys()]) if (!m.games.some(g => g.id === id)) entries.delete(id);   // taken down
      const added = apply(m), live = new Set(m.games.map(g => g.file));
      cacheDrop(Object.keys(index).filter(f => !live.has(f)));   // old versions of updated games
      if (added.length && onChange) onChange(added);
      return true;
    } catch (_) { return false; }   // offline: keep using the saved catalogue
  },

  /** The playable definition of a feed entry, or null while it downloads (the download starts). */
  def(d) {
    const g = entries.get(d.id), l = loaded.get(d.id);
    if (!g) return null;
    if (l && l.hash === g.hash) return l.def;
    this.load(d.id); return null;
  },

  /** Can this game be shown soon? (In the catalogue and not just failed to download.) */
  has(id) { const t = failed.get(id); return entries.has(id) && !(t && Date.now() - t < 20000); },

  /** Download (or read from the cache) one game. Resolves to its definition, or null. */
  load(id) {
    const g = entries.get(id);
    if (!g) return Promise.resolve(null);
    const l = loaded.get(id);
    if (l && l.hash === g.hash) return Promise.resolve(l.def);
    if (inflight.has(id)) return inflight.get(id);
    const p = fetchCode(g).then(code => {
      const def = { ...known.get(id), ...evaluate(id, code) };
      loaded.set(id, { hash: g.hash, def }); failed.delete(id); return def;
    }).catch(e => { console.warn('[games]', id, e.message); failed.set(id, Date.now()); return null; })
      .finally(() => inflight.delete(id));
    inflight.set(id, p); return p;
  },

  /** Get the next few games in the feed ready so they open instantly. */
  prefetch(list) { for (const d of list) if (this.has(d.id)) this.load(d.id); },

  /** Mark a game as just played, so the cache keeps it. */
  touch(id) { const g = entries.get(id); if (g && index[g.file]) { index[g.file][0] = Date.now(); saveIndex(); } },

  /** For the settings screen. */
  cacheInfo() { const v = Object.values(index); return { games: v.length, bytes: v.reduce((a, x) => a + x[1], 0), max: CACHE_MAX }; },
  async clearCache() {
    index = {}; saveIndex();
    try { await idb('readwrite', s => s.clear()); } catch (_) {}
  },

  status() { return { host: BASE || null, games: entries.size, loaded: [...loaded.keys()], cache: this.cacheInfo() }; },
};
