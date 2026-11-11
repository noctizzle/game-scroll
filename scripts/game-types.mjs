// Checks how each game uses gs against src/gamescroll.d.ts with the TypeScript compiler: a kit or method
// that doesn't exist (gs.effects.Fele, feel.cion()), too few arguments, an option a kit doesn't have, a
// definition field with a value the app doesn't know (era: 'nexgen', music: 'polka'), an api call that
// isn't there. Random play only finds these on the lines it happens to reach; this reads every line.
//
// Games stay plain JavaScript and need no type notes. Only what's about gs is reported: the games are
// checked twice, once against the real types and once with gs typed as "anything", and an error that
// shows both times is the game's own business (TypeScript not following some plain JavaScript), not a
// wrong use of the kit. Plain JavaScript habits are left alone too: see habit() below.
//
//   node scripts/game-types.mjs                 checks every game in src/games/
//   node scripts/game-types.mjs <id or file>... checks just those
//   --all         also list what was left out (the game's own business, habits), as notes
//   --self-test   checks the check: a game with known slips in it must have every one found
//
// A line that is right but can't be typed: put  // @ts-ignore  on the line above it.
// Used by .github/workflows/game-pr-check.yml. Takes about a second (TypeScript 7 is native code).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), GAMES = join(ROOT, 'src', 'games');
const WORK = join(ROOT, 'node_modules', '.cache', 'game-types'), TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

// Plain JavaScript habits TypeScript objects to, which aren't wrong uses of the kit:
//  - sums with true/false (2362, 2363, 2365) and fn(...list) (2556)
//  - a list where the types name a fixed number of items ([x, y]): TypeScript reads a JavaScript list kept
//    in a variable as "any number of items"
//  - a value that may be one of several things, one of which fits: for (const [name, size] of [['a', 1]...])
//    gives name as "text or number", and TypeScript can't tell which item of a mixed list it is
const CODES = new Set([2362, 2363, 2365, 2556]);
const members = t => { const out = []; let depth = 0, cur = ''; for (let i = 0; i < t.length; i++) { const ch = t[i]; if ('([{<'.includes(ch)) depth++; else if (')]}>'.includes(ch) && t[i - 1] !== '=') depth--; if (depth === 0 && t.startsWith(' | ', i)) { out.push(cur); cur = ''; i += 2; } else cur += ch; } out.push(cur); return out.map(m => m.trim().replace(/^\((.*)\)$/, '$1')); };
function habit(e) {
  if (CODES.has(e.code)) return true;
  if (/Target requires \d+ element\(s\) but source may have fewer/.test(e.text)) return true;
  const m = (e.code === 2345 ? /^Argument of type '(.+)' is not assignable to parameter of type '(.+)'\.$/ : e.code === 2322 ? /^Type '(.+)' is not assignable to type '(.+)'\.$/ : /^$/).exec(e.text.split('\n')[0]);
  if (m) { const from = members(m[1]), to = members(m[2]); if (from.length > 1 && from.some(f => to.includes(f))) return true; }
  return false;
}

const args = process.argv.slice(2), all = args.includes('--all'), selfTest = args.includes('--self-test');
const ids = args.filter(a => !a.startsWith('--')).map(a => basename(a, '.js'));
const games = (ids.length ? ids : readdirSync(GAMES).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3))).filter(id => existsSync(join(GAMES, id + '.js')));
const unknown = ids.filter(id => !games.includes(id));
if (unknown.length) { console.error('No such game: ' + unknown.join(', ')); process.exit(1); }

