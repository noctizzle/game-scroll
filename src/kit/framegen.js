// Frame generation for Next Gen and AR views on WebGPU: the game draws real frames at 60 fps (or 45, 40,
// 30) and this fills the refreshes in between on a fast screen (90, 120 or 144 Hz), so play looks as
// smooth as the screen for a few milliseconds of compute instead of whole extra frames.
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
//   after each real frame:  fg.real({ color, velocity, reactive, depth, renderSize, outputSize, camera, jitter, jitterDelta })
//   then fg.make(t) and draw fg.output: t is the moment to show, 0 the last real frame and 1 the newest
//   (0 < t < 1 is in between, which needs fg.keep() once after the last made frame of a pair and
//   before the next real frame; t > 1 is a guess past the newest, with no added delay)
// hd3d-gpu.js decides what each refresh shows and src/main.js calls it on the refreshes between real
// frames (src/kit/speed.js says when frame generation is on).
//
// Motion: the camera's turn is followed exactly (a rotation, from the camera's last three frames),
// and the rest moves along a curve through where each pixel was in the last three frames (only the
// sideways bend: spins and arcs, never a speed-up that would overshoot). Past the newest frame a thing
// that has been slowing down is guessed to keep slowing down.
//
// Two modes: 'blend' (interpolation) shows each real frame a refresh late but has the fewest smears;
// 'ahead' (extrapolation) adds no lag, for reflex and rhythm games, and its edges are a little softer
// where things uncover. Kit use only: games never see it, the app turns it on (Settings › Frame
// generation) and a game can say frameGen: false (or 'ahead') in its definition.
//
// See-through things and glowing particles (transparent or added-light materials) have no single
// motion: the background shows through them. frameGenMRT() keeps them out of the motion picture (the
// background's motion stays) and marks where they are (reactive); there the made frame shows the
// newest real frame unmoved, so a glass edge never smears or shows twice. Glowing particles that say how
// they move (particleMotion(), as gs.hd's GPU sparks do) are moved along their own motion instead, where
// the last frame shows the same spark where it says it came from, so sparks move at the screen's rate
// too. Smoke (ordinary see-through blending) stays as drawn: moving it dragged the ground behind it
// along, which scored worse against the truth than leaving it (scripts/framegen-test.cjs --hard).
import {
  StorageTexture, StorageBufferAttribute, DataTexture, HalfFloatType, FloatType, Vector2, Matrix3, Matrix4, Quaternion,
  LinearFilter, NearestFilter, Node, BlendMode, MaterialBlending, NormalBlending, NoBlending, AdditiveBlending,
} from 'three/webgpu';
import {
  Fn, instanceIndex, uint, int, float, vec2, vec3, vec4, ivec2, uniform, storage, atomicMin, atomicStore, atomicAdd,
  textureStore, texture, If, select, clamp, abs, max, min, floor, dot, mix, length, floatBitsToUint, smoothstep,
  mrt, output, velocity, diffuseColor, cameraProjectionMatrix, cameraViewMatrix,
} from 'three/tsl';

const EMPTY = 0xffffffff;
const LUMA = vec4(.299, .587, .114, 0);

/** True for a material drawn see-through or with added light (glass, water, smoke, sparks, glows). */
export const seeThrough = m => !!m && (m.transparent === true || (m.blending !== NormalBlending && m.blending !== NoBlending));
// Picks one of two outputs by the material being drawn (worked out once per material, when it compiles).
class ByMaterial extends Node {
  constructor(solid, see, moving = null) { super('vec4'); this.solid = solid; this.see = see; this.moving = moving; }
  setup(builder) { const m = builder.material; return !seeThrough(m) ? this.solid : this.moving && m.userData?.fgMotion && m.blending === AdditiveBlending ? this.moving(m.userData.fgMotion) : this.see; }
}
const BLEND = new BlendMode(MaterialBlending);
/**
 * The scene pass's outputs for frame generation: the picture, motion (velocity) and the see-through
 * mask (reactive). Solid things write their motion; see-through things write motion with no weight
 * (alpha 0), so with their own blending the motion under them stays, and they add their coverage to
 * the mask (x). Particles that say how they move add their own motion (NDC, weighted by coverage) to
 * the mask's y and z, so the motion of the particles at a pixel is (y, z) / x. Extra outputs can be passed in.
 */
