// Sound kit: richer sound than single sfx() beeps, all made in code (no sound files).
//
//   import { sounds, noise, notes, music } from '../kit/sound.js';
//   sounds.coin();  sounds.jump();  sounds.hurt();  sounds.boom();      // ready-made effects
//   noise(.3, { vol: .08, from: 2000, to: 200 });                        // explosions, hits, wind
//   notes('C5 E5 G5 C6', { len: .08, wave: 'square' });                  // a quick jingle
//   const m = music({ tempo: 120, lead: 'C5 . E5 . G5 . E5 .', bass: 'C3 . . . G2 . . .', drums: 'k . h . s . h .' });
//   m.start();  m.stop();  m.speed(1.2);                                 // looping background music
//
// Everything respects the player's Sound & haptics settings (sound on/off, volume, music on/off). Music stops by itself when the round ends or the
// player swipes to another game, but stop it in your own game-over code too if it should end sooner.
import { sfx, sound, audio, setSfxOut } from '../sfx.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { buildSamples, SAMPLE_RATE } from './zzfx.js';
import { lazy } from './lazy.js';
import { register } from './cleanup.js';

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
 * at: seconds from now to start it (for scheduling). bus: the mixer channel it plays into (default 'sfx').
 */
export function tone(f, { len = .1, wave = 'square', vol = .05, slide = 0, attack = .005, at = 0, out = null, bus = null } = {}) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  const hz = freq(f); if (!hz) return;
  try {
    const { ctx } = a, t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.setValueAtTime(hz, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, hz + slide), t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out || route || busIn(bus || playBus)); o.start(t); o.stop(t + len + .02);
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
export function noise(len = .25, { vol = .08, from = 3000, to = 300, filter = 'lowpass', q = 1, at = 0, attack = 0, out = null, bus = null } = {}) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  try {
    const { ctx } = a, t = ctx.currentTime + at, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx); src.loop = true;
    f.type = filter; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + len);
    if (attack > 0) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(len, attack + .01));
    src.connect(f); f.connect(g); g.connect(out || route || busIn(bus || playBus)); src.start(t); src.stop(t + len + .02);
  } catch { /* audio unavailable */ }
}

/* ---------- places and backgrounds: reverb made in code, steady beds of sound ---------- */
/**
 * space({ seconds, decay, wet, bright, pre }): the sound of a place (a room, a church, a valley, a
 * cave): a reverb whose echo tail is made in code. Play into it with tone(f, { out: sp.in }) or
 * noise(len, { out: sp.in }) (the sound plus its echo), or new Ears({ space: sp }) for 3D sounds.
 * seconds: how long the tail is; decay: how fast it dies away (higher is shorter); wet: 0..1 how
 * much echo; bright: Hz above which the tail is dull; pre: seconds before the first echo (big
 * places have more). sp.set({ wet, bright }, seconds) glides; sp.tail takes only the echo.
 * Returns null where there is no audio, so pass sp?.in.
 */
export function space({ seconds = 2.4, decay = 3, wet = .35, bright = 5000, pre = .02 } = {}) {
  const a = audio(); if (!a) return null;
  try {
    const { ctx } = a, inp = ctx.createGain(), tail = ctx.createGain(), dl = ctx.createDelay(1), cv = ctx.createConvolver(), lp = ctx.createBiquadFilter(), w = ctx.createGain();
    const n = Math.max(64, Math.floor(seconds * ctx.sampleRate)), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    cv.buffer = ir; dl.delayTime.value = Math.min(1, pre); lp.type = 'lowpass'; lp.frequency.value = bright; w.gain.value = wet;
    const to = busIn('sfx'); inp.connect(to); inp.connect(tail); tail.connect(dl); dl.connect(cv); cv.connect(lp); lp.connect(w); w.connect(to);
    const sp = {
      in: inp, tail,
      set({ wet: v, bright: hz } = {}, sec = .3) { const t = ctx.currentTime, k = Math.max(.01, sec / 3); if (v != null) w.gain.setTargetAtTime(v, t, k); if (hz != null) lp.frequency.setTargetAtTime(hz, t, k); return sp; },
    };
    return sp;
  } catch { return null; }
}
// beds use a longer noise loop than the bursts, so the repeat can't be heard
let bedBuf = null;
function bedBuffer(ctx) {
  if (bedBuf) return bedBuf;
  const n = ctx.sampleRate * 5; bedBuf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = bedBuf.getChannelData(ch); let b = 0; for (let i = 0; i < n; i++) { b = b * .6 + (Math.random() * 2 - 1) * .4; d[i] = b * 1.6; } }
  return bedBuf;
}
const beds = new Set();
/**
 * bed({ vol, from, filter, q, gusts, out }): a steady background sound made from noise: wind, rain,
 * a river, a crowd's hum, the roar of an engine room. b.set({ vol, from, q }, seconds) glides to new
 * values (a storm rising, a door closing on the wind). gusts: 0..1 slow random swells. Beds fade in,
 * stop with the round and go quiet on the pause screen; b.stop() ends one sooner.
 */
