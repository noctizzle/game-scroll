// Liar's Lantern: a game of working out who's lying, for one. The villagers sit round the inn's table
// by lantern light and one of them is the Trickster. Everyone has something to say about where the
// Trickster sits or what they wear: the honest ones tell the truth, the Trickster always lies. Each
// one you hear out burns a measure of lamp oil, so pick who to ask, put their stories together and
// accuse. A wrong accusation costs a life. Unmask three Tricksters to win; the table keeps growing.
import gs from '../gamescroll.js';
const { haptic } = gs.device;
const { face } = gs.art;
const { Table, slab, pawn, ring, eyes, sounds } = gs.tabletop;
const { pbr } = gs.hd;
const { Mesh, Group, CylinderGeometry, ConeGeometry, TorusGeometry } = gs.THREE;

let W = 300, H = 460;
const GOAL = 3, SEAT = 2.75;
const NAMES = ['Pell', 'Odo', 'Wren', 'Tam', 'Isla', 'Bram', 'Nell', 'Jory', 'Mab', 'Cade', 'Fenn', 'Hob', 'Esme', 'Rook'];
const CLOAKS = [{ name: 'red', col: '#c8473c' }, { name: 'blue', col: '#3f78c8' }, { name: 'green', col: '#4a9a52' }];
const shuffle = list => { const o = [...list]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };

/* ----- the puzzle: statements, and whether one would be true if villager c were the Trickster ----- */
const beside = (a, b, n) => a !== b && ((a - b + n) % n === 1 || (b - a + n) % n === 1);
function holds(st, i, c, V) {
  const n = V.length;
  switch (st[0]) {
    case 'next': return beside(i, c, n);
    case 'notnext': return !beside(i, c, n);
    case 'is': return c === st[1];
    case 'not': return c !== st[1];
    case 'cloak': return V[c].cloak === st[1];
    case 'notcloak': return V[c].cloak !== st[1];
    case 'hat': return V[c].hat;
    case 'nohat': return !V[c].hat;
    default: return n % 2 === 0 && c === (i + n / 2) % n;           // 'across'
  }
}
const words = (st, V) => ({ next: 'The Trickster sits beside me', notnext: 'The Trickster is not beside me', is: `It is ${V[st[1]]?.name}!`, not: `${V[st[1]]?.name} is honest`, cloak: `The Trickster wears ${CLOAKS[st[1]]?.name}`,
  notcloak: `The Trickster does not wear ${CLOAKS[st[1]]?.name}`, hat: 'The Trickster wears a hat', nohat: 'The Trickster has no hat', across: 'The Trickster sits across from me' })[st[0]];
// who could still be the Trickster, going by the statements of the villagers in `heard`
const suspects = (V, heard) => V.map((_, c) => c).filter(c => heard.every(i => holds(V[i].st, i, c, V) === (i !== c)));
function subsets(n, k) { const out = []; (function go(from, set) { if (set.length === k) return out.push(set); for (let i = from; i < n; i++) go(i + 1, [...set, i]); })(0, []); return out; }
function deal(n, oil) {                                             // a table where every story together points at one villager, and a fair few sets of `oil` stories do too
  let best = null, bestFair = -1;
  for (let tries = 0; tries < 400; tries++) {
    const names = shuffle(NAMES).slice(0, n), x = Math.floor(Math.random() * n);
    const V = names.map(name => ({ name, cloak: Math.floor(Math.random() * 3), hat: Math.random() < .5, seed: Math.floor(Math.random() * 1e9), asked: false, cleared: false, st: null }));
    if (new Set(V.map(v => v.cloak)).size < 2 || V.every(v => v.hat) || V.every(v => !v.hat)) continue;
    V.forEach((v, i) => {
      /** @type {[any[], number][]} */
      const forms = [[['next'], 2], [['notnext'], 1], [['hat'], 1.2], [['nohat'], 1.2]];
      if (n % 2 === 0) forms.push([['across'], 1]);
      for (let j = 0; j < n; j++) if (j !== i) forms.push([['is', j], i === x ? 2 / (n - 2) : .6], [['not', j], 1 / (n - 2)]);
      for (let k = 0; k < 3; k++) forms.push([['cloak', k], 1.3], [['notcloak', k], .5]);
      const ok = forms.filter(([st]) => holds(st, i, x, V) === (i !== x));   // the honest say true things, the Trickster false ones
      let roll = Math.random() * ok.reduce((s, f) => s + f[1], 0); v.st = (ok.find(f => (roll -= f[1]) <= 0) || ok[0])[0];
    });
    const all = V.map((_, i) => i);
    if (suspects(V, all).length !== 1 || all.some(i => suspects(V, [i]).length < 2)) continue;
    const sets = subsets(n, oil), fair = sets.filter(s => suspects(V, s).length === 1).length / sets.length;
    if (fair > bestFair) { bestFair = fair; best = { V, x }; }
    if (fair >= .4 && fair <= .85) break;
  }
  return best;
}

