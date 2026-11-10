// The Next Gen look on WebGPU: three.js's WebGPURenderer with the screen effects written as TSL nodes.
// It loads on any device that has WebGPU (there is no setting: WebGPU where supported, else WebGL);
// gpu.js imports it. hd3d.js asks gpuFits(view) each frame and draws a view here only when
// everything in it has a WebGPU version, so a game with a part that doesn't yet (docs/webgpu-move.md)
// keeps drawing on WebGL as before.
//
// The pieces match hd3d.js's FINAL_EFFECTS one for one (bloom, grade, glare, tone, vignette, grain,
// hurt, smoothing), plus three's own GTAO for ambient occlusion and the outdoor air as a fog node.
// scripts/look-compare.cjs --webgpu draws the same scenes both ways and compares them.
// Kit use only.
import { RenderPipeline, PMREMGenerator, Vector2, Vector3, Vector4, Color, BackSide, Sprite, Group, InstancedMesh, BufferGeometry, Frustum, Sphere, InstancedBufferAttribute as IBA, SpriteNodeMaterial, InstancedBufferAttribute, AdditiveBlending, NormalBlending,
  MeshBasicNodeMaterial, NodeMaterial, QuadMesh, MRTNode, OutputStructNode, PMREMNode, CubeRenderTarget, CubeCamera, RenderTarget, Texture, Matrix4, HalfFloatType, DepthTexture, LessEqualCompare, NoToneMapping, ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, SRGBColorSpace, LinearSRGBColorSpace, Matrix3 } from 'three/webgpu';
import {
  pass, mrt, output, velocity, normalView, uniform, texture, screenUV, screenCoordinate, screenSize, renderOutput, Fn,
  vec2, vec3, vec4, float, mix, smoothstep, dot, exp, length, max, pow, clamp, log2, fract, sin, abs, select,
  positionWorld, cameraPosition, instancedBufferAttribute, uv, rtt, depth, ivec2, min, materialEmissive, distance,
  attribute, vertexColor, normalWorld, normalViewGeometry, positionLocal, positionGeometry, positionPrevious, modelWorldMatrix, modelWorldMatrixInverse,
  materialColor, materialOpacity, materialRoughness, cos, floor, step, fwidth, dFdx, dFdy, normalize, uniformArray, Loop, int, If, sqrt,
  modelViewProjection, acos, getParallaxCorrectNormal, getViewPosition, interleavedGradientNoise, Break, cameraViewMatrix, shadow as shadowOf,
} from 'three/tsl';
import { LightProbeGrid } from 'three/examples/jsm/lighting/LightProbeGrid.js';
// v.tone (hd3d.js): three.js's own tone mappers
const TONE = { aces: ACESFilmicToneMapping, neutral: NeutralToneMapping, agx: AgXToneMapping };
// TRAA's sharpening (RCAS: 0 = most, 2 = none)
const TRAA_SHARP = .25;
export { LightProbeGrid };
export { gpuFlood } from './flood-gpu.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { ClusteredLighting } from 'three/examples/jsm/lighting/ClusteredLighting.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FrameGen, StillCheck, frameGenMRT, fgPrevVP, newPose, copyPose, homography, warpUV, refreshesSince } from './framegen.js';

const LUM = vec3(.2126, .7152, .0722);

/** The studio reflections for this renderer (WebGL's can't be shared: it lives on the other GPU API). */
// (three's WebGPU PMREMGenerator never updates its cube camera's projection after the first bake, so
// the first bake's near and far stay for all of them: every bake here uses the same, ENV_FAR)
const ENV_FAR = 5000;
export function studioEnv(r) {
  const pm = new PMREMGenerator(r), t = pm.fromScene(new RoomEnvironment(), .04, .1, ENV_FAR).texture; pm.dispose();
  return t;
}

/** Sky reflections and light from a scene (hd3d.js envFrom, gs.sky's { env: true }), on this renderer. */
const pmGens = new WeakMap();
export function envFrom(r, scene, { size = 256, blur = .03 } = {}) {
  let pm = pmGens.get(r); if (!pm) pmGens.set(r, pm = new PMREMGenerator(r));
  return pm.fromScene(scene, blur, .1, ENV_FAR, { size });
}

