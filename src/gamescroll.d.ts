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
  /** Saves up to 2 KB of JSON for this game. False if it wasn't saved (too big, or a newer version of the game saved last). */
  save(data: unknown): boolean;
  load<T>(fallback: T): T;
  clearSave(): void;
  /** Seconds since this game last ran on this phone (at most a week; about 0 once it has run this session). For idle games. */
  away(): number;
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
  /** Hot reload (npm run dev): what to carry over to the new code. Return plain data. */
  snapshot?(): unknown;
  /** Hot reload: called on the new game, after reset(), with what snapshot() returned. */
  restore?(data: unknown): void;
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
  /** Save versions: raise version when the save's shape changes; migrate turns an older save into the new shape. */
  save?: { version: number; migrate?(data: Loose, from: number): unknown };
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
  tone(f: number | string, o?: { len?: number; wave?: OscillatorType; vol?: number; slide?: number; attack?: number; at?: number; out?: AudioNode }): void;
  noise(len?: number, o?: { vol?: number; from?: number; to?: number; filter?: BiquadFilterType; q?: number; at?: number; out?: AudioNode }): void;
  /** Plays a tune like 'C5 E5 G5 - C6' ('-' is a rest). */
  notes(seq: string, o?: { len?: number; gap?: number; wave?: OscillatorType; vol?: number }): void;
  /** Background music from patterns; start it in update(), not reset(). */
  music(o?: { tempo?: number; vol?: number; swing?: number; lead?: string; bass?: string; drums?: string; layers?: Record<string, number>; [part: string]: Loose }): { start(): Loose; stop(): void; pause(): void; resume(): void; speed(x: number): Loose; layer(name: string, level?: number, fade?: number): Loose; intensity(x: number, fade?: number): Loose; readonly level: number; readonly playing: boolean; [k: string]: Loose };
  /** 3D sound: the listener follows the camera; sounds play at points in the world (HRTF in headphones). */
  Ears: new (o?: { ref?: number; max?: number; rolloff?: number; hrtf?: boolean; flat?: boolean }) => {
    place(pos: { x: number; y: number; z?: number }, forward?: { x: number; y: number; z: number }, up?: { x: number; y: number; z: number }): Loose; place2d(x: number, y: number, facing?: number): Loose;
    tone(f: number | string, p: { x: number; y: number; z?: number }, o?: Loose): Loose; noise(len: number, p: { x: number; y: number; z?: number }, o?: Loose): Loose; zzfx(p: { x: number; y: number; z?: number }, ...params: (number | undefined)[]): Loose;
    play(name: string, p: { x: number; y: number; z?: number }, pitch?: number, o?: { muffled?: boolean }): Loose;
    loop(p: { x: number; y: number; z?: number }, wave?: OscillatorType, hz?: number, o?: { vol?: number; muffled?: boolean }): { move(p: { x: number; y: number; z?: number }): Loose; pitch(hz: number): Loose; volume(v: number): Loose; stop(): void };
    heard(p: { x: number; y: number; z?: number }): number;
  };
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

// ---------- 2D worlds, characters, story, replays and look ----------

export declare class Camera2D {
  constructor(w: number, h: number, o?: { deadzone?: [number, number]; lag?: number; lead?: number; zoom?: number; bounds?: [number, number, number, number] | null; pixel?: boolean; x?: number; y?: number });
  /** The world point at the centre of the screen. */
  x: number; y: number; zoom: number; deadzone: [number, number]; lag: number; lead: number; bounds: [number, number, number, number] | null;
  readonly view: { x: number; y: number; w: number; h: number };
  update(dt: number, target?: { x: number; y: number; vx?: number; vy?: number }): this;
  snap(x: number, y: number): this;
  zoomIn(z: number, sec?: number): this;
  begin(c: Ctx): this; end(c: Ctx): this;
  /** A background layer moving at factor f of the camera (0 fixed, 1 with the world). */
  layer(c: Ctx, f: number, draw: (c: Ctx) => void, o?: { repeat?: [number, number] | null }): this;
  toWorld(sx: number, sy: number): XY; toScreen(wx: number, wy: number): XY;
  sees(x: number, y: number, w?: number, h?: number, margin?: number): boolean;
  offset(f?: number): [number, number];
}
export interface Camera2dPart { Camera2D: typeof Camera2D }

export interface Box { x: number; y: number; w: number; h: number; onGround?: boolean; [k: string]: Loose }
export interface TileHit { left: boolean; right: boolean; up: boolean; down: boolean; slope: number }
export interface TileKind { solid?: boolean; oneWay?: boolean; slope?: 1 | -1; [k: string]: Loose }
export declare class TileMap {
  constructor(cols: number, rows: number, o?: { size?: number; legend?: Record<string, TileKind> });
  /** '#' wall, '-' one-way, '/' '\' slopes, '.' empty; other letters are marks. */
  static fromText(text: string | string[], o?: { size?: number; legend?: Record<string, TileKind> }): TileMap;
  cols: number; rows: number; size: number; readonly w: number; readonly h: number;
  marks: { ch: string; tx: number; ty: number; x: number; y: number }[];
  find(ch: string): { ch: string; tx: number; ty: number; x: number; y: number }[];
  clear(ch: string, to?: string): this;
  get(tx: number, ty: number): string; set(tx: number, ty: number, ch: string): this;
  info(tx: number, ty: number): TileKind; at(x: number, y: number): { tx: number; ty: number; ch: string };
  solid(tx: number, ty: number): boolean; slopeY(tx: number, ty: number, x: number): number | null;
  inside(tx: number, ty: number): boolean;
  /** Moves a box (x, y centre) by dx, dy, stopping at walls. */
  move(box: Box, dx: number, dy: number, o?: { drop?: boolean; stepDown?: number; stepUp?: number }): TileHit;
  ray(x0: number, y0: number, x1: number, y1: number): { x: number; y: number; tx: number; ty: number } | null;
  sees(x0: number, y0: number, x1: number, y1: number): boolean;
  walkable(): boolean[][];
  draw(c: Ctx, draw: (c: Ctx, ch: string, x: number, y: number, size: number, tx: number, ty: number) => void, cam?: Camera2D | null, o?: { empty?: boolean }): this;
}
export interface TilesPart { TileMap: typeof TileMap }

