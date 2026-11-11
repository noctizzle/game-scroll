import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { Ready } = gs.rounds;
const { clamp, rnd } = gs.util;
const { backdrop, glow } = gs.gfx;
const { brick, stud, brick3d, stud3d } = gs.bricks;
const { View, G: GEO, part, grp, blob, flat, THREE } = gs.toon;
const { Group } = THREE;

// Two brick heroes share one run. Swipe down to tag between them. The big BRUISER smashes grey
// walls and silver crates but jumps low. The little SPARK double-jumps over wide gaps and ducks
// through low vents but bounces off walls. Tap to jump. Pick the right hero before each obstacle
// and grab studs on the way.
const G = 620;
let W = 192, H = 144;

function make(api) {
  let who, p, obs, studsL, cam, genX, dist, studs, hp, t, parts, msg, dead, inv, sw, tagT;
  const ready = new Ready({ eat: false });                              // the run starts with the first tap
  const gy = () => H - 18;
  const HERO = { big: { jump: 210, jumps: 1, h: 20, w: 12 }, small: { jump: 230, jumps: 2, h: 11, w: 8 } };
  let v3;
  function hero(big) {
    const g = new Group(), legs = [-1, 1].map(sx => { const l = new Group(); l.position.set(sx * (big ? 2.4 : 1.4), big ? 6 : 4, 0); l.add(part(GEO.box, big ? '#383840' : '#2c64c8', { sx: big ? 3.6 : 2, sy: big ? 6 : 4, sz: big ? 3.6 : 2.4, y: big ? -3 : -2 })); return l; });
    if (big) g.add(...legs, part(GEO.box, '#d83a2c', { sx: 14, sy: 10, sz: 8, y: 11 }), part(GEO.cyl, '#f0c020', { sx: 4, sy: 7, sz: 4, y: 19.5 }), part(GEO.box, '#585868', { sx: 10, sy: 3, sz: 8, y: 23.5 }), part(GEO.box, '#f0c020', { sx: 3, sy: 5, sz: 3, x: 8.5, y: 11 }));
    else g.add(...legs, part(GEO.box, '#38a040', { sx: 6, sy: 5, sz: 4, y: 6.5 }), part(GEO.cyl, '#f0c020', { sx: 3, sy: 5, sz: 3, y: 11.5 }), part(GEO.cyl, '#f07818', { sx: 3.4, sy: 1.6, sz: 3.4, y: 14 }));
    const ring = part(GEO.ring, flat('#f0c020', .9), { s: 1, y: big ? 10 : 6 }); ring.visible = false; g.add(ring);
    g.userData = { legs, ring }; return g;
  }
  function view3d() {
    if (!v3) {
      v3 = new View({ bg: '#2a1c44', sun: [-.4, .9, .9], sunI: 2.3, amb: .9, sky: '#d0b0ff', ground: '#302040' });
      v3.add(part(GEO.ball, '#f8e0b0', { s: 22, x: 40, y: 60, z: -200, glow: 1, line: false }));
      for (let i = 0; i < 3; i++) v3.def('tower' + i, () => { const h = 50 + i * 16, b = brick3d(i % 2 ? 'blue' : 'black', 30, h, 20, 0); for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) b.add(part(GEO.box, '#f0c020', { sx: 3, sy: 4, sz: 1, x: -8 + j * 8, y: 12 + k * 14, z: 10.2, glow: .8, line: false })); return b; });
      v3.def('ground', () => { const b = brick3d('grey', 16, 30, 30, 8); b.position.y = -30; return grp(b); });
      v3.def('wall', () => { const g = new Group(); g.add(brick3d('grey', 10, 6, 12, 5)); return g; });
      v3.def('crate', () => brick3d('white', 14, 14, 14, 7));
      v3.def('vent', () => grp(brick3d('orange', 36, 30, 20, 8), part(GEO.box, '#505058', { sx: 36, sy: 3, sz: 20, y: -1.5 })));
      v3.def('silver', () => stud3d('silver', 2.5)).def('gold', () => stud3d('gold', 3.5));
      v3.def('big', () => hero(true)).def('small', () => hero(false));
    }
    v3.side(W, H, 36, 0, H * .25); return v3;
  }
  function gen(to) {
    const lvl = Math.min(1, dist / 4000);
    while (genX < to) {
      const r = Math.random(), x = genX;
      if (genX < 160) { genX += 40; continue; }
      if (r < .22) { obs.push({ k: 'wall', x, w: 10, h: 999 }); for (let i = 0; i < 3; i++) studsL.push({ x: x + 20 + i * 10, y: gy() - 8 }); }
      else if (r < .42) { obs.push({ k: 'vent', x, w: 36 + lvl * 20, h: 13 }); for (let i = 0; i < 3; i++) studsL.push({ x: x + 8 + i * 10, y: gy() - 6 }); }
      else if (r < .6) { const w = rnd(40, 52 + lvl * 10); obs.push({ k: 'gap', x, w }); for (let i = 0; i < 4; i++) studsL.push({ x: x + w * (i + .5) / 4, y: gy() - 40 - Math.sin((i + .5) / 4 * Math.PI) * 14 }); }
      else if (r < .72) { obs.push({ k: 'crate', x, w: 14, h: 14, hp: 1 }); }
      else if (r < .84) { const w = rnd(14, 22); obs.push({ k: 'pit', x, w }); }
      else { for (let i = 0; i < 5; i++) studsL.push({ x: x + i * 10, y: gy() - 8 - (i % 2) * 6, gold: i === 2 }); }
      const last = obs[obs.length - 1]; genX = Math.max(genX + 40, last && last.x >= x ? last.x + (last.w || 0) : x) + rnd(50, 90) - lvl * 15;
    }
  }
  const solidAt = x => !obs.some(o => (o.k === 'gap' || o.k === 'pit') && x > o.x + 2 && x < o.x + o.w - 2);
  function hurt(txt) { if (inv > 0) return; hp--; inv = 1.4; haptic('heavy'); sfx(140, .3, 'sawtooth', .05, -60); msg = { txt, l: 1 }; if (hp <= 0) { dead = .01; sfx(100, .7, 'square', .05, -40); } }
  function burst(x, y, col, n = 10) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-60, 60), vy: rnd(-90, 0), l: .5, col }); }
  const score = () => Math.floor(dist / 10) + studs;
  const self = {
    reset() { who = 'big'; p = { x: 30, y: gy(), vy: 0, ground: true, jumps: 0 }; obs = []; studsL = []; cam = 0; genX = 0; dist = 0; studs = 0; hp = 3; t = 0; parts = []; msg = { txt: 'SWIPE DOWN TO TAG', l: 2.2 }; dead = 0; inv = 0; sw = null; tagT = 0; gen(W + 200); ready.reset(); },
    resize(w, h) { const dy = h - H; W = w; H = h; if (p && dy) { p.y += dy; for (const s of studsL) s.y += dy; } },
    update(dt) {
      if (!ready.update(dt)) return;
      t += dt; tagT = Math.max(0, tagT - dt); for (const q of parts) { q.l -= dt; if (q.vx != null) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; } else q.y -= 14 * dt; } parts = parts.filter(q => q.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; p.vy += G * dt; p.y += p.vy * dt; if (dead > 1.4) api.over(); return; }
      inv = Math.max(0, inv - dt);
      const sp = 58 + Math.min(40, dist / 100), Hh = HERO[who];
      let nx = p.x + sp * dt;
      // walls and crates block unless the bruiser smashes them; vents block the bruiser
      for (const o of obs) {
        if (o.broken) continue;
        if ((o.k === 'wall' || o.k === 'crate') && nx + Hh.w / 2 > o.x && p.x + Hh.w / 2 <= o.x + 1 && p.y > gy() - o.h) {
          if (who === 'big') { o.broken = true; burst(o.x + o.w / 2, gy() - Math.min(o.h, 30) / 2, o.k === 'crate' ? '#c8ccd4' : '#8c9098', 14); haptic('medium'); sfx(180, .15, 'square', .06, -80); if (o.k === 'crate') { for (let i = 0; i < 4; i++) studsL.push({ x: o.x + rnd(-6, 20), y: gy() - rnd(6, 24), gold: i === 0 }); } }
          else { nx = o.x - Hh.w / 2; if (o.k === 'wall') { hurt('BONK! TAG THE BRUISER'); p.x -= 14; nx = p.x; } }
        }
        if (o.k === 'vent' && nx + Hh.w / 2 > o.x && p.x < o.x + o.w - 2 && p.y - Hh.h < gy() - o.h + 1) {
          if (who === 'big' && !o.hit) { o.hit = true; hurt('TOO BIG! TAG SPARK'); }
        }
      }
      p.x = nx; dist = Math.max(dist, p.x - 30);
      p.vy += G * dt; p.y += p.vy * dt;
      const vent = obs.find(o => o.k === 'vent' && p.x > o.x - 2 && p.x < o.x + o.w);
      if (vent && who === 'small' && p.y - Hh.h < gy() - vent.h) { p.y = gy() - vent.h + Hh.h; p.vy = Math.max(0, p.vy); }
      if (p.y >= gy() && p.vy >= 0 && solidAt(p.x)) { if (p.y - p.vy * dt <= gy() + 2) { p.y = gy(); p.vy = 0; p.ground = true; p.jumps = 0; } }
      else p.ground = false;
      if (p.y > H + 20) { hurt('FELL!'); if (!dead) { const o = obs.find(o => (o.k === 'gap' || o.k === 'pit') && o.x < p.x && o.x + o.w + 20 > p.x); p.x = o ? o.x + o.w + 8 : p.x + 20; p.y = gy() - 30; p.vy = 0; } }
      for (const s of studsL) if (!s.got && Math.abs(s.x - p.x) < 8 && Math.abs(s.y - (p.y - Hh.h / 2)) < Hh.h / 2 + 6) { s.got = true; studs += s.gold ? 10 : 1; sfx(s.gold ? 1500 : 1250, .03, 'square', .02, 200); }
      cam = p.x - W * .25; gen(cam + W + 200);
      obs = obs.filter(o => o.x + (o.w || 0) > cam - 60); studsL = studsL.filter(s => s.x > cam - 20 && !s.got);
      api.score(score());
    },
    draw(c) {
      const ox = -Math.round(cam), g = gy(), v = view3d(); v.frame();
      for (let i = 0; i < 8; i++) { const x = ((i * 70 - cam * .3) % (W + 140) + W + 140) % (W + 140) - 70; v.put('tower' + (i % 3), v.sv(x, g, -60 - (i % 2) * 20)); }
      const gx = Math.floor(cam / 16) * 16;
      for (let x = gx - 32; x < cam + W + 48; x += 16) { if (!solidAt(x + 8) && !solidAt(x + 2)) continue; v.put('ground', v.sv(x + ox + 8, g, 0)); }
      for (const o of obs) {
        const x = o.x + ox; if (x > W + 40 || x + (o.w || 0) < -40) continue;
        if (o.k === 'wall' && !o.broken) v.put('wall', v.sv(x + o.w / 2, g, 0), { sy: (g - 6) / 6 });
        if (o.k === 'crate' && !o.broken) v.put('crate', v.sv(x + o.w / 2, g, 0));
        if (o.k === 'vent') v.put('vent', v.sv(x + o.w / 2, g - o.h, 0), { sx: o.w / 36 });
      }
      for (const st of studsL) { const x = st.x + ox; if (x > -10 && x < W + 10) v.put(st.gold ? 'gold' : 'silver', v.sv(x, st.y, 0), { ry: t * 4 + st.x * .1 }); }
      if (!(inv > 0 && (t * 14 | 0) % 2)) {
        const h = v.put(who, v.sv(p.x + ox, p.y, 0), { ry: Math.PI / 2 }), run = p.ground;
        h.userData.legs.forEach((l, i) => l.rotation.x = run ? Math.sin(t * 18 + i * Math.PI) * .7 : -.5 + i);
        h.userData.ring.visible = tagT > 0; if (tagT > 0) h.userData.ring.scale.setScalar(14 * (1 - tagT / .3) + 4);
      }
      v.render(c, W, H);
      for (const q of parts) { c.fillStyle = q.col; c.fillRect(q.x + ox, q.y, 2, 2); }
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#00000080'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; for (let i = 0; i < 3; i++) { c.fillStyle = i < hp ? '#f84858' : '#403848'; c.fillRect(4 + i * 8, 3, 6, 6); }
      c.fillStyle = who === 'big' ? '#f86048' : '#60d070'; c.fillText(who === 'big' ? 'BRUISER' : 'SPARK', 32, 9);
      c.textAlign = 'right'; c.fillStyle = '#f8f8f0'; c.fillText(String(score()), W - 4, 9);
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .4 - 9, W, 13); c.fillStyle = '#f0c020'; c.fillText(msg.txt, W / 2, H * .4); }
      ready.draw(c, W, H, { text: 'TAP TO RUN', pixel: true, color: '#f8f8f0', shadow: '#101018', y: Math.round(H * .62) });
    },
    down(x, y) { ready.go(); sw = { x, y, used: false }; },
    move(x, y, pr) { if (!pr || !sw || sw.used) return; if (y - sw.y > 18 && Math.abs(y - sw.y) > Math.abs(x - sw.x)) { sw.used = true; self.tag(); } else if (sw.y - y > 18) { sw.used = true; self.jump(); } },
    up() { if (sw && !sw.used) self.jump(); sw = null; },
    jump() { if (dead) return; const Hh = HERO[who]; if (p.ground || p.jumps < Hh.jumps) { if (!p.ground && p.jumps === 0) p.jumps = 1; p.vy = -Hh.jump * (p.jumps ? .85 : 1); p.jumps++; p.ground = false; sfx(who === 'big' ? 300 : 600, .07, 'square', .04, 300); haptic('light'); } },
    tag() {
      if (dead) return; const n = who === 'big' ? 'small' : 'big';
      if (n === 'big' && obs.some(o => o.k === 'vent' && p.x > o.x - 4 && p.x < o.x + o.w + 4)) return; // no room to grow in a vent
      who = n; tagT = .3; haptic('medium'); sfx(n === 'big' ? 220 : 880, .1, 'square', .05, n === 'big' ? -60 : 300);
    },
    key(k, d) { if (!d) return; ready.go(); if (k === ' ' || k === 'ArrowUp') self.jump(); if (k === 'ArrowDown' || k === 'Tab' || k === 'x') self.tag(); },
  };
  return self;
}

export default {
  id: 'tag-team', title: 'Tag Team', tag: 'Bricks · Runner', retro: true, era: 'console', pal: 'grape', w: 192, h: 144, maxW: 320, maxH: 220, goal: 300,
  hint: 'Tap to jump, swipe down to tag between heroes. The big red BRUISER smashes grey walls and silver crates. The little green SPARK double-jumps wide gaps and fits through low vents. The wrong hero gets hurt, so tag before you get there.',
  make,
};
