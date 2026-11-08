// Maths probe: do JavaScript engines agree, bit for bit, on Math.sin, cos, exp...? A Recorder replay
// or a daily run only plays out the same on another phone if every step computes the same numbers.
// Android runs games in V8 (Chrome), iPhones in JavaScriptCore (Safari's engine), and the API
// Worker in V8. + - * / and sqrt are exact everywhere; the others are only "close" by the standard.
//
// Runs the same seeded inputs through each function in Node (V8), Chromium (V8) and WebKit (JSC),
// hashes the exact bits, and lists the functions that differ with the first input that does.
//   node scripts/math-probe.cjs            (skips a browser Playwright can't start)
//   node scripts/math-probe.cjs --strict   (exit 1 when an engine differs)
// Results as of 2026-11-08: see docs/maker-kit.md, "Same on every phone".
const { chromium, webkit } = require('playwright');

const N = 200000, BLOCK = 1000;

// Runs inside each engine, so it must stand alone (no closures over this file).
function probe(N, BLOCK, only) {
  let s = 0x2545f491;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const P = Math.PI;
  // the ranges games use: angles, physics-sized exps and logs, screen-sized hypots
  const fns = {
    sqrt: [x => Math.sqrt(x), () => rnd() * 1e6],   // a control: exact by the standard
    sin: [x => Math.sin(x), () => (rnd() * 2 - 1) * 8 * P],
    cos: [x => Math.cos(x), () => (rnd() * 2 - 1) * 8 * P],
    tan: [x => Math.tan(x), () => (rnd() * 2 - 1) * 1.5],
    atan2: [(y, x) => Math.atan2(y, x), () => (rnd() * 2 - 1) * 1000, () => (rnd() * 2 - 1) * 1000],
    exp: [x => Math.exp(x), () => (rnd() * 2 - 1) * 20],
    log: [x => Math.log(x), () => rnd() * 1e4 + 1e-9],
    pow: [(x, y) => Math.pow(x, y), () => rnd() * 4, () => (rnd() * 2 - 1) * 8],
    hypot: [(x, y) => Math.hypot(x, y), () => (rnd() * 2 - 1) * 1000, () => (rnd() * 2 - 1) * 1000],
    tanh: [x => Math.tanh(x), () => (rnd() * 2 - 1) * 4],   // Tiny Brains' cells
  };
  const out = {}, f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  for (const [name, [f, ...gens]] of Object.entries(fns)) {
    s = 0x2545f491 ^ name.length * 2654435761;
    const blocks = [], vals = only && only.name === name ? [] : null;
    let h = 2166136261;
    for (let i = 0; i < N; i++) {
      const args = gens.map(g => g()), v = f(...args);
      f64[0] = v; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619);
      if (vals && (i / BLOCK | 0) === only.block) vals.push([args, v, u32[1].toString(16).padStart(8, '0') + u32[0].toString(16).padStart(8, '0')]);
      if ((i + 1) % BLOCK === 0) { blocks.push(h >>> 0); h = 2166136261; }
    }
    let all = 2166136261; for (const b of blocks) all = Math.imul(all ^ b, 16777619);
    out[name] = { hash: (all >>> 0).toString(16), blocks, vals };
  }
  return out;
}

(async () => {
  const strict = process.argv.includes('--strict');
  const engines = [{ name: 'node (V8)', run: only => probe(N, BLOCK, only) }];
  for (const [name, type] of [['chromium (V8)', chromium], ['webkit (JSC)', webkit]]) {
    let b;
    try { b = await type.launch(); } catch (e) { console.log(`(skipping ${name}: ${String(e.message).split('\n')[0]})`); continue; }
    const page = await b.newPage();
    engines.push({ name, b, run: only => page.evaluate(([src, n, bl, o]) => (0, eval)('(' + src + ')')(n, bl, o), [probe.toString(), N, BLOCK, only]) });
  }
  const res = [];
  for (const e of engines) res.push(await e.run(null));
  const names = Object.keys(res[0]);
  console.log(`${N.toLocaleString()} inputs per function\n`);
  console.log('function  ' + engines.map(e => e.name.padEnd(16)).join('') + 'same?');
  const differ = [];
  for (const fn of names) {
    const hs = res.map(r => r[fn].hash), same = hs.every(h => h === hs[0]);
    console.log(fn.padEnd(10) + hs.map(h => h.padEnd(16)).join('') + (same ? 'yes' : 'NO'));
    if (!same) differ.push(fn);
  }
  for (const fn of differ) {
    // the first block where any engine differs from the first, then the first input in it
    const block = res[0][fn].blocks.findIndex((b, i) => res.some(r => r[fn].blocks[i] !== b));
    const vals = [];
    for (const e of engines) vals.push((await e.run({ name: fn, block }))[fn].vals);
    const at = vals[0].findIndex((v, i) => vals.some(w => w[i][2] !== v[2]));
    const blocksOff = res.slice(1).map(r => r[fn].blocks.filter((b, i) => b !== res[0][fn].blocks[i]).length);
    console.log(`\n${fn}: first difference at input #${block * BLOCK + at} ${JSON.stringify(vals[0][at][0])}`);
    engines.forEach((e, k) => console.log(`  ${e.name.padEnd(16)} ${vals[k][at][1]}  (bits ${vals[k][at][2]})`));
    console.log(`  blocks of ${BLOCK} that differ from ${engines[0].name}: ${blocksOff.join(', ')} of ${res[0][fn].blocks.length}`);
  }
  for (const e of engines) if (e.b) await e.b.close();
  if (differ.length) {
    const msg = `engines differ on ${differ.join(', ')}: a game that records replays or daily runs should not let these decide what happens`;
    console.log((process.env.GITHUB_ACTIONS ? '::warning title=Maths probe::' : '\n') + msg);
  } else console.log(`\nall ${engines.length} engines agree`);
  process.exit(strict && differ.length ? 1 : 0);
})();
