// The font library: 13 display fonts and 4 more pixel fonts, all open-licence (SIL OFL 1.1), shipped
// inside the app so a game stays one file. A font's file is only fetched the first time a game
// names it. Rubik and Press Start 2P are always there, as before.
//
//   const { font, use } = gs.fonts;
//   reset() { use('Bangers', 'Orbitron'); ... }          // optional: "Loading…" until they are in, so the first frame has them
//   draw(c) { c.font = font('Bangers', 34); c.fillText('KA-POW!', x, y); }
//
// font(name, size, weight) gives the string for c.font and starts the font loading if it isn't in
// yet; until then the text draws in Rubik, so nothing breaks. use(...names) in make() or reset()
// waits for them first, the way the other lazy parts do. For crisp pixel text in the pixel styles use
// gs.pixel.text with font: 'silkscreen', 'tiny', 'jersey' or 'terminal' (and 'small' and 'big', as before).
import { StillLoading } from './lazy.js';

// name, what it looks like, the weights that ship, and for pixel fonts the size their pixels sit on the grid at
const LIST = [
  ['Rubik', 'the app\'s own text: plain and friendly', [400, 500, 700, 800]],
  ['Bangers', 'comic book shout', [400]],
  ['Fredoka', 'round and friendly', [400, 700]],
  ['Titan One', 'chunky cartoon title', [400]],
  ['Bungee', 'arcade sign, block capitals', [400]],
  ['Orbitron', 'science fiction', [500, 800]],
  ['Creepster', 'spooky', [400]],
  ['Pirata One', 'pirates and castles', [400]],
  ['Rye', 'wild west', [400]],
  ['Monoton', 'neon tubes', [400]],
  ['Black Ops One', 'army stencil', [400]],
  ['Cinzel', 'epic fantasy capitals', [400, 700]],
  ['Patrick Hand', 'handwritten note', [400]],
  ['Courier Prime', 'typewriter', [400, 700]],
  // pixel fonts: the last number is the size in px at which one of the font's pixels is one pixel
  ['Press Start 2P', 'arcade pixels, capitals 7 high', [400], 8],
  ['Silkscreen', 'small pixel capitals, 5 high', [400, 700], 8],
  ['Tiny5', 'tiny pixels with small letters, capitals 5 high', [400], 8],
  ['Jersey 10', 'tall scoreboard pixels, capitals 10 high', [400], 56 / 3],
  ['VT323', 'old computer terminal, capitals 14 high', [400], 25],
];
/** Every font: { name, look, weights, pixel } (pixel: the size in px its pixels are crisp at, for pixel fonts). */
export const list = Object.freeze(LIST.map(([name, look, weights, pixel]) => Object.freeze({ name, look, weights: Object.freeze(weights), pixel: pixel || 0 })));
const BY = new Map(list.map(f => [f.name.toLowerCase(), f]));
const BUILT_IN = new Set(['rubik', 'press start 2p']);   // src/main.js loads these with the app
const state = new Map();   // 'name weight' -> 'loading' | 'ready' | 'failed'
const waits = new Map();   // 'name weight' -> promise
let files = null, filesP = null;

const find = name => BY.get(String(name).toLowerCase().trim()) || null;
/** The weight a font has that is nearest to the one asked for. */
function nearest(f, weight) { return f.weights.reduce((a, b) => Math.abs(b - weight) < Math.abs(a - weight) ? b : a); }
const canLoad = () => typeof document !== 'undefined' && !!document.fonts && typeof FontFace === 'function';

