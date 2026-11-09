// Occlusion culling for Next Gen views (hd3d.js v.occluders): things fully hidden behind big solid boxes
// (buildings, walls, rocks) are skipped before the frame is drawn, on WebGL and WebGPU alike.
//
// How: the boxes nearest the camera are drawn into a small depth picture on the CPU (128 pixels across,
// 1/w per pixel, nearest wins), which is then shrunk into a pyramid where each level keeps the FARTHEST
// depth of the four below it. A thing is hidden when, over every pixel its bounding sphere covers (one
// pixel extra all round), something nearer than its nearest point is already there. This is the
// software way big engines do it (Intel's Masked Occlusion Culling, Frostbite, Umbra): there's no
// maintained JavaScript library, and WebGPU's hardware occlusion queries answer a frame late (things
// pop in) and don't exist on WebGL, so the two paths would differ. Being on the CPU, it gives the same
// answer on both. Results are only ever conservative: when unsure (a thing reaching behind the camera),
// the thing is drawn.
// Kit use only.
import { Box3, Matrix4, Vector3, Vector4, Frustum, Sphere } from 'three';

const M = new Matrix4(), IM = new Matrix4(), BX = new Box3(), FR = new Frustum(), V4 = new Vector4(), S = new Sphere(), C = new Vector3();
const NEAR_W = .05;   // boxes are cut off this close in front of the camera
const CORNERS = Array.from({ length: 8 }, () => new Vector4());
// the 12 triangles of a box, as corner numbers (corner bit 0: x, bit 1: y, bit 2: z)
const TRIS = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];

/** A box from { x0, x1, y0, y1, z0, z1 } (city.occluders()), a Box3, or a mesh (its world box: only for solid, box-like meshes). */
export function toBox(o) {
  if (o?.isBox3) return o.clone();
  if (o?.isObject3D) { o.updateWorldMatrix(true, false); return new Box3().setFromObject(o); }
  return new Box3(new Vector3(o.x0, o.y0, o.z0), new Vector3(o.x1, o.y1, o.z1));
}

