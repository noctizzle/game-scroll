// Signs the game catalogue, so the app only runs games that came from this repo's own build.
//
// The games host (Cloudflare R2) is just storage. If someone ever got write access to it, they could
// swap a game file and its hash in manifest.json together. A signature stops that: the private key
// lives only in the GitHub secret CATALOGUE_SIGNING_KEY, and the app has the matching public key
// built in (VITE_CATALOGUE_KEY in .env), so a catalogue nobody signed with the secret is rejected.
//
//   node scripts/sign-catalogue.mjs dist-games   reads dist-games/manifest.json, writes dist-games/catalogue.json
//                                                (key from the CATALOGUE_SIGNING_KEY environment variable)
//   node scripts/sign-catalogue.mjs --new-key    makes a key pair: the private key goes to the file
//                                                catalogue-signing-key.pem (never commit it; it's in
//                                                .gitignore) and the public key is printed for .env
//
// catalogue.json = { v: 2, data: "<manifest.json text, exactly>", sig: "<base64 ECDSA P-256 / SHA-256>" }
// ECDSA P-256 (not Ed25519) because every WebView with WebCrypto can check it, including older iPhones.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (process.argv[2] === '--new-key') {
  const out = resolve('catalogue-signing-key.pem');
  if (existsSync(out)) { console.error(`${out} already exists. Move it away first if you really want a new key.`); process.exit(1); }
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Private key saved to ${out}`);
  console.log('Paste that whole file into the GitHub secret CATALOGUE_SIGNING_KEY, then delete the file.\n');
  console.log('Public key (safe to share; it goes in .env):');
  console.log('VITE_CATALOGUE_KEY=' + publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
  process.exit(0);
}

const dir = resolve(process.argv[2] || 'dist-games');
const pem = process.env.CATALOGUE_SIGNING_KEY;
if (!pem) { console.error('CATALOGUE_SIGNING_KEY is not set'); process.exit(1); }
const key = createPrivateKey(pem.includes('BEGIN') ? pem : `-----BEGIN PRIVATE KEY-----\n${pem.trim()}\n-----END PRIVATE KEY-----\n`);

const data = readFileSync(join(dir, 'manifest.json'), 'utf8');
const m = JSON.parse(data);
if (m.v !== 1 || !Array.isArray(m.games) || m.games.some(g => !/^[0-9a-f]{64}$/.test(g.sha256 || '')))
  throw new Error('manifest.json is missing the full sha256 of a game; rebuild it with scripts/build-games.mjs');

const sig = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
// Check it the same way the app will, with the public half of the key.
if (!verify('sha256', Buffer.from(data), { key: createPublicKey(key), dsaEncoding: 'ieee-p1363' }, sig)) throw new Error('signature check failed');
writeFileSync(join(dir, 'catalogue.json'), JSON.stringify({ v: 2, data, sig: sig.toString('base64') }));
const pub = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64');
// CI passes the app's public key (from .env): a key mix-up would make every phone reject the catalogue.
if (process.env.EXPECT_PUBKEY && process.env.EXPECT_PUBKEY.trim() !== pub)
  throw new Error('CATALOGUE_SIGNING_KEY does not match VITE_CATALOGUE_KEY in .env; phones would reject this catalogue');
console.log(`Signed ${m.games.length} games -> ${join(dir, 'catalogue.json')} (public key ${pub.slice(-16)})`);
