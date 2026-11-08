// Long Shadow: a sniper campaign in a made-up 1944 river valley. You are Wren, a lone sharpshooter
// working for Captain Oake's raiders against the Grey Order (a fictional army: no real flags, symbols
// or people). Read the range and the wind, hold your breath and squeeze: bullets drop and drift, so
// you aim above and into the wind. Every shot is loud unless a passing train or the church bell
// covers it. Fire too often from one spot and they find you: squads take cover, close in and call
// down mortars, so you move to the next nest. Hits knock soldiers out: no blood, cartoon KOs.
//
// Kits: gs.hd (the look), gs.outdoors (land, water, trees), gs.props (instanced trees and rocks),
// gs.sky (time of day, rain), gs.poses (soldiers), gs.combat (rifle, health, explosives), gs.tactics
// (cover and squads), gs.ai (paths), gs.brains (the enemy commander learns how you play),
// gs.stealth (bodies get found), gs.missions, gs.cutscene, gs.prompts, gs.gadgets (zip line),
// gs.destruction (the watchtower) and gs.campaign (stars and saves).
import gs from '../gamescroll.js';
const { sounds, noise, tone } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { fbm, rng, noise3 } = gs.math;
const { Juice } = gs.juice;
const { HDView, Particles, pbr, rbox, sun, surface, speckle, noiseTex, THREE } = gs.hd;
const { Land, Water } = gs.outdoors;
const { Props } = gs.props;
const { Sky, Weather } = gs.sky;
const { Rig } = gs.poses;
const { Gun, Health, Explosives } = gs.combat;
const { CoverMap, Squad } = gs.tactics;
const { NavGrid } = gs.ai;
const { Brain, Wave } = gs.brains;
const { Bodies } = gs.stealth;
const { Mission } = gs.missions;
const { Cutscene } = gs.cutscene;
const { Prompts } = gs.prompts;
const { Zipline } = gs.gadgets;
const { Campaign } = gs.campaign;
const { shatter } = gs.destruction;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, BoxGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry, SphereGeometry, CapsuleGeometry, TorusGeometry, Color } = THREE;

let W = 300, H = 420;
const TAU = Math.PI * 2;
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------------ ballistics
// A slow round (game ballistics) so drop and wind matter at 150-350 m. The rifle is zeroed at 100 m.
const V0 = 430, GRAV = 9.8, WIND_K = 1.2, ZERO = 100;
const dropAt = d => .5 * GRAV * (d / V0) ** 2;
const BORE = dropAt(ZERO) / ZERO;
const holdAt = d => (dropAt(d) - BORE * d) / d;              // radians to aim above the target at range d
const driftAt = (d, w) => .5 * WIND_K * w * (d / V0) ** 2 / d; // radians to aim into the wind at range d

// ------------------------------------------------------------------ the valley
// x runs west to east, z south (+) to north (-), y up. The river winds along x; the Ashvale ridge is
// south (your side), the village of Larkford and the rail line north, a stream and dam north-east.
const RIVER = x => 6 * Math.sin(x * .011);
const RAILZ = -42, RAILH = 4.6, STREAMX = 140;
function shape(x, z) {
  // the ridge rises concave (steeper near the top) so the nests up there see down into the valley
  let h = 2 + 30 * clamp((z - 20) / 150, 0, 1) ** 1.6 - sm(190, 300, z) * 14 + sm(-38, -62, z) * 4 + sm(-165, -300, z) * 40;
  const town = 1 - sm(60, 95, Math.hypot(x + 15, z + 108));
  h += fbm(x * .011 + 3, z * .011 - 2, 4) * 6 * (1 - town * .85) * (1 - .85 * sm(20, 120, z));
  h += Math.max(0, x - 200) * .12 + Math.max(0, -x - 230) * .1;
  const sx = Math.abs(x - STREAMX), stream = (1 - sm(5, 22, sx)) * sm(-30, -60, z);
  h -= stream * 9;
  const rz = Math.abs(z - RIVER(x)); h -= 6.5 * (1 - sm(5, 15, rz));
  const rk = (1 - sm(5, 12, Math.abs(z - RAILZ))) * sm(10, 24, sx);
  h = lerp(h, RAILH - .4, rk);
  return h;
}
const ROADS = [
  [[40, 26], [52, 70], [60, 118], [44, 175]],                       // south road up to the ridge
  [[40, -18], [28, -60], [-12, -96], [-80, -104], [-230, -112]],    // bridge to Larkford and west
  [[-12, -96], [60, -84], [130, -72], [240, -78]],                  // east road (trucks come this way)
];
function roadD(x, z) {
  let best = 99;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) best = d;
  }
  return best;
}
// houses: [x, z, w, d, h, turned]
const HOUSES = [
  [-45, -80, 10, 7, 6, 0], [-42, -128, 9, 8, 7, 1], [8, -132, 11, 7, 6, 0], [22, -94, 9, 7, 5, 1], [-62, -112, 8, 8, 6, 0],
  [-2, -78, 8, 6, 5, 0], [36, -116, 10, 8, 6, 1], [-82, -88, 9, 7, 5, 1], [56, -98, 8, 7, 5, 0], [-55, -150, 10, 7, 6, 0],
  [28, -152, 8, 8, 5, 1], [-100, -120, 8, 7, 5, 0],
];
const CHURCH = { x: -15, z: -122, tz: -108 };
const MILL = { x: 70, z: -21 };
const BRIDGE = { x: 40, z0: -17, z1: 22, y: 5.2 };
// nests: where Wren can lie up
const NESTS = {
  ridge: { name: 'Ridge rocks', x: 2, z: 160, up: 1.0, face: { x: 20, z: -80 } },
  tower: { name: 'Water tower', x: -128, z: -54, up: 13.1, face: { x: 0, z: -100 } },
  chapel: { name: 'Chapel belfry', x: 78, z: 76, up: 12.2, face: { x: 20, z: -60 } },
  mill2: { name: 'Windmill', x: -112, z: 116, up: 8.8, face: { x: 0, z: -80 } },
};
const LANDMARKS = [['Mill', MILL.x, 4, MILL.z], ['Church', CHURCH.x, 22, CHURCH.tz], ['Bridge', BRIDGE.x, 5, 0], ['Rail', 140, 6, RAILZ], ['Dam', STREAMX, 22, -205]];

// grid for paths and cover: 4 m cells over most of the valley
const CELL = 4, GX0 = -200, GZ0 = -180, GC = 110, GR = 90;

// ------------------------------------------------------------------ the look
// Everything here is painted or grown in code the first time the valley is built. The engine gives
// the light its mood (gs.hd: sun shadows fitted to the view, air with haze, valley mist and cloud
// shadows, a colour grade and sun glare; gs.sky: clouds and the sky's own light). The game paints the
// ground (patchwork fields, hedges, rutted lanes, mud by the river, puddles in the rain), grows the
// trees (cards of painted leaves that sway in the wind) and builds the village.
const GU = { uTime: { value: 0 }, uWet: { value: 0 }, uWind: { value: .6 }, uSun: { value: new Vector3(0, 1, 0) } };
// smooth noise that tiles: size x size values in 0..1
function pfbm(size, base, oct, seed) {
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
function dataTex(data, w, h = w, { srgb = false, clampEdge = false } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
}
const pack4 = (size, ...ch) => { const o = new Uint8Array(size * size * 4); for (let i = 0; i < size * size; i++) for (let k = 0; k < 4; k++) o[i * 4 + k] = clamp(ch[k][i], 0, 1) * 255; return o; };
// a normal map from a height field that wraps
function normalsOf(h, size, k = 3) {
  const out = new Uint8Array(size * size * 4), at = (x, y) => h[((y + size) % size) * size + (x + size) % size];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx / l * .5 + .5) * 255; out[i + 1] = (-dy / l * .5 + .5) * 255; out[i + 2] = (1 / l * .5 + .5) * 255; out[i + 3] = 255;
  }
  return dataTex(out, size);
}
// ground detail: r grass blades and clumps, g pebbles and dirt, b cracks for rock, a broad clumps
function groundTextures() {
  const S = 256, n = S * S, R = rng(21);
  const clump = pfbm(S, 8, 4, 5), fine = pfbm(S, 64, 2, 6), mid = pfbm(S, 24, 3, 7);
  const blades = new Float32Array(n), peb = new Float32Array(n), crack = new Float32Array(n);
  const put = (a, x, y, v) => { const i = ((y % S + S) % S) * S + ((x % S + S) % S); if (v > a[i]) a[i] = v; };
  for (let i = 0; i < 3400; i++) { let x = R() * S, y = R() * S; const a = R() * TAU, len = 2 + R() * 5, v = .35 + R() * .65; for (let k = 0; k < len; k++) { put(blades, x | 0, y | 0, v * (1 - k / len * .6)); x += Math.cos(a); y += Math.sin(a); } }
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
  return { detail: dataTex(pack4(S, ...det), S), normal: normalsOf(h, S, 2.2), ripple: normalsOf(pfbm(S, 16, 3, 31), S, 1.2) };
}
// the ground: meadow, patchwork fields with hedges, rutted lanes, forest floor, rock, mud by the river
const ROADSEGS = ROADS.flatMap(r => r.slice(0, -1).map((p, i) => [p[0], p[1], r[i + 1][0], r[i + 1][1]]));
const GROUND_FRAG = `
uniform sampler2D uDetail, uNoise; uniform vec4 uRoads[${ROADSEGS.length}]; uniform float uWet;
uniform vec3 uGrassA, uGrassB, uDry, uDirt, uMud, uRock, uForest, uWheat, uPlow, uStraw, uHedge;
varying vec4 vMask; varying vec3 vWP;
float lsHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;
const GROUND_COLOUR = `
  vec4 dt = texture2D(uDetail, vWP.xz * .26), dt2 = texture2D(uDetail, vWP.xz * .047 + .37), nz = texture2D(uNoise, vWP.xz * .0041);
  vec3 grass = mix(uGrassA, uGrassB, smoothstep(.25, .75, nz.r));
  grass = mix(grass, uDry, smoothstep(.55, .85, nz.g) * .65) * (.74 + .5 * dt.r * (.7 + .6 * dt2.a));
  vec3 col = grass; float rough = .95;
  float farm = vMask.x * smoothstep(.3, .5, nz.b + .25);
  if (farm > .01) {
    const float A = .33;
    vec2 fp = vec2(cos(A) * vWP.x - sin(A) * vWP.z, sin(A) * vWP.x + cos(A) * vWP.z);
    fp.x += lsHash(vec2(floor(fp.y / 34.), 3.1)) * 60.;
    vec2 cell = floor(fp / vec2(56., 34.)), f = fract(fp / vec2(56., 34.));
    float ns = 1. + floor(lsHash(cell) * 3.), si = floor(f.y * ns), sf = fract(f.y * ns);
    float kind = lsHash(cell * 1.7 + si * 13.3 + 2.);
    float edge = min(min(f.x, 1. - f.x) * 56., min(sf, 1. - sf) * 34. / ns);
    float fz = fp.y * 7.;
    float fur = mix(.5, .5 + .5 * sin(fz), clamp(1. - fwidth(fz) * .35, 0., 1.));
    vec3 c;
    if (kind < .34) c = mix(uGrassA, uGrassB, lsHash(cell + 9.)) * (.8 + .4 * dt.r);
    else if (kind < .58) c = uWheat * (.84 + .26 * fur + .25 * (dt.r - .5)) * (.92 + .16 * lsHash(cell + 2.));
    else if (kind < .72) c = uPlow * (.66 + .55 * fur) * (.88 + .24 * dt.g);
    else if (kind < .86) c = mix(uPlow, uGrassB * 1.1, fur * .85) * (.9 + .2 * dt.r);
    else c = uStraw * (.84 + .2 * fur + .2 * (dt.g - .5));
    float hw = (1.2 + .7 * dt2.a) * step(.22, lsHash(cell + 4.4));
    float hedge = 1. - smoothstep(hw - .4, hw + .3, edge);
    c = mix(c, grass, (1. - smoothstep(hw + .3, hw + 1.7, edge)) * .85);
    c = mix(c, uHedge * (.55 + .8 * dt.r), hedge);
    col = mix(col, c, farm);
  }
  col = mix(col, uForest * (.65 + .55 * dt.a) * (.85 + .3 * dt.g), vMask.y);
  float rockK = smoothstep(.35, .7, vMask.z + (dt2.b - .5) * .5);
  col = mix(col, uRock * (.6 + .65 * dt.b), rockK); rough = mix(rough, .8, rockK);
  col = mix(col, mix(grass, uDirt, .75) * (.8 + .4 * dt.g), vMask.w * smoothstep(.25, .6, dt2.r + nz.a * .4));
  float bank = 1. - smoothstep(-1.1, .8, vWP.y + (dt2.r - .5) * 1.2);
  col = mix(col, uMud * (.65 + .6 * dt.g), bank); rough = mix(rough, .45, bank * smoothstep(-.6, -1.3, vWP.y));
  float rd = 1e4;
  for (int i = 0; i < ${ROADSEGS.length}; i++) { vec4 s = uRoads[i]; vec2 pa = vWP.xz - s.xy, ba = s.zw - s.xy; float hh = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); rd = min(rd, length(pa - ba * hh)); }
  rd += (dt2.g - .5) * .9;
  float road = 1. - smoothstep(2.3, 3.1, rd), ruts = smoothstep(.42, .06, abs(rd - 1.05)), crown = 1. - smoothstep(.2, .55, rd);
  vec3 rc = uDirt * (.8 + .38 * dt.g) * (1. - ruts * .3);
  rc = mix(rc, grass * .85, crown * .6);
  col = mix(col, rc, road); rough = mix(rough, .88, road);
  float pud = uWet * smoothstep(.62, .7, dt2.a * .6 + ruts * road * .5 + nz.g * .3);
  col *= 1. - pud * .45; rough = mix(rough, .04, pud);
  diffuseColor.rgb = col;`;
function groundMat(tex) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, normalMap: tex.normal, normalScale: new THREE.Vector2(.9, .9) });
  tex.normal.repeat.set(170, 170);
  const C = c => ({ value: new Color(c) });
  const uniforms = {
    uDetail: { value: tex.detail }, uNoise: { value: noiseTex() }, uRoads: { value: ROADSEGS.map(s => new THREE.Vector4(...s)) }, uWet: GU.uWet,
    uGrassA: C('#55702f'), uGrassB: C('#7d8a3c'), uDry: C('#a59a5a'), uDirt: C('#8a7556'), uMud: C('#4a3f30'), uRock: C('#8b877c'),
    uForest: C('#3e3a26'), uWheat: C('#c2a052'), uPlow: C('#6a5136'), uStraw: C('#b9a676'), uHedge: C('#2f4422'),
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'attribute vec4 aMask; varying vec4 vMask; varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMask = aMask; vWP = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', GROUND_FRAG + '\nvoid main() {').replace('#include <color_fragment>', GROUND_COLOUR).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rough;');
  };
  m.customProgramCacheKey = () => 'ls-ground';
  return m;
}
// which ground goes where: x fields, y forest floor, z rock, w trodden earth
function landMasks(land) {
  const g = land.mesh.geometry, n = g.attributes.position.count, S = land.size, seg = land.segments, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const cc = i % (seg + 1), rr = Math.floor(i / (seg + 1)), x = -S / 2 + cc * S / seg, z = -S / 2 + rr * S / seg, y = land.height(x, z), sl = land.slope(x, z);
    const town = Math.hypot(x + 15, z + 108), river = Math.abs(z - RIVER(x));
    let farm = sm(.2, .08, sl) * sm(70, 95, town) * sm(16, 26, river) * sm(8, 16, Math.abs(z - RAILZ)) * sm(30, 22, y) * sm(-170, -150, z) * sm(18, 30, Math.hypot(x - MILL.x, z - MILL.z));
    let trod = Math.max(1 - sm(30, 62, town), 1 - sm(9, 20, Math.hypot(x - MILL.x, z - MILL.z)));
    for (const nn of Object.values(NESTS)) { const d = Math.hypot(x - nn.x, z - nn.z); farm *= sm(10, 22, d); trod = Math.max(trod, 1 - sm(3, 8, d)); }
    a[i * 4] = farm; a[i * 4 + 1] = sm(-140, -175, z) * (1 - farm); a[i * 4 + 2] = clamp(sm(.28, .5, sl) + sm(40, 60, y), 0, 1); a[i * 4 + 3] = trod;
  }
  g.setAttribute('aMask', new THREE.BufferAttribute(a, 4));
}
// far hills and mountains all round the valley (they only need light and haze)
function farHills(land) {
  const segs = 72, rings = 12, pos = [], col = [], idx = [], R0 = 300, R1 = 1300, c = new Color(), forest = new Color('#3d4a2c'), rockC = new Color('#7d7f78'), meadow = new Color('#6a7240');
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segs; i++) {
    const a = i / segs * TAU, f = j / rings, r = R0 + (R1 - R0) * f * f, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const inside = Math.abs(x) < 318 && Math.abs(z) < 318;
    const ridge = (fbm(Math.cos(a) * 2.2 + 9, Math.sin(a) * 2.2 + f * 3, 4) * .6 + .4) * (60 + 260 * sm(.15, 1, f)) * sm(.02, .35, f);
    const edge = inside ? land.height(x, z) - 4 : land.height(clamp(x, -318, 318), clamp(z, -318, 318));
    const y = inside ? edge : edge + ridge * (z > 0 && Math.abs(x) < 400 ? .45 : 1);
    pos.push(x, y, z);
    c.copy(meadow).lerp(forest, sm(10, 60, y - edge)).lerp(rockC, sm(140, 260, y)); col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i, b = a + segs + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  // woods, clearings and scree drawn from noise, so they hold up through the scope
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNoise = { value: noiseTex() };
    sh.vertexShader = 'varying vec3 vHW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uNoise; varying vec3 vHW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { vec4 n = texture2D(uNoise, vHW.xz * .0019), m = texture2D(uNoise, vHW.xz * .011 + .31), q = texture2D(uNoise, vHW.xz * .07 + .7);
    float bare = smoothstep(.62, .85, diffuseColor.b / max(diffuseColor.r, 1e-3)), wood = smoothstep(.5, .6, n.g * .75 + m.r * .4) * (1. - bare);
    diffuseColor.rgb *= .78 + .4 * m.b;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.035, .05, .022) * (.55 + .9 * q.r), wood);
    diffuseColor.rgb *= 1. - bare * .35 * smoothstep(.4, .7, q.g); }`);
  };
  mat.customProgramCacheKey = () => 'ls-hills';
  const m = new Mesh(g, mat); m.receiveShadow = false; m.userData.noAO = true;
  return m;
}
// a weathered boulder: a squashed ball pushed in and out by noise, flat underneath, smooth shading
function boulder(size, seed, colour = '#958f84', seg = 20) {
  const g = new SphereGeometry(1, seg, Math.round(seg * .65)), p = g.attributes.position, c = new Color(colour), col = [], R = rng(seed), o = R() * 40, sq = .55 + R() * .2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = noise3(x * 1.2 + o, y * 1.2, z * 1.2 - o) * .3 + noise3(x * 3 - o, y * 3 + o, z * 3) * .09;
    const k = 1 + n, yy = y * k * sq;
    p.setXYZ(i, x * k * size, (yy < -.12 ? -.12 + (yy + .12) * .25 : yy) * size, z * k * size * (.8 + .2 * Math.abs(Math.sin(o))));
    const v = .8 + n * .6 + (y > .3 ? .08 : 0); col.push(c.r * v, c.g * v, c.b * v);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
// rock: the shape's own colour, cracks and grit from the ground detail (mapped three ways so it doesn't
// stretch on the sides) and moss where the top faces the sky
function rockMat(tex) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: tex.detail };
    sh.vertexShader = 'varying vec3 vRW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vRW = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);');
    sh.fragmentShader = 'uniform sampler2D uDetail; varying vec3 vRW;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `{ vec3 wn = transpose(mat3(viewMatrix)) * normal, w = pow(abs(wn), vec3(4.)); w /= w.x + w.y + w.z;
    vec4 d = texture2D(uDetail, vRW.zy * .7) * w.x + texture2D(uDetail, vRW.xz * .7) * w.y + texture2D(uDetail, vRW.xy * .7) * w.z;
    vec4 e = texture2D(uDetail, vRW.xz * .09 + .2);
    diffuseColor.rgb *= (.66 + .5 * (d.b * .3 + d.g * .4 + d.a * .3)) * (.85 + .3 * e.a);
    float moss = smoothstep(.55, .85, wn.y + (e.r - .5) * .6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.07, .09, .03) * (.7 + .6 * d.r), moss * .85); }
  #include <emissivemap_fragment>`);
  };
  m.customProgramCacheKey = () => 'ls-rock';
  return m;
}

