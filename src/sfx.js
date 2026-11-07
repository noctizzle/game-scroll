import { store } from './util.js';

let actx = null, master = null;
// The player's sound settings (the Sound & haptics sheet): everything on/off, volume 0..1, and music
// on/off. Games don't get this object; the kit functions below and in kit/sound.js read it.
export const sound = {
  muted: store.get('gs_muted', false),
  volume: Math.max(0, Math.min(1, +store.get('gs_volume', 1) || 0)),
  music: store.get('gs_music', true),
};
/** Change and save sound settings, e.g. setSound({ volume: .5 }). */
export function setSound(patch) {
  Object.assign(sound, patch);
  sound.volume = Math.max(0, Math.min(1, +sound.volume || 0));
  store.set('gs_muted', !!sound.muted); store.set('gs_volume', sound.volume); store.set('gs_music', !!sound.music);
  if (master) master.gain.value = sound.volume;
}

/** The app's one shared AudioContext and its master volume (null if audio is unavailable). Kit use only. */
export function audio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = sound.volume; master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume?.();
    return { ctx: actx, out: master };
  } catch { return null; }
}

export function sfx(f = 440, d = 0.08, type = 'square', vol = 0.04, slide = 0) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  try {
    const { ctx } = a, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.out); o.start(t); o.stop(t + d + 0.02);
  } catch { /* audio unavailable */ }
}
