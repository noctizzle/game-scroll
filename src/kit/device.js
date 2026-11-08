// Phone features for games: haptics, tilt, shake, compass, microphone and camera.
// (Location is api.location() in make(api): see src/geo.js.)
// Everything degrades gracefully: on web/desktop or when permission is refused, calls are no-ops
// or return null, so every game must also be playable by touch alone.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { store } from '../util.js';

const native = Capacitor.isNativePlatform();

/* ---------- haptics ---------- */
// The player's haptics settings (the Sound & haptics sheet): on/off and strength 'light' | 'normal' |
// 'strong'. Games don't get this object; haptic(), buzz() and canBuzz() follow it.
const STRENGTHS = ['light', 'normal', 'strong'];
export const hapticSettings = {
  on: store.get('gs_haptics', true),
  strength: STRENGTHS.includes(store.get('gs_haptic_strength', 'normal')) ? store.get('gs_haptic_strength', 'normal') : 'normal',
};
/** Change and save haptics settings, e.g. setHaptics({ strength: 'strong' }). */
export function setHaptics(patch) {
  Object.assign(hapticSettings, patch);
  if (!STRENGTHS.includes(hapticSettings.strength)) hapticSettings.strength = 'normal';
  store.set('gs_haptics', !!hapticSettings.on); store.set('gs_haptic_strength', hapticSettings.strength);
}
const VIBE = { tick: 8, light: 12, medium: 22, heavy: 40, success: [15, 60, 25], warning: [30, 50, 30], error: [60, 40, 90] };
const STEPS = ['tick', 'light', 'medium', 'heavy'];
const SCALE = { light: .5, normal: 1, strong: 1.7 };
/** The kind of tap to play once the strength setting is applied (one step softer or harder). */
function shifted(kind) {
  const st = hapticSettings.strength, i = STEPS.indexOf(kind);
  if (st === 'normal') return kind;
  if (i >= 0) return STEPS[Math.max(0, Math.min(3, i + (st === 'strong' ? 1 : -1)))];
  // success / warning / error: a soft single tap on light, the normal pattern on strong
  return st === 'light' ? 'light' : kind;
}
export function haptic(kind = 'light') {
  if (!hapticSettings.on) return;
  kind = shifted(kind);
  try {
    if (native) {
      if (kind === 'tick') return Haptics.selectionChanged();
      if (kind === 'success' || kind === 'warning' || kind === 'error') return Haptics.notification({ type: { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error }[kind] });
      return Haptics.impact({ style: { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }[kind] || ImpactStyle.Light });
    }
    const v = VIBE[kind] ?? 15, k = SCALE[hapticSettings.strength];
    navigator.vibrate?.(Array.isArray(v) ? v.map((ms, j) => j % 2 ? ms : Math.round(ms * k)) : Math.round(v * k));
  } catch { /* no haptics here */ }
}

/** Play a pattern of short (0) and long (1) buzzes. Returns its length in ms. On iPhones a long buzz
 *  is a quick run of taps, since iOS ignores vibration lengths. */