export function frameGenMRT(extra = {}) {
  const a = clamp(diffuseColor.a, 0, 1);
  const m = mrt({
    output,
    velocity: new ByMaterial(vec4(velocity, 0, 1), vec4(0)),
    reactive: new ByMaterial(vec4(0, 0, 0, 1), vec4(1, 0, 0, a), mv => vec4(1, mv.x, mv.y, a)),
    ...extra,
  });
  return m.setBlendMode('velocity', BLEND).setBlendMode('reactive', BLEND);
}

/** The camera's view and projection at the last real frame, as drawn (the app sets it): for particleMotion(). */
export const fgPrevVP = uniform(new Matrix4());
/**
 * Lets frame generation move a glowing material (added light: sparks, fire, magic) along its own
 * motion: pos is the world position (a TSL vec3) of what is drawn, step how far it moved since the last
 * real frame (a TSL vec3, in world units). gs.hd's GPU particles do this; any sprite or particle
 * material can. Ordinary see-through materials (smoke) may say it too, but stay as drawn for now.
 */
export function particleMotion(material, pos, step) {
  const c = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(pos, 1)), p = fgPrevVP.mul(vec4(pos.sub(step), 1));
  material.userData.fgMotion = c.xy.div(c.w).sub(p.xy.div(max(p.w, 1e-5)));
  material.needsUpdate = true;
  return material;
}
const NO_REACTIVE = (() => { const t = new DataTexture(new Uint8Array(4), 1, 1); t.needsUpdate = true; return t; })();

