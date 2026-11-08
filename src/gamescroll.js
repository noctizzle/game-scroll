// gamescroll.js: the one thing a game imports. Everything the app offers games is on `gs`,
// grouped by what it's for, and it sends each call to the right place underneath (our own kits,
// or the best free library for the job). Games can't reach anything else in the app.
//
//   import gs from '../gamescroll.js';
//   const { sfx, sounds } = gs.sound, { haptic } = gs.device, { clamp, rnd } = gs.util;
//
// What's on it (docs/maker-kit.md has the full guide):
//   gs.sound     beeps, ready-made sounds, ZzFX designs, music loops, Tone.js synths
//   gs.device    haptics, tilt, shake, mic, camera, compass
//   gs.util      clamp, rnd, pix, hash, fmt, disc, flickTracker
//   gs.math      seeded random, daily seed, smooth noise, vectors, overlap tests, Grid, Timers
//   gs.palettes  the Pocket colour sets (PAL, SHELL, C16)
//   gs.juice     particles, shake, tweens, pop-ups, flashes
//   gs.effects   one-call moments: feel.coin(), feel.hit(), feel.boom() ...
//   gs.controls  sticks, buttons, gestures, keys
//   gs.pad       game controllers: analog sticks, triggers, rumble
//   gs.moves     motion moves: swing, punch, throw, flip, twist, knock, shake
//   gs.pixel     pixel text and sprites drawn from text
//   gs.gfx       2D drawing helpers (shaded boxes, balls, glow, backdrops)
//   gs.bricks    toy-brick drawing, 2D and 3D
//   gs.physics   2D physics (Rapier): spinning shapes, hinges, ropes, springs. Also the simple World/Body.
//   gs.physics3d 3D physics (Rapier): bodies, level collisions, ray casts, a character mover
//   gs.ai        steering, flocking, path finding, state machines (Yuka)
//   gs.toon      Classic Console 3D (cel-shaded)       gs.hd   Next Gen 3D (PBR, bloom, shadows)
//   gs.ar        AR 3D (camera + gyro)                 gs.fx3d 3D text, 3D particles, outline/glitch/trails
//   gs.vision    face and hand tracking (MediaPipe)    gs.geo  distances and bearings for location games
//   gs.things    game objects: tags, "what did this hit", nearest, reuse
//   gs.rounds    scenes (intro, play, clear...) with timed changes, and level lists
//   gs.pacing    spawners, waves with breathers, a difficulty director
//   gs.aim       touch aim assist: sticky aim, pull onto targets, auto fire
//   gs.senses    enemy sight cones, hearing, memory and moods (calm, suspicious, alert, searching)
//   gs.camera2d  Camera2D: follow with a dead zone, look-ahead, zoom, level bounds, parallax layers
//   gs.tiles     TileMap.fromText(): levels as text, walls, one-way platforms, slopes, marks, rays
//   gs.movers    Platformer (coyote time, jump buffer, wall jump) and TopDown movement through tiles
//   gs.anim      Animator: sprite animation states with frame events
//   gs.story     Story (branching dialogue in ink; lazy) and Typewriter text
//   gs.replay    Ghost (record and race a run; packs for api.save), Recorder / Replayer (whole rounds)
//   gs.look2d    Lights (with shadows off walls), Screen (CRT, bloom, glitch...; lazy), Batch (fast WebGL sprites; lazy)
//   gs.brains    Tiny Brains: small neural networks that learn as you play, with guard rails (Brain, Wave, Imagine)
//   gs.tweak     live sliders for tuning numbers while you play (npm run dev only; the starting values elsewhere)
//   gs.prefs     the player's Reduce motion setting (read only): reduceMotion, motion
//   gs.camera    3D camera rigs: chase, shoulder, first person, top, side, orbit, rail; no wall clipping
//   gs.nav3d     3D path finding on a walkable map made from your level (Recast)
//   gs.characters  heads that look, limbs that reach (IK), feet that step, springy hit reactions
//   gs.THREE     three.js itself
//
// The 3D styles and AI load when a game that uses them is on its way (the app does this; games don't
// need to), so the app opens fast. Big libraries (physics, 3D path finding, 3D effects, face
// tracking, Tone.js) load the first time a game uses them:
// make those things in make() or reset() and the app shows "Loading…" until they're in.

import * as sfx from './sfx.js';
import * as util from './util.js';
import * as palettes from './palettes.js';
import * as device from './kit/device.js';
import * as gfx from './kit/gfx.js';
import * as juice from './kit/juice.js';
import * as sound from './kit/sound.js';
import * as controls from './kit/controls.js';
import * as physics2d from './kit/physics2d.js';
import * as physics from './kit/physics.js';
import * as geo from './kit/geo.js';
import * as math from './kit/math.js';
import * as pixel from './kit/pixel.js';
import * as effects from './kit/effects.js';
import * as moves from './kit/motion.js';
import * as pad from './kit/gamepad.js';
import * as vision from './kit/vision.js';
import * as things from './kit/things.js';
import * as rounds from './kit/rounds.js';
import * as pacing from './kit/pacing.js';
import * as aim from './kit/aim.js';
import * as senses from './kit/senses.js';
import * as prefsKit from './kit/prefs.js';
import * as camera2d from './kit/camera2d.js';
import * as tiles from './kit/tiles.js';
import * as movers from './kit/movers.js';
import * as anim from './kit/anim.js';
import * as story from './kit/story.js';
import * as replay from './kit/replay.js';
import * as look2d from './kit/look2d.js';
import { tweak } from './kit/tweak.js';
import * as brains from './kit/brains.js';
import { StillLoading } from './kit/lazy.js';

