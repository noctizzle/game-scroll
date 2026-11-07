// Sound kit: richer sound than single sfx() beeps, all made in code (no sound files).
//
//   import { sounds, noise, notes, music } from '../kit/sound.js';
//   sounds.coin();  sounds.jump();  sounds.hurt();  sounds.boom();      // ready-made effects
//   noise(.3, { vol: .08, from: 2000, to: 200 });                        // explosions, hits, wind
//   notes('C5 E5 G5 C6', { len: .08, wave: 'square' });                  // a quick jingle
//   const m = music({ tempo: 120, lead: 'C5 . E5 . G5 . E5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' });
//   m.start();  m.stop();  m.speed(1.2);                                 // looping background music
//
// Everything respects the app's mute button. Music stops by itself when the round ends or the
// player swipes to another game, but stop it in your own game-over code too if it should end sooner.
import { sfx, sound, audio } from '../sfx.js';

/* ---------- notes ---------- */
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Frequency of a note name like 'A4', 'C#5', 'Eb3' (or a number of Hz, passed through). */
export function freq(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(String(n).trim());
  if (!m) return 0;
  const semi = NOTE[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  return 440 * 2 ** ((semi - 69) / 12);
}

/* ---------- one tone, with an envelope (softer than sfx) ---------- */
/**
 * tone(freq, { len, wave, vol, slide, attack, at }): one note. freq is Hz or a note name.
 * wave: 'square' | 'triangle' | 'sine' | 'sawtooth'. slide: Hz to bend by over the note.
 * at: seconds from now to start it (for scheduling).
 */
export function tone(f, { len = .1, wave = 'square', vol = .05, slide = 0, attack = .005, at = 0 } = {}) {
  if (sound.muted) return;
  const a = audio(); if (!a) return;
  const hz = freq(f); if (!hz) return;
  try {
    const { ctx } = a, t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(hz, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, hz + slide), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(a.out); o.start(t); o.stop(t + len + .02);
  } catch { /* audio unavailable */ }
}

/* ---------- noise: explosions, hits, snares, wind ---------- */
let noiseBuf = null;
function noiseBuffer(ctx) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
/**
 * noise(len, { vol, from, to, filter, q, at }): a burst of noise through a filter that sweeps from
 * `from` Hz to `to` Hz. High to low = explosion; short and high = hit or snare; long and low = rumble.
 * filter: 'lowpass' (default) | 'highpass' | 'bandpass'.
 */
export function noise(len = .25, { vol = .08, from = 3000, to = 300, filter = 'lowpass', q = 1, at = 0 } = {}) {
  if (sound.muted) return;
  const a = audio(); if (!a) return;
  try {
    const { ctx } = a, t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx); src.loop = true;
    f.type = filter; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + len);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); g.connect(a.out); src.start(t); src.stop(t + len + .02);
  } catch { /* audio unavailable */ }
}

/* ---------- jingles ---------- */
/**
 * notes('C5 E5 G5 C6', { len, gap, wave, vol }): plays notes one after another. '.' is a rest.
 * A note can have its own length in steps after a colon: 'C5:2' lasts two steps. Returns the
 * jingle's length in seconds.
 */
export function notes(seq, { len = .09, gap = 0, wave = 'square', vol = .05 } = {}) {
  let at = 0;
  for (const tok of String(seq).trim().split(/\s+/)) {
    const [n, k] = tok.split(':'), steps = +k || 1, d = len * steps;
    if (n !== '.' && n !== '-') tone(n, { len: d * .95, wave, vol, at });
    at += d + gap;
  }
  return at;
}

