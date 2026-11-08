// Types for gs, the one thing a game imports (`import gs from '../gamescroll.js'`). Editors and AI
// tools read this file to autocomplete gs.* and the game definition; nothing ships from it. Big
// libraries (three.js, Rapier, Yuka, Tone) are typed loosely here: their own docs have the details.
// `npm run types-check` fails if a part of gs is missing from this file.

type Ctx = CanvasRenderingContext2D;
type XY = { x: number; y: number };
type XYZ = { x: number; y: number; z: number };
type Colour = string | string[];
type Loose = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- the game ----------

export interface GameApi {
  /** Shows the score (the app draws it). */
  score(n: number): void;
  /** Ends the round: the app shows the game-over screen. */
  over(): void;
  /** Ends the round as a win. */
  win(): void;
  /** Does the player own this shop item? */
  has(itemId: string): boolean;
  /** Saves up to 2 KB of JSON for this game. */
  save(data: unknown): void;
  load<T>(fallback: T): T;
  clearSave(): void;
  /** The player's rounded position (needs `location` in the definition), or null. */
  location(): Promise<{ lat: number; lon: number; accuracy?: number } | null>;
  watchLocation(cb: (p: { lat: number; lon: number }) => void): () => void;
  [more: string]: Loose;
}

export interface Game {
  /** Set up everything for a new round here (Play again calls it too). */
  reset(): void;
  /** dt in seconds. */
  update(dt: number): void;
  /** Draw the whole frame in w × h game units. */
  draw(c: Ctx): void;
  down?(x: number, y: number, id: number): void;
  move?(x: number, y: number, pressed: boolean, id: number): void;
  up?(x: number, y: number, id: number): void;
  /** Desktop keys and controllers. */
  key?(k: string, isDown: boolean): void;
  /** Effects that keep playing behind the game-over screen. */
  fx?(dt: number): void;
  /** Fluid games (with maxW / maxH): the new size. */
  resize?(w: number, h: number): void;
  debug?(c: Ctx): void;
  pause?(): void;
  resume?(): void;
  [more: string]: Loose;
}

export interface GameDef {
  /** Same as the file name. */
  id: string;
  title: string;
  /** '<Style> · <Genre>', like 'Casual · Reflex'. */
  tag: string;
  /** One sentence that explains how to play. */
  hint: string;
  /** The score that counts as a win (a decent player gets there in about a minute). */
  goal: number;
  w: number;
  h: number;
  maxW?: number;
  maxH?: number;
  retro?: boolean;
  era?: 'color' | 'advance' | 'console' | 'nextgen' | 'ar';
  pal?: string;
  creator?: string;
  location?: 'coarse' | 'precise';
  make(api: GameApi): Game;
  [more: string]: Loose;
}

// ---------- core parts (always there) ----------

type SoundFx = (pitch?: number) => void;
export interface SoundPart {
  /** One beep: frequency, duration (s), wave, volume, pitch slide (Hz). */
  sfx(f?: number, d?: number, type?: OscillatorType, vol?: number, slide?: number): void;
  /** Ready-made sounds. */
  sounds: Record<'coin' | 'jump' | 'hurt' | 'hit' | 'boom' | 'laser' | 'shoot' | 'powerup' | 'select' | 'blip' | 'pop' | 'splash' | 'click' | 'win' | 'lose' | 'levelup' | 'countdown', SoundFx> & Record<string, SoundFx>;
  /** A note name ('C5', 'F#3') to Hz. */
  freq(note: string | number): number;
  tone(f: number, o?: { len?: number; wave?: OscillatorType; vol?: number; slide?: number; attack?: number; at?: number }): void;
  noise(len?: number, o?: { vol?: number; from?: number; to?: number; filter?: BiquadFilterType; q?: number; at?: number }): void;
  /** Plays a tune like 'C5 E5 G5 - C6' ('-' is a rest). */
  notes(seq: string, o?: { len?: number; gap?: number; wave?: OscillatorType; vol?: number }): void;
  /** Background music from patterns; start it in update(), not reset(). */
  music(o?: { tempo?: number; vol?: number; swing?: number; lead?: string; bass?: string; drums?: string; [part: string]: Loose }): { stop(): void; pause(): void; resume(): void; [k: string]: Loose };
  /** ZzFX sound from its numbers (zzfx.micro). */
  zzfx(...params: number[]): void;
  zsound(...params: number[]): () => void;
  /** Tone.js (lazy: call it in make() or reset()). */
  Tone(): Loose;
}

