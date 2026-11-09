// The Next Gen look on WebGPU: three.js's WebGPURenderer with the screen effects written as TSL nodes.
// It loads only when the player turns WebGPU on (Settings › Graphics, top phones) and the device has
// it; gpu.js imports it. hd3d.js asks gpuFits(view) each frame and draws a view here only when
// everything in it has a WebGPU version, so a game with a part that doesn't yet (docs/webgpu-move.md)
// keeps drawing on WebGL as before.
//
// The pieces match hd3d.js's FINAL_EFFECTS one for one (bloom, grade, glare, tone, vignette, grain,
// hurt, smoothing), plus three's own GTAO for ambient occlusion and the outdoor air as a fog node.
// scripts/look-compare.cjs --webgpu draws the same scenes both ways and compares them.
// Kit use only.
import { RenderPipeline, PMREMGenerator, Vector2, Vector3, Color, Sprite, SpriteNodeMaterial, InstancedBufferAttribute, AdditiveBlending, NormalBlending,
  MeshBasicNodeMaterial, NodeMaterial, QuadMesh, RenderTarget, Texture, Matrix4, HalfFloatType, NoToneMapping, ACESFilmicToneMapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three/webgpu';
import {
  pass, mrt, output, normalView, uniform, texture, screenUV, screenCoordinate, screenSize, renderOutput, Fn,
  vec2, vec3, vec4, float, mix, smoothstep, dot, exp, length, max, pow, clamp, log2, fract, sin, abs, select,
  positionWorld, cameraPosition, instancedBufferAttribute, uv, rtt, depth, ivec2, min,
} from 'three/tsl';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const LUM = vec3(.2126, .7152, .0722);

/** The studio reflections for this renderer (WebGL's can't be shared: it lives on the other GPU API). */
export function studioEnv(r) {
  const pm = new PMREMGenerator(r), t = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  return t;
}

/* ---------- outdoor air (hd3d.js AIR_GLSL: haze and valley mist; the 'air' look effect) ---------- */
// The same numbers as the WebGL patch: hd3d's AIR uniforms are copied in each frame (airSync).
export function airNodes(AIR) {
  const U = {
    sun: uniform(new Vector3(0, 1, 0)), c: uniform(new Color()), cs: uniform(new Color()), haze: uniform(0),
    mist: uniform(new Vector3()), patchy: uniform(0), drift: uniform(new Vector2()), noise: null,
  };
  const sync = () => {
    U.sun.value.copy(AIR.gsSun.value); U.c.value.copy(AIR.gsAirC.value); U.cs.value.copy(AIR.gsAirSun.value); U.haze.value = AIR.gsHaze.value;
    const m = AIR.gsMist.value; U.mist.value.set(m.x, m.y, m.z); U.patchy.value = m.w; U.drift.value.copy(AIR.gsDrift.value);
  };
  let fogNode = null;
  const node = () => fogNode ||= Fn(() => {
    const wp = positionWorld, d = wp.sub(cameraPosition), t = length(d), rd = d.div(max(t, 1e-3));
    const haze = float(1).sub(exp(t.mul(U.haze).negate()));
    const k = rd.y.mul(U.mist.y);
    const span = select(abs(k).lessThan(1e-4), t, float(1).sub(exp(t.mul(k).negate())).div(k));
    const fy = U.mist.x.mul(exp(U.mist.y.mul(cameraPosition.y.sub(U.mist.z)).negate())).mul(span);
    const n = texture(AIR.gsNoise.value, wp.xz.mul(.006).add(U.drift.mul(1.7))).a;
    const mist = float(1).sub(exp(max(fy, 0).mul(mix(float(1), n.mul(1.3).add(.35), U.patchy)).negate()));
    const s = max(dot(rd, U.sun), 0);
    const f = float(1).sub(float(1).sub(haze).mul(float(1).sub(mist)));
    return vec4(mix(output.rgb, mix(U.c, U.cs, pow(s, 6).mul(.9)), f), output.a);
  })();
  return { sync, node };
}

/* ---------- GPU particles (hd3d.js Particles) ---------- */
// WebGL draws them as points with a shader of their own; here they are instanced sprites reading the
// same arrays (position, size, tint), with the same round soft or glowing dot. size is the dot's
// width in metres, as on WebGL.
export function gpuParticles(parts) {
  const g = parts.pts.geometry, A = n => { const a = g.attributes[n]; return new InstancedBufferAttribute(a.array, a.itemSize); };
  const pos = A('position'), size = A('size'), tint = A('tint');
  const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: parts.mat.blending === AdditiveBlending ? AdditiveBlending : NormalBlending });
  m.positionNode = instancedBufferAttribute(pos); m.scaleNode = instancedBufferAttribute(size);
  const tn = instancedBufferAttribute(tint), d = uv().sub(.5), r = dot(d, d).mul(4);
  const soft = parts.mat.uniforms.soft.value > .5;
  const a = soft ? float(1).sub(r).mul(float(1).sub(r)) : smoothstep(1, .3, r);
  m.colorNode = tn.rgb; m.opacityNode = tn.a.mul(a).mul(select(r.greaterThan(1), float(0), float(1)));
  const sp = new Sprite(m); sp.frustumCulled = false; sp.renderOrder = parts.pts.renderOrder; sp.count = 0;
  sp.userData.noAO = true;
  return { sprite: sp, sync(n) { for (const at of [pos, size, tint]) at.needsUpdate = true; sp.count = n; } };
}

