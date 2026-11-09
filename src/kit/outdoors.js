// 3D outdoor worlds: land made from noise or a heightmap (THREE.Terrain, the three.terrain.js
// library: hills, mountains, islands, dunes...), grass that sways in the wind and fades out far
// away, simple low-poly trees and rocks to scatter with gs.props, and water with waves you can float
// on (the same wave sums move the mesh and answer water.height(x, z), so boats sit right).
//
//   const { Land, Water, tree, rock } = gs.outdoors;
//   reset() {
//     land = new Land({ size: 200, low: -4, high: 18, kind: 'hills', seed: 5, colours: [[-4, '#c9b27a'], [1, '#5d9b3a'], [12, '#7a7a6a']] });
//     view.scene.add(land.object); land.solid(world);                      // walk and drive on it
//     land.grass({ count: 3000, colour: '#6fae3f' });                       // wind and distance fade are in update()
//     props.kind('pine', tree({ kind: 'pine' }), toon('#fff', { vertexColors: true }));
//     land.scatter(props, 'pine', 300, { above: 2, steep: .5, gap: 4, seed: 1 });
//     sea = new Water({ size: 300, level: 0, waves: 1 }); view.scene.add(sea.mesh);
//   }
//   update(dt) { land.update(dt, camera); sea.update(dt, camera.position); hero.y = land.height(hero.x, hero.z); }
//
// One wind for the whole world (new Wind({ x, z, gust })): land.wind = wind sways the grass,
// looks.leaves(m, { wind }) the trees, Weather({ wind }) the rain, Particles' wind the smoke and dust,
// v.air({ wind }) the cloud shadows, and wind.at(x, z) is the push on a bullet or a flag. Gusts roll
// across the land downwind, so a gust shows in the grass before it reaches you.
// impostor(geometry, material): far trees as a few crossed cards with pictures of the real tree.
//
// Sizes are metres; y is up. Keep segments modest on phones (64-128 a side).

import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PlaneGeometry, SRGBColorSpace, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderTarget } from 'three';
import { fbm } from './math.js';
import { bakeRenderer as renderer } from './hd3d.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export { looks, groundDetail, horizon } from './looks.js';
import Terrain, { TerrainNS, createSeededRandom, scatterGrass, updateGrass, updateGrassLOD } from 'three.terrain.js';

const KINDS = {
  hills: TerrainNS.PerlinLayers, mountains: TerrainNS.DiamondSquare, rolling: TerrainNS.SimplexLayers, islands: TerrainNS.HillIsland,
  bumps: TerrainNS.Hill, dunes: TerrainNS.CosineLayers, cracked: TerrainNS.Worley, ridges: TerrainNS.Fault, smooth: TerrainNS.Perlin,
};

/**
 * A piece of land. kind: 'hills' | 'mountains' | 'rolling' | 'islands' | 'bumps' | 'dunes' |
 * 'cracked' | 'ridges' | 'smooth', or a function (x, z) => height for your own shape (gs.math.fbm
 * is handy). size: metres a side; segments: grid lines a side; low / high: the height range; seed;
 * smooth: passes of smoothing; steps: terraces (0 for none); colours: [[height, colour], ...] paints
 * by height (your look); material: your own instead.
 */
