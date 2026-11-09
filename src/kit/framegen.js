// Frame generation for Next Gen and AR views on WebGPU: the game draws real frames at 60 fps and this
// fills the refreshes in between on a 120 Hz screen, so play looks twice as smooth for a few
// milliseconds of compute instead of a whole extra frame.
//
// No neural network: every pixel is moved along its own motion (three.js's per-pixel velocity, so
// moving things move, not just the camera), with depth deciding what is in front. The method follows
// the published free ones: AMD FSR 3 frame interpolation (MIT) for the forward splat of motion vectors
// with a depth-ordered atomic min and the background-first hole fill, and Mob-FGSR (SIGGRAPH 2024) for
// doing it cheaply on phones from the game's own motion and depth instead of optical flow. Written
// fresh in TSL (three.js's node language) so it runs as WebGPU compute, beside SGSR 2.
//
//   scenePass.setMRT(frameGenMRT());                 // the scene's pass writes motion and a see-through mask too
//   const fg = new FrameGen(renderer);               // kit use: hd3d-gpu.js GpuChain makes one per Next Gen / AR view
//   after each real frame:  fg.real({ color, velocity, reactive, depth, renderSize, outputSize, jitterDelta })
//   then fg.make(t) and draw fg.output (t = 0.5 halfway between the last two real frames, shown before
//   the newest, which then needs fg.keep() before the next real frame; t = 1.5 guesses half a frame
//   ahead, shown on the refresh after the newest, with no added lag)
// hd3d-gpu.js decides what each refresh shows and src/main.js calls it on the refreshes between real
// frames (src/kit/speed.js says when frame generation is on).
//
// Two modes: 'blend' (t = .5, interpolation) shows each real frame half a frame late but has the
// fewest smears; 'ahead' (t = 1.5, extrapolation) adds no lag, for reflex and rhythm games, and its
// edges are a little softer where things uncover. Kit use only: games never see it, the app turns it
// on (Settings › Frame generation) and a game can say frameGen: false (or 'ahead') in its definition.
//
// See-through things and glowing particles (transparent or added-light materials) have no single
// motion: the background shows through them. frameGenMRT() keeps them out of the motion picture (the
// background's motion stays) and marks where they are (reactive); there the made frame shows the
// newest real frame unmoved, so a spark or a glass edge never smears or shows twice (it moves at the
// game's own rate while everything round it moves at the screen's).
import {
  StorageTexture, StorageBufferAttribute, DataTexture, HalfFloatType, FloatType, Vector2, LinearFilter, NearestFilter,
  Node, BlendMode, MaterialBlending, NormalBlending, NoBlending,
} from 'three/webgpu';
import {
  Fn, instanceIndex, uint, int, float, vec2, vec4, ivec2, uniform, storage, atomicMin, atomicStore,
  textureStore, texture, If, select, clamp, abs, max, floor, dot, mix, length, floatBitsToUint, smoothstep,
  mrt, output, velocity, diffuseColor,
} from 'three/tsl';

const EMPTY = 0xffffffff;
const LUMA = vec4(.299, .587, .114, 0);

/** True for a material drawn see-through or with added light (glass, water, smoke, sparks, glows). */
export const seeThrough = m => !!m && (m.transparent === true || (m.blending !== NormalBlending && m.blending !== NoBlending));
// Picks one of two outputs by the material being drawn (worked out once per material, when it compiles).
class ByMaterial extends Node {
  constructor(solid, see) { super('vec4'); this.solid = solid; this.see = see; }
  setup(builder) { return seeThrough(builder.material) ? this.see : this.solid; }
}
const BLEND = new BlendMode(MaterialBlending);
/**
 * The scene pass's outputs for frame generation: the picture, motion (velocity) and the see-through
 * mask (reactive). Solid things write their motion; see-through things write motion with no weight
 * (alpha 0), so with their own blending the motion under them stays, and they add their coverage to
 * the mask. Extra outputs can be passed in.
 */
