import { defineConfig, loadEnv } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

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
      return files.map((f, i) => `import g${i} from ${JSON.stringify(resolve(dir, f))};`).join('\n') +
        `\nexport default [${files.map((_, i) => 'g' + i).join(',')}];`;
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

// Relative base so the build works inside the Capacitor webview and on any static host.
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_BUILD__: JSON.stringify(buildLabel()) },
  plugins: [bundledGames(!!loadEnv(mode, process.cwd(), 'VITE_').VITE_GAMES_URL)],
}));