export type HapticKind = 'light' | 'medium' | 'heavy' | 'tick' | 'success' | 'warning' | 'error';
export interface DevicePart {
  haptic(kind?: HapticKind): void;
  /** Morse-like buzz pattern: 0 short, 1 long. */
  buzz(pattern: (number | boolean)[], short?: number, long?: number, gap?: number): void;
  canBuzz(): boolean;
  /** Ask for a sensor before Play: 'motion', 'mic', 'camera'... */
  want(feature: string): void;
  /** Tilt -1..1 on each axis, or null when there's no sensor (give a touch fallback). */
  tilt(): XY | null;
  calibrateTilt(): void;
  onMotion(cb: (m: Loose) => void): () => void;
  onShake(cb: () => void): () => void;
  orientation(): Loose;
  /** Compass heading in degrees, or null. */
  heading(): number | null;
  faceDown(): boolean | null;
  startMic(): Promise<Loose>;
  stopMic(): void;
  startCamera(): Promise<Loose>;
  stopCamera(): void;
}

export interface UtilPart {
  clamp(v: number, a: number, b: number): number;
  rnd(a: number, b: number): number;
  /** Draws a tiny pixel map: each char keys into col, '.' is clear. */
  pix(c: Ctx, map: string[], x: number, y: number, col: Record<string, string>): void;
  disc(c: Ctx, x: number, y: number, r: number): void;
  hash(str: string): number;
  fmt(n: number): string;
  flickTracker(): Loose;
}

export interface Rng { (): number; int(a: number, b: number): number; pick<T>(list: T[]): T; [k: string]: Loose }
export interface Timer { cancel(): void; dead: boolean }
export interface MathPart {
  /** Seeded random numbers (same seed, same run). */
  rng(seed?: number | string): Rng;
  /** A seed that's the same for everyone today. */
  daily(salt?: string, date?: Date): number;
  seedOf(s: string): number;
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
  noiseSeed(seed: number | string): void;
  makeNoise(seed: number | string): (x: number, y: number, z?: number) => number;
  fbm(x: number, y: number, octaves?: number): number;
  vec: Loose;
  overlap(a: Loose, b: Loose): boolean;
  angleDiff(a: number, b: number): number;
  wrap(v: number, max: number): number;
  Grid: new (w: number, h: number, fill?: Loose) => Loose;
  /** Game timing that pauses with the game: timers.after(1.5, fn); timers.update(dt) each frame. */
  Timers: new () => { after(sec: number, fn: () => void): Timer; every(sec: number, fn: () => void): Timer; update(dt: number): void; clear(): void };
}

export interface PalettesPart { PAL: Record<string, string[]>; SHELL: Loose; C16: string[] }

export interface BurstOpts { n?: number; speed?: number; life?: number; size?: number; color?: Colour; shape?: string; angle?: number; arc?: number; gravity?: number; drag?: number; glow?: boolean }
export declare class Juice {
  constructor(o?: { pixel?: boolean; max?: number; font?: string; size?: number; color?: string });
  burst(x: number, y: number, o?: BurstOpts): this;
  emit(x: number, y: number, vx: number, vy: number, o?: BurstOpts): this;
  shake(amount: number): this;
  pop(x: number, y: number, text: string, o?: { color?: string; size?: number }): this;
  tween(obj: object, props: object, dur: number, ease?: (t: number) => number, delay?: number): Loose;
  flash(color?: string, a?: number, dur?: number): this;
  /** Hit-stop: freeze the action for a moment. */
  freeze(sec?: number): this;
  readonly frozen: boolean;
  update(dt: number): void;
  begin(c: Ctx): void;
  end(c: Ctx, W?: number, H?: number): void;
  clear(): void;
}
export interface JuicePart {
  Juice: typeof Juice;
  Particles: Loose; Popups: Loose; Shake: Loose; Tweens: Loose;
  ease: Record<string, (t: number) => number>;
  lerp(a: number, b: number, t: number): number;
  /** Smoothly approach target (frame-rate independent). */
  approach(cur: number, target: number, rate: number, dt: number): number;
  pulse(t: number, period?: number): number;
}