/* ---------- kit materials with a shader of their own, as node materials ---------- */
// hd3d.js swaps a mesh's material for its twin here while the view draws on WebGPU (material.userData.gsGpu
// names it). The twin reads the WebGL material's own uniform objects, so changes show on both.
export const gpuMaterials = {
  // gs.sky's dome (sky.js): the sky gradient and sun glow, or Preetham scattering (pSun.z > 0), the sun's
  // disc, and drifting clouds lit from the sun's side
  skyDome(gm) {
    const u = gm.uniforms, L = k => live(u[k]), clouds = 'CLOUDS' in (gm.defines || {});
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    m.name = 'sky';
    m.colorNode = Fn(() => {
      const d = normalize(positionLocal), sd = normalize(L('sunDir')), h = clamp(d.y, -1, 1), s = max(dot(d, sd), 0);
      const pS = L('pSun'), pBR = L('pBR'), pBM = L('pBM'), sunCol = L('sunCol'), cloud = L('cloud'), c = vec3(0).toVar();
      If(pS.z.greaterThan(0), () => {
        // light scattered by the air towards the eye (Preetham)
        const zen = acos(max(d.y, 0)), inv = float(1).div(cos(zen).add(pow(float(93.885).sub(zen.mul(57.29578)), -1.253).mul(.15)));
        const fex = exp(pBR.mul(8400).mul(inv).add(pBM.mul(1250).mul(inv)).negate());
        const ct = dot(d, sd), g2 = pS.y.mul(pS.y);
        const r = pBR.mul(pow(ct.mul(.5).add(.5), 2).add(1).mul(.0596831)).add(pBM.mul(float(1).sub(g2).mul(.0795775).div(pow(float(1).sub(pS.y.mul(2).mul(ct)).add(g2), 1.5)))).div(pBR.add(pBM));
        const lin = pow(r.mul(pS.x).mul(fex.oneMinus()), vec3(1.5)).mul(mix(vec3(1), sqrt(r.mul(pS.x).mul(fex)), pS.w));
        const c1 = lin.add(fex.mul(.1)).mul(.04).add(vec3(0, .0003, .00075)).mul(pS.z);
        c.assign(mix(c1, c1.mul(.55), clamp(h.negate().mul(3), 0, 1)));
        // soft knee (as sky.js): the glow round a low sun is bright, but no brighter than a painted sky's
        const l = max(c.r, max(c.g, c.b)), e = max(l.sub(1), 0);
        c.mulAssign(select(l.greaterThan(1), float(1).add(e.div(float(1).add(e.div(1.5)))).div(max(l, 1e-4)), float(1)));
      }).Else(() => {
        const c1 = mix(L('horizon'), L('top'), pow(max(h, 0), .55));
        c.assign(mix(c1, L('horizon').mul(.55), clamp(h.negate().mul(3), 0, 1)).add(sunCol.mul(pow(s, 24).mul(.35).add(pow(s, 90).mul(.4)))));
      });
      let sun = smoothstep(L('size'), L('size').add(.0004), s);
      if (clouds) {
        // (worked out everywhere and faded out below the horizon: textures can't be read inside a branch)
        const q = d.xz.div(max(h.add(.16), .13)).mul(.2).add(vec2(1, .4).mul(cloud.z)), N = u.noise.value;
        const n = texture(N, q).r.mul(.62).add(texture(N, q.mul(3.1).add(.37)).g.mul(.38));
        const cv = cloud.x.mul(float(1).sub(cloud.y.mul(pow(max(dot(normalize(d.xz.add(1e-4)), normalize(sd.xz.add(1e-4))), 0), 3)).mul(float(1).sub(smoothstep(.02, .22, h)))));
        const cov = smoothstep(cv.oneMinus(), float(1.1).sub(cv.mul(.62)), n), dens = smoothstep(cv.oneMinus(), float(1.32).sub(cv.mul(.5)), n);
        const cc = mix(L('cloudLit'), L('cloudDark'), dens.mul(.9)).add(sunCol.mul(cov).mul(dens.oneMinus()).mul(pow(s, 5).mul(2.2).add(.18)));
        const a = cov.mul(smoothstep(-.03, .1, h)).mul(step(-.03, h));
        c.assign(mix(c, cc.add(vec3(.75, .8, 1).mul(cloud.w)), a.mul(.97))); sun = sun.mul(a.oneMinus());
      }
      return c.add(sunCol.mul(sun).mul(L('disc'))).add(vec3(.25, .27, .32).mul(cloud.w).mul(max(h, 0).mul(.6).add(.4)));
    })();
    return m;
  },
};

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
// Named looks (looks.js lookPatch) as nodes on the material, which three copies onto the node material
// it makes from it. 'air' is the scene's fog node instead (airNodes).
const live = o => uniform(o.value).onRenderUpdate(() => o.value);   // follows the { value } the game changes
// Frames drawn (GpuChain.draw counts them), and a { value } as it was at the frame before this one: for
// motion that a shader makes itself (three only knows a mesh's matrices and bones from the frame before)
const DRAWN = { n: 0 };
const lastFrame = o => {
  const obj = typeof o.value === 'object', prev = obj ? o.value.clone() : null, cur = obj ? o.value.clone() : null;
  let seen = -1, p = o.value, c = o.value;
  return uniform(obj ? prev : o.value).onRenderUpdate(() => {
    if (seen !== DRAWN.n) {
      if (obj) { if (seen < 0) cur.copy(o.value); prev.copy(cur); cur.copy(o.value); } else { p = seen < 0 ? o.value : c; c = o.value; }
      seen = DRAWN.n;
    }
    return obj ? prev : p;
  });
};
// A look that changes the colour after the material's own (map, then vertex colours, as WebGL's
// color_fragment leaves it): fn(rgb) => rgb. Node materials multiply vertex colours in after colorNode,
// so the result is divided by them here; looks stack (each starts from the one before).
function afterColor(m, o, fn) {
  const vc = m.vertexColors && o?.geometry?.attributes?.color ? vertexColor() : null;
  const base = m.colorNode ? vec4(m.colorNode) : materialColor, d = vc ? base.rgb.mul(vc.rgb) : base.rgb;
  const out = fn(d);
  m.colorNode = vec4(vc ? out.div(max(vc.rgb, 1e-4)) : out, base.a);
}
const hash2 = p => { const a = fract(vec3(p.x, p.y, p.x).mul(.1031)), b = a.add(dot(a, a.yzx.add(33.33))); return fract(b.x.add(b.y).mul(b.z)); };
// hd3d.js v.room(): the room's own cube picture, read box-projected. The reflection direction comes from
// three's own (roughness bend and all, through the context's getUV), then is moved to where it meets the
// room's walls, as the WebGL patch does.
class BoxPMREM extends PMREMNode {
  constructor(tex, at, size) { super(tex); this.gsAt = at; this.gsSize = size; }
  setup(builder) {
    const ctx = builder.getContext(), g = ctx.getUV;
    if (!g || ctx.gsBox) return super.setup(builder);
    builder.setContext({ ...ctx, gsBox: true, getUV: (n, b) => getParallaxCorrectNormal(g(n, b), this.gsSize, this.gsAt) });
    try { return super.setup(builder); } finally { builder.setContext(ctx); }
  }
}
/** The WebGPU picture of a room (v.room): its cube target, baked from the room's middle. */
export function bakeRoom(r, scene, s) {
  const g = s.gpu ||= { rt: new CubeRenderTarget(s.size, { type: HalfFloatType }) };
  const cc = g.cam ||= new CubeCamera(.05, s.far, g.rt);
  cc.position.copy(s.uniforms.gsRoomAt.value); scene.add(cc); cc.updateMatrixWorld(true);
  try { cc.update(r, scene); } finally { cc.removeFromParent(); }
  g.rt.texture.needsPMREMUpdate = true;
}
export const gpuLooks = {
  // hd3d.js v.room(): box-projected reflections
  room(m, s) {
    const g = s.gpu ||= { rt: new CubeRenderTarget(s.size, { type: HalfFloatType }) };
    m.envNode = new BoxPMREM(g.rt.texture, live(s.uniforms.gsRoomAt), live(s.uniforms.gsRoomSize));
  },
  // hd3d.js pulse(): a glowing ring at distance r from a point
  pulse(m, s) {
    const u = s.uniforms, d = distance(positionWorld, live(u.gsPulseAt)), r = live(u.gsPulseR), w = float(u.gsPulseW.value);
    const band = exp(d.sub(r).div(w).pow(2).negate()).add(float(u.gsPulseFill.value).mul(select(d.lessThanEqual(r), float(1), float(0))).mul(float(1).sub(d.div(max(r, .01)))));
    m.emissiveNode = materialEmissive.add(vec3(u.gsPulseCol.value).mul(band).mul(live(u.gsPulseA)));
  },
  // looks.js ground(): painted ground in world metres (meadow, fields with hedges, forest floor, rock,
  // trodden earth, river mud, lanes with ruts, puddles), from the land's gsMask and the detail textures
  ground(m, s, o) {
    const u = s.uniforms, L = k => live(u[k]), gA = L('lkGrassA'), gB = L('lkGrassB'), PL = L('lkPlough'), dirt = L('lkDirt');
    const roads = uniformArray(u.lkRoads.value, 'vec4'), rn = L('lkRoadN');
    const fields = (p, dt, dt2, grass) => {
      const A = L('lkFieldAngle'), FS = L('lkFieldSize');
      const f0 = vec2(cos(A).mul(p.x).sub(sin(A).mul(p.y)), sin(A).mul(p.x).add(cos(A).mul(p.y)));
      const fp = vec2(f0.x.add(hash2(vec2(floor(f0.y.div(FS.y)), 3.1)).mul(FS.x)), f0.y);
      const cell = floor(fp.div(FS)), f = fract(fp.div(FS));
      const ns = floor(hash2(cell).mul(3)).add(1), si = floor(f.y.mul(ns)), sf = fract(f.y.mul(ns)), kind = hash2(cell.mul(1.7).add(si.mul(13.3)).add(2));
      const edge = min(min(f.x, f.x.oneMinus()).mul(FS.x), min(sf, sf.oneMinus()).mul(FS.y).div(ns));
      const fz = fp.y.mul(L('lkFurrows')), fur = mix(float(.5), sin(fz).mul(.5).add(.5), clamp(float(1).sub(fwidth(fz).mul(.35)), 0, 1));
      const cA = mix(gA, gB, hash2(cell.add(9))).mul(dt.r.mul(.4).add(.8));
      const cB = L('lkCropA').mul(fur.mul(.26).add(.84).add(dt.r.sub(.5).mul(.25))).mul(hash2(cell.add(2)).mul(.16).add(.92));
      const cC = PL.mul(fur.mul(.55).add(.66)).mul(dt.g.mul(.24).add(.88));
      const cD = mix(PL, gB.mul(1.1), fur.mul(.85)).mul(dt.r.mul(.2).add(.9));
      const cE = L('lkCropB').mul(fur.mul(.2).add(.84).add(dt.g.sub(.5).mul(.2)));
      const c = select(kind.lessThan(.34), cA, select(kind.lessThan(.58), cB, select(kind.lessThan(.72), cC, select(kind.lessThan(.86), cD, cE))));
      const HG = L('lkHedge'), hw = HG.w.add(dt2.a.mul(.7)).mul(step(.22, hash2(cell.add(4.4)))), hedge = float(1).sub(smoothstep(hw.sub(.4), hw.add(.3), edge));
      return mix(mix(c, grass, float(1).sub(smoothstep(hw.add(.3), hw.add(1.7), edge)).mul(.85)), HG.rgb.mul(dt.r.mul(.8).add(.55)), hedge);
    };
    const G = Fn(() => {
      const wp = positionWorld, mask = attribute('gsMask', 'vec4'), sc = L('lkScale'), det = u.lkDetail.value;
      const dt = texture(det, wp.xz.mul(sc.x)), dt2 = texture(det, wp.xz.mul(sc.y).add(.37)), nz = texture(u.lkNoise.value, wp.xz.mul(sc.z));
      const grass = mix(mix(gA, gB, smoothstep(.25, .75, nz.r)), L('lkDry'), smoothstep(.55, .85, nz.g).mul(.65)).mul(dt.r.mul(dt2.a.mul(.6).add(.7)).mul(.5).add(.74));
      const farm = mask.x.mul(smoothstep(.3, .5, nz.b.add(.25)));
      let c = mix(grass, fields(wp.xz, dt, dt2, grass), farm.mul(L('lkFieldsOn')).mul(step(.01, farm))), rough = float(.95);
      c = mix(c, L('lkForest').mul(dt.a.mul(.55).add(.65)).mul(dt.g.mul(.3).add(.85)), mask.y);
      const rk = smoothstep(.35, .7, mask.z.add(dt2.b.sub(.5).mul(.5)));
      c = mix(c, L('lkRock').mul(dt.b.mul(.65).add(.6)), rk); rough = mix(rough, .8, rk);
      c = mix(c, mix(grass, dirt, .75).mul(dt.g.mul(.4).add(.8)), mask.w.mul(smoothstep(.25, .6, dt2.r.add(nz.a.mul(.4)))));
      const B = L('lkBank'), bank = float(1).sub(smoothstep(B.x, B.y, wp.y.add(dt2.r.sub(.5).mul(1.2))));
      c = mix(c, L('lkMud').mul(dt.g.mul(.6).add(.65)), bank); rough = mix(rough, .45, bank.mul(smoothstep(B.z, B.w, wp.y)));
      const rd0 = float(1e4).toVar();
      Loop({ start: int(0), end: int(rn), type: 'int', condition: '<' }, ({ i }) => {
        const sg = roads.element(i), pa = wp.xz.sub(sg.xy), ba = sg.zw.sub(sg.xy), h = clamp(dot(pa, ba).div(max(dot(ba, ba), 1e-6)), 0, 1);
        rd0.assign(min(rd0, length(pa.sub(ba.mul(h)))));
      });
      const R = L('lkRoad'), rd = rd0.add(dt2.g.sub(.5).mul(.9)), road = float(1).sub(smoothstep(R.x, R.y, rd));
      const ruts = float(1).sub(smoothstep(.06, .42, abs(rd.sub(R.z)))), crown = float(1).sub(smoothstep(.2, .55, rd));
      c = mix(c, mix(dirt.mul(dt.g.mul(.38).add(.8)).mul(float(1).sub(ruts.mul(.3))), grass.mul(.85), crown.mul(.6)), road); rough = mix(rough, .88, road);
      const pud = L('lkWet').mul(smoothstep(.62, .7, dt2.a.mul(.6).add(ruts.mul(road).mul(.5)).add(nz.g.mul(.3))));
      return vec4(c.mul(float(1).sub(pud.mul(.45))), mix(rough, .04, pud));
    })().toVar('lkGround');
    afterColor(m, o, () => G.rgb);
    m.roughnessNode = G.a;
  },
  // looks.js hills(): woods, clearings and scree from noise over the hills' own colours
  hills(m, s, o) {
    const u = s.uniforms, sc = live(u.lkHillScale), N = u.lkNoise.value, W = live(u.lkWoods);
    afterColor(m, o, d => {
      const wp = positionWorld, n = texture(N, wp.xz.mul(sc)), mm = texture(N, wp.xz.mul(sc.mul(5.8)).add(.31)), q = texture(N, wp.xz.mul(sc.mul(37)).add(.7));
      const bare = smoothstep(.62, .85, d.b.div(max(d.r, 1e-3))), wood = smoothstep(W.sub(.05), W.add(.05), n.g.mul(.75).add(mm.r.mul(.4))).mul(bare.oneMinus());
      const c = mix(d.mul(mm.b.mul(.4).add(.78)), live(u.lkWood).mul(q.r.mul(.9).add(.55)), wood);
      return c.mul(float(1).sub(bare.mul(.35).mul(smoothstep(.4, .7, q.g))));
    });
  },
  // looks.js rock(): grit and cracks mapped three ways, moss on top
  rock(m, s, o) {
    const u = s.uniforms, D = u.lkDetail.value, k = live(u.lkRockScale);
    afterColor(m, o, c0 => {
      const wp = positionWorld, wn = normalWorld, w0 = pow(abs(wn), vec3(4)), w = w0.div(w0.x.add(w0.y).add(w0.z));
      const d = texture(D, wp.zy.mul(k)).mul(w.x).add(texture(D, wp.xz.mul(k)).mul(w.y)).add(texture(D, wp.xy.mul(k)).mul(w.z));
      const e = texture(D, wp.xz.mul(k.mul(.13)).add(.2));
      const c = c0.mul(d.b.mul(.3).add(d.g.mul(.4)).add(d.a.mul(.3)).mul(.5).add(.66)).mul(e.a.mul(.3).add(.85));
      const moss = smoothstep(.55, .85, wn.y.add(e.r.sub(.5).mul(.6)));
      return mix(c, live(u.lkMoss).mul(d.r.mul(.6).add(.7)), moss.mul(live(u.lkMossy)));
    });
  },
  // looks.js flow(): moving water on a gs.outdoors River (two crossfaded layers sliding at each point's speed)
  flow(m, s, o) {
    const u = s.uniforms, T = live(u.lkFlowT), K = live(u.lkFlowK), F = attribute('lkFlow', 'vec4'), D = attribute('lkDir', 'vec3'), N = u.lkNoise.value;
    const slide = (sc, sx, sy) => {
      const p0 = fract(T.mul(.5)), p1 = fract(T.mul(.5).add(.5)), w = abs(p0.mul(2).sub(1));
      const a = texture(N, vec2(F.x.mul(sx), F.y.mul(sy).sub(F.z.mul(p0).mul(2))).mul(sc));
      const b = texture(N, vec2(F.x.mul(sx), F.y.mul(sy).sub(F.z.mul(p1).mul(2))).mul(sc).add(.37));
      return mix(a, b, w);
    };
    const n = slide(K.x, 1, .6).toVar('lkN'), st = slide(K.x.mul(1.7), 2.5, .25);
    const foam = clamp(smoothstep(.55, .85, st.g.mul(.55).add(F.w.mul(.8)).add(n.r.mul(.25))).mul(K.z), 0, 1).toVar('lkFoam');
    afterColor(m, o, () => mix(mix(live(u.lkDeep), live(u.lkShallow), clamp(D.z.mul(D.z).add(n.a.sub(.5).mul(.4)), 0, 1)).mul(n.r.mul(.3).add(.85)), live(u.lkFoamC), foam));
    m.roughnessNode = mix(float(.06), float(.75), foam);
    const g = vec2(n.b, n.g).sub(.5).mul(K.y).mul(foam.oneMinus()), dd = D.xy, pp = vec2(dd.y.negate(), dd.x), gw = dd.mul(g.y).add(pp.mul(g.x));
    m.normalNode = normalize(normalViewGeometry.add(cameraViewMatrix.mul(vec4(gw.x, 0, gw.y, 0)).xyz));
  },
  // looks.js lava(): glowing cracks between drifting plates of crust, cooling downstream
  lava(m, s, o) {
    const u = s.uniforms, T = live(u.lkFlowT), K = live(u.lkLavaK), F = attribute('lkFlow', 'vec4'), N = u.lkNoise.value, G = live(u.lkGlowC);
    const slide = sc => {
      const p0 = fract(T.mul(.1)), p1 = fract(T.mul(.1).add(.5)), w = abs(p0.mul(2).sub(1));
      return mix(texture(N, vec2(F.x, F.y.sub(F.z.mul(p0).mul(10))).mul(sc)), texture(N, vec2(F.x, F.y.sub(F.z.mul(p1).mul(10))).mul(sc).add(.53)), w);
    };
    const n = slide(K.x).toVar('lkN'), mm = slide(K.x.mul(3.1)).toVar('lkM');
    const heat = clamp(float(1).sub(K.z.mul(F.y).div(max(K.w, 1))), 0, 1).mul(sin(T.mul(1.3).add(n.g.mul(6))).mul(.1).add(.9)).toVar('lkHeat');
    const cr = abs(n.r.sub(.5)).mul(2).add(mm.b.sub(.5).mul(.25)), crack = float(1).sub(smoothstep(.02, heat.mul(.1).add(.05), cr));
    const hot = clamp(crack.add(heat.mul(.2).mul(smoothstep(.55, .9, mm.g))).add(F.w.mul(.5)), 0, 1).toVar('lkHot');
    afterColor(m, o, () => mix(live(u.lkCrust).mul(mm.r.mul(.6).add(.6)), G.mul(.05), hot));
    m.roughnessNode = mix(float(.9), float(.5), hot);
    m.emissiveNode = materialEmissive.add(G.mul(hot).mul(heat).mul(K.y));
  },
  // looks.js leaves(): sway (more towards the top, leaning downwind), light through towards the sun,
  // outlines that hold up far away, and both sides lit alike
  leaves(m, s, o) {
    const u = s.uniforms, t = live(u.lkTime), sw = live(u.lkSway), dir = live(u.lkWindDir);
    const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz, hh = max(positionGeometry.y.sub(sw.y), 0), ph = wp.x.mul(.19).add(wp.z.mul(.23));
    const k = live(u.lkWind).mul(hh).mul(sw.x), kWas = lastFrame(u.lkWind).mul(hh).mul(sw.x), dWas = lastFrame(u.lkWindDir);
    const sway = (t, k, dir) => {
      const swing = vec3(sin(t.mul(1.7).add(ph)).add(sin(t.mul(3.1).add(ph.mul(2.3))).mul(.3)), 0, cos(t.mul(1.3).add(ph.mul(1.4)))).mul(k);
      const lean = dir.mul(k).mul(sin(t.mul(.9).add(ph.mul(.5))).mul(.6).add(1.2));
      return modelWorldMatrixInverse.mul(vec4(swing.add(vec3(lean.x, 0, lean.y)), 0)).xyz;
    };
    // the leaves where they swayed to last frame as well, for the motion three works out (frame generation,
    // SGSR 2): without it every leaf seemed to move by its whole sway each frame, and broke up in made frames
    m.positionNode = Fn(builder => { if (builder.needsPreviousData()) positionPrevious.assign(positionPrevious.add(sway(lastFrame(u.lkTime), kWas, dWas))); return positionLocal.add(sway(t, k, dir)); })();
    const lq = uv().mul(live(u.lkAtlas)), dx = dFdx(lq), dy = dFdy(lq);
    m.opacityNode = (m.opacityNode ? float(m.opacityNode) : materialOpacity).mul(float(1).add(max(0, log2(max(dot(dx, dx), dot(dy, dy))).mul(.5)).mul(.35)));
    afterColor(m, o, c => c.mul(float(1).add(live(u.lkGlow).mul(pow(max(dot(normalize(positionWorld.sub(cameraPosition)), live(u.lkSun)), 0), 4)))));
    if (!m.normalMap) m.normalNode = normalViewGeometry;
  },
};
// hd3d.js AIR_WET: wet, darker, shinier surfaces in the rain (lit standard materials with the air)
export function gpuWet(m, o, AIR) {
  const w = live(AIR.gsWet).mul(live(AIR.gsAirOn)).mul(smoothstep(.15, .85, normalWorld.y).mul(.7).add(.3));
  m.roughnessNode = mix(m.roughnessNode ? float(m.roughnessNode) : materialRoughness, .12, w.mul(.8));
  afterColor(m, o, c => c.mul(float(1).sub(w.mul(.3))));
}
// The sun's light on WebGPU: cloud shadows drifting over everything (hd3d.js gsShadeAt) and the near
// shadow cascade's share (CASC_NEAR / CASC_W: the near light inside its box, fading at the edges, the far
// one elsewhere), as the light's colour node. role: a uniform per light, 0 plain, 1 near, 2 far.
const CASC = { m: uniform(new Matrix4()), fade: uniform(.06) };
export function setCascade(near, fade) { if (near) CASC.m.value = near.shadow.matrix; CASC.fade.value = fade; }
// Many lights (three.js's Forward+ clustered lighting): the view is cut into tiles and depth slices and
// each pixel only adds up the point and spot lights that reach it, so a scene can have dozens of lamps
// for about the cost of a few. Lights without shadows only; adding or removing one builds no shaders.
export function manyLights(r) { r.lighting = new ClusteredLighting(256, 32, 24, 32); r.gsClustered = true; }
// The still/moving shadow split on WebGPU (hd3d.js shadowLights): the light gets three's own shadow
// node, made here so the kit can draw its map when it wants to (splitDraw), and over what is already
// there when told to keep it (three clears a shadow map each time it draws one).
export function splitShadowNode(l) {
  const node = shadowOf(l, l.shadow), base = node.renderShadow;
  node.gsSplit = true;
  node.renderShadow = function (frame) { if (this.gsKeep) frame.renderer.autoClear = false; return base.call(this, frame); };
  return node;
}
/** Draws light l's shadow map from the things on the layers in mask (keep: over what's there). */
export function splitDraw(r, scene, cam, l, mask, keep) {
  const sh = l.shadow, node = sh.shadowNode, c = sh.camera, m0 = c.layers.mask;
  c.layers.mask = mask; node.gsKeep = keep;
  try { node.updateShadow({ renderer: r, scene, camera: cam }); } finally { c.layers.mask = m0; node.gsKeep = false; }
}
/** A target holding a copy of a shadow map's depth. */
export function splitTarget(r, w, h) { const t = new RenderTarget(w, h, { depthBuffer: true }); t.depthTexture = new DepthTexture(w, h); r.initRenderTarget(t); return t; }
export function gpuSunLight(l, AIR, noise) {
  const c = new Color(), col = uniform(c).onRenderUpdate(() => c.copy(l.color).multiplyScalar(l.intensity)), role = uniform(0);
  const wp = positionWorld, S = live(AIR.gsSun), CL = live(AIR.gsCloud), DR = live(AIR.gsDrift);
  const cuv = wp.xz.add(S.xz.div(max(S.y, .15)).mul(CL.z.sub(wp.y)));
  const n = texture(noise, cuv.div(max(CL.w, 1)).add(DR)).r;
  const shade = select(live(AIR.gsAirOn).greaterThan(.5).and(CL.y.greaterThan(0)), float(1).sub(CL.y.mul(smoothstep(float(1).sub(CL.x), float(1.12).sub(CL.x.mul(.6)), n))), float(1));
  const sc = CASC.m.mul(vec4(wp, 1)), p = sc.xyz.div(sc.w), e = min(p.xy, p.xy.oneMinus());
  const nearW = select(p.z.greaterThan(0).and(p.z.lessThan(1)), smoothstep(0, CASC.fade, min(e.x, e.y)), float(0));
  l.colorNode = col.mul(shade).mul(select(role.equal(1), nearW, select(role.equal(2), nearW.oneMinus(), float(1))));
  return role;
}

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

