// Streams games in over the network, like a video feed loads the next clip.
//
// The app ships with every game built in, so it works offline and on first launch. On top of that
// it reads a catalogue (manifest.json) from the game host (Cloudflare R2, VITE_GAMES_URL at build
// time). A game in the catalogue is used instead of the built-in copy when its code differs (a fix
// or update), and games the app has never seen are added to the feed. Each game is one small file;
// the feed downloads the next few ahead of time and keeps them in IndexedDB, so swiping stays
// instant and they still play offline later. scripts/build-games.mjs makes the files.
import BUNDLED_HASH from 'virtual:game-hashes';

const BASE = String(import.meta.env.VITE_GAMES_URL || '').replace(/\/+$/, '');
const MANIFEST_KEY = 'gs_manifest';

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
const cacheGet = f => idb('readonly', s => s.get(f)).catch(() => undefined);
const cachePut = (f, code) => idb('readwrite', s => s.put(code, f)).catch(() => {});
async function cachePrune(keep) {
  try { const keys = await idb('readonly', s => s.getAllKeys()); const old = keys.filter(k => !keep.has(k)); if (old.length) await idb('readwrite', s => old.forEach(k => s.delete(k))); } catch (_) {}
}

/* ---------- state ---------- */
const entries = new Map();   // id -> manifest entry we should use instead of (or as well as) the built-in game
const loaded = new Map();    // id -> { hash, def }
const inflight = new Map();  // id -> Promise
let games = [], addGame = null, onChange = null;

// Can this app run the game? It must only use shared exports this build actually has.
function compatible(g) {
  for (const [mod, names] of Object.entries(g.needs || {})) { const m = KIT[mod]; if (!m || names.some(n => !(n in m))) return false; }
  return true;
}

function apply(m) {
  if (!m || m.v !== 1 || !Array.isArray(m.games)) return false;
  const added = [];
  for (const g of m.games) {
    if (!g || !g.id || !g.file || !g.hash) continue;
    if (BUNDLED_HASH[g.id] === g.hash || !compatible(g)) { entries.delete(g.id); continue; }   // built-in copy is current (or the update needs a newer app)
    entries.set(g.id, g);
    if (!games.some(x => x.id === g.id) && g.meta && g.meta.id === g.id) added.push(addGame({ ...g.meta, _stub: true }));
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
  let code = await cacheGet(g.file), fresh = false;
  if (typeof code !== 'string') {
    if (!BASE) throw new Error('no game host');
    const r = await fetch(`${BASE}/${g.file}`);
    if (!r.ok) throw new Error(`${r.status} for ${g.file}`);
    code = await r.text(); fresh = true;
  }
  const h = await sha12(code);
  if (h && h !== g.hash) throw new Error('hash mismatch for ' + g.file);
  if (fresh) cachePut(g.file, code);
  return code;
}

export const remote = {
  enabled: !!BASE,

  /** list: the app's GAMES array. add(meta): put a new game into it and return it. changed(games): new games arrived. */
  init(list, add, changed) {
    games = list; addGame = add; onChange = changed;
    try { apply(JSON.parse(localStorage.getItem(MANIFEST_KEY) || 'null')); } catch (_) {}
    if (BASE) this.refresh();
  },

  /** Fetch the latest catalogue. Runs at start-up and when the app comes back to the foreground. */
  async refresh() {
    try {
      const r = await fetch(`${BASE}/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return;
      const text = await r.text(), m = JSON.parse(text);
      try { localStorage.setItem(MANIFEST_KEY, text); } catch (_) {}
      for (const id of [...entries.keys()]) if (!m.games?.some(g => g.id === id)) entries.delete(id);
      const added = apply(m);
      cachePrune(new Set(m.games.map(g => g.file)));
      if (added.length && onChange) onChange(added);
    } catch (_) { /* offline: keep using the cached catalogue */ }
  },

  /** The playable definition for a feed entry: the downloaded version when we have it, the built-in one
   *  otherwise, or null for a streamed-only game that hasn't downloaded yet. */
  def(d) {
    const g = entries.get(d.id), l = loaded.get(d.id);
    if (g && l && l.hash === g.hash) return l.def;
    if (g) this.load(d.id);
    return d._stub ? null : d;
  },

  /** Download (or read from the offline cache) one game. Resolves to its definition, or null. */
  load(id) {
    const g = entries.get(id);
    if (!g) return Promise.resolve(null);
    const l = loaded.get(id);
    if (l && l.hash === g.hash) return Promise.resolve(l.def);
    if (inflight.has(id)) return inflight.get(id);
    const base = games.find(x => x.id === id);
    const p = fetchCode(g).then(code => {
      const def = { likes: base && base.likes, ...evaluate(id, code), _remote: g.hash };
      loaded.set(id, { hash: g.hash, def }); return def;
    }).catch(e => { console.warn('[remote]', e.message); return null; })
      .finally(() => inflight.delete(id));
    inflight.set(id, p); return p;
  },

  /** Is a newer or extra version of this game on the game host? */
  has(id) { return entries.has(id); },

  /** Get the next few games in the feed ready so they open instantly. */
  prefetch(list) { for (const d of list) if (entries.has(d.id)) this.load(d.id); },

  /** For the QA panel / tests: what's streamed right now. */
  status() { return { host: BASE || null, streamed: [...entries.keys()], loaded: [...loaded.keys()] }; },
};
