// Textures made in code, kept across launches (gs.models materials): the first time a material is
// made its pictures are saved, squeezed as WebP, in the app's own IndexedDB; next launch they are
// read back while the 3D parts load, so making it again costs nothing. The newest 64 stay.
// Kit use only (games can't reach storage; they just ask gs.models for a material).
const DB = 'gs-bakes', STORE = 'bakes', KEEP = 64, VERSION = 1;
const mem = new Map();   // key -> { w, h, layers: { name: ImageBitmap } }
let dbp = null;
const open = () => dbp ||= new Promise(res => {
  try {
    const rq = indexedDB.open(DB, VERSION);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  } catch (e) { res(null); }
});
const tx = (db, mode, fn) => new Promise(res => { try { const t = db.transaction(STORE, mode), s = t.objectStore(STORE), r = fn(s); t.oncomplete = () => res(r?.result); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); } });

/** Reads the saved bakes into memory (the 3D parts wait for this while loading; never rejects). */
export async function warm() {
  const db = await open(); if (!db) return;
  const all = await tx(db, 'readonly', s => s.getAll()); if (!all) return;
  all.sort((a, b) => b.t - a.t);
  await Promise.all(all.slice(0, KEEP).map(async e => {
    try { const layers = {}; for (const [k, blob] of Object.entries(e.layers)) layers[k] = await createImageBitmap(blob); mem.set(e.key, { w: e.w, h: e.h, layers }); } catch (err) { /* a bad entry is just made again */ }
  }));
  if (all.length > KEEP) tx(db, 'readwrite', s => { for (const e of all.slice(KEEP)) s.delete(e.key); });
}
/** The saved pictures for key ({ w, h, layers }), or null. */
export const get = key => mem.get(key) || null;
/** Saves canvases (name -> canvas) under key, in the background. */
export function put(key, canvases) {
  const first = Object.values(canvases)[0]; if (!first) return;
  mem.set(key, { w: first.width, h: first.height, layers: canvases });
  (async () => {
    const db = await open(); if (!db) return;
    const layers = {};
    for (const [k, c] of Object.entries(canvases)) {
      const blob = await new Promise(r => { try { c.toBlob(r, 'image/webp', .92); } catch (e) { r(null); } });
      if (!blob) return; layers[k] = blob;
    }
    tx(db, 'readwrite', s => s.put({ key, w: first.width, h: first.height, t: Date.now(), layers }, key));
  })();
}
/** Forgets every saved bake (Settings › clear cache, tests). */
export async function clear() { mem.clear(); const db = await open(); if (db) await tx(db, 'readwrite', s => s.clear()); }