export class Occlusion {
  /** w: depth picture width in pixels (height follows the view's shape); max: most boxes drawn per frame (nearest first). */
  constructor({ w = 128, max = 300, bias = .01 } = {}) {
    this.w = w; this.max = max; this.bias = bias; this.boxes = []; this.levels = [];
    this.ready = false; this.stats = { boxes: 0, tested: 0, hidden: 0, ms: 0 };
  }
  set(list) { this.boxes = (list || []).map(toBox); this.ready = false; return this; }
  /** Draws the boxes as seen by camera (aspect = view width / height). Call once per frame before hidden(). */
  frame(camera, aspect) {
    const t0 = performance.now(), w = this.w, h = Math.max(8, Math.min(256, Math.round(w / aspect)));
    let L0 = this.levels[0];
    if (!L0 || L0.w !== w || L0.h !== h) { this.levels = []; for (let lw = w, lh = h; ; lw = Math.ceil(lw / 2), lh = Math.ceil(lh / 2)) { this.levels.push({ w: lw, h: lh, d: new Float32Array(lw * lh) }); if (lw <= 4 && lh <= 4) break; } L0 = this.levels[0]; }
    L0.d.fill(0);
    camera.updateMatrixWorld(); M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); FR.setFromProjectionMatrix(M);
    this.vp = M.clone();
    const cp = camera.getWorldPosition(C), near = [];
    for (const b of this.boxes) if (FR.intersectsBox(b) && !b.containsPoint(cp)) near.push([b.distanceToPoint(cp), b]);   // (a box the camera is in hides nothing)
    near.sort((a, b) => a[0] - b[0]);
    const n = Math.min(near.length, this.max);
    for (let i = 0; i < n; i++) this.drawBox(near[i][1], L0);
    // the pyramid: each texel keeps the farthest (smallest 1/w) of the four below it
    for (let l = 1; l < this.levels.length; l++) {
      const A = this.levels[l - 1], B = this.levels[l];
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
        const x0 = x * 2, y0 = y * 2, x1 = Math.min(x0 + 1, A.w - 1), y1 = Math.min(y0 + 1, A.h - 1);
        B.d[y * B.w + x] = Math.min(A.d[y0 * A.w + x0], A.d[y0 * A.w + x1], A.d[y1 * A.w + x0], A.d[y1 * A.w + x1]);
      }
    }
    this.ready = true; this.stats.boxes = n; this.stats.tested = this.stats.hidden = 0; this.stats.ms = performance.now() - t0;
    return this;
  }
  drawBox(b, L) {
    const P = CORNERS;
    for (let i = 0; i < 8; i++) P[i].set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, 1).applyMatrix4(this.vp);
    for (let t = 0; t < 36; t += 3) {
      // clip the triangle to the part in front of the camera (a wall you stand beside reaches behind you)
      let poly = [P[TRIS[t]], P[TRIS[t + 1]], P[TRIS[t + 2]]];
      if (poly.some(q => q.w < NEAR_W)) {
        const out = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], c = poly[(k + 1) % poly.length], ain = a.w >= NEAR_W, cin = c.w >= NEAR_W;
          if (ain) out.push(a);
          if (ain !== cin) { const f = (NEAR_W - a.w) / (c.w - a.w); out.push(new Vector4().lerpVectors(a, c, f)); }
        }
        if (out.length < 3) continue;
        poly = out;
      }
      const sp = poly.map(q => [(q.x / q.w * .5 + .5) * L.w, (.5 - q.y / q.w * .5) * L.h, 1 / q.w]);
      for (let k = 1; k + 1 < sp.length; k++) this.tri(sp[0], sp[k], sp[k + 1], L);
    }
  }
  tri(a, bb, c, L) {
    const w = L.w, h = L.h, d = L.d;
    const area = (bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-6) return;
    const minX = Math.max(0, Math.floor(Math.min(a[0], bb[0], c[0]))), maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], bb[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], bb[1], c[1]))), maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], bb[1], c[1])));
    const ia = 1 / area;
    for (let y = minY; y <= maxY; y++) {
      const py = y + .5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + .5;
        const w0 = ((bb[0] - px) * (c[1] - py) - (bb[1] - py) * (c[0] - px)) * ia;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) * ia;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * bb[2] + w2 * c[2], k = y * w + x;
        if (z > d[k]) d[k] = z;
      }
    }
  }
  /** True when a world sphere (centre, radius) is surely hidden behind the boxes from the last frame(). */
  hidden(center, radius) {
    BX.min.set(center.x - radius, center.y - radius, center.z - radius); BX.max.set(center.x + radius, center.y + radius, center.z + radius);
    return this.hiddenBox(BX);
  }
  /** True when a world box (Box3) is surely hidden behind the boxes from the last frame(). */
  hiddenBox(b) {
    if (!this.ready) return false;
    this.stats.tested++;
    const L0 = this.levels[0], vp = this.vp;
    // its screen rectangle and nearest 1/w, from its eight corners
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wNear = Infinity;
    for (let i = 0; i < 8; i++) {
      V4.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, 1).applyMatrix4(vp);
      if (V4.w < 1e-2) return false;   // reaches behind the camera: drawn
      const sx = (V4.x / V4.w * .5 + .5) * L0.w, sy = (.5 - V4.y / V4.w * .5) * L0.h;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy; if (V4.w < wNear) wNear = V4.w;
    }
    x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(L0.w - 1, Math.ceil(x1) + 1); y1 = Math.min(L0.h - 1, Math.ceil(y1) + 1);
    if (x0 > x1 || y0 > y1) return false;   // off screen: the frustum test is three's job
    const need = (1 / wNear) * (1 + this.bias);   // what's there must be at least this near
    // the pyramid level where the rectangle is at most about 4 texels across
    let l = 0; while (l < this.levels.length - 1 && Math.max(x1 - x0, y1 - y0) >> l > 4) l++;
    const L = this.levels[l];
    for (let y = y0 >> l; y <= y1 >> l; y++) for (let x = x0 >> l; x <= x1 >> l; x++) if (L.d[y * L.w + x] < need) return false;
    this.stats.hidden++;
    return true;
  }
  /** hidden() for a mesh, by its world bounding box (instanced and skinned meshes: their bounding sphere). */
  hiddenObject(o) {
    const g = o.geometry; if (!g) return false;
    if (o.isInstancedMesh || o.isSkinnedMesh) {   // (these keep their own bounds, round every instance or the posed body)
      if (o.boundingSphere === null) o.computeBoundingSphere();
      S.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); return this.hidden(S.center, S.radius);
    }
    if (!g.boundingBox) g.computeBoundingBox();
    return this.hiddenBox(BX.copy(g.boundingBox).applyMatrix4(o.matrixWorld));   // (a box fits wide, flat meshes far better than a sphere)
  }
  /** hidden() for instance i of an InstancedMesh2 (gs.props). */
  hiddenInstance(m, i) {
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    m.getMatrixAt(i, IM); S.copy(g.boundingSphere).applyMatrix4(IM).applyMatrix4(m.matrixWorld);
    return this.hidden(S.center, S.radius);
  }
}