/* ---------- camera poses: the turn between frames, as a rotation of the picture ---------- */
// A pose is the camera's facing (a quaternion) and its projection (fx, fy, and the centre cx, cy without
// SGSR 2's jitter). homography(a, b) maps a direction's NDC in pose a to its NDC in pose b (a 3 x 3
// matrix on (x, y, 1)): what the picture does when only the camera turns or zooms.
export const newPose = () => ({ q: new Quaternion(), fx: 1, fy: 1, cx: 0, cy: 0, persp: true });
export function poseOf(camera, jitter = null, out = newPose()) {
  camera.updateMatrixWorld(); camera.getWorldQuaternion(out.q);
  const P = camera.projectionMatrix.elements, j = jitter || [0, 0];
  out.persp = !!camera.isPerspectiveCamera && P[15] === 0;
  out.fx = P[0]; out.fy = P[5]; out.cx = P[8] + (j.x ?? j[0]); out.cy = P[9] + (j.y ?? j[1]);
  return out;
}
export function copyPose(a, out = newPose()) { out.q.copy(a.q); out.fx = a.fx; out.fy = a.fy; out.cx = a.cx; out.cy = a.cy; out.persp = a.persp; return out; }
/** The pose at t between a (0) and b (1), or past b (t > 1). */
export function lerpPose(a, b, t, out = newPose()) {
  out.q.copy(a.q).slerp(b.q, t); out.persp = a.persp && b.persp;
  out.fx = a.fx + (b.fx - a.fx) * t; out.fy = a.fy + (b.fy - a.fy) * t; out.cx = a.cx + (b.cx - a.cx) * t; out.cy = a.cy + (b.cy - a.cy) * t;
  return out;
}
const M4 = new Matrix4(), RA = new Matrix3(), RB = new Matrix3(), KM = new Matrix3();
export function homography(a, b, out = new Matrix3()) {
  if (!a.persp || !b.persp) return out.identity();
  RA.setFromMatrix4(M4.makeRotationFromQuaternion(a.q)); RB.setFromMatrix4(M4.makeRotationFromQuaternion(b.q)).transpose();
  // NDC (x, y) in a -> a camera-space direction ((x + cx) / fx, (y + cy) / fy, -1) -> world -> b's camera -> b's NDC
  out.set(1 / a.fx, 0, a.cx / a.fx, 0, 1 / a.fy, a.cy / a.fy, 0, 0, -1);
  out.premultiply(RA).premultiply(RB);
  return out.premultiply(KM.set(b.fx, 0, b.cx, 0, b.fy, b.cy, 0, 0, -1));
}
// a uv (y down) moved by a homography uniform (TSL)
const ndcOf = u => vec2(u.x.mul(2).sub(1), float(1).sub(u.y.mul(2)));
const warpUV = (u, Hm) => { const h = Hm.mul(vec3(ndcOf(u), 1)), z = max(h.z, 1e-4); return vec2(h.x.div(z).mul(.5).add(.5), float(.5).sub(h.y.div(z).mul(.5))); };
export { warpUV };

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
      // the camera's turn: newest -> last frame, last -> the one before, newest -> the moment made; 1 once three frames are in
      Hb: uniform(new Matrix3()), Hb2: uniform(new Matrix3()), Ht: uniform(new Matrix3()), hist: uniform(0),
    };
    this.poses = [newPose(), newPose(), newPose()];   // newest, last, the one before
    this.stats = { real: 0, made: 0, ms: 0 };
  }

  /* (re)makes the buffers and the compute passes for a size */
  build(rw, rh, ow, oh) {
    const key = `${rw}x${rh}>${ow}x${oh}`;
    if (key === this.key) return;
    this.dispose(); this.key = key; this.frames = 0; this.ready = false;
    const n = rw * rh, on = ow * oh, U = this.U, upscaled = ow * oh > rw * rh * 1.1;
    const st = (w, h, type = HalfFloatType, filter = NearestFilter) => { const s = new StorageTexture(w, h); s.type = type; s.minFilter = s.magFilter = filter; return s; };
    // last real frame's colour (screen size), and at the render size its depth (x), see-through mask (y)
    // and motion back to the frame before it (zw: for the curve through three frames), kept at keep()
    this.prevColor = st(ow, oh, HalfFloatType, LinearFilter);
    this.prevDepth = st(rw, rh, FloatType);
    // mid-frame motion: one depth key per render pixel (atomic min), then the motion that won it
    this.keysAttr = new StorageBufferAttribute(new Uint32Array(n), 1);
    this.midMotion = st(rw, rh);      // xy: displacement (uv) from frame N back to N-1, z: depth, w: 1 found (2: a moving particle), 0 hole
    this.midBend = st(rw, rh);        // xy: how far the camera's turn and the curve put it off the straight line (uv)
    this.filled = st(rw, rh);         // the same with the holes filled from the background round them
    this.filledBend = st(rw, rh);
    this.output = st(ow, oh, HalfFloatType, LinearFilter);
    const keys = storage(this.keysAttr, 'uint', n).toAtomic(), keysR = storage(this.keysAttr, 'uint', n);
    // the inputs change every frame (SGSR 2 takes turns between two pictures): nodes whose value real() sets
    const col = this.colN = texture(this.prevColor), vel = this.velN = texture(this.prevColor), dep = this.depN = texture(this.prevDepth);
    const rea = this.reaN = texture(NO_REACTIVE);
    const pcol = texture(this.prevColor), pdep = texture(this.prevDepth), mm = texture(this.midMotion), mb = texture(this.midBend);
    const fm = texture(this.filled), fb = texture(this.filledBend);
    const W = int(rw), H = int(rh), hi = ivec2(W.sub(1), H.sub(1));
    const xy = i => ivec2(int(i).mod(W), int(i).div(W));
    // velocity (NDC, y up) as a uv displacement from this frame back to the last (uv y down), without the
    // change in SGSR 2's jitter (else still pictures would shimmer by a pixel)
    const back = v => vec2(v.x.sub(U.jd.x).mul(-.5), v.y.sub(U.jd.y).mul(.5));
    const uvOf = p => vec2(p).add(.5).div(U.rs);
    const pixOf = u => clamp(ivec2(floor(u.mul(U.rs))), ivec2(0, 0), hi);
    const inside = p => p.x.greaterThanEqual(0).and(p.y.greaterThanEqual(0)).and(p.x.lessThan(W)).and(p.y.lessThan(H));
    const in01 = u => u.x.greaterThanEqual(0).and(u.y.greaterThanEqual(0)).and(u.x.lessThanEqual(1)).and(u.y.lessThanEqual(1));
    // compared as distance from the camera (the depth picture bunches everything far away near 1)
    const lin = v => U.near.mul(U.far).div(U.far.sub(v.mul(U.far.sub(U.near))));
    // particles' own motion at a pixel (NDC) and how much of it is them
    const partMove = r => r.yz.div(max(r.x, 1e-4));
    const movingOf = (r, size) => smoothstep(.25, 1, length(partMove(r).mul(.5).mul(size))).mul(smoothstep(.002, .01, r.x));
    // the last frame kept its see-through cover in y, less than 0 where a moving particle was: nothing there
    const clear = (y, most) => y.greaterThanEqual(0).and(y.lessThan(most));
    // A moving particle's pixel is moved along its own motion only where the last frame shows a moving
    // particle where it says it came from, about as bright: one particle, followed. Where particles cross
    // (their motions mixed at a pixel) or flare up, it stays as drawn, like any see-through thing.
    const liftAt = u => {
      const lift = float(0).toVar(), uc = clamp(u, 0, 1), r = rea.sample(uc).level(0);
      If(movingOf(r, U.os).greaterThan(.5), () => {
        const uF = u.add(back(partMove(r)));
        const same = in01(uF).and(pdep.load(pixOf(uF)).y.lessThan(0)).and(abs(dot(col.sample(uc).level(0).sub(pcol.sample(clamp(uF, 0, 1)).level(0)), LUMA)).lessThan(.05));
        lift.assign(select(same, float(1), float(0)));
      });
      return lift;
    };

    // Where a pixel of the newest frame is at time t (s = t - 1): the camera's exact turn, then the rest
    // along a curve through the last three frames. Returns its straight-line motion d (uv, newest back to
    // last), the bend e off that line, its depth key z and whether a moving particle owns it.
    const motionAt = p => {
      const u0 = uvOf(p), z0 = dep.load(p).x, r4 = rea.load(p);
      const dv = back(vel.load(p).xy), dp = back(partMove(r4));
      const part = liftAt(u0).greaterThan(.5);
      // the camera's turn from the newest frame back to the last, and what's left (moves, and the camera's slide)
      const dRot = warpUV(u0, U.Hb).sub(u0), rest = dv.sub(dRot);
      // the same pixel's motion a frame earlier (kept at keep()), less that frame's turn
      const uP0 = u0.add(dv), pd = pdep.load(pixOf(uP0)), L = lin(z0);
      const okH = U.hist.greaterThan(.5).and(in01(uP0)).and(abs(lin(pd.x).sub(L)).lessThan(L.mul(.15).add(.05)));
      const rest2 = pd.zw.sub(warpUV(uP0, U.Hb2).sub(uP0));
      const lr = length(rest), dir = rest.div(max(lr, 1e-7));
      // the bend: sideways only (a speed-up or slow-down along the path would overshoot), at most half the step
      const b = rest2.sub(rest).mul(.5), bs = b.sub(dir.mul(dot(b, dir))), lb = length(bs);
      const bend = select(okH.and(lr.greaterThan(1e-6)), bs.mul(min(float(1), lr.mul(.5).div(max(lb, 1e-9)))), vec2(0));
      // past the newest frame: slowing down keeps slowing down (never speeds up)
      const s = U.t.sub(1), slow = select(okH.and(s.greaterThan(0)), clamp(lr.div(max(length(rest2), 1e-7)), 0, 1), float(1));
      const at = warpUV(u0, U.Ht).sub(u0).add(rest.mul(s.negate()).mul(slow)).add(bend.mul(s.add(s.mul(s))));
      const e = select(part, vec2(0), at.sub(dv.mul(float(1).sub(U.t))));
      return { d: select(part, dp, dv), e, z: select(part, float(0), z0), part };
    };

    // 1 clear the keys and the motion
    this.cClear = Fn(() => {
      atomicStore(keys.element(instanceIndex), uint(EMPTY));
      textureStore(this.midMotion, xy(instanceIndex), vec4(0, 0, 1, 0));
      textureStore(this.midBend, xy(instanceIndex), vec4(0));
    })().compute(n, [64]);

    // 2 splat: each pixel of the newest frame goes to where it is at time t (0 = last frame, 1 = newest),
    // the nearest winning (depth's bits order like the number, as depth is never negative; moving particles count as nearest)
    const target = (p, m) => ivec2(floor(uvOf(p).add(m.d.mul(float(1).sub(U.t))).add(m.e).mul(U.rs)));
    this.cSplat = Fn(() => {
      const p = xy(instanceIndex), m = motionAt(p), q = target(p, m);
      If(inside(q), () => { atomicMin(keys.element(q.y.mul(W).add(q.x)), floatBitsToUint(m.z)); });
    })().compute(n, [64]);

    // 3 resolve: the winners write their motion; untouched pixels stay holes
    this.cResolve = Fn(() => {
      const p = xy(instanceIndex), m = motionAt(p), q = target(p, m);
      If(inside(q), () => {
        If(keysR.element(q.y.mul(W).add(q.x)).equal(floatBitsToUint(m.z)), () => {
          textureStore(this.midMotion, q, vec4(m.d, m.z, select(m.part, float(2), float(1))));
          textureStore(this.midBend, q, vec4(m.e, 0, 0));
        });
      });
    })().compute(n, [64]);

    // 4 fill holes: a hole is something uncovered between the two frames, so it takes the motion of the
    // FARTHEST found pixel round it (the background), looking 1, 2 then 4 pixels out
    this.cFill = Fn(() => {
      const p = xy(instanceIndex), m = mm.load(p).toVar(), e = mb.load(p).xy.toVar();
      If(m.w.lessThan(.5), () => {
        const best = vec4(0, 0, -1, 0).toVar(), be = vec2(0).toVar();
        for (const s of [1, 2, 4]) for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const at = clamp(p.add(ivec2(ox * s, oy * s)), ivec2(0, 0), hi), c = mm.load(at);
          // (not a moving particle's: what a particle uncovers moves with the background)
          If(c.w.greaterThan(.5).and(c.w.lessThan(1.5)).and(c.z.greaterThan(best.z)), () => { best.assign(vec4(c.xyz, .5)); be.assign(mb.load(at).xy); });
        }
        // nothing found round it either (a big uncovered area): the newest frame's own motion there
        If(best.z.lessThan(0), () => { best.assign(vec4(back(vel.load(p).xy), dep.load(p).x, .25)); be.assign(vec2(0)); });
        m.assign(best); e.assign(be);
      });
      textureStore(this.filled, p, m); textureStore(this.filledBend, p, vec4(e, 0, 0));
    })().compute(n, [64]);

    // 5 compose, at the screen's size: the newest frame from where each pixel was at t = 1 and the last
    // frame from where it was at t = 0, each kept only if it sees the same surface (its depth isn't in
    // front of it), blended by time. Ahead of the newest frame (t > 1) there is only the newest to take from.
    const OW = int(ow);
    const fromN = (u, m, e) => u.sub(m.xy.mul(float(1).sub(U.t))).sub(e), fromP = (u, m, e) => u.add(m.xy.mul(U.t)).sub(e);
    this.cCompose = Fn(() => {
      const i = int(instanceIndex), q = ivec2(i.mod(OW), i.div(OW)), u = vec2(q).add(.5).div(U.os);
      const pc = pixOf(u), m = fm.load(pc).toVar(), e = fb.load(pc).xy.toVar();   // nearest: motion never blends across an edge
      if (upscaled) {
        // drawn smaller than the screen, the motion is in blocks of several screen pixels: at a moving edge,
        // of the four motions round this pixel take the one whose two frames agree (the same surface at both moments)
        const f = u.mul(U.rs).sub(.5), b0 = ivec2(floor(f)), C = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => clamp(b0.add(ivec2(x, y)), ivec2(0, 0), hi));
        const ms = C.map(c => fm.load(c)), spread = C.slice(1).reduce((s, c, k) => max(s, length(ms[k + 1].xy.sub(ms[0].xy).mul(U.os))), float(0));
        If(spread.greaterThan(.75).and(U.interp.greaterThan(.5)), () => {
          const best = float(1e9).toVar();
          C.forEach((c, k) => {
            const ek = fb.load(c).xy, d = abs(dot(col.sample(clamp(fromN(u, ms[k], ek), 0, 1)).level(0).sub(pcol.sample(clamp(fromP(u, ms[k], ek), 0, 1)).level(0)), LUMA));
            const cost = d.add(select(ms[k].w.greaterThan(.9), float(0), float(.05)));
            If(cost.lessThan(best), () => { best.assign(cost); m.assign(ms[k]); e.assign(ek); });
          });
        });
      }
      const d = m.xy, z = m.z, isPart = m.w.greaterThan(1.5);
      const uN = fromN(u, m, e), uP = fromP(u, m, e);
      const cN = col.sample(clamp(uN, 0, 1)).level(0), cP = pcol.sample(clamp(uP, 0, 1)).level(0);
      const L = lin(z), tol = L.mul(U.tol);
      const inN = in01(uN), inP = in01(uP).and(U.interp.greaterThan(.5));
      // the newest frame's pixel there is a moving particle, but this one is the background behind it: not from there
      const rN = rea.sample(clamp(uN, 0, 1)).level(0), liftN = liftAt(uN), partN = liftN.greaterThan(.5);
      const okN = inN.and(lin(dep.load(pixOf(uN)).x).greaterThan(L.sub(tol))).and(isPart.or(partN.not()));
      const pP = pdep.load(pixOf(uP));
      // the last frame's see-through things were where they were, not where the background went: skip it there
      const okP = inP.and(lin(pP.x).greaterThan(L.sub(tol))).and(clear(pP.y, .25));
      // unmarked see-through things (a game's own blending) would show twice: where the two frames disagree
      // a lot about a pixel that is barely moving, keep the newest
      const still = length(d.mul(U.os)).lessThan(1.5), differ = abs(dot(cN.sub(cP), LUMA)).greaterThan(.2);
      // neither sees the same surface: the newest frame, unless that pixel has gone off the screen's edge
      // and the last frame still has it (else the edge row would be stretched into streaks)
      const lost = select(inN.not().and(inP), float(0), float(1));
      const wN = select(okN, select(okP, select(still.and(differ), float(1), U.t), float(1)), select(okP, float(0), lost));
      const made = mix(cP, cN, clamp(wN, 0, 1)).toVar();
      // a moving particle followed from the last frame: its light then and now, by time
      If(isPart, () => { made.assign(select(in01(uP).and(U.interp.greaterThan(.5)), mix(cP, cN, U.t), cN)); });
      // marked see-through things that weren't lifted and moved, here or where this pixel's colour comes
      // from: the newest frame, unmoved (faint glass is mostly left to the motion, as what shows through it
      // moves with the background)
      const r0 = rea.sample(u).level(0), stat = (r, lift) => r.x.mul(float(1).sub(lift));
      const re = select(isPart, float(0), max(stat(r0, liftAt(u)), stat(rN, liftN)));
      textureStore(this.output, q, mix(made, col.sample(u).level(0), smoothstep(.2, .7, re)));
    })().compute(on, [64]);

    // 6 keep the newest frame as next time's last frame (with its motion, for next time's curve)
    this.cKeepC = Fn(() => { const i = int(instanceIndex), q = ivec2(i.mod(OW), i.div(OW)); textureStore(this.prevColor, q, col.sample(vec2(q).add(.5).div(U.os)).level(0)); })().compute(on, [64]);
    this.cKeepD = Fn(() => {
      const p = xy(instanceIndex), r = rea.load(p), cover = select(movingOf(r, U.rs).greaterThan(.5), max(r.x, .001).negate(), r.x);
      textureStore(this.prevDepth, p, vec4(dep.load(p).x, cover, back(vel.load(p).xy)));
    })().compute(n, [64]);
  }

  /**
   * After a real frame: keeps it. o: { color, velocity, reactive (optional: frameGenMRT's mask), depth (three Textures), renderSize, outputSize
   * (Vector2 or [w, h]), camera (for its near and far, and its turn), jitter (this frame's SGSR 2 jitter in NDC, [0, 0] if none),
   * jitterDelta (this frame's jitter minus last frame's, in NDC; [0, 0] if none) }.
   * The previous frame stays in prevColor until keep(), so make() works between the last two real frames.
   */
  real(o) {
    const rs = o.renderSize, os = o.outputSize, rw = rs.x ?? rs[0], rh = rs.y ?? rs[1], ow = os.x ?? os[0], oh = os.y ?? os[1];
    this.build(rw, rh, ow, oh);
    this.colN.value = o.color; this.velN.value = o.velocity; this.depN.value = o.depth; this.reaN.value = o.reactive || NO_REACTIVE; this.U.rs.value.set(rw, rh); this.U.os.value.set(ow, oh);
    const U = this.U, P = this.poses;
    if (o.camera) { U.near.value = o.camera.near; U.far.value = o.camera.far; }
    const jd = o.jitterDelta || [0, 0]; U.jd.value.set(jd.x ?? jd[0], jd.y ?? jd[1]);
    // the camera's last three poses, and its turns between them
    P.unshift(P.pop());
    if (o.camera) poseOf(o.camera, o.jitter, P[0]); else copyPose(P[1], P[0]);
    this.frames++; this.stats.real++;
    this.ready = this.frames >= 2;
    homography(P[0], this.frames >= 2 ? P[1] : P[0], U.Hb.value);
    homography(P[1], this.frames >= 3 ? P[2] : P[1], U.Hb2.value);
    U.hist.value = this.frames >= 3 ? 1 : 0;
  }
  /** Call after the last make() between a pair and BEFORE the next real frame is drawn: copies the newest frame to be next time's last frame. */
  keep() {
    if (this.frames) this.r.compute([this.cKeepC, this.cKeepD]);
  }
  /** The camera's pose at t (0 the last real frame, 1 the newest, more is past it), into out. */
  poseAt(t, out = newPose()) { return this.frames >= 2 ? lerpPose(this.poses[1], this.poses[0], t, out) : copyPose(this.poses[0], out); }
  /**
   * Makes the frame at t into this.output (a StorageTexture at the screen's size): 0 < t < 1 between the
   * last two real frames (needs keep() to have run before the newest real frame), t > 1 past the newest.
   * Returns false if there aren't two real frames yet.
   */
  make(t = .5) {
    if (!this.ready) return false;
    const r = this.r, t0 = performance.now(), U = this.U;
    U.t.value = t; U.interp.value = t <= 1 ? 1 : 0;
    homography(this.poses[0], this.poseAt(t, TP), U.Ht.value);
    // one compute pass: WebGPU finishes each step's writes before the next step reads them
    r.compute([this.cClear, this.cSplat, this.cResolve, this.cFill, this.cCompose]);
    this.stats.made++; this.stats.ms = this.stats.ms * .9 + (performance.now() - t0) * .1;   // CPU time to queue it (the GPU time is measured by the app)
    return true;
  }
  /** Forget the last frames (a camera cut, a new round, a resize): nothing is made until two new real frames. */
  reset() { this.frames = 0; this.ready = false; }
  dispose() {
    for (const k of ['prevColor', 'prevDepth', 'midMotion', 'midBend', 'filled', 'filledBend', 'output']) { this[k]?.dispose(); this[k] = null; }
    for (const k of ['cClear', 'cSplat', 'cResolve', 'cFill', 'cCompose', 'cKeepC', 'cKeepD']) { this[k]?.dispose?.(); this[k] = null; }
    this.keysAttr = null; this.key = '';
  }
}
const TP = newPose();

