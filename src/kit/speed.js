// Phone class and frame rate, shared by the feed loop (src/main.js) and the 3D kits.
//
// Phone class ('top' | 'mid' | 'low') comes from the graphics chip's name (Adreno 830, Mali-G720,
// Apple GPU...), the phone model where the chip name says too little (iPhones all say "Apple GPU"),
// and the number of CPU cores and memory. It picks the starting quality of 3D games and their frame
// rate:
//
//   3D games (Next Gen, AR):  top 120 fps (where the screen does 120 Hz), mid 60, low 30
//   other games:              the screen's own rate (up to 120), 60 on low phones
//
// The 3D kit can step a game down from there (120 -> 60 -> 30) when the phone can't keep up even
// after lowering its resolution, and it remembers per game where it settled, so the next round
// starts there. Players can pin a rate in Settings (Auto / 120 / 60 / 30 battery saver).
//
// Frame generation (src/kit/framegen.js, Next Gen and AR on WebGPU): where a 3D game runs at half
// the screen's rate (60 fps on a 120 Hz screen), the 3D kit makes a frame for each refresh in
// between, so it moves at the screen's rate. Settings › Graphics: Auto (only when a game can't reach
// the screen's rate), Always (3D games draw half the frames and make the rest: cooler, more detail)
// or Off; and how: blend (between the last two frames, the fewest flaws, shown half a frame later)
// or ahead (half a frame past the newest, no delay). A game can say frameGen: false or 'ahead'.
import { store } from '../util.js';
import { gpuName } from './gpu.js';

const PICK_KEY = 'gs_fps', SETTLE_KEY = 'gs_speed', FG_KEY = 'gs_fg', FG_HOW_KEY = 'gs_fg_how';
const touchy = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

let model = '', klass = null;
/** The graphics chip's name (src/kit/gpu.js reads it once). */
const chip = () => gpuName();
(async () => {
  try { const { Device } = await import('@capacitor/device'); model = String((await Device.getInfo()).model || ''); klass = null; } catch (_) { /* web */ }
})();

/** Sort a phone into 'top' | 'mid' | 'low' from its chip name, model, cores and memory. */
export function classify(name = '', mdl = '', cores = 8, mem = 8, phone = true) {
  const n = name.toLowerCase();
  let k = null, m;
  if ((m = n.match(/adreno[^\d]*(\d{3})/))) { const v = +m[1]; k = v >= 730 ? 'top' : v >= 640 ? 'mid' : 'low'; }
  else if (/immortalis|xclipse/.test(n)) k = 'top';
  else if ((m = n.match(/mali-g(\d+)/))) { const v = +m[1]; k = v >= 715 ? 'top' : v >= 68 && v < 100 ? 'mid' : v >= 600 ? 'mid' : 'low'; }
  else if (/mali|powervr|videocore|sgx/.test(n)) k = 'low';
  else if ((m = mdl.match(/^iPhone(\d+),/))) { const v = +m[1]; k = v >= 15 ? 'top' : v >= 13 ? 'mid' : 'low'; }   // iPhone15,x = iPhone 14 Pro (A16)
  else if ((m = mdl.match(/^iPad(\d+),/))) { const v = +m[1]; k = v >= 13 ? 'top' : v >= 8 ? 'mid' : 'low'; }
  else if (/apple/.test(n)) k = 'mid';
  else if (!phone) k = 'top';   // a desktop or laptop
  if (cores && cores <= 4 || mem && mem <= 3) k = 'low';
  return k || 'mid';
}
/** This phone's class (cached once the model is known). */
export function phoneClass() {
  if (klass) return klass;
  const c = classify(chip(), model, navigator.hardwareConcurrency || 8, navigator.deviceMemory || 8, touchy);
  if (model || !touchy) klass = c;   // on a phone, wait for the model before caching
  return c;
}

/* ---------- the screen's refresh rate ---------- */
// Measured from the gaps between animation frames: the middle of the last 40 gaps.
const gaps = [];
let lastTick = 0, hz = 60;
export function tick(now) {
  const g = now - lastTick; lastTick = now;
  if (g > 4 && g < 40) { gaps.push(g); if (gaps.length > 40) gaps.shift(); }
  if (gaps.length >= 20 && gaps.length % 10 === 0) {
    const s = [...gaps].sort((a, b) => a - b), mid = s[s.length >> 1], f = 1000 / mid;
    hz = f > 130 ? 144 : f > 100 ? 120 : f > 75 ? 90 : 60;
  }
}
/** The screen's refresh rate in Hz (60 until measured). */
export const screenHz = () => hz;