// Each game is checked as a copy with two type notes added, so the definition is read as a GameDef and
// make(api) as taking the app's api. They go on the same line as the code they describe, so line
// numbers stay the same; `shift` says how far that line's columns moved.
const T = "import('../gamescroll.js')";
function withNotes(src) {
  const shift = [];   // [line (0-based), from column, by how much]
  const add = (re, note) => {
    const m = re.exec(src); if (!m) return;
    const at = m.index + (m[1] ? m[1].length : 0), line = src.slice(0, at).split('\n').length - 1, col = at - (src.lastIndexOf('\n', at - 1) + 1);
    src = src.slice(0, at) + note + src.slice(at); shift.push([line, col, note.length]);
  };
  if (!/@type\s*\{[^}]*GameDef\s*\}/.test(src)) add(/^()export default\s*\{/m, `/** @type {${T}.GameDef} */ `);
  // (make's return is left untyped on purpose: typed as a Game, every canvas call and every this.down(x, y)
  // a game makes on itself would be held to the app's own signatures, which is noise, not kit misuse)
  const mk = /^([ \t]*)(?:export\s+)?function make\s*\(\s*([A-Za-z_$][\w$]*)/m.exec(src);
  if (mk && !/@param\s*\{[^}]*GameApi\s*\}/.test(src)) add(/^([ \t]*)(?:export\s+)?function make\s*\(/m, `/** @param {${T}.GameApi} ${mk[2]} */ `);
  return { src, shift };
}

const CONFIG = { compilerOptions: { allowJs: true, checkJs: true, noEmit: true, strict: false, target: 'es2023', module: 'esnext', moduleResolution: 'bundler', lib: ['es2023', 'dom', 'dom.iterable'], skipLibCheck: true, types: [] }, include: ['games/*.js'] };
const ANY = 'declare const gs: any;\nexport default gs;\nexport type GameDef = any;\nexport type GameApi = any;\n';

const shifts = {};
/** Writes the games ({ id: source text }) out twice, beside the real types and beside "gs is anything". */
function lay(sources) {
  rmSync(WORK, { recursive: true, force: true });
  for (const kind of ['real', 'any']) {
    const dir = join(WORK, kind); mkdirSync(join(dir, 'games'), { recursive: true });
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(CONFIG));
    writeFileSync(join(dir, 'gamescroll.d.ts'), kind === 'real' ? readFileSync(join(ROOT, 'src', 'gamescroll.d.ts'), 'utf8') : ANY);
    for (const [id, text] of Object.entries(sources)) { const n = withNotes(text); shifts[id] = n.shift; writeFileSync(join(dir, 'games', id + '.js'), n.src); }
  }
}

// One run of the compiler: [{ file, line, col, code, text }], file as 'games/<id>.js' or 'gamescroll.d.ts'.
const run = kind => new Promise((done, fail) => {
  execFile(process.execPath, [TSC, '-p', join(WORK, kind, 'tsconfig.json'), '--pretty', 'false'], { maxBuffer: 1 << 28, cwd: join(WORK, kind) }, (err, out, errOut) => {
    if (err && !out) return fail(new Error('the TypeScript compiler did not run: ' + (errOut || err.message)));
    const found = [];
    for (const l of out.split('\n')) {
      const m = /^(.*?)\((\d+),(\d+)\): error TS(\d+): (.*)$/.exec(l);
      if (m) found.push({ file: m[1].replace(/\\/g, '/').replace(/^.*?(?=(games\/[^/]+\.js|gamescroll\.d\.ts)$)/, ''), line: +m[2], col: +m[3], code: +m[4], text: m[5] });
      else if (found.length && /^\s+\S/.test(l)) found[found.length - 1].text += '\n' + l;
      else if (/error TS\d+/.test(l)) found.push({ file: '', line: 0, col: 0, code: +/TS(\d+)/.exec(l)[1], text: l });
    }
    done(found);
  });
});
const where = e => {   // back to the game's own file, line and column
  const id = e.file.replace(/^games\/|\.js$/g, ''); let col = e.col;
  for (const [line, from, by] of shifts[id] || []) if (line === e.line - 1 && col - 1 >= from + by) col -= by;
  return { id, file: `src/games/${id}.js`, line: e.line, col };
};
/** Checks games ({ id: source text }): { about: what's wrong with how they use gs, rest: what was left out }. */
async function check(sources) {
  lay(sources);
  const [real, any] = await Promise.all([run('real'), run('any')]);
  const key = e => `${e.file}:${e.line}:${e.col}:${e.code}`, own = new Set(any.map(key));
  const broken = real.filter(e => !e.file.startsWith('games/'));   // the types file itself, or the compiler's setup
  if (broken.length) { console.error('src/gamescroll.d.ts has errors:\n' + broken.map(e => `  gamescroll.d.ts:${e.line}:${e.col} TS${e.code} ${e.text}`).join('\n')); process.exit(1); }
  const mine = e => own.has(key(e)) || habit(e);
  return { about: real.filter(e => !mine(e)), rest: real.filter(mine) };
}

