// Living Chess: real chess where the stone pieces are alive. Tap one of yours and it wakes; tap where
// it should go and it walks there by itself. A capture is a fight: the attacker charges and the other
// piece is smashed to rubble. The rules are gs.tabletop.Chess (every legal move, check, mate, draws),
// the opponent thinks in a worker at five levels, and the game is saved after every pair of moves.
// Played on a table in a stone hall, or on your own floor in AR.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { Table, Chess, slab, chessman, eyes, ring, dot, sounds } = gs.tabletop;
const { pbr } = gs.hd;

let W = 300, H = 460;
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE = 20;                                                     // points for a checkmate (the goal)
const EYES = { p: [.68, .15, .07], r: [.76, .27, .09], n: [.86, .1, .12], b: [.93, .18, .07], q: [1.04, .2, .08], k: [1.0, .21, .08] };   // height, how far forward, how far apart
const at = s => ({ x: s.charCodeAt(0) - 97 - 3.5, z: 3.5 - (+s[1] - 1) });   // 'e4' -> board units (white plays up the board, away from you)
const square = p => { const f = Math.round(p.x + 3.5), r = Math.round(3.5 - p.z); return f < 0 || f > 7 || r < 0 || r > 7 ? null : 'abcdefgh'[f] + (r + 1); };

