// The player's progress across every game: credits, wins, best scores, bought items and
// trophies. Saved locally on every change and mirrored to Game Center / Play Games cloud
// saves by services.js.
//
// Saves from several devices must merge without losing credits or wins, so every counter is
// kept per device (a "grow-only counter"): each device only ever raises its own numbers,
// totals are the sum over devices, and merging two saves takes the max of each device's
// numbers. Best scores take the max and trophies the union.
import { store } from '../util.js';

const KEY = 'gs_progress';
const COUNTERS = ['wins', 'plays', 'bought', 'used'];
const blankDev = () => ({ earned: 0, spent: 0, wins: {}, plays: {}, bought: {}, used: {} });
const blank = () => ({ v: 1, bests: {}, trophies: {}, by: {}, updated: 0 });

function deviceId() {
  let id = store.get('gs_device', null);
  if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('gs_device', id); }
  return id;
}

function load() {
  const p = Object.assign(blank(), store.get(KEY, null) || {});
  // One-time import of the best scores the feed saved before this kit existed.
  if (!store.get('gs_progress_migrated', false)) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('gs_best_')) p.bests[k.slice(8)] = Math.max(p.bests[k.slice(8)] || 0, +localStorage.getItem(k) || 0);
      }
    } catch { /* storage unavailable */ }
    store.set('gs_progress_migrated', true);
  }
  return p;
}

const ME = deviceId();
let P = load();
const mine = () => (P.by[ME] ||= blankDev());
const subs = new Set();
function changed() { P.updated = Date.now(); store.set(KEY, P); subs.forEach(f => f(P)); }

// Totals over every device.
const total = f => Object.values(P.by).reduce((a, d) => a + (d[f] || 0), 0);
const totalOf = (f, k) => Object.values(P.by).reduce((a, d) => a + ((d[f] || {})[k] || 0), 0);
const keysOf = f => { const s = new Set(); for (const d of Object.values(P.by)) for (const k in d[f] || {}) if (d[f][k] > 0) s.add(k); return s; };
const bump = (f, k, n = 1) => { const m = mine()[f]; m[k] = (m[k] || 0) + n; };
const itemKey = (gameId, itemId) => gameId + '/' + itemId;

export const progress = {
  get state() { return P; },
  on(f) { subs.add(f); return () => subs.delete(f); },

  get credits() { return total('earned') - total('spent'); },
  earnedTotal: () => total('earned'),
  spentTotal: () => total('spent'),
  best: id => P.bests[id] || 0,
  wins: id => totalOf('wins', id),
  totalWins: () => Object.values(P.by).reduce((a, d) => a + Object.values(d.wins || {}).reduce((x, y) => x + y, 0), 0),
  gamesWon: () => keysOf('wins').size,
  gamesPlayed: () => keysOf('plays').size,
  wonIds: () => keysOf('wins'),

  played(id) { bump('plays', id); changed(); },
  /** Records a best score; returns true when it beats the old one. */
  score(id, n) { if (n <= (P.bests[id] || 0)) return false; P.bests[id] = n; changed(); return true; },
  /** Records a win and pays credits: the game's reward, doubled the first time it is won. */
  win(id, reward) {
    const first = this.wins(id) === 0, paid = reward * (first ? 2 : 1);
    bump('wins', id); mine().earned += paid; changed();
    return { paid, first };
  },

  /** How many of an item the player has ready: a count for boosts, 1 or 0 for unlocks. */
  owned(gameId, item) { const k = itemKey(gameId, item.id); return totalOf('bought', k) - totalOf('used', k); },
  buy(gameId, item) {
    if (this.credits < item.price) return false;
    if (item.kind === 'unlock' && this.owned(gameId, item) > 0) return false;
    bump('bought', itemKey(gameId, item.id)); mine().spent += item.price; changed();
    return true;
  },
  /** Uses up one boost; returns true if there was one. */
  use(gameId, item) {
    if (this.owned(gameId, item) <= 0) return false;
    bump('used', itemKey(gameId, item.id)); changed();
    return true;
  },
  totalBought: () => Object.values(P.by).reduce((a, d) => a + Object.values(d.bought || {}).reduce((x, y) => x + y, 0), 0),

  hasTrophy: id => !!P.trophies[id],
  grant(id) { if (P.trophies[id]) return false; P.trophies[id] = Date.now(); changed(); return true; },

  /** Folds a save from another device (or the cloud) into this one. */
  merge(other) {
    if (!other || typeof other !== 'object') return;
    const max = (a, b = {}) => { for (const k in b) a[k] = Math.max(a[k] || 0, +b[k] || 0); return a; };
    max(P.bests, other.bests);
    for (const k in other.trophies || {}) if (!P.trophies[k]) P.trophies[k] = other.trophies[k];
    for (const id in other.by || {}) {
      const a = (P.by[id] ||= blankDev()), b = other.by[id];
      a.earned = Math.max(a.earned, +b.earned || 0); a.spent = Math.max(a.spent, +b.spent || 0);
      for (const f of COUNTERS) max((a[f] ||= {}), b[f]);
    }
    changed();
  },
  serialize: () => JSON.stringify(P),
  /** Test hook: wipe everything. */
  _reset() { P = blank(); changed(); },
};
