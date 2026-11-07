// Next Gen 3D kit: modern HD rendering for era:'nextgen' games (see docs/nextgen-3d.md).
//
// Where the Classic Console kit (toon3d.js) is flat cel shading with ink lines, this one is the
// current-generation look: physically based materials (roughness, metalness, normal maps),
// image-based reflections, real-time shadows, HDR lighting with bloom, ambient occlusion,
// MSAA, filmic tone mapping and a colour grade (vignette, grain, lens fringing), plus a GPU
// particle system for sparks, smoke and embers.
//
// One shared WebGL renderer and one post-processing chain draw every Next Gen game (phones only
// allow a few WebGL contexts). A game owns an HDView: a three.js scene + perspective camera. In
// draw(c) it moves things, then calls v.render(c, W, H), which renders the 3D frame into the
// slide's 2D canvas; the game then draws its 2D HUD on top.
//
// Performance: the kit watches frame times and adapts. It first lowers the render resolution
// (down to 55%), then drops a quality tier (ultra: AO + MSAA + 1024 shadows -> high -> medium ->
// low: no shadows, no AO, half-size bloom). Tiers are listed in TIERS below.
import {
  WebGLRenderer, Scene, Color, FogExp2, PerspectiveCamera, HemisphereLight, PointLight, SpotLight,
  MeshStandardMaterial, MeshPhysicalMaterial, ShaderMaterial, BufferGeometry, BufferAttribute, Points, AdditiveBlending, NormalBlending,
  CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, PCFSoftShadowMap, ACESFilmicToneMapping, HalfFloatType,
  WebGLRenderTarget, Vector2, Vector3, PMREMGenerator, LinearMipmapLinearFilter,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export * as THREE from 'three';

const rbs = new Map();
/** A bevelled box w x h x d with corner radius r (cached): real highlights on every edge. */
export function rbox(w, h, d, r = Math.min(w, h, d) * .2) {
  const k = [w, h, d, r].join();
  if (!rbs.has(k)) rbs.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * .999));
  return rbs.get(k);
}

/* ---------- quality tiers ---------- */
// px: most pixels rendered per frame before scaling up; shadow: shadow map size (0 = off);
// lights: how many nearby lamps get a real light (the rest just glow); ao: screen-space ambient
// occlusion; msaa: multisample count; bloom: bloom resolution scale.
export const TIERS = [
  { name: 'low', px: .45e6, shadow: 0, lights: 2, ao: false, msaa: 0, bloom: .5 },
  { name: 'medium', px: .75e6, shadow: 512, lights: 3, ao: false, msaa: 0, bloom: .5 },
  { name: 'high', px: 1.1e6, shadow: 1024, lights: 4, ao: false, msaa: 4, bloom: .5 },
  { name: 'ultra', px: 1.7e6, shadow: 1024, lights: 4, ao: true, msaa: 4, bloom: .5 },
];
// Phones start on high and can climb to ultra if they keep up; desktops start on ultra.
const touchy = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const Q = { tier: touchy ? 2 : 3, res: 1, avg: 16, n: 0, lastT: 0, calm: 0, force: null };
/** Current quality: { tier, name, res }. Set HD.force = 0..3 to pin a tier (tests, screenshots). */
export const HD = {
  get tier() { return Q.force ?? Q.tier; }, get name() { return TIERS[this.tier].name; }, get res() { return Q.force != null ? 1 : Q.res; },
  set force(t) { Q.force = t; }, get force() { return Q.force; },
};
const tier = () => TIERS[HD.tier];
if (typeof window !== 'undefined') window.__hd = HD;   // test hook: __hd.force = 3 pins ultra

/* ---------- shared renderer + post chain ---------- */
let R = null, broken = false, comp = null, P = {}, envTex = null, compKey = '';
function renderer() {
  if (R || broken) return R;
  try {
    const cv = document.createElement('canvas');
    R = new WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance', stencil: false });
    R.setPixelRatio(1); R.outputColorSpace = SRGBColorSpace;
    R.toneMapping = ACESFilmicToneMapping; R.toneMappingExposure = 1;
    R.shadowMap.enabled = true; R.shadowMap.type = PCFSoftShadowMap;
    cv.addEventListener('webglcontextlost', e => e.preventDefault());
    const pm = new PMREMGenerator(R); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  } catch (e) { broken = true; R = null; }
  return R;
}
/** True if this device can draw Next Gen games. */
export const hasHD = () => !!renderer();

