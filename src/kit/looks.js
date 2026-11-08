// Outdoor looks for Next Gen worlds: painted ground (meadow, patchwork fields with hedges, lanes,
// forest floor, rock, river mud, puddles), a ring of far hills, rocks with moss, and leaves that sway
// and glow with the sun behind them. Each look is a named patch on a three.js standard material, so
// lighting, shadows, fog and gs.hd's air all still apply.
//
//   const { Land, groundDetail, looks, horizon } = gs.outdoors;
//   const tex = groundDetail();                                   // tiling detail + normal textures, made in code
//   const mat = new THREE.MeshStandardMaterial({ normalMap: tex.normal });
//   const ground = looks.ground(mat, { detail: tex.detail, fields: { angle: .33 }, roads: [[x0, z0, x1, z1]] });
//   land = new Land({ kind: (x, z) => ..., material: mat });
//   land.masks((x, z, y, slope) => [fields, forest, rock, trodden]);   // where each kind of ground goes (0..1)
//   ground.uniforms.wet.value = .8;                                 // puddles in the rain
//
// WebGPU later: every patch goes through lookPatch() and is listed by name in material.userData.gsLooks,
// so a WebGPU path can swap each name for a node. Settings are plain uniforms (named lk..., apart from gs.hd's own gs... ones); the maths is small
// GLSL functions that only use the world position, the normal and the uv (see docs/webgpu-move.md).

import { Color, DataTexture, Float32BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, ShaderChunk, Vector2, Vector3, Vector4 } from 'three';
import { noiseTex } from './hd3d.js';
import { fbm, rng } from './math.js';

const uni = v => (v && typeof v === 'object' && 'value' in v ? v : { value: v });
// colours: '#hex' (sRGB, like everywhere in three) or [r, g, b] in linear light
const col = c => uni(c?.isColor ? c : Array.isArray(c) ? new Color().setRGB(...c) : new Color(c));
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * lookPatch(material, name, { uniforms, world, vertex, fragment, key }): adds a named patch to a
 * three.js material. vertex / fragment: { head: 'declarations', after: { chunk: code }, before: { chunk: code },
 * replace: { chunk: code } } where chunk is a three.js shader chunk name ('color_fragment'). world: true
 * gives the shaders vec3 vGsWorld (world position, instancing included). Several looks stack on one
 * material; material.userData.gsLooks lists them. Returns the uniforms.
 */
export function lookPatch(m, name, { uniforms = {}, world = false, vertex = {}, fragment = {}, key = '' } = {}) {
  const ud = m.userData; if (!ud.gsLooks) { ud.gsLooks = []; ud.gsPatches = []; install(m); }
  ud.gsLooks.push(name); ud.gsPatches.push({ name, uniforms, world, vertex, fragment, key });
  return uniforms;
}
const edit = (src, { head = '', after = {}, before = {}, replace = {} } = {}, isVertex) => {
  for (const [c, code] of Object.entries(replace)) src = src.replace(`#include <${c}>`, code);
  for (const [c, code] of Object.entries(after)) src = src.replace(`#include <${c}>`, `#include <${c}>\n${code}`);
  for (const [c, code] of Object.entries(before)) src = src.replace(`#include <${c}>`, `${code}\n#include <${c}>`);
  if (head) src = isVertex ? head + '\n' + src : src.replace('void main() {', head + '\nvoid main() {');
  return src;
};
function install(m) {
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    base?.call(this, sh, r);
    const P = this.userData.gsPatches;
    if (P.some(p => p.world)) {
      sh.vertexShader = 'varying vec3 vGsWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vGsWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);');
      sh.fragmentShader = 'varying vec3 vGsWorld;\n' + sh.fragmentShader;
    }
    for (const p of P) { Object.assign(sh.uniforms, p.uniforms); sh.vertexShader = edit(sh.vertexShader, p.vertex, true); sh.fragmentShader = edit(sh.fragmentShader, p.fragment, false); }
  };
  m.customProgramCacheKey = function () { return baseKey.call(this) + '|gs:' + this.userData.gsPatches.map(p => p.name + p.key).join('+'); };
}

