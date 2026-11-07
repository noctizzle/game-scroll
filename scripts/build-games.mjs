// Builds every game in src/games/ as its own small, stand-alone file that the app can download
// and run, so games can be added or fixed without shipping a new app.
//
// Each game is bundled with rolldown into CommonJS. Imports of the app's shared code (src/util.js,
// src/sfx.js, src/kit/*.js ...) are left out and become require('gs:<path>'), which the app
// answers with its own copy (src/remote.js). Sound, haptics and the wallet are shared state, so a
// downloaded game must use the app's instances, not its own.
//
// Output (CLI):  node scripts/build-games.mjs [outDir=dist-games]
//   <outDir>/manifest.json            catalogue: id, file, hash, the shared exports each game needs, and its metadata
//   <outDir>/games/<id>.<hash>.js     one file per game; the name changes whenever the code does
//
// vite.config.js calls buildGames() too, so the app knows the hash of the copy it ships with and
// only downloads a game when the published one differs.
import { rolldown } from 'rolldown';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GAME_MODULES, HIDDEN, API_FEATURES } from '../src/game-modules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src'), GAMES = join(SRC, 'games');
const posix = p => p.split(sep).join('/');

// Shared app module? Anything under src/ that is not a game file.
function kitKey(abs) {
  if (!abs.startsWith(SRC + sep) || abs.startsWith(GAMES + sep)) return null;
  return posix(relative(SRC, abs));
}

async function buildOne(file) {
  const needs = {};
  const bundle = await rolldown({
    input: join(GAMES, file),
    logLevel: 'silent',
    plugins: [{
      name: 'gs-kit',
      resolveId(src, importer) {
        if (!importer || !src.startsWith('.')) return null;
        const key = kitKey(resolve(dirname(importer), src));
        if (key && !GAME_MODULES.includes(key)) throw new Error(`src/games/${file} imports src/${key}, which games may not use (allowed: ${GAME_MODULES.join(', ')})`);
        return key ? { id: 'gs:' + key, external: true } : null;
      },
    }],
  });
  const { output } = await bundle.generate({ format: 'cjs', exports: 'named', minify: true });
  await bundle.close();
  const chunk = output.find(o => o.type === 'chunk');
  // Which shared exports the game uses, read from its own import lines, so an older app can tell a
  // game that needs newer shared code and keep its bundled copy instead.
  const src = readFileSync(join(GAMES, file), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const key = kitKey(resolve(GAMES, m[2]));
    if (!key) continue;
    const names = m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    const hidden = names.filter(n => (HIDDEN[key] || []).includes(n));
    if (hidden.length) throw new Error(`src/games/${file} imports ${hidden.join(', ')} from src/${key}, which games may not use (save with api.save / api.load instead)`);
    needs[key] = [...new Set([...(needs[key] || []), ...names])].sort();
  }
  // Newer api features (api.save ...): older apps without them skip the game instead of crashing.
  const feats = API_FEATURES.filter(f => new RegExp(`\\bapi\\s*\\.\\s*${f}\\b`).test(src));
  if (feats.length) needs['@api'] = feats;
  return { code: chunk.code, needs };
}

// Everything in a game definition except functions (make, etc.) is plain data the feed needs
// before the game's code is downloaded: title, hint, era, sizes, shop, trophies...
function metaOf(def) {
  return JSON.parse(JSON.stringify(def, (k, v) => typeof v === 'function' ? undefined : v));
}

let shimmed = false;
async function readMeta(file) {
  if (!shimmed) {   // game modules only touch the browser inside make(), but kit modules may peek at window on import
    shimmed = true;
    globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {};
    globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
    globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  }
  try { return metaOf((await import(pathToFileURL(join(GAMES, file)).href)).default || {}); }
  catch { return null; }
}

/** Build all games. withMeta reads each game's definition (slower, needs a node-friendly import). */
export async function buildGames({ withMeta = false } = {}) {
  const files = readdirSync(GAMES).filter(f => f.endsWith('.js')).sort();
  const games = [];
  for (const file of files) {
    const id = file.replace(/\.js$/, '');
    const { code, needs } = await buildOne(file);
    const sha256 = createHash('sha256').update(code).digest('hex'), hash = sha256.slice(0, 12);
    // hash (short) names the file; sha256 (full) is what the app checks, via the signed catalogue.
    const g = { id, hash, sha256, file: `games/${id}.${hash}.js`, bytes: Buffer.byteLength(code), needs, code };
    if (withMeta) {
      const meta = await readMeta(file);
      if (!meta || !meta.id) continue;        // helper files that are not games
      if (meta.id !== id) throw new Error(`src/games/${file} has id '${meta.id}'; the file name must match the id`);
      g.meta = meta;
    }
    games.push(g);
  }
  return games;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] || join(ROOT, 'dist-games'));
  rmSync(out, { recursive: true, force: true }); mkdirSync(join(out, 'games'), { recursive: true });
  const games = await buildGames({ withMeta: true });
  for (const g of games) writeFileSync(join(out, g.file), g.code);
  const manifest = { v: 1, built: Date.now(), games: games.map(({ code, ...g }) => g) };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));
  const kb = games.reduce((a, g) => a + g.bytes, 0) / 1024;
  console.log(`${games.length} games, ${kb.toFixed(0)} KB total, largest ${Math.max(...games.map(g => g.bytes)) / 1024 | 0} KB -> ${posix(relative(ROOT, out))}`);
}
