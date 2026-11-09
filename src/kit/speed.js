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
// Frame generation (src/kit/framegen.js, Next Gen and AR on WebGPU): where a 3D game runs below the
// screen's rate (60 fps on a 120 or 90 Hz screen, 30 on 120...), the 3D kit makes a frame for each
// refresh in between, so it moves at the screen's rate. Settings › Frame generation: Auto (a game that
// can't reach the screen's rate; and any 3D game while the phone is warm, saving power or low on battery,
// or for a moment while frames come late), Always (3D games draw half the frames and make the rest:
// cooler, more detail) or Off; and how: blend (between the last two frames, the fewest flaws, shown a
// refresh later) or ahead (past the newest, no delay). A game can say frameGen: false or 'ahead'; on a
// phone where blend's refreshes are too full for a game, that game switches itself to ahead.
import { store } from '../util.js';
import { gpuName } from './gpu.js';
import { power } from './power.js';

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
// 'auto' or a pinned rate; anything else saved (a bad write) counts as Auto
const okPick = v => [120, 60, 30].includes(+v) ? +v : 'auto';
let pick = okPick(store.get(PICK_KEY, 'auto'));
/** The player's choice in Settings: 'auto', 120, 60 or 30. */
export const fpsPick = () => pick;
export function setFpsPick(v) { pick = okPick(v); store.set(PICK_KEY, pick); }

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
/** The frame rate a game runs its update and draw at now. Never above the screen's rate; lower while frame generation fills the rest. */
export function fpsFor(def) {
  return (frameGenFor(def) && fgRate(def)) || realFps(def);
}
/** Refreshes per real frame while frame generation is on (2 at 60 fps on 120 Hz, 1.5 on 90 Hz, 4 at 30 fps on 120 Hz). */
export const frameGenSteps = def => hz / fpsFor(def);

/* ---------- frame generation ---------- */
let fgPick = store.get(FG_KEY, 'auto'), fgHow = store.get(FG_HOW_KEY, 'game');
const fgFailed = new Set();
/** Settings › Frame generation: 'auto' | 'always' | 'off'. */
export const frameGenPick = () => fgPick;
export function setFrameGenPick(v) { fgPick = ['auto', 'always', 'off'].includes(v) ? v : 'auto'; store.set(FG_KEY, fgPick); }
/** How frames are made: 'game' (the game's choice, else blend) | 'blend' | 'ahead'. */
export const frameGenHow = () => fgHow;
export function setFrameGenHow(v) { fgHow = ['game', 'blend', 'ahead'].includes(v) ? v : 'game'; store.set(FG_HOW_KEY, fgHow); }
// screens frame generation fills: 90 Hz and up (60 fps on 90 Hz is one or two refreshes a frame)
const FG_HZ = 90;
/* Battery and heat (src/kit/power.js): in Auto, while the phone is warm, in its power saving mode or low on
   battery and not charging, every 3D game draws half the frames and makes the rest. */
export const fgSaving = () => fgPick === 'auto' && power.saving;
/* Stutter shield: a game drawing every refresh whose frames start coming late (two late in a second)
   gets frame generation at once, for two seconds after the last late one, so the refreshes it would
   miss show made frames instead of the same frame twice. src/main.js reports the late frames. */
const late = [];
let shieldUntil = 0;
export function frameLate(now) {
  late.push(now); while (late.length && now - late[0] > 1000) late.shift();
  if (late.length >= 2) shieldUntil = now + 2000;
}
const shieldOn = () => typeof performance !== 'undefined' && performance.now() < shieldUntil;
// the real frame rate with frame generation on (0: it isn't)
function fgRate(def) {
  const f = realFps(def);
  // Auto: a game that can't reach the screen's rate (it settled lower); Always, saving power or riding
  // out a busy spell: half the screen's rate (or the game's own, if lower)
  const real = fgPick === 'always' || fgSaving() || shieldOn() ? Math.min(f, hz / 2) : f < hz * .9 ? f : 0;
  // at least 25 real frames a second, and at least half a refresh between them to fill
  return real >= 25 && hz / real >= 1.4 ? real : 0;
}
/** Frame generation could come on for this game here (the 3D kit then has the scene write motion, so it can start without a rebuild). */
export function frameGenReady(def) {
  if (!is3D(def) || def.frameGen === false) return false;
  return !!speed.forceFrameGen || (fgPick !== 'off' && hz >= FG_HZ && pick === 'auto' && !fgFailed.has(def.id));
}
/**
 * Whether the 3D kit makes frames between this game's real ones now: 'blend' | 'ahead' | false.
 * Needs the game's view on WebGPU (speed.gpu, set by the 3D kit), a screen of 90 Hz or more and the
 * game running below it (Auto), or able to (Always, saving power, the stutter shield). speed.forceFrameGen (tests) skips the checks.
 */