export class Land {
  constructor({ kind = 'hills', size = 200, segments = 96, low = -5, high = 20, seed = 1, smooth = 1, steps = 0, colours = null, material = null, edge = 0 } = {}) {
    Object.assign(this, { size, segments, low, high });
    const random = createSeededRandom(seed);
    const own = typeof kind === 'function' ? (g) => {
      // our own height function, in world metres (after the library's clamping, so it's exact)
      for (let r = 0; r <= segments; r++) for (let c = 0; c <= segments; c++) g[r * (segments + 1) + c] = kind(-size / 2 + c * size / segments, -size / 2 + r * size / segments);
    } : null;
    const heightmap = own ? () => {} : KINDS[kind] || KINDS.hills;
    this.object = Terrain({
      heightmap, random, frequency: 2.5, maxHeight: high, minHeight: low, xSize: size, ySize: size, xSegments: segments, ySegments: segments,
      steps: steps > 1 ? steps : 1, stretch: typeof kind !== 'function',
      after: (verts, o) => { if (own) own(verts); for (let i = 0; !own && i < smooth; i++) TerrainNS.Smooth(verts, o); if (edge > 0) TerrainNS.RadialEdges(verts, o, false, size * edge, TerrainNS.EaseInOut); },
      material: material || new MeshStandardMaterial({ color: '#ffffff', roughness: .95, flatShading: false, vertexColors: !!colours }),
    });
    this.mesh = this.object.children[0]; this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    this.object.updateMatrixWorld(true);
    this.z = this.mesh.geometry.attributes.position.array;   // local z is world height
    if (colours) this.paint(colours);
    this.grassScene = null; this.grassMesh = null; this.time = 0;
  }
  /** The ground height at world x, z (between grid points it's blended). */
  height(x, z) {
    const n = this.segments, s = this.size / n, fc = (x + this.size / 2) / s, fr = (z + this.size / 2) / s;
    const c = Math.max(0, Math.min(n - 1, Math.floor(fc))), r = Math.max(0, Math.min(n - 1, Math.floor(fr)));
    const u = Math.max(0, Math.min(1, fc - c)), v = Math.max(0, Math.min(1, fr - r)), Z = this.z, w = n + 1, at = (rr, cc) => Z[(rr * w + cc) * 3 + 2];
    return (at(r, c) * (1 - u) + at(r, c + 1) * u) * (1 - v) + (at(r + 1, c) * (1 - u) + at(r + 1, c + 1) * u) * v;
  }
  /** The ground's up direction at x, z ({ x, y, z }). */
  normal(x, z, e = this.size / this.segments) {
    const dx = this.height(x + e, z) - this.height(x - e, z), dz = this.height(x, z + e) - this.height(x, z - e), l = Math.hypot(dx, 2 * e, dz);
    return { x: -dx / l, y: 2 * e / l, z: -dz / l };
  }
  /** How steep the ground is at x, z: 0 flat .. 1 a cliff. */
  slope(x, z) { return 1 - this.normal(x, z).y; }
  /** Is x, z on this land? */
  inside(x, z) { return Math.abs(x) <= this.size / 2 && Math.abs(z) <= this.size / 2; }
  /** Flattens a round patch (for a village, a landing pad, a pitch) to height h (default: its centre). */
  flatten(x, z, r, h = this.height(x, z), soft = r * .5) {
    const n = this.segments, s = this.size / n, w = n + 1;
    for (let rr = 0; rr <= n; rr++) for (let cc = 0; cc <= n; cc++) {
      const px = -this.size / 2 + cc * s, pz = -this.size / 2 + rr * s, d = Math.hypot(px - x, pz - z); if (d > r + soft) continue;
      const k = d <= r ? 1 : 1 - (d - r) / soft, i = (rr * w + cc) * 3 + 2; this.z[i] += (h - this.z[i]) * k * k * (3 - 2 * k);
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere(); if (this.colours) this.paint(this.colours);
    return this;
  }
  /**
   * masks((x, z, y, slope) => [fields, forest, rock, trodden]): where each kind of ground goes, 0..1
   * at every grid point, for looks.ground (gs.outdoors.looks). Call again after flatten().
   */
  masks(fn) {
    const g = this.mesh.geometry, n = g.attributes.position.count, S = this.size, seg = this.segments, a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const c = i % (seg + 1), r = Math.floor(i / (seg + 1)), x = -S / 2 + c * S / seg, z = -S / 2 + r * S / seg, m = fn(x, z, this.height(x, z), this.slope(x, z));
      for (let k = 0; k < 4; k++) a[i * 4 + k] = m[k] || 0;
    }
    g.setAttribute('gsMask', new BufferAttribute(a, 4)); return this;
  }
  /** Colours the land by height: [[height, colour], ...] blended in between. */
  paint(stops) {
    this.colours = stops; const g = this.mesh.geometry, n = g.attributes.position.count, cols = new Float32Array(n * 3), cs = stops.map(([h, c]) => [h, new Color(c)]), tmp = new Color();
    for (let i = 0; i < n; i++) {
      const h = this.z[i * 3 + 2]; let j = 0; while (j < cs.length - 1 && cs[j + 1][0] <= h) j++;
      const a = cs[j], b = cs[Math.min(cs.length - 1, j + 1)], k = b[0] > a[0] ? Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0]))) : 0;
      tmp.copy(a[1]).lerp(b[1], k); cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new BufferAttribute(cols, 3)); const m = this.mesh.material; if (m && !m.vertexColors) { m.vertexColors = true; m.needsUpdate = true; } return this;
  }
  /** Makes it solid in a gs.physics3d World3D (walk, roll and drive on it). */
  solid(world, o = {}) { return world.ground(this.object, o); }
  /**
   * Covers the land in grass tufts that sway (three.terrain.js grass). count: about how many tufts;
   * colour or tint: [min, max] colours; below / above: heights to keep between; steep: max slope (0..1).
   */
  grass({ count = 2000, colour = '#6aa83c', tint = null, width = 1.2, height = 1, blades = 5, above = -Infinity, below = Infinity, steep = .4, far = 60, seed = 2, wind = 1 } = {}) {
    if (this.grassScene) this.grassScene.removeFromParent();
    const faces = this.segments * this.segments * 2, per = Math.max(1, Math.round(count / faces)), spread = Math.min(1, count / faces);
    const pick = createSeededRandom(seed + 7), c = new Color(colour), lo = c.clone().multiplyScalar(.75), hi = c.clone().lerp(new Color('#ffffff'), .15);
    this.grassScene = scatterGrass(this.mesh.geometry, {
      instanced: true, width, height, bladeCount: blades, color: colour, windStrength: wind, maxTilt: 0, randomRotationAxis: 'y', positionJitter: this.size / this.segments * .5,
      w: this.segments, h: this.segments, instancesPerFace: per, random: createSeededRandom(seed), maxSlope: Math.acos(1 - steep),
      tintRange: tint ? { min: new Color(tint[0]).getHex(), max: new Color(tint[1]).getHex() } : { min: lo.getHex(), max: hi.getHex() },
      spread: (v) => v.z >= above && v.z <= below && pick() < spread,
    });
    this.grassScene.traverse(o => { if (o.isMesh) { o.receiveShadow = true; this.grassMesh ||= o; } });
    this.grassFar = far; this.object.add(this.grassScene);
    return this.grassScene;
  }
  /**
   * Scatters a gs.props kind over the land: above / below heights, steep: max slope, gap, seed,
   * scale: [min, max], keepOut(x, z). Returns the ids.
   */
  scatter(props, name, count, { above = -Infinity, below = Infinity, steep = .5, keepOut = null, inset = 2, ...o } = {}) {
    const h = this.size / 2 - inset;
    return props.scatter(name, count, { x0: -h, z0: -h, x1: h, z1: h }, { ...o, y: (x, z) => this.height(x, z),
      keepOut: (x, z) => { const y = this.height(x, z); return y < above || y > below || this.slope(x, z) > steep || !!keepOut?.(x, z); } });
  }
  /** Each frame: sways the grass and hides tufts far from the camera. */
  update(dt, camera = null) {
    this.time += dt;
    if (this.grassScene) {
      const w = this.wind, k = w && camera ? w.at(camera.position.x, camera.position.z).gust : 1;
      this.grassScene.traverse(o => { if (!o.isMesh) return; updateGrass(o, this.time); const u = (o.userData.grassMaterial || o.material)?.userData?.grassUniforms; if (w && u?.windStrength) u.windStrength.value = w.speed * k * w.grass; });
      if (camera) updateGrassLOD(this.grassScene, camera, this.grassFar);
    }
    return this;
  }
  dispose() { this.object.traverse(o => { o.geometry?.dispose(); }); this.object.removeFromParent(); }
}

