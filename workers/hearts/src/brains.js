// Tiny Brains shared learning (the app's src/kit/brains.js): phones send their brain's numbers now
// and then, and a fresh brain starts from everyone's average.
//
//   POST /brain body { device, game, name, shape, w, steps } (+ pass, like /score) -> { ok }
//   GET  /brain?game=<id>&name=<name>&shape=6x12x4 -> { w, from } | 404 when nobody has shared one
//
// Safe against a few bad phones: every number is clamped, the average is trimmed (the top and
// bottom 20% of each number are dropped), only brains that learned for a while count, and each
// device has one entry (its latest).

export const NAME_RE = /^[a-z0-9_-]{1,24}$/i;
export const SHAPE_RE = /^\d+(x\d+){1,5}$/;
const MAX_PARAMS = 1200, MIN_STEPS = 500, MAX_W = 3000, LIMIT = 4, USE = 200, DAYS = 60;

export function paramsOf(shape) {
  const s = shape.split('x').map(Number); let n = 0;
  for (let i = 1; i < s.length; i++) n += s[i - 1] * s[i] + s[i];
  return n;
}
export function unpack(text) {
  const m = /^tb1:(\d+(?:x\d+){1,5}):([0-9.eE+-]+):([A-Za-z0-9+/=]*)$/.exec(String(text || ''));
  if (!m) return null;
  const scale = +m[2]; if (!(scale > 0) || !isFinite(scale)) return null;
  let bin; try { bin = atob(m[3]); } catch (_) { return null; }
  const w = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) { const b = bin.charCodeAt(i); w[i] = Math.max(-LIMIT, Math.min(LIMIT, (b > 127 ? b - 256 : b) * scale)); }
  return { shape: m[1], w };
}
export function pack(shape, w) {
  let m = 0; for (const v of w) m = Math.max(m, Math.abs(v));
  const scale = m / 127 || 1e-6; let bin = '';
  for (const v of w) bin += String.fromCharCode((Math.round(v / scale) + 256) & 255);
  return `tb1:${shape}:${scale.toPrecision(6)}:${btoa(bin)}`;
}

/** A clean upload, or an error string. */
export function cleanBrain(b) {
  const { name, shape, w, steps } = b || {};
  if (typeof name !== 'string' || !NAME_RE.test(name)) return 'bad name';
  if (typeof shape !== 'string' || !SHAPE_RE.test(shape) || paramsOf(shape) > MAX_PARAMS) return 'bad shape';
  if (typeof w !== 'string' || w.length > MAX_W) return 'bad brain';
  const u = unpack(w); if (!u || u.shape !== shape || u.w.length !== paramsOf(shape)) return 'bad brain';
  if (!Number.isInteger(steps) || steps < MIN_STEPS) return 'not learned enough';
  return null;
}

export async function saveBrain(db, game, device, b, now = Date.now()) {
  await db.prepare('INSERT INTO brains (game, name, shape, device, w, steps, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ' +
    'ON CONFLICT(game, name, shape, device) DO UPDATE SET w = excluded.w, steps = excluded.steps, at = excluded.at')
    .bind(game, b.name, b.shape, device, b.w, Math.min(b.steps, 1e9), now).run();
}

/** Everyone's trimmed average for this brain, or null. */
export async function sharedBrain(db, game, name, shape, now = Date.now()) {
  const { results } = await db.prepare('SELECT w FROM brains WHERE game = ?1 AND name = ?2 AND shape = ?3 AND at > ?4 ORDER BY at DESC LIMIT ?5')
    .bind(game, name, shape, now - DAYS * 864e5, USE).all();
  const ws = results.map(r => unpack(r.w)).filter(u => u && u.shape === shape).map(u => u.w);
  if (!ws.length) return null;
  const n = ws[0].length, out = new Float32Array(n), col = new Float32Array(ws.length), cut = Math.floor(ws.length * .2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < ws.length; k++) col[k] = ws[k][i];
    const s = Array.from(col).sort((a, b) => a - b).slice(cut, ws.length - cut);
    out[i] = s.reduce((a, b) => a + b, 0) / s.length;
  }
  return { w: pack(shape, out), from: ws.length };
}

export async function pruneBrains(db, now = Date.now()) {
  await db.prepare('DELETE FROM brains WHERE at < ?1').bind(now - DAYS * 864e5).run();
}
