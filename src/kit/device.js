// Phone features for games: haptics, tilt, shake, compass, GPS location and microphone.
// Everything degrades gracefully: on web/desktop or when permission is refused, calls are no-ops
// or return null, so every game must also be playable by touch alone.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Geolocation } from '@capacitor/geolocation';

const native = Capacitor.isNativePlatform();

/* ---------- haptics ---------- */
const VIBE = { tick: 8, light: 12, medium: 22, heavy: 40, success: [15, 60, 25], warning: [30, 50, 30], error: [60, 40, 90] };
export function haptic(kind = 'light') {
  try {
    if (native) {
      if (kind === 'tick') return Haptics.selectionChanged();
      if (kind === 'success' || kind === 'warning' || kind === 'error') return Haptics.notification({ type: { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[kind] });
      return Haptics.impact({ style: { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[kind] || ImpactStyle.Light });
    }
    navigator.vibrate?.(VIBE[kind] ?? 15);
  } catch { /* no haptics here */ }
}

/** Play a pattern of short (0) and long (1) buzzes. Returns its length in ms. On iPhones a long buzz
 *  is a quick run of taps, since iOS ignores vibration lengths. */
export function buzz(pattern, short = 90, long = 380, gap = 220) {
  let at = 0;
  for (const p of pattern) {
    const d = p ? long : short;
    if (native) { for (let k = 0; k < d; k += 45) setTimeout(() => { try { Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* none */ } }, at + k); }
    at += d + gap;
  }
  if (!native) { const seq = []; pattern.forEach((p, i) => { seq.push(p ? long : short); if (i < pattern.length - 1) seq.push(gap); }); try { navigator.vibrate?.(seq); } catch { /* none */ } }
  return at;
}
/** Can this device vibrate at all? */
export function canBuzz() { return native || typeof navigator.vibrate === 'function'; }

/* ---------- permissions that need a user gesture (iOS motion) ---------- */
// Games call want('motion') when created; the request fires on the player's next tap (the Play tap).
const wanted = new Set(); let motionAllowed = null;
export function want(feature) { wanted.add(feature); }
async function onGesture() {
  if (wanted.has('motion') && motionAllowed === null) {
    try {
      const req = window.DeviceMotionEvent?.requestPermission, req2 = window.DeviceOrientationEvent?.requestPermission;
      if (req) { const r = await req(); motionAllowed = r === 'granted'; if (req2) await req2(); } else motionAllowed = true;
    } catch { motionAllowed = false; }
    if (motionAllowed) startSensors();
  }
}
addEventListener('pointerup', onGesture, true);

/* ---------- motion sensors: tilt, shake, compass ---------- */
const tiltState = { x: 0, y: 0, ok: false, base: null };
let headingDeg = null, lastAcc = null; const shakeCbs = new Set(); let lastShake = 0, sensorsOn = false;
function startSensors() {
  if (sensorsOn) return; sensorsOn = true;
  addEventListener('deviceorientation', e => {
    if (e.beta == null) return;
    tiltState.beta = e.beta;
    // Use landscape-aware axes so tilt feels right when the phone or an unfolded foldable is sideways.
    const ang = (screen.orientation?.angle ?? window.orientation ?? 0) | 0;
    let x = e.gamma, y = e.beta;
    if (ang === 90) { x = e.beta; y = -e.gamma; } else if (ang === -90 || ang === 270) { x = -e.beta; y = e.gamma; }
    if (!tiltState.base) tiltState.base = { x, y };
    tiltState.x = Math.max(-1, Math.min(1, (x - tiltState.base.x) / 30));
    tiltState.y = Math.max(-1, Math.min(1, (y - tiltState.base.y) / 30));
    tiltState.ok = true;
    if (e.webkitCompassHeading != null) headingDeg = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) headingDeg = (360 - e.alpha) % 360;
  });
  addEventListener('deviceorientationabsolute', e => { if (e.alpha != null) headingDeg = (360 - e.alpha) % 360; });
  addEventListener('devicemotion', e => {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    if (lastAcc) {
      const jerk = Math.abs(a.x - lastAcc.x) + Math.abs(a.y - lastAcc.y) + Math.abs(a.z - lastAcc.z);
      const now = performance.now();
      if (jerk > 28 && now - lastShake > 250) { lastShake = now; shakeCbs.forEach(cb => cb(jerk)); }
    }
    lastAcc = { x: a.x, y: a.y, z: a.z };
  });
}
if (!window.DeviceMotionEvent?.requestPermission) { /* Android/desktop: no prompt needed */ motionAllowed = true; startSensors(); }

/** Current tilt as {x, y} in -1..1 relative to how the phone was held when play started, or null if no sensor. */
export function tilt() { return tiltState.ok ? { x: tiltState.x, y: tiltState.y } : null; }
/** Make the current phone angle the new "flat". Call from a game's reset(). */
export function calibrateTilt() { tiltState.base = null; }
/** Subscribe to shakes; returns an unsubscribe function. */
export function onShake(cb) { shakeCbs.add(cb); return () => shakeCbs.delete(cb); }
/** Compass heading in degrees (0 = north), or null. */
export function heading() { return headingDeg; }
/** True when the phone is lying screen-down, false when not, null with no sensor. */
export function faceDown() { return tiltState.ok ? Math.abs(tiltState.beta) > 120 : null; }

/* ---------- GPS ---------- */
let locCache = null;
/** Rough location {lat, lon} or null if unavailable/refused. Cached for the session. */
export async function location() {
  if (locCache) return locCache;
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    return locCache = { lat: p.coords.latitude, lon: p.coords.longitude };
  } catch { return null; }
}

/* ---------- microphone ---------- */
let mic = null;
/** Start listening. Resolves to { level() -> 0..1, stop() } or null if refused. Call from a tap. */
export async function startMic() {
  if (mic) return mic;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
    an.fftSize = 512; src.connect(an); const buf = new Uint8Array(an.fftSize);
    mic = {
      level() { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d; } return Math.min(1, Math.sqrt(s / buf.length) * 4); },
      stop() { stream.getTracks().forEach(t => t.stop()); ctx.close(); mic = null; },
    };
    return mic;
  } catch { return null; }
}
export function stopMic() { mic?.stop(); }

/* ---------- camera ---------- */
let cam = null;
/** Start the back camera. Resolves to { video, stop() } (video is a playing <video>) or null if refused. */
export async function startCamera() {
  if (cam) return cam;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = stream; await video.play();
    cam = { video, stop() { stream.getTracks().forEach(t => t.stop()); cam = null; } };
    return cam;
  } catch { return null; }
}
export function stopCamera() { cam?.stop(); }
