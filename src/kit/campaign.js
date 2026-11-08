// A campaign: chapters of missions that unlock in order (or by stars), up to three stars a mission
// (score targets or named challenges), collectibles hidden in each mission, extras that unlock at a
// star count, and a save that fits in api.save's 2 KB. The kit keeps the bookkeeping; your game draws
// the mission select and plays the missions (gs.missions for the script inside one).
//
//   const { Campaign } = gs.campaign;
//   const camp = new Campaign([
//     { id: 'docks', name: 'The Docks', missions: [
//       { id: 'd1', name: 'Way In', stars: [500, 900, 1400], collect: 3 },            // score targets
//       { id: 'd2', name: 'Cargo', stars: ['Finish', 'Unseen', 'Under 2:00'] },         // challenges
//     ] },
//     { id: 'tower', name: 'Tower', needs: { stars: 4 }, missions: [...] },
//   ], { extras: { 'gold-car': 6, 'big-head': 12 } }).attach(api);   // loads now, saves on every change
//   win: camp.finish('d1', { score }) or camp.finish('d2', { stars: [true, unseen, time < 120] })
//   pick-ups: camp.collect('d1', 2);   menu: camp.chapters (each mission has .state, .stars, .best)

const bits = n => { let c = 0; while (n) { c += n & 1; n >>= 1; } return c; };

