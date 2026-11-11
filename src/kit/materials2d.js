// 2D materials made in code (part of gs.gfx): paper, wood, stone, metal, cloth and water as
// textures that tile without a seam, and stickers: any drawing kept as a picture with an outline, a
// glow and a soft shadow already on it. No image files: every texture is worked out from noise once,
// when a game first asks for it, and remembered. For the smooth styles (Phone, and 2D layers over 3D).
//
//   const { material, slab, water, sticker } = gs.gfx;
//   reset() {
//     wood = material('wood', { color: '#a9703f', planks: 4 });        // made once (about 10 ms), then remembered
//     coin = sticker(40, 40, g => { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(20, 20, 16, 0, 7); g.fill(); },
//       { outline: '#5a3d00', glow: '#fff3a0', shadow: true });
//   }
//   draw(c) {
//     slab(c, 20, 500, 320, 60, wood, { r: 8 });                       // a lit, rounded plank with a soft shadow
//     c.fillStyle = material('stone').at(x, y); c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill();   // any shape
//     water(c, 0, 560, W, 80, t);                                      // moving light on water
//     coin.draw(c, x, y, { scale: 1 + .1 * Math.sin(t * 6), angle: t });
//   }

/* ---------- noise that repeats, so the tile has no seam ---------- */
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// smooth noise 0..1 that repeats every px cells across and py cells down
function vnoise(x, y, px, py, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px, ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
  const a = hash2(xa, ya, seed), b = hash2(xb, ya, seed), c = hash2(xa, yb, seed), d = hash2(xb, yb, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// layers of it (u, v are 0..1 across the tile; cx, cy the cells of the coarsest layer)
function fbm(u, v, cx, cy, seed, layers) {
  let s = 0, amp = .5, n = 0;
  for (let o = 0; o < layers; o++) { s += amp * vnoise(u * cx, v * cy, cx, cy, seed + o * 17); n += amp; amp *= .5; cx *= 2; cy *= 2; }
  return s / n;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frac = x => x - Math.floor(x);
// distance to the nearest and second nearest of a repeating scatter of points (p cells across)
function cells(u, v, p, seed) {
  const x = u * p, y = v * p, ix = Math.floor(x), iy = Math.floor(y); let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p;
    const dx = cx + hash2(wx, wy, seed) - x, dy = cy + hash2(wx, wy, seed + 1) - y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}
// thin straight marks (paper fibres, scratches in metal) added to a tile of shades, wrapping at its edges
function marks(shade, n, seed, count, len, amount, angle, spread) {
  for (let k = 0; k < count; k++) {
    const a = angle + (hash2(k, 1, seed) - .5) * spread, L = len * (.4 + hash2(k, 2, seed)), amt = amount * (hash2(k, 5, seed) < .5 ? -1 : 1) * (.5 + hash2(k, 6, seed) * .5);
    let x = hash2(k, 3, seed) * n, y = hash2(k, 4, seed) * n; const dx = Math.cos(a), dy = Math.sin(a);
    for (let i = 0; i < L; i++, x += dx, y += dy) shade[(((y | 0) % n + n) % n) * n + ((x | 0) % n + n) % n] += amt * Math.sin(Math.PI * i / L);
  }
}

/** The materials, and the colour each starts as. */
export const MATERIALS = Object.freeze({ paper: '#f1e7d0', wood: '#a9703f', stone: '#8b8e93', metal: '#9aa4b0', cloth: '#3f6fb5', water: '#2f86d6' });

const SHADES = {
  paper(u, v, x, y, o) {
    return 1 + (fbm(u, v, 5, 5, o.seed, 4) - .5) * .16 + (hash2(x, y, o.seed + 99) - .5) * .05;
  },
  wood(u, v, x, y, o, n) {
    let tone = 0, edge = 0, uu = u;
    if (o.planks > 0) {   // boards across the tile, each with its own grain, a dark gap between them and one butt joint
      const p = Math.min(o.planks - 1, Math.floor(v * o.planks)), d = Math.min(v * o.planks - p, p + 1 - v * o.planks) / o.planks * n;
      const j = Math.abs(frac(u - hash2(p, 3, o.seed) + .5) - .5) * n;
      tone = (hash2(p, 1, o.seed) - .5) * .16; uu = u + hash2(p, 2, o.seed);
      edge = Math.max(1 - smooth(.6, 2.2, d), 1 - smooth(.5, 1.6, j)) * .5;
      v += hash2(p, 4, o.seed) * 7;   // (frac below: a whole number of rings per tile keeps the seam hidden)
    }
    const warp = fbm(uu, v, 3, 6, o.seed, 4), rings = .5 + .5 * Math.cos(Math.PI * 2 * (v * 10 + warp * 2.4));
    const fibre = vnoise(uu * 4, v * 160, 4, 160, o.seed + 7);
    return 1 + tone - rings * rings * rings * .2 + (fibre - .5) * .15 + (fbm(uu, v, 2, 2, o.seed + 31, 2) - .5) * .14 - edge;
  },
  stone(u, v, x, y, o, n) {
    let tone = 0, mortar = 0, lit = 0, uu = u, vv = v;
    if (o.blocks > 0) {   // rows of blocks, every other row shifted by half a block, with mortar between; each block its own piece of rock
      const rows = o.blocks, cols = Math.max(1, Math.round(rows / 2)), r = Math.min(rows - 1, Math.floor(v * rows)), fy = v * rows - r;
      const ux = u * cols + (r % 2) * .5, cI = Math.floor(ux), fx = ux - cI, c = ((cI % cols) + cols) % cols;
      const dy = Math.min(fy, 1 - fy) / rows * n, dx = Math.min(fx, 1 - fx) / cols * n, d = Math.min(dx, dy);
      tone = (hash2(c, r, o.seed + 3) - .5) * .2; mortar = 1 - smooth(1, 2.6, d);
      lit = (1 - smooth(2.6, 6, fy / rows * n)) * .12 - (1 - smooth(2.6, 6, (1 - fy) / rows * n)) * .14;
      uu = u + hash2(c, r, o.seed + 11); vv = v + hash2(c, r, o.seed + 12);
    }
    const base = fbm(uu, vv, 4, 4, o.seed, 5), fine = fbm(uu, vv, 24, 24, o.seed + 8, 2), speck = hash2(x, y, o.seed + 5);
    // cracks: the borders of a scatter of cells, bent by noise, and only where another noise lets them show
    const bend = (fbm(uu, vv, 4, 4, o.seed + 40, 2) - .5) * .16, show = smooth(.47, .6, fbm(uu, vv, 2, 2, o.seed + 70, 2));
    const crack = show > 0 ? (1 - smooth(0, .035, cells(uu + bend, vv - bend, 3, o.seed + 50))) * show : 0;
    const m = 1 + tone + lit + (base - .5) * .42 + (fine - .5) * .16 + (speck > .985 ? .12 : speck < .02 ? -.12 : 0) - crack * .3;
    return m * (1 - mortar) + .58 * mortar;
  },
  metal(u, v, x, y, o) {   // brushed: long fine streaks one way, and broad soft bands of shine
    return 1 + (vnoise(u * 3, v * 200, 3, 200, o.seed) - .5) * .17 + (vnoise(u * 6, v * 90, 6, 90, o.seed + 3) - .5) * .09 + (fbm(u, v, 1, 3, o.seed + 9, 2) - .5) * .26;
  },
  cloth(u, v, x, y, o) {   // a plain weave: each thread goes over one and under one
    const t = o.threads, tx = u * t, ty = v * t, ix = Math.floor(tx), iy = Math.floor(ty), fx = tx - ix, fy = ty - iy, over = (ix + iy) & 1;
    const across = over ? fy : fx, along = over ? fx : fy;
    const bump = Math.pow(Math.sin(Math.PI * across), .7) * (.72 + .28 * Math.sin(Math.PI * along));
    return .76 + bump * .36 + (hash2(over ? iy : ix, over ? 1000 : 2000, o.seed) - .5) * .12 + (hash2(x, y, o.seed + 9) - .5) * .04;
  },
  water(u, v, x, y, o) {
    return .9 + caustic(u, v, o.seed) * .55 + (fbm(u, v, 3, 3, o.seed + 20, 3) - .5) * .12;
  },
};
// the bright net of light on the bottom of shallow water
function caustic(u, v, seed) {
  const w = (fbm(u, v, 3, 3, seed + 40, 2) - .5) * .09;
  return Math.pow(1 - smooth(0, .3, cells(frac(u + w), frac(v - w), 5, seed)), 2.2);
}
const rgb = hex => { let h = String(hex).replace('#', ''); if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/**
 * A material's tile as plain numbers: { size, data } with data a size x size RGBA picture that
 * repeats without a seam. material() makes the canvas from it; this is here for tests and for games
 * that want the numbers. Options as material().
 */
export function texture(name, o = {}) {
  const make = SHADES[name]; if (!make) throw new Error(`gs.gfx has no material called "${name}". It has: ${Object.keys(MATERIALS).join(', ')}`);
  const n = o.px || 256, q = { seed: 1, planks: 0, blocks: 0, threads: 32, ...o, color: o.color || MATERIALS[name] };
  q.seed = (q.seed | 0) || 1; q.threads = Math.max(2, Math.round(q.threads / 2) * 2); q.planks = Math.max(0, q.planks | 0); q.blocks = Math.max(0, q.blocks | 0);
  const shade = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) shade[y * n + x] = make((x + .5) / n, (y + .5) / n, x, y, q, n);
  if (name === 'paper') marks(shade, n, q.seed + 60, 260 * (n / 256) ** 2, 14 * n / 256, .045, 0, Math.PI * 2);
  if (name === 'metal') marks(shade, n, q.seed + 61, 16 * n / 256, 120 * n / 256, .07, 0, .12);
  const [r, g, b] = rgb(q.color), data = new Uint8ClampedArray(n * n * 4), k = q.contrast == null ? 1 : q.contrast;
  for (let i = 0; i < n * n; i++) {
    const m = 1 + (shade[i] - 1) * k, up = m > 1 ? Math.min(1, (m - 1) * 1.6) : 0, dn = m < 1 ? Math.max(0, m) : 1;
    data[i * 4] = r * dn + (255 - r) * up; data[i * 4 + 1] = g * dn + (255 - g) * up; data[i * 4 + 2] = b * dn + (255 - b) * up; data[i * 4 + 3] = 255;
  }
  return { size: n, data };
}

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c;
}
function tileOf(size, data) {
  const cv = canvas(size, size), g = cv.getContext('2d'), img = g.createImageData(size, size);
  img.data.set(data); g.putImageData(img, 0, 0);
  return cv;
}

class Material {
  constructor(name, tile, span) {
    this.name = name; this.tile = tile; this.span = span;   // span: game units one tile covers
    this.k = span / tile.width;
    this._p = null; this._x = NaN; this._y = NaN;
  }
  /** The fill for c.fillStyle, with the texture's corner at (x, y): something that moves carries its texture with it. */
  at(x = 0, y = 0) {
    const p = this._p ||= this.tile.getContext('2d').createPattern(this.tile, 'repeat');
    if (x !== this._x || y !== this._y) { this._x = x; this._y = y; p.setTransform(new DOMMatrix([this.k, 0, 0, this.k, x, y])); }
    return p;
  }
  /** The fill for c.fillStyle, with the texture's corner at 0, 0. */
  get pattern() { return this.at(0, 0); }
}
const made = new Map();
/**
 * A material to fill shapes with: 'paper', 'wood', 'stone', 'metal', 'cloth' or 'water'. Options:
 * color (its main colour), seed (a different piece of it), scale (1: one tile is 128 game units;
 * 2 makes the grain twice as big), contrast (1; 0 is flat colour, 2 is strong), and per material:
 * wood planks (boards down the tile, 0 for one piece), stone blocks (rows of blocks, even numbers;
 * 0 for rock), cloth threads (32 across the tile). The same options give the same material back,
 * so calling it again is cheap. Use `c.fillStyle = m.at(x, y)` (or m.pattern), m.tile is the picture.
 */
export function material(name, o = {}) {
  if (name instanceof Material) return name;
  const key = name + '|' + JSON.stringify(o);
  let m = made.get(key);
  if (!m) {
    if (made.size >= 48) made.delete(made.keys().next().value);
    const t = texture(name, o);
    made.set(key, m = new Material(name, tileOf(t.size, t.data), 128 * (o.scale || 1)));
  }
  return m;
}

function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
/**
 * A block of a material: rounded corners, lit from the top left, with a soft shadow under it.
 * mat: a material() or a name. Options: r (corner radius, 6), bevel (the lit edge's width, 2; 0 for
 * flat), shadow (true, false, or how far it drops in game units), tint (a colour washed over it,
 * like '#ff000040'), anchor ([x, y] the texture is fixed to: by default the block's own corner, so
 * it moves with the block; pass [0, 0] for blocks that should look cut from one big sheet).
 */
export function slab(c, x, y, w, h, mat = 'wood', { r = 6, bevel = 2, shadow = true, tint = null, anchor = null } = {}) {
  if (!(w > 0 && h > 0)) return;
  const m = material(mat);
  if (shadow) {   // a few see-through layers, each a little bigger: a soft edge without a costly blur
    const drop = shadow === true ? Math.max(2, Math.min(6, h * .12)) : +shadow;
    c.fillStyle = 'rgba(0,0,0,.075)';
    for (let i = 0; i < 4; i++) { rr(c, x - i * .8 + drop * .25, y + drop - i * .8 + 1, w + i * 1.6, h + i * 1.6, r + i * .8); c.fill(); }
  }
  c.save(); rr(c, x, y, w, h, r); c.clip();
  c.fillStyle = anchor ? m.at(anchor[0], anchor[1]) : m.at(x, y); c.fillRect(x, y, w, h);
  if (tint) { c.fillStyle = tint; c.fillRect(x, y, w, h); }
  if (bevel > 0) {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
    c.strokeStyle = g; c.lineWidth = bevel * 2; rr(c, x, y, w, h, r); c.stroke();   // half of the line is outside the clip
    const s = c.createLinearGradient(0, y, 0, y + h); s.addColorStop(0, 'rgba(255,255,255,.12)'); s.addColorStop(.45, 'rgba(255,255,255,0)'); s.addColorStop(1, 'rgba(0,0,0,.16)');
    c.fillStyle = s; c.fillRect(x, y, w, h);
  }
  c.restore();
}

const nets = new Map();   // the caustic net alone in the light's colour: see-through where the water is dark
function causticTile(light) {
  let net = nets.get(light); if (net) return net;
  const n = 256, data = new Uint8ClampedArray(n * n * 4), [r, g, b] = rgb(light);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = (y * n + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = caustic((x + .5) / n, (y + .5) / n, 7) * 255; }
  const tile = tileOf(n, data), ctx = tile.getContext('2d');
  if (nets.size >= 4) nets.delete(nets.keys().next().value);
  nets.set(light, net = { tile, a: ctx.createPattern(tile, 'repeat'), b: ctx.createPattern(tile, 'repeat') });
  return net;
}
/**
 * Water in a rectangle, with light moving on it. t: the game's time in seconds. Options: color (the
 * water at the top), deep (at the bottom; darker by default), light (the colour of the moving net of
 * light), strength (0..1, .5), scale (1: how big the net is), flow ([x, y] game units a second it
 * drifts). For a pond or a river of another shape, clip to the shape first, then call this.
 */
export function water(c, x, y, w, h, t = 0, { color = MATERIALS.water, deep = null, light = '#ffffff', strength = .5, scale = 1, flow = [6, 3] } = {}) {
  if (!(w > 0 && h > 0)) return;
  const g = c.createLinearGradient(0, y, 0, y + h), [r, gr, b] = rgb(color);
  g.addColorStop(0, color); g.addColorStop(1, deep || `rgb(${r * .55 | 0},${gr * .6 | 0},${b * .75 | 0})`);
  c.fillStyle = g; c.fillRect(x, y, w, h);
  if (!(strength > 0)) return;
  const n = causticTile(light), span = 96 * scale, k = span / 256, k2 = k * 1.37, wrap = (v, s) => ((v % s) + s) % s;
  // two layers of the same net sliding past each other: where they cross, the light flickers
  n.a.setTransform(new DOMMatrix([k, 0, 0, k, x + wrap(flow[0] * t, span), y + wrap(flow[1] * t, span)]));
  n.b.setTransform(new DOMMatrix([-k2, 0, 0, k2, x + wrap(-flow[0] * t * .7 + 31, span * 1.37), y + wrap(flow[1] * t * 1.3 + 17, span * 1.37)]));
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha *= Math.min(1, strength) * .7; c.fillStyle = n.a; c.fillRect(x, y, w, h);
  c.globalAlpha *= .75; c.fillStyle = n.b; c.fillRect(x, y, w, h);
  c.restore();
}

/* ---------- stickers ---------- */
class Sticker {
  constructor(w, h, draw, o) {
    this.w = w; this.h = h; this._draw = draw; this.o = o;
    this.res = 0; this.img = null; this.pad = 0;
  }
  /** Draw it afresh next time (after something the drawing depends on changed). */
  redraw() { this.img = null; return this; }
  _make(res) {
    const o = this.o, ow = o.outline ? (o.width || 2) : 0, glow = o.glow ? (o.glowSize || 8) : 0;
    const sh = o.shadow ? { color: o.shadow === true ? 'rgba(0,0,0,.4)' : o.shadow, blur: o.shadowBlur == null ? 6 : o.shadowBlur, x: o.shadowX || 0, y: o.shadowY == null ? 3 : o.shadowY } : null;
    const pad = Math.ceil(ow + Math.max(glow * 1.5, sh ? sh.blur * 1.5 + Math.max(Math.abs(sh.x), Math.abs(sh.y)) : 0)) + 1;
    const W = Math.ceil((this.w + pad * 2) * res), H = Math.ceil((this.h + pad * 2) * res);
    // the drawing itself
    const art = canvas(W, H), a = art.getContext('2d');
    a.scale(res, res); a.translate(pad, pad); this._draw(a, this.w, this.h);
    let top = art;
    if (ow) {   // its shape in the outline's colour, stamped all round, with the drawing on top
      const sil = canvas(W, H), s = sil.getContext('2d');
      s.drawImage(art, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = o.outline; s.fillRect(0, 0, W, H);
      top = canvas(W, H); const g = top.getContext('2d'), steps = Math.max(8, Math.ceil(ow * res * 2.2));
      for (let i = 0; i < steps; i++) { const an = i / steps * Math.PI * 2; g.drawImage(sil, Math.cos(an) * ow * res, Math.sin(an) * ow * res); }
      g.drawImage(art, 0, 0);
    }
    const out = canvas(W, H), g = out.getContext('2d');
    if (sh) { g.save(); g.shadowColor = sh.color; g.shadowBlur = sh.blur * res; g.shadowOffsetX = sh.x * res; g.shadowOffsetY = sh.y * res; g.drawImage(top, 0, 0); g.restore(); }
    if (glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = glow * res; g.drawImage(top, 0, 0); g.drawImage(top, 0, 0); g.restore(); }
    g.drawImage(top, 0, 0);
    this.img = out; this.res = res; this.pad = pad;
  }
  /**
   * Draws it centred on (x, y). Options: scale, angle (radians), alpha, flip (mirror), anchor
   * ([0..1, 0..1]: which point of the drawing sits on x, y; [.5, .5] by default, [0, 0] for its top left).
   */
  draw(c, x, y, { scale = 1, angle = 0, alpha = 1, flip = false, anchor = null } = {}) {
    let k = 1; if (c.getTransform) { const m = c.getTransform(); k = Math.hypot(m.a, m.b) || 1; }
    const res = this.o.res || Math.max(1, Math.min(3, Math.ceil(k - .01)));   // sharp for the screen, whatever scale it is drawn at
    if (!this.img || res !== this.res) this._make(res);
    const ax = anchor ? anchor[0] : .5, ay = anchor ? anchor[1] : .5, w = this.img.width / this.res, h = this.img.height / this.res;
    const ox = -this.pad - this.w * ax, oy = -this.pad - this.h * ay;
    if (scale === 1 && !angle && !flip && alpha === 1) { c.drawImage(this.img, x + ox, y + oy, w, h); return; }
    c.save(); c.translate(x, y); if (angle) c.rotate(angle); c.scale(flip ? -scale : scale, scale); if (alpha !== 1) c.globalAlpha *= alpha;
    c.drawImage(this.img, ox, oy, w, h); c.restore();
  }
}
/**
 * Keeps a drawing as a picture, so it costs one drawImage however much went into it, and adds the
 * looks that are slow to draw every frame. draw(g, w, h) draws it once into a w by h box (0, 0 is
 * its top left). Options: outline (a colour) and width (2), glow (a colour) and glowSize (8), shadow
 * (true or a colour) with shadowBlur (6), shadowX (0), shadowY (3), res (pixels per game unit: by
 * default as sharp as the screen, up to 3). Make it in make() or reset(); it is drawn for the screen
 * it is on, and again by itself if the screen changes.
 */
export function sticker(w, h, draw, o = {}) { return new Sticker(w, h, draw, o); }
