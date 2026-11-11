// Real-world signals as game inputs: where the sun and the moon are for the player right now, the
// battery, and whether headphones are in. All of it is worked out on the phone (the sun and moon by
// SunCalc's maths); nothing is sent anywhere and none of it needs a permission.
//
//   const { sun, moon, battery, headphones } = gs.real;
//   reset() { night = !sun().up; }                       // dark outside? the level starts at night
//   update() { if (battery().charging) hero.heal(dt); }  // plug the phone in to charge the hero
//   if (headphones()) whisper(); else shout();
//
// sun(place) and moon(place): place is a { lat, lon } from api.location(). Without one they guess
// where the player is from the phone's clock and time zone, which is right about day and night and
// rough about the exact angle (the result says guess: true). Angles are in degrees: `compass` runs
// clockwise from north like gs.device.heading() and gs.geo.bearing(), `height` is up from the horizon.
// These are for flavour and for play that is as fair at night as by day: never the only way to win.
import { getPosition, getTimes, getMoonPosition, getMoonIllumination } from 'suncalc';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { power } from './power.js';

const clamp01 = v => Math.max(0, Math.min(1, v));
const asDate = when => when instanceof Date ? when : new Date(when ?? Date.now());

/** Where the phone probably is, from its time zone: good enough to tell day from night. */
export function guessPlace(when) {
  const d = asDate(when), y = d.getFullYear();
  // minutes east of Greenwich in winter time (summer time would put the phone 15 degrees too far east)
  const east = Math.min(-new Date(y, 0, 1).getTimezoneOffset(), -new Date(y, 6, 1).getTimezoneOffset());
  let zone = ''; try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* no zone name here */ }
  const south = /^(Australia|Antarctica)\/|Auckland|Fiji|Sao_Paulo|Argentina|Buenos_Aires|Santiago|Montevideo|Asuncion|La_Paz|Lima|Johannesburg|Maputo|Harare|Windhoek|Lusaka|Jakarta|Tongatapu|Apia|Tahiti|Noumea/.test(zone);
  const tropics = /Singapore|Kuala_Lumpur|Bangkok|Manila|Ho_Chi_Minh|Kolkata|Colombo|Dubai|Lagos|Nairobi|Accra|Bogota|Caracas|Panama|Mexico_City|Honolulu/.test(zone);
  return { lat: south ? -30 : tropics ? 12 : 42, lon: Math.max(-180, Math.min(180, east / 4)), guess: true };
}
const where = (place, d) => place && Number.isFinite(place.lat) && Number.isFinite(place.lon) ? { lat: place.lat, lon: place.lon, guess: false } : guessPlace(d);
// the hour on the phone's own clock (6.5 = half past six), or null
const clock = t => t instanceof Date && !Number.isNaN(+t) ? t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600 : null;

/**
 * The sun for the player right now (or at `when`: a Date or a time in ms).
 * up: above the horizon. height: degrees above it (below is negative). compass: degrees clockwise
 * from north. light: 0 at night to 1 in full day, smooth through dawn and dusk. part: 'night',
 * 'dawn', 'day' or 'dusk'. rise, set, noon: hours on the phone's clock (null where the sun doesn't
 * rise or set today). hour: the hour for gs.sky's Sky so its sky matches the real one (6 at sunrise,
 * 12 with the sun highest, 18 at sunset). guess: true when no place was given.
 */
