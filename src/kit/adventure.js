// Point-and-click adventures: rooms with hotspots you tap, things to pick up, "use X on Y" puzzles,
// exits between rooms, flags for what has happened, and a map that draws itself from the rooms you've
// been to. The kit answers what a tap means and what happens; your game draws the rooms, the hero
// walking over, the text and the inventory (gs.items.Inventory works as the bag; dialogue: gs.story).
//
//   const { Adventure } = gs.adventure;
//   reset() {
//     adv = new Adventure({ start: 'hall' });
//     adv.room('hall', { map: [0, 0] })
//       .spot('door', { x: 300, y: 200, w: 60, h: 160, look: 'A heavy oak door.', exit: 'library', locked: 'The door is locked.' })
//       .spot('key', { x: 80, y: 520, r: 20, look: 'A small brass key.', take: true })
//       .spot('rug', { poly: [[100, 600], [260, 600], [240, 640], [120, 640]], look: 'Something lumpy is under it.', when: () => !adv.flag('rugMoved') });
//     adv.room('library', { map: [1, 0] });
//     adv.rule('key', 'door', () => { adv.unlock('hall', 'door'); return 'The key turns. Click!'; });
//     adv.on('say', text => typer.show(text)).on('enter', room => fade());
//   }
//   down(x, y) { const r = adv.tap(x, y, held); held = null; }   // held: the item picked in the bag, if any
//
// tap(x, y, item) finds the hotspot (topmost first) and does it: with an item, a use rule (item on
// spot), else a spot's own action: take (into adv.bag), exit (a room change, unless locked), talk, or
// look. Each returns { spot, did: 'take' | 'exit' | 'use' | 'look' | 'talk' | 'locked' | 'nothing', text }
// and fires events, so the game can walk the hero there first (walkTo) and then call it.

const inRect = (s, x, y) => x >= s.x - s.w / 2 && x <= s.x + s.w / 2 && y >= s.y - s.h / 2 && y <= s.y + s.h / 2;
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

