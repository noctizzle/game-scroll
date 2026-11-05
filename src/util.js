export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rnd = (a, b) => a + Math.random() * (b - a);

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

/** Draw a tiny pixel map: each char is a key into `col`, '.' is transparent. */
export function pix(c, map, x, y, col) {
  for (let r = 0; r < map.length; r++)
    for (let i = 0; i < map[r].length; i++)
      if (map[r][i] !== '.') { c.fillStyle = col[map[r][i]]; c.fillRect(x + i, y + r, 1, 1); }
}

/** Stable small hash, used for pseudo like-counts per game. */
export function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export const fmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'K' : String(n);

/** Pixel-crisp filled circle (no anti-aliasing) for the low-res pocket screens. Uses current fillStyle. */
export function disc(c, x, y, r) {
  x = Math.round(x); y = Math.round(y);
  for (let dy = -r; dy <= r; dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); c.fillRect(x - w, y + dy, w * 2 + 1, 1); }
}

/** Collect pointer velocity over the last ~100ms, for flick gestures. */
export function flickTracker() {
  let pts = [];
  return {
    start(x, y) { pts = [{ x, y, t: performance.now() }]; },
    add(x, y) { const t = performance.now(); pts.push({ x, y, t }); pts = pts.filter(p => t - p.t < 120); },
    velocity() { if (pts.length < 2) return { vx: 0, vy: 0 }; const a = pts[0], b = pts[pts.length - 1], dt = Math.max(.016, (b.t - a.t) / 1000); return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt }; },
  };
}
