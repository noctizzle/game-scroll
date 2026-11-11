// Keeps the screen on while a round is being played. A phone dims and locks after a short while with
// no touch, which is right for most apps and wrong for a game played by tilting, talking, blowing,
// showing your face to the camera or just watching: the round carried on behind a dark screen.
//
// The feed says every refresh whether a round is in play (keepAwake(true / false)); this asks the
// phone only when that changes. In the apps it's the keep-awake plugin (the window's "keep screen on"
// flag on Android, the idle timer on iPhone); in a browser it's the Screen Wake Lock API, where there
// is one. Nothing is kept on outside a round, while paused, or once nobody has touched the game for
// IDLE (a phone left on the table mid-round goes to sleep as usual).
import { KeepAwake } from '@capacitor-community/keep-awake';

/** How long a round stays awake with no touch, key or controller input at all (rounds last 20 s to 3 min). */
export const IDLE = 5 * 60 * 1000;
/** on: the screen is being kept on now. can: this phone or browser can do it (null until first asked). */
export const awake = { on: false, can: null };

let want = false, busy = false, retryAt = 0;

function apply() {
  if (busy || want === awake.on || awake.can === false) return;
  const now = Date.now(); if (want && now < retryAt) return;
  busy = true;
  const to = want;
  Promise.resolve().then(() => (to ? KeepAwake.keepAwake() : KeepAwake.allowSleep())).then(() => { awake.on = to; awake.can = true; }, () => {
    // no way to do it here (an old browser), or not right now (the page isn't in front): ask again later
    if (awake.can === null && typeof navigator !== 'undefined' && !('wakeLock' in navigator) && !globalThis.Capacitor?.isNativePlatform?.()) awake.can = false;
    retryAt = Date.now() + 10000; if (!to) awake.on = false;
  }).finally(() => { busy = false; if (want !== awake.on) apply(); });
}

/**
 * Says whether the screen should stay on. playing: a round is in play and not paused; lastInput: when
 * the player last touched the game (performance.now()). Cheap enough to call every refresh.
 */
export function keepAwake(playing, lastInput = 0, now = typeof performance !== 'undefined' ? performance.now() : 0) {
  want = !!playing && now - lastInput < IDLE;
  if (want !== awake.on) apply();
}

// (A browser lets go of the lock when the page is hidden. The feed pauses the round then, so the next
// refresh after coming back lets go here too, and resuming asks again.)