// ---- trees: crowns of painted leaf cards with soft round normals (so a crown lights like one shape),
// trunks and limbs; three crossed cards painted with the whole tree far away
// The atlas: 1024 x 512 in cells of 256: leaf clump, fir bough, whole oak, whole poplar / whole fir,
// bark, straw. The see-through texels take the colour of the leaves next to them, so blurred far
// leaves don't get dark rims.
const CELLS = { clump: [0, 0], bough: [1, 0], oak: [2, 0], poplar: [3, 0], fir: [0, 1], bark: [1, 1], straw: [2, 1] };
const cellUV = (k, x0 = 0, y0 = 0, x1 = 1, y1 = 1) => { const [cx, cy] = CELLS[k]; return [(cx + x0) / 4, (cy + y0) / 2, (cx + x1) / 4, (cy + y1) / 2]; };
function treeAtlas() {
  const W2 = 1024, H2 = 512, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
  const g = cv.getContext('2d'), R = rng(77);
  const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
  const leaf = (x, y, s, a, col) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, s, s * .5, 0, 0, TAU); g.fill(); g.restore(); };
  // leaves in an oval, lit from the top left, darker underneath and deep inside
  const clump = (cx, cy, rx, ry, n, size, hue, lx = 0, ly = 0, lr = 1) => {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, r = Math.sqrt(R()), x = cx + Math.cos(a) * r * rx, y = cy + Math.sin(a) * r * ry;
      const lit = clamp(.55 - (x - lx) / lr * .3 - (y - ly) / lr * .45 + (r - .6) * .25, 0, 1);
      leaf(x, y, size * (.7 + R() * .6), R() * TAU, hsl(hue + R() * 18 - 9, 28 + R() * 24, 11 + lit * 30 + R() * 6));
    }
  };
  const trunk = (x, y0, y1, w0, w1, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x - w0 / 2, y0); g.lineTo(x - w1 / 2, y1); g.lineTo(x + w1 / 2, y1); g.lineTo(x + w0 / 2, y0); g.fill(); };
  const twig = (x0, y0, x1, y1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 6, x1, y1); g.stroke(); };
  // needles: short strokes off a twig, both sides
  const needles = (x0, y0, x1, y1, len, n, hue, lit) => {
    for (let i = 0; i < n; i++) {
      const t = R(), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 4, a = Math.atan2(y1 - y0, x1 - x0) + (R() < .5 ? -1 : 1) * (.7 + R() * .5);
      const l = len * (.6 + R() * .6) * (1 - t * .5);
      g.strokeStyle = hsl(hue + R() * 14 - 7, 24 + R() * 18, 9 + lit * 20 + R() * 8); g.lineWidth = 1.6 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  };
  // (0,0) a spray of broad leaves for crown cards: overlapping bunches with a ragged edge
  for (const [x, y, rx, ry, n] of [[128, 128, 66, 58, 300], [78, 98, 42, 38, 150], [178, 94, 44, 38, 150], [72, 166, 40, 34, 130], [184, 164, 42, 36, 130], [128, 56, 46, 32, 140], [128, 202, 48, 32, 130]]) clump(x, y, rx, ry, n, 6.4, 88, 104, 64, 150);
  // (1,0) a fir bough: a twig from the trunk side (left) out to the tip (right), drooping
  for (let k = 0; k < 9; k++) {
    const t = k / 9, x = 256 + 14 + t * 210, y = 120 + t * t * 34;
    for (const s of [-1, 1]) { const ex = x + 34 + R() * 20, ey = y + s * (42 - t * 26) + 8; twig(x, y, ex, ey, 2, '#3a2c1e'); needles(x, y, ex, ey, 12, 70, 128, s < 0 ? .9 : .4); }
  }
  twig(260, 120, 500, 156, 4, '#3d2e1f'); needles(262, 120, 498, 156, 13, 260, 126, .6);
  // (2,0) a whole oak
  trunk(640, 256, 132, 18, 9, '#4a3a2c'); twig(640, 170, 596, 122, 5, '#4a3a2c'); twig(640, 160, 690, 116, 5, '#4a3a2c');
  for (const [x, y, rx, ry] of [[640, 104, 96, 66], [584, 118, 50, 40], [700, 116, 50, 40], [640, 58, 62, 44], [604, 148, 44, 26], [678, 146, 44, 26]]) clump(x, y, rx, ry, 360, 6.2, 90, 600, 60, 120);
  // (3,0) a whole poplar (tall and narrow)
  trunk(896, 256, 150, 12, 6, '#4b3e30');
  clump(896, 120, 42, 112, 900, 5.6, 84, 880, 40, 110);
  // (0,1) a whole fir
  trunk(128, 512, 280, 14, 4, '#3d2f22');
  for (let k = 0; k < 15; k++) { const t = k / 14, y = 490 - t * 214, w = 104 * (1 - t) ** 1.05 + 6; for (const s of [-1, 1]) needles(128, y, 128 + s * w, y + 22 * (1 - t), 15 - t * 6, 70, 128, s < 0 ? .8 - t * .2 : .35); }
  // (1,1) bark: pale, the trunks get their colour from the tree (vertex colours)
  g.fillStyle = '#d4ccbf'; g.fillRect(256, 256, 256, 256);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(60,48,36,${.1 + R() * .2})`; g.fillRect(256 + R() * 256, 256, 1 + R() * 3, 256); }
  // (2,1) straw for hay and thatch
  g.fillStyle = '#c9b071'; g.fillRect(512, 256, 256, 256);
  for (let i = 0; i < 1600; i++) { const x = 512 + R() * 256, y = 256 + R() * 256, a = (R() - .5) * .9; g.strokeStyle = hsl(42 + R() * 10, 40 + R() * 25, 40 + R() * 28); g.lineWidth = 1 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke(); }
  // the see-through texels take their neighbours' colour (3 steps), the rest each cell's own average
  const img = g.getImageData(0, 0, W2, H2), d = img.data, solid = new Uint8Array(W2 * H2);
  for (let i = 0; i < W2 * H2; i++) solid[i] = d[i * 4 + 3] > 60 ? 1 : 0;
  for (let p = 0; p < 3; p++) {
    const add = [];
    for (let y = 1; y < H2 - 1; y++) for (let x = 1; x < W2 - 1; x++) {
      const i = y * W2 + x; if (solid[i]) continue;
      let r = 0, gg = 0, b = 0, n = 0;
      for (const j of [i - 1, i + 1, i - W2, i + W2]) if (solid[j]) { r += d[j * 4]; gg += d[j * 4 + 1]; b += d[j * 4 + 2]; n++; }
      if (n) { d[i * 4] = r / n; d[i * 4 + 1] = gg / n; d[i * 4 + 2] = b / n; add.push(i); }
    }
    for (const i of add) solid[i] = 1;
  }
  for (const [cx, cy] of Object.values(CELLS)) {
    let r = 0, gg = 0, b = 0, n = 0;
    for (let y = cy * 256; y < cy * 256 + 256; y += 2) for (let x = cx * 256; x < cx * 256 + 256; x += 2) { const i = (y * W2 + x) * 4; if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    if (!n) continue; r /= n; gg /= n; b /= n;
    for (let y = cy * 256; y < cy * 256 + 256; y++) for (let x = cx * 256; x < cx * 256 + 256; x++) { const i = y * W2 + x; if (!solid[i]) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; } }
  }
  return dataTex(new Uint8Array(d.buffer), W2, H2, { srgb: true, clampEdge: true });
}
// geometry made of cards and tubes, with uvs into the atlas and vertex colours
function cards() {
  const P = [], N = [], U = [], C = [], I = [], v = new Vector3(), w = new Vector3();
  const b = {
    // a card: centre c, half-width axis ax, half-height axis ay (canvas top at +ay), uv rect, colour, normals (fn(corner) or one vector)
    card(c, ax, ay, uv, col, nf) {
      const base = P.length / 3;
      for (const [sx, sy, u, vv] of [[-1, 1, uv[0], uv[1]], [1, 1, uv[2], uv[1]], [1, -1, uv[2], uv[3]], [-1, -1, uv[0], uv[3]]]) {
        v.copy(c).addScaledVector(ax, sx).addScaledVector(ay, sy); P.push(v.x, v.y, v.z);
        const nn = typeof nf === 'function' ? nf(v, w) : nf; N.push(nn.x, nn.y, nn.z); U.push(u, vv); C.push(col.r, col.g, col.b);
      }
      I.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    },
    // a tapered tube from a to b
    tube(a, bb, ra, rb, seg, col) {
      const dir = new Vector3().subVectors(bb, a), L = dir.length(); dir.normalize();
      const side = Math.abs(dir.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0), e1 = new Vector3().crossVectors(dir, side).normalize(), e2 = new Vector3().crossVectors(dir, e1);
      const base = P.length / 3, [u0, v0, u1, v1] = cellUV('bark', .1, .1, .9, .9);
      for (let k = 0; k <= seg; k++) {
        const t = k / seg * TAU, cs = Math.cos(t), sn = Math.sin(t);
        for (const [p, r, vv] of [[a, ra, v1], [bb, rb, v0]]) { const nx = e1.x * cs + e2.x * sn, ny = e1.y * cs + e2.y * sn, nz = e1.z * cs + e2.z * sn; P.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); N.push(nx, ny, nz); U.push(u0 + (u1 - u0) * k / seg, vv); C.push(col.r, col.g, col.b); }
      }
      for (let k = 0; k < seg; k++) { const i = base + k * 2; I.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      void L;
    },
    geo() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeBoundingSphere(); return g;
    },
  };
  return b;
}
const V3 = (x, y, z) => new Vector3(x, y, z), UP3 = new Vector3(0, 1, 0);
// leaf cards in an oval crown: mostly on the outside, facing every way, tinted darker inside and below
function crown(b, R, o, n, size, tint, uv) {
  const c = new Color(), cen = V3(o[0], o[1], o[2]), rad = V3(o[3], o[4], o[5]);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), r = .5 + .5 * Math.sqrt(R());
    const p = V3(Math.cos(a) * s * r * rad.x, u * r * rad.y, Math.sin(a) * s * r * rad.z).add(cen);
    const yaw = R() * TAU, pitch = (R() - .3) * 1.1, f = V3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const ax = new Vector3().crossVectors(UP3, f).normalize(), ay = new Vector3().crossVectors(f, ax).normalize(), k = size * (.75 + R() * .5);
    ax.multiplyScalar(k * .5); ay.multiplyScalar(k * .5);
    const depth = r, high = clamp((p.y - cen.y) / rad.y * .5 + .5, 0, 1);
    c.copy(tint).multiplyScalar((.55 + .45 * depth) * (.82 + .3 * high) * (.9 + R() * .2));
    b.card(p, ax, ay, uv, c, (q, out) => out.subVectors(q, cen).divide(rad).normalize().lerp(UP3, .2).normalize());
  }
}
// three crossed cards painted with the whole tree, for far away
function farCards(b, w, h, uv, tint, cy) {
  const cen = V3(0, cy, 0), col = new Color().copy(tint);
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI, ax = V3(Math.cos(a) * w / 2, 0, Math.sin(a) * w / 2); b.card(V3(0, h / 2, 0), ax, V3(0, h / 2, 0), uv, col, (q, out) => out.subVectors(q, cen).normalize().lerp(UP3, .3).normalize()); }
}
const BARK = new Color('#5a4a3a');
function oakGeo(lod, seed = 3) {
  const b = cards(), R = rng(seed), tint = new Color('#e8f0d8');
  if (lod === 2) { farCards(b, 9.6, 9.6, cellUV('oak'), tint, 6); return b.geo(); }
  b.tube(V3(0, -.4, 0), V3(0, 4.2, 0), .34, .22, 7, BARK);
  if (lod === 0) for (const [x, y, z] of [[-1.7, 5.4, .7], [1.8, 5.6, -.5], [.3, 6.6, 1.5], [-.4, 5.8, -1.7]]) b.tube(V3(0, 3.6, 0), V3(x, y, z), .16, .07, 5, BARK);
  const lumps = [[0, 6.3, 0, 3.3, 2.5, 3.3], [-1.9, 5.5, .8, 2.2, 1.8, 2.2], [2, 5.7, -.6, 2.3, 1.9, 2.2], [.4, 7.8, .3, 2.4, 1.7, 2.4], [-.6, 5.3, -1.9, 2, 1.6, 2]];
  const n = lod === 0 ? 120 : 40, size = lod === 0 ? 2.4 : 3.3;
  for (let i = 0; i < n; i++) crown(b, R, lumps[i % lumps.length], 1, size, tint, cellUV('clump'));
  return b.geo();
}
function poplarGeo(lod, seed = 5) {
  const b = cards(), R = rng(seed), tint = new Color('#e6f2cc');
  if (lod === 2) { farCards(b, 4.6, 14, cellUV('poplar', .25, 0, .75, 1), tint, 8); return b.geo(); }
  b.tube(V3(0, -.4, 0), V3(0, 6, 0), .24, .12, 6, BARK);
  crown(b, R, [0, 8.3, 0, 1.5, 5.5, 1.5], lod === 0 ? 92 : 36, lod === 0 ? 1.85 : 2.6, tint, cellUV('clump'));
  return b.geo();
}
function firGeo(lod, seed = 7) {
  const b = cards(), R = rng(seed), tint = new Color('#dfe8d8'), H = 12, c = new Color();
  if (lod === 2) { farCards(b, 7.2, 12.6, cellUV('fir', 0, .1, 1, 1), tint, 5); return b.geo(); }
  b.tube(V3(0, -.4, 0), V3(0, H * .95, 0), .3, .05, 6, BARK);
  const step = lod === 0 ? .62 : 1.25, per = lod === 0 ? 7 : 5, uv = cellUV('bough');
  for (let y = 1.6, k = 0; y < H - .4; y += step, k++) {
    const t = (y - 1.2) / (H - 1.2), r = 3.4 * (1 - t) ** .95 + .45;
    for (let i = 0; i < per; i++) {
      const a = (i + k * .5 + R() * .3) / per * TAU, dx = Math.cos(a), dz = Math.sin(a), inner = V3(dx * .15, y, dz * .15), outer = V3(dx * r, y - r * .32, dz * r);
      const cen = inner.clone().add(outer).multiplyScalar(.5), ax = outer.clone().sub(inner).multiplyScalar(.5), ay = V3(-dz, 0, dx).multiplyScalar(r * .36);
      c.copy(tint).multiplyScalar((.65 + .45 * t) * (.9 + R() * .2));
      const nrm = V3(dx, .9, dz).normalize();
      b.card(cen, ax, ay, uv, c, nrm);
    }
  }
  return b.geo();
}
// leaves: cut out of the atlas, sway with the wind, light up when you look towards the sun through them
function leafMat(atlas) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: .82, alphaTest: .5, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = 'uniform float uTime, uWind; varying vec3 vLW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec3 wp = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz); vLW = wp;
    float hh = max(position.y - 2., 0.), ph = wp.x * .19 + wp.z * .23;
    vec3 sw = vec3(sin(uTime * 1.7 + ph) + sin(uTime * 3.1 + ph * 2.3) * .3, 0., cos(uTime * 1.3 + ph * 1.4)) * uWind * hh * .012;
    mvPosition.xyz += mat3(viewMatrix) * sw; gl_Position = projectionMatrix * mvPosition; }`);
    sh.fragmentShader = 'uniform vec3 uSun; varying vec3 vLW;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <alphatest_fragment>', `{ vec2 lq = vMapUv * vec2(1024., 512.); vec2 dx = dFdx(lq), dy = dFdy(lq); diffuseColor.a *= 1. + max(0., .5 * log2(max(dot(dx, dx), dot(dy, dy)))) * .35; }
  #include <alphatest_fragment>`)
      .replace('#include <emissivemap_fragment>', `{ vec3 vd = normalize(vLW - cameraPosition); diffuseColor.rgb *= 1. + .6 * pow(max(dot(vd, uSun), 0.), 4.); }
  #include <emissivemap_fragment>`);
  };
  m.customProgramCacheKey = () => 'ls-leaf';
  return m;
}

// ---- the village is built from boxes, slopes and cylinders merged into a few meshes, each part with
// uvs in metres (so plaster, tiles, boards and stone keep their size) and a colour of its own
function solid() {
  const P = [], N = [], U = [], C = [], I = [], e1 = new Vector3(), e2 = new Vector3(), n = new Vector3(), ax = new Vector3(), ay = new Vector3(), d = new Vector3();
  const b = {
    // a flat convex polygon, corners counter-clockwise seen from the front
    face(pts, col, uv = 1) {
      e1.subVectors(pts[1], pts[0]); e2.subVectors(pts[pts.length - 1], pts[0]); n.crossVectors(e1, e2).normalize();
      ax.copy(e1).normalize(); ay.crossVectors(n, ax);
      const base = P.length / 3;
      for (const p of pts) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); d.subVectors(p, pts[0]); U.push(d.dot(ax) * uv, d.dot(ay) * uv); C.push(col.r, col.g, col.b); }
      for (let i = 1; i < pts.length - 1; i++) I.push(base, base + i, base + i + 1);
      return b;
    },
    // a box w (along its own x) x h x d, its base centre at x, y0, z, turned ry about y
    box(x, y0, z, w, h, dd, ry, col, uv = 1, under = false) {
      const c = Math.cos(ry), s = Math.sin(ry), at = (lx, ly, lz) => new Vector3(x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c), hw = w / 2, hd = dd / 2;
      const p = [at(-hw, 0, hd), at(hw, 0, hd), at(hw, h, hd), at(-hw, h, hd), at(hw, 0, -hd), at(-hw, 0, -hd), at(-hw, h, -hd), at(hw, h, -hd)];
      b.face([p[0], p[1], p[2], p[3]], col, uv).face([p[4], p[5], p[6], p[7]], col, uv).face([p[1], p[4], p[7], p[2]], col, uv).face([p[5], p[0], p[3], p[6]], col, uv).face([p[3], p[2], p[7], p[6]], col, uv);
      if (under) b.face([p[5], p[4], p[1], p[0]], col, uv);
      return b;
    },
    // a cylinder (or cone, r1 = 0) from centre c along unit axis a
    cyl(c, a, r0, r1, h, seg, col, uv = 1, caps = true) {
      const s1 = Math.abs(a.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0), u = new Vector3().crossVectors(a, s1).normalize(), w = new Vector3().crossVectors(a, u);
      const ring = (r, t) => Array.from({ length: seg }, (_, i) => { const q = i / seg * TAU; return c.clone().addScaledVector(a, t).addScaledVector(u, Math.cos(q) * r).addScaledVector(w, Math.sin(q) * r); });
      const lo = ring(r0, 0), hi = ring(r1 || 1e-4, h);
      for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; b.face([lo[i], hi[i], hi[j], lo[j]], col, uv); }
      if (caps) { b.face([...lo], col, uv); if (r1 > 0) b.face([...hi].reverse(), col, uv); }
      return b;
    },
    get empty() { return !P.length; },
    geo() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeBoundingSphere(); return g;
    },
  };
  return b;
}
const PLASTER = ['#f1e7d0', '#ead7b0', '#e6cdb0', '#f3eee4', '#dfc39a', '#ead6c8', '#e2dccc'], PAINT = ['#56735f', '#5d7590', '#7b5a3e', '#465f46', '#8b8e84', '#6e4a3a'], ROOFS = ['#ffffff', '#f2dcd0', '#e4cbb6', '#fff2e2', '#d9c2b0'];
// painted textures (seeded, so the valley looks the same every time)
function villageTextures() {
  const R = rng(31);
  const blot = (g, S, n, dark, light, rr) => { for (let i = 0; i < n; i++) { const x = R() * S, y = R() * S, r = rr[0] + R() * rr[1], dk = R() < .6; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, dk ? dark : light); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } } };
  const plaster = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#ddd6c8'; col.fillRect(0, 0, S, S); blot(col, S, 22, 'rgba(110,95,70,.07)', 'rgba(255,252,244,.1)', [12, 40]);
    speckle(col, S, 1600, '#968b7a', 1.3, .22); speckle(h, S, 2800, '#000', 1.2, .35); speckle(h, S, 900, '#fff', 1.4, .3);
    h.strokeStyle = '#3338'; h.lineWidth = 1; for (let i = 0; i < 6; i++) { let x = R() * S, y = R() * S; h.beginPath(); h.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (R() - .5) * 14; y += 4 + R() * 8; h.lineTo(x, y); } h.stroke(); }
  }, { strength: 1.6 });
  const tiles = surface(256, ({ col, h, size: S }) => {
    const rows = 8, per = 10, th = S / rows, tw = S / per;
    for (let j = 0; j < rows; j++) for (let i = -1; i <= per; i++) {
      const x = (i + (j % 2) * .5) * tw, y = j * th, hue = 10 + R() * 12, sat = 40 + R() * 20, l = 30 + R() * 13;
      const g = col.createLinearGradient(x, 0, x + tw, 0); g.addColorStop(0, `hsl(${hue},${sat}%,${l * .5}%)`); g.addColorStop(.42, `hsl(${hue},${sat}%,${l * 1.18}%)`); g.addColorStop(1, `hsl(${hue},${sat}%,${l * .45}%)`);
      col.fillStyle = g; col.fillRect(x, y, tw, th);
      const hg = h.createLinearGradient(x, 0, x + tw, 0); hg.addColorStop(0, '#383838'); hg.addColorStop(.45, '#e0e0e0'); hg.addColorStop(1, '#383838'); h.fillStyle = hg; h.fillRect(x, y, tw, th);
    }
    for (let j = 0; j < rows; j++) { col.fillStyle = 'rgba(24,10,4,.5)'; col.fillRect(0, j * th + th - 3, S, 3); h.fillStyle = '#111'; h.fillRect(0, j * th + th - 2, S, 2); }
    speckle(col, S, 600, '#2e2216', 1.3, .3); blot(col, S, 10, 'rgba(70,84,40,.35)', 'rgba(60,70,36,.25)', [4, 10]);
  }, { strength: 2.2 });
  const stone = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#5a554c'; col.fillRect(0, 0, S, S); h.fillStyle = '#1a1a1a'; h.fillRect(0, 0, S, S);
    for (let y = 0; y < S;) {
      const rh = y > S - 44 ? S - y : 18 + R() * 16; let x = -R() * 30;
      while (x < S) {
        const bw = 26 + R() * 36, l = 38 + R() * 24, c = `hsl(${32 + R() * 14},${5 + R() * 9}%,${l}%)`;
        for (const ox of [0, -S, S]) { col.fillStyle = c; col.beginPath(); col.roundRect(x + ox + 1.5, y + 1.5, bw - 3, rh - 3, 4); col.fill(); h.fillStyle = `rgb(${190 + R() * 50},${190 + R() * 50},${190 + R() * 50})`; h.beginPath(); h.roundRect(x + ox + 2.5, y + 2.5, bw - 5, rh - 5, 5); h.fill(); }
        x += bw;
      }
      y += rh;
    }
    speckle(col, S, 900, '#2a2620', 1.3, .3); speckle(col, S, 500, '#d8d0c0', 1.1, .2); blot(col, S, 8, 'rgba(60,72,34,.3)', 'rgba(40,36,30,.25)', [8, 20]);
  });
  const boards = surface(128, ({ col, h, size: S }) => {
    col.fillStyle = '#c4b49c'; col.fillRect(0, 0, S, S); h.fillStyle = '#909090'; h.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 16) { col.fillStyle = 'rgba(40,28,18,.6)'; col.fillRect(x, 0, 1.5, S); h.fillStyle = '#222'; h.fillRect(x, 0, 2, S); }
    for (let i = 0; i < 90; i++) { col.fillStyle = `rgba(70,50,32,${R() * .25})`; col.fillRect(R() * S, 0, .8 + R() * 1.4, S); }
    speckle(col, S, 200, '#5a4632', 1.2, .3);
  });
  const straw = surface(128, ({ col, h, size: S }) => {
    col.fillStyle = '#b8a066'; col.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S, a = (R() - .5) * .8 + Math.PI / 2, l = 6 + R() * 10; col.strokeStyle = `hsl(${40 + R() * 12},${35 + R() * 25}%,${32 + R() * 32}%)`; h.strokeStyle = R() < .5 ? '#bbb' : '#444'; for (const g of [col, h]) { g.lineWidth = 1 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }
  });
  return { plaster, tiles, stone, boards, straw };
}

