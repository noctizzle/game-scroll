// Bee Keeper: run a beehive for one summer. Share your bees between three jobs with the + and - buttons:
// foragers bring nectar, builders make comb to store it, guards fight off wasps. Honey hatches new bees,
// and a full jar scores. Too few guards when the wasps come and you lose bees and honey.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { PAL } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd } = gs.util;

const R = PAL.amber;
let W = 160, H = 160;
const JOBS = ['FORAGE', 'BUILD', 'GUARD'];

function make(api) {
  const feel = new Feel({ pixel: true });
  let jobs, honey, comb, jars, day, t, wasp, waspT, msg, ml, ended, hatch, fly;
  const total = () => jobs[0] + jobs[1] + jobs[2];
  const row = i => 96 + i * 18;

  return {
    reset() { jobs = [3, 1, 1]; honey = 0; comb = 20; jars = 0; day = 0; t = 0; wasp = null; waspT = 18; msg = ''; ml = 0; ended = false; hatch = 0; fly = []; feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; day = Math.floor(t / 15) + 1;
      // the summer's weather: some days the flowers give more
      const bloom = .7 + Math.sin(t / 15 * 1.3) * .3;
      honey = Math.min(comb, honey + jobs[0] * .45 * bloom * dt);
      comb = Math.min(200, comb + jobs[1] * .6 * dt);
      // honey hatches new bees (foragers by default)
      hatch += dt * Math.min(1, honey / 30) * .15;
      if (hatch >= 1 && total() < 30) { hatch = 0; jobs[0]++; honey = Math.max(0, honey - 4); sfx(900, .03, 'square', .02); }
      if (Math.random() < dt * jobs[0]) fly.push({ x: 40, y: 60, tx: rnd(90, W - 6), ty: rnd(20, 70), l: 1.2 });
      for (const f of fly) { f.l -= dt; f.x += (f.tx - f.x) * dt * 2; f.y += (f.ty - f.y) * dt * 2; } fly = fly.filter(f => f.l > 0);
      // wasps raid now and then, bigger each time
      waspT -= dt;
      if (waspT <= 0 && !wasp) { wasp = { n: 2 + Math.floor(t / 20), l: 3 }; msg = 'WASPS!'; ml = 2; haptic('warning'); sfx(180, .4, 'sawtooth', .04, 40); }
      if (wasp) {
        wasp.l -= dt;
        if (wasp.l <= 0) {
          const g = jobs[2] * 1.5;
          if (g >= wasp.n) { msg = 'GUARDS WON'; ml = 1.5; notes('E5 G5', { len: .06 }); }
          else { const lose = Math.min(total() - 1, Math.ceil((wasp.n - g) / 2)); for (let i = 0; i < lose; i++) { const j = jobs[0] ? 0 : jobs[1] ? 1 : 2; jobs[j]--; } honey *= .5; msg = `RAID! -${lose} BEES`; ml = 1.8; feel.hurt(40, 60); haptic('error'); }
          wasp = null; waspT = rnd(14, 20);
        }
      }
      if (t >= 150 && !ended) { ended = true; notes('C5 E5 G5 C6', { len: .07 }); api.over(); }
    },
    draw(c) {
      c.fillStyle = R[3]; c.fillRect(0, 0, W, H);
      // flowers
      for (let i = 0; i < 8; i++) { const x = 92 + (i % 4) * 18, y = 30 + Math.floor(i / 4) * 34; c.fillStyle = R[1]; c.fillRect(x, y + 4, 1, 10); c.fillStyle = R[2]; c.fillRect(x - 3, y - 1, 7, 5); c.fillRect(x - 1, y - 3, 3, 9); c.fillStyle = R[0]; c.fillRect(x, y + 1, 1, 1); }
      feel.begin(c);
      // the hive: rows of cells filling with honey
      const cells = 24, built = Math.round(cells * Math.min(1, comb / 200));
      for (let i = 0; i < cells; i++) { const x = 8 + (i % 6) * 11 + (Math.floor(i / 6) % 2 ? 5 : 0), y = 22 + Math.floor(i / 6) * 10; c.fillStyle = i < built ? R[0] : R[2]; c.fillRect(x, y, 10, 9); if (i < built) { c.fillStyle = i < Math.round(built * honey / Math.max(1, comb)) ? R[1] : R[3]; c.fillRect(x + 1, y + 1, 8, 7); } }
      for (const f of fly) { c.fillStyle = R[0]; c.fillRect(Math.round(f.x), Math.round(f.y), 2, 1); }
      if (wasp) for (let i = 0; i < wasp.n; i++) { const x = Math.round(70 + Math.sin(t * 5 + i) * 20 + i * 3), y = Math.round(40 + Math.cos(t * 4 + i * 2) * 14); c.fillStyle = R[0]; c.fillRect(x, y, 4, 2); c.fillStyle = R[1]; c.fillRect(x + 1, y, 1, 2); }
      feel.end(c, W, H);
      // jobs
      JOBS.forEach((j, i) => {
        const y = row(i);
        text(c, j, 6, y, { color: R[0] }); text(c, String(jobs[i]), 72, y, { align: 'right', color: R[0] });
        c.fillStyle = R[1]; c.fillRect(82, y - 3, 14, 12); c.fillRect(100, y - 3, 14, 12); text(c, '-', 89, y, { align: 'center', color: R[3] }); text(c, '+', 107, y, { align: 'center', color: R[3] });
      });
      // jar button
      const can = honey >= 20; c.fillStyle = can ? R[0] : R[2]; c.fillRect(120, 94, 36, 50); c.fillStyle = R[3]; c.fillRect(126, 106, 24, 30); c.fillStyle = can ? R[1] : R[2]; c.fillRect(126, 136 - Math.round(30 * Math.min(1, honey / 20)), 24, Math.round(30 * Math.min(1, honey / 20))); text(c, 'JAR', 138, 97, { align: 'center', color: R[3] });
      text(c, `${jars}`, 4, 3, { color: R[0] }); text(c, `DAY ${day}/10`, W - 4, 3, { align: 'right', color: R[0] });
      text(c, `HONEY ${Math.floor(honey)}/${Math.floor(comb)}`, 6, 82, { color: R[1] });
      if (ml > 0) text(c, msg, W / 2, 150, { align: 'center', color: R[0] });
      else if (t < 8) text(c, 'SHARE OUT YOUR BEES', W / 2, 150, { align: 'center', color: R[1] });
    },
    down(x, y) {
      if (x > 118 && y > 90 && y < 146) { if (honey >= 20) { honey -= 20; jars++; api.score(jars); notes('C5 G5', { len: .06 }); feel.coin(138, 110); haptic('success'); } else sfx(150, .06, 'square', .02); return; }
      for (let i = 0; i < 3; i++) {
        const ry = row(i); if (y < ry - 5 || y > ry + 11) continue;
        if (x > 80 && x < 98) { if (jobs[i] > 0) { const to = i === 0 ? 1 : 0; jobs[i]--; jobs[to]++; sfx(500, .03, 'square', .02); haptic('tick'); } }
        if (x > 98 && x < 116) { const from = [0, 1, 2].filter(k => k !== i && jobs[k] > 0).sort((a, b) => jobs[b] - jobs[a])[0]; if (from != null) { jobs[from]--; jobs[i]++; sfx(700, .03, 'square', .02); haptic('tick'); } }
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'bee-keeper',
  title: 'Bee Keeper',
  tag: 'Pocket · Sim',
  retro: true, pal: 'amber',
  w: 160, h: 160, maxW: 220, maxH: 240,
  goal: 12,
  hint: 'Use + and - to share bees between foraging, building comb and guarding. Tap the jar when it is full to score. Too few guards when wasps raid costs bees and honey.',
  make,
};
