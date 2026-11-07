import { defineConfig } from 'vite';
import { buildGames } from './scripts/build-games.mjs';

// virtual:game-hashes = { gameId: hash } for the games built into this app, made the same way as the
// files published to the game host (scripts/build-games.mjs). src/remote.js compares them with the
// online catalogue and only downloads a game whose code is different.
function gameHashes() {
  const ID = 'virtual:game-hashes', RID = '\0' + ID;
  return {
    name: 'game-hashes',
    resolveId: id => id === ID ? RID : null,
    async load(id) {
      if (id !== RID) return null;
      const games = await buildGames();
      return 'export default ' + JSON.stringify(Object.fromEntries(games.map(g => [g.id, g.hash])));
    },
  };
}

// Relative base so the build works inside the Capacitor webview and on any static host.
export default defineConfig({ base: './', plugins: [gameHashes()] });
