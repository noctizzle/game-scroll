// Fixed game tick. A game that sets `tick: 60` in its definition gets update(1/60) called a whole
// number of times each frame, whatever the screen's rate (30, 60, 90 or 120 fps), so a jump, a
// spawn timer or a physics stack plays the same on every phone and a recorded run replays exactly.
// The frame shows the moment between two ticks: draw(c, alpha) gets how far along it is (0..1),
// and the kits use it too (Physics things' sx / sy / sangle, World3D({ smooth: true }) meshes).
//
//   export default { ..., tick: 60, make }
//   draw(c, alpha) { const x = gs.tick.mix(ball.lastX, ball.x); ... }
//
// Games read gs.tick; only the app (src/main.js) moves it on.
import { currentOwner } from './cleanup.js';

const state = { rate: 0, alpha: 1, card: null, steps: 0 };
const hooks = new WeakMap();   // card -> Set of weak refs to things with blend(alpha) (World3D smooth meshes)

/** Ticks per second a definition asks for: 0 (off) or 10..240. `true` means 60. */
export function tickRate(def) {
  const t = def && def.tick;
  if (t === true) return 60;
  const n = Number(t);
  return n >= 10 && n <= 240 ? Math.round(n) : 0;
}

/** What games see: read-only. */
export const tick = Object.freeze({
  /** Ticks per second for the game being played, or 0 when it runs one update per frame. */
  get rate() { return state.rate; },
  /** True when the game runs on a fixed tick. */
  get on() { return state.rate > 0; },
  /** Seconds in one tick (1 / rate), or 0 when off. */
  get dt() { return state.rate ? 1 / state.rate : 0; },
  /** Where the frame being drawn is between the last two ticks: 0 the one before, 1 the newest (always 1 when off). */
  get alpha() { return state.alpha; },
  /** Ticks since the round started: a steady clock for replays and timers. */
  get count() { return state.steps; },
  /** The value to draw between where it was before the last tick and where it is now. */
  mix(before, now, alpha = state.alpha) { return before + (now - before) * alpha; },
  /** The same for angles (radians), turning the short way round. */
  turn(before, now, alpha = state.alpha) {
    let d = (now - before) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    return before + d * alpha;
  },
});

/**
 * Kits: call obj.blend(alpha) before each frame of the card being made right now is drawn (World3D
 * puts its meshes between ticks). Held weakly, so a world from an earlier round can still be
 * collected. Returns false outside make() / reset().
 */
export function onBlend(obj) {
  const card = currentOwner(); if (!card) return false;
  let set = hooks.get(card); if (!set) hooks.set(card, set = new Set());
  set.add(typeof WeakRef === 'function' ? new WeakRef(obj) : { deref: () => obj }); return true;
}

/* ---------- app only (src/main.js) ---------- */

/** Most ticks one frame may run: after a long hitch the game slows down rather than freezing to catch up. */
export const MAX_STEPS = 8;

/**
 * Runs a card's updates for a frame of `dt` seconds. Fixed tick: whole ticks, run just far enough
 * that the game is at or a little past "now" (so the frame never shows the past: no added delay),
 * the rest carried to the next frame; otherwise one update(dt). nominal: the frame's planned length
 * (1 / fps): a frame a little early or late counts as exactly that, so a 60 fps game on a 60 tick
 * runs one update every frame instead of now and then none and then two. Returns the updates run.
 */
export function runTicks(card, rate, dt, update, nominal = 0) {
  state.card = card; state.rate = rate;
  if (!rate) { state.alpha = 1; update(dt); return 1; }
  const h = 1 / rate;
  if (nominal && Math.abs(dt - nominal) < nominal * .3) dt = nominal;
  card.tickLeft = (card.tickLeft || 0) + dt;
  let n = 0;
  while (card.tickLeft > 1e-7 && n < MAX_STEPS) { card.tickLeft -= h; state.steps++; update(h); n++; }
  if (card.tickLeft > 1e-7) card.tickLeft = 0;   // too far behind: let it go
  // the game is now up to tickLeft (<= 0) seconds ahead: draw that far back from its newest tick
  state.alpha = alphaOf(card, rate);
  return n;
}
const alphaOf = (card, rate) => rate ? Math.min(1, Math.max(0, 1 + (card.tickLeft || 0) * rate)) : 1;

/** Before drawing a card: its alpha, and its kits' meshes put between ticks. */
export function beforeDraw(card, rate) {
  if (state.card !== card) { state.card = card; state.rate = rate; state.alpha = alphaOf(card, rate); }
  const set = hooks.get(card);
  if (set) for (const r of set) { const o = r.deref(); if (!o) { set.delete(r); continue; } try { o.blend(state.alpha); } catch (e) { console.warn('[tick]', e); } }
  return state.alpha;
}

/** A new round: the tick clock starts again. */
export function resetTicks(card) { card.tickLeft = 0; state.steps = 0; if (state.card === card) state.alpha = 1; }
