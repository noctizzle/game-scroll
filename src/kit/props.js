// Bigger levels on phones. Thousands of the same thing (trees, crates, rocks, lamps, grass tufts)
// drawn as one InstancedMesh2 (from @three.ez/instanced-mesh): only the ones on screen are drawn
// (a BVH makes that check fast), far ones swap to simpler shapes (made for you with three's
// SimplifyModifier) and cheaper shadows. Areas hide rooms you can't see from where the camera is,
// and Chunks build an endless or very big world around the player and drop what is far away.
//
//   const { Props, Areas, Chunks, simplify } = gs.props;
//   reset() {
//     props = new Props(view.scene, { renderer: view.renderer });
//     props.kind('tree', treeGeo, toon('#3a6'), { lod: [25, 60] });       // two simpler shapes past 25 m and 60 m
//     props.scatter('tree', 400, { x0: -100, z0: -100, x1: 100, z1: 100, gap: 3, seed: 7, scale: [.8, 1.4], y: (x, z) => ground(x, z) });
//     props.done();                                                      // builds the BVH once everything is placed
//   }
//   areas: areas.add('hall', hallGroup, box).add('vault', vaultGroup, box).link('hall', 'vault'); update: areas.update(camera.position)
//   chunks: new Chunks(view.scene, { size: 40, radius: 2, make: (cx, cz) => buildChunk(cx, cz) }); update: chunks.update(player.pos)

import { Vector3, Box3, Color } from 'three';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';

// meshoptimizer's simplifier (what three's SimplifyModifier uses; its modify() became async in three
// 0.186, so it's called directly here). Its wasm starts at once; the app waits for it with the 3D parts.
let canSimplify = false;
/** Resolves once simplify() can work (gamescroll.js waits for it while loading the 3D parts). */
export const simplifyReady = MeshoptSimplifier.ready.then(() => { canSimplify = true; }, () => {});

/** A simpler copy of a geometry with about `keep` (0..1) of its points. */
export function simplify(geometry, keep = .5) {
  let g = geometry.clone(); g.deleteAttribute?.('uv2');
  if (!g.index) g = mergeVertices(g);
  const pos = g.attributes.position, n = pos.count, k = Math.max(.02, Math.min(1, keep));
  if (k >= 1 || !canSimplify) return g;
  try {
    const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
    const idx = new Uint32Array(g.index.array), target = Math.max(3, Math.floor(idx.length * k / 3) * 3);
    const [out] = MeshoptSimplifier.simplify(idx, p, 3, target, 1, ['LockBorder']);
    g.setIndex(Array.from(out)); g.computeVertexNormals();   // (unused points stay in the arrays; only the triangles go)
    return g;
  } catch (_) { return g; }
}

