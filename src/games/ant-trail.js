// Ant Trail: draw a scent trail from the anthill to a crumb, and the ants march along it, pick up the
// food and carry it home. Trails fade, crumbs run out, rain leaves puddles, and a spider prowls; steer
// the line round them all. Every crumb home scores, and the colony grows. Lose all the ants and it ends.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd, clamp } = gs.util;

let W = 160, H = 192;
const K = C16;

function make(api) {
  const feel = new Feel({ pixel: true });
  let nest, ants, home, crumbs, puddles, spider, trails, drawing, score, t, spawn, rainT, lost, ended;

  function addCrumb() { for (let k = 0; k < 30; k++) { const p = { x: Math.round(rnd(14, W - 14)), y: Math.round(rnd(20, H - 60)), n: 4 + (Math.random() * 4 | 0) }; if (Math.hypot(p.x - nest.x, p.y - nest.y) > 60 && puddles.every(q => Math.hypot(q.x - p.x, q.y - p.y) > q.r + 10)) { crumbs.push(p); return; } } }
  const resample = pts => { const out = [pts[0]]; for (const p of pts) { const l = out[out.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) >= 3) out.push(p); } return out; };

  return {
    reset() {
      nest = { x: 24, y: H - 26 }; ants = []; home = 8; crumbs = []; puddles = []; trails = []; drawing = null; score = 0; t = 0; spawn = 0; rainT = 12; lost = 0; ended = false;
      spider = { x: W - 20, y: 30, tx: W / 2, ty: H / 2, wait: 0 };
      addCrumb(); addCrumb(); feel.clear();
    },
    resize(w, h) { W = w; H = h; nest.y = H - 26; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      for (const tr of trails) tr.life -= dt; trails = trails.filter(tr => tr.life > 0);
      // ants leave the hill onto a trail that starts there
      const live = trails.filter(tr => tr.from);
      spawn -= dt;
      if (spawn <= 0 && home > 0 && live.length) { const tr = live[live.length - 1]; ants.push({ tr, i: 0, dir: 1, x: nest.x, y: nest.y, carry: false }); home--; spawn = .6; }
      for (const a of ants) {
        if (a.dead) continue;
        const pts = a.tr.pts;
        if (a.dir === 0) { // lost the trail: wander home
          const dx = nest.x - a.x, dy = nest.y - a.y, d = Math.hypot(dx, dy) || 1; a.x += dx / d * 18 * dt + rnd(-10, 10) * dt; a.y += dy / d * 18 * dt + rnd(-10, 10) * dt;
          if (d < 6) { a.home = true; if (a.carry) deliver(a); }
          continue;
        }
        a.i += a.dir * 9 * dt;
        const k = clamp(Math.floor(a.i), 0, pts.length - 1); a.x = pts[k].x; a.y = pts[k].y;
        if (a.dir > 0 && a.i >= pts.length - 1) {
          const c = crumbs.find(q => q.n > 0 && Math.hypot(q.x - a.x, q.y - a.y) < 12);
          if (c) { c.n--; a.carry = true; sfx(900, .02, 'square', .02); }
          a.dir = -1;
        }
        if (a.dir < 0 && a.i <= 0) { if (Math.hypot(a.x - nest.x, a.y - nest.y) < 10) { a.home = true; if (a.carry) deliver(a); else home++; } else a.dir = 0; }
        if (a.tr.life <= 0 && a.dir !== 0) a.dir = 0;
        for (const p of puddles) if (Math.hypot(p.x - a.x, p.y - a.y) < p.r) { a.dead = true; lost++; sfx(300, .08, 'sine', .02, -200); }
        if (Math.hypot(spider.x - a.x, spider.y - a.y) < 7) { a.dead = true; lost++; haptic('warning'); feel.hurt(a.x, a.y); }
      }
      ants = ants.filter(a => !a.dead && !a.home);
      crumbs = crumbs.filter(c => c.n > 0); while (crumbs.length < 2) addCrumb();
      // rain makes puddles now and then; they dry up
      rainT -= dt; if (rainT <= 0) { rainT = rnd(10, 16); puddles.push({ x: Math.round(rnd(30, W - 20)), y: Math.round(rnd(30, H - 50)), r: Math.round(rnd(8, 16)), l: 18 }); sfx(200, .4, 'sine', .02); }
      for (const p of puddles) p.l -= dt; puddles = puddles.filter(p => p.l > 0);
      // the spider strolls about, faster as time goes on
      if (spider.wait > 0) spider.wait -= dt; else { const dx = spider.tx - spider.x, dy = spider.ty - spider.y, d = Math.hypot(dx, dy); if (d < 3) { spider.tx = rnd(10, W - 10); spider.ty = rnd(20, H - 40); spider.wait = rnd(1, 3); } else { const sp = 14 + Math.min(20, t / 6); spider.x += dx / d * sp * dt; spider.y += dy / d * sp * dt; } }
      if (home + ants.length <= 0 && !ended) { ended = true; feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = K[5]; c.fillRect(0, 0, W, H);
      c.fillStyle = K[6]; for (let i = 0; i < 60; i++) c.fillRect((i * 37) % W, (i * 53) % H, 2, 1);
      for (const p of puddles) { c.fillStyle = K[7]; c.fillRect(p.x - p.r, p.y - Math.round(p.r * .6), p.r * 2, Math.round(p.r * 1.2)); c.fillStyle = K[14]; c.fillRect(p.x - p.r + 3, p.y - 2, 4, 1); }
      // trails: dotted scent, fading
      for (const tr of trails) { c.fillStyle = tr.life < 3 && Math.floor(t * 6) % 2 ? K[6] : K[4]; tr.pts.forEach((p, i) => { if (i % 2 === 0) c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }); }
      if (drawing) { c.fillStyle = K[1]; drawing.forEach(p => c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)); }
      // anthill and crumbs
      c.fillStyle = K[11]; c.fillRect(nest.x - 12, nest.y - 4, 24, 8); c.fillRect(nest.x - 8, nest.y - 8, 16, 4); c.fillStyle = K[0]; c.fillRect(nest.x - 2, nest.y - 7, 4, 3);
      for (const q of crumbs) { c.fillStyle = K[14]; for (let i = 0; i < q.n; i++) c.fillRect(q.x - 4 + (i % 3) * 3, q.y - 2 + Math.floor(i / 3) * 3, 2, 2); }
      feel.begin(c);
      for (const a of ants) { c.fillStyle = K[0]; c.fillRect(Math.round(a.x) - 1, Math.round(a.y), 3, 1); if (a.carry) { c.fillStyle = K[1]; c.fillRect(Math.round(a.x), Math.round(a.y) - 1, 1, 1); } }
      const sx = Math.round(spider.x), sy = Math.round(spider.y), leg = Math.floor(t * 8) % 2;
      c.fillStyle = K[0]; c.fillRect(sx - 3, sy - 2, 6, 5); for (let i = -1; i <= 1; i++) { c.fillRect(sx - 6, sy + i * 2 - leg, 3, 1); c.fillRect(sx + 3, sy + i * 2 + leg, 3, 1); } c.fillStyle = K[2]; c.fillRect(sx - 1, sy - 1, 1, 1); c.fillRect(sx + 1, sy - 1, 1, 1);
      feel.end(c, W, H);
      text(c, `${score}`, 4, 3, { color: K[0] });
      text(c, `ANTS ${home + ants.length}`, W - 4, 3, { align: 'right', color: K[0] });
      if (t < 6 && !trails.length) text(c, 'DRAW FROM THE HILL TO A CRUMB', W / 2, H - 10, { align: 'center', color: K[0], font: 'small' });
    },
    down(x, y) { drawing = [{ x, y }]; },
    move(x, y, pr) { if (pr && drawing) { const l = drawing[drawing.length - 1]; if (Math.hypot(x - l.x, y - l.y) > 1.5) drawing.push({ x, y }); } },
    up() {
      if (!drawing || drawing.length < 4) { drawing = null; return; }
      const pts = resample(drawing); drawing = null;
      const from = Math.hypot(pts[0].x - nest.x, pts[0].y - nest.y) < 18;
      if (from) pts.unshift({ x: nest.x, y: nest.y });
      trails.push({ pts, life: 14, from }); if (trails.length > 3) trails.shift();
      sfx(from ? 700 : 300, .05, 'triangle', .03); haptic(from ? 'light' : 'warning');
    },
  };

  function deliver(a) {
    score++; api.score(score); sfx(1100, .04, 'square', .03);
    if (score % 5 === 0) { home += 2; notes('C5 E5', { len: .05 }); feel.juice.pop(nest.x + 20, nest.y - 14, '+2 ANTS', { color: K[1] }); }
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ant-trail',
  title: 'Ant Trail',
  tag: 'Color · Colony',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 192, maxW: 220, maxH: 260,
  goal: 30,
  hint: 'Draw a trail starting at the anthill and ending on a crumb; ants follow it and carry food home. Trails fade, so redraw them round puddles and the spider.',
  make,
};
