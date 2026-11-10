// Music composer: writes an original looping tune from a mood and a seed, ready for music().
// The same seed always gives the same tune, so each game keeps its own soundtrack without anyone
// typing out notes. Music theory (scales, modes, intervals) comes from Tonal (MIT); the writing
// (chords, bass lines, a melody with a motif that repeats and answers itself, drums) is ours.
//
//   const tune = music(compose({ mood: 'happy', seed: 'my-game' }));   // in update(): if (!tune.playing) tune.start()
//   tune.intensity(.8)   // brings in the arpeggio, busier drums and a harmony line (they are layers)
//
// Returns the parts music() takes (tempo, swing, layers, lead, bass, pad, pad2, arp, drums, drums2,
// lead2) plus `info` (key, mode, chords, and win / lose jingles for notes()).
import { Scale, Interval, Midi } from 'tonal';
import { rng } from './math.js';

const STEPS = 8;   // music() steps are eighth notes: 8 to a bar of four beats

// Each mood: modes to choose from, tempo range, chord progressions (scale degrees, 1-based), and the
// bass, drum and rhythm styles that suit it.
export const MOODS = {
  happy:  { modes: ['major'], tempo: [116, 138], swing: 0, prog: [[1, 5, 6, 4], [1, 4, 5, 1], [1, 6, 4, 5], [4, 5, 1, 1], [1, 4, 6, 5]], bass: ['pump', 'walk'], drums: 'pop', busy: .6 },
  calm:   { modes: ['major', 'lydian'], tempo: [78, 98], swing: 0, prog: [[1, 4, 1, 5], [1, 3, 4, 4], [1, 6, 2, 5], [4, 1, 4, 1]], bass: ['held'], drums: 'soft', busy: .35 },
  tense:  { modes: ['minor', 'harmonic minor'], tempo: [128, 156], swing: 0, prog: [[1, 1, 6, 7], [1, 6, 3, 7], [1, 4, 5, 1], [1, 7, 6, 5]], bass: ['drive'], drums: 'drive', busy: .55 },
  spooky: { modes: ['phrygian', 'harmonic minor'], tempo: [76, 96], swing: 0, prog: [[1, 2, 1, 7], [1, 6, 2, 1], [1, 1, 2, 2]], bass: ['sparse'], drums: 'sparse', busy: .3 },
  heroic: { modes: ['mixolydian', 'major'], tempo: [108, 128], swing: 0, prog: [[1, 7, 4, 1], [1, 4, 7, 4], [6, 7, 1, 1], [1, 5, 4, 5]], bass: ['march', 'pump'], drums: 'march', busy: .55 },
  sad:    { modes: ['minor', 'dorian'], tempo: [68, 88], swing: 0, prog: [[1, 6, 3, 7], [1, 4, 6, 5], [6, 4, 1, 5]], bass: ['held'], drums: 'soft', busy: .35 },
  silly:  { modes: ['major', 'mixolydian'], tempo: [138, 166], swing: .22, prog: [[1, 4, 1, 5], [1, 2, 5, 1], [1, 6, 2, 5]], bass: ['bounce'], drums: 'bounce', busy: .65 },
  chase:  { modes: ['dorian', 'minor'], tempo: [148, 174], swing: 0, prog: [[1, 7, 1, 7], [1, 4, 1, 4], [1, 6, 7, 1]], bass: ['drive'], drums: 'drive', busy: .6 },
  puzzle: { modes: ['dorian', 'lydian'], tempo: [94, 112], swing: .12, prog: [[1, 4, 1, 4], [1, 3, 4, 5], [2, 5, 1, 1]], bass: ['walk', 'sparse'], drums: 'soft', busy: .45 },
};

const DRUMS = {   // one bar each: [calm layer, busy layer]
  pop:    ['k . h . s . h .', 'k h h h s h k h'],
  soft:   ['k . . . . . h .', 'k . h . s . h h'],
  drive:  ['k h k h s h k h', 'kh h kh h sh h kh h'],
  sparse: ['k . . . . . . .', 'k . . h s . . h'],
  march:  ['k . s . k k s .', 'kh h sh h kh kh sh s'],
  bounce: ['k . h k s . h .', 'k h h k s h h s'],
};
const FILL = 's s s s s s ks ks';   // the busy layer's last bar
const BASS = {   // R root, F fifth, O octave, '.' rest, '-' hold
  pump: 'R . R . R . F .', walk: 'R . F . O . F .', held: 'R - - - - - - -', drive: 'R R R R R R R R',
  bounce: 'R . . R . . F .', sparse: 'R - - - . . . .', march: 'R . R F R . F .',
};
const RHYTHMS = [   // n note, '-' hold, '.' rest
  'n - n . n n n -', 'n . n . n - - .', 'n n n - n . n .', 'n - - - n - n -', 'n . . n . . n .',
  'n - n n n - . .', 'n n . n n . n -', '. n n n n - - -', 'n - - n - - n -', 'n n n n n - - -',
];
const CADENCE = ['n - - - - - . .', 'n - n - n - - -', 'n n n - - - . .'];
const TONICS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb'];

const name = m => Midi.midiToNoteName(m, { sharps: true });

/**
 * compose({ mood, seed, tempo, key, bars }): a new tune. mood: one of MOODS (happy, calm, tense,
 * spooky, heroic, sad, silly, chase, puzzle). seed: any string or number (the game's id is a good
 * one). tempo and key override the mood's choice. bars: 4 or 8 (8 adds an answering second half).
 */
