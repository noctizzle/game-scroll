// Bridge to the NativeAR plugin (plugins/native-ar): ARKit on iPhone, ARCore on Android.
// The native camera view sits behind a see-through page; this module passes its pose, planes and
// light to whichever ARView is live. Used by ar3d.js, and by the feed to hide walk-around games.
import { Capacitor, registerPlugin } from '@capacitor/core';

const has = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativeAR');
const AR = has ? registerPlugin('NativeAR') : null;

let probe = null, supported = null, sink = null, listening = false;

/** Ask once whether this phone can do native AR. Resolves true / false. */
export function nativeARProbe() {
  if (!AR) { supported = false; return Promise.resolve(false); }
  return probe ||= AR.available().then(r => (supported = !!r?.supported), () => (supported = false));
}
/** true / false once known, null while still asking (or never asked). */
export const nativeARSupported = () => supported;

function listen() {
  if (listening) return; listening = true;
  AR.addListener('frame', d => sink?.frame(d));
  AR.addListener('planes', d => sink?.planes(d.planes || []));
}

/** Start native AR for one view ({ frame(d), planes(list) }). Resolves { started, reason }. */
export async function nativeStart(view) {
  if (!AR || !(await nativeARProbe())) return { started: false, reason: 'unsupported' };
  listen(); sink = view;
  let r;
  try { r = await AR.start(); } catch (e) { r = { started: false, reason: String(e?.message || e) }; }
  if (sink !== view) {   // the game stopped (or another took over) while starting
    if (r?.started && !sink) AR.stop().catch(() => {});
    return { started: false, reason: 'switched' };
  }
  if (!r?.started) nativeStop(view);
  else document.documentElement.classList.add('ar-live');   // see-through page: the camera shows behind
  return r;
}
/** Stop native AR if this view (or any view, when none is given) owns it. */
export function nativeStop(view) {
  if (view && sink !== view) return;
  sink = null;
  document.documentElement.classList.remove('ar-live');
  AR?.stop().catch(() => {});
}
/** Where a screen point (CSS px) meets a real surface: [{ pose: 16 floats, kind }]. */
export async function nativeHit(x, y) {
  if (!AR) return [];
  try { return (await AR.hitTest({ x, y }))?.hits || []; } catch { return []; }
}
