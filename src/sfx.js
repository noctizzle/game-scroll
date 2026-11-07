import { store } from './util.js';

let actx = null, master = null;
export const sound = { muted: store.get('gs_muted', false) };

/** The app's one shared AudioContext and its master volume (null if audio is unavailable). Kit use only. */
export function audio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = 1; master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume?.();
    return { ctx: actx, out: master };
  } catch { return null; }
}

export function sfx(f = 440, d = 0.08, type = 'square', vol = 0.04, slide = 0) {
  if (sound.muted) return;
  const a = audio(); if (!a) return;
  try {
    const { ctx } = a, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.out); o.start(t); o.stop(t + d + 0.02);
  } catch { /* audio unavailable */ }
}
