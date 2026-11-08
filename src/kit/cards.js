// Cards: decks that shuffle (seeded if you like), deal and reshuffle the discards; hands you can
// sort, total (aces high or low), split into sets and runs, and rank as poker hands (pokersolver,
// MIT). For your own card games: patience, rummy, snap, trick taking, deck builders. The kit keeps
// the cards; your game draws them however it likes (no card art here). No real-money gambling.
//
//   const { Deck, total, groups, poker, winners } = gs.cards;
//   deck = new Deck({ seed: gs.math.daily('cards') }).shuffle();
//   const hands = deck.deal(2, 5);                        // two players, five cards each
//   poker(hands[0]).name                                  // 'Two Pair'
//   total(hand)                                           // 21-style total, aces 1 or 11
//   groups(hand).runs                                     // [[5♥ 6♥ 7♥], ...] for rummy
// Cards are { suit: 'h' | 'd' | 'c' | 's', rank: 1-13 (1 ace, 11 jack, 12 queen, 13 king), id, name, red }.

import pokersolver from 'pokersolver';
const { Hand } = pokersolver;

export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_SIGN = { s: '♠', h: '♥', d: '♦', c: '♣', j: '★' };
const RANK_NAME = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rng = seed => { if (seed == null) return Math.random; let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/** Makes a card. rank 0 with suit 'j' is a joker. */
export function card(suit, rank) {
  const name = suit === 'j' ? 'Joker' : (RANK_NAME[rank] || String(rank)) + SUIT_SIGN[suit];
  return { suit, rank, id: suit + rank, name, red: suit === 'h' || suit === 'd', joker: suit === 'j' };
}

/** A deck. suits, ranks: what's in it (default 52 cards); jokers: how many; decks: how many packs shuffled together; seed. */
export class Deck {
  constructor({ suits = SUITS, ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], jokers = 0, decks = 1, seed = null, cards = null } = {}) {
    this.R = rng(seed);
    this.cards = cards ? cards.slice() : [];
    if (!cards) for (let d = 0; d < decks; d++) { for (const s of suits) for (const r of ranks) this.cards.push(card(s, r)); for (let j = 0; j < jokers; j++) this.cards.push(card('j', 0)); }
    this.all = this.cards.slice(); this.discards = [];
  }
  get size() { return this.cards.length; }
  get empty() { return this.cards.length === 0; }
  /** Shuffles what's left (Fisher-Yates). */
  shuffle() { const c = this.cards; for (let i = c.length - 1; i > 0; i--) { const j = (this.R() * (i + 1)) | 0; [c[i], c[j]] = [c[j], c[i]]; } return this; }
  /** Takes n cards off the top (fewer if it runs out; reshuffle: true shuffles the discards back in first). */
  draw(n = 1, { reshuffle = true } = {}) {
    const out = [];
    for (let i = 0; i < n; i++) { if (!this.cards.length && reshuffle && this.discards.length) this.refill(); if (!this.cards.length) break; out.push(this.cards.pop()); }
    return out;
  }
  /** One card (or null). */
  top() { return this.draw(1)[0] || null; }
  /** Looks at the top n without taking them. */
  peek(n = 1) { return this.cards.slice(-n).reverse(); }
  /** Deals n cards to each of `players` hands, one at a time round the table. */
  deal(players, n) { const hands = Array.from({ length: players }, () => []); for (let i = 0; i < n; i++) for (const h of hands) { const c = this.top(); if (c) h.push(c); } return hands; }
  /** Puts cards on the discard pile. */
  discard(...cs) { this.discards.push(...cs.flat()); return this; }
  /** Puts cards back on top, or at the bottom (bottom: true), or shuffled in (anywhere: true). */
  put(cs, { bottom = false, anywhere = false } = {}) { cs = [].concat(cs); if (anywhere) { for (const c of cs) this.cards.splice((this.R() * (this.cards.length + 1)) | 0, 0, c); } else if (bottom) this.cards.unshift(...cs); else this.cards.push(...cs); return this; }
  /** Discards back into the deck, shuffled. */
  refill() { this.cards.push(...this.discards); this.discards = []; return this.shuffle(); }
  /** Back to a full, shuffled deck. */
  reset() { this.cards = this.all.slice(); this.discards = []; return this.shuffle(); }
  /** For api.save: card ids in order. */
  save() { return { c: this.cards.map(c => c.id), d: this.discards.map(c => c.id) }; }
  load(s) { const by = new Map(this.all.map(c => [c.id, c])), get = id => by.get(id) || card(id[0], +id.slice(1)); if (s) { this.cards = s.c.map(get); this.discards = (s.d || []).map(get); } return this; }
}

