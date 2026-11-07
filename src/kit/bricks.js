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

/** A brick w×h at (x,y), with studs along the top every `pitch` units. Drawn as glossy moulded
 *  plastic (console games render at full resolution): vertical shading, a lit top edge, a soft
 *  inner shadow, and round studs with shaded sides and shiny caps. */
export function brick(c, x, y, w, h, col, pitch = 8) {
  const k = BRICK[col] || col; if (w <= 0 || h <= 0) return;
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, k[1]); g.addColorStop(.25, k[0]); g.addColorStop(1, k[2]);
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x, y, w, Math.min(1, h * .12));
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x, y, Math.min(1, w * .1), h);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + w - Math.min(1, w * .1), y, Math.min(1, w * .1), h); c.fillRect(x, y + h - Math.min(1, h * .12), w, Math.min(1, h * .12));
  if (pitch > 0) {
    const n = Math.max(1, Math.round(w / pitch)), sw = Math.max(2, pitch * .58), sh = Math.max(1, pitch * .26);
    for (let i = 0; i < n; i++) {
      const cx = x + (i + .5) * w / n, rx = sw / 2, ry = Math.max(.6, sh * .45);
      const sg = c.createLinearGradient(cx - rx, 0, cx + rx, 0); sg.addColorStop(0, k[0]); sg.addColorStop(.35, k[1]); sg.addColorStop(1, k[2]);
      c.fillStyle = sg; c.fillRect(cx - rx, y - sh, sw, sh);
      c.fillStyle = k[0]; c.beginPath(); c.ellipse(cx, y - sh, rx, ry, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(cx - rx * .25, y - sh - ry * .15, rx * .45, ry * .45, 0, 0, 7); c.fill();
    }
  }
}

export const STUD = { silver: ['#c8ccd4', '#ffffff', 10], gold: ['#f0c020', '#fff0a0', 100], blue: ['#3878f0', '#a0c8ff', 1000] };
/** A round stud coin seen from the front, spinning with t. */
export function stud(c, x, y, r, kind = 'silver', t = 0) {
  const k = STUD[kind], sq = Math.max(.12, Math.abs(Math.cos(t * 4 + x * .1))), rx = r * sq;
  const g = c.createLinearGradient(x - rx, y - r, x + rx, y + r); g.addColorStop(0, k[1]); g.addColorStop(.45, k[0]); g.addColorStop(1, 'rgba(0,0,0,.55)');
  c.fillStyle = k[0]; c.beginPath(); c.ellipse(x, y, rx, r, 0, 0, 7); c.fill();
  c.fillStyle = g; c.globalAlpha = .9; c.beginPath(); c.ellipse(x, y, rx, r, 0, 0, 7); c.fill(); c.globalAlpha = 1;
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = Math.max(.4, r * .15); c.beginPath(); c.ellipse(x, y, rx * .62, r * .62, 0, 0, 7); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(x - rx * .35, y - r * .4, rx * .25, r * .2, 0, 0, 7); c.fill();
}

/* ---------- 3D (Console games render real cel-shaded 3D, see toon3d.js) ---------- */
import { G, part, grp } from './toon3d.js';
/** A 3D toy brick sx × sy × sz (world units), studs on top every `pitch` units. Origin at the
 *  centre of its base. col is a BRICK key or a hex colour. */
export function brick3d(col, sx, sy, sz, pitch = 8) {
  const k = BRICK[col] ? BRICK[col][0] : col, g = grp(part(G.box, k, { sx, sy, sz, y: sy / 2 }));
  if (pitch > 0) {
    const nx = Math.max(1, Math.round(sx / pitch)), nz = Math.max(1, Math.round(sz / pitch)), r = Math.min(sx / nx, sz / nz) * .3;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) g.add(part(G.cyl, k, { sx: r, sy: r * .7, sz: r, x: (i + .5) * sx / nx - sx / 2, z: (j + .5) * sz / nz - sz / 2, y: sy + r * .35, line: r >= 2 }));
  }
  return g;
}
/** A 3D stud coin (spin it with rotation.y). */
export function stud3d(kind = 'silver', r = 3) { return grp(part(G.cyl, STUD[kind][0], { sx: r, sy: r * .35, sz: r, rx: Math.PI / 2, glow: .2 }), part(G.cyl, STUD[kind][1], { sx: r * .55, sy: r * .4, sz: r * .55, rx: Math.PI / 2, line: false })); }
