// Checks that Settings › Licence › Open-source parts (src/licences.js) lists every package the app
// ships: each entry in package.json "dependencies" (the app's own file: plugins aside) must be in
// OPEN_SOURCE, with the licence its installed package.json gives, and nothing listed may be stale.
//   npm run licences          (needs npm install first)
// Runs in the Game PR check, so a pull request that adds a dependency fails until it's listed.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPEN_SOURCE } from '../src/licences.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const deps = Object.entries(pkg.dependencies || {}).filter(([, v]) => !String(v).startsWith('file:')).map(([k]) => k);
const listed = new Map(OPEN_SOURCE.flatMap(e => e.packages.map(p => [p, e])));
const bad = [];

for (const d of deps) {
  const e = listed.get(d);
  if (!e) { bad.push(`${d} is a dependency but isn't in src/licences.js: add it so it shows under Settings › Licence`); continue; }
  const f = join(ROOT, 'node_modules', d, 'package.json');
  if (!existsSync(f)) { bad.push(`${d} isn't installed: run npm install first`); continue; }
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const lic = typeof j.license === 'string' ? j.license : j.license?.type || (j.licenses || []).map(l => l.type || l).join(' OR ');
  if (lic !== e.spdx) bad.push(`${d}: its package says "${lic || 'no licence'}" but src/licences.js says "${e.spdx}" (${e.name})`);
}
for (const p of listed.keys())
  if (!deps.includes(p)) bad.push(`${p} is in src/licences.js but isn't a dependency any more: remove it`);
for (const e of OPEN_SOURCE)
  if (!e.name || !e.licence || !e.spdx || !e.packages?.length) bad.push(`src/licences.js: "${e.name || '?'}" needs name, licence, spdx and packages`);

if (bad.length) { console.error('Open-source list is out of date:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`Open-source list OK: ${deps.length} packages in ${OPEN_SOURCE.length} entries.`);
