// Tile Isles: a quiet tile-laying game for one. Draw a six-sided tile and lay it beside the island
// you've started: forests are worth more beside forests, fields beside villages, and a lake beside
// anything it can water. Each open space shows what the tile in your hand would score there; hold a
// tile back for later with Hold. Twenty tiles, then the sea map is done: 60 points wins.
// The map is a gs.hex HexMap laid on the table, so it also sits on your floor in AR.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { HexMap } = gs.hex;
const { rng } = gs.math;
const { Table, slab, dot, fuse, sounds } = gs.tabletop;
const { pbr } = gs.hd;
const { Mesh, Group, CylinderGeometry, ConeGeometry, BoxGeometry } = gs.THREE;

let W = 300, H = 460;
const GOAL = 60, SIZE = .64, FOREST = 0, FIELD = 1, VILLAGE = 2, LAKE = 3;
const KIND = [{ name: 'Forest', col: '#3f8f4c' }, { name: 'Field', col: '#dcb948' }, { name: 'Village', col: '#c9a07a' }, { name: 'Lake', col: '#3f9fdc' }];
const PAIR = [[1, 0, 0, 1], [0, 0, 2, 1], [0, 2, 0, 1], [1, 1, 1, 0]];   // what a tile scores for each neighbour: PAIR[tile][neighbour]
const BAG = [FOREST, FOREST, FOREST, FOREST, FOREST, FOREST, FIELD, FIELD, FIELD, FIELD, FIELD, FIELD, VILLAGE, VILLAGE, VILLAGE, VILLAGE, VILLAGE, LAKE, LAKE, LAKE];

function icon(c, x, y, r, t) {                                      // a tile as a small picture for the HUD
  c.save(); c.translate(x, y);
  c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
  c.fillStyle = KIND[t].col; c.fill(); c.strokeStyle = '#ffffffcc'; c.lineWidth = 1.2; c.stroke();
  if (t === FOREST) { c.fillStyle = '#1f5a2c'; for (const [dx, dy, s] of [[-.3, .1, .42], [.3, .15, .38], [0, -.2, .5]]) { c.beginPath(); c.moveTo(dx * r, (dy - s) * r); c.lineTo((dx + s * .55) * r, (dy + s * .5) * r); c.lineTo((dx - s * .55) * r, (dy + s * .5) * r); c.fill(); } }
  else if (t === FIELD) { c.strokeStyle = '#a07a1c'; c.lineWidth = r * .1; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-r * .5, i * r * .3); c.lineTo(r * .5, i * r * .3); c.stroke(); } }
  else if (t === VILLAGE) { c.fillStyle = '#f4ead8'; c.fillRect(-r * .34, -r * .08, r * .68, r * .46); c.fillStyle = '#b8402e'; c.beginPath(); c.moveTo(-r * .48, -r * .06); c.lineTo(0, -r * .52); c.lineTo(r * .48, -r * .06); c.fill(); }
  else { c.strokeStyle = '#e4f4ff'; c.lineWidth = r * .1; for (const dy of [-.18, .18]) { c.beginPath(); c.moveTo(-r * .5, dy * r); c.quadraticCurveTo(-r * .25, (dy - .2) * r, 0, dy * r); c.quadraticCurveTo(r * .25, (dy + .2) * r, r * .5, dy * r); c.stroke(); } }
  c.restore();
}