/* ---------- textures made in code ---------- */
// smooth noise that tiles: size x size values in 0..1
function tileNoise(size, base, oct, seed) {
  const out = new Float32Array(size * size); let amp = 1;
  for (let o = 0; o < oct; o++, amp *= .5) {
    const p = base << o, L = new Float32Array(p * p), R = rng(seed * 131 + o * 17);
    for (let i = 0; i < L.length; i++) L[i] = R();
    for (let y = 0; y < size; y++) {
      const fy = y / size * p, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty), r0 = (yi % p) * p, r1 = ((yi + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x / size * p, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx), x0 = xi % p, x1 = (xi + 1) % p;
        const a = L[r0 + x0], b = L[r0 + x1], c = L[r1 + x0], d = L[r1 + x1];
        out[y * size + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp;
      }
    }
  }
  let lo = 1e9, hi = -1e9; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
  return out;
}
function tex(data, size) {
  const t = new DataTexture(data, size, size, RGBAFormat);
  t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
}
const pack4 = (size, ...ch) => { const o = new Uint8Array(size * size * 4); for (let i = 0; i < size * size; i++) for (let k = 0; k < 4; k++) o[i * 4 + k] = Math.max(0, Math.min(1, ch[k][i])) * 255; return o; };
function normalsOf(h, size, k = 3) {
  const out = new Uint8Array(size * size * 4), at = (x, y) => h[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx / l * .5 + .5) * 255; out[i + 1] = (-dy / l * .5 + .5) * 255; out[i + 2] = (1 / l * .5 + .5) * 255; out[i + 3] = 255;
  }
  return tex(out, size);
}
const cache = new Map();
/**
 * groundDetail({ seed }): tiling textures for close-up ground and rock, made in code (about 60 ms, once
 * per seed). detail: r grass blades and clumps, g pebbles and dirt, b cracks, a broad clumps. normal:
 * bumps to match (use as a normalMap with repeat). ripple: a soft normal map for puddles and water.
 * The textures are shared: clone() one before changing its repeat.
 */
export function groundDetail({ seed = 21 } = {}) {
  if (cache.has(seed)) return cache.get(seed);
  const S = 256, n = S * S, R = rng(seed);
  const clump = tileNoise(S, 8, 4, 5), fine = tileNoise(S, 64, 2, 6), mid = tileNoise(S, 24, 3, 7);
  const blades = new Float32Array(n), peb = new Float32Array(n), crack = new Float32Array(n);
  const put = (a, x, y, v) => { const i = ((y % S + S) % S) * S + ((x % S + S) % S); if (v > a[i]) a[i] = v; };
  for (let i = 0; i < 3400; i++) { let x = R() * S, y = R() * S; const a = R() * Math.PI * 2, len = 2 + R() * 5, v = .35 + R() * .65; for (let k = 0; k < len; k++) { put(blades, x | 0, y | 0, v * (1 - k / len * .6)); x += Math.cos(a); y += Math.sin(a); } }
  for (let i = 0; i < 800; i++) { const cx = R() * S, cy = R() * S, r = .8 + R() * 2.4, v = .3 + R() * .7; for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) { const d = Math.hypot(xx, yy) / r; if (d < 1) put(peb, (cx + xx) | 0, (cy + yy) | 0, v * (1 - d * d)); } }
  const G = 8, pts = []; for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push([(gx + R()) * S / G, (gy + R()) * S / G]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = Math.floor(x / S * G), cy = Math.floor(y / S * G); let f1 = 1e9, f2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const gx = (cx + i + G) % G, gy = (cy + j + G) % G, [px, py] = pts[gy * G + gx], ox = (cx + i - gx) * S / G, oy = (cy + j - gy) * S / G, d = Math.hypot(x - px - ox, y - py - oy); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
    crack[y * S + x] = Math.min(1, (f2 - f1) / 5);
  }
  const det = [new Float32Array(n), new Float32Array(n), new Float32Array(n), clump], h = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    det[0][i] = clump[i] * .45 + blades[i] * .4 + fine[i] * .15; det[1][i] = mid[i] * .5 + peb[i] * .5; det[2][i] = crack[i] * .65 + mid[i] * .35;
    h[i] = clump[i] * .7 + blades[i] * .35 + peb[i] * .6 + mid[i] * .4;
  }
  const out = ({ detail: tex(pack4(S, ...det), S), normal: normalsOf(h, S, 2.2), ripple: normalsOf(tileNoise(S, 16, 3, 31), S, 1.2) });
  cache.set(seed, out); return out;
}

