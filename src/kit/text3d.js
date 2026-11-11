// Text inside the 3D world that stays sharp at any size and distance, on WebGL and WebGPU alike.
// Each letter is kept as a distance field (how far every point is from the letter's edge), made on the
// phone from the app's own fonts with tiny-sdf (BSD 2-Clause), so one small picture per font serves
// every size, and an outline is the same picture read at another distance. Kit use: games get this
// as gs.fx3d.text3d().
import TinySDF from '@mapbox/tiny-sdf';
import { Mesh, BufferGeometry, BufferAttribute, DataTexture, RedFormat, UnsignedByteType, LinearFilter, MeshBasicMaterial, Color, DoubleSide, NoColorSpace, Quaternion } from 'three';
import { lookPatch } from './looks.js';
import { use as useFonts, list as FONT_LIST } from './fontlib.js';

const PX = 48;          // the size letters are drawn at for their distance field
const PAD = 10;         // room round each letter, in those pixels: an outline can be this wide
const RADIUS = 16;      // how far from the edge distances are kept
const CUTOFF = .25, EDGE = 1 - CUTOFF;   // the edge sits at this value in the picture
const SIZE = 1024;      // the picture of a font's letters (one byte a pixel)
const LINE = 1.25;      // line height, in font sizes
const SHORT = { regular: ['Rubik', 400], bold: ['Rubik', 700], pixel: ['Press Start 2P', 400] };

/** The family and weight for a font option: 'regular' | 'bold' | 'pixel', a gs.fonts name ('Bangers'), or [name, weight]. */
export function fontOf(font) {
  if (Array.isArray(font)) return [String(font[0]), font[1] ?? 400];
  const s = SHORT[String(font).toLowerCase()]; if (s) return s;
  const f = FONT_LIST.find(x => x.name.toLowerCase() === String(font).toLowerCase().trim());
  if (!f) throw new Error(`gs.fx3d.text3d has no font called "${font}". It has: regular, bold, pixel, ${FONT_LIST.map(x => x.name).join(', ')}`);
  return [f.name, f.weights.includes(400) ? 400 : f.weights[0]];
}

