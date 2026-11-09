// Builds src/kit/trivia-bank.js (the question bank behind gs.trivia) from a dump of the Open Trivia
// Database's verified questions (opentdb.com, CC BY-SA 4.0). Keeps the family-friendly, lasting
// categories, decodes the HTML codes, and drops questions with grown-up topics, rude words, answers
// that go stale ("currently", "as of") or answers that only make sense in order ("all of the above").
//
//   curl -o /tmp/opentdb.json https://raw.githubusercontent.com/kickturn/opentdb-scraper/master/opentdb.json
//   node scripts/trivia-bank.mjs /tmp/opentdb.json
//
// The bank is an adapted version of the Open Trivia Database, so it stays under CC BY-SA 4.0 (the
// header written into the file says so); the kit code that reads it is ours.
import { readFileSync, writeFileSync } from 'node:fs';
import { profaneWords } from '@2toad/profanity';

const src = process.argv[2]; if (!src) { console.log('usage: node scripts/trivia-bank.mjs <opentdb.json>'); process.exit(1); }
const raw = JSON.parse(readFileSync(src, 'utf8')), all = Array.isArray(raw) ? raw : Object.values(raw).flat();

// OpenTDB category -> our id and name (the rest, mostly films, TV, games, comics and politics, stay out)
const CATS = {
  'General Knowledge': ['general', 'General knowledge'], 'Animals': ['animals', 'Animals'], 'Geography': ['geography', 'Geography'],
  'History': ['history', 'History'], 'Science & Nature': ['science', 'Science and nature'], 'Science: Mathematics': ['maths', 'Maths'],
  'Science: Computers': ['computers', 'Computers'], 'Sports': ['sports', 'Sport'], 'Art': ['art', 'Art'], 'Mythology': ['myths', 'Myths and legends'],
  'Vehicles': ['vehicles', 'Vehicles'], 'Entertainment: Books': ['books', 'Books'], 'Entertainment: Music': ['music', 'Music'],
};
const ENT = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', shy: '', lrm: '', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', hellip: '…', deg: '°', pi: 'π', trade: '™', reg: '®',
  prime: '′', Prime: '″', minus: '−', micro: 'µ', divide: '÷', iquest: '¿', eth: 'ð', aelig: 'æ', oslash: 'ø', scaron: 'š', aring: 'å', Aring: 'Å',
  Tau: 'Τ', Sigma: 'Σ', Psi: 'Ψ', Pi: 'Π', Phi: 'Φ', Omicron: 'Ο', Nu: 'Ν', Delta: 'Δ' };
const ACC = { acute: '́', grave: '̀', uml: '̈', circ: '̂', tilde: '̃', cedil: '̧', ring: '̊' };
const decode = s => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-zA-Z]+);/g, (m, n) => {
  if (n in ENT) return ENT[n]; const a = /^([a-zA-Z])(acute|grave|uml|circ|tilde|cedil|ring)$/.exec(n); return a ? (a[1] + ACC[a[2]]).normalize('NFC') : m;
}).replace(/\s+/g, ' ').trim();

const rude = new Set(profaneWords.get?.('en') || []);
// grown-up or upsetting topics: fine in a pub quiz, not on a family app's feed
const ADULT = /\b(sex\w*|porn\w*|nud(e|ity)|naked|brothel|prostitut\w*|rap(e|ed|ist)|murder\w*|kill\w*|suicide|assassin\w*|execut(ed|ion)|tortur\w*|genocide|holocaust|nazi\w*|hitler|massacre|slave\w*|terror\w*|bomb\w*|guns?|rifle|pistol|drugs?|cocaine|heroin|marijuana|cannabis|opium|alcohol\w*|beer|vodka|whisk(e)?y|wine|cocktail|drunk\w*|cigar\w*|tobacco|smoking|gambl\w*|casino|corpse|deadliest|weapon\w*|cannibal\w*|satan\w*|hell|damn\w*|abortion|playboy|lingerie)\b/i;
const STALE = /\b(currently|current|as of|this year|latest|most recent|recently|nowadays|today|right now|so far|to date|still alive|newest|upcoming)\b/i;
const ORDER = /^(all|none|both) of (the|these) |^(all|none) of the above$|^neither$/i;

const out = [], seen = new Set(), counts = {};
for (const q of all) {
  const cat = CATS[decode(q.category)]; if (!cat) continue;
  const text = decode(q.question), right = decode(q.correct_answer), wrong = q.incorrect_answers.map(decode);
  const words = `${text} ${right} ${wrong.join(' ')}`;
  if (ADULT.test(words) || STALE.test(text) || [right, ...wrong].some(a => ORDER.test(a))) continue;
  if (words.toLowerCase().split(/[^a-z']+/).some(w => rude.has(w))) continue;
  if (text.length > 170 || [right, ...wrong].some(a => !a || a.length > 48) || /which of (these|the following).*(not|isn't)/i.test(text) && wrong.length < 3) continue;
  if (/\b(pictured|shown|image|picture|below|above)\b/i.test(text)) continue;   // nothing to show
  const key = text.toLowerCase(); if (seen.has(key)) continue; seen.add(key);
  const d = { easy: 0, medium: 1, hard: 2 }[q.difficulty] ?? 1;
  out.push(q.type === 'boolean' ? [cat[0], d, text, right === 'True' ? 1 : 0] : [cat[0], d, text, right, ...wrong]);
  counts[cat[0]] = (counts[cat[0]] || 0) + 1;
}
out.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || (a[2] < b[2] ? -1 : 1));   // stable ids across rebuilds of the same dump
const names = Object.fromEntries(Object.values(CATS));
const head = `// The question bank behind gs.trivia (src/kit/trivia.js): ${out.length} questions adapted from the Open Trivia
// Database (https://opentdb.com), by its contributors, under CC BY-SA 4.0
// (https://creativecommons.org/licenses/by-sa/4.0/). Changes: only some categories, HTML codes decoded,
// questions with grown-up topics or answers that go stale left out. This file (and only this file) is
// shared under the same licence. Made by scripts/trivia-bank.mjs: don't edit it by hand.
//
// Each question: [category, difficulty (0 easy, 1 medium, 2 hard), question, then either the right answer
// and the wrong ones, or for true or false questions 1 (true) or 0 (false)].
`;
writeFileSync(new URL('../src/kit/trivia-bank.js', import.meta.url), `${head}export const CATEGORIES = ${JSON.stringify(names)};\nexport const QUESTIONS = [\n${out.map(q => JSON.stringify(q)).join(',\n')},\n];\n`);
console.log(`${out.length} questions`, counts);
