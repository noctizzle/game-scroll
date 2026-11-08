// Words: an English dictionary (about 60,000 words from SCOWL, British spellings too) that loads
// the first time a game asks, so make it in make() or reset(). Check a word, pick a common one at
// random (rude words are never picked), find every word in some letters or in a letter grid, match
// patterns, compare a guess with the answer, and a letter bag for tile games. Your game draws the
// letters and sets the rules.
//
//   const { Words, compare, Bag, score } = gs.words;
//   reset() { dict = new Words(); answer = dict.random({ length: 5, seed: gs.math.daily('word') }); }
//   dict.has('ocean')                 // true
//   compare('crane', answer)          // ['miss', 'near', 'hit', 'miss', 'miss']
//   dict.from('tsrleai', { min: 3 })  // every word in those letters
//   dict.find(['cat', 'ore', 'pin'])  // words snaking through a grid, with their paths
//   bag = new Bag({ seed }); bag.draw(7)

import { lazy } from './lazy.js';
import { profaneWords } from '@2toad/profanity';

const data = lazy('Words', () => Promise.all([
  import('wordlist-english/english-words-10.json'), import('wordlist-english/english-words-20.json'), import('wordlist-english/english-words-35.json'),
  import('wordlist-english/british-words-10.json'), import('wordlist-english/british-words-20.json'), import('wordlist-english/british-words-35.json'),
  import('wordlist-english/english-words-40.json'), import('wordlist-english/english-words-50.json'),
  import('wordlist-english/british-words-40.json'), import('wordlist-english/british-words-50.json'),
]).then(parts => {
  const lists = parts.map(m => m.default || m), ok = w => /^[a-z]{2,}$/.test(w);
  const rude = new Set((profaneWords.get?.('en') || []).map(w => w.toLowerCase())), stems = [...rude].filter(r => r.length > 3 && /^[a-z]+$/.test(r));
  const clean = w => ok(w) && !rude.has(w) && !stems.some(r => w.length - r.length <= 3 && w.startsWith(r));
  const common = [...new Set(lists.slice(0, 6).flat().filter(clean))].sort();
  const all = new Set([...lists.flat().filter(ok)]);
  return { all, common, rude, stems };
}));
/** Loads the dictionary now (app only: games just make Words in make() or reset() and the app waits). */
export const loadWords = () => data.load();

