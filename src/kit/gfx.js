// Console-era graphics kit. Console games render at full device resolution (not chunky pixels),
// so these helpers give them the shaded, lit, "32-bit console" look that sets them apart from the
// flat 4-colour Pocket games: gradients, highlights, soft shadows, glossy spheres and a lighting pass.
//
// All sizes are in the game's own logical units. Colours are any CSS hex (#rgb, #rrggbb).

/** Lighten (amt > 0) or darken (amt < 0) a hex colour by a fraction 0..1. */
export function shade(hex, amt) {
  let h = hex.replace('#', ''); if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map(x => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16), ch = [n >> 16, (n >> 8) & 255, n & 255];
  const out = ch.map(v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
  return '#' + out.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/** Soft elliptical contact shadow on the ground. */
export function shadow(c, x, y, rx, ry = rx * .35, a = .35) {
  const g = c.createRadialGradient(x, y, 0, x, y, rx); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save(); c.translate(x, y); c.scale(1, ry / rx); c.translate(-x, -y); c.fillStyle = g; c.beginPath(); c.arc(x, y, rx, 0, 7); c.fill(); c.restore();
}

/** A lit block: rounded corners, top-to-bottom gradient, bright top edge, dark bottom edge, optional drop shadow. */
export function box(c, x, y, w, h, col, { r = Math.min(w, h) * .18, drop = true, rim = true } = {}) {
  if (w <= 0 || h <= 0) return;
  if (drop) { c.fillStyle = 'rgba(0,0,0,.28)'; rr(c, x + 1, y + Math.max(1.2, h * .08), w, h, r); c.fill(); }
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(col, .28)); g.addColorStop(.5, col); g.addColorStop(1, shade(col, -.32));
  c.fillStyle = g; rr(c, x, y, w, h, r); c.fill();
  if (rim && h > 3) {
    c.save(); rr(c, x, y, w, h, r); c.clip();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x, y, w, Math.max(.8, h * .1));
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, y + h - Math.max(.8, h * .1), w, Math.max(.8, h * .1));
    c.restore();
  }
}

/** A glossy sphere with a specular highlight (balls, heads, gems, bombs). */
export function ball(c, x, y, r, col, { gloss = .7 } = {}) {
  const g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
  g.addColorStop(0, shade(col, .45)); g.addColorStop(.55, col); g.addColorStop(1, shade(col, -.5));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  if (gloss) { c.fillStyle = `rgba(255,255,255,${gloss * .55})`; c.beginPath(); c.ellipse(x - r * .35, y - r * .42, r * .32, r * .2, -.6, 0, 7); c.fill(); }
}

/** A glowing point light (lasers, pickups, muzzle flashes, lamps). */
export function glow(c, x, y, r, col, a = .6) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, '0')); g.addColorStop(1, col + '00');
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.restore();
}

/** Vertical gradient fill for skies, floors and backdrops. */
export function backdrop(c, x, y, w, h, top, bottom) {
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bottom); c.fillStyle = g; c.fillRect(x, y, w, h);
}

/** Final lighting pass, run by the feed after every console game draws: a soft key light from the
 *  top-left and a vignette, so every console game shares the same lit, rounded look. */
export function post(c, w, h) {
  c.save();
  const k = c.createRadialGradient(w * .25, h * .1, 0, w * .25, h * .1, Math.max(w, h) * .9);
  k.addColorStop(0, 'rgba(255,244,220,.10)'); k.addColorStop(1, 'rgba(255,244,220,0)');
  c.globalCompositeOperation = 'lighter'; c.fillStyle = k; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .45, w / 2, h / 2, Math.max(w, h) * .75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
  c.restore();
}
