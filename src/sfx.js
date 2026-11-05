import { store } from './util.js';

let actx = null;
export const sound = { muted: store.get('gs_muted', false) };

export function sfx(f = 440, d = 0.08, type = 'square', vol = 0.04, slide = 0) {
  if (sound.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
  } catch { /* audio unavailable */ }
}
