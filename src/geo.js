// Location for games: api.location() and api.watchLocation(cb) in make(api).
//
// Privacy rules, enforced here so no game can get around them:
//  - Only a game that declares `location: 'coarse'` or `location: 'precise'` gets the api, and only
//    while a round of it is being played. Before the player taps Play, or after the round, a call
//    gets the stand-in without the phone ever asking. So the permission prompt only appears at
//    play time, for a game the player chose to play.
//  - Positions are rounded before the game sees them: to about 1 km for 'coarse' (the default), and
//    to about 10 m for 'precise' (walk-around games). The exact reading never leaves this file.
//  - When the player said no, turned it off in Settings, or the phone can't find itself, the game
//    gets a stand-in spot ({ real: false }) and must still be playable.
//  - Nothing is stored or sent. (Games can't reach the network anyway: see the CSP in vite.config.js.)
import { Geolocation } from '@capacitor/geolocation';
import { store } from './util.js';

const KEY = 'gs_location_off';   // the player's "Let games use my location" switch (Settings)
/** Grid size in degrees for each level: 0.01° ≈ 1.1 km, 0.0001° ≈ 11 m. */
export const GRID = { coarse: 0.01, precise: 0.0001 };
const METRES = { coarse: 1100, precise: 11 };
/** Where games are told they are when there's no real location: a made-up spot (Null Island, 0°N 0°E). */
export const STAND_IN = Object.freeze({ lat: 0, lon: 0 });

export const geoSettings = {
  get enabled() { return !store.get(KEY, false); },
  set enabled(v) { store.set(KEY, !v); if (!v) stopAll(); },
};

let round = null;                // id of the game whose round is being played, or null
const watches = new Set();       // live watchLocation subscriptions { id, stop() }
let denied = false;              // the player said no this session: don't ask again

/** main.js: a round of game `id` started / ended (ended also covers swiping away). */
export function roundStarted(id) { round = id; }
export function roundEnded(id) { if (id !== undefined && id !== round) return; round = null; stopAll(); }
function stopAll() { for (const w of [...watches]) w.stop(); }

const snap = (v, step) => Math.round(v / step) * step;
function rounded(c, level) {
  const step = GRID[level];
  // toFixed keeps float noise out (0.07 not 0.07000000000000001); more decimals than the grid never appear
  const dp = level === 'precise' ? 4 : 2;
  return { lat: +snap(c.latitude, step).toFixed(dp), lon: +snap(c.longitude, step).toFixed(dp),
    accuracy: Math.max(METRES[level], Math.round(c.accuracy || 0)), real: true, precision: level };
}
const standIn = reason => ({ ...STAND_IN, accuracy: null, real: false, precision: null, reason });

/** Why the game can't have a real location right now, or null when it may ask. */
async function blocked(id) {
  if (round !== id) return 'not-playing';
  if (!geoSettings.enabled) return 'off';
  if (denied) return 'denied';
  try {
    const p = await Geolocation.checkPermissions();
    if (p.location === 'denied' && p.coarseLocation !== 'granted') { denied = true; return 'denied'; }
  } catch { /* no permissions api (some browsers): asking will tell us */ }
  return null;
}
const failReason = e => { const m = String(e?.message || e || ''); if (/denied|permission/i.test(m) || e?.code === 1) { denied = true; return 'denied'; } return 'unavailable'; };

/** The location api for one game. def.location: 'coarse' | 'precise' (anything else: no api). */
export function geoFor(def) {
  const level = def.location === 'precise' ? 'precise' : def.location === 'coarse' ? 'coarse' : null;
  if (!level) {
    const no = () => { console.warn(`[location] ${def.id}: add location: 'coarse' (or 'precise') to the game definition to use it`); };
    return { location: async () => (no(), standIn('undeclared')), watchLocation: cb => (no(), cb(standIn('undeclared')), () => {}) };
  }
  const id = def.id;
  return {
    /** Where the player is, rounded: { lat, lon, accuracy (m), real: true, precision } or the
     *  stand-in { lat: 0, lon: 0, real: false, reason }. Never throws. Waits at most ~8 s. */
    async location() {
      const why = await blocked(id); if (why) return standIn(why);
      try {
        const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: level === 'precise', timeout: 8000, maximumAge: level === 'precise' ? 5000 : 600000 });
        return round === id ? rounded(p.coords, level) : standIn('not-playing');
      } catch (e) { return standIn(failReason(e)); }
    },
    /** Calls cb(position) now and each time the player moves to another grid cell, until the round
     *  ends or the returned stop() is called. Same shape as location(); on failure cb gets the stand-in once. */
    watchLocation(cb) {
      let alive = true, last = '', wid = null;
      const w = { id, stop() { alive = false; watches.delete(w); if (wid != null) Geolocation.clearWatch({ id: wid }).catch(() => {}); wid = null; } };
      const emit = pos => { if (!alive) return; const k = pos.real + ':' + pos.lat + ',' + pos.lon; if (k === last) return; last = k; try { cb(pos); } catch (e) { console.error(e); } };
      watches.add(w);
      blocked(id).then(async why => {
        if (why) return emit(standIn(why));
        if (!alive) return;
        try {
          const got = await Geolocation.watchPosition({ enableHighAccuracy: level === 'precise', timeout: 15000, maximumAge: level === 'precise' ? 3000 : 600000 }, (p, err) => {
            if (round !== id) return w.stop();
            if (err || !p) { const r = failReason(err); if (r === 'denied' || last === '') emit(standIn(r)); if (r === 'denied') w.stop(); return; }
            emit(rounded(p.coords, level));
          });
          if (alive) wid = got; else Geolocation.clearWatch({ id: got }).catch(() => {});
        } catch (e) { emit(standIn(failReason(e))); w.stop(); }
      });
      return () => w.stop();
    },
  };
}

/** Test hook: forget a "no" from earlier in the session. */
export function _resetGeo() { denied = false; round = null; stopAll(); }