/**
 * Still-picture check (src/kit/hd3d-gpu.js): compares a sixteenth of the finished frame's pixels with the
 * last frame's and counts the ones that changed visibly, so the app can stop redrawing a scene where
 * nothing moves. check(color, w, h) queues it; changed() is the count from a frame or two ago (a read back
 * that never waits), or -1 while none has come back.
 */
export class StillCheck {
  constructor(r) { this.r = r; this.key = ''; this.count = -1; this.busy = false; this.seen = 0; }
  build(w, h) {
    const sw = Math.max(1, w >> 2), sh = Math.max(1, h >> 2), key = `${sw}x${sh}`;
    if (key === this.key) return;
    this.dispose(); this.key = key; this.n = sw * sh; this.fresh = true;
    this.lumA = new StorageBufferAttribute(new Float32Array(this.n), 1);
    this.cntA = new StorageBufferAttribute(new Uint32Array(1), 1);
    const lum = storage(this.lumA, 'float', this.n), cnt = storage(this.cntA, 'uint', 1).toAtomic();
    const col = this.colN = texture(NO_REACTIVE), SW = int(sw), sz = this.sz = uniform(new Vector2(1, 1));
    this.cZero = Fn(() => { atomicStore(cnt.element(0), uint(0)); })().compute(1, [1]);
    this.cCmp = Fn(() => {
      const i = int(instanceIndex), q = vec2(ivec2(i.mod(SW), i.div(SW))).mul(4).add(2).div(sz);
      const l = dot(col.sample(q).level(0), LUMA), was = lum.element(i);
      If(abs(l.sub(was)).greaterThan(2 / 255), () => { atomicAdd(cnt.element(0), uint(1)); });
      lum.element(i).assign(l);
    })().compute(this.n, [64]);
  }
  check(color, w, h) {
    this.build(w, h); this.colN.value = color; this.sz.value.set(w, h);
    this.r.compute([this.cZero, this.cCmp]);
    if (this.fresh) { this.fresh = false; return; }   // the first compare is against nothing
    if (this.busy) return;
    this.busy = true; const key = this.key;
    this.r.getArrayBufferAsync(this.cntA).then(b => { if (key === this.key) { this.count = new Uint32Array(b)[0]; this.seen++; } }).catch(() => {}).finally(() => { this.busy = false; });
  }
  /** Changed pixels (a sixteenth sampled) in a recent frame, or -1 if not known yet. */
  changed() { return this.count; }
  reset() { this.count = -1; this.fresh = true; }
  dispose() { for (const k of ['cZero', 'cCmp']) { this[k]?.dispose?.(); this[k] = null; } this.lumA = this.cntA = null; this.key = ''; }
}