function load(f, w) {
  const key = f.name.toLowerCase() + ' ' + w;
  if (waits.has(key)) return waits.get(key);
  let p;
  if (BUILT_IN.has(f.name.toLowerCase())) {
    p = canLoad() ? document.fonts.load(`${w} 16px "${f.name}"`).then(() => { state.set(key, 'ready'); }) : Promise.resolve();
  } else if (!canLoad()) {
    p = Promise.resolve();   // no page here (a test in Node): text falls back
  } else {
    state.set(key, 'loading');
    filesP ||= import('./font-files.js').then(m => (files = m.FILES));
    p = filesP.then(() => {
      const face = new FontFace(f.name, `url(${files[key]}) format('woff2')`, { weight: String(w), style: 'normal' });
      document.fonts.add(face);
      return face.load();
    }).then(() => { state.set(key, 'ready'); bump(); });
  }
  p = p.catch(e => { state.set(key, 'failed'); waits.delete(key); throw e; });
  p.catch(() => {});   // a font that fails to load only means the fallback stays
  waits.set(key, p);
  return p;
}
// pixel text is drawn once and remembered, and a card waiting in the feed is drawn once: both are told
// when a font arrives, so they draw again with it
const onArrive = [];
function bump() { for (const fn of onArrive) fn(); }
/** For gs.pixel and the app: called when any font finishes loading. */
export function whenFontArrives(fn) { onArrive.push(fn); }

/**
 * The string for c.font: font('Bangers', 34) is '400 34px "Bangers", Rubik, sans-serif'. Starts the
 * font loading on first use; text draws in Rubik until it is in. weight: 400 by default, and the
 * nearest weight the font has is used. An unknown name gives Rubik.
 */
export function font(name, size = 16, weight = 400) {
  const f = find(name) || BY.get('rubik'), w = nearest(f, weight);
  if (state.get(f.name.toLowerCase() + ' ' + w) !== 'ready') load(f, w);
  const tail = f.name === 'Rubik' ? 'sans-serif' : f.pixel || f.name === 'Courier Prime' ? 'monospace' : 'Rubik, sans-serif';
  return `${w} ${size}px "${f.name}", ${tail}`;
}
/** Is this font in and ready to draw? (Every weight it has that was asked for.) */
export function ready(name, weight = 400) {
  const f = find(name); if (!f) return false;
  return state.get(f.name.toLowerCase() + ' ' + nearest(f, weight)) === 'ready';
}
/**
 * Call in make() or reset() to have fonts in before the first frame: use('Bangers', 'Orbitron'), or
 * use(['Fredoka', 700]) for a weight. The app shows "Loading…" the first time, like other lazy parts.
 * Where fonts can't load at all (no page), it does nothing.
 */
export function use(...names) {
  if (!canLoad()) return true;
  const pending = [];
  for (const n of names) {
    const [name, weight = 400] = Array.isArray(n) ? n : [n];
    const f = find(name); if (!f) throw new Error(`gs.fonts has no font called "${name}". It has: ${list.map(x => x.name).join(', ')}`);
    const w = nearest(f, weight), key = f.name.toLowerCase() + ' ' + w;
    if (state.get(key) !== 'ready' && state.get(key) !== 'failed') pending.push(load(f, w));
  }
  if (pending.length) throw new StillLoading('gs.fonts', Promise.allSettled(pending));
  return true;
}
const SHORT = { silkscreen: 'Silkscreen', tiny: 'Tiny5', tiny5: 'Tiny5', jersey: 'Jersey 10', terminal: 'VT323', vt323: 'VT323' };
/** For gs.pixel: the pixel font and weight for a short name ('silkscreen', 'silkscreen bold', 'tiny', 'jersey', 'terminal'), or null. */
export function pixelFont(short) {
  const s = String(short).toLowerCase().trim(), bold = / bold$/.test(s), f = find(SHORT[s.replace(/ bold$/, '')] || s.replace(/ bold$/, ''));
  return f && f.pixel && f.name !== 'Press Start 2P' ? { font: f, weight: nearest(f, bold ? 700 : 400) } : null;
}
/** Starts a font loading (for gs.pixel). */
export function want(f, weight = 400) { const w = nearest(f, weight); if (state.get(f.name.toLowerCase() + ' ' + w) !== 'ready') load(f, w); return w; }
