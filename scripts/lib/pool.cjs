// Runs test work on several browsers at once (the test scripts' --jobs n). Each worker is one
// browser with its own GPU process, so software 3D (SwiftShader) really runs side by side.
//   const { jobs, pool } = require('./lib/pool.cjs');
//   const n = jobs(argv, 'light' | 'heavy');           // takes --jobs n out of argv, or picks a default
//   await pool(items, n, async () => worker, async (worker, item) => { ... }, async worker => close);
// Results print as each item finishes, so the order can differ from the ids given.
const os = require('os');
// light: 2D play that mostly waits on timers (one browser per CPU); heavy: software 3D (each SwiftShader uses several CPUs)
function jobs(argv, kind = 'light') {
  const i = argv.indexOf('--jobs'), cpus = os.availableParallelism?.() || os.cpus().length;
  const want = i >= 0 ? +argv.splice(i, 2)[1] : +(process.env.JOBS || 0) || (kind === 'heavy' ? Math.ceil(cpus / 2) : Math.min(cpus, 6));
  return Math.max(1, want | 0);
}
async function pool(items, n, open, run, close) {
  const queue = [...items], workers = [];
  const count = Math.max(1, Math.min(n, queue.length));
  await Promise.all(Array.from({ length: count }, async () => {
    const w = await open(); workers.push(w);
    for (let item; (item = queue.shift()) !== undefined;) await run(w, item);
  }));
  if (close) await Promise.all(workers.map(close));
  return workers;
}
module.exports = { jobs, pool };
