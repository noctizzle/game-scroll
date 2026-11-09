// Trivia: a bank of about 2,700 quiz questions (from the Open Trivia Database, CC BY-SA 4.0: general
// knowledge, animals, geography, history, science, maths, computers, sport, art, myths, vehicles,
// books, music; grown-up topics left out) that loads the first time a game asks, so make it in
// make() or reset(). A Quiz deals questions in a seeded order with no repeats, shuffles the answers,
// keeps score and streaks, can climb in difficulty as you get them right, and gives a 50:50. The
// rules say a game can't carry its own data files, so the questions live here. Your game draws them.
//
//   const { Quiz, categories } = gs.trivia;
//   reset() { quiz = new Quiz({ categories: ['animals', 'science'], climb: true, seed: gs.math.daily('quiz') }); q = quiz.next(); }
//   // q: { text, answers: ['Elbow', 'Knee', ...], kind: 'choice' | 'truefalse', difficulty: 'easy', category: 'Science and nature' }
//   down(x, y) { const r = quiz.answer(tapped); if (r.right) feel.coin(x, y); q = quiz.next(); }   // r: { right, correct, streak, score }
//   quiz.fifty()      // two wrong answers to grey out
//   api.save(quiz.pack()) ... new Quiz({ ..., resume: api.load(null) })   // carries on without repeats
//
// Show `CREDIT` somewhere in the game (an about line is fine): the licence asks for it.

import { lazy } from './lazy.js';

const bank = lazy('Trivia', () => import('./trivia-bank.js').then(m => ({ cats: m.CATEGORIES, qs: m.QUESTIONS })));
/** Loads the bank now (app only: games just make a Quiz in make() or reset() and the app waits). */
export const loadTrivia = () => bank.load();
/** The credit the question licence asks for. */
export const CREDIT = 'Questions from the Open Trivia Database (opentdb.com), CC BY-SA 4.0';
const LEVELS = ['easy', 'medium', 'hard'];

const rng = seed => { if (typeof seed === 'function') return seed; let s = typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : (seed ?? Math.random() * 2 ** 32) | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** The categories: [{ id, name, count }]. */
export function categories() {
  const { cats, qs } = bank.get(), n = {}; for (const q of qs) n[q[0]] = (n[q[0]] || 0) + 1;
  return Object.entries(cats).map(([id, name]) => ({ id, name, count: n[id] || 0 }));
}

export class Quiz {
  /**
   * categories: ids (all if left out); difficulty: 'easy' | 'medium' | 'hard' | a list (all if left
   * out); kind: 'choice' | 'truefalse' (both); climb: start easy and step up after `climb` right in a
   * row (true = 3), back down after a miss; seed: a number or string (gs.math.daily for a daily quiz);
   * resume: what pack() gave, to carry on the same order.
   */
  constructor({ categories: cats = null, difficulty = null, kind = null, climb = false, seed = null, resume = null } = {}) {
    const { cats: names, qs } = bank.get();
    this.names = names; this.climb = climb === true ? 3 : climb || 0;
    const levels = difficulty == null ? [0, 1, 2] : [].concat(difficulty).map(d => LEVELS.indexOf(d)).filter(d => d >= 0);
    const want = cats && new Set([].concat(cats));
    this.seed = resume?.s ?? (typeof seed === 'number' ? seed >>> 0 : rng(seed)() * 2 ** 32 >>> 0);
    const ids = [];
    qs.forEach((q, i) => { if ((!want || want.has(q[0])) && levels.includes(q[1]) && (!kind || (kind === 'truefalse') === (q.length === 4))) ids.push(i); });
    this.order = shuffle(ids, rng(this.seed)); this.used = new Set(); this.r = rng(this.seed ^ 0x9e3779b9);
    for (const i of resume?.u ? this.order.slice(0, resume.u) : []) this.used.add(i);
    this.pos = resume?.u || 0; this.level = this.climb ? Math.min(...levels) : null; this.levels = levels;
    this.score = 0; this.asked = 0; this.streak = 0; this.best = 0; this.q = null;
  }
  /** How many questions this quiz can still ask. */
  get left() { return this.order.length - this.used.size; }
  /** The difficulty the quiz is on now, with climb ('easy' | 'medium' | 'hard'), or null. */
  get difficulty() { return this.level == null ? null : LEVELS[this.level]; }
  /** The next question, or null when they've all been asked: { text, answers, kind, difficulty, category, categoryId, id }. */
  next() {
    const qs = bank.get().qs;
    let k = -1;
    if (this.level != null) {   // the next unasked one at the level now, else the nearest level
      for (const lv of [...this.levels].sort((a, b) => Math.abs(a - this.level) - Math.abs(b - this.level) || a - b)) {
        k = this.order.findIndex(i => !this.used.has(i) && qs[i][1] === lv); if (k >= 0) break;
      }
    } else { while (this.pos < this.order.length && this.used.has(this.order[this.pos])) this.pos++; k = this.pos < this.order.length ? this.pos : -1; }
    if (k < 0) return (this.q = null);
    const id = this.order[k], q = qs[id]; this.used.add(id);
    let answers, correct;
    if (q.length === 4) { answers = ['True', 'False']; correct = q[3] ? 0 : 1; }
    else { const all = q.slice(3); answers = shuffle(all.slice(), this.r); correct = answers.indexOf(all[0]); }
    this.q = { id, text: q[2], answers, kind: q.length === 4 ? 'truefalse' : 'choice', difficulty: LEVELS[q[1]], category: this.names[q[0]], categoryId: q[0], correct };
    return { ...this.q, correct: undefined };
  }
  /** Answers the question now with an answer's index: { right, correct (the right index), streak, score }. Each question counts once. */
  answer(i) {
    const q = this.q; if (!q || q.done) return { right: false, correct: q ? q.correct : -1, streak: this.streak, score: this.score };
    q.done = true; this.asked++;
    const right = i === q.correct;
    if (right) { this.score++; this.streak++; this.best = Math.max(this.best, this.streak); } else this.streak = 0;
    if (this.level != null) {
      if (right && this.streak % this.climb === 0) this.level = Math.min(Math.max(...this.levels), this.level + 1);
      if (!right) this.level = Math.max(Math.min(...this.levels), this.level - 1);
    }
    return { right, correct: q.correct, streak: this.streak, score: this.score };
  }
  /** Time ran out: counts as a miss. */
  timeout() { return this.answer(-1); }
  /** A 50:50: the indices of two wrong answers to take away (one for true or false: none). */
  fifty() {
    const q = this.q; if (!q || q.kind === 'truefalse') return [];
    return shuffle(q.answers.map((_, i) => i).filter(i => i !== q.correct), this.r).slice(0, 2);
  }
  /** Where the quiz is, small enough for api.save: { s: seed, u: how far through }. Order-based, so with climb a resumed quiz may repeat a few. */
  pack() { let u = 0; while (u < this.order.length && this.used.has(this.order[u])) u++; return { s: this.seed, u }; }
}
