// Turn-based battles, items and levelling, for RPGs, monster battlers and roguelikes. The kit does the
// sums (turn order, damage, status effects, items, XP); your game picks moves, draws the fight and
// writes the words.
//
//   const { Fighter, Battle, Bag, levelFor, loot } = gs.battle;
//   hero = new Fighter({ name: 'Pip', hp: 30, atk: 8, def: 4, spd: 6, type: 'leaf' });
//   slime = new Fighter({ name: 'Goo', hp: 18, atk: 5, def: 2, spd: 3, type: 'water' });
//   fight = new Battle([[hero], [slime]], { types: { leaf: { water: 2, fire: .5 } } });
//   fight.on('hit', e => popup(e.target, e.amount, e.crit)).on('status', e => ...).on('faint', e => ...);
//   tap "Attack": fight.act(hero, { move: { power: 10, type: 'leaf' }, target: slime });
//   then let the enemy act: fight.act(fight.turn, { move: claw, target: hero });   // fight.turn: whose go it is
//   fight.over -> 0 or 1 (the winning side) or null
//
// Status effects: fight.inflict(target, 'poison', 3) (turns). Built in: poison and burn (hurt at the
// end of each turn), stun and sleep (skip turns; sleep ends when hit), shield (halves damage),
// regen (heals), and buffs: { atk: 1.5 } style multipliers with Fighter.buff('atk', 1.5, 3).
// Add your own: new Battle(sides, { statuses: { freeze: { skip: true, ends: 'hit' } } }).

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class Fighter {
  constructor({ name = '?', hp = 10, atk = 5, def = 3, spd = 5, luck = .05, type = null, level = 1, ...more } = {}) {
    Object.assign(this, { name, maxHp: hp, hp, atk, def, spd, luck, type, level, ...more });
    this.statuses = new Map(); this.buffs = [];
  }
  get alive() { return this.hp > 0; }
  /** A stat with its buffs: f.stat('atk'). */
  stat(k) { let v = this[k] ?? 0; for (const b of this.buffs) if (b.stat === k) v *= b.by; return v; }
  /** Multiplies a stat for some turns: f.buff('def', 1.5, 3) (below 1 for a debuff). */
  buff(stat, by, turns = 3) { this.buffs.push({ stat, by, turns }); return this; }
  has(status) { return this.statuses.has(status); }
  heal(n) { const before = this.hp; this.hp = clamp(this.hp + Math.round(n), 0, this.maxHp); return this.hp - before; }
}

const BUILT_IN = {
  poison: { tick: f => Math.max(1, Math.round(f.maxHp / 12)) },
  burn: { tick: f => Math.max(1, Math.round(f.maxHp / 16)), stat: { atk: .75 } },
  regen: { tick: f => -Math.max(1, Math.round(f.maxHp / 12)) },
  stun: { skip: true },
  sleep: { skip: true, ends: 'hit' },
  shield: { guard: .5 },
};

export class Battle {
  /**
   * sides: arrays of Fighters ([[hero, ally], [slime, bat]]). Options: types (attacker type -> { defender
   * type: multiplier }), statuses (extra kinds), rng, crit (damage multiplier on a lucky hit, 1.5),
   * spread (random 0.85..1 damage, true).
   */
  constructor(sides, { types = {}, statuses = {}, rng = Math.random, crit = 1.5, spread = true } = {}) {
    this.sides = sides; this.types = types; this.kinds = { ...BUILT_IN, ...statuses };
    this.rng = rng; this.critX = crit; this.spread = spread; this.handlers = {}; this.log = []; this.round = 1;
    this.queue = []; this.next();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, e) { e.type = ev; this.log.push(e); if (this.log.length > 50) this.log.shift(); for (const f of this.handlers[ev] || []) f(e); for (const f of this.handlers['*'] || []) f(e); return e; }
  get fighters() { return this.sides.flat(); }
  sideOf(f) { return this.sides.findIndex(s => s.includes(f)); }
  foes(f) { return this.sides.filter((_, i) => i !== this.sideOf(f)).flat().filter(x => x.alive); }
  friends(f) { return (this.sides[this.sideOf(f)] || []).filter(x => x.alive); }
  /** The side still standing (0, 1...) once only one is, else null. */
  get over() { const up = this.sides.map((s, i) => s.some(f => f.alive) ? i : -1).filter(i => i >= 0); return up.length <= 1 ? (up[0] ?? -1) : null; }

