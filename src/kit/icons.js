// Game icons: 528 drawn icons (swords, hearts, keys, animals, food, tools, weather, buttons...) that
// look the same on every phone, where an emoji is a different picture on each one. They are from the
// Game Icons set (game-icons.net) by Lorc, Delapouite and contributors, CC BY 3.0, and ship inside
// the app, so a game stays one file. The icons load the first time a game uses gs.icons.
//
//   const { icon } = gs.icons;
//   icon(c, 'sword', x, y, 32);                                  // centred on x, y, 32 units across, white
//   icon(c, 'hearts', x, y, 24, { color: '#ff5470', outline: '#000' });
//   icon(c, 'key', x, y, 16, { pixel: true, color: PAL[3] });    // hard pixels for the pixel styles
//
// Names are the set's own ('broadsword', 'health-potion', 'pine-tree': gs.icons.names lists them), and
// about 100 plain words work too ('sword', 'heart', 'coin', 'star', 'key', 'bomb', 'skull', 'tree'...).
// Each icon is drawn once at the size and colour asked for and remembered, so drawing is one drawImage.
import { ICONS, ALIAS } from './icon-data.js';

const GRID = 512;   // every icon is one path on a 512 x 512 grid
/** Every icon's name (528), in a to z order. */
export const names = Object.freeze(Object.keys(ICONS));
/** The plain words that also work, and the icon each one is: { sword: 'broadsword', ... }. */
export const words = Object.freeze({ ...ALIAS });
const nameOf = name => { const n = String(name).toLowerCase().trim().replace(/[\s_]+/g, '-'); return ICONS[n] ? n : ALIAS[n] && ICONS[ALIAS[n]] ? ALIAS[n] : null; };
/** Is there an icon by this name (or plain word)? */
export const has = name => !!nameOf(name);
/** Icons whose name has this text in it: find('potion') is ['health-potion', 'round-potion', 'standing-potion']. */
export function find(text) { const t = String(text).toLowerCase().trim(); return names.filter(n => n.includes(t)); }
/** The icon's SVG path data on a 512 x 512 grid, or null. */
export function data(name) { const n = nameOf(name); return n ? ICONS[n] : null; }

const paths = new Map();
/** The icon as a Path2D on a 512 x 512 grid (to fill, stroke or clip with yourself), or null. */
export function path(name) {
  const n = nameOf(name); if (!n || typeof Path2D === 'undefined') return null;
  let p = paths.get(n); if (!p) paths.set(n, p = new Path2D(ICONS[n]));
  return p;
}

const cache = new Map();   // drawn icons, the least recently used dropped first
const KEEP = 160;
function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
// sizes are drawn at one of these (in screen pixels) and scaled to fit, so a pulsing icon isn't redrawn every frame
const STEPS = [12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256, 384, 512];
const stepFor = px => STEPS.find(s => s >= px) || STEPS[STEPS.length - 1];

// every pixel fully on or off, and every one that is on exactly the colour asked for (soft edges come back a shade out)
let dot = null;
function harden(g, w, color) {
  dot ||= canvas(1, 1).getContext('2d', { willReadFrequently: true });
  dot.clearRect(0, 0, 1, 1); dot.fillStyle = '#000'; dot.fillStyle = color; dot.fillRect(0, 0, 1, 1);
  const [r, gr, b] = dot.getImageData(0, 0, 1, 1).data, d = g.getImageData(0, 0, w, w), a = d.data;
  for (let i = 0; i < a.length; i += 4) { if (a[i + 3] > 110) { a[i] = r; a[i + 1] = gr; a[i + 2] = b; a[i + 3] = 255; } else a[i + 3] = 0; }
  g.putImageData(d, 0, 0);
}
function render(n, px, color, outline, width, pixel) {
  const pad = outline ? Math.ceil(width) + 1 : 0, w = px + pad * 2, p = path(n);
  const layer = (fill, stroke) => {
    const cv = canvas(w, w), g = cv.getContext('2d');
    g.translate(pad, pad); g.scale(px / GRID, px / GRID);
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width * 2 * GRID / px; g.lineJoin = 'round'; g.stroke(p); }
    g.fillStyle = fill; g.fill(p);
    if (pixel) { g.setTransform(1, 0, 0, 1, 0, 0); harden(g, w, fill); }
    return cv;
  };
  if (!pixel || !outline) return { img: layer(color, outline), pad, px };
  // hard pixels: the outline and the icon each in one flat colour, with no in-between shades where they meet
  const under = layer(outline, outline);
  under.getContext('2d').drawImage(layer(color, null), 0, 0);
  return { img: under, pad, px };
}

/**
 * Draws an icon centred on (x, y), `size` game units across. Options: color ('#fff'), outline (a
 * colour) and width (the outline's width in game units, 1/16 of the size by default), angle
 * (radians), alpha, flip (mirror it), pixel (hard pixels, for the pixel styles: size is then whole
 * game pixels). Returns false if there is no icon by that name (nothing is drawn).
 */
export function icon(c, name, x, y, size = 24, { color = '#ffffff', outline = null, width = 0, angle = 0, alpha = 1, flip = false, pixel = false } = {}) {
  const n = nameOf(name); if (!n || !(size > 0) || typeof Path2D === 'undefined') return false;
  let scale = 1;
  if (!pixel && c.getTransform) { const m = c.getTransform(); scale = Math.hypot(m.a, m.b) || 1; }
  const px = pixel ? Math.max(4, Math.round(size)) : stepFor(Math.min(512, size * scale));
  const ow = outline ? (pixel ? Math.max(1, Math.round(width || 1)) : (width || size / 16) * px / size) : 0;
  const key = n + '|' + px + '|' + color + '|' + (outline || '') + '|' + (outline ? ow.toFixed(2) : '') + (pixel ? '|p' : '');
  let r = cache.get(key);
  if (r) { cache.delete(key); cache.set(key, r); }
  else { if (cache.size >= KEEP) cache.delete(cache.keys().next().value); cache.set(key, r = render(n, px, color, outline, ow, pixel)); }
  const k = pixel ? 1 : size / r.px, w = r.img.width * k, off = -(pixel ? r.px : size) / 2 - r.pad * k;   // pixel: drawn one to one, never scaled
  const plain = !angle && !flip && alpha === 1;
  const smooth = c.imageSmoothingEnabled; if (pixel) c.imageSmoothingEnabled = false;
  if (plain) c.drawImage(r.img, pixel ? Math.round(x + off) : x + off, pixel ? Math.round(y + off) : y + off, w, w);
  else {
    c.save(); c.translate(pixel ? Math.round(x) : x, pixel ? Math.round(y) : y); if (angle) c.rotate(angle); if (flip) c.scale(-1, 1); if (alpha !== 1) c.globalAlpha *= alpha;
    c.drawImage(r.img, off, off, w, w); c.restore();
  }
  if (pixel) c.imageSmoothingEnabled = smooth;
  return true;
}
/** How many drawn icons are remembered right now (for tests and the debug overlay). */
export const remembered = () => cache.size;