interface MoverBase { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; facing: number; hit: Partial<TileHit>; readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
export interface MoversPart {
  Platformer: new (o?: { x?: number; y?: number; w?: number; h?: number; jump?: number; jumpTime?: number; run?: number; accel?: number; airAccel?: number; stop?: number; coyote?: number; buffer?: number; cut?: number; fall?: number; wall?: boolean; wallSlide?: number; wallKick?: number; airJumps?: number }) => MoverBase & {
    jump: number; jumpTime: number; run: number; airJumps: number; wall: boolean;
    state: 'idle' | 'run' | 'jump' | 'fall' | 'wall'; jumped: boolean; landed: boolean; impact: number; onWall: -1 | 0 | 1;
    readonly gravity: number; readonly jumpSpeed: number;
    /** input: x -1..1, jump held now, down (drop through one-way platforms). map: a TileMap, or { floor: y }. */
    update(dt: number, map: TileMap | { floor: number } | null, input?: { x?: number; jump?: boolean; down?: boolean }): Loose;
  };
  TopDown: new (o?: { x?: number; y?: number; w?: number; h?: number; speed?: number; accel?: number; stop?: number }) => MoverBase & {
    speed: number; state: 'idle' | 'walk'; dir: XY;
    update(dt: number, map: TileMap | null, input?: { x?: number; y?: number }): Loose;
  };
}

export interface AnimState { frames?: number | number[]; fps?: number; loop?: boolean; lock?: boolean; then?: string; events?: Record<number, string> }
export interface AnimPart {
  Animator: new (states: Record<string, AnimState>, start?: string) => {
    readonly state: string; readonly frame: number; readonly progress: number; done: boolean; prev?: string;
    on(event: string, fn: (event: string, a: Loose) => void): Loose;
    play(name: string, restart?: boolean): Loose;
    update(dt: number, want?: string): Loose;
  };
}

export interface StoryLine { text: string; tags: Record<string, string | true>; choices: { text: string; index: number; tags: Record<string, string | true> }[] }
export interface StoryPart {
  /** Branching dialogue written in ink (lazy: make it in make() or reset()). */
  Story: new (source: string) => {
    readonly ended: boolean; readonly choices: StoryLine['choices']; vars: Record<string, Loose>; ink: Loose;
    next(): StoryLine; choose(index: number): Loose; go(section: string): Loose; bind(name: string, fn: (...a: Loose[]) => Loose): Loose;
    save(): string; load(json: string): Loose;
  };
  Typewriter: new (text?: string, o?: { speed?: number; pause?: number }) => { readonly shown: string; readonly done: boolean; ticked: boolean; text: string; show(text: string): Loose; skip(): Loose; update(dt: number): Loose };
  loadStory(): Promise<Loose>;
}

export declare class Ghost {
  constructor(o?: { every?: number });
  time: number; readonly length: number;
  record(dt: number, ...values: number[]): this;
  at(t: number): { x: number; y: number; v: number[]; done: boolean } | null;
  /** A short string for api.save(). */
  pack(maxBytes?: number, precision?: number): string;
  static unpack(s: string): Ghost;
}
export interface ReplayPart {
  Ghost: typeof Ghost;
  Recorder: new (o?: { seed?: number; max?: number }) => { seed: number; rng: Rng; readonly time: number; readonly data: { seed: number; frames: Loose[] }; event(kind: string, ...args: Loose[]): Loose; frame(dt: number): Loose };
  Replayer: new (data: { seed: number; frames: Loose[] }) => { rng: Rng; readonly done: boolean; step(game: Partial<Game>): number };
}

export interface Light { x: number; y: number; r: number; color?: string; power?: number; cone?: number; dir?: number; flicker?: number; shadows?: boolean }
export type ScreenEffect = 'crt' | 'bloom' | 'grade' | 'pixelate' | 'glitch' | 'rgbSplit' | 'film' | 'shockwave' | 'godrays' | 'zoomBlur' | 'blur' | 'outline' | 'grayscale';
export interface Look2dPart {
  /** Darkness with lights; walls (a TileMap, anything with ray(), or [x1, y1, x2, y2] segments) cast shadows. */
  Lights: new (w: number, h: number, o?: { dark?: number; color?: string; pixel?: boolean; rays?: number; scale?: number }) => { dark: number; color: string; draw(c: Ctx, lights: Light[], o?: { walls?: Loose; cam?: Camera2D | null; dt?: number }): Loose };
  /** Whole-screen effects with pixi-filters (lazy). Options are the pixi-filters filter's own. */
  Screen: new (effects?: Partial<Record<ScreenEffect, object | boolean | null>>) => { set(effects: Partial<Record<ScreenEffect, object | boolean | null>>): Loose; filter(name: ScreenEffect): Loose; apply(c: Ctx, dt?: number): Loose; shock(x: number, y: number, o?: object): Loose };
  /** Fast WebGL sprites with PixiJS (lazy). Sprites are PixiJS Sprites: x, y, rotation, scale, alpha, tint. */
  Batch: new (w: number, h: number, o?: { pixel?: boolean }) => { texture(src: Loose, w?: number, h?: number): Loose; add(tex: Loose, x?: number, y?: number, o?: { scale?: number; rotation?: number; alpha?: number; tint?: number }): Loose; remove(s: Loose): Loose; clear(): Loose; readonly count: number; draw(c: Ctx): Loose };
  loadLook2D(): Promise<Loose>;
}

// ---------- 3D and AI parts (load on first use; the app loads them before a game that needs them) ----------

export interface ToonPart { View: new (...a: Loose[]) => Loose; G: Loose; part: Loose; grp: Loose; blob: Loose; toon: Loose; flat: Loose; dude: Loose; has3D(): boolean; THREE: Loose }
/** An HDView's extras for the ray-traced look: v.reflect(...meshes) (reflections on top-end phones), v.contact({ y, size }) (soft contact shadows) (mesh.userData.noAO = true keeps a mesh out of ambient occlusion). */
export interface HdPart { ContactShadows: new (o?: { y?: number; size?: number; blur?: number; darkness?: number; opacity?: number; height?: number }) => Loose; HDView: new (...a: Loose[]) => Loose; HD: Loose; TIERS: Loose; hasHD(): boolean; pbr: Loose; rbox: Loose; surface: Loose; speckle: Loose; Particles: Loose; sun: Loose; spot: Loose; THREE: Loose }
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

/** Tiny Brains: a small neural network (tanh hidden layers, softmax out). */
export declare class TinyNet {
  constructor(sizes: number[], seed?: number);
  readonly sizes: number[]; readonly shape: string; readonly length: number; w: Float32Array;
  /** Probabilities for inputs x (reused array). */
  run(x: ArrayLike<number>): Float32Array;
  /** Makes `toward` more likely for x by `amount` (negative: less likely). */
  learn(x: ArrayLike<number>, toward: number, amount: number, ran?: boolean): this;
  copy(): TinyNet;
  pack(): string;
  static unpack(s: string): TinyNet | null;
}
export interface BrainOptions {
  name?: string;
  inputs: number;
  actions: number | string[];
  hidden?: number[];
  /** The game's own simple AI: the brain starts by copying it. */
  teacher?(see: number[]): number | string;
  /** Hard rules: return the action to use instead (or the same one). */
  rules?(see: number[], action: number | string): number | string | void;
  /** react: seconds between decisions; perSecond: most changes of mind a second; minNoise: share of random choices. */
  limits?: { react?: number; perSecond?: number; minNoise?: number };
  /** The player's win rate to aim for (0.6). */
  target?: number;
  learn?: number;
  drift?: number;
  /** Shared learning: start from everyone's average brain (true). */
  share?: boolean;
}
/** A Tiny Brain that learns as you play, with guard rails. */
export declare class Brain {
  constructor(api: GameApi | null, opts: BrainOptions);
  net: TinyNet; skill: number; trust: number; winRate: number; steps: number;
  /** The last action (its name when actions is a list). */
  readonly action: number | string;
  /** Picks an action for what it sees (numbers about -1..1), every frame. Returns its index. */
  act(see: number[], dt?: number): number;
  /** A moment that made the round exciting (about -1..1). */
  feel(x?: number): void;
  /** End of a duel or round: did the player win? */
  result(playerWon: boolean): void;
  /** Forgets what it learned. */
  reset(): this;
}
export interface BrainMind { act(see: number[], dt?: number): number; readonly action: number | string; feel(x?: number): void; done(): void; }
export interface BrainsPart {
  Net: typeof TinyNet;
  Brain: typeof Brain;
  /** Every enemy in a wave is an experiment: wave.mind() per enemy, mind.done() when it leaves. */
  Wave: new (brain: Brain, o?: { change?: number }) => { mind(): BrainMind };
  /** Tries moves ahead with your game's own step function. */
  Imagine: new <S>(o: { actions: number | string[]; step(state: S, action: number, dt: number): S; score(state: S): number; depth?: number; dt?: number; tries?: number; budget?: number; brain?: Brain; see?(state: S): number[] }) => { pick(state: S): number; readonly action: number | string };
  packWeights(sizes: number[], w: ArrayLike<number>): string;
  unpackWeights(s: string): { sizes: number[]; w: Float32Array } | null;
}

/** A tweak spec value: a number, [value, min, max, step?], a boolean, a '#colour', [choice, ...choices], or a function (a button). */
export type TweakSpec = Record<string, number | [number, number, number, number?] | boolean | string | string[] | (() => void)>;
/** Live sliders (npm run dev only); elsewhere it returns the starting values. Read the fields where they're used. */
export interface TweakFn {
  (name: string, spec: TweakSpec): Record<string, Loose>;
  (spec: TweakSpec): Record<string, Loose>;
}

// ---- round 6 game kits
export interface BoardPiece { kind?: Loose; col?: number; row?: number; x?: number; y?: number; [k: string]: Loose }
export interface BoardGroup { cells: { col: number; row: number }[]; pieces: BoardPiece[]; size: number; shape: 'line' | 'cross' }
export interface Board {
  cols: number; rows: number; cells: (BoardPiece | null)[]; busy: boolean; gone: BoardPiece[];
  in(c: number, r: number): boolean; get(c: number, r: number): BoardPiece | null; put(c: number, r: number, p: BoardPiece | null): BoardPiece | null; take(c: number, r: number): BoardPiece | null;
  each(fn: (p: BoardPiece, c: number, r: number) => void): void; readonly pieces: BoardPiece[];
  cellAt(x: number, y: number, x0?: number, y0?: number, size?: number): { col: number; row: number } | null;
  adjacent(a: { col: number; row: number }, b: { col: number; row: number }): boolean;
  neighbours(c: number, r: number, diagonal?: boolean): { col: number; row: number; piece: BoardPiece | null }[];
  swap(a: { col: number; row: number }, b: { col: number; row: number }): Board;
  matches(o?: { min?: number }): BoardGroup[]; clear(groups: BoardGroup[]): number;
  fall(dir?: 'down' | 'up' | 'left' | 'right'): Loose; refill(fill?: (c: number, r: number) => BoardPiece | null): BoardPiece[];
  settle(o?: { min?: number; tries?: number }): Board; hint(o?: { min?: number }): { a: { col: number; row: number }; b: { col: number; row: number } } | null; shuffle(): Board;
  slide(dir: 'up' | 'down' | 'left' | 'right', o?: { merge?: ((a: BoardPiece, b: BoardPiece) => BoardPiece | null) | null }): { moved: boolean; merged: Loose[]; gone: BoardPiece[] };
  flood(col: number, row: number, same?: (a: BoardPiece, b: BoardPiece) => boolean): { col: number; row: number }[];
  update(dt: number): Board; [more: string]: Loose;
}
export interface BoardPart { Board: new (cols: number, rows: number, o?: { fill?: ((c: number, r: number) => BoardPiece | null) | null; same?: (a: BoardPiece, b: BoardPiece) => boolean; speed?: number; rng?: () => number }) => Board }

export interface Fighter {
  name: string; hp: number; maxHp: number; atk: number; def: number; spd: number; luck: number; type: string | null; level: number; xp: number;
  buffs: { stat: string; by: number; turns: number }[]; statuses: Map<string, number>; readonly alive: boolean;
  stat(k: string): number; buff(stat: string, by: number, turns?: number): Fighter; has(status: string): boolean; heal(n: number): number; [more: string]: Loose;
}
export interface BattleMove { name?: string; power?: number; type?: string; accuracy?: number; status?: string; chance?: number; turns?: number; heal?: number; all?: boolean; [k: string]: Loose }
export interface Battle {
  sides: Fighter[][]; log: Loose[]; readonly fighters: Fighter[]; readonly turn: Fighter | null; readonly over: number | null;
  on(ev: string, fn: (e: Loose) => void): Battle; sideOf(f: Fighter): number; foes(f: Fighter): Fighter[]; friends(f: Fighter): Fighter[];
  next(): Fighter | null; preview(by: Fighter, target: Fighter, move?: BattleMove): number;
  damage(by: Fighter, target: Fighter, move?: BattleMove, roll?: boolean): { amount: number; crit: boolean; miss: boolean; effect: number; [k: string]: Loose };
  act(by: Fighter, o?: { move?: BattleMove | null; item?: string | null; target?: Fighter | Fighter[] | null; wait?: boolean }): Loose;
  inflict(target: Fighter, status: string, turns?: number): Loose; useItem(by: Fighter, item: string, target?: Fighter): Loose; endTurn(f: Fighter): Loose;
}
export interface Bag {
  defs: Record<string, Loose>; items: Map<string, number>;
  add(id: string, n?: number): number; take(id: string, n?: number): boolean; count(id: string): number; has(id: string, n?: number): boolean;
  readonly list: { id: string; n: number; def: Loose; bag: Bag }[]; save(): Record<string, number>; load(data: Record<string, number> | null): Bag;
}
export interface BattlePart {
  Fighter: new (o?: { name?: string; hp?: number; atk?: number; def?: number; spd?: number; luck?: number; type?: string | null; level?: number; [k: string]: Loose }) => Fighter;
  Battle: new (sides: Fighter[][], o?: { types?: Record<string, Record<string, number>>; statuses?: Record<string, Loose>; rng?: () => number; crit?: number; spread?: boolean }) => Battle;
  Bag: new (defs?: Record<string, Loose>, o?: { slots?: number; stack?: number }) => Bag;
  xpFor(level: number, o?: { base?: number; power?: number }): number; levelFor(xp: number, o?: { base?: number; power?: number }): number;
  /** Adds XP and levels up (stats grow by growth per level). Returns the levels gained. */
  gainXp(f: Fighter, xp: number, o?: { growth?: Record<string, number>; curve?: { base?: number; power?: number } }): number;
  /** Picks an entry from a weighted table: [{ id: 'coin', w: 10 }, { id: 'gem', w: 1 }]. */
  loot<T extends { w?: number }>(table: T[], rng?: () => number): T;
}

export interface GenMap { grid: string[]; readonly text: string; w: number; h: number }
export interface GenPart {
  dungeon(w?: number, h?: number, o?: { seed?: number | string; kind?: 'digger' | 'uniform' | 'rogue'; doors?: boolean; dug?: number }): GenMap & { rooms: { x: number; y: number; w: number; h: number; cx: number; cy: number }[]; start: { col: number; row: number }; end: { col: number; row: number } };
  cave(w?: number, h?: number, o?: { seed?: number | string; fill?: number; steps?: number; connect?: boolean }): GenMap;
  maze(w?: number, h?: number, o?: { seed?: number | string; kind?: 'backtracker' | 'eller' | 'divided' }): GenMap;
  heightmap(w?: number, h?: number, o?: { seed?: number | string; scale?: number; octaves?: number }): { w: number; h: number; data: Float32Array; at(x: number, y: number): number };
  islands(w?: number, h?: number, o?: { seed?: number | string; sea?: number; scale?: number }): GenMap & { heights: Loose };
  pattern(sample: string, w?: number, h?: number, o?: { seed?: number | string; n?: number; symmetry?: number; periodic?: boolean; tries?: number }): GenMap | null;
  fov(map: string | ((col: number, row: number) => boolean), col: number, row: number, radius?: number): Set<string>;
}

export interface DragThing { x: number; y: number; w?: number; h?: number; r?: number; [k: string]: Loose }
export interface Drag {
  pieces: DragThing[]; slots: DragThing[]; readonly busy: boolean; readonly order: DragThing[];
  on(ev: 'pick' | 'over' | 'drop' | 'reject' | 'home' | 'reorder', fn: (...a: Loose[]) => void): Drag;
  piece<T extends DragThing>(p: T): T; slot<T extends DragThing>(s: T): T; remove(p: DragThing): void; at(x: number, y: number): DragThing | null;
  down(x: number, y: number, id?: number): DragThing | null; move(x: number, y: number, id?: number): void; up(x: number, y: number, id?: number): void;
  place(p: DragThing, s: DragThing | null): Drag; update(dt: number): Drag;
}
export interface DragPart { Drag: new (o?: { snap?: number; accept?: (piece: DragThing, slot: DragThing) => boolean; lift?: number; speed?: number; list?: { x: number; y: number; gap?: number; axis?: 'x' | 'y' } | null; swap?: boolean }) => Drag }

export interface Earner {
  defs: Record<string, { base: number; growth?: number; rate?: number; [k: string]: Loose }>; owned: Record<string, number>; money: number; mult: number; readonly perSecond: number;
  add(id: string, def: { base: number; growth?: number; rate?: number; [k: string]: Loose }): Earner; price(id: string, n?: number): number; canBuy(id: string, n?: number): boolean; buy(id: string, n?: number): boolean;
  update(dt: number): Earner; catchUp(seconds: number, share?: number): number; save(): Loose; load(d: Loose): Earner;
}
export interface IdlePart {
  cost(base: number, growth: number, owned?: number, n?: number): number; afford(base: number, growth: number, owned: number, money: number, max?: number): number;
  short(n: number, digits?: number): string; curve(level: number, levels: number, from: number, to: number, power?: number): number;
  Earner: new (defs?: Record<string, Loose>, money?: number) => Earner;
}

export interface PartyPlayer { index: number; name: string; color: string; score: number; out: boolean }
export interface Turns {
  players: PartyPlayer[]; i: number; round: number; handover: boolean; waiting: boolean;
  readonly player: PartyPlayer; readonly leader: PartyPlayer; readonly left: PartyPlayer[]; readonly winners: PartyPlayer[];
  add(points: number, p?: PartyPlayer): Turns; out(p?: PartyPlayer): Turns; next(): Turns; ready(): Turns; over(rounds?: number): boolean;
  cover(c: Ctx, w: number, h: number, o?: { text?: string; sub?: string }): void; save(): Loose; load(d: Loose): Turns;
}
export interface Split {
  w: number; h: number; n: number; areas: { x: number; y: number; w: number; h: number; turn: number }[];
  resize(w: number, h: number): Split; who(x: number, y: number): number; local(p: number, x: number, y: number): { x: number; y: number; w: number; h: number };
  begin(c: Ctx, p: number): { x: number; y: number; w: number; h: number; turn: number }; end(c: Ctx): void;
}
export interface PartyPart {
  Turns: new (o?: { players?: number; names?: string[] | null; colors?: string[]; handover?: boolean; first?: number }) => Turns;
  Split: new (w: number, h: number, o?: { players?: number; facing?: boolean; across?: boolean }) => Split;
}

export interface Beat { bpm: number; offset: number; steps: number; time: number; running: boolean; onBeat: boolean; onStep: boolean; readonly spb: number; readonly beat: number; readonly phase: number; start(): Beat; stop(): Beat; update(dt: number): Beat }
export interface ChartNote { time: number; beat: number; lane: number; hold: number; hit: boolean; result: 'perfect' | 'good' | 'miss' | null }
export interface Chart {
  notes: ChartNote[]; lanes: number; length: number; counts: { perfect: number; good: number; miss: number }; combo: number; best: number;
  w: { perfect: number; good: number; miss: number }; readonly done: boolean; readonly accuracy: number;
  hit(lane: number, time: number): { result: 'perfect' | 'good' | 'miss'; note: ChartNote; error: number } | null;
  missed(time: number): ChartNote[]; near(time: number, ahead?: number, behind?: number): ChartNote[];
}
export interface RhythmPart {
  lag(): number;
  Beat: new (o?: { bpm?: number; offset?: number; steps?: number }) => Beat;
  Chart: new (text: string, o?: { bpm?: number; per?: number; lead?: number; windows?: { perfect?: number; good?: number; miss?: number } }) => Chart;
  Calibrate: new (o?: { bpm?: number; beats?: number; skip?: number }) => { beat: Beat; taps: number[]; done: boolean; lag: number; update(dt: number): Loose; tap(): Loose };
}

export type Pt = [number, number];
export interface Stroke {
  points: Pt[]; length: number; readonly first: Pt; readonly last: Pt; readonly closed: boolean; readonly turns: number;
  readonly bounds: { x: number; y: number; w: number; h: number; cx: number; cy: number };
  add(x: number, y: number): Stroke; simplify(tolerance?: number): Pt[]; resample(n?: number): Pt[];
  draw(c: Ctx, o?: { width?: number; color?: string; cap?: CanvasLineCap }): void;
}
export interface StrokesPart {
  SHAPES: readonly string[];
  Stroke: new (o?: { smooth?: number; gap?: number }) => Stroke;
  Shapes: new (names?: readonly string[], o?: { n?: number; sure?: number }) => {
    add(name: string, points: Pt[]): Loose; match(points: Pt[], o?: { min?: number }): { name: string; score: number; sure: boolean } | null; rank(points: Pt[]): { name: string; score: number }[];
  };
  toPhysics(phys: Loose, points: Pt[], o?: { thick?: number; fixed?: boolean; [k: string]: Loose }): Loose;
  pathLength(p: Pt[]): number; bounds(p: Pt[]): { x: number; y: number; w: number; h: number; cx: number; cy: number }; resample(p: Pt[], n?: number): Pt[]; simplify(p: Pt[], tol?: number): Pt[];
}

export interface DriveInput { throttle?: number; steer?: number; brake?: boolean; drift?: boolean; surface?: number }
interface WheelsBase {
  top: number; reverse: number; accel: number; brakes: number; roll: number; turn: number; grip: number; driftGrip: number; boostAfter: number; boost: number; boostTime: number;
  speed: number; slide: number; drifting: boolean; driftDir: number; driftTime: number; boostLeft: number; boosted: boolean; charge: number; readonly pace: number;
  kick(seconds?: number): WheelsBase;
}
type WheelsOpts = { top?: number; reverse?: number; accel?: number; brakes?: number; roll?: number; turn?: number; grip?: number; driftGrip?: number; boostAfter?: number; boost?: number; boostTime?: number };
export interface Car extends WheelsBase { x: number; y: number; angle: number; vx: number; vy: number; update(dt: number, input?: DriveInput): Car; bump(nx?: number, ny?: number, o?: { keep?: number }): Car; point(forward: number, right?: number): XY }
export interface Kart extends WheelsBase {
  x: number; y: number; z: number; heading: number; vx: number; vy: number; vz: number; onGround: boolean; lean: number; pitch: number; airTime: number; landed: boolean; fell: boolean; impact?: number;
  hop(): Kart; update(dt: number, input?: DriveInput, ground?: ((x: number, z: number) => number | null) | null): Kart; bump(nx?: number, nz?: number, o?: { keep?: number }): Kart; place(obj: Loose): Kart;
}
export interface VehiclesPart {
  Car: new (o?: WheelsOpts & { x?: number; y?: number; angle?: number }) => Car;
  Kart: new (o?: WheelsOpts & { x?: number; y?: number; z?: number; heading?: number; gravity?: number; hop?: number }) => Kart;
  Laps: new (points: Pt[], o?: { radius?: number; laps?: number }) => {
    points: Pt[]; laps: number; racers: Loose[]; join<T>(r: T): T; update<T>(r: T): T; places<T = Loose>(): T[]; aim(r: Loose, ahead?: number): { x: number; y: number; angle: number };
  };
}

export interface Level3D {
  grid: string[]; rows: number; cols: number; size: number; group: Loose; marks: Record<string, Level3DCell[]>; blocks: Loose[];
  ch(col: number, row: number): string; cell(col: number, row: number): Level3DCell; at(x: number, z: number): { col: number; row: number; ch: string };
  height(x: number, z: number): number | null; walkable(col: number, row: number): boolean; find(ch: string): Level3DCell[];
  solid(world: Loose, o?: Loose): Loose[]; readonly blocked: (col: number, row: number) => boolean; dispose(): void;
}
export interface Level3DCell { col: number; row: number; x: number; y: number; z: number }
export interface Level3dPart { Level3D: new (text: string, o?: { size?: number; wall?: number; step?: number; floor?: number; water?: number; look?: Record<string, Loose> | ((ch: string) => Loose); shadows?: boolean }) => Level3D }

export interface SkyPart {
  DAY: [number, { top: string; horizon: string; sun: string; sunI: number; amb: number }][];
  Sky: new (view: Loose, o?: { time?: number; speed?: number; day?: SkyPart['DAY']; stars?: number; physical?: boolean; fog?: boolean; light?: boolean; sun?: Loose; hemi?: Loose; tilt?: number }) => {
    time: number; speed: number; night: number; readonly dayPart: number; update(dt: number): Loose; apply(): Loose; dispose(): void;
  };
  Weather: new (view: Loose, o?: { kind?: 'rain' | 'snow' | 'storm' | 'clear'; amount?: number; area?: number; wind?: [number, number]; max?: number; color?: string }) => {
    kind: string; amount: number; wind: [number, number]; onFlash: ((far: number) => void) | null; readonly flashing: boolean;
    set(kind: 'rain' | 'snow' | 'storm' | 'clear', amount?: number): Loose; flash(): Loose; update(dt: number): Loose; dispose(): void;
  };
}

// ---------- round 7: action, stealth, traversal, missions, sport, big levels ----------
export interface P3 { x: number; y: number; z?: number }
type On<T> = { on(ev: string, fn: (...a: Loose[]) => void): T };
export interface Shot { from: P3; dir: P3; range: number; speed: number; damageAt(distance: number, head?: boolean): number }
export interface Gun {
  damage: number; rate: number; mag: number; reserve: number; reload: number; ammo: number; kick: { pitch: number; yaw: number };
  justFired: boolean; empty: boolean; readonly reloading: number; readonly spreadNow: number;
  pull(from: P3, dir: P3, pressed?: boolean): Shot[]; update(dt: number): Gun; startReload(): boolean; damageAt(distance?: number, head?: boolean): number;
  save(): Loose; load(d: Loose): Gun; [k: string]: Loose;
}
export interface Health {
  hp: number; max: number; armour: number; down: boolean; dead: boolean; hits: { angle: number; amount: number; life: number }[]; readonly frac: number; readonly hurting: boolean;
  hurt(amount: number, o?: { from?: P3; at?: P3; facing?: number }): number; heal(n: number): number; addArmour(n: number): Health; revive(share?: number): Health; update(dt: number): Health; reset(): Health;
}
export interface CombatPart {
  Gun: new (o?: { damage?: number; rate?: number; mag?: number; reserve?: number; reload?: number; spread?: number; bloom?: number; maxSpread?: number; settle?: number; pellets?: number; auto?: boolean; recoil?: number; sideways?: number; recover?: number; range?: number; falloff?: [number, number, number]; head?: number; speed?: number; rng?: () => number }) => Gun;
  Shots: new (o?: { gravity?: number }) => { list: Loose[]; add(s: Shot, extra?: Loose): Loose; update(dt: number, hits: (shot: Loose, from: P3, to: P3) => Loose): Loose[] };
  arc(from: P3, vel: P3, gravity?: number, o?: { steps?: number; dt?: number; ground?: (p: P3) => boolean }): P3[];
  lob(from: P3, to: P3, time?: number, gravity?: number): P3;
  Health: new (o?: { max?: number; regen?: number; delay?: number; armour?: number; maxArmour?: number; absorb?: number; downed?: boolean; bleed?: number }) => Health;
  hitFrom(from: P3, at: P3, facing?: number): number;
  Markers: new () => { list: Loose[]; add(head?: boolean, kill?: boolean): Loose; update(dt: number): Loose; readonly showing: boolean };
  Explosives: new (o?: { fuse?: number; radius?: number; damage?: number }) => On<Loose> & { list: Loose[]; add(o: Loose): Loose; light(b: Loose, now?: boolean): Loose; boom(b: Loose): Loose; near(p: P3, r?: number): Loose; update(dt: number): Loose };
}
export interface CoverSpot { x: number; y: number; col: number; row: number; nx: number; ny: number; low: boolean; by: Loose }
export interface TacticsPart {
  CoverMap: new (cols: number, rows: number, blocked: (c: number, r: number) => boolean, o?: { size?: number; x0?: number; y0?: number; low?: (c: number, r: number) => boolean }) => {
    spots: CoverSpot[]; size: number; protects(spot: CoverSpot, threat: P3): boolean;
    find(from: P3, threat: P3, o?: { near?: number; band?: [number, number]; flank?: number; who?: Loose; sees?: (a: P3, b: P3) => boolean }): CoverSpot | null;
    take(spot: CoverSpot | null, who: Loose): CoverSpot | null; free(who: Loose): Loose; peek(spot: CoverSpot, threat: P3): P3; at(col: number, row: number): CoverSpot | null;
  };
  Squad: new (members: Loose[], o?: { cover?: Loose; sees?: (m: Loose, t: P3) => boolean; range?: number; grenades?: number; camp?: number; think?: number; aggression?: number; rng?: () => number }) => On<Loose> & {
    members: Loose[]; readonly left: Loose[]; update(dt: number, target: P3): Loose; hurt(m: Loose): Loose; reloading(m: Loose): Loose;
  };
  Route: new (points: P3[], o?: { leash?: number; reach?: number }) => On<Loose> & { points: P3[]; i: number; readonly point: P3; readonly done: boolean; update(dt: number, ally: P3, player: P3): Loose };
}
export interface ClimbPart {
  Ledges: { new (): { list: Loose[]; add(a: P3, b: P3, normal: { x: number; z: number }, o?: Loose): Loose; closest(p: P3, filter?: (l: Loose) => boolean): Loose }; fromLevel(level: Loose, o?: { min?: number }): Loose };
  Climber: new (ledges: Loose, o?: { height?: number; reach?: number; shimmy?: number; leap?: number; upTime?: number; leapTime?: number; out?: number }) => {
    state: 'free' | 'hang' | 'shimmy' | 'up' | 'leap' | 'swing'; pos: P3; facing: number; ledge: Loose; events: string[]; launch: P3 | null; fling: P3 | null;
    grab(feet: P3, vy?: number): boolean; update(dt: number, input?: { x?: number; y?: number; jump?: boolean }): Loose; leapOrKick(x: number, y: number): Loose; letGo(up?: number, kick?: boolean): Loose; swing(rope: Loose, vel?: P3): Loose;
  };
  Rope: new (anchor: P3, length?: number, o?: { gravity?: number; pump?: number; damping?: number }) => { anchor: P3; length: number; catch(feet: P3, vel: P3, height?: number): Loose; update(dt: number, push?: number): Loose; readonly hands: P3; feet(height?: number): P3; release(): P3 };
}
export interface Mission {
  objectives: { text: string; at: P3 | null; done: boolean }[]; lines: { text: string; who: string | null; life: number }[]; flags: Record<string, Loose>; time: number;
  done: boolean; failed: string | false; readonly current: { text: string; at: P3 | null } | null; readonly replaying: boolean;
  update(dt: number): Mission; restart(fresh?: boolean): Mission; wait(s: number): Loose; until(test: () => boolean): Loose; all(...w: Loose[]): Loose; any(...w: Loose[]): Loose;
  objective(text: string, o?: { at?: P3; keep?: boolean }): Loose; say(text: string, o?: { who?: string; time?: number }): void; checkpoint(name?: string): Loose; flag(name: string, v?: Loose): Mission;
  complete(): void; fail(reason?: string): void; save(): Loose; load(s: Loose): Mission; on(ev: 'objective' | 'say' | 'checkpoint' | 'complete' | 'fail' | 'restart', fn: (...a: Loose[]) => void): Mission;
}
export interface MissionsPart {
  zone(at: P3 | { x: number; y: number; w: number; h: number }, r?: number | null): { has(p: P3): boolean; any(list: P3[]): boolean; count(list: P3[]): number };
  Mission: new (script: (m: Mission) => Generator<Loose, void, Loose>, o?: { save?: (d: Loose) => void; load?: () => Loose }) => Mission;
}
export interface CutsceneStep { at?: number; cam?: P3[]; look?: P3 | ((t: number) => P3); time?: number; ease?: 'linear' | 'in' | 'out' | 'inOut'; say?: string; who?: string; do?: (c: Loose) => void; shake?: number; bars?: number }
export interface CutscenePart {
  along(points: P3[], u: number): P3;
  Cutscene: new (steps: CutsceneStep[], o?: { bars?: number; skippable?: boolean }) => On<Loose> & {
    playing: boolean; done: boolean; bars: number; line: { text: string; who: string | null } | null; shot: { x: number; y: number; z: number; look: P3 } | null; readonly progress: number;
    update(dt: number): Loose; skip(): Loose; reset(): Loose; drawBars(c: CanvasRenderingContext2D, w: number, h: number, colour?: string): void; drawLine(c: CanvasRenderingContext2D, w: number, h: number, o?: Loose): void;
  };
}
export interface Prompt { kind: 'tap' | 'hold' | 'swipe' | 'mash'; x?: number; y?: number; time?: number; dir?: 'up' | 'down' | 'left' | 'right'; hold?: number; count?: number; [k: string]: Loose }
export interface PromptsPart {
  Prompts: new (o?: { radius?: number; swipe?: number }) => On<Loose> & {
    active: boolean; timeScale: number; passed: number; readonly now: Prompt | null; readonly left: number;
    start(list: Prompt[], o?: { slow?: number; ease?: number }): Loose; update(dt: number): Loose; down(x: number, y: number): void; move(x: number, y: number): void; up(): void; cancel(): Loose;
    draw(c: CanvasRenderingContext2D, w: number, h: number, o?: { colour?: string; ink?: string }): void;
  };
}
export interface StealthPart {
  lightAt(p: Pt2, lights: { x: number; y: number; r?: number; i?: number; cone?: number; dir?: number }[], o?: { ambient?: number; sees?: (light: Pt2, p: Pt2) => boolean }): number;
  Takedown: { check<T>(player: Pt2, guards: T[], o?: { reach?: number; behind?: number; moods?: string[] }): T | null; front(player: Pt2, g: Loose, o?: { reach?: number }): boolean };
  Bodies: new (o?: { range?: number }) => On<Loose> & { list: Loose[]; add(x: number, y: number, who?: Loose): Loose; carry(b: Loose): Loose; drop(b: Loose, x: number, y: number): Loose; hide(b: Loose): Loose; near(p: Pt2, reach?: number): Loose[]; update(dt: number, guards: Loose[], sees?: (g: Loose, b: Loose) => boolean): Loose };
  Floors: new (kinds?: Record<string, number>, at?: (p: Pt2) => string | null, o?: { walk?: number; run?: number }) => { noise(p: Pt2, speed: number, o?: { sneak?: number; runSpeed?: number }): number };
  Disguise: new (o?: { fools?: Record<string, string[]>; close?: number }) => { wearing: string | null; wear(kind: string): Loose; off(): Loose; blow(seconds?: number): Loose; update(dt: number): Loose; fooling(g: Loose, player?: Pt2): boolean; light(g: Loose, lit: number, player?: Pt2): number };
}
type Pt2 = { x: number; y: number };
export interface GadgetsPart {
  Grapple: new (o?: { range?: number; reel?: number; swing?: boolean; flyTime?: number; min?: number }) => {
    attached: boolean; flying: number; point: P3 | null; length: number; arrived?: boolean; miss: { from: P3; to: P3 } | null;
    fire(from: P3, dir: P3, ray: (from: P3, dir: P3, max: number) => { point: P3 } | null): boolean; update(dt: number, pos: P3, vel: P3, o?: { reel?: boolean }): P3; release(): Loose;
  };
  Zipline: new (a: P3, b: P3, o?: { gravity?: number; drag?: number; grab?: number; hang?: number }) => { riding: boolean; done?: boolean; t: number; speed: number; near(p: P3, handsUp?: number): boolean; ride(p?: P3 | null, speed?: number): Loose; update(dt: number): Loose; closest(p: P3): { t: number; point: P3; d: number }; readonly hands: P3; readonly pos: P3; readonly vel: P3 };
  Wires: new (cols?: number, rows?: number, o?: { seed?: number }) => { cols: number; rows: number; cells: number[]; moves: number; readonly solved: boolean; get(c: number, r: number): number; turn(c: number, r: number): Loose; lit(c: number, r: number): boolean };
  Lock: new (o?: { pins?: number; speed?: number; gap?: number; shrink?: number; seed?: number }) => { pin: number; pins: number; a: number; at: number; gap: number; failed: boolean; readonly solved: boolean; update(dt: number): Loose; stop(): boolean; reset(): Loose };
  Code: new (o?: { keys?: number; start?: number; seed?: number }) => { seq: number[]; i: number; failed: boolean; readonly done: boolean; press(k: number): boolean; grow(): Loose; retry(): Loose };
}
export interface CampaignMission { id: string; name?: string; stars?: (number | string)[]; collect?: number; needs?: { stars?: number; done?: string }; state?: 'locked' | 'open' | 'done'; got?: number; best?: number | null; found?: number; [k: string]: Loose }
export interface CampaignPart {
  Campaign: new (chapters: { id: string; name?: string; needs?: { stars?: number; done?: string }; missions: CampaignMission[]; [k: string]: Loose }[], o?: { extras?: Record<string, number> }) => On<Loose> & {
    chapters: Loose[]; missions: CampaignMission[]; readonly stars: number; readonly maxStars: number; readonly progress: number; readonly unlocked: Record<string, boolean>;
    attach(api: Loose, key?: string): Loose; clear(save?: boolean): Loose; done(id: string): boolean; best(id: string): number | null; starsOf(id: string): number; starList(id: string): boolean[];
    state(id: string): 'locked' | 'open' | 'done'; open(id: string): boolean; next(): CampaignMission | null; has(extra: string): boolean;
    finish(id: string, o?: { score?: number; stars?: boolean[] }): { stars: number; newStars: number; best: number | null; unlocked: string[] } | null;
    collect(id: string, i: number): boolean; picked(id: string, i: number): boolean; collected(id: string): number; pack(): Loose; unpack(d: Loose): Loose;
  };
}
export interface BallCar {
  team: number; boost: number; maxBoost: number; readonly pos: P3; readonly vel: P3; readonly rot: Loose; readonly speed: number; readonly grounded: boolean; readonly boosting: boolean;
  readonly forward: P3; readonly up: P3; readonly right: P3; readonly upsideDown: boolean;
  control(i: { throttle?: number; steer?: number; brake?: boolean; boost?: boolean; jump?: boolean; pitch?: number; yaw?: number; roll?: number }): BallCar; update(dt: number): BallCar; spawn(s: P3 & { facing?: number }): BallCar; rightUp(): BallCar; remove(): void;
}
export interface ArenaPart {
  Arena: new (world: Loose, o?: { w?: number; l?: number; h?: number; curve?: number; segments?: number; goal?: { w?: number; h?: number; d?: number }; ball?: Loose; ballR?: number; bounce?: number; time?: number; punch?: number; replay?: number; pads?: boolean }) => On<Loose> & {
    ball: Loose; cars: Loose[]; score: [number, number]; clock: number; overtime: boolean; over: boolean; wait: number; pads: { x: number; z: number; big: boolean; wait: number }[]; spawns: (P3 & { facing: number })[][]; lastTouch: Loose; frames: Loose[];
    restart(): Loose; kickoff(countdown?: number): Loose; inGoal(p: P3): number; update(dt: number): Loose; predict(seconds?: number, step?: number): (P3 & { t: number; bounce: boolean })[]; danger(seconds?: number): number;
    playback(t: number): { p: P3; q: Loose }[] | null; readonly replayLength: number; readonly clockText: string;
  };
  BallCar: new (world: Loose, mesh: Loose, o?: { team?: number; at?: P3; wheels?: Loose[]; power?: number; steer?: number; top?: number; boostTop?: number; maxBoost?: number; boostUse?: number; boostPush?: number; jump?: number; dodge?: number; air?: number; start?: number; w?: number; h?: number; l?: number }) => BallCar;
  chaseBall(car: BallCar, arena: Loose, o?: { skill?: number }): { throttle: number; steer: number; boost: boolean; jump: boolean };
}
export interface PosesPart {
  POSES: Record<string, Loose>;
  Rig: new (parts: Loose, o?: { fade?: number; height?: number; poses?: Record<string, Loose> }) => { state: string; play(name: string, o?: { fade?: number }): Loose; upper(name: string | null): Loose; add(name: string, fn: Loose, rate?: number): Loose; update(dt: number, o?: { speed?: number; aim?: number; turn?: number }): Loose };
  figure(o?: { body?: string; skin?: string; legs?: string; shoes?: string; hair?: string; mat?: (colour: string) => Loose; scale?: number; shadows?: boolean }): Loose;
}
export interface DestructionPart {
  shatter(mesh: Loose, o?: { pieces?: number; at?: P3; flat?: boolean; inside?: Loose; world?: Loose; push?: number; seed?: number; density?: number; radius?: number }): Loose[];
  slice(mesh: Loose, point: P3, normal: P3, o?: { inside?: Loose }): Loose[];
  Rubble: new (scene?: Loose, o?: { max?: number; life?: number; shrink?: number }) => { add(pieces: Loose | Loose[]): Loose; update(dt: number): Loose; clear(): Loose; readonly count: number };
}
export interface PropsPart {
  simplify(geometry: Loose, keep?: number): Loose;
  Props: new (scene: Loose, o?: { renderer?: Loose; shadows?: boolean }) => {
    kind(name: string, geometry: Loose, material: Loose, o?: { lod?: (number | [number, Loose])[]; keep?: number[]; shadows?: boolean; shadowFar?: number; capacity?: number }): Loose;
    mesh(name: string): Loose; add(name: string, x: number, y: number, z: number, o?: { rot?: number | P3; scale?: number | P3; color?: string }): number;
    move(name: string, id: number, x: number, y: number, z: number): Loose; remove(name: string, id: number): Loose; hide(name: string, id: number, hidden?: boolean): Loose;
    scatter(name: string, count: number, area: { x0: number; z0: number; x1: number; z1: number } | ((rnd: () => number) => { x: number; z: number }), o?: { gap?: number; seed?: number; y?: (x: number, z: number) => number; keepOut?: (x: number, z: number) => boolean; scale?: [number, number]; spin?: boolean }): number[];
    done(o?: { margin?: number }): Loose; near(name: string, p: P3, r: number): { id: number; x: number; y: number; z: number; d: number }[]; count(name?: string): number; clear(): Loose;
  };
  Areas: new (o?: { depth?: number }) => { current: string | null; add(name: string, object: Loose, box?: Loose): Loose; link(a: string, b: string): Loose; at(p: P3): string | null; update(p: P3): Loose; readonly shown: string[] };
  Chunks: new (scene: Loose, o: { size?: number; radius?: number; make: (cx: number, cz: number) => Loose; drop?: (o: Loose, cx: number, cz: number) => void; perFrame?: number }) => { update(p: P3): Loose; ready(p: P3): boolean; clear(): Loose; readonly count: number };
}

export interface GS {
  sound: SoundPart; device: DevicePart; util: UtilPart; math: MathPart; palettes: PalettesPart;
  juice: JuicePart; effects: { Feel: typeof Feel }; controls: ControlsPart; pad: PadPart; moves: MovesPart;
  pixel: PixelPart; gfx: GfxPart; physics: PhysicsPart; vision: VisionPart; geo: GeoPart;
  things: ThingsPart; rounds: RoundsPart; pacing: PacingPart; aim: AimPart; senses: SensesPart; prefs: PrefsPart;
  camera2d: Camera2dPart; tiles: TilesPart; movers: MoversPart; anim: AnimPart; story: StoryPart; replay: ReplayPart; look2d: Look2dPart;
  tweak: TweakFn; brains: BrainsPart;
  board: BoardPart; battle: BattlePart; gen: GenPart; drag: DragPart; idle: IdlePart; party: PartyPart; rhythm: RhythmPart; strokes: StrokesPart; vehicles: VehiclesPart;
  level3d: Level3dPart; sky: SkyPart;
  combat: CombatPart; tactics: TacticsPart; climb: ClimbPart; missions: MissionsPart; cutscene: CutscenePart; prompts: PromptsPart;
  stealth: StealthPart; gadgets: GadgetsPart; campaign: CampaignPart; arena: ArenaPart; poses: PosesPart; destruction: DestructionPart; props: PropsPart;
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