export function frameGenFor(def) {
  if (!is3D(def) || def.frameGen === false) return false;
  const how = fgHow !== 'game' ? fgHow : def.frameGen === 'ahead' || settled[def.id]?.fgHow === 'ahead' ? 'ahead' : 'blend';
  if (speed.forceFrameGen) return speed.forceFrameGen === true ? how : speed.forceFrameGen;
  if (fgPick === 'off' || !speed.gpu || hz < FG_HZ || fgFailed.has(def.id) || pick !== 'auto') return false;   // a pinned rate is what the screen shows
  return fgRate(def) ? how : false;
}
/**
 * The 3D kit found blend's refreshes too full for this game on this phone (the made frame shares the
 * real frame's refresh): from now on it makes them ahead (its work is spread over both). False if it
 * can't switch (already ahead, or the player picked how).
 */
export function frameGenPace(id) {
  if (!id || fgHow !== 'game' || settled[id]?.fgHow === 'ahead') return false;
  settle(id, { fgHow: 'ahead' }); return true;
}
/** One line for Settings: whether the game on screen makes frames in between now, and if not, why. */
export function frameGenStatus(def) {
  const name = def?.title || 'This game';
  if (!def || !is3D(def)) return 'Only Next Gen and AR games use it; the game on screen isn’t one.';
  if (def.frameGen === false) return `${name} turns it off.`;
  if (fgPick === 'off') return 'Off.';
  if (pick !== 'auto') return `Off while Frame rate is set to ${pick}: set it to Auto.`;
  if (hz < FG_HZ) return `Off: this screen runs at ${hz} Hz, so there are no refreshes in between to fill.`;
  if (!speed.gpu) return `Off: ${name} draws with WebGL here (an effect it uses isn’t ready for WebGPU).`;
  if (fgFailed.has(def.id)) return `Off for ${name} until the app restarts: the phone was too busy for the frames in between.`;
  const how = frameGenFor(def);
  if (how) {
    const real = Math.round(fpsFor(def)), why = fgPick === 'always' ? '' : shieldOn() ? ', riding out a busy moment' : fgSaving() ? `, ${power.why || 'saving power'}` : '';
    return `${name}: draws ${real} frames a second and makes ${Math.round(hz - real)} more (${how}${why}).`;
  }
  const f = realFps(def);
  return f >= hz * .9 ? `${name} already draws ${Math.round(f)} frames a second, the screen’s rate, so Auto leaves it (until the phone is warm or low on battery). Pick Always to try it.`
    : `${name} runs at ${Math.round(f)} frames a second here, too few to fill in between.`;
}
/** The 3D kit found the refreshes between real frames didn't come (the phone is too busy): no frame generation for this game until the app restarts. */
export function frameGenFailed(id) { if (id) fgFailed.add(id); }

/** The game on screen (set by the feed), so the 3D kit can remember things per game. */
// offscreen: true while the feed draws a card that isn't the one on screen (one being added below).
// gpu: the 3D kit draws the game on screen with WebGPU (frame generation needs it). between: set by
// the 3D kit after a real frame when it has a made frame to show; the feed calls it on the next
// refresh it skips (src/main.js).
// busy(): the feed is moving or under a finger; playing(): a round is being played. Both set by the
// feed (src/main.js): the 3D kit keeps heavy work it can put off (card pictures) out of those moments.
// inputAt: when a finger, key or pad last moved the game on screen (performance.now(), set by the feed).
// shield: the stutter shield is on (frameLate()).
export const speed = { game: null, offscreen: false, gpu: false, between: null, forceFrameGen: null, inputAt: 0, busy: () => false, playing: () => false };
Object.defineProperty(speed, 'shield', { get: shieldOn });

/** The 3D kit settled on a tier and frame rate for this game: start there next time. */
export function settle(id, o) {
  if (!id) return;
  const was = settled[id] || {}, now = { ...was, ...o };
  if (was.tier === now.tier && was.fps === now.fps && was.lvl === now.lvl && was.fgHow === now.fgHow) return;
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