/* ---------- contact shadows (hd3d.js ContactShadows) ---------- */
// The same steps on this renderer: shadow casters drawn from below into a small picture (darker the
// closer to the floor), blurred across and down twice, shown on the floor plane.
const BLUR_W = [.051, .0918, .12245, .1531, .1633, .1531, .12245, .0918, .051];
export function gpuContact(cs) {
  const dark = uniform(cs.depth.userData.dark.value);
  const over = new MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
  over.colorNode = vec3(0); over.opacityNode = float(1).sub(depth).mul(dark);
  let res = 0, a = null, b = null;
  const src = texture(new Texture()), step = uniform(new Vector2()), mat = new NodeMaterial(), quad = new QuadMesh(mat);
  mat.fragmentNode = Fn(() => {
    let sum = vec4(0);
    for (let i = -4; i <= 4; i++) sum = sum.add(src.sample(uv().add(step.mul(i))).mul(BLUR_W[i + 4]));
    return sum;
  })();
  const blur = (r, x, y) => { src.value = a.texture; step.value.set(x, 0); r.setRenderTarget(b); quad.render(r); src.value = b.texture; step.value.set(0, y); r.setRenderTarget(a); quad.render(r); };
  return {
    update(r, scene, want) {
      if (cs.enabled === false) want = 0;
      if (want !== res) { a?.dispose(); b?.dispose(); res = want; a = b = null; if (res) { a = new RenderTarget(res, res); b = new RenderTarget(res, res); } }
      cs.plane.visible = !!res; if (!res) return;
      if (cs.mat.map !== a.texture) { cs.mat.map = a.texture; cs.mat.needsUpdate = true; }
      dark.value = cs.depth.userData.dark.value;
      const hidden = [];
      scene.traverseVisible(o => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && (!o.castShadow || o.userData.noContact)) hidden.push(o); });
      for (const o of hidden) o.visible = false;
      const bg = scene.background, fog = scene.fog, fogN = scene.fogNode, env = scene.environment, prevT = r.getRenderTarget(), clr = r.getClearAlpha();
      scene.background = null; scene.fog = null; scene.fogNode = null; scene.overrideMaterial = over;
      r.setClearAlpha(0); r.setRenderTarget(a); r.clear(); r.render(scene, cs.cam);
      scene.overrideMaterial = null; scene.background = bg; scene.fog = fog; scene.fogNode = fogN; scene.environment = env;
      for (const o of hidden) o.visible = true;
      const k = cs.blurAmount / 256; blur(r, k, k); blur(r, k * .4, k * .4);
      r.setRenderTarget(prevT); r.setClearAlpha(clr);
    },
    dispose() { a?.dispose(); b?.dispose(); over.dispose(); mat.dispose(); },
  };
}

