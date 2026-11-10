// Speed bench for the 3D games: plays each one with random taps on WebGL and on WebGPU and prints,
// per game, the CPU time of the game's update() and of the 3D frame (HD.info.cpu: scene upkeep,
// passes and handing the work to the GPU), draw calls, triangles, how long the card took to load
// and how much memory it kept. The GPU itself is SwiftShader here (software), so frame rates say
// nothing about phones; the CPU numbers are what to compare before and after an engine change.
//   npm run build:bundled && node scripts/perf-bench.cjs [id ...] [--gl | --gpu] [--secs 8] [--json out.json] [--vs base.json] [--still 3] [--no-shadow-cache]
// No ids: every Next Gen game. --vs prints the change against a saved run (same machine only).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const secs = +(opt('--secs') || 8), out = opt('--json'), vs = opt('--vs'), warm = +(opt('--warm') || 0);
  const backs = argv.includes('--gl') ? ['webgl'] : argv.includes('--gpu') ? ['webgpu'] : ['webgl', 'webgpu'];
  const still = opt('--still'), noCache = argv.includes('--no-shadow-cache');
  const ids0 = argv.filter(a => !a.startsWith('--'));
  const prof = argv.includes('--profile') || argv.includes('--alloc'), alloc = argv.includes('--alloc');   // --alloc: which functions allocate the most memory while playing (garbage the phone must collect)   // also name the slowest functions (runs the dev server, so names and lines are real)
  const vite = await import('vite');
  const server = prof ? await vite.createServer({ mode: 'bundled', server: { port: 4191, hmr: false }, logLevel: 'error' }) : await vite.preview({ preview: { port: 4191 } });
  if (prof) await server.listen();
  const icd = path.join(path.dirname(chromium.executablePath()), 'vk_swiftshader_icd.json');
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-angle=vulkan', '--enable-features=Vulkan', '--enable-precise-memory-info'], env: { ...process.env, VK_ICD_FILENAMES: icd } });
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4191/'); await p.waitForFunction(() => window.__gs, null, { timeout: 30000 }); await p.waitForTimeout(400);
  const ids = ids0.length ? ids0 : await p.evaluate(() => __gs.GAMES.filter(g => g.era === 'nextgen').map(g => g.id));
  await p.evaluate(id => __gs.only(id), ids[0]); await p.waitForTimeout(1500);
  await p.evaluate(() => { __hd.force = 3; });   // the top tier: Rob's Fold 8 is a top-class phone
  // --no-shadow-cache: the still/moving shadow split off (to measure it); --still n: frames before a thing
  // counts as still (SwiftShader draws a handful of frames a second, so a few frames here is a phone's second)
  await p.evaluate(([s, n]) => { if (s) __hd.shadowStill = +s; if (n) __hd.shadowCache = false; }, [still, noCache]);
  const pick = v => p.evaluate(async v => { while (!window.__gpu) await new Promise(r => setTimeout(r, 50)); window.__gpu.pick(v); return v === 'webgpu' ? !!(await window.__gpu.ready()) : true; }, v);
  const p50 = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
  const p95 = a => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * .95))] : 0;
  const res = {};
  for (const back of backs) {
    if (!await pick(back)) { console.log(`(${back} did not start: skipped)`); continue; }
    for (const id of ids) {
      await cdp.send('HeapProfiler.collectGarbage');
      const heap0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      const t0 = Date.now();
      await p.evaluate(id => __gs.only(id), id);
      for (let i = 0; i < 120 && await p.evaluate(() => !__gs.active || __gs.active.loading); i++) await p.waitForTimeout(100);
      const load = Date.now() - t0;
      await p.evaluate(() => __gs.start()); await p.waitForTimeout(600);
      await p.evaluate(() => {
        const T = window.__bench = { u: [], r: [], calls: [], tris: [], back: '', sh0: __hd.info.shDraws || 0, sp0: __hd.info.shSplit || 0 };
        const wrap = () => { const g = __gs.active.game; if (!g || g.__timed) return; g.__timed = true; const f = g.update; g.update = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T.u.push(performance.now() - t); } }; };
        let seen = -1;
        const tick = () => { if (!window.__bench) return; wrap(); const i = __hd.info; if (i.cpu !== seen) { seen = i.cpu; T.r.push(i.cpu); T.calls.push(i.calls); T.tris.push(i.tris); T.back = i.backend; } requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      const box = await p.evaluate(() => { const r = __gs.active.canvas.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      // --warm s: play this long before measuring (shaders built, caches full: the steady state)
      if (warm) { const wEnd = Date.now() + warm * 1000; while (Date.now() < wEnd) { if (await p.evaluate(() => __gs.active.state !== 'playing')) await p.evaluate(() => __gs.start()).catch(() => {}); await p.mouse.click(box[0] + Math.random() * box[2], box[1] + Math.random() * box[3]); await p.waitForTimeout(200); } await p.evaluate(() => { const t = window.__bench; t.u.length = t.r.length = t.calls.length = t.tris.length = 0; }); }
      if (alloc) await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      if (prof && !alloc) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
      const end = Date.now() + secs * 1000;
      while (Date.now() < end) {
        if (await p.evaluate(() => __gs.active.state !== 'playing')) await p.evaluate(() => __gs.start()).catch(() => {});
        await p.mouse.move(box[0] + Math.random() * box[2], box[1] + Math.random() * box[3]); await p.mouse.down();
        await p.mouse.move(box[0] + Math.random() * box[2], box[1] + Math.random() * box[3], { steps: 3 });
        await p.waitForTimeout(60 + Math.random() * 160); await p.mouse.up(); await p.waitForTimeout(40 + Math.random() * 120);
      }
      const profile = prof && !alloc ? (await cdp.send('Profiler.stop')).profile : null;
      const allocs = alloc ? (await cdp.send('HeapProfiler.stopSampling')).profile : null;
      const T = await p.evaluate(() => { const t = window.__bench; window.__bench = null; return { u: t.u.slice(3), r: t.r.slice(3), calls: t.calls, tris: t.tris, back: t.back, sh: (__hd.info.shDraws || 0) - t.sh0, sp: (__hd.info.shSplit || 0) - t.sp0 }; });
      await cdp.send('HeapProfiler.collectGarbage');
      const heap1 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      const row = { back: T.back, load, frames: T.r.length, upd50: p50(T.u), upd95: p95(T.u), cpu50: p50(T.r), cpu95: p95(T.r), calls: p50(T.calls), tris: p50(T.tris), shadowPct: T.r.length ? Math.round(100 * T.sh / T.r.length) : 0, splitPct: T.r.length ? Math.round(100 * T.sp / T.r.length) : 0, heapMB: (heap1 - heap0) / 1048576 };
      (res[back] ||= {})[id] = row;
      const base = vs && JSON.parse(fs.readFileSync(vs, 'utf8'))[back]?.[id];
      const d = (k, f = 1) => base ? ` (${row[k] - base[k] >= 0 ? '+' : ''}${(row[k] - base[k]).toFixed(f)})` : '';
      const line = `${back.padEnd(6)} ${id.padEnd(16)} on ${T.back.padEnd(6)} load ${load} ms${d('load', 0)}  update p50 ${row.upd50.toFixed(2)}${d('upd50', 2)} p95 ${row.upd95.toFixed(2)}${d('upd95', 2)}  3D cpu p50 ${row.cpu50.toFixed(2)}${d('cpu50', 2)} p95 ${row.cpu95.toFixed(2)}${d('cpu95', 2)} ms  calls ${row.calls}${d('calls', 0)}  tris ${row.tris}  frames ${row.frames}  shadow redraws ${row.shadowPct}% (split ${row.splitPct}%)  heap ${row.heapMB >= 0 ? '+' : ''}${row.heapMB.toFixed(1)} MB`;
      console.log(line);
      if (profile) for (const t of hot(profile)) console.log('    ' + t);
      if (allocs) for (const t of allocated(allocs, secs)) console.log('    ' + t);
    }
  }
  if (errs.length) console.log('page errors:\n  ' + [...new Set(errs)].slice(0, 10).join('\n  '));
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
  await b.close(); prof ? await server.close() : server.httpServer.close();
})();

// The functions with the most time of their own (share of the busy time): the kit, the game and three.js (not the browser itself).
function hot(profile, n = 14) {
  const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map(x => [x.id, x]));
  let total = 0;
  profile.samples.forEach((sid, i) => { const x = byId.get(sid); if (!x) return; if (x.callFrame.functionName !== '(idle)') total += dt[i] || 0; self.set(x, (self.get(x) || 0) + (dt[i] || 0)); });
  const sum = new Map();
  for (const [x, t] of self) {
    const f = x.callFrame, url = (f.url || '').replace(/\?.*$/, '');
    const at = url.indexOf('/src/'), nm = url.lastIndexOf('/node_modules/');
    const file = at >= 0 ? url.slice(at + 1) : nm >= 0 ? url.slice(nm + 14).replace(/^\.vite\/deps\//, '') : f.functionName === '(program)' || f.functionName === '(garbage collector)' ? f.functionName : null;
    if (!file) continue;
    const k = file.startsWith('(') ? file : `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
    sum.set(k, (sum.get(k) || 0) + t);
  }
  return [...sum].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${(100 * t / (total || 1)).toFixed(1).padStart(5)}%  ${k}`);
}

// Memory allocated per function (its own, sampled) while playing: what makes the garbage collector run.
function allocated(profile, secs, n = 16) {
  const sum = new Map(); let total = 0;
  const walk = x => {
    const f = x.callFrame, url = (f.url || '').replace(/\?.*$/, ''), at = url.indexOf('/src/'), nm = url.lastIndexOf('/node_modules/');
    const own = x.selfSize || 0; total += own;
    const file = at >= 0 ? url.slice(at + 1) : nm >= 0 ? url.slice(nm + 14).replace(/^\.vite\/deps\//, '') : '(browser)';
    const k = `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
    if (own) sum.set(k, (sum.get(k) || 0) + own);
    for (const c of x.children || []) walk(c);
  };
  walk(profile.head);
  return [`allocated ${(total / 1048576 / secs).toFixed(2)} MB/s (sampled), most by:`, ...[...sum].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, b]) => `${(b / 1024 / secs).toFixed(0).padStart(6)} KB/s  ${k}`)];
}