/**
 * Water with waves. level: the calm height; waves: how rough (0 calm .. 2 stormy) or your own list
 * [{ dir: radians, length: metres, height: metres, speed }]; size and segments: the patch that
 * follows the camera. colour, opacity, material: the look. height(x, z) and normal(x, z) use the
 * same waves as the mesh, so floating things match what you see.
 */
export class Water {
  constructor({ level = 0, waves = 1, size = 160, segments = 64, colour = '#2f7fb8', opacity = .85, material = null, seed = 3 } = {}) {
    Object.assign(this, { level, size, segments }); this.t = 0;
    let s = seed; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    this.list = Array.isArray(waves) ? waves : Array.from({ length: 4 }, (_, i) => ({ dir: R() * Math.PI * 2, length: [24, 13, 7, 4][i], height: waves * [.35, .18, .08, .04][i], speed: 0 }));
    for (const w of this.list) { w.k = Math.PI * 2 / w.length; w.c = w.speed || Math.sqrt(9.8 / w.k); w.dx = Math.cos(w.dir); w.dz = Math.sin(w.dir); w.ph = R() * 6.28; }
    const g = new PlaneGeometry(size, size, segments, segments); g.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(g, material || new MeshStandardMaterial({ color: colour, roughness: .15, metalness: .1, transparent: opacity < 1, opacity }));
    this.mesh.receiveShadow = true; this.base = Float32Array.from(g.attributes.position.array);
    this.update(0, { x: 0, y: 0, z: 0 });
  }
  /** Water height at x, z right now. */
  height(x, z, t = this.t) { let y = this.level; for (const w of this.list) y += w.height * Math.sin(w.k * (x * w.dx + z * w.dz) - w.k * w.c * t + w.ph); return y; }
  /** Surface up direction at x, z. */
  normal(x, z, t = this.t) {
    let gx = 0, gz = 0;
    for (const w of this.list) { const d = w.height * w.k * Math.cos(w.k * (x * w.dx + z * w.dz) - w.k * w.c * t + w.ph); gx += d * w.dx; gz += d * w.dz; }
    const l = Math.hypot(gx, 1, gz); return { x: -gx / l, y: 1 / l, z: -gz / l };
  }
  /** How deep a point is under the surface (negative above it). */
  depth(p) { return this.height(p.x, p.z) - p.y; }
  /** Each frame: moves the waves on and keeps the patch under `centre` (the camera or the boat). */
  update(dt, centre = null) {
    this.t += dt;
    const cell = this.size / this.segments, p = this.mesh.position;
    if (centre) { p.x = Math.round(centre.x / cell) * cell; p.z = Math.round(centre.z / cell) * cell; }
    const a = this.mesh.geometry.attributes.position, arr = a.array, b = this.base;
    for (let i = 0; i < arr.length; i += 3) arr[i + 1] = this.height(b[i] + p.x, b[i + 2] + p.z);
    a.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
    return this;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.removeFromParent(); }
}

