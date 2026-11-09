// Feed swipe smoothness: flicks through the feed with a finger on a slowed CPU (like a mid-range
// phone) and reports main-thread stalls while a swipe is moving, and which feed work ran then
// (building cards, 3D card pictures, resetting a game, re-ranking).
// Usage: npm run build:bundled && node scripts/feed-jank.cjs [swipes] [--filter nextgen]
// Env: GAP=ms between swipes (1200), DIRECT=1 shows 3D the way the phone apps do (on the card, not
// copied), V=1 lists each swipe, WHO=<function regex> (DOWN=1: from the top) shows what called it mid-swipe.
// The headless browser draws 3D in software, so 3D stalls are far longer than on a phone: compare
// runs before and after a change, not with a phone.
const { chromium } = require('playwright');
const CPU = 4, GAP = +(process.env.GAP || 1200);   // ms between swipes (a quick scroller)
(async () => {
  const args = process.argv.slice(2), N = +args.find(a => /^\d+$/.test(a)) || 16;
  const fi = args.indexOf('--filter'), filter = fi >= 0 ? args[fi + 1] : null;
  const server = await (await import('vite')).preview({ preview: { port: 4187 } });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  if (process.env.DIRECT) await p.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await p.addInitScript(() => { window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); });
  await p.goto('http://localhost:4187/'); await p.waitForFunction(() => window.__gs, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  if (filter) { await p.evaluate(f => { const o = document.querySelector(`[data-f="${f}"]`); o && o.click(); }, filter); await p.waitForTimeout(3000); }
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await p.evaluate(() => { window.__lt.length = 0; });
  await cdp.send('Profiler.start');
  const t0 = await p.evaluate(() => performance.now());
  const tMark = await p.evaluate(() => { const t = performance.now(); (function __alignMark() { const e = performance.now() + 40; while (performance.now() < e); })(); return t; });
  const marks = [];
  for (let i = 0; i < N; i++) {
    const at = await p.evaluate(() => performance.now()), id = await p.evaluate(() => __gs.active?.def.id);
    // a finger flick up the caption area (outside the game screen), as on a phone; scroll snap does the rest
    const T = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 360, y }] });
    await T('touchStart', 760); for (let k = 1; k <= 6; k++) { await p.waitForTimeout(20); await T('touchMove', 760 - k * 85); } await T('touchEnd');
    await p.waitForTimeout(GAP);
    marks.push([at, id]);
  }
  const t1 = await p.evaluate(() => performance.now());
  const { profile } = await cdp.send('Profiler.stop');
  const lt = await p.evaluate(() => window.__lt);
  for (let i = 0; i < marks.length; i++) { const [m, id] = marks[i], nx = marks[i + 1]?.[1]; let bl = 0; for (const [s, d] of lt) bl += Math.max(0, Math.min(s + d, m + GAP) - Math.max(s, m - 300)); if (process.env.V) console.log(`  swipe ${i}: ${id} -> ${nx ?? '?'} ${nx === id ? 'DID NOT MOVE' : ''} blocked ${bl.toFixed(0)} ms`); }
  console.log('cards seen:', new Set(marks.map(m => m[1])).size, 'of', N);
  const inWin = lt.filter(([s]) => s >= t0 && s <= t1);
  const tot = inWin.reduce((a, [, d]) => a + d, 0), worst = inWin.reduce((a, [, d]) => Math.max(a, d), 0);
  console.log(`${N} swipes, ${CPU}x slower CPU: ${inWin.length} long tasks, ${tot.toFixed(0)} ms blocked, worst ${worst.toFixed(0)} ms`);
  // what the player feels: the main thread blocked while a swipe is moving (its first 600 ms)
  let during = 0, hit = 0; for (const [m] of marks) { let b = 0; for (const [s, d] of inWin) b += Math.max(0, Math.min(s + d, m + 600) - Math.max(s, m)); during += b; if (b > 50) hit++; }
  console.log(`  during swipes: ${during.toFixed(0)} ms blocked, ${hit} of ${N} swipes stalled over 50 ms`);
  // and the stalls that began while a swipe was moving (work the feed chose to do then; a stall that
  // began before can only be shortened, and here the headless browser's software 3D makes those far longer than a phone's)
  const began = inWin.filter(([s]) => marks.some(([m]) => s >= m && s <= m + 600));
  console.log(`  stalls that began mid-swipe: ${began.length}, ${began.reduce((a, [, d]) => a + d, 0).toFixed(0)} ms`);
  for (const [s, d] of inWin.sort((a, b) => b[1] - a[1]).slice(0, 12)) { const m = [...marks].reverse().find(x => x[0] <= s); console.log(`  ${d.toFixed(0).padStart(5)} ms  +${(s - (m ? m[0] : t0)).toFixed(0)} ms after swipe from ${m ? m[1] : '?'}`); }
  // inclusive time per function
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const self = new Map(); const dts = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dts[i + 1] || 0) / 1000));
  const incl = new Map(), selfF = new Map();
  for (const [id, t] of self) {
    const seen = new Set(); let n = id; const leaf = byId.get(id).callFrame; const lk = `${leaf.functionName || '(anon)'} ${leaf.url.split('/').pop()}:${leaf.lineNumber + 1}`; selfF.set(lk, (selfF.get(lk) || 0) + t);
    while (n != null) { const cf = byId.get(n).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + t); } n = parent.get(n); }
  }
  var top = (m, k) => [...m].filter(([n]) => !/^\((root|program|idle|garbage collector)\)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k);
  // what each of the worst stalls was doing (profile samples lined up with the page clock)
  const samT = []; { let t = profile.startTime; for (const d of dts) { t += d; samT.push(t); } }
  let off = t0 - profile.startTime / 1000;
  { const i = profile.samples.findIndex(id => byId.get(id).callFrame.functionName === '__alignMark'); if (i >= 0) off = tMark - samT[i] / 1000; }
  var pathOf = id => { const out = []; let n = id; while (n != null) { const cf = byId.get(n).callFrame; out.push(`${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`); n = parent.get(n); } return out; };
  // main-thread work by kind that ran while a swipe was moving (first 600 ms of each)
  const KINDS = { 'card picture (3D bake)': /^(bake|bakeLater)$/, 'building cards': /^(addBatch|makeSlide)$/, 'resetting a game': /^(resetSlide|resetGame)$/, 're-ranking': /^(rerank)$/, 'pruning': /^(pruneBehind)$/ };
  const kindT = {}; for (const k in KINDS) kindT[k] = 0;
  profile.samples.forEach((id, i) => { const at = samT[i] / 1000 + off; if (!marks.some(([m]) => at >= m && at <= m + 600)) return; const names = new Set(pathOf(id).map(x => x.split(' ')[0])); for (const [k, re] of Object.entries(KINDS)) if ([...names].some(n => re.test(n))) kindT[k] += (dts[i + 1] || 0) / 1000; });
  if (process.env.WHO) { const who = new Map(); profile.samples.forEach((id, i) => { const at = samT[i] / 1000 + off; if (!marks.some(([m]) => at >= m && at <= m + 600)) return; const pth = pathOf(id), names = pth.map(x => x.split(' ')[0]); const j = names.findIndex(n => new RegExp(process.env.WHO).test(n)); if (j < 0) return; const k = process.env.DOWN ? pth.slice().reverse().slice(1, 8).map(x => x.split(' ')[0]).join(' > ') : pth.slice(j, j + 7).map(x => x.split(' ')[0]).join(' < '); who.set(k, (who.get(k) || 0) + (dts[i + 1] || 0) / 1000); }); for (const [k, t] of [...who].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${t.toFixed(0)} ms ${k}`); }
  console.log('  mid-swipe work: ' + Object.entries(kindT).map(([k, t]) => `${k} ${t.toFixed(0)} ms`).join(', '));
  for (const [s, d] of inWin.sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    const m = new Map(); profile.samples.forEach((id, i) => { const at = samT[i] / 1000 + off; if (at >= s && at <= s + d) for (const k of new Set(pathOf(id))) m.set(k, (m.get(k) || 0) + (dts[i + 1] || 0) / 1000); });
    console.log(`stall ${d.toFixed(0)} ms:`); for (const [k, t] of top(m, 14)) console.log(`    ${t.toFixed(0).padStart(5)} ms  ${k}`);
  }
  console.log('inclusive:'); for (const [k, t] of top(incl, 30)) console.log(`  ${t.toFixed(0).padStart(6)} ms  ${k}`);
  console.log('self:'); for (const [k, t] of top(selfF, 20)) console.log(`  ${t.toFixed(0).padStart(6)} ms  ${k}`);
  await b.close(); server.httpServer.close(); process.exit(0);
})();