/* ---------- ready-made sounds ---------- */
// Short, punchy, and pitched to sit together. Each takes an optional pitch multiplier (1 = normal),
// handy for rising combos: sounds.coin(1 + combo * .1).
export const sounds = {
  coin: (p = 1) => { tone(988 * p, { len: .06, vol: .05 }); tone(1319 * p, { len: .14, vol: .05, at: .06 }); },
  jump: (p = 1) => tone(300 * p, { len: .16, wave: 'square', vol: .045, slide: 500 * p }),
  hurt: (p = 1) => { tone(220 * p, { len: .22, wave: 'sawtooth', vol: .05, slide: -150 * p }); noise(.12, { vol: .05, from: 1500, to: 400 }); },
  hit: (p = 1) => { noise(.07, { vol: .09, from: 4000 * p, to: 800, filter: 'bandpass', q: .8 }); tone(140 * p, { len: .06, wave: 'triangle', vol: .08, slide: -60 }); },
  boom: (p = 1) => { noise(.6, { vol: .14, from: 1800 * p, to: 60 }); tone(90 * p, { len: .4, wave: 'sine', vol: .12, slide: -60 }); },
  laser: (p = 1) => tone(1400 * p, { len: .12, wave: 'sawtooth', vol: .035, slide: -1100 * p }),
  shoot: (p = 1) => { noise(.05, { vol: .06, from: 6000, to: 2000, filter: 'highpass' }); tone(600 * p, { len: .06, wave: 'square', vol: .03, slide: -300 }); },
  powerup: (p = 1) => notes([523, 659, 784, 1047, 1319].map(f => Math.round(f * p)).join(' '), { len: .05, wave: 'square', vol: .04 }),
  select: (p = 1) => tone(880 * p, { len: .05, wave: 'square', vol: .035 }),
  blip: (p = 1) => tone(660 * p, { len: .03, wave: 'triangle', vol: .05 }),
  pop: (p = 1) => tone(500 * p, { len: .08, wave: 'sine', vol: .07, slide: 600 * p }),
  splash: () => noise(.35, { vol: .08, from: 3500, to: 500, filter: 'bandpass', q: .5 }),
  click: () => noise(.02, { vol: .06, from: 5000, to: 4000, filter: 'highpass' }),
  win: () => notes('C5 E5 G5 C6:3', { len: .1, wave: 'square', vol: .05 }),
  lose: () => notes('G4 Eb4 C4:3', { len: .16, wave: 'triangle', vol: .07 }),
  levelup: () => notes('C5 G5 C6 E6 G6:3', { len: .07, wave: 'square', vol: .045 }),
  countdown: (last = false) => tone(last ? 1047 : 523, { len: last ? .3 : .12, wave: 'square', vol: .05 }),
};
export { sfx };   // the classic single beep, re-exported so one import covers everything

/* ---------- music ---------- */
const playing = new Set();
const DRUM = {
  k: (at, v) => { tone(150, { len: .12, wave: 'sine', vol: .14 * v, slide: -110, at }); },          // kick
  s: (at, v) => { noise(.12, { vol: .07 * v, from: 5000, to: 1500, filter: 'bandpass', q: .7, at }); },   // snare
  h: (at, v) => { noise(.03, { vol: .03 * v, from: 9000, to: 7000, filter: 'highpass', at }); },     // hi-hat
  c: (at, v) => { noise(.4, { vol: .03 * v, from: 9000, to: 4000, filter: 'highpass', at }); },      // crash
};
const VOICE = { lead: ['square', .028], bass: ['triangle', .07], pad: ['sine', .03], arp: ['square', .018] };
/**
 * music({ tempo, steps, lead, bass, pad, arp, drums, vol, swing }): a looping tune. Each part is a
 * line of steps (eighth notes at the tempo): note names, '.' for a rest, '-' to hold the previous
 * note. drums use k (kick), s (snare), h (hi-hat), c (crash). Parts can be different lengths.
 * Returns { start(), stop(), speed(x), playing }. Keep tunes short and quiet: it plays under the game.
 */
export function music({ tempo = 120, vol = 1, swing = 0, ...parts } = {}) {
  const tracks = [];
  for (const [name, line] of Object.entries(parts)) {
    if (typeof line !== 'string') continue;
    tracks.push({ name, steps: line.trim().split(/\s+/) });
  }
  let timer = 0, step = 0, next = 0, rate = 1;
  const stepLen = () => 60 / tempo / 2 / rate;
  function noteLen(tr, i) { let n = 1; while (tr.steps[(i + n) % tr.steps.length] === '-' && n < tr.steps.length) n++; return n; }
  function schedule() {
    const a = audio(); if (!a) return;
    const now = a.ctx.currentTime;
    if (next < now) next = now + .03;
    while (next < now + .15) {          // look ahead a little so timing stays tight
      if (!sound.muted) for (const tr of tracks) {
        const tok = tr.steps[step % tr.steps.length], at = next - now + (step % 2 ? swing * stepLen() : 0);
        if (tok === '.' || tok === '-') continue;
        if (tr.name === 'drums') { for (const d of tok) DRUM[d]?.(at, vol); continue; }
        const [wave, v] = VOICE[tr.name] || VOICE.lead;
        tone(tok, { len: stepLen() * noteLen(tr, step % tr.steps.length) * .9, wave, vol: v * vol, at, attack: tr.name === 'pad' ? .05 : .005 });
      }
      step++; next += stepLen();
    }
  }
  const m = {
    get playing() { return !!timer; },
    start() { if (timer) return m; step = 0; next = 0; schedule(); timer = setInterval(schedule, 40); playing.add(m); return m; },
    stop() { clearInterval(timer); timer = 0; playing.delete(m); return m; },
    /** Plays faster (x > 1) or slower, for rising tension. */
    speed(x) { rate = Math.max(.25, Math.min(4, x)); return m; },
  };
  return m;
}
/** Stops every tune. The app calls it when a round ends or the player leaves a game. */
export function stopMusic() { for (const m of [...playing]) m.stop(); }
if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', () => { if (document.hidden) stopMusic(); });