export function bed({ vol = .03, from = 600, filter = 'lowpass', q = .7, gusts = 0, out = null } = {}) {
  const dead = { set() { return dead; }, stop() {} };
  if (sound.muted || !sound.volume) return dead;
  const a = audio(); if (!a) return dead;
  try {
    const { ctx } = a, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), sw = ctx.createGain();
    src.buffer = bedBuffer(ctx); src.loop = true; src.loopStart = Math.random() * 4; f.type = filter; f.frequency.value = from; f.Q.value = q;
    g.gain.value = 0; sw.gain.value = 1;
    src.connect(f); f.connect(sw); sw.connect(g); g.connect(out || busIn('sfx')); src.start(ctx.currentTime, Math.random() * 4);
    // gusts: two slow wobbles that never line up, so the swells don't repeat
    const lfos = [];
    if (gusts > 0) for (const hz of [.07 + Math.random() * .03, .17 + Math.random() * .05]) { const o = ctx.createOscillator(), lg = ctx.createGain(); o.frequency.value = hz; lg.gain.value = gusts * .35; o.connect(lg); lg.connect(sw.gain); o.start(); lfos.push(o); }
    const b = {
      vol, held: false,
      set({ vol: v, from: hz, q: qq } = {}, sec = .5) { const t = ctx.currentTime, k = Math.max(.01, sec / 3); if (v != null) { b.vol = v; if (!b.held) g.gain.setTargetAtTime(v, t, k); } if (hz != null) f.frequency.setTargetAtTime(hz, t, k); if (qq != null) f.Q.setTargetAtTime(qq, t, k); return b; },
      hold(on) { b.held = on; g.gain.setTargetAtTime(on ? 0 : b.vol, ctx.currentTime, .08); },
      stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, .15); src.stop(ctx.currentTime + .8); for (const o of lfos) o.stop(ctx.currentTime + .8); } catch { /* stopped */ } beds.delete(b); },
    };
    g.gain.setTargetAtTime(vol, ctx.currentTime, .4);
    beds.add(b); return b;
  } catch { return dead; }
}
register('beds', { stop: () => { for (const b of [...beds]) b.stop(); }, pause: () => { for (const b of beds) b.hold(true); }, resume: () => { for (const b of beds) b.hold(false); } });

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

/* ---------- ZzFX: design your own sound effects ---------- */
// Design a sound on https://killedbyapixel.github.io/ZzFX/ (move the sliders, press play), copy the
// numbers it shows, and play them: zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17]). Sounds are
// built once and cached, so playing the same one again is cheap.
const zcache = new Map();
/** Plays a ZzFX sound (the numbers from the ZzFX designer). Returns nothing. */
export function zzfx(...params) { playZ(params, null); }
function playZ(params, out) {
  if (sound.muted || !sound.volume) return;
  const a = audio(); if (!a) return;
  try {
    const key = params.join(',');
    let buf = zcache.get(key);
    if (!buf) {
      const data = buildSamples(...params);
      buf = a.ctx.createBuffer(1, data.length, SAMPLE_RATE); buf.getChannelData(0).set(data);
      if (zcache.size > 64) zcache.delete(zcache.keys().next().value);
      zcache.set(key, buf);
    }
    const src = a.ctx.createBufferSource(), g = a.ctx.createGain();
    src.buffer = buf; g.gain.value = .3; src.connect(g); g.connect(out || busIn(playBus)); src.start();
  } catch { /* audio unavailable */ }
}
/** Makes a reusable sound from ZzFX numbers: const zap = zsound(...numbers); zap(); zap(1.5) plays it higher. */
export function zsound(...params) {
  return (pitch = 1) => { const p = [...params]; if (pitch !== 1) p[2] = (p[2] ?? 220) * pitch; zzfx(...p); };
}