/* ---------- the looks ---------- */
const GROUND_FNS = `
float lkHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// patchwork: strips of fields in rotated cells; returns the field colour, and the distance to its edge in w
vec4 lkFields(vec2 wp, vec4 dt, vec4 dt2, vec3 grass) {
  float A = lkFieldAngle; vec2 fp = vec2(cos(A) * wp.x - sin(A) * wp.y, sin(A) * wp.x + cos(A) * wp.y);
  fp.x += lkHash(vec2(floor(fp.y / lkFieldSize.y), 3.1)) * lkFieldSize.x;
  vec2 cell = floor(fp / lkFieldSize), f = fract(fp / lkFieldSize);
  float ns = 1. + floor(lkHash(cell) * 3.), si = floor(f.y * ns), sf = fract(f.y * ns), kind = lkHash(cell * 1.7 + si * 13.3 + 2.);
  float edge = min(min(f.x, 1. - f.x) * lkFieldSize.x, min(sf, 1. - sf) * lkFieldSize.y / ns);
  float fz = fp.y * lkFurrows, fur = mix(.5, .5 + .5 * sin(fz), clamp(1. - fwidth(fz) * .35, 0., 1.));
  vec3 c;
  if (kind < .34) c = mix(lkGrassA, lkGrassB, lkHash(cell + 9.)) * (.8 + .4 * dt.r);
  else if (kind < .58) c = lkCropA * (.84 + .26 * fur + .25 * (dt.r - .5)) * (.92 + .16 * lkHash(cell + 2.));
  else if (kind < .72) c = lkPlough * (.66 + .55 * fur) * (.88 + .24 * dt.g);
  else if (kind < .86) c = mix(lkPlough, lkGrassB * 1.1, fur * .85) * (.9 + .2 * dt.r);
  else c = lkCropB * (.84 + .2 * fur + .2 * (dt.g - .5));
  float hw = (lkHedge.w + .7 * dt2.a) * step(.22, lkHash(cell + 4.4)), hedge = 1. - smoothstep(hw - .4, hw + .3, edge);
  c = mix(c, grass, (1. - smoothstep(hw + .3, hw + 1.7, edge)) * .85);
  c = mix(c, lkHedge.rgb * (.55 + .8 * dt.r), hedge);
  return vec4(c, edge);
}
float lkRoadDist(vec2 p) {
  float rd = 1e4;
#if GS_ROADS > 0
  for (int i = 0; i < GS_ROADS; i++) { vec4 s = lkRoads[i]; vec2 pa = p - s.xy, ba = s.zw - s.xy; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); rd = min(rd, length(pa - ba * h)); }
#endif
  return rd;
}`;
const GROUND_COLOUR = `
  float lkRough;
  { vec3 wp = vGsWorld; vec4 dt = texture2D(lkDetail, wp.xz * lkScale.x), dt2 = texture2D(lkDetail, wp.xz * lkScale.y + .37), nz = texture2D(lkNoise, wp.xz * lkScale.z);
    vec3 grass = mix(lkGrassA, lkGrassB, smoothstep(.25, .75, nz.r));
    grass = mix(grass, lkDry, smoothstep(.55, .85, nz.g) * .65) * (.74 + .5 * dt.r * (.7 + .6 * dt2.a));
    vec3 c = grass; lkRough = .95;
    float farm = vGsMask.x * smoothstep(.3, .5, nz.b + .25);
    if (farm > .01) c = mix(c, lkFields(wp.xz, dt, dt2, grass).rgb, farm);
    c = mix(c, lkForest * (.65 + .55 * dt.a) * (.85 + .3 * dt.g), vGsMask.y);
    float rk = smoothstep(.35, .7, vGsMask.z + (dt2.b - .5) * .5);
    c = mix(c, lkRock * (.6 + .65 * dt.b), rk); lkRough = mix(lkRough, .8, rk);
    c = mix(c, mix(grass, lkDirt, .75) * (.8 + .4 * dt.g), vGsMask.w * smoothstep(.25, .6, dt2.r + nz.a * .4));
    float bank = 1. - smoothstep(lkBank.x, lkBank.y, wp.y + (dt2.r - .5) * 1.2);
    c = mix(c, lkMud * (.65 + .6 * dt.g), bank); lkRough = mix(lkRough, .45, bank * smoothstep(lkBank.z, lkBank.w, wp.y));
    float rd = lkRoadDist(wp.xz) + (dt2.g - .5) * .9, road = 1. - smoothstep(lkRoad.x, lkRoad.y, rd), ruts = smoothstep(.42, .06, abs(rd - lkRoad.z)), crown = 1. - smoothstep(.2, .55, rd);
    vec3 rc = mix(lkDirt * (.8 + .38 * dt.g) * (1. - ruts * .3), grass * .85, crown * .6);
    c = mix(c, rc, road); lkRough = mix(lkRough, .88, road);
    float pud = lkWet * smoothstep(.62, .7, dt2.a * .6 + ruts * road * .5 + nz.g * .3);
    c *= 1. - pud * .45; lkRough = mix(lkRough, .04, pud);
    diffuseColor.rgb = c; }`;

