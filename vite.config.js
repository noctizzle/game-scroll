import { defineConfig, loadEnv } from 'vite';
import { readdirSync, readFileSync, existsSync, createReadStream, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { gsNeeds, sensorsOf } from './src/game-modules.js';

// virtual:bundled-games = the game modules built into the app.
// The real app streams every game from the game host (VITE_GAMES_URL in .env), so this is empty.
// Local dev and the test scripts run with --mode bundled (.env.bundled leaves VITE_GAMES_URL empty),
// and then every file in src/games/ is built in, so new games can be tried before they're published.
function bundledGames(streamed) {
  const ID = 'virtual:bundled-games', RID = '\0' + ID, dir = resolve('src/games');
  return {
    name: 'bundled-games',
    resolveId: id => id === ID ? RID : null,
    load(id) {
      if (id !== RID) return null;
      if (streamed) return 'export default [];';
      const files = readdirSync(dir).filter(f => f.endsWith('.js')).sort();
      // gs's 3D and AI parts load on demand, so load them all before the games run (dev and tests only)
      // and add the sensors each one uses (worked out from its code, as the streamed build does)
      const uses = files.map(f => sensorsOf(gsNeeds(readFileSync(resolve(dir, f), 'utf8'))));
      return `import { loadParts } from ${JSON.stringify(resolve('src/gamescroll.js'))};\nawait loadParts();\n` +
        `const mods = await Promise.all([${files.map(f => `import(${JSON.stringify(resolve(dir, f))})`).join(',')}]);\n` +
        `const uses = ${JSON.stringify(uses)};\n` +
        'export default mods.map((m, i) => { const d = m.default; if (d && uses[i].length && !d.uses) { try { d.uses = uses[i]; } catch (_) {} } return d; });';
    },
  };
}

// EZ-Tree (gs.models.tree) from its source, with its bark and leaf picture files swapped for ours drawn
// in code (src/kit/models/tree-textures.js): the app ships no image files, and its built copy carries
// 4 MB of them. 'ez-tree/lib' is its src/lib (the package only exports the built copy).
export function ezTreeInCode() {
  const lib = resolve('node_modules/@dgreenheck/ez-tree/src/lib');
  return {
    name: 'ez-tree-in-code', enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'ez-tree/lib') return resolve(lib, 'index.js');
      if (importer && importer.replace(/\\/g, '/').includes('@dgreenheck/ez-tree/src/lib') && /(^|\/)textures(\.js)?$/.test(id)) return resolve('src/kit/models/tree-textures.js');
      return null;
    },
  };
}

// Hot reload for game makers (npm run dev): saving a file in src/games/ swaps that game in place, on
// the same card, instead of reloading the whole app (src/main.js hotSwap). Kit and app files still
// reload the page as usual.
function hotGames() {
  const GAME = /[\\/]src[\\/]games[\\/]([a-z0-9-]+)\.js$/;
  return {
    name: 'hot-games',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      const m = GAME.exec(file);
      if (!m) return;
      server.ws.send({ type: 'custom', event: 'gs:game', data: { id: m[1], url: `/src/games/${m[1]}.js` } });
      return [];
    },
  };
}

// Build label for crash and stutter reports (src/perf.js): CI run number (the Android
// versionName is 1.0.<run>) plus the commit, e.g. "1.0.57 a1b2c3d".
function buildLabel() {
  let sha = '';
  try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) {}
  const run = process.env.GITHUB_RUN_NUMBER;
  return [run ? '1.0.' + run : 'local', sha].filter(Boolean).join(' ');
}

// Content Security Policy for the built app: the app, and every game running inside it, can only talk
// to the games host and our API. A game can't send anything to another server, load scripts from
// elsewhere or open frames. 'unsafe-eval' is needed because streamed games run via new Function
// (src/remote.js). Build only: the dev server needs its own websocket for live reload.
function csp(env) {
  const origin = u => { try { return new URL(u).origin; } catch (_) { return ''; } };
  const hosts = [env.VITE_GAMES_URL, env.VITE_HEARTS_URL].map(origin).filter(Boolean);
  // 'self' is the app itself: capacitor://localhost on iOS, https://localhost on Android.
  const self = "'self' capacitor://localhost";
  const policy = [
    `default-src ${self}`,
    `script-src ${self} 'unsafe-eval'`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self} data:`,
    `media-src ${self} data: blob: mediastream:`,
    `connect-src ${[self, ...hosts].join(' ')}`,
    `worker-src ${self} blob:`,
    "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

// Face and hand tracking and sound files (gs.vision, gs.hear). The real app downloads them from the
// games host; dev and test builds without one serve ml-cache/ (filled by npm run ml) and ml-models/
// (the AI chip's models, kept in the repo) at ml/.
function mlFiles(streamed) {
  const dirs = [resolve('ml-cache'), resolve('ml-models')];
  return {
    name: 'ml-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/ml\/([\w.-]+)\/([\w.-]+)$/.exec((req.url || '').split('?')[0]);
        const f = m && dirs.map(d => resolve(d, m[1], m[2])).find(existsSync);
        if (!f) return next();
        res.setHeader('Content-Type', f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
        createReadStream(f).pipe(res);
      });
    },
    closeBundle() { if (!streamed) for (const d of dirs) if (existsSync(d)) cpSync(d, resolve('dist/ml'), { recursive: true }); },
  };
}

// Relative base so the build works inside the Capacitor webview and on any static host.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    define: { __APP_BUILD__: JSON.stringify(buildLabel()) },
    plugins: [ezTreeInCode(), bundledGames(!!env.VITE_GAMES_URL), hotGames(), mlFiles(!!env.VITE_GAMES_URL), csp(env)],
  };
});