/* ---------- bloom (hd3d.js BRIGHT, DOWN, UP: the same small chain) ---------- */
// The bright parts at the tier's bloom size (half the picture), shrunk four more times, then grown back
// up, each step adding a softer copy. Three's own bloom node spreads much wider and lifts dark rooms,
// so this is the WebGL chain step for step. size(w, h, scale) each frame; out is the sum at the top level.
function bloomChain(src, aoF) {
  const N = 5, px = [], M = [];
  const lvl = (fn, i) => { const p = uniform(new Vector2(1, 1)); px[i] = p; return fn(p); };
  // bright parts only (anything brighter than the threshold keeps its full colour, fading in just under it), 4 taps
  M[0] = rtt(lvl(p => {
    const pick = o => { const c = src.sample(uv().add(o.mul(p))).rgb.mul(aoF); return c.mul(smoothstep(.77, .87, dot(c, LUM))); };
    return vec4(pick(vec2(-1, -1)).add(pick(vec2(1, -1))).add(pick(vec2(-1, 1))).add(pick(vec2(1, 1))).mul(.25), 1);
  }, 0), 1, 1, { depthBuffer: false });
  for (let i = 1; i < N; i++) {
    const t = M[i - 1];
    M[i] = rtt(lvl(p => {
      const c = t.sample(uv()).rgb.mul(4).add(t.sample(uv().add(vec2(p.x.negate(), p.y.negate()))).rgb).add(t.sample(uv().add(vec2(p.x, p.y.negate()))).rgb)
        .add(t.sample(uv().add(vec2(p.x.negate(), p.y))).rgb).add(t.sample(uv().add(p)).rgb);
      return vec4(c.div(8), 1);
    }, i), 1, 1, { depthBuffer: false });
  }
  const upPx = [], up = (t, i) => {
    const p = uniform(new Vector2(1, 1)); upPx[i] = p; const at = o => t.sample(uv().add(o)).rgb;
    const c = at(vec2(p.x.mul(-2), 0)).add(at(vec2(p.x.mul(2), 0))).add(at(vec2(0, p.y.mul(-2)))).add(at(vec2(0, p.y.mul(2))))
      .add(at(vec2(p.x.negate(), p.y.negate())).add(at(vec2(p.x, p.y.negate()))).add(at(vec2(p.x.negate(), p.y))).add(at(p)).mul(2));
    return c.div(12);
  };
  // grow back up: U[i] = M[i] + up(U[i + 1]); the top one is added straight into the final picture
  // (rtt with a size of its own: sized in size() below, not with the screen)
  const Us = []; let U = M[N - 1];
  for (let i = N - 2; i >= 1; i--) U = Us[i] = rtt(vec4(M[i].sample(uv()).rgb.add(up(U, i)), 1), 1, 1, { depthBuffer: false });
  const out = M[0].sample(uv()).rgb.add(up(U, 0));
  const nodes = [...M];
  return {
    out,
    size(w, h, scale) {
      // the same sizes as FinalPass.setSize: the tier's scale, then halving
      let bw = Math.max(1, Math.round(w * scale)), bh = Math.max(1, Math.round(h * scale));
      const sz = [];
      for (let i = 0; i < N; i++) { sz.push([bw, bh]); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
      if (this.key === `${w}x${h}x${scale}`) return; this.key = `${w}x${h}x${scale}`;
      px[0].value.set(.5 / w, .5 / h);
      for (let i = 0; i < N; i++) { nodes[i].setSize(sz[i][0], sz[i][1]); if (i) px[i].value.set(1 / sz[i - 1][0], 1 / sz[i - 1][1]); }
      for (let i = 0; i < N - 1; i++) upPx[i].value.set(.5 / sz[i + 1][0], .5 / sz[i + 1][1]);
      for (let i = 1; i < N - 1; i++) Us[i].setSize(sz[i][0], sz[i][1]);
    },
    dispose() { for (const n of [...nodes, ...Us]) n?.renderTarget?.dispose(); },
  };
}

/* ---------- the screen effects ---------- */
// One chain per view (it draws that view's scene and camera). rebuild() when the shape changes (AO on
// or off, smoothing, see-through for AR); the numbers are uniforms set each frame.
// Snapdragon GSR 2 on WebGPU: the same two passes as sgsr2.js (Qualcomm, BSD 3-Clause; the licence and
// what changed are in that file), written as TSL. The finished small picture (fin) and the motion
// picture are drawn at the render size; the upscale is drawn at the screen's size into a history
// picture, which is copied to the screen and kept for next frame. Pictures here count rows from the
// top, so this is the shader's REQUEST_NDC_Y_UP variant, and WebGPU depth is already 0..1 like NDC z.
function sgsr2Gpu(fin, depthT) {
  const U = { rs: uniform(new Vector2(1, 1)), os: uniform(new Vector2(1, 1)), jit: uniform(new Vector2()), sr: uniform(new Vector2(1, 1)),
    fov: uniform(1), minLerp: uniform(0), reset: uniform(1), c2p: uniform(new Matrix4()) };
  const low = rtt(fin, 1, 1, { depthBuffer: false });
  // convert: motion back to last frame from the nearest depth and the camera's move, and the depth clip
  const conv = Fn(() => {
    const P = ivec2(screenCoordinate.xy), hi = ivec2(U.rs).sub(1);
    const D = (x, y) => depthT.load(clamp(P.add(ivec2(x, y)), ivec2(0, 0), hi)).x;
    // textureGather's order round the 2 x 2 texels from o: (0,1) (1,1) (1,0) (0,0)
    const G = (ox, oy) => ({ x: D(ox, oy + 1), y: D(ox + 1, oy + 1), z: D(ox + 1, oy), w: D(ox, oy) });
    const bl = G(-1, -1), br = G(1, -1), tl = G(-1, 1), tr = G(1, 1);
    const min4 = g => min(min(g.y, g.x), min(g.z, g.w));
    const maxC = min(min(min(bl.z, br.w), tl.y), tr.x).toVar();
    const bl9 = min(tl.x, min(min(maxC, min4(bl)), br.x));
    const sep = float(1.37e-05).mul(U.fov).mul(length(U.rs)).mul(float(1).sub(maxC));
    const w = g => clamp(sep.div(abs(maxC.sub(min4(g))).add(1.19e-07)), 0, 1);
    const clip = select(maxC.lessThan(1 - 1e-5), clamp(float(1).sub(w(bl).add(w(br)).add(w(tl)).add(w(tr)).mul(.25)), 0, 1), float(0));
    const u = vec2(P).add(.5).div(U.rs), ndc = vec2(u.x.mul(2).sub(1), float(1).sub(u.y.mul(2)));
    const pre = U.c2p.mul(vec4(ndc, bl9, 1));
    return vec4(ndc.sub(pre.xy.div(pre.w)), clip, 0);
  })();
  const mdc = rtt(conv, 1, 1, { depthBuffer: false });
  const hist = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }), next = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const histT = texture(hist.texture);
  // upscale: Lanczos of the 5 nearest small pixels, a colour box, history clamped to it, then blended
  const upscale = Fn(() => {
    const H = screenUV, J = clamp(H.add(U.jit.div(U.rs)), 0, 1), IP = ivec2(J.mul(U.rs)), hi = ivec2(U.rs).sub(1);
    const mda = mdc.sample(J).xyz, M = mda.xy, df = mda.z;
    const prevUV = clamp(vec2(M.x.mul(-.5).add(H.x), M.y.mul(.5).add(H.y)), 0, 1);
    const histC = histT.sample(prevUV).rgb;
    const biasmax = U.sr.x, biasmin = max(float(1), biasmax.mul(.3).add(.3));
    const kb = mix(biasmax, biasmin, df.mul(.25)).mul(.5), kb2 = kb.mul(kb);
    const mlen = length(M.mul(U.os));
    const curve = mix(float(-2), float(-3), clamp(mlen.mul(.02), 0, 1));
    const so = vec2(IP).add(.5).sub(U.jit).sub(H.mul(U.rs));
    const lz = b => { const y = b.sub(1); return y.mul(.75).add(y.mul(y)).mul(y.mul(y)); };
    const taps = [[0, 1], [1, 0], [-1, 0], [0, 0], [0, -1]].map(([x, y]) => {
      const c = low.load(clamp(IP.add(ivec2(x, y)), ivec2(0, 0), hi)).rgb, o = so.add(vec2(x, y)), dd = dot(o, o);
      return { c, w: lz(clamp(dd.mul(kb2), 0, 1)), bw: exp(dd.mul(curve)) };
    });
    let sw = taps[0].w, scw = taps[0].c.mul(taps[0].w), bmin = taps[0].c, bmax = taps[0].c, sb = taps[0].bw, cen = taps[0].c.mul(taps[0].bw), vr = taps[0].c.mul(taps[0].c).mul(taps[0].bw);
    for (const t of taps.slice(1)) {
      sw = sw.add(t.w); scw = scw.add(t.c.mul(t.w)); bmin = min(bmin, t.c); bmax = max(bmax, t.c);
      sb = sb.add(t.bw); cen = cen.add(t.c.mul(t.bw)); vr = vr.add(t.c.mul(t.c).mul(t.bw));
    }
    cen = cen.div(sb); vr = abs(vr.div(sb).sub(cen.mul(cen))).sqrt();
    const upc = clamp(scw.div(sw), bmin.sub(.075), bmax.add(.075)), upw = sw.mul(1 / 3);
    let base = float(1).sub(df);
    base = min(base, mix(base, upw.mul(10), clamp(mlen.mul(10), 0, 1)));
    base = min(base, mix(base, upw, clamp(mlen.mul(.05), 0, 1)));
    const boxsize = mix(U.sr.y, float(1), max(df, clamp(mlen.mul(.05), 0, 1)));
    const lo = max(bmin, cen.sub(vr.mul(boxsize))), hiC = min(bmax, cen.add(vr.mul(boxsize)));
    const clamped = clamp(histC, lo, hiC);
    const start = select(abs(M.x).add(abs(M.y)).greaterThan(1e-6), float(0), U.minLerp);
    const outside = lo.x.greaterThan(histC.x).or(lo.y.greaterThan(histC.y)).or(lo.z.greaterThan(histC.z))
      .or(histC.x.greaterThan(hiC.x)).or(histC.y.greaterThan(hiC.y)).or(histC.z.greaterThan(hiC.z));
    const lerpC = clamp(select(outside, start, float(1)), 0, 1);
    const h = mix(clamped, histC, lerpC);
    const ba = mix(min(base, .1), base, lerpC);
    const a = clamp(upw.div(max(1.192e-07, ba.add(upw))).add(U.reset), 0, 1);
    return vec4(mix(h, upc, a), 1);
  })();
  const upMat = new NodeMaterial(); upMat.fragmentNode = upscale; upMat.name = 'SGSR2';
  const cpMat = new NodeMaterial(); cpMat.fragmentNode = vec4(histT.sample(screenUV).rgb, 1); cpMat.name = 'SGSR2 out';
  const qUp = new QuadMesh(upMat), qCp = new QuadMesh(cpMat);
  return {
    U, key: '',
    size(pw, ph, fw, fh) {
      const k = `${pw}x${ph}>${fw}x${fh}`; if (k === this.key) return; this.key = k;
      low.setSize(pw, ph); mdc.setSize(pw, ph); hist.setSize(fw, fh); next.setSize(fw, fh);
    },
    set(f) {
      U.rs.value.copy(f.renderSize); U.os.value.copy(f.outputSize); U.jit.value.copy(f.jitter); U.sr.value.copy(f.scaleRatio);
      U.fov.value = f.fovH; U.minLerp.value = f.minLerp; U.reset.value = f.reset; U.c2p.value.copy(f.clipToPrevClip);
    },
    // draw (the scene and the small finished picture are drawn on the way, by the nodes the upscale reads)
    render(r) {
      const tm = r.toneMapping, cs = r.outputColorSpace; r.toneMapping = NoToneMapping; r.outputColorSpace = LinearSRGBColorSpace;
      try {
        r.setRenderTarget(next); qUp.render(r);
        r.copyTextureToTexture(next.texture, hist.texture);
        r.setRenderTarget(null); qCp.render(r);
      } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
    },
    dispose() { low.dispose(); mdc.dispose(); hist.dispose(); next.dispose(); upMat.dispose(); cpMat.dispose(); },
  };
}