export function compose({ mood = 'happy', seed = 1, tempo = null, key = null, bars = 4 } = {}) {
  const M = MOODS[mood] || MOODS.happy, r = rng(typeof seed === 'number' ? seed : String(seed) + '|' + mood);
  const tonic = key || r.pick(TONICS), mode = r.pick(M.modes);
  const steps = Scale.get(`${tonic} ${mode}`).intervals.map(Interval.semitones);   // 7 semitone offsets
  const root = Midi.toMidi(tonic + '3');
  // scale degree (0-based, any octave) -> MIDI note
  const deg = (d, base = root) => base + steps[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  bars = bars === 8 ? 8 : 4;
  const prog = r.pick(M.prog).map(d => d - 1);
  const chords = []; for (let b = 0; b < bars; b++) chords.push(bars === 8 && b >= 4 && b < 7 ? prog[(b + 1) % 4] : prog[b % 4]);
  if (bars === 8) chords[7] = 0;   // the second half comes home

  const bassStyle = r.pick(M.bass), bass = [], pad = [], pad2 = [], arp = [], drums = [], drums2 = [];
  const [d1, d2] = DRUMS[M.drums];
  chords.forEach((c, b) => {
    const R = root - 12 + steps[c % 7] - (steps[c % 7] > 6 ? 12 : 0), F = R + deg(c + 4) - deg(c);   // the bass sits an octave down
    for (const tok of BASS[bassStyle].split(' ')) bass.push(tok === 'R' ? name(R) : tok === 'F' ? name(F) : tok === 'O' ? name(R + 12) : tok);
    pad.push(name(deg(c + 2, root + 12)), ...'- - - - - - -'.split(' '));
    pad2.push(name(deg(c + 4, root + 12)), ...'- - - - - - -'.split(' '));
    const tones = [deg(c, root + 12), deg(c + 2, root + 12), deg(c + 4, root + 12), deg(c + 7, root + 12)];
    const order = r.pick([[0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 1, 3, 0, 2, 1, 3], [3, 2, 1, 0, 1, 2, 3, 2], [0, 1, 2, 1, 0, 1, 2, 3]]);
    for (const i of order) arp.push(name(tones[i]));
    drums.push(...(b === 0 ? d1.replace(/^k/, 'kc') : d1).split(' '));
    drums2.push(...(b === bars - 1 ? FILL : d2).split(' '));
  });

  // The melody: a two-bar motif, then the motif again fitted to the next chords, then a cadence home.
  const lead = [], lead2 = [], lo = 7, hi = 7 + 11;   // degrees across about an octave and a half above middle
  let at = 7 + r.int(0, 4);
  const chordTone = (d, c) => [0, 2, 4].some(k => ((d - c - k) % 7 + 7) % 7 === 0);
  function bar(rhythm, c, lastBar) {
    const tokens = rhythm.split(' '), out = [];
    tokens.forEach((t, i) => {
      if (t !== 'n') { out.push(t); return; }
      const strong = i % 4 === 0;
      let next = at + r.pick(M.busy > .5 ? [-2, -1, -1, 0, 1, 1, 2, 3, -3] : [-2, -1, -1, 0, 1, 1, 2]);
      if (strong) for (let k = 0; k < 4 && !chordTone(next, c); k++) next += next > at ? -1 : 1;
      if (lastBar && i === tokens.lastIndexOf('n')) next = Math.round(at / 7) * 7;   // home on the key note
      at = Math.max(lo, Math.min(hi, next));
      out.push(at);
    });
    return out;
  }
  const motif = [r.pick(RHYTHMS), r.pick(RHYTHMS)];
  if (r() > M.busy) motif[1] = motif[1].replace(/n n/g, 'n -');   // calmer moods hold notes longer
  const degs = [];
  for (let b = 0; b < bars; b++) {
    const last = b === bars - 1, rh = last ? r.pick(CADENCE) : motif[b % 2];
    if (b >= 2 && !last && b % 2 === 0 && degs[b - 2]) {   // the motif again, moved to fit this chord
      const shift = chords[b] - chords[b - 2];
      degs.push(degs[b - 2].map(x => typeof x === 'number' ? Math.max(lo, Math.min(hi, x + (Math.abs(shift) <= 3 ? shift : shift - Math.sign(shift) * 7))) : x));
      const tail = degs[b].filter(x => typeof x === 'number'); if (tail.length) at = tail[tail.length - 1];
    } else degs.push(bar(rh, chords[b], last));
  }
  for (const b of degs) for (const x of b) {
    lead.push(typeof x === 'number' ? name(deg(x, root + 12)) : x);
    lead2.push(typeof x === 'number' ? name(deg(x + 2, root + 12)) : x);
  }

  const bpm = tempo || r.int(M.tempo[0], M.tempo[1]);
  const jingle = d => d.map(x => name(deg(x, root + 12)) + ':2').join(' ');
  return {
    tempo: bpm, swing: M.swing,
    layers: { arp: .35, drums2: .6, lead2: .85 },
    lead: lead.join(' '), bass: bass.join(' '), pad: pad.join(' '), pad2: pad2.join(' '), arp: arp.join(' '),
    drums: drums.join(' '), drums2: drums2.join(' '), lead2: lead2.join(' '),
    info: Object.freeze({
      mood, key: tonic, mode, bars, chords: chords.map(c => c + 1),
      win: jingle([7, 9, 11, 14]), lose: jingle([11, 10, 8, 7]).replace(/:2/g, ':3'),
    }),
  };
}
