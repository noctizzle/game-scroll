// The screen's refresh rate, asked for while a game plays (plugins/screen-rate). Phones with adaptive
// screens (LTPO, like the Fold's) pick their own rate and a web page can't ask for one, so a card could
// drop to 60 Hz under a game that frame generation was filling to 120, or keep refreshing 120 times a
// second to show a 60 fps game's repeats. src/kit/speed.js works out the wish (screenWant) and the feed
// sends it each refresh (screenWish); this sends it on to the phone once it has held a moment, and
// only on Android (iPhones follow what the page draws by themselves; there the plugin lifts the web
// view's 60 Hz cap instead). Out of a round the wish is 0: the phone decides (it speeds up for a swipe).
//
//   screen.rates   the rates the screen offers at its current size (Hz, lowest first; [] where unknown)
//   screen.top     the fastest of them (0 where unknown: then nothing is asked)
//   screen.want    the rate last asked for (0: none)
//   screen.lifted  iPhone: the web view's 60 Hz cap came off
import { Capacitor, registerPlugin } from '@capacitor/core';

export const screen = { rates: [], top: 0, hz: 0, arr: false, want: 0, lifted: false };

const native = Capacitor.isNativePlatform(), android = Capacitor.getPlatform() === 'android';
const plugin = native && Capacitor.isPluginAvailable('ScreenRate') ? registerPlugin('ScreenRate') : null;
// a wish has to hold this long before it's sent (a pause, a menu, a game over and Play again)
const HOLD = 250;

/**
 * The rate to ask for (exported for tests). rates: what the screen offers; real: the game's real
 * frames a second once the screen is there; fg: frame generation fills the refreshes between them.
 * With frame generation: the fastest rate that's a whole number of refreshes per real frame (60 fps on
 * a 144 Hz screen asks for 120: two each, not 2.4), else the fastest. Without: the slowest rate the
 * frames fit evenly (a game at 60 or 30 asks for 60), else the fastest. Never below 60 (touches answer
 * more slowly on a slower screen). 0: nothing to ask.
 */
export function pickRate(rates, real, fg) {
  const ok = (rates || []).filter(r => r >= 59).sort((a, b) => a - b);
  if (!ok.length || !(real > 0)) return 0;
  const top = ok[ok.length - 1], n = r => r / real, whole = r => Math.abs(n(r) - Math.round(n(r))) < .04;
  if (fg) { const c = ok.filter(r => whole(r) && n(r) > 1.9); return c.length ? c[c.length - 1] : top; }
  const c = ok.filter(r => r >= real - 1 && whole(r));
  return c.length ? c[0] : top;
}

let sent = 0, pending = 0, since = 0;
/** Ask the screen for this rate (0: no wish). Called every refresh; sends a change once it has held a moment. */
export function askRate(hz, now = typeof performance !== 'undefined' ? performance.now() : 0) {
  if (!plugin || !android) return;
  if (hz !== pending) { pending = hz; since = now; }
  if (pending !== sent && now - since >= HOLD) {
    sent = pending; screen.want = sent;
    plugin.set({ hz: sent }).catch(() => { /* an older app without the plugin's set */ });
  }
}

async function read() {
  try {
    const o = await plugin.get();
    screen.rates = Array.isArray(o.rates) ? o.rates.map(Number).filter(r => r > 0).sort((a, b) => a - b) : [];
    screen.top = screen.rates.length ? screen.rates[screen.rates.length - 1] : 0;
    screen.hz = +o.hz || 0; screen.arr = !!o.arr; screen.lifted = !!o.lifted;
  } catch (_) { /* an older app without the plugin: nothing is asked */ }
}

if (plugin && typeof document !== 'undefined') {
  read();
  // a fold or unfold is another screen with other rates
  let t = null;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(read, 600); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') read(); });
}