/**
 * looks.ground(material, o): painted ground in world metres. Needs land.masks(...) on the Land that
 * uses the material (fields, forest floor, rock, trodden earth, each 0..1). o: detail (groundDetail().detail),
 * colours: { grassA, grassB, dry, dirt, mud, rock, forest, cropA, cropB, plough, hedge }, fields:
 * { angle, size: [w, d], furrows, hedge } (or false), roads: [[x0, z0, x1, z1], ...] with road:
 * { width, ruts }, bank: { low, high } (mud below this height, shiny lower still), wet: 0..1 (puddles),
 * scale: [close, broad, noise] texture sizes. Returns its uniforms (set .wet.value as it rains).
 */
function ground(m, { detail = groundDetail().detail, colours = {}, fields = {}, roads = [], road = {}, bank = {}, wet = 0, scale = [.26, .047, .0041] } = {}) {
  const C = { grassA: '#55702f', grassB: '#7d8a3c', dry: '#a59a5a', dirt: '#8a7556', mud: '#4a3f30', rock: '#8b877c', forest: '#3e3a26', cropA: '#c2a052', cropB: '#b9a676', plough: '#6a5136', hedge: '#2f4422', ...colours };
  const F = fields === false ? null : { angle: .33, size: [56, 34], furrows: 7, hedge: 1.2, ...fields };
  const nr = roads.length, b = { low: -1.1, high: .8, shiny: -.6, shinier: -1.3, ...bank }, rd = { width: 2.3, edge: .8, ruts: 1.05, ...road };
  const U = {
    lkDetail: uni(detail), lkNoise: uni(noiseTex()), lkWet: uni(wet), lkScale: uni(new Vector3(...scale)),
    lkGrassA: col(C.grassA), lkGrassB: col(C.grassB), lkDry: col(C.dry), lkDirt: col(C.dirt), lkMud: col(C.mud), lkRock: col(C.rock), lkForest: col(C.forest),
    lkCropA: col(C.cropA), lkCropB: col(C.cropB), lkPlough: col(C.plough), lkHedge: uni(new Vector4(...col(C.hedge).value.toArray(), F ? F.hedge : 0)),
    lkFieldAngle: uni(F ? F.angle : 0), lkFieldSize: uni(new Vector2(...(F ? F.size : [56, 34]))), lkFurrows: uni(F ? F.furrows : 7),
    lkBank: uni(new Vector4(b.low, b.high, b.shiny, b.shinier)), lkRoad: uni(new Vector3(rd.width, rd.width + rd.edge, rd.ruts)),
    lkRoads: uni(nr ? roads.map(s => new Vector4(...s)) : [new Vector4()]),
  };
  const decl = `#define GS_ROADS ${nr}
uniform sampler2D lkDetail, lkNoise; uniform float lkWet, lkFieldAngle, lkFurrows; uniform vec3 lkScale, lkRoad; uniform vec2 lkFieldSize; uniform vec4 lkHedge, lkBank, lkRoads[${Math.max(1, nr)}];
uniform vec3 lkGrassA, lkGrassB, lkDry, lkDirt, lkMud, lkRock, lkForest, lkCropA, lkCropB, lkPlough; varying vec4 vGsMask;`;
  lookPatch(m, 'ground', {
    uniforms: U, world: true, key: nr + (F ? 'f' : ''),
    vertex: { head: 'attribute vec4 gsMask; varying vec4 vGsMask;', after: { begin_vertex: '  vGsMask = gsMask;' } },
    fragment: { head: decl + GROUND_FNS, replace: { color_fragment: F ? GROUND_COLOUR : GROUND_COLOUR.replace('if (farm > .01)', 'if (false)'), roughnessmap_fragment: 'float roughnessFactor = lkRough;' } },
  });
  return { uniforms: U, get wet() { return U.lkWet.value; }, set wet(v) { U.lkWet.value = v; } };
}

