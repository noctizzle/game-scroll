// Small helpers shared by the Worker modules: base64url, bytes, hashing, HMAC, a minimal CBOR decoder.

export const enc = new TextEncoder();

export function b64u(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

export const equal = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};

export const sha256 = async data => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));

const hmacKeys = new Map();
export async function hmac(secret, data) {
  let k = hmacKeys.get(secret);
  if (!k) {
    k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    hmacKeys.set(secret, k);
  }
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? enc.encode(data) : data));
}

/** Decode one CBOR item (the subset App Attest uses: ints, byte/text strings, arrays, maps). */
export function cbor(bytes) {
  let i = 0;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = info => {
    if (info < 24) return info;
    if (info === 24) return bytes[i++];
    if (info === 25) { const n = v.getUint16(i); i += 2; return n; }
    if (info === 26) { const n = v.getUint32(i); i += 4; return n; }
    if (info === 27) { const n = Number(v.getBigUint64(i)); i += 8; return n; }
    throw new Error('cbor: unsupported length');
  };
  const item = (depth = 0) => {
    if (depth > 16 || i >= bytes.length) throw new Error('cbor: bad input');
    const b = bytes[i++], major = b >> 5, info = b & 31;
    switch (major) {
      case 0: return len(info);
      case 1: return -1 - len(info);
      case 2: { const n = len(info); if (i + n > bytes.length) throw new Error('cbor: short'); const s = bytes.slice(i, i + n); i += n; return s; }
      case 3: { const n = len(info); if (i + n > bytes.length) throw new Error('cbor: short'); const s = new TextDecoder().decode(bytes.subarray(i, i + n)); i += n; return s; }
      case 4: { const n = len(info); const a = []; for (let k = 0; k < n; k++) a.push(item(depth + 1)); return a; }
      case 5: { const n = len(info); const m = {}; for (let k = 0; k < n; k++) { const key = item(depth + 1); m[key] = item(depth + 1); } return m; }
      case 7: if (info === 20) return false; if (info === 21) return true; if (info === 22) return null;
      // fallthrough
      default: throw new Error('cbor: unsupported type');
    }
  };
  return item();
}
