// Tavern Dice: the old push-your-luck dice game (Ten Thousand), played with six real dice against two
// regulars. Throw, keep at least one scoring die, then choose: bank what the turn has made, or throw
// the rest and risk a bust that loses it all. Keep all six and you throw them all again. First to
// 2,500 wins. The dice are gs.tabletop dice tumbling in gs.physics3d; shake the phone (or tap) to throw.
import gs from '../gamescroll.js';
const { haptic, onShake } = gs.device;
const { Table, slab, ring, dot, sounds } = gs.tabletop;

let W = 300, H = 460;
const GOAL = 2500, SIX = [0, 1, 2, 3, 4, 5];
const WHO = [{ name: 'You', col: '#f0b429' }, { name: 'Brannoch', col: '#7fb069', bank: 300, last: 2 }, { name: 'Skerry', col: '#e0483a', bank: 650, last: 1 }];   // bank: happy to stop at; last: stops with this few dice left
const rack = k => ({ x: (k - 2.5) * .98, z: 3.36 });                 // where kept dice stand

// What a set of dice is worth, and how many of them count (a legal keep uses every die in it).
function tally(vals) {
  const n = [0, 0, 0, 0, 0, 0, 0]; for (const v of vals) n[v]++;
  if (vals.length === 6 && n.slice(1).every(c => c === 1)) return { score: 1500, used: 6 };            // a straight
  if (vals.length === 6 && n.slice(1).filter(c => c === 2).length === 3) return { score: 750, used: 6 };   // three pairs
  let score = 0, used = 0;
  for (let f = 1; f <= 6; f++) if (n[f] >= 3) { score += (f === 1 ? 1000 : f * 100) * 2 ** (n[f] - 3); used += n[f]; n[f] = 0; }   // three of a kind; each more doubles it
  score += n[1] * 100 + n[5] * 50; used += n[1] + n[5];
  return { score, used };
}
// The dice (by index) of a throw that score: all six for a straight or three pairs, else triples, ones and fives.
function scoring(live, vals) {
  const faces = live.map(i => vals[i]), t = tally(faces);
  if (t.used === faces.length) return live.slice();
  const n = [0, 0, 0, 0, 0, 0, 0]; for (const v of faces) n[v]++;
  return live.filter(i => n[vals[i]] >= 3 || vals[i] === 1 || vals[i] === 5);
}

