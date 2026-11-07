// The "For you" ranking. Everything runs on the phone; the server only supplies everyone's totals.
//
// Each game's weight multiplies five things:
//   1. Taste: traits (era, genre, controls, sensor) of games you heart, play long, or Meh/skip.
//   2. Mood: the last few games this session. Skip three puzzle games in a row and puzzles back off
//      for a while; play a racer for a minute and racers come sooner. Re-ranked as you scroll.
//   3. Everyone: anonymous play stats and shared hearts, smoothed so a game needs real numbers
//      before it moves much (a few views can't make or break it), plus a small "trending" lift.
//   4. Freshness: games you've never seen get a turn, games you just saw wait, and a game you keep
//      scrolling straight past shows up less and less (unless you hearted it).
//   5. Discovery: games few people have seen yet get a small lift so new games find players.
// Then a weighted shuffle (higher weight tends to come first, nothing is excluded, every game still
// comes round once per cycle) and a pass that avoids the same genre twice in a row.
//
// This file is pure (no storage, no network) so scripts/recommend.mjs can test it; the live signals
// it reads are wired up in feedsignals.js.

const CONTROLS = { tap: /\btap/i, hold: /\bhold/i, drag: /\bdrag/i, swipe: /\bswipe|flick/i, tilt: /\btilt/i, shake: /\bshake/i, mic: /\bmic|shout|blow|clap|voice/i, camera: /camera/i, compass: /compass|turn your (whole )?body/i, haptics: /buzz|haptic|thump/i };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const cache = new Map();
export function traits(g) {
  if (cache.has(g.id)) return cache.get(g.id);
  const t = new Set([g.era === 'nextgen' || g.era === 'console' ? 'era:' + g.era : g.retro ? 'era:pocket' : 'era:casual']);
  for (const part of String(g.tag || '').split('·').slice(1)) for (const w of part.trim().toLowerCase().split(/\s+/)) t.add('genre:' + w);
  for (const [k, re] of Object.entries(CONTROLS)) if (re.test(g.hint || '') || re.test(g.tag || '')) t.add('ctl:' + k);
  for (const x of g.traits || []) t.add(x);   // a game can add its own, e.g. traits: ['theme:space']
  cache.set(g.id, t); return t;
}
const genre = g => { for (const t of traits(g)) if (t.startsWith('genre:')) return t; return 'era:' + (g.era || g.retro); };

/** How much you like each trait: hearts +2, Meh -2, time spent up to +1, your quick skips up to -1. */
export function affinity(games, S) {
  const a = new Map();
  for (const g of games) {
    const r = S.rating(g.id), secs = S.mine(g.id).secs || 0, h = S.seen(g.id);
    const skips = h && r <= 0 ? Math.min(1, (h.k / Math.max(1, h.v)) * Math.min(1, h.v / 3)) : 0;
    const w = (r > 0 ? 2 : r < 0 ? -2 : 0) + Math.min(1, secs / 180) - skips;
    if (!w) continue;
    for (const t of traits(g)) a.set(t, (a.get(t) || 0) + w);
  }
  return a;
}

/** This session's mood per trait: the newest games count most. */
export function mood(games, S) {
  const m = new Map(), recent = S.session(), byId = new Map(games.map(g => [g.id, g]));
  recent.forEach((e, i) => {
    const g = byId.get(e.id); if (!g) return;
    const w = e.w * Math.pow(0.8, recent.length - 1 - i);
    for (const t of traits(g)) m.set(t, (m.get(t) || 0) + w);
  });
  return m;
}

// Genre says most about taste, controls a bit, era (pocket vs casual) only a little.
const KIND = { genre: 1, theme: 1, ctl: .5, era: .3 };
const sumTraits = (g, m) => { let s = 0; for (const t of traits(g)) s += (m.get(t) || 0) * (KIND[t.split(':')[0]] ?? .5); return s; };

/** Taste and mood: 1 is neutral, up to 8x for a close match, down to 0.15x for disliked traits. */
export function weight(g, aff, md = new Map()) {
  return clamp(Math.exp(sumTraits(g, aff) * .35 + clamp(sumTraits(g, md) * .6, -1.2, 1)), .15, 8);
}