/* ---------- Tone.js: real synths, effects and sequencing (for music games) ---------- */
// Tone.js (tonejs.github.io, MIT) is big, so it loads the first time a game asks for it: call
// Tone() in make() or reset() (the app waits while it loads, like physics). It plays through the
// app's audio, so the player's volume and mute apply.
//   const T = gs.sound.Tone();
//   const synth = new T.PolySynth(T.Synth).toDestination();  synth.triggerAttackRelease(['C4', 'E4', 'G4'], '8n');
let toneHeld = false;
const toneLib = lazy('Tone.js', () => import('tone').then(T => {
  const a = audio(); if (!a) throw new Error('No audio on this device');
  T.setContext(a.ctx);
  const d = T.getDestination(); d.output.disconnect(); d.output.connect(busIn('music'));
  // a game's Tone loops stop with the round and hold on the pause screen
  register('tone', { stop: () => { T.getTransport().stop(); T.getTransport().cancel(); }, pause: () => T.getTransport().state === 'started' && (T.getTransport().pause(), toneHeld = true), resume: () => { if (toneHeld) { toneHeld = false; T.getTransport().start(); } } });
  return T;
}));
/** The Tone.js library (loads it the first time). */
export function Tone() { return toneLib.get(); }

/* ---------- music ---------- */
const playing = new Set(), held = new Set();   // tunes playing now, and tunes paused mid-way
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
 * Returns { start(), stop(), pause(), resume(), speed(x), layer(name, level), intensity(x), playing }. Keep tunes short and quiet: it plays under the game.
 * Layered music: give parts numbered names (lead2, drums2...) and layers: { drums: .3, lead2: .7 }
 * to bring them in with intensity(); parts not in layers always play.
 */