  /** Whose turn it is (fastest first each round; ties go to the earlier fighter). */
  get turn() { return this.queue[0] || null; }
  next() {
    this.queue = this.queue.filter(f => f.alive);
    if (!this.queue.length) {
      this.queue = this.fighters.filter(f => f.alive).sort((a, b) => b.stat('spd') - a.stat('spd'));
      if (this.log.length) this.round++;
    }
    // a fighter that must skip (stunned, asleep) loses its turn here
    const f = this.queue[0];
    if (f && [...f.statuses.keys()].some(k => this.kinds[k]?.skip) && this.over == null) {
      this.emit('skip', { who: f, status: [...f.statuses.keys()].find(k => this.kinds[k]?.skip) });
      this.endTurn(f); return this.next();
    }
    return f;
  }
  /** Damage this move would do (no randomness): for previews and AI. */
  preview(by, target, move = {}) { return this.damage(by, target, move, false).amount; }
  damage(by, target, move = {}, roll = true) {
    const power = move.power ?? 10, stat = move.special ? 'mag' : 'atk', guard = move.special ? 'res' : 'def';
    const a = by.stat(stat) || by.stat('atk'), d = Math.max(1, target.stat(guard) || target.stat('def'));
    let n = power * a / (a + d) * (1 + by.level * .05);
    const eff = (this.types[move.type ?? by.type] || {})[target.type] ?? 1;
    n *= eff;
    const crit = roll && this.rng() < (move.crit ?? by.luck);
    if (crit) n *= this.critX;
    if (roll && this.spread) n *= .85 + this.rng() * .15;
    for (const k of target.statuses.keys()) if (this.kinds[k]?.guard) n *= this.kinds[k].guard;
    return { amount: Math.max(move.power === 0 ? 0 : 1, Math.round(n)), crit, effect: eff };
  }
  /**
   * Takes a turn: { move: { power, type, special, crit, heal, status: ['poison', 3], buff: ['atk', 1.5, 3], hits }, target }
   * or { item, target } with an item from a Bag, or { wait: true }. Returns the events it caused.
   */
  act(by, { move = null, item = null, target = null, wait = false } = {}) {
    if (this.over != null || !by?.alive) return [];
    const start = this.log.length;
    if (item) { this.useItem(by, item, target || by); }
    else if (move && !wait) {
      const hits = move.hits || 1, t = target || this.foes(by)[0];
      for (let i = 0; i < hits && t?.alive; i++) {
        if (move.miss && this.rng() < move.miss) { this.emit('miss', { who: by, target: t, move }); continue; }
        if (move.power !== 0) {
          const d = this.damage(by, t, move);
          t.hp = Math.max(0, t.hp - d.amount);
          this.emit('hit', { who: by, target: t, move, amount: d.amount, crit: d.crit, effect: d.effect });
          for (const [k] of t.statuses) if (this.kinds[k]?.ends === 'hit') { t.statuses.delete(k); this.emit('cured', { target: t, status: k }); }
          if (!t.alive) this.emit('faint', { target: t, by });
        }
      }
      if (move.heal) { const h = (target && this.sideOf(target) === this.sideOf(by) ? target : by).heal(move.heal); this.emit('heal', { who: by, target: target || by, amount: h }); }
      if (move.status && t?.alive && (move.chance == null || this.rng() < move.chance)) this.inflict(t, move.status[0], move.status[1]);
      if (move.buff) { const [stat, x, turns] = move.buff, who = x >= 1 ? by : t; who.buff(stat, x, turns); this.emit('buff', { who, stat, by: x, turns }); }
    } else this.emit('wait', { who: by });
    this.endTurn(by);
    if (this.over != null) this.emit('over', { winner: this.over });
    else this.next();
    return this.log.slice(start);
  }
  /** Puts a status on a fighter for some turns (refreshes it if it has it). */
  inflict(target, status, turns = 3) {
    if (!this.kinds[status]) throw new Error(`Battle: no status "${status}"`);
    target.statuses.set(status, turns); this.emit('status', { target, status, turns });
    return this;
  }
  useItem(by, item, target) {
    const it = item.def || item;
    if (item.bag && !item.bag.take(item.id)) return;
    if (it.heal) this.emit('heal', { who: by, target, amount: target.heal(it.heal), item: it });
    if (it.cure) { for (const k of [].concat(it.cure)) target.statuses.delete(k); this.emit('cured', { target, status: it.cure, item: it }); }
    if (it.damage) { target.hp = Math.max(0, target.hp - it.damage); this.emit('hit', { who: by, target, amount: it.damage, item: it }); if (!target.alive) this.emit('faint', { target, by }); }
    if (it.status) this.inflict(target, it.status[0], it.status[1]);
    if (it.buff) target.buff(...it.buff);
    it.use?.(target, by, this);
    this.emit('item', { who: by, target, item: it });
  }
  endTurn(f) {
    this.queue = this.queue.filter(x => x !== f);
    for (const [k, left] of [...f.statuses]) {
      const kind = this.kinds[k];
      if (kind.tick && f.alive) { const n = kind.tick(f); if (n > 0) { f.hp = Math.max(0, f.hp - n); this.emit('hurt', { target: f, status: k, amount: n }); if (!f.alive) this.emit('faint', { target: f, status: k }); } else if (n < 0) this.emit('heal', { target: f, status: k, amount: f.heal(-n) }); }
      if (left <= 1) { f.statuses.delete(k); this.emit('cured', { target: f, status: k }); } else f.statuses.set(k, left - 1);
    }
    f.buffs = f.buffs.filter(b => --b.turns > 0);
  }
}

