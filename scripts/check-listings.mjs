// Checks the store listing texts in store/*.md fit the App Store and Google Play limits.
//   node scripts/check-listings.mjs
// A field is the text between <!-- field:name --> and <!-- /field -->.
import { readFileSync } from 'node:fs';

const LIMITS = {
  'store/app-store.md': { promo: 170, description: 4000, keywords: 100, whatsnew: 4000 },
  'store/play-store.md': { short: 80, full: 4000, notes: 500 },
};
let bad = 0;
for (const [file, limits] of Object.entries(LIMITS)) {
  const md = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const [name, max] of Object.entries(limits)) {
    const m = md.match(new RegExp(`<!-- field:${name} -->\\n([\\s\\S]*?)\\n<!-- /field -->`));
    if (!m) { console.log(`MISSING ${file} ${name}`); bad++; continue; }
    const len = [...m[1]].length, ok = len <= max;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'LONG'} ${file.padEnd(20)} ${name.padEnd(12)} ${len}/${max}`);
    if (name === 'keywords' && /,\s/.test(m[1])) { console.log('     keywords: no spaces after commas'); bad++; }
  }
}
process.exit(bad ? 1 : 0);