export function music({ tempo = 120, vol = 1, swing = 0, layers = null, ...parts } = {}) {
  const tracks = [];
  for (const [name, line] of Object.entries(parts)) {
    if (typeof line !== 'string') continue;
    tracks.push({ name, voice: name.replace(/\d+$/, ''), steps: line.trim().split(/\s+/), level: layers && layers[name] != null ? 0 : 1, to: layers && layers[name] != null ? 0 : 1 });
  }
  let intensity = 0;
  let timer = 0, step = 0, next = 0, rate = 1;
  const stepLen = () => 60 / tempo / 2 / rate;
  function noteLen(tr, i) { let n = 1; while (tr.steps[(i + n) % tr.steps.length] === '-' && n < tr.steps.length) n++; return n; }
  function schedule() { const was = playBus; playBus = 'music'; try { scheduleNow(); } finally { playBus = was; } }
  function scheduleNow() {
    const a = audio(); if (!a) return;
    const now = a.ctx.currentTime;
    if (next < now) next = now + .03;
    while (next < now + .15) {          // look ahead a little so timing stays tight
      for (const tr of tracks) tr.level += (tr.to - tr.level) * Math.min(1, stepLen() / (tr.fade || .6));
      if (!sound.muted && sound.volume && sound.music) for (const tr of tracks) {
        const tok = tr.steps[step % tr.steps.length], at = next - now + (step % 2 ? swing * stepLen() : 0);
        if (tok === '.' || tok === '-' || tr.level < .02) continue;
        const lv = vol * tr.level;
        if (tr.voice === 'drums') { for (const d of tok) DRUM[d]?.(at, lv); continue; }
        const [wave, v] = VOICE[tr.voice] || VOICE.lead;
        tone(tok, { len: stepLen() * noteLen(tr, step % tr.steps.length) * .9, wave, vol: v * lv, at, attack: tr.voice === 'pad' ? .05 : .005 });
      }
      step++; next += stepLen();
    }
  }
  const m = {
    get playing() { return !!timer; },
    start() { if (timer) return m; step = 0; next = 0; schedule(); timer = setInterval(schedule, 40); playing.add(m); held.delete(m); return m; },
    stop() { clearInterval(timer); timer = 0; playing.delete(m); held.delete(m); return m; },
    /** Holds the tune where it is (resume() carries on from the same step). The app does this on pause. */
    pause() { if (!timer) return m; clearInterval(timer); timer = 0; playing.delete(m); held.add(m); return m; },
    resume() { if (timer || !held.has(m)) return m; held.delete(m); next = 0; schedule(); timer = setInterval(schedule, 40); playing.add(m); return m; },
    /** Plays faster (x > 1) or slower, for rising tension. */
    speed(x) { rate = Math.max(.25, Math.min(4, x)); return m; },
    /** Fades one part in or out: m.layer('drums', 1) or m.layer('lead2', 0, 2) (fade seconds). */
    layer(name, level = 1, fade = .6) { for (const tr of tracks) if (tr.name === name) { tr.to = Math.max(0, Math.min(1, level)); tr.fade = fade; } return m; },
    /**
     * Sets how intense the music is, 0..1: each part named in `layers` comes in once intensity
     * reaches its number (layers: { drums: .3, lead2: .7 }), so combat can build the tune up.
     */
    intensity(x, fade = 1) { intensity = Math.max(0, Math.min(1, x)); if (layers) for (const [n, at] of Object.entries(layers)) m.layer(n, intensity >= at ? 1 : 0, fade); return m; },
    get level() { return intensity; },
  };
  return m;
}
/**
 * Living music: makes a tune follow the play. Close calls push the tension up, it eases back when
 * things calm down, a loss brings it right down, and the tempo drifts a little towards the
 * player's own pace. It drives the tune's intensity() (so give it layers) and speed().
 *
 *   const song = music({ tempo: 112, layers: { drums: .25, lead2: .7 }, ... });
 *   const live = follow(song, { pace: 2 });   // pace: taps a second that count as "normal"
 *   update(dt) { if (!song.playing) song.start(); live.update(dt); }
 *   on a close call: live.feel(1)     on each tap: live.tap()     on game over: live.lost() / live.won()
 *
 * opts: calm (the resting intensity, .15), ease (how fast tension falls, per second, .25),
 * tempo ([lowest, highest] speed, [.92, 1.12]), brain (a Tiny Brain: its mood keeps tension up too).
 */
export function follow(song, { calm = .15, ease = .25, tempo = [.92, 1.12], pace = 2, brain = null } = {}) {
  let tension = calm, gap = 1 / pace, lastTap = -1, t = 0, speed = 1, lift = 0;
  const L = {
    get tension() { return tension; },
    get speed() { return speed; },
    /** A tense or exciting moment, about 0..1 (close call 1, a hit .5). */
    feel(x = 1) { tension = Math.min(1, tension + Math.max(0, +x || 0) * .35); return L; },
    /** The player did something: the tempo leans towards their pace. */
    tap() { if (lastTap >= 0) { const d = t - lastTap; if (d > .05 && d < 2) gap += (d - gap) * .15; } lastTap = t; return L; },
    /** The player lost: everything settles at once. */
    lost() { tension = calm * .5; lift = 0; return L; },
    /** The player won: a short lift. */
    won() { lift = 1; return L; },
    update(dt) {
      t += dt;
      const floor = brain ? Math.max(calm, Math.min(1, calm + (brain.mood || 0) * .5)) : calm;
      tension = Math.max(floor, tension - ease * dt);
      lift = Math.max(0, lift - dt * .5);
      const want = Math.min(1, tension + lift * .4);
      // the player's pace: quicker taps than `pace`, a bit faster; slower, a bit slower; tension adds a little
      const p = Math.max(tempo[0], Math.min(tempo[1], 1 + ((1 / gap) / pace - 1) * .08 + want * .05));
      speed += (p - speed) * Math.min(1, dt * .8);
      song.intensity(want, 1.2); song.speed(speed);
      return L;
    },
  };
  return L;
}