/** A material that takes no ambient occlusion (hd3d.js seeThrough3d: see-through, cut-out, noAO). */
// Its own MRT (output, and a zero normal so the AO pass skips it). three builds a material MRT against the
// target it is drawn into and keeps only the outputs the target has textures for, so in a target with none
// of them (a cube camera's, a card's copy) nothing was left: an empty WGSL output, an invalid pipeline and
// that frame's whole command buffer dropped. There the plain colour is written instead.
class SoftMRT extends MRTNode {
  setup(builder) {
    const tex = builder.renderer.getRenderTarget()?.textures || [];
    if (!Object.keys(this.outputNodes).some(n => tex.some(t => t.name === n))) {
      this.members = [output.convert(builder.getOutputType(0))];
      return OutputStructNode.prototype.setup.call(this, builder);
    }
    return super.setup(builder);
  }
}
export function noAO(m) { m.mrtNode = new SoftMRT({ output, normal: vec4(normalView, 0) }); }   // (output too: without an MRT in use, three draws the material's own MRT alone)

/* ---------- gs.props on WebGPU ---------- */
// Props draws each kind as an InstancedMesh2 (@three.ez/instanced-mesh), which reads its matrices from a
// texture through a WebGL shader patch. Here each of its detail levels is a plain InstancedMesh instead,
// filled each frame with the copies in view (a little wider, for their shadows) at that level's distance,
// from the same matrices, visibility and colours.
// Each copy keeps its place (slot) in a level's list while it stays in view: three works out motion
// (frame generation, SGSR 2) from what each slot held last frame, so a list packed afresh every frame gave
// a tree another tree's motion whenever one came into or left the view (trees and lamps broke up in made
// frames). A copy that leaves keeps its slot for a few frames (it is off screen or behind a wall, so
// drawing it costs a little and shows nothing), so one coming straight back still has its true motion;
// a new one takes a free slot while it is still in the margin round the view, so its first, wrong motion is off screen.
const PF = new Frustum(), PS = new Sphere(), PM = new Matrix4(), PV = new Vector3(), SF = [];
const PROP_LINGER = 20;   // frames a copy that left the view keeps its slot
export function gpuProps(im) {
  const levels = im.LODinfo ? im.LODinfo.render.levels.map(l => ({ obj: l.object, dist: l.distance * (1 - (l.hysteresis || 0)) })) : [{ obj: im, dist: 0 }];   // (the library keeps distances squared)
  const group = new Group(); group.name = im.name + ':webgpu';
  let cap = 0, tw = [], want = null;
  const make = () => {
    for (const t of tw) { t.removeFromParent(); t.dispose(); }
    cap = Math.max(16, im._capacity || im._instancesArrayCount || 16);
    want = new Int8Array(cap);
    tw = levels.map(({ obj }) => {
      const src = obj.geometry, g = new BufferGeometry();   // the same buffers, without the library's index attribute
      for (const k in src.attributes) if (k !== 'instanceIndex') g.setAttribute(k, src.attributes[k]);
      g.setIndex(src.index); g.groups = src.groups;
      if (!src.boundingSphere) src.computeBoundingSphere(); g.boundingSphere = src.boundingSphere;
      const m = new InstancedMesh(g, obj.material, cap); m.count = 0; m.frustumCulled = false;
      m.castShadow = im.castShadow; m.receiveShadow = im.receiveShadow;
      m.userData.gsTwin = im;   // (hd3d.js shadowLights: its shadow changes when the props do, not when this view's culling does)
      if (im.colorsTexture) m.instanceColor = new IBA(new Float32Array(cap * 3), 3);
      // slotOf: copy -> slot + 1 (0: none); owner: slot -> copy + 1; idle: frames since its copy left the view
      m.userData.slots = { slotOf: new Int32Array(cap), owner: new Int32Array(cap), idle: new Uint16Array(cap), top: 0 };
      group.add(m); return m;
    });
  };
  make();
  // a slot drawn as nothing: every point at the copy's own place
  const hide = (M, m0) => { const x = M[m0 + 12], y = M[m0 + 13], z = M[m0 + 14]; M.fill(0, m0, m0 + 16); M[m0 + 12] = x; M[m0 + 13] = y; M[m0 + 14] = z; M[m0 + 15] = 1; };
  return {
    group,
    sync(cam, occ = null, shadowCams = null) {   // occ: hd3d.js occlusion culling (only for props without shadows: one list feeds both here); shadowCams: the lights' shadow cameras (a copy off screen that casts into view is kept)
      if ((im._capacity || 0) > cap) make();
      const n = Math.min(cap, im._instancesArrayCount || 0), D = im.matricesTexture?._data, C = im.colorsTexture?._data, wm = im.matrixWorld;
      if (!D) { for (const t of tw) { t.count = 0; t.userData.slots.top = 0; t.userData.slots.slotOf.fill(0); t.userData.slots.owner.fill(0); } return; }
      cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); PF.setFromProjectionMatrix(PM, cam.coordinateSystem);
      const nsf = im.castShadow && shadowCams ? shadowCams.length : 0;
      for (let j = 0; j < nsf; j++) { const c = shadowCams[j]; (SF[j] ||= new Frustum()).setFromProjectionMatrix(PM.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse), c.coordinateSystem); }
      const cp = cam.getWorldPosition(PV), cx = cp.x, cy = cp.y, cz = cp.z, R0 = levels[0].obj.geometry.boundingSphere?.radius ?? 1;
      // which level each copy is drawn at this frame (-1: not drawn)
      want.fill(-1, 0, n);
      for (let i = 0; i < n; i++) {
        if (!im.getActiveAndVisibilityAt(i)) continue;
        const o = i * 16, sx = Math.sqrt(D[o] * D[o] + D[o + 1] * D[o + 1] + D[o + 2] * D[o + 2]), sy = Math.sqrt(D[o + 4] * D[o + 4] + D[o + 5] * D[o + 5] + D[o + 6] * D[o + 6]), sz = Math.sqrt(D[o + 8] * D[o + 8] + D[o + 9] * D[o + 9] + D[o + 10] * D[o + 10]);   // (Math.hypot made garbage for each copy)
        PS.center.set(D[o + 12], D[o + 13], D[o + 14]).applyMatrix4(wm); PS.radius = R0 * Math.max(sx, sy, sz) + 8;   // (+8 m: things just out of view still cast their shadows in)
        if (!PF.intersectsSphere(PS)) { let j = 0; while (j < nsf && !SF[j].intersectsSphere(PS)) j++; if (j === nsf) continue; }
        if (occ && !im.castShadow && occ.hidden(PS.center, PS.radius - 8)) continue;
        const d = (PS.center.x - cx) ** 2 + (PS.center.y - cy) ** 2 + (PS.center.z - cz) ** 2;   // squared, like the levels
        let L = 0; while (L + 1 < levels.length && d >= levels[L + 1].dist) L++;
        want[i] = L;
      }
      for (let L = 0; L < tw.length; L++) {
        const t = tw[L], S = t.userData.slots, M = t.instanceMatrix.array, A = t.instanceColor?.array;
        // (copied number by number: a subarray view per copy per frame was garbage for the collector)
        const put = (s, i) => { const m0 = s * 16, o = i * 16; for (let j = 0; j < 16; j++) M[m0 + j] = D[o + j]; if (C && A) { const a0 = s * 3, c0 = i * 4; A[a0] = C[c0]; A[a0 + 1] = C[c0 + 1]; A[a0 + 2] = C[c0 + 2]; } };
        // the copies already here: stay put; gone: linger a while (unless now drawn at another level), then free the slot
        for (let s = 0; s < S.top; s++) {
          const i = S.owner[s] - 1; if (i < 0) continue;
          if (i < n && want[i] === L) { put(s, i); S.idle[s] = 0; continue; }
          if (i < n && want[i] < 0 && im.getActiveAndVisibilityAt(i) && ++S.idle[s] <= PROP_LINGER) continue;
          hide(M, s * 16); S.owner[s] = 0; S.slotOf[i] = 0;
        }
        // the copies new to this level: the lowest free slots
        let free = 0;
        for (let i = 0; i < n; i++) {
          if (want[i] !== L || S.slotOf[i]) continue;
          while (free < S.top && S.owner[free]) free++;
          const s = free < S.top ? free : S.top++;
          S.owner[s] = i + 1; S.slotOf[i] = s + 1; S.idle[s] = 0; put(s, i);
        }
        while (S.top && !S.owner[S.top - 1]) S.top--;
        t.count = S.top;
        if (t.count) { t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true; }
        t.visible = t.count > 0;
      }
    },
    dispose() { for (const t of tw) t.dispose(); },
  };
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
// The last touches on the finished picture: vignette, film grain and the hurt flash. t moves the
// grain on; k is the size of a drawn pixel on the screen (the grain is one drawn pixel big, as before
// upscaling). With frame generation they go on as each refresh is shown, so the grain is new every
// refresh (blending two frames' grain would halve it on every other one) and the vignette and the
// hurt flash stay put instead of moving with the picture.
function touches(U, col, t, k) {
  const d = screenUV.sub(.5), r2 = dot(d, d);
  col = col.mul(float(1).sub(U.vig.mul(smoothstep(.12, .62, r2.mul(1.6)))));                       // vignette
  const p = floor(vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y)).mul(k)).add(.5).add(t);   // (WebGL counts pixel rows from the bottom)
  col = col.add(fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453)).sub(.5).mul(.035));     // grain
  return mix(col, col.mul(vec3(1.25, .45, .4)).add(vec3(.12, 0, 0)), U.hurt.mul(smoothstep(.04, .4, r2)));   // hurt
}
// Snapdragon GSR 1 on WebGPU: sgsr.js's one pass (Qualcomm, BSD 3-Clause; the licence and what changed
// are in that file), written as TSL. The finished small picture is drawn at the render size, then this
// draws it at the screen's size: a 12-tap Lanczos-like filter on the edges with adaptive sharpening,
// the rest a plain bilinear read, alpha kept (AR draws over the camera). It works in WebGL's frame
// (rows counted from the bottom), as the shader was written, by turning the reads over.
function sgsr1Gpu(src) {
  const low = rtt(src, 1, 1, { depthBuffer: false, type: HalfFloatType }), vp = uniform(new Vector4(1, 1, 1, 1));   // 1/w, 1/h, w, h of the small picture
  const node = Fn(() => {
    const H = int(vp.w), hi = ivec2(int(vp.z).sub(1), H.sub(1));
    const g = p => low.load(ivec2(p.x, H.sub(1).sub(p.y))).g;
    // textureGather(tex, coord, 1): the green of the 2 x 2 texels round coord, in gather order
    const gather = c => {
      const p = ivec2(floor(c.mul(vp.zw).sub(.5))), a = clamp(p, ivec2(0, 0), hi), b = clamp(p.add(1), ivec2(0, 0), hi);
      return vec4(g(ivec2(a.x, b.y)), g(b), g(ivec2(b.x, a.y)), g(a));
    };
    const lanczos = x => { const wA = x.sub(4), wB = x.mul(wA).sub(wA); return wB.mul(wA.mul(wA)); };
    const src0 = low.sample(screenUV), out = vec3(src0.rgb).toVar();
    const imgCoord = vec2(screenUV.x, float(1).sub(screenUV.y)).mul(vp.zw).add(vec2(-.5, .5)), pix = floor(imgCoord), pl = imgCoord.sub(pix);
    const coord = pix.mul(vp.xy).toVar(), left = gather(coord).toVar();
    const edgeVote = abs(left.z.sub(left.y)).add(abs(out.y.sub(left.y))).add(abs(out.y.sub(left.z)));
    If(edgeVote.greaterThan(8 / 255), () => {
      coord.assign(coord.add(vec2(vp.x, 0)));
      const right = gather(coord.add(vec2(vp.x, 0))).toVar();
      const u0 = gather(coord.add(vec2(0, vp.y.negate()))), u1 = gather(coord.add(vec2(0, vp.y)));
      const upDown = vec4(u0.w, u0.z, u1.y, u1.x).toVar();
      const mean = left.y.add(left.z).add(right.x).add(right.w).mul(.25);
      left.assign(left.sub(mean)); right.assign(right.sub(mean)); upDown.assign(upDown.sub(mean));
      const cw = out.y.sub(mean);
      const a4 = v => abs(v.x).add(abs(v.y)).add(abs(v.z)).add(abs(v.w));
      const std = float(2.181818).div(max(a4(left).add(a4(right)).add(a4(upDown)), 1e-5));
      const wy = (dx, dy, c) => { const w = lanczos(dx.mul(dx).add(dy.mul(dy)).mul(.55).add(clamp(abs(c).mul(std), 0, 1))); return vec2(w, w.mul(c)); };
      const X = pl.x, Y = pl.y;
      const aWY = wy(X, Y.add(1), upDown.x).add(wy(X.sub(1), Y.add(1), upDown.y)).add(wy(X.sub(1), Y.sub(2), upDown.z)).add(wy(X, Y.sub(2), upDown.w))
        .add(wy(X.add(1), Y.sub(1), left.x)).add(wy(X, Y.sub(1), left.y)).add(wy(X, Y, left.z)).add(wy(X.add(1), Y, left.w))
        .add(wy(X.sub(1), Y.sub(1), right.x)).add(wy(X.sub(2), Y.sub(1), right.y)).add(wy(X.sub(2), Y, right.z)).add(wy(X.sub(1), Y, right.w));
      const maxY = max(max(left.y, left.z), max(right.x, right.w)), minY = min(min(left.y, left.z), min(right.x, right.w));
      const finalY = clamp(aWY.y.div(aWY.x).mul(2), minY, maxY);   // edge sharpness 2
      out.assign(clamp(out.add(clamp(finalY.sub(cw), -23 / 255, 23 / 255)), 0, 1));   // (smooth high-contrast input)
    });
    return vec4(out, src0.a);
  })();
  return { node, size(w, h) { if (vp.value.z !== w || vp.value.w !== h) { low.setSize(w, h); vp.value.set(1 / w, 1 / h, w, h); } }, dispose() { low.dispose?.(); } };
}