const rng = seed => { let s = (seed ?? Math.random() * 2 ** 31) | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/** Many copies of a few kinds of thing, each kind drawn in one go. */
export class Props {
  /** scene: where they go; renderer: your view's renderer (lets the library use a faster index); shadows: cast shadows by default. */
  constructor(scene, { renderer = null, shadows = true } = {}) { this.scene = scene; this.renderer = renderer; this.shadows = shadows; this.kinds = new Map(); }
  /**
   * A kind of prop. lod: distances where simpler shapes take over (made by simplify(), keeping
   * `keep` of the detail at each step), or [[distance, geometry, material?], ...] for your own (a
   * material of its own for that level, e.g. gs.outdoors impostor() cards); shadowFar:
   * past this the shadow uses the simplest shape; capacity: how many to expect (it grows if needed).
   */
  kind(name, geometry, material, { lod = [], keep = [.45, .15], shadows = this.shadows, shadowFar = 40, capacity = 256 } = {}) {
    const m = new InstancedMesh2(geometry, material, { capacity, renderer: this.renderer || undefined });
    m.castShadow = shadows; m.receiveShadow = true; m.name = 'props:' + name;
    if (lod.length) {
      m.setFirstLODDistance(0);
      lod.forEach((d, i) => { const [dist, geo, mat] = Array.isArray(d) ? d : [d, simplify(geometry, keep[i] ?? keep.at(-1) / (i + 1))]; m.addLOD(geo, mat || material, dist); });
    }
    // far shadows from the simplest level drawn with the kind's own material (a level with a material of
    // its own, like impostor cards, is cut out from another picture)
    if (shadows && lod.length) { const own = m.LODinfo.render.levels.filter(l => l.object.material === material).at(-1); if (own) m.addShadowLOD(own.object.geometry, shadowFar); }
    this.scene.add(m);
    this.kinds.set(name, { mesh: m, items: [] });
    return m;
  }
  mesh(name) { return this.kinds.get(name)?.mesh || null; }
  /** Adds one. rot: turn about y (radians) or { x, y, z }; scale: a number or { x, y, z }; color: a CSS colour. Returns its id. */
  add(name, x, y, z, { rot = 0, scale = 1, color = null } = {}) {
    const k = this.kinds.get(name); if (!k) throw new Error(`No prop kind "${name}": call kind() first`);
    let id = -1;
    k.mesh.addInstances(1, (o, i) => {
      id = i; o.position.set(x, y, z);
      if (typeof rot === 'number') o.rotateY(rot); else { o.rotateY(rot.y || 0); o.rotateX(rot.x || 0); o.rotateZ(rot.z || 0); }
      if (typeof scale === 'number') o.scale.setScalar(scale); else o.scale.set(scale.x, scale.y, scale.z);
    });
    if (color) k.mesh.setColorAt(id, new Color(color));
    k.items[id] = { x, y, z };
    return id;
  }
  /** Moves one (fine now and then; for things moving every frame use plain meshes). */
  move(name, id, x, y, z) { const k = this.kinds.get(name); k.mesh.updateInstances(o => { if (o.id === id) o.position.set(x, y, z); }); k.items[id] = { x, y, z }; return this; }
  remove(name, id) { const k = this.kinds.get(name); if (!k) return this; k.mesh.removeInstances(id); delete k.items[id]; return this; }
  hide(name, id, hidden = true) { this.kinds.get(name)?.mesh.setVisibilityAt(id, !hidden); return this; }
  /**
   * Scatters count of a kind over an area { x0, z0, x1, z1 } (or a function () => { x, z } for odd
   * shapes): gap keeps them apart, y(x, z) sets the height (the ground), keepOut(x, z) true skips a
   * spot (roads, buildings), scale: [min, max]. Returns the ids.
   */
  scatter(name, count, area, { gap = 0, seed, y = () => 0, keepOut = null, scale = [1, 1], spin = true } = {}) {
    const R = rng(seed), ids = [], placed = [], cell = gap > 0 ? gap : 1, grid = new Map();
    const key = (x, z) => Math.floor(x / cell) + ',' + Math.floor(z / cell);
    for (let tries = 0; ids.length < count && tries < count * 20; tries++) {
      const p = typeof area === 'function' ? area(R) : { x: area.x0 + R() * (area.x1 - area.x0), z: area.z0 + R() * (area.z1 - area.z0) };
      if (keepOut?.(p.x, p.z)) continue;
      if (gap > 0) {
        let ok = true; const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
        for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) for (const q of grid.get((cx + i) + ',' + (cz + j)) || []) if (Math.hypot(q.x - p.x, q.z - p.z) < gap) { ok = false; break; }
        if (!ok) continue;
        const k = key(p.x, p.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p);
      }
      placed.push(p);
      ids.push(this.add(name, p.x, y(p.x, p.z), p.z, { rot: spin ? R() * Math.PI * 2 : 0, scale: scale[0] + R() * (scale[1] - scale[0]) }));
    }
    return ids;
  }
  /** Call once everything is placed: builds the BVH so culling is fast. */
  done({ margin = 0 } = {}) { for (const k of this.kinds.values()) k.mesh.computeBVH({ margin }); return this; }
  /** Props of a kind within r of a point (for pick-ups, collisions, "search the crate"): [{ id, x, y, z, d }]. */
  near(name, p, r) {
    const k = this.kinds.get(name), out = []; if (!k) return out; const pz = p.z ?? p.y;
    k.items.forEach((q, id) => { if (!q) return; const d = Math.hypot(q.x - p.x, q.z - pz); if (d <= r) out.push({ id, ...q, d }); });
    return out.sort((a, b) => a.d - b.d);
  }
  /** How many of a kind (or of all). */
  count(name = null) { if (name) return this.kinds.get(name)?.mesh.instancesCount || 0; let n = 0; for (const k of this.kinds.values()) n += k.mesh.instancesCount; return n; }
  clear() { for (const k of this.kinds.values()) { k.mesh.removeFromParent(); k.mesh.dispose?.(); } this.kinds.clear(); return this; }
}