/** Stops every tune. The app calls it when a round ends or the player leaves a game. */
export function stopMusic() { for (const m of [...playing, ...held]) m.stop(); }
/** Holds every playing tune; resumeMusic() carries them on. The app calls these when a game pauses. */
export function pauseMusic() { for (const m of [...playing]) m.pause(); }
export function resumeMusic() { for (const m of [...held]) m.resume(); }
register('music', { stop: stopMusic, pause: pauseMusic, resume: resumeMusic });
if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', () => { if (document.hidden) pauseMusic(); });

/* ---------- 3D sound: sounds placed in the world ---------- */
// The browser's own 3D audio (Web Audio PannerNode with HRTF: real left/right and front/behind in
// headphones, distance fall-off on speakers). Place the ears each frame where the camera is, then
// play sounds at points. 2D games: pass { x, y } and they sit on a flat plane.
//   const ears = new Ears();
//   update() { ears.place(camera.position, camera.getWorldDirection(v)); }
//   ears.tone(440, enemy.pos, { len: .2 });  ears.noise(.4, barrel.pos);  ears.zzfx(gun.pos, ...numbers);
//   engine = ears.loop(car.pos, 'sawtooth', 80);  engine.move(car.pos).pitch(80 + speed * 6);  engine.stop();
const P3 = p => ({ x: p?.x || 0, y: p?.z == null ? 0 : (p.y || 0), z: p?.z == null ? (p?.y || 0) : p.z });
export class Ears {
  /** ref: distance at full volume; max: past this it doesn't get quieter; rolloff: how fast it falls; hrtf: false for plain stereo (cheaper). */
  constructor({ ref = 2, max = 60, rolloff = 1, hrtf = true, flat = false, space = null, send = .5 } = {}) { Object.assign(this, { ref, max, rolloff, hrtf, flat, space, send }); this.pos = { x: 0, y: 0, z: 0 }; }
  /** Where the listener is and which way it faces (forward and up are directions; up defaults to +y). */
  place(pos, forward = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 }) {
    const a = audio(); if (!a) return this;
    const L = a.ctx.listener, p = this.flat ? P3(pos) : { x: pos.x, y: pos.y, z: pos.z || 0 }, f = forward; this.pos = p;
    try {
      if (L.positionX) { const t = a.ctx.currentTime; L.positionX.setTargetAtTime(p.x, t, .02); L.positionY.setTargetAtTime(p.y, t, .02); L.positionZ.setTargetAtTime(p.z, t, .02);
        L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y || 0, t); L.forwardZ.setValueAtTime(f.z ?? -1, t); L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t); }
      else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y || 0, f.z ?? -1, up.x, up.y, up.z); }
    } catch { /* old audio */ }
    return this;
  }
  /** For top-down 2D games: the listener at (x, y) on the ground, facing up the screen. */
  place2d(x, y, facing = -Math.PI / 2) { this.flat = true; return this.place({ x, y }, { x: Math.cos(facing), y: 0, z: Math.sin(facing) }); }
  /** A panner at p (and an optional muffle filter for "behind a wall"). Kit use; play sounds into it. */
  node(p, { muffled = false } = {}) {
    const a = audio(); if (!a) return null;
    try {
      const q = this.flat ? P3(p) : { x: p.x, y: p.y, z: p.z || 0 }, pn = a.ctx.createPanner();
      pn.panningModel = this.hrtf ? 'HRTF' : 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = this.ref; pn.maxDistance = this.max; pn.rolloffFactor = this.rolloff;
      if (pn.positionX) { pn.positionX.value = q.x; pn.positionY.value = q.y; pn.positionZ.value = q.z; } else pn.setPosition(q.x, q.y, q.z);
      // with a space, some of each sound also goes into the place's echo (far sounds keep more of it)
      if (this.space?.tail) { const s = a.ctx.createGain(); s.gain.value = this.send; pn.connect(s); s.connect(this.space.tail); }
      if (!muffled) { pn.connect(busIn('sfx')); return pn; }
      const f = a.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; pn.connect(f); f.connect(busIn('sfx')); return pn;
    } catch { return null; }
  }
  /** One note at a point (options as tone(), plus muffled: true for behind a wall). */
  tone(f, p, o = {}) { const n = this.node(p, o); if (n) tone(f, { ...o, out: n }); return this; }
  /** A noise burst at a point (options as noise()). */
  noise(len, p, o = {}) { const n = this.node(p, o); if (n) noise(len, { ...o, out: n }); return this; }
  /** A ZzFX sound at a point. */
  zzfx(p, ...params) { const n = this.node(p); if (n) playZ(params, n); return this; }
  /** A ready-made sound at a point: ears.play('boom', pos). Ready-made sounds are built from tone and noise, so they follow. */
  play(name, p, pitch = 1, o = {}) {
    const n = this.node(p, o); if (!n || !sounds[name]) return this;
    route = n; try { sounds[name](pitch); } finally { route = null; }   // its notes go into the panner
    return this;
  }
  /** A steady sound that follows something (engines, fires, a humming generator): returns { move(p), pitch(hz), volume(v), stop() }. */
  loop(p, wave = 'sawtooth', hz = 90, { vol = .03, muffled = false } = {}) {
    const a = audio(), dead = { move() { return this; }, pitch() { return this; }, volume() { return this; }, stop() {} };
    if (!a || sound.muted || !sound.volume) return dead;
    const n = this.node(p, { muffled }); if (!n) return dead;
    try {
      const o = a.ctx.createOscillator(), g = a.ctx.createGain(); o.type = wave; o.frequency.value = hz; g.gain.value = vol; o.connect(g); g.connect(n); o.start();
      const self = this, h = {
        move(q) { const r = self.flat ? P3(q) : { x: q.x, y: q.y, z: q.z || 0 }, t = a.ctx.currentTime; if (n.positionX) { n.positionX.setTargetAtTime(r.x, t, .03); n.positionY.setTargetAtTime(r.y, t, .03); n.positionZ.setTargetAtTime(r.z, t, .03); } else n.setPosition(r.x, r.y, r.z); return h; },
        pitch(f) { o.frequency.setTargetAtTime(f, a.ctx.currentTime, .05); return h; },
        volume(v) { g.gain.setTargetAtTime(v, a.ctx.currentTime, .05); return h; },
        stop() { try { g.gain.setTargetAtTime(0, a.ctx.currentTime, .05); o.stop(a.ctx.currentTime + .2); } catch { /* stopped */ } loops.delete(h); },
      };
      loops.add(h); return h;
    } catch { return dead; }
  }
  /** How loud a sound at p would be here, 0..1 (for subtitles or "you heard that" hints). */
  heard(p) { const q = this.flat ? P3(p) : { x: p.x, y: p.y, z: p.z || 0 }, d = Math.hypot(q.x - this.pos.x, q.y - this.pos.y, q.z - this.pos.z); return this.ref / (this.ref + this.rolloff * Math.max(0, Math.min(this.max, d) - this.ref)); }
}
let route = null;   // while set, tone() and noise() play into this node (for Ears.play)
const loops = new Set();
register('ears', { stop: () => { for (const h of [...loops]) h.stop(); const a = audio(); try { a?.ctx.listener.positionX?.setValueAtTime(0, a.ctx.currentTime); } catch { /* ok */ } } });