export class Adventure {
  /** start: the first room; bag: an inventory (anything with add/take/has/count; default a simple list). */
  constructor({ start = null, bag = null } = {}) {
    this.rooms = new Map(); this.rules = []; this.flags = {}; this.here = start; this.seen = new Set(start ? [start] : []);
    this.bag = bag || new SimpleBag(); this.handlers = {}; this.taken = new Set(); this.unlocked = new Set();
    this.lines = { nothing: "That doesn't do anything.", cant: "I can't use that there." };
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Adds a room. o: { map: [col, row] on the auto-map, name, ...anything of yours }. Returns the room (chain .spot()). */
  room(id, o = {}) {
    const adv = this, r = { id, name: o.name || id, spots: [], ...o };
    r.spot = (sid, s) => { adv.addSpot(r, sid, s); return r; };
    this.rooms.set(id, r);
    if (!this.here) { this.here = id; this.seen.add(id); }
    return r;
  }
  /** A hotspot: a rect { x, y, w, h } (centre), a circle { x, y, r } or { poly: [[x, y]...] }. o: look, take, exit, locked, talk, when (shown while true), walk: [x, y] where to stand, z (higher is on top). */
  addSpot(room, id, s) { const sp = { id, room: room.id, z: 0, ...s }; room.spots.push(sp); room.spots.sort((a, b) => b.z - a.z); return sp; }
  /** The spot by id (in a room, default here). */
  spot(id, room = this.here) { return this.rooms.get(room)?.spots.find(s => s.id === id) || null; }
  /** Spots showing in the room now (taken things and ones whose when() is false are gone). */
  spots(room = this.here) { return (this.rooms.get(room)?.spots || []).filter(s => !this.taken.has(s.room + ':' + s.id) && (!s.when || s.when())); }
  /** The topmost spot under a point, or null. */
  at(x, y, room = this.here) {
    for (const s of this.spots(room)) {
      if (s.poly ? inPoly(s.poly, x, y) : s.r != null ? (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r ** 2 : inRect(s, x, y)) return s;
    }
    return null;
  }
  /** A puzzle step: using item on target (a spot id, or another item id to combine them in the bag) runs fn, which returns the text to say (and does what it likes). keep: the item isn't used up. */
  rule(item, target, fn, { keep = false } = {}) { this.rules.push({ item, target, fn, keep }); return this; }
  flag(k, v) { if (v === undefined) return this.flags[k]; this.flags[k] = v; this.emit('flag', k, v); return this; }
  unlock(room, spot) { this.unlocked.add(room + ':' + spot); return this; }
  isLocked(s) { return !!s.locked && !this.unlocked.has(s.room + ':' + s.id); }
  /** Goes to a room (exits do this). */
  go(room) { if (!this.rooms.has(room)) return this; const from = this.here; this.here = room; this.seen.add(room); this.emit('enter', this.rooms.get(room), from); return this; }
  say(text, spot) { if (text) this.emit('say', text, spot); return text; }
  /** What a tap at (x, y) means, done: with item (an id from the bag) a use, else the spot's own action. */
  tap(x, y, item = null) { const s = this.at(x, y); if (!s) return { spot: null, did: 'nothing', text: null }; return this.act(s, item); }
  /** Does a spot's action (after the hero walked there, say). verb: force 'look' (a long press). */
  act(s, item = null, verb = null) {
    const res = (did, text) => { this.say(text, s); this.emit(did, s, item); return { spot: s, did, text }; };
    if (item) {
      const r = this.rules.find(r => r.item === item && r.target === s.id);
      if (!r) return res('cant', typeof s.cant === 'function' ? s.cant(item) : s.cant || this.lines.cant);
      if (!r.keep) this.bag.take(item, 1);
      return res('use', r.fn(s, item) ?? '');
    }
    const say = v => typeof v === 'function' ? v(s) : v;
    if (verb === 'look') return res('look', say(s.look) || '');
    if (s.take) { this.taken.add(s.room + ':' + s.id); this.bag.add(typeof s.take === 'string' ? s.take : s.id, 1); return res('take', say(s.took) || ''); }
    if (s.exit) { if (this.isLocked(s)) return res('locked', say(s.locked) === true ? '' : say(s.locked)); this.go(s.exit); return res('exit', ''); }
    if (s.talk) return res('talk', say(s.talk));
    if (s.look) return res('look', say(s.look));
    return res('nothing', this.lines.nothing);
  }
  /** Combines two items in the bag (a rule from one to the other, either way round). */
  combine(a, b) {
    const r = this.rules.find(r => (r.item === a && r.target === b) || (r.item === b && r.target === a));
    if (!r || !this.bag.has(a) || !this.bag.has(b)) { this.say(this.lines.nothing); return null; }
    if (!r.keep) { this.bag.take(a, 1); this.bag.take(b, 1); }
    const text = r.fn(null, a, b) ?? ''; this.say(text); this.emit('combine', a, b); return text;
  }
  /** Where to stand for a spot: its walk point, or below its centre on the floor (y), for the hero to walk to first. */
  walkTo(s, floorY = null) { if (s.walk) return { x: s.walk[0], y: s.walk[1] }; const cx = s.poly ? s.poly.reduce((a, p) => a + p[0], 0) / s.poly.length : s.x; return { x: cx, y: floorY ?? (s.poly ? Math.max(...s.poly.map(p => p[1])) : s.y + (s.h || s.r || 0) / 2) }; }
  /** The auto-map: rooms you've seen with a map spot, and the links between them (exits). [{ id, name, col, row, here, links: [ids] }] */
  map() {
    const out = [];
    for (const id of this.seen) {
      const r = this.rooms.get(id); if (!r?.map) continue;
      const links = [...new Set(r.spots.filter(s => s.exit && this.seen.has(s.exit)).map(s => s.exit))];
      out.push({ id, name: r.name, col: r.map[0], row: r.map[1], here: id === this.here, links });
    }
    return out;
  }
  /** Draws the auto-map: boxes of size w x h with gap, at x, y. style: { room, here, line, text, font }. */
  drawMap(c, x, y, { w = 40, h = 26, gap = 14, room = '#2a3240', here = '#e8c060', line = '#8a96a8', text = '#fff', font = '9px sans-serif' } = {}) {
    const m = this.map(), byId = new Map(m.map(r => [r.id, r])), px = r => x + r.col * (w + gap), py = r => y + r.row * (h + gap);
    c.save(); c.strokeStyle = line; c.lineWidth = 2;
    for (const r of m) for (const l of r.links) { const o = byId.get(l); if (!o || o.id < r.id) continue; c.beginPath(); c.moveTo(px(r) + w / 2, py(r) + h / 2); c.lineTo(px(o) + w / 2, py(o) + h / 2); c.stroke(); }
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const r of m) { c.fillStyle = r.here ? here : room; c.fillRect(px(r), py(r), w, h); c.fillStyle = r.here ? '#000' : text; c.fillText(r.name.slice(0, 8), px(r) + w / 2, py(r) + h / 2); }
    c.restore();
  }
  /** Plain data for api.save, and back. */
  save() { return { h: this.here, s: [...this.seen], f: this.flags, t: [...this.taken], u: [...this.unlocked], b: this.bag.save?.() }; }
  load(d) {
    if (!d) return this;
    this.here = d.h ?? this.here; this.seen = new Set(d.s || []); this.flags = d.f || {}; this.taken = new Set(d.t || []); this.unlocked = new Set(d.u || []);
    if (d.b) this.bag.load?.(d.b);
    return this;
  }
}

/** The default bag: counts by id (gs.items.Inventory or gs.battle.Bag for slots and limits). */
class SimpleBag {
  constructor() { this.items = new Map(); }
  add(id, n = 1) { this.items.set(id, (this.items.get(id) || 0) + n); return 0; }
  take(id, n = 1) { const h = this.items.get(id) || 0; if (h < n) return false; if (h === n) this.items.delete(id); else this.items.set(id, h - n); return true; }
  count(id) { return this.items.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  get list() { return [...this.items].map(([id, n]) => ({ id, n })); }
  save() { return Object.fromEntries(this.items); }
  load(d) { this.items = new Map(Object.entries(d || {})); return this; }
}
