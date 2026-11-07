// On-device "more like this": no server. Each game gets a set of traits from its tag and hint
// (era, genre, how you control it, which phone sensor it uses). Hearts and long play sessions
// raise the weight of those traits; Meh lowers it. The feed queue is a weighted shuffle, so
// games like the ones you heart come up sooner, but every game still comes round once per cycle.
import { rating, stats } from './qa.js';

const CONTROLS = { tap: /\btap/i, hold: /\bhold/i, drag: /\bdrag/i, swipe: /\bswipe|flick/i, tilt: /\btilt/i, shake: /\bshake/i, mic: /\bmic|shout|blow|clap|voice/i, camera: /camera/i, compass: /compass|turn your (whole )?body/i, haptics: /buzz|haptic|thump/i };

const cache = new Map();
export function traits(g) {
  if (cache.has(g.id)) return cache.get(g.id);
  const t = new Set([g.era === 'nextgen' || g.era === 'console' ? 'era:' + g.era : g.retro ? 'era:pocket' : 'era:casual']);
  for (const part of String(g.tag || '').split('·').slice(1)) for (const w of part.trim().toLowerCase().split(/\s+/)) t.add('genre:' + w);
  for (const [k, re] of Object.entries(CONTROLS)) if (re.test(g.hint || '') || re.test(g.tag || '')) t.add('ctl:' + k);
  for (const x of g.traits || []) t.add(x);   // a game can add its own, e.g. traits: ['theme:space']
  cache.set(g.id, t); return t;
}

/** How much you like each trait, from hearts (+2), Meh (-2) and time spent (up to +1). */
export function affinity(games) {
  const a = new Map();
  for (const g of games) {
    const r = rating(g.id), secs = stats(g.id).secs;
    const w = (r > 0 ? 2 : r < 0 ? -2 : 0) + Math.min(1, secs / 180);
    if (!w) continue;
    for (const t of traits(g)) a.set(t, (a.get(t) || 0) + w);
  }
  return a;
}

// Genre says most about taste, controls a bit, era (pocket vs casual) only a little.
const KIND = { genre: 1, theme: 1, ctl: .5, era: .3 };

/** Weight for one game: 1 is neutral, up to 8x for a close match, down to 0.15x for disliked traits. */
export function weight(g, aff) {
  let s = 0; for (const t of traits(g)) s += (aff.get(t) || 0) * (KIND[t.split(':')[0]] ?? .5);
  return Math.max(.15, Math.min(8, Math.exp(s * .35)));
}

/** Weighted shuffle (Efraimidis-Spirakis): higher weight tends to come earlier, nothing is excluded. */
export function rankQueue(pool, allGames) {
  const aff = affinity(allGames);
  return pool.map(g => ({ g, k: Math.pow(Math.random(), 1 / weight(g, aff)) })).sort((x, y) => y.k - x.k).map(x => x.g);
}