let WD = null;
function world() {
  if (WD) return WD;
  const v = new HDView({ bg: '#c9c3b2', env: .55, sky: '#c8d2e0', ground: '#4a4434', amb: .42, fov: 62 });
  v.cam.near = .3; v.cam.far = 1600; v.cam.updateProjectionMatrix();
  v.exposure = 1; v.bloom = .3;
  const sl = sun('#fff0d8', 2.8, 34, [.9, .35, -.3]); v.scene.add(sl, sl.target); v.onTier(T => sl.setTier(T));
  v.sun = sl;
  // the air (haze, valley mist, cloud shadows, rain): on from the start, each mission sets its own
  v.air(MOODS.m1.air);

  // ---- land, with the nests and the village levelled, painted by the ground shader
  const tex = groundTextures();
  const land = new Land({ kind: shape, size: 640, segments: 128, material: groundMat(tex) });
  land.flatten(-15, -108, 58, 6.4, 30);
  for (const n of Object.values(NESTS)) land.flatten(n.x, n.z, 5, undefined, 6);
  land.flatten(MILL.x, MILL.z - 3, 9, 4.2, 6);
  landMasks(land);
  v.scene.add(land.object);
  land.grass({ count: 9000, colour: '#6c8638', tint: ['#4f6a2a', '#9a9850'], above: 14, steep: .35, far: 42, height: .8, wind: .6 });
  v.scene.add(farHills(land));

  // the river and the lake: dark water with ripples that catch the sky
  const waterMat = (col, rep) => {
    const n = tex.ripple.clone(); n.repeat.set(rep, rep); n.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: col, roughness: .14, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(.6, .6), transparent: true, opacity: .96, envMapIntensity: .45 });
  };
  const river = new Water({ level: -1.4, waves: .08, size: 640, segments: 40, material: waterMat('#1c2824', 70) });
  v.scene.add(river.mesh);
  const lake = new Water({ level: 23, waves: .18, size: 150, segments: 20, material: waterMat('#283639', 16) });
  lake.mesh.position.set(STREAMX, 0, -282); v.scene.add(lake.mesh);
  const ripples = [river.mesh.material.normalMap, lake.mesh.material.normalMap];

  // ---- materials (built once)
  const VT = villageTextures(), { plaster, tiles, stone } = VT;
  const wood = surface(128, ({ col, h, size: S }) => { col.fillStyle = '#6b4a30'; col.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { col.fillStyle = `rgba(30,18,10,${Math.random() * .3})`; col.fillRect(0, Math.random() * S, S, 1 + Math.random() * 2); } h.fillStyle = '#888'; h.fillRect(0, 0, S, S); });
  const M = {
    wall: pbr('#ffffff', { tex: plaster, rep: [2, 2], rough: .92 }), roof: pbr('#ffffff', { tex: tiles, rep: [3, 2], rough: .8 }),
    stone: pbr('#d8d2c6', { tex: stone, rep: [2, 2], rough: .9 }), wood: pbr('#ffffff', { tex: wood, rough: .85 }),
    // the village's own: the textures tinted by each part's colour
    wallV: pbr('#ffffff', { tex: plaster, rough: .93, vertexColors: true }), roofV: pbr('#ffffff', { tex: tiles, rough: .78, vertexColors: true }),
    stoneV: pbr('#ffffff', { tex: stone, rough: .9, vertexColors: true }), woodV: pbr('#ffffff', { tex: VT.boards, rough: .82, vertexColors: true }),
    strawV: pbr('#ffffff', { tex: VT.straw, rough: 1, vertexColors: true }), lit: pbr('#2a2018', { rough: .3, glow: 0, glowCol: '#ffb860' }),
    glass: pbr('#1a2128', { rough: .15, metal: .4, glow: 0, glowCol: '#ffb860' }), iron: pbr('#3a3c3e', { rough: .45, metal: .8 }),
    rail: pbr('#6a6560', { rough: .35, metal: .9 }), dark: pbr('#24221f', { rough: .8 }), sand: pbr('#a39270', { rough: 1 }),
    drum: pbr('#a8352a', { rough: .5, metal: .3, clear: .3 }), green: pbr('#4c5a32', { rough: .7 }), brass: pbr('#c8a24a', { rough: .25, metal: 1 }),
    cloth: pbr('#c9bc8e', { rough: 1, side: THREE.DoubleSide }), canvas: pbr('#5d6150', { rough: 1 }), lamp: pbr('#ffcf80', { glow: 3 }),
    plant: pbr('#ffffff', { vertexColors: true, rough: .9 }), rock: rockMat(tex),
  };
  M.glass.emissive = new Color('#ffb860'); M.glass.emissiveIntensity = 0; M.lit.emissive = new Color('#ffb060'); M.lit.emissiveIntensity = 0;
  WD = { v, sl, land, river, lake, M, ripples, lodK: 1, ground: (x, z) => land.height(x, z), chims: [] };
  const solids = WD.solids = [];   // boxes that stop bullets: { x0, y0, z0, x1, y1, z1, kind }
  const box = (x, y, z, w, h, d, kind = 'wall') => solids.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2, kind });
  const mesh = (geo, mat, x, y, z, ry = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; v.scene.add(m); return m; };
  const ground = (x, z) => land.height(x, z);

  // ---- the village: plastered houses on stone plinths, tile roofs with deep eaves, shutters, chimneys,
  // doors, carts, barrels and hay, all merged into one mesh per material
  const K = { wall: solid(), roof: solid(), wood: solid(), stone: solid(), glass: solid(), lit: solid(), straw: solid() }, HR = rng(17), pick = a => a[HR() * a.length | 0];
  const o = new Object3D();
  const C_ = c => new Color(c), DARKWOOD = C_('#6a5444'), BEAM = C_('#5a4636'), SILL = C_('#cfc8bb'), WHITE = C_('#ffffff');
  const UP = new Vector3(0, 1, 0);
  // a gabled building: walls (kit kw, colour wc) w long and d deep, h to the eaves, ridge along its length
  function gabled(x, z, w, d, h, ry, { kw = K.wall, wc, roof = C_(pick(ROOFS)), y0 = ground(x, z) - .5, plinth = true, pitch = .42, eave = .5, verge = .35 } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, ly, lz) => new Vector3(x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c);
    const top = h + .5, rise = d * pitch, slope = rise / (d / 2), t = .16;
    kw.box(x, y0, z, w, top, d, ry, wc, .33);
    kw.face([at(w / 2, top, d / 2), at(w / 2, top, -d / 2), at(w / 2, top + rise, 0)], wc, .33).face([at(-w / 2, top, -d / 2), at(-w / 2, top, d / 2), at(-w / 2, top + rise, 0)], wc, .33);
    if (plinth) K.stone.box(x, y0 - .4, z, w + .18, 1.3, d + .18, ry, SILL, .5);
    const eY = top - eave * slope, rY = top + rise + .05, X = w / 2 + verge, Z = d / 2 + eave;
    K.roof.face([at(-X, eY, Z), at(X, eY, Z), at(X, rY, 0), at(-X, rY, 0)], roof, .38).face([at(X, eY, -Z), at(-X, eY, -Z), at(-X, rY, 0), at(X, rY, 0)], roof, .38);
    K.wood.face([at(X, eY - t, Z), at(-X, eY - t, Z), at(-X, rY - t, 0), at(X, rY - t, 0)], BEAM, .5).face([at(-X, eY - t, -Z), at(X, eY - t, -Z), at(X, rY - t, 0), at(-X, rY - t, 0)], BEAM, .5);
    K.wood.face([at(-X, eY - t, Z), at(X, eY - t, Z), at(X, eY, Z), at(-X, eY, Z)], DARKWOOD, .5).face([at(X, eY - t, -Z), at(-X, eY - t, -Z), at(-X, eY, -Z), at(X, eY, -Z)], DARKWOOD, .5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const a = at(sx * X, eY - t, sz * Z), b = at(sx * X, rY - t, 0), cc = at(sx * X, rY, 0), dd = at(sx * X, eY, sz * Z); K.wood.face(sx * sz > 0 ? [a, b, cc, dd] : [b, a, dd, cc], DARKWOOD, .5); }
    const ridge = at(0, 0, 0); K.roof.box(ridge.x, rY - .1, ridge.z, X * 2, .2, .34, ry, roof.clone().multiplyScalar(.75), .38);
    return { at, top, rise, rY, slope };
  }
  const house = (x, z, w, d, h, turned, { mill = false } = {}) => {
    const ry = turned ? Math.PI / 2 : 0, wc = C_(pick(PLASTER)), paint = C_(pick(PAINT)), y0 = ground(x, z) - .5;
    const g = gabled(x, z, w, d, h, ry, { wc, y0 });
    const { at, top, rise } = g;
    // the chimney through the roof
    const chx = (HR() - .5) * w * .5, chz = -d * .2, ch = at(chx, 0, chz);
    K.stone.box(ch.x, y0 + top + rise * .2, ch.z, .72, rise * .8 + 1.1, .72, ry, C_('#c9c0b2'), .5).box(ch.x, y0 + top + rise + 1.3, ch.z, .92, .14, .92, ry, C_('#a8a094'), .5);
    WD.chims.push([ch.x, y0 + top + rise + 1.5, ch.z]);
    // windows with frames, sills and shutters (some lit at dusk); a door at the front
    const floors = h >= 5.5 ? [1.45, 4.05] : [1.6], n = Math.max(2, Math.floor(w / 3)), doorAt = HR() * n | 0;
    for (const sz of [-1, 1]) for (const fy of floors) for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * (w / n), wz = sz * d / 2, p = at(lx, 0, wz);
      if (sz > 0 && fy === floors[0] && i === doorAt) {
        K.wood.box(p.x, y0 + .75, p.z, 1.15, 2.25, .14, ry, C_('#5c4430'), .5).box(p.x, y0 + .75, p.z, 1.45, 2.45, .08, ry, SILL, .5);
        const st = at(lx, 0, wz + .45); K.stone.box(st.x, y0 + .3, st.z, 1.6, .5, .8, ry, SILL, .5);
        continue;
      }
      K.wood.box(p.x, y0 + fy - .1, p.z, 1.02, 1.3, .1, ry, C_('#e8e2d6'), .5);
      const zq = wz + sz * .056, q = (a, b2) => at(lx + a, fy + b2, zq), lit = !mill && HR() < .45;
      (lit ? K.lit : K.glass).face(sz > 0 ? [q(-.4, 0), q(.4, 0), q(.4, 1.1), q(-.4, 1.1)] : [q(.4, 0), q(-.4, 0), q(-.4, 1.1), q(.4, 1.1)], WHITE, 1);
      const sl = at(lx, 0, wz + sz * .08); K.stone.box(sl.x, y0 + fy - .16, sl.z, 1.12, .08, .22, ry, SILL, .5);
      const shut = HR() < .18;
      for (const sx of [-1, 1]) { const sp = at(lx + sx * (shut ? .2 : .64), 0, wz + sz * .07); K.wood.box(sp.x, y0 + fy - .03, sp.z, .42, 1.16, .05, ry, paint, .6); }
    }
    box(x, y0 + .1, z, turned ? d : w, h + .4, turned ? w : d, 'house');
    return g;
  };
  for (const hs of HOUSES) house(...hs);
  // the mill (with the radio post on its balcony)
  house(MILL.x, MILL.z, 11, 8, 8, 0, { mill: true });
  // the village square: a well, carts, barrels, crates; hay by the farms
  const cart = (x, z, ry, load) => {
    const c = Math.cos(ry), s = Math.sin(ry), at = (lx, ly, lz) => new Vector3(x + lx * c + lz * s, ground(x, z) + ly, z - lx * s + lz * c), y = ground(x, z), wc = C_('#7a6048');
    K.wood.box(x, y + .78, z, 2.6, .12, 1.4, ry, wc, .6);
    for (const sz of [-1, 1]) { const p = at(0, 0, sz * .66); K.wood.box(p.x, y + .9, p.z, 2.6, .34, .07, ry, wc, .6); }
    for (const sz of [-1, 1]) K.wood.cyl(at(-.2, .58, sz * .8), new Vector3(s * sz, 0, c * sz), .58, .58, .1, 12, C_('#5e4834'), .6);
    for (const sz of [-1, 1]) { const a = at(1.3, .85, sz * .5), b = at(3.3, .45, sz * .35); const dir = b.clone().sub(a), L = dir.length(); K.wood.cyl(a, dir.normalize(), .05, .04, L, 5, wc, .6, false); }
    if (load === 'hay') K.straw.cyl(at(0, .9, 0), UP, .95, .55, .9, 10, WHITE, .7);
    if (load === 'barrels') for (const lx of [-.6, .6]) K.wood.cyl(at(lx, .84, 0), UP, .34, .34, .8, 10, C_('#8a6a48'), .6);
  };
  cart(-31, -100, .5, 'hay'); cart(12, -112, 2.2, 'barrels'); cart(48, -92, -.4, null); cart(MILL.x - 9, MILL.z + 9, 1.2, 'barrels'); cart(-70, -96, 1.9, 'hay');
  { const wy = ground(-6, -104), wp = new Vector3(-6, wy, -104); K.stone.cyl(wp, UP, 1.1, 1.1, .95, 14, C_('#cfc6b8'), .5); for (const sx of [-1, 1]) K.wood.box(-6 + sx * .95, wy, -104, .14, 2.4, .14, 0, BEAM, .5); K.roof.box(-6, wy + 2.35, -104, 2.4, .1, 1.5, 0, C_('#e8d0c0'), .38); }
  for (const [x, z, n] of [[-36, -88, 3], [16, -98, 2], [31, -120, 4], [-48, -122, 2], [MILL.x + 5, MILL.z + 6, 3], [-8, -86, 2]]) for (let i = 0; i < n; i++) {
    const bx = x + (i % 2) * .8, bz = z + Math.floor(i / 2) * .8, y = ground(bx, bz);
    if (HR() < .5) K.wood.cyl(new Vector3(bx, y, bz), UP, .32, .32, .85, 10, C_('#8a6a48'), .6); else K.wood.box(bx, y, bz, .7, .7, .7, HR() * 3, C_('#9a8264'), .7);
  }
  // round haystacks in the fields north of the river and by the road east
  for (const [x, z] of [[-110, -40], [-104, -46], [-150, -20], [92, -110], [100, -104], [150, -112], [-160, 60], [-150, 70], [120, 60], [170, 30]]) {
    const y = ground(x, z); if (Math.abs(z - RIVER(x)) < 20) continue;
    K.straw.cyl(new Vector3(x, y - .1, z), UP, 1.9, 1.7, 1.6, 12, WHITE, .5).cyl(new Vector3(x, y + 1.5, z), UP, 1.7, 0, 1.5, 12, C_('#d8ccb0'), .5, false);
  }
  const millY = ground(MILL.x, MILL.z);
  mesh(new BoxGeometry(9, .25, 1.6), M.wood, MILL.x, millY + 4.4, MILL.z + 4.8);                      // balcony
  for (const s of [-1, 1]) mesh(new BoxGeometry(.15, 1, .15), M.wood, MILL.x + s * 4.4, millY + 4.9, MILL.z + 5.5);
  mesh(new BoxGeometry(9, .1, .1), M.wood, MILL.x, millY + 5.4, MILL.z + 5.55);
  // the water wheel: iron-bound rims, spokes and paddles round a hub, turning on its axle (x)
  const wb = baker(false, true), WET = '#6a5440', IRON = '#3c3a38', Zr = Math.PI / 2;
  wb.add(new CylinderGeometry(.38, .38, 1.5, 12), IRON, [0, 0, 0], { r: [0, 0, Zr] }).add(new CylinderGeometry(.1, .1, 2.6, 8), IRON, [0, 0, 0], { r: [0, 0, Zr] });
  for (const sx of [-.55, .55]) {
    wb.add(new THREE.TorusGeometry(3.05, .11, 6, 36), WET, [sx, 0, 0], { r: [0, Zr, 0], uv: [6, 1] }).add(new THREE.TorusGeometry(3.12, .05, 4, 36), IRON, [sx, 0, 0], { r: [0, Zr, 0] });
    for (let k = 0; k < 6; k++) wb.add(new BoxGeometry(.12, 6, .14), WET, [sx, 0, 0], { r: [k * Math.PI / 6, 0, 0], uv: [.3, 3] });
  }
  for (let k = 0; k < 18; k++) { const a = k * TAU / 18; wb.add(new BoxGeometry(1.3, .8, .07), WET, [0, Math.cos(a) * 3.1, Math.sin(a) * 3.1], { r: [a, 0, 0], uv: [1, .5] }); }
  const wheel = new Mesh(wb.geo(), M.woodV); wheel.castShadow = wheel.receiveShadow = true; wheel.position.set(MILL.x + 7, millY + 1.2, MILL.z + 1); v.scene.add(wheel); WD.wheel = wheel;
  { // the outer axle pier, and a stone trough of water the wheel turns in
    const tx = MILL.x + 7, tz = MILL.z + 1, SC = C_('#bdb6aa');
    K.stone.box(MILL.x + 8.5, millY - 1.5, tz, .7, 2.6, .9, 0, SC, .5);
    for (const [x, z, w, d] of [[tx - .95, tz, .3, 8], [tx + .95, tz, .3, 8], [tx, tz - 3.85, 1.6, .3], [tx, tz + 3.85, 1.6, .3]]) K.stone.box(x, millY - .15, z, w, .9, d, 0, SC, .5);
    const wm = waterMat('#22302c', 2), pool = mesh(new PlaneGeometry(1.6, 7.4), wm, tx, millY + .62, tz); pool.rotation.x = -Math.PI / 2; pool.castShadow = false; ripples.push(wm.normalMap);
  }
  const mast = mesh(new CylinderGeometry(.06, .08, 9, 6), M.iron, MILL.x - 4, millY + 12, MILL.z - 2); void mast;
  WD.flagA = flag(v, M, MILL.x + 4, millY + 8.4 + 3.4, MILL.z - 3);

  // church and tower (the M2 marksman sits in the belfry)
  const cy = ground(CHURCH.x, CHURCH.z) - .3;
  gabled(CHURCH.x, CHURCH.z, 18, 9, 8.5, Math.PI / 2, { kw: K.stone, wc: C_('#e2dacb'), y0: cy, plinth: false, pitch: .55, roof: C_('#ead2c2') }); box(CHURCH.x, cy, CHURCH.z, 9, 9, 18, 'stone');
  for (const sx of [-1, 1]) for (const z of [-4, 0, 4]) { const wz = CHURCH.z + z, wx = CHURCH.x + sx * 4.53; K.glass.face(sx > 0 ? [V3(wx, cy + 3, wz + .5), V3(wx, cy + 3, wz - .5), V3(wx, cy + 6.4, wz - .5), V3(wx, cy + 6.4, wz + .5)] : [V3(wx, cy + 3, wz - .5), V3(wx, cy + 3, wz + .5), V3(wx, cy + 6.4, wz + .5), V3(wx, cy + 6.4, wz - .5)], WHITE); }
  mesh(rbox(5, 17, 5, .08), M.stone, CHURCH.x, cy + 8.5, CHURCH.tz); box(CHURCH.x, cy, CHURCH.tz, 5, 17, 5, 'stone');
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) mesh(new BoxGeometry(.6, 4, .6), M.stone, CHURCH.x + dx, cy + 19, CHURCH.tz + dz);
  mesh(new BoxGeometry(5.4, .6, 5.4), M.stone, CHURCH.x, cy + 21.2, CHURCH.tz); box(CHURCH.x, cy + 20.9, CHURCH.tz, 5.4, .6, 5.4, 'stone');
  mesh(new ConeGeometry(3.6, 7, 4), M.roof, CHURCH.x, cy + 25, CHURCH.tz, Math.PI / 4);
  WD.bell = mesh(new CylinderGeometry(.35, .8, 1.1, 12, 1, true), M.brass, CHURCH.x, cy + 20, CHURCH.tz);
  WD.churchTop = { x: CHURCH.x, y: cy + 17, z: CHURCH.tz };

  // the stone road bridge
  const by = BRIDGE.y;
  mesh(rbox(7, 1.2, BRIDGE.z1 - BRIDGE.z0, .1), M.stone, BRIDGE.x, by - .6, (BRIDGE.z0 + BRIDGE.z1) / 2);
  for (const s of [-1, 1]) { mesh(rbox(.5, .9, BRIDGE.z1 - BRIDGE.z0, .1), M.stone, BRIDGE.x + s * 3.3, by + .45, (BRIDGE.z0 + BRIDGE.z1) / 2); box(BRIDGE.x + s * 3.3, by, (BRIDGE.z0 + BRIDGE.z1) / 2, .5, .9, BRIDGE.z1 - BRIDGE.z0, 'low'); }
  for (const z of [-7, 2.5, 12]) mesh(rbox(5, 8, 3, .2), M.stone, BRIDGE.x, by - 5.2, z);
  box(BRIDGE.x, by - 9, (BRIDGE.z0 + BRIDGE.z1) / 2, 7, 9, BRIDGE.z1 - BRIDGE.z0, 'stone');

  // the railway: sleepers, rails and the iron bridge over the stream
  const sleepers = new InstancedMesh(new BoxGeometry(2.6, .18, .4), M.wood, 520); let si = 0;
  for (let x = -318; x < 318; x += 1.24) { o.position.set(x, RAILH, RAILZ); o.rotation.set(0, Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix(); sleepers.setMatrixAt(si++, o.matrix); }
  sleepers.count = si; sleepers.receiveShadow = true; v.scene.add(sleepers);
  for (const s of [-.72, .72]) mesh(new BoxGeometry(636, .14, .1), M.rail, 0, RAILH + .16, RAILZ + s).castShadow = false;
  for (const s of [-1, 1]) { mesh(new BoxGeometry(34, .4, .4), M.iron, STREAMX, RAILH + 3.2, RAILZ + s * 2); for (let i = -4; i <= 4; i++) mesh(new BoxGeometry(.3, 3.2, .3), M.iron, STREAMX + i * 4, RAILH + 1.6, RAILZ + s * 2).rotation.z = i % 2 ? .6 : -.6; }
  mesh(new BoxGeometry(34, .5, 4.4), M.iron, STREAMX, RAILH - .3, RAILZ);
  // the water tower (M1's second nest)
  const tw = { x: NESTS.tower.x, z: NESTS.tower.z + 2.2 }, ty = ground(NESTS.tower.x, NESTS.tower.z);
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) mesh(new CylinderGeometry(.18, .22, 10, 6), M.iron, tw.x + dx, ty + 5, tw.z + dz);
  mesh(new CylinderGeometry(2.7, 2.7, 3.2, 20), M.wood, tw.x, ty + 11.4, tw.z);
  // the dam up the stream, holding the lake
  const dy = 0;
  mesh(rbox(70, 26, 7, .3), M.stone, STREAMX, dy + 1, -206); for (let i = -2; i <= 2; i++) mesh(rbox(3, 3, 8, .2), M.stone, STREAMX + i * 12, dy + 15.5, -206);
  // the chapel belfry on the south bank (M2's first nest)
  const ch = NESTS.chapel, chy = ground(ch.x, ch.z) - .2;
  mesh(rbox(4.4, 11, 4.4, .1), M.stone, ch.x, chy + 5.5, ch.z);
  for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) mesh(new BoxGeometry(.5, 2.6, .5), M.stone, ch.x + dx, chy + 12.3, ch.z + dz);
  mesh(new ConeGeometry(3.4, 3.6, 4), M.roof, ch.x, chy + 15.4, ch.z, Math.PI / 4);
  gabled(ch.x, ch.z + 6.5, 10, 6, 5.5, Math.PI / 2, { kw: K.stone, wc: C_('#e6dfd2'), y0: chy, plinth: false, pitch: .5 });
  // the windmill on the ridge (M2's second nest) with turning sails
  const wm = { x: NESTS.mill2.x, z: NESTS.mill2.z + 3.4 }, wmy = ground(wm.x, wm.z) - .2;
  mesh(new CylinderGeometry(2.4, 3.6, 10, 12), M.wall, wm.x, wmy + 5, wm.z);
  mesh(new ConeGeometry(2.8, 3, 12), M.roof, wm.x, wmy + 11.4, wm.z);
  const sails = new Group(); sails.position.set(wm.x - 3.1, wmy + 9.6, wm.z); sails.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) { const s = new Mesh(new BoxGeometry(1.4, 9, .1), M.cloth); s.position.y = 4.6; const arm = new Group(); arm.rotation.z = i * Math.PI / 2; arm.add(s); sails.add(arm); }
  const spin = new Group(); spin.add(...sails.children); sails.add(spin); WD.sails = spin;
  sails.traverse(m => { if (m.isMesh) m.castShadow = true; }); v.scene.add(sails);
  WD.flagB = flag(v, M, ch.x + 12, chy + 6.8, ch.z - 4);
  // the ridge nest: a tumble of rocks and a log to lie behind
  const rd = NESTS.ridge, ry = ground(rd.x, rd.z);
  for (const [dx, dz, s] of [[-2.6, -2.2, 1.5], [2.4, -2.4, 1.3], [3.8, -.6, 1.1], [-3.9, -.4, 1.2], [4.6, 1.6, 1], [-4.4, 1.8, 1.3]]) mesh(boulder(s * .62, dx * 7 + 3), M.rock, rd.x + dx, ry - .2, rd.z + dz).rotation.y = dx;
  mesh(new CylinderGeometry(.22, .25, 3.2, 8), M.wood, rd.x, ry - .02, rd.z - 1.8).rotation.z = Math.PI / 2;
  // the village's merged meshes, one per material
  const vmesh = (kit, mat, cast = true) => { if (kit.empty) return null; const m = new Mesh(kit.geo(), mat); m.castShadow = cast; m.receiveShadow = true; v.scene.add(m); return m; };
  vmesh(K.wall, M.wallV); vmesh(K.roof, M.roofV); vmesh(K.wood, M.woodV); vmesh(K.stone, M.stoneV); vmesh(K.glass, M.glass, false); vmesh(K.straw, M.strawV);
  WD.wins = vmesh(K.lit, M.lit, false);

  // ---- field walls along the south road and north bank: cover for advancing squads
  WD.lowCells = new Set();
  const wallStones = new InstancedMesh(rbox(3.8, 1, .8, .2), M.stone, 160); let wsi = 0;
  const fieldWall = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 4);
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = ground(x, z);
      o.position.set(x, y + .45, z); o.rotation.set(0, Math.atan2(bx - ax, bz - az) + Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix(); wallStones.setMatrixAt(wsi++, o.matrix);
      box(x, y, z, 2.2, 1.05, 2.2, 'low'); WD.lowCells.add(cellKey(x, z));
    }
  };
  fieldWall(58, 40, 68, 62); fieldWall(28, 30, 30, 70); fieldWall(64, 98, 76, 132); fieldWall(20, 104, 36, 136);
  fieldWall(-6, -40, 24, -50); fieldWall(54, -48, 84, -44); fieldWall(-60, -60, -24, -62); fieldWall(-40, 40, -10, 58); fieldWall(-90, 80, -60, 100);
  wallStones.count = wsi; wallStones.castShadow = wallStones.receiveShadow = true; v.scene.add(wallStones);

  // ---- trees and rocks (instanced: fewer leaves far away, painted cards further still)
  const props = new Props(v.scene), atlas = treeAtlas(), leaves = leafMat(atlas);
  for (const [k, make_] of [['oak', oakGeo], ['poplar', poplarGeo], ['fir', firGeo]]) {
    const near = make_(1), m = props.kind(k, make_(0), leaves, { lod: [[TREE_LOD[0], near], [TREE_LOD[1], make_(2)]], shadowFar: 70 });
    m.addShadowLOD(near, 0);   // close shadows from the leafy shape, far ones from the cards
  }
  props.kind('rock', boulder(1.6, 4), M.rock, { lod: [[60, boulder(1.6, 4, undefined, 8)]], shadowFar: 50 });
  const clear = (x, z) => {
    if (roadD(x, z) < 7 || Math.abs(z - RIVER(x)) < 16 || Math.abs(z - RAILZ) < 10 || Math.hypot(x + 15, z + 108) < 70 || Math.hypot(x - MILL.x, z - MILL.z) < 20) return true;
    for (const n of Object.values(NESTS)) { if (Math.hypot(x - n.x, z - n.z) < 14) return true; }
    // keep the views from the nests to the village open
    if (z > -60 && z < 150 && x > -150 && x < 110) return true;
    return false;
  };
  land.scatter(props, 'fir', 190, { below: 70, steep: .6, gap: 5.5, seed: 3, keepOut: (x, z) => clear(x, z) || z > -150, scale: [.8, 1.35] });
  land.scatter(props, 'oak', 170, { steep: .5, gap: 8, seed: 5, keepOut: (x, z) => clear(x, z) || z < -170, scale: [.75, 1.25] });
  // poplars in lines along the lanes and the river banks, away from the lines of fire
  const R = rng(11), rows = [];
  for (const r of [ROADS[1].slice(2), ROADS[2].slice(1)]) for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let d = 4; d < L; d += 9 + R() * 3) for (const sd of [-1, 1]) if (R() < .8) rows.push([ax + (bx - ax) * d / L + nx * sd * 5.5, az + (bz - az) * d / L + nz * sd * 5.5]);
  }
  for (let x = -300; x < 300; x += 10 + R() * 6) if (x < -70 || x > 120) for (const sd of [-1, 1]) if (R() < .6) rows.push([x, RIVER(x) + sd * (13 + R() * 3)]);
  for (const [x, z] of rows) {
    if (Math.hypot(x + 15, z + 108) < 62 || Math.abs(z - RAILZ) < 7 || Math.hypot(x - MILL.x, z - MILL.z) < 16 || Math.abs(x - BRIDGE.x) < 12 || land.height(x, z) < -.5) continue;
    props.add('poplar', x, land.height(x, z) - .2, z, { rot: R() * TAU, scale: .85 + R() * .35 });
  }
  land.scatter(props, 'rock', 70, { steep: .7, gap: 8, seed: 9, keepOut: clear, scale: [.5, 1.6] });
  props.done(); WD.props = props;

  // ---- moving things
  WD.train = makeTrain(M); v.scene.add(WD.train);
  WD.dust = new Particles(v, { max: 500, additive: false });
  WD.sparks = new Particles(v, { max: 300, additive: true });
  WD.trail = new Particles(v, { max: 260, additive: false });
  WD.smoke = new Particles(v, { max: 200, additive: false });
  const bullet = new Mesh(new CapsuleGeometry(.05, .22, 4, 8), M.brass); bullet.rotation.order = 'YXZ'; bullet.visible = false; v.scene.add(bullet); WD.bullet = bullet;
  // tracers from enemy fire (pooled)
  const trMat = pbr('#ffd890', { glow: 3.2 }), trGeo = new BoxGeometry(.028, .028, 1);
  WD.tracers = Array.from({ length: 10 }, () => { const m = new Mesh(trGeo, trMat); m.visible = false; m.castShadow = false; v.scene.add(m); return m; });
  // first-person rifle (shown when not scoped): walnut stock, blued steel, a scope on two rings
  const gun = new Group(), steel = pbr('#ffffff', { vertexColors: true, rough: .32, metal: .85 }), walnut = pbr('#ffffff', { tex: wood, rough: .55, vertexColors: true });
  const kw = baker(), ks = baker(), Z = Math.PI / 2, W_ = '#a07050', S_ = '#30343a';
  kw.add(rbox(.046, .13, .2, .02), W_, [0, -.055, .27], { r: [.12, 0, 0] }).add(rbox(.04, .06, .16, .015), W_, [0, -.012, .12], { r: [.2, 0, 0] }).add(rbox(.05, .056, .52, .018), W_, [0, -.004, -.23]);
  ks.add(new CylinderGeometry(.016, .016, .13, 12), S_, [0, .026, -.01], { r: [Z, 0, 0] }).add(new CylinderGeometry(.009, .011, .64, 10), S_, [0, .03, -.4], { r: [Z, 0, 0] });
  ks.add(new CylinderGeometry(.016, .016, .25, 14), S_, [0, .086, -.03], { r: [Z, 0, 0] }).add(new CylinderGeometry(.022, .017, .05, 14), S_, [0, .086, .115], { r: [Z, 0, 0] }).add(new CylinderGeometry(.025, .017, .08, 14), S_, [0, .086, -.19], { r: [Z, 0, 0] });
  ks.add(new CylinderGeometry(.011, .011, .03, 10), S_, [0, .108, -.03]).add(new CylinderGeometry(.011, .011, .03, 10), S_, [.022, .086, -.03], { r: [0, 0, Z] });
  for (const z of [.05, -.1]) ks.add(new BoxGeometry(.02, .05, .022), S_, [0, .058, z]);
  ks.add(new BoxGeometry(.008, .03, .05), S_, [0, -.04, .06]);
  for (const [k, m] of [[kw, walnut], [ks, steel]]) gun.add(new Mesh(k.geo(), m));
  const bolt = new Group(), bk = baker(); bk.add(new CylinderGeometry(.005, .005, .06, 6), S_, [.03, 0, 0], { r: [0, 0, Z] }).add(new SphereGeometry(.011, 8, 6), S_, [.062, -.008, 0]);
  bolt.add(new Mesh(bk.geo(), steel)); bolt.position.set(0, .03, .05); gun.add(bolt);
  gun.position.set(.13, -.15, -.3); gun.traverse(m => { m.castShadow = false; m.userData.noAO = true; }); v.cam.add(gun); WD.gun = gun; WD.bolt = bolt;
  // nest markers (a soft flare where you can move to)
  WD.marks = new Particles(v, { max: 8, additive: true });
  // a helmet that pops off on a head shot
  WD.helmets = Array.from({ length: 4 }, () => { const m = new Mesh(new SphereGeometry(.15, 12, 8, 0, TAU, 0, Math.PI / 2), pbr('#3a4238', { rough: .6 })); m.visible = false; m.castShadow = true; v.scene.add(m); return { m, vx: 0, vy: 0, vz: 0, life: 0 }; });

  // ---- three lost letters in each mission, tucked where you can spot them with the glasses
  {
    const paper = pbr('#efe6d2', { rough: .9, glow: .18, glowCol: '#fff4dc', side: THREE.DoubleSide }), seal = pbr('#9a2a1e', { rough: .5 });
    const env = new PlaneGeometry(.34, .23), dot = new CylinderGeometry(.035, .035, .012, 10), at = (x, y, z, ry = 0, tilt = 0) => ({ x, y, z, ry, tilt });
    const g = (x, z) => ground(x, z), wy = g(-6, -104);
    WD.letterSpots = {
      m1: [at(-6.4, wy + 2.475, -103.8, .3), at(16.1, g(16, -98) + .9, -98, 1.1), at(MILL.x + 2.6, millY + 5.47, MILL.z + 5.55, 0, -1.2)],
      m2: [at(120, g(120, 60) + 2.98, 60, .3, -.3), at(48, g(48, -92) + .86, -92, -.4), at(-36, g(-36, -88) + .9, -88, 2)],
    };
    WD.letters = [0, 1, 2].map(() => { const l = new Group(), e = new Mesh(env, paper); e.rotation.x = -Math.PI / 2; const d = new Mesh(dot, seal); d.position.y = .008; l.add(e, d); l.visible = false; v.scene.add(l); return l; });
  }
  // ---- rooks in the trees: a shot (or a bullet landing near) sends them up, and that gives you away
  {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.2, -.45, .1, .05, 0, 0, .14, 0, 0, -.2, 0, 0, .14, .45, .1, .05, 0, -.02, -.22, 0, .03, .1, 0, -.04, .3], 3)); bg.computeVertexNormals();
    const birds = new InstancedMesh(bg, pbr('#15130f', { rough: 1, side: THREE.DoubleSide }), 36); birds.frustumCulled = false; birds.castShadow = false; birds.count = 0; v.scene.add(birds);
    WD.birds = birds;
    WD.flocks = [[24, 138], [-30, -134], [58, -48], [-118, 104], [96, 70]].map(([x, z]) => ({ x, z, y: g0(x, z) + 9, n: 12, t: 0, up: false, rest: 0, b: [] }));
    function g0(x, z) { return ground(x, z); }
  }
  // ---- paths and cover
  const coverAt = (c, r) => { if (WD.lowCells.has(c + ',' + r)) return true; const x = GX0 + (c + .5) * CELL, z = GZ0 + (r + .5) * CELL; return solidAt(x, z, solids); };
  WD.cover = new CoverMap(GC, GR, coverAt, { size: CELL, x0: GX0, y0: GZ0, low: (c, r) => WD.lowCells.has(c + ',' + r) });
  WD.nav = new NavGrid(GC, GR, CELL, (c, r) => {
    const x = GX0 + (c + .5) * CELL, z = GZ0 + (r + .5) * CELL;
    if (Math.abs(x - BRIDGE.x) < 4 && z > BRIDGE.z0 - 2 && z < BRIDGE.z1 + 2) return false;
    return coverAt(c, r) || land.height(x, z) < -.6 || land.slope(x, z) > .55;
  });
  return WD;
}
function roadZ(x) { const r = ROADS[2]; for (let i = r.length - 2; i >= 0; i--) { const [ax, az] = r[i], [bx, bz] = r[i + 1]; if (x >= ax) return az + (bz - az) * clamp((x - ax) / (bx - ax), 0, 1); } return r[0][1]; }
function cellKey(x, z) { return Math.floor((x - GX0) / CELL) + ',' + Math.floor((z - GZ0) / CELL); }
function solidAt(x, z, solids) { for (const b of solids) if (b.kind !== 'low' && x > b.x0 - .5 && x < b.x1 + .5 && z > b.z0 - .5 && z < b.z1 + .5 && b.y0 < 30) return true; return false; }
function roofGeo() {
  // a unit gable roof: 1 wide (x), 1 high, 1 deep (z), ridge along z
  const g = new THREE.BufferGeometry(), p = [-.5, 0, -.5, .5, 0, -.5, 0, 1, -.5, -.5, 0, .5, .5, 0, .5, 0, 1, .5];
  const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
  const pos = []; for (const i of idx) pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] + pos[i * 3 + 2], pos[i * 3 + 1] + pos[i * 3 + 2] * .5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function flag(v, M, x, y, z) {
  const pole = new Mesh(new CylinderGeometry(.05, .06, 4, 6), M.iron); pole.position.set(x, y - 2, z); v.scene.add(pole);
  const g = new PlaneGeometry(2, 1.1, 10, 4), cloth = new Mesh(g, M.cloth); cloth.position.set(x, y - .55, z); cloth.castShadow = true; v.scene.add(cloth);
  return { cloth, base: Float32Array.from(g.attributes.position.array), x, y, z };
}
function makeTrain(M) {
  const t = new Group(), body = pbr('#2b2d2f', { rough: .5, metal: .6 }), red = pbr('#6e2a22', { rough: .7 });
  const boiler = new Mesh(new CylinderGeometry(1.1, 1.1, 7, 16), body); boiler.rotation.z = Math.PI / 2; boiler.position.set(1, 2.1, 0); t.add(boiler);
  const cab = new Mesh(rbox(3, 3, 2.8, .15), body); cab.position.set(-3.6, 2.6, 0); t.add(cab);
  const chim = new Mesh(new CylinderGeometry(.35, .45, 1.4, 10), body); chim.position.set(3.6, 3.6, 0); t.add(chim);
  for (let i = 0; i < 4; i++) { const wh = new Mesh(new CylinderGeometry(.75, .75, .3, 14), M.iron); wh.rotation.x = Math.PI / 2; wh.position.set(-3 + i * 2.2, .75, 1.25); t.add(wh); const w2 = wh.clone(); w2.position.z = -1.25; t.add(w2); }
  for (let i = 1; i <= 5; i++) { const w = new Mesh(rbox(8.4, 3, 2.8, .15), i % 2 ? red : M.canvas); w.position.set(-6 - i * 9, 2.3, 0); t.add(w); }
  t.traverse(m => { if (m.isMesh) m.castShadow = true; });
  t.userData.chim = chim; t.visible = false; return t;
}