export declare class Feel {
  constructor(o?: { pixel?: boolean; sound?: boolean; buzz?: boolean });
  juice: Juice;
  readonly frozen: boolean;
  update(dt: number): this;
  begin(c: Ctx): this;
  end(c: Ctx, W: number, H: number): this;
  clear(): this;
  coin(x: number, y: number, o?: { color?: string; text?: string; pitch?: number }): this;
  hit(x: number, y: number, o?: { color?: string; power?: number }): this;
  boom(x: number, y: number, o?: { size?: number; color?: Colour }): this;
  hurt(x?: number, y?: number): this;
  jump(x: number, y: number): this;
  land(x: number, y: number, speed?: number): this;
  shoot(x: number, y: number, o?: { color?: string; angle?: number }): this;
  powerup(x: number, y: number, o?: { color?: string; text?: string }): this;
  combo(n: number, x: number, y: number, o?: { color?: string }): this;
  score(x: number, y: number, points: number, o?: { color?: string }): this;
  win(x?: number, y?: number): this;
  lose(): this;
  click(): this;
  play(zzfxParams: number[], buzz?: HapticKind): this;
}

interface Control { wants(x: number, y: number): boolean; release(): void; down(x: number, y: number, id?: number): boolean; move(x: number, y: number, pressed: boolean, id?: number): boolean; up(x: number, y: number, id?: number): boolean; draw(c: Ctx, o?: Loose): void }
export interface ControlsPart {
  /** Virtual thumbstick: x, y (-1..1), mag, angle, active. */
  Stick: new (o?: { x?: number; y?: number; r?: number; floating?: boolean; zone?: number[]; dead?: number; axis?: 'both' | 'x' | 'y'; color?: string }) => Control & { x: number; y: number; readonly mag: number; readonly angle: number; readonly active: boolean; place(x: number, y: number, zone?: number[]): void };
  /** Round button: isDown, pressed() once per press, released(), heldFor. */
  Button: new (o?: { x?: number; y?: number; r?: number; label?: string; zone?: number[]; color?: string }) => Control & { isDown: boolean; readonly heldFor: number; pressed(): boolean; released(): boolean; place(x: number, y: number, zone?: number[]): void };
  /** Tap, double tap, hold and swipe. */
  Gestures: new (o?: Loose) => Loose;
  /** Keyboard state: keys.held('ArrowLeft'), keys.axis(). Pass key(k, isDown) to keys.key. */
  Keys: new () => { key(k: string, isDown: boolean): void; held(k: string): boolean; axis(): XY; clear(): void };
  /** Hands each finger to the first control that wants it. */
  route(...controls: Loose[]): { down: Game['down']; move: Game['move']; up: Game['up'] };
  /** Left stick plus a right stick (right: 'stick') or named buttons (right: ['A', 'B']). */
  twoThumb(W: number, H: number, o?: { right?: 'stick' | string[]; r?: number }): Loose;
}

export interface PadState { [k: string]: Loose; pressed(button: string): boolean }
export interface PadPart { pad(i?: number): PadState | null; pads(): PadState[]; rumble(strength?: number, ms?: number, i?: number): void; padConnected(): boolean }

export type MoveType = 'swing' | 'punch' | 'throw' | 'flip' | 'twist' | 'knock' | 'shake' | 'any';
export interface MovesPart { Moves: new (o?: { sensitivity?: number }) => { on(type: MoveType, fn: (m: { type: string; dir?: string; power?: number }) => void): Loose; update(): void; stop(): void } }

export interface PixelPart {
  text(c: Ctx, str: string, x: number, y: number, o?: { size?: number; font?: 'small' | 'big'; align?: 'left' | 'center' | 'right'; color?: string; outline?: string | null; shadow?: string | null }): void;
  measure(str: string, font?: 'small' | 'big'): number;
  sprite(art: string | string[], palette: Record<string, string> | string[]): Loose;
  anim(frames: (string | string[])[], palette: Record<string, string> | string[], fps?: number): Loose;
  tiles(art: Loose, palette: Loose, tw: number, th: number): Loose;
}

