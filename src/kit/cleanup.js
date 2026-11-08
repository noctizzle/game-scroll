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