/**
 * looks.hills(material, o): far hillsides that keep their texture through a scope: woods, clearings
 * and bare scree drawn from noise over the vertex colours. o: wood (colour), scale (noise size), woods 0..1.
 */
function hills(m, { wood = [.035, .05, .022], scale = .0019, woods = .55 } = {}) {
  const U = { lkNoise: uni(noiseTex()), lkWood: col(wood), lkHillScale: uni(scale), lkWoods: uni(woods) };
  lookPatch(m, 'hills', {
    uniforms: U, world: true,
    fragment: {
      head: 'uniform sampler2D lkNoise; uniform vec3 lkWood; uniform float lkHillScale, lkWoods;',
      after: { color_fragment: `  { vec3 wp = vGsWorld; vec4 n = texture2D(lkNoise, wp.xz * lkHillScale), m = texture2D(lkNoise, wp.xz * lkHillScale * 5.8 + .31), q = texture2D(lkNoise, wp.xz * lkHillScale * 37. + .7);
    float bare = smoothstep(.62, .85, diffuseColor.b / max(diffuseColor.r, 1e-3)), wood = smoothstep(lkWoods - .05, lkWoods + .05, n.g * .75 + m.r * .4) * (1. - bare);
    diffuseColor.rgb *= .78 + .4 * m.b;
    diffuseColor.rgb = mix(diffuseColor.rgb, lkWood * (.55 + .9 * q.r), wood);
    diffuseColor.rgb *= 1. - bare * .35 * smoothstep(.4, .7, q.g); }` },
    },
  });
  return { uniforms: U };
}

/**
 * looks.rock(material, o): grit and cracks mapped three ways (no stretching up the sides) over the
 * rock's own colour, and moss where the top faces the sky. o: detail, scale, moss (colour), mossy 0..1.
 */
function rock(m, { detail = groundDetail().detail, scale = .7, moss = [.07, .09, .03], mossy = .85 } = {}) {
  const U = { lkDetail: uni(detail), lkRockScale: uni(scale), lkMoss: col(moss), lkMossy: uni(mossy) };
  lookPatch(m, 'rock', {
    uniforms: U, world: true,
    fragment: {
      head: 'uniform sampler2D lkDetail; uniform float lkRockScale, lkMossy; uniform vec3 lkMoss;',
      before: { emissivemap_fragment: `  { vec3 wp = vGsWorld, wn = transpose(mat3(viewMatrix)) * normal, w = pow(abs(wn), vec3(4.)); w /= w.x + w.y + w.z;
    vec4 d = texture2D(lkDetail, wp.zy * lkRockScale) * w.x + texture2D(lkDetail, wp.xz * lkRockScale) * w.y + texture2D(lkDetail, wp.xy * lkRockScale) * w.z;
    vec4 e = texture2D(lkDetail, wp.xz * lkRockScale * .13 + .2);
    diffuseColor.rgb *= (.66 + .5 * (d.b * .3 + d.g * .4 + d.a * .3)) * (.85 + .3 * e.a);
    float moss = smoothstep(.55, .85, wn.y + (e.r - .5) * .6);
    diffuseColor.rgb = mix(diffuseColor.rgb, lkMoss * (.7 + .6 * d.r), moss * lkMossy); }` },
    },
  });
  return { uniforms: U };
}

