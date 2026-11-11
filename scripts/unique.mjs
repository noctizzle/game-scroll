// How different is each game from the others? Game Scroll's goal is 1,000 games that all play differently,
// so this fingerprints every game in src/games/ three ways and looks for near-twins:
//
//   shape   the code with every name, number and string taken out, as runs of 9 tokens. A reskin (new
//           names, colours and words on the same code) keeps its shape. Runs that many games share
//           (the starter template, drawing a rectangle) count for little.
//   play    what the game is made of: the gs parts it uses, the inputs it reads (tap, drag, tilt, mic...),
//           and the words inside the names in its code (gravity, lane, combo, paddle...).
//   words   its hint, title and tag: what the player is told to do.
//
//   node scripts/unique.mjs                    every game: the closest pairs; fails on a near-copy
//   node scripts/unique.mjs <id> [<id>...]     those games: the three nearest games to each, and why
//   node scripts/unique.mjs --since <git ref>  the games added or changed since then (the PR check)
//   node scripts/unique.mjs --self-test        makes a reskin and a new game, and checks it tells them apart
//   --json prints the findings as JSON; --top N lists N pairs (default 12)
//
// A near-copy (shape at or over COPY) fails. A near-twin (twin score at or over TWIN) is a warning: read
// both games and say in the PR what makes the new one play differently, or change it until it does.
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GAMES = new URL('../src/games/', import.meta.url);
export const COPY = .6, TWIN = .42;
const RUN = 9;

const KEYWORDS = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of null true false undefined'.split(' '));
const OPS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const BEFORE_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '=>', '==', '===', '!=', '!==', '&&', '||', '??', '+=', '-=', 'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', '']);

/** The code as tokens: { shape: ['const', 'i', '=', 'n', ...], names: ['orbs', 'spawn', ...], comments: '...' }. */
export function tokens(src) {
  const shape = [], names = []; let comments = '', i = 0, last = '';
  const n = src.length;
  const push = t => { shape.push(t); last = t; };
  while (i < n) {
    const ch = src[i];
    if (ch <= ' ') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; comments += src.slice(i + 2, end) + '\n'; i = end; continue; }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e; comments += src.slice(i + 2, end) + '\n'; i = end + 2; continue; }
    if (ch === '"' || ch === "'") { i++; while (i < n && src[i] !== ch) { if (src[i] === '\\') i++; i++; } i++; push('s'); continue; }
    if (ch === '`') {   // a template: its text is a string, the code inside ${ } is read as code
      i++; push('s');
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1, j = i + 2;
          while (j < n && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; else if (src[j] === '`') { j++; while (j < n && src[j] !== '`') { if (src[j] === '\\') j++; j++; } } j++; }
          const inner = tokens(src.slice(i + 2, j - 1)); for (const t of inner.shape) shape.push(t); for (const w of inner.names) names.push(w);
          i = j; continue;
        }
        i++;
      }
      i++; last = 's'; continue;
    }
    if (ch === '/' && BEFORE_REGEX.has(last)) {   // a regular expression
      let j = i + 1, cls = false;
      while (j < n && (cls || src[j] !== '/') && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      if (src[j] === '/') { j++; while (/[a-z]/.test(src[j] || '')) j++; i = j; push('r'); continue; }
    }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      const m = /^(0[xX][\da-fA-F_]+|0[bB][01_]+|(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?)n?/.exec(src.slice(i, i + 40)); i += m ? m[0].length : 1; push('n'); continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1; while (j < n && /[\w$]/.test(src[j])) j++;
      const w = src.slice(i, j); i = j;
      if (KEYWORDS.has(w)) push(w); else { names.push(w); push('i'); }
      continue;
    }
    const op = OPS.find(o => src.startsWith(o, i));
    if (op) { i += op.length; push(op); } else { i++; push(ch); }
  }
  return { shape, names, comments };
}

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const STOP = new Set('the a an and or of to in on it is are be as at by for from with that this then than them they you your before after into out up down over under each every all any one two three four five six seven eight nine ten not no its if but so can will get got has have was were their his her our off only more most much many very too also just when while where how what which who'.split(' '));
const SHOWN = new Map();   // stem -> the shortest word seen for it, for printing
/** 'spawnTimer', 'max_speed', 'Tap the orbs', 'racing' -> spawn, timer, max, speed, tap, orb, rac (stems: lower case, endings folded, small words out). */
export function words(text) {
  const out = [];
  for (const raw of String(text).replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    let w = raw;
    if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y'; else if (w.length > 4 && /(ss|sh|ch|x)es$/.test(w)) w = w.slice(0, -2); else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length > 5 && w.endsWith('ing') && /[aeiouy]/.test(w.slice(0, -3))) w = w.slice(0, -3); else if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) w = w.slice(0, -2);
    if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);                                  // race, racing -> rac
    if (w.length > 3 && w.at(-1) === w.at(-2) && !/[lsfzaeiou]/.test(w.at(-1))) w = w.slice(0, -1);   // dropped -> drop, spinning -> spin
    if (!SHOWN.has(w) || raw.length < SHOWN.get(w).length) SHOWN.set(w, raw);
    out.push(w);
  }
  return out;
}
const shown = k => k.startsWith('w:') ? SHOWN.get(k.slice(2)) || k.slice(2) : SHOWN.get(k) || k;