/** Everyone's averages, used as the starting point (prior) for games with few views. */
export function baseline(games, S) {
  let v = 0, k = 0, s = 0, p = 0, h = 0;
  for (const g of games) { const c = S.global(g.id); if (!c) continue; v += c.v; k += c.k; s += c.s; p += c.p; h += S.hearts(g.id); }
  if (v < 200) return { skip: .35, secs: 25, play: .6, heart: .03, wshare: 7 / 30 };   // too little data yet: sensible guesses
  return { skip: clamp(k / v, .05, .9), secs: Math.max(3, s / v), play: clamp(p / v, .05, 3), heart: clamp(h / v, .002, .5), wshare: 7 / 30 };
}

const PRIOR = 40;   // a game's own numbers count for half once it has 40 views
/**
 * What everyone thinks, 0.55x to 1.8x: skip rate, play rate, seconds per view and hearts per view,
 * each compared with the average game and smoothed towards it while views are few.
 * A small trending lift when this week's plays are well above the game's monthly pace.
 */
export function popularity(id, B, S) {
  const c = S.global(id) || { v: 0, p: 0, k: 0, s: 0 };
  const v = c.v, sm = (x, prior) => (x + PRIOR * prior) / (v + PRIOR);
  const keep = (1 - sm(c.k, B.skip)) / (1 - B.skip);
  const play = sm(c.p, B.play) / B.play;
  const secs = sm(c.s, B.secs) / B.secs;
  const heart = sm(S.hearts(id), B.heart) / B.heart;
  let ln = .9 * Math.log(keep) + .35 * Math.log(play) + .35 * Math.log(secs) + .3 * Math.log(heart);
  if (c.wv >= 10 && c.v >= 20) ln += clamp(Math.log((c.wv / c.v) / B.wshare), 0, .5) * .4;   // trending this week
  return clamp(Math.exp(ln), .55, 1.8);
}

/** Few people have seen it yet: up to 1.35x so new games get a fair chance. */
export const discovery = (id, S) => 1 + .35 * Math.max(0, 1 - (S.global(id)?.v || 0) / 60);

/** Your own history with this game: new to you, seen a moment ago, or skipped again and again. */
export function freshness(g, S) {
  const h = S.seen(g.id);
  if (!h || !h.v) return 1.4;                                   // never seen it
  const hrs = (S.now() - h.t) / 3.6e6;
  let f = 1 - .85 * Math.exp(-hrs / 6);                         // just seen: wait; back to normal in a day or so
  if (S.rating(g.id) <= 0 && h.v >= 2) f *= Math.max(.3, Math.pow(.8, h.k - h.p));   // keeps getting skipped
  if (S.rating(g.id) > 0) f *= 1.15;                            // a favourite: let it come back a bit more
  return clamp(f, .1, 1.6);
}

/** Every factor for one game, for the QA panel ("why is this here?"). */
export function explain(g, allGames, S, aff = affinity(allGames, S), md = mood(allGames, S), B = baseline(allGames, S)) {
  const parts = { taste: weight(g, aff, md), everyone: popularity(g.id, B, S), fresh: freshness(g, S), discover: discovery(g.id, S) };
  return { ...parts, total: parts.taste * parts.everyone * parts.fresh * parts.discover };
}

/** Avoid the same genre back to back: look a few places ahead for something different. */
export function spread(list, look = 5) {
  const out = [], rest = [...list];
  while (rest.length) {
    const prev = out.length ? genre(out[out.length - 1]) : null;
    let i = 0;
    if (prev) { const j = rest.slice(0, look).findIndex(g => genre(g) !== prev); if (j > 0) i = j; }
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

/** Weighted shuffle (Efraimidis-Spirakis), then spread out genres. */
export function rankQueue(pool, allGames, S, rand = Math.random) {
  const aff = affinity(allGames, S), md = mood(allGames, S), B = baseline(allGames, S);
  const keyed = pool.map(g => ({ g, k: Math.pow(rand(), 1 / explain(g, allGames, S, aff, md, B).total) }));
  return spread(keyed.sort((x, y) => y.k - x.k).map(x => x.g));
}
