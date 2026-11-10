// Greedy meshing for gs.voxels: turns one chunk of blocks into as few quads as it can (touching
// faces of the same block and shading merge into one), with ambient occlusion in the corners (the
// soft darkening where blocks meet) baked into the vertex colours. Plain maths, no three.js, so it
// runs in a worker (voxel-worker.js) or on the main thread.
//
// data: Uint8Array of (S+2)^3 block ids: the chunk plus a one-block border from its neighbours,
// index ((z * P) + y) * P + x with P = S + 2. info: { S, colors: Float32Array (id*3 rgb 0..1),
// see: Uint8Array (1 = see-through: water, glass), ox, oy, oz (the chunk's first block, for colour
// jitter) }. Returns { solid, clear } meshes, each { pos, nrm, col, idx } typed arrays (or null).

const AO = [.42, .62, .8, 1];

export function meshChunk(data, { S, colors, see, ox = 0, oy = 0, oz = 0, jitter = .06 }) {
  const P = S + 2, at = (x, y, z) => data[((z + 1) * P + (y + 1)) * P + (x + 1)];
  const opaque = id => id > 0 && !see[id];
  const out = [new Builder(), new Builder()];
  const mask = new Int32Array(S * S), x = [0, 0, 0], q = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    q[0] = q[1] = q[2] = 0; q[d] = 1;
    for (let pass = 0; pass < 2; pass++) {   // 0: solid blocks, 1: see-through ones (no shading)
      for (x[d] = 0; x[d] <= S; x[d]++) {
        // the faces on the plane between layer x[d]-1 (a) and x[d] (b)
        let n = 0;
        for (x[v] = 0; x[v] < S; x[v]++) for (x[u] = 0; x[u] < S; x[u]++, n++) {
          const a = at(x[0] - q[0], x[1] - q[1], x[2] - q[2]), b = at(x[0], x[1], x[2]);
          let key = 0;
          if (pass === 0) {
            if (opaque(a) && !opaque(b) && x[d] > 0) key = face(a, 1, x, d, u, v, at, opaque, 0);
            else if (opaque(b) && !opaque(a) && x[d] < S) key = face(b, -1, x, d, u, v, at, opaque, -1);
          } else {
            if (a && see[a] && b === 0 && x[d] > 0) key = a | 1 << 8 | 255 << 10;
            else if (b && see[b] && a === 0 && x[d] < S) key = b | 255 << 10;
          }
          mask[n] = key;
        }
        // merge equal faces into rectangles
        n = 0;
        for (let j = 0; j < S; j++) for (let i = 0; i < S;) {
          const key = mask[n];
          if (!key) { i++; n++; continue; }
          let w = 1; while (i + w < S && mask[n + w] === key) w++;
          let h = 1;
          grow: for (; j + h < S; h++) for (let k = 0; k < w; k++) if (mask[n + k + h * S] !== key) break grow;
          x[u] = i; x[v] = j;
          out[pass].quad(x, d, u, v, w, h, key, colors, ox, oy, oz, jitter);
          for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * S] = 0;
          i += w; n += w;
        }
      }
    }
  }
  return { solid: out[0].done(), clear: out[1].done() };
}

// key: block id (8 bits), facing + (bit 8), corner shading 4 x 2 bits (bits 10..17)
function face(id, sign, x, d, u, v, at, opaque, back) {
  // the empty cell the face looks into: x (sign +) or x - 1 along d (sign -)
  const e = [x[0], x[1], x[2]]; e[d] += back;
  const s = (du, dv) => { const p = [e[0], e[1], e[2]]; p[u] += du; p[v] += dv; return opaque(at(p[0], p[1], p[2])) ? 1 : 0; };
  let ao = 0, k = 0;
  for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const a = s(cu, 0), b = s(0, cv), c = s(cu, cv);
    ao |= (a && b ? 0 : 3 - (a + b + c)) << (k++ * 2);
  }
  return id | (sign > 0 ? 1 << 8 : 0) | ao << 10;
}

class Builder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; }
  quad(x, d, u, v, w, h, key, colors, ox, oy, oz, jit) {
    const id = key & 255, plus = key >> 8 & 1, ao = key >> 10 & 255, base = this.pos.length / 3;
    const c = [[0, 0], [w, 0], [w, h], [0, h]];
    for (let k = 0; k < 4; k++) {
      const p = [x[0], x[1], x[2]]; p[u] += c[k][0]; p[v] += c[k][1];
      this.pos.push(p[0], p[1], p[2]);
      const nn = [0, 0, 0]; nn[d] = plus ? 1 : -1; this.nrm.push(nn[0], nn[1], nn[2]);
      // a little colour change across the ground so big flat areas aren't one flat colour
      const hsh = Math.sin((p[0] + ox) * 12.9898 + (p[1] + oy) * 78.233 + (p[2] + oz) * 37.719) * 43758.5453, j = 1 + ((hsh - Math.floor(hsh)) - .5) * 2 * jit;
      const sh = AO[ao >> (k * 2) & 3] * (d === 1 ? (plus ? 1 : .7) : d === 0 ? .86 : .93) * j;
      this.col.push(colors[id * 3] * sh, colors[id * 3 + 1] * sh, colors[id * 3 + 2] * sh);
    }
    const a0 = ao & 3, a1 = ao >> 2 & 3, a2 = ao >> 4 & 3, a3 = ao >> 6 & 3;
    const flip = a0 + a2 < a1 + a3;   // cut the quad along the brighter diagonal so shading stays even
    const t = plus ? (flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3]) : (flip ? [1, 3, 2, 1, 0, 3] : [0, 2, 1, 0, 3, 2]);
    for (const i of t) this.idx.push(base + i);
  }
  done() {
    if (!this.idx.length) return null;
    return { pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), col: new Float32Array(this.col), idx: new Uint32Array(this.idx) };
  }
}