/**
 * looks.leaves(material, o): leaf cards that sway in the wind (more towards the top), light through
 * when you look towards the sun, and keep their outline far away (alpha that thins less in the mips).
 * The material wants a map with alphaTest and DoubleSide. o: time, wind, sun (a direction, Vector3)
 * as numbers or shared uniforms ({ value }), sway, above (metres of trunk that don't sway), glow,
 * atlas: [w, h] of the map in texels. Returns its uniforms: set time and wind each frame (or share them).
 */
function leaves(m, { time = 0, wind = .6, sun = new Vector3(0, 1, 0), sway = .012, above = 2, glow = .6, atlas = [1024, 512] } = {}) {
  const U = { lkTime: uni(time), lkWind: uni(wind), lkSun: uni(sun), lkSway: uni(new Vector2(sway, above)), lkGlow: uni(glow), lkAtlas: uni(new Vector2(...atlas)) };
  lookPatch(m, 'leaves', {
    uniforms: U, world: true,
    vertex: {
      head: 'uniform float lkTime, lkWind; uniform vec2 lkSway;',
      after: { project_vertex: `  { vec3 wp = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
    float hh = max(position.y - lkSway.y, 0.), ph = wp.x * .19 + wp.z * .23;
    vec3 sw = vec3(sin(lkTime * 1.7 + ph) + sin(lkTime * 3.1 + ph * 2.3) * .3, 0., cos(lkTime * 1.3 + ph * 1.4)) * lkWind * hh * lkSway.x;
    mvPosition.xyz += mat3(viewMatrix) * sw; gl_Position = projectionMatrix * mvPosition; }` },
    },
    fragment: {
      head: 'uniform vec3 lkSun; uniform float lkGlow; uniform vec2 lkAtlas;',
      replace: { normal_fragment_begin: ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '') },
      before: {
        alphatest_fragment: '  { vec2 lq = vMapUv * lkAtlas; vec2 dx = dFdx(lq), dy = dFdy(lq); diffuseColor.a *= 1. + max(0., .5 * log2(max(dot(dx, dx), dot(dy, dy)))) * .35; }',
        emissivemap_fragment: '  { vec3 vd = normalize(vGsWorld - cameraPosition); diffuseColor.rgb *= 1. + lkGlow * pow(max(dot(vd, lkSun), 0.), 4.); }',
      },
    },
  });
  return { uniforms: U };
}

/** The outdoor looks: ground, hills, rock, leaves (each returns its uniforms). */
export const looks = Object.freeze({ ground, hills, rock, leaves });

/**
 * horizon(land, o): a ring of far hills and mountains round the land (they only need light and haze),
 * with the hills look on. o: inner / outer radius, height (of the tallest ridges), seed, lower(x, z)
 * (0..1 to keep a side low, for a view out), colours: { meadow, forest, rock }, segments, rings, look
 * (options for looks.hills, or false). The ring's inner edge meets the land's own edge.
 */
export function horizon(land, { inner = land.size * .47, outer = land.size * 2, height = 320, seed = 9, lower = null, colours = {}, segments = 72, rings = 12, look = {} } = {}) {
  const half = land.size / 2 - 2, C = { meadow: '#6a7240', forest: '#3d4a2c', rock: '#7d7f78', ...colours };
  const pos = [], cols = [], idx = [], c = new Color(), meadow = new Color(C.meadow), forest = new Color(C.forest), rockC = new Color(C.rock);
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, f = j / rings, r = inner + (outer - inner) * f * f, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const inside = Math.abs(x) < half && Math.abs(z) < half;
    const ridge = (fbm(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2 + f * 3, 4) * .6 + .4) * (height * .19 + height * .81 * sm(.15, 1, f)) * sm(.02, .35, f);
    const edge = inside ? land.height(x, z) - 4 : land.height(Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, z)));
    const y = inside ? edge : edge + ridge * (lower ? 1 - lower(x, z) : 1);
    pos.push(x, y, z);
    c.copy(meadow).lerp(forest, sm(10, 60, y - edge)).lerp(rockC, sm(140, 260, y)); cols.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) { const a = j * (segments + 1) + i, b = a + segments + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setAttribute('color', new Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  if (look !== false) hills(mat, look);
  const m = new Mesh(g, mat); m.receiveShadow = false; m.userData.noAO = true;
  return m;
}
