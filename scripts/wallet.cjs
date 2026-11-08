// Checks credits, wins, the shop, trophies and save merging in a real browser.
// Usage: npm run build:bundled && node scripts/wallet.cjs
const { chromium, devices } = require('playwright');
(async () => {
  const server = await (await import('vite')).preview({ preview: { port: 4180 } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4180/'); await p.waitForFunction(() => window.__gs, null, { timeout: 20000 }); await p.waitForTimeout(300);
  let failed = 0;
  const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? '  ' + info : ''}`); if (!ok) failed++; };
  const ev = f => p.evaluate(f);

  await ev(() => __gs.progress._reset());
  await ev(() => __gs.only('stack')); await p.waitForTimeout(150);
  check('ready screen shows the goal', await ev(() => !!__gs.active.overlay.querySelector('.ov-goal')));
  check('ready screen shows the shop', await ev(() => __gs.active.overlay.querySelectorAll('.chip').length === 2));

  // Win: reaching the goal pays double the first time, once per run.
  await ev(() => __gs.start());
  const c1 = await ev(() => { __gs.api(__gs.active).score(__gs.active.def.goal); __gs.api(__gs.active).score(__gs.active.def.goal + 5); return __gs.progress.credits; });
  check('first win pays double reward', c1 === 20, `credits=${c1}`);
  check('trophy "First Win" granted', await ev(() => __gs.progress.hasTrophy('first-win')));
  await p.waitForTimeout(50);
  check('win toast shown', await ev(() => !!__gs.active.el.querySelector('.toast.win')));
  await ev(() => __gs.api(__gs.active).over()); await p.waitForTimeout(500);
  check('game-over screen shows the win', await ev(() => !!__gs.active.overlay.querySelector('.ov-win')));
  await p.waitForTimeout(600);
  await ev(() => __gs.start());
  const c2 = await ev(() => { __gs.api(__gs.active).score(__gs.active.def.goal); __gs.api(__gs.active).over(); return __gs.progress.credits; });
  check('second win pays normal reward', c2 === 30, `credits=${c2}`);
  await p.waitForTimeout(500);

  // Shop: buy a boost, it is used on the next run and the game sees it.
  await p.click('.slide .chip[data-item="wide"]');
  check('buying a boost spends credits', await ev(() => __gs.progress.credits) === 10);
  check('trophy "Shopper" granted', await ev(() => __gs.progress.hasTrophy('first-buy')));
  await ev(() => __gs.start());
  check('boost active on next run', await ev(() => __gs.api(__gs.active).has('wide')));
  check('boost used up', await ev(() => __gs.progress.owned('stack', { id: 'wide' })) === 0);
  await ev(() => __gs.api(__gs.active).over()); await p.waitForTimeout(1100);
  await p.click('.slide .chip[data-item="gold"]');
  check('cannot buy what you cannot afford', await ev(() => __gs.progress.credits) === 10);

  // Merge: two devices' saves add up instead of overwriting each other.
  const merged = await ev(() => {
    const other = { v: 1, bests: { stack: 99 }, trophies: { 'wins-10': 1 }, by: { otherDevice: { earned: 50, spent: 0, wins: { worm: 2 }, plays: { worm: 3 }, bought: {}, used: {} } } };
    __gs.progress.merge(other); __gs.progress.merge(other);   // merging twice must not double count
    return { credits: __gs.progress.credits, wins: __gs.progress.totalWins(), won: __gs.progress.gamesWon(), best: __gs.progress.best('stack'), t: __gs.progress.hasTrophy('wins-10') };
  });
  check('merge adds the other device credits once', merged.credits === 60, JSON.stringify(merged));
  check('merge adds wins and keeps bests and trophies', merged.wins === 4 && merged.won === 2 && merged.best === 99 && merged.t);

  // Other modules (game ratings) can ride inside the save.
  const sec = await ev(() => {
    let got = null; __gs.progress.section('test', { snapshot: () => ({ a: 1 }), merge: o => { got = o; } });
    const blob = JSON.parse(__gs.progress.serialize()); __gs.progress.merge({ test: { b: 2 } });
    return { inBlob: blob.test?.a === 1, merged: got?.b === 2 };
  });
  check('save sections are saved and merged', sec.inBlob && sec.merged, JSON.stringify(sec));

  // Panel opens from the rail.
  await p.click('.slide .walletbtn'); await p.waitForTimeout(100);
  check('credits panel opens', await ev(() => document.getElementById('wallet').open));
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/wallet-panel.png` });

  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); server.httpServer.close();
  process.exit(failed ? 1 : 0);
})();
