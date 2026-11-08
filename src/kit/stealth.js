// Stealth extras on top of gs.senses: how lit the player is (a light meter that feeds the guards'
// eyes), takedowns from behind, bodies that guards find and raise the alarm over, floors that are
// louder than others, and disguises that let you walk past some guards. The kit does the checks; your
// game draws the meter, plays the takedown and hides the body.
//
//   const { lightAt, Takedown, Bodies, Floors, Disguise } = gs.stealth;
//   update(dt) {
//     const lit = lightAt(player, lamps, { ambient: .15, sees: (a, b) => nav.sees(a.x, a.y, b.x, b.y) });   // 0 dark .. 1 bright
//     for (const g of guards) g.senses.update(dt, g, player, { sees, noises, light: disguise.light(g, lit) });
//     noises.make(player.x, player.y, floors.noise(player, speed));     // gravel is loud, carpet quiet
//     const t = Takedown.check(player, guards, { reach: 1.2 });          // a guard you can take down now, or null
//     bodies.update(dt, guards, sees);                                   // a guard who sees a body goes alert
//   }
//
// Positions are { x, y } (3D games: pass x and z as x and y). Guards have facing (radians) and their
// gs.senses Senses as g.senses.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * How lit a point is: 0 (pitch dark) to 1. lights: [{ x, y, r (reach), i (strength, default 1), cone,
 * dir }] (a cone in radians around dir for torches and spotlights). ambient: the light everywhere.
 * sees(light, point): pass a wall test and walls cast shadows.
 */
export function lightAt(p, lights, { ambient = .1, sees = null } = {}) {
  let l = ambient;
  for (const s of lights) {
    const d = dist(p, s), r = s.r ?? 8; if (d >= r) continue;
    if (s.cone != null) { const a = Math.atan2(p.y - s.y, p.x - s.x), off = Math.abs(Math.atan2(Math.sin(a - (s.dir || 0)), Math.cos(a - (s.dir || 0)))); if (off > s.cone / 2) continue; }
    if (sees && !sees(s, p)) continue;
    const k = 1 - d / r; l += (s.i ?? 1) * k * k;
  }
  return Math.min(1, l);
}

/** Takedowns: a guard within reach, not alert, that you are behind (outside their view). */
export const Takedown = {
  /** The guard you could take down now (or null). behind: how far round from their facing counts (radians). */
  check(player, guards, { reach = 1.2, behind = 1.9, moods = ['calm', 'suspicious', 'searching'] } = {}) {
    let best = null, bd = Infinity;
    for (const g of guards) {
      if (g.down || g.dead) continue;
      const d = dist(player, g); if (d > reach || d >= bd) continue;
      const a = Math.atan2(player.y - g.y, player.x - g.x), off = Math.abs(Math.atan2(Math.sin(a - g.facing), Math.cos(a - g.facing)));
      if (off < Math.PI - behind / 2) continue;   // must be behind them
      if (g.senses && !moods.includes(g.senses.mood)) continue;
      best = g; bd = d;
    }
    return best;
  },
  /** Can a guard who is facing you be knocked out anyway (stunned, or you have a stun gadget)? */
  front(player, g, { reach = 1.2 } = {}) { return !g.down && dist(player, g) <= reach; },
};

/**
 * Bodies left behind. add(x, y) when a guard goes down; carry/drop to move one; hide(body) in a
 * locker or bush. A guard who sees a body (within `range`, in their cone) goes alert, once per body.
 */
export class Bodies {
  constructor({ range = 8 } = {}) { this.list = []; this.range = range; this.handlers = {}; }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  add(x, y, who = null) { const b = { x, y, who, hidden: false, found: false, carried: false }; this.list.push(b); return b; }
  carry(b) { b.carried = true; return b; }
  drop(b, x, y) { b.carried = false; b.x = x; b.y = y; return b; }
  hide(b) { b.hidden = true; b.carried = false; return b; }
  /** Bodies a point is next to (to pick up). */
  near(p, reach = 1.2) { return this.list.filter(b => !b.hidden && !b.carried && dist(b, p) <= reach); }
  update(dt, guards, sees = null) {
    for (const b of this.list) {
      if (b.hidden || b.found) continue;
      for (const g of guards) {
        if (g.down || g.dead || g === b.who) continue;
        if (dist(g, b) > this.range) continue;
        if (g.senses && !g.senses.inCone(g, b.x, b.y)) continue;
        if (sees && !sees(g, b)) continue;
        b.found = true; if (g.senses) { g.senses.mood = 'alert'; g.senses.awareness = 1; g.senses.lastSeen = { x: b.x, y: b.y }; }
        for (const f of this.handlers.found || []) f(b, g);
        break;
      }
    }
    return this;
  }
}

/** Floors that make more or less noise: kinds { gravel: 1.6, carpet: .4, metal: 1.4, water: 1.8 }, at(p) gives a kind. */
export class Floors {
  constructor(kinds = {}, at = () => null, { walk = 20, run = 55 } = {}) { this.kinds = { gravel: 1.6, metal: 1.4, water: 1.8, wood: 1.1, grass: .8, carpet: .4, ...kinds }; this.at = at; this.walk = walk; this.run = run; }
  /** How far footsteps carry at this speed (0 when still or sneaking slowly). sneak: speeds below this are silent. */
  noise(p, speed, { sneak = 1.2, runSpeed = 4 } = {}) {
    if (speed < sneak) return 0;
    const base = speed >= runSpeed ? this.run : this.walk;
    return base * (this.kinds[this.at(p)] ?? 1);
  }
}

/**
 * Disguises: who a disguise fools. disguise.wear('guard'); guards with g.rank in fools stop
 * noticing you (their light is turned right down), except up close or while you do something odd
 * (disguise.blow() for a while after a shot or a run).
 */
export class Disguise {
  constructor({ fools = { guard: ['guard', 'worker'], worker: ['worker'] }, close = 1.5 } = {}) { this.fools = fools; this.close = close; this.wearing = null; this.odd = 0; }
  wear(kind) { this.wearing = kind; return this; }
  off() { this.wearing = null; return this; }
  /** Something suspicious just happened: the disguise doesn't work for `seconds`. */
  blow(seconds = 3) { this.odd = Math.max(this.odd, seconds); return this; }
  update(dt) { this.odd = Math.max(0, this.odd - dt); return this; }
  /** Does it fool this guard right now? */
  fooling(g, player = null) { return !!this.wearing && this.odd <= 0 && (this.fools[this.wearing] || []).includes(g.rank) && !(player && dist(g, player) < this.close); }
  /** The light value to give this guard's senses (low when the disguise fools them). */
  light(g, lit, player = null) { return this.fooling(g, player) ? lit * .05 : lit; }
}