// soldiers: each one skinned mesh (one draw call) on a skeleton that gs.poses moves. Every part (tunic,
// webbing, helmet, boots, rifle) is bound to one bone; a part is hidden by shrinking its bone to nothing
// (the helmet that flies off, the radio pack, the officer's missing rifle).
const LOOKS = {
  grey: { tunic: '#5c636b', trousers: '#4a5057', helmet: '#4b5249', boots: '#1f1c19', belt: '#2b2723', kit: '#3f3c33', skin: '#d6a982', band: '#d9c25a', hat: 'helmet' },
  officer: { tunic: '#3d434b', trousers: '#2f343a', helmet: '#353b42', boots: '#141210', belt: '#1e1b18', kit: '#2e2c28', skin: '#d6a982', band: '#d9c25a', hat: 'cap' },
  ally: { tunic: '#6b6f40', trousers: '#5a5e37', helmet: '#3f4a2c', boots: '#2b231a', belt: '#7d7656', kit: '#6e6a4c', skin: '#e0b28b', band: null, hat: 'beret' },
};
const BONES = ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR', 'helmet', 'rifle', 'pack', 'aerial'];
const PARENT = { spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', armR: 'spine', foreR: 'armR', legL: 'hips', shinL: 'legL', legR: 'hips', shinR: 'legR', helmet: 'head', rifle: 'foreR', pack: 'spine', aerial: 'spine' };
const BIND = { hips: [0, .97, 0], spine: [0, .05, 0], head: [0, .42, 0], armL: [.22, .3, 0], foreL: [0, -.3, 0], armR: [-.22, .3, 0], foreR: [0, -.3, 0], legL: [.1, 0, 0], shinL: [0, -.42, 0], legR: [-.1, 0, 0], shinR: [0, -.42, 0], helmet: [0, 0, 0], rifle: [0, 0, 0], pack: [0, 0, 0], aerial: [0, 0, 0] };
const ORIGIN = {}; for (const b of BONES) { const p = PARENT[b] ? ORIGIN[PARENT[b]] : [0, 0, 0], o = BIND[b]; ORIGIN[b] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; }
// merges shapes into one geometry with colours (skin: for a soldier, the bone each shape follows;
// uvs: keep each shape's texture coordinates, times uv [u, v], so a textured material shows its grain)
function baker(skin = false, uvs = false) {
  const P = [], N = [], C = [], U = [], SI = [], SW = [], I = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), nm = new THREE.Matrix3(), v = new Vector3(), w = new Vector3(), sc = new Vector3();
  let base = 0;
  return {
    add(g, col, at, { s = [1, 1, 1], r = [0, 0, 0], bone = 0, uv = [1, 1] } = {}) {
      m4.compose(v.set(at[0], at[1], at[2]), q.setFromEuler(e.set(r[0], r[1], r[2])), sc.set(s[0], s[1], s[2])); nm.getNormalMatrix(m4);
      const c = new Color(col), pos = g.attributes.position, nor = g.attributes.normal, tu = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m4); P.push(v.x, v.y, v.z); w.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.push(w.x, w.y, w.z);
        C.push(c.r, c.g, c.b); if (skin) { SI.push(bone, 0, 0, 0); SW.push(1, 0, 0, 0); }
        if (uvs) U.push(tu ? tu.getX(i) * uv[0] : 0, tu ? tu.getY(i) * uv[1] : 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + base); else for (let i = 0; i < pos.count; i++) I.push(base + i);
      base += pos.count; return this;
    },
    geo() {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      if (skin) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); }
      g.setIndex(I); g.computeBoundingSphere(); return g;
    },
  };
}
const SOLDIER_GEO = {};
function soldierGeo(look) {
  const L = LOOKS[look], k = baker(true), O = ORIGIN;
  const put = (bone, g, col, d, o = {}) => k.add(g, col, [O[bone][0] + d[0], O[bone][1] + d[1], O[bone][2] + d[2]], { ...o, bone: BONES.indexOf(bone) });
  const cap = (r, l) => new CapsuleGeometry(r, l, 4, 10), cyl = (a, b, h, n = 12, open = false) => new CylinderGeometry(a, b, h, n, 1, open), ball = (r, n = 12) => new SphereGeometry(r, n, Math.max(6, n * .7 | 0));
  // hips: seat of the trousers, tunic skirt, belt, buckle, pouches, canteen
  put('hips', cyl(.165, .175, .2), L.trousers, [0, -.07, 0], { s: [1, 1, .72] });
  put('hips', cyl(.172, .19, .15), L.tunic, [0, -.01, 0], { s: [1, 1, .74] });
  put('hips', cyl(.18, .18, .055, 16), L.belt, [0, .085, 0], { s: [1, 1, .74] });
  put('hips', new BoxGeometry(.05, .04, .02), '#8a8270', [0, .085, .135]);
  for (const x of [-.1, -.045, .045, .1]) put('hips', new BoxGeometry(.045, .07, .045), L.kit, [x, .07, .125], { r: [0, x * 1.4, 0] });
  put('hips', cyl(.045, .045, .13), look === 'ally' ? '#5a6040' : '#3e4438', [.17, -.02, -.07]);
  put('hips', new BoxGeometry(.05, .2, .04), L.belt, [-.16, -.06, -.08], { r: [.15, 0, .1] });
  // chest: the tunic (wider at the shoulders), collar, pockets, straps
  put('spine', cap(.15, .24), L.tunic, [0, .25, 0], { s: [1.18, 1, .78] });
  put('spine', cyl(.072, .085, .07), L.tunic, [0, .5, 0]);
  for (const x of [-.075, .075]) { put('spine', new BoxGeometry(.085, .09, .02), L.tunic, [x, .3, .118]); put('spine', new BoxGeometry(.035, .36, .012), L.belt, [x * 1.05, .28, .124], { r: [-.08, 0, x * .5] }); put('spine', new BoxGeometry(.035, .36, .012), L.belt, [x * 1.05, .28, -.124], { r: [.08, 0, x * .5] }); }
  // the pack (radio men and Hale's squad), a blanket roll on top; the radio aerial
  put('pack', new BoxGeometry(.3, .34, .15), look === 'ally' ? '#4f5530' : '#454a40', [0, .26, -.2]);
  put('pack', cyl(.05, .05, .32), look === 'ally' ? '#6a6450' : '#5a5a54', [0, .45, -.19], { r: [0, 0, Math.PI / 2] });
  put('aerial', cyl(.006, .009, 1.3, 5), '#222222', [.1, .95, -.24]);
  // head: neck, face, ears, eyes
  put('head', cyl(.05, .058, .12), L.skin, [0, .04, 0]);
  put('head', ball(.112, 14), L.skin, [0, .145, .01], { s: [.92, 1.08, 1] });
  put('head', new BoxGeometry(.026, .045, .035), L.skin, [0, .135, .118]);
  for (const x of [-1, 1]) { put('head', ball(.025, 6), L.skin, [x * .108, .14, 0], { s: [.4, 1, .8] }); put('head', ball(.011, 6), '#1a1612', [x * .038, .165, .1]); }
  put('head', new SphereGeometry(.117, 12, 8, 0, TAU, 0, Math.PI / 2), '#3a3128', [0, .165, -.005], { s: [.95, .85, 1.03] });
  // what's on the head (pops off on a head shot)
  if (L.hat === 'helmet') { put('helmet', new SphereGeometry(.148, 16, 9, 0, TAU, 0, Math.PI / 2), L.helmet, [0, .19, -.006], { s: [1, .86, 1.08] }); put('helmet', cyl(.15, .17, .05, 16, true), L.helmet, [0, .175, -.012], { s: [1, 1, 1.08], r: [-.12, 0, 0] }); }
  else if (L.hat === 'cap') { put('helmet', cyl(.13, .118, .075, 14), L.helmet, [0, .245, -.01]); put('helmet', cyl(.15, .15, .03, 14), L.helmet, [0, .29, -.025], { s: [1, 1, 1.12], r: [-.1, 0, 0] }); put('helmet', new BoxGeometry(.19, .012, .08), '#111111', [0, .225, .11], { r: [.25, 0, 0] }); put('helmet', new BoxGeometry(.2, .02, .01), '#b8a050', [0, .25, .128]); }
  else put('helmet', ball(.14, 12), L.helmet, [.025, .245, -.01], { s: [1.08, .34, 1.08], r: [0, 0, -.18] });
  // arms: shoulders, sleeves, cuffs, hands; the armband
  for (const [a, f, x] of [['armL', 'foreL', 1], ['armR', 'foreR', -1]]) {
    put(a, ball(.07, 10), L.tunic, [0, -.01, 0]); put(a, cap(.058, .19), L.tunic, [0, -.14, 0]);
    put(f, cap(.05, .17), L.tunic, [0, -.12, 0]); put(f, cyl(.054, .054, .035, 10), L.tunic, [0, -.225, 0]);
    put(f, ball(.047, 10), L.skin, [0, -.29, .008], { s: [.85, 1.12, .72] });
    void x;
  }
  if (L.band) put('armL', cyl(.064, .064, .055, 12), L.band, [0, -.13, 0]);
  // legs: trousers, boots (leather for the Grey Order, canvas gaiters for Hale's squad)
  for (const [lg, sh] of [['legL', 'shinL'], ['legR', 'shinR']]) {
    put(lg, cap(.085, .27), L.trousers, [0, -.21, 0]);
    put(sh, cap(.07, .14), L.trousers, [0, -.12, 0]);
    put(sh, cyl(.069, .062, look === 'ally' ? .17 : .27), look === 'ally' ? '#8a8464' : L.boots, [0, look === 'ally' ? -.34 : -.31, 0]);
    put(sh, new BoxGeometry(.105, .09, .24), L.boots, [0, -.5, .04]); put(sh, ball(.053, 8), L.boots, [0, -.485, .155], { s: [1, .75, 1] });
  }
  // the rifle along the right forearm: butt by the elbow, muzzle past the hand
  const R = (g, col, y, o) => put('rifle', g, col, [0, y, .045], o);
  R(new BoxGeometry(.04, .3, .07), '#5a3e26', .02, { s: [1, 1, 1] }); R(new BoxGeometry(.035, .22, .05), '#5a3e26', -.22);
  R(new BoxGeometry(.034, .14, .04), '#2a2a2a', -.37); R(cyl(.011, .011, .5, 8), '#2a2a2a', -.62); R(new BoxGeometry(.03, .3, .042), '#5a3e26', -.5);
  return k.geo();
}
const SOLDIER_MAT = new Map();
const hider = bone => ({ get visible() { return bone.scale.x > 0; }, set visible(on) { bone.scale.setScalar(on ? 1 : 0); } });
const POOL = {};
function man(look) {
  const list = POOL[look] ||= [];
  const free = list.find(f => !f.userData.used);
  if (free) { free.userData.used = true; free.visible = true; return free; }
  const geo = SOLDIER_GEO[look] ||= soldierGeo(look);
  if (!SOLDIER_MAT.has('m')) SOLDIER_MAT.set('m', pbr('#ffffff', { vertexColors: true, rough: .84 }));
  const root = new Group(), bones = {};
  for (const b of BONES) { const bone = new THREE.Bone(); bone.position.set(...BIND[b]); bones[b] = bone; (PARENT[b] ? bones[PARENT[b]] : root).add(bone); }
  const mesh = new THREE.SkinnedMesh(geo, SOLDIER_MAT.get('m')); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new Vector3(0, .8, 0), 1.7);
  root.add(mesh); root.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(BONES.map(b => bones[b])), mesh.matrixWorld);
  root.rig = new Rig({ hips: bones.hips, spine: bones.spine, head: bones.head, armL: bones.armL, foreL: bones.foreL, armR: bones.armR, foreR: bones.foreR, legL: bones.legL, shinL: bones.shinL, legR: bones.legR, shinR: bones.shinR }, { height: 1.8 });
  root.userData = { used: true, look, rifle: hider(bones.rifle), pack: hider(bones.pack), aerial: hider(bones.aerial), helmet: hider(bones.helmet), mesh };
  list.push(root); WD.v.scene.add(root);
  return root;
}
function freeMen() { for (const k in POOL) for (const f of POOL[k]) { f.userData.used = false; f.visible = false; } }

// ------------------------------------------------------------------ campaign
const CHAPTERS = [{ id: 'ashvale', name: 'Ashvale', missions: [
  { id: 'm1', name: 'The Mill Radio', stars: ['Finish', 'Stop the call inside 30 s', 'Finish under 3:00'], collect: 3 },
  { id: 'm2', name: 'Bells at Dusk', stars: ['Finish', 'Every one of Hale\'s squad home', 'Marksman with your first shot'], collect: 3 },
] }];
const SEALED = [['3', 'The Dam'], ['4', 'Night Rail'], ['5', 'Long Shadow']];
const BRIEF = {
  m1: 'Dawn. A Grey Order radio post in the old mill. Stop the operator before he calls in their column, then get out on the supply train.',
  m2: 'Dusk and rain. Sergeant Hale\'s squad must cross the stone bridge into Larkford. Find their marksman, silence the gun nest, keep the squad alive.',
};
const OAKE = 'CAPT. OAKE', HALE = 'SGT. HALE';
// Each mission's light (gs.sky keyframes: hour -> colours; the sun's strength is x the light's own).
// Mission 1: a clear golden morning with mist lying in the valley. Mission 2: a storm rolling in at
// dusk, a band of low sun under the clouds, wet roads and lit windows.
const NIGHT = [[0, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }], [5, { top: '#10162a', horizon: '#3a3a4a', sun: '#8090c0', sunI: .15, amb: .4 }]];
const DAY_CLEAR = [...NIGHT,
  [6.3, { top: '#50648c', horizon: '#d8b494', sun: '#ffaa66', sunI: .5, amb: .45 }],
  [7.6, { top: '#5f86c0', horizon: '#d6d6d0', sun: '#ffd8a4', sunI: 1, amb: .62 }],
  [10, { top: '#6a90c4', horizon: '#d2dad6', sun: '#fff0d8', sunI: 1.05, amb: .75 }],
  [16, { top: '#6a90c4', horizon: '#d2dad6', sun: '#fff0d8', sunI: 1.05, amb: .75 }],
  [20, { top: '#121a30', horizon: '#3a3448', sun: '#8090c0', sunI: .15, amb: .4 }],
  [24, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }],
];
const DAY_STORM = [...NIGHT,
  [8, { top: '#4a5260', horizon: '#8a8e90', sun: '#e8e0d0', sunI: .45, amb: .7 }],
  [16, { top: '#3e4654', horizon: '#80868a', sun: '#e0d4c0', sunI: .4, amb: .65 }],
  [17.75, { top: '#2a303c', horizon: '#9a7a62', sun: '#ff9a52', sunI: .6, amb: .62 }],
  [19, { top: '#141824', horizon: '#3e3236', sun: '#8a7080', sunI: .15, amb: .35 }],
  [24, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }],
];
const MOODS = {
  m1: {
    time: 7.4, tilt: -.3, day: DAY_CLEAR, clouds: .3, gap: .55, cloudLight: null, cloudDark: null,
    air: { haze: .00062, mist: .0035, mistFall: .13, mistY: -1.5, patchy: .9, cloudShade: .38, wind: [5, -1.5], wet: 0, colour: '#b4c0cc', sunColour: '#f2d4a4' },
    grade: { saturation: 1.12, contrast: 1.16, shadows: '#e2e8f4', highlights: '#fff4e4' }, glare: .85, exposure: 1.08, bloom: .3, env: .6, windows: 0,
  },
  m2: {
    time: 17.75, tilt: .12, day: DAY_STORM, clouds: .86, gap: .4, cloudLight: '#8c8a8a', cloudDark: '#2a2e36',
    air: { haze: .0014, mist: .005, mistFall: .1, mistY: -1, patchy: .7, cloudShade: .5, wind: [-8, 1], wet: .85, colour: '#5f646c', sunColour: '#a8785a' },
    grade: { saturation: .82, contrast: 1.1, shadows: '#d2dcee', highlights: '#ffeedc' }, glare: .4, exposure: 1.02, bloom: .45, env: .65, windows: 1.8,
  },
};
// trees swap to fewer leaves past these distances (further when you look through the scope)
const TREE_LOD = [85, 240];