function make(api) {
  let T, V, x, figs, oil, lives, score, round, state, accusing, notes, bubble, stuff, lamp, pick3d, sel;

  function setup() {
    T = new Table(api, { span: 8.4, room: { like: 'tavern', felt: '#3a4a40' }, pitch: 50, look: [0, .5, 0], frame: [7.6, 7.2] });
    T.board.add(slab({ w: 7.2, d: 7.2, rim: .22, wood: '#4a3020', rough: .9, paint(g, Z) {     // a dark cloth with a ring where the villagers sit
      const c = g.col; c.fillStyle = '#2e3d36'; c.fillRect(0, 0, Z, Z);
      for (let i = 0; i < 3000; i++) { c.fillStyle = Math.random() < .5 ? '#34463e' : '#28352f'; c.fillRect(Math.random() * Z, Math.random() * Z, 3, 3); }
      c.strokeStyle = '#c9a25a'; c.lineWidth = Z / 240; for (const r of [SEAT + .62, SEAT - .62]) { c.beginPath(); c.arc(Z / 2, Z / 2, r / 7.2 * Z, 0, 7); c.stroke(); }
      c.globalAlpha = .5; for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; c.beginPath(); c.moveTo(Z / 2 + Math.cos(a) * .7 / 7.2 * Z, Z / 2 + Math.sin(a) * .7 / 7.2 * Z); c.lineTo(Z / 2 + Math.cos(a) * (k % 2 ? 1.1 : 1.5) / 7.2 * Z, Z / 2 + Math.sin(a) * (k % 2 ? 1.1 : 1.5) / 7.2 * Z); c.stroke(); }
      c.globalAlpha = 1; g.r.fillStyle = '#d0d0d0'; g.r.fillRect(0, 0, Z, Z);
    } }));
    stuff = { cloak: CLOAKS.map(k => pbr(k.col, { rough: .6, clear: .2 })), hat: pbr('#4a3424', { rough: .85 }), eye: pbr('#fff4d8', { glow: 1, rough: .4 }), bad: pbr('#ff3a2a', { glow: 3, rough: .4 }),
      brass: pbr('#c79a48', { rough: .3, metal: .9 }), flame: pbr('#ffd07a', { glow: 2.2, rough: .3 }) };
    lamp = new Group();                                             // the lantern in the middle: it burns lower as the oil goes
    const part = (geo, mat, y) => { const m = new Mesh(geo, mat); m.position.y = y; m.castShadow = mat !== stuff.flame; lamp.add(m); return m; };
    part(new CylinderGeometry(.34, .4, .14, 20), stuff.brass, .07); part(new CylinderGeometry(.2, .2, .5, 16), stuff.flame, .39);
    part(new ConeGeometry(.32, .22, 20), stuff.brass, .75); part(new TorusGeometry(.1, .02, 6, 16), stuff.brass, .93);
    for (let k = 0; k < 4; k++) { const bar = part(new CylinderGeometry(.015, .015, .5, 5), stuff.brass, .39), a = k * Math.PI / 2 + .4; bar.position.x = Math.cos(a) * .22; bar.position.z = Math.sin(a) * .22; }
    T.board.add(lamp);
    sel = ring('#ffe08a', { r: .56, w: .04, glow: 1.2 }); sel.visible = false; T.board.add(sel);
  }
  const seat = (i, n = V.length) => { const a = (i + .5) / n * Math.PI * 2; return { x: Math.sin(a) * SEAT, z: Math.cos(a) * SEAT }; };
  function build(drop) {                                            // the villagers, as playing pieces in cloaks and hats
    for (const f of figs || []) { f.g.removeFromParent(); f.mark.removeFromParent(); }
    figs = V.map((v, i) => {
      const g = new Group(), p = seat(i), body = pawn(stuff.cloak[v.cloak], { r: .42, h: 1.2 }); g.add(body);
      if (v.hat) { const brim = new Mesh(new CylinderGeometry(.36, .36, .035, 18), stuff.hat); brim.position.y = 1.14; const top = new Mesh(new ConeGeometry(.24, .4, 14), stuff.hat); top.position.y = 1.35; top.castShadow = true; g.add(brim, top); }
      const e = eyes(stuff.eye, { y: 1.0, z: .2, gap: .085, r: .045 }); g.add(e);
      g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(-p.x, -p.z); T.board.add(g);
      const mark = ring('#7fe08f', { r: .52, w: .035, glow: .9 }); mark.position.set(p.x, .03, p.z); mark.visible = false; T.board.add(mark);
      if (drop) { g.visible = false; T.tween(.01, null, { delay: i * .09 }).then(() => T.drop(g, { from: 3, time: .4 })); }
      return { g, body, e, mark, face: face(v.seed), p };
    });
    pick3d = figs.map(f => f.g);
  }
  function table(fresh) {
    const n = round < 1 ? 5 : round < 4 ? 6 : 7; oil = n === 7 ? 4 : 3;
    ({ V, x } = deal(n, oil)); notes = []; bubble = null; accusing = false; sel.visible = false;
    build(!fresh);
  }
  const keep = () => api.save({ r: round, h: lives, s: score });
  function ask(i) {
    const v = V[i], f = figs[i];
    if (!v.asked) {
      if (oil <= 0) { haptic('warning'); return T.say('The lantern is dry: tap Accuse and name someone'); }
      oil--; v.asked = true; notes.push(i); sounds.flip(); haptic('light');
    } else sounds.tick();
    bubble = { i, t: 3.4 }; sel.visible = true; sel.position.set(f.p.x, .03, f.p.z); T.hop(f.g, { y: 0 }, { h: .2, time: .2, sound: false });
  }
  async function accuse(i) {
    state = 'busy'; accusing = false; bubble = null; sel.visible = false;
    const f = figs[i], v = V[i];
    await T.hop(f.g, { y: 0 }, { h: .5, time: .3, sound: false });
    if (i === x) {
      f.e.material = stuff.bad; sounds.gong(); haptic('success'); T.shake(.5); score++; api.score(score);
      T.say(`${v.name} was the Trickster!`); await T.wait(.9);
      T.puff({ x: f.p.x, y: .8, z: f.p.z }, { col: '#ff8a5a', glow: true, n: 24, speed: 2.4, up: 2, size: .22 });
      f.g.remove(f.body); f.body.position.copy(f.g.position); T.board.add(f.body); f.g.visible = false; await T.crumble(f.body, { pieces: 10, push: 3.2 });
      round++; await T.wait(.9); table(false); await T.wait(.9); state = 'you'; keep();
    } else {
      lives--; v.cleared = true; f.mark.visible = true; sounds.thud(1.3); haptic('error'); T.shake(.4);
      T.say(`${v.name} is honest. The Trickster smiles`);
      if (lives <= 0) {
        state = 'done'; await T.wait(1); const t = figs[x]; t.e.material = stuff.bad; sel.visible = true; sel.position.set(t.p.x, .03, t.p.z); await T.hop(t.g, { y: 0 }, { h: .6, time: .35, sound: false }); T.say(`It was ${V[x].name} all along`, 3);
        await T.wait(2); api.clearSave(); T.stop(); return api.over();
      }
      await T.wait(.5); state = 'you';
    }
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const v = api.load(null), ok = v && Number.isInteger(v.r) && v.r >= 0 && v.r < 500 && Number.isInteger(v.h) && v.h >= 1 && v.h <= 3 && Number.isInteger(v.s) && v.s >= 0;
      round = ok ? v.r : 0; lives = ok ? v.h : 3; score = ok ? v.s : 0; state = 'you';
      table(true); if (score) api.score(score);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!T.update(dt)) return;
      if (bubble && (bubble.t -= dt) <= 0) bubble = null;
      stuff.flame.emissiveIntensity = (.5 + oil * .6) * (1 + Math.sin(T.t * 9) * .05 + Math.sin(T.t * 23) * .03);
      stuff.bad.emissiveIntensity = 2.4 + Math.sin(T.t * 10) * 1;
      if (sel.visible) sel.scale.setScalar(1 + Math.sin(T.t * 5) * .05);
    },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, [{ name: 'Oil', col: '#ffcf70', score: oil }, { name: 'Lives', col: '#e0483a', score: lives }, { name: 'Caught', col: '#8fe09a', score }]);
      T.status(c, W, y, state === 'done' ? 'The Trickster got away' : state !== 'you' ? '' : accusing ? 'Tap the one you accuse' : oil > 0 ? 'One of them lies. Tap someone to hear them' : 'No oil left: tap Accuse', accusing ? '#ffb0a0' : '#fff');
      if (!T.hidden) {
        c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
        figs.forEach((f, i) => {                                    // a face and a name over each villager
          if (!f.g.visible) return;
          const v = V[i], [sx, sy, sz] = T.toScreen({ x: f.p.x, y: v.hat ? 1.75 : 1.45, z: f.p.z }); if (sz >= 1) return;
          const py = sy - 26;
          c.fillStyle = CLOAKS[v.cloak].col; c.beginPath(); c.arc(sx, py, 12.5, 0, 7); c.fill(); c.fillStyle = '#f4ead8'; c.beginPath(); c.arc(sx, py, 10.5, 0, 7); c.fill();
          c.save(); c.beginPath(); c.arc(sx, py, 10.5, 0, 7); c.clip(); f.face.draw(c, sx, py + 1.5, 20, v.cleared ? 1 : 0); c.restore();
          c.font = '800 9px Rubik, sans-serif'; const w = c.measureText(v.name).width + 10;
          c.fillStyle = v.cleared ? '#1d5a2ae6' : '#0a0e14d8'; c.beginPath(); c.roundRect(sx - w / 2, py + 12, w, 13, 6.5); c.fill(); c.fillStyle = '#fff'; c.fillText(v.name, sx, py + 19);
          if (v.asked) { c.fillStyle = '#ffe08a'; c.beginPath(); c.arc(sx + 11, py - 9, 5, 0, 7); c.fill(); c.fillStyle = '#1a1206'; c.font = '800 8px Rubik, sans-serif'; c.fillText('“', sx + 11, py - 6.5); }
        });
        // what you've heard so far, newest last
        c.textAlign = 'left'; c.font = '600 9.5px Rubik, sans-serif';
        const lines = notes.map(i => `${V[i].name}: ${words(V[i].st, V)}`), lh = 13, bx = 8, by = H - 44 - lines.length * lh;
        if (lines.length) {
          const bw = Math.min(W - 16, Math.max(...lines.map(l => c.measureText(l).width)) + 14);
          c.fillStyle = '#0a0e14c8'; c.beginPath(); c.roundRect(bx, by - 4, bw, lines.length * lh + 6, 8); c.fill();
          lines.forEach((l, k) => { c.fillStyle = bubble && notes[k] === bubble.i ? '#ffe08a' : V[notes[k]].cleared ? '#9fe0a8' : '#e8edf5'; c.fillText(l, bx + 7, by + k * lh + lh / 2); });
        }
        c.restore();
      }
      T.hud(c, W, H, state === 'you' ? [{ id: 'accuse', label: 'Accuse', on: accusing }] : []);
    },
    down(x0, y0, id) { T.down(x0, y0, id); },
    move(x0, y0, pressed, id) { T.move(x0, y0, pressed, id); },
    up(x0, y0, id) {
      const tap = T.up(x0, y0, id); if (!tap || state !== 'you' || T.busy) return;
      if (tap.chip === 'accuse') { accusing = !accusing; return; }
      if (tap.chip) return;
      const hit = T.over(tap.x, tap.y, pick3d);
      let i = hit ? pick3d.indexOf(hit) : T.nearest(tap.x, tap.y, figs.map(f => ({ x: f.p.x, y: 1, z: f.p.z })), 34);
      if (i < 0) { const k = figs.findIndex((f, j) => { const [sx, sy] = T.toScreen({ x: f.p.x, y: V[j].hat ? 1.75 : 1.45, z: f.p.z }); return Math.hypot(sx - tap.x, sy - 26 - tap.y) < 20; }); i = k; }
      if (i < 0) return;
      if (!accusing) return ask(i);
      if (V[i].cleared) return T.say(`${V[i].name} is already cleared`);
      T.run(() => accuse(i));
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'liars-lantern',
  title: 'Liar’s Lantern',
  tag: 'Board · Deduction',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'tense', vol: .45 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: GOAL,
  hint: 'One villager is the Trickster, who always lies; the rest tell the truth. Tap a villager to hear them (each costs lamp oil), then tap Accuse and name the liar. Unmask 3 Tricksters to win; a wrong guess costs a life.',
  creator: 'Game Scroll',
  make,
};
