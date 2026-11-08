// The player's comfort setting, applied by the kits so every game respects it without doing
// anything: "Reduce motion" (in the Sound & haptics sheet) softens screen shake, flashes and camera
// kicks. Games can read it (gs.prefs.reduceMotion, gs.prefs.motion) to tone down their own effects;
// only the app changes it.
import { store } from '../util.js';

const osReduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const state = { reduceMotion: store.get('gs_reduce_motion', null) ?? osReduce() };

/** What games see: read-only. */
export const prefs = Object.freeze({
  get reduceMotion() { return state.reduceMotion; },
  /** How much of a shake, flash or kick to use: 1 normally, small with reduce motion on. */
  get motion() { return state.reduceMotion ? .25 : 1; },
});

/** App only (the Sound & haptics sheet): the setting and a setter that saves it. */
export const prefSettings = { get reduceMotion() { return state.reduceMotion; } };
export function setPrefs({ reduceMotion } = {}) {
  if (reduceMotion != null) { state.reduceMotion = !!reduceMotion; store.set('gs_reduce_motion', state.reduceMotion); }
}