function make(api) {
  let T, map, cells, home, protos, tiles, marks, bag, seed, at, now, held, score, state, placed, pops, open;

  function setup() {
    T = new Table(api, { span: 9, room: 'sunroom', pitch: 61, frame: [8.9, 8.1] });
    map = new HexMap({ size: SIZE, shape: 'hex', radius: 3, cx: 0, cy: 0 });
    cells = map.list; home = map.at(0, 0); cells.forEach((c, i) => { c.data.i = i; c.data.near = map.neighbours(c); });
    T.board.add(slab({ w: 8.3, d: 7.5, rim: .25, wood: '#b08a5a', rough: .3, paint(g, Z) {         // the sea chart: water, and a faint space for every tile
      const c = g.col, X = x => (x / 8.3 + .5) * Z, Y = z => (z / 7.5 + .5) * Z;
      const gr = c.createRadialGradient(Z / 2, Z / 2, Z * .1, Z / 2, Z / 2, Z * .72); gr.addColorStop(0, '#4fb0d8'); gr.addColorStop(1, '#2b78b0'); c.fillStyle = gr; c.fillRect(0, 0, Z, Z);
      c.strokeStyle = '#ffffff'; c.lineCap = 'round';
      for (let i = 0; i < 260; i++) { const x = Math.random() * Z, y = Math.random() * Z, w = 8 + Math.random() * 22; c.globalAlpha = .08 + Math.random() * .14; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 4, x + w, y); c.stroke(); }
      for (const cell of cells) {
        c.globalAlpha = .34; c.lineWidth = Z / 420; c.beginPath(); cell.corners.forEach(([x, y], k) => (k ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)))); c.closePath(); c.stroke();
        c.globalAlpha = .07; c.fillStyle = '#ffffff'; c.fill();
      }
      c.globalAlpha = 1; g.r.fillStyle = '#404040'; g.r.fillRect(0, 0, Z, Z);
    } }));
    // one of each tile, built from simple shapes and joined up; every tile laid is a copy
    const R = SIZE * .95, base = t => { const m = new Mesh(new CylinderGeometry(R, R, .16, 6), pbr(KIND[t].col, t === LAKE ? { rough: .06, clear: 1 } : { rough: .85 })); m.position.y = .08; return m; };
    const put = (g, geo, mat, x, y, z, ry = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); };
    const leaf = pbr('#2a6e38', { rough: .9 }), trunk = pbr('#6a4a2c', { rough: .9 }), wall = pbr('#f2e8d6', { rough: .8 }), roof = pbr('#b8402e', { rough: .7 }), hay = pbr('#c89a2c', { rough: .95 }), rush = pbr('#5a8a3c', { rough: .9 }), sand = pbr('#e6d6a8', { rough: .95 });
    protos = KIND.map((k, t) => {
      const g = new Group(); g.add(base(t));
      if (t === FOREST) for (const [x, z, s] of [[-.22, .12, 1], [.2, .2, .85], [.02, -.24, 1.15], [.3, -.12, .7], [-.3, -.2, .75]]) { put(g, new CylinderGeometry(.03, .04, .14, 5), trunk, x, .22, z); put(g, new ConeGeometry(.15 * s, .36 * s, 7), leaf, x, .28 + .18 * s, z); put(g, new ConeGeometry(.11 * s, .26 * s, 7), leaf, x, .42 + .2 * s, z); }
      if (t === FIELD) { for (let i = -2; i <= 2; i++) put(g, new BoxGeometry(.72 - Math.abs(i) * .12, .035, .07), hay, 0, .175, i * .15); put(g, new ConeGeometry(.09, .16, 8), hay, .26, .24, -.3); }
      if (t === VILLAGE) for (const [x, z, s, ry] of [[-.18, .1, 1, .3], [.2, -.14, .85, -.5], [.14, .26, .7, 1.2]]) { put(g, new BoxGeometry(.24 * s, .18 * s, .2 * s), wall, x, .16 + .09 * s, z, ry); put(g, new ConeGeometry(.2 * s, .16 * s, 4), roof, x, .16 + .26 * s, z, ry + Math.PI / 4); }
      if (t === LAKE) { const rim = new Mesh(new CylinderGeometry(R, R, .1, 6), sand); rim.position.y = .05; rim.scale.set(1.001, 1, 1.001); g.add(rim); g.children[0].scale.set(.86, 1, .86); g.children[0].position.y = .045; for (const [x, z] of [[-.32, .2], [-.26, .28], [.3, -.24]]) put(g, new ConeGeometry(.025, .24, 5), rush, x, .2, z); }
      const f = fuse(g); f.userData.h = .3; return f;
    });
    marks = cells.map(c => { const d = dot('#ffffff', { r: .13, glow: .7 }); d.position.set(c.x, .02, c.y); d.visible = false; T.board.add(d); return d; });
  }
  const worth = (c, t) => 1 + c.data.near.reduce((n, o) => n + (o.data.t != null ? PAIR[t][o.data.t] : 0), 0);
  function stand(c, t) { const m = protos[t].clone(); m.position.set(c.x, 0, c.y); m.rotation.y = Math.floor(Math.random() * 6) * Math.PI / 3; T.board.add(m); tiles.push(m); c.data.t = t; return m; }
  function look() {                                                 // which spaces are open, and what the tile in hand would score on each
    open = state === 'you' && now != null ? cells.filter(c => c.data.t == null && c.data.near.some(o => o.data.t != null)).map(c => ({ c, n: worth(c, now) })) : [];
    marks.forEach(m => { m.visible = false; }); for (const o of open) marks[o.c.data.i].visible = true;
  }
  const keep = () => api.save({ seed, at, now, held, score, p: placed });
  async function lay(c) {
    state = 'busy'; const t = now, n = worth(c, t); look();
    const m = stand(c, t); placed.push(c.data.i, t);
    await T.drop(m, { from: 2.4, time: .34 });
    T.puff({ x: c.x, y: .1, z: c.y }, { n: 8, speed: 1.3, size: .3, col: '#eaf6ff' });
    score += n; api.score(score); pops.push({ x: c.x, z: c.y, text: '+' + n, t: 0 });
    if (n >= 5) { sounds.chime(.8); haptic('success'); } else if (n >= 3) sounds.clink(1.2);
    if (at < bag.length) now = bag[at++]; else { now = held; held = null; }
    if (now == null) {
      state = 'done'; look(); if (score >= GOAL) sounds.gong(); else sounds.thud();
      await T.wait(1.8); api.clearSave(); T.stop(); return api.over();
    }
    state = 'you'; keep(); look();
  }
  function hold() {
    if (state !== 'you') return;
    if (held == null) { if (at >= bag.length) return T.say('That is the last tile'); held = now; now = bag[at++]; } else [now, held] = [held, now];
    sounds.flip(); haptic('light'); keep(); look();
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      for (const m of tiles || []) m.removeFromParent();
      tiles = []; for (const c of cells) c.data.t = null;
      const v = api.load(null), ok = v && Number.isFinite(v.seed) && Array.isArray(v.p) && v.p.length % 2 === 0 && v.p.length < 40 && v.p.every((n, k) => Number.isInteger(n) && n >= 0 && n < (k % 2 ? 4 : cells.length)) && Number.isInteger(v.now) && v.now >= 0 && v.now < 4 && v.at >= 1 && v.at <= BAG.length;
      seed = ok ? v.seed : Math.floor(Math.random() * 1e9); bag = rng(seed).shuffle(BAG);
      stand(home, VILLAGE); placed = ok ? v.p.slice() : [];
      for (let k = 0; k < placed.length; k += 2) if (cells[placed[k]].data.t == null) stand(cells[placed[k]], placed[k + 1]);
      at = ok ? v.at : 1; now = ok ? v.now : bag[0]; held = ok && Number.isInteger(v.held) && v.held >= 0 && v.held < 4 ? v.held : null; score = ok ? Math.max(0, v.score | 0) : 0;
      state = 'you'; pops = []; look(); if (score) api.score(score);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.1);
      marks.forEach((m, i) => { if (m.visible) m.scale.setScalar(1 + Math.sin(T.t * 4 + i) * .12); });
    },
    draw(c) {
      T.draw(c, W, H);
      if (!T.hidden) {
        // the tile in hand, the one after it, and the one held back
        const top = (api.scoreArea?.().bottom ?? 40) + 6, left = BAG.length - at + (now != null ? 1 : 0) + (held != null ? 1 : 0);
        c.save(); c.fillStyle = '#0a0e14c4'; c.beginPath(); c.roundRect(W / 2 - 118, top, 236, 46, 14); c.fill();
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#c8d2e0'; c.font = '700 8px Rubik, sans-serif';
        c.fillText('LAY', W / 2 - 96, top + 38); c.fillText('NEXT', W / 2 - 8, top + 38); c.fillText('HELD', W / 2 + 42, top + 38); c.fillText('LEFT', W / 2 + 92, top + 38);
        if (now != null) { icon(c, W / 2 - 96, top + 17, 14, now); c.fillStyle = '#fff'; c.font = '700 10px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(KIND[now].name, W / 2 - 77, top + 17.5); c.textAlign = 'center'; }
        if (at < bag.length) icon(c, W / 2 - 8, top + 17, 10, bag[at]);
        if (held != null) icon(c, W / 2 + 42, top + 17, 10, held); else { c.strokeStyle = '#ffffff55'; c.setLineDash([3, 3]); c.beginPath(); c.arc(W / 2 + 42, top + 17, 9, 0, 7); c.stroke(); c.setLineDash([]); }
        c.fillStyle = '#fff'; c.font = '800 14px Rubik, sans-serif'; c.fillText(String(left), W / 2 + 92, top + 18);
        T.status(c, W, top + 52, state === 'done' ? (score >= GOAL ? `The isles are charted: ${score}` : `Charted for ${score}. ${GOAL} wins`) : 'Tap a space to lay the tile');
        // what each open space is worth
        c.font = '800 10px Rubik, sans-serif';
        for (const o of open) {
          const [x, y, z] = T.toScreen({ x: o.c.x, y: .05, z: o.c.y }); if (z >= 1) continue;
          c.fillStyle = o.n >= 4 ? '#ffd76a' : '#0a0e14d0'; c.beginPath(); c.arc(x, y, 8.5, 0, 7); c.fill();
          c.fillStyle = o.n >= 4 ? '#1a1206' : '#fff'; c.fillText('+' + o.n, x, y + .5);
        }
        for (const p of pops) {
          const [x, y] = T.toScreen({ x: p.x, y: .6 + p.t * 1.2, z: p.z });
          c.globalAlpha = Math.min(1, (1.1 - p.t) * 3); c.font = '800 17px Rubik, sans-serif'; c.lineWidth = 3; c.strokeStyle = '#0a0e14'; c.strokeText(p.text, x, y); c.fillStyle = '#ffe08a'; c.fillText(p.text, x, y); c.globalAlpha = 1;
        }
        c.restore();
      }
      T.hud(c, W, H, state === 'you' ? [{ id: 'hold', label: held == null ? 'Hold' : 'Swap' }] : []);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap) return;
      if (tap.chip === 'hold') return hold();
      if (tap.chip || state !== 'you' || T.busy) return;
      const p = T.pick(tap.x, tap.y); let c = p && map.at(p.x, p.z);
      if (!c || !open.some(o => o.c === c)) { const k = T.nearest(tap.x, tap.y, open.map(o => ({ x: o.c.x, y: .05, z: o.c.y })), 24); c = k < 0 ? null : open[k].c; }
      if (c) T.run(() => lay(c));
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'tile-isles',
  title: 'Tile Isles',
  tag: 'Board · Tiles',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'calm', vol: .55 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: GOAL,
  hint: 'Tap an open space to lay the tile in your hand; each space shows what it would score. Forests like forests, fields like villages, lakes like anything beside them. Hold keeps a tile for later. 20 tiles: score 60 to win.',
  creator: 'Game Scroll',
  make,
};
