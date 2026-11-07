// Maths for location games: how far, which way, a step in metres, and a stable id for the area the
// player is in (to seed a level from where they are). Works on the { lat, lon } that api.location()
// and api.watchLocation() give, including the stand-in, so a game can "walk" the stand-in by touch.
//
//   import { distance, bearing, offset, cellId } from '../kit/geo.js';
const R = 6371000, rad = Math.PI / 180;

/** Metres between two { lat, lon } points (great-circle). */
export function distance(a, b) {
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass direction from a to b in degrees (0 = north, 90 = east). */
export function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

/** The point `east` and `north` metres from p (negative for west / south). Fine for game-sized steps. */
export function offset(p, east, north) {
  const lat = p.lat + north / R / rad;
  const lon = p.lon + east / (R * Math.cos(p.lat * rad)) / rad;
  return { ...p, lat, lon: ((lon + 540) % 360) - 180 };
}

/** { x: metres east, y: metres north } of p from an origin: for drawing nearby things on screen. */
export function toLocal(origin, p) {
  return { x: (p.lon - origin.lon) * rad * R * Math.cos(origin.lat * rad), y: (p.lat - origin.lat) * rad * R };
}

/** Whole-number id of the square of about `metres` that p is in. The same place gives the same id
 *  on every phone, so it seeds a level ("what spawns here today"). Use metres ≥ the precision you get. */
export function cellId(p, metres = 1000) {
  const step = metres / 111000;
  const y = Math.floor(p.lat / step), x = Math.floor(p.lon / step);
  return (Math.imul(y | 0, 73856093) ^ Math.imul(x | 0, 19349663)) >>> 0;
}