const rng = seed => { if (seed == null) return Math.random; if (typeof seed === 'function') return seed; let s = typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const counts = s => { const c = new Array(26).fill(0); for (const ch of s) { const i = ch.charCodeAt(0) - 97; if (i >= 0 && i < 26) c[i]++; } return c; };

export class Words {
  constructor() { const d = data.get(); this.all = d.all; this.common = d.common; this.rude = d.rude; this.stems = d.stems; this.byLen = new Map(); this.keys = null; this.trie = null; }
  /** Is it a word? */
  has(w) { return this.all.has(String(w).toLowerCase()); }
  /** Not rude (for words players type that others will see). */
  safe(w) { const x = String(w).toLowerCase(); return !this.rude.has(x) && !this.stems.some(r => x.includes(r)); }
  /** How many words it knows. */
  get size() { return this.all.size; }
  of(len) { if (!this.byLen.has(len)) this.byLen.set(len, this.common.filter(w => w.length === len)); return this.byLen.get(len); }
  /** A common, clean word at random: length (or min / max), seed (a number, a string, or gs.math.daily()), starts, has (letters it must contain). */
  random({ length = null, min = 3, max = 8, seed = null, starts = '', has = '' } = {}) {
    const R = rng(seed);
    let pool = length ? this.of(length) : this.common.filter(w => w.length >= min && w.length <= max);
    if (starts) pool = pool.filter(w => w.startsWith(starts)); if (has) pool = pool.filter(w => [...has].every(c => w.includes(c)));
    return pool.length ? pool[(R() * pool.length) | 0] : null;
  }
  /** Every word you can spell from these letters (each used once; '?' is a blank). min: shortest; common: only everyday words. */
  from(letters, { min = 3, max = 15, common = false } = {}) {
    const have = counts(String(letters).toLowerCase()), blanks = (String(letters).match(/[?*]/g) || []).length, out = [];
    for (const w of common ? this.common : this.all) {
      if (w.length < min || w.length > max) continue;
      const need = counts(w); let short = 0; for (let i = 0; i < 26; i++) if (need[i] > have[i]) short += need[i] - have[i];
      if (short <= blanks) out.push(w);
    }
    return out.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  }
  /** Words with exactly these letters rearranged. */
  anagrams(w) {
    if (!this.keys) { this.keys = new Map(); for (const x of this.all) { const k = [...x].sort().join(''); (this.keys.get(k) || this.keys.set(k, []).get(k)).push(x); } }
    const k = [...String(w).toLowerCase()].sort().join(''); return (this.keys.get(k) || []).filter(x => x !== w);
  }
  /** Words matching a pattern: '?' any one letter, '*' any run of letters: match('c?t'), match('*ing'). */
  match(pattern, { common = false, limit = 200 } = {}) {
    const re = new RegExp('^' + String(pattern).toLowerCase().replace(/[^a-z?*]/g, '').replace(/\?/g, '[a-z]').replace(/\*/g, '[a-z]*') + '$'), out = [];
    for (const w of common ? this.common : this.all) if (re.test(w)) { out.push(w); if (out.length >= limit) break; }
    return out;
  }
  /**
   * Every word hidden in a grid of letters (rows of text), moving to touching cells (diagonals
   * too unless diagonal: false), each cell once. Returns [{ word, path: [[col, row], ...] }], longest first.
   */
  find(grid, { min = 3, diagonal = true, common = false } = {}) {
    if (!this.trie || this.trieCommon !== common) { this.trie = {}; this.trieCommon = common; for (const w of common ? this.common : this.all) { if (w.length > 12) continue; let n = this.trie; for (const c of w) n = n[c] ||= {}; n.$ = w; } }
    const G = grid.map(r => String(r).toLowerCase()), rows = G.length, found = new Map();
    const dirs = diagonal ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
    const walk = (c, r, node, path, used) => {
      const ch = G[r][c], next = node[ch]; if (!next) return;
      const key = r * 64 + c; used.add(key); path.push([c, r]);
      if (next.$ && next.$.length >= min && !found.has(next.$)) found.set(next.$, path.slice());
      for (const [dc, dr] of dirs) { const nc = c + dc, nr = r + dr; if (nr >= 0 && nr < rows && nc >= 0 && nc < G[nr].length && !used.has(nr * 64 + nc)) walk(nc, nr, next, path, used); }
      used.delete(key); path.pop();
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < G[r].length; c++) walk(c, r, this.trie, [], new Set());
    return [...found].map(([word, path]) => ({ word, path })).sort((a, b) => b.word.length - a.word.length);
  }
}

/** Compares a guess with the answer letter by letter: 'hit' (right place), 'near' (in the word elsewhere), 'miss'. Repeated letters count fairly. */
export function compare(guess, answer) {
  const g = String(guess).toLowerCase(), a = String(answer).toLowerCase(), out = new Array(g.length).fill('miss'), left = {};
  for (let i = 0; i < g.length; i++) if (g[i] === a[i]) out[i] = 'hit'; else left[a[i]] = (left[a[i]] || 0) + 1;
  for (let i = 0; i < g.length; i++) if (out[i] !== 'hit' && left[g[i]] > 0) { out[i] = 'near'; left[g[i]]--; }
  return out;
}

/** How often each letter turns up in English words (per thousand letters). */
export const LETTERS = { e: 111, a: 85, r: 76, i: 75, o: 72, t: 70, n: 67, s: 57, l: 55, c: 45, u: 36, d: 34, p: 32, m: 30, h: 30, g: 25, b: 21, f: 18, y: 18, w: 13, k: 11, v: 10, x: 3, z: 3, j: 2, q: 2 };
/** Points for a letter: rarer letters score more (1 for e .. 10 for q). Pass your own values to score() instead if you like. */
export const VALUES = Object.fromEntries(Object.entries(LETTERS).map(([c, f]) => [c, Math.max(1, Math.min(10, Math.round(Math.log2(111 / f) * 1.8) + 1))]));
/** A word's score: the letters' values added up (values: your own table), times `mult`. */
export function score(word, { values = VALUES, mult = 1 } = {}) { let s = 0; for (const c of String(word).toLowerCase()) s += values[c] || 0; return s * mult; }

/** A bag of letter tiles in English proportions (size tiles, blanks '?'), drawn at random. */
export class Bag {
  constructor({ size = 100, blanks = 2, seed = null, letters = LETTERS } = {}) {
    this.R = rng(seed); const total = Object.values(letters).reduce((a, b) => a + b, 0), n = size - blanks; this.tiles = [];
    for (const [c, f] of Object.entries(letters)) for (let i = 0, k = Math.max(1, Math.round(f / total * n)); i < k; i++) this.tiles.push(c);
    for (let i = 0; i < blanks; i++) this.tiles.push('?');
    this.shuffle();
  }
  get left() { return this.tiles.length; }
  shuffle() { const t = this.tiles; for (let i = t.length - 1; i > 0; i--) { const j = (this.R() * (i + 1)) | 0; [t[i], t[j]] = [t[j], t[i]]; } return this; }
  draw(n = 1) { return this.tiles.splice(Math.max(0, this.tiles.length - n), n); }
  put(...tiles) { this.tiles.push(...tiles.flat()); return this.shuffle(); }
}