export function frameGenMRT(extra = {}) {
  const m = mrt({
    output,
    velocity: new ByMaterial(vec4(velocity, 0, 1), vec4(0)),
    reactive: new ByMaterial(vec4(0, 0, 0, 1), vec4(1, 1, 1, clamp(diffuseColor.a, 0, 1))),
    ...extra,
  });
  return m.setBlendMode('velocity', BLEND).setBlendMode('reactive', BLEND);
}
const NO_REACTIVE = (() => { const t = new DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })();

/**
 * One view's frame generator. The pictures it is given are three.js textures: color is the finished
 * frame at the screen's size (after SGSR 2), velocity is three's velocity MRT (NDC now minus NDC last
 * frame, at the render size) and depth is the scene's depth (0 near, 1 far, at the render size).
 */
export class FrameGen {
  constructor(r, { tolerance = .04 } = {}) {
    this.r = r; this.key = ''; this.frames = 0; this.ready = false;
    this.U = {
      rs: uniform(new Vector2(1, 1)), os: uniform(new Vector2(1, 1)), t: uniform(.5), jd: uniform(new Vector2()),
      tol: uniform(tolerance), interp: uniform(1), near: uniform(.1), far: uniform(1000),
    };
    this.stats = { real: 0, made: 0, ms: 0 };
  }

  /* (re)makes the buffers and the compute passes for a size */
  build(rw, rh, ow, oh) {
    const key = `${rw}x${rh}>${ow}x${oh}`;
    if (key === this.key) return;
    this.dispose(); this.key = key; this.frames = 0; this.ready = false;
    const n = rw * rh, on = ow * oh, U = this.U;
    const st = (w, h, type = HalfFloatType, filter = NearestFilter) => { const s = new StorageTexture(w, h); s.type = type; s.minFilter = s.magFilter = filter; return s; };
    // last real frame's colour (screen size), and its depth and see-through mask (render size, x and y), kept by copy at keep()
    this.prevColor = st(ow, oh, HalfFloatType, LinearFilter);
    this.prevDepth = st(rw, rh, FloatType);
    // mid-frame motion: one depth key per render pixel (atomic min), then the motion that won it
    this.keysAttr = new StorageBufferAttribute(new Uint32Array(n), 1);
    this.midMotion = st(rw, rh);      // xy: displacement (uv) from frame N back to N-1, z: depth, w: 1 found, 0 hole
    this.filled = st(rw, rh);         // the same with the holes filled from the background round them
    this.output = st(ow, oh, HalfFloatType, LinearFilter);
    const keys = storage(this.keysAttr, 'uint', n).toAtomic(), keysR = storage(this.keysAttr, 'uint', n);
    // the inputs change every frame (SGSR 2 takes turns between two pictures): nodes whose value real() sets
    const col = this.colN = texture(this.prevColor), vel = this.velN = texture(this.prevColor), dep = this.depN = texture(this.prevDepth);
    const rea = this.reaN = texture(NO_REACTIVE);
    const pcol = texture(this.prevColor), pdep = texture(this.prevDepth), mm = texture(this.midMotion), fm = texture(this.filled);
    const W = int(rw), H = int(rh), hi = ivec2(W.sub(1), H.sub(1));
    const xy = i => ivec2(int(i).mod(W), int(i).div(W));
    // velocity (NDC, y up) as a uv displacement from this frame back to the last (uv y down), without the
    // change in SGSR 2's jitter (else still pictures would shimmer by a pixel)
    const back = v => vec2(v.x.sub(U.jd.x).mul(-.5), v.y.sub(U.jd.y).mul(.5));
    const uvOf = p => vec2(p).add(.5).div(U.rs);
    const pixOf = u => clamp(ivec2(floor(u.mul(U.rs))), ivec2(0, 0), hi);
    const inside = p => p.x.greaterThanEqual(0).and(p.y.greaterThanEqual(0)).and(p.x.lessThan(W)).and(p.y.lessThan(H));
    const in01 = u => u.x.greaterThanEqual(0).and(u.y.greaterThanEqual(0)).and(u.x.lessThanEqual(1)).and(u.y.lessThanEqual(1));

    // 1 clear the keys and the motion
    this.cClear = Fn(() => {
      atomicStore(keys.element(instanceIndex), uint(EMPTY));
      textureStore(this.midMotion, xy(instanceIndex), vec4(0, 0, 1, 0));
    })().compute(n, [64]);

    // 2 splat: each pixel of the newest frame goes to where it is at time t (0 = last frame, 1 = newest),
    // the nearest winning (depth's bits order like the number, as depth is never negative)
    const target = (p, d) => ivec2(floor(uvOf(p).add(d.mul(float(1).sub(U.t))).mul(U.rs)));
    this.cSplat = Fn(() => {
      const p = xy(instanceIndex), z = dep.load(p).x, d = back(vel.load(p).xy), q = target(p, d);
      If(inside(q), () => { atomicMin(keys.element(q.y.mul(W).add(q.x)), floatBitsToUint(z)); });
    })().compute(n, [64]);

    // 3 resolve: the winners write their motion; untouched pixels stay holes
    this.cResolve = Fn(() => {
      const p = xy(instanceIndex), z = dep.load(p).x, d = back(vel.load(p).xy), q = target(p, d);
      If(inside(q), () => {
        If(keysR.element(q.y.mul(W).add(q.x)).equal(floatBitsToUint(z)), () => { textureStore(this.midMotion, q, vec4(d, z, 1)); });
      });
    })().compute(n, [64]);

    // 4 fill holes: a hole is something uncovered between the two frames, so it takes the motion of the
    // FARTHEST found pixel round it (the background), looking 1, 2 then 4 pixels out
    this.cFill = Fn(() => {
      const p = xy(instanceIndex), m = mm.load(p).toVar();
      If(m.w.lessThan(.5), () => {
        const best = vec4(0, 0, -1, 0).toVar();
        for (const s of [1, 2, 4]) for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const c = mm.load(clamp(p.add(ivec2(ox * s, oy * s)), ivec2(0, 0), hi));
          If(c.w.greaterThan(.5).and(c.z.greaterThan(best.z)), () => { best.assign(vec4(c.xyz, .5)); });
        }
        // nothing found round it either (a big uncovered area): the newest frame's own motion there
        If(best.z.lessThan(0), () => { best.assign(vec4(back(vel.load(p).xy), dep.load(p).x, .25)); });
        m.assign(best);
      });
      textureStore(this.filled, p, m);
    })().compute(n, [64]);