/** Sorts cards by suit then rank (or rank then suit). aceHigh puts aces after kings. */
export function sort(cs, { by = 'suit', aceHigh = false, suits = SUITS } = {}) {
  const r = c => (aceHigh && c.rank === 1 ? 14 : c.rank), s = c => suits.indexOf(c.suit);
  return cs.slice().sort((a, b) => (by === 'suit' ? s(a) - s(b) || r(a) - r(b) : r(a) - r(b) || s(a) - s(b)));
}
/**
 * The best total of a hand: pictures count `face` (10), aces 1 or 11 (whichever fits under
 * `limit`), others their number. Returns { total, soft (an ace counts 11), bust }.
 */
export function total(cs, { face = 10, limit = 21, aceHigh = 11 } = {}) {
  let t = 0, aces = 0;
  for (const c of cs) { if (c.joker) continue; if (c.rank === 1) { aces++; t += 1; } else t += c.rank > 10 ? face : c.rank; }
  let soft = false; if (aces > 0 && t + aceHigh - 1 <= limit) { t += aceHigh - 1; soft = true; }   // one ace can count high
  return { total: t, soft, bust: t > limit };
}
/**
 * Sets (same rank) and runs (same suit, in a row) in a hand, for rummy-style games.
 * min: smallest set or run; aceHigh: runs can go Q-K-A.
 */
export function groups(cs, { min = 3, aceHigh = true } = {}) {
  const sets = [], runs = [], byRank = new Map(), bySuit = new Map();
  for (const c of cs) { if (c.joker) continue; (byRank.get(c.rank) || byRank.set(c.rank, []).get(c.rank)).push(c); (bySuit.get(c.suit) || bySuit.set(c.suit, []).get(c.suit)).push(c); }
  for (const g of byRank.values()) if (g.length >= min) sets.push(g);
  for (const g of bySuit.values()) {
    const at = new Map(g.map(c => [c.rank, c])); if (aceHigh && at.has(1)) at.set(14, at.get(1));
    let run = [];
    for (let r = 1; r <= 15; r++) { if (at.has(r)) run.push(at.get(r)); else { if (run.length >= min) runs.push(run); run = []; } }
  }
  return { sets, runs };
}
const PS = c => (c.rank === 1 ? 'A' : c.rank === 10 ? 'T' : c.rank > 10 ? RANK_NAME[c.rank] : String(c.rank)) + c.suit;
/** The best poker hand in these cards (any 5 of up to 7): { name ('Full House'), rank (higher is better), cards, describe }. */
export function poker(cs) {
  const h = Hand.solve(cs.filter(c => !c.joker).map(PS));
  const by = new Map(cs.map(c => [PS(c), c]));
  return { name: h.name, describe: h.descr, rank: h.rank, cards: h.cards.map(k => by.get(k.value + k.suit) || by.get((k.value === '10' ? 'T' : k.value) + k.suit)).filter(Boolean), solved: h };
}
/** Which of these hands win at poker (indexes; more than one on a tie). */
export function winners(hands) {
  const solved = hands.map(h => Hand.solve(h.filter(c => !c.joker).map(PS))), win = Hand.winners(solved);
  return solved.map((s, i) => (win.includes(s) ? i : -1)).filter(i => i >= 0);
}
/** Can card a go on card b in a patience column (one lower, other colour)? Change the rule with options. */
export function stacks(a, b, { down = true, alternate = true, sameSuit = false } = {}) {
  if (!b) return a.rank === 13 || !down;
  if (down ? a.rank !== b.rank - 1 : a.rank !== b.rank + 1) return false;
  if (sameSuit) return a.suit === b.suit;
  return alternate ? a.red !== b.red : true;
}
