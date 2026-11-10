// Word Ladder: turn the top word into the bottom word one letter at a time, and every step must be a
// real word. Tap a letter of your word, then tap the new letter on the keyboard. Reach the target in the
// fewest steps for the most points; each ladder climbed adds time.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { Words } = gs.words;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;

let W = 360, H = 640;
const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function make(api) {
  const feel = new Feel();
  const words = new Words();
  let start, target, par, steps, slot, score, time, t, msg, ml, solved, banner, ended, graph;

  function neighbours(w) {
    const out = [];
    for (let i = 0; i < w.length; i++) for (let k = 0; k < 26; k++) {
      const c = 'abcdefghijklmnopqrstuvwxyz'[k]; if (c === w[i]) continue;
      const n = w.slice(0, i) + c + w.slice(i + 1); if (graph.has(n)) out.push(n);
    }
    return out;
  }
  function newLadder() {
    graph ||= new Set(words.of(4).filter(w => words.safe(w)));
    const want = Math.min(5, 3 + Math.floor(solved / 3));
    for (let tries = 0; tries < 60; tries++) {
      const s = words.random({ length: 4 }); if (!s || !graph.has(s)) continue;
      // walk outwards to find a word exactly "want" steps away
      const dist = new Map([[s, 0]]); let q = [s];
      for (let d = 1; d <= want && q.length; d++) { const nq = []; for (const w of q) for (const n of neighbours(w)) if (!dist.has(n)) { dist.set(n, d); nq.push(n); } q = nq; }
      if (q.length) { start = s.toUpperCase(); target = q[Math.random() * q.length | 0].toUpperCase(); par = want; steps = [start]; slot = -1; return; }
    }
    start = 'COLD'; target = 'WARM'; par = 4; steps = [start]; slot = -1;
  }
  const now = () => steps[steps.length - 1];

  return {
    reset() { score = 0; time = 90; t = 0; msg = ''; ml = 0; solved = 0; banner = null; ended = false; newLadder(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { banner = null; newLadder(); } return; }
      if (t > 2) time -= dt;
      if (time <= 0 && !ended) { ended = true; time = 0; api.over(); }
    },
    draw(c) {
      c.fillStyle = '#f1faee'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#a8dadc'; c.fillRect(24, 50, W - 48, 10); c.fillStyle = time < 15 ? '#e63946' : '#1d3557'; c.fillRect(24, 50, (W - 48) * Math.min(1, time / 90), 10);
      const tw = 52, x0 = W / 2 - tw * 2;
      const row = (word, y, col, edit) => { for (let i = 0; i < 4; i++) { const x = x0 + i * tw; c.fillStyle = edit && i === slot ? '#ffd166' : col; c.beginPath(); c.roundRect(x + 3, y, tw - 6, 46, 8); c.fill(); c.fillStyle = '#1d3557'; c.font = '800 28px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(word[i], x + tw / 2, y + 33); } };
      c.fillStyle = '#457b9d'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`Change one letter at a time · best ${par} steps`, W / 2, 84);
      // ladder rails
      c.fillStyle = '#e9c46a'; c.fillRect(x0 - 12, 96, 6, 270); c.fillRect(x0 + tw * 4 + 6, 96, 6, 270);
      feel.begin(c);
      const shown = steps.slice(-5), y0 = 100;
      shown.forEach((w, i) => row(w, y0 + i * 50, i === shown.length - 1 ? '#ffffff' : '#dbe9ee', i === shown.length - 1));
      // target
      row(target, 372, '#b7e4c7', false);
      feel.end(c, W, H);
      c.fillStyle = '#2d6a4f'; c.font = '700 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('TARGET', W / 2, 432);
      // keyboard
      const kw = (W - 20) / 10, ky = H - 140;
      KEYS.forEach((r, ri) => { const off = (10 - r.length) * kw / 2; [...r].forEach((ch, i) => { const x = 10 + off + i * kw, y = ky + ri * 44; c.fillStyle = slot >= 0 ? '#1d3557' : '#a8b8c8'; c.beginPath(); c.roundRect(x + 2, y, kw - 4, 38, 6); c.fill(); c.fillStyle = '#fff'; c.font = '700 17px Rubik, sans-serif'; c.fillText(ch, x + kw / 2, y + 25); }); });
      // undo
      c.fillStyle = '#e63946'; c.beginPath(); c.roundRect(W - 78, ky - 48, 68, 34, 6); c.fill(); c.fillStyle = '#fff'; c.font = '700 14px Rubik, sans-serif'; c.fillText('UNDO', W - 44, ky - 26);
      c.fillStyle = '#1d3557'; c.textAlign = 'left'; c.fillText(`steps ${steps.length - 1}`, 14, ky - 26);
      c.textAlign = 'center';
      if (ml > 0) { c.fillStyle = '#e63946'; c.font = '700 16px Rubik, sans-serif'; c.fillText(msg, W / 2, 452); }
      else if (solved === 0 && steps.length === 1) { c.fillStyle = '#457b9d'; c.font = '600 14px Rubik, sans-serif'; c.fillText(slot < 0 ? 'Tap a letter of your word' : 'Now tap a new letter', W / 2, 452); }
      if (banner) { c.fillStyle = '#1d3557e0'; c.fillRect(0, H * .4 - 40, W, 80); c.fillStyle = '#fff'; c.font = '800 26px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .4); c.font = '600 16px Rubik, sans-serif'; c.fillText(banner.sub, W / 2, H * .4 + 26); }
    },
    down(x, y) {
      if (banner) return;
      const tw = 52, x0 = W / 2 - tw * 2, cy = 100 + (Math.min(5, steps.length) - 1) * 50;
      if (y > cy && y < cy + 46 && x > x0 && x < x0 + tw * 4) { slot = Math.floor((x - x0) / tw); sfx(600, .03, 'square', .02); haptic('tick'); return; }
      const kw = (W - 20) / 10, ky = H - 140;
      if (y > ky - 50 && y < ky - 10 && x > W - 80) { if (steps.length > 1) { steps.pop(); sfx(300, .05, 'triangle', .03); } return; }
      const ri = Math.floor((y - ky) / 44); if (ri < 0 || ri > 2) return;
      const off = (10 - KEYS[ri].length) * kw / 2, ci = Math.floor((x - 10 - off) / kw);
      if (ci < 0 || ci >= KEYS[ri].length) return;
      type(KEYS[ri][ci]);
    },
    key(k, d) {
      if (!d || banner) return;
      if (k === 'ArrowLeft') slot = Math.max(0, slot - 1); else if (k === 'ArrowRight') slot = Math.min(3, slot + 1);
      else if (k === 'Backspace' && steps.length > 1) steps.pop();
      else if (/^[a-z]$/i.test(k)) { if (slot < 0) slot = 0; type(k.toUpperCase()); }
    },
  };

  function type(ch) {
    if (slot < 0) { msg = 'Tap a letter of your word first'; ml = 1; return; }
    const w = now(); if (w[slot] === ch) return;
    const n = w.slice(0, slot) + ch + w.slice(slot + 1);
    if (!words.has(n.toLowerCase()) || !words.safe(n.toLowerCase())) { msg = `${n} isn't a word`; ml = 1; haptic('warning'); sfx(150, .12, 'square', .03); return; }
    steps.push(n); sfx(500 + steps.length * 40, .05, 'triangle', .03); haptic('light');
    if (n === target) {
      solved++; const used = steps.length - 1, pts = used <= par ? 4 : used <= par + 2 ? 2 : 1;
      score += pts; api.score(score); time = Math.min(120, time + 20);
      notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, 420); haptic('success');
      banner = { txt: used <= par ? 'Perfect climb!' : 'Made it!', sub: `${used} steps · +${pts}`, l: 1.3 };
    }
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'word-ladder',
  title: 'Word Ladder',
  tag: 'Casual · Words',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 20,
  hint: 'Change one letter at a time to turn your word into the target, making a real word every step. Tap a letter, then a new letter. Fewest steps scores most.',
  make,
};
