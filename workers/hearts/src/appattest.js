// Apple App Attest (iOS): proves a request comes from the real Game Scroll app on a real iPhone.
// Follows Apple's "Validating apps that connect to your server" steps.
//
// 1. First launch: the app makes a key in the Secure Enclave and gets Apple to attest it.
//    attest() checks Apple's certificate chain and the challenge, then stores the public key.
// 2. Each new pass after that: the app signs the challenge with the same key (an "assertion").
//    assert() checks the signature with the stored key and that the counter went up.
//
// Needs APPLE_APP_ID = "<Team ID>.com.gamescroll.app" (from the paid Apple Developer account).
import 'reflect-metadata';   // needed by @peculiar/x509
import { X509Certificate, cryptoProvider } from '@peculiar/x509';
import { cbor, concat, equal, sha256, unb64, enc } from './util.js';

cryptoProvider.set(crypto);

// Apple App Attestation Root CA (valid 2020-03-18 to 2045-03-15).
// SHA-256 fingerprint 1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32
// (CI re-downloads it from apple.com/certificateauthority and checks it matches: see test.mjs).
export const APPLE_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;

const NONCE_OID = '1.2.840.113635.100.8.2';
const AAGUID_PROD = concat(enc.encode('appattest'), new Uint8Array(7));
const AAGUID_DEV = enc.encode('appattestdevelop');

const fail = msg => { const e = new Error(msg); e.attest = true; throw e; };

/** Parse authenticator data: rpIdHash, counter, and (for attestations) aaguid + credential id. */
function authData(a, withCred) {
  if (!(a instanceof Uint8Array) || a.length < 37) fail('authData too short');
  const out = { rpIdHash: a.subarray(0, 32), counter: new DataView(a.buffer, a.byteOffset + 33, 4).getUint32(0) };
  if (withCred) {
    if (a.length < 55) fail('authData has no credential');
    out.aaguid = a.subarray(37, 53);
    const n = new DataView(a.buffer, a.byteOffset + 53, 2).getUint16(0);
    out.credId = a.subarray(55, 55 + n);
  }
  return out;
}

/** ECDSA DER signature -> raw r||s (64 bytes) for WebCrypto. */
function derToRaw(der) {
  let i = 0;
  if (der[i++] !== 0x30) fail('bad signature');
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f); else i++;
  const int = () => {
    if (der[i++] !== 0x02) fail('bad signature');
    const n = der[i++]; let v = der.subarray(i, i + n); i += n;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    if (v.length > 32) fail('bad signature');
    return concat(new Uint8Array(32 - v.length), v);
  };
  return concat(int(), int());
}

/**
 * Check a first-time attestation. Returns { publicKey (SPKI bytes), counter, env } to store.
 * opts: { appId, keyId (base64), attestation (base64), challenge, rootPem?, now? }
 */
export async function verifyAttestation({ appId, keyId, attestation, challenge, rootPem = APPLE_ROOT_PEM, now = new Date() }) {
  if (!appId) fail('App Attest is not set up (APPLE_APP_ID)');
  const obj = cbor(unb64(attestation));
  if (obj.fmt !== 'apple-appattest' || !obj.attStmt || !Array.isArray(obj.attStmt.x5c) || obj.attStmt.x5c.length < 2) fail('not an App Attest object');
  const [leaf, inter] = obj.attStmt.x5c.map(d => new X509Certificate(d));
  const root = new X509Certificate(rootPem);

  // 1. Certificate chain: leaf <- intermediate <- Apple root, all currently valid.
  if (!(await inter.verify({ publicKey: root, date: now }))) fail('intermediate not signed by Apple');
  if (!(await leaf.verify({ publicKey: inter, date: now }))) fail('leaf not signed by intermediate');

  // 2-4. nonce = SHA256(authData || SHA256(challenge)) must be in the leaf's Apple extension.
  const clientDataHash = await sha256(challenge);
  const nonce = await sha256(concat(obj.authData, clientDataHash));
  const ext = leaf.getExtension(NONCE_OID);
  if (!ext) fail('no nonce extension');
  const extVal = new Uint8Array(ext.value);
  if (!equal(extVal.subarray(extVal.length - 32), nonce)) fail('nonce mismatch');

  // 5. The key id is the SHA256 of the leaf's public key (uncompressed EC point).
  const spki = new Uint8Array(leaf.publicKey.rawData);
  const point = spki.subarray(spki.length - 65);
  const kid = unb64(keyId);
  if (!equal(await sha256(point), kid)) fail('key id mismatch');

  // 6-9. authData: our app id, counter 0, App Attest environment, credential id = key id.
  const ad = authData(obj.authData, true);
  if (!equal(ad.rpIdHash, await sha256(appId))) fail('wrong app');
  if (ad.counter !== 0) fail('counter not zero');
  const env = equal(ad.aaguid, AAGUID_PROD) ? 'production' : equal(ad.aaguid, AAGUID_DEV) ? 'development' : fail('bad aaguid');
  if (!equal(ad.credId, kid)) fail('credential id mismatch');

  return { publicKey: spki, counter: 0, env };
}

/**
 * Check an assertion made with a stored key. Returns the new counter to store.
 * opts: { appId, publicKey (SPKI bytes), lastCounter, assertion (base64), challenge }
 */
export async function verifyAssertion({ appId, publicKey, lastCounter, assertion, challenge }) {
  if (!appId) fail('App Attest is not set up (APPLE_APP_ID)');
  const obj = cbor(unb64(assertion));
  if (!(obj.signature instanceof Uint8Array) || !(obj.authenticatorData instanceof Uint8Array)) fail('not an assertion');
  const nonce = await sha256(concat(obj.authenticatorData, await sha256(challenge)));
  const key = await crypto.subtle.importKey('spki', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(obj.signature), nonce))) fail('bad signature');
  const ad = authData(obj.authenticatorData, false);
  if (!equal(ad.rpIdHash, await sha256(appId))) fail('wrong app');
  if (ad.counter <= lastCounter) fail('counter did not increase');
  return ad.counter;
}

