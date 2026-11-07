// Shared look for the toy-brick games: chunky bricks with studs on top, and round studs as coins.
export const BRICK = {
  red: ['#d83a2c', '#f0705c', '#901c14'],
  blue: ['#2c64c8', '#6098f0', '#18387c'],
  yellow: ['#f0c020', '#f8e070', '#a07c08'],
  green: ['#38a040', '#78d070', '#1c6024'],
  white: ['#e8e8e0', '#ffffff', '#a0a098'],
  grey: ['#8c9098', '#b8bcc4', '#585c64'],
  black: ['#383840', '#585868', '#18181c'],
  orange: ['#f07818', '#f8a860', '#a04808'],
  tan: ['#d0b078', '#e8d0a0', '#907040'],
};
export const BRICK_KEYS = ['red', 'blue', 'yellow', 'green', 'orange', 'white'];

/** A brick w×h at (x,y), with studs along the top every `pitch` pixels. */
export function brick(c, x, y, w, h, col, pitch = 8) {
  const k = BRICK[col] || col;
  c.fillStyle = k[2]; c.fillRect(x, y, w, h);
  c.fillStyle = k[0]; c.fillRect(x, y, w - 1, h - 1);
  c.fillStyle = k[1]; c.fillRect(x, y, w - 1, 1); c.fillRect(x, y, 1, h - 1);
  if (pitch > 0) { const n = Math.max(1, Math.round(w / pitch)), sw = Math.max(2, Math.round(pitch * .55)), sh = Math.max(1, Math.round(pitch * .25)); for (let i = 0; i < n; i++) { const sx = Math.round(x + (i + .5) * w / n - sw / 2); c.fillStyle = k[0]; c.fillRect(sx, y - sh, sw, sh); c.fillStyle = k[1]; c.fillRect(sx, y - sh, sw, 1); } }
}

export const STUD = { silver: ['#c8ccd4', '#ffffff', 10], gold: ['#f0c020', '#fff0a0', 100], blue: ['#3878f0', '#a0c8ff', 1000] };
/** A round stud coin seen from the front, spinning with t. */
export function stud(c, x, y, r, kind = 'silver', t = 0) {
  const k = STUD[kind], sq = Math.abs(Math.cos(t * 4 + x * .1));
  c.fillStyle = k[0]; c.beginPath(); c.ellipse(x, y, Math.max(1, r * sq), r, 0, 0, 7); c.fill();
  c.fillStyle = k[1]; c.fillRect(x - r * sq * .4, y - r * .5, Math.max(1, r * sq * .4), r * .4);
}