function make(api) {
  let T, dice, rings, dots, scores, turn, state, pot, held, vals, sel, decide, note, buttons = [];

  function setup() {
    T = new Table(api, { span: 8.6, room: 'tavern', pitch: 62, frame: [7.4, 8.2] });
    dice = T.dice(6, { size: .7, tray: { x: 0, z: -.8, w: 6.2, d: 5.5 }, body: '#e9dfc6', pips: '#3a1c12' });
    T.board.add(slab({ w: 6.6, d: 7.6, rim: .32, wood: '#6a3f22', paint(g, S) {      // a worn leather mat, with a strip for the dice you keep
      const c = g.col; c.fillStyle = '#5d2f2a'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < 2600; i++) { c.fillStyle = Math.random() < .5 ? '#6b3832' : '#4f2622'; c.globalAlpha = .5; c.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 2 + Math.random() * 3); }
      c.globalAlpha = 1; const y = (2.45 / 7.6 + .5) * S;
      c.fillStyle = '#3f1e1b'; c.fillRect(0, y, S, S - y); c.strokeStyle = '#c9a25a'; c.lineWidth = S / 220; c.beginPath(); c.moveTo(S * .03, y); c.lineTo(S * .97, y); c.stroke();
      g.h.strokeStyle = '#5a5a5a'; g.h.lineWidth = S / 150; g.h.beginPath(); g.h.moveTo(0, y); g.h.lineTo(S, y); g.h.stroke();
      c.fillStyle = '#c9a25a'; c.font = `700 ${S * .028}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText('K E P T', S / 2, S * .985);
      g.r.fillStyle = '#b0b0b0'; g.r.fillRect(0, 0, S, S);
    } }));
    rings = SIX.map(() => { const r = ring('#ffe08a', { r: .56, w: .05, glow: 1.5 }); r.visible = false; T.board.add(r); return r; });
    dots = SIX.map(() => { const d = dot('#ffcf70', { r: .1, glow: 1 }); d.visible = false; T.board.add(d); return d; });
  }
  const live = () => SIX.filter(i => !held.includes(i));
  const picked = () => tally([...sel].map(i => vals[i]));
  const legal = () => { const t = picked(); return sel.size > 0 && t.used === sel.size; };
  function show() {                                               // rings under the dice you've chosen, dots under those that could score
    const can = state === 'pick' ? scoring(live(), vals) : [];
    SIX.forEach(i => {
      const p = dice.meshes[i].position;
      rings[i].visible = state === 'pick' && sel.has(i); rings[i].position.set(p.x, .03, p.z);
      dots[i].visible = can.includes(i) && !sel.has(i); dots[i].position.set(p.x + .5, .02, p.z + .5);
    });
  }

  async function play(who) {
    turn = who; pot = 0; held = []; note = '';
    for (;;) {
      state = 'busy'; show();
      vals = await dice.roll({ keep: held });
      const mine = live(), can = scoring(mine, vals);
      if (!can.length) {                                          // nothing scores: the turn's points are gone
        note = 'Bust!'; pot = 0; sounds.thud(1.2); haptic('error'); T.shake(.4); await T.wait(1.3); break;
      }
      let take, stop;
      if (who === 0) {
        state = 'pick'; sel = new Set(); show();
        ({ take, stop } = await T.until(new Promise(res => { decide = res; })));
        state = 'busy';
      } else {
        await T.wait(.75); take = can;
        const got = pot + tally(take.map(i => vals[i])).score, left = mine.length - take.length || 6, me = WHO[who];
        stop = scores[who] + got >= GOAL || got >= me.bank || (left <= me.last && got >= 250);
      }
      pot += tally(take.map(i => vals[i])).score; sel = new Set(); show();
      for (const i of take) { held.push(i); dice.park(i, rack(held.length - 1)); sounds.clack(.6); haptic('light'); await T.wait(.09); }
      if (held.length === 6 && !stop) { held = []; note = 'Hot dice! All six again'; sounds.chime(); await T.wait(.8); note = ''; }
      if (stop) { scores[who] += pot; note = `Banked ${pot}`; sounds.chime(.8); haptic('success'); if (who === 0) api.score(scores[0]); await T.wait(1); break; }
    }
    if (scores[who] >= GOAL) {
      state = 'done'; turn = who; note = who ? `${WHO[who].name} wins` : 'You win!'; sounds.gong();
      if (who === 0) api.win();
      await T.wait(1.6); api.clearSave(); T.stop(); return api.over();
    }
    const next = (who + 1) % WHO.length; turn = next; pot = 0; note = '';
    if (next === 0) { api.save({ s: scores }); state = 'ready'; return; }
    await T.wait(.4); return play(next);
  }
  const start = () => { if (state === 'ready' && T && !T.busy && !T.hidden) T.run(() => play(0)); };
  onShake(start);

  function button(c, b) {
    c.globalAlpha = b.on ? 1 : .45; c.fillStyle = b.main ? '#f0b429' : '#f2f5fb'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 12); c.fill();
    c.fillStyle = '#1a1206'; c.font = '800 13px Rubik, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + .5); c.globalAlpha = 1;
  }

  return {
    reset() {
      if (!T) setup();
      T.reset();
      const s = api.load(null), ok = s && Array.isArray(s.s) && s.s.length === WHO.length && s.s.every(n => n >= 0 && n < GOAL);
      scores = ok ? s.s.slice() : WHO.map(() => 0); turn = 0; state = 'ready'; pot = 0; held = []; vals = SIX.map(() => 1); sel = new Set(); decide = null; note = '';
      SIX.forEach(i => dice.park(i, { x: (i % 3 - 1) * 1.1, z: Math.floor(i / 3) * 1.1 - 1.3 }));
      show(); if (scores[0]) api.score(scores[0]);
    },
    resize(w, h) { W = w; H = h; },
    update(dt) { if (!T.update(dt)) return; if (state === 'pick') show(); },
    draw(c) {
      T.draw(c, W, H);
      const y = T.strip(c, W, WHO.map((w, i) => ({ name: w.name, col: w.col, score: scores[i] })), state === 'done' ? -1 : turn);
      const t = state === 'pick' ? picked() : null, good = state === 'pick' && legal();
      T.status(c, W, y, note || (state === 'ready' ? 'Tap or shake to throw' : state === 'pick' ? (sel.size ? (good ? `Keeping ${t.score}` : 'Those don’t all score') : `Turn ${pot}: tap dice to keep`) : turn ? `${WHO[turn].name}: ${pot}` : `Turn ${pot}`), note === 'Bust!' ? '#ff8a7a' : '#fff');
      buttons = [];
      if (state === 'pick' && !T.hidden) {
        const left = live().length - sel.size, bw = (W - 36) / 2, by = H - 88;
        buttons = [{ id: 'bank', x: 12, y: by, w: bw, h: 40, label: `Bank ${pot + (good ? t.score : 0)}`, on: good }, { id: 'roll', x: 24 + bw, y: by, w: bw, h: 40, label: left ? `Throw ${left}` : 'Throw all 6', on: good, main: true }];
        buttons.forEach(b => button(c, b));
      }
      T.hud(c, W, H);
    },
    down(x, y, id) { T.down(x, y, id); },
    move(x, y, pressed, id) { T.move(x, y, pressed, id); },
    up(x, y, id) {
      const tap = T.up(x, y, id); if (!tap || tap.chip) return;
      if (state === 'ready') return start();
      if (state !== 'pick' || !decide) return;
      const b = buttons.find(k => tap.x > k.x && tap.x < k.x + k.w && tap.y > k.y && tap.y < k.y + k.h);
      if (b) { if (!b.on) { haptic('warning'); return; } const go = decide; decide = null; haptic('medium'); return go({ take: [...sel], stop: b.id === 'bank' }); }
      const mine = live(), hit = T.over(tap.x, tap.y, mine.map(i => dice.meshes[i]));
      let i = hit ? dice.meshes.indexOf(hit) : -1;
      if (i < 0) { const k = T.nearest(tap.x, tap.y, mine.map(j => ({ x: dice.meshes[j].position.x, y: .35, z: dice.meshes[j].position.z })), 30); i = k < 0 ? -1 : mine[k]; }
      if (i < 0) return;
      // one tap takes a whole set: all six of a straight or three pairs, or every die of a three of a kind
      const faces = mine.map(j => vals[j]), all = tally(faces), same = mine.filter(j => vals[j] === vals[i]);
      const group = all.used === 6 && all.score >= 750 ? mine : same.length >= 3 && vals[i] !== 1 && vals[i] !== 5 ? same : [i];
      const on = !sel.has(i); for (const j of group) { if (on) sel.add(j); else sel.delete(j); }
      sounds.tick(); haptic('light'); show();
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'tavern-dice',
  title: 'Tavern Dice',
  tag: 'Board · Dice',
  retro: true, era: 'board', pal: 'grape', music: { mood: 'silly', vol: .5 },
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: GOAL,
  hint: 'Throw six dice, tap the ones to keep (1s, 5s and three of a kind score), then bank the turn or throw the rest: a throw with nothing in it loses the lot. First to 2,500 wins. Shake to throw; tap AR to play on your floor.',
  creator: 'Game Scroll',
  make,
};
