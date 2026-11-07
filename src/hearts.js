// Shared heart counts: every player's ♥ adds to one count per game, kept by the hearts backend
// (workers/hearts, a Cloudflare Worker + D1 at VITE_HEARTS_URL).
//
// No accounts: this install has a random anonymous device id, so it counts once per game.
// The app reads all counts in one request at start (and when you come back to it), and sends
// each heart or un-heart in the background. Changes made offline wait in a queue and go out later.
// Counts are saved locally too, so the feed shows the last known numbers straight away.
//
// With no VITE_HEARTS_URL (dev and test builds, or before the backend is set up) nothing is sent.
import { store } from './util.js';

export const HEARTS_URL = String(import.meta.env.VITE_HEARTS_URL || '').replace(/\/+$/, '');
const COUNTS_KEY = 'gs_heart_counts', SENT_KEY = 'gs_heart_sent', QUEUE_KEY = 'gs_heart_queue', DEVICE_KEY = 'gs_device';
const REFRESH_MS = 2 * 60 * 1000, FRESH_MS = 3 * 60 * 1000;

function deviceId() {
  let id = store.get(DEVICE_KEY, null);
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
    id = globalThis.crypto?.randomUUID?.() || Array.from({ length: 32 }, () => (Math.random() * 16 | 0).toString(16)).join('');
    store.set(DEVICE_KEY, id);
  }
  return id;
}

let counts = store.get(COUNTS_KEY, {}) || {};   // game id -> count from the server
let sent = store.get(SENT_KEY, {}) || {};       // game id -> true when the server has this device's heart
let queue = store.get(QUEUE_KEY, {}) || {};     // game id -> wanted state, not yet sent
const freshAt = {};                              // game id -> when we got its count from a write (newer than the cached list)
const listeners = new Set();
let lastLoad = 0, flushing = false, flushTimer = 0;

const changed = ids => listeners.forEach(f => { try { f(ids); } catch (_) {} });

export const hearts = {
  enabled: !!HEARTS_URL,

  /** The number to show for a game, given whether this player has hearted it. */
  count(id, mine) {
    // The server count already includes this device if it has received our heart.
    return Math.max(0, (counts[id] || 0) - (sent[id] ? 1 : 0)) + (mine ? 1 : 0);
  },

  /** Call with a list of game ids that changed (or none for "all"). */
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },

  /** Heart or un-heart a game. Sent in the background. */
  set(id, on) {
    if (!this.enabled) return;
    if (!!sent[id] === !!on) delete queue[id]; else queue[id] = !!on;
    store.set(QUEUE_KEY, queue);
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 600);   // quick double taps send once
  },

  /** Make sure the server matches what this player has hearted (e.g. hearts from before syncing). */
  reconcile(ids, isMine) {
    if (!this.enabled) return;
    let any = false;
    for (const id of ids) { const on = !!isMine(id); if (!!sent[id] !== on && queue[id] !== on) { queue[id] = on; any = true; } }
    if (any) { store.set(QUEUE_KEY, queue); flush(); }
  },

  /** Fetch every game's count (one small, edge-cached request). */
  async load(force = false) {
    if (!this.enabled || (!force && Date.now() - lastLoad < REFRESH_MS)) return;
    lastLoad = Date.now();
    try {
      const r = await fetch(HEARTS_URL + '/counts');
      if (!r.ok) return;
      const next = (await r.json()).counts || {};
      // A count we just got back from our own write is newer than the cached list: keep it a while.
      for (const id in freshAt) if (Date.now() - freshAt[id] < FRESH_MS) next[id] = counts[id] || 0; else delete freshAt[id];
      counts = next; store.set(COUNTS_KEY, counts); changed();
    } catch (_) { /* offline: keep the saved counts */ }
    flush();
  },
};

async function flush() {
  if (flushing || !hearts.enabled) return;
  const ids = Object.keys(queue);
  if (!ids.length) return;
  flushing = true;
  const device = deviceId(), done = [];
  try {
    for (const id of ids) {
      const on = queue[id];
      let r;
      try {
        r = await fetch(HEARTS_URL + '/heart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, game: id, on }) });
      } catch (_) { break; }   // offline: try again later
      if (r.status === 429) break;
      if (r.ok) {
        const { n } = await r.json();
        counts[id] = n; freshAt[id] = Date.now(); done.push(id);
        if (on) sent[id] = true; else delete sent[id];
      } else if (r.status >= 400 && r.status < 500) {
        // Unknown game (e.g. not published yet) or bad request: drop it so it can't block the queue.
      } else break;
      if (queue[id] === on) delete queue[id];
    }
  } finally {
    flushing = false;
    store.set(QUEUE_KEY, queue); store.set(SENT_KEY, sent); store.set(COUNTS_KEY, counts);
    if (done.length) changed(done);
    if (Object.keys(queue).length) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 30_000); }
  }
}

if (hearts.enabled) {
  addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') hearts.load(); });
}