// one picture of letters per font and weight, filled as letters are first asked for
const atlases = new Map();
class Atlas {
  constructor(family, weight) {
    this.sdf = new TinySDF({ fontSize: PX, buffer: PAD, radius: RADIUS, cutoff: CUTOFF, fontFamily: `"${family}", Rubik, sans-serif`, fontWeight: String(weight) });
    this.data = new Uint8Array(SIZE * SIZE);
    this.tex = new DataTexture(this.data, SIZE, SIZE, RedFormat, UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = LinearFilter; this.tex.colorSpace = NoColorSpace; this.tex.generateMipmaps = false; this.tex.needsUpdate = true;
    this.glyphs = new Map(); this.x = 1; this.y = 1; this.row = 0; this.full = false;
    const m = this.sdf.ctx.measureText('H');
    this.cap = m.actualBoundingBoxAscent > 1 ? m.actualBoundingBoxAscent : PX * .7;   // a capital's height in letter pixels
  }
  /** A letter's place in the picture and its measures (in letter pixels), drawn the first time. */
  glyph(ch) {
    let g = this.glyphs.get(ch); if (g) return g;
    const d = this.sdf.draw(ch), w = d.width, h = d.height;
    g = { x: 0, y: 0, w: 0, h: 0, left: d.glyphLeft, top: d.glyphTop, adv: d.glyphAdvance };
    if (d.glyphWidth > 0 && d.glyphHeight > 0 && !this.full) {
      if (this.x + w + 1 > SIZE) { this.x = 1; this.y += this.row + 1; this.row = 0; }
      if (this.y + h + 1 > SIZE) { this.full = true; console.warn('gs.fx3d.text3d: this font\'s picture of letters is full; new letters are left blank'); }
      else {
        for (let r = 0; r < h; r++) this.data.set(d.data.subarray(r * w, (r + 1) * w), (this.y + r) * SIZE + this.x);
        g.x = this.x; g.y = this.y; g.w = w; g.h = h;
        this.x += w + 1; this.row = Math.max(this.row, h); this.tex.needsUpdate = true;
      }
    }
    this.glyphs.set(ch, g); return g;
  }
}
function atlasFor(family, weight) {
  const k = family + '|' + weight; let a = atlases.get(k);
  if (!a) atlases.set(k, a = new Atlas(family, weight));
  return a;
}

// the look: the letter's edge from the distance picture, smooth by one screen pixel at any size, and an
// outline as a second edge further out. WebGL here; hd3d-gpu-fx.js sdfLook is the same as nodes.
const GLSL = `
#ifdef USE_MAP
  float gsSd = texture2D(map, vMapUv).r, gsAa = max(fwidth(gsSd), .0001);
  float gsFill = smoothstep(gsSdfEdge - gsAa, gsSdfEdge + gsAa, gsSd);
  float gsCover = smoothstep(gsSdfEdge - gsSdfOutline - gsAa, gsSdfEdge - gsSdfOutline + gsAa, gsSd);
  diffuseColor.rgb = mix(gsSdfOutlineCol, diffuseColor.rgb, gsSdfOutline > 0. ? gsFill : 1.);
  diffuseColor.a *= gsCover;
#endif
`;
function sdfMaterial(tex, color) {
  const m = new MeshBasicMaterial({ map: tex, color, transparent: true, side: DoubleSide, depthWrite: false });
  const uniforms = { gsSdfEdge: { value: EDGE }, gsSdfOutline: { value: 0 }, gsSdfOutlineCol: { value: new Color(0, 0, 0) } };
  lookPatch(m, 'sdf', {
    uniforms, gpuShared: true,
    fragmentHead: 'uniform float gsSdfEdge, gsSdfOutline; uniform vec3 gsSdfOutlineCol;\n',
    fragment: [['#include <map_fragment>', 'replace', GLSL]],
  });
  m.userData.gsSdf = uniforms;
  return m;
}

const Q = new Quaternion();
/**
 * A piece of text as a mesh (gs.fx3d.text3d makes one). Change it with label.text = 'NEW' (and
 * label.color, label.size, label.outline, label.outlineColor, label.align, label.maxWidth), then
 * label.sync(). label.width and label.height are its size in world units after a sync.
 */
export class Text3D extends Mesh {
  constructor(str, { size = .5, color = '#ffffff', font = 'bold', align = 'center', outline = 0, outlineColor = '#000000', maxWidth = Infinity, face = false } = {}) {
    const [family, weight] = fontOf(font);
    useFonts([family, weight]);   // "Loading…" until the font is in (the app's own two are there already)
    const atlas = atlasFor(family, weight);
    super(new BufferGeometry(), sdfMaterial(atlas.tex, color));
    this.atlas = atlas; this.isText3D = true; this.userData.gsNoInk = true;   // (Console views: no ink lines round the letters)
    this.text = String(str); this.size = size; this.align = align; this.outline = outline; this.outlineColor = outlineColor; this.maxWidth = maxWidth;
    this.width = 0; this.height = 0; this.frustumCulled = true; this.renderOrder = 4;
    if (face) this.onBeforeRender = (r, scene, cam) => {   // a label: always faces the camera, whatever it hangs on
      if (this.parent) { this.parent.getWorldQuaternion(Q).invert().multiply(cam.quaternion); this.quaternion.copy(Q); } else this.quaternion.copy(cam.quaternion);
      this.updateMatrixWorld(true);
    };
    this.sync();
  }
  get color() { return this.material.color; }
  set color(c) { this.material.color.set(c); }
  /** Lays the letters out again after a change. */
  sync() {
    const A = this.atlas, k = this.size / A.cap, U = this.material.userData.gsSdf;   // k: world units per letter pixel
    U.gsSdfOutline.value = Math.min(PAD - 1, Math.max(0, this.outline / k)) / RADIUS;
    U.gsSdfOutlineCol.value.set(this.outlineColor);
    const maxPx = Number.isFinite(this.maxWidth) ? this.maxWidth / k : Infinity, space = A.glyph(' ').adv;
    // lines: wrapped at spaces to maxWidth; a word longer than a line stays whole
    const lines = [];
    for (const para of String(this.text).split('\n')) {
      let line = [], w = 0;
      for (const word of para.split(' ')) {
        const gs = [...word].map(ch => A.glyph(ch)), ww = gs.reduce((s, g) => s + g.adv, 0);
        if (line.length && w + space + ww > maxPx) { lines.push({ gs: line, w }); line = []; w = 0; }
        if (line.length) { line.push(A.glyph(' ')); w += space; }
        line.push(...gs); w += ww;
      }
      lines.push({ gs: line, w });
    }
    const n = lines.reduce((s, l) => s + l.gs.filter(g => g.w).length, 0);
    const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    const lh = PX * LINE, blockW = Math.max(0, ...lines.map(l => l.w)), blockH = (lines.length - 1) * lh + A.cap;
    let q = 0;
    lines.forEach((l, li) => {
      let x = this.align === 'left' ? 0 : this.align === 'right' ? -l.w : -l.w / 2;
      const base = blockH / 2 - A.cap - li * lh;   // this line's baseline; the block is centred on its capitals
      for (const g of l.gs) {
        if (g.w) {
          const x0 = (x + g.left - PAD) * k, x1 = x0 + g.w * k, y1 = (base + g.top + PAD) * k, y0 = y1 - g.h * k;
          const u0 = g.x / SIZE, u1 = (g.x + g.w) / SIZE, v1 = g.y / SIZE, v0 = (g.y + g.h) / SIZE;
          pos.set([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], q * 12); uv.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
          idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6); q++;
        }
        x += g.adv;
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3)); geo.setAttribute('uv', new BufferAttribute(uv, 2)); geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    this.geometry.dispose(); this.geometry = geo;
    this.width = blockW * k; this.height = blockH * k;
    return this;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); this.removeFromParent(); }
}
