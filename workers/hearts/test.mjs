// Runs the hearts Worker locally (wrangler dev, local D1) and checks the API end to end.
//   cd workers/hearts && npx wrangler d1 migrations apply game-scroll-hearts --local && npm test
import { unstable_startWorker } from 'wrangler';
import assert from 'node:assert/strict';

const w = await unstable_startWorker({ config: 'wrangler.toml', dev: { remote: false, server: { port: 0 } } });
const url = (await w.url).toString().replace(/\/$/, '');
const post = body => fetch(url + '/heart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const A = 'test-device-aaaaaaaaaaaa', B = 'test-device-bbbbbbbbbbbb', game = 'test-game-' + Date.now();
try {
  let r = await post({ device: A, game, on: true }); assert.equal(r.status, 200); assert.equal((await r.json()).n, 1);
  r = await post({ device: A, game, on: true }); assert.equal((await r.json()).n, 1, 'same device twice counts once');
  r = await post({ device: B, game, on: true }); assert.equal((await r.json()).n, 2);
  r = await post({ device: A, game, on: false }); assert.equal((await r.json()).n, 1, 'un-heart takes it back');
  r = await post({ device: 'short', game, on: true }); assert.equal(r.status, 400);
  r = await post({ device: A, game: 'Bad Id!', on: true }); assert.equal(r.status, 400);
  r = await fetch(url + '/counts'); assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const c = await r.json(); assert.equal(c.counts[game], 1);
  r = await fetch(url + '/heart', { method: 'OPTIONS' }); assert.equal(r.status, 204);
  console.log('hearts worker: all checks passed');
} finally {
  await w.dispose();
}
