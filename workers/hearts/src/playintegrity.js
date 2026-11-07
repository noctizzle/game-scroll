// Google Play Integrity (Android): proves a request comes from the real Game Scroll app,
// installed from Google Play, on a genuine Android device.
//
// The app asks Google for an integrity token with our challenge as the nonce. The Worker sends the
// token to Google's decode API (signed in as a service account) and checks the verdict.
//
// Needs GOOGLE_SERVICE_ACCOUNT: the JSON key of a Google Cloud service account in the Cloud project
// linked to the app in Play Console (App integrity), with the Play Integrity API enabled.
import { b64u, enc, unb64 } from './util.js';

export const PACKAGE = 'com.gamescroll.app';
const fail = msg => { const e = new Error(msg); e.attest = true; throw e; };

let cachedToken = null;
async function accessToken(saJson, fetchFn) {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  let sa;
  try { sa = JSON.parse(saJson); } catch (_) { fail('GOOGLE_SERVICE_ACCOUNT is not valid JSON'); }
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64u(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/playintegrity',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })));
  const pem = String(sa.private_key || '').replace(/-----[^-]+-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', unb64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claims)));
  const r = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claims + '.' + b64u(sig),
  });
  if (!r.ok) fail('Google sign-in failed (' + r.status + ')');
  const t = await r.json();
  cachedToken = { value: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

/**
 * Decode and check an integrity token. Returns the verdict summary on success.
 * opts: { saJson, token, challenge, allowSideloaded?, fetchFn?, now? }
 * allowSideloaded accepts a genuine device even when the app wasn't installed from Play
 * (for testing debug APKs); keep it off once the app is on the Play Store.
 */
export async function verifyIntegrity({ saJson, token, challenge, allowSideloaded = false, fetchFn = fetch, now = Date.now() }) {
  if (!saJson) fail('Play Integrity is not set up (GOOGLE_SERVICE_ACCOUNT)');
  if (typeof token !== 'string' || token.length > 8000) fail('bad token');
  const at = await accessToken(saJson, fetchFn);
  const r = await fetchFn(`https://playintegrity.googleapis.com/v1/${PACKAGE}:decodeIntegrityToken`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrity_token: token }),
  });
  if (!r.ok) fail('Google could not decode the token (' + r.status + ')');
  const p = (await r.json()).tokenPayloadExternal || {};
  const req = p.requestDetails || {}, app = p.appIntegrity || {}, dev = p.deviceIntegrity || {};
  if (req.requestPackageName !== PACKAGE) fail('wrong package');
  if (req.nonce !== challenge) fail('nonce mismatch');
  if (Math.abs(now - Number(req.timestampMillis || 0)) > 10 * 60 * 1000) fail('token too old');
  const verdicts = dev.deviceRecognitionVerdict || [];
  if (!verdicts.includes('MEETS_DEVICE_INTEGRITY') && !verdicts.includes('MEETS_STRONG_INTEGRITY')) fail('device failed integrity');
  const recognized = app.appRecognitionVerdict === 'PLAY_RECOGNIZED';
  if (!recognized && !(allowSideloaded && app.appRecognitionVerdict === 'UNRECOGNIZED_VERSION')) fail('app not recognized: ' + app.appRecognitionVerdict);
  if (recognized && app.packageName !== PACKAGE) fail('wrong package');
  return { app: app.appRecognitionVerdict, device: verdicts };
}

// For tests: forget the cached Google access token.
export const _reset = () => { cachedToken = null; };
