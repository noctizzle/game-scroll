// Flags game code that reaches outside its own game: the network, saved data, the phone's native
// features (Capacitor), other windows, or tricks that hide what code does. Games get everything they
// need from the shared kit (src/kit/*.js, src/sfx.js ...), which saves progress, plays sound and
// buzzes the phone for them, so a game file never needs any of this.
//
// Used by .github/workflows/game-pr-check.yml on every pull request. A flag doesn't mean the code is
// bad, but a maintainer must read that part before merging.
//
//   node scripts/game-lint.mjs                 checks every game in src/games/
//   node scripts/game-lint.mjs <id or file>... checks just those
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_MODULES } from '../src/game-modules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GAMES = join(ROOT, 'src', 'games');

const RULES = [
  // network
  [/\bfetch\s*\(/, 'network: fetch()'],
  [/\b(XMLHttpRequest|WebSocket|EventSource|WebTransport|RTCPeerConnection|RTCDataChannel)\b/, 'network: $1'],
  [/\bsendBeacon\b/, 'network: navigator.sendBeacon'],
  [/\b(import\s*\(|importScripts)/, 'loads code: dynamic import'],
  [/\b(Worker|SharedWorker)\s*\(|\bserviceWorker\b/, 'background worker'],
  [/\bcreateElement\s*\(\s*['"`](script|iframe|img|link|a|form|object|embed|video|audio|source)['"`]/i, 'creates a <$1> element (can load from the network)'],
  [/\.\s*(src|href|srcset|action|srcObject)\s*=(?!=)|setAttribute\s*\(\s*['"`](src|href|srcset|action)/, 'sets a src/href (can load from the network)'],
  [/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/, 'writes raw HTML ($1)'],
  [/\b((?:window|document)\s*\.\s*location|location\s*\.\s*(?:href|assign|replace|reload)|window\s*\.\s*open)\b/, 'navigation: $1'],
  // saved data and the native bridge
  [/\b(localStorage|sessionStorage|indexedDB|caches|cookieStore)\b/, 'storage: $1 (use the kit\'s progress/store helpers)'],
  [/\bdocument\.cookie\b/, 'storage: document.cookie'],
  [/\bCapacitor\b|@capacitor\//, 'native: Capacitor (use the kit: haptics, sensors, share...)'],
  [/\bnavigator\s*\.\s*geolocation\b|\bGeolocation\b/, 'location: reads it directly (use api.location(), which rounds it and asks at play time)'],
  [/\blocation\s*:\s*['"`]precise['"`]/, "location: 'precise' (about 10 m). Check the game really needs walk-around precision; 'coarse' is enough to seed a level"],
  [/\b(window\.(parent|top|opener)|postMessage|BroadcastChannel)\b/, 'talks to other windows ($1)'],
  // hiding what code does
  [/\beval\s*\(|\bFunction\s*\(|\bconstructor\s*\.\s*constructor\b|\[\s*['"`]constructor['"`]\s*\]/, 'runs code from a string'],
  [/\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/, 'runs code from a string (setTimeout/setInterval)'],
  [/\b(globalThis)\b|\b(?:window|self|document)\s*\[/, 'reaches global objects indirectly ($1)'],
  [/\b(atob|btoa|fromCharCode|fromCodePoint|unescape|decodeURIComponent)\b/, 'decodes hidden strings ($1)'],
  [/\\x[0-9a-f]{2}|\\u\{?[0-9a-f]{4}/i, 'escaped characters in a string (often used to hide code)'],
  [/\b(Reflect|Proxy|__proto__|defineProperty|getOwnPropertyDescriptor)\b/, 'changes how objects work ($1)'],
  [/\bimport\b[^;]*?\bfrom\s*['"`](?!\.\.?\/)/, 'imports a package from outside the app (only ../gamescroll.js is allowed)'],
  [/\bimport\s*['"`](?!\.\.?\/)/, 'imports a package from outside the app'],
  [/\brequire\s*\(/, 'require() (use import from the kit)'],
  [/\b__(gs|hd)\b/, 'uses the app\'s test hooks (__$1)'],
  [/\bdocument\s*\.\s*(querySelector|querySelectorAll|getElementById|getElementsBy\w+|body|documentElement)\b/, 'reaches into the app\'s page (document.$1)'],
];

// Blank out comments but keep line numbers, so a comment like "// no fetch here" isn't flagged.
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:\\'"`])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

export function lint(file) {
  const src = stripComments(readFileSync(file, 'utf8')), out = [];
  src.split('\n').forEach((line, i) => {
    for (const [re, why] of RULES) {
      const m = line.match(re);
      if (m) out.push({ line: i + 1, why: why.replace('$1', m[1] || m[0]), code: line.trim().slice(0, 120) });
    }
  });
  // Shared modules: only the ones games are given (src/game-modules.js), without their hidden exports.
  const SRC = join(ROOT, 'src');
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\bimport\s*(?:\{([^}]*)\}|\*\s*as\s+\w+|\w+)?\s*(?:from\s*)?['"`](\.\.?\/[^'"`]+)['"`]/g)) {
      const abs = resolve(dirname(file), m[2]);
      if (!abs.startsWith(SRC) || abs.startsWith(GAMES)) continue;
      const key = abs.slice(SRC.length + 1).split('\\').join('/');
      if (!GAME_MODULES.includes(key)) { out.push({ line: i + 1, why: `imports src/${key}, which is app-only (games may import: ${GAME_MODULES.join(', ')})`, code: line.trim().slice(0, 120) }); continue; }
      if (!/^\s*import\s+gs\s+from\b/.test(line)) out.push({ line: i + 1, why: `import gs from '../gamescroll.js' (games use everything through gs)`, code: line.trim().slice(0, 120) });
    }
  });
  return out;
}

const args = process.argv.slice(2);
const files = args.length
  ? args.map(a => a.endsWith('.js') ? resolve(a) : join(GAMES, a + '.js'))
  : readdirSync(GAMES).filter(f => f.endsWith('.js')).sort().map(f => join(GAMES, f));

let flagged = 0;
for (const f of files) {
  const hits = lint(f), rel = 'src/games/' + basename(f);
  for (const h of hits) {
    flagged++;
    console.log(`${rel}:${h.line}  ${h.why}\n    ${h.code}`);
    // GitHub shows these on the pull request's Files tab, next to the line.
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${rel},line=${h.line}::${h.why}. Games must not touch the network, storage or native features directly; a maintainer has to review this line.`);
  }
}
console.log(`${files.length} game file(s) checked, ${flagged} line(s) flagged`);
process.exit(flagged ? 1 : 0);
