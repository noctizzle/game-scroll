// More phone sensors for games: the step counter (walk to play, idle games that pay for walking),
// air pressure (lift the phone up a floor, blow-free "altitude"), the room's light (dark-room modes,
// cover the light sensor to hide) and proximity (a hand over the top of the phone).
//
//   update(dt) {
//     const s = steps();   if (s) hero.x += s.new * 4;        // null until it's running (and allowed)
//     const p = pressure(); if (p) balloon.y = 300 - p.height * 40;   // metres up since the round started
//     const l = light();   if (l && l.dark) ghosts.show();
//     if (near()) shield.up();
//   }
//
// Each one starts the first time a game reads it and stops when the round ends. Not every phone has
// every sensor: hasSensor('steps') says (null until known), and games keep a touch way to play. In the
// apps they come from the phone-sensors plugin (Android: all four; iPhone: steps and pressure, as
// iPhones keep the light sensor to themselves and proximity turns the screen off). In a browser
// only the light sensor can work (where the browser has AmbientLightSensor). Readings go only to
// the game being played; nothing is kept.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { register } from './cleanup.js';

const native = Capacitor.isNativePlatform();
const plugin = native && Capacitor.isPluginAvailable('PhoneSensors') ? registerPlugin('PhoneSensors') : null;
const KINDS = ['steps', 'pressure', 'light', 'near'];

const avail = { steps: null, pressure: null, light: null, near: null };
const state = {};   // kind -> { on, value, max, t, ... }
let listening = null, webLight = null;

if (plugin) plugin.available().then(a => { for (const k of KINDS) avail[k] = !!a[k]; }, () => { for (const k of KINDS) avail[k] = false; });
else { for (const k of KINDS) avail[k] = false; avail.light = typeof globalThis.AmbientLightSensor === 'function' ? null : false; }

function reading(kind, value, max) {
  const s = state[kind]; if (!s || !s.on) return;
  const now = performance.now();
  if (kind === 'steps') {
    if (value > s.value) { s.marks.push([now, value - s.value]); s.added += value - s.value; }
    while (s.marks.length && now - s.marks[0][0] > 10000) s.marks.shift();
  }
  if (kind === 'pressure' && s.start == null) s.start = value;
  s.value = value; s.max = max; s.t = now; s.ok = true;
}

function start(kind) {
  let s = state[kind];
  if (s && (s.on || s.refused)) return s;
  s = state[kind] = { on: true, ok: false, value: 0, max: 0, t: 0, marks: [], added: 0, read: 0, start: null, refused: false };
  if (avail[kind] === false) { s.on = false; s.refused = true; return s; }
  if (plugin) {
    listening ||= Promise.all([plugin.addListener('reading', e => reading(e.kind, +e.value, +e.max)), plugin.addListener('refused', e => { const x = state[e.kind]; if (x) { x.on = false; x.refused = true; } })]);
    plugin.start({ kind }).catch(() => { s.on = false; s.refused = true; });
  } else if (kind === 'light' && typeof globalThis.AmbientLightSensor === 'function') {
    try {
      webLight = new globalThis.AmbientLightSensor({ frequency: 5 });
      webLight.addEventListener('reading', () => reading('light', webLight.illuminance, 0));
      webLight.addEventListener('error', () => { s.on = false; s.refused = true; avail.light = false; });
      webLight.start(); avail.light = true;
    } catch { s.on = false; s.refused = true; avail.light = false; }
  } else { s.on = false; s.refused = true; }
  return s;
}

/** Stops every sensor (the app does this when a round ends or the player leaves). */
export function stopSensors() {
  for (const k of KINDS) if (state[k]) state[k].on = false;
  for (const k of KINDS) delete state[k];
  if (plugin) plugin.stopAll().catch(() => {});
  if (webLight) { try { webLight.stop(); } catch { /* gone */ } webLight = null; }
}
register('sensors', { stop: stopSensors });

/** Does this phone have the sensor? true / false, or null while it's still being asked. kind: 'steps' | 'pressure' | 'light' | 'near'. */
export function hasSensor(kind) { return KINDS.includes(kind) ? avail[kind] : false; }

/**
 * Steps walked since the round started: { count, new (steps since you last asked), perMinute
 * (over the last 10 s) }, or null until the step counter is running (and the player allowed it).
 * Step counters report in bursts every few seconds: count steps, don't time jumps by them.
 */
export function steps() {
  const s = start('steps'); if (!s.ok) return null;
  const now = performance.now(); while (s.marks.length && now - s.marks[0][0] > 10000) s.marks.shift();
  const fresh = s.added - s.read; s.read = s.added;
  return { count: s.added, new: fresh, perMinute: Math.round(s.marks.reduce((a, m) => a + m[1], 0) * 6) };
}

/**
 * Air pressure: { hPa, height (metres up, + or -, since the round started) }, or null. Good for
 * "lift the phone" games: a floor of a building is about 3 m, and holding the phone up high about 1 m
 * (pressure is noisy at that size, so smooth it and use generous steps).
 */
export function pressure() {
  const s = start('pressure'); if (!s.ok) return null;
  const p0 = s.start || s.value;
  return { hPa: s.value, height: 44330 * (1 - Math.pow(s.value / p0, 1 / 5.255)) };
}

/** The room's light: { lux, dark (under about 10 lux) }, or null. */
export function light() {
  const s = start('light'); if (!s.ok) return null;
  return { lux: s.value, dark: s.value < 10 };
}

/** Is something (a hand, a cheek) right over the top of the phone? true / false, or null without a proximity sensor. */
export function near() {
  const s = start('near'); if (!s.ok) return null;
  return s.max > 0 ? s.value < Math.min(3, s.max * .5) : s.value < 1;
}
