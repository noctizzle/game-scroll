// gs.models.wear(mesh, options): age a thing in code, the way texture artists do with curvature and
// cavity maps: its sharp outer edges rubbed lighter, its creases and the parts near the ground
// grimy, moss or snow on what faces up. Worked out once from the mesh's own shape (how its surface
// bends at each corner) into vertex colours, so it costs nothing to draw, on both renderers.
// Flat-sided shapes are first split into smaller triangles (three-subdivide, shape unchanged) so
// the wear has corners to sit on.
// Kit use only: games reach it as gs.models.wear.
import { BufferAttribute, Color, Vector3 } from 'three';
import { LoopSubdivision } from 'three-subdivide';
import { JS } from './ops.js';

const key = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
/**
 * Per vertex: curvature (convex > 0 at outer edges and corners, concave < 0 in creases), as how far the
 * surface turns to each neighbour (no units: a 10 cm crate and a 10 m wall read alike), from the mesh
 * with its seams joined (vertices at one place share their neighbours).
 */
export function curvature(geo) {
  const P = geo.attributes.position, n = P.count, idx = geo.index ? geo.index.array : null;
  const id = new Int32Array(n), where = new Map(), pts = [];
  for (let i = 0; i < n; i++) { const k = key(P.getX(i), P.getY(i), P.getZ(i)); let j = where.get(k); if (j === undefined) { j = pts.length; where.set(k, j); pts.push(new Vector3(P.getX(i), P.getY(i), P.getZ(i))); } id[i] = j; }
  const m = pts.length, N = Array.from({ length: m }, () => new Vector3()), nb = Array.from({ length: m }, () => new Set());
  const tri = idx ? idx.length / 3 : n / 3, a = new Vector3(), b = new Vector3();
  for (let t = 0; t < tri; t++) {
    const i0 = id[idx ? idx[t * 3] : t * 3], i1 = id[idx ? idx[t * 3 + 1] : t * 3 + 1], i2 = id[idx ? idx[t * 3 + 2] : t * 3 + 2];
    a.subVectors(pts[i1], pts[i0]); b.subVectors(pts[i2], pts[i0]); const fn = a.cross(b);   // (area-weighted)
    N[i0].add(fn); N[i1].add(fn); N[i2].add(fn);
    nb[i0].add(i1).add(i2); nb[i1].add(i0).add(i2); nb[i2].add(i0).add(i1);
  }
  for (const v of N) v.normalize();
  const cw = new Float32Array(m), d = new Vector3(), dn = new Vector3();
  for (let i = 0; i < m; i++) {
    let s = 0, c = 0;
    for (const j of nb[i]) { d.subVectors(pts[i], pts[j]); const l = d.length(); if (l < 1e-6) continue; dn.subVectors(N[i], N[j]); s += dn.dot(d) / l; c++; }
    cw[i] = c ? s / c : 0;
  }
  const out = new Float32Array(n), up = new Float32Array(n);
  for (let i = 0; i < n; i++) { out[i] = cw[id[i]]; up[i] = N[id[i]].y; }
  return { curve: out, up };
}

/**
 * Ages a mesh (and returns it): edges (0..1, .6) rubs the outer edges lighter, edgeColour what shows
 * through (default: the material's own colour, lighter); dirt (0..1, .5) darkens creases and the
 * lowest part (ground: metres up from its bottom, .4); moss / snow (0..1) cover what faces up, in
 * mossColour / white; seed changes the patches. The material is copied (so others sharing it keep
 * theirs) with vertex colours on. Works best with some detail: flat boxes are split up first (split,
 * on unless false).
 */
export function wear(mesh, { edges = .6, edgeColour = null, dirt = .5, dirtColour = '#2e261c', ground = .4, moss = 0, mossColour = '#4d6b2a', snow = 0, seed = 0, split = true } = {}) {
  let g = mesh.geometry;
  if (split && g.attributes.position.count < 3000) {
    // more corners to put wear on, the shape kept (flatOnly)
    try { g = LoopSubdivision.modify(g, g.attributes.position.count < 600 ? 2 : 1, { split: true, flatOnly: true, preserveEdges: true, maxTriangles: 20000 }); } catch (e) { /* keep the original */ }
  } else g = g.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  g.computeBoundingBox();
  const { curve, up } = curvature(g), P = g.attributes.position, n = P.count, y0 = g.boundingBox.min.y;
  const size = g.boundingBox.getSize(new Vector3()).length() || 1;
  const col = new Float32Array(n * 3), base = new Color(1, 1, 1);
  const ec = edgeColour ? new Color(edgeColour) : null, dc = new Color(dirtColour), mc = new Color(mossColour), sn = new Color(1.25, 1.25, 1.3), c = new Color();
  const mat0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, own = mat0?.color ? mat0.color : base;
  const p = { x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    p.x = (x + z) * 3 / size * 4 + seed * 17.1; p.y = (y - z * .5) * 3 / size * 4;
    const nz = JS.fbm(p, 64, 3, seed), cv = curve[i];
    c.copy(base);
    // edges: rubbed (convex), patchy
    const e = Math.min(1, Math.max(0, cv * 5 - .1)) * edges * (.55 + nz * .9);
    if (e > 0) { if (ec) c.lerp(new Color(ec.r / Math.max(own.r, .05), ec.g / Math.max(own.g, .05), ec.b / Math.max(own.b, .05)), Math.min(1, e)); else { const k = Math.min(1, e), l = (c.r + c.g + c.b) / 3; c.lerp(new Color(l, l, l), .35 * k).multiplyScalar(1 + 1.1 * k); } }
    // dirt: creases (concave) and near the ground
    const cav = Math.min(1, Math.max(0, -cv * 5)), low = ground > 0 ? Math.max(0, 1 - (y - y0) / ground) : 0;
    const dd = Math.min(1, (cav * .8 + low * .7) * (.6 + nz * .8)) * dirt;
    if (dd > 0) c.lerp(new Color(dc.r / Math.max(own.r, .05), dc.g / Math.max(own.g, .05), dc.b / Math.max(own.b, .05)), dd);
    // moss and snow on what faces up
    const top = Math.max(0, (up[i] - .55) / .45);
    if (moss > 0) c.lerp(new Color(mc.r / Math.max(own.r, .05), mc.g / Math.max(own.g, .05), mc.b / Math.max(own.b, .05)), Math.max(0, Math.min(1, top * moss * (nz * 2 - .3))));
    if (snow > 0) c.lerp(sn, Math.min(1, top * snow * 1.4));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  mesh.geometry = g;
  const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => { const k = m.clone(); k.vertexColors = true; return k; });
  mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
  return mesh;
}