export function buzz(pattern, short = 90, long = 380, gap = 220) {
  let at = 0;
  const style = { light: ImpactStyle.Medium, normal: ImpactStyle.Heavy, strong: ImpactStyle.Heavy }[hapticSettings.strength];
  for (const p of pattern) {
    const d = p ? long : short;
    if (native && hapticSettings.on) { for (let k = 0; k < d; k += 45) setTimeout(() => { try { Haptics.impact({ style }); } catch { /* none */ } }, at + k); }
    at += d + gap;
  }
  if (!native && hapticSettings.on) { const seq = []; pattern.forEach((p, i) => { seq.push(p ? long : short); if (i < pattern.length - 1) seq.push(gap); }); try { navigator.vibrate?.(seq); } catch { /* none */ } }
  return at;
}
/** Can this device vibrate at all (and has the player left haptics on)? Games show a fallback if not. */
export function canBuzz() { return hapticSettings.on && (native || typeof navigator.vibrate === 'function'); }

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
const tiltState = { x: 0, y: 0, ok: false, base: null }, raw = { alpha: null, beta: 0, gamma: 0, t: 0, absT: -1e9, abs: false };
let headingDeg = null, lastAcc = null; const shakeCbs = new Set(); let lastShake = 0, sensorsOn = false;
function startSensors() {
  if (sensorsOn) return; sensorsOn = true;
  addEventListener('deviceorientation', e => {
    if (e.beta == null) return;
    tiltState.beta = e.beta;
    // relative readings only when no compass-locked (absolute) ones are coming in: those don't drift
    if (e.alpha != null && performance.now() - raw.absT > 1000) { raw.alpha = e.alpha; raw.beta = e.beta; raw.gamma = e.gamma; raw.t = performance.now(); raw.abs = false; }
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
  addEventListener('deviceorientationabsolute', e => {
    if (e.alpha == null) return;
    headingDeg = (360 - e.alpha) % 360;
    // Android: the same orientation but locked to the compass, so "straight ahead" can't slowly drift
    if (e.beta != null) { const now = performance.now(); raw.alpha = e.alpha; raw.beta = e.beta; raw.gamma = e.gamma; raw.t = raw.absT = now; raw.abs = true; }
  });
  addEventListener('devicemotion', e => {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    if (lastAcc) {
      const jerk = Math.abs(a.x - lastAcc.x) + Math.abs(a.y - lastAcc.y) + Math.abs(a.z - lastAcc.z);
      const now = performance.now();
      if (jerk > 28 && now - lastShake > 250) { lastShake = now; shakeCbs.forEach(cb => cb(jerk)); }
    }
    lastAcc = { x: a.x, y: a.y, z: a.z };
    if (motionCbs.size) {
      const l = e.acceleration, r = e.rotationRate || {};
      const m = { gx: a.x, gy: a.y, gz: a.z, ax: l?.x ?? null, ay: l?.y ?? null, az: l?.z ?? null, ra: r.alpha || 0, rb: r.beta || 0, rg: r.gamma || 0, dt: (e.interval || 16) > 1 ? (e.interval || 16) / 1000 : e.interval, t: performance.now() };
      motionCbs.forEach(cb => cb(m));
    }
  });
}
if (!window.DeviceMotionEvent?.requestPermission) { /* Android/desktop: no prompt needed */ motionAllowed = true; startSensors(); }

/** Current tilt as {x, y} in -1..1 relative to how the phone was held when play started, or null if no sensor. */
export function tilt() { return tiltState.ok ? { x: tiltState.x, y: tiltState.y } : null; }
/** Make the current phone angle the new "flat". Call from a game's reset(). */
export function calibrateTilt() { tiltState.base = null; }
const motionCbs = new Set();
/**
 * Raw motion readings (kit use: gs.moves turns these into swings, punches and flips). cb gets
 * { gx, gy, gz (m/s² with gravity), ax, ay, az (without gravity, or null), ra, rb, rg (rotation,
 * degrees/s about the phone's z, x and y axes), dt, t }. Returns an unsubscribe function.
 */
export function onMotion(cb) { want('motion'); motionCbs.add(cb); return () => motionCbs.delete(cb); }
/** Subscribe to shakes; returns an unsubscribe function. */
export function onShake(cb) { shakeCbs.add(cb); return () => shakeCbs.delete(cb); }
/** Raw phone orientation for AR (src/kit/ar3d.js): { alpha, beta, gamma } in degrees plus the screen
 *  rotation, or null when there is no live gyro reading. abs: true when it's compass-locked (no drift). */
export function orientation() {
  if (raw.alpha == null || performance.now() - raw.t > 1500) return null;
  return { alpha: raw.alpha, beta: raw.beta, gamma: raw.gamma, abs: raw.abs, screen: (screen.orientation?.angle ?? window.orientation ?? 0) | 0 };
}
/** Compass heading in degrees (0 = north), or null. */
export function heading() { return headingDeg; }
/** True when the phone is lying screen-down, false when not, null with no sensor. */
export function faceDown() { return tiltState.ok ? Math.abs(tiltState.beta) > 120 : null; }

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
