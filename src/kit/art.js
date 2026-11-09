// Procedural art: the same seed always makes the same creature, face, item, building, pixel sprite or
// name, so a game can have a thousand monsters, loot or towns without drawing each one. Each maker
// returns a plan (traits you can read for the rules: legs, eyes, rarity...) with draw(c, x, y, size)
// to paint it in vector shapes; sprite() gives pixel art for the Pocket styles.
//
//   const { creature, face, item, building, sprite, name } = gs.art;
//   const mon = creature(seed);                 // { body, legs, eyes, colour, draw(c, x, y, size) }
//   mon.draw(c, 180, 300, 80);                   // centred on x, y, about size across
//   const loot = item(seed, 'potion');           // 'sword' | 'potion' | 'gem' | 'shield' | 'key' | 'ring'
//   const s = sprite(seed, 12, 12, gs.palettes.PAL.moss);   // mirrored pixel sprite (a canvas), Bollinger style
//   const who = name(seed);                      // 'Mavorin'
//
// Families of looks: pass { hue } to keep a set in one colour family (a forest's creatures), or { palette:
// [colours] } to use exactly yours.
import { rng } from './math.js';

const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`;
function colours(R, o) {
  if (o.palette?.length) { const p = o.palette; return { main: p[0], dark: p[1 % p.length], light: p[2 % p.length], accent: p[3 % p.length], hue: 0 }; }
  const h = o.hue ?? R() * 360, s = 45 + R() * 35;
  return { main: hsl(h, s, 52), dark: hsl(h, s, 32), light: hsl(h, s, 72), accent: hsl(h + 150 + R() * 60, 70, 55), hue: h };
}
const pick = (R, list) => list[Math.floor(R() * list.length)];
function eye(c, x, y, r, look = 0) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(x + look * r * .3, y, r * .5, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + look * r * .3 - r * .15, y - r * .2, r * .15, 0, 7); c.fill(); }

/** A creature: a body shape, eyes, legs or none, horns, spots, a mouth. Traits: body, legs, eyes, horns, spots, mouth, wings, colour. */
export function creature(seed, o = {}) {
  const R = rng(seed), col = colours(R, o);
  const t = { body: pick(R, ['round', 'tall', 'wide', 'drop', 'bean']), legs: pick(R, [0, 2, 2, 4, 6]), eyes: pick(R, [1, 2, 2, 2, 3]), horns: R() < .35, spots: R() < .5,
    mouth: pick(R, ['smile', 'fangs', 'o', 'flat']), wings: R() < .2, colour: col, wobble: R() * 6.28 };
  const [bw, bh] = { round: [1, 1], tall: [.75, 1.15], wide: [1.2, .8], drop: [.95, 1.1], bean: [1.1, .9] }[t.body], spotsAt = Array.from({ length: 5 }, () => [R() * 1.4 - .7, R() * 1.2 - .6, .08 + R() * .1]);
  t.draw = (c, x, y, size = 64, time = 0) => {
    const s = size / 2, bob = Math.sin(time * 3 + t.wobble) * s * .04;
    c.save(); c.translate(x, y + bob);
    if (t.wings) { c.fillStyle = col.light; for (const k of [-1, 1]) { c.beginPath(); c.ellipse(k * s * bw * .95, -s * .2, s * .45, s * .22, k * -.5 + Math.sin(time * 12) * .2 * k, 0, 7); c.fill(); } }
    c.strokeStyle = col.dark; c.lineWidth = s * .12; c.lineCap = 'round';
    for (let i = 0; i < t.legs; i++) { const lx = (i / Math.max(1, t.legs - 1) - .5) * s * bw * 1.1, step = Math.sin(time * 8 + i * 2) * s * .06; c.beginPath(); c.moveTo(lx, s * bh * .5); c.lineTo(lx + step, s * bh * .95); c.stroke(); }
    if (t.horns) { c.fillStyle = col.accent; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * s * .3, -s * bh * .75); c.lineTo(k * s * .5, -s * bh * 1.15); c.lineTo(k * s * .15, -s * bh * .85); c.fill(); } }
    c.fillStyle = col.main; c.beginPath();
    if (t.body === 'drop') { c.moveTo(0, -s * bh); c.bezierCurveTo(s * bw, -s * .2, s * bw, s * bh * .8, 0, s * bh * .8); c.bezierCurveTo(-s * bw, s * bh * .8, -s * bw, -s * .2, 0, -s * bh); }
    else c.ellipse(0, 0, s * bw * .85, s * bh * .8, 0, 0, 7);
    c.fill();
    c.fillStyle = col.light; c.beginPath(); c.ellipse(0, s * bh * .3, s * bw * .5, s * bh * .35, 0, 0, 7); c.globalAlpha = .5; c.fill(); c.globalAlpha = 1;
    if (t.spots) { c.fillStyle = col.dark; for (const [sx, sy, r] of spotsAt) { if ((sx / bw) ** 2 + (sy / bh) ** 2 > .45) continue; c.beginPath(); c.arc(sx * s, sy * s, r * s, 0, 7); c.fill(); } }
    const ey = -s * bh * .25, er = s * (t.eyes === 1 ? .28 : .17), look = Math.sin(time * .7 + t.wobble);
    for (let i = 0; i < t.eyes; i++) eye(c, (t.eyes === 1 ? 0 : (i / (t.eyes - 1) - .5) * s * bw * .7), ey - (t.eyes === 3 && i === 1 ? s * .12 : 0), er, look);
    c.strokeStyle = '#2a1a1a'; c.fillStyle = '#2a1a1a'; c.lineWidth = s * .06; const my = s * bh * .18;
    c.beginPath();
    if (t.mouth === 'smile') { c.arc(0, my - s * .1, s * .22, .2 * Math.PI, .8 * Math.PI); c.stroke(); }
    else if (t.mouth === 'o') { c.ellipse(0, my, s * .08, s * .1, 0, 0, 7); c.fill(); }
    else if (t.mouth === 'flat') { c.moveTo(-s * .18, my); c.lineTo(s * .18, my); c.stroke(); }
    else { c.moveTo(-s * .2, my); c.lineTo(s * .2, my); c.stroke(); c.fillStyle = '#fff'; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * s * .12, my); c.lineTo(k * s * .08, my + s * .1); c.lineTo(k * s * .04, my); c.fill(); } }
    c.restore();
  };
  return t;
}

/** A face (for characters, shopkeepers, rivals): skin, hair style and colour, eyes, brows, nose, mouth, glasses, beard. */
export function face(seed, o = {}) {
  const R = rng(seed);
  const skin = o.skin ?? pick(R, ['#f4d3b5', '#e8b98f', '#d19a6a', '#a8714a', '#7a4e32', '#5a3825']);
  const hairCol = o.hair ?? pick(R, ['#2a1a10', '#4a2c18', '#8a5a2a', '#d8b060', '#b84a2a', '#e0e0e0', '#3a3a8a']);
  const t = { skin, hairCol, hair: pick(R, ['short', 'long', 'bun', 'spiky', 'bald', 'curly']), eyes: pick(R, ['round', 'sleepy', 'wide']), brows: R() * .4 - .2,
    mouth: pick(R, ['smile', 'grin', 'flat', 'o']), glasses: R() < .25, beard: R() < .2, freckles: R() < .2, width: .85 + R() * .2 };
  t.draw = (c, x, y, size = 64, mood = 0) => {   // mood: -1 sad .. 1 happy
    const s = size / 2, w = s * t.width * .8, h = s * .9; c.save(); c.translate(x, y);
    c.fillStyle = t.hairCol;
    if (t.hair === 'long') { c.beginPath(); c.ellipse(0, s * .1, w * 1.2, h * 1.1, 0, 0, 7); c.fill(); }
    if (t.hair === 'bun') { c.beginPath(); c.arc(0, -h * 1.05, s * .28, 0, 7); c.fill(); }
    c.fillStyle = t.skin; c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, 7); c.fill();
    for (const k of [-1, 1]) { c.beginPath(); c.ellipse(k * w, 0, s * .12, s * .18, 0, 0, 7); c.fill(); }
    c.fillStyle = t.hairCol;
    if (t.hair === 'short' || t.hair === 'long' || t.hair === 'bun') { c.beginPath(); c.ellipse(0, -h * .55, w * 1.02, h * .5, 0, Math.PI, 0); c.fill(); }
    if (t.hair === 'spiky') { c.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI + i / 6 * Math.PI; c.lineTo(Math.cos(a) * w * 1.05, -h * .35 + Math.sin(a) * h * (i % 2 ? .95 : .7)); } c.fill(); }
    if (t.hair === 'curly') for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; c.beginPath(); c.arc(Math.cos(a) * w * .9, -h * .3 + Math.sin(a) * h * .8, s * .2, 0, 7); c.fill(); }
    const ey = -h * .12, ex = w * .42, er = s * (t.eyes === 'wide' ? .14 : .11);
    for (const k of [-1, 1]) {
      if (t.eyes === 'sleepy') { c.strokeStyle = '#222'; c.lineWidth = s * .05; c.beginPath(); c.arc(k * ex, ey, er, 0, Math.PI); c.stroke(); } else eye(c, k * ex, ey, er);
      c.strokeStyle = t.hairCol; c.lineWidth = s * .06; c.beginPath(); c.moveTo(k * ex - er, ey - er * 1.6 + k * t.brows * s * .2 - mood * s * .04); c.lineTo(k * ex + er, ey - er * 1.6 - k * t.brows * s * .2); c.stroke();
    }
    if (t.glasses) { c.strokeStyle = '#222'; c.lineWidth = s * .04; for (const k of [-1, 1]) { c.beginPath(); c.arc(k * ex, ey, er * 1.6, 0, 7); c.stroke(); } c.beginPath(); c.moveTo(-ex + er * 1.6, ey); c.lineTo(ex - er * 1.6, ey); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = s * .05; c.beginPath(); c.moveTo(0, ey + s * .08); c.lineTo(-s * .05, h * .2); c.lineTo(s * .03, h * .22); c.stroke();
    if (t.freckles) { c.fillStyle = 'rgba(120,60,30,.5)'; for (const k of [-1, 1]) for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(k * (ex + (i - 1) * s * .07), h * .12 + (i % 2) * s * .04, s * .02, 0, 7); c.fill(); } }
    if (t.beard) { c.fillStyle = t.hairCol; c.beginPath(); c.ellipse(0, h * .55, w * .75, h * .45, 0, 0, Math.PI); c.fill(); }
    const my = h * .45, curve = (t.mouth === 'smile' || t.mouth === 'grin' ? .12 : t.mouth === 'flat' ? 0 : 0) + mood * .1;
    c.strokeStyle = '#6a2a2a'; c.fillStyle = '#6a2a2a'; c.lineWidth = s * .06; c.beginPath();
    if (t.mouth === 'o') { c.ellipse(0, my, s * .08, s * .1, 0, 0, 7); c.fill(); }
    else if (t.mouth === 'grin') { c.moveTo(-s * .22, my); c.quadraticCurveTo(0, my + s * (.2 + mood * .1), s * .22, my); c.closePath(); c.fill(); }
    else { c.moveTo(-s * .18, my); c.quadraticCurveTo(0, my + s * curve * 2, s * .18, my); c.stroke(); }
    c.restore();
  };
  return t;
}

const RARITY = [['common', '#b8b8b8', 60], ['uncommon', '#5ac85a', 25], ['rare', '#4a8ae8', 11], ['epic', '#b05ae8', 3.5], ['legendary', '#f0a030', .5]];
/** A loot item: kind 'sword' | 'potion' | 'gem' | 'shield' | 'key' | 'ring' (default: picked by the seed). Traits: kind, rarity, rarityColour, power (1..100), colour. */
export function item(seed, kind = null, o = {}) {
  const R = rng(seed), col = colours(R, o);
  kind ||= pick(R, ['sword', 'potion', 'gem', 'shield', 'key', 'ring']);
  let roll = R() * 100, rar = RARITY[0]; for (const r of RARITY) { if (roll < r[2]) { rar = r; break; } roll -= r[2]; }
  const ri = RARITY.indexOf(rar), t = { kind, rarity: rar[0], rarityColour: rar[1], power: Math.round(1 + R() * 20 + ri * 20), colour: col, shape: R() };
  t.draw = (c, x, y, size = 48) => {
    const s = size / 2; c.save(); c.translate(x, y);
    if (ri >= 2) { const g = c.createRadialGradient(0, 0, 0, 0, 0, s); g.addColorStop(0, rar[1] + '88'); g.addColorStop(1, rar[1] + '00'); c.fillStyle = g; c.fillRect(-s, -s, size, size); }
    c.lineJoin = 'round'; c.strokeStyle = '#1a1420'; c.lineWidth = s * .08;
    const path = pts => { c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px * s, py * s) : c.moveTo(px * s, py * s)); c.closePath(); c.fill(); c.stroke(); };
    if (kind === 'sword') { c.rotate(-Math.PI / 4); const w = .1 + t.shape * .08; c.fillStyle = '#dfe6ee'; path([[-w, .3], [-w, -.75], [0, -.95], [w, -.75], [w, .3]]); c.fillStyle = col.accent; path([[-.32, .3], [.32, .3], [.32, .42], [-.32, .42]]); c.fillStyle = col.dark; path([[-.07, .42], [.07, .42], [.07, .8], [-.07, .8]]); c.fillStyle = col.accent; c.beginPath(); c.arc(0, .86 * s, s * .1, 0, 7); c.fill(); c.stroke(); }
    else if (kind === 'potion') { c.fillStyle = 'rgba(220,230,255,.5)'; c.beginPath(); c.arc(0, s * .2, s * .55, 0, 7); c.fill(); c.stroke(); c.fillStyle = col.main; c.beginPath(); c.arc(0, s * .2, s * .5, -.1, Math.PI + .1); c.fill(); c.fillStyle = 'rgba(220,230,255,.6)'; path([[-.18, -.35], [.18, -.35], [.18, -.7], [-.18, -.7]]); c.fillStyle = '#8a5a3a'; path([[-.22, -.7], [.22, -.7], [.2, -.9], [-.2, -.9]]); }
    else if (kind === 'gem') { const n = 5 + Math.floor(t.shape * 4); c.fillStyle = col.main; path(Array.from({ length: n }, (_, i) => [Math.cos(i / n * 6.283 - 1.57) * .7, Math.sin(i / n * 6.283 - 1.57) * .8])); c.fillStyle = col.light; path([[-.3, -.2], [0, -.55], [.3, -.2], [0, .1]]); }
    else if (kind === 'shield') { c.fillStyle = col.main; path([[-.65, -.7], [.65, -.7], [.6, .1], [0, .85], [-.6, .1]]); c.fillStyle = col.accent; if (t.shape < .5) path([[-.12, -.55], [.12, -.55], [.12, .6], [-.12, .6]]); else { c.beginPath(); c.arc(0, -.05 * s, s * .25, 0, 7); c.fill(); c.stroke(); } }
    else if (kind === 'key') { c.fillStyle = col.accent; c.beginPath(); c.arc(-s * .4, 0, s * .3, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#1a1420'; c.beginPath(); c.arc(-s * .4, 0, s * .12, 0, 7); c.fill(); c.fillStyle = col.accent; path([[-.12, -.08], [.8, -.08], [.8, .08], [-.12, .08]]); path([[.5, .08], [.62, .08], [.62, .32], [.5, .32]]); if (t.shape > .4) path([[.7, .08], [.8, .08], [.8, .25], [.7, .25]]); }
    else { c.strokeStyle = col.accent; c.lineWidth = s * .2; c.beginPath(); c.arc(0, s * .1, s * .5, 0, 7); c.stroke(); c.fillStyle = col.main; c.strokeStyle = '#1a1420'; c.lineWidth = s * .06; c.beginPath(); c.arc(0, -s * .45, s * .22, 0, 7); c.fill(); c.stroke(); }
    c.restore();
  };
  return t;
}

/** A building front: storeys, width in bays, roof, door, windows lit at night. Traits: floors, bays, roof, colour. draw(c, x (centre), y (ground), size (height), night 0..1). */
export function building(seed, o = {}) {
  const R = rng(seed), col = o.palette ? colours(R, o) : { main: pick(R, ['#c8a882', '#b86a4a', '#8a9aa8', '#d8c8a0', '#7a8a6a', '#c88a8a']), dark: '#3a3030', accent: pick(R, ['#3a6a8a', '#8a3a3a', '#3a7a4a', '#5a4a3a']) };
  const t = { floors: 1 + Math.floor(R() * 4), bays: 2 + Math.floor(R() * 3), roof: pick(R, ['flat', 'peak', 'peak', 'dome']), colour: col, lit: Array.from({ length: 30 }, () => R() < .5), door: Math.floor(R() * 4) };
  t.draw = (c, x, y, size = 120, night = 0) => {
    const fh = size / (t.floors + .9), w = t.bays * fh * .75, left = x - w / 2, top = y - t.floors * fh; c.save();
    c.fillStyle = col.main; c.fillRect(left, top, w, t.floors * fh);
    c.fillStyle = col.accent;
    if (t.roof === 'peak') { c.beginPath(); c.moveTo(left - fh * .15, top); c.lineTo(x, top - fh * .7); c.lineTo(left + w + fh * .15, top); c.fill(); }
    else if (t.roof === 'dome') { c.beginPath(); c.ellipse(x, top, w * .3, fh * .5, 0, Math.PI, 0); c.fill(); c.fillRect(left, top - fh * .08, w, fh * .1); }
    else c.fillRect(left - fh * .08, top - fh * .12, w + fh * .16, fh * .14);
    if (night > 0) { c.fillStyle = `rgba(10,15,40,${night * .45})`; c.fillRect(left, top, w, t.floors * fh); }   // (the walls darken; lit windows go on top)
    const bw = w / t.bays, dw = bw * .5;
    for (let f = 0; f < t.floors; f++) for (let b = 0; b < t.bays; b++) {
      const wx = left + b * bw + bw * .25, wy = top + f * fh + fh * .22, ww = bw * .5, wh = fh * .5;
      if (f === t.floors - 1 && b === t.door % t.bays) { c.fillStyle = col.dark; c.fillRect(left + b * bw + (bw - dw) / 2, y - fh * .7, dw, fh * .7); continue; }
      const on = t.lit[(f * t.bays + b) % t.lit.length] && night > 0;
      c.fillStyle = on ? `rgba(255,214,120,${.4 + night * .6})` : '#2a3a4a'; c.fillRect(wx, wy, ww, wh);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(wx, wy, ww, wh * .12);
    }
    c.restore();
  };
  return t;
}

/**
 * A pixel sprite: a random half mask mirrored left to right with an outline (Dave Bollinger's pixel
 * spaceships and creatures). w x h pixels; colours: [outline, dark, main, light] (a Pocket palette works).
 * Returns { canvas, mask (0 empty, 1 body, 2 outline), draw(c, x, y, scale) }.
 */
export function sprite(seed, w = 12, h = 12, colours = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'], { fill = .55 } = {}) {
  const R = rng(seed), half = Math.ceil(w / 2), m = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < half; x++) {
    const centre = 1 - Math.abs(y - h / 2) / (h / 2) * .6 - (half - x) / half * .2;   // fuller towards the middle
    if (R() < fill * centre + .1) { m[y * w + x] = 1; m[y * w + (w - 1 - x)] = 1; }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!m[y * w + x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m[(y + dy) * w + x + dx] === 1 && x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h)) m[y * w + x] = 2;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null);
  if (cv) {
    const cx = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = m[y * w + x]; if (!v) continue; cx.fillStyle = v === 2 ? colours[0] : y < h * .35 ? colours[3] : y > h * .7 ? colours[1] : colours[2]; cx.fillRect(x, y, 1, 1); }
  }
  return { canvas: cv, mask: m, w, h, draw(c, x, y, scale = 1) { if (cv) { c.imageSmoothingEnabled = false; c.drawImage(cv, Math.round(x - w * scale / 2), Math.round(y - h * scale / 2), w * scale, h * scale); } } };
}

const SYL = { start: ['ka', 'mo', 'ze', 'tha', 'vor', 'li', 'ar', 'bru', 'sel', 'qui', 'dra', 'no', 'ish', 'fen', 'gal', 'ro', 'um', 'ye'], mid: ['ra', 'li', 'do', 'ven', 'ma', 'ti', 'ru', 'sa', 'el', 'on', 'qa', 'mi'], end: ['n', 'rin', 'ra', 'th', 'dor', 'ix', 'a', 'el', 'us', 'wyn', 'ok', 'ia'] };
const PLACE = { start: ['Ash', 'Bright', 'Cold', 'Elder', 'Fern', 'Gold', 'High', 'Iron', 'Moss', 'Raven', 'Salt', 'Stone', 'Thorn', 'Wild'], end: ['brook', 'ford', 'hold', 'mere', 'moor', 'reach', 'vale', 'wick', 'haven', 'fall', 'stead', 'crag'] };
/** A made-up name: kind 'person' (Mavorin) | 'place' (Thornmere) | 'thing' (Kazdor). Checked words are left to your game (gs.words). */
export function name(seed, kind = 'person') {
  const R = rng(seed);
  if (kind === 'place') return pick(R, PLACE.start) + pick(R, PLACE.end);
  let s = pick(R, SYL.start); const n = kind === 'thing' ? 0 : Math.floor(R() * 2); for (let i = 0; i < n; i++) s += pick(R, SYL.mid); s += pick(R, SYL.end);
  return s[0].toUpperCase() + s.slice(1);
}
