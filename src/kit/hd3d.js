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
// (down to 55%), then drops a quality tier (ultra: full-size AO + MSAA + reflections -> high:
// half-size AO + MSAA -> medium -> low: no shadows, no AO). Tiers are listed in TIERS below. The starting tier and frame rate come
// from the phone's class (src/kit/speed.js: a top phone starts on ultra at 120 fps), and where a game
// settled is remembered for its next round.
//
// Speed tricks that keep the picture the same:
//  - the 3D canvas is shown directly on the playing card, under the card's 2D canvas (which keeps
//    the HUD), instead of being copied into it every frame. When the 3D canvas moves to another
//    card, the last frame is baked into the old card so it keeps its picture.
//  - bloom, tone mapping and the colour grade run as one final full-screen pass, and the bloom is a
//    small down/up-sampling chain at half resolution and below.
//  - shadow maps are only redrawn when something that casts a shadow (or a light) has moved.
import {
  Scene, Color, FogExp2, PerspectiveCamera, HemisphereLight, PointLight, SpotLight, DirectionalLight,
  MeshStandardMaterial, MeshPhysicalMaterial, ShaderMaterial, BufferGeometry, BufferAttribute, Points, AdditiveBlending, NormalBlending,
  CanvasTexture, RepeatWrapping, SRGBColorSpace, NoColorSpace, PCFShadowMap, ACESFilmicToneMapping, HalfFloatType,
  WebGLRenderTarget, Vector2, Vector3, PMREMGenerator, LinearMipmapLinearFilter, Mesh, BoxGeometry, LinearFilter, AdditiveBlending as ADD,
  OrthographicCamera, PlaneGeometry, MeshBasicMaterial, MeshDepthMaterial, Group, Vector4, DataTexture, RGBAFormat, ShaderChunk,
  LightProbe, CubeCamera, WebGLCubeRenderTarget, Euler, Matrix4, Quaternion, DepthTexture, WebGLCoordinateSystem, Box3,
} from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import { LightProbeGridWebGL } from 'three/examples/jsm/lighting/LightProbeGridWebGL.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SGSR } from './sgsr.js';
import { SGSR2, SgsrFrame } from './sgsr2.js';
import { lookPatch, looksOf, lookSpec } from './looks.js';
import { copyFrame, webgpu, setGpuPick, prepareGPU } from './gpu.js';
import { makeRenderer } from './renderer.js';
import { Occlusion } from './occlusion.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { speed, phoneClass, fpsFor, stepDown, stepUp, settle, settledFor, frameGenFor, frameGenFailed, frameGenReady, frameGenPace, frameGenSteps, frameGenSteady, fgSaving, screenHz } from './speed.js';

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
// lights: how many nearby lamps get a real light (the rest just glow); ssr: screen-space reflections on
// the surfaces a game marks with v.reflect(); contact: soft contact shadows size; ao: screen-space ambient
// occlusion, worked out at this fraction of the picture's size (0 = off; half size costs a quarter); msaa: multisample count (0 = a cheap edge smoothing in the final pass instead);
// bloom: bloom resolution scale. 2x MSAA (not 4x) costs phone GPUs far less memory traffic, and the
// time saved goes into more pixels.
export const TIERS = [
  { name: 'low', px: .5e6, shadow: 0, lights: 2, ao: 0, msaa: 0, bloom: .5, ssr: false, contact: 0 },
  { name: 'medium', px: .85e6, shadow: 512, lights: 3, ao: 0, msaa: 0, bloom: .5, ssr: false, contact: 128 },
  { name: 'high', px: 1.3e6, shadow: 1024, lights: 4, ao: .5, msaa: 2, bloom: .5, ssr: false, contact: 256 },
  { name: 'ultra', px: 2e6, shadow: 1024, lights: 4, ao: 1, msaa: 2, bloom: .5, ssr: true, contact: 256 },
];
// Where a phone starts: top phones (Fold 8, recent iPhone Pro) on ultra, others on high or medium.
const START = { top: 3, mid: 2, low: 1 };
// Resolution moves in a few fixed steps (each step reallocates the render targets, so it must be
// rare): drop a step after two slow windows of ~45 frames, climb back after ~6 s at full speed, and
// never climb back above a step that already proved too slow (for 30 s, longer each time a climb fails).
// A game starts at the tier and step it settled on last time. Tiers change the same way, but only
// between rounds (applyTier).
// The frame budget follows the game's frame rate (8.3 ms at 120 fps, 16.7 at 60, 33 at 30). At 120
// fps a struggling game first gives up a little resolution, then drops to 60 fps at full resolution
// (keeping the picture); at the lowest tier and resolution it can drop to 30.
const LEVELS = [1, .85, .7, .55];
// Most pixels in the final picture once a game has stepped down (about a phone screen's worth; see draw()).
const OUT_PX = 2.4e6;
// How many more pixels the 3D gets while frame generation makes every other refresh (see draw()).
const FG_PX = 1.6;
// A climb that turns out too slow again soon after doubles how long the step it fell back to holds
// (30 s, 1, 2, 4 min), so a game that's on the edge doesn't keep stuttering every half a minute.
const HOLD = 30000, HOLD_MAX = 240000;
const Q = { tier: 2, lvl: 0, sum: 0, cnt: 0, slow: 0, fast: 0, lastT: 0, ceil: 0, ceilT: 0, tierCeil: 3, force: null, game: undefined, easy: 0, fpsT: 0, hold: HOLD, upT: -1e9, fpsHold: 60000, fpsUpT: -1e9 };
// a new game is on screen: start from where it settled last time, or from the phone's class
// (and the resolution step it settled on, so a round doesn't start too sharp, stutter and step down again)
function startGame(def) {
  Q.game = def; const s = settledFor(def?.id);
  Q.tier = s?.tier ?? START[phoneClass()] ?? 2; Q.lvl = Math.min(LEVELS.length - 1, s?.lvl ?? 0); Q.ceil = Q.lvl; Q.ceilT = performance.now(); Q.tierCeil = 3;
  Q.sum = Q.cnt = Q.slow = Q.fast = Q.easy = 0; Q.lastT = 0; Q.want = null; Q.hold = HOLD; Q.upT = -1e9; Q.fpsHold = 60000;
}
function adapt(gap) {
  if (Q.force != null || !(gap > 0 && gap < 100)) return;
  Q.sum += gap; if (++Q.cnt < 45) return;
  const a = Q.sum / Q.cnt, now = performance.now(), fps = Q.game ? fpsFor(Q.game) : 60, budget = 1000 / fps; Q.sum = Q.cnt = 0;
  if (now - Q.ceilT > Q.hold) { Q.ceil = 0; Q.tierCeil = 3; }
  const tier0 = Q.tier, lvl0 = Q.lvl;
  if (a > budget * 1.26) {
    Q.fast = 0; Q.easy = 0; if (++Q.slow < 2) return; Q.slow = 0; Q.ceilT = now;
    if (now - Q.upT < 20000) Q.hold = Math.min(HOLD_MAX, Q.hold * 2);   // the last climb didn't hold
    if (fps > 60 && Q.lvl >= 1 && stepDown(Q.game)) { Q.lvl = 0; Q.ceil = 0; Q.fpsT = now; if (now - Q.fpsUpT < 20000) Q.fpsHold = Math.min(8 * 60000, Q.fpsHold * 2); }
    else if (Q.lvl < LEVELS.length - 1) { Q.lvl++; Q.ceil = Q.lvl; }
    else if (Q.tier > 0) { if (Q.want == null) { Q.tierCeil = Q.tier - 1; Q.want = Q.tier - 1; } }
    else if (stepDown(Q.game)) { Q.lvl = 1; Q.fpsT = now; }
  } else if (a < budget * 1.044) {
    Q.slow = 0; if (++Q.fast < 8) return; Q.fast = 0;
    if (Q.lvl > Q.ceil) { Q.lvl--; Q.upT = now; }
    else if (Q.lvl === 0 && Q.want == null && Q.tier < Math.min(Q.tierCeil, TIERS.length - 1)) { Q.want = Q.tier + 1; Q.upT = now; }
    // a long spell of easy frames at the top tier, a while after stepping the frame rate down: try one notch up
    else if (Q.lvl === 0 && Q.tier === TIERS.length - 1 && ++Q.easy >= 3 && now - Q.fpsT > Q.fpsHold && stepUp(Q.game)) { Q.easy = 0; Q.fpsT = now; Q.fpsUpT = now; }
  } else { Q.slow = 0; Q.fast = 0; }
  if (Q.tier !== tier0 || Q.lvl !== lvl0) settle(Q.game?.id, { tier: Q.tier, lvl: Q.lvl });
}
// A new tier changes which shaders every material needs (shadows, lights, edge smoothing), so three.js
// rebuilds them all: a long stall. So a tier change waits until no round is being played (the
// game-over screen, the next card) and the round carries on at its lowest resolution until then.
function applyTier() {
  if (Q.want == null || speed.playing()) return;
  const down = Q.want < Q.tier; Q.tier = Q.want; Q.want = null; Q.lvl = 1; Q.ceil = down ? 1 : 0; Q.sum = Q.cnt = Q.slow = Q.fast = 0;
  settle(Q.game?.id, { tier: Q.tier, lvl: Q.lvl });
}
/** Current quality: { tier, name, res }. Set HD.force = 0..3 to pin a tier (tests, screenshots). */
export const HD = {
  get tier() { return Q.force ?? Q.tier; }, get name() { return TIERS[this.tier].name; }, get res() { return Q.force != null ? 1 : LEVELS[Q.lvl]; },
  set force(t) { Q.force = t; }, get force() { return Q.force; },
  /** Last frame: draw calls, triangles, milliseconds spent in render() on the CPU, and whether the shadows were redrawn. */
  info: { calls: 0, tris: 0, cpu: 0, shadows: false, upscaled: false, backend: 'webgl', webgl: '', framegen: false, fgMs: 0, fgSteps: 0, still: false, rw: 0, rh: 0, ow: 0, oh: 0 },
  /** Things needing a shader not built yet wait (hidden) at most this long while it builds in the background (v.holdNew); hold = false: build it in the frame instead. */
  holdMs: 500, hold: true,
  /** Upscale when the 3D is drawn below the screen's size (false: plain stretch). */
  upscale: true,
  /** Which upscaler: 'sgsr2' (Snapdragon GSR 2, temporal; Next Gen without reflections) or 'sgsr1' (one frame). AR and the rest use SGSR 1. */
  upscaler: 'sgsr2',
  /** Tests: draw the 3D at this fraction of the screen's size (null: the tier and frame rate decide). */
  scale: null,
  /** Tests: frame generation on ('blend' | 'ahead') whatever the screen and settings, or null (speed.js decides). Needs WebGPU and direct. */
  set frameGen(v) { speed.forceFrameGen = v || null; }, get frameGen() { return speed.forceFrameGen; },
  /** Tests and the frame lab (src/framelab.js): fgTap(kind, canvas, when) runs after each frame frame generation puts on the screen ('real' | 'made'; when: 'frame' | 'between'), while the canvas still holds it. */
  fgTap: null,
  /** A gap between real frames longer than this (ms) counts as a pause: frame generation starts afresh. Tests on slow software GPUs raise it. */
  fgGap: 250,
  /** Tests: run the refresh between now (where the test browser is too slow to have one), as the feed does on a refresh it skips. */
  between() { const b = speed.between; speed.between = null; b?.(); },
  /** Show the 3D canvas directly on the card (false: copy each frame into the card's canvas, as tests and screenshots need). */
  direct: typeof navigator === 'undefined' || !navigator.webdriver,
};
const tier = () => TIERS[HD.tier];
// test hook: __hd.force = 3 pins ultra. Dev and test builds and test browsers only, not the store apps.
if (typeof window !== 'undefined' && (import.meta.env?.MODE !== 'production' || navigator.webdriver)) { window.__hd = HD; window.__gpu = { pick: setGpuPick, ready: prepareGPU }; }

/* ---------- shared renderer + post chain ---------- */
let R = null, broken = false, comp = null, P = {}, envTex = null, compKey = '', pmGen = null;
function renderer() {
  if (R || broken) return R;
  try {
    const cv = document.createElement('canvas');
    R = makeRenderer({ canvas: cv, alpha: true, antialias: false, preserveDrawingBuffer: false, stencil: false });
    R.setPixelRatio(1); R.outputColorSpace = SRGBColorSpace;
    R.toneMapping = ACESFilmicToneMapping; R.toneMappingExposure = 1;
    R.shadowMap.enabled = true; R.shadowMap.type = PCFShadowMap; R.shadowMap.autoUpdate = false;   // redrawn only when something moved
    const pm = new PMREMGenerator(R); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  } catch (e) { broken = true; R = null; }
  return R;
}
/** True if this device can draw Next Gen games. */
export const hasHD = () => !!renderer();
/** The shared WebGL renderer, for kit bakes (outdoors impostor()); null without 3D. */
export const bakeRenderer = () => renderer();

// The final pass: bloom, tone mapping, sRGB and the colour grade in one full-screen pass (they used
// to be four: bloom blend, output, grade, plus bloom's own full-size copy). The grade is a vignette,
// fine film grain, a touch of lens fringing at the edges, and a hurt tint the game can pulse
// (v.hurt = 0..1). With no MSAA the same pass smooths jagged edges (a light FXAA).
//
// Bloom is a small chain: the bright parts are picked out into a half-size buffer, shrunk four more
// times, then grown back up, each step adding a softer copy. That's 9 tiny passes, where the old
// bloom took 13 bigger ones.
const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const qmat = (fs, uniforms, o = {}) => new ShaderMaterial({ uniforms, vertexShader: QV, fragmentShader: fs, depthTest: false, depthWrite: false, ...o });
// bright parts only (anything brighter than the threshold keeps its full colour, fading in just under it), 4 taps
const BRIGHT = `uniform sampler2D tDiffuse; uniform vec2 px; uniform float thr; varying vec2 vUv;
  vec3 pick(vec2 o){ vec3 c = texture2D(tDiffuse, vUv + o * px).rgb; float l = dot(c, vec3(.2126, .7152, .0722));
    return c * smoothstep(thr - .05, thr + .05, l); }
  void main(){ vec3 c = pick(vec2(-1., -1.)) + pick(vec2(1., -1.)) + pick(vec2(-1., 1.)) + pick(vec2(1., 1.)); gl_FragColor = vec4(c * .25, 1.); }`;
const DOWN = `uniform sampler2D tDiffuse; uniform vec2 px; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 4.;
    c += texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb + texture2D(tDiffuse, vUv + px).rgb;
    gl_FragColor = vec4(c / 8., 1.); }`;
const UP = `uniform sampler2D tDiffuse; uniform vec2 px; uniform float k; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv + vec2(-2. * px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(2. * px.x, 0.)).rgb + texture2D(tDiffuse, vUv + vec2(0., -2. * px.y)).rgb + texture2D(tDiffuse, vUv + vec2(0., 2. * px.y)).rgb;
    c += 2. * (texture2D(tDiffuse, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y)).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y)).rgb + texture2D(tDiffuse, vUv + px).rgb);
    gl_FragColor = vec4(c / 12. * k, 1.); }`;
