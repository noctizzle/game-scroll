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
  MeshBasicNodeMaterial, NodeMaterial, QuadMesh, MRTNode, OutputStructNode, PMREMNode, CubeRenderTarget, CubeCamera, RenderTarget, Texture, Matrix4, HalfFloatType, NoToneMapping, ACESFilmicToneMapping, SRGBColorSpace, LinearSRGBColorSpace } from 'three/webgpu';
import {
  pass, mrt, output, normalView, uniform, texture, screenUV, screenCoordinate, screenSize, renderOutput, Fn,
  vec2, vec3, vec4, float, mix, smoothstep, dot, exp, length, max, pow, clamp, log2, fract, sin, abs, select,
  positionWorld, cameraPosition, instancedBufferAttribute, uv, rtt, depth, ivec2, min, materialEmissive, distance,
  attribute, vertexColor, normalWorld, normalViewGeometry, positionLocal, positionGeometry, modelWorldMatrix, modelWorldMatrixInverse,
  materialColor, materialOpacity, materialRoughness, cos, floor, step, fwidth, dFdx, dFdy, normalize, uniformArray, Loop, int, If, sqrt,
  modelViewProjection, acos, getParallaxCorrectNormal,
} from 'three/tsl';
import { LightProbeGrid } from 'three/examples/jsm/lighting/LightProbeGrid.js';
export { LightProbeGrid };
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { denoise } from 'three/examples/jsm/tsl/display/DenoiseNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FrameGen, frameGenMRT } from './framegen.js';

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
  // looks.js leaves(): sway (more towards the top, leaning downwind), light through towards the sun,
  // outlines that hold up far away, and both sides lit alike
  leaves(m, s, o) {
    const u = s.uniforms, t = live(u.lkTime), sw = live(u.lkSway), dir = live(u.lkWindDir);
    const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz, hh = max(positionGeometry.y.sub(sw.y), 0), ph = wp.x.mul(.19).add(wp.z.mul(.23));
    const k = live(u.lkWind).mul(hh).mul(sw.x);
    const swing = vec3(sin(t.mul(1.7).add(ph)).add(sin(t.mul(3.1).add(ph.mul(2.3))).mul(.3)), 0, cos(t.mul(1.3).add(ph.mul(1.4)))).mul(k);
    const lean = dir.mul(k).mul(sin(t.mul(.9).add(ph.mul(.5))).mul(.6).add(1.2));
    m.positionNode = positionLocal.add(modelWorldMatrixInverse.mul(vec4(swing.add(vec3(lean.x, 0, lean.y)), 0)).xyz);
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
const PF = new Frustum(), PS = new Sphere(), PM = new Matrix4(), PV = new Vector3();
export function gpuProps(im) {
  const levels = im.LODinfo ? im.LODinfo.render.levels.map(l => ({ obj: l.object, dist: l.distance * (1 - (l.hysteresis || 0)) })) : [{ obj: im, dist: 0 }];   // (the library keeps distances squared)
  const group = new Group(); group.name = im.name + ':webgpu';
  let cap = 0, tw = [];
  const make = () => {
    for (const t of tw) { t.removeFromParent(); t.dispose(); }
    cap = Math.max(16, im._capacity || im._instancesArrayCount || 16);
    tw = levels.map(({ obj }) => {
      const src = obj.geometry, g = new BufferGeometry();   // the same buffers, without the library's index attribute
      for (const k in src.attributes) if (k !== 'instanceIndex') g.setAttribute(k, src.attributes[k]);
      g.setIndex(src.index); g.groups = src.groups;
      if (!src.boundingSphere) src.computeBoundingSphere(); g.boundingSphere = src.boundingSphere;
      const m = new InstancedMesh(g, obj.material, cap); m.count = 0; m.frustumCulled = false;
      m.castShadow = im.castShadow; m.receiveShadow = im.receiveShadow;
      if (im.colorsTexture) m.instanceColor = new IBA(new Float32Array(cap * 3), 3);
      group.add(m); return m;
    });
  };
  make();
  return {
    group,
    sync(cam, occ = null) {   // occ: hd3d.js occlusion culling (only for props without shadows: one list feeds both here)
      if ((im._capacity || 0) > cap) make();
      const n = im._instancesArrayCount || 0, D = im.matricesTexture?._data, C = im.colorsTexture?._data, wm = im.matrixWorld;
      for (const t of tw) t.count = 0;
      if (!D) return;
      cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); PF.setFromProjectionMatrix(PM, cam.coordinateSystem);
      const cp = cam.getWorldPosition(PV), cx = cp.x, cy = cp.y, cz = cp.z, R0 = levels[0].obj.geometry.boundingSphere?.radius ?? 1;
      for (let i = 0; i < n; i++) {
        if (!im.getActiveAndVisibilityAt(i)) continue;
        const o = i * 16, sx = Math.hypot(D[o], D[o + 1], D[o + 2]), sy = Math.hypot(D[o + 4], D[o + 5], D[o + 6]), sz = Math.hypot(D[o + 8], D[o + 9], D[o + 10]);
        PS.center.set(D[o + 12], D[o + 13], D[o + 14]).applyMatrix4(wm); PS.radius = R0 * Math.max(sx, sy, sz) + 8;   // (+8 m: things just out of view still cast their shadows in)
        if (!PF.intersectsSphere(PS)) continue;
        if (occ && !im.castShadow && occ.hidden(PS.center, PS.radius - 8)) continue;
        const d = (PS.center.x - cx) ** 2 + (PS.center.y - cy) ** 2 + (PS.center.z - cz) ** 2;   // squared, like the levels
        let L = 0; while (L + 1 < levels.length && d >= levels[L + 1].dist) L++;
        const t = tw[L], k = t.count++;
        t.instanceMatrix.array.set(D.subarray(o, o + 16), k * 16);
        if (C) t.instanceColor.array.set(C.subarray(i * 4, i * 4 + 3), k * 3);
      }
      for (const t of tw) { if (t.count) { t.instanceMatrix.needsUpdate = true; if (t.instanceColor) t.instanceColor.needsUpdate = true; } t.visible = t.count > 0; }
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
  // two history pictures taking turns: this frame's upscale is drawn into one while it reads last
  // frame's from the other. (Copying into a single history picture broke after a resize, like
  // unfolding a Fold: a picture that is only copied into keeps its old size on the GPU.)
  const H2 = [0, 1].map(() => new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false }));
  let cur = 0;
  const histT = texture(H2[1].texture), outT = texture(H2[0].texture);
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
    this.bloomN = null; this.aoN = null;
    // frame generation (framegen.js): the generator, what the next refresh between real frames does, and how often that refresh didn't come
    this.fg = null; this.pend = null; this.fgMode = null; this.fgWin = { real: 0, missed: 0 };
  }
  build(aoOn, smooth, msaa, s2 = false, dofOn = false, shaftsOn = false, fg = false, s1 = false) {
    const key = `${aoOn}|${smooth}|${msaa}|${this.clear}|${s2}|${dofOn}|${shaftsOn}|${fg}|${s1}`;
    if (key === this.key) return;
    this.key = key; this.fg?.reset(); this.pend = null;
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.bloomN?.dispose(); this.s2?.dispose(); this.s1?.dispose(); this.dofT?.renderTarget?.dispose(); this.shM?.renderTarget?.dispose(); this.shB?.renderTarget?.dispose();
    this.aoN = this.dnN = this.bloomN = this.s2 = this.s1 = this.dofT = this.shM = this.shB = null;
    const sp = this.sp = pass(this.scene, this.cam, { samples: msaa || 0 });
    // frame generation: the scene's pass also writes each pixel's motion and where see-through things are
    if (fg && this.clear) sp.setMRT(frameGenMRT());
    if (this.clear) {
      // AR: just the scene on a see-through background, tone mapped (bloom and the grade would tint the room behind it);
      // with SGSR 1, drawn small and upscaled (tone mapping named outright: drawn outside the pipeline's own)
      if (s1) { this.s1 = sgsr1Gpu(renderOutput(sp, ACESFilmicToneMapping, SRGBColorSpace)); this.pp.outputNode = this.s1.node; }
      else this.pp.outputNode = renderOutput(sp);
      this.pp.needsUpdate = true; return;
    }
    // (the normals picture's alpha says whether a pixel takes ambient occlusion: see-through things,
    // leaf cards and anything marked noAO write 0, as WebGL's AO leaves them out: noAO() below)
    const nrm = aoOn ? { normal: vec4(normalView, 1) } : {};
    if (fg) sp.setMRT(frameGenMRT(nrm)); else if (aoOn) sp.setMRT(mrt({ output, ...nrm }));
    const U = this.U, colT = sp.getTextureNode('output');
    let lit = colT.rgb, aoF = float(1);
    if (aoOn) {
      this.aoN = ao(sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.cam);
      Object.assign(this.aoN, { resolutionScale: 1 });
      this.aoN.radius.value = .6; this.aoN.distanceExponent.value = 1.4; this.aoN.thickness.value = 1.2; this.aoN.scale.value = 1.1; this.aoN.samples.value = 12;
      // (WebGL's GTAOPass smooths its own noise; here three's denoise does it)
      this.dnN = denoise(this.aoN.getTextureNode(), sp.getTextureNode('depth'), sp.getTextureNode('normal'), this.cam);
      aoF = mix(float(1), this.dnN.r, sp.getTextureNode('normal').a.mul(.9)); lit = lit.mul(aoF);
    }
    // depth of field (v.focus; the views turn it on once they use it, so focusing doesn't rebuild the
    // chain): what's in focus stays, the rest is blurred by up to lens.w pixels, into a picture of its own
    let src = colT, srcAo = aoF;
    if (dofOn) {
      const dT = sp.getTextureNode('depth'), cn = U.cn, cf = U.cf, L = U.lens;
      const dist = q => { const z = dT.sample(q).x; return select(z.greaterThanEqual(1), float(0), cn.mul(cf).div(cf.sub(z.mul(cf.sub(cn))))); };
      const coc = z => select(z.lessThanEqual(0), float(0), clamp(abs(z.sub(L.x)).sub(L.y).div(max(L.x.mul(L.z), 1e-3)), 0, 1));
      const dof = Fn(() => {
        const q = uv(), base = colT.sample(q).rgb, z = dist(q), c = coc(z), out = vec3(base).toVar();
        If(c.mul(L.w).greaterThanEqual(.5), () => {
          const sum = vec3(base).toVar(), ws = float(1).toVar();
          for (let i = 1; i < 16; i++) {
            const r = Math.sqrt(i / 15), a = i * 2.39996, o = vec2(Math.cos(a) * r, Math.sin(a) * r).mul(c.mul(L.w)).mul(U.px);
            const zs = dist(q.add(o)), w = select(zs.greaterThan(0).and(zs.lessThan(z)), coc(zs), float(1));   // a sharp thing in front doesn't smear over a soft background
            sum.addAssign(colT.sample(q.add(o)).rgb.mul(w)); ws.addAssign(w);
          }
          out.assign(sum.div(ws));
        });
        return vec4(out.mul(aoF), 1);
      })();
      this.dofT = rtt(dof, 1, 1, { depthBuffer: false, type: HalfFloatType }); src = this.dofT; srcAo = float(1);
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
    let out = s2 || s1 ? renderOutput(vec4(graded, 1), ACESFilmicToneMapping, SRGBColorSpace) : renderOutput(vec4(graded, 1));
    if (smooth) out = fxaa(out);
    // with frame generation the last touches go on as each refresh is shown (show()), not here
    const fin = fg ? vec4(out.rgb, 1) : Fn(() => vec4(touches(U, out.rgb, U.t, float(1)), 1))();
    if (s2) { this.s2 = sgsr2Gpu(fin, sp.getTextureNode('depth')); return; }
    if (s1) this.s1 = sgsr1Gpu(fin);
    this.pp.outputNode = s1 ? this.s1.node : fin; this.pp.needsUpdate = true;
  }
  /** Sets the numbers from the view and tier, then draws. o: { ao (AO resolution, 0 = off), msaa, bloomScale, smooth, bloom, t, hurt, grade, glare, sunUV, sunCol, aspect,
   *  fg (frame generation: { mode: 'blend' | 'ahead', reset, jd: SGSR 2's jitter change in NDC }) }. With fg, returns what it showed ('real' | 'made'). */
  render(o) {
    // o.s2: SGSR 2's frame numbers (sgsr2.js SgsrFrame): the scene and effects at o.w x o.h, upscaled to o.fw x o.fh;
    // o.s1: the same sizes, upscaled by SGSR 1
    const f = !this.clear && o.s2 ? o.s2 : null, s1 = !f && !!o.s1, fg = o.fg || null;
    this.build(!this.clear && o.ao > 0, !!o.smooth && !f, o.msaa, !!f, !this.clear && !!o.dofOn, !this.clear && !!o.shaftsOn, !!fg, s1);
    if (!fg) { this.pend = null; this.fgMode = null; }
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
      if (this.shM) { const bw = Math.max(8, Math.round(o.w / 4)), bh = Math.max(8, Math.round(o.h / 4)); this.shM.setSize(bw, bh); this.shB.setSize(bw, bh); U.shaft.value = o.shaft || 0; if (o.shaftCol) U.shaftTint.value.copy(o.shaftCol);
        const t = Math.max(1.1, o.shaftAt ?? 1.1), lit = t > 1.1; U.shThr.value = t; U.shHi.value = lit ? t * 1.2 : t * 2.2; U.shCap.value = lit ? t * 1.2 : 1e9; U.shGain.value = 1.1 / t; }
    }
    if (fg) return this.realFrame(o, f);
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(this.r); }
    else this.pp.render();
  }

  /* ---------- frame generation (framegen.js) ---------- */
  // The real frame is drawn into a picture (SGSR 2's own, or one of ours), handed to the generator,
  // and shown by a copy. blend: this refresh shows the frame made halfway from the last real frame to
  // this one, and the next refresh (between()) shows this one. ahead: this refresh shows this one, and
  // the next shows a frame made half a frame past it. The refresh between is the one the feed skips
  // when a game runs at half the screen's rate (src/main.js, speed.between).
  realFrame(o, f) {
    const r = this.r, fg = this.fg ||= new FrameGen(r), sp = this.sp;
    // the refresh between the last two real frames never came (the phone is busy): what it would have
    // kept is kept now, so this frame is made from the right one
    if (this.pend) { if (!o.fg.reset) { this.fgWin.missed++; if (this.pend.keep) fg.keep(); } this.pend = null; }
    let color;
    if (this.s2) { this.s2.size(o.w, o.h, o.fw, o.fh); this.s2.set(f); this.s2.render(r, false); color = this.s2.last(); }
    else {
      const rt = this.fgRT ||= new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
      if (rt.width !== o.fw || rt.height !== o.fh) rt.setSize(o.fw, o.fh);
      const was = r.getRenderTarget(); r.setRenderTarget(rt);
      try { this.pp.render(); } finally { r.setRenderTarget(was); }
      color = rt.texture;
    }
    const mode = o.fg.mode === 'ahead' ? 'ahead' : 'blend';
    if (o.fg.reset || mode !== this.fgMode) fg.reset();
    this.fgMode = mode;
    const vel = sp.getTexture('velocity');
    this.U.gk.value = vel.image.width / o.fw;
    fg.real({ color, velocity: vel, reactive: sp.getTexture('reactive'), depth: sp.getTextureNode('depth').value,
      renderSize: [vel.image.width, vel.image.height], outputSize: [o.fw, o.fh], camera: this.cam, jitterDelta: o.fg.jd });
    this.fgWin.real++;
    if (mode === 'ahead') { this.show(color); this.pend = { make: 1.5 }; return 'real'; }
    if (fg.make(.5)) { this.show(fg.output); this.pend = { show: color, keep: true }; return 'made'; }
    this.show(color); this.pend = { keep: true }; return 'real';
  }
  /** The refresh after a real frame: shows what frame generation planned for it. Returns what it showed ('real' | 'made'), or false. */
  between() {
    const p = this.pend; if (!p) return false;
    this.pend = null;
    let shown = false;
    if (p.show) { this.show(p.show); shown = 'real'; }
    if (p.keep) this.fg.keep();
    if (p.make && this.fg.make(p.make)) { this.show(this.fg.output); shown = 'made'; }
    return shown;
  }
  /** How often, out of the last real frames, the refresh between them didn't come (0..1), then starts counting again. */
  missRate() { const w = this.fgWin, m = w.real ? w.missed / w.real : 0; w.real = w.missed = 0; return m; }
  // a picture onto the screen (already tone mapped and in sRGB), with the last touches (AR: as it is, see-through)
  show(tex) {
    if (!this.showQ) {
      const m = new NodeMaterial(), T = this.showT = texture(tex), U = this.U; m.name = 'Frame gen show';
      m.fragmentNode = this.clear ? T.sample(screenUV) : Fn(() => vec4(touches(U, T.sample(screenUV).rgb, U.gt, U.gk), 1))();
      this.showQ = new QuadMesh(m);
    }
    this.showT.value = tex; this.U.gt.value = (this.U.gt.value + .37) % 10;
    const r = this.r, tm = r.toneMapping, cs = r.outputColorSpace; r.toneMapping = NoToneMapping; r.outputColorSpace = LinearSRGBColorSpace;
    try { r.setRenderTarget(null); this.showQ.render(r); } finally { r.toneMapping = tm; r.outputColorSpace = cs; }
  }
  dispose() {
    this.aoN?.dispose?.(); this.dnN?.dispose?.(); this.bloomN?.dispose?.(); this.s2?.dispose(); this.s1?.dispose(); this.dofT?.renderTarget?.dispose(); this.shM?.renderTarget?.dispose(); this.shB?.renderTarget?.dispose(); this.pp.dispose?.();
    this.fg?.dispose(); this.fgRT?.dispose(); this.showQ?.material.dispose(); this.fg = this.fgRT = this.showQ = null; this.pend = null;
  }
}
export { gpuSparks } from './particles-gpu.js';
