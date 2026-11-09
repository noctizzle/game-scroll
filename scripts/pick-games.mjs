// Picks the games a PR check plays when shared code changes: from each style (Phone, Pocket, Color,
// Advance, Console, Next Gen, AR) the N games that use the most parts of gs, so engine changes are
// played where they matter without playing every game. Prints the ids, one line.
// Usage: node scripts/pick-games.mjs [N=3]
import { readdirSync, readFileSync } from 'node:fs';
const N = +process.argv[2] || 3, dir = new URL('../src/games/', import.meta.url);
const by = {};
for (const f of readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  const era = (src.match(/\bera:\s*'(\w+)'/) || [])[1] || (/\bretro:\s*true/.test(src) ? 'pocket' : 'phone');
  // Parts used: gs.<part> plus what is pulled out of them (const { Feel } = gs.effects).
  const parts = new Set([...src.matchAll(/\bgs\.(\w+)(?:\.(\w+))?/g)].flatMap(m => m[2] ? [m[1], m[1] + '.' + m[2]] : [m[1]]));
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*gs\.(\w+)/g)) for (const k of m[1].split(',')) { const n = k.trim().split(/[:\s]/)[0]; if (n) parts.add(m[2] + '.' + n); }
  (by[era] ||= []).push({ id: f.slice(0, -3), n: parts.size });
}
const ids = Object.keys(by).sort().flatMap(e => by[e].sort((a, b) => b.n - a.n).slice(0, N).map(g => g.id));
console.log(ids.join(' '));
if (process.argv.includes('--why')) for (const e of Object.keys(by).sort()) console.error(e.padEnd(8), by[e].sort((a, b) => b.n - a.n).slice(0, N).map(g => `${g.id}(${g.n})`).join(' '));