// Colour grade, after tone mapping: vignette, fine film grain, a touch of lens fringing at the
// edges, and a hurt tint the game can pulse (v.hurt = 0..1).
const GRADE = {
  uniforms: { tDiffuse: { value: null }, t: { value: 0 }, hurt: { value: 0 }, vig: { value: .32 }, px: { value: new Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float t, hurt, vig; uniform vec2 px; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - .5; float r2 = dot(d, d);
      vec2 off = d * r2 * .012;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= 1. - vig * smoothstep(.12, .62, r2 * 1.6);
      col += (h(vUv / px + t) - .5) * .035;
      col = mix(col, col * vec3(1.25, .45, .4) + vec3(.12, 0., 0.), hurt * smoothstep(.04, .4, r2));
      gl_FragColor = vec4(col, 1.);
    }`,
};
function chain(r, w, h) {
  const T = tier(), key = [T.msaa].join();
  if (!comp || compKey !== key) {
    comp?.dispose(); compKey = key;
    const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa });
    comp = new EffectComposer(r, rt);
    P.render = new RenderPass(new Scene(), new PerspectiveCamera());
    P.ao = new GTAOPass(new Scene(), new PerspectiveCamera(), w, h);
    P.ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); P.ao.blendIntensity = .9;
    P.bloom = new UnrealBloomPass(new Vector2(w, h), .7, .5, .82);
    P.out = new OutputPass();
    P.grade = new ShaderPass(GRADE);
    for (const p of [P.render, P.ao, P.bloom, P.out, P.grade]) comp.addPass(p);
    comp.setSize(w, h); comp.cw = w; comp.ch = h;
  }
  return comp;
}

/* ---------- materials and procedural textures ---------- */
/**
 * A PBR material. col: base colour; rough/metal 0..1; glow: emissive strength (values above 1
 * bloom); tex: a surface() set; rep: texture repeat [u, v]. Extra options pass to three.js.
 */
export function pbr(col = '#ffffff', { rough = .6, metal = 0, glow = 0, glowCol, tex, rep, clear = 0, ...o } = {}) {
  const M = clear || o.sheen ? MeshPhysicalMaterial : MeshStandardMaterial;
  const m = new M({ color: col, roughness: rough, metalness: metal, ...o });
  if (clear) { m.clearcoat = clear; m.clearcoatRoughness = .15; }
  if (glow) { m.emissive = new Color(glowCol || col); m.emissiveIntensity = glow; }
  if (tex) {
    const t = rep ? tex.repeat(rep[0], rep[1]) : tex;
    m.map = t.map; m.normalMap = t.normal; m.roughnessMap = t.rough; if (t.metal) { m.metalnessMap = t.metal; }
    m.normalScale.set(t.ns ?? 1, t.ns ?? 1);
  }
  return m;
}
/**
 * Make a tiling surface texture set in code (no image files). paint(g) draws three layers on
 * size x size canvases: g.col (colour), g.h (height: white = raised), g.r (roughness: white =
 * rough). The kit turns the height layer into a normal map. Returns { map, normal, rough,
 * repeat(u, v) } where repeat() returns a copy with that tiling.
 */
export function surface(size, paint, { strength = 2.5 } = {}) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const C = mk(), Hc = mk(), Rc = mk(), g = { col: C.getContext('2d'), h: Hc.getContext('2d'), r: Rc.getContext('2d'), size };
  g.h.fillStyle = '#808080'; g.h.fillRect(0, 0, size, size); g.r.fillStyle = '#999'; g.r.fillRect(0, 0, size, size);
  paint(g);
  // height -> tangent-space normal map (wrapping Sobel)
  const hd = g.h.getImageData(0, 0, size, size).data, N = mk(), nc = N.getContext('2d'), out = nc.createImageData(size, size);
  const at = (x, y) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; out.data[i] = (nx * .5 + .5) * 255; out.data[i + 1] = (ny * .5 + .5) * 255; out.data[i + 2] = (nz * .5 + .5) * 255; out.data[i + 3] = 255;
  }
  nc.putImageData(out, 0, 0);
  const tx = (cv, srgb) => { const t = new CanvasTexture(cv); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = 4; t.minFilter = LinearMipmapLinearFilter; return t; };
  const base = { map: tx(C, true), normal: tx(N), rough: tx(Rc) };
  const set = (u, v, b = base) => {
    if (u === 1 && v === 1) return { ...b, repeat: set };
    const cl = {}; for (const k of ['map', 'normal', 'rough']) { cl[k] = b[k].clone(); cl[k].repeat.set(u, v); cl[k].needsUpdate = true; }
    return { ...cl, repeat: set };
  };
  return { ...base, repeat: set };
}
/** Speckle noise helper for surface painters: n dots of colour col, radius up to r. */
export function speckle(ctx, size, n, col, r = 1.5, a = .2) {
  ctx.save(); ctx.fillStyle = col;
  for (let i = 0; i < n; i++) { ctx.globalAlpha = Math.random() * a; ctx.beginPath(); ctx.arc(Math.random() * size, Math.random() * size, Math.random() * r + .3, 0, 7); ctx.fill(); }
  ctx.restore();
}

/* ---------- particles ---------- */
const PV = `attribute float size; attribute vec4 tint; varying vec4 vT; uniform float scale;
  void main(){ vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = size * scale / max(.05, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PF = `varying vec4 vT; uniform float soft; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard;
  float a = soft > .5 ? (1. - r) * (1. - r) : smoothstep(1., .3, r); gl_FragColor = vec4(vT.rgb, vT.a * a); }`;
/**
 * A pool of camera-facing soft particles, drawn in view v (new Particles(v, ...)). additive: true for sparks / fire / glints (colours
 * above 1 bloom), false for smoke and dust. p.emit({ x, y, z, vx, vy, vz, life, size, grow,
 * col: [r, g, b], a, drag, grav }) then p.update(dt) once per frame.
 */
export class Particles {
  constructor(view, { max = 300, additive = true } = {}) {
    this.max = max; this.list = [];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(max), 1));
    g.setAttribute('tint', new BufferAttribute(new Float32Array(max * 4), 4));
    this.mat = new ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: additive ? 0 : 1 } } });
    this.pts = new Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; view.scene.add(this.pts); view.parts.push(this);
  }
  emit(o) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ vx: 0, vy: 0, vz: 0, life: 1, size: .1, grow: 0, col: [1, 1, 1], a: 1, drag: 0, grav: 0, ...o, t: 0 }); }
  clear() { this.list.length = 0; }
  update(dt) {
    const L = this.list, g = this.pts.geometry, P = g.attributes.position.array, S = g.attributes.size.array, T = g.attributes.tint.array;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.t += dt; if (p.t >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -.35; p.vx *= .6; p.vz *= .6; }
      const f = p.t / p.life;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; S[n] = p.size * (1 + p.grow * f);
      T[n * 4] = p.col[0]; T[n * 4 + 1] = p.col[1]; T[n * 4 + 2] = p.col[2]; T[n * 4 + 3] = p.a * (p.fadeIn ? Math.min(1, f * 6) : 1) * (1 - f) ** (p.ease ?? 1);
      L[n++] = p;
    }
    L.length = n; g.setDrawRange(0, n);
    for (const a of ['position', 'size', 'tint']) g.attributes[a].needsUpdate = true;
  }
}