export interface GfxPart {
  shade(hex: string, amt: number): string;
  shadow(c: Ctx, x: number, y: number, rx: number, ry?: number, a?: number): void;
  box(c: Ctx, x: number, y: number, w: number, h: number, col: string, o?: { r?: number; drop?: boolean; rim?: boolean }): void;
  ball(c: Ctx, x: number, y: number, r: number, col: string, o?: { gloss?: number }): void;
  glow(c: Ctx, x: number, y: number, r: number, col: string, a?: number): void;
  backdrop(c: Ctx, x: number, y: number, w: number, h: number, top: string, bottom: string): void;
  post(c: Ctx, w: number, h: number): void;
}

/** Rapier 2D (lazy: make it in make() or reset()). */
export interface PhysicsPart { Physics: new (o?: { gravity?: number; walls?: number[]; [k: string]: Loose }) => Loose; Body: Loose; World: Loose; loadPhysics(): Promise<Loose>; physicsReady(): boolean }

/** Face and hand tracking (lazy). Positions are 0..1, mirrored like a selfie. */
export interface VisionPart {
  Face: new () => { start(): void; stop(): void; update(): void; ready: boolean; found: boolean; x: number; y: number; size: number; yaw: number; pitch: number; roll: number; mouth: number; smile: number; blink: boolean; winkLeft: boolean; winkRight: boolean; brows: number; [k: string]: Loose };
  Hands: new (o?: { max?: number }) => { start(): void; stop(): void; update(): void; ready: boolean; found: boolean; list: Loose[]; first: Loose | null };
  loadVision(): Promise<Loose>;
}

type LatLon = { lat: number; lon: number };
export interface GeoPart { distance(a: LatLon, b: LatLon): number; bearing(a: LatLon, b: LatLon): number; offset(p: LatLon, east: number, north: number): LatLon; toLocal(origin: LatLon, p: LatLon): XY; cellId(p: LatLon, metres?: number): string }

export interface Thing { dead?: boolean; tags?: Set<string>; x?: number; y?: number; r?: number; w?: number; h?: number; update?(dt: number, things: Loose): void; [k: string]: Loose }
export interface ThingsPart {
  Things: new (o?: { plane?: 'xy' | 'xz'; cell?: number }) => {
    add<T extends object>(obj: T, ...tags: string[]): T & Thing;
    reuse<T extends object>(tag: string, make?: () => T, init?: (obj: T) => void): T & Thing;
    kill<T>(obj: T): T;
    tag<T>(obj: T, tag: string): T; untag<T>(obj: T, tag: string): T; is(obj: Loose, tag: string): boolean;
    all(tag?: string): Thing[]; count(tag?: string): number; first(tag: string): Thing | null; each(tag: string, fn: (t: Thing) => void): void;
    touch(a: Thing, b: Thing, pad?: number): boolean;
    hit(obj: Thing, tag: string, pad?: number): Thing | null;
    hitsOf(obj: Thing, tag: string, pad?: number): Thing[];
    hits(tagA: string, tagB: string, fn: (a: Thing, b: Thing) => void, pad?: number): void;
    near(x: number, y: number, radius: number, tag?: string): Thing[];
    nearest(x: number, y: number, tag?: string, ok?: (t: Thing) => boolean): Thing | null;
    cull(x0: number, y0: number, x1: number, y1: number, margin?: number, tag?: string): void;
    update(dt: number): void; sweep(): void; clear(): void;
  };
}

export interface Scene { enter?(scenes: Loose, data?: Loose): void; update?(dt: number, scenes: Loose): void; draw?(c: Ctx, scenes: Loose): void; [input: string]: Loose }
export interface RoundsPart {
  Scenes: new (scenes: Record<string, Scene>, start: string, o?: { fade?: number }) => { name: string; readonly scene: Scene; is(...names: string[]): boolean; go(name: string, o?: { fade?: number; data?: Loose }): Loose; after(sec: number, name: string, o?: Loose): Loose; readonly changing: boolean; readonly progress: number; readonly cover: number; update(dt: number): Loose; draw(c: Ctx, ...rest: Loose[]): Loose; input(kind: string, ...args: Loose[]): Loose };
  Levels: new <T>(list: T[], o?: { loop?: boolean; start?: number }) => { readonly now: T; readonly number: number; readonly last: boolean; index: number; next(): Loose; restart(): Loose };
}

