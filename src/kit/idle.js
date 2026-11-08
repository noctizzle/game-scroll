// Idle and upgrade maths: prices that climb, how many you can afford, earnings over time, and huge
// numbers written short (1.2K, 3.4M, 5.6aa). Money earned while the player was away comes from
// api.away() (seconds since this game last ran, worked out by the app, at most a week).
//
//   const { cost, afford, short, Earner } = gs.idle;
//   price = cost(15, 1.15, owned);              // the next one: 15 * 1.15^owned
//   bulk  = cost(15, 1.15, owned, 10);          // the next 10 together
//   n     = afford(15, 1.15, owned, coins);     // how many coins buys
//   label = short(1234567);                     // '1.23M'
//   reset() { const s = api.load({ coins: 0, rate: 1 }); coins = s.coins + s.rate * Math.min(api.away(), 8 * 3600) * .5; }   // half rate while away, up to 8 hours

const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Price of the next n after owning `owned`, growing by `growth` each: base * growth^owned * (growth^n - 1) / (growth - 1). */
export function cost(base, growth, owned = 0, n = 1) {
  if (n <= 0) return 0;
  if (growth === 1) return base * n;
  return base * Math.pow(growth, owned) * (Math.pow(growth, n) - 1) / (growth - 1);
}
/** How many can be bought with money (at most max). */
export function afford(base, growth, owned, money, max = 1e6) {
  if (money < cost(base, growth, owned)) return 0;
  if (growth === 1) return Math.min(max, Math.floor(money / base));
  const n = Math.floor(Math.log(money * (growth - 1) / (base * Math.pow(growth, owned)) + 1) / Math.log(growth));
  return Math.max(0, Math.min(max, n));
}
/** A number written short: 999 -> '999', 1234 -> '1.23K', 5.6e15 -> '5.60Qa', past those 'aa', 'ab'... */
export function short(n, digits = 3) {
  if (!isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : '?';
  const neg = n < 0; n = Math.abs(n);
  if (n < 1000) return (neg ? '-' : '') + (Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0).replace(/\.0+$/, ''));
  const tier = Math.floor(Math.log10(n) / 3);
  let s;
  if (tier < SUFFIX.length) s = SUFFIX[tier];
  else { const k = tier - SUFFIX.length; s = String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + k % 26); }
  const v = n / Math.pow(1000, tier), dp = Math.max(0, digits - String(Math.floor(v)).length);
  return (neg ? '-' : '') + v.toFixed(dp) + s;
}
/** Smooth growth for costs and rewards: level 1..n on a curve from `from` to `to` (power > 1 starts slow). */
export const curve = (level, levels, from, to, power = 2) => from + (to - from) * Math.pow(Math.min(1, Math.max(0, (level - 1) / Math.max(1, levels - 1))), power);

/**
 * Producers that earn per second: earner.add('farm', { base: 10, growth: 1.15, rate: 1 }), earner.buy('farm'),
 * earner.update(dt) adds to earner.money; earner.perSecond; earner.save() / load() for api.save.
 */
export class Earner {
  constructor(defs = {}, money = 0) { this.defs = defs; this.owned = {}; this.money = money; this.mult = 1; }
  add(id, def) { this.defs[id] = def; return this; }
  price(id, n = 1) { const d = this.defs[id]; return cost(d.base, d.growth ?? 1.15, this.owned[id] || 0, n); }
  canBuy(id, n = 1) { return this.money >= this.price(id, n); }
  buy(id, n = 1) { const p = this.price(id, n); if (this.money < p) return false; this.money -= p; this.owned[id] = (this.owned[id] || 0) + n; return true; }
  get perSecond() { let s = 0; for (const [id, d] of Object.entries(this.defs)) s += (this.owned[id] || 0) * (d.rate || 0); return s * this.mult; }
  update(dt) { this.money += this.perSecond * dt; return this; }
  /** Adds what it would have earned in `seconds` (times share, e.g. .5 for half rate while away). Returns the amount. */
  catchUp(seconds, share = 1) { const n = this.perSecond * Math.max(0, seconds) * share; this.money += n; return n; }
  save() { return { m: this.money, o: this.owned }; }
  load(d) { if (d) { this.money = +d.m || 0; this.owned = { ...(d.o || {}) }; } return this; }
}