export class Campaign {
  /**
   * chapters: [{ id, name, needs, missions: [{ id, name, stars, collect, needs }] }]. needs: { stars: n }
   * or { done: 'missionId' } (default: the mission before it is done; first mission of a chapter:
   * the chapter is open). extras: { name: starsNeeded }.
   */
  constructor(chapters = [], { extras = {} } = {}) {
    this.chapters = chapters.map(ch => ({ ...ch, missions: ch.missions.map(m => ({ ...m, chapter: ch.id })) }));
    this.missions = this.chapters.flatMap(ch => ch.missions);
    this.byId = new Map(this.missions.map(m => [m.id, m]));
    this.extras = extras; this.handlers = {}; this.api = null;
    this.clear(false);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Loads from api.load() now and saves with api.save() after every change (under the key `key`). */
  attach(api, key = 'campaign') { this.api = api; this.key = key; const d = api.load?.(null); if (d && d[key]) this.unpack(d[key]); this.refresh(); return this; }
  save() { if (!this.api) return; const d = this.api.load?.({}) || {}; d[this.key] = this.pack(); this.api.save(d); }
  /** Forget all progress. */
  clear(save = true) { this.rec = {}; this.got = new Set(); this.refresh(); if (save) this.save(); return this; }

  /** Stars in all. */
  get stars() { let s = 0; for (const r of Object.values(this.rec)) s += bits(r.s); return s; }
  get maxStars() { return this.missions.reduce((n, m) => n + (m.stars ? m.stars.length : 1), 0); }
  /** 0..1 how much of the campaign is done (missions, stars and collectibles together). */
  get progress() {
    const total = this.missions.length + this.maxStars + this.missions.reduce((n, m) => n + (m.collect || 0), 0);
    const have = Object.keys(this.rec).length + this.stars + this.missions.reduce((n, m) => n + this.collected(m.id), 0);
    return total ? have / total : 0;
  }
  done(id) { return !!this.rec[id]; }
  best(id) { return this.rec[id]?.b ?? null; }
  starsOf(id) { return bits(this.rec[id]?.s || 0); }
  /** Which stars a mission has, as [true, false, true]. */
  starList(id) { const m = this.byId.get(id), s = this.rec[id]?.s || 0; return (m?.stars || [1]).map((_, i) => !!(s & (1 << i))); }
  meets(needs, prev) {
    if (!needs) return prev == null || this.done(prev);
    if (needs.stars != null && this.stars < needs.stars) return false;
    if (needs.done && !this.done(needs.done)) return false;
    return true;
  }
  chapterOpen(ch) { const i = this.chapters.indexOf(ch); if (i < 0) return false; if (ch.needs) return this.meets(ch.needs); return i === 0 || this.done(this.chapters[i - 1].missions.at(-1).id); }
  /** 'locked' | 'open' | 'done'. */
  state(id) {
    const m = this.byId.get(id); if (!m) return 'locked';
    if (this.done(id)) return 'done';
    const ch = this.chapters.find(c => c.id === m.chapter), i = ch.missions.indexOf(m);
    if (!this.chapterOpen(ch)) return 'locked';
    return this.meets(m.needs, i > 0 ? ch.missions[i - 1].id : null) ? 'open' : 'locked';
  }
  open(id) { return this.state(id) !== 'locked'; }
  /** The first open mission not yet done (where "Continue" goes), or null when all are done. */
  next() { return this.missions.find(m => this.state(m.id) === 'open') || null; }
  /** Extras unlocked by stars: { name: true/false }. */
  get unlocked() { const s = this.stars, o = {}; for (const [k, n] of Object.entries(this.extras)) o[k] = s >= n; return o; }
  has(extra) { return this.stars >= (this.extras[extra] ?? Infinity); }

  /**
   * A mission was won. score: compared with numeric stars; stars: [bool...] for challenge stars.
   * Keeps the best. Returns { stars, newStars, best, unlocked: [missions and extras just opened] }.
   */
  finish(id, { score = null, stars = null } = {}) {
    const m = this.byId.get(id); if (!m) return null;
    const before = new Set(this.missions.filter(x => this.open(x.id)).map(x => x.id)), extrasBefore = this.unlocked;
    let mask = 0;
    if (stars) stars.forEach((on, i) => { if (on) mask |= 1 << i; });
    else if (m.stars && typeof m.stars[0] === 'number' && score != null) m.stars.forEach((t, i) => { if (score >= t) mask |= 1 << i; });
    else mask = 1;
    const r = this.rec[id] || { s: 0, b: null }, old = r.s;
    r.s |= mask; if (score != null && (r.b == null || score > r.b)) r.b = score;
    this.rec[id] = r;
    const unlocked = [...this.missions.filter(x => this.open(x.id) && !before.has(x.id)).map(x => x.id), ...Object.keys(this.extras).filter(k => this.unlocked[k] && !extrasBefore[k])];
    this.refresh(); this.save();
    const out = { stars: bits(r.s), newStars: bits(r.s) - bits(old), best: r.b, unlocked };
    this.emit('finish', id, out); for (const u of unlocked) this.emit('unlock', u);
    return out;
  }
  /** Picked up collectible number i (0-based) in a mission. True if it's new. */
  collect(id, i) { const k = id + ':' + i; if (this.got.has(k)) return false; this.got.add(k); this.refresh(); this.save(); this.emit('collect', id, i); return true; }
  /** Already picked up collectible i in this mission? */
  picked(id, i) { return this.got.has(id + ':' + i); }
  collected(id) { let n = 0; for (const k of this.got) if (k.startsWith(id + ':')) n++; return n; }

  // the menu view: every mission gets .state, .stars, .best and .found
  refresh() {
    for (const m of this.missions) { m.state = this.state(m.id); m.got = this.starsOf(m.id); m.best = this.best(m.id); m.found = this.collected(m.id); }
    for (const ch of this.chapters) { ch.open = this.chapterOpen(ch); ch.stars = ch.missions.reduce((n, m) => n + m.got, 0); }
    return this;
  }
  /** Compact form for api.save: [[missionIndex, starBits, best], ...] and collectible keys. */
  pack() {
    const r = Object.entries(this.rec).map(([id, v]) => [this.missions.findIndex(m => m.id === id), v.s, v.b]).filter(x => x[0] >= 0);
    const g = [...this.got].map(k => { const [id, i] = k.split(':'); return [this.missions.findIndex(m => m.id === id), +i]; }).filter(x => x[0] >= 0);
    return { r, g };
  }
  unpack(d) {
    this.rec = {}; this.got = new Set();
    for (const [i, s, b] of d?.r || []) { const m = this.missions[i]; if (m) this.rec[m.id] = { s, b: b ?? null }; }
    for (const [i, n] of d?.g || []) { const m = this.missions[i]; if (m) this.got.add(m.id + ':' + n); }
    this.refresh(); return this;
  }
}
