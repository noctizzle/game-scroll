// Builds the website at game-scroll.com (landing page, maker guide, privacy, support) into dist-site/.
//
//   node scripts/build-site.mjs        (or: npm run site)
//
// site/ holds the hand-written pages. This script copies them, fills in the {{...}} placeholders
// (game count read from src/games, store buttons, year), and copies the app icons and fonts.
// Deployed by .github/workflows/site.yml (a Cloudflare Worker serving static files, workers/site).
//
// Store links: fill these in once the app is live; while empty the buttons say "Coming soon".
const APP_STORE_URL = '';   // e.g. https://apps.apple.com/app/id0000000000
const PLAY_STORE_URL = '';  // e.g. https://play.google.com/store/apps/details?id=com.game_scroll.app

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGames } from './build-games.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site'), OUT = join(ROOT, 'dist-site');

const styleOf = m => !m.retro ? 'casual' : (m.era || 'pocket');
const games = (await buildGames({ withMeta: true }))
  .map(({ meta: m }) => ({ id: m.id, title: m.title, tag: m.tag, hint: m.hint, style: styleOf(m), ...(m.by ? { by: m.by } : {}) }))
  .filter(g => g.title)
  .sort((a, b) => a.title.localeCompare(b.title));

rmSync(OUT, { recursive: true, force: true });
cpSync(SITE, OUT, { recursive: true });
cpSync(join(ROOT, 'public/icons'), join(OUT, 'icons'), { recursive: true });
cpSync(join(ROOT, 'docs/contributing'), join(OUT, 'img/make'), { recursive: true });   // pictures in the maker guide
mkdirSync(join(OUT, 'assets/fonts'), { recursive: true });
const font = (pkg, file, name) => cpSync(join(ROOT, 'node_modules/@fontsource', pkg, 'files', file), join(OUT, 'assets/fonts', name));
for (const w of [400, 500, 700, 800]) font('rubik', `rubik-latin-${w}-normal.woff2`, `rubik-${w}.woff2`);
font('press-start-2p', 'press-start-2p-latin-400-normal.woff2', 'press-start-2p-400.woff2');

const apple = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.3 0 1.7-.8 3.3-.8 1.5 0 1.9.8 3.3.8 1.4 0 2.2-1.2 3-2.4 1-1.4 1.4-2.7 1.4-2.8-.1 0-2.7-1-2.7-4.1zM14 5.1c.7-.8 1.1-1.9 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/></svg>';
const play = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.2 2.4c-.3.3-.4.7-.4 1.2v16.8c0 .5.1.9.4 1.2l9.4-9.6-9.4-9.6zm10.6 10.8 2.6 2.6-11 6.3 8.4-8.9zm0-2.4L6.4 1.9l11 6.3-2.6 2.6zm3.9-1.8 3 1.7c.9.5.9 1.4 0 1.9l-3 1.7-2.8-2.7 2.8-2.6z"/></svg>';
const button = (url, icon, store, ghost) => url
  ? `<a class="btn${ghost ? ' ghost' : ''}" href="${url}">${icon}<span class="two"><small>Download on</small>${store}</span></a>`
  : `<span class="btn${ghost ? ' ghost' : ''}" aria-disabled="true">${icon}<span class="two"><small>Coming soon to</small>${store}</span></span>`;
const fill = {
  GAMES: String(games.length),
  YEAR: String(new Date().getFullYear()),
  STORE_BUTTONS: button(APP_STORE_URL, apple, 'App Store') + button(PLAY_STORE_URL, play, 'Google Play', true),
  REEL: [1, 2, 3, 4, 5, 6, 1].map((n, i) => `<img src="/img/feed-${n}.jpg" alt="" width="390" height="844"${i ? ' loading="lazy"' : ''}>`).join(''),
};

(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) writeFileSync(p, readFileSync(p, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => fill[k] ?? m));
  }
})(OUT);

console.log(`site built: ${games.length} games -> dist-site/`);