// The check checked: a small right game must pass (with the plain JavaScript habits above in it), and
// the same game with one slip put in must fail on that slip, for each kind of slip the check is for.
async function testItself() {
  const good = `import gs from '../gamescroll.js';
const { sounds, tone, music } = gs.sound, { haptic } = gs.device, { Feel } = gs.effects, { clamp, rnd } = gs.util, { Ready } = gs.rounds;
const W = 360, H = 640, DOTS = [[40, 60, '#f55'], [200, 300, '#5f5']], WOBBLE = [5, 14];
function make(api) {
  const feel = new Feel(), ready = new Ready();
  let score, x, best = api.load({ best: 0 }).best, world = api.loadLocal(null), song = null;
  return {
    reset() { score = 0; x = W / 2; feel.clear(); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      if (!song) { song = music({ tempo: 120, lead: 'C5 . E5 .', set: 'band' }); song.start(); }
      x = clamp(x + rnd(-1, 1) + (score > 3), 0, W);
      for (const [dx, dy, col] of DOTS) feel.hit(dx, dy, { color: col });
      tone(440, { len: .1, wobble: WOBBLE });
      if (score >= 30) { api.save({ best: Math.max(best, score) }); api.saveLocal({ world }); api.win(); }
    },
    draw(c) { c.fillStyle = '#123'; c.fillRect(0, 0, W, H); feel.begin(c); feel.end(c, W, H); const a = api.scoreArea(); c.fillText(score, a.x, a.bottom + 20); },
    down(px, py) { if (ready.go()) return; score++; api.score(score); feel.coin(px, py); feel.hit(px, py, { power: .4 }); sounds.coin(1.2); haptic('light'); const p = api.ahead(); if (p) x = p[0]; },
    key(k, isDown) { if (isDown && k === ' ') this.down(W / 2); },
  };
}
export default { id: 'self-test', title: 'Self Test', tag: 'Casual · Reflex', retro: false, w: W, h: H, goal: 30, hint: 'Tap.', creator: 'Test', music: 'chase', touch: 'fine', make };
`;
  // [what the slip is, the right code, the slip]
  const slips = [
    ['a kit that does not exist', 'gs.rounds;', 'gs.round;'],
    ['a name a kit does not have', '{ Feel } = gs.effects', '{ Fele } = gs.effects'],
    ['a method a kit object does not have', 'feel.coin(px, py)', 'feel.cion(px, py)'],
    ['a sound that does not exist', 'sounds.coin(1.2)', 'sounds.coni(1.2)'],
    ['an api call that does not exist', 'api.score(score)', 'api.scroe(score)'],
    ['too few arguments', 'clamp(x + rnd(-1, 1) + (score > 3), 0, W)', 'clamp(x + rnd(-1, 1) + (score > 3), 0)'],
    ['an option a kit does not have', '{ power: .4 })', '{ size: .4 })'],
    ['a value a kit does not know', "haptic('light')", "haptic('lite')"],
    ['an instrument set that does not exist', "set: 'band'", "set: 'brass band'"],
    ['a style the app does not know', 'retro: false,', "retro: true, era: 'nexgen',"],
    ['a soundtrack mood that does not exist', "music: 'chase'", "music: 'polka'"],
    ['a definition with no goal', 'goal: 30, ', ''],
    ['a definition field of the wrong kind', "touch: 'fine'", 'touch: true'],
    ['a definition field that does not exist', "touch: 'fine'", "tuch: 'fine'"],
  ];
  const sources = { good };
  slips.forEach(([, right, wrong], i) => { if (!good.includes(right)) throw new Error('self-test: the right game has no ' + right); sources['slip-' + i] = good.replace(right, wrong); });
  const { about } = await check(sources), by = {};
  for (const e of about) (by[where(e).id] ||= []).push(e);
  let failed = 0;
  const say = (ok, what, more = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${more ? '\n     ' + more : ''}`); };
  say(!by.good, 'a right game passes, plain JavaScript habits and all', (by.good || []).map(e => `${e.line}:${e.col} ${e.text.split('\n')[0]}`).join('\n     '));
  slips.forEach(([what], i) => { const got = by['slip-' + i] || []; say(got.length > 0, `${what} is found`, got.length ? '' : 'nothing was reported'); });
  console.log(failed ? `\n${failed} self-test check(s) failed: the game types check is not seeing what it should` : `\ngame types self-test: all ${slips.length} kinds of slip are found`);
  return failed ? 1 : 0;
}
if (selfTest) process.exit(await testItself());

const { about, rest } = await check(Object.fromEntries(games.map(id => [id, readFileSync(join(GAMES, id + '.js'), 'utf8')])));
const ci = !!process.env.GITHUB_ACTIONS, show = (e, tag) => {
  const w = where(e), first = e.text.split('\n')[0];
  console.log(`${w.file}:${w.line}:${w.col}  ${tag}${e.text.replace(/\n/g, '\n    ')}`);
  if (ci && !tag) console.log(`::error file=${w.file},line=${w.line},col=${w.col},title=gs types::${first.replace(/%/g, '%25')}`);
};
if (all) for (const e of rest) show(e, '(note) ');
for (const e of about) show(e, '');
const bad = new Set(about.map(e => e.file)).size;
if (about.length) {
  console.log(`\n${about.length} place${about.length === 1 ? '' : 's'} in ${bad} game${bad === 1 ? '' : 's'} where gs is used in a way src/gamescroll.d.ts doesn't describe.`);
  console.log('Check the name, the arguments and the options against docs/maker-kit.md. If the game is right and the types are behind, fix src/gamescroll.d.ts (a shared-code change); for one line that is right but can\'t be typed, put // @ts-ignore above it.');
  process.exit(1);
}
console.log(`game types: ${games.length} game${games.length === 1 ? '' : 's'} use gs the way its types describe${rest.length ? ` (${rest.length} notes about the games' own code left out; --all lists them)` : ''}`);
