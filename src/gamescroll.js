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
//   gs.camera    3D camera rigs: chase, shoulder, first person, top, side, orbit, rail; no wall clipping
//   gs.nav3d     3D path finding on a walkable map made from your level (Recast)
//   gs.characters  heads that look, limbs that reach (IK), feet that step, springy hit reactions
//   gs.THREE     three.js itself
//
// Big parts (physics, 3D path finding, 3D effects, face tracking, Tone.js) load the first time a game uses them:
// make those things in make() or reset() and the app shows "Loading…" until they're in.

import * as sfx from './sfx.js';
import * as util from './util.js';
import * as palettes from './palettes.js';
import * as device from './kit/device.js';
import * as gfx from './kit/gfx.js';
import * as bricks from './kit/bricks.js';
import * as toon from './kit/toon3d.js';
import * as hd from './kit/hd3d.js';
import * as ar from './kit/ar3d.js';
import * as juice from './kit/juice.js';
import * as sound from './kit/sound.js';
import * as controls from './kit/controls.js';
import * as physics2d from './kit/physics2d.js';
import * as physics from './kit/physics.js';
import * as physics3d from './kit/physics3d.js';
import * as geo from './kit/geo.js';
import * as math from './kit/math.js';
import * as ai from './kit/ai.js';
import * as pixel from './kit/pixel.js';
import * as effects from './kit/effects.js';
import * as moves from './kit/motion.js';
import * as pad from './kit/gamepad.js';
import * as fx3d from './kit/fx3d.js';
import * as vision from './kit/vision.js';
import * as things from './kit/things.js';
import * as rounds from './kit/rounds.js';
import * as pacing from './kit/pacing.js';
import * as aim from './kit/aim.js';
import * as senses from './kit/senses.js';
import * as camera from './kit/camera.js';
import * as nav3d from './kit/nav3d.js';
import * as characters from './kit/characters.js';
import * as THREE from 'three';

// App-only exports games never get: raw storage, the player's settings, the unrounded location,
// and the hooks the app uses to stop things between rounds.
export const HIDDEN = {
  sound: ['sound', 'setSound', 'audio', 'stopMusic', 'pauseMusic', 'resumeMusic'],
  util: ['store'],
  device: ['location', 'hapticSettings', 'setHaptics'],
  moves: ['stopMoves'],
  pad: ['pollPads'],
  vision: ['stopVision'],
};

function pick(name, ...mods) {
  const hide = HIDDEN[name] || [], out = {};
  for (const m of mods) for (const k of Object.keys(m)) if (!hide.includes(k) && !(k in out)) out[k] = m[k];
  return Object.freeze(out);
}

const gs = Object.freeze({
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
  bricks: pick('bricks', bricks),
  physics: pick('physics', physics, physics2d),
  physics3d: pick('physics3d', physics3d),
  ai: pick('ai', ai),
  toon: pick('toon', toon),
  hd: pick('hd', hd),
  ar: pick('ar', ar),
  fx3d: pick('fx3d', fx3d),
  vision: pick('vision', vision),
  geo: pick('geo', geo),
  things: pick('things', things),
  rounds: pick('rounds', rounds),
  pacing: pick('pacing', pacing),
  aim: pick('aim', aim),
  senses: pick('senses', senses),
  camera: pick('camera', camera),
  nav3d: pick('nav3d', nav3d),
  characters: pick('characters', characters),
  THREE,
});
export default gs;