    // 5 compose, at the screen's size: the newest frame from where each pixel was at t = 1 and the last
    // frame from where it was at t = 0, each kept only if it sees the same surface (its depth isn't in
    // front of it), blended by time. Ahead of the newest frame (t > 1) there is only the newest to take from.
    const OW = int(ow);
    this.cCompose = Fn(() => {
      const i = int(instanceIndex), q = ivec2(i.mod(OW), i.div(OW)), u = vec2(q).add(.5).div(U.os);
      const m = fm.load(pixOf(u)), d = m.xy, z = m.z;                     // nearest: motion never blends across an edge
      const uN = u.sub(d.mul(float(1).sub(U.t))), uP = u.add(d.mul(U.t));
      const cN = col.sample(clamp(uN, 0, 1)).level(0), cP = pcol.sample(clamp(uP, 0, 1)).level(0);
      // compared as distance from the camera (the depth picture bunches everything far away near 1)
      const lin = v => U.near.mul(U.far).div(U.far.sub(v.mul(U.far.sub(U.near))));
      const L = lin(z), tol = L.mul(U.tol);
      const inN = in01(uN), inP = in01(uP).and(U.interp.greaterThan(.5));
      const okN = inN.and(lin(dep.load(pixOf(uN)).x).greaterThan(L.sub(tol)));
      const pP = pdep.load(pixOf(uP));
      // the last frame's see-through things were where they were, not where the background went: skip it there
      const okP = inP.and(lin(pP.x).greaterThan(L.sub(tol))).and(pP.y.lessThan(.25));
      // unmarked see-through things (a game's own blending) would show twice: where the two frames disagree
      // a lot about a pixel that is barely moving, keep the newest
      const still = length(d.mul(U.os)).lessThan(1.5), differ = abs(dot(cN.sub(cP), LUMA)).greaterThan(.2);
      // neither sees the same surface: the newest frame, unless that pixel has gone off the screen's edge
      // and the last frame still has it (else the edge row would be stretched into streaks)
      const lost = select(inN.not().and(inP), float(0), float(1));
      const wN = select(okN, select(okP, select(still.and(differ), float(1), U.t), float(1)), select(okP, float(0), lost));
      const made = mix(cP, cN, clamp(wN, 0, 1));
      // marked see-through things, here or where this pixel's colour comes from: the newest frame, unmoved
      // (faint glass is mostly left to the motion, as what shows through it moves with the background)
      const re = max(rea.sample(u).level(0).x, rea.sample(clamp(uN, 0, 1)).level(0).x);
      textureStore(this.output, q, mix(made, col.sample(u).level(0), smoothstep(.2, .7, re)));
    })().compute(on, [64]);