/* ---------- frame rate per game ---------- */
const is3D = def => def && (def.era === 'nextgen' || def.era === 'ar');
let settled = store.get(SETTLE_KEY, {}) || {};
let pick = store.get(PICK_KEY, 'auto');
/** The player's choice in Settings: 'auto', 120, 60 or 30. */
export const fpsPick = () => pick;
export function setFpsPick(v) { pick = v === 'auto' ? 'auto' : +v; store.set(PICK_KEY, pick); }

/** What Auto would choose for this game on this phone, before any stepping down. */
export function autoFps(def) {
  const k = phoneClass();
  if (is3D(def)) return k === 'top' ? 120 : k === 'mid' ? 60 : 30;
  return k === 'low' ? 60 : 120;
}
// the rate a game draws real frames at without frame generation
function realFps(def) {
  let f = pick === 'auto' ? Math.min(autoFps(def), settled[def?.id]?.fps || 999) : pick;
  if (def?.fps) f = Math.min(f, def.fps);
  return Math.max(30, Math.min(f, hz));
}
/** The frame rate a game runs its update and draw at now. Never above the screen's rate; half of it while frame generation fills the rest. */
export function fpsFor(def) {
  return frameGenFor(def) ? hz / 2 : realFps(def);
}

/* ---------- frame generation ---------- */
let fgPick = store.get(FG_KEY, 'auto'), fgHow = store.get(FG_HOW_KEY, 'game');
const fgFailed = new Set();
/** Settings › Graphics: 'auto' | 'always' | 'off'. */
export const frameGenPick = () => fgPick;
export function setFrameGenPick(v) { fgPick = ['auto', 'always', 'off'].includes(v) ? v : 'auto'; store.set(FG_KEY, fgPick); }
/** How frames are made: 'game' (the game's choice, else blend) | 'blend' | 'ahead'. */
export const frameGenHow = () => fgHow;
export function setFrameGenHow(v) { fgHow = ['game', 'blend', 'ahead'].includes(v) ? v : 'game'; store.set(FG_HOW_KEY, fgHow); }
/**
 * Whether the 3D kit makes frames between this game's real ones now: 'blend' | 'ahead' | false.
 * Needs the game's view on WebGPU (speed.gpu, set by the 3D kit), a screen of 100 Hz or more and the
 * game running at about half of it (Auto), or able to (Always). speed.forceFrameGen (tests) skips the checks.
 */
export function frameGenFor(def) {
  if (!is3D(def) || def.frameGen === false) return false;
  const how = fgHow !== 'game' ? fgHow : def.frameGen === 'ahead' ? 'ahead' : 'blend';
  if (speed.forceFrameGen) return speed.forceFrameGen === true ? how : speed.forceFrameGen;
  if (fgPick === 'off' || !speed.gpu || hz < 100 || fgFailed.has(def.id) || pick !== 'auto') return false;   // a pinned rate is what the screen shows
  const half = hz / 2, f = realFps(def);
  // Auto: only a game that can't reach the screen's rate (it settled at 60); Always: any that can do half
  const on = fgPick === 'always' ? f >= half * .8 : f >= half * .8 && f < hz * .9;
  return on ? how : false;
}
/** The 3D kit found the refreshes between real frames didn't come (the phone is too busy): no frame generation for this game until the app restarts. */
export function frameGenFailed(id) { if (id) fgFailed.add(id); }

/** The game on screen (set by the feed), so the 3D kit can remember things per game. */
// offscreen: true while the feed draws a card that isn't the one on screen (one being added below).
// gpu: the 3D kit draws the game on screen with WebGPU (frame generation needs it). between: set by
// the 3D kit after a real frame when it has a made frame to show; the feed calls it on the next
// refresh it skips (src/main.js).
export const speed = { game: null, offscreen: false, gpu: false, between: null, forceFrameGen: null };

/** The 3D kit settled on a tier and frame rate for this game: start there next time. */
export function settle(id, o) {
  if (!id) return;
  const was = settled[id] || {}, now = { ...was, ...o };
  if (was.tier === now.tier && was.fps === now.fps) return;
  settled[id] = now; store.set(SETTLE_KEY, settled);
}
export const settledFor = id => settled[id] || null;
/** The 3D kit can't keep up: step this game's frame rate down one notch (120 -> 60 -> 30). False if it can't. */
export function stepDown(def) {
  if (pick !== 'auto' || !def) return false;
  const f = fpsFor(def), next = f > 60 ? 60 : f > 30 ? 30 : 0;
  if (!next) return false;
  settle(def.id, { fps: next }); return true;
}
/** Try one notch up again (after a long spell of easy frames). False if already at Auto's rate. */
export function stepUp(def) {
  if (pick !== 'auto' || !def) return false;
  const s = settled[def.id]; if (!s?.fps) return false;
  const next = s.fps < 60 ? 60 : 120;
  if (next >= autoFps(def)) { const { fps, ...rest } = s; settled[def.id] = rest; store.set(SETTLE_KEY, settled); } else settle(def.id, { fps: next });
  return true;
}