/**
 * The wind over a world: x, z its steady push (metres a second, towards +x / +z), gust 0..1 (how much
 * stronger and weaker it gets), gustSize (metres across a gust), sway and grass (how much leaves and
 * grass move per m/s). Call wind.update(dt) each frame. wind.at(x, z) is the wind there now: { x, z,
 * speed, gust } (gust: 1 is the steady wind). wind.uniforms (lkWind: leaf sway, lkWindDir: which way)
 * plug into looks.leaves; wind.speed and wind.angle are the steady wind. Change x, z any time.
 */
export class Wind {
  constructor({ x = 3, z = 0, gust = .35, gustSize = 70, sway = .12, grass = 1.2 } = {}) {
    Object.assign(this, { x, z, gust, gustSize, sway, grass }); this.t = 0;
    this.uniforms = { lkWind: { value: 0 }, lkWindDir: { value: new Vector2(1, 0) } };
    this.update(0);
  }
  get speed() { return Math.hypot(this.x, this.z); }
  get angle() { return Math.atan2(this.z, this.x); }
  update(dt, at = null) {
    this.t += dt;
    const s = this.speed, d = this.uniforms.lkWindDir.value; if (s > 1e-4) d.set(this.x / s, this.z / s);
    this.uniforms.lkWind.value = s * this.sway * (at ? this.at(at.x, at.z).gust : 1);
    return this;
  }
  at(x, z, out = {}) {
    const s = this.speed, k = this.gustSize, drift = this.t * .8;   // gusts travel at most of the wind's speed
    const g = Math.max(0, 1 + this.gust * fbm((x - this.x * drift) / k, (z - this.z * drift) / k, 2) * 1.6);
    out.x = this.x * g; out.z = this.z * g; out.speed = s * g; out.gust = g; return out;
  }
}