// App-only exports games never get: raw storage, the player's settings, the unrounded location,
// the install's anonymous id, and the hooks the app uses to stop things between rounds.
export const HIDDEN = {
  sound: ['sound', 'setSound', 'audio', 'stopMusic', 'pauseMusic', 'resumeMusic'],
  util: ['store', 'deviceId'],
  device: ['location', 'hapticSettings', 'setHaptics'],
  moves: ['stopMoves'],
  pad: ['pollPads'],
  vision: ['stopVision'],
  hd: ['currentView'],
};

function pick(name, ...mods) {
  const hide = HIDDEN[name] || [], out = {};
  for (const m of mods) for (const k of Object.keys(m)) if (!hide.includes(k) && !(k in out)) out[k] = m[k];
  return Object.freeze(out);
}

// Parts that load on first use, so the app opens without them (three.js alone is most of the app's
// code). The app loads the parts a streamed game needs before running it, so games don't notice;
// if a part isn't in yet, reading it throws StillLoading and the app shows "Loading…".
const GROUPS = {
  '3d': { parts: ['toon', 'hd', 'ar', 'bricks', 'physics3d', 'fx3d', 'camera', 'nav3d', 'characters', 'THREE'],
    load: () => import('./gs-3d.js').then(m => ({ toon: pick('toon', m.toon), hd: pick('hd', m.hd), ar: pick('ar', m.ar), bricks: pick('bricks', m.bricks),
      physics3d: pick('physics3d', m.physics3d), fx3d: pick('fx3d', m.fx3d), camera: pick('camera', m.camera), nav3d: pick('nav3d', m.nav3d),
      characters: pick('characters', m.characters), THREE: m.THREE })) },
  ai: { parts: ['ai'], load: () => import('./kit/ai.js').then(m => ({ ai: pick('ai', m) })) },
};
const groupOf = {}; for (const [g, d] of Object.entries(GROUPS)) for (const p of d.parts) groupOf[p] = g;
const loaded = {}, loading = {};
function loadGroup(g) {
  return loading[g] ||= GROUPS[g].load().then(parts => { Object.assign(loaded, parts); return parts; }, e => { delete loading[g]; throw e; });
}
/** The parts that load later. */
export const LAZY_PARTS = Object.freeze(Object.keys(groupOf));
/** Loads the parts these names need ('toon', 'hd.HDView', ...), or every part if none are given. */
export function loadParts(names) {
  const tops = names ? [...new Set(names.map(n => n.split('.')[0]))] : LAZY_PARTS;
  return Promise.all([...new Set(tops.filter(t => groupOf[t]).map(t => groupOf[t]))].map(loadGroup)).then(() => {});
}
/** Are these parts loaded? */
export const partsReady = names => (names || LAZY_PARTS).every(n => !groupOf[n.split('.')[0]] || n.split('.')[0] in loaded);
/**
 * Could this app give a game these names? Parts that haven't loaded yet count by name only (the
 * app checks them in full once they're in, before running the game).
 */
export function offers(names) {
  return names.every(n => {
    const ks = n.split('.'); if (groupOf[ks[0]] && !(ks[0] in loaded)) return true;
    let o = gs; for (const k of ks) { if (o == null || !(k in Object(o))) return false; o = o[k]; } return true;
  });
}

const core = {
  sound: pick('sound', sound, sfx),
  device: pick('device', device),
  util: pick('util', util),
  math: pick('math', math),
  palettes: pick('palettes', palettes),
  juice: pick('juice', juice),
  effects: pick('effects', effects),
  controls: pick('controls', controls),
  pad: pick('pad', pad),
  moves: pick('moves', moves),
  pixel: pick('pixel', pixel),
  gfx: pick('gfx', gfx),
  physics: pick('physics', physics, physics2d),
  vision: pick('vision', vision),
  geo: pick('geo', geo),
  things: pick('things', things),
  rounds: pick('rounds', rounds),
  pacing: pick('pacing', pacing),
  aim: pick('aim', aim),
  senses: pick('senses', senses),
  prefs: prefsKit.prefs,
  camera2d: pick('camera2d', camera2d),
  tiles: pick('tiles', tiles),
  movers: pick('movers', movers),
  anim: pick('anim', anim),
  story: pick('story', story),
  replay: pick('replay', replay),
  look2d: pick('look2d', look2d),
  tweak,
  brains: pick('brains', brains),
};
const gs = {};
for (const [k, v] of Object.entries(core)) Object.defineProperty(gs, k, { value: v, enumerable: true });
for (const k of LAZY_PARTS) Object.defineProperty(gs, k, {
  enumerable: true,
  get() { if (k in loaded) return loaded[k]; throw new StillLoading('gs.' + k, loadGroup(groupOf[k])); },
});
Object.freeze(gs);
export default gs;
