// The feed brain: a small learner on top of the For you ranking (recommend.js) that works out what
// this player actually enjoys, from what they play and what they scroll past. Nothing leaves the phone.
//
// The ranking's hand-set factors (taste, everyone, freshness, discovery) are the same for every
// player. The brain learns two things they can't:
//   1. How much this player follows each factor: some always want new games, some follow the
//      crowd, some stick to what they love.
//   2. When: traits by time of day and by how deep into a scroll they are ("puzzles in the
//      evening", "short reflex games when the app has just opened").
// It's a logistic regression (will this view be played or skipped?) on those features, trained one
// view at a time. Its answer becomes one more factor in the ranking.
//
// Guard rails, so it can only nudge the feed, never take it over:
//   - it starts neutral (1x) and only grows in as it sees outcomes (full say after about 40);
//   - its factor stays between 0.5x and 2x, so nothing is ever hidden and the shuffle still explores;
//   - it learns slowly and drifts back to neutral when it's not reminded (old habits fade);
//   - how much it can lean on each factor is capped (it can't turn discovery off);
//   - reset() wipes it (Settings › Reset recommendations does).
// This file is pure: feedsignals.js keeps it on the phone and feeds it each view's outcome.

const DENSE = ['taste', 'everyone', 'fresh', 'discover'];
const BUCKETS = 256, LR = .08, DECAY = .0004, FULL = 40;   // decay: an unused lean halves in about 1700 views
const CAP = 1.5, DENSE_MIN = -.5, DENSE_MAX = 1.5, MOST = Math.log(2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Time of day as a bucket: night (0-5), morning (6-11), afternoon (12-17), evening (18-23). */
export const timeOfDay = hour => ['night', 'morning', 'afternoon', 'evening'][Math.floor(((hour % 24) + 24) % 24 / 6)];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % BUCKETS; }

export class FeedBrain {
  constructor(saved = null) { this.reset(); if (saved) this.unpack(saved); }
  reset() { this.w = new Float32Array(BUCKETS); this.d = new Float32Array(DENSE.length); this.bias = 0; this.n = 0; this.shown = new Map(); return this; }

  /**
   * The features of one game right now. traits: the game's traits (recommend.js traits()); parts:
   * the ranking's factors ({ taste, everyone, fresh, discover }); ctx: { hour, depth } (depth: how
   * many games this session so far).
   */
  features(traits, parts, { hour = 12, depth = 0 } = {}) {
    const tod = 'tod:' + timeOfDay(hour), when = depth < 3 ? 'start' : depth >= 8 ? 'deep' : 'mid';
    const h = new Set();
    for (const t of traits) { h.add(hash(t)); h.add(hash(t + '|' + tod)); h.add(hash(t + '|' + when)); }
    return { d: DENSE.map(k => Math.log(Math.max(1e-3, parts[k] ?? 1))), h: [...h] };
  }
  score(f) { let s = 0; for (let i = 0; i < f.d.length; i++) s += this.d[i] * f.d[i]; for (const j of f.h) s += this.w[j] / Math.sqrt(f.h.length); return s; }
  /** How sure it is of its own say, 0..1 (grows with the outcomes it has seen). */
  get sure() { return Math.min(1, this.n / FULL); }
  /** Its factor for the ranking: 0.5x to 2x, 1 until it has seen some outcomes. */
  boost(f) { return Math.exp(clamp(this.score(f), -MOST, MOST) * this.sure); }

  /** One view's outcome: played (true) or skipped (false). */
  learn(f, played) {
    const s = this.score(f) + this.bias, p = 1 / (1 + Math.exp(-s)), g = (played ? 1 : 0) - p;
    const k = 1 - DECAY;
    for (let i = 0; i < this.w.length; i++) this.w[i] *= k;          // old habits fade
    for (let i = 0; i < this.d.length; i++) this.d[i] = clamp(this.d[i] * k + LR * g * f.d[i], DENSE_MIN, DENSE_MAX);
    for (const j of f.h) this.w[j] = clamp(this.w[j] + LR * g / Math.sqrt(f.h.length), -CAP, CAP);
    this.bias = clamp(this.bias + LR * g, -3, 3);                     // how often this player plays at all (not used in boost)
    this.n++;
    return p;
  }

  /** The ranking calls this for each game it weighs, so the outcome can be learned from what was shown. */
  saw(id, f) { this.shown.set(id, f); if (this.shown.size > 3000) this.shown.delete(this.shown.keys().next().value); }
  /** A view of id ended: w > 0 played, w < 0 skipped (history.js). Returns true if it learned. */
  outcome(id, w) {
    const f = this.shown.get(id);
    if (!f || !w) return false;
    this.learn(f, w > 0); return true;
  }

  /** How much it leans on each factor, for the QA panel. */
  stats() { return { seen: this.n, sure: +this.sure.toFixed(2), ...Object.fromEntries(DENSE.map((k, i) => [k, +this.d[i].toFixed(3)])) }; }
  pack() { return { v: 1, n: this.n, b: +this.bias.toFixed(4), d: [...this.d].map(x => +x.toFixed(4)), w: [...this.w].map(x => +x.toFixed(4)) }; }
  unpack(o) {
    if (!o || o.v !== 1 || !Array.isArray(o.w) || o.w.length !== BUCKETS || !Array.isArray(o.d) || o.d.length !== DENSE.length) return this;
    const num = (x, a, b) => (Number.isFinite(x) ? clamp(x, a, b) : 0);
    this.w = Float32Array.from(o.w, x => num(x, -CAP, CAP)); this.d = Float32Array.from(o.d, x => num(x, DENSE_MIN, DENSE_MAX));
    this.bias = num(o.b, -3, 3); this.n = Math.max(0, num(o.n, 0, 1e9) | 0);
    return this;
  }
}