export interface PacingPart {
  ramp(t: number, from: number, to: number, seconds: number, ease?: (k: number) => number): number;
  Spawner: new (o?: { every?: number; fastest?: number; over?: number; jitter?: number; first?: number; max?: number; rnd?: () => number }) => { readonly gap: number; count: number; pause(sec: number): Loose; burst(n: number, gap?: number): Loose; update(dt: number, spawn: (i: number) => void): Loose; reset(): Loose };
  Waves: new (waves: Loose[], o?: { breather?: number; loop?: boolean; first?: number }) => { readonly wave: Loose; readonly number: number; readonly left: number; state: string; update(dt: number, spawn: (wave: Loose) => void, alive?: number): Loose; onStart?: Loose; [k: string]: Loose };
  Director: new (o?: { over?: number; start?: number; max?: number; ease?: number; calmFor?: number }) => { readonly level: number; readonly calm: boolean; hurt(amount?: number): Loose; scored(amount?: number): Loose; update(dt: number): Loose; pick(easy: number, hard: number): number };
}

export interface AimResult { target: Loose | null; on: boolean; lock: number; fire: boolean; angle?: number; dir?: Loose }
export interface AimPart {
  AimAssist: new (o?: { cone?: number; range?: number; pull?: number; slow?: number; autoFire?: number; stickTime?: number; strength?: number }) => {
    strength: number; target: Loose | null; on: boolean;
    turn(amount: number): number;
    update(dt: number, gun: XY | XYZ, aim: number | XYZ, targets: Loose[], o?: { sees?: (...xy: number[]) => boolean; lead?: number }): AimResult;
    reset(): Loose;
  };
}

export type Mood = 'calm' | 'suspicious' | 'alert' | 'searching';
export interface SensesPart {
  Senses: (new (o?: { range?: number; fov?: number; near?: number; hearing?: number; spotTime?: number; memory?: number; searchTime?: number; calmDown?: number }) => {
    mood: Mood; awareness: number; seen: boolean; lastSeen: XY | null; lookAt: XY | null; heard: XY | null; onMood?: (mood: Mood, prev: Mood) => void;
    inCone(me: XY & { facing?: number }, x: number, y: number): boolean;
    alert(x: number, y: number): Loose; suspect(x: number, y: number, amount?: number): Loose;
    update(dt: number, me: XY & { facing?: number }, target: (XY & { hidden?: boolean }) | null, o?: { sees?: (x1: number, y1: number, x2: number, y2: number) => boolean; noises?: Loose; light?: number }): Loose;
  }) & { alertAll(guards: Loose[], x: number, y: number, radius: number, from?: Loose): void };
  Noises: new () => { list: { x: number; y: number; loud: number; age: number }[]; make(x: number, y: number, loud?: number): Loose; update(dt: number): Loose; clear(): Loose };
}

/** The player's Reduce motion setting (read only). The kits already apply it. */
export interface PrefsPart { readonly reduceMotion: boolean; /** 1 normally, smaller with Reduce motion: scale your own shakes and flashes by it. */ readonly motion: number }

// ---------- 3D and AI parts (load on first use; the app loads them before a game that needs them) ----------