/**
 * A far-away stand-in for a tree (or any prop): a few cards crossed through its middle, each with a
 * picture of the real thing seen from that side, baked once. Lighting stays live (the cards get
 * rounded normals, so a crown lights like one shape), so they match the near trees in any light.
 * geometry + material: the near one (a map with alphaTest is cut out the same way). Options: cards
 * (2..4), size (texels per card picture), round (0 flat .. 1 round normals), material (options for
 * the cards' MeshStandardMaterial). Returns { geometry, material, texture, target, dispose() }, or null when
 * there is no 3D (tests without WebGL). Use it as the last level: props.kind(..., { lod: [[90, mid],
 * [240, imp.geometry, imp.material]] }).
 */
export function impostor(geometry, material, { cards = 3, size = 256, round = .7, material: mo = {} } = {}) {
  const r = renderer(); if (!r) return null;
  geometry.computeBoundingBox(); const bb = geometry.boundingBox;
  const rad = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 1.02, y0 = bb.min.y, y1 = bb.max.y + .02, h = y1 - y0, cy = y0 + h * .55;
  const rt = new WebGLRenderTarget(size * cards, size, { samples: 0, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, colorSpace: SRGBColorSpace });
  rt.texture.anisotropy = 4;
  const src = Array.isArray(material) ? material[0] : material;
  const flat = new MeshBasicMaterial({ map: src?.map || null, color: src?.color || '#ffffff', vertexColors: !!src?.vertexColors, alphaTest: src?.alphaTest || (src?.map ? .5 : 0), side: DoubleSide });
  const scene = new Scene(), mesh = new Mesh(geometry, flat); scene.add(mesh);
  const cam = new OrthographicCamera(-rad, rad, y1, y0, .1, rad * 4 + 10);
  // the clear colour is the tree's own (with no alpha), so cut-out edges don't go dark in the mips
  const c = new Color(src?.color || '#ffffff'), was = { rt: r.getRenderTarget(), auto: r.autoClear, alpha: r.getClearAlpha(), col: r.getClearColor(new Color()), sc: r.getScissorTest() };
  if (geometry.attributes.color) { const a = geometry.attributes.color, m = new Color(0, 0, 0); for (let i = 0; i < a.count; i++) { m.r += a.getX(i); m.g += a.getY(i); m.b += a.getZ(i); } c.multiply(m.multiplyScalar(1 / a.count)); }
  try {
    r.setRenderTarget(rt); r.setClearColor(c.multiplyScalar(.35), 0); r.autoClear = false; r.clear(); r.setScissorTest(true);
    for (let k = 0; k < cards; k++) {
      const a = k / cards * Math.PI, nx = -Math.sin(a), nz = Math.cos(a);   // the card's front: looking back along -n
      cam.position.set(nx * (rad * 2 + 5), 0, nz * (rad * 2 + 5)); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      r.setViewport(k * size, 0, size, size); r.setScissor(k * size, 0, size, size); r.render(scene, cam);
    }
  } finally { r.setScissorTest(was.sc); r.setRenderTarget(was.rt); r.autoClear = was.auto; r.setClearColor(was.col, was.alpha); flat.dispose(); }
  // the cards: one per picture, crossed through the middle
  const P = [], N = [], U = [], I = [], up = new Vector3(0, 1, 0), q = new Vector3(), n = new Vector3();
  for (let k = 0; k < cards; k++) {
    const a = k / cards * Math.PI, ax = Math.cos(a), az = Math.sin(a), b = P.length / 3;
    for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      q.set(ax * rad * sx, sy > 0 ? y1 : y0, az * rad * sx); P.push(q.x, q.y, q.z);
      n.set(-Math.sin(a), 0, Math.cos(a)).lerp(q.clone().setY(q.y - cy).normalize(), round).lerp(up, .25).normalize(); N.push(n.x, n.y, n.z);
      U.push((k + (sx + 1) / 2) / cards, sy > 0 ? 1 : 0);
    }
    I.push(b, b + 3, b + 1, b + 1, b + 3, b + 2);
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(N, 3)); g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
  const m = new MeshStandardMaterial({ map: rt.texture, alphaTest: .5, side: DoubleSide, roughness: .85, ...mo });
  return { geometry: g, material: m, texture: rt.texture, target: rt, dispose() { g.dispose(); m.dispose(); rt.dispose(); } };
}