/**
 * Rooms and zones that hide what can't be seen. add(name, object, box) gives an area its scene
 * objects and its bounds ({ min, max } or a Box3; leave out to use the object's own bounds);
 * link(a, b) says you can see from one into the other (a door or window). update(cameraPos) shows
 * the area the camera is in, the ones linked to it (depth steps deep) and hides the rest.
 */
export class Areas {
  constructor({ depth = 1 } = {}) { this.list = new Map(); this.depth = depth; this.current = null; }
  add(name, object, box = null) {
    const b = box ? (box.isBox3 ? box.clone() : new Box3(new Vector3(box.min.x, box.min.y, box.min.z), new Vector3(box.max.x, box.max.y, box.max.z))) : new Box3().setFromObject(object);
    this.list.set(name, { name, object, box: b, links: new Set() }); return this;
  }
  link(a, b) { this.list.get(a)?.links.add(b); this.list.get(b)?.links.add(a); return this; }
  /** Which area a point is in (or null). */
  at(p) { const v = new Vector3(p.x, p.y, p.z); for (const a of this.list.values()) if (a.box.containsPoint(v)) return a.name; return null; }
  update(p) {
    const here = this.at(p) ?? this.current; if (!here) return this;
    this.current = here;
    const show = new Set([here]); let edge = [here];
    for (let d = 0; d < this.depth; d++) { const nx = []; for (const n of edge) for (const l of this.list.get(n).links) if (!show.has(l)) { show.add(l); nx.push(l); } edge = nx; }
    for (const a of this.list.values()) a.object.visible = show.has(a.name);
    return this;
  }
  /** Names of the areas shown now. */
  get shown() { return [...this.list.values()].filter(a => a.object.visible).map(a => a.name); }
}

/**
 * A big world in square chunks around the player: make(cx, cz) builds one (an Object3D, or null
 * for empty) when it comes within radius chunks, and it's removed and freed when it goes beyond
 * radius + 1. Use the chunk numbers as a seed so the same place always looks the same.
 */
export class Chunks {
  constructor(scene, { size = 40, radius = 2, make, drop = null, perFrame = 1 } = {}) { Object.assign(this, { scene, size, radius, make, drop, perFrame }); this.live = new Map(); this.queue = []; }
  key(cx, cz) { return cx + ',' + cz; }
  update(p) {
    const pz = p.z ?? p.y, cx = Math.floor(p.x / this.size), cz = Math.floor(pz / this.size), r = this.radius;
    for (const [k, c] of this.live) if (Math.abs(c.cx - cx) > r + 1 || Math.abs(c.cz - cz) > r + 1) this.free(k, c);
    const want = [];
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const k = this.key(cx + i, cz + j); if (!this.live.has(k)) want.push({ cx: cx + i, cz: cz + j, k, d: i * i + j * j }); }
    want.sort((a, b) => a.d - b.d);
    for (const w of want.slice(0, this.perFrame)) {   // a few a frame so there's no hitch
      const o = this.make(w.cx, w.cz) || null; if (o) { o.position.x += w.cx * this.size; o.position.z += w.cz * this.size; this.scene.add(o); }
      this.live.set(w.k, { cx: w.cx, cz: w.cz, object: o });
    }
    return this;
  }
  free(k, c) {
    this.live.delete(k); if (!c.object) return;
    this.drop?.(c.object, c.cx, c.cz); c.object.removeFromParent();
    c.object.traverse(o => { o.geometry?.dispose(); });
  }
  /** Is the chunk under p built yet? */
  ready(p) { return this.live.has(this.key(Math.floor(p.x / this.size), Math.floor((p.z ?? p.y) / this.size))); }
  clear() { for (const [k, c] of [...this.live]) this.free(k, c); return this; }
  get count() { return this.live.size; }
}