function make(api) {
  let T, game, men, sel, moves, state, level, points, theirs, gains, thinking, dots, rings, selRing, checkRing, lastA, lastB, stuff;

  function setup() {
    T = new Table(api, { span: 9.8, room: 'hall', table: 'square', pitch: 54 });
    T.board.add(slab({ w: 8, d: 8, rim: .55, wood: '#55473a', rough: .35, paint(g, S) {      // a marble board: veined squares with fine grooves between
      const q = S / 8;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const dark = (r + f) % 2 === 1;                                 // (the corner at your right hand is a light square)
        g.col.fillStyle = dark ? '#6f8490' : '#e2dccd'; g.col.fillRect(f * q, r * q, q, q);
        g.col.strokeStyle = dark ? '#a9b8c0' : '#bdb6a6'; g.col.lineWidth = S / 700;
        for (let i = 0; i < 3; i++) { g.col.globalAlpha = .35; g.col.beginPath(); const x = f * q + Math.random() * q, y = r * q + Math.random() * q; g.col.moveTo(x, y); g.col.bezierCurveTo(x + q * .3, y - q * .2, x + q * .1, y + q * .4, x + (Math.random() - .5) * q, y + (Math.random() - .5) * q); g.col.stroke(); }
        g.col.globalAlpha = 1;
      }
      g.h.strokeStyle = '#3a3a3a'; g.h.lineWidth = S / 300;
      for (let i = 0; i <= 8; i++) { g.h.beginPath(); g.h.moveTo(i * q, 0); g.h.lineTo(i * q, S); g.h.moveTo(0, i * q); g.h.lineTo(S, i * q); g.h.stroke(); }
    } }));
    stuff = {
      w: pbr('#ebe5d6', { rough: .32, clear: .6 }), b: pbr('#3c424f', { rough: .34, clear: .7 }),
      ew: pbr('#ffd27a', { glow: 2, rough: .4 }), eb: pbr('#74dcff', { glow: 2, rough: .4 }),
    };
    dots = Array.from({ length: 28 }, () => { const d = dot('#ffe08a', { r: .15 }); d.visible = false; T.board.add(d); return d; });
    rings = Array.from({ length: 8 }, () => { const r = ring('#ff6a52', { r: .42, w: .045, glow: 2 }); r.visible = false; T.board.add(r); return r; });
    selRing = ring('#ffe08a', { r: .44 }); checkRing = ring('#ff3524', { r: .47, w: .06, glow: 2.6 });
    lastA = ring('#8ad0ff', { r: .46, w: .022, glow: 1 }); lastB = ring('#8ad0ff', { r: .46, w: .022, glow: 1 });
    T.board.add(selRing, checkRing, lastA, lastB);
  }

  // A piece: turned stone, with a pair of glowing eyes that face the other army.
  function man(type, color) {
    const m = chessman(type, stuff[color]); m.rotation.y = color === 'w' ? Math.PI : 0;
    const [y, z, gap] = EYES[type]; m.add(eyes(stuff[color === 'w' ? 'ew' : 'eb'], { y, z, gap }));
    m.userData.color = color; m.userData.type = type;
    return m;
  }
  function layout() {
    for (const m of men?.values() || []) m.removeFromParent();
    men = new Map();
    for (const p of game.pieces()) { const m = man(p.type, p.color), q = at(p.square); m.position.set(q.x, 0, q.z); T.board.add(m); men.set(p.square, m); }
  }
  function choose(sq) {
    if (sel && men.get(sel)) men.get(sel).position.y = 0;
    sel = sq; moves = sq ? game.moves(sq) : [];
    let d = 0, r = 0;
    for (const x of dots) x.visible = false; for (const x of rings) x.visible = false;
    for (const m of moves) { const q = at(m.to), mark = m.captured ? rings[r++] : dots[d++]; if (!mark) continue; mark.position.set(q.x, mark.position.y, q.z); mark.visible = true; }
    selRing.visible = !!sq; if (sq) { const q = at(sq); selRing.position.set(q.x, .03, q.z); }
  }
  function marks(m) {
    const king = game.check ? game.pieces().find(p => p.type === 'k' && p.color === game.turn) : null;
    checkRing.visible = !!king; if (king) { const q = at(king.square); checkRing.position.set(q.x, .035, q.z); }
    lastA.visible = lastB.visible = !!m; if (m) { const a = at(m.from), b = at(m.to); lastA.position.set(a.x, .028, a.z); lastB.position.set(b.x, .028, b.z); }
  }
  const save = () => api.save({ fen: game.fen, level, pts: points, opp: theirs });

  // Plays one move on the board: the piece walks (a knight leaps), a capture smashes the other piece.
  async function act(m) {
    const mesh = men.get(m.from), to = at(m.to), from = at(m.from), far = Math.hypot(to.x - from.x, to.z - from.z);
    men.delete(m.from); mesh.position.y = 0;
    const victimSq = m.captured ? (m.enPassant ? m.to[0] + m.from[1] : m.to) : null, victim = victimSq && men.get(victimSq);
    if (m.piece === 'n') await T.hop(mesh, to, { h: 1.25, time: .42, sound: !victim });
    else await T.slide(mesh, to, { time: victim ? .12 + far * .045 : .18 + far * .07, ease: victim ? 'in' : 'inOut' });
    if (victim) {
      men.delete(victimSq); const v = at(victimSq);
      T.crumble(victim, { from, push: 3.4, pieces: m.captured === 'p' ? 7 : 10 });
      T.puff({ x: v.x, y: .3, z: v.z }, { col: victim.userData.color === 'w' ? '#e4dccb' : '#6a7078', n: 14, speed: 2.4, size: .5 });
      T.shake(m.captured === 'q' ? .9 : .5); sounds.thud(1.2); haptic('heavy');
    } else if (m.piece !== 'n') { sounds.clack(.7); haptic('light'); }
    if (m.castle) {
      const rank = m.from[1], [a, b] = m.castle === 'k' ? ['h', 'f'] : ['a', 'd'], rook = men.get(a + rank);
      men.delete(a + rank); men.set(b + rank, rook); await T.slide(rook, at(b + rank), { time: .3 }); sounds.clack(.7);
    }
    let piece = mesh;
    if (m.promotion) {
      mesh.removeFromParent(); piece = man(m.promotion, m.color); piece.position.set(to.x, 0, to.z); T.board.add(piece);
      T.puff({ x: to.x, y: .6, z: to.z }, { col: '#ffe08a', n: 16, glow: true, speed: 1.8, size: .22, up: 1.6 }); sounds.chime(); haptic('success'); await T.pop(piece, { by: .4, time: .35 });
    }
    men.set(m.to, piece); marks(m);
  }
  // The game has ended? Then the losing king falls, and the round is over.
  async function ended() {
    if (!game.over) return false;
    state = 'done'; choose(null);
    if (game.mate) {
      const loser = game.turn, king = game.pieces().find(p => p.type === 'k' && p.color === loser), mesh = men.get(king.square), q = at(king.square);
      await T.wait(.5); sounds.gong(); T.lookAt({ x: q.x * .5, z: q.z * .5 }, { zoom: .8 });
      await T.tween(.7, k => { mesh.rotation.z = k * 1.45; mesh.position.y = Math.sin(k * Math.PI) * .15; }, { ease: 'in' });
      men.delete(king.square); T.crumble(mesh, { pieces: 12, push: 2.6 }); T.puff({ x: q.x, y: .3, z: q.z }, { n: 18, speed: 2.6, size: .55 }); T.shake(1); sounds.thud(1.4); haptic('heavy');
      if (loser === 'b') { points += MATE; api.score(points); api.win(); }
    } else sounds.chime(.6);
    await T.wait(1.8);
    api.save({ level }); T.stop(); api.over();
    return true;
  }
  async function turn(pick) {
    const m = game.move(pick); if (!m) return;
    state = 'busy'; choose(null);
    await act(m);
    const gain = m.captured ? VAL[m.captured] : 0; gains.push(gain);
    if (gain) { points += gain; api.score(points); }
    if (await ended()) return;
    thinking = true;
    const [reply] = await Promise.all([T.until(game.think({ level })), T.wait(.7)]);
    thinking = false;
    const r = reply && game.move(reply); if (!r) { state = 'you'; return; }
    await act(r);
    if (r.captured) theirs += VAL[r.captured];
    save();
    if (await ended()) return;
    state = 'you';
  }
  function undo() {
    if (state !== 'you' || game.count < 2 || !gains.length) return;
    game.undo(); game.undo(); points -= gains.pop(); api.score(points);
    choose(null); layout(); marks(null); save(); sounds.flip();
  }

  return {
    reset() {
      const s = api.load(null);
      game = new Chess(s?.fen || null);                       // (first: the rules may still be loading)
      if (game.over || game.turn !== 'w') game = new Chess();
      if (!T) setup();
      T.reset();
      const kept = !!s?.fen && game.fen === s.fen;
      level = Math.max(1, Math.min(5, s?.level || 2)); points = kept ? s.pts || 0 : 0; theirs = kept ? s.opp || 0 : 0; gains = []; thinking = false; sel = null; moves = [];
      layout(); choose(null); marks(null); state = 'you';
      if (points) api.score(points);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      stuff.ew.emissiveIntensity = 1.7 + Math.sin(T.t * 2.2) * .4;
      stuff.eb.emissiveIntensity = thinking ? 2.2 + Math.sin(T.t * 9) * 1.2 : 1.7 + Math.sin(T.t * 2.2 + 2) * .4;
      const m = sel && men.get(sel); if (m) m.position.y = .12 + Math.sin(T.t * 5) * .035;
    },
    draw(c) {
      T.draw(c, W, H);
      const L = Chess.LEVELS[level - 1], mine = state === 'you';
      const y = T.strip(c, W, [{ name: 'You', col: '#ebe5d6', score: points }, { name: L.name, col: '#3a4252', score: theirs }], state === 'done' ? -1 : mine ? 0 : 1);
      const text = state === 'done' ? (game.mate ? (game.turn === 'b' ? 'Checkmate. You win!' : 'Checkmate') : 'A draw') : thinking ? `${L.name} is thinking…` : game.check ? 'Check!' : mine ? (sel ? 'Tap where it goes' : 'Your move: tap a piece') : '';
      if (text) T.status(c, W, y, text, game.check && state !== 'done' ? '#ff8a7a' : '#fff');
      T.hud(c, W, H, T.hidden ? [] : [{ id: 'level', label: 'Level ' + level }, ...(mine && game.count >= 2 && gains.length ? [{ id: 'undo', label: 'Undo' }] : [])]);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap) return;
      if (tap.chip === 'level') { level = level % 5 + 1; save(); T.say(`Level ${level}: ${Chess.LEVELS[level - 1].name}`); return; }
      if (tap.chip === 'undo') return undo();
      if (state !== 'you' || T.busy) return;
      const hit = T.over(tap.x, tap.y, [...men.values()]), p = T.pick(tap.x, tap.y);
      const sq = hit ? [...men].find(([, m]) => m === hit)?.[0] : p && square(p);
      if (!sq) return choose(null);
      const go = moves.find(m => m.to === sq) || (hit && p && moves.find(m => m.to === square(p)));
      if (sel && go) return T.run(() => turn({ from: sel, to: go.to, promotion: 'q' }));
      if (game.at(sq)?.color === 'w') { choose(sq === sel ? null : sq); sounds.tick(); haptic('light'); } else choose(null);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'living-chess',
  title: 'Living Chess',
  tag: 'Board · Chess',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'tense', set: 'orchestra', vol: .5 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: MATE,
  hint: 'Chess with living stone pieces: tap one of yours, then tap where it goes, and watch it smash what it takes. Checkmate wins; your game is kept if you leave. Drag to look round, or tap AR to play on your floor.',
  creator: 'Game Scroll',
  make,
};
