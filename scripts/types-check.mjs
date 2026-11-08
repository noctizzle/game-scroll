// Checks src/gamescroll.d.ts covers every part of gs and every name in each part, so editors and AI
// tools autocomplete all of it: npm run types-check
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(new URL(import.meta.url).pathname), '..');
globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });

const m = await import(pathToFileURL(join(root, 'src/gamescroll.js')).href);
await m.loadParts();
const gs = m.default, dts = readFileSync(join(root, 'src/gamescroll.d.ts'), 'utf8');

const block = name => {   // the body of `interface <name> {` ... matching `}`
  const at = dts.search(new RegExp(`interface ${name}\\b[^{]*\\{`)); if (at < 0) return null;
  let i = dts.indexOf('{', at), depth = 0; const start = i;
  for (; i < dts.length; i++) { if (dts[i] === '{') depth++; else if (dts[i] === '}' && --depth === 0) break; }
  return dts.slice(start, i);
};
const gsBody = block('GS'), missing = [];
for (const part of Object.keys(gs)) {
  const t = gsBody.match(new RegExp(`\\b${part}\\??:\\s*([^;]+);`));
  if (!t) { missing.push(`gs.${part}`); continue; }
  const v = gs[part]; if (!v || typeof v !== 'object' || part === 'THREE') continue;
  const ty = t[1].trim(), body = ty.startsWith('{') ? ty : block(ty);
  if (body == null) { missing.push(`interface ${ty} (for gs.${part})`); continue; }
  for (const k of Object.keys(v)) if (!new RegExp(`\\b${k}\\b`).test(body)) missing.push(`gs.${part}.${k}`);
}
if (missing.length) { console.error('src/gamescroll.d.ts is missing:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log(`types: all ${Object.keys(gs).length} parts of gs are typed`);