const tint = (geo, colour) => { const c = new Color(colour), n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new BufferAttribute(a, 3)); return geo; };
const clean = g => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k); return o; };

/**
 * A simple low-poly tree as one geometry with vertex colours (use a material with vertexColors:
 * true). kind: 'pine' | 'round' | 'palm' | 'bush'; trunk / leaves: colours; height in metres. Its base is at y = 0.
 */
export function tree({ kind = 'pine', trunk = '#6b4a2b', leaves = '#3f7d3a', height = 5, seed = 1 } = {}) {
  const parts = [], h = height;
  if (kind === 'bush') { const s = new IcosahedronGeometry(h * .3, 0); s.translate(0, h * .22, 0); parts.push(tint(clean(s), leaves)); }
  else {
    const t = new CylinderGeometry(h * .04, h * .06, kind === 'palm' ? h : h * .45, 6); t.translate(0, (kind === 'palm' ? h : h * .45) / 2, 0); parts.push(tint(clean(t), trunk));
    if (kind === 'pine') for (let i = 0; i < 3; i++) { const c = new ConeGeometry(h * (.32 - i * .07), h * .38, 7); c.translate(0, h * (.42 + i * .2), 0); parts.push(tint(clean(c), leaves)); }
    else if (kind === 'palm') for (let i = 0; i < 6; i++) { const f = new ConeGeometry(h * .06, h * .45, 4); f.rotateZ(Math.PI / 2.4); f.translate(h * .2, 0, 0); f.rotateY(i / 6 * Math.PI * 2 + seed); f.translate(0, h * .98, 0); parts.push(tint(clean(f), leaves)); }
    else { const s = new SphereGeometry(h * .32, 7, 5); s.translate(0, h * .68, 0); parts.push(tint(clean(s), leaves)); }
  }
  const g = mergeGeometries(parts); g.computeVertexNormals(); return g;
}
/** A low-poly rock (vertex colours), about `size` metres across, sitting on y = 0. */
export function rock({ size = 1, colour = '#8a8a80', seed = 1 } = {}) {
  const g = clean(new DodecahedronGeometry(size / 2, 0)), p = g.attributes.position, v = new Vector3();
  let s = seed * 9301 + 49297; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const seen = new Map();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = v.toArray().map(n => n.toFixed(3)).join(); if (!seen.has(k)) seen.set(k, .75 + R() * .5); const m = seen.get(k); p.setXYZ(i, v.x * m, v.y * m * .7, v.z * m); }
  g.translate(0, size * .25, 0); g.computeVertexNormals(); return tint(g, colour);
}