/* ---------- mixer: channels, ducking, rooms, muffle ---------- */
// Every game sound goes through a channel ('sfx' for effects, 'music' for music(), Tone.js and
// layered tunes, 'voice' for your own speech-like sounds), then the shared room and muffle, then
// the player's volume. Change them any time; they all go back to normal when the round ends.
//   mixer.volume('music', .4)              // a channel's level (0..1, fades over .1 s)
//   mixer.duck('music', .3, .8)            // dip the music to 30% for .8 s (then back): big moments, lines
//   mixer.room('cave')                     // echo for everything: 'none' | 'room' | 'hall' | 'cave' | 'pipe', or { echo, delay, reverb, size }
//   mixer.muffle(.8)                       // 0..1 dull everything, like hearing it underwater or from inside a box
//   mixer.channel('alarm').volume(.5)      // your own channel; play into it with tone(f, { bus: 'alarm' }) ...
// Speech from say() dips the music for you while it talks.
let playBus = 'sfx';
const BUSES = ['sfx', 'music', 'voice'];
let mix = null;
function impulse(ctx, secs, decay) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * secs)), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return b;
}
function mixGraph() {
  const a = audio(); if (!a) return null;
  if (mix && mix.ctx === a.ctx) return mix;
  const ctx = a.ctx, input = ctx.createGain(), muffle = ctx.createBiquadFilter(), dry = ctx.createGain(),
    verb = ctx.createConvolver(), verbGain = ctx.createGain(), delay = ctx.createDelay(1.5), fb = ctx.createGain(), echoGain = ctx.createGain();
  muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = .7;
  input.connect(muffle); muffle.connect(dry); dry.connect(a.out);
  verbGain.gain.value = 0; muffle.connect(verb); verb.connect(verbGain); verbGain.connect(a.out);
  echoGain.gain.value = 0; fb.gain.value = 0; muffle.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(echoGain); echoGain.connect(a.out);
  mix = { ctx, input, muffle, verb, verbGain, delay, fb, echoGain, buses: new Map(), roomKey: '' };
  for (const b of BUSES) channelNode(b);
  return mix;
}
function channelNode(name) {
  const m = mixGraph(); if (!m) return null;
  let g = m.buses.get(name);
  if (!g) { g = m.ctx.createGain(); g.connect(m.input); m.buses.set(name, g); g.level = 1; }
  return g;
}
/** The input of a channel (kit use: where tone(), noise() and zzfx() play into). */
function busIn(name) { return channelNode(name || 'sfx') || audio()?.out; }
setSfxOut(() => busIn('sfx'));
function setLevel(g, v, fade) { const t = g.context.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, Math.max(.005, fade / 3)); }
const ROOMS = {
  none: { reverb: 0, echo: 0 },
  room: { reverb: .18, size: .5, echo: 0 },
  hall: { reverb: .32, size: 1.8, echo: 0 },
  cave: { reverb: .3, size: 2.6, echo: .25, delay: .32 },
  pipe: { reverb: .12, size: .4, echo: .4, delay: .09 },
};
export const mixer = {
  /** A channel's volume, 0..1 (default 1), fading over `fade` seconds. */
  volume(name, v, fade = .1) { const g = channelNode(name); if (g) { g.level = Math.max(0, Math.min(1, +v || 0)); setLevel(g, g.level, fade); } return mixer; },
  /** Dips a channel to `to` (of its volume) for `hold` seconds, then brings it back over `back` seconds. */
  duck(name = 'music', to = .3, hold = .6, back = .5) {
    const g = channelNode(name); if (!g) return mixer;
    const t = g.context.currentTime, lv = g.level;
    g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(lv * to, t, .03); g.gain.setTargetAtTime(lv, t + Math.max(0, hold), Math.max(.01, back / 3));
    return mixer;
  },
  /** Echo for everything: a room name, or { reverb 0..1, size (seconds of tail), echo 0..1, delay (seconds) }. */
  room(r = 'none') {
    const m = mixGraph(); if (!m) return mixer;
    const o = typeof r === 'string' ? (ROOMS[r] || ROOMS.none) : { ...ROOMS.none, ...r }, t = m.ctx.currentTime;
    const key = (o.size || 1).toFixed(2);
    if (o.reverb > 0 && m.roomKey !== key) { m.verb.buffer = impulse(m.ctx, Math.min(4, o.size || 1), 2.5); m.roomKey = key; }
    m.verbGain.gain.setTargetAtTime(Math.max(0, Math.min(1, o.reverb || 0)), t, .05);
    m.delay.delayTime.setTargetAtTime(Math.max(.02, Math.min(1.4, o.delay || .25)), t, .05);
    m.fb.gain.setTargetAtTime(Math.min(.7, (o.echo || 0) * 1.4), t, .05);
    m.echoGain.gain.setTargetAtTime(Math.max(0, Math.min(1, o.echo || 0)), t, .05);
    return mixer;
  },
  /** 0..1: how muffled everything sounds (0 clear, 1 deep underwater), fading over `fade` seconds. */
  muffle(x = 0, fade = .15) {
    const m = mixGraph(); if (!m) return mixer;
    const k = Math.max(0, Math.min(1, +x || 0)), hz = 20000 * Math.pow(250 / 20000, k);
    m.muffle.frequency.setTargetAtTime(hz, m.ctx.currentTime, Math.max(.005, fade / 3));
    return mixer;
  },
  /** A channel of your own (or a built-in one) to set: mixer.channel('alarm').volume(.5). */
  channel(name) { return { volume: (v, f) => mixer.volume(name, v, f), duck: (...a) => mixer.duck(name, ...a) }; },
  /** Back to normal: every channel at full volume, no room, no muffle. The app does this between rounds. */
  reset() {
    if (!mix) return mixer;
    for (const g of mix.buses.values()) { g.level = 1; setLevel(g, 1, .05); }
    mixer.room('none'); mixer.muffle(0, .05);
    return mixer;
  },
};
register('mixer', { stop: () => mixer.reset() });