// names that are the language, the canvas or the kit, not this game's own: they say nothing about how it plays
const PLAIN = new Set(words('gs api make reset update draw down move up key resize debug const let function return Math floor round random min max abs sin cos atan sqrt hypot PI sign pow ceil length push pop splice slice filter map forEach find findIndex some every indexOf includes join split concat sort reverse fill from keys values entries Array Object String Number Set Map JSON parse stringify fillStyle fillRect strokeStyle strokeRect lineWidth beginPath closePath moveTo lineTo arc ellipse quadraticCurveTo bezierCurveTo stroke fillText font textAlign textBaseline save restore translate rotate scale globalAlpha globalCompositeOperation createLinearGradient createRadialGradient addColorStop clip rect roundRect setLineDash lineCap lineJoin measureText width height id title tag retro era pal goal hint creator tick music export default import undefined null true false new this color colour size text align center left right top bottom x y w h dx dy vx vy dt i j k n t a b c d e f g o p q r s u v W H el obj tmp val idx len arr str num res out cur prev next args opts'.split(' ').join(' ')));

/** Everything this check knows about one game. */
export function fingerprint(id, src) {
  const { shape, names, comments } = tokens(src);
  // shape: every run of RUN tokens, hashed
  const runs = new Set();
  for (let i = 0; i + RUN <= shape.length; i++) runs.add(hash(shape.slice(i, i + RUN).join(' ')));
  // the definition
  const def = src.slice(Math.max(0, src.lastIndexOf('export default')));
  const field = k => (new RegExp(`\\b${k}:\\s*(['"\`])((?:\\\\.|(?!\\1).)*)\\1`).exec(def) || [])[2] || '';
  const title = field('title'), tag = field('tag'), hint = field('hint');
  const era = (/\bera:\s*'(\w+)'/.exec(def) || [])[1] || (/\bretro:\s*true/.test(def) ? 'pocket' : 'phone');
  const genre = (tag.split('·')[1] || '').trim().toLowerCase();
  // play: gs parts, inputs, and the words inside the game's own names
  const play = new Map(), add = (k, w = 1) => play.set(k, (play.get(k) || 0) + w);
  for (const m of src.matchAll(/\bgs\.(\w+)(?:\.(\w+))?/g)) add('gs:' + m[1] + (m[2] ? '.' + m[2] : ''));
  for (const m of src.matchAll(/\{([^}]*)\}\s*=\s*gs\.(\w+)/g)) for (const k of m[1].split(',')) { const nm = k.trim().split(/[:\s]/)[0]; if (nm) add('gs:' + m[2] + '.' + nm); }
  for (const m of src.matchAll(/\bapi\.(\w+)/g)) add('api:' + m[1]);
  for (const h of ['down', 'move', 'up', 'key']) if (new RegExp(`(^|[\\s,{])${h}\\s*(\\(|:)`, 'm').test(src)) add('in:' + h);
  for (const [k, re] of [['tilt', /\btilt\s*\(/], ['mic', /\bstartMic\b/], ['camera', /\bstartCamera\b|gs\.vision|gs\.ar\b/], ['shake', /\bonShake\b/], ['moves', /gs\.moves/], ['voice', /gs\.hear/], ['place', /api\.(location|watchLocation)/], ['steps', /\bsteps\s*\(/]]) if (re.test(src)) add('sense:' + k);
  for (const g of ['swipe', 'hold', 'doubleTap', 'pinch', 'twist', 'tap']) if (new RegExp(`\\b${g}\\s*:`).test(src)) add('gesture:' + g);
  add('style:' + era); if (genre) add('genre:' + genre, 2);
  const bag = new Map();
  for (const nm of names) for (const w of words(nm)) if (!PLAIN.has(w)) bag.set(w, (bag.get(w) || 0) + 1);
  for (const [w, c] of bag) add('w:' + w, 1 + Math.log(c));           // a name used a lot matters more, but not in proportion
  for (const w of words(comments)) if (!PLAIN.has(w)) add('w:' + w, .25);   // what the maker says it is
  // words: what the player is told
  const told = new Map();
  for (const w of words(hint)) told.set(w, (told.get(w) || 0) + 1);
  for (const w of words(title)) told.set(w, (told.get(w) || 0) + .5);
  if (genre) for (const w of words(genre)) told.set(w, (told.get(w) || 0) + 1);
  return { id, title, tag, hint, era, genre, runs, play, told, size: shape.length };
}

/** Compares a set of fingerprints. Gives near(id, n) and pairs(). */
export function compare(prints) {
  const N = prints.length;
  const df = (get) => { const m = new Map(); for (const p of prints) for (const k of get(p)) m.set(k, (m.get(k) || 0) + 1); return m; };
  const runDf = df(p => p.runs), playDf = df(p => p.play.keys()), toldDf = df(p => p.told.keys());
  // a run found in many games is template or idiom: it counts for nothing once 1 game in 12 has it
  const runW = k => { const d = runDf.get(k) || 1; return d <= 1 ? 1 : Math.max(0, 1 - Math.log(d) / Math.log(Math.max(4, N / 12))); };
  const idf = (m, k) => Math.log((N + 1) / ((m.get(k) || 0) + 1)) + .05;
  for (const p of prints) {
    p.runMass = 0; for (const k of p.runs) p.runMass += runW(k);
    p.playV = new Map(); let s = 0; for (const [k, v] of p.play) { const x = v * idf(playDf, k); p.playV.set(k, x); s += x * x; } p.playLen = Math.sqrt(s) || 1;
    p.toldV = new Map(); s = 0; for (const [k, v] of p.told) { const x = v * idf(toldDf, k); p.toldV.set(k, x); s += x * x; } p.toldLen = Math.sqrt(s) || 1;
  }
  const cosine = (a, la, b, lb, shared) => { let s = 0; const [small, big] = a.size < b.size ? [a, b] : [b, a]; for (const [k, v] of small) { const o = big.get(k); if (o) { s += v * o; shared?.push([k, v * o]); } } return s / (la * lb); };
  function score(a, b) {
    let both = 0; const [small, big] = a.runs.size < b.runs.size ? [a.runs, b.runs] : [b.runs, a.runs];
    for (const k of small) if (big.has(k)) both += runW(k);
    // how much of the smaller game's own code shape is also in the other
    const shape = both / (Math.min(a.runMass, b.runMass) || 1);
    const sp = [], st = [];
    const play = cosine(a.playV, a.playLen, b.playV, b.playLen, sp), told = cosine(a.toldV, a.toldLen, b.toldV, b.toldLen, st);
    // a twin plays the same and is described the same; either alone is common (two runners, two "tap the..." hints)
    const twin = Math.max(shape, .55 * play + .45 * told, Math.sqrt(play * told));
    const top = l => l.sort((x, y) => y[1] - x[1]).slice(0, 6).map(x => shown(x[0]));
    return { a: a.id, b: b.id, shape, play, told, twin, why: { play: top(sp), told: top(st) } };
  }
  return {
    score,
    near(p, n = 3) { return prints.filter(o => o !== p).map(o => score(p, o)).sort((x, y) => y.twin - x.twin).slice(0, n); },
    pairs() { const out = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) out.push(score(prints[i], prints[j])); return out.sort((x, y) => y.twin - x.twin); },
  };
}

