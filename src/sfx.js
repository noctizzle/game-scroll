import { store } from './util.js';

let actx = null, master = null, limiter = null, last = null;
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
  if (master) master.gain.value = sound.muted ? 0 : sound.volume;
}

// The last thing every sound passes through: a limiter. Many sounds at once (an explosion over the music
// over a win jingle) used to add up past full volume and crackle; now loud moments are held just under it,
// and the quiet end comes up a little (about 2.5 dB), so one game isn't much louder than the next. It looks a few
// milliseconds ahead to catch peaks (LOOK), which delay() below counts.
const LIMIT = { threshold: -12, knee: 10, ratio: 12, attack: .003, release: .2 }, LOOK = .006;
// The limiter takes a moment to pull a sudden pile down, so a last stage rounds off anything still over:
// sound up to SOFT of full volume passes untouched, louder bends smoothly towards TOP and never passes it
// (running into full volume instead is a harsh crackle). The curve covers twice full volume each way.
const SOFT = .6, TOP = .98, TRIM = .8;   // (TRIM: the limiter's own lift is a little much; this leaves about +2.5 dB)
function softClip(ctx) {
  const n = 4097, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 2, m = Math.abs(x); curve[i] = Math.sign(x) * (m <= SOFT ? m : SOFT + (TOP - SOFT) * Math.tanh((m - SOFT) / (TOP - SOFT))); }
  const half = ctx.createGain(), sh = ctx.createWaveShaper(); half.gain.value = .5 * TRIM; sh.curve = curve; half.connect(sh);
  return { in: half, out: sh };
}
/** The app's one shared AudioContext and its master volume (null if audio is unavailable). Kit use only. */
export function audio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      master = actx.createGain(); master.gain.value = sound.muted ? 0 : sound.volume;
      try {
        limiter = actx.createDynamicsCompressor();
        for (const k in LIMIT) limiter[k].value = LIMIT[k];
        const clip = softClip(actx);
        master.connect(limiter); limiter.connect(clip.in); clip.out.connect(actx.destination); last = clip.out;
      } catch { limiter = null; last = master; try { master.disconnect(); } catch { /* not connected */ } master.connect(actx.destination); }
    }
    if (actx.state === 'suspended') actx.resume?.();
    return { ctx: actx, out: master, end: last };
  } catch { return null; }
}
/**
 * Seconds between a sound being played and the player hearing it: the phone's audio output (speaker,
 * wired or Bluetooth headphones, as far as the phone reports it) plus the limiter. Rhythm timing
 * (gs.rhythm.Beat) allows for it by itself; use it to line a picture up with a sound.
 */
export function delay() {
  const a = actx; if (!a) return 0;
  const v = (+a.outputLatency || 0) + (+a.baseLatency || 0) + (limiter ? LOOK : 0);
  return v > 0 && v < 1 ? v : limiter ? LOOK : 0;
}

// Where game sounds go: kit/sound.js's mixer sets this to its effects channel, so the mixer's volume,
// muffle and room echo reach sfx() beeps too. Kit use only (hidden from games).
let sfxBus = null;
export function setSfxOut(fn) { sfxBus = fn; }

export function sfx(f = 440, d = 0.08, type = 'square', vol = 0.04, slide = 0) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  try {
    const { ctx } = a, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(sfxBus?.() || a.out); o.start(t); o.stop(t + d + 0.02);
  } catch { /* audio unavailable */ }
}