/* ---------- view ---------- */
export class HDView {
  /**
   * bg: background colour; fog: density of exponential fog (0 = none); env: strength of the
   * image-based reflections; sky/ground/amb: hemisphere fill light.
   */
  constructor({ bg = '#0a0c10', fog = 0, env = .35, sky = '#9ab0d0', ground = '#2a2420', amb = .25, fov = 70 } = {}) {
    this.scene = new Scene(); this.scene.background = new Color(bg);
    if (fog) this.scene.fog = new FogExp2(bg, fog);
    this.envI = env; this.hemi = new HemisphereLight(sky, ground, amb); this.scene.add(this.hemi);
    this.cam = new PerspectiveCamera(fov, 1, .05, 120); this.scene.add(this.cam);
    this.hurt = 0; this.t = 0; this.W = 240; this.H = 320; this.exposure = 1; this.bloom = .7;
    this.lamps = []; this.tierSeen = -1; this.parts = [];
  }
  /**
   * A pool of real point lights placed each frame at the nearest of many lamp spots (the far ones
   * only glow). Call v.lampLights(maxDistance) once, then v.placeLamps(spots, x, y, z) per frame
   * with spots = [{ x, y, z, col, i, flick }].
   */
  lampLights(dist = 7) {
    for (let i = 0; i < 4; i++) { const l = new PointLight('#ffd8a0', 0, dist, 1.6); this.scene.add(l); this.lamps.push(l); }
    return this;
  }
  placeLamps(spots, x, y, z, t = 0) {
    const n = tier().lights, near = spots.map(s => [s, (s.x - x) ** 2 + (s.z - z) ** 2 + (s.y - y) ** 2]).sort((a, b) => a[1] - b[1]);
    this.lamps.forEach((l, i) => {
      const s = near[i]?.[0]; l.visible = i < n && !!s;
      if (!l.visible) return;
      l.position.set(s.x, s.y, s.z); l.color.set(s.col || '#ffd8a0');
      const fl = s.flick ? (Math.sin(t * 31 + s.x * 7) > .6 || Math.sin(t * 3.1 + s.z) > .95 ? .25 : 1) : 1;
      // fade the furthest light in/out so swapping which lamps are lit never pops
      const fade = i === n - 1 && near[n] ? Math.min(1, (near[n][1] - near[i][1]) * .6) : 1;
      l.intensity = (s.i ?? 6) * fl * fade; s.lit = fl;
    });
  }
  /** Size the camera to the game's W x H (call from draw before render). */
  fit(W, H) { if (W !== this.W || H !== this.H || this.cam.aspect !== W / H) { this.W = W; this.H = H; this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); } return this; }
  /** Logical screen position of a world point: [x, y, depth] (depth > 1 = behind the camera). */
  toScreen(x, y, z) { const p = new Vector3(x, y, z).project(this.cam); return [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H, p.z]; }
  /** Called when the quality tier changes: let the game switch shadows on lights it owns. */
  onTier(fn) { this.tierFn = fn; return this; }

  /** Render the frame into 2D canvas c (logical units w x h), with post-processing. */
  render(c, w = this.W, h = this.H) {
    this.fit(w, h);
    const r = renderer();
    if (!r) { c.fillStyle = '#' + this.scene.background.getHexString(); c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('This device cannot show 3D', w / 2, h / 2); return; }
    // adaptive quality: first resolution, then tier
    const now = performance.now(), gap = now - (Q.lastT || now); Q.lastT = now;
    if (gap > 0 && gap < 200) {
      Q.avg = Q.avg * .93 + gap * .07;
      if (++Q.n % 20 === 0 && Q.force == null) {
        if (Q.avg > 21) { Q.calm = 0; Q.res *= .9; if (Q.res < .55) { if (Q.tier > 0) { Q.tier--; Q.res = .85; } else Q.res = .55; } }
        else if (Q.avg < 17.5) { Q.res = Math.min(1, Q.res * 1.04); if (Q.res >= 1 && ++Q.calm > 25 && Q.tier < TIERS.length - 1 && Q.avg < 14) { Q.tier++; Q.res = .8; Q.calm = 0; } }
      }
    }
    const T = tier();
    if (this.tierSeen !== HD.tier) { this.tierSeen = HD.tier; this.tierFn?.(T); }
    let pw = c.canvas.width, ph = c.canvas.height; const q = Math.min(1, Math.sqrt(T.px / (pw * ph))) * HD.res;
    pw = Math.max(16, Math.round(pw * q)); ph = Math.max(16, Math.round(ph * q));
    const cv = r.domElement; if (cv.width !== pw || cv.height !== ph) r.setSize(pw, ph, false);
    const cp = chain(r, pw, ph); if (cp.cw !== pw || cp.ch !== ph) { cp.setSize(pw, ph); cp.cw = pw; cp.ch = ph; }
    r.shadowMap.enabled = T.shadow > 0;
    this.scene.environment = envTex; this.scene.environmentIntensity = this.envI;
    r.toneMappingExposure = this.exposure;
    P.render.scene = P.ao.scene = this.scene; P.render.camera = P.ao.camera = this.cam;
    for (const p of this.parts) p.mat.uniforms.scale.value = ph / (2 * Math.tan(this.cam.fov * Math.PI / 360));
    P.ao.enabled = T.ao; P.bloom.strength = this.bloom;
    P.bloom.resolution.set(pw * T.bloom, ph * T.bloom);
    this.t += 1 / 60; P.grade.uniforms.t.value = this.t % 10; P.grade.uniforms.hurt.value = this.hurt; P.grade.uniforms.px.value.set(1 / pw, 1 / ph);
    cp.render();
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, pw, ph, 0, 0, w, h); c.restore();
  }
}

/** A shadow-casting spotlight (torch, searchlight) whose shadow follows the quality tier. */
export function spot(col = '#fff2e0', i = 30, dist = 16, angle = .5) {
  const s = new SpotLight(col, i, dist, angle, .55, 1.6);
  s.castShadow = true; s.shadow.bias = -.0004; s.shadow.normalBias = .02; s.shadow.camera.near = .2; s.shadow.radius = 3;
  s.setTier = T => { s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow) { s.shadow.mapSize.set(T.shadow, T.shadow); s.shadow.map?.dispose(); s.shadow.map = null; } };
  return s;
}
