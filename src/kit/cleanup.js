// One place for "stop what the game started". Each kit registers how to stop, pause and resume its
// own things (music, face tracking, motion moves, Tone.js...), and the app calls stopAll() when a
// round ends or the player leaves a game, and pauseAll() / resumeAll() for the pause screen.
// A new kit that starts something only has to register here; the app needs no change.
// Not for games: they get everything through gamescroll.js.

const kits = new Map();

/** register('music', { stop, pause, resume }): any of the three can be left out. */
export function register(name, hooks) { kits.set(name, hooks); }
const run = (what) => { for (const [name, h] of kits) try { h[what]?.(); } catch (e) { console.warn('[cleanup]', name, what, e); } };
export const stopAll = () => run('stop');
export const pauseAll = () => run('pause');
export const resumeAll = () => run('resume');
export const registered = () => [...kits.keys()];

// Owners: things a card made that hold memory outside JavaScript (a physics world lives in the
// physics engine's WebAssembly memory). The app makes and resets each card's game inside
// ownedBy(card, fn), and calls release(card) when the card leaves the feed, so those are freed at
// once instead of whenever the garbage collector gets to them. Held weakly: anything the game
// dropped earlier can still be collected as usual.
let owner = null;
const owned = new WeakMap();
/** Run fn with `o` as the owner of whatever it makes. */
export function ownedBy(o, fn) { const prev = owner; owner = o; try { return fn(); } finally { owner = prev; } }
/** The card being made or reset right now (null outside make() / reset()). */
export const currentOwner = () => owner;
/** Kits call this for something that needs freeing: obj.free() runs when its owner is released. */
export function own(obj) {
  if (!owner) return;
  let l = owned.get(owner); if (!l) owned.set(owner, l = []);
  l.push(typeof WeakRef === 'function' ? new WeakRef(obj) : { deref: () => obj });
}
/**
 * Kits call this for something to undo when the card being made leaves the feed (a sensor
 * subscription, a listener). Unlike own(), fn is held until then. Returns fn, or null outside make()
 * / reset(), when there is no card to tie it to.
 */
export function onRelease(fn) {
  if (!owner) return null;
  let l = owned.get(owner); if (!l) owned.set(owner, l = []);
  const ref = { free: fn }; l.push({ deref: () => ref });
  return fn;
}
/** Free everything `o` owns. */
export function release(o) {
  const l = owned.get(o); if (!l) return;
  owned.delete(o);
  for (const r of l) { const x = r.deref(); if (x) try { x.free(); } catch (e) { console.warn('[cleanup] free', e); } }
}
