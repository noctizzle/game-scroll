// Challenges and passes ("sessions"), both stateless and signed with SESSION_SECRET.
//
// challenge: 16 random bytes + 8-byte expiry + HMAC, base64url (no dots, so it can be a Play
//            Integrity nonce as-is). Valid 5 minutes.
// session:   base64url(JSON {d: device, p: platform, e: expiry}) + "." + HMAC. Valid 24 hours.
import { b64u, unb64, concat, equal, hmac, enc } from './util.js';

const CHALLENGE_MS = 5 * 60 * 1000;
export const SESSION_MS = 24 * 60 * 60 * 1000;

const u64 = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; };

export async function newChallenge(secret, now = Date.now()) {
  const body = concat(crypto.getRandomValues(new Uint8Array(16)), u64(now + CHALLENGE_MS));
  return b64u(concat(body, await hmac(secret, concat(enc.encode('c:'), body))));
}

export async function checkChallenge(secret, challenge, now = Date.now()) {
  let raw;
  try { raw = unb64(challenge); } catch (_) { return false; }
  if (raw.length !== 56) return false;
  const body = raw.subarray(0, 24), mac = raw.subarray(24);
  if (!equal(mac, await hmac(secret, concat(enc.encode('c:'), body)))) return false;
  return Number(new DataView(body.buffer, body.byteOffset + 16, 8).getBigUint64(0)) > now;
}

/** When a (genuine) challenge expires, in ms. */
export function challengeExpiry(challenge) {
  const raw = unb64(challenge);
  return Number(new DataView(raw.buffer, raw.byteOffset + 16, 8).getBigUint64(0));
}

export async function newSession(secret, device, platform, now = Date.now()) {
  const body = b64u(enc.encode(JSON.stringify({ d: device, p: platform, e: now + SESSION_MS })));
  return { token: body + '.' + b64u(await hmac(secret, 's:' + body)), expires: now + SESSION_MS };
}

/** The session's {d, p, e} if the token is genuine and not expired, else null. */
export async function readSession(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  try {
    if (!equal(unb64(mac), await hmac(secret, 's:' + body))) return null;
    const s = JSON.parse(new TextDecoder().decode(unb64(body)));
    return s && s.e > now ? s : null;
  } catch (_) { return null; }
}