// One chain per view (it draws that view's scene and camera). rebuild() when the shape changes (AO on
// or off, smoothing, see-through for AR); the numbers are uniforms set each frame.
// Snapdragon GSR 2 on WebGPU: the same two passes as sgsr2.js (Qualcomm, BSD 3-Clause; the licence and
// what changed are in that file), written as TSL. The finished small picture (fin) and the motion
// picture are drawn at the render size; the upscale is drawn at the screen's size into a history
// picture, which is copied to the screen and kept for next frame. Pictures here count rows from the
// top, so this is the shader's REQUEST_NDC_Y_UP variant, and WebGPU depth is already 0..1 like NDC z.
// mo (when the scene's pass writes them, frameGenMRT): each pixel's own motion and the see-through mask.
// With them, things that move by themselves are followed (the shader's motion vector input; without, all
// motion comes from the depth and the camera's move, so moving things smear), and see-through things
// (sparks, smoke, glass) lean on the new frame instead of the history, so they leave no trails.
function sgsr2Gpu(fin, depthT, mo = null) {
  const U = { rs: uniform(new Vector2(1, 1)), os: uniform(new Vector2(1, 1)), jit: uniform(new Vector2()), sr: uniform(new Vector2(1, 1)),
    fov: uniform(1), minLerp: uniform(0), reset: uniform(1), c2p: uniform(new Matrix4()), jd: uniform(new Vector2()) };
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
    const pre = U.c2p.mul(vec4(ndc, bl9, 1)), camM = ndc.sub(pre.xy.div(pre.w));
    if (!mo) return vec4(camM, clip, 0);
    // the motion of the nearest surface in the 3 x 3 round it (edges move with what's in front), less the
    // change in jitter; where nothing was drawn (the sky), the camera's move
    const at = (x, y) => clamp(P.add(ivec2(x, y)), ivec2(0, 0), hi);
    const near = ivec2(P).toVar(), nz = depthT.load(P).x.toVar();
    for (const [x, y] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
      const z = depthT.load(at(x, y)).x; If(z.lessThan(nz), () => { nz.assign(z); near.assign(at(x, y)); });
    }
    const M = select(nz.lessThan(1 - 1e-6), mo.vel.load(near).xy.sub(U.jd), camM);
    return vec4(M, clip, mo.rea.load(P).x);
  })();
  const mdc = rtt(conv, 1, 1, { depthBuffer: false });
  // two history pictures taking turns: this frame's upscale is drawn into one while it reads last
  // frame's from the other. (Copying into a single history picture broke after a resize, like
  // unfolding a Fold: a picture that is only copied into keeps its old size on the GPU.)
  const H2 = [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }));
  let cur = 0;
  const histT = texture(H2[1].texture), outT = texture(H2[0].texture);
  // upscale: Lanczos of the 5 nearest small pixels, a colour box, history clamped to it, then blended
  const upscale = Fn(() => {
    const H = screenUV, J = clamp(H.add(U.jit.div(U.rs)), 0, 1), IP = ivec2(J.mul(U.rs)), hi = ivec2(U.rs).sub(1);
    const mda = mdc.sample(J), M = mda.xy, df = mda.z, see = mo ? smoothstep(.1, .6, mda.w).mul(.9) : float(0);
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
    const a = max(clamp(upw.div(max(1.192e-07, ba.add(upw))).add(U.reset), 0, 1), see);
    return vec4(mix(h, upc, a), 1);
  })();
  const upMat = new NodeMaterial(); upMat.fragmentNode = upscale; upMat.name = 'SGSR2';
  const cpMat = new NodeMaterial(); cpMat.fragmentNode = vec4(outT.sample(screenUV).rgb, 1); cpMat.name = 'SGSR2 out';
  const qUp = new QuadMesh(upMat), qCp = new QuadMesh(cpMat);
  return {
    U, key: '',
    size(pw, ph, fw, fh) {
      const k = `${pw}x${ph}>${fw}x${fh}`; if (k === this.key) return; this.key = k;
      low.setSize(pw, ph); mdc.setSize(pw, ph); for (const t of H2) t.setSize(fw, fh);
    },
    set(f) {
      U.rs.value.copy(f.renderSize); U.os.value.copy(f.outputSize); U.jit.value.copy(f.jitter); U.sr.value.copy(f.scaleRatio);
      U.fov.value = f.fovH; U.minLerp.value = f.minLerp; U.reset.value = f.reset; U.c2p.value.copy(f.clipToPrevClip);
      if (f.jd) U.jd.value.set(f.jd[0], f.jd[1]);
    },
    // draw (the scene and the small finished picture are drawn on the way, by the nodes the upscale reads);
    // show = false leaves the screen alone (frame generation shows it, or a made frame, itself)
    render(r, show = true) {
      const tm = r.toneMapping, cs = r.outputColorSpace; r.toneMapping = NoToneMapping; r.outputColorSpace = LinearSRGBColorSpace;
      try {
        const into = H2[cur], from = H2[1 - cur]; histT.value = from.texture; outT.value = into.texture;
        r.setRenderTarget(into); qUp.render(r);
        r.setRenderTarget(null); if (show) qCp.render(r);
        cur = 1 - cur;
      } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
    },
    /** The picture the last render() made (it stays until the render after next: the two take turns). */
    last() { return H2[1 - cur].texture; },
    dispose() { low.dispose(); mdc.dispose(); for (const t of H2) t.dispose(); upMat.dispose(); cpMat.dispose(); },
  };
}