/** Items with counts: bag.add('potion', 3), bag.take('potion'), bag.count('potion'), bag.list. */
export class Bag {
  constructor(defs = {}, { slots = Infinity, stack = 99 } = {}) { this.defs = defs; this.slots = slots; this.stack = stack; this.items = new Map(); }
  add(id, n = 1) {
    const have = this.items.get(id) || 0;
    if (!have && this.items.size >= this.slots) return 0;
    const max = this.defs[id]?.stack ?? this.stack, put = Math.min(n, max - have);
    if (put > 0) this.items.set(id, have + put);
    return Math.max(0, put);
  }
  take(id, n = 1) { const have = this.items.get(id) || 0; if (have < n) return false; if (have === n) this.items.delete(id); else this.items.set(id, have - n); return true; }
  count(id) { return this.items.get(id) || 0; }
  has(id, n = 1) { return this.count(id) >= n; }
  /** [{ id, n, def, bag }] (pass one to Battle.act as { item }). */
  get list() { return [...this.items].map(([id, n]) => ({ id, n, def: this.defs[id] || { id }, bag: this })); }
  /** Plain data for api.save, and back. */
  save() { return Object.fromEntries(this.items); }
  load(data) { this.items = new Map(Object.entries(data || {}).filter(([, n]) => n > 0)); return this; }
}

/** XP needed to reach a level: curve(level) = base * level^power (default 10 * level^2.2, rounded). */
export const xpFor = (level, { base = 10, power = 2.2 } = {}) => level <= 1 ? 0 : Math.round(base * Math.pow(level - 1, power));
/** The level for an amount of XP. */
export function levelFor(xp, o = {}) { let l = 1; while (xpFor(l + 1, o) <= xp && l < 999) l++; return l; }
/** Gives XP; returns the levels gained (and raises stats by growth: { hp: 3, atk: 1 } per level). */
export function gainXp(f, xp, { growth = { hp: 3, atk: 1, def: 1, spd: .5 }, curve } = {}) {
  f.xp = (f.xp || 0) + xp; const to = levelFor(f.xp, curve), up = to - f.level;
  for (let i = 0; i < up; i++) for (const [k, v] of Object.entries(growth)) { if (k === 'hp') { f.maxHp += v; f.hp += v; } else f[k] = (f[k] || 0) + v; }
  f.level = to; return up;
}
/** Picks from a weighted table: loot([{ id: 'coin', w: 10 }, { id: 'gem', w: 1 }], rng) -> the entry. */
export function loot(table, rng = Math.random) {
  const total = table.reduce((s, e) => s + (e.w ?? 1), 0); let x = rng() * total;
  for (const e of table) if ((x -= e.w ?? 1) < 0) return e;
  return table[table.length - 1];
}