// ------------------------------------------------------------------ the game
function make(api) {
  const fx = new Juice();
  const camp = new Campaign(CHAPTERS).attach(api);
  const gun = new Gun({ damage: 100, rate: .95, mag: 5, reload: 2.6, spread: 0, bloom: 0, recoil: .03, sideways: .3, recover: 3, auto: false, range: 600, head: 2 });
  const me = new Health({ max: 100, regen: 14, delay: 4 });
  const bodies = new Bodies({ range: 22 });
  bodies.on('found', (b, g) => { g.sus = 1; heat = Math.min(1.2, heat + .12); });
  // The Grey Order's field commander: starts from simple rules (the teacher) and learns how you play
  const boss = new Brain(api, {
    name: 'grey-commander', inputs: 8, actions: ['hold', 'push', 'flank', 'mortar', 'watch'], hidden: [10],
    teacher: s => s[0] < .35 ? (s[1] > .45 ? 'watch' : 'hold') : s[0] < 1 ? 'push' : s[2] > .3 ? 'mortar' : s[3] > .5 ? 'flank' : 'push',
    limits: { react: .9, perSecond: 1 },
    rules: (s, a) => (a === 'mortar' && (s[0] < .9 || s[4] < .35 || s[7] < .15)) ? 'push' : ((a === 'push' || a === 'flank') && s[6] <= 0) ? 'hold' : a,
  });
  // Every rifleman also thinks for himself: a Tiny Brains mind (a slightly changed copy of the shared
  // 'grey-rifleman' brain) picks hold / peek / rush / flank / fall back about once a second. It starts
  // as the rules below (the teacher) and learns which choices made tense, fair fights; the guard rails
  // keep it human: slow to react, few changes of mind, some randomness, and the game's hard rules.
  // inputs: 0 how far (1 = rifle range, 300 m), 1 how sure they are where you are, 2 in cover (1) or
  // not (-1), 3 your scope is on him, 4 shaken (a near miss, a friend down), 5 the commander's push,
  // 6 friends left, 7 how long you've been quiet, 8 his nerve (each man's own, -1 careful .. 1 bold)
  const rifleman = new Brain(api, {
    name: 'grey-rifleman', inputs: 9, hidden: [10], actions: ['hold', 'peek', 'rush', 'flank', 'fallback'],
    teacher: s => s[0] > 1 ? 'rush' : s[3] > .5 && s[2] > 0 ? 'hold' : s[4] > .55 ? (s[2] > 0 ? 'hold' : 'rush') : s[6] < .3 ? 'fallback'
      : s[1] < .4 ? 'hold' : s[8] > .3 && (s[5] > .5 || s[7] > .6) ? (s[5] > .5 && s[5] < .7 && s[6] > .5 ? 'flank' : 'rush') : s[2] < 0 ? 'rush' : 'peek',
    limits: { react: .9, perSecond: .8, minNoise: .06 },
    // hard rules: no shooting blind, one flanker at a time (and not when few are left), no running off the map
    rules: (s, a) => a === 'peek' && s[1] < .3 ? 'hold' : a === 'flank' && (s[6] < .4 || squad.t - squad.lastFlank < 8) ? 'rush' : a === 'fallback' && s[0] > 1.3 ? 'hold' : a,
  });
  const riflemen = new Wave(rifleman);
  const endMind = (s, feel = 0) => { if (!s.mind) return; if (feel) s.mind.feel(feel); s.mind.done(); s.mind = null; };
  // what they shout to each other (on the radio, with a crackle); never over your own side's orders
  const CALLS = {
    contact: ['Contact! Sniper!', 'Sniper! Get down!'], flanking: ['Going round the side!', 'Flanking. Keep him busy!', 'I\'ll get round behind him!'],
    'falling back': ['Fall back!', 'Back, back! Find cover!'], 'man down': ['Man down!', 'They got Brenner!', 'Vogt is hit!'], grenade: ['Grenade! Cover me!', 'Throwing!'],
    covering: ['Covering fire!', 'Keep his head down!'], moving: ['Move up! Go!', 'Moving!'], 'heads down': ['Stay low, he\'s watching!', 'Heads down!'],
  };
  let lastCall = -99;
  function callout(who, what) {
    const l = CALLS[what]; if (!l || t - lastCall < 3.2 || (lineFx && !lineFx.enemy)) return;
    lastCall = t; say(l[(Math.random() * l.length) | 0], 'GREY ORDER · RADIO', 1.6, true);
    noise(.12, { vol: .035, from: 3200, to: 1800 }); tone(1250, { len: .04, wave: 'square', vol: .012 });
  }
  let mission, mid, state, t, score, men, allies, nest, nestId, look, scoped, glass, zoom, breath, gasp, heat, located, alertedN, squad, shots, bulletCam, train, timers;
  let cut, qte, qteKind, zip, move, mortar, bell, storm, sky, rain, tower, drums, car, op, cs, mgNest, sel, favour, saveNest, tagT, hits, ptr, pinch, lastShotT, firstShotHit, opTime, coverMsg, lineFx, slowmo, keys, endT, outroDone, briefT, quietT, mortarCool;

  const tmpV = new Vector3(), tmpA = new Vector3(), tmpB = new Vector3();
  const nestEye = n => { const y = WD.land.height(n.x, n.z) + n.up + .5; return { x: n.x, y, z: n.z }; };
  const groundAt = (x, z) => (Math.abs(x - BRIDGE.x) < 3.4 && z > BRIDGE.z0 && z < BRIDGE.z1) ? Math.max(BRIDGE.y, WD.land.height(x, z)) : WD.land.height(x, z);
  const dirOf = (yaw, pitch, out = tmpV) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const fovNow = () => 62 / (scoped ? zoom : glass ? 3.2 : 1);

  // ---- soldiers
  function soldier(o) {
    const look_ = o.look || 'grey', m = man(look_);
    const s = { get down() { return this.ko; }, get alive() { return !this.ko; }, kind: 'rifle', x: 0, y: 0, yaw: 0, hp: 1, maxHp: 1, ko: false, alert: false, route: null, ri: 0, wt: 0, speed: 0, path: null, pathTo: null, fireT: rnd(1, 3), order: { do: 'hold' }, tagged: false, look: look_, sus: 0, crouch: false, aimAt: null, vx: 0, vy: 0, ...o, m };
    m.userData.aerial.visible = s.kind === 'radio'; m.userData.pack.visible = s.kind === 'radio' || s.look === 'ally';
    m.userData.helmet.visible = true; m.userData.rifle.visible = s.kind !== 'officer';
    m.rig.play('idle', { fade: 0 }); m.rig.upper(null);
    s.gy = groundAt(s.x, s.y) + (s.lift || 0); m.position.set(s.x, s.gy, s.y); m.rotation.y = s.yaw;
    return s;
  }
  const alive = list => list.filter(s => !s.ko);
  const wakeUp = (s, why) => {
    if (s.ko || s.alert || s.fixed) return;
    s.alert = true; s.sus = 1; s.alertT = 0; if (!squad.members.includes(s)) squad.members.push(s);
    if (!squad.alerted) { squad.alerted = true; squad.call(s, 'contact'); }
    s.order = { do: 'hold' }; s.plan = null; s.thinkT = rnd(.2, 1.4); s.thinkDt = 0;   // staggered, so they don't all decide at once
    if (!s.mind) s.mind = riflemen.mind();
    if (why === 'body') say('Man down! Sniper!', 'GREY ORDER', 1.6, true);
  };
  function knockOut(s, head, d, viaCam) {
    if (s.ko) return;
    s.ko = true; s.m.rig.play('downed', { fade: .25 }); s.m.rig.upper(null);
    // a long duel was a good fight; dropping in the open in his first seconds was a dull one
    endMind(s, s.alert ? (s.alertT > 7 ? .5 : s.alertT < 2 && s.plan !== 'hold' ? -.2 : 0) : 0);
    for (const o of men) if (o !== s && !o.ko && Math.hypot(o.x - s.x, o.y - s.y) < 16) o.shaken = Math.max(o.shaken || 0, .75);
    squad.hurt(s); squad.cover.free(s);
    bodies.add(s.x, s.y, s);
    let pts = 100; const tags = [];
    if (head) { pts += 100; tags.push('HEAD'); popHelmet(s); }
    if (d > 200) { pts += Math.round(d / 2); tags.push(Math.round(d) + ' M'); }
    if (masked()) { pts += 50; tags.push('COVERED'); }
    if (!s.alert) { pts += 50; tags.push('UNSEEN'); }
    if (viaCam) pts += 50;
    score += pts; api.score(score);
    s.koFx = { pts, tags, t: 0 };
    sounds.coin(1.2); haptic(head ? 'success' : 'medium');
    for (let i = 0; i < 14; i++) WD.sparks.emit({ x: s.x, y: s.gy + 1.6, z: s.y, vx: rnd(-1.5, 1.5), vy: rnd(1, 3), vz: rnd(-1.5, 1.5), life: .9, size: .16, col: [3, 2.4, .6], drag: 2, grav: 2 });
    // anyone close and calm hears it and gets suspicious
    for (const o of men) if (!o.ko && !o.alert && Math.hypot(o.x - s.x, o.y - s.y) < 26) o.sus = Math.max(o.sus, .6);
    if (squad.alerted) boss.feel(.3);
  }
  function popHelmet(s) {
    const h = WD.helmets.find(q => q.life <= 0) || WD.helmets[0]; s.m.userData.helmet.visible = false;
    s.m.rig.parts.head.getWorldPosition(tmpA);
    h.m.position.copy(tmpA).y += .14; h.m.visible = true; h.life = 4; h.vx = rnd(-1, 1); h.vy = 5; h.vz = rnd(-1, 1); h.spin = rnd(6, 12);
  }
  function hitSpheres(s, out) {
    const p = s.m.rig.parts; out.length = 0;
    p.head.getWorldPosition(tmpA); out.push([tmpA.x, tmpA.y + .12, tmpA.z, .17, true]);
    p.spine.getWorldPosition(tmpA); out.push([tmpA.x, tmpA.y + .24, tmpA.z, .27, false]);
    p.hips.getWorldPosition(tmpA); out.push([tmpA.x, tmpA.y - .05, tmpA.z, .24, false]);
    return out;
  }
  const SPH = [];

  // ---- the player's shots
  function fire() {
    if (state !== 'play' || move || bulletCam) return;
    const eye = WD.v.cam.position, [sy, sp] = sway();
    const d = dirOf(look.yaw + sy, look.pitch + sp + BORE, tmpB).clone();
    const s = gun.pull({ x: eye.x, y: eye.y, z: eye.z }, d, true); gun.pull(eye, d, false);
    if (!s.length) { if (gun.reloading) tone(220, { len: .05, wave: 'square', vol: .03 }); return; }
    lastShotT = t; if (cs && !cs.ko) gun.shotsAtCs++;
    const b = { x: eye.x, y: eye.y - .05, z: eye.z, vx: d.x * V0, vy: d.y * V0, vz: d.z * V0, life: 2.2, dist: 0, masked: masked() };
    shots.push(b);
    // loud unless something covers it
    heat = clamp(heat + (b.masked ? .04 : .3), 0, 1.2);
    for (const f of WD.flocks) if (Math.hypot(f.x - eye.x, f.z - eye.z) < (b.masked ? 40 : 130)) flush(f, 'shot');
    for (const o of men) if (!o.ko && !o.alert && !b.masked) o.sus = Math.max(o.sus, .35);
    noise(.5, { vol: .32, from: 2600, to: 120 }); tone(70, { len: .25, wave: 'sine', vol: .25, slide: -30 });
    // the crack rolls round the valley: echoes off the hills, duller and closer in the rain
    { const wet = rain.amount > .2 ? .6 : 1; soon(.3, () => noise(.8, { vol: .085 * wet, from: 900 * wet, to: 70, at: .08 })); soon(.85, () => noise(1, { vol: .05 * wet, from: 600 * wet, to: 50, at: .1 })); soon(1.6, () => noise(1.3, { vol: .028 * wet, from: 420, to: 40, at: .1 })); }
    haptic('heavy'); fx.shake(scoped ? 2 : 5);
    if (!scoped && !glass) { WD.gun.updateWorldMatrix(true, false); const mz = WD.gun.localToWorld(tmpA.set(0, .03, -.74)); muzzle(mz.x, mz.y, mz.z, d.x, d.y, d.z, .3); }
    if (!scoped) for (let i = 0; i < 10; i++) WD.smoke.emit({ x: eye.x + d.x * 1.2, y: eye.y + d.y * 1.2 - .1, z: eye.z + d.z * 1.2, vx: rnd(-.4, .4) + d.x * 2, vy: rnd(0, .5), vz: rnd(-.4, .4) + d.z * 2, life: 1.4, size: .5, grow: 3, col: [.75, .72, .66], a: .35, drag: 2, fadeIn: true });
    // the blast lifts dust off the ground or sill in front of the barrel
    { const fy = nest ? nestEye(nest).y - .45 : eye.y - .5; for (let i = 0; i < 8; i++) WD.dust.emit({ x: eye.x + d.x * rnd(.9, 1.6) + rnd(-.3, .3), y: fy, z: eye.z + d.z * rnd(.9, 1.6) + rnd(-.3, .3), vx: d.x * rnd(1, 3) + rnd(-.6, .6), vy: rnd(.2, 1), vz: d.z * rnd(1, 3) + rnd(-.6, .6), life: rnd(1, 1.8), size: .3, grow: 3, col: rain.amount > .2 ? [.42, .4, .38] : [.62, .56, .46], a: .3, drag: 2, fadeIn: true }); }
    // bullet cam for good long shots (worked out ahead from where things are heading)
    if (!gs.prefs.reduceMotion) {
      const p = predict(b);
      if (p && (p.d > 150 || (p.head && p.d > 90))) { bulletCam = { b, t: 0, target: p.s, scale: clamp(p.time / 1.9, .02, .4), hold: 0, from: { x: eye.x, y: eye.y, z: eye.z } }; WD.bullet.visible = true; tone(880, { len: .5, wave: 'sine', vol: .04, slide: -500 }); }
    }
    boltT = 1.1;
  }
  let boltT = 0;
  function sway() {
    if (!scoped) return [0, 0];
    const amp = .0032 * (breath.held && breath.v > 0 ? .1 : 1) * (gasp > 0 ? 2.6 : 1) * (1 + (1 - me.frac) * .8) * (8 / zoom) ** .3;
    return [(Math.sin(t * 1.1) * .6 + Math.sin(t * 2.3 + 1) * .4) * amp, (Math.sin(t * 1.7 + 2) * .6 + Math.sin(t * .7) * .4) * amp * .8];
  }
  function predict(b0) {
    // the same small steps as a real bullet, checked for hits two at a time (half the work, same path)
    const b = { ...b0 }, dt = 1 / 120;
    for (let i = 0; i < 160; i += 2) {
      const x0 = b.x, y0 = b.y, z0 = b.z;
      stepBullet(b, dt); stepBullet(b, dt);
      const h = hitTest(x0, y0, z0, b.x, b.y, b.z, i * dt);
      if (h) return h.s ? { s: h.s, head: h.head, d: h.d, time: (i + 2 * h.t) * dt } : null;
    }
    return null;
  }
  function stepBullet(b, dt) {
    b.vy -= GRAV * dt; b.vx += wind.x * WIND_K * dt; b.vz += wind.z * WIND_K * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
  }
  // what a bullet path from p0 to p1 hits first: { t, s?, head?, box?, ground?, d }
  function hitTest(x0, y0, z0, x1, y1, z1, ahead = 0) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1e-6, eye = WD.v.cam.position;
    let best = null; const take = (tt, o) => { if (tt >= 0 && tt <= 1 && (!best || tt < best.t)) best = { t: tt, ...o }; };
    for (const s of men) {
      if (s.ko) continue;
      const sx = s.x + s.vx * ahead, sz = s.y + s.vy * ahead;
      const k = clamp(((sx - x0) * dx + (s.gy + 1 - y0) * dy + (sz - z0) * dz) / (L * L), 0, 1);
      if (Math.hypot(x0 + dx * k - sx, y0 + dy * k - s.gy - 1, z0 + dz * k - sz) > 2.2) continue;
      for (const [cx, cy, cz, r, head] of hitSpheres(s, SPH)) {
        const ox = x0 - cx - s.vx * ahead, oy = y0 - cy, oz = z0 - cz - s.vy * ahead, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - r * r, a = L * L, disc = bq * bq - a * cq;
        if (disc >= 0) take((-bq - Math.sqrt(disc)) / a, { s, head });
      }
    }
    for (const b of drums || []) { if (b.gone) continue; const ox = x0 - b.x, oy = y0 - b.y - .5, oz = z0 - b.z, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - .5, disc = bq * bq - L * L * cq; if (disc >= 0) take((-bq - Math.sqrt(disc)) / (L * L), { drum: b }); }
    for (const b of WD.solids) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, d, lo, hi] of [[x0, dx, b.x0, b.x1], [y0, dy, b.y0, b.y1], [z0, dz, b.z0, b.z1]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; }
        let a = (lo - p) / d, c = (hi - p) / d; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { ok = false; break; }
      }
      if (ok) take(t0, { box: b });
    }
    for (let i = 1, n = Math.ceil(L / 1.5); i <= n; i++) { const k = i / n, x = x0 + dx * k, y = y0 + dy * k, z = z0 + dz * k; if (y < WD.land.height(x, z)) { take(k, { ground: true }); break; } }
    if (best) best.d = Math.hypot(x0 + dx * best.t - eye.x, y0 + dy * best.t - eye.y, z0 + dz * best.t - eye.z);
    return best;
  }
  function updateShots(dt) {
    for (const b of shots) {
      const steps = Math.max(1, Math.ceil(dt * V0 / 4));
      for (let i = 0; i < steps && !b.dead; i++) {
        const x0 = b.x, y0 = b.y, z0 = b.z; stepBullet(b, dt / steps);
        const h = hitTest(x0, y0, z0, b.x, b.y, b.z);
        if (h) { b.dead = true; const hx = x0 + (b.x - x0) * h.t, hy = y0 + (b.y - y0) * h.t, hz = z0 + (b.z - z0) * h.t; impact(b, h, hx, hy, hz); }
        else if (b.life <= 0) b.dead = true;
      }
      if (!b.dead && Math.random() < .9) WD.trail.emit({ x: b.x, y: b.y, z: b.z, life: .5, size: .07, col: [.85, .85, .8], a: .5, grow: 2 });
    }
    shots = shots.filter(s => !s.dead);
  }
  function impact(b, h, x, y, z) {
    const viaCam = bulletCam && bulletCam.b === b;
    if (viaCam) { bulletCam.hold = .65; bulletCam.at = { x, y, z }; }
    if (h.s) {
      knockOut(h.s, h.head, h.d, viaCam);
      if (firstShotHit == null) firstShotHit = true;
      if (h.s === cs && gun.shotsAtCs === 1) cs.oneShot = true;
    } else {
      if (firstShotHit == null) firstShotHit = false;
      const stoneHit = h.box && h.box.kind !== 'house';
      for (const f of WD.flocks) if (Math.hypot(f.x - x, f.z - z) < 35) flush(f, 'hit');
      const wet = rain.amount > .2 && h.ground, col = stoneHit ? [.7, .68, .62] : h.box ? [.74, .66, .54] : wet ? [.32, .27, .2] : [.52, .44, .32];
      const bl = Math.hypot(b.vx, b.vy, b.vz) || 1, bx = -b.vx / bl, bz = -b.vz / bl;   // back towards the shooter, the way debris flies
      for (let i = 0; i < 12; i++) WD.dust.emit({ x, y: y + .1, z, vx: rnd(-1.5, 1.5) + bx * 1.5, vy: rnd(.5, 3.5), vz: rnd(-1.5, 1.5) + bz * 1.5, life: rnd(1, 1.6), size: .4, grow: 2.2, col, a: .8, drag: 2.5, grav: 3, fadeIn: true });
      for (let i = 0; i < 4; i++) WD.dust.emit({ x: x + rnd(-.4, .4), y: y + .4, z: z + rnd(-.4, .4), vx: wind.x * .3, vy: rnd(.2, .5), vz: wind.z * .3, life: rnd(2.5, 3.5), size: 1, grow: 2, col, a: .25, drag: .8, fadeIn: true, ease: 2 });
      for (let i = 0; i < 8; i++) WD.dust.emit({ x, y: y + .05, z, vx: rnd(-2.5, 2.5) + bx * 2, vy: rnd(2, 6), vz: rnd(-2.5, 2.5) + bz * 2, life: 1.2, size: .07, col: col.map(c => c * .55), a: 1, grav: 12, floor: h.ground ? WD.land.height(x, z) : y - 3 });
      if (stoneHit) for (let i = 0; i < 6; i++) WD.sparks.emit({ x, y, z, vx: rnd(-3, 3), vy: rnd(0, 3), vz: rnd(-3, 3), life: .25, size: .08, col: [4, 3, 1.4], drag: 1 });
      // a near miss makes them jumpy
      for (const s of men) if (!s.ko && Math.hypot(s.x - x, s.y - z) < 8) { s.sus = 1; s.shaken = 1; if (!b.masked || Math.hypot(s.x - x, s.y - z) < 3) wakeUp(s, 'miss'); }
    }
    if (h.drum) drumHit(h.drum);
  }

  // ---- enemies' shots at you (and at Hale's squad)
  // a muzzle flash: a hot core and a short cone along the barrel, then a puff of smoke that drifts
  // with the wind. Far off it keeps a few pixels, so you can see where a shot came from.
  const muzzle = (x, y, z, dx, dy, dz, k = 1) => {
    const e = WD.v.cam.position, far = Math.hypot(x - e.x, y - e.y, z - e.z), core = Math.max(.2 * k, far * Math.tan(WD.v.cam.fov * Math.PI / 360) * .02);
    WD.sparks.emit({ x, y, z, life: .05, size: core, col: [5, 3.4, 1.5] });
    for (let i = 1; i <= 3; i++) { const o = core * i * .6; WD.sparks.emit({ x: x + dx * o, y: y + dy * o, z: z + dz * o, vx: dx * 5, vy: dy * 5, vz: dz * 5, life: .045, size: core * (1 - i * .25), col: [5, 2.8, 1] }); }
    for (let i = 0; i < 4; i++) WD.smoke.emit({ x: x + dx * .3, y, z: z + dz * .3, vx: dx * rnd(.6, 2) + wind.x * .25 + rnd(-.2, .2), vy: rnd(.1, .5), vz: dz * rnd(.6, 2) + wind.z * .25 + rnd(-.2, .2), life: rnd(1.2, 2), size: .22 * k, grow: 5, col: [.62, .61, .58], a: .2, drag: 1.4, fadeIn: true });
  };
  // a shot that misses you still lands close: dirt in front of you, or chips off the sill up a tower
  function nearMiss(from) {
    const e = WD.v.cam.position, dx = from.x - e.x, dz = from.z - e.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, side = rnd(-1.6, 1.6);
    const gy = WD.land.height(e.x, e.z), high = e.y - gy > 4, k = high ? rnd(.7, 1.1) : rnd(1.8, 4.5);
    const x = e.x + ux * k - uz * side, z = e.z + uz * k + ux * side, y = high ? e.y - rnd(.5, .8) : WD.land.height(x, z);
    for (let i = 0; i < (high ? 5 : 3); i++) WD.sparks.emit({ x, y, z, vx: rnd(-2, 2) + ux * 2, vy: rnd(.5, 3), vz: rnd(-2, 2) + uz * 2, life: .2, size: .03, col: [3.5, 2.6, 1.2], drag: 1, grav: 6 });
    for (let i = 0; i < 9; i++) WD.dust.emit({ x, y: y + .05, z, vx: rnd(-.8, .8) + ux * 1.5, vy: rnd(1, 4.5), vz: rnd(-.8, .8) + uz * 1.5, life: rnd(.8, 1.4), size: rnd(.12, .25), grow: 2.5, col: high ? [.72, .7, .64] : rain.amount > .2 ? [.3, .26, .2] : [.5, .43, .32], a: .75, drag: 2, grav: 4, fadeIn: true });
    for (let i = 0; i < 5; i++) WD.dust.emit({ x, y: y + .05, z, vx: rnd(-3, 3), vy: rnd(3, 6), vz: rnd(-3, 3), life: 1.1, size: .045, col: high ? [.55, .52, .48] : [.24, .2, .15], a: 1, grav: 12, floor: y });
  }
  const enemyShot = (s, target, kind) => {
    const from = { x: s.x, y: s.gy + 1.45, z: s.y }, eye = WD.v.cam.position, toMe = target === 'me';
    { // out along the aim to the muzzle, then the flash
      const to = toMe ? eye : { x: target.x, y: target.gy + 1, z: target.y }, L = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
      const ux = (to.x - from.x) / L, uy = (to.y - from.y) / L, uz = (to.z - from.z) / L;
      from.x += ux * .75; from.y += uy * .75; from.z += uz * .75; muzzle(from.x, from.y, from.z, ux, uy, uz, kind === 'mg' ? .8 : kind === 'cs' ? 1.2 : 1);
    }
    const d = toMe ? Math.hypot(from.x - eye.x, from.z - eye.z) : Math.hypot(from.x - target.x, from.z - target.y);
    if (toMe) {
      const exposed = scoped || glass ? 1 : .55;
      const skill = .6 + boss.skill * .6;
      const chance = clamp((kind === 'cs' ? .9 : kind === 'mg' ? .3 : .42) - d / (kind === 'cs' ? 900 : 320), .04, .9) * exposed * skill;
      const hit = Math.random() < chance, duel = s.mind ? watched(s) : false;   // a duel: he fired while you had him in your sights
      tracer(from, { x: eye.x + rnd(-2, 2) * (hit ? .2 : 1), y: eye.y + rnd(-1, 1.4) * (hit ? .2 : 1), z: eye.z + rnd(-2, 2) * (hit ? .2 : 1) });
      setTimeout0(d / 600, () => {
        if (state !== 'play' || move) return;
        if (hit) { hurtMe(kind === 'cs' ? 42 : kind === 'mg' ? 9 : 15, from); haptic('error'); fx.shake(4); tone(140, { len: .15, wave: 'sawtooth', vol: .08, slide: -60 }); if (me.hp > 0) boss.feel(.6); if (me.hp < 25) boss.feel(-.5); s.mind?.feel(me.hp < 25 ? -.6 : .3); }
        else { tone(rnd(1800, 2600), { len: .09, wave: 'sine', vol: .05, slide: -1200 }); boss.feel(.2); if (Math.random() < .7) nearMiss(from); s.mind?.feel(duel ? .7 : .4); }
      });
      noise(.12, { vol: .1 * clamp(80 / d, .15, 1), from: 1600, to: 300 });
    } else {
      tracer(from, { x: target.x + rnd(-1, 1), y: target.gy + 1, z: target.y + rnd(-1, 1) });
      const chance = (kind === 'mg' ? .4 : .22) * (target.crouch ? .35 : 1);
      if (Math.random() < chance && !target.ko) { target.hp -= kind === 'mg' ? 12 : 18; if (target.hp <= 0) allyDown(target); }
    }
  };
  function tracer(a, b) {
    // stop short of your eye, so a round coming at you streaks past instead of filling the screen
    const e = WD.v.cam.position, eb = Math.hypot(b.x - e.x, b.y - e.y, b.z - e.z), ab = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    if (eb < 7 && ab > 14) { const k = (7 - eb) / ab; b = { x: b.x + (a.x - b.x) * k, y: b.y + (a.y - b.y) * k, z: b.z + (a.z - b.z) * k }; }
    const m = WD.tracers.find(q => !q.visible) || WD.tracers[0];
    m.visible = true; m.userData = { a, b, t: 0, life: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 500 + .05 };
  }
  function updateTracers(dt) {
    for (const m of WD.tracers) {
      if (!m.visible) continue; const u = m.userData; u.t += dt; const k = u.t / u.life;
      if (k >= 1) { m.visible = false; continue; }
      const x = lerp(u.a.x, u.b.x, k), y = lerp(u.a.y, u.b.y, k), z = lerp(u.a.z, u.b.z, k);
      m.position.set(x, y, z); m.lookAt(u.b.x, u.b.y, u.b.z); m.scale.set(1, 1, 4);
    }
  }
  function hurtMe(n, from) {
    me.hurt(n); const e = WD.v.cam.position, rel = angDiff(Math.atan2(-(from.x - e.x), -(from.z - e.z)), look.yaw);
    hits.push({ angle: -rel, life: 1.2 });
  }
  // game-time delays (they pause with the game)
  function setTimeout0(sec, fn) { timers.push({ at: t + sec, fn }); }

  // ---- masking sounds: the train and the church bell
  function masked() { return (train.on && Math.abs(train.x) < 190) || (bell.ring > 0) || (storm > 0); }

  // ---- mortars (the commander's call)
  function callMortars() {
    if (mortar || mortarCool > 0 || !nest) return;
    mortar = { n: 3, next: 1.2, at: nestEye(nest) }; mortarCool = 16;
    say('Mortars! Move, Wren!', OAKE, 2);
  }
  function updateMortar(dt) {
    mortarCool -= dt;
    if (!mortar) return;
    mortar.next -= dt;
    if (mortar.next <= 0) {
      const i = 3 - mortar.n, off = [24, 12, 5][i] * rnd(.8, 1.2), a = rnd(0, TAU), x = mortar.at.x + Math.cos(a) * off, z = mortar.at.z + Math.sin(a) * off, y = WD.land.height(x, z);
      tone(1400, { len: 1, wave: 'sine', vol: .05, slide: -900 });
      setTimeout0(1, () => {
        for (let k = 0; k < 30; k++) WD.dust.emit({ x, y: y + .3, z, vx: rnd(-5, 5), vy: rnd(3, 11), vz: rnd(-5, 5), life: 2, size: 1.2, grow: 2.5, col: [.45, .38, .3], a: .9, drag: 1.5, grav: 6 });
        for (let k = 0; k < 10; k++) WD.sparks.emit({ x, y: y + .5, z, vx: rnd(-6, 6), vy: rnd(2, 9), vz: rnd(-6, 6), life: .4, size: .6, col: [5, 2.6, .8], drag: 2 });
        noise(.9, { vol: .45, from: 900, to: 50 }); haptic('heavy');
        if (nest && !move) {
          const e = nestEye(nest), dd = Math.hypot(e.x - x, e.z - z); fx.shake(clamp(30 / dd, 2, 12));
          if (dd < 8) { hurtMe(Math.round(34 * (1 - dd / 9)), { x, y, z }); boss.feel(me.hp > 0 ? 1 : .2); }
        }
      });
      mortar.next = 2.2; if (--mortar.n <= 0) mortar = null;
    }
  }

  // ---- moving between nests
  function nextNest() { const list = mission.nests; const i = list.indexOf(nestId); return list[i + 1] || (mid === 'm2' ? list[0] : null); }
  function startMove(to) {
    if (move || !to) return;
    const from = nestEye(nest), dest = nestEye(NESTS[to]);
    scoped = false; glass = false; breath.held = false;
    if (nestId === 'ridge' && to === 'tower') {
      zip = new Zipline({ x: from.x, y: from.y + 2.2, z: from.z }, { x: dest.x, y: dest.y + 1.6, z: dest.z }, { gravity: 170, drag: .14 });
      zip.ride(); move = { to, kind: 'zip', t: 0 };
      noise(5, { vol: .06, from: 3000, to: 1500, filter: 'bandpass', q: 3 });
      say('Riding the line down. Keep your head low.', OAKE, 2.4);
    } else {
      const mid_ = { x: (from.x + dest.x) / 2, y: Math.max(from.y, dest.y) + 6, z: (from.z + dest.z) / 2 + 10 };
      move = { to, kind: 'run', t: 0, cs: new Cutscene([{ at: 0, cam: [from, mid_, dest], look: NESTS[to].face && { x: NESTS[to].face.x, y: 8, z: NESTS[to].face.z }, time: 3.2, ease: 'inOut' }], { bars: .08 }) };
    }
    haptic('medium');
  }
  function arrive(to) {
    const old = nestId; nestId = to; nest = NESTS[to]; move = null; zip = null;
    heat *= .25; located = false; mortar = null; squad.still = 0;
    // they keep hunting where you were
    squadTarget = { x: NESTS[old].x, y: NESTS[old].z };
    const e = nestEye(nest); look.yaw = Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)); look.pitch = -.06;
    say('In position: ' + nest.name + '.', null, 1.6);
  }
  let squadTarget = null, foeAim = null;

  // ---- lines on the radio
  function say(text, who = null, time = 2.6, enemy = false) { lineFx = { text, who, life: time, t: 0, enemy }; }

  // ---- Hale's squad (mission 2)
  function allyDown(a) { if (a.ko) return; a.ko = true; a.m.rig.play('downed'); say(a.name + ' is down!', HALE, 2); haptic('warning'); }

  // ---- the watchtower and its fuel drums (mission 2)
  function buildTower() {
    const M = WD.M, g = new Group(), x = 86, z = -70, y = WD.land.height(x, z);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) { const l = new Mesh(new BoxGeometry(.3, 7, .3), M.wood); l.position.set(dx, 3.5, dz); g.add(l); }
    const deck = new Mesh(new BoxGeometry(4.2, .3, 4.2), M.wood); deck.position.y = 7; g.add(deck);
    const hut = new Mesh(new BoxGeometry(3.6, 1.2, 3.6), M.wood); hut.position.y = 7.7; g.add(hut);
    const top = new Mesh(new ConeGeometry(3.2, 1.6, 4), M.roof); top.position.y = 9.6; top.rotation.y = Math.PI / 4; g.add(top);
    g.position.set(x, y, z); g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; }); WD.v.scene.add(g);
    return { g, x, z, y, pieces: [] };
  }
  function drumHit(b) { if (b.gone) return; boom.light(b, true); }
  const boom = new Explosives({ fuse: .2, radius: 7, damage: 100 });
  boom.on('boom', (e, b) => {
    const { x, y, z } = e.at;
    for (let k = 0; k < 40; k++) WD.dust.emit({ x, y: y + 1, z, vx: rnd(-6, 6), vy: rnd(2, 12), vz: rnd(-6, 6), life: 2.6, size: 1.6, grow: 2.5, col: [.2, .19, .18], a: .9, drag: 1.2, grav: 3 });
    for (let k = 0; k < 30; k++) WD.sparks.emit({ x, y: y + 1, z, vx: rnd(-8, 8), vy: rnd(3, 12), vz: rnd(-8, 8), life: .7, size: 1, col: [6, 2.8, .6], drag: 1.6, grav: 4 });
    noise(1.4, { vol: .5, from: 700, to: 40 }); haptic('heavy'); fx.shake(6);
    for (const s of men) if (!s.ko && Math.hypot(s.x - x, s.y - z) < e.radius) knockOut(s, false, 0, false);
    if (tower && !tower.down && Math.hypot(tower.x - x, tower.z - z) < 9) {
      tower.down = true; const pieces = [];
      for (const m of [...tower.g.children]) { m.updateMatrixWorld(true); const ps = shatter(m, { pieces: 5, at: { x, y: y + 2, z }, inside: WD.M.wood, seed: 3 }); pieces.push(...ps); }
      tower.g.removeFromParent();
      for (const p of pieces) { p.castShadow = true; const dx = p.position.x - x, dz = p.position.z - z, l = Math.hypot(dx, dz) || 1; p.userData.v = { x: dx / l * rnd(3, 8), y: rnd(3, 9), z: dz / l * rnd(3, 8), r: rnd(-4, 4) }; }
      tower.pieces = pieces;
    }
    if (b?.mesh) b.mesh.visible = false;
    if (car && car.on && Math.hypot(car.x - x, car.z - z) < 14) { car.stopped = true; car.smoke = true; if (car.gunner && !car.gunner.ko) knockOut(car.gunner, false, 0, false); }
    score += 150; api.score(score);
  });
  function buildCar() {
    const M = WD.M, g = new Group(), body = pbr('#4a4f48', { rough: .6, metal: .4 });
    const hull = new Mesh(rbox(2.4, 1.4, 5, .2), body); hull.position.y = 1.2; g.add(hull);
    const turret = new Mesh(rbox(1.5, .7, 1.6, .2), body); turret.position.set(0, 2.2, -.3); g.add(turret);
    const barrel = new Mesh(new CylinderGeometry(.08, .08, 1.6, 8), M.iron); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.2, -1.6); g.add(barrel);
    for (const [dx, dz] of [[-1.2, -1.6], [1.2, -1.6], [-1.2, 1.6], [1.2, 1.6]]) { const w = new Mesh(new CylinderGeometry(.55, .55, .4, 14), M.dark); w.rotation.z = Math.PI / 2; w.position.set(dx, .55, dz); g.add(w); }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.visible = false; WD.v.scene.add(g);
    temps.push(g); return { g, x: 240, z: -78, stopped: false, on: false, fireT: 3 };
  }

  // ---- missions
  const missions = {
    m1: {
      nests: ['ridge', 'tower'], weather: 'clear',
      setup() {
        op = soldier({ kind: 'radio', x: MILL.x - 2, y: MILL.z + 5, lift: 4.55, yaw: Math.PI, fixed: true, route: [[MILL.x - 3, MILL.z + 5, 4], [MILL.x + 3, MILL.z + 5, 3], [MILL.x + 1, MILL.z + 3.2, 3]] });
        op.send = 0; op.sending = false;
        men.push(op,
          soldier({ x: MILL.x + 9, y: MILL.z + 8, route: [[MILL.x + 9, MILL.z + 8, 3], [MILL.x - 9, MILL.z + 8, 2], [MILL.x - 9, MILL.z - 8, 3], [MILL.x + 9, MILL.z - 8, 2]] }),
          soldier({ x: MILL.x - 12, y: MILL.z - 2, yaw: Math.PI, route: [[MILL.x - 12, MILL.z - 2, 5], [MILL.x - 20, MILL.z - 18, 4]] }),
          soldier({ x: -10, y: -96, yaw: 2.2 }), soldier({ x: -18, y: -92, yaw: .4, route: [[-18, -92, 6], [-30, -70, 5]] }),
          soldier({ x: 10, y: -100, yaw: -1 }),
          soldier({ x: -60, y: RAILZ + 3, route: [[-60, RAILZ + 3, 2], [60, RAILZ + 3, 2]] }),
          soldier({ kind: 'officer', look: 'officer', x: -8, y: -104, yaw: Math.PI, spotter: true }),
        );
      },
      intro: () => [
        { at: 0, cam: [{ x: -90, y: 46, z: -190 }, { x: 10, y: 28, z: -70 }, { x: 60, y: 30, z: 60 }, { ...nestEye(NESTS.ridge), y: nestEye(NESTS.ridge).y + .2, z: NESTS.ridge.z + 3 }], look: (tt) => tt < 4 ? { x: MILL.x, y: 6, z: MILL.z } : { x: 20, y: 6, z: -60 }, time: 7.2, ease: 'inOut' },
        { at: .3, say: 'Wren, Oake here. The Grey Order keeps a radio post in the old mill.', who: OAKE, time: 3.3 },
        { at: 3.7, say: 'If their operator calls in the column, our raid is finished. Stop him.', who: OAKE, time: 3.4 },
      ],
      *script(m) {
        yield m.until(() => state === 'play');
        m.objective('Drag to look round. Find the mill by the river', { at: { x: MILL.x, y: 6, z: MILL.z } });
        yield m.any(m.until(() => facing(MILL.x, MILL.z) < .2), m.wait(8));
        m.objective('Tap the glasses and hold them on the man with the aerial', { at: op });
        say('Field glasses first. Find the man with the aerial.', OAKE, 3);
        yield m.until(() => op.tagged || op.ko);
        if (!op.ko) { op.sending = true; say('He\'s calling it in. You have a minute!', OAKE, 3); }
        m.objective('Scope in, hold your breath and stop the operator', { at: op });
        coverMsg = 'Wait for the train: it covers the sound of your shot';
        yield m.until(() => op.ko);
        opTime = op.send;
        m.checkpoint('radio');
        say('Radio\'s dead. Their patrol is stirring. Thin them out.', OAKE, 3);
        truckIn();
        const o = m.objective('Knock out the patrol');
        yield m.until(() => { const n = alive(men).length; o.text = 'Knock out the patrol: ' + n + ' left'; return n <= 1; });
        m.checkpoint('patrol');
        if (nestId !== 'tower') { m.objective('The supply train is due. Tap MOVE and ride the line to the water tower'); say('Supply train\'s due. Ride the line down to the water tower!', OAKE, 3); yield m.until(() => nestId === 'tower'); }
        m.objective('Jump onto the train as it passes under you');
        train.final = true; train.on = true; train.x = -235; train.speed = 14;
        yield m.until(() => train.x > -150);
        qteKind = 'train'; qte.start([{ kind: 'tap', time: 1.6 }, { kind: 'swipe', dir: 'down', time: 1.4 }], { slow: .3 });
        yield m.until(() => !qte.active);
        outro([{ at: 0, cam: [{ x: train.x + 6, y: RAILH + 6, z: RAILZ + 12 }, { x: train.x + 30, y: RAILH + 9, z: RAILZ + 28 }], look: (tt) => ({ x: train.x - 10, y: RAILH + 3, z: RAILZ }), time: 4.5, ease: 'out' },
          { at: .2, say: 'Good work, Wren. The column never got the call.', who: OAKE, time: 3.6 }]);
        yield m.until(() => outroDone);
      },
      stars: () => [true, opTime != null && opTime < 30, mission.time < 180],
    },
    m2: {
      nests: ['chapel', 'mill2'], weather: 'rain',
      setup() {
        const cy = WD.churchTop;
        cs = soldier({ kind: 'cs', x: CHURCH.x, y: CHURCH.tz + 1.6, lift: cy.y - groundAt(CHURCH.x, CHURCH.tz + 1.6) + .2, yaw: 0, fixed: true, crouch: true, see: 0 });
        mgNest = { x: BRIDGE.x - 2, z: -27 };
        const g1 = soldier({ kind: 'mg', x: mgNest.x, y: mgNest.z, yaw: 0, fixed: true, crouch: true }), g2 = soldier({ kind: 'mg2', x: mgNest.x + 2, y: mgNest.z - 1.5, yaw: 0, fixed: true, crouch: true });
        men.push(cs, g1, g2,
          soldier({ x: 22, y: -92, yaw: .3 }), soldier({ x: 56, y: -88, yaw: -.2 }), soldier({ x: -4, y: -70, yaw: 0, route: [[-4, -70, 4], [24, -56, 4]] }),
          soldier({ x: 30, y: -40, yaw: .1, route: [[30, -40, 3], [56, -42, 3]] }),
          soldier({ kind: 'officer', look: 'officer', x: -6, y: -98, yaw: 0, spotter: true }),
        );
        allies = ['Hale', 'Pike', 'Dunn'].map((name, i) => { const a = soldier({ look: 'ally', x: BRIDGE.x - 2 + i * 2, y: 44 + i * 3, yaw: Math.PI, fixed: true, ally: true, name }); a.hp = 100; a.leg = 0; return a; });
        // the sandbag nest by the bridge
        sandbags(mgNest.x + 1, mgNest.z + 2.2);
        tower = buildTower();
        drums = [0, 1, 2].map(i => {
          const b = boom.add({ x: tower.x - 1.2 + i * 1.1, y: tower.y, z: tower.z - 3.4, size: .5 });
          b.mesh = new Mesh(new CylinderGeometry(.4, .4, 1, 12), WD.M.drum); b.mesh.position.set(b.x, b.y + .5, b.z); b.mesh.castShadow = true; WD.v.scene.add(b.mesh); temps.push(b.mesh);
          return b;
        });
        car = buildCar();
        // the car's hatch gunner: knock him out and it stops too
        car.gunner = soldier({ kind: 'cargun', x: car.x, y: car.z, lift: 2.1, fixed: true });
        car.gunner.m.visible = false; men.push(car.gunner);
      },
      intro: () => [
        { at: 0, cam: [{ x: 120, y: 30, z: -120 }, { x: 70, y: 18, z: -20 }, { x: 46, y: 18, z: 64 }, { ...nestEye(NESTS.chapel), y: WD.land.height(NESTS.chapel.x, NESTS.chapel.z) + 2 }], look: { x: 40, y: 4, z: 0 }, time: 6.4, ease: 'inOut' },
        { at: .3, say: 'Hale\'s squad crosses the old bridge at dusk. Keep them alive, Wren.', who: OAKE, time: 3.2 },
        { at: 3.6, say: 'Get up that belfry. The bell will cover your shots.', who: OAKE, time: 2.8 },
      ],
      *script(m) {
        yield m.until(() => state === 'play');
        qteKind = 'climb'; qte.start([{ kind: 'swipe', dir: 'up', time: 1.8, optional: true }, { kind: 'swipe', dir: 'up', time: 1.6, optional: true }, { kind: 'hold', hold: .7, time: 2.4, optional: true }], { slow: 1 });
        climbT = 0;
        yield m.until(() => !qte.active);
        m.objective('A marksman watches from the church tower. Find his glint', { at: cs });
        say('Careful: their marksman is in the church tower. Look for the glint.', OAKE, 3.2);
        yield m.until(() => cs.ko);
        m.checkpoint('marksman');
        say('Moving onto the bridge. Cover us, Wren.', HALE, 2.6);
        allyGo = 1;
        yield m.until(() => allies.some(a => a.y < 14) || m.time > 999);
        const g = men.filter(s => s.kind === 'mg' || s.kind === 'mg2'); mgOn = true;
        say('Gun nest! We\'re pinned!', HALE, 2.2);
        m.objective('Silence the gun nest at the far end of the bridge', { at: { x: mgNest.x, y: 5, z: mgNest.z } });
        yield m.until(() => g.every(s => s.ko));
        allyGo = 2; mgOn = false;
        say('Gun\'s quiet. Pushing up!', HALE, 2.2);
        const rifles = men.filter(s => s.kind === 'rifle');
        for (const s of rifles) wakeUp(s);
        const o = m.objective('Clear the bridgehead');
        yield m.until(() => { const n = alive(rifles).length; o.text = 'Clear the bridgehead: ' + n + ' left'; return n === 0; });
        car.on = true; car.g.visible = true;
        say('Armour on the east road! Hit the fuel drums under the watchtower!', HALE, 3.2);
        m.objective('Shoot the red fuel drums as the armoured car passes', { at: { x: tower.x, y: tower.y + 1, z: tower.z + 3 } });
        yield m.until(() => car.stopped);
        allyGo = 3;
        say('That stopped it! Into the square, lads.', HALE, 2.6);
        m.objective('Cover the squad into the square');
        yield m.until(() => alive(allies).every(a => a.done));
        outro([{ at: 0, cam: [{ x: -5, y: 9, z: -70 }, { x: -25, y: 12, z: -78 }], look: { x: -12, y: 7, z: -96 }, time: 4.2, ease: 'out' },
          { at: .2, say: 'Larkford is ours. Fine shooting, Wren.', who: HALE, time: 3.6 }]);
        yield m.until(() => outroDone);
      },
      stars: () => [true, allies.every(a => !a.ko), !!cs.oneShot],
    },
  };
  let climbT = 0, allyGo = 0, mgOn = false; const temps = [];
  function sandbags(x, z) {
    if (!WD.bags) { WD.bags = new InstancedMesh(rbox(1.1, .45, .6, .2), WD.M.sand, 24); WD.bags.castShadow = WD.bags.receiveShadow = true; WD.v.scene.add(WD.bags); }
    const o = new Object3D(); let i = 0; const y = groundAt(x, z);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) { const a = -1.3 + k * .43; o.position.set(x + Math.sin(a) * 2.4, y + .22 + row * .42, z - Math.cos(a) * -2.4 * -1); o.rotation.set(0, a, 0); o.updateMatrix(); WD.bags.setMatrixAt(i++, o.matrix); }
    WD.bags.count = i; WD.bags.instanceMatrix.needsUpdate = true; WD.bags.visible = true;
    WD.solids.push({ x0: x - 2.6, x1: x + 2.6, y0: y, y1: y + .85, z0: z - .5, z1: z + .6, kind: 'low', temp: true });
  }
  function truckIn() {
    // four more come down the east road
    for (let i = 0; i < 4; i++) { const s = soldier({ x: 150 + i * 3, y: -72 - i, yaw: -Math.PI / 2 }); s.route = [[60 - i * 6, -86 + i * 2, 2]]; s.late = true; s.sus = .7; men.push(s); }
  }
  function facing(x, z) { const e = WD.v.cam.position; return Math.abs(angDiff(look.yaw, Math.atan2(-(x - e.x), -(z - e.z)))); }
  function outro(steps) { cut = new Cutscene(steps, { bars: .14 }); cut.on('end', () => { outroDone = true; }); state = 'outro'; scoped = false; glass = false; }

  // ---- moving soldiers
  function walk(s, tx, tz, speed, dt) {
    if ((s.pathTo?.x !== tx || s.pathTo?.z !== tz) && pathBudget > 0) {
      pathBudget--; s.pathTo = { x: tx, z: tz };
      const p = WD.nav.path(s.x - GX0, s.y - GZ0, tx - GX0, tz - GZ0);
      s.path = p ? p.map(q => ({ x: q.x + GX0, z: q.y + GZ0 })) : [{ x: tx, z: tz }]; s.pi = 1;
      if (s.path.length < 2) s.pi = 0;
    }
    if (!s.path || s.pathTo?.x !== tx || s.pathTo?.z !== tz) s.path = [{ x: tx, z: tz }], s.pi = 0;
    const q = s.path[Math.min(s.pi, s.path.length - 1)], dx = q.x - s.x, dz = q.z - s.y, d = Math.hypot(dx, dz);
    if (d < .4) { if (s.pi < s.path.length - 1) s.pi++; else { s.vx = s.vy = 0; return true; } }
    const k = Math.min(1, speed * dt / (d || 1)); s.vx = dx / (d || 1) * speed; s.vy = dz / (d || 1) * speed;
    s.x += dx * k; s.y += dz * k; s.yaw = turnTo(s.yaw, Math.atan2(dx, dz), dt * 6);
    return false;
  }
  const turnTo = (a, b, k) => a + clamp(angDiff(b, a), -k, k);
  // is your scope (or the glasses) on him? He can tell, and keeps his head down if he's in cover
  function watched(s) {
    if (!(scoped || glass) || !nest || move) return false;
    const e = WD.v.cam.position, d = dirOf(look.yaw, look.pitch, tmpB), dx = s.x - e.x, dy = s.gy + 1.2 - e.y, dz = s.y - e.z, l = Math.hypot(dx, dy, dz) || 1;
    return (d.x * dx + d.y * dy + d.z * dz) / l > Math.cos(fovNow() * Math.PI / 360 * .8);
  }
  // a rifleman's mind picks what to do next; the moves themselves come from the squad kit (cover, flanks)
  function think(s, tgt) {
    const o = s.order || {}, d = Math.hypot(s.x - tgt.x, s.y - tgt.y), sp = o.spot, C = CELL;
    const inCover = sp && Math.hypot(s.x - sp.x, s.y - sp.y) < 1.5 ? 1 : -1;
    const see = [clamp(d / 300, 0, 2), clamp(heat, 0, 1.2), inCover, watched(s) ? 1 : 0, s.shaken || 0, squad.aggression, alive(men).length / Math.max(1, men.length), clamp(quietT / 15, 0, 1), s.nerve ?? (s.nerve = rnd(-1, 1))];
    s.mind.act(see, s.thinkDt); s.thinkDt = 0;
    const a = s.mind.action, moving = o.do === 'move' && !o.arrived, at = { x: tgt.x, y: tgt.y };
    if (a === 'hold' && quietT > 20) s.mind.feel(-.1);           // a dull lull: nobody shooting, him sat in cover
    // close to a nest you're staying in: a grenade (two a mission, not too often)
    if ((a === 'rush' || a === 'flank') && nest && !move && d < 40 && squad.grenades > 0 && squad.t - squad.lastGrenade > 9) {
      squad.grenades--; squad.lastGrenade = squad.t; s.order = { do: 'throw', at }; s.plan = 'grenade'; squad.call(s, 'grenade'); return;
    }
    if (a === s.plan && (moving || a !== 'rush')) return;          // carry on (a finished rush finds the next cover)
    s.plan = a;
    if (a === 'rush') {
      if (d < 30) { s.order = { do: 'shoot', at, spot: null, from: null }; return; }   // close enough: fight from here
      squad.order(s, 'advance', tgt, { band: [2 * C, Math.max(3 * C, d - 3 * C)], near: 14 * C });
      // no cover nearer: a dash part of the way, never right up to you
      if (!s.order.spot) { const k = clamp(Math.min(40, d - 24) / d, 0, 1); s.order.to = { x: s.x + (tgt.x - s.x) * k, y: s.y + (tgt.y - s.y) * k }; }
      squad.call(s, 'moving');
    } else if (a === 'flank') { squad.lastFlank = squad.t; squad.order(s, 'flank', tgt, { flank: 1.3, near: 16 * C, band: [3 * C, Math.max(4 * C, d)] }); squad.call(s, 'flanking'); }
    else if (a === 'fallback') { squad.order(s, 'retreat', tgt, { near: 12 * C, band: [d + 2 * C, d + 30 * C] }); squad.call(s, 'falling back'); }
    else if (a === 'peek') { s.order = { do: 'shoot', at: { x: tgt.x, y: tgt.y }, spot: inCover > 0 ? sp : null, from: inCover > 0 ? WD.cover.peek(sp, tgt) : null }; s.fireT = Math.max(s.fireT, rnd(.9, 1.6)); if (Math.random() < .3) squad.call(s, 'covering'); }
    else {
      const spot = inCover > 0 ? sp : WD.cover.find(s, tgt, { who: s, near: 6 * C, band: [3 * C, d + 8 * C], sees: squad.sees });
      if (spot && inCover < 0) { WD.cover.take(spot, s); s.order = { do: 'move', role: 'hold', to: { x: spot.x, y: spot.y }, spot, at: { x: tgt.x, y: tgt.y } }; }
      else s.order = { do: 'hold', spot };
      if (see[3] && inCover > 0) squad.call(s, 'heads down');
    }
  }
  function updateMen(dt) {
    const eye = WD.v.cam.position; pathBudget = 1; thinkBudget = 1;
    for (const s of men) {
      const m = s.m; let speed = 0;
      if (s.ko) { m.rig.update(dt, { speed: 0 }); if (s.koFx) s.koFx.t += dt; continue; }
      s.vx = s.vy = 0;
      if (s.kind === 'radio') {
        // paces the balcony; steps inside (behind the wall) now and then
        if (s.route) { const r = s.route[s.ri]; if (Math.hypot(r[0] - s.x, r[1] - s.y) > .2) { const d = Math.hypot(r[0] - s.x, r[1] - s.y), k = Math.min(1, 1.1 * dt / d); s.vx = (r[0] - s.x) / d * 1.1; s.vy = (r[1] - s.y) / d * 1.1; s.x += (r[0] - s.x) * k; s.y += (r[1] - s.y) * k; speed = 1.1; s.yaw = turnTo(s.yaw, Math.atan2(r[0] - s.x, r[1] - s.y), dt * 4); } else if ((s.wt += dt) > r[2]) { s.wt = 0; s.ri = (s.ri + 1) % s.route.length; } }
        if (s.sending) { s.send += dt; if (s.send > 60) mission.fail('The call went through. The column is coming.'); }
        m.rig.upper(s.sending ? 'aim' : null);
      } else if (s.kind === 'cs') {
        // the marksman: scans, then settles on you when he sees you looking at him (scope glint both ways)
        const lookAtMe = Math.atan2(eye.x - s.x, eye.z - s.y);
        s.yaw = turnTo(s.yaw, lookAtMe + Math.sin(t * .4) * .5 * (1 - s.see), dt * 1.5);
        const watching = Math.abs(angDiff(s.yaw, lookAtMe)) < .12;
        s.see = clamp(s.see + (watching && (scoped || glass) ? dt * .45 : -dt * .2), 0, 1);
        if (s.see >= 1 && (s.fireT -= dt) <= 0) { s.fireT = 3.4; enemyShot(s, 'me', 'cs'); s.see = .55; }
        m.rig.play('crouch'); m.rig.upper('aim');
      } else if (s.kind === 'mg' || s.kind === 'mg2') {
        m.rig.play('crouch'); m.rig.upper(s.kind === 'mg' || men.find(o => o.kind === 'mg').ko ? 'aim' : null);
        const gunner = s.kind === 'mg' || men.find(o => o.kind === 'mg')?.ko;
        if (mgOn && gunner && (s.fireT -= dt) <= 0) {
          s.fireT = rnd(.12, .2); s.burst = (s.burst || 0) + 1; if (s.burst > 8) { s.burst = 0; s.fireT = 1.4; }
          const tgt = alive(allies)[Math.floor(Math.random() * alive(allies).length)];
          if (tgt) { s.yaw = turnTo(s.yaw, Math.atan2(tgt.x - s.x, tgt.y - s.y), dt * 3); enemyShot(s, tgt, 'mg'); }
          noise(.07, { vol: .08, from: 2000, to: 300 });
        }
        if (s.kind === 'mg2' && men.find(o => o.kind === 'mg').ko && !s.moved) { s.moved = true; s.x = mgNest.x; s.y = mgNest.z; }
      } else if (s.kind === 'cargun') {
        m.visible = !!car?.on; if (car) { s.x = car.x; s.y = car.z + .4; s.yaw = Math.PI / 2 + Math.PI; }
        m.rig.play('idle'); m.rig.upper('aim');
      } else if (s.alert) {
        s.alertT += dt; s.thinkDt += dt; s.shaken = Math.max(0, (s.shaken || 0) - dt * .2);
        if (s.mind && foeAim && (s.thinkT -= dt) <= 0 && thinkBudget-- > 0) { s.thinkT = rnd(.8, 1.3); think(s, foeAim); }
        const o = s.order || { do: 'hold' };
        if (o.do === 'move' && o.to) {
          if (!o.arrived && !walk(s, o.to.x, o.to.y, o.role === 'retreat' ? 3.6 : 3.3, dt)) { speed = 3.3; s.crouch = false; }
          else { o.arrived = true; s.crouch = !!o.spot; if (o.at) s.yaw = turnTo(s.yaw, Math.atan2(o.at.x - s.x, o.at.y - s.y), dt * 4); }
        } else if (o.do === 'shoot') {
          // pops up from cover to shoot, then ducks back down: watch the rhythm and take him as he rises
          const up = !o.spot || s.fireT < .9 || t - (s.shotAt ?? -9) < .6, p = (up ? o.from : o.spot) || { x: s.x, y: s.y };
          if (Math.hypot(p.x - s.x, p.y - s.y) > .4) { walk(s, p.x, p.y, 2.2, dt); speed = 2.2; }
          s.crouch = !up; s.yaw = turnTo(s.yaw, Math.atan2(o.at.x - s.x, o.at.y - s.y), dt * 4);
          if ((s.fireT -= dt) <= 0 && !speed) { s.fireT = rnd(1.8, 3.2); s.shotAt = t; const ally = allies && nearestAlly(s); if (ally) enemyShot(s, ally, 'rifle'); else if (located && nest && !move) enemyShot(s, 'me', 'rifle'); }
        } else if (o.do === 'throw') {
          s.order = { do: 'hold' };
          if (nest && !move && Math.hypot(s.x - nest.x, s.y - nest.z) < 40) { const e = nestEye(nest); setTimeout0(2, () => { if (nestId && !move && nest && Math.hypot(e.x - nest.x, e.z - nest.z) < 1) { hurtMe(24, { x: s.x, y: s.gy, z: s.y }); fx.shake(8); noise(.8, { vol: .4, from: 800, to: 60 }); } }); say('Grenade!', null, 1.2); }
        } else { s.crouch = !!o.spot || s.shaken > .3; if (allies) { const ally = nearestAlly(s); if (ally && (s.fireT -= dt) <= 0) { s.fireT = rnd(2, 3.5); enemyShot(s, ally, 'rifle'); } } }
        m.rig.play(speed > 0 ? 'run' : s.crouch ? 'crouch' : 'idle'); m.rig.upper(speed > 0 ? null : 'aim');
      } else {
        // calm: patrol or stand; suspicion grows when bullets land near or a friend drops
        if (s.route) {
          const r = s.route[s.ri % s.route.length];
          if (Math.hypot(r[0] - s.x, r[1] - s.y) > .6) { walk(s, r[0], r[1], s.late ? 2.6 : 1.3, dt); speed = s.late ? 2.6 : 1.3; }
          else if ((s.wt += dt) > r[2]) { s.wt = 0; s.ri++; if (s.late) { s.route = null; s.sus = .8; } }
        }
        if (s.sus > .5) { s.yaw += Math.sin(t * 2 + s.x) * dt; }
        s.sus = Math.max(0, s.sus - dt * .05);
        m.rig.play(speed > 2 ? 'run' : speed > 0 ? 'walk' : 'idle'); m.rig.upper(null);
        if (s.spotter && spotting) { s.yaw = turnTo(s.yaw, Math.atan2(eye.x - s.x, eye.z - s.y), dt * 2); m.rig.upper('aim'); }
      }
      s.gy = groundAt(s.x, s.y) + (s.lift || 0);
      m.position.set(s.x, s.gy, s.y); m.rotation.y = s.yaw;
      // far soldiers animate less often
      const far = Math.hypot(s.x - eye.x, s.y - eye.z) > 160 && !scoped;
      if (!far || (frame + (s.x | 0)) % 3 === 0) m.rig.update(far ? dt * 3 : dt, { speed, aim: s.alert ? -.05 : 0 });
    }
    bodies.update(dt, men.filter(s => !s.ko && !s.fixed));
  }
  let frame = 0, spotting = false;
  function nearestAlly(s) { if (!allies) return null; let best = null, bd = 140; for (const a of allies) { if (a.ko || a.done) continue; const d = Math.hypot(a.x - s.x, a.y - s.y); if (d < bd) { bd = d; best = a; } } return best; }
  function updateAllies(dt) {
    if (!allies) return;
    const legs = [null, [[BRIDGE.x, 10], [BRIDGE.x - 1, -6]], [[BRIDGE.x - 3, -30], [28, -56]], [[10, -82]]];
    for (const [i, a] of allies.entries()) {
      let speed = 0;
      if (!a.ko && !a.done) {
        const pinned = mgOn && a.y < 16;
        const route = legs[Math.min(allyGo, 3)];
        if (pinned) { a.crouch = true; }
        else if (route) {
          a.crouch = false; const tgt = route[Math.min(a.leg, route.length - 1)], tx = tgt[0] + i * 2 - 2, tz = tgt[1] + i * 2;
          if (Math.hypot(tx - a.x, tz - a.y) > .6) { const sp = allyGo === 3 ? 4.6 : 3.2; walk(a, tx, tz, sp, dt); speed = sp; } else if (a.leg < route.length - 1) a.leg++; else { a.leg = 0; if (allyGo === 3) a.done = true; a.crouch = true; if (allyGo < 3) a.atLeg = allyGo; }
        }
        if (allyGo !== a.lastGo) { a.lastGo = allyGo; a.leg = 0; }
      }
      a.gy = groundAt(a.x, a.y); a.m.position.set(a.x, a.gy, a.y); a.m.rotation.y = a.yaw;
      if (!a.ko) a.m.rig.play(speed > 0 ? 'run' : a.crouch ? 'crouch' : 'idle');
      a.m.rig.update(dt, { speed });
    }
    if (allies.filter(a => a.ko).length >= 2) mission.fail('Hale\'s squad was lost on the bridge.');
  }

  // ---- input
  const BTN = {};
  function layout() {
    const r = Math.min(34, W * .11);
    BTN.fire = { x: W - r - 16, y: H - r - 22, r };
    BTN.scope = { x: W - r * .75 - 16 - r * .25, y: H - r * 2 - 22 - r * .9, r: r * .72 };
    BTN.left = { x: r + 16, y: H - r - 22, r: r * .86 };
    BTN.move = { x: W - 120, y: 66, w: 108, h: 26 };
  }
  const inBtn = (b, x, y) => b && (b.w ? x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h : Math.hypot(x - b.x, y - b.y) <= b.r * 1.15);
  function toggleScope() {
    if (state !== 'play' || move) return;
    scoped = !scoped; glass = false; haptic('tick'); tone(scoped ? 520 : 380, { len: .05, wave: 'triangle', vol: .04 });
  }
  function toggleGlass() { if (state !== 'play' || move) return; glass = !glass; scoped = false; haptic('tick'); tone(660, { len: .04, wave: 'triangle', vol: .03 }); }

  // ---- the round
  function begin(id) {
    mid = id; const def = missions[id];
    for (const s of men || []) endMind(s);
    freeMen(); men = []; allies = null; shots = []; timers = []; tower?.g.removeFromParent(); for (const p of tower?.pieces || []) { p.removeFromParent(); p.geometry?.dispose(); }
    tower = null; drums = null; car = null; op = null; cs = null; boom.list.length = 0; if (WD.bags) WD.bags.visible = false;
    WD.solids = WD.solids.filter(b => !b.temp);
    for (const h of WD.helmets) { h.life = 0; h.m.visible = false; }
    bodies.list.length = 0; for (const m of temps) m.removeFromParent(); temps.length = 0;
    squad = new Squad([], { cover: WD.cover, sees: (a, b) => WD.nav.sees(a.x - GX0, a.y - GZ0, b.x - GX0, b.y - GZ0), range: 110, grenades: 2, camp: 10, aggression: .5 });
    squad.on('call', callout); lastCall = -99;
    squadTarget = null; foeAim = null; allyGo = 0; mgOn = false;
    mood(id);
    rain.set(def.weather === 'rain' ? 'storm' : 'clear', def.weather === 'rain' ? .75 : 0);
    def.setup();
    for (const [i, l] of WD.letters.entries()) { const p = WD.letterSpots[id][i]; l.position.set(p.x, p.y, p.z); l.rotation.set(p.tilt, p.ry, 0); l.visible = !camp.picked(id, i); }
    letterT = [0, 0, 0]; found = null;
    for (const f of WD.flocks) { f.up = false; f.rest = 0; f.b.length = 0; } WD.birds.count = 0;
    nestId = def.nests[0]; nest = NESTS[nestId];
    const e = nestEye(nest); look = { yaw: Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)), pitch: -.06 };
    mission = new Mission(def.script.bind(def));
    mission.nests = def.nests;
    cut = new Cutscene(def.intro(), { bars: .14 }); state = 'intro';
    { const cam = WD.v.cam, keep = cam.position.clone(), e = nestEye(nest); cam.position.set(e.x, e.y, e.z); cam.updateMatrixWorld(); WD.land.update(0, cam); grassAt.copy(cam.position); cam.position.copy(keep); cam.updateMatrixWorld(); }
    for (const s of men) { s.m.updateMatrixWorld(true); s.m.rig.update(0, { speed: 0 }); }
    train = { on: id === 'm1', x: -420, speed: 30, next: 26, final: false };
    WD.train.visible = false;
    bell = { ring: 0, next: id === 'm2' ? 14 : 1e9 };
    wind = { x: id === 'm1' ? 2.5 : -4, z: 0, base: id === 'm1' ? 2.5 : -4 };
  }
  // the mission's light: time of day, clouds, air, grade (the sky's reflections are redone next frame)
  function mood(id) {
    const md = MOODS[id], v = WD.v;
    Object.assign(sky, { time: md.time, tilt: md.tilt, day: md.day, clouds: md.clouds, gap: md.gap, cloudLight: md.cloudLight ? new Color(md.cloudLight) : null, cloudDark: md.cloudDark ? new Color(md.cloudDark) : null });
    v.air(md.air); v.grade = md.grade; v.glare = md.glare; v.exposure = md.exposure; v.bloom = md.bloom; v.envI = md.env;
    GU.uWet.value = md.air.wet; WD.wins.material.emissiveIntensity = md.windows;
    // the sky's reflections are redone once, just after the next frame is drawn (heavy GPU work, so it
    // stays out of update(); until then the last ones carry on)
    sky.apply(); sky.envAt = sky.envKey(); sky.envT = 3; envDirty = true;
  }
  let wind = { x: 0, z: 0, base: 0 };

  // ---- lost letters: hold the glasses (or the scope) on one to note where it is
  let letterT = [0, 0, 0], found = null;
  function spotLetters(dt) {
    const e = WD.v.cam.position, d = dirOf(look.yaw, look.pitch, tmpB), cone = Math.cos(fovNow() * Math.PI / 360 * .3);
    for (const [i, l] of WD.letters.entries()) {
      if (!l.visible) continue;
      const dx = l.position.x - e.x, dy = l.position.y - e.y, dz = l.position.z - e.z, L = Math.hypot(dx, dy, dz);
      const on = (scoped || glass) && L < 460 && (d.x * dx + d.y * dy + d.z * dz) / L > cone && !hitTest(e.x, e.y, e.z, e.x + dx * .97, e.y + dy * .97, e.z + dz * .97);
      letterT[i] = on ? letterT[i] + dt : Math.max(0, letterT[i] - dt * 2);
      if (letterT[i] > .8) {
        l.visible = false; camp.collect(mid, i); score += 150; api.score(score);
        found = { n: camp.collected(mid), t: 0 }; haptic('success');
        tone(660, { len: .12, wave: 'triangle', vol: .05 }); tone(990, { len: .2, wave: 'triangle', vol: .05, at: .1 });
      }
    }
    if (found && (found.t += dt) > 2.4) found = null;
  }
  // ---- rooks: up they go at a shot near them, wheel round, and settle again
  function flush(f, why) {
    if (f.up || f.rest > 0) return;
    f.up = true; f.t = 0; f.b = Array.from({ length: f.n }, (_, i) => ({ a: rnd(0, TAU), r: rnd(6, 18), h: rnd(0, 4), sp: rnd(.5, .8) * (i % 2 ? 1 : -1), ph: rnd(0, TAU) }));
    const e = WD.v.cam.position, near = Math.hypot(f.x - e.x, f.z - e.z);
    const loud = clamp(120 / near, .2, 1);
    soon(.05, () => noise(.7, { vol: .06 * loud, from: 1500, to: 500, filter: 'bandpass', q: .7 }));
    for (let k = 0; k < 3; k++) soon(.2 + k * .32, () => tone(rnd(380, 520), { len: .14, wave: 'sawtooth', vol: .016 * loud, slide: -160 }));
    // birds bursting out of the trees over a quiet valley: they look your way if it's by you
    if (why === 'shot' && !masked()) { heat = clamp(heat + .1, 0, 1.2); for (const o of men) if (!o.ko && !o.alert && Math.hypot(o.x - f.x, o.y - f.z) < 90) o.sus = Math.max(o.sus, .5); }
  }
  const birdM = new THREE.Matrix4(), birdQ = new THREE.Quaternion(), birdE = new THREE.Euler(0, 0, 0, 'YXZ'), birdP = new Vector3(), birdS = new Vector3();
  function updateBirds(dt) {
    let n = 0; const B = WD.birds;
    for (const f of WD.flocks) {
      if (!f.up) { f.rest = Math.max(0, f.rest - dt); continue; }
      f.t += dt; const k = f.t, rise = Math.min(1, k / 3), home = Math.max(0, (k - 14) / 4);
      if (home >= 1) { f.up = false; f.rest = 25; continue; }
      for (const b of f.b) {
        if (n >= B.instanceMatrix.count) break;
        const a = b.a + k * b.sp, r = b.r * rise * (1 - home) + 1, y = f.y + (8 + b.h) * rise * (1 - home) + Math.sin(k * 1.3 + b.ph) * 1.2;
        birdP.set(f.x + Math.cos(a) * r, y, f.z + Math.sin(a) * r);
        birdE.set(Math.sin(k * 2 + b.ph) * .15, -a - (b.sp > 0 ? 0 : Math.PI), Math.sin(k * 3 + b.ph) * .3); birdQ.setFromEuler(birdE);
        birdS.set(1, Math.cos(k * 14 + b.ph * 3), 1);    // flapping: the wings swing up and down
        B.setMatrixAt(n++, birdM.compose(birdP, birdQ, birdS));
      }
    }
    B.count = n; if (n) B.instanceMatrix.needsUpdate = true;
  }
  // ---- chimney smoke leaning with the wind (read it like the flags)
  function chimneySmoke() {
    const C = WD.chims; if (!C.length || frame % 5) return;
    const p = C[(frame / 5 | 0) % Math.min(C.length, 9)];
    WD.smoke.emit({ x: p[0], y: p[1], z: p[2], vx: wind.x * .55 + rnd(-.15, .15), vy: .9, vz: wind.z * .55 + rnd(-.15, .15), life: 6, size: .7, grow: 4, col: mid === 'm2' ? [.5, .5, .52] : [.8, .8, .8], a: .22, drag: .15, fadeIn: true, ease: 1.5 });
  }
  // ---- optional tilt aim: turn the phone to fine-tune the aim while looking through the scope or glasses
  let tiltAim = false;
  gs.device.onMotion(m => {
    if (!tiltAim || !(scoped || glass) || state !== 'play' || move || bulletCam) return;
    const land = W > H * 1.15, yawR = land ? m.rb : m.rg, pitchR = land ? -m.rg : m.rb, dt = Math.min(.05, m.dt || .016), k = Math.PI / 180 * (scoped ? .6 : .85);
    if (Math.abs(yawR) > .7) look.yaw += yawR * dt * k;
    if (Math.abs(pitchR) > .7) look.pitch += pitchR * dt * k;
    clampLook();
  });
  let briefRows = [], briefGo = null, failMsg = '', pathBudget = 0, thinkBudget = 0;
  let beatT = 0, beat = 0, tiltBtn = null, ptrZoom = false, envDirty = false;
  const grassAt = new Vector3(1e9, 0, 0);
  const later = [];
  function soon(sec, fn) { later.push({ in: sec, fn }); }
  function runLater(dt) { let ran = false; for (let i = 0; i < later.length; i++) { const j = later[i]; j.in -= dt; if (j.in <= 0 && !ran) { ran = true; later.splice(i--, 1); j.fn(); } } }
  const ZOOM_ARC = [-.62, .5];
  const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  return {
    reset() {
      world(); layout();
      if (!sky) { sky = new Sky(WD.v, { time: MOODS.m1.time, tilt: MOODS.m1.tilt, stars: 300, sun: WD.sl, day: DAY_CLEAR, clouds: MOODS.m1.clouds, gap: MOODS.m1.gap, env: true, fog: false }); rain = new Weather(WD.v, { kind: 'clear', amount: 0, wind: [-2, 0], area: 40 }); rain.onFlash = far => { storm = 1.6; noise(1.6, { vol: .3 * (1 - far * .6), from: 260, to: 40, at: far * 1.5 }); }; }
      fx.clear(); me.reset(); gun.ammo = gun.mag; gun.reloadLeft = 0; gun.reserve = Infinity; gun.shotsAtCs = 0;
      state = 'brief'; briefT = 0; t = 0; score = 0; heat = 0; located = false; alertedN = 0; frame = 0;
      scoped = false; glass = false; zoom = 7; breath = { v: 1, held: false }; gasp = 0; storm = 0;
      bulletCam = null; WD.bullet.visible = false; move = null; zip = null; mortar = null; mortarCool = 0; qte = new Prompts({ radius: 56, swipe: 40 }); qteKind = null;
      ptr = new Map(); pinch = null; lastShotT = -99; firstShotHit = null; opTime = null; coverMsg = null; lineFx = null; endT = 0; outroDone = false; quietT = 0;
      keys = {}; hits = []; tagT = 0; spotting = false;
      sel = (camp.next() || camp.missions[0]).id;
      favour = api.load({})?.nests || {}; tiltAim = !!api.load({})?.tilt;
      begin(sel);
      state = 'brief';
      fx.clear();
    },
    resize(w, h) { W = w; H = h; layout(); },
    update(dtReal) {
      frame++;
      fx.update(dtReal); breathT(dtReal); runLater(dtReal);
      if (state === 'brief') { briefT += dtReal; sky.update(dtReal); rain.update(dtReal); return; }
      // slow motion: bullet cam, quick-time moments
      let ts = 1;
      if (bulletCam) ts = bulletCam.hold > 0 ? .06 : bulletCam.scale;
      qte.update(dtReal); if (qte.active) ts *= qte.timeScale;
      const dt = Math.min(dtReal, 1 / 20) * ts;
      t += dt;
      // timers
      for (const tm of timers) if (t >= tm.at && !tm.done) { tm.done = true; tm.fn(); }
      timers = timers.filter(tm => !tm.done);
      sky.update(dtReal); rain.update(dtReal); storm = Math.max(0, storm - dtReal);
      sky.flash = rain.flashLeft > .25 || (rain.flashLeft > .08 && rain.flashLeft < .16) ? rain.flashI : 0;
      // the grass sways every frame; which tufts show (near the camera) is worked out again only when the
      // camera has moved a few metres in play (not while a cutscene camera flies about)
      { const c = WD.v.cam.position, lod = state === 'play' && c.distanceToSquared(grassAt) > 16; if (lod) grassAt.copy(c); WD.land.update(dt, lod ? WD.v.cam : null); }
      WD.wheel.rotation.x += dt * .5; WD.sails.rotation.z += dt * .35;
      // wind gusts
      wind.x = wind.base + Math.sin(t * .23) * 1.2 + Math.sin(t * .71 + 2) * .5;
      for (const f of [WD.flagA, WD.flagB]) {
        const p = f.cloth.geometry.attributes.position, b = f.base, s = Math.sign(wind.x) || 1, k = clamp(Math.abs(wind.x) / 6, .1, 1);
        f.cloth.position.x = f.x + s * 1; f.cloth.scale.x = s;
        for (let i = 0; i < p.count; i++) { const x = b[i * 3] + 1; p.setZ(i, Math.sin(x * 3 - t * 8 * k) * .14 * x * k); p.setY(i, b[i * 3 + 1] - (1 - k) * x * .35); }
        p.needsUpdate = true;
      }
      if (state === 'intro' || state === 'outro') {
        cut.update(dt);
        if (state === 'intro' && cut.done) { state = 'play'; const s = cut.shot; if (s?.look) { const dx = s.look.x - s.x, dy = s.look.y - s.y, dz = s.look.z - s.z; look.yaw = Math.atan2(-dx, -dz); look.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.5, .35); } }
        updateMen(dt); updateAllies(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt);
        if (state === 'outro') { mission.update(dt); trainUpdate(dt); }
        if (outroDone && state === 'outro') finish(true);
        return;
      }
      if (state === 'fail' || state === 'won') { endT -= dtReal; updateMen(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); if (endT <= 0 && state) { const s0 = state; state = 'done'; if (s0) api.over(); } return; }
      if (state !== 'play') return;

      // climbing the belfry (mission 2 start)
      if (qteKind === 'climb') { climbT = qte.active ? Math.min(1, climbT + dt * .2) : 1; }
      if (qteKind === 'climb' && !qte.active) qteKind = null;
      if (qteKind === 'train' && !qte.active) { qteKind = null; }

      mission.update(dt);
      gun.update(dt); me.update(dt); for (const h of hits) h.life -= dtReal; hits = hits.filter(h => h.life > 0);
      boltT = Math.max(0, boltT - dt);
      if (gun.reloaded) tone(300, { len: .08, wave: 'square', vol: .03 });
      // keys
      const kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), ky = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0);
      if (kx || ky) { const f = fovNow() / 62; look.yaw -= kx * dt * 1.2 * f; look.pitch += ky * dt * .8 * f; }
      clampLook();
      // masking
      trainUpdate(dt);
      bell.next -= dt; if (bell.next <= 0) { bell.next = 26; bell.ring = 6; } if (bell.ring > 0) { bell.ring -= dt; if (Math.floor(bell.ring * 1.2) !== Math.floor((bell.ring + dt) * 1.2)) tone(392, { len: 1.4, wave: 'sine', vol: .06 }); WD.bell.rotation.z = Math.sin(t * 5) * .5; }
      // heat: they work out where you are
      quietT = t - lastShotT;
      if (heat > 0 && !squad.alerted) heat = Math.max(0, heat - dt * .015);
      if (heat >= 1 && !located && nest) {
        located = true; squadTarget = { x: nest.x, y: nest.z };
        for (const s of men) if (!s.ko && !s.fixed && Math.hypot(s.x - nest.x, s.y - nest.z) < 330) wakeUp(s);
        say('They\'ve spotted your position!', OAKE, 2.4); haptic('warning');
      }
      // the commander decides about once a second
      if (frame % 30 === 0) {
        const leftN = alive(men).length, fav = favourOf(nestId);
        const see = [heat, fav, clamp(quietT / 20, 0, 1), leftN / Math.max(1, men.length), me.frac, masked() ? 1 : -1, squad.alerted ? 1 : 0, clamp(mission.time / 120, 0, 1)];
        const a = boss.act(see, .5), what = boss.action;
        squad.aggression = what === 'push' ? .75 : what === 'flank' ? .6 : .3;
        if (what === 'flank') squad.lastFlank = -99;
        if (what === 'mortar' && located) callMortars();
        spotting = what === 'watch';
        void a;
      }
      if (spotting && nest && (scoped || glass) && !masked()) heat = Math.min(1.2, heat + dt * .03 * (1 + favourOf(nestId)));
      if (squad.alerted) {
        const tgt = squadTarget || (nest ? { x: nest.x + (1 - heat) * 40, y: nest.z + (1 - heat) * 30 } : { x: 0, y: 0 });
        squad.t += dt; foeAim = tgt;     // each rifleman's own mind picks his part (in updateMen)
      }
      // suspicious soldiers that are close to a found body or a near miss wake up
      for (const s of men) if (!s.ko && !s.alert && !s.fixed && s.sus >= 1) wakeUp(s);
      updateMortar(dt);
      updateMen(dt); updateAllies(dt); updateShots(dt); updateTracers(dt); spotLetters(dt); updateBirds(dt); chimneySmoke();
      if (car && car.on && !car.stopped) {
        car.x -= dt * 6; car.z = roadZ(car.x); if (car.x < 30) { car.stopped = true; mission.fail('The armoured car reached the bridge.'); }
        if (car.gunner?.ko) { car.stopped = true; car.smoke = true; }
        car.g.position.set(car.x, WD.land.height(car.x, car.z), car.z); car.g.rotation.y = Math.PI / 2;
        noise(.05, { vol: .015, from: 200, to: 120 });
        if ((car.fireT -= dt) <= 0) { car.fireT = 1.4; const a = alive(allies || [])[0]; if (a) enemyShot({ x: car.x, y: car.z, gy: WD.land.height(car.x, car.z) + 1 }, a, 'mg'); }
        for (const b of drums || []) if (!b.gone && Math.hypot(car.x - b.x, car.z - b.z) < 9) car.near = true;
      }
      if (car?.smoke) WD.smoke.emit({ x: car.x, y: WD.land.height(car.x, car.z) + 2.4, z: car.z, vx: rnd(-.3, .3), vy: 2, vz: rnd(-.3, .3), life: 3, size: 1.4, grow: 2, col: [.15, .14, .13], a: .7 });
      boom.update(dt);
      for (const p of tower?.pieces || []) { const u = p.userData.v; if (!u) continue; u.y -= 15 * dt; p.position.x += u.x * dt; p.position.y += u.y * dt; p.position.z += u.z * dt; p.rotation.x += u.r * dt; const g = WD.land.height(p.position.x, p.position.z); if (p.position.y < g) { p.position.y = g; u.x *= .5; u.z *= .5; u.y = Math.abs(u.y) * .2; u.r *= .5; if (Math.abs(u.y) < .5) p.userData.v = null; } }
      for (const h of WD.helmets) if (h.life > 0) { h.life -= dt; h.vy -= 12 * dt; h.m.position.x += h.vx * dt; h.m.position.y += h.vy * dt; h.m.position.z += h.vz * dt; h.m.rotation.x += h.spin * dt; const g = WD.land.height(h.m.position.x, h.m.position.z); if (h.m.position.y < g) { h.m.position.y = g; h.vy = Math.abs(h.vy) * .35; h.vx *= .5; h.vz *= .5; h.spin *= .5; } if (h.life <= 0) h.m.visible = false; }
      WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt);
      // tagging with the glasses
      if (glass) {
        const eye = WD.v.cam.position; let best = null, bd = .05;
        for (const s of men) { if (s.ko || s.tagged) continue; const a = Math.abs(angDiff(look.yaw, Math.atan2(-(s.x - eye.x), -(s.y - eye.z)))), p = Math.abs(look.pitch - Math.atan2(s.gy + 1 - eye.y, Math.hypot(s.x - eye.x, s.y - eye.z))); const d = Math.hypot(a, p); if (d < bd) { bd = d; best = s; } }
        if (best && best === tagT?.s) { tagT.t += dt; if (tagT.t > .45) { best.tagged = true; tagT = null; haptic('light'); tone(1200, { len: .05, wave: 'sine', vol: .04 }); score += 10; api.score(score); } }
        else tagT = best ? { s: best, t: 0 } : null;
      } else tagT = null;
      // bullet cam
      if (bulletCam) {
        bulletCam.t += dtReal;
        if (bulletCam.hold > 0) { bulletCam.hold -= dtReal; if (bulletCam.hold <= 0) { bulletCam = null; WD.bullet.visible = false; } }
        else if (bulletCam.b.dead || bulletCam.t > 4) { bulletCam = null; WD.bullet.visible = false; }
      }
      // moving between nests
      if (move) {
        move.t += dt;
        if (move.kind === 'zip') { zip.update(dt); if (zip.done) arrive(move.to); }
        else { move.cs.update(dt); if (move.cs.done) arrive(move.to); }
      }
      if (nest && !move) favour[nestId] = (favour[nestId] || 0) + dt;
      // losing
      if (me.dead || me.hp <= 0) mission.fail('Wren is down.');
      if (mission.failed && state === 'play') finish(false);
      WD.v.hurt = clamp(1 - me.frac, 0, 1) * .9;
      // the operator's and the marksman's scope glints, nest markers
      if (cs && !cs.ko && frame % 2 === 0) { const g = .5 + cs.see * 2.5; WD.sparks.emit({ x: cs.x, y: cs.gy + 1.15, z: cs.y + .4, life: .1, size: .3 + cs.see * .6, col: [g * 2, g * 2, g * 1.6] }); }
      if (spotting) for (const s of men) if (s.spotter && !s.ko && frame % 3 === 0) WD.sparks.emit({ x: s.x, y: s.gy + 1.6, z: s.y + .3, life: .1, size: .25, col: [2, 2, 1.6] });
      if (!move && nextNest() && (located || mission.time > 20) && frame % 4 === 0) { const n = NESTS[nextNest()], e = nestEye(n); WD.marks.emit({ x: e.x, y: e.y + 2.5, z: e.z, life: .2, size: 1.6, col: [3, 2.6, 1.2] }); }
      WD.marks.update(dtReal);
      breathT(0);
    },
    draw(c) {
      const v = WD.v, cam = v.cam;
      // the camera: cutscene, zip line, bullet cam or you
      let gunVis = false;
      if (state === 'brief') {
        const a = briefT * .05; cam.position.set(Math.sin(a) * 160 + 20, 70, Math.cos(a) * 160 - 40); cam.lookAt(0, 6, -60);
      } else if ((state === 'intro' || state === 'outro') && cut?.shot) {
        const s = cut.shot; cam.position.set(s.x, s.y, s.z); if (s.look) cam.lookAt(s.look.x, s.look.y, s.look.z);
      } else if (move) {
        if (move.kind === 'zip' && zip) { const p = zip.hands; cam.position.set(p.x, p.y - .9, p.z); const d = zip.dir; cam.lookAt(p.x + d.x * 10, p.y + d.y * 10 - 1.5, p.z + d.z * 10); }
        else if (move.cs?.shot) { const s = move.cs.shot; cam.position.set(s.x, s.y, s.z); if (s.look) cam.lookAt(s.look.x, s.look.y, s.look.z); }
      } else if (bulletCam && bulletCam.hold <= 0 && !bulletCam.b.dead) {
        const b = bulletCam.b, l = Math.hypot(b.vx, b.vy, b.vz), dx = b.vx / l, dy = b.vy / l, dz = b.vz / l;
        cam.position.set(b.x - dx * 2.2 + dz * .45, b.y - dy * 2.2 + .3, b.z - dz * 2.2 - dx * .45); cam.lookAt(b.x + dx * 4, b.y + dy * 4, b.z + dz * 4);
        WD.bullet.position.set(b.x, b.y, b.z); WD.bullet.rotation.set(0, 0, 0); WD.bullet.lookAt(b.x + dx, b.y + dy, b.z + dz); WD.bullet.rotateX(Math.PI / 2);
      } else if (bulletCam && bulletCam.hold > 0 && bulletCam.at) {
        const a = bulletCam.at, f = bulletCam.from, dx = a.x - f.x, dz = a.z - f.z, l = Math.hypot(dx, dz);
        cam.position.set(a.x - dx / l * 4 + dz / l * 2.5, a.y + 1, a.z - dz / l * 4 - dx / l * 2.5); cam.lookAt(a.x, a.y, a.z);
        WD.bullet.visible = false;
      } else if (nest) {
        const e = nestEye(nest);
        let y = e.y; if (qteKind === 'climb') y = lerp(WD.land.height(nest.x, nest.z) + 1.6, e.y, sm(0, 1, climbT));
        const [sy, sp] = sway(), kick = boltT > .8 ? (boltT - .8) * .25 : 0;
        cam.position.set(e.x, y, e.z);
        const d = dirOf(look.yaw + sy, look.pitch + sp + kick, tmpV);
        cam.lookAt(e.x + d.x, y + d.y, e.z + d.z);
        gunVis = !scoped && !glass && state === 'play';
      }
      WD.gun.visible = gunVis; if (gunVis) { WD.gun.position.y = -.15 - (boltT > 0 ? Math.sin(boltT * 3) * .02 : 0); WD.bolt.position.z = .05 + (boltT > .2 && boltT < .9 ? .06 : 0); }
      const f = (state === 'play' && !move && !bulletCam) ? fovNow() : 62;
      if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
      // trees keep their leaves further out through the scope
      const lk = clamp(62 / cam.fov, 1, 12);
      if (Math.abs(lk - WD.lodK) > .05) { WD.lodK = lk; for (const k of ['oak', 'poplar', 'fir']) { const m = WD.props.mesh(k); m.updateLOD(1, TREE_LOD[0] * lk); m.updateLOD(2, TREE_LOD[1] * lk); m.updateShadowLOD(1, 70 * lk); } }
      // the sun's shadows cover what you can see (sharp round the target through the scope)
      WD.sl.fit(v, { far: scoped ? 700 : 320, ground: WD.ground, around: scoped || glass ? 1.3 : 0, tall: 22 });
      // the game's own shaders: time for the leaves, the sun for light through them, ripples
      GU.uTime.value = v.t; v.sunDir(GU.uSun.value); GU.uWind.value = .4 + Math.abs(wind.x) * .1;
      for (const r of WD.ripples) r.offset.set(v.t * .011, v.t * .004);
      if (WD.train.visible) { WD.train.position.set(train.x, RAILH, RAILZ); }
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      if (envDirty && sky.makesEnv) { envDirty = false; try { sky.makeEnv(); } catch (e) { /* keeps the last reflections */ } }
      hud(c);
    },
    down(x, y, id) {
      if (state === 'brief') return briefTap(x, y);
      if (state === 'intro' && cut) { cut.skip(); return; }
      if (state !== 'play') return;
      if (qte.active) { qte.down(x, y); ptr.set(id, { x, y, sx: x, sy: y, role: 'qte' }); return; }
      if (bulletCam) { bulletCam = null; WD.bullet.visible = false; return; }
      if (inBtn(BTN.fire, x, y)) { fire(); ptr.set(id, { role: 'fire', x, y }); return; }
      if (inBtn(BTN.scope, x, y)) { toggleScope(); ptr.set(id, { role: 'btn', x, y }); return; }
      if (inBtn(BTN.left, x, y)) { if (scoped) { breath.held = true; ptr.set(id, { role: 'breath', x, y }); } else { toggleGlass(); ptr.set(id, { role: 'btn', x, y }); } return; }
      if (!move && nextNest() && inBtn(BTN.move, x, y)) { startMove(nextNest()); ptr.set(id, { role: 'btn', x, y }); return; }
      if (scoped && onZoomArc(x, y)) { ptrZoom = true; zoomFrom(x, y); ptr.set(id, { role: 'zoom', x, y }); return; }
      const aims = [...ptr.values()].filter(p => p.role === 'aim');
      if (aims.length === 1) { const a = aims[0]; a.role = 'pinch'; pinch = { d: Math.hypot(x - a.x, y - a.y), zoom, a, b: null }; const p = { x, y, sx: x, sy: y, role: 'pinch' }; pinch.b = p; ptr.set(id, p); return; }
      ptr.set(id, { x, y, sx: x, sy: y, role: 'aim', t: 0 });
    },
    move(x, y, pressed, id) {
      if (!pressed) return; const p = ptr.get(id); if (!p) return;
      if (p.role === 'qte') { qte.move(x, y); return; }
      if (p.role === 'zoom') { zoomFrom(x, y); p.x = x; p.y = y; return; }
      if (p.role === 'aim') {
        const dx = x - p.x, dy = y - p.y, fine = scoped || glass ? clamp(.4 + Math.hypot(dx, dy) / 10, .4, 1) : 1;
        const k = (fovNow() * Math.PI / 180) / H * 1.15 * fine;
        look.yaw -= dx * k; look.pitch -= dy * k; clampLook();   // drag right to look right, up to look up
      } else if (p.role === 'pinch' && pinch) {
        p.x = x; p.y = y; const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
        if (!scoped && d > pinch.d * 1.25 && state === 'play') { scoped = true; glass = false; pinch.d = d; pinch.zoom = zoom; }
        else if (scoped) zoom = clamp(pinch.zoom * d / pinch.d, 3, 12);
        return;
      }
      p.x = x; p.y = y;
    },
    up(x, y, id) {
      const p = ptr.get(id); ptr.delete(id);
      if (p?.role === 'qte') qte.up(x, y);
      if (p?.role === 'breath') breath.held = false;
      if (p?.role === 'zoom') ptrZoom = false;
      if (p?.role === 'pinch') { pinch = null; for (const q of ptr.values()) if (q.role === 'pinch') q.role = 'aim'; }
    },
    key(k, isDown) {
      keys[k] = isDown; if (!isDown) { if (k === 'Shift') breath.held = false; return; }
      if (state === 'brief' && (k === 'Enter' || k === ' ')) return go();
      if (state === 'intro' && cut) return cut.skip();
      if (qte.active) { if (k === ' ' || k === 'Enter') qte.down(); return; }
      if (k === ' ' || k === 'f') fire();
      if (k === 'z' || k === 'e') toggleScope();
      if (k === 'b' || k === 'q') toggleGlass();
      if (k === 'Shift') breath.held = true;
      if (k === 'm' && nextNest()) startMove(nextNest());
      if (k === '=' || k === '+') zoom = clamp(zoom + 1, 3, 12);
      if (k === '-') zoom = clamp(zoom - 1, 3, 12);
    },
    pause() { breath.held = false; ptr.clear(); ptrZoom = false; },
  };

  // ---------------------------------------------------------------- helpers in make's scope
  function clampLook() { look.pitch = clamp(look.pitch, -.55, .4); }
  function breathT(dt) {
    if (!breath) return;
    beat = Math.max(0, beat - dt * 4);
    if (scoped && ((breath.held && breath.v > 0) || gasp > 0) && state === 'play') {
      if ((beatT -= dt) <= 0) {
        beatT = gasp > 0 ? .42 : .95 - (1 - breath.v) * .4; beat = 1;
        tone(52, { len: .1, wave: 'sine', vol: .14 }); tone(46, { len: .12, wave: 'sine', vol: .1, at: .17 }); haptic('tick');
      }
    } else beatT = .2;
    if (breath.held && scoped && breath.v > 0) { breath.v -= dt / 4.5; if (breath.v <= 0) { breath.v = 0; gasp = 2; tone(180, { len: .3, wave: 'triangle', vol: .04 }); } }
    else breath.v = Math.min(1, breath.v + dt * (gasp > 0 ? .1 : .35));
    gasp = Math.max(0, gasp - dt);
  }
  function favourOf(id) { const list = mission?.nests || []; let all = 0; for (const n of list) all += favour[n] || 0; return all > 30 ? (favour[id] || 0) / all : 0; }
  function trainUpdate(dt) {
    if (!train.on) { train.next -= dt; if (train.next <= 0 && mid === 'm1') { train.on = true; train.x = -420; train.speed = 30; tone(520, { len: .9, wave: 'triangle', vol: .05 }); tone(620, { len: .9, wave: 'triangle', vol: .04, at: .1 }); } WD.train.visible = false; return; }
    WD.train.visible = true;
    if (train.final && qteKind !== 'train' && train.x > -150) train.speed = Math.max(4, train.speed - dt * 2);
    train.x += train.speed * dt;
    if (frame % 3 === 0) { const ch = WD.train.userData.chim; ch.getWorldPosition(tmpA); WD.smoke.emit({ x: tmpA.x, y: tmpA.y + .8, z: tmpA.z, vx: -train.speed * .3 + rnd(-.3, .3), vy: 2.5, vz: rnd(-.3, .3), life: 3.5, size: 1.4, grow: 3, col: [.82, .8, .76], a: .55, drag: .4 }); }
    if (masked() && frame % 20 === 0) noise(.4, { vol: .05 * clamp(1 - Math.abs(train.x) / 220, .1, 1), from: 400, to: 200 });
    if (train.x > 420) { train.on = false; train.next = 34; }
  }
  function finish(won) {
    if (won) {
      const st = missions[mid].stars();
      camp.finish(mid, { stars: st });
      score += 500 + st.filter(Boolean).length * 250; api.score(score);
      const d = api.load({}) || {}; d.nests = favour; api.save(d);
      boss.result(true); rifleman.result(true); for (const s of men) endMind(s);
      api.win(); state = 'won'; endT = 2.4; sounds.win(); haptic('success');
    } else {
      boss.result(false); rifleman.result(false); for (const s of men) endMind(s);
      const d = api.load({}) || {}; d.nests = favour; api.save(d);
      state = 'fail'; endT = 2.2; sounds.lose(); haptic('error'); failMsg = mission.failed || 'Mission failed';
    }
  }
  function go() { begin(sel); haptic('medium'); sounds.click?.(); }
  function briefTap(x, y) {
    if (briefT < .3) return;
    for (const r of briefRows) if (y >= r.y && y <= r.y + r.h && x >= r.x && x <= r.x + r.w) { if (r.id && r.id !== sel && camp.open(r.id)) { sel = r.id; begin(sel); state = 'brief'; haptic('tick'); } return; }
    if (tiltBtn && inBtn(tiltBtn, x, y)) { tiltAim = !tiltAim; const d = api.load({}) || {}; d.tilt = tiltAim; api.save(d); haptic('tick'); return; }
    if (inBtn(briefGo, x, y)) go();
  }

  // ---------------------------------------------------------------- the HUD (drawn for this game only)
  function hud(c) {
    const ink = '#2b2a26', paper = '#ece2c8', brass = '#c8a24a', red = '#b8412e';
    if (state === 'brief') return dossier(c, ink, paper, brass, red);
    if (cut && (state === 'intro' || state === 'outro')) { cut.drawBars(c, W, H, '#0b0b0a'); radioLine(c, cut.line, brass); if (state === 'intro') { c.fillStyle = '#ffffff88'; c.font = '600 10px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('TAP TO SKIP', W - 12, H - 10); } return; }
    if (move) { if (move.cs) move.cs.drawBars(c, W, H, '#0b0b0a'); stamp(c, move.kind === 'zip' ? 'ON THE LINE' : 'MOVING', W / 2, H * .78, brass); radioLine(c, lineFx, brass); return; }
    if (bulletCam) { c.fillStyle = '#0006'; c.fillRect(0, 0, W, H * .06); c.fillRect(0, H * .94, W, H * .06); const b = bulletCam.b; const d = Math.hypot(b.x - bulletCam.from.x, b.z - bulletCam.from.z); c.font = '700 13px "Courier New", monospace'; c.fillStyle = brass; c.textAlign = 'center'; c.fillText(Math.round(d) + ' m', W / 2, H * .94 - 8); koPops(c); return; }
    const sc = scoped, gl = glass;
    // tags above soldiers, KO pops
    tags(c, brass, red);
    koPops(c);
    if (sc) scopeView(c, brass, red); else if (gl) glassView(c, brass);
    else crosshair(c);
    // hit direction arrows
    for (const h of hits) { const a = h.angle - Math.PI / 2; c.save(); c.translate(W / 2 + Math.cos(a) * 70, H / 2 + Math.sin(a) * 70); c.rotate(a + Math.PI / 2); c.globalAlpha = clamp(h.life, 0, 1); c.fillStyle = red; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 4); c.lineTo(-9, 4); c.fill(); c.restore(); }
    objectiveSlip(c, ink, paper, red);
    windGauge(c, brass);
    heatBar(c, ink, paper, red);
    buttons(c, brass, red);
    radioLine(c, lineFx, brass);
    // a lost letter: the ring fills while you hold the view on it
    { const lt = Math.max(...letterT); if (lt > .05 && (sc || gl)) { c.strokeStyle = brass; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, 15, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(lt / .8, 0, 1)); c.stroke(); } }
    if (found) stamp(c, '✉ LETTER FOUND · ' + found.n + '/3', W / 2, H * .3, brass);
    if (qte.active) qteDraw(c, brass);
    if (state === 'fail' || state === 'won') stamp(c, state === 'won' ? 'MISSION COMPLETE' : failMsg, W / 2, H * .45, state === 'won' ? brass : red, true);
  }
  function stamp(c, text, x, y, col, big) {
    c.save(); c.translate(x, y); c.rotate(-.06); c.font = `800 ${big ? 18 : 14}px Rubik, sans-serif`; c.textAlign = 'center'; const w = Math.min(W - 30, c.measureText(text).width + 24);
    c.fillStyle = '#0b0b0acc'; c.fillRect(-w / 2, -18, w, 30); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(-w / 2 + 3, -15, w - 6, 24); c.fillStyle = col; c.fillText(text, 0, 2, w - 14); c.restore();
  }
  function radioLine(c, l, brass) {
    if (lineFx) { lineFx.life -= 1 / 60; if (lineFx.life <= 0) lineFx = null; }
    if (!l || !l.text) return;
    const y = H - (cut?.playing ? H * .07 + 8 : 120), w = Math.min(W - 24, 340);
    c.save(); c.font = '500 12px Rubik, sans-serif';
    const lines = wrap(c, l.text, w - 22);
    const hh = 14 * lines.length + (l.who ? 16 : 8) + 6;
    c.fillStyle = '#12110ecc'; roundRect(c, W / 2 - w / 2, y - hh, w, hh, 6); c.fill();
    const accent = l.enemy ? '#d26450' : brass;
    c.fillStyle = accent; c.fillRect(W / 2 - w / 2, y - hh, 3, hh);
    let yy = y - hh + 14;
    if (l.who) { c.font = '700 9px "Courier New", monospace'; c.fillStyle = accent; c.textAlign = 'left'; c.fillText('◉ ' + l.who, W / 2 - w / 2 + 12, yy); yy += 14; c.font = '500 12px Rubik, sans-serif'; }
    c.fillStyle = '#f2ead6'; c.textAlign = 'left'; for (const s of lines) { c.fillText(s, W / 2 - w / 2 + 12, yy); yy += 14; }
    c.restore();
  }
  function wrap(c, text, w) { const out = []; let line = ''; for (const word of text.split(' ')) { const tryL = line ? line + ' ' + word : word; if (c.measureText(tryL).width > w && line) { out.push(line); line = word; } else line = tryL; } if (line) out.push(line); return out; }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function objectiveSlip(c, ink, paper, red) {
    const o = mission.objectives.filter(q => !q.done).at(-1); if (!o) return;
    c.save(); c.textAlign = 'left'; c.font = '600 11px Rubik, sans-serif'; const w = Math.min(W * .58, 220), lines = wrap(c, o.text, w - 18), h = 18 + lines.length * 13;
    c.translate(10, 10); c.rotate(-.015);
    c.fillStyle = paper; c.shadowColor = '#0006'; c.shadowBlur = 6; c.fillRect(0, 0, w, h); c.shadowBlur = 0;
    c.fillStyle = red; c.fillRect(0, 0, 3, h);
    c.fillStyle = '#8a7f66'; c.font = '700 8px "Courier New", monospace'; c.fillText('ORDERS · ' + fmtT(mission.time), 9, 11);
    c.fillStyle = ink; c.font = '600 11px Rubik, sans-serif'; lines.forEach((s, i) => c.fillText(s, 9, 24 + i * 13));
    if (op?.sending && !op.ko) { const k = clamp(op.send / 60, 0, 1); c.fillStyle = '#0002'; c.fillRect(9, h - 5, w - 18, 3); c.fillStyle = red; c.fillRect(9, h - 5, (w - 18) * k, 3); }
    c.restore();
    // a marker towards the objective
    const at = o.at; if (!at || scoped) return;
    const ax = at.m ? at.x : at.x, ay = at.m ? at.gy + 2.2 : at.y, az = at.m ? at.y : at.z;
    if (at.ko) return;
    const [sx, sy, sz] = WD.v.toScreen(ax, ay, az);
    if (sz < 1 && sx > 0 && sx < W && sy > 0 && sy < H) { c.strokeStyle = red; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, sy - 12); c.lineTo(sx + 6, sy - 4); c.lineTo(sx, sy + 4); c.lineTo(sx - 6, sy - 4); c.closePath(); c.stroke(); }
    else { const e = WD.v.cam.position, a = angDiff(Math.atan2(-(ax - e.x), -(az - e.z)), look.yaw), side = a > 0 ? -1 : 1; c.fillStyle = red; c.save(); c.translate(side > 0 ? W - 14 : 14, H * .42); c.scale(side, 1); c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -8); c.lineTo(-4, 8); c.fill(); c.restore(); }
  }
  function windGauge(c, brass) {
    const x = W - 58, y = 12, w = 48, h = 46;
    c.save(); c.fillStyle = '#12110ebb'; roundRect(c, x, y, w, h, 6); c.fill();
    // wind relative to where you look: the arrow points the way the bullet will drift
    const rel = Math.atan2(wind.z, wind.x) + look.yaw, cross = Math.cos(rel) * Math.hypot(wind.x, wind.z);
    c.translate(x + w / 2, y + 18);
    const n = Math.min(3, Math.round(Math.abs(cross) / 1.5));
    c.fillStyle = brass; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center';
    for (let i = 0; i < 3; i++) { c.globalAlpha = i < n ? 1 : .2; const ox = (i - 1) * 9 * Math.sign(cross || 1); c.beginPath(); c.moveTo(ox + 4 * Math.sign(cross || 1), 0); c.lineTo(ox - 3 * Math.sign(cross || 1), -6); c.lineTo(ox - 3 * Math.sign(cross || 1), 6); c.closePath(); c.fill(); }
    c.globalAlpha = 1; c.fillText('WIND ' + Math.abs(cross).toFixed(1), 0, 20);
    c.restore();
  }
  function heatBar(c, ink, paper, red) {
    const w = Math.min(150, W - 4 * BTN.left.r - 50), x = W / 2 - w / 2, y = H - 24;
    c.save();
    c.fillStyle = '#12110eaa'; roundRect(c, x - 4, y - 3, w + 8, 16, 8); c.fill();
    const k = clamp(heat, 0, 1);
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7c8a45'); g.addColorStop(.6, '#d0a040'); g.addColorStop(1, red);
    c.fillStyle = g; roundRect(c, x, y, Math.max(6, w * k), 10, 5); c.fill();
    c.fillStyle = '#f2ead6'; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center';
    c.fillText(located ? 'THEY KNOW WHERE YOU ARE' : masked() ? (train.on ? '♪ TRAIN COVERS SHOTS' : bell.ring > 0 ? '♪ BELL COVERS SHOTS' : '♪ THUNDER COVERS SHOTS') : heat > .5 ? 'THEY ARE LISTENING' : 'UNHEARD', W / 2, y + 8);
    if (masked()) { c.strokeStyle = '#9fd070'; c.lineWidth = 1.5; roundRect(c, x - 4, y - 3, w + 8, 16, 8); c.stroke(); }
    if (coverMsg && op && !op.ko && op.sending && !masked() && mid === 'm1') { c.fillStyle = '#f2ead6cc'; c.font = '500 9px Rubik, sans-serif'; for (const [i, l] of wrap(c, coverMsg, w + 10).entries()) c.fillText(l, W / 2, y - 22 + i * 11); }
    c.restore();
  }
  function crosshair(c) {
    c.strokeStyle = '#ffffffaa'; c.lineWidth = 1.5; c.beginPath(); c.arc(W / 2, H / 2, 3, 0, TAU); c.stroke();
  }
  function scopeView(c, brass, red) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * .44, fovR = fovNow() * Math.PI / 180, px = H / fovR;   // units per radian
    c.save();
    c.fillStyle = '#050505'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, R, 0, TAU, true); c.fill('evenodd');
    const g = c.createRadialGradient(cx, cy, R * (.7 - beat * .08 * gs.prefs.motion), cx, cy, R); g.addColorStop(0, '#0000'); g.addColorStop(1, '#000d'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    c.strokeStyle = '#8a7a50'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    // the Wren reticle: fine cross with an open centre, drop chevrons below, wind dots to the sides
    c.strokeStyle = '#0d0d0c'; c.fillStyle = '#0d0d0c'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - 6, cy); c.moveTo(cx + 6, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy - 6); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - R * .55, cy); c.moveTo(cx + R * .55, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy + R); c.lineTo(cx, cy + R * .62); c.stroke();
    c.lineWidth = 1.2; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'left';
    for (const d of [200, 300, 400]) { const yy = cy + holdAt(d) * px; if (yy > cy + R * .6) break; c.beginPath(); c.moveTo(cx - 6, yy - 3); c.lineTo(cx, yy); c.lineTo(cx + 6, yy - 3); c.stroke(); c.fillText(String(d / 100), cx + 8, yy + 3); }
    c.beginPath(); c.moveTo(cx, cy + 6); c.lineTo(cx, cy + R * .62); c.stroke();
    for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * i * .0015 * px, cy, 1.4, 0, TAU); c.fill(); }
    // tagged target help: range and how far to hold over
    const tg = nearTagged();
    if (tg) {
      const { d, s } = tg, cross = Math.cos(Math.atan2(wind.z, wind.x) + look.yaw) * Math.hypot(wind.x, wind.z);
      const hold = holdAt(d) * px, drift = driftAt(d, cross) * px;
      c.strokeStyle = red; c.lineWidth = 1.2; c.beginPath(); c.arc(cx + drift, cy + hold, 4, 0, TAU); c.stroke();
      c.fillStyle = '#f2ead6'; c.textAlign = 'center'; c.font = '700 9px "Courier New", monospace';
      c.fillText(Math.round(d) + ' m' + (s.kind === 'radio' ? ' · OPERATOR' : s.kind === 'officer' ? ' · OFFICER' : ''), cx, cy - R * .8);
    }
    // zoom (a slider along the right of the ring) and breath on the ring
    c.fillStyle = brass; c.font = '700 10px "Courier New", monospace'; c.textAlign = 'center'; c.fillText(zoom.toFixed(0) + '×', cx, cy + R + 14 > H - 8 ? cy + R - 10 : cy + R + 14);
    { const zr = R - 9, [a0, a1] = ZOOM_ARC; c.strokeStyle = '#f2ead633'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.arc(cx, cy, zr, a0, a1); c.stroke();
      for (let z = 3; z <= 12; z += 3) { const a = zoomAngle(z); c.fillStyle = '#f2ead688'; c.beginPath(); c.arc(cx + Math.cos(a) * zr, cy + Math.sin(a) * zr, 1.6, 0, TAU); c.fill(); }
      const a = zoomAngle(zoom); c.fillStyle = brass; c.beginPath(); c.arc(cx + Math.cos(a) * zr, cy + Math.sin(a) * zr, ptrZoom ? 7 : 5, 0, TAU); c.fill(); c.lineCap = 'butt'; }
    c.strokeStyle = gasp > 0 ? red : '#bfe0ff'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R + 6, Math.PI * .75, Math.PI * .75 + Math.PI * .5 * breath.v); c.stroke();
    // rounds as brass cartridges along the lower ring
    for (let i = 0; i < gun.mag; i++) { const a = Math.PI * .35 - i * .09, x = cx + Math.cos(a) * (R - 14), y = cy + Math.sin(a) * (R - 14); c.fillStyle = i < gun.ammo ? brass : '#ffffff22'; c.beginPath(); c.ellipse(x, y, 2.4, 5, a, 0, TAU); c.fill(); }
    if (gun.reloading) { c.fillStyle = '#f2ead6'; c.font = '700 9px "Courier New", monospace'; c.fillText('RELOADING', cx, cy + R * .4); }
    else if (boltT > 0) { c.fillStyle = '#f2ead699'; c.font = '700 8px "Courier New", monospace'; c.fillText('BOLT', cx, cy + R * .4); }
    c.restore();
  }
  // the zoom slider's arc on the scope ring: 12x at the top end, 3x at the bottom
  function zoomAngle(z) { return ZOOM_ARC[1] - (z - 3) / 9 * (ZOOM_ARC[1] - ZOOM_ARC[0]); }
  function scopeRing() { return { cx: W / 2, cy: H / 2, R: Math.min(W, H) * .44 }; }
  function onZoomArc(x, y) { const { cx, cy, R } = scopeRing(), a = Math.atan2(y - cy, x - cx), r = Math.hypot(x - cx, y - cy); return r > R - 30 && r < R + 16 && a > ZOOM_ARC[0] - .12 && a < ZOOM_ARC[1] + .12; }
  function zoomFrom(x, y) { const { cx, cy } = scopeRing(), a = clamp(Math.atan2(y - cy, x - cx), ZOOM_ARC[0], ZOOM_ARC[1]); zoom = clamp(3 + (ZOOM_ARC[1] - a) / (ZOOM_ARC[1] - ZOOM_ARC[0]) * 9, 3, 12); }
  function nearTagged() {
    const e = WD.v.cam.position; let best = null, ba = .08;
    for (const s of men) { if (!s.tagged || s.ko) continue; const a = Math.abs(angDiff(look.yaw, Math.atan2(-(s.x - e.x), -(s.y - e.z)))); if (a < ba) { ba = a; best = { s, d: Math.hypot(s.x - e.x, s.y - e.z) }; } }
    return best;
  }
  function glassView(c, brass) {
    const r = Math.min(W * .3, H * .3), cy = H / 2, ox = r * .78;
    c.save(); c.fillStyle = '#060606';
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2 + ox, cy, r, 0, TAU); c.clip('evenodd');
    c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2 - ox, cy, r, 0, TAU); c.fill('evenodd'); c.restore();
    c.strokeStyle = '#ffffff55'; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2 - r * 1.3, cy); c.lineTo(W / 2 + r * 1.3, cy); c.stroke();
    for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(W / 2 + i * r * .2, cy - (i % 5 ? 3 : 7)); c.lineTo(W / 2 + i * r * .2, cy); c.stroke(); }
    if (tagT) { c.strokeStyle = brass; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, cy, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(tagT.t / .45, 0, 1)); c.stroke(); }
    c.fillStyle = brass; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('HOLD ON A SOLDIER TO TAG', W / 2, cy + r + 16);
    c.restore();
  }
  function tags(c, brass, red) {
    for (const s of men) {
      if (!s.tagged || s.ko) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 2.2, s.y); if (z > 1 || x < 0 || x > W || y < 0 || y > H) continue;
      c.fillStyle = s.alert ? red : brass; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y - 6); c.lineTo(x + 4, y - 6); c.fill();
      if (!scoped) { c.font = '700 7px "Courier New", monospace'; c.textAlign = 'center'; c.fillText(Math.round(Math.hypot(s.x - WD.v.cam.position.x, s.y - WD.v.cam.position.z)) + 'm', x, y - 9); }
    }
  }
  function koPops(c) {
    for (const s of men) {
      const k = s.koFx; if (!k || k.t > 2.2) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 1.6, s.y); if (z > 1) continue;
      const a = clamp(2.2 - k.t, 0, 1), yy = y - 20 - k.t * 10;
      c.save(); c.globalAlpha = a; c.textAlign = 'center';
      c.font = '800 16px Rubik, sans-serif'; c.fillStyle = '#ffe9a8'; c.strokeStyle = '#000a'; c.lineWidth = 3; c.strokeText('KO +' + k.pts, x, yy); c.fillText('KO +' + k.pts, x, yy);
      c.font = '700 8px "Courier New", monospace'; c.fillStyle = '#f2ead6'; c.fillText(k.tags.join(' · '), x, yy + 12);
      c.restore();
    }
  }
  function buttons(c, brass, red) {
    const disc = (b, label, on, ring) => {
      c.save(); c.translate(b.x, b.y);
      const g = c.createRadialGradient(-b.r * .3, -b.r * .4, b.r * .1, 0, 0, b.r); g.addColorStop(0, on ? '#f0d488' : '#3b3830'); g.addColorStop(1, on ? '#8a6a28' : '#1a1916'); c.fillStyle = g;
      c.globalAlpha = .92; c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = brass; c.lineWidth = 1.5; c.stroke();
      if (ring != null) { c.strokeStyle = '#f2ead6'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, b.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * ring); c.stroke(); }
      c.fillStyle = on ? '#2b2a26' : '#f2ead6'; c.font = `800 ${Math.round(b.r * .32)}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(label, 0, b.r * .12);
      c.restore();
    };
    const ready = !gun.reloading && boltT <= 0 && gun.ammo > 0;
    disc(BTN.fire, 'FIRE', ready, gun.reloading ? gun.reloading : null);
    if (!scoped) { c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center'; c.fillStyle = brass; c.fillText('●'.repeat(gun.ammo) + '○'.repeat(gun.mag - gun.ammo), BTN.fire.x, BTN.fire.y + BTN.fire.r + 12); }
    disc(BTN.scope, scoped ? 'BACK' : 'SCOPE', scoped);
    if (scoped) disc(BTN.left, 'BREATH', breath.held && breath.v > 0, breath.v);
    else disc(BTN.left, glass ? 'BACK' : 'GLASS', glass);
    const nn = nextNest();
    if (nn && !move) {
      const b = BTN.move, hot = located || mortar;
      c.save(); c.fillStyle = hot ? red : '#12110ecc'; roundRect(c, b.x, b.y, b.w, b.h, 6); c.fill();
      if (hot && Math.floor(t * 3) % 2) { c.strokeStyle = '#f2ead6'; c.lineWidth = 2; c.stroke(); }
      c.fillStyle = '#f2ead6'; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('MOVE ▸ ' + NESTS[nn].name.toUpperCase(), b.x + b.w / 2, b.y + 16, b.w - 8);
      c.restore();
    }
  }
  function qteDraw(c, brass) {
    const p = qte.now; if (!p) return;
    const k = clamp(p.t / p.time0, 0, 1), x = p.x ?? W / 2, y = p.y ?? H * .55;
    c.save(); c.strokeStyle = brass; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 30 + 40 * k, 0, TAU); c.stroke();
    c.fillStyle = '#12110ecc'; c.beginPath(); c.arc(x, y, 28, 0, TAU); c.fill();
    c.fillStyle = '#f2ead6'; c.font = '800 12px Rubik, sans-serif'; c.textAlign = 'center';
    const label = p.kind === 'tap' ? 'TAP' : p.kind === 'hold' ? 'HOLD' : p.kind === 'mash' ? 'TAP!' : p.dir === 'up' ? '▲ SWIPE' : p.dir === 'down' ? '▼ SWIPE' : 'SWIPE';
    c.fillText(label, x, y + 4);
    if (p.kind === 'hold') { c.strokeStyle = '#9fd070'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.held / p.hold, 0, 1)); c.stroke(); }
    c.font = '700 9px "Courier New", monospace'; c.fillStyle = brass; c.fillText(qteKind === 'climb' ? 'CLIMB THE BELFRY' : 'JUMP FOR THE TRAIN', x, y - 52 - 40 * k);
    c.restore();
  }
  function dossier(c, ink, paper, brass, red) {
    c.fillStyle = '#0b0b0a88'; c.fillRect(0, 0, W, H);
    const w = Math.min(W - 24, 360), x = W / 2 - w / 2, y = H < 380 ? 10 : Math.max(14, H * .06);
    c.save();
    const fh = H < 380 ? H - y - 12 : Math.min(H - y - 14, 380);
    c.fillStyle = '#5b4a30'; roundRect(c, x - 4, y - 4, w + 8, fh + 8, 8); c.fill();
    c.fillStyle = paper; roundRect(c, x, y, w, fh, 6); c.fill();
    c.fillStyle = red; c.font = '800 22px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('LONG SHADOW', x + 14, y + 32);
    c.fillStyle = '#8a7f66'; c.font = '700 9px "Courier New", monospace'; c.fillText('FIELD FILE · CODENAME WREN · ASHVALE 1944', x + 14, y + 46, w - 28);
    let yy = y + 60; briefRows = [];
    for (const m of camp.missions) {
      const on = m.id === sel, open = camp.open(m.id), st = camp.starList(m.id);
      c.fillStyle = on ? '#d9cba6' : '#0000'; c.fillRect(x + 8, yy, w - 16, H < 380 ? 31 : 34);
      c.fillStyle = open ? ink : '#8a7f66'; c.font = '700 13px Rubik, sans-serif'; c.fillText((camp.missions.indexOf(m) + 1) + ' · ' + m.name, x + 16, yy + 15);
      c.font = '700 12px Rubik, sans-serif'; c.fillStyle = brass; c.textAlign = 'right'; c.fillText(st.map(s => s ? '★' : '☆').join(''), x + w - 16, yy + 15); c.textAlign = 'left';
      c.fillStyle = '#8a7f66'; c.font = '600 9px "Courier New", monospace'; c.fillText(open ? (camp.done(m.id) ? 'DONE' : 'READY') : 'LOCKED: FINISH THE ONE ABOVE', x + 16, yy + 28);
      if (open) { c.textAlign = 'right'; c.fillText('✉ ' + camp.collected(m.id) + '/3 LETTERS', x + w - 16, yy + 28); c.textAlign = 'left'; }
      briefRows.push({ x: x + 8, y: yy, w: w - 16, h: 34, id: m.id });
      yy += H < 380 ? 33 : 38;
    }
    const short = H < 380;
    if (short) { c.fillStyle = '#8a7f66'; c.font = '700 10px Rubik, sans-serif'; c.fillText(SEALED.map(([n, name]) => n + ' · ' + name).join('   '), x + 16, yy + 12, w - 32); c.fillStyle = red; c.font = '700 8px "Courier New", monospace'; c.fillText('SEALED · COMING SOON', x + 16, yy + 23); yy += 30; }
    else for (const [n, name] of SEALED) { c.fillStyle = '#8a7f66'; c.font = '700 12px Rubik, sans-serif'; c.fillText(n + ' · ' + name, x + 16, yy + 14); c.font = '700 8px "Courier New", monospace'; c.fillStyle = red; c.textAlign = 'right'; c.fillText('SEALED · COMING SOON', x + w - 16, yy + 14); c.textAlign = 'left'; yy += 22; }
    yy += 6;
    const textW = short ? w - 160 : w - 32;
    c.fillStyle = ink; c.font = '500 11px Rubik, sans-serif'; for (const s of wrap(c, BRIEF[sel], textW)) { c.fillText(s, x + 16, yy + 10); yy += 14; }
    const gx = short ? x + w - 76 : W / 2, gy = short ? Math.min(yy - 10, H - 40) : Math.min(H - 54, yy + 40); briefGo = { x: gx, y: gy, r: 28 };
    // tilt aim: off unless you want it (the phone's turn fine-tunes the aim through the glass)
    { const tx = x + 12, ty = y + fh - 28, tw = 116; tiltBtn = { x: tx, y: ty - 4, w: tw, h: 26 };
      c.fillStyle = tiltAim ? '#2f3a26' : '#d9cba6'; roundRect(c, tx, ty, tw, 18, 9); c.fill();
      c.fillStyle = tiltAim ? '#e8f0c8' : '#5b4a30'; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('TILT AIM · ' + (tiltAim ? 'ON' : 'OFF'), tx + tw / 2, ty + 12); c.textAlign = 'left'; }
    c.translate(gx, gy); c.rotate(-.08); c.strokeStyle = red; c.lineWidth = 3; c.strokeRect(-56, -18, 112, 36); c.fillStyle = red; c.font = '800 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('GO', 0, 7);
    c.restore();
    briefGo.r = 56;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'long-shadow',
  title: 'Long Shadow',
  tag: 'Next Gen · Sniper',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1500, reward: 30,
  hint: 'A sniper campaign in a 1944 valley. Drag to look, tap GLASS to tag soldiers, SCOPE in, hold BREATH and FIRE: aim above far targets and into the wind. Shoot while the train or bell is loud, and MOVE when they find you.',
  traits: ['theme:military', 'genre:shooter'],
  creator: 'Game Scroll',
  make,
};