// volumetric light's stand-in shadow map while the light has none (its numbers say so: never read)
const NO_SHADOW = new DepthTexture(1, 1); NO_SHADOW.compareFunction = LessEqualCompare;
const VOL_MAX = 48, MB_N = 8;   // (hd3d.js VOL_MAX and MB_N)
export class GpuChain {
  constructor(r, scene, cam, clear) {
    Object.assign(this, { r, scene, cam, clear, key: '' });
    this.pp = new RenderPipeline(r); this.pp.outputColorTransform = false;
    this.U = {
      t: uniform(0), hurt: uniform(0), vig: uniform(.32), gradeOn: uniform(0), sat: uniform(1), con: uniform(1),
      lo: uniform(new Vector3(1, 1, 1)), hi: uniform(new Vector3(1, 1, 1)), glare: uniform(0), sunUV: uniform(new Vector2(.5, .5)),
      sunCol: uniform(new Color()), aspect: uniform(1),
      // depth of field (hd3d.js DOF): at, range, depth, blur in pixels; camera near and far; one pixel
      lens: uniform(new Vector4()), cn: uniform(.1), cf: uniform(1000), px: uniform(new Vector2(1, 1)),
      // sun shafts (hd3d.js SHAFT_*): strength x how much the sun shows, and the light's colour
      shaft: uniform(0), shaftTint: uniform(new Color(1, .9, .75)),
      // the mask's start, full and cap brightness and scale (hd3d.js ShaftsPass.bright, from v.shaftsAt)
      shThr: uniform(1.1), shHi: uniform(1.1 * 2.2), shCap: uniform(1e9), shGain: uniform(1),
      // frame generation's last touches: the grain's own clock and size (touches())
      gt: uniform(0), gk: uniform(1),
    };
    // volumetric light and motion blur (hd3d.js VOL and MB: the same numbers, from beamsFrame and blurFrame)
    this.V = {
      shM: uniform(new Matrix4()), invProj: uniform(new Matrix4()), camWorld: uniform(new Matrix4()), camPos: uniform(new Vector3()),
      lDir: uniform(new Vector3(0, -1, 0)), lPos: uniform(new Vector3()), lt: uniform(new Vector4()), k: uniform(new Vector4()), steps: uniform(24), tint: uniform(new Color(0, 0, 0)),
      prevVP: uniform(new Matrix4()), mb: uniform(new Vector4()),
    };
    this.bloomN = null; this.aoN = null;
    // the game on screen (live): each real frame is drawn into a picture and shown by a copy that adds the
    // last touches, so the refreshes in between can show made frames (framegen.js), a still scene can be
    // shown again without drawing it, and frame generation can come and go without rebuilding the chain.
    // fg: the generator; sched: where the refreshes since the newest real frame stand; fgWin: how often a
    // refresh between real frames didn't come; still: the still-picture check
    this.fg = null; this.sched = null; this.fgMode = null; this.fgWin = { real: 0, missed: 0 }; this.still = null; this.lastShown = null;
    this.warp = uniform(new Matrix3()); this.aim = null; this.aimBase = newPose(); this.aimAt = -1e9;
  }
  build(aoOn, smooth, msaa, s2 = false, dofOn = false, shaftsOn = false, live = false, s1 = false, volOn = false, mbOn = false, mrtOn = false, tone = 'aces', traaOn = false) {
    const key = `${aoOn}|${smooth}|${msaa}|${this.clear}|${s2}|${dofOn}|${shaftsOn}|${live}|${s1}|${volOn}|${mbOn}|${mrtOn}|${tone}|${traaOn}`;
    const TM = TONE[tone] ?? ACESFilmicToneMapping;
    if (key === this.key) return;
    this.key = key; this.fg?.reset(); this.sched = null; this.still?.reset();
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.bloomN?.dispose(); this.s2?.dispose(); this.s1?.dispose(); this.dofT?.renderTarget?.dispose(); this.shM?.renderTarget?.dispose(); this.shB?.renderTarget?.dispose();
    for (const t of [this.volT, this.baseT, this.mbT]) t?.renderTarget?.dispose();
    this.traaN?.dispose(); this.casN?.dispose(); this.traaN = this.casN = null;
    this.aoN = this.dnN = this.bloomN = this.s2 = this.s1 = this.dofT = this.shM = this.shB = this.volT = this.baseT = this.mbT = null;
    const sp = this.sp = pass(this.scene, this.cam, { samples: msaa || 0 });
    // frame generation and SGSR 2: the scene's pass also writes each pixel's motion and where see-through things are
    if (mrtOn && this.clear) sp.setMRT(frameGenMRT());
    if (this.clear) {
      // AR: just the scene on a see-through background, tone mapped (bloom and the grade would tint the room behind it);
      // with SGSR 1, drawn small and upscaled (tone mapping named outright: drawn outside the pipeline's own)
      if (s1) { this.s1 = sgsr1Gpu(renderOutput(sp, TM, SRGBColorSpace)); this.pp.outputNode = this.s1.node; }
      else this.pp.outputNode = renderOutput(sp);
      this.pp.needsUpdate = true; return;
    }
    // (the normals picture's alpha says whether a pixel takes ambient occlusion: see-through things,
    // leaf cards and anything marked noAO write 0, as WebGL's AO leaves them out: noAO() below)
    const nrm = aoOn ? { normal: vec4(normalView, 1) } : {};
    if (mrtOn) sp.setMRT(frameGenMRT(nrm)); else if (traaOn) sp.setMRT(mrt({ output, velocity: vec4(velocity, 0, 1), ...nrm })); else if (aoOn) sp.setMRT(mrt({ output, ...nrm }));
    const U = this.U;
    // temporal anti-aliasing (three.js's TRAA, top tiers when the picture isn't upscaled: SGSR 2 does its
    // own): the camera moves by a fraction of a pixel each frame and each pixel blends with where it was
    // last frame (following the motion picture, dropping what's newly uncovered), in place of MSAA.
    // It takes the scene's colour before anything else reads it, so AO, bloom and the grade see the smooth one
    let colT = sp.getTextureNode('output');
    // (then AMD FidelityFX's contrast-adaptive sharpening, three's RCAS, gives back the crispness the blending takes, as engines do after TAA)
    if (traaOn) {
      this.traaN = traa(colT, sp.getTextureNode('depth'), sp.getTextureNode('velocity'), this.cam);
      this.casN = sharpen(this.traaN.getTextureNode(), uniform(TRAA_SHARP)); colT = this.casN.getTextureNode();
    }
    let lit = colT.rgb, aoF = float(1);
    if (aoOn) {
      this.aoN = ao(sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.cam);
      Object.assign(this.aoN, { resolutionScale: 1 });
      this.aoN.radius.value = .6; this.aoN.distanceExponent.value = 1.4; this.aoN.thickness.value = 1.2; this.aoN.scale.value = 1.1; this.aoN.samples.value = 12;
      // (WebGL's GTAOPass smooths its own noise; here three's denoise does it)
      this.dnN = denoise(this.aoN.getTextureNode(), sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.cam);
      aoF = mix(float(1), this.dnN.r, sp.getTextureNode('normal').a.mul(.9)); lit = lit.mul(aoF);
    }
    let src = colT, srcAo = aoF;
    const V = this.V, dT = sp.getTextureNode('depth');
    // volumetric light (v.beams; hd3d.js VOL): the lit air along each view ray at half size, softened and added on
    if (volOn) {
      const shT = this.volShadow = texture(NO_SHADOW);
      this.volT = rtt(Fn(() => {
        const q = uv(), d = dT.sample(q).r, vp = getViewPosition(q, d, V.invProj), wp = V.camWorld.mul(vec4(vp, 1)).xyz;
        const rd0 = wp.sub(V.camPos), L0 = length(rd0), rd = rd0.div(max(L0, 1e-4)).toConst();
        const L = select(d.greaterThanEqual(1), V.k.y, min(L0, V.k.y)).toConst(), dt = L.div(V.steps).toConst();
        const t = dt.mul(interleavedGradientNoise(screenCoordinate)).toVar(), sum = float(0).toVar(), g = V.k.z, spot = V.lt.x.greaterThan(.5);
        Loop({ start: 0, end: VOL_MAX }, ({ i }) => {
          If(float(i).greaterThanEqual(V.steps), () => { Break(); });
          const p = V.camPos.add(rd.mul(t)), s4 = V.shM.mul(vec4(p, 1)), sc = s4.xyz.div(s4.w);
          const inside = s4.w.greaterThan(0).and(sc.x.greaterThanEqual(0)).and(sc.x.lessThanEqual(1)).and(sc.y.greaterThanEqual(0)).and(sc.y.lessThanEqual(1)).and(sc.z.greaterThanEqual(0)).and(sc.z.lessThanEqual(1));
          const sh = shT.sample(vec2(sc.x, sc.y.oneMinus())).compare(sc.z).r;
          const q0 = p.sub(V.lPos), dl = length(q0), qn = q0.div(max(dl, 1e-4));
          const cone = smoothstep(V.lt.y, V.lt.z, dot(qn, V.lDir)).div(dl.mul(dl).div(V.lt.w.mul(V.lt.w)).add(1));
          const lit = select(inside.and(V.k.w.greaterThan(.5)), sh, float(1)).mul(select(spot, cone, float(1)));
          const c = dot(rd, select(spot, qn.negate(), V.lDir.negate()));
          sum.addAssign(lit.mul(g.mul(g).oneMinus()).div(pow(g.mul(g).add(1).sub(g.mul(2).mul(c)), 1.5)).mul(.25)); t.addAssign(dt);
        });
        return vec4(exp(V.k.x.negate().mul(L).mul(sum).div(V.steps)).oneMinus(), 0, 0, 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      const volT = this.volT, vpx = this.volPx = uniform(new Vector2(1, 1));
      this.baseT = rtt(Fn(() => {
        const q = uv(), a = volT.sample(q.add(vpx.mul(vec2(-1, -1)))).r.add(volT.sample(q.add(vpx.mul(vec2(1, -1)))).r)
          .add(volT.sample(q.add(vpx.mul(vec2(-1, 1)))).r).add(volT.sample(q.add(vpx.mul(vec2(1, 1)))).r);
        return vec4(colT.sample(q).rgb.mul(aoF).add(V.tint.mul(a.mul(.25))), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      src = this.baseT; srcAo = float(1);
    }
    // depth of field (v.focus; the views turn it on once they use it, so focusing doesn't rebuild the
    // chain): what's in focus stays, the rest is blurred by up to lens.w pixels, into a picture of its own
    if (dofOn) {
      const cn = U.cn, cf = U.cf, L = U.lens, S = src, SA = srcAo;
      const dist = q => { const z = dT.sample(q).x; return select(z.greaterThanEqual(1), float(0), cn.mul(cf).div(cf.sub(z.mul(cf.sub(cn))))); };
      const coc = z => select(z.lessThanEqual(0), float(0), clamp(abs(z.sub(L.x)).sub(L.y).div(max(L.x.mul(L.z), 1e-3)), 0, 1));
      const dof = Fn(() => {
        const q = uv(), base = S.sample(q).rgb, z = dist(q), c = coc(z), out = vec3(base).toVar();
        If(c.mul(L.w).greaterThanEqual(.5), () => {
          const sum = vec3(base).toVar(), ws = float(1).toVar();
          for (let i = 1; i < 16; i++) {
            const r = Math.sqrt(i / 15), a = i * 2.39996, o = vec2(Math.cos(a) * r, Math.sin(a) * r).mul(c.mul(L.w)).mul(U.px);
            const zs = dist(q.add(o)), w = select(zs.greaterThan(0).and(zs.lessThan(z)), coc(zs), float(1));   // a sharp thing in front doesn't smear over a soft background
            sum.addAssign(S.sample(q.add(o)).rgb.mul(w)); ws.addAssign(w);
          }
          out.assign(sum.div(ws));
        });
        return vec4(out.mul(SA), 1);
      })();
      this.dofT = rtt(dof, 1, 1, { depthBuffer: false, type: HalfFloatType }); src = this.dofT; srcAo = float(1);
    }
    // motion blur (v.motionBlur; hd3d.js MB): each pixel smeared along its move on screen as the camera moved
    if (mbOn) {
      const S = src, SA = srcAo, mb = V.mb;
      this.mbT = rtt(Fn(() => {
        const q = uv(), base = S.sample(q).rgb.mul(SA), d = dT.sample(q).r, vp = getViewPosition(q, d, V.invProj);
        const pc = V.prevVP.mul(V.camWorld.mul(vec4(vp, 1))), pn = pc.xy.div(max(pc.w, 1e-4)), pu = vec2(pn.x.mul(.5).add(.5), pn.y.mul(-.5).add(.5));
        const v0 = q.sub(pu).mul(mb.x), l = length(v0.mul(vec2(mb.w, 1))), mx = mb.y.mul(mb.w);
        const v1 = select(l.greaterThan(mx), v0.mul(mx.div(max(l, 1e-6))), v0).mul(select(d.greaterThanEqual(1), float(1), smoothstep(mb.z, mb.z.mul(1.5).add(.01), vp.z.negate())));
        const vel = select(pc.w.lessThanEqual(0), vec2(0), v1);
        let sum = vec3(0);
        for (let i = 0; i < MB_N; i++) sum = sum.add(S.sample(q.add(vel.mul(i / (MB_N - 1) - .5))).rgb);
        return vec4(select(length(vel.div(U.px)).lessThan(.75), base, sum.mul(SA).div(MB_N)), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      src = this.mbT; srcAo = float(1);
    }
    // sun shafts (v.shafts): the bright sky near the sun at quarter size, smeared towards the sun, added on top
    let shafts = vec3(0);
    if (shaftsOn) {
      this.shM = rtt(Fn(() => {
        const q = uv(), c0 = src.sample(q).rgb.mul(srcAo), l0 = dot(c0, LUM), k = q.sub(U.sunUV).mul(vec2(U.aspect, 1));
        const l = min(l0, U.shCap), c = c0.mul(l.div(max(l0, 1e-6))).mul(U.shGain);
        return vec4(c.mul(smoothstep(U.shThr, U.shHi, l)).mul(exp(dot(k, k).mul(-3))), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      const shM = this.shM;
      this.shB = rtt(Fn(() => {
        const q = uv(), dd = q.sub(U.sunUV).mul(.9 / 24); let sum = vec3(0), w = 1;
        for (let i = 1; i <= 24; i++) { sum = sum.add(shM.sample(q.sub(dd.mul(i))).rgb.mul(w)); w *= .955; }
        return vec4(sum.div(24).mul(2.2), 1);
      })(), 1, 1, { depthBuffer: false, type: HalfFloatType });
      shafts = this.shB.sample(screenUV).rgb.mul(U.shaftTint).mul(U.shaft);
    }
    if (src !== colT || shaftsOn) lit = src.sample(screenUV).rgb.mul(srcAo).add(shafts);
    this.bloomN = bloomChain(src, srcAo); this.bloomK = uniform(.56);
    const uv0 = screenUV, d = uv0.sub(.5), r2 = dot(d, d);
    const graded = Fn(() => {
      const uv = uv0;
      // smooth: with FXAA on (below) no fringe; otherwise a touch of lens fringing at the edges
      let col = smooth ? lit : vec3(src.sample(uv.add(d.mul(r2).mul(.012))).r.mul(srcAo).add(shafts.r), lit.g, src.sample(uv.sub(d.mul(r2).mul(.012))).b.mul(srcAo).add(shafts.b));
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
    // tone mapping (ACES, the renderer's exposure) and sRGB (named outright under SGSR 2 and 1: drawn outside the pipeline)
    let out = s2 || s1 ? renderOutput(vec4(graded, 1), TM, SRGBColorSpace) : renderOutput(vec4(graded, 1));
    if (smooth) out = fxaa(out);
    // live, the last touches go on as each refresh is shown (show()), not here
    const fin = live ? vec4(out.rgb, 1) : Fn(() => vec4(touches(U, out.rgb, U.t, float(1)), 1))();
    if (s2) { this.s2 = sgsr2Gpu(fin, sp.getTextureNode('depth'), mrtOn ? { vel: sp.getTextureNode('velocity'), rea: sp.getTextureNode('reactive') } : null); return; }
    if (s1) this.s1 = sgsr1Gpu(fin);
    this.pp.outputNode = s1 ? this.s1.node : fin; this.pp.needsUpdate = true;
  }
  /** Sets the numbers from the view and tier, then draws. o: { ao (AO resolution, 0 = off), msaa, bloomScale, smooth, bloom, t, hurt, grade, glare, sunUV, sunCol, aspect,
   *  fg (frame generation: { mode: 'blend' | 'ahead', reset, jd: SGSR 2's jitter change in NDC }) }. With fg, returns what it showed ('real' | 'made'). */
  render(o) {
    // o.s2: SGSR 2's frame numbers (sgsr2.js SgsrFrame): the scene and effects at o.w x o.h, upscaled to o.fw x o.fh;
    // o.s1: the same sizes, upscaled by SGSR 1. o.live: the game on screen (drawn into a picture and shown);
    // o.mrt: the scene's pass also writes motion and the see-through mask (frame generation, SGSR 2)
    const f = !this.clear && o.s2 ? o.s2 : null, s1 = !f && !!o.s1, live = !!o.live;
    DRAWN.n++;
    this.build(!this.clear && o.ao > 0, !!o.smooth && !f, o.msaa, !!f, !this.clear && !!o.dofOn, !this.clear && !!o.shaftsOn, live, s1, !this.clear && !!o.volOn, !this.clear && !!o.mbOn, !!o.mrt, o.tone, !this.clear && !f && !s1 && !!o.traa);
    if (this.s1) this.s1.size(o.w, o.h);
    // the passes size themselves from the canvas: upscaled, the canvas is the screen's size, so scale them down
    const k = f || s1 ? (o.w + .5) / o.fw : 1;
    if (this.sp.getResolutionScale() !== k) this.sp.setResolutionScale(k);
    if (!this.clear) {
      const U = this.U;
      if (this.aoN && this.aoN.resolutionScale !== o.ao * k) this.aoN.resolutionScale = o.ao * k;
      this.bloomK.value = Math.max(0, o.bloom) * .8; this.bloomN.size(o.w, o.h, o.bloomScale || .5);
      U.t.value = o.t; U.hurt.value = o.hurt;
      const g = o.grade; U.gradeOn.value = g ? 1 : 0;
      if (g) { U.sat.value = g.sat; U.con.value = g.con; U.lo.value.copy(g.lo); U.hi.value.copy(g.hi); }
      U.glare.value = o.glare; U.sunUV.value.set(o.sunUV.x, 1 - o.sunUV.y); U.sunCol.value.copy(o.sunCol); U.aspect.value = o.aspect;
      U.px.value.set(1 / o.w, 1 / o.h);
      if (this.dofT) { this.dofT.setSize(o.w, o.h); const L = o.lens; U.lens.value.set(L ? L[0] : 0, L ? L[1] : 0, L ? L[2] : 0, L ? L[3] : 0); U.cn.value = o.near; U.cf.value = o.far; }
      const V = this.V, cam = this.cam;
      if (this.volT || this.mbT) { V.invProj.value.copy(cam.projectionMatrixInverse); V.camWorld.value.copy(cam.matrixWorld); }
      if (this.volT) {
        const m = o.vol; this.volT.setSize(Math.max(8, Math.round(o.w / 2)), Math.max(8, Math.round(o.h / 2))); this.baseT.setSize(o.w, o.h);
        this.volPx.value.set(1 / this.volT.renderTarget.width, 1 / this.volT.renderTarget.height);
        if (m) {
          this.volShadow.value = m.map || NO_SHADOW; if (m.shadowM) V.shM.value = m.shadowM; cam.getWorldPosition(V.camPos.value);
          V.lDir.value.copy(m.lDir); V.lPos.value.copy(m.lPos); V.lt.value.copy(m.lt); V.k.value.set(m.density, m.far, m.g, m.map ? 1 : 0); V.steps.value = m.steps; V.tint.value.copy(m.tint);
        } else { V.tint.value.setRGB(0, 0, 0); V.steps.value = 1; }
      }
      if (this.mbT) { this.mbT.setSize(o.w, o.h); const m = o.mb; if (m) { V.prevVP.value.copy(m.prevVP); V.mb.value.copy(m.mb); } else V.mb.value.set(0, 0, 0, 1); }
      if (this.shM) { const bw = Math.max(8, Math.round(o.w / 4)), bh = Math.max(8, Math.round(o.h / 4)); this.shM.setSize(bw, bh); this.shB.setSize(bw, bh); U.shaft.value = o.shaft || 0; if (o.shaftCol) U.shaftTint.value.copy(o.shaftCol);
        const t = Math.max(1.1, o.shaftAt ?? 1.1), lit = t > 1.1; U.shThr.value = t; U.shHi.value = lit ? t * 1.2 : t * 2.2; U.shCap.value = lit ? t * 1.2 : 1e9; U.shGain.value = 1.1 / t; }
    }
    if (live) return this.realFrame(o, f);
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(this.r); }
    else this.pp.render();
  }

  /* ---------- the game on screen: real frames, made frames, still frames ---------- */
  // Each real frame is drawn into a picture (SGSR 2's own, or one of ours) and shown by a copy that adds
  // the last touches. With frame generation (o.fg: { mode, reset, jd, jit, steps, hz }), every refresh
  // shows a moment on an even beat: t = 1 + (k - D) / gap, k refreshes after the newest real frame, which
  // came gap refreshes after the last one. blend shows each moment D refreshes late, so every moment is
  // between two real frames (D = 1 at twice the game's rate, 2 at three times...); ahead (D = 0) shows
  // the newest real frame on its own refresh and guesses past it after. That covers two, three or four
  // refreshes per real frame, and a screen that isn't a whole multiple (60 fps on 90 Hz: one or two).
  // The refreshes between are the ones the feed skips (src/main.js, speed.between).
  realFrame(o, f) {
    const r = this.r, sp = this.sp, fgo = o.mrt ? o.fg : null, cam = this.cam;
    if (!fgo && this.fg?.frames) { this.fg.reset(); this.sched = null; }
    // the last pair's newest frame becomes the next pair's last (when no refresh between did it)
    if (fgo && this.owe && !fgo.reset) this.fg.keep();
    this.owe = false;
    // particles' own motion is measured from the camera as the last real frame drew it
    fgPrevVP.value.copy(this.vpLast ||= cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse));
    let color;
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(r, false); color = this.s2.last(); }
    else {
      const rt = this.fgRT ||= new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
      if (rt.width !== o.fw || rt.height !== o.fh) rt.setSize(o.fw, o.fh);
      const was = r.getRenderTarget(); r.setRenderTarget(rt);
      try { this.pp.render(); } finally { r.setRenderTarget(was); }
      color = rt.texture;
    }
    this.vpLast.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.lastColor = color;
    if (o.still) (this.still ||= new StillCheck(r)).check(color, o.fw, o.fh);
    if (!fgo) { this.fgMode = null; this.showFrame(color, null); return 'real'; }
    const fg = this.fg ||= new FrameGen(r);
    const mode = fgo.mode === 'ahead' ? 'ahead' : 'blend';
    if (fgo.reset || mode !== this.fgMode) { fg.reset(); this.sched = null; }
    this.fgMode = mode;
    const vel = sp.getTexture('velocity');
    this.U.gk.value = vel.image.width / o.fw;
    fg.real({ color, velocity: vel, reactive: sp.getTexture('reactive'), depth: sp.getTextureNode('depth').value,
      renderSize: [vel.image.width, vel.image.height], outputSize: [o.fw, o.fh], camera: cam, jitter: fgo.jit, jitterDelta: fgo.jd });
    // the gap since the last real frame, in refreshes as the screen saw them (one that can't be a refresh
    // count, like a test's slow frames, counts as the usual one)
    const S = this.sched, steps = Math.max(1, fgo.steps || 2), ms = 1000 / (fgo.hz || 120);
    let gap = S ? Math.round((o.now - S.at) / ms) : 0;
    if (!(gap >= 1 && gap <= 6)) gap = Math.max(1, Math.round(steps));
    if (S) { this.fgWin.real++; if (S.k < gap - 1) this.fgWin.missed++; }   // refreshes in that gap showed nothing new
    this.sched = { at: o.now, ms, gap, k: 0, D: mode === 'blend' ? Math.max(1, Math.ceil(steps - .01) - 1) : 0 };
    this.owe = true;
    // fresh aim: where the input pointed the camera for this frame (a later change is the finger's own)
    const base = this.aim && fg.ready ? this.aim() : null; if (base) copyPose(base, this.aimBase);
    return this.showAt(0);
  }
  // the moment due k refreshes after the newest real frame: the newest, the last, or a made one
  showAt(k) {
    const S = this.sched, fg = this.fg, t = 1 + (k - S.D) / S.gap;
    if (!fg.ready || Math.abs(t - 1) < .02) { this.showFrame(this.lastColor, 1); return 'real'; }
    if (t < .02) { this.showFrame(fg.prevColor, 0); return 'real'; }
    if (t > 2.6) return false;   // too far past the newest to guess: the screen keeps what it has
    fg.make(t); this.showFrame(fg.output, t); return 'made';
  }
  /**
   * A refresh after a real frame (the feed's skipped refresh): shows the moment due then. last: the next
   * refresh draws a real frame (so the newest is kept now, on this lighter refresh); now: this refresh's
   * time (the animation frame's), so a refresh the phone skipped (a busy moment) doesn't hold the picture
   * back a step, which then jumps when the next real frame comes (stop and go). Returns 'real' | 'made' | false.
   */
  between(last = true, now = null) {
    const S = this.sched; if (!S || !this.fg) return false;
    S.k = refreshesSince(S, now);
    const shown = this.showAt(S.k);
    if (last && this.owe) { this.fg.keep(); this.owe = false; }
    return shown;
  }
  /** Shows the last real frame again (a still scene that isn't drawn this refresh). */
  showLast() { if (!this.lastColor) return false; this.warp.value.identity(); this.show(this.lastColor); return true; }
  /** How often, out of the last real frames, the refresh between them didn't come (0..1), then starts counting again. */
  missRate() { const w = this.fgWin, m = w.real ? w.missed / w.real : 0; w.real = w.missed = 0; return m; }
  // a frame onto the screen; with fresh aim (this.aim: the camera's pose now, from the newest input), turned
  // from the camera it was made for (the moment t) to where the camera points now. Only while the input is
  // turning the camera between real frames (a finger looking round, the phone turning in AR): a turn the
  // game makes in its update (a stick held over) is followed by the made frames' own motion instead.
  showFrame(tex, t) {
    const fresh = this.aim && t != null && this.fg?.ready ? this.aim() : null, now = performance.now(), B = this.aimBase;
    if (fresh && (fresh.q.angleTo(B.q) > 1e-5 || Math.abs(fresh.fx - B.fx) > 1e-6 * Math.abs(B.fx))) this.aimAt = now;
    if (fresh && now - this.aimAt < AIM_HOLD) homography(fresh, this.fg.poseAt(t, AIM_POSE), this.warp.value); else this.warp.value.identity();
    this.show(tex);
  }
  // a picture onto the screen (already tone mapped and in sRGB), with the last touches (AR: as it is, see-through)
  show(tex) {
    if (!this.showQ) {
      const m = new NodeMaterial(), T = this.showT = texture(tex), U = this.U, at = warpUV(screenUV, this.warp); m.name = 'Frame gen show';
      m.fragmentNode = this.clear ? T.sample(at) : Fn(() => vec4(touches(U, T.sample(at).rgb, U.gt, U.gk), 1))();
      this.showQ = new QuadMesh(m);
    }
    this.showT.value = tex; this.U.gt.value = (this.U.gt.value + .37) % 10;
    const r = this.r, tm = r.toneMapping, cs = r.outputColorSpace; r.toneMapping = NoToneMapping; r.outputColorSpace = LinearSRGBColorSpace;
    try { r.setRenderTarget(null); this.showQ.render(r); } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
  }
  dispose() {
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.bloomN?.dispose?.(); this.s2?.dispose(); this.s1?.dispose(); this.dofT?.renderTarget?.dispose(); this.shM?.renderTarget?.dispose(); this.shB?.renderTarget?.dispose(); for (const t of [this.volT, this.baseT, this.mbT]) t?.renderTarget?.dispose(); this.pp.dispose?.();
    this.fg?.dispose(); this.still?.dispose(); this.fgRT?.dispose(); this.showQ?.material.dispose(); this.fg = this.still = this.fgRT = this.showQ = null; this.sched = null; this.lastColor = null;
  }
}
const AIM_POSE = newPose(), AIM_HOLD = 150;   // fresh aim: the pose a frame was made for; ms the input counts as turning the camera after it last did
export { gpuSparks } from './particles-gpu.js';