    // 6 keep the newest frame as next time's last frame
    this.cKeepC = Fn(() => { const i = int(instanceIndex), q = ivec2(i.mod(OW), i.div(OW)); textureStore(this.prevColor, q, col.sample(vec2(q).add(.5).div(U.os)).level(0)); })().compute(on, [64]);
    this.cKeepD = Fn(() => { const p = xy(instanceIndex); textureStore(this.prevDepth, p, vec4(dep.load(p).x, rea.sample(uvOf(p)).level(0).x, 0, 1)); })().compute(n, [64]);
  }

  /**
   * After a real frame: keeps it. o: { color, velocity, reactive (optional: frameGenMRT's mask), depth (three Textures), renderSize, outputSize
   * (Vector2 or [w, h]), camera (for its near and far), jitterDelta (this frame's jitter minus last frame's, in NDC; [0, 0] if none) }.
   * The previous frame stays in prevColor until the next real(), so make() always works between the
   * last two real frames.
   */
  real(o) {
    const rs = o.renderSize, os = o.outputSize, rw = rs.x ?? rs[0], rh = rs.y ?? rs[1], ow = os.x ?? os[0], oh = os.y ?? os[1];
    this.build(rw, rh, ow, oh);
    this.colN.value = o.color; this.velN.value = o.velocity; this.depN.value = o.depth; this.reaN.value = o.reactive || NO_REACTIVE; this.U.rs.value.set(rw, rh); this.U.os.value.set(ow, oh);
    if (o.camera) { this.U.near.value = o.camera.near; this.U.far.value = o.camera.far; }
    const jd = o.jitterDelta || [0, 0]; this.U.jd.value.set(jd.x ?? jd[0], jd.y ?? jd[1]);
    this.frames++; this.stats.real++;
    this.ready = this.frames >= 2;
  }
  /** Call after real() and BEFORE the next real frame is drawn: copies the newest frame to be next time's last frame. */
  keep() {
    if (this.frames) this.r.compute([this.cKeepC, this.cKeepD]);
  }
  /**
   * Makes the in-between frame into this.output (a StorageTexture at the screen's size). t: .5 between
   * the last two real frames (needs keep() to have run before the newest real frame), 1.5 half a frame
   * past the newest. Returns false if there aren't two real frames yet.
   */
  make(t = .5) {
    if (!this.ready) return false;
    const r = this.r, t0 = performance.now();
    this.U.t.value = t; this.U.interp.value = t <= 1 ? 1 : 0;
    // one compute pass: WebGPU finishes each step's writes before the next step reads them
    r.compute([this.cClear, this.cSplat, this.cResolve, this.cFill, this.cCompose]);
    this.stats.made++; this.stats.ms = this.stats.ms * .9 + (performance.now() - t0) * .1;   // CPU time to queue it (the GPU time is measured by the app)
    return true;
  }
  /** Forget the last frames (a camera cut, a new round, a resize): nothing is made until two new real frames. */
  reset() { this.frames = 0; this.ready = false; }
  dispose() {
    for (const k of ['prevColor', 'prevDepth', 'midMotion', 'filled', 'output']) { this[k]?.dispose(); this[k] = null; }
    for (const k of ['cClear', 'cSplat', 'cResolve', 'cFill', 'cCompose', 'cKeepC', 'cKeepD']) { this[k]?.dispose?.(); this[k] = null; }
    this.keysAttr = null; this.key = '';
  }
}