export function load(dir = GAMES) {
  return readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => fingerprint(f.slice(0, -3), readFileSync(new URL(f, dir), 'utf8')));
}

const pct = x => Math.round(x * 100) + '%';
function describe(s) {
  const kind = s.shape >= COPY ? 'NEAR-COPY' : s.twin >= TWIN ? 'near-twin' : 'different';
  return `${kind.padEnd(9)} ${s.b.padEnd(24)} twin ${pct(s.twin).padStart(4)}  (code shape ${pct(s.shape)}, how it plays ${pct(s.play)}, what the player is told ${pct(s.told)})` +
    (s.twin >= TWIN * .8 ? `\n            shared: ${[...new Set([...s.why.told, ...s.why.play])].slice(0, 9).join(', ')}` : '');
}

function selfTest() {
  const src = id => readFileSync(new URL(id + '.js', GAMES), 'utf8');
  const all = load(), ids = all.map(p => p.id);
  let bad = 0; const check = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) bad++; };
  // 1. a reskin: every name the game made up is changed, and so are its words, numbers and colours
  for (const id of ['stack', ids[Math.floor(ids.length / 2)], ids.at(-1)].filter(x => ids.includes(x))) {
    let n = 0; const seen = new Map();
    const KEEP = new Set(['gs', 'api', 'make', 'reset', 'update', 'draw', 'down', 'move', 'up', 'key', 'Math', 'id', 'title', 'tag', 'retro', 'era', 'pal', 'goal', 'hint', 'creator', 'w', 'h']);
    const reskin = src(id)
      .replace(/(['"])(?:\\.|(?!\1).)*\1/g, m => /gamescroll/.test(m) ? m : "'zz'")
      .replace(/\b(\d+\.?\d*|\.\d+)\b/g, m => String(+m * 1.5 + 1))
      .replace(/(?<![.\w$])([a-zA-Z_$][\w$]*)\b(?!\s*:)/g, (m, w) => KEYWORDS.has(w) || KEEP.has(w) || w.length < 3 ? m : (seen.get(w) || (seen.set(w, 'q' + (n++).toString(36) + 'z'), seen.get(w))));
    const prints = [...all, fingerprint('zz-reskin', reskin)], cc = compare(prints), best = cc.near(prints.at(-1), 1)[0];
    check(best.b === id && best.shape >= COPY, `a reskin of ${id} is a near-copy of it (nearest ${best.b}, code shape ${pct(best.shape)})`);
  }
  // 2. the same game half rewritten is still a twin of itself, and a new game from the same template is not
  const tpl = s => readFileSync(new URL('./templates/' + s + '.js', import.meta.url), 'utf8').replace(/__ID__/g, 'zz-new').replace(/__TITLE__/g, 'Zz New').replace(/__CREATOR__/g, 'CI');
  for (const style of ['phone', 'pocket', 'color']) {
    const prints = [...all, fingerprint('zz-new', tpl(style))], c = compare(prints), best = c.near(prints.at(-1), 1)[0];
    check(best.shape < COPY, `the ${style} starter template is not a near-copy of any game (nearest ${best.b}, code shape ${pct(best.shape)})`);
  }
  // 3. the games already here: none is a near-copy of another
  const copies = compare(all).pairs().filter(s => s.shape >= COPY);
  check(!copies.length, `no game here is a near-copy of another${copies.length ? ': ' + copies.map(s => s.a + ' / ' + s.b).join(', ') : ''}`);
  // 4. the tokenizer
  const t = tokens('const a = `x${b + 1}y`; // hi\nlet r = /a\\/b[/]/g.test(s) ? 1 / 2 : .5e3;');
  check(t.shape.join(' ') === 'const i = s i + n ; let i = r . i ( i ) ? n / n : n ;', 'the tokenizer reads templates, comments, regular expressions and numbers');
  const w = words('spawnTimer max_speed Tap the orbs flying boxes springs dropped racing race').join(' ');
  check(w === 'spawn timer max speed tap orb fly box spring drop rac rac', 'names are split into plain words: ' + w);
  if (bad) { console.error(`unique self-test: ${bad} check(s) failed`); process.exit(1); }
  console.log('unique self-test: all checks passed');
}

function main() {
  const args = process.argv.slice(2), flag = f => args.includes(f), opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
  if (flag('--self-test')) return selfTest();
  const prints = load(), c = compare(prints), by = new Map(prints.map(p => [p.id, p]));
  let ids = args.filter((a, i) => !a.startsWith('--') && !['--since', '--top'].includes(args[i - 1]));
  const since = opt('--since');
  if (since) {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', since, '--', 'src/games/'], { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) });
    ids = out.split('\n').map(f => (/src\/games\/([^/]+)\.js$/.exec(f) || [])[1]).filter(Boolean);
    if (!ids.length) { console.log('unique: no games added or changed since ' + since); return; }
  }
  const ci = !!process.env.GITHUB_ACTIONS; let copies = 0, twins = 0; const found = [];
  if (ids.length) {
    for (const id of ids) {
      const p = by.get(id); if (!p) { console.error(`unique: no game called ${id} in src/games/`); process.exit(2); }
      const near = c.near(p, 3); found.push({ id, near });
      console.log(`\n${id}  (${p.tag || 'no tag'})  nearest games:`);
      for (const s of near) console.log('  ' + describe(s));
      const worst = near[0];
      if (worst.shape >= COPY) { copies++; if (ci) console.log(`::error file=src/games/${id}.js,title=Near-copy of ${worst.b}::${pct(worst.shape)} of this game's code shape is also in ${worst.b}. A new game needs its own mechanic, not new names on the same code.`); }
      else if (worst.twin >= TWIN) { twins++; if (ci) console.log(`::warning file=src/games/${id}.js,title=Plays like ${worst.b}::Twin score ${pct(worst.twin)} with ${worst.b} (shared: ${[...new Set([...worst.why.told, ...worst.why.play])].slice(0, 6).join(', ')}). Say in the PR what makes this one play differently, or change it until it does.`); }
    }
  } else {
    const pairs = c.pairs(), top = +opt('--top', 12);
    copies = pairs.filter(s => s.shape >= COPY).length; twins = pairs.filter(s => s.shape < COPY && s.twin >= TWIN).length;
    console.log(`unique: ${prints.length} games, ${pairs.length} pairs. The ${top} closest:`);
    for (const s of pairs.slice(0, top)) { console.log(`  ${s.a}`); console.log('    ' + describe(s)); }
    found.push(...pairs.slice(0, top));
  }
  if (flag('--json')) console.log(JSON.stringify(found, (k, v) => v instanceof Map || v instanceof Set ? undefined : v));
  console.log(`\nunique: ${copies} near-cop${copies === 1 ? 'y' : 'ies'} (fails), ${twins} near-twin${twins === 1 ? '' : 's'} (warning)`);
  if (copies) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
