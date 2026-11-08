// The player's comfort settings, applied by the kits so every game respects them without doing
// anything: "Reduce motion" softens screen shake, flashes and camera kicks, and "Aim assist" sets
// how much help AimAssist gives by default. Games can read them (gs.prefs.reduceMotion,
// gs.prefs.aimAssist) to tone down their own effects; only the app's Settings sheet changes them.
import { store } from '../util.js';

const osReduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const AIM = { off: 0, low: .5, normal: 1, high: 1.5 };

const state = {
  reduceMotion: store.get('gs_reduce_motion', null) ?? osReduce(),
  aim: AIM[store.get('gs_aim_assist', 'normal')] != null ? store.get('gs_aim_assist', 'normal') : 'normal',
};

/** What games see: read-only. */
export const prefs = Object.freeze({
  get reduceMotion() { return state.reduceMotion; },
  /** How strong aim assist is: 0 (off) to 1.5; 1 is normal. */
  get aimAssist() { return AIM[state.aim]; },
  /** How much of a shake, flash or kick to use: 1 normally, small with reduce motion on. */
  get motion() { return state.reduceMotion ? .25 : 1; },
});

/** App only (Settings): the raw picks and a setter that saves them. */
export const prefSettings = { get reduceMotion() { return state.reduceMotion; }, get aim() { return state.aim; }, AIM_LEVELS: Object.keys(AIM) };
export function setPrefs({ reduceMotion, aim } = {}) {
  if (reduceMotion != null) { state.reduceMotion = !!reduceMotion; store.set('gs_reduce_motion', state.reduceMotion); }
  if (aim != null && AIM[aim] != null) { state.aim = aim; store.set('gs_aim_assist', aim); }
}