// The final pass's effects, each a named piece of the one shader (so the pass stays a single
// full-screen draw on phones, and each piece can be ported to a WebGPU node on its own). They run
// in this order; FINAL is them joined. Uniforms: the pass's own (FinalPass below).
export const FINAL_EFFECTS = [
  { name: 'head', what: 'uniforms, the tone mapping three leaves out under SGSR, helpers', glsl: `uniform sampler2D tDiffuse, tBloom; uniform float t, hurt, vig, bloom; uniform vec2 px; varying vec2 vUv;
  uniform float gradeOn, sat, con, glare, aspect; uniform vec3 lo, hi, sunCol; uniform vec2 sunUV;
  // (three.js adds its tone mapping and sRGB helpers to every ShaderMaterial drawn to the screen; when
  // SGSR upscales after this pass, it draws into a buffer and three leaves tone mapping out, so here it is)
  #ifndef TONE_MAPPING
  uniform float toneMappingExposure;
  vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 ACESFilmicToneMapping(vec3 color){
    const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= toneMappingExposure / 0.6; color = O * RRTAndODTFit(I * color); return clamp(color, 0., 1.);
  }
  #endif
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 tex(vec2 p){ return texture2D(tDiffuse, p).rgb; }
  float luma(vec3 c){ float l = dot(c, vec3(.299, .587, .114)); return l / (1. + l); }
` },
  { name: 'main', what: 'start', glsl: `  void main(){
    vec2 d = vUv - .5; float r2 = dot(d, d);
` },
  { name: 'smooth', what: 'edge smoothing (FXAA, no MSAA) or lens fringing', glsl: `  #ifdef FXAA
    // light edge smoothing: find the edge direction from the four diagonal neighbours, blur along it
    vec3 cM = tex(vUv); float lM = luma(cM), lNW = luma(tex(vUv + vec2(-1., -1.) * px)), lNE = luma(tex(vUv + vec2(1., -1.) * px)),
      lSW = luma(tex(vUv + vec2(-1., 1.) * px)), lSE = luma(tex(vUv + vec2(1., 1.) * px));
    // (lMin / lMax, not lo / hi: those names are the grade's tints below)
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec3 col = cM;
    if (lMax - lMin > max(.04, lMax * .125)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float rcp = 1. / (min(abs(dir.x), abs(dir.y)) + max((lNW + lNE + lSW + lSE) * .03125, .0078125));
      dir = clamp(dir * rcp, -8., 8.) * px;
      vec3 a = .5 * (tex(vUv + dir * (1. / 3. - .5)) + tex(vUv + dir * (2. / 3. - .5)));
      vec3 b = a * .5 + .25 * (tex(vUv - dir * .5) + tex(vUv + dir * .5));
      float lb = luma(b); col = lb < lMin || lb > lMax ? a : b;
    }
  #else
    vec2 off = d * r2 * .012;
    vec3 col = vec3(tex(vUv + off).r, tex(vUv).g, tex(vUv - off).b);
  #endif
` },
  { name: 'bloom', what: 'bloom', glsl: `    col += texture2D(tBloom, vUv).rgb * bloom;
` },
  { name: 'grade', what: 'colour grade (v.grade)', glsl: `    // the game's colour grade (v.grade): saturation, contrast round mid grey, a tint for the shadows and one for the highlights
    if (gradeOn > .5) {
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = max(mix(vec3(l), col, sat), 0.);
      col = pow(col / .18 + 1e-5, vec3(con)) * .18;
      col *= mix(lo, hi, smoothstep(.15, .85, clamp(log2(l / .18 + 1e-4) * .16 + .5, 0., 1.)));
    }
` },
  { name: 'glare', what: 'sun glare (v.glare)', glsl: `    // sun glare (v.glare): a soft bloom round the sun and two faint lens ghosts, only while the sun itself shows
    if (glare > 0.) {
      vec3 s0 = texture2D(tDiffuse, sunUV).rgb + texture2D(tDiffuse, sunUV + vec2(.006, 0.)).rgb + texture2D(tDiffuse, sunUV - vec2(.006, 0.)).rgb + texture2D(tDiffuse, sunUV + vec2(0., .008)).rgb + texture2D(tDiffuse, sunUV - vec2(0., .008)).rgb;
      float seen = smoothstep(1.5, 6., dot(s0, vec3(.2126, .7152, .0722)) * .2);
      vec2 q = (vUv - sunUV) * vec2(aspect, 1.), g1 = (vUv - (.5 - (sunUV - .5) * .55)) * vec2(aspect, 1.), g2 = (vUv - (.5 - (sunUV - .5) * 1.3)) * vec2(aspect, 1.);
      float gl = exp(-dot(q, q) * 14.) * .5 + exp(-length(q) * 6.) * .22 + smoothstep(.06, .045, length(g1)) * .05 + smoothstep(.1, .08, length(g2)) * .035;
      col += sunCol * gl * glare * seen;
    }
` },
  { name: 'tone', what: 'ACES tone mapping and sRGB', glsl: `    col = ACESFilmicToneMapping(col);
    col = sRGBTransferOETF(vec4(col, 1.)).rgb;
` },
  { name: 'vignette', what: 'vignette', glsl: `    col *= 1. - vig * smoothstep(.12, .62, r2 * 1.6);
` },
  { name: 'grain', what: 'film grain', glsl: `    col += (h(vUv / px + t) - .5) * .035;
` },
  { name: 'hurt', what: 'hurt tint (v.hurt)', glsl: `    col = mix(col, col * vec3(1.25, .45, .4) + vec3(.12, 0., 0.), hurt * smoothstep(.04, .4, r2));
` },
  { name: 'out', what: 'end', glsl: `    gl_FragColor = vec4(col, 1.);
  }` },
];
const FINAL = FINAL_EFFECTS.map(e => e.glsl).join('');
const MIPS = 5;
class FinalPass extends Pass {
  constructor() {
    super(); this.needsSwap = false;
    this.bright = qmat(BRIGHT, { tDiffuse: { value: null }, px: { value: new Vector2() }, thr: { value: .82 } });
    this.down = qmat(DOWN, { tDiffuse: { value: null }, px: { value: new Vector2() } });
    this.up = qmat(UP, { tDiffuse: { value: null }, px: { value: new Vector2() }, k: { value: 1 } }, { blending: ADD });
    this.final = qmat(FINAL, { tDiffuse: { value: null }, tBloom: { value: null }, t: { value: 0 }, hurt: { value: 0 }, vig: { value: .32 }, bloom: { value: .7 }, px: { value: new Vector2(1, 1) }, toneMappingExposure: { value: 1 },
      gradeOn: { value: 0 }, sat: { value: 1 }, con: { value: 1 }, lo: { value: new Vector3(1, 1, 1) }, hi: { value: new Vector3(1, 1, 1) }, glare: { value: 0 }, sunUV: { value: new Vector2() }, sunCol: { value: new Color() }, aspect: { value: 1 } }, { defines: { SRGB_TRANSFER: '' } });
    this.quad = new FullScreenQuad(null); this.mips = []; this.scale = .5; this.w = 0; this.h = 0; this.fxaa = false; this.strength = .7;
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    const bw = Math.max(1, Math.round(w * this.scale)), bh = Math.max(1, Math.round(h * this.scale));
    if (this.mips[0] && this.mips[0].width === bw && this.mips[0].height === bh) return;
    for (const m of this.mips) m.dispose(); this.mips = [];
    for (let i = 0, x = bw, y = bh; i < MIPS && x >= 2 && y >= 2; i++, x = Math.max(1, x >> 1), y = Math.max(1, y >> 1))
      this.mips.push(new WebGLRenderTarget(x, y, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter }));
  }
  setFxaa(on) { if (this.fxaa === on) return; this.fxaa = on; if (on) this.final.defines.FXAA = ''; else delete this.final.defines.FXAA; this.final.needsUpdate = true; }
  pass(r, mat, target) { this.quad.material = mat; r.setRenderTarget(target); this.quad.render(r); }
  render(r, writeBuffer, readBuffer) {
    const M = this.mips, F = this.final.uniforms, auto = r.autoClear;
    const on = this.strength > 0 && M.length > 1;
    if (on) {
      const b = this.bright.uniforms; b.tDiffuse.value = readBuffer.texture; b.px.value.set(.5 / readBuffer.width, .5 / readBuffer.height);
      this.pass(r, this.bright, M[0]);
      for (let i = 1; i < M.length; i++) { const u = this.down.uniforms; u.tDiffuse.value = M[i - 1].texture; u.px.value.set(1 / M[i - 1].width, 1 / M[i - 1].height); this.pass(r, this.down, M[i]); }
      r.autoClear = false;   // grow back up, adding each softer level onto the sharper one
      for (let i = M.length - 1; i > 0; i--) { const u = this.up.uniforms; u.tDiffuse.value = M[i].texture; u.px.value.set(.5 / M[i].width, .5 / M[i].height); u.k.value = 1; this.pass(r, this.up, M[i - 1]); }
      r.autoClear = auto;
    }
    F.tDiffuse.value = readBuffer.texture; F.tBloom.value = M[0]?.texture ?? null; F.bloom.value = on ? this.strength * .8 : 0;
    F.toneMappingExposure.value = r.toneMappingExposure; F.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    this.pass(r, this.final, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { for (const m of this.mips) m.dispose(); for (const m of [this.bright, this.down, this.up, this.final]) m.dispose(); this.quad.dispose(); }
}
// Sun shafts (v.shafts): light streaming past trees, through windows and round a hill top. A small
// pass of its own (so it can be swapped for a WebGPU node later without touching the final pass):
// the bright sky near the sun is picked out at quarter size, smeared towards the sun, and added
// back on top. Where something blocks the sky, the streak has a gap: that's the shaft.
// A sky that is light, not paint (Sky physical) is far brighter round the sun: it says how bright
// (v.shaftsAt), and the mask then only picks out the sky nearer the sun, capped and scaled back, so
// the shafts look the same as with a painted sky and never white out the screen.
const SHAFT_MASK = `uniform sampler2D tDiffuse; uniform vec2 sunUV; uniform float aspect, thr, hi, cap, gain; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(.2126, .7152, .0722)); if (l > cap) { c *= cap / l; l = cap; } c *= gain;
    vec2 q = (vUv - sunUV) * vec2(aspect, 1.); float near = exp(-dot(q, q) * 3.);
    gl_FragColor = vec4(c * smoothstep(thr, hi, l) * near, 1.); }`;
const SHAFT_BLUR = `uniform sampler2D tDiffuse; uniform vec2 sunUV; uniform float decay, density; varying vec2 vUv;
  #define N 24
  void main(){ vec2 d = (vUv - sunUV) * density / float(N); vec2 p = vUv; vec3 sum = vec3(0.); float w = 1.;
    for (int i = 0; i < N; i++) { p -= d; sum += texture2D(tDiffuse, p).rgb * w; w *= decay; }
    gl_FragColor = vec4(sum / float(N) * 2.2, 1.); }`;
const SHAFT_ADD = `uniform sampler2D tDiffuse, tShaft; uniform float strength; uniform vec3 tint; varying vec2 vUv;
  void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + texture2D(tShaft, vUv).rgb * tint * strength, 1.); }`;
class ShaftsPass extends Pass {
  constructor() {
    super(); this.needsSwap = true; this.strength = 0;
    this.mask = qmat(SHAFT_MASK, { tDiffuse: { value: null }, sunUV: { value: new Vector2(.5, .5) }, aspect: { value: 1 }, thr: { value: 1.1 }, hi: { value: 2.42 }, cap: { value: 1e9 }, gain: { value: 1 } });
    this.blur = qmat(SHAFT_BLUR, { tDiffuse: { value: null }, sunUV: { value: new Vector2(.5, .5) }, decay: { value: .955 }, density: { value: .9 } });
    this.add = qmat(SHAFT_ADD, { tDiffuse: { value: null }, tShaft: { value: null }, strength: { value: 0 }, tint: { value: new Color(1, .9, .75) } });
    this.quad = new FullScreenQuad(null); this.a = null; this.b = null;
  }
  setSize(w, h) {
    const bw = Math.max(8, Math.round(w / 4)), bh = Math.max(8, Math.round(h / 4));
    if (this.a?.width === bw && this.a?.height === bh) return;
    this.a?.dispose(); this.b?.dispose();
    const o = { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter };
    this.a = new WebGLRenderTarget(bw, bh, o); this.b = new WebGLRenderTarget(bw, bh, o);
  }
  /** How bright the sky is that starts a shaft (1.1 for a painted sky; brighter skies pass more). */
  bright(at = 1.1) { const u = this.mask.uniforms, t = Math.max(1.1, at), lit = t > 1.1; u.thr.value = t; u.hi.value = lit ? t * 1.2 : t * 2.2; u.cap.value = lit ? t * 1.2 : 1e9; u.gain.value = 1.1 / t; }
  /** Where the sun is on screen (0..1) and how much it shows (0 hides the shafts). */
  aim(uv, aspect, amount, col) { this.mask.uniforms.sunUV.value.copy(uv); this.blur.uniforms.sunUV.value.copy(uv); this.mask.uniforms.aspect.value = aspect; this.amount = amount; if (col) this.add.uniforms.tint.value.copy(col); }
  pass(r, mat, target) { this.quad.material = mat; r.setRenderTarget(target); this.quad.render(r); }
  render(r, writeBuffer, readBuffer) {
    const on = this.strength * (this.amount || 0);
    if (on > 0 && this.a) {
      this.mask.uniforms.tDiffuse.value = readBuffer.texture; this.pass(r, this.mask, this.a);
      this.blur.uniforms.tDiffuse.value = this.a.texture; this.pass(r, this.blur, this.b);
    }
    const u = this.add.uniforms; u.tDiffuse.value = readBuffer.texture; u.tShaft.value = this.b?.texture ?? null; u.strength.value = on > 0 ? on : 0;
    this.pass(r, this.add, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { this.a?.dispose(); this.b?.dispose(); for (const m of [this.mask, this.blur, this.add]) m.dispose(); this.quad.dispose(); }
}

// Depth of field (v.focus = { at, range, depth, blur }): what's `at` metres away (give or take
// `range`) stays sharp, the rest goes soft, fully so `depth` x `at` metres nearer or further on; blur
// is the widest blur in pixels. A pass of its own, reading the depth picture the ambient occlusion
// already draws (so high and ultra only, and no second scene draw). See-through things (leaf cards)
// aren't in that picture: they take the depth of what's behind them.
const DOF = `uniform sampler2D tDiffuse, tDepth; uniform vec2 px; uniform vec4 lens; uniform float cn, cf; varying vec2 vUv;
  float dist(vec2 uv){ float d = texture2D(tDepth, uv).x; return d >= 1. ? 0. : cn * cf / (cf - d * (cf - cn)); }
  float coc(float z){ return z <= 0. ? 0. : clamp((abs(z - lens.x) - lens.y) / max(lens.x * lens.z, 1e-3), 0., 1.); }
  void main(){ vec3 base = texture2D(tDiffuse, vUv).rgb; float z = dist(vUv), c = coc(z);
    if (c * lens.w < .5) { gl_FragColor = vec4(base, 1.); return; }
    vec3 sum = base; float wsum = 1.;
    for (int i = 1; i < 16; i++) { float r = sqrt(float(i) / 15.), a = float(i) * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * r * c * lens.w * px; float zs = dist(vUv + o), cs = coc(zs);
      float w = zs > 0. && zs < z ? cs : 1.;   // a sharp thing in front doesn't smear over a soft background
      sum += texture2D(tDiffuse, vUv + o).rgb * w; wsum += w; }
    gl_FragColor = vec4(sum / wsum, 1.); }`;
class DofPass extends Pass {
  constructor() {
    super(); this.needsSwap = true;
    this.mat = qmat(DOF, { tDiffuse: { value: null }, tDepth: { value: null }, px: { value: new Vector2() }, lens: { value: new Vector4() }, cn: { value: .1 }, cf: { value: 1000 } });
    this.quad = new FullScreenQuad(this.mat);
  }
  render(r, writeBuffer, readBuffer) {
    const u = this.mat.uniforms; u.tDiffuse.value = readBuffer.texture; u.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

// Volumetric light (v.beams = { light, density, far, glow, strength }): light seen in the air, with the
// shadows cutting it into beams (sun through trees or a window, a lamp's cone in a dusty room). Each
// pixel steps along its view ray (`steps`, 24 by default, jittered, to the surface or `far` metres), asks the
// light's shadow map at each step whether the light reaches there, and adds up how much air is lit,
// weighted toward looking at the light (a Henyey-Greenstein phase, glow 0..0.9). Drawn at half size, then
// softened and added on top in the light's colour. The same steps as three.js's GodraysNode (from
// three-good-godrays), written out for both renderers so WebGL and WebGPU draw the same beams and
// keep working when the kit resizes a shadow map. Sun and spot lights; high and ultra (it reads the
// depth the ambient occlusion draws), and only where the light has shadows (no shadows: plain glowing air).
const VOL_MAX = 48;
const VOL = `uniform sampler2D tDepth; uniform highp sampler2DShadow tShadow; uniform mat4 shadowM, invProj, camWorld; uniform vec3 camPos, lDir, lPos;
  uniform vec4 lt; uniform float density, far, g, hasShadow, steps; varying vec2 vUv;
  // lt: kind (0 sun, 1 spot), the cone's edge and full cosines, the spot's reach
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
  void main(){
    float d = texture2D(tDepth, vUv).x;
    vec4 v = invProj * vec4(vUv * 2. - 1., d * 2. - 1., 1.); v /= v.w;
    vec3 rd = (camWorld * vec4(v.xyz, 1.)).xyz - camPos; float L = length(rd); rd /= max(L, 1e-4);
    L = d >= 1. ? far : min(L, far);
    float dt = L / steps, t = dt * ign(gl_FragCoord.xy), sum = 0.;
    for (int i = 0; i < ${VOL_MAX}; i++) { if (float(i) >= steps) break;
      vec3 p = camPos + rd * t; vec4 s = shadowM * vec4(p, 1.); s.xyz /= s.w;
      bool inside = s.w > 0. && all(greaterThanEqual(s.xyz, vec3(0.))) && all(lessThanEqual(s.xyz, vec3(1.)));
      float lit = inside && hasShadow > .5 ? texture(tShadow, s.xyz) : 1.;
      vec3 toL = -lDir;
      if (lt.x > .5) { vec3 q = p - lPos; float dl = length(q); q /= max(dl, 1e-4); toL = -q; lit *= smoothstep(lt.y, lt.z, dot(q, lDir)) / (1. + dl * dl / (lt.w * lt.w)); }
      float c = dot(rd, toL);
      sum += lit * (1. - g * g) / pow(1. + g * g - 2. * g * c, 1.5) * .25; t += dt;
    }
    gl_FragColor = vec4(1. - exp(-density * L * sum / steps), 0., 0., 1.); }`;
const VOL_ADD = `uniform sampler2D tDiffuse, tVol; uniform vec2 vpx; uniform vec3 tint; varying vec2 vUv;
  void main(){ float a = texture2D(tVol, vUv + vpx * vec2(-1, -1)).r + texture2D(tVol, vUv + vpx * vec2(1, -1)).r
    + texture2D(tVol, vUv + vpx * vec2(-1, 1)).r + texture2D(tVol, vUv + vpx * vec2(1, 1)).r;
    gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb + tint * a * .25, 1.); }`;
/** The numbers both renderers draw v.beams with this frame (into v._bm), or null when there's no light to use. */
function beamsFrame(v) {
  const b = v.beams, L = b?.light || v.sun; if (!b || !L || !(L.isDirectionalLight || L.isSpotLight)) return null;
  const m = v._bm ||= { lDir: new Vector3(), lPos: new Vector3(), lt: new Vector4(), tint: new Color(), shadowM: null, map: null, density: 0, far: 0, g: 0, steps: 24 };
  L.updateMatrixWorld(); L.target.updateMatrixWorld();
  L.getWorldPosition(m.lPos); L.target.getWorldPosition(m.lDir); m.lDir.sub(m.lPos).normalize();
  const spot = !!L.isSpotLight, a = spot ? L.angle : 0;
  m.lt.set(spot ? 1 : 0, Math.cos(a), Math.cos(a * (1 - (L.penumbra || 0)) * .999), spot ? L.distance || 20 : 1);
  m.map = L.castShadow && L.shadow?.map?.depthTexture || null; m.shadowM = L.shadow.matrix;   // (the light's own: the renderer updates it when it redraws the map this frame)
  m.tint.copy(L.color).multiplyScalar(Math.max(0, b.strength ?? 1));
  m.density = Math.max(0, b.density ?? .02); m.far = Math.max(1, b.far ?? 60); m.g = Math.min(.9, Math.max(0, b.glow ?? .5)); m.steps = Math.round(Math.min(VOL_MAX, Math.max(4, b.steps ?? 24)));
  return m;
}
class BeamsPass extends Pass {
  constructor() {
    super(); this.needsSwap = true; this.a = null;
    this.vol = qmat(VOL, { tDepth: { value: null }, tShadow: { value: null }, shadowM: { value: new Matrix4() }, invProj: { value: new Matrix4() }, camWorld: { value: new Matrix4() },
      camPos: { value: new Vector3() }, lDir: { value: new Vector3() }, lPos: { value: new Vector3() }, lt: { value: new Vector4() }, density: { value: 0 }, far: { value: 60 }, g: { value: .5 }, hasShadow: { value: 0 }, steps: { value: 24 } });
    this.add = qmat(VOL_ADD, { tDiffuse: { value: null }, tVol: { value: null }, vpx: { value: new Vector2() }, tint: { value: new Color() } });
    this.quad = new FullScreenQuad(null);
  }
  setSize(w, h) {
    const bw = Math.max(8, Math.round(w / 2)), bh = Math.max(8, Math.round(h / 2));
    if (this.a?.width === bw && this.a?.height === bh) return;
    this.a?.dispose(); this.a = new WebGLRenderTarget(bw, bh, { type: HalfFloatType, depthBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter });
  }
  /** m: beamsFrame(); depth: the camera's depth picture; cam: the camera. */
  aim(m, depth, cam) {
    const u = this.vol.uniforms;
    u.tDepth.value = depth; u.tShadow.value = m.map; u.hasShadow.value = m.map ? 1 : 0; u.shadowM.value = m.shadowM;
    u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); cam.getWorldPosition(u.camPos.value);
    u.lDir.value.copy(m.lDir); u.lPos.value.copy(m.lPos); u.lt.value.copy(m.lt); u.density.value = m.density; u.far.value = m.far; u.g.value = m.g; u.steps.value = m.steps;
    this.add.uniforms.tint.value.copy(m.tint);
  }
  render(r, writeBuffer, readBuffer) {
    this.quad.material = this.vol; r.setRenderTarget(this.a); this.quad.render(r);
    const u = this.add.uniforms; u.tDiffuse.value = readBuffer.texture; u.tVol.value = this.a.texture; u.vpx.value.set(1 / this.a.width, 1 / this.a.height);
    this.quad.material = this.add; r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose() { this.a?.dispose(); this.vol.dispose(); this.add.dispose(); this.quad.dispose(); }
}

// Motion blur (v.motionBlur = { amount, max, sharp }): each pixel is smeared along how far it moved on
// screen since the last frame as the camera turned and moved, found from its depth and the camera's
// last frame (so the world blurs in a fast turn or at speed). amount: how much of that move (0.5 = a
// half-frame shutter); max: the longest smear, as a part of the screen's width; sharp: things nearer
// than this many metres stay sharp (the car or hands the camera carries move with it). Camera motion
// only, the same on WebGL and WebGPU (things moving by themselves don't blur: that needs each object's
// own motion, which WebGL doesn't draw). High and ultra (it reads the ambient occlusion's depth).
const MB_N = 8;
const MB = `uniform sampler2D tDiffuse, tDepth; uniform mat4 invProj, camWorld, prevVP; uniform vec4 mb; uniform vec2 px; varying vec2 vUv;
  // mb: amount, max (screen widths), sharp (metres), aspect
  void main(){ vec3 base = texture2D(tDiffuse, vUv).rgb; float d = texture2D(tDepth, vUv).x;
    vec4 v = invProj * vec4(vUv * 2. - 1., d * 2. - 1., 1.); v /= v.w;
    vec4 pc = prevVP * (camWorld * vec4(v.xyz, 1.)); vec2 pu = pc.xy / max(pc.w, 1e-4) * .5 + .5;
    vec2 vel = (vUv - pu) * mb.x; vec2 vs = vel * vec2(mb.w, 1.); float l = length(vs), mx = mb.y * mb.w;
    if (pc.w <= 0.) vel = vec2(0.); else if (l > mx) vel *= mx / l;
    vel *= d >= 1. ? 1. : smoothstep(mb.z, mb.z * 1.5 + .01, -v.z);
    if (length(vel / px) < .75) { gl_FragColor = vec4(base, 1.); return; }
    vec3 sum = vec3(0.);
    for (int i = 0; i < ${MB_N}; i++) sum += texture2D(tDiffuse, vUv + vel * (float(i) / ${MB_N - 1}. - .5)).rgb;
    gl_FragColor = vec4(sum / ${MB_N}., 1.); }`;
/** The numbers both renderers blur with this frame (into v._mbm): call once per frame before drawing. cut: the camera jumped. */
function blurFrame(v, cut) {
  const b = v.motionBlur, cam = v.cam, m = v._mbm ||= { prev: new Matrix4(), cur: new Matrix4(), prevVP: new Matrix4(), has: false, mb: new Vector4() };
  cam.updateMatrixWorld(); m.cur.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  m.prevVP.copy(m.has && !cut ? m.prev : m.cur); m.prev.copy(m.cur); m.has = true;
  if (!b) return null;
  m.mb.set(Math.max(0, b.amount ?? .5), Math.max(0, b.max ?? .04), Math.max(0, b.sharp ?? 0), v.W / v.H);
  return m;
}
class BlurPass extends Pass {
  constructor() {
    super(); this.needsSwap = true;
    this.mat = qmat(MB, { tDiffuse: { value: null }, tDepth: { value: null }, invProj: { value: new Matrix4() }, camWorld: { value: new Matrix4() }, prevVP: { value: new Matrix4() }, mb: { value: new Vector4() }, px: { value: new Vector2() } });
    this.quad = new FullScreenQuad(this.mat);
  }
  aim(m, depth, cam) { const u = this.mat.uniforms; u.tDepth.value = depth; u.invProj.value.copy(cam.projectionMatrixInverse); u.camWorld.value.copy(cam.matrixWorld); u.prevVP.value.copy(m.prevVP); u.mb.value.copy(m.mb); }
  render(r, writeBuffer, readBuffer) {
    const u = this.mat.uniforms; u.tDiffuse.value = readBuffer.texture; u.px.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    r.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(r);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

// Ambient occlusion and reflections draw their own depth + normals picture of the scene with one
// plain material, so anything see-through came out as a solid wall: Suit Ops' light shafts (and any
// glow, blob shadow, rotor blur or contact-shadow plane) became dark bands fixed to the camera, and
// leaf and fern cards (alpha-cut) became dark squares. Only solid, opaque surfaces go into that
// picture now. A game can also keep a mesh out with mesh.userData.noAO = true.
function seeThrough3d(o) {
  if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData.noAO) return true;
  if (!o.isMesh) return false;
  const ms = Array.isArray(o.material) ? o.material : [o.material];
  return ms.some(m => m && (m.transparent || !m.depthWrite || m.alphaTest > 0 || m.alphaMap || m.blending !== NormalBlending));
}
function hideSeeThrough(scene, cache) {
  scene.traverseVisible(o => { if (seeThrough3d(o)) cache.push(o); });
  for (const o of cache) o.visible = false;
}
function aoHide() { hideSeeThrough(this.scene, this._visibilityCache); }
function chain(r, w, h) {
  const T = tier();
  if (comp && compKey !== T.msaa) {   // MSAA on/off: re-create just the two buffers
    compKey = T.msaa;
    for (const rt of [comp.renderTarget1, comp.renderTarget2]) { rt.dispose(); rt.samples = T.msaa; }
  }
  if (!comp) {
    compKey = T.msaa;
    const rt = new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa, depthTexture: new DepthTexture(w, h) });   // depth: SGSR 2 reads it
    comp = new EffectComposer(r, rt);
    P.render = new RenderPass(new Scene(), new PerspectiveCamera());
    P.ao = new GTAOPass(new Scene(), new PerspectiveCamera(), w, h);
    P.ao.updateGtaoMaterial({ radius: .6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); P.ao.blendIntensity = .9;
    P.ao._overrideVisibility = aoHide;
    // the AO is worked out at the tier's fraction of the picture (half size on high) and blended back up
    const aoSize = P.ao.setSize.bind(P.ao); P.ao.scale = 1;
    P.ao.setSize = (w, h) => { P.ao.fw = w; P.ao.fh = h; aoSize(Math.max(1, Math.round(w * P.ao.scale)), Math.max(1, Math.round(h * P.ao.scale))); };
    P.final = new FinalPass();
    for (const p of [P.render, P.ao, P.final]) comp.addPass(p);
    comp.setSize(w, h); comp.cw = w; comp.ch = h;
  }
  return comp;
}

// See-through chain for AR games (src/kit/ar3d.js): the camera picture is drawn first, so the 3D
// frame keeps a transparent background. Just the scene (with MSAA) and tone mapping: bloom and the
// colour grade would also tint the real world behind it.
let arComp = null, arKey = '';
function seeThrough(r, w, h) {
  const T = tier();
  if (arComp && arKey !== T.msaa) { arKey = T.msaa; for (const rt of [arComp.renderTarget1, arComp.renderTarget2]) { rt.dispose(); rt.samples = T.msaa; } }
  if (!arComp) {
    arKey = T.msaa;
    arComp = new EffectComposer(r, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: T.msaa }));
    P.arRender = new RenderPass(new Scene(), new PerspectiveCamera(), null, new Color(0), 0);
    P.arOut = new OutputPass();
    arComp.addPass(P.arRender); arComp.addPass(P.arOut);
    arComp.setSize(w, h); arComp.cw = w; arComp.ch = h;
  }
  return arComp;
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
  const C = mk(), Hc = mk(), Rc = mk(), g = { col: C.getContext('2d'), h: Hc.getContext('2d', { willReadFrequently: true }), r: Rc.getContext('2d'), size };
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

/* ---------- shared noise ---------- */
// A 256 x 256 picture of smooth noise that tiles, made once in code: r big soft shapes, g and b finer
// ones, a broad patches. Clouds, cloud shadows and patchy mist all read it.
let noiseT = null;
function tileNoise(size, base, oct, seed) {
  const out = new Float32Array(size * size); let amp = 1, st = seed * 7919 + 1;
  const R = () => { st = st + 0x6D2B79F5 | 0; let t = Math.imul(st ^ st >>> 15, 1 | st); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let k = 0; k < oct; k++, amp *= .5) {
    const p = base << k, L = new Float32Array(p * p); for (let i = 0; i < L.length; i++) L[i] = R();
    for (let y = 0; y < size; y++) {
      const fy = y / size * p, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty), r0 = (yi % p) * p, r1 = ((yi + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x / size * p, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx), a = L[r0 + xi % p], b = L[r0 + (xi + 1) % p], c = L[r1 + xi % p], e = L[r1 + (xi + 1) % p];
        out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy) * amp;
      }
    }
  }
  let lo = Infinity, hi = -Infinity; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
  return out;
}
/** The kit's shared tiling noise texture (r, g, b, a: four kinds of smooth noise, 0..1). */
// v.room(): a direction from the probe, moved to where it meets the room's walls from this point (box-projected)
const ROOM_GLSL = `varying vec3 gsRW; uniform vec3 gsRoomAt, gsRoomSize;
vec3 gsBox(vec3 d) { vec3 n = normalize(d), pos = step(0., n), safe = mix(min(n, vec3(-1e-5)), max(n, vec3(1e-5)), pos), e = gsRoomSize * .5;
  vec3 t = (mix(-e, e, pos) + gsRoomAt - gsRW) / safe; return gsRW + n * min(min(t.x, t.y), t.z) - gsRoomAt; }
`;
// a box from a Box3, { min, max } or an Object3D
function boxOf(b) {
  if (b?.isBox3) return b.clone();
  if (b?.isObject3D) { b.updateWorldMatrix(true, true); return new Box3().setFromObject(b); }
  return new Box3(new Vector3(...b.min), new Vector3(...b.max));
}
/**
 * A glowing ring that sweeps out from a point over a lit material: sonar, a shockwave, a scanner.
 * pulse(material, { at, radius, strength, color, width, fill }): at is a { value: Vector3 }, radius and
 * strength { value } objects the game changes each frame (strength 0 = off); color (linear [r, g, b] or
 * a Color), width (how thick the ring is, metres) and fill (a faint glow inside the ring) are fixed.
 * One per material; works on WebGL and WebGPU (hd3d-gpu.js gpuLooks.pulse). Returns the material.
 */
export function pulse(m, { at, radius, strength, color = [.15, .95, 1], width = 1.4, fill = .22 } = {}) {
  const col = Array.isArray(color) ? new Vector3(...color) : new Vector3(color.r, color.g, color.b);
  const spec = {
    uniforms: { gsPulseAt: at || { value: new Vector3() }, gsPulseR: radius || { value: 0 }, gsPulseA: strength || { value: 0 }, gsPulseCol: { value: col }, gsPulseW: { value: width }, gsPulseFill: { value: fill } },
    vertexHead: 'varying vec3 gsPW;\n',
    vertex: [['#include <project_vertex>', 'after', '\n  gsPW = (modelMatrix * vec4(transformed, 1.)).xyz;\n#ifdef USE_INSTANCING\n  gsPW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;\n#endif\n']],
    fragmentHead: 'varying vec3 gsPW; uniform vec3 gsPulseAt, gsPulseCol; uniform float gsPulseR, gsPulseA, gsPulseW, gsPulseFill;\n',
    fragment: [['#include <emissivemap_fragment>', 'after', '\n  float gsPd = distance(gsPW, gsPulseAt); float gsPb = exp(-pow((gsPd - gsPulseR) / gsPulseW, 2.)) + gsPulseFill * step(gsPd, gsPulseR) * (1. - gsPd / max(gsPulseR, .01));\n  totalEmissiveRadiance += gsPulseCol * gsPb * gsPulseA;\n']],
  };
  lookPatch(m, 'pulse', spec);
  return m;
}

export function noiseTex() {
  if (noiseT) return noiseT;
  const S = 256, data = new Uint8Array(S * S * 4);
  [[4, 5, 1], [8, 4, 2], [16, 3, 3], [2, 5, 4]].forEach(([b, o, seed], ch) => { const f = tileNoise(S, b, o, seed); for (let i = 0; i < S * S; i++) data[i * 4 + ch] = Math.round(f[i] * 255); });
  noiseT = new DataTexture(data, S, S, RGBAFormat); noiseT.wrapS = noiseT.wrapT = RepeatWrapping;
  noiseT.magFilter = LinearFilter; noiseT.minFilter = LinearMipmapLinearFilter; noiseT.generateMipmaps = true; noiseT.needsUpdate = true;
  return noiseT;
}

/* ---------- outdoor air ---------- */
// v.air({...}) gives a view distance haze that warms towards the sun, mist lying low in the valleys,
// cloud shadows drifting over everything and wet, darker, shinier surfaces in the rain. The kit adds it
// to every lit material in the scene before it first draws (and to plain and point materials: haze
// only), so a game turns it on in one line. All patched materials read one set of values (AIR); the
// view being drawn writes its own in each frame.
const AIR = {
  gsAirOn: { value: 0 }, gsSun: { value: new Vector3(0, 1, 0) }, gsAirC: { value: new Color() }, gsAirSun: { value: new Color() },
  gsHaze: { value: 0 }, gsMist: { value: new Vector4() }, gsCloud: { value: new Vector4() }, gsDrift: { value: new Vector2() }, gsWet: { value: 0 }, gsNoise: { value: null },
  gsCasc: { value: new Vector4(-1, -1, .06, 0) },   // shadow cascades: near light's index, far light's index, edge fade
};
const AIR_GLSL = `
uniform float gsAirOn, gsHaze, gsWet; uniform vec3 gsSun, gsAirC, gsAirSun; uniform vec4 gsMist, gsCloud, gsCasc; uniform vec2 gsDrift; uniform sampler2D gsNoise; varying vec3 gsW;
float gsInside(vec4 c){ vec3 p = c.xyz / c.w; vec2 e = min(p.xy, 1. - p.xy); return p.z > 0. && p.z < 1. ? smoothstep(0., gsCasc.z, min(e.x, e.y)) : 0.; }
float gsShadeAt(vec3 wp){
  vec2 c = wp.xz + gsSun.xz / max(gsSun.y, .15) * (gsCloud.z - wp.y);
  float n = texture2D(gsNoise, c / gsCloud.w + gsDrift).r;
  return 1. - gsCloud.y * smoothstep(1. - gsCloud.x, 1.12 - gsCloud.x * .6, n);
}
vec3 gsAir(vec3 col, vec3 wp){
  vec3 rd = wp - cameraPosition; float t = length(rd); rd /= max(t, 1e-3);
  float haze = 1. - exp(-t * gsHaze);
  float k = rd.y * gsMist.y, fy = gsMist.x * exp(-gsMist.y * (cameraPosition.y - gsMist.z)) * (abs(k) < 1e-4 ? t : (1. - exp(-t * k)) / k);
  float n = texture2D(gsNoise, wp.xz * .006 + gsDrift * 1.7).a;
  float mist = 1. - exp(-max(fy, 0.) * mix(1., .35 + n * 1.3, gsMist.w));
  float s = max(dot(rd, gsSun), 0.);
  return mix(col, mix(gsAirC, gsAirSun, pow(s, 6.) * .9), 1. - (1. - haze) * (1. - mist));
}
`;
// The air is one named look effect (src/kit/looks.js) so the WebGPU port can swap it for a node.
const AIR_WET = `#ifdef USE_FOG
  if (gsAirOn > .5 && gsWet > 0.) { vec3 gn = transpose(mat3(viewMatrix)) * normal; float w = gsWet * (.3 + .7 * smoothstep(.15, .85, gn.y));
    roughnessFactor = mix(roughnessFactor, .12, w * .8); diffuseColor.rgb *= 1. - w * .3; }
#endif
`;
// Shadow cascades (sun().fit(view, { near })): a second sun light with a small sharp shadow close to
// the camera. Each spot takes its light from the near one inside its box (fading at the edges) and
// from the far one elsewhere, so the sun isn't counted twice. Three's own CSM swaps the shader chunks
// for every game; this rides on the air's light patch instead (WebGPU: CSMShadowNode).
const CASC_NEAR = `  float gsNearW = 0.;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 1
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
    if ( float( UNROLLED_LOOP_INDEX ) == gsCasc.x ) gsNearW = gsInside( vDirectionalShadowCoord[ i ] );
  }
  #pragma unroll_loop_end
#endif
`;
const CASC_W = `#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
    if ( float( UNROLLED_LOOP_INDEX ) == gsCasc.x ) directLight.color *= gsNearW; else if ( float( UNROLLED_LOOP_INDEX ) == gsCasc.y ) directLight.color *= 1. - gsNearW;
#endif
`;
function cascades(chunk) {
  const at = chunk.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )'), call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (at < 0) return chunk;
  const i = chunk.indexOf(call, at); if (i < 0) return chunk;
  return chunk.slice(0, at) + CASC_NEAR + chunk.slice(at, i) + CASC_W + chunk.slice(i);
}
const airSpec = (lit, wets) => ({
  uniforms: AIR,
  check: sh => sh.fragmentShader.includes('#include <fog_fragment>') && sh.vertexShader.includes('#include <fog_vertex>'),
  vertexHead: 'varying vec3 gsW;\n',
  vertex: [['#include <fog_vertex>', 'after', '\n#ifdef USE_FOG\n  gsW = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif']],
  fragment: [
    ['void main() {', 'before', AIR_GLSL],
    ['#include <fog_fragment>', 'replace', () => '#ifdef USE_FOG\n  if (gsAirOn > .5) gl_FragColor.rgb = gsAir(gl_FragColor.rgb, gsW); else {\n' + ShaderChunk.fog_fragment + '\n  }\n#endif'],
    ...(lit ? [['#include <lights_fragment_begin>', 'replace', () => '#ifdef USE_FOG\n  float gsShade = gsAirOn > .5 && gsCloud.y > 0. ? gsShadeAt(gsW) : 1.;\n#else\n  float gsShade = 1.;\n#endif\n'
      + cascades(ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight ); directLight.color *= gsShade;'))]] : []),
    ...(wets ? [['#include <emissivemap_fragment>', 'before', AIR_WET]] : []),
  ],
});
const airSpecs = [[false, false], [true, false], [true, true]].map(([l, w]) => airSpec(l, w));
const airDone = new WeakSet();
function airPatch(m) {
  if (!m || airDone.has(m)) return;
  airDone.add(m);
  if (m.isShaderMaterial || m.isRawShaderMaterial || m.fog === false || m.isMeshDepthMaterial || m.isMeshDistanceMaterial || m.isShadowMaterial) return;
  const lit = m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial, wets = m.isMeshStandardMaterial;
  lookPatch(m, 'air', airSpecs[wets ? 2 : lit ? 1 : 0]);
}
const airOf = o => { if (o.material) { if (Array.isArray(o.material)) for (const m of o.material) airPatch(m); else airPatch(o.material); } };

/* ---------- particles ---------- */
const PV = `attribute float size; attribute vec4 tint; varying vec4 vT; uniform float scale;
  void main(){ vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = size * scale / max(.05, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PF = `varying vec4 vT; uniform float soft; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d, d) * 4.; if (r > 1.) discard;
  float a = soft > .5 ? (1. - r) * (1. - r) : smoothstep(1., .3, r); gl_FragColor = vec4(vT.rgb, vT.a * a); }`;
/**
 * A pool of camera-facing soft particles, drawn in view v (new Particles(v, ...)). additive: true for sparks / fire / glints (colours
 * above 1 bloom), false for smoke and dust. p.emit({ x, y, z, vx, vy, vz, life, size, grow,
 * col: [r, g, b], a, drag, grav, blow }) then p.update(dt) once per frame. With { wind } (a gs.outdoors
 * Wind) they drift with it: blow is how much (1 = with the air, 0 = not at all; default the pool's blow).
 */
const PART_ATTRS = [['position', 3], ['size', 1], ['tint', 4]];   // (made once, not every frame)
export class Particles {
  constructor(view, { max = 300, additive = true, wind = null, blow = 1 } = {}) {
    this.max = max; this.list = []; this.wind = wind; this.blow = blow; this.wAt = {};
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(max), 1));
    g.setAttribute('tint', new BufferAttribute(new Float32Array(max * 4), 4));
    this.mat = new ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: additive ? 0 : 1 } } });
    this.pts = new Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; view.scene.add(this.pts); view.parts.push(this);
    this.pts.userData.gsTwin = true;   // on WebGPU, hd3d-gpu.js draws them instead (gpuParticles)
    this.view = view;
  }
  emit(o) { if (this.list.length >= this.max) this.list.shift(); this.list.push({ vx: 0, vy: 0, vz: 0, life: 1, size: .1, grow: 0, col: [1, 1, 1], a: 1, drag: 0, grav: 0, ...o, t: 0 }); }
  clear() { this.list.length = 0; }
  update(dt) {
    this.tick = (this.tick || 0) + 1;
    const L = this.list, g = this.pts.geometry, P = g.attributes.position.array, S = g.attributes.size.array, T = g.attributes.tint.array;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.t += dt; if (p.t >= p.life) continue;
      const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy = p.vy * k - p.grav * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const bl = p.blow ?? this.blow; if (this.wind && bl) { if (p.wx === undefined || ((i + this.tick) & 7) === 0) { const w = this.wind.at(p.x, p.z, this.wAt); p.wx = w.x; p.wz = w.z; } p.x += p.wx * bl * dt; p.z += p.wz * bl * dt; }   // the wind where it is, looked up every 8th frame
      if (p.floor != null && p.y < p.floor) { p.y = p.floor; p.vy *= -.35; p.vx *= .6; p.vz *= .6; }
      const f = p.t / p.life;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z; S[n] = p.size * (1 + p.grow * f);
      T[n * 4] = p.col[0]; T[n * 4 + 1] = p.col[1]; T[n * 4 + 2] = p.col[2]; T[n * 4 + 3] = p.a * (p.fadeIn ? Math.min(1, f * 6) : 1) * (1 - f) ** (p.ease ?? 1);
      L[n++] = p;
    }
    L.length = n; g.setDrawRange(0, n); this.n = n;
    for (const [a, k] of PART_ATTRS) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * k)); at.needsUpdate = true; }
  }
}

/**
 * Lots of particles: sparks, embers, smoke, rain splashes, magic, confetti, fireworks. new GPUParticles(v, { max })
 * then p.emit(count, { at, radius, vel, spread, life, size, color, to, alpha, fadeIn, ease }) for a burst and
 * p.update(dt) once a frame. With the view on WebGPU they move on the graphics chip (tens of thousands are
 * cheap); on WebGL they move here on the CPU, capped to what the phone can afford (p.max says how many).
 * Options: max (20000), additive (true: glows; false: smoke and dust), gravity (m/s² down, 0), drag (0),
 * bounce (.35, off the floor), floor (a height they bounce on, or null), turbulence ({ strength, scale, speed }:
 * a swirl), wind (a gs.outdoors Wind: they drift with the air where they are). Burst fields: at [x, y, z] (or a
 * Vector3), radius (start anywhere in a ball this big, 0), vel [x, y, z] (0), spread (plus a random speed in any
 * direction up to this, 1), life (seconds, or [min, max]; 1), size (metres, or [start, end]; .1), color (colour or
 * [r, g, b], above 1 glows; white), to (colour at the end; color), alpha (1), fadeIn (false), ease (fade curve, 1).
 * Up to 16 bursts a frame. Switching between WebGL and WebGPU starts them afresh (they are only for looks: the
 * game can't read where they are; use Particles for the few that must).
 */
const SPARK_CPU = { top: 12000, high: 6000, mid: 3000, low: 1500 };
const GPC = new Color();
export class GPUParticles {
  constructor(view, { max = 20000, additive = true, gravity = 0, drag = 0, bounce = .35, floor = null, turbulence = null, wind = null } = {}) {
    this.maxGpu = Math.max(16, Math.min(262144, max | 0));
    this.max = this.maxGpu;
    Object.assign(this, { additive, gravity, drag, bounce, floor, turbulence, wind, view });
    this.bursts = []; this.head = 0; this.time = 0; this.pendingDt = 0; this.seed = 1; this.n = 0; this.wAt = {};
    this.cpuMax = Math.min(this.maxGpu, SPARK_CPU[phoneClass()] ?? 3000);
    const n = this.cpuMax, g = new BufferGeometry();
    this.P = new Float32Array(n * 4); this.V = new Float32Array(n * 4); this.C = new Float32Array(n * 4); this.E = new Float32Array(n * 4); this.S = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { this.P[i * 4 + 3] = 1; this.V[i * 4 + 3] = 0; }   // all dead
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('size', new BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('tint', new BufferAttribute(new Float32Array(n * 4), 4));
    this.mat = new ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending, uniforms: { scale: { value: 300 }, soft: { value: additive ? 0 : 1 } } });
    this.pts = new Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; view.scene.add(this.pts); view.parts.push(this);
    this.pts.userData.gsTwin = true;
    this.onGpu = false;
  }
  /** A burst of count particles (see the class notes for the fields). */
  emit(count, o = {}) {
    if (this.bursts.length >= 16 || !(count > 0)) return this;
    const cap = this.onGpu ? this.maxGpu : this.cpuMax; count = Math.min(count | 0, cap);
    const at = o.at || [0, 0, 0], vel = o.vel || [0, 0, 0], V3 = a => a.isVector3 ? [a.x, a.y, a.z] : a;
    const life = Array.isArray(o.life) ? o.life : [o.life ?? 1, o.life ?? 1], size = Array.isArray(o.size) ? o.size : [o.size ?? .1, o.size ?? .1];
    const col = rgbOf(o.color ?? [1, 1, 1]), to = o.to != null ? rgbOf(o.to) : col;
    this.bursts.push({ start: this.head, n: count, seed: (this.seed = (this.seed * 1103515245 + 12345) % 2147483648) / 2147483648 * 1000,
      at: V3(at), radius: o.radius ?? 0, vel: V3(vel), spread: o.spread ?? 1, life, size, col, a: o.alpha ?? 1, to, ease: o.ease ?? 1, fadeIn: o.fadeIn ? 1 : 0 });
    this.head = (this.head + count) % cap;
    return this;
  }
  clear() { this.bursts.length = 0; for (let i = 0; i < this.cpuMax; i++) { this.P[i * 4 + 3] = 1; this.V[i * 4 + 3] = 0; } this.twin?.reset(); this.head = 0; }
  update(dt) {
    dt = Math.min(dt, .1); this.time += dt;
    const gpu = !!this.view._onGpu;
    if (gpu !== this.onGpu) {   // moved between WebGL and WebGPU: what was flying is dropped, bursts already asked for still start
      this.onGpu = gpu; this.max = gpu ? this.maxGpu : this.cpuMax;
      if (gpu) this.twin?.reset(); else { for (let i = 0; i < this.cpuMax; i++) { this.P[i * 4 + 3] = 1; this.V[i * 4 + 3] = 0; } this.head %= this.cpuMax; for (const b of this.bursts) { b.n = Math.min(b.n, this.cpuMax); b.start %= this.cpuMax; } }
    }
    if (gpu) { this.pendingDt += dt; return; }   // the WebGPU step runs at draw time (stepGpu)
    this.spawnCpu(); this.stepCpu(dt);
  }
  windNow() { if (!this.wind) return [0, 0, 0]; const b = this.lastAt || [0, 0, 0], w = this.wind.at(b[0], b[2], this.wAt); return [w.x, 0, w.z]; }
  spawnCpu() {
    const N = this.cpuMax, { P, V, C, E, S } = this;
    for (const b of this.bursts) {
      this.lastAt = b.at;
      for (let k = 0; k < b.n; k++) {
        const i = (b.start + k) % N, j = i * 4, h = c => hashF(i, b.seed, c);
        const u = h(1) * 2 - 1, a = h(2) * 6.2831853, q = Math.sqrt(Math.max(0, 1 - u * u)), rr = Math.cbrt(h(3)) * b.radius;
        const u2 = h(4) * 2 - 1, a2 = h(5) * 6.2831853, q2 = Math.sqrt(Math.max(0, 1 - u2 * u2)), rv = Math.cbrt(h(6)) * b.spread;
        P[j] = b.at[0] + q * Math.cos(a) * rr; P[j + 1] = b.at[1] + u * rr; P[j + 2] = b.at[2] + q * Math.sin(a) * rr; P[j + 3] = 0;
        V[j] = b.vel[0] + q2 * Math.cos(a2) * rv; V[j + 1] = b.vel[1] + u2 * rv; V[j + 2] = b.vel[2] + q2 * Math.sin(a2) * rv; V[j + 3] = b.life[0] + (b.life[1] - b.life[0]) * h(7);
        C[j] = b.col[0]; C[j + 1] = b.col[1]; C[j + 2] = b.col[2]; C[j + 3] = b.a;
        E[j] = b.to[0]; E[j + 1] = b.to[1]; E[j + 2] = b.to[2]; E[j + 3] = b.ease;
        S[j] = b.size[0]; S[j + 1] = b.size[1]; S[j + 2] = b.fadeIn;
      }
    }
    this.bursts.length = 0;
  }
  stepCpu(dt) {
    const N = this.cpuMax, { P, V, C, E, S } = this, g = this.pts.geometry, PP = g.attributes.position.array, SS = g.attributes.size.array, TT = g.attributes.tint.array;
    const k = Math.max(0, 1 - this.drag * dt), gr = this.gravity, T = this.turbulence, ts = T?.strength ?? 0, tsc = T?.scale ?? 1, tt = this.time * (T?.speed ?? 1), w = this.windNow(), fl = this.floor;
    let n = 0;
    for (let i = 0; i < N; i++) {
      const j = i * 4; if (!(P[j + 3] < V[j + 3])) continue;
      let vx = V[j] * k, vy = V[j + 1] * k - gr * dt, vz = V[j + 2] * k;
      if (ts) { const x = P[j] * tsc, y = P[j + 1] * tsc, z = P[j + 2] * tsc;
        vx += (Math.sin(y + tt) + Math.sin(z * 1.7 - tt)) * .5 * ts * dt; vy += (Math.sin(z + tt * 1.3) + Math.sin(x * 1.3 + tt)) * .5 * ts * dt; vz += (Math.sin(x + tt * .7) + Math.sin(y * 1.9 - tt)) * .5 * ts * dt; }
      let x = P[j] + (vx + w[0]) * dt, y = P[j + 1] + vy * dt, z = P[j + 2] + (vz + w[2]) * dt;
      if (fl != null && y < fl) { y = fl; vy *= -this.bounce; vx *= .6; vz *= .6; }
      P[j] = x; P[j + 1] = y; P[j + 2] = z; P[j + 3] += dt; V[j] = vx; V[j + 1] = vy; V[j + 2] = vz;
      const f = Math.min(1, P[j + 3] / Math.max(1e-4, V[j + 3])); if (f >= 1) continue;
      PP[n * 3] = x; PP[n * 3 + 1] = y; PP[n * 3 + 2] = z; SS[n] = S[j] + (S[j + 1] - S[j]) * f;
      TT[n * 4] = C[j] + (E[j] - C[j]) * f; TT[n * 4 + 1] = C[j + 1] + (E[j + 1] - C[j + 1]) * f; TT[n * 4 + 2] = C[j + 2] + (E[j + 2] - C[j + 2]) * f;
      TT[n * 4 + 3] = C[j + 3] * (1 - f) ** E[j + 3] * (S[j + 2] ? Math.min(1, f * 6) : 1);
      n++;
    }
    g.setDrawRange(0, n); this.n = n;
    for (const [a, kk] of [['position', 3], ['size', 1], ['tint', 4]]) { const at = g.attributes[a]; at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n * kk)); at.needsUpdate = true; }
  }
  /* WebGPU (hd3d.js swapTwins): the compute twin and its step for this frame */
  makeTwin(G) { const t = G.fx.gpuSparks(this); this.twin = t; return t; }
  stepGpu(G) {
    const t = this.twin; if (!t) return;
    const rows = this._rows ||= Array.from({ length: 16 * 7 }, () => new Vector4());
    const B = this.bursts; for (let b = 0; b < B.length; b++) { const o = B[b], r = b * 7; this.lastAt = o.at;
      rows[r].set(o.start, o.n, 0, o.seed); rows[r + 1].set(o.at[0], o.at[1], o.at[2], o.radius); rows[r + 2].set(o.vel[0], o.vel[1], o.vel[2], o.spread);
      rows[r + 3].set(o.life[0], o.life[1], o.size[0], o.size[1]); rows[r + 4].set(o.col[0], o.col[1], o.col[2], o.a); rows[r + 5].set(o.to[0], o.to[1], o.to[2], o.ease); rows[r + 6].set(o.fadeIn, 0, 0, 0); }
    const T = this.turbulence, w = this.windNow();
    this._turb ||= new Vector4(); this._turb.set(T?.strength ?? 0, T?.scale ?? 1, T?.speed ?? 1, 0); this._wind ||= new Vector3(); this._wind.set(w[0], 0, w[2]);
    t.step(G.r, { rows, count: B.length, dt: this.pendingDt, time: this.time, gravity: this.gravity, drag: this.drag, bounce: this.bounce, floor: this.floor, turb: this._turb, wind: this._wind });
    B.length = 0; this.pendingDt = 0;
  }
  dispose() { this.pts.removeFromParent(); this.pts.geometry.dispose(); this.mat.dispose(); this.twin?.dispose(); this.twin?.sprite.removeFromParent(); const i = this.view.parts.indexOf(this); if (i >= 0) this.view.parts.splice(i, 1); }
}
const rgbOf = c => { if (Array.isArray(c)) return [c[0], c[1], c[2]]; const k = c.isColor ? c : GPC.set(c); return [k.r, k.g, k.b]; };
function hashF(i, s, c) { const x = Math.sin(i * 12.9898 + s * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); }

/* ---------- view ---------- */
const C_WARM = new Color('#ffe2b8'), GV = new Vector3(), GP = new Vector3(), GW = new Vector3(), GQ = new Vector2(), GL = new Vector3(), GH = new Vector3();
// frame generation: the camera jumped (a teleport, a switch of camera, a snap turn, a scope's zoom)
// if since the last real frame it moved 8 m, turned more than 20 degrees or zoomed by a quarter. The
// frames either side don't belong together then, so none is made between them.
const FG_P = new Vector3(), FG_D = new Vector3(), COS20 = Math.cos(20 * Math.PI / 180);
// fresh aim (HDView.aimPose): the camera as it was, and its pose now
const NO_JIT = [0, 0], AIM = { pos: new Vector3(), q0: new Quaternion(), fov: 50, zoom: 1, proj: new Matrix4(), pose: { q: new Quaternion(), fx: 1, fy: 1, cx: 0, cy: 0, persp: true } };
function cameraMove(cam, last) {
  cam.getWorldPosition(FG_P); cam.getWorldDirection(FG_D);
  const zoom = cam.projectionMatrix.elements[5];
  const jumped = !!last && (FG_P.distanceTo(last.pos) > 8 || FG_D.dot(last.dir) < COS20 || Math.abs(zoom / last.zoom - 1) > .25);
  last ||= { pos: new Vector3(), dir: new Vector3(), zoom: 1 };
  last.pos.copy(FG_P); last.dir.copy(FG_D); last.zoom = zoom || 1;
  return { jumped, last };
}
// a grade tint: '#rrggbb', a Color or [r, g, b] (1 = no change)
const toRGB = (c, out) => { if (c == null) out.set(1, 1, 1); else if (Array.isArray(c)) out.set(c[0], c[1], c[2]); else { const k = c.isColor ? c : new Color(c); out.set(k.r, k.g, k.b); } return out; };
// decal pictures: drawn once per key and kept (a soft round mark by default)
const decalTexs = new Map();
const DEFAULT_DECAL = (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, '#fff'); g.addColorStop(.55, '#ddd'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, s, s); };
function decalTex(paint, key) {
  if (!paint) return null;
  const k = key || paint; let t = decalTexs.get(k); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); paint(c, 128);
  t = new CanvasTexture(cv); t.colorSpace = key === '_soft' ? NoColorSpace : SRGBColorSpace; t.anisotropy = 4;
  if (decalTexs.size > 32) { const [k0, t0] = decalTexs.entries().next().value; t0.dispose(); decalTexs.delete(k0); }
  decalTexs.set(k, t); return t;
}

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
    this.lamps = []; this.tierSeen = -1; this.parts = []; this.reflectors = []; this.contacts = [];
    this.env = null; this.envMaker = null; this.grade = null; this.glare = 0; this._air = null;
    this.shafts = 0; this.shaftsAt = null; this.decals = []; this.probes = []; this.probe = null; this.rooms = []; this.gi = null; this.focus = null; this.cascade = null; this.beams = null; this.motionBlur = null;
    this.upscaler = undefined;   // 'sgsr1' keeps this view on Snapdragon GSR 1 (lots of fast movers: SGSR 2 can leave a short soft trail)
  }
  /**
   * Outdoor air for every lit material in the scene: haze (how thick the air is: .001 is about 1 km of
   * view), colour (far away fades to it) and sunColour (towards the sun), mist (thickness at mistY,
   * thinning by mistFall a metre upwards; patchy 0..1), clouds (cover 0..1) with cloudShade (how
   * dark their shadows are), cloudHeight, cloudSize (metres), wind ([x, z] m/s they drift, or a gs.outdoors Wind), and wet
   * (0..1: rain darkens things and makes up-facing surfaces shiny). sun: direction towards the sun
   * (default: v.sun, the light from sun()). Returns the settings, which you can change any time;
   * v.air(false) turns it off.
   */
  air(o = {}) {
    if (o === false) { this._air = null; return null; }
    if (!this._air) {
      const fc = this.scene.fog?.color || this.scene.background || new Color('#c8d0d8');
      this._air = { haze: .0008, colour: new Color(fc.isColor ? fc : '#c8d0d8'), sunColour: null, mist: 0, mistFall: .08, mistY: 0, patchy: .7, clouds: 0, cloudShade: .45, cloudHeight: 400, cloudSize: 620, wind: [6, 2.5], wet: 0, sun: null };
      if (!this.scene.fog) this.scene.fog = new FogExp2(this._air.colour, 0);
    }
    const a = this._air;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'colour' || k === 'sunColour') { if (v == null) a[k] = null; else (a[k] ||= new Color()).set(v); }
      else if (k === 'sun') a.sun = v ? (v.isVector3 ? v.clone().normalize() : new Vector3(...v).normalize()) : null;
      else a[k] = v;
    }
    return a;
  }
  /** The direction towards the sun this view uses for air, glare and cloud shadows. */
  /**
   * A mark on a surface: a scorch, a bullet mark, a footprint, paint, a splat. It wraps over the
   * mesh's shape where it lands (three's DecalGeometry). mesh: what was hit; point and normal: where
   * and which way it faces (from a ray hit: hit.point, hit.normal). Options: size (metres, or
   * [w, h, depth]), angle (turn round the normal; default random), colour, paint (c, s) => {} to
   * draw your own mark on an s x s canvas (cached by key), rough, glow, life (seconds; 0 = stays),
   * max (oldest go first; default 40). Returns the decal mesh (dispose() removes it early).
   */
  decal(mesh, point, normal, { size = .3, angle = Math.random() * Math.PI * 2, colour = '#1a1410', paint = null, key = null, rough = .9, glow = 0, life = 0, max = 40, opacity = 1 } = {}) {
    if (!mesh?.isMesh) return null;
    const P0 = point.isVector3 ? point : new Vector3(...point), N0 = (normal?.isVector3 ? normal.clone() : new Vector3(...(normal || [0, 1, 0]))).normalize();
    mesh.updateMatrixWorld();
    const look = new Matrix4().lookAt(P0.clone().add(N0), P0, Math.abs(N0.y) > .99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0));
    const rot = new Euler().setFromQuaternion(new Quaternion().setFromRotationMatrix(look).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle)));
    const sz = Array.isArray(size) ? new Vector3(size[0], size[1], size[2] ?? Math.max(size[0], size[1])) : new Vector3(size, size, size);
    let geo; try { geo = new DecalGeometry(mesh, P0, rot, sz); } catch { return null; }
    if (!geo.attributes.position?.count) { geo.dispose(); return null; }
    const map = decalTex(paint, key);
    const mat = new MeshStandardMaterial({ color: map ? '#ffffff' : colour, map, roughness: rough, metalness: 0, transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, emissive: glow ? new Color(colour) : new Color(0), emissiveIntensity: glow });
    if (!map) mat.alphaMap = decalTex(DEFAULT_DECAL, '_soft');
    const d = new Mesh(geo, mat); d.userData.noAO = true; d.receiveShadow = true; d.renderOrder = 2;
    d.userData.decal = { life, left: life, opacity };
    this.scene.add(d); this.decals.push(d);
    while (this.decals.length > max) this.dropDecal(this.decals[0]);
    d.dispose = () => this.dropDecal(d);
    return d;
  }
  dropDecal(d) { const i = this.decals.indexOf(d); if (i >= 0) this.decals.splice(i, 1); d.removeFromParent(); d.geometry.dispose(); d.material.dispose(); }
  /** Removes every decal. */
  clearDecals() { for (const d of [...this.decals]) this.dropDecal(d); }
  tickDecals(dt) {
    for (const d of [...this.decals]) {
      const u = d.userData.decal; if (!u.life) continue;
      u.left -= dt; if (u.left <= 0) { this.dropDecal(d); continue; }
      d.material.opacity = u.opacity * Math.min(1, u.left / Math.min(1, u.life * .3));
    }
  }
  /**
   * Bakes the light at a point into a light probe: how bright and what colour the surroundings are
   * from every direction (a sunny window, a red neon sign, green grass bouncing light up). Lit
   * materials nearby then pick up that colour, which makes rooms and caves look lit from inside
   * instead of flat. Bake once the level is built (in reset(), or after a big change), not every
   * frame. Several probes blend by where the camera is (or v.probeAt, e.g. the player): give each a
   * radius. strength scales them; lower the view's amb (hemisphere light) when using probes.
   * Returns a promise of the probe ({ at, radius, sh }) once its light is read back (a frame or two);
   * v.clearProbes() removes them all.
   */
  bakeLight(at, { radius = 10, strength = 1, size = 32 } = {}) {
    const r = renderer(); if (!r) return Promise.resolve(null);
    gpuSwap(this, null);
    const pos = at.isVector3 ? at.clone() : new Vector3(...at);
    const rt = new WebGLCubeRenderTarget(size, { type: HalfFloatType }), cc = new CubeCamera(.05, 400, rt);
    cc.position.copy(pos); this.scene.add(cc);
    const was = this.probe?.intensity ?? 0; if (this.probe) this.probe.intensity = 0;   // don't bake the probe into itself
    const env = this.scene.environment; this.scene.environment = this.env || envTex;
    try { this.scene.updateMatrixWorld(); cc.update(r, this.scene); } catch { rt.dispose(); return Promise.resolve(null); }
    finally { this.scene.environment = env; if (this.probe) this.probe.intensity = was; cc.removeFromParent(); r.setRenderTarget(null); }
    // the read back is async (as it will be on WebGPU): the probe joins once its numbers are in
    const gen = this.probeGen ||= 1;
    return LightProbeGenerator.fromCubeRenderTarget(r, rt).then(probe => {
      rt.dispose();
      if (!probe?.sh || gen !== this.probeGen) return null;
      const p = { at: pos, radius, strength, sh: probe.sh };
      this.probes.push(p);
      if (!this.probe) { this.probe = new LightProbe(); this.scene.add(this.probe); }
      this.blendProbes();
      return p;
    }, () => { rt.dispose(); return null; });
  }
  /**
   * Bounce light (baked global illumination): light that has hit the floor, the walls and the props
   * and lights everything else, from a 3D grid of probes over box (a Box3, { min: [x, y, z], max }, or
   * an Object3D to cover). A red wall tints the floor beside it, a sunlit patch lifts a dark room, a
   * cave is lit from its mouth. spacing: metres between probes (more probes for a bigger box are capped,
   * so they spread out); bounces: extra passes of light bounced around (0 = only once); size: each
   * probe's picture. Baked by whichever renderer draws the view, the first frame after this (and after
   * a move between WebGL and WebGPU); v.bounce(...).bake() again after the level changes. Lower the
   * view's amb when using it. Works on WebGL and WebGPU (three.js LightProbeGrid).
   */
  bounce(box, { spacing = 1.5, bounces = 1, size = 8, far } = {}) {
    this.clearBounce();
    const b = boxOf(box), dims = b.getSize(new Vector3()), centre = b.getCenter(new Vector3());
    let sp = Math.max(.25, spacing); const count = d => Math.max(1, Math.round(d / sp));
    while (count(dims.x) * count(dims.y) * count(dims.z) > 512) sp *= 1.15;
    const gi = this.gi = { centre, dims, res: [count(dims.x), count(dims.y), count(dims.z)], bounces, size: Math.max(4, Math.round(size / 4) * 4), far: far ?? Math.max(20, dims.length() * 2), grids: {}, dirty: { gl: true, gpu: true } };
    gi.bake = () => { gi.dirty.gl = gi.dirty.gpu = true; return gi; };
    gi.remove = () => this.clearBounce();
    return gi;
  }
  /** Removes the bounce light. */
  clearBounce() { const gi = this.gi; if (!gi) return; for (const g of Object.values(gi.grids)) { g.removeFromParent(); g.dispose(); } this.gi = null; }
  /**
   * Reflections that fit a room: shiny things inside box (a Box3, { min, max } or an Object3D) reflect
   * the room itself from its middle, moved to where each reflection meets the walls (box-projected), so
   * a polished floor shows the walls and windows in the right places instead of a far-off sky. Every lit
   * standard material on a mesh inside the box gets it (or only meshes: [...]); a material shared with
   * things outside gets it too. size: the picture's size; strength: how strong. Baked the first frame
   * after this; room.bake() again after the room changes. Works on WebGL and WebGPU.
   */
  room(box, { size = 128, strength = 1, meshes = null, far } = {}) {
    const b = boxOf(box), dims = b.getSize(new Vector3()), centre = b.getCenter(new Vector3());
    const spec = {
      size, far: far ?? Math.max(10, dims.length() * 2),
      uniforms: { gsRoomAt: { value: centre }, gsRoomSize: { value: dims } },
      vertexHead: 'varying vec3 gsRW;\n',
      vertex: [['#include <project_vertex>', 'after', '\n  gsRW = (modelMatrix * vec4(transformed, 1.)).xyz;\n#ifdef USE_INSTANCING\n  gsRW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;\n#endif\n']],
      fragmentHead: ROOM_GLSL,
      fragment: [['#include <envmap_physical_pars_fragment>', 'replace', () => ShaderChunk.envmap_physical_pars_fragment
        .replace('reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );', 'reflectVec = gsBox( transformDirectionByInverseViewMatrix( reflectVec, viewMatrix ) );')
        .replace('vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );', 'vec3 worldNormal = gsBox( transformNormalByInverseViewMatrix( normal, viewMatrix ) );')]],
    };
    const rt = new WebGLCubeRenderTarget(size, { type: HalfFloatType });
    const room = { spec, rt, box: b, mats: new Set(), dirty: { gl: true, gpu: true } };
    const list = meshes || []; if (!meshes) this.scene.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.boundingBox || o.geometry.computeBoundingBox(); o.updateWorldMatrix(true, false); if (b.containsPoint(o.geometry.boundingBox.getCenter(GV).applyMatrix4(o.matrixWorld))) list.push(o); } });
    for (const o of list) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.isMeshStandardMaterial || room.mats.has(m)) continue;
      room.mats.add(m); m.envMap = rt.texture; m.envMapIntensity = strength; lookPatch(m, 'room', spec); m.needsUpdate = true;
    }
    room.bake = () => { room.dirty.gl = room.dirty.gpu = true; return room; };
    room.remove = () => { const i = this.rooms.indexOf(room); if (i >= 0) this.rooms.splice(i, 1); for (const m of room.mats) if (m.envMap === rt.texture) { m.envMap = null; m.needsUpdate = true; } rt.dispose(); };
    (this.rooms ||= []).push(room);
    return room;
  }
  /**
   * Occlusion culling: skip what's fully hidden behind big solid boxes before the frame is drawn (city
   * blocks behind a row of buildings, rooms behind walls). list: boxes { x0, x1, y0, y1, z0, z1 } in
   * world metres (city.occluders() gives them), Box3s, or solid box-like meshes; null turns it off.
   * Only what you list hides things, so give the big, solid, still things (not glass, not fences).
   * Every mesh (by its bounding box), and each instance of gs.props (InstancedMesh2), is tested; mark a
   * mesh userData.noOcclude to always draw it. Hidden things still cast their shadows. Same on WebGL and
   * WebGPU (it runs on the CPU, see occlusion.js). o: { max: boxes drawn per frame (nearest first, 300),
   * w: depth picture width (128) }. v.occlusion.stats: { boxes, tested, hidden, ms } for the last frame.
   */
  occluders(list, o = {}) {
    if (!list) { this.showHidden(); this.occlusion = null; return this; }
    (this.occlusion ||= new Occlusion(o)).set(list); Object.assign(this.occlusion, o);
    return this;
  }
  /**
   * Shaders built in the background (WebGL and WebGPU): something that needs a shader the view hasn't
   * built yet (a new kind of thing appearing mid-round, a material swapped in) waits, hidden, for a
   * frame or two while three builds it on the driver's own threads (compileAsync: WebGPU's
   * createRenderPipelineAsync, WebGL's KHR_parallel_shader_compile), instead of the whole frame stopping
   * while it builds. What's there on the view's first frame, or when precompile() finishes, never
   * waits. It waits at most HD.holdMs (500 ms), then draws anyway. userData.noHold draws a mesh at
   * once; HD.hold = false turns it all off.
   */
  holdNew(r, skip, now, rt = null, mrt = null) {   // rt, mrt: the picture the scene is drawn into (shaders are built for it)
    const held = this.held ||= new Map(), seen = this.shSeen ||= new Set(), jobs = this.shJobs ||= new Map();
    // the ones whose shaders are ready (or waited long enough) come back
    for (const [o, j] of held) if (j.done || now - j.t0 > HD.holdMs || skip || HD.hold === false) { o.layers.mask = (o.layers.mask | 1) & ~(1 << HOLD_LAYER); held.delete(o); }
    for (const [k, j] of jobs) if (j.done || now - j.t0 > HD.holdMs) { seen.add(k); jobs.delete(k); }
    if (skip || HD.hold === false) return;
    // the first frame, and after warm() or precompile() (which built the hidden things' shaders too), are where
    // the waiting starts from: what's there now draws at once
    if (this.holdBase !== true) {
      const all = this.holdBase === 'all'; this.holdBase = true;
      this.scene[all ? 'traverse' : 'traverseVisible'](o => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.material) seen.add(shaderKey(o)); });
      return;
    }
    this.scene.traverseVisible(o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material || !(o.layers.mask & 1)) return;
      const k = shaderKey(o);
      if (seen.has(k)) return;
      if (o.userData.noHold) return;
      let j = jobs.get(k);
      if (!j) {
        jobs.set(k, j = { t0: now, done: false });
        const rt0 = r.getRenderTarget(), m0 = r.getMRT?.();
        try { r.setRenderTarget(rt); r.setMRT?.(mrt); Promise.resolve(r.compileAsync(o, this.cam, this.scene)).then(() => { j.done = true; }, () => { j.done = true; }); }
        catch (_) { j.done = true; } finally { r.setRenderTarget(rt0); r.setMRT?.(m0 ?? null); }
      }
      if (!j.done) { held.set(o, j); o.layers.mask = (o.layers.mask & ~1) | (1 << HOLD_LAYER); }
    });
    HD.info.held = held.size;
  }
  // hides (from the view's camera only: shadows and reflections still see them) what the occluders cover
  cullHidden() {
    const oc = this.occlusion, hid = this.occHid ||= new Map(); this.showHidden();
    oc.frame(this.cam, this.W / this.H);
    const view = this;
    this.scene.traverseVisible(o => {
      if (o.isLight) { if (o.shadow) o.shadow.camera.layers.enable(OCC_LAYER); return; }
      if (o.isInstancedMesh2) {
        if (!o.occWrapped) { const own = o.onFrustumEnter; o.occWrapped = true; o.onFrustumEnter = (i, cam, ...a) => (cam !== view.cam || !view.occlusion?.ready || !view.occlusion.hiddenInstance(o, i)) && (!own || own(i, cam, ...a)); }
        return;
      }
      if (!o.isMesh || !o.frustumCulled || o.userData.noOcclude || !(o.layers.mask & 1)) return;
      if (oc.hiddenObject(o)) { hid.set(o, o.layers.mask); o.layers.mask = (o.layers.mask & ~1) | (1 << OCC_LAYER); }
    });
  }
  showHidden() { const hid = this.occHid; if (!hid?.size) return; for (const [o, m] of hid) o.layers.mask = m; hid.clear(); }
  // bounce light and room reflections, baked by the renderer drawing this frame (G: WebGPU) when they need it
  bakeExtras(G, r) {
    const k = G ? 'gpu' : 'gl', gi = this.gi;
    if (!(gi && (gi.dirty[k] || !gi.grids[k]?.parent)) && !this.rooms?.some(rm => rm.dirty[k])) return;   // nothing to bake this frame
    this.showHidden();   // (the bakes look from elsewhere, so everything is drawn)
    // light, not a picture (no tone mapping), with the sun's shadows in it as the frame will have them
    const tm = r.toneMapping, sh = r.shadowMap.enabled; r.toneMapping = 0; r.shadowMap.enabled = tier().shadow > 0;
    if (!G) r.shadowMap.needsUpdate = true;
    this.scene.updateMatrixWorld();
    try { this.bakeExtras2(G, r); } finally { r.toneMapping = tm; r.shadowMap.enabled = sh; if (!G) { this.shKey = null; r.shadowMap.needsUpdate = true; } }
  }
  bakeExtras2(G, r) {
    const gi = this.gi, k = G ? 'gpu' : 'gl';
    if (gi) {
      gi.grids[G ? 'gl' : 'gpu']?.removeFromParent();
      let g = gi.grids[k];
      if (!g) { g = gi.grids[k] = G ? new G.fx.LightProbeGrid(gi.dims.x, gi.dims.y, gi.dims.z, ...gi.res) : new LightProbeGridWebGL(gi.dims.x, gi.dims.y, gi.dims.z, ...gi.res); g.position.copy(gi.centre); }
      if (!g.parent) this.scene.add(g);
      if (gi.dirty[k]) {
        gi.dirty[k] = false; g.updateMatrixWorld(true);
        try { g.bake(r, this.scene, { cubemapSize: gi.size, near: .05, far: gi.far, bounces: gi.bounces }); } catch (e) { console.warn('bounce light did not bake', e); }
      }
    }
    for (const rm of this.rooms || []) {
      if (!rm.dirty[k]) continue;
      rm.dirty[k] = false;
      try {
        if (G) G.fx.bakeRoom(r, this.scene, rm.spec);
        else {
          const cc = rm.cam ||= new CubeCamera(.05, rm.spec.far, rm.rt); cc.position.copy(rm.spec.uniforms.gsRoomAt.value); this.scene.add(cc); cc.updateMatrixWorld(true);
          try { cc.update(r, this.scene); } finally { cc.removeFromParent(); r.setRenderTarget(null); }
          rm.rt.texture.needsPMREMUpdate = true;
        }
      } catch (e) { console.warn('room reflections did not bake', e); }
    }
  }
  clearProbes() { this.probeGen = (this.probeGen || 1) + 1; this.probes = []; if (this.probe) { this.probe.removeFromParent(); this.probe = null; } }
  blendProbes() {
    const L = this.probe; if (!L || !this.probes.length) return;
    const at = this.probeAt?.isVector3 ? this.probeAt : this.probeAt ? GV.set(this.probeAt.x || 0, this.probeAt.y || 0, this.probeAt.z || 0) : this.cam.position;
    const c = L.sh.coefficients; for (const v of c) v.set(0, 0, 0);
    let sum = 0, strength = 0;
    for (const p of this.probes) {
      const d = p.at.distanceTo(at), w = Math.max(0, 1 - d / p.radius) ** 2 + 1e-4 / (1 + d * d);
      sum += w; strength += p.strength * w;
      for (let i = 0; i < 9; i++) c[i].addScaledVector(p.sh.coefficients[i], w);
    }
    if (sum > 0) { for (const v of c) v.multiplyScalar(1 / sum); L.intensity = strength / sum; }
  }
  sunDir(out = new Vector3()) { const a = this._air; return a?.sun ? out.copy(a.sun) : this.sun?.dir ? out.copy(this.sun.dir) : this.sun?.isLight ? out.copy(this.sun.position).sub(this.sun.target.position).normalize() : out.set(.4, .8, .3).normalize(); }
  /**
   * Reflections and sky light from a scene of your own (a sky dome, a painted room): it's rendered
   * once into the view's environment, used instead of the kit's soft studio. gs.sky's Sky does this
   * for you with { env: true }. Set v.env = null to go back to the studio. The view keeps the scene
   * and makes them again if it moves between WebGL and WebGPU; o.wrap(bake) runs round each bake
   * (to change the scene just for its reflections).
   */
  envFrom(scene, o = {}) {
    // kept, so the view can make them again on the other renderer (WebGL / WebGPU) when it moves
    this.envSrc = { scene, o, n: (this.envSrc?.n || 0) + 1, tex: null };
    const G = this._onGpu && webgpu();
    return G ? this.gpuEnvBake(G) : this.glEnvBake();
  }
  glEnvBake() {
    const r = renderer(), S = this.envSrc; if (!r) return null;
    const { size = 256, blur = .03, far = 5000 } = S.o;
    swapTwins(S.scene, null);
    // one generator kept for the app (making one compiles its shaders), and the same size as the
    // studio's, so swapping between them doesn't rebuild every material's shader
    const bake = () => (pmGen ||= new PMREMGenerator(r)).fromScene(S.scene, blur, .1, far, { size }), rt = S.o.wrap ? S.o.wrap(bake) : bake();
    if (this.envRT && this.envRT !== rt) this.envRT.dispose();
    this.envRT = rt; this.env = S.tex = rt.texture; this._glEnvN = S.n; return rt.texture;
  }
  gpuEnvBake(G) {
    const S = this.envSrc;
    swapTwins(S.scene, G);
    const bake = () => G.fx.envFrom(G.r, S.scene, S.o), rt = S.o.wrap ? S.o.wrap(bake) : bake();
    if (this._gpuEnvRT && this._gpuEnvRT !== rt) this._gpuEnvRT.dispose();
    this._gpuEnvRT = rt; this.env = S.tex = rt.texture; this._gpuEnvN = S.n; return rt.texture;
  }
  // the reflections for the renderer drawing this frame: the studio, or the view's own (envFrom),
  // made again for this renderer if they were last made on the other one
  envFor(G) {
    const S = this.envSrc;
    if (S && this.env !== S.tex) this.envSrc = null;   // the game set v.env itself (or back to null)
    if (this.envSrc) {
      if (G) { if (this._gpuEnvN !== S.n) this.gpuEnvBake(G); else this.env = S.tex = this._gpuEnvRT.texture; }
      else if (this._glEnvN !== S.n) this.glEnvBake(); else this.env = S.tex = this.envRT.texture;
    }
    return G ? (this.envSrc ? this.env : gpuEnv(G)) : this.env || envTex;
  }
  // the kit's air goes into every material before it first draws
  patchAir(all = false) { if (!this._air) return; if (all) this.scene.traverse(airOf); else this.scene.traverseVisible(airOf); }
  airUniforms() {
    const a = this._air; AIR.gsAirOn.value = a ? 1 : 0; if (!a) return;
    const U = AIR; this.sunDir(U.gsSun.value);
    U.gsAirC.value.copy(a.colour);
    if (a.sunColour) U.gsAirSun.value.copy(a.sunColour); else U.gsAirSun.value.copy(a.colour).lerp(this.sun?.color || C_WARM, .35).multiplyScalar(1.15);
    U.gsHaze.value = a.haze; U.gsMist.value.set(a.mist, a.mistFall, a.mistY, a.patchy);
    U.gsCloud.value.set(a.clouds, a.clouds > 0 ? a.cloudShade : 0, a.cloudHeight, a.cloudSize);
    const w = a.wind; U.gsDrift.value.set((w.x ?? w[0]) * this.t / a.cloudSize, (w.z ?? w[1]) * this.t / a.cloudSize);
    U.gsWet.value = a.wet; U.gsNoise.value = noiseTex();
    U.gsCasc.value.x = U.gsCasc.value.y = -1;
    const cs = this.cascade;
    if (cs?.near.visible && cs.near.castShadow && cs.near.parent) {
      // three numbers the sun lights in the order it meets them in the scene, shadow casters first
      const dirs = []; this.scene.traverseVisible(o => { if (o.isDirectionalLight && o.layers.test(this.cam.layers)) dirs.push(o); });
      const key = l => (l.castShadow ? 2 : 0) + (l.map ? 1 : 0);
      dirs.sort((p, q) => key(q) - key(p));
      U.gsCasc.value.x = dirs.indexOf(cs.near); U.gsCasc.value.y = dirs.indexOf(cs.far); U.gsCasc.value.z = cs.fade;
    }
  }
  /**
   * Marks shiny surfaces (a wet floor, a polished wall, a car) for screen-space reflections. They
   * show on top-end phones (the ultra tier); elsewhere the surfaces keep their usual look.
   */
  reflect(...meshes) { for (const m of meshes.flat()) if (m && !this.reflectors.includes(m)) this.reflectors.push(m); return this; }
  /**
   * Soft contact shadows on a floor: the dark, blurry patch right under things that makes them sit
   * on the ground. y: the floor height; size: metres across; follow it with cs.at(x, z). Medium tier
   * and up.
   */
  contact(o = {}) { const cs = new ContactShadows(o); this.scene.add(cs.group); this.contacts.push(cs); return cs; }
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
    // A light switching on or off changes how many lights every material is built for, so three.js
    // rebuilds all their shaders: a stutter each time a lamp came into or left range. So the pooled
    // lights stay switched on (the tier sets how many) and a spare one just goes dark.
    this.lamps.forEach((l, i) => {
      const s = near[i]?.[0]; l.visible = i < n;
      if (!l.visible) return;
      if (!s) { l.intensity = 0; return; }
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
  /**
   * Compile every shader the scene can need now (hidden things too: muzzle flashes, explosions,
   * swapped materials), so nothing compiles mid-game and stutters. Call after building a level;
   * extra materials that get swapped in later can be passed in.
   */
  warm(...extra) {
    this.holdBase = 'all';   // (what it builds never waits: holdNew)
    const G = gpuFor(this);
    if (G) { gpuSwap(this, G); this.warmed = true; try { this.envMaker?.(); } catch (e) { /* the studio reflections stay */ } this.scene.environment = this.envFor(G); G.r.compileAsync(this.scene, this.cam).catch(() => {}); return; }
    const r = renderer(); if (!r) return; this.warmed = true; gpuSwap(this, null);
    const hidden = [], tmp = [];
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    for (const m of extra) { const ms = new Mesh(new BoxGeometry(.01, .01, .01), m); this.scene.add(ms); tmp.push(ms); }
    this.patchAir(true); this.airUniforms();
    try { this.envMaker?.(); } catch (e) { /* the studio reflections stay */ }
    this.scene.environment = this.envFor(null);
    const was = r.shadowMap.enabled;
    try { for (const sh of [true, false]) { r.shadowMap.enabled = sh; r.compile(this.scene, this.cam); } } catch (e) { /* compile is only a warm-up */ }
    r.shadowMap.enabled = was;
    for (const o of hidden) o.visible = false; for (const ms of tmp) { this.scene.remove(ms); ms.geometry.dispose(); }
  }
  /**
   * Get ready to draw without a stall, in the background: the shaders compile on the GPU driver's own
   * threads (KHR_parallel_shader_compile, through three's compileAsync) and the textures upload a few
   * at a time, while the card waits below the one being played. Returns a promise; v.ready is true
   * once it's done. The kit calls this itself the first time a card is drawn off screen.
   */
  prepare() {
    if (this.preparing) return this.preparing;
    return this.preparing = this.precompile();
  }
  /**
   * Compile every shader the scene can need now and upload its textures, in the background (no
   * stall), like prepare() but every time it's called: after building a new level, call it while the
   * screen is faded out and fade back in when it resolves, instead of v.warmed = false (which compiles
   * everything on the next frame, all at once).
   */
  precompile() {
    const G = gpuFor(this);
    if (G) {
      gpuSwap(this, G); this.scene.environment = this.envFor(G); this.warmed = true;
      return G.r.compileAsync(this.scene, this.cam).catch(() => {}).then(() => { this.ready = true; this.holdBase = 'all'; });
    }
    const r = renderer(); if (!r) return Promise.resolve();
    gpuSwap(this, null);
    const hidden = [], jobs = [], was = r.shadowMap.enabled, sh = tier().shadow > 0;
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    this.patchAir(true); this.airUniforms();
    this.scene.environment = this.envFor(null);
    try { for (const on of [sh, !sh]) { r.shadowMap.enabled = on; jobs.push(r.compileAsync(this.scene, this.cam)); } } catch (e) { /* only a warm-up */ }
    r.shadowMap.enabled = was;
    for (const o of hidden) o.visible = false;
    this.warmed = true;
    const texs = new Set();
    this.scene.traverse(o => { for (const m of [o.material].flat()) if (m) for (const k in m) if (m[k]?.isTexture) texs.add(m[k]); });
    return Promise.all(jobs).catch(() => {}).then(async () => {
      for (const t of texs) { try { r.initTexture(t); } catch (_) { /* uploads on first use instead */ } await idle(); }
      this.ready = true; this.holdBase = 'all';
    });
  }
  /** Called when the quality tier changes: let the game switch shadows on lights it owns. */
  onTier(fn) { this.tierFn = fn; return this; }

  /**
   * A number that changes whenever anything that casts a shadow moves, turns, appears or hides, or a
   * shadow light changes. While it stays the same, the shadow maps from last frame are still right.
   */
  shadowKey() {
    let h = 0, i = 0;
    this.scene.traverseVisible(o => {
      if (!o.castShadow) return;
      const e = o.matrixWorld.elements, w = (++i % 89) + 1;
      h += (e[0] * 1.3 + e[1] * 1.7 + e[2] * 2.3 + e[4] * 2.9 + e[5] * 3.1 + e[6] * 3.7 + e[8] * 4.1 + e[9] * 4.3 + e[10] * 4.7 + e[12] * 5.3 + e[13] * 5.9 + e[14] * 6.1) * w;
      if (o.isInstancedMesh) h += (o.instanceMatrix.version + o.count * 7) * w;
      if (o.isLight) h += (o.shadow.mapSize.x + (o.target ? o.target.matrixWorld.elements[12] * 3 + o.target.matrixWorld.elements[14] * 5 : 0) + o.angle * 11 + o.distance * 13) * w;
    });
    return h + i * 1e-4;
  }
  /** Redraw the shadow maps next frame even if nothing seems to have moved (e.g. after changing a geometry in place). */
  shadowsDirty() { this.shKey = null; return this; }
  // The WebGPU frame (render() decided this view fits): the same numbers as the WebGL chain, drawn by hd3d-gpu.js.
  // up: { pw, fw, fh, s1 } when the scene is drawn pw wide and upscaled to the canvas (fw x fh) by SGSR 2, or SGSR 1 if s1
  drawGPU(G, r, T, baking, off, now, up, direct) {
    const s2 = up && !up.s1 ? up : null;
    // card pictures (bakes) draw with no upscaler and no frame generation, which the chain is built for: one
    // shared chain flipped between the two and rebuilt all its passes twice whenever the game's card was baked
    const ck = baking ? '_gpuBakeChain' : '_gpuChain';
    const ch = this[ck]?.r === r ? this[ck] : (this[ck] = new G.fx.GpuChain(r, this.scene, this.cam, !!this.clearBg));
    // the game on screen: drawn into a picture and shown (see GpuChain.realFrame). Nothing on screen has
    // changed for a while (the picture check and the camera agree, and no finger moved): show the last
    // frame again instead of drawing it, and draw for real every few refreshes to look again
    const live = direct && !baking && !off;
    if (live && this.stillSkip(ch, now)) { speed.between = null; HD.info.still = true; HD.info.cpu = performance.now() - now; return; }
    if (!baking && !off) HD.info.still = false;
    try { this.envMaker?.(); } catch (e) { /* the studio reflections stay */ }
    this.scene.environment = this.envFor(G); this.scene.environmentIntensity = this.envI;
    if (this._air) { this.airUniforms(); const a = gpuAir(G); a.sync(); this.scene.fogNode = a.node(); } else { this.scene.fogNode = null; AIR.gsAirOn.value = 0; }
    // the sun lights: cloud shadows and the near shadow cascade's share (hd3d-gpu.js gpuSunLight)
    const cs = this.cascade, casc = !!(cs?.near.visible && cs.near.castShadow && cs.near.parent);
    G.fx.setCascade(casc ? cs.near : null, cs?.fade ?? .06);
    this.scene.traverse(l => {
      if (!l.isDirectionalLight) return;
      let role = sunRoles.get(l); if (!role) sunRoles.set(l, role = G.fx.gpuSunLight(l, AIR, noiseTex()));
      role.value = casc ? (l === cs.near ? 1 : l === cs.far ? 2 : 0) : 0;
    });
    r.toneMapping = ACESFilmicToneMapping; r.toneMappingExposure = this.exposure;
    if (this.decals.length && !baking && !off) this.tickDecals(Math.min(.1, (now - (this.decalT || now)) / 1000)); this.decalT = now;
    if (!baking && !off) this.t += 1 / 60;
    gpuSwap(this, G);
    if (this.gi || this.rooms?.length) this.bakeExtras(G, r);
    // (built for the screen, not the chain's own picture: a pipeline built for that picture also bound it to read, which WebGPU refuses)
    this.holdNew(r, baking || off, now);
    const shc = this.shadowCams ||= []; shc.length = 0;
    if (tier().shadow > 0) this.scene.traverseVisible(o => { if (o.isLight && o.castShadow && o.shadow?.camera) shc.push(o.shadow.camera); });
    this.scene.traverse(o => { if (o.isInstancedMesh2 && o.userData.gpuHid) o.userData.gpuTwin.sync(this.cam, this.occlusion?.ready && HD.occlude !== false ? this.occlusion : null, shc); });
    for (const cs of this.contacts) { const tw = cs.gpuTwin?.r === r ? cs.gpuTwin : (cs.gpuTwin = { r, ...G.fx.gpuContact(cs) }); tw.update(r, this.scene, T.contact); }
    // SGSR 2: the scene at pw x ph (ph the passes' own rounding of the canvas height), upscaled to the canvas
    const pw = up ? up.pw : r.domElement.width, ph = up ? Math.max(1, Math.floor(up.fh * (pw + .5) / up.fw)) : r.domElement.height;
    const o = { w: pw, h: ph, fw: r.domElement.width, fh: r.domElement.height, s2: null, s1: !!up?.s1, ao: T.ao, msaa: T.msaa, bloomScale: T.bloom, smooth: !T.msaa, bloom: this.bloom, t: this.t % 10, hurt: this.hurt, grade: null, glare: 0, sunUV: GQ.set(.5, .5), sunCol: C_WARM, aspect: this.W / this.H,
      dofOn: false, lens: null, near: this.cam.near, far: this.cam.far, shaftsOn: false, shaft: 0, shaftCol: null };
    const g = this.grade;
    if (g) o.grade = { sat: g.saturation ?? 1, con: g.contrast ?? 1, lo: toRGB(g.shadows, GL), hi: toRGB(g.highlights, GH) };
    // depth of field and sun shafts: in the chain from the first time the view uses them (high and ultra
    // for focus, as on WebGL; not on the lowest tier for shafts), so turning them on and off doesn't rebuild it
    this._dofUsed ||= !!this.focus; this._shaftsUsed ||= this.shafts > 0;
    o.dofOn = this._dofUsed && T.ao > 0; o.shaftsOn = this._shaftsUsed && T.shadow > 0;
    if (o.dofOn && this.focus) { const f = this.focus; o.lens = [f.at ?? 50, f.range ?? 2, f.depth ?? .5, (f.blur ?? 6) * ph / 640]; }
    // volumetric light and motion blur: the same tiers as WebGL (high and ultra, and shadows for the light)
    this._volUsed ||= !!this.beams; this._mbUsed ||= !!this.motionBlur;
    o.volOn = this._volUsed && T.ao > 0 && T.shadow > 0; o.vol = o.volOn && this.beams ? beamsFrame(this) : null;
    const mbm = blurFrame(this, lastView !== this || this._cut); o.mbOn = this._mbUsed && T.ao > 0; o.mb = o.mbOn ? mbm : null;
    // frame generation (speed.js says when, framegen.js makes the frames, hd3d-gpu.js shows them): for the game being played
    const how = live ? frameGenFor(speed.game) : false, steps = how ? frameGenSteps(speed.game) : 1;
    // with frames made in between, each one shown is a fraction of a real frame's move apart: blur that much
    if (mbm && how) mbm.mb.x /= steps;
    if (this.glare > 0 || (o.shaftsOn && this.shafts > 0)) {
      const sd = this.sunDir(GV), cam = this.cam; GP.copy(cam.position).addScaledVector(sd, 1000).project(cam);
      cam.getWorldDirection(GW);
      if (GW.dot(sd) > 0 && Math.abs(GP.x) < 1.6 && Math.abs(GP.y) < 1.6) {
        const seen = Math.min(1, (1.6 - Math.max(Math.abs(GP.x), Math.abs(GP.y))) * 2);
        o.glare = this.glare * seen;
        o.sunUV.set(GP.x * .5 + .5, GP.y * .5 + .5); o.sunCol = this.sun?.color || C_WARM;
        if (o.shaftsOn) { o.shaft = Math.min(2, this.shafts) * seen; o.shaftCol = this.sun?.color || C_WARM; o.shaftAt = this.shaftsAt; }
      }
    }
    // shadows: three's WebGPU renderer redraws them each frame (top phones only, for now)
    r.shadowMap.enabled = T.shadow > 0; r.shadowMap.type = PCFShadowMap;
    if (!this.warmed && !off) { this.warmed = true; r.compileAsync(this.scene, this.cam).catch(() => {}); }
    // an instanced mesh made with room for none (an empty list in a game) has a zero-size buffer that WebGPU
    // won't bind; it draws nothing anyway, so it sits this frame out
    const empty = []; this.scene.traverseVisible(o => { if (o.isInstancedMesh && (!o.count || !o.instanceMatrix.count)) empty.push(o); });
    for (const e of empty) e.visible = false;
    r.info.autoReset = false; r.info.reset();
    const cut = lastView !== this || this._cut; lastView = this; this._cut = false;
    // Frame generation starts again after a cut (another view drew, v.cut(), a pause, the camera
    // jumping): the frames either side of one don't belong together.
    let fg = null;
    if (how) {
      this.scene.updateMatrixWorld(); this.cam.updateMatrixWorld();
      const m = cameraMove(this.cam, this._fgCam); this._fgCam = m.last;
      fg = { mode: how, reset: cut || m.jumped || now - (this._fgT || 0) > HD.fgGap, jd: [0, 0], jit: [0, 0], steps, hz: screenHz() }; this._fgT = now;
    } else this._fgCam = null;
    if (s2) { o.s2 = GS2 ||= new SgsrFrame(); this.scene.updateMatrixWorld(); o.s2.begin(this.cam, pw, ph, o.fw, o.fh, this, now, cut, true); }   // WebGPU pictures count rows from the top
    // SGSR 2 moves the camera by a fraction of a pixel each frame (its jitter) and three's motion picture
    // includes the change: SGSR 2 and frame generation take it back out (in NDC: x right, y up, so rows down are minus)
    if (s2) {
      const j = o.s2.jitter, x = 2 * j.x / pw, y = -2 * j.y / ph, p = !cut && this._fgJ || [x, y], jd = [x - p[0], y - p[1]]; this._fgJ = [x, y];
      o.s2.jd = jd; if (fg) { fg.jd = jd; fg.jit = [x, y]; }
    } else this._fgJ = null;
    // the scene's pass writes each pixel's motion and the see-through mask while frame generation could
    // come on for this game (so it can start without rebuilding the chain) or SGSR 2 can use them
    o.live = live; o.mrt = live && (!!s2 || frameGenReady(speed.game)); o.still = live && HD.still !== false; o.fg = fg; o.now = now;
    // fresh aim: made frames turned to where the camera points at the moment they're shown (v.aimNow, AR's own)
    ch.aim = live && fg && HD.aim !== false && (this.aimFn || this.freshAim) ? () => this.aimPose() : null;
    this._aimJit = s2 && fg ? fg.jit : null;   // the real frame is shown while SGSR 2's jitter is still on the camera
    let shown = false;
    try { shown = ch.render(o) || false; } finally { for (const e of empty) e.visible = true; if (s2) o.s2.end(this.cam); this._aimJit = null; }
    const made = !!fg && !!shown;
    if (made) HD.fgTap?.(shown, r.domElement, 'frame');
    // the refreshes after this one that the feed skips show the moments due then (last: the next draws a real frame)
    speed.between = made ? (last = true, now = null) => { const k = ch.between(last, now); if (k) HD.fgTap?.(k, r.domElement, 'between'); } : null;
    // the refreshes between kept not coming (the phone is too busy to draw them in time): blend puts the
    // made frame on the real frame's refresh, so first try ahead (its work is spread over both); then stop for this game
    if (made && ch.fgWin.real >= 90) {
      const miss = ch.missRate(), id = speed.game?.id;
      if (miss > .3 || (miss > .08 && how === 'blend' && !frameGenPace(id))) { if (!speed.shield) { frameGenFailed(id); console.info('Frame generation off for this game: the phone is too busy for the frames between'); } }
      else if (miss > .08 && how === 'blend') console.info('Frame generation: ahead for this game, its refreshes were too full in blend');
    }
    if (!baking && !off) {
      HD.info.calls = r.info.render.drawCalls; HD.info.tris = r.info.render.triangles; HD.info.cpu = performance.now() - now; HD.info.shadows = T.shadow > 0; HD.info.upscaled = s2 ? 'sgsr2' : up ? 'sgsr1' : false; HD.info.backend = 'webgpu';
      HD.info.framegen = made ? how : false; HD.info.fgMs = made ? ch.fg.stats.ms : 0; HD.info.fgSteps = made ? steps : 0;
    }
  }
  // Still frames: true when this refresh can show the last frame again instead of drawing (see drawGPU).
  stillSkip(ch, now) {
    const st = ch.still, S = this._still ||= { cam: new Float64Array(32), run: 0, seen: -1, skip: 0, hurt: 0 };
    if (!st || HD.still === false || lastView !== this || this._cut || !ch.lastColor) { S.run = 0; return false; }
    const cam = this.cam; cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements, p = cam.projectionMatrix.elements, k = S.cam; let same = true;
    for (let i = 0; i < 16; i++) { if (k[i] !== e[i]) { same = false; k[i] = e[i]; } if (k[16 + i] !== p[i]) { same = false; k[16 + i] = p[i]; } }
    // a change it can't see in the picture yet: the camera, the hurt flash, a finger or key in the last moment
    if (!same || this.hurt !== S.hurt || now - (speed.inputAt || 0) < 300) { S.run = 0; S.hurt = this.hurt; return false; }
    // a new answer from the picture check (a frame or two late): how many checks in a row saw nothing change
    if (st.seen !== S.seen) { S.seen = st.seen; S.run = st.changed() === 0 ? S.run + 1 : 0; }
    if (S.run < 3) return false;
    if (++S.skip >= 6) { S.skip = 0; return false; }   // draw one in six to look again
    return ch.showLast();
  }
  /**
   * Fresh aim (frame generation): fn(cam) points the camera where the newest input says, right now,
   * without moving the game on (as your update() would from it: a look angle a finger already changed).
   * Each made frame is then turned to that, so aiming and steering answer at the screen's rate, not the
   * game's. Kit camera rigs (gs.camera) and AR views do it themselves. Returns the view.
   */
  aimNow(fn) { this.aimFn = fn; return this; }
  // the camera's pose now (framegen.js's pose: facing and projection): fn(cam) runs on the game's camera,
  // which is put back as it was straight after
  aimPose() {
    const cam = this.cam, A = AIM, P = cam.projectionMatrix.elements;
    A.pos.copy(cam.position); A.q0.copy(cam.quaternion); A.fov = cam.fov; A.zoom = cam.zoom; A.proj.copy(cam.projectionMatrix);
    let ok = true;
    try {
      if (this.aimFn) this.aimFn(cam); else this.freshAim(cam);
      if (cam.fov !== A.fov || cam.zoom !== A.zoom) cam.updateProjectionMatrix();
      cam.updateMatrixWorld(); cam.getWorldQuaternion(A.pose.q);
      const j = this._aimJit || NO_JIT;
      A.pose.persp = !!cam.isPerspectiveCamera && P[15] === 0; A.pose.fx = P[0]; A.pose.fy = P[5]; A.pose.cx = P[8] + j[0]; A.pose.cy = P[9] + j[1];
    } catch (_) { ok = false; }
    finally {
      cam.position.copy(A.pos); cam.quaternion.copy(A.q0); cam.fov = A.fov; cam.zoom = A.zoom;
      cam.projectionMatrix.copy(A.proj); cam.projectionMatrixInverse.copy(A.proj).invert(); cam.updateMatrixWorld();
    }
    return ok ? A.pose : null;
  }
  /**
   * The camera cut to somewhere new (a teleport, another camera, a replay): the next frame starts
   * fresh instead of building on the last (SGSR 2's history, frame generation). Big jumps are found by
   * themselves; call this for the rest. Returns the view.
   */
  cut() { this._cut = true; return this; }
  /**
   * The 3D canvas belongs to another card now: draw this view's last frame under the HUD already on
   * its canvas (and the camera picture under that, for AR), so the card keeps its picture.
   */
  bake(c, small = false) {
    const r = renderer(); if (!r) return;
    this.render(c, this.W, this.H, small ? 'small' : true);
    const u = this.under;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over';
    const W = c.canvas.width, H = c.canvas.height;
    if (u?.videoWidth) { const s = Math.max(W / u.videoWidth, H / u.videoHeight); c.drawImage(u, (W - u.videoWidth * s) / 2, (H - u.videoHeight * s) / 2, u.videoWidth * s, u.videoHeight * s); }
    else if (this.clearBg) { c.fillStyle = '#151a22'; c.fillRect(0, 0, W, H); }
    c.restore();
  }

  /**
   * Render the frame for 2D canvas c (logical units w x h), with post-processing. Normally the 3D
   * canvas is shown on the card right under c, and c is cleared so the game draws its HUD on top.
   * For a game in the AR kit, v.under (an element, the camera video) is shown under the 3D canvas and
   * v.underCss is a CSS background for it. With HD.direct off (tests), the frame is copied into c.
   */
  render(c, w = this.W, h = this.H, baking = false) {
    this.fit(w, h);
    const G = gpuFor(this), r = G ? G.r : renderer();
    // WebGPU's depth runs 0..1 and WebGL's -1..1, so the camera's projection differs. three switches it
    // only when the camera's own setting disagrees, and the SGSR 2 jitter puts back the matrix it saved
    // before, so a switch made inside the frame was undone (on WebGPU the near clip sat at twice its
    // distance: Long Shadow's rifle was cut away). Switch it here, before anything saves it.
    const cs = G ? G.r.coordinateSystem : WebGLCoordinateSystem;
    if (this.cam.coordinateSystem !== cs) { this.cam.coordinateSystem = cs; this.cam.updateProjectionMatrix(); }
    if (!r) { c.fillStyle = this.scene.background ? '#' + this.scene.background.getHexString() : '#0b0f14'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('This device cannot show 3D', w / 2, h / 2); return; }
    const now = performance.now();
    // where the frame goes: straight onto the card (moving the 3D canvas here first, which bakes the
    // last frame into the card it leaves), or copied into c
    // A card being added below the one on screen (speed.offscreen) gets a copied frame: it mustn't take
    // the 3D canvas, the quality tuning or a shader warm-up away from the game being played.
    const off = !baking && speed.offscreen;
    // A card being added below the one on screen: until its shaders and textures are ready (above),
    // draw no 3D (drawing would stall the feed while they compile), then paint its picture in later.
    if (off && !this.ready) {
      this.prepare().then(() => { if (c.canvas.isConnected && host?.canvas !== c.canvas) bakeLater(this, c); });
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
      return;
    }
    // (each is a whole frame of another card plus a copy: never while a round is played or the feed moves)
    if (!baking && !off) { this.drawnAt = now; if (bakes.length && !speed.playing() && !speed.busy()) for (const [v, bc] of bakes.splice(0)) if (bc.canvas.isConnected && host?.canvas !== bc.canvas) try { v.bake(bc, true); } catch (_) { /* best effort */ } }
    const direct = HD.direct && !baking && !off && !!c.canvas.parentNode && mount(r.domElement, c, this);
    if (!baking && !off) {
      if (Q.game !== speed.game) startGame(speed.game);
      // adaptive quality: first resolution, then tier (and frame rate)
      const gap = now - (Q.lastT || now); Q.lastT = now; adapt(gap); applyTier();
    }
    const T = tier();
    if (this.tierSeen !== HD.tier) { this.tierSeen = HD.tier; this.tierFn?.(T); }
    // The final picture (upscaler, last effects, the copy onto the card) is the screen's own size. On a big
    // screen (a foldable opened up) that's twice a phone's pixels and the resolution steps can't lighten it,
    // so once the game has had to step down (Q.lvl >= 1), it's also drawn at no more than OUT_PX and the
    // screen stretches it. A game keeping up is never touched.
    let fw = c.canvas.width, fh = c.canvas.height;
    if (!baking && !off && HD.scale == null && Q.force == null && Q.lvl >= 1 && fw * fh > OUT_PX) { const k = Math.sqrt(OUT_PX / (fw * fh)); fw = Math.round(fw * k); fh = Math.round(fh * k); }
    // With frame generation on, each real frame has two (or more) refreshes' time, so the 3D is drawn with
    // more pixels (SGSR 2 has less to make up). Not while it's on to save power; the stutter shield's
    // short spells neither add nor take away pixels (a change of size costs a frame of its own). The
    // resolution steps still take them back if the phone can't keep up.
    const fgMore = !baking && !off && G && !fgSaving() && frameGenSteady(speed.game) ? FG_PX : 1;
    let pw = fw, ph = fh; const px = baking === 'small' ? Math.min(T.px, PIC_PX) : T.px * fgMore, q = HD.scale ?? Math.min(1, Math.sqrt(px / (pw * ph))) * HD.res;
    pw = Math.max(16, Math.round(pw * q)); ph = Math.max(16, Math.round(ph * q));
    if (!baking && !off) { HD.info.rw = pw; HD.info.rh = ph; HD.info.ow = fw; HD.info.oh = fh; }   // the 3D's own size and the final picture's (the frame lab's resolution counter)
    // The 3D is drawn at pw x ph (fewer pixels on big screens and when the phone struggles). Below the
    // screen's size, Snapdragon GSR 2 (sgsr2.js, temporal: jitters the camera and builds on the frames
    // before) or GSR 1 (sgsr.js, AR and SSR) upscales it to the full screen as the last pass (on WebGPU,
    // hd3d-gpu.js's TSL versions of both); HD.upscale = false shows the plain stretched picture instead (tests, comparisons).
    const up = HD.upscale && !baking && pw < fw * .95;
    // SGSR 2 also runs at full size, as anti-aliasing (grass and leaves stop shimmering); not for AR,
    // SSR (it draws the scene itself) or card pictures. On WebGPU it's hd3d-gpu.js's TSL version.
    const ssr = !G && !this.clearBg && T.ssr && this.reflectors.length > 0;
    const s2on = HD.upscale && !baking && !this.clearBg && !ssr && (this.upscaler ?? HD.upscaler) === 'sgsr2';
    const s2 = s2on && !G ? (P.sgsr2 ||= new SGSR2()) : null;
    const ow = up || s2on ? fw : pw, oh = up || s2on ? fh : ph;
    const cv = r.domElement; if (cv.width !== ow || cv.height !== oh) r.setSize(ow, oh, false);
    if (!baking && !off) speed.gpu = !!G;   // (frame generation needs the game on screen drawn with WebGPU)
    if (this.occlusion && HD.occlude !== false) { this.cullHidden(); HD.info.occluded = this.occlusion.stats.hidden; } else if (this.occHid?.size) this.showHidden();
    if (G) this.drawGPU(G, r, T, baking, off, now, (s2on || up) && { pw, fw, fh, s1: !s2on }, direct);
    else {
    if (!baking && !off) { speed.between = null; HD.info.framegen = false; }   // (frame generation is WebGPU only)
    gpuSwap(this, null);
    const cp = this.clearBg ? seeThrough(r, pw, ph) : chain(r, pw, ph); if (cp.cw !== pw || cp.ch !== ph) { cp.setSize(pw, ph); cp.cw = pw; cp.ch = ph; }
    if (up) { P.sgsr ||= new ShaderPass(SGSR); P.sgsr.uniforms.ViewportInfo.value = (P.sgsrV ||= new Vector4()).set(1 / pw, 1 / ph, pw, ph); }
    if (this.clearBg) cp.passes = up ? [P.arRender, P.arOut, P.sgsr] : [P.arRender, P.arOut];
    this.scene.environment = this.envFor(null); this.scene.environmentIntensity = this.envI;
    this.patchAir(); this.airUniforms();
    if (this.gi || this.rooms?.length) this.bakeExtras(null, r);
    this.holdNew(r, baking || off, now, this.clearBg ? null : cp.readBuffer);
    r.toneMappingExposure = this.exposure;
    if (this.clearBg) { P.arRender.scene = this.scene; P.arRender.camera = this.cam; } else { P.render.scene = P.ao.scene = this.scene; P.render.camera = P.ao.camera = this.cam; }
    // reflections (ultra, and only if the game marked shiny surfaces): SSR draws the scene itself
    if (ssr) {
      if (!P.ssr) {
        P.ssr = new SSRPass({ renderer: r, scene: this.scene, camera: this.cam, width: pw, height: ph, selects: [], groundReflector: null });
        const ro = P.ssr._renderOverride.bind(P.ssr);   // its normals picture: solid surfaces only (see seeThrough3d)
        P.ssr._renderOverride = (...a) => { const hid = []; hideSeeThrough(P.ssr.scene, hid); try { ro(...a); } finally { for (const o of hid) o.visible = true; } };
        Object.assign(P.ssr, { thickness: .02, maxDistance: 8, opacity: .55, blur: true, fresnel: true, distanceAttenuation: true, bouncing: false, infiniteThick: false }); P.ssr.cw = pw; P.ssr.ch = ph;
      }
      P.ssr.scene = this.scene; P.ssr.camera = this.cam; P.ssr.selects = this.reflectors;
      if (P.ssr.cw !== pw || P.ssr.ch !== ph) { P.ssr.setSize(pw, ph); P.ssr.cw = pw; P.ssr.ch = ph; }
    }
    for (const cs of this.contacts) cs.update(r, this.scene, T.contact);
    if (this.decals.length && !baking && !off) this.tickDecals(Math.min(.1, (now - (this.decalT || now)) / 1000)); this.decalT = now;
    if (this.probes.length > 1) this.blendProbes();
    for (const p of this.parts) p.mat.uniforms.scale.value = ph / (2 * Math.tan(this.cam.fov * Math.PI / 360));
    if (!baking && !off) this.t += 1 / 60;
    if (!this.clearBg) {
      const F = P.final; P.ao.enabled = T.ao > 0; if (T.ao > 0 && P.ao.scale !== T.ao) { P.ao.scale = T.ao; P.ao.setSize(P.ao.fw || pw, P.ao.fh || ph); }
      F.strength = this.bloom; F.scale = T.bloom; F.setFxaa(!s2 && (!T.msaa || ssr));   // SGSR 2 smooths edges itself
      const u = F.final.uniforms; u.t.value = this.t % 10; u.hurt.value = this.hurt;
      const g = this.grade; u.gradeOn.value = g ? 1 : 0;
      if (g) { u.sat.value = g.saturation ?? 1; u.con.value = g.contrast ?? 1; toRGB(g.shadows, u.lo.value); toRGB(g.highlights, u.hi.value); }
      u.glare.value = 0;
      const shafts = this.shafts > 0 && T.shadow > 0;   // not on the lowest tier
      if (shafts) P.shafts ||= new ShaftsPass();
      if (P.shafts) P.shafts.amount = 0;
      if (this.glare > 0 || shafts) {
        const sd = this.sunDir(GV), cam = this.cam; GP.copy(cam.position).addScaledVector(sd, 1000).project(cam);
        cam.getWorldDirection(GW);
        if (GW.dot(sd) > 0 && Math.abs(GP.x) < 1.6 && Math.abs(GP.y) < 1.6) {
          const seen = Math.min(1, (1.6 - Math.max(Math.abs(GP.x), Math.abs(GP.y))) * 2);
          u.sunUV.value.set(GP.x * .5 + .5, GP.y * .5 + .5); u.aspect.value = this.W / this.H; u.sunCol.value.copy(this.sun?.color || C_WARM);
          if (this.glare > 0) u.glare.value = this.glare * seen;
          if (shafts) { P.shafts.strength = Math.min(2, this.shafts); P.shafts.bright(this.shaftsAt ?? 1.1); P.shafts.aim(u.sunUV.value, this.W / this.H, seen, this.sun?.color || C_WARM); }
        }
      }
    }
    // extra effects a game added (gs.fx3d: outline, glitch, trails, depth of field, pixelate) go between the scene and the final pass
    if (!this.clearBg) {
      const dof = this.focus && T.ao > 0 && P.ao.depthTexture ? (P.dof ||= new DofPass()) : null;
      if (dof) { const f = this.focus, u = dof.mat.uniforms; u.tDepth.value = P.ao.depthTexture; u.cn.value = this.cam.near; u.cf.value = this.cam.far; u.lens.value.set(f.at ?? 50, f.range ?? 2, f.depth ?? .5, (f.blur ?? 6) * ph / 640); }
      // volumetric light (v.beams) and motion blur (v.motionBlur): before and after the depth of field
      const bm = this.beams && T.ao > 0 && T.shadow > 0 && P.ao.depthTexture ? beamsFrame(this) : null;
      const beams = bm ? (P.beams ||= new BeamsPass()) : null; if (beams) beams.aim(bm, P.ao.depthTexture, this.cam);
      const mbm = blurFrame(this, lastView !== this || this._cut);
      const mb = mbm && T.ao > 0 && P.ao.depthTexture ? (P.mb ||= new BlurPass()) : null; if (mb) mb.aim(mbm, P.ao.depthTexture, this.cam);
      const ex = [beams, dof, mb, ...(this.extras || [])].filter(Boolean);
      const first = ssr ? P.ssr : P.render;
      const sh = P.shafts && P.shafts.amount > 0 ? [P.shafts] : [];
      if (sh.length && (P.shafts.cw !== pw || P.shafts.ch !== ph)) { P.shafts.setSize(pw, ph); P.shafts.cw = pw; P.shafts.ch = ph; }
      // SGSR 2 reads the scene's depth straight after it's drawn
      cp.passes = s2 ? [first, s2.convertPass, P.ao, ...ex, ...sh, P.final, s2.upscalePass] : up ? [first, P.ao, ...ex, ...sh, P.final, P.sgsr] : [first, P.ao, ...ex, ...sh, P.final];
      P.final.needsSwap = up || !!s2;   // the final pass writes into the next buffer only when SGSR reads it
      for (const p of ex) if (p.cw !== pw || p.ch !== ph) { p.setSize(pw, ph); p.cw = pw; p.ch = ph; }
    }
    if (!this.warmed && !off) this.warm();
    // shadows: redraw the maps only when a shadow caster or a shadow light moved (or the tier, view or map changed)
    this.scene.updateMatrixWorld();
    r.shadowMap.enabled = T.shadow > 0;
    let shadows = false; const cut = lastView !== this || this._cut; this._cut = false;
    if (T.shadow > 0) { const k = this.shadowKey(); if (k !== this.shKey || lastView !== this) { this.shKey = k; r.shadowMap.needsUpdate = shadows = true; } }
    lastView = this;
    r.info.autoReset = false; r.info.reset();
    const mwa = this.scene.matrixWorldAutoUpdate; this.scene.matrixWorldAutoUpdate = false;   // already updated above
    if (s2) s2.begin(this.cam, pw, ph, fw, fh, this, now, cut);   // the camera's move and this frame's jitter
    try { cp.render(); } finally { this.scene.matrixWorldAutoUpdate = mwa; s2?.end(this.cam); }
    if (!baking && !off) { HD.info.calls = r.info.render.calls; HD.info.tris = r.info.render.triangles; HD.info.cpu = performance.now() - now; HD.info.shadows = shadows; HD.info.upscaled = s2 ? 'sgsr2' : up && 'sgsr1'; HD.info.backend = 'webgl'; HD.info.webgl = this._gpuWhy || ''; }
    }
    if (direct) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); return; }
    c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    if (baking) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-over'; copyFrame(r, c, 0, 0, ow, oh, 0, 0, c.canvas.width, c.canvas.height); }
    else copyFrame(r, c, 0, 0, ow, oh, 0, 0, w, h);
    c.restore();
  }
}

/* ---------- WebGPU (gpu.js, hd3d-gpu.js) ---------- */
// A view draws on WebGPU when the player switched it on, it's ready, and everything in the view has a
// WebGPU version so far. Anything else keeps the view on WebGL: game effects (gs.fx3d), GPU particles,
// contact shadows, reflections, sun shafts, light probes, a sky's own reflections, cloud shadows and
// rain on the air, and any material with its own shader (ShaderMaterial or a shader patch that isn't
// one of the kit's ported look effects). docs/webgpu-move.md lists what's left to port.
const PORTED_LOOKS = new Set(['air', 'pulse', 'ground', 'hills', 'rock', 'leaves', 'room', 'flow', 'lava']);
// kit ShaderMaterials with a node material twin (hd3d-gpu.js gpuMaterials; material.userData.gsGpu)
const GPU_TWINS = new Set(['skyDome']);
// (gs.props' InstancedMesh2 puts a material's own onBeforeCompile back as an own property after each draw: not a shader of its own)
const BASE_OBC = Object.getPrototypeOf(MeshBasicMaterial.prototype).onBeforeCompile;
function materialFits(m) {
  if (!m) return true;
  if (m.isShaderMaterial || m.isRawShaderMaterial) return GPU_TWINS.has(m.userData.gsGpu);
  if (Object.hasOwn(m, 'onBeforeCompile') && m.onBeforeCompile !== BASE_OBC) { const l = looksOf(m); return l.length > 0 && l.every(n => PORTED_LOOKS.has(n)); }
  return true;
}
/** '' if every part of this view has a WebGPU version, else what keeps it on WebGL (HD.info.webgl). */
export function gpuFits(v) {
  const T = tier();
  if (v.extras?.length) return 'screen effects (gs.fx3d)';
  if (v.probes.length) return 'light probes';
  if (v.env && !v.envSrc) return 'sky reflections (a texture of its own)';
  if (T.ssr && v.reflectors.length) return 'reflections';
  let why = '';
  // (every frame: no array is made per thing, so the walk leaves no garbage behind)
  const no = (o, m) => { why = `a material with its own shader (${m.type}${o.name ? ' on ' + o.name : ''})`; };
  v.scene.traverse(o => {
    const ms = o.material; if (why || !ms || o.userData.gsTwin) return;
    if (!Array.isArray(ms)) { if (!materialFits(ms)) no(o, ms); return; }
    for (let i = 0; i < ms.length; i++) if (!materialFits(ms[i])) { no(o, ms[i]); break; }
  });
  return why;
}
// asked every frame (a quick walk over the scene), so a game that adds an effect mid-round moves back to WebGL before it draws
function gpuFor(v) {
  const G = webgpu(); if (!G) { v._onGpu = false; return null; }
  v._gpuWhy = gpuFits(v); v._onGpu = !v._gpuWhy;
  return v._gpuWhy ? null : G;
}
// swap each view's parts between their WebGL and WebGPU versions (particles: points or sprites)
const gpuLooked = new WeakSet(), gpuTwins = new WeakMap(), sunRoles = new WeakMap();
// kit ShaderMaterials (GPU_TWINS) swapped for their node material twin on WebGPU, and back
function swapTwins(scene, G) {
  scene.traverse(o => {
    if (!o.isMesh) return;
    const gl = o.userData.gsGlMat || o.material;
    if (!gl?.userData?.gsGpu) return;
    if (G) {
      let tw = gpuTwins.get(gl); if (tw?.r !== G.r) gpuTwins.set(gl, tw = { r: G.r, m: G.fx.gpuMaterials[gl.userData.gsGpu](gl) });
      o.userData.gsGlMat = gl; o.material = tw.m;
    } else if (o.userData.gsGlMat) { o.material = gl; delete o.userData.gsGlMat; }
  });
}
function gpuSwap(v, G) {
  swapTwins(v.scene, G);
  // shadow maps: each renderer keeps its own. WebGL drew into WebGPU's map when it found one on the light
  // (and the other way round), which made WebGPU remake it in the middle of a frame that still used it:
  // that frame was lost, and every frame after it while the old one stayed bound
  // skeletons: WebGL pads a skeleton's bone matrices out to a square texture (15 bones: 16 matrices),
  // which overflows the bone buffer WebGPU made for the real count. Back on WebGPU they're cut back to
  // the bones (WebGL pads them again when it next needs its texture)
  v.scene.traverse(o => {
    const sk = G && o.isSkinnedMesh && o.skeleton;
    if (sk?.boneTexture) { const n = sk.bones.length * 16; sk.boneTexture.dispose(); sk.boneTexture = null; if (sk.boneMatrices.length !== n) sk.boneMatrices = sk.boneMatrices.slice(0, n); }
    const sh = o.isLight && o.shadow; if (!sh?.map) return;
    if (G) { if (sh.map.isWebGLRenderTarget) { sh.map.dispose(); sh.map = sh.gpuMap || null; } }
    else if (!sh.map.isWebGLRenderTarget) { sh.gpuMap = sh.map; sh.map = null; }
  });
  // materials with a named look that has a WebGPU version (PORTED_LOOKS): set its nodes before
  // three first turns the material into a node material (it copies them over); with the air on, lit
  // standard materials also get wet in the rain (AIR_WET)
  const look = (o, m) => {
    if (!m || gpuLooked.has(m) || m.isNodeMaterial) return;
    gpuLooked.add(m);
    for (const n of looksOf(m)) G.fx.gpuLooks[n]?.(m, lookSpec(m, n), o);
    if (seeThrough3d(o)) G.fx.noAO(m);
    if (v._air && m.isMeshStandardMaterial && m.fog !== false) G.fx.gpuWet(m, o, AIR);
  };
  if (G) v.scene.traverse(o => {   // (every frame: no array is made per thing)
    if (!o.isMesh) return;
    const ms = o.material;
    if (Array.isArray(ms)) { for (let i = 0; i < ms.length; i++) look(o, ms[i]); } else look(o, ms);
  });
  // gs.props (InstancedMesh2): plain instanced twins on WebGPU (hd3d-gpu.js gpuProps)
  // (listed first: adding and removing the twins while walking the scene skipped things and threw)
  const props = []; v.scene.traverse(o => { if (o.isInstancedMesh2 && !o._parentLOD) props.push(o); });
  for (const o of props) {
    const ud = o.userData;
    if (G) {
      if (ud.gpuTwin?.r !== G.r) { ud.gpuTwin?.group.removeFromParent(); ud.gpuTwin = { r: G.r, ...G.fx.gpuProps(o) }; }
      if (o.parent && ud.gpuTwin.group.parent !== o.parent) o.parent.add(ud.gpuTwin.group);
      if (!ud.gpuHid) { ud.gpuHid = true; ud.gpuWasVisible = o.visible; }
      o.visible = false; ud.gpuTwin.group.visible = ud.gpuWasVisible;
    } else if (ud.gpuHid) { o.visible = ud.gpuWasVisible; ud.gpuHid = false; ud.gpuTwin?.group.removeFromParent(); }
  }
  for (const s of v.sims || []) s.gpuStep(G);   // simulations with a compute twin (gs.outdoors FloodWater)
  for (const p of v.parts) {
    if (G) {
      const tw = p.gpuTwin?.r === G.r ? p.gpuTwin : (p.gpuTwin = { r: G.r, ...(p.makeTwin ? p.makeTwin(G) : G.fx.gpuParticles(p)) });
      if (p.pts.parent) { p.pts.parent.add(tw.sprite); p.pts.removeFromParent(); }
      if (p.stepGpu) p.stepGpu(G); else tw.sync(p.n || 0);
    } else if (p.gpuTwin?.sprite.parent) { p.gpuTwin.sprite.parent.add(p.pts); p.gpuTwin.sprite.removeFromParent(); }
  }
}
const gpuEnvs = new WeakMap();
const gpuEnv = G => { let e = gpuEnvs.get(G); if (!e) { e = G.fx.studioEnv(G.r); gpuEnvs.set(G, e); } return e; };
const gpuAirs = new WeakMap();
const gpuAir = G => { let a = gpuAirs.get(G); if (!a) { a = G.fx.airNodes(AIR); gpuAirs.set(G, a); } return a; };

/* ---------- showing the 3D canvas on the card ---------- */
// The 3D canvas (and, for AR, the camera video under it) sits inside the card's screen, right before
// the card's own canvas, filling the same box (CSS .hd-layer). The card's canvas stays on top for the
// HUD and takes all the touches.
let host = null, lastView = null, GS2 = null;   // GS2: SGSR 2's frame numbers on WebGPU
// Pictures of cards that finished getting ready (prepare) wait here and are drawn into their cards
// just before the playing card's next frame, which then redraws the shared 3D canvas.
const bakes = [];
// A card's picture before it's played is drawn with fewer pixels (it's copied off the graphics chip,
// which costs in proportion): its first live frame, once it's on screen and still, is full quality.
const PIC_PX = .6e6;
const idle = () => new Promise(res => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => res(), { timeout: 200 }) : setTimeout(res, 16)));
// A card's shaders finish compiling whenever they do, often while the next swipe is under way or a
// round has started: its picture waits until the feed is still and no round is being played.
function bakeLater(view, c) {
  if (speed.busy() || speed.playing()) { setTimeout(() => { if (c.canvas.isConnected && host?.canvas !== c.canvas) bakeLater(view, c); }, 250); return; }
  if (host && host.canvas.isConnected && performance.now() - (host.view.drawnAt || 0) < 300) { bakes.push([view, c]); return; }
  // no 3D game is being played: give the card that holds the 3D canvas its own last picture, take the
  // canvas off it, and draw this card's picture
  const r = renderer(); if (!r) return;
  if (host) { const old = host; host = null; if (old.canvas.isConnected) try { old.view.bake(old.ctx); } catch (_) { /* best effort */ } old.canvas.classList.remove('hd-host'); old.under?.remove(); }
  r.domElement.remove(); webgpu()?.r.domElement.remove();
  try { view.bake(c, true); } catch (_) { /* best effort */ }
}
function mount(cv, c, view) {
  const hc = c.canvas, par = hc.parentNode, prevUnder = host?.under;
  if (host && host.canvas !== hc) {
    const old = host; host = null;
    // (the card it leaves has just gone off screen: a lighter picture, until it's played again)
    if (old.canvas.isConnected) try { old.view.bake(old.ctx, true); } catch (_) { /* best effort */ }
    old.canvas.classList.remove('hd-host');
  }
  // a view that moved between WebGL and WebGPU: take the other renderer's canvas off this card
  const prev = hc.previousSibling; if (prev && prev !== cv && (prev === R?.domElement || prev === webgpu()?.r.domElement)) prev.remove();
  if (hc.previousSibling !== cv) par.insertBefore(cv, hc);
  cv.classList.add('hd-layer'); hc.classList.add('hd-host');
  const u = view.under || null;
  if (prevUnder && prevUnder !== u) prevUnder.remove();
  if (u) { u.classList.add('hd-layer'); if (cv.previousSibling !== u) par.insertBefore(u, cv); }
  const bg = view.underCss || ''; if (cv._bg !== bg) { cv._bg = bg; cv.style.background = bg; }
  host = { canvas: hc, ctx: c, view, under: u };
  return true;
}

/**
 * Sunlight: a shadow-casting directional light covering a size x size metre box that follows the
 * action (s.follow(x, y, z) each frame; it snaps to shadow texels so edges don't shimmer). For big
 * outdoor levels use s.fit(view, { far, ground }) each frame instead: the shadow then covers just what
 * the camera can see, out to `far` metres, and gets sharper the narrower the view (a zoomed scope gets
 * crisp shadows where it looks). s.aim(x, y, z) points it (the direction towards the sun).
 * Cascades: s.fit(view, { far: 300, near: 40 }) adds a second, much sharper shadow over the first 40 m
 * (high and ultra tiers, with v.air() on), so the grass at your feet and the far hills both get theirs.
 */
// A new shadow map size, set between frames. WebGL makes a new map when the old one is gone. On WebGPU three's
// shadow node keeps its map and resizes it itself, but in the middle of drawing the frame, which throws away
// a texture that frame has already used ("Destroyed texture used in a submit", the frame is lost). So the
// map is resized here, before the frame, and three then finds it the right size.
function shadowSize(sh, n) {
  sh.mapSize.set(n, n);
  if (sh.map?.isWebGLRenderTarget) { sh.map.dispose(); sh.map = null; } else sh.map?.setSize(n, n, sh.map.depth);
}
// the layer things hidden by occlusion culling move to: the view's camera doesn't draw it, shadow cameras do
const OCC_LAYER = 30;
// the layer things wait on while their shaders build (holdNew): nothing draws it
const HOLD_LAYER = 29;
// what makes a thing need its own shader: its materials (and their versions), its kind and its geometry's layout
// (asked for every visible thing every frame: when nothing changed, the answer comes back without
// building any strings, so it leaves no garbage)
const KEYS = new WeakMap();
function sameMats(c, mat, g) {
  if (c.g !== (g?.id ?? '')) return false;
  if (!Array.isArray(mat)) return c.n === -1 && c.m === mat && c.v === mat.version;
  if (c.n !== mat.length) return false;
  for (let i = 0; i < mat.length; i++) if (c.ids[i] !== mat[i].id || c.vs[i] !== mat[i].version) return false;
  return true;
}
function shaderKey(o) {
  const mat = o.material, g = o.geometry, c = KEYS.get(o);
  if (c && sameMats(c, mat, g)) return c.key;
  const ms = Array.isArray(mat) ? mat : [mat];
  const sig = ms.map(m => m.id + '.' + m.version).join(',') + '|' + (g?.id ?? '');
  if (c?.sig === sig) { remember(o, c.sig, c.key, mat, g); return c.key; }
  const key = sig.replace(/\|.*$/, '') + '|' + (o.isSkinnedMesh ? 's' : '') + (o.isInstancedMesh ? 'i' : '') + (o.isBatchedMesh ? 'b' : '') + (o.isPoints ? 'p' : o.isLine ? 'l' : o.isSprite ? 'S' : '') +
    (o.morphTargetInfluences ? 'm' : '') + (g ? '|' + Object.keys(g.attributes).sort().join(',') + (g.index ? '+i' : '') + '|' + Object.keys(g.morphAttributes || {}).join(',') : '');
  remember(o, sig, key, mat, g);
  return key;
}
function remember(o, sig, key, mat, g) {
  const arr = Array.isArray(mat);
  KEYS.set(o, { sig, key, g: g?.id ?? '', n: arr ? mat.length : -1, m: arr ? null : mat, v: arr ? 0 : mat.version,
    ids: arr ? mat.map(m => m.id) : null, vs: arr ? mat.map(m => m.version) : null });
}
export function sun(col = '#fff2d8', i = 3, size = 18, dir = [-.45, 1, .35]) {
  const s = new DirectionalLight(col, i), c = s.shadow.camera, d = new Vector3(...dir).normalize();
  s.castShadow = true; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 120;
  s.shadow.bias = -.0004; s.shadow.normalBias = .04; s.shadow.radius = 2;
  s.setTier = T => { s.tierShadow = T.shadow; s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow * 2) shadowSize(s.shadow, T.shadow * 2); };
  s.dir = d;
  s.aim = (x, y, z) => { if (x?.isVector3) d.copy(x); else d.set(x, y, z); d.normalize(); return s; };
  s.follow = (x, y, z) => {
    if (s.fitted) { s.fitted = false; c.left = c.bottom = -size; c.right = c.top = size; c.near = 1; c.far = 120; c.updateProjectionMatrix(); s.shadow.bias = -.0004; s.shadow.normalBias = .04; }
    const tx = 2 * size / s.shadow.mapSize.x; x = Math.round(x / tx) * tx; z = Math.round(z / tx) * tx;
    s.target.position.set(x, y, z); s.position.set(x + d.x * 50, y + d.y * 50, z + d.z * 50); s.target.updateMatrixWorld();
  };
  s.fit = (view, o = {}) => {
    const r = fitShadow(s, view, o), nf = o.near || 0;
    // a near cascade (high and ultra, with v.air on): a second, sharp shadow over the first `near` metres
    if (nf > 0 && s.castShadow && (s.tierShadow ?? 1024) >= 1024 && s.parent && view._air) {
      let n = s.nearLight;
      if (!n) { n = s.nearLight = new DirectionalLight(); n.name = 'sun-near'; n.dir = d; n.shadow.radius = s.shadow.radius; }
      if (n.parent !== s.parent) s.parent.add(n, n.target);
      n.visible = true; n.castShadow = true; n.color.copy(s.color); n.intensity = s.intensity;
      const ms = s.shadow.mapSize.x; if (n.shadow.mapSize.x !== ms) shadowSize(n.shadow, ms);
      fitShadow(n, view, { ...o, far: nf, around: 0, max: nf * 2 });
      view.cascade = { near: n, far: s, fade: o.fade ?? .06 };
    } else if (s.nearLight?.visible) { s.nearLight.visible = false; view.cascade = null; }
    return r;
  };
  return s;
}
// Fitting the sun's shadow to the view. Rays across the screen find what can be seen: where they meet
// the ground (o.ground(x, z) gives its height) or, without a ground function, the part of each ray
// between the heights o.low and o.high. Those points, and points o.tall metres above them (houses,
// trees, people), are boxed in the light's own frame. The box grows and shrinks in steps and its
// centre snaps to whole shadow texels, so turning the camera doesn't make shadow edges crawl.
// around: k keeps the box to k times the distance to what's in the middle of the view (a scope looking
// across a valley: sharp shadows round the target instead of thin ones over the hills behind it).
const FX = new Vector3(), FY = new Vector3(), FZ = new Vector3(), FP = new Vector3(), FR = new Vector3(), UPV = new Vector3(0, 1, 0);
const step4 = h => 2 ** (Math.ceil(Math.log2(Math.max(h, 1)) * 4) / 4);
function fitShadow(s, view, { far = 250, ground = null, low = -5, high = 30, tall = 20, margin = 3, rays = 5, max = 500, soft = 1, around = 0 } = {}) {
  const cam = view.cam, c = s.shadow.camera, d = s.dir, o = cam.position;
  cam.updateMatrixWorld();
  const reach = (dx, dy, dz, lim) => {   // how far a ray goes before it meets the ground (lim if it doesn't)
    let t = cam.near, prev = t;
    while (t < lim) { const g = ground(o.x + dx * t, o.z + dz * t); if (g != null && o.y + dy * t <= g) break; prev = t; t += .5 + t * .04; }
    if (t >= lim) return lim;
    let a = prev, b = t; for (let k = 0; k < 5; k++) { const m = (a + b) / 2, g = ground(o.x + dx * m, o.z + dz * m); if (g != null && o.y + dy * m <= g) b = m; else a = m; }
    return b;
  };
  if (around > 0 && ground) { FR.set(0, 0, .5).unproject(cam).sub(o).normalize(); const tc = reach(FR.x, FR.y, FR.z, far); if (tc < far) far = Math.min(far, tc * around + margin); }
  FZ.copy(d); FX.crossVectors(UPV, FZ); if (FX.lengthSq() < 1e-8) FX.set(1, 0, 0); FX.normalize(); FY.crossVectors(FZ, FX);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, n = 0;
  const add = p => { const a = p.dot(FX), b = p.dot(FY), e = p.dot(FZ); if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; if (e < z0) z0 = e; if (e > z1) z1 = e; n++; };
  const both = p => { add(p); p.y += tall; add(p); };
  for (let i = 0; i < rays; i++) for (let j = 0; j < rays; j++) {
    FR.set(i / (rays - 1) * 2 - 1, j / (rays - 1) * 2 - 1, .5).unproject(cam).sub(o).normalize();
    if (ground) {
      // out along the ray until it meets the ground (bigger steps further away), then home in
      const t = reach(FR.x, FR.y, FR.z, far);
      if (t >= far && o.y + FR.y * t > high + tall) continue;   // only sky that way
      both(FP.copy(o).addScaledVector(FR, t));
    } else {
      let ta = cam.near, tb = far;
      if (Math.abs(FR.y) > 1e-6) { const t1 = (low - o.y) / FR.y, t2 = (high - o.y) / FR.y; ta = Math.max(ta, Math.min(t1, t2)); tb = Math.min(tb, Math.max(t1, t2)); }
      else if (o.y < low || o.y > high) continue;
      if (ta > tb) continue;
      add(FP.copy(o).addScaledVector(FR, ta)); add(FP.copy(o).addScaledVector(FR, tb));
    }
  }
  if (!n) { const g = ground ? ground(o.x, o.z) ?? o.y : o.y; both(FP.set(o.x, g, o.z)); }
  const msz = s.shadow.mapSize.x || 1024;
  let hx = Math.min(max, step4((x1 - x0) / 2 + margin)), hy = Math.min(max, step4((y1 - y0) / 2 + margin));
  // too big to cover it all: keep the camera's end of it
  let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const ox = o.dot(FX), oy = o.dot(FY);
  if ((x1 - x0) / 2 + margin > hx) cx = Math.min(Math.max(cx, ox - hx + margin), ox + hx - margin);
  if ((y1 - y0) / 2 + margin > hy) cy = Math.min(Math.max(cy, oy - hy + margin), oy + hy - margin);
  const tx = 2 * hx / msz, ty = 2 * hy / msz; cx = Math.round(cx / tx) * tx; cy = Math.round(cy / ty) * ty;
  // the light sits above the tallest thing that could shade what's seen, low suns further off
  const top = Math.ceil((z1 + tall / Math.max(d.y, .05) + 10) / 10) * 10, depth = Math.ceil((top - z0 + 20) / 10) * 10;
  FP.copy(FX).multiplyScalar(cx).addScaledVector(FY, cy).addScaledVector(FZ, top);
  s.position.copy(FP); s.target.position.copy(FP).sub(FZ); s.target.updateMatrixWorld();
  if (c.right !== hx || c.top !== hy || c.far !== depth || !s.fitted) { c.left = -hx; c.right = hx; c.bottom = -hy; c.top = hy; c.near = .5; c.far = depth; c.updateProjectionMatrix(); view.shadowsDirty?.(); }
  s.fitted = true;
  const tex = Math.max(tx, ty); s.shadow.normalBias = tex * 1.2 * soft; s.shadow.bias = -(.03 + tex * .2) / depth;
  return { width: hx * 2, height: hy * 2, texel: tex };
}
/** A shadow-casting spotlight (torch, searchlight) whose shadow follows the quality tier. */
export function spot(col = '#fff2e0', i = 30, dist = 16, angle = .5) {
  const s = new SpotLight(col, i, dist, angle, .55, 1.6);
  s.castShadow = true; s.shadow.bias = -.0004; s.shadow.normalBias = .02; s.shadow.camera.near = .2; s.shadow.radius = 3;
  s.setTier = T => { s.castShadow = T.shadow > 0; if (T.shadow && s.shadow.mapSize.x !== T.shadow) shadowSize(s.shadow, T.shadow); };
  return s;
}


/* ---------- contact shadows ---------- */
// The soft shadow right under things, made the usual way: render what's above the floor from below
// as darkness by height into a small texture, blur it, and lay it on the floor. Cheap and looks
// right for AR (things sit on your real floor) and for Next Gen on phones without real shadows.
export class ContactShadows {
  constructor({ y = 0, size = 8, blur = 2.5, darkness = 1.2, opacity = .55, height = 1.2 } = {}) {
    Object.assign(this, { size, blurAmount: blur, height });
    this.group = new Group(); this.group.position.y = y + .003; this.res = 0;
    this.mat = new MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.plane = new Mesh(new PlaneGeometry(size, size).rotateX(Math.PI / 2), this.mat);
    this.plane.renderOrder = 1; this.plane.scale.y = -1; this.plane.userData.noContact = true; this.group.add(this.plane);
    this.cam = new OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height); this.cam.rotation.x = Math.PI / 2; this.group.add(this.cam);
    this.depth = new MeshDepthMaterial(); this.depth.depthTest = this.depth.depthWrite = false;
    this.depth.userData.dark = { value: darkness };
    this.depth.onBeforeCompile = sh => {
      sh.uniforms.darkness = this.depth.userData.dark;
      sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
    };
    this.hBlur = new ShaderMaterial(HorizontalBlurShader); this.hBlur.depthTest = false;
    this.vBlur = new ShaderMaterial(VerticalBlurShader); this.vBlur.depthTest = false;
    this.quad = new FullScreenQuad(null);
  }
  /** Moves the shadow area to centre on x, z (follow the action in a big level). */
  at(x, z) { this.group.position.x = x; this.group.position.z = z; return this; }
  set(res) {
    if (res === this.res) return;
    this.rt?.dispose(); this.rt2?.dispose(); this.res = res;
    if (!res) { this.rt = this.rt2 = null; this.mat.map = null; return; }
    this.rt = new WebGLRenderTarget(res, res); this.rt.texture.generateMipmaps = false;
    this.rt2 = new WebGLRenderTarget(res, res); this.rt2.texture.generateMipmaps = false;
    this.mat.map = this.rt.texture; this.mat.needsUpdate = true;
  }
  blur(r, amount) {
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture; this.hBlur.uniforms.h.value = amount / 256;
    this.quad.material = this.hBlur; r.setRenderTarget(this.rt2); this.quad.render(r);
    this.vBlur.uniforms.tDiffuse.value = this.rt2.texture; this.vBlur.uniforms.v.value = amount / 256;
    this.quad.material = this.vBlur; r.setRenderTarget(this.rt); this.quad.render(r);
  }
  update(r, scene, res) {
    if (this.enabled === false) res = 0;
    this.set(res); this.plane.visible = !!res; if (!res) return;
    if (this.mat.map !== this.rt.texture) { this.mat.map = this.rt.texture; this.mat.needsUpdate = true; }   // back from WebGPU (hd3d-gpu.js gpuContact)
    // only things that cast shadows go in (not floors, shadow catchers or effects)
    const hidden = [];
    scene.traverseVisible(o => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && (!o.castShadow || o.userData.noContact)) hidden.push(o); });
    for (const o of hidden) o.visible = false;
    const bg = scene.background, fog = scene.fog, prevT = r.getRenderTarget(), clr = r.getClearAlpha(), auto = r.autoClear;
    scene.background = null; scene.fog = null; scene.overrideMaterial = this.depth;
    r.setClearAlpha(0); r.autoClear = true; r.setRenderTarget(this.rt); r.clear(); r.render(scene, this.cam);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
    for (const o of hidden) o.visible = true;
    this.blur(r, this.blurAmount); this.blur(r, this.blurAmount * .4);
    r.setRenderTarget(prevT); r.setClearAlpha(clr); r.autoClear = auto;
  }
}