export class GpuChain {
  constructor(r, scene, cam, clear) {
    Object.assign(this, { r, scene, cam, clear, key: '' });
    this.pp = new RenderPipeline(r); this.pp.outputColorTransform = false;
    this.U = {
      t: uniform(0), hurt: uniform(0), vig: uniform(.32), gradeOn: uniform(0), sat: uniform(1), con: uniform(1),
      lo: uniform(new Vector3(1, 1, 1)), hi: uniform(new Vector3(1, 1, 1)), glare: uniform(0), sunUV: uniform(new Vector2(.5, .5)),
      sunCol: uniform(new Color()), aspect: uniform(1),
    };
    this.bloomN = null; this.aoN = null;
  }
  build(aoOn, smooth, msaa, s2 = false) {
    const key = `${aoOn}|${smooth}|${msaa}|${this.clear}|${s2}`;
    if (key === this.key) return;
    this.key = key;
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.bloomN?.dispose(); this.s2?.dispose(); this.aoN = this.dnN = this.bloomN = this.s2 = null;
    const sp = this.sp = pass(this.scene, this.cam, { samples: msaa || 0 });
    if (this.clear) {
      // AR: just the scene on a see-through background, tone mapped (bloom and the grade would tint the room behind it)
      this.pp.outputNode = renderOutput(sp); this.pp.needsUpdate = true; return;
    }
    if (aoOn) sp.setMRT(mrt({ output, normal: normalView }));
    const U = this.U, colT = sp.getTextureNode('output');
    let lit = colT.rgb, aoF = float(1);
    if (aoOn) {
      this.aoN = ao(sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.cam);
      Object.assign(this.aoN, { resolutionScale: 1 });
      this.aoN.radius.value = .6; this.aoN.distanceExponent.value = 1.4; this.aoN.thickness.value = 1.2; this.aoN.scale.value = 1.1; this.aoN.samples.value = 12;
      // (WebGL's GTAOPass smooths its own noise; here three's denoise does it)
      this.dnN = denoise(this.aoN.getTextureNode(), sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.cam);
      aoF = mix(float(1), this.dnN.r, .9); lit = lit.mul(aoF);
    }
    this.bloomN = bloomChain(colT, aoF); this.bloomK = uniform(.56);
    const uv = screenUV, d = uv.sub(.5), r2 = dot(d, d);
    const graded = Fn(() => {
      // smooth: with FXAA on (below) no fringe; otherwise a touch of lens fringing at the edges
      let col = smooth ? lit : vec3(colT.sample(uv.add(d.mul(r2).mul(.012))).r.mul(aoF), lit.g, colT.sample(uv.sub(d.mul(r2).mul(.012))).b.mul(aoF));
      // bloom
      col = col.add(this.bloomN.out.mul(this.bloomK));
      // grade (v.grade): saturation, contrast round mid grey, shadow and highlight tints
      const l = dot(col, LUM);
      let g = max(mix(vec3(l), col, U.sat), vec3(0));
      g = pow(g.div(.18).add(1e-5), vec3(U.con)).mul(.18);
      g = g.mul(mix(U.lo, U.hi, smoothstep(.15, .85, clamp(log2(l.div(.18).add(1e-4)).mul(.16).add(.5), 0, 1))));
      col = mix(col, g, U.gradeOn);
      // sun glare (v.glare), only while the sun itself shows
      const su = U.sunUV, tap = o => colT.sample(su.add(o)).rgb;
      const s0 = tap(vec2(0, 0)).add(tap(vec2(.006, 0))).add(tap(vec2(-.006, 0))).add(tap(vec2(0, .008))).add(tap(vec2(0, -.008)));
      const seen = smoothstep(1.5, 6, dot(s0, LUM).mul(.2));
      const asp = vec2(U.aspect, 1), q = uv.sub(su).mul(asp);
      const g1 = uv.sub(float(.5).sub(su.sub(.5).mul(.55))).mul(asp), g2 = uv.sub(float(.5).sub(su.sub(.5).mul(1.3))).mul(asp);
      const gl = exp(dot(q, q).mul(-14)).mul(.5).add(exp(length(q).mul(-6)).mul(.22))
        .add(smoothstep(.06, .045, length(g1)).mul(.05)).add(smoothstep(.1, .08, length(g2)).mul(.035));
      return col.add(U.sunCol.mul(gl).mul(U.glare).mul(seen));
    })();
    // tone mapping (ACES, the renderer's exposure) and sRGB (named outright under SGSR 2: drawn outside the pipeline)
    let out = s2 ? renderOutput(vec4(graded, 1), ACESFilmicToneMapping, SRGBColorSpace) : renderOutput(vec4(graded, 1));
    if (smooth) out = fxaa(out);
    const fin = Fn(() => {
      let col = out.rgb;
      col = col.mul(float(1).sub(U.vig.mul(smoothstep(.12, .62, r2.mul(1.6)))));                       // vignette
      const p = vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y)).add(U.t);   // (WebGL counts pixel rows from the bottom)
      col = col.add(fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)).sub(.5).mul(.035));     // grain
      col = mix(col, col.mul(vec3(1.25, .45, .4)).add(vec3(.12, 0, 0)), U.hurt.mul(smoothstep(.04, .4, r2)));   // hurt
      return vec4(col, 1);
    })();
    if (s2) { this.s2 = sgsr2Gpu(fin, sp.getTextureNode('depth')); return; }
    this.pp.outputNode = fin; this.pp.needsUpdate = true;
  }
  /** Sets the numbers from the view and tier, then draws. o: { ao (AO resolution, 0 = off), msaa, bloomScale, smooth, bloom, t, hurt, grade, glare, sunUV, sunCol, aspect } */
  render(o) {
    // o.s2: SGSR 2's frame numbers (sgsr2.js SgsrFrame): the scene and effects at o.w x o.h, upscaled to o.fw x o.fh
    const f = !this.clear && o.s2 ? o.s2 : null;
    this.build(!this.clear && o.ao > 0, !!o.smooth && !f, o.msaa, !!f);
    // the passes size themselves from the canvas: under SGSR 2 the canvas is the screen's size, so scale them down
    const k = f ? (o.w + .5) / o.fw : 1;
    if (this.sp.getResolutionScale() !== k) this.sp.setResolutionScale(k);
    if (!this.clear) {
      const U = this.U;
      if (this.aoN && this.aoN.resolutionScale !== o.ao * k) this.aoN.resolutionScale = o.ao * k;
      this.bloomK.value = Math.max(0, o.bloom) * .8; this.bloomN.size(o.w, o.h, o.bloomScale || .5);
      U.t.value = o.t; U.hurt.value = o.hurt;
      const g = o.grade; U.gradeOn.value = g ? 1 : 0;
      if (g) { U.sat.value = g.sat; U.con.value = g.con; U.lo.value.copy(g.lo); U.hi.value.copy(g.hi); }
      U.glare.value = o.glare; U.sunUV.value.set(o.sunUV.x, 1 - o.sunUV.y); U.sunCol.value.copy(o.sunCol); U.aspect.value = o.aspect;
    }
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(this.r); }
    else this.pp.render();
  }
  dispose() { this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.bloomN?.dispose?.(); this.s2?.dispose(); this.pp.dispose?.(); }
}