/* ---------- speech: text to speech ---------- */
// Characters that talk out loud, with no sound files: the phone's own voices (iPhone and Android
// speech, through @capacitor-community/text-to-speech; the browser's speechSynthesis on the web).
//   say('Watch out!', { pitch: 1.4, rate: 1.1 })      // returns a promise that ends when it's said
//   say('Bonjour', { lang: 'fr-FR' });  stopTalking();  talking() -> true while speaking
// pitch .5..2, rate .5..2 (1 normal), volume 0..1 (the player's volume applies on top). Lines are
// cut at 300 characters. A new line stops the one before. Music dips while it talks. Speech
// follows the player's mute; it stops when the round ends. Always show the words on screen too
// (some players play muted, and not every phone has every language).
const TTS = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech') ? registerPlugin('TextToSpeech') : null;
let talkingNow = 0, talkGen = 0;
const clampN = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : d));
export function say(text, { pitch = 1, rate = 1, volume = 1, lang = 'en-GB' } = {}) {
  text = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  stopTalking();
  if (!text || sound.muted || !sound.volume) return Promise.resolve(false);
  const gen = ++talkGen, vol = clampN(volume, 0, 1, 1) * sound.volume;
  const o = { text, lang: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang) ? lang : 'en-GB', pitch: clampN(pitch, .5, 2, 1), rate: clampN(rate, .5, 2, 1), volume: vol };
  talkingNow++;
  const g = channelNode('music');
  if (g) { const t = g.context.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(g.level * .35, t, .05); }
  const done = ok => { talkingNow = Math.max(0, talkingNow - 1); if (gen === talkGen && g) setLevel(g, g.level, .4); return ok; };
  if (TTS) return TTS.speak({ ...o, category: 'ambient', queueStrategy: 0 }).then(() => done(true), () => done(false));
  const S = globalThis.speechSynthesis, U = globalThis.SpeechSynthesisUtterance;
  if (!S || !U) return Promise.resolve(done(false));
  return new Promise(res => {
    try {
      const u = new U(o.text); u.lang = o.lang; u.pitch = o.pitch; u.rate = o.rate; u.volume = o.volume;
      const v = S.getVoices?.().find(x => x.lang === o.lang) || S.getVoices?.().find(x => x.lang?.startsWith(o.lang.slice(0, 2)));
      if (v) u.voice = v;
      u.onend = () => res(done(true)); u.onerror = () => res(done(false));
      S.speak(u);
    } catch { res(done(false)); }
  });
}
/** Stops speaking straight away. */
export function stopTalking() {
  talkGen++;
  if (talkingNow) { talkingNow = 0; const g = mix?.buses.get('music'); if (g) setLevel(g, g.level, .3); }
  try { if (TTS) TTS.stop(); else globalThis.speechSynthesis?.cancel(); } catch { /* none */ }
}
/** True while a line is being spoken. */
export const talking = () => talkingNow > 0;
register('speech', { stop: stopTalking, pause: stopTalking });