export function sun(place, when) {
  const d = asDate(when), p = where(place, d), pos = getPosition(d, p.lat, p.lon), t = getTimes(d, p.lat, p.lon);
  const up = pos.altitude > -.833, morning = d < t.solarNoon;
  const light = clamp01((pos.altitude + 6) / 12), smooth = light * light * (3 - 2 * light);
  const part = pos.altitude >= 6 ? 'day' : pos.altitude <= -6 ? 'night' : morning ? 'dawn' : 'dusk';
  // the sky's hour: sunrise is 6, the sun's highest is 12, sunset is 18, and the night fills the rest
  const noon = +t.solarNoon, rise = t.sunrise ? +t.sunrise : noon - 6 * 36e5, set = t.sunset ? +t.sunset : noon + 6 * 36e5, now = +d, DAY = 864e5;
  let hour;
  if (t.alwaysUp) hour = 12 + clamp01((now - noon) / (DAY / 2) * .5 + .5) * 6 - 3;       // polar day: stays between 9 and 15
  else if (t.alwaysDown) hour = now < noon ? 2 : 22;
  else if (now >= rise && now <= noon) hour = 6 + 6 * (now - rise) / Math.max(1, noon - rise);
  else if (now > noon && now <= set) hour = 12 + 6 * (now - noon) / Math.max(1, set - noon);
  else if (now > set) hour = 18 + 12 * clamp01((now - set) / Math.max(1, rise + DAY - set));
  else hour = 6 - 12 * clamp01((rise - now) / Math.max(1, rise - (set - DAY)));
  return { up, height: pos.altitude, compass: pos.azimuth, light: smooth, part, rise: clock(t.sunrise), set: clock(t.sunset), noon: clock(t.solarNoon), hour: ((hour % 24) + 24) % 24, guess: p.guess };
}

const MOON = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter', 'waning crescent'];
/**
 * The moon for the player right now (or at `when`). phase: 0 new, .25 first quarter, .5 full, .75
 * last quarter. lit: how much of its face is lit, 0 to 1. name: 'new', 'waxing crescent', 'first
 * quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter' or 'waning crescent'.
 * up, height, compass: as for the sun. The phase is the same everywhere, so it is never a guess;
 * where the moon is in the sky is (guess: true) when no place was given.
 */
export function moon(place, when) {
  const d = asDate(when), p = where(place, d), pos = getMoonPosition(d, p.lat, p.lon), ill = getMoonIllumination(d);
  return { phase: ill.phase, lit: ill.fraction, waxing: ill.waxing, name: MOON[Math.round(ill.phase * 8) % 8], up: pos.altitude > 0, height: pos.altitude, compass: pos.azimuth, guess: p.guess };
}

/**
 * The phone's battery: level 0 to 1, charging true or false (both null where the phone won't say),
 * and saver: its power saving mode is on. Read about every 15 seconds.
 */
export function battery() {
  return { level: power.known ? power.level : null, charging: power.known ? power.charging : null, saver: !!power.saver };
}

/* ---------- headphones ---------- */
const native = Capacitor.isNativePlatform();
const plugin = native && Capacitor.isPluginAvailable('PhoneSensors') ? registerPlugin('PhoneSensors') : null;
const out = { on: null, kind: null, at: -1e9, asking: false, watching: false };
const EARS = /head(phone|set)|ear(bud|phone|pod)|airpod|buds|hands-?free|bluetooth/i;

/** What a browser's list of sound outputs says: true, false, or null when it gives no names (exported for tests). */
export function readOutputs(list) {
  const outs = (list || []).filter(d => d.kind === 'audiooutput');
  if (!outs.length || outs.every(d => !d.label)) return null;
  return outs.some(d => EARS.test(d.label));
}
async function ask() {
  if (out.asking) return; out.asking = true;
  try {
    if (plugin) { const o = await plugin.output(); out.on = !!o.headphones; out.kind = o.kind || null; }
    else if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      out.on = readOutputs(await navigator.mediaDevices.enumerateDevices()); out.kind = null;
      if (!out.watching) { out.watching = true; navigator.mediaDevices.addEventListener?.('devicechange', () => { out.at = -1e9; }); }
    }
  } catch { out.on = null; /* an older app, or a browser that won't say */ }
  out.asking = false;
}
/**
 * Is the sound going to headphones? true, false, or null when the phone won't say (most browsers,
 * and the first moment after it is first asked). Wired, USB and Bluetooth all count; a Bluetooth
 * speaker can't be told from Bluetooth headphones. Asked again every few seconds while a game reads it.
 */
export function headphones() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - out.at > 3000) { out.at = now; ask(); }
  return out.on;
}