export interface ToonPart { View: new (...a: Loose[]) => Loose; G: Loose; part: Loose; grp: Loose; blob: Loose; toon: Loose; flat: Loose; dude: Loose; has3D(): boolean; THREE: Loose }
export interface HdPart { HDView: new (...a: Loose[]) => Loose; HD: Loose; TIERS: Loose; hasHD(): boolean; pbr: Loose; rbox: Loose; surface: Loose; speckle: Loose; Particles: Loose; sun: Loose; spot: Loose; THREE: Loose }
export interface ArPart { ARView: new (...a: Loose[]) => Loose; FLOOR: Loose; arNote: Loose; THREE: Loose }
export interface BricksPart { BRICK: Loose; BRICK_KEYS: Loose; STUD: Loose; brick: Loose; brick3d: Loose; stud: Loose; stud3d: Loose }
/** Rapier 3D (lazy). */
export interface Physics3dPart { World3D: new (o?: Loose) => Loose; loadPhysics3D(): Promise<Loose>; physics3DReady(): boolean }
export interface Fx3dPart { text3d: Loose; Particles3D: new (...a: Loose[]) => Loose; outline: Loose; glitch: Loose; trails: Loose; focus: Loose; pixelate: Loose; loadFx3d(): Promise<Loose> }
export type RigMode = 'chase' | 'shoulder' | 'first' | 'top' | 'side' | 'orbit' | 'rail' | 'fixed';
export interface CameraPart {
  CameraRig: new (view: Loose, o?: { mode?: RigMode; distance?: number; height?: number; side?: number; look?: number; lag?: number; lead?: number; fov?: number; walls?: Loose[]; pitchMin?: number; pitchMax?: number; rail?: Loose; at?: Loose }) => {
    yaw: number; pitch: number; mode: RigMode;
    update(dt: number, target: Loose): Loose; to(mode: RigMode, sec?: number, o?: Loose): Loose; set(o: Loose): Loose;
    shake(amount?: number): Loose; kick(deg?: number, sec?: number): Loose; forward(out?: Loose): Loose; right(out?: Loose): Loose;
  };
}
/** 3D paths from your level meshes (lazy). */
export interface Nav3dPart {
  NavMesh3D: new (objects: Loose | Loose[], o?: { radius?: number; height?: number; climb?: number; slope?: number; cell?: number; maxEdge?: number }) => {
    path(a: Loose, b: Loose): Loose[]; reachable(a: Loose, b: Loose): boolean; closest(p: Loose): Loose; random(p?: Loose, radius?: number): Loose | null;
    crowd(o?: { max?: number; maxRadius?: number }): { add(p: Loose, o?: { speed?: number; radius?: number; height?: number; accel?: number; separation?: number }): Loose; update(dt: number): Loose };
    destroy(): void;
  };
  loadNav3D(): Promise<Loose>; nav3DReady(): boolean;
}
export interface CharactersPart {
  lookAt(obj: Loose, target: Loose | null, dt?: number, o?: { max?: number; up?: number; speed?: number }): Loose;
  reach(upper: Loose, lower: Loose, target: Loose, o?: { pole?: Loose; length?: number; end?: Loose }): boolean;
  Steps: new (o?: { feet?: [number, number][]; stride?: number; lift?: number; time?: number; lead?: number; ground?: ((x: number, z: number) => number) | null }) => { feet: { pos: Loose; lifting: number; landed: boolean }[]; update(dt: number, body: Loose): Loose };
  Wobble: new (o?: { stiffness?: number; damping?: number }) => { value: number; hit(amount?: number): Loose; update(dt: number): Loose };
}
export interface AiPart { Crowd: new (...a: Loose[]) => Loose; NavGrid: new (...a: Loose[]) => Loose; Brain: new (...a: Loose[]) => Loose; YUKA: Loose }

export interface GS {
  sound: SoundPart; device: DevicePart; util: UtilPart; math: MathPart; palettes: PalettesPart;
  juice: JuicePart; effects: { Feel: typeof Feel }; controls: ControlsPart; pad: PadPart; moves: MovesPart;
  pixel: PixelPart; gfx: GfxPart; physics: PhysicsPart; vision: VisionPart; geo: GeoPart;
  things: ThingsPart; rounds: RoundsPart; pacing: PacingPart; aim: AimPart; senses: SensesPart; prefs: PrefsPart;
  toon: ToonPart; hd: HdPart; ar: ArPart; bricks: BricksPart; physics3d: Physics3dPart; fx3d: Fx3dPart;
  camera: CameraPart; nav3d: Nav3dPart; characters: CharactersPart; ai: AiPart;
  /** three.js itself. */
  THREE: Loose;
}

// App-only helpers (games don't use these).
export declare const HIDDEN: Record<string, string[]>;
export declare const LAZY_PARTS: string[];
export declare function loadParts(names?: string[]): Promise<void>;
export declare function partsReady(names?: string[]): boolean;
export declare function offers(names: string[]): boolean;

declare const gs: GS;
export default gs;
