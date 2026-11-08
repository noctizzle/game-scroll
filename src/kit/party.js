// Pass-and-play: two to four people taking turns on one phone, or playing at once on halves of the
// screen (great on an unfolded phone laid flat between two players). The kit keeps whose go it is,
// each player's score, and a "hand it over" pause between turns that waits for a tap, so nobody sees
// the next player's hand. Your game draws everything, including the hand-over screen (or uses cover()).
//
//   const { Turns, Split } = gs.party;
//   reset() { turns = new Turns({ players: 2, names: ['Red', 'Blue'] }); }
//   down(x, y) {
//     if (turns.waiting) return turns.ready();               // the hand-over screen: tap to start your go
//     ...the move...; turns.add(3);                           // points for whoever's turn it is
//     turns.next();                                          // pass the phone (waiting until a tap)
//   }
//   draw(c) { ...; if (turns.waiting) turns.cover(c, W, H); }  // or draw your own
//   turns.player -> { index, name, color, score }, turns.round, turns.leader, turns.over(rounds)
//
// Both at once: split = new Split(W, H, { players: 2, facing: true }); in down/move/up, const p = split.who(x, y)
// says whose half it is, and split.local(p, x, y) gives the point in that player's own view (turned
// round for the player sitting opposite when facing). split.begin(c, p) ... split.end(c) draws a half.

const COLORS = ['#e8453c', '#3a8fe8', '#3cc46a', '#f2b632'];

export class Turns {
  constructor({ players = 2, names = null, colors = COLORS, handover = true, first = 0 } = {}) {
    this.players = Array.from({ length: Math.max(1, Math.min(8, players)) }, (_, i) => ({ index: i, name: names?.[i] ?? `Player ${i + 1}`, color: colors[i % colors.length], score: 0, out: false }));
    this.i = first; this.round = 1; this.handover = handover; this.waiting = handover; this.t = 0;
  }
  get player() { return this.players[this.i]; }
  get leader() { return this.players.reduce((a, b) => (b.score > a.score ? b : a)); }
  /** Players still in (not knocked out with out()). */
  get left() { return this.players.filter(p => !p.out); }
  add(points, p = this.player) { p.score += points; return this; }
  /** Knocks a player out of the turn order. */
  out(p = this.player) { p.out = true; return this; }
  /** Passes to the next player still in; round goes up after the last. Waits on the hand-over screen. */
  next() {
    if (!this.left.length) return this;
    do { this.i = (this.i + 1) % this.players.length; if (this.i === 0) this.round++; } while (this.player.out);
    this.waiting = this.handover; this.t = 0;
    return this;
  }
  /** The next player has the phone: start their go. */
  ready() { this.waiting = false; return this; }
  /** True once `rounds` rounds are done (or one player is left). */
  over(rounds = Infinity) { return this.round > rounds || this.left.length <= 1; }
  /** The winner(s) by score: [player...]. */
  get winners() { const top = Math.max(...this.players.map(p => p.score)); return this.players.filter(p => p.score === top); }
  /** A plain hand-over screen: the next player's colour and name, "tap when ready". */
  cover(c, w, h, { text = 'Pass the phone', sub = 'Tap when you are ready' } = {}) {
    const p = this.player;
    c.save(); c.fillStyle = 'rgba(10,12,20,.92)'; c.fillRect(0, 0, w, h);
    c.fillStyle = p.color; c.beginPath(); c.arc(w / 2, h * .42, Math.min(w, h) * .09, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${Math.round(Math.min(w, h) * .07)}px Rubik, sans-serif`; c.fillText(`${p.name}'s turn`, w / 2, h * .56);
    c.font = `500 ${Math.round(Math.min(w, h) * .045)}px Rubik, sans-serif`; c.globalAlpha = .75; c.fillText(text, w / 2, h * .64); c.fillText(sub, w / 2, h * .7);
    c.restore();
  }
  save() { return { i: this.i, r: this.round, s: this.players.map(p => [p.score, p.out ? 1 : 0]) }; }
  load(d) { if (d) { this.i = d.i | 0; this.round = d.r | 0 || 1; d.s?.forEach(([s, o], k) => { if (this.players[k]) { this.players[k].score = s; this.players[k].out = !!o; } }); } return this; }
}

/**
 * Splits the screen between players playing at the same time: 2 players top/bottom (facing: the top
 * one sits opposite, so their half is turned round), or side by side (across: true); 3-4 players in
 * quarters.
 */
export class Split {
  constructor(w, h, { players = 2, facing = true, across = false } = {}) {
    this.w = w; this.h = h; this.n = Math.max(2, Math.min(4, players)); this.facing = facing; this.across = across;
    this.areas = this.make();
  }
  make() {
    const { w, h, n } = this;
    if (n === 2) return this.across
      ? [{ x: 0, y: 0, w: w / 2, h, turn: 0 }, { x: w / 2, y: 0, w: w / 2, h, turn: 0 }]
      : [{ x: 0, y: h / 2, w, h: h / 2, turn: 0 }, { x: 0, y: 0, w, h: h / 2, turn: this.facing ? Math.PI : 0 }];
    const q = [{ x: 0, y: h / 2, w: w / 2, h: h / 2, turn: 0 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2, turn: 0 }, { x: w / 2, y: 0, w: w / 2, h: h / 2, turn: this.facing ? Math.PI : 0 }, { x: 0, y: 0, w: w / 2, h: h / 2, turn: this.facing ? Math.PI : 0 }];
    return q.slice(0, n);
  }
  resize(w, h) { this.w = w; this.h = h; this.areas = this.make(); return this; }
  /** Which player's area a point is in (0..). */
  who(x, y) { return this.areas.findIndex(a => x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h); }
  /** A screen point in player p's own view: { x, y } from 0,0 at their top-left, the way they see it. */
  local(p, x, y) {
    const a = this.areas[p]; let lx = x - a.x, ly = y - a.y;
    if (a.turn) { lx = a.w - lx; ly = a.h - ly; }
    return { x: lx, y: ly, w: a.w, h: a.h };
  }
  /** Draw player p's half in their own view (0,0 at their top-left, a.w x a.h); then end(c). */
  begin(c, p) {
    const a = this.areas[p]; c.save(); c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
    c.translate(a.x, a.y); if (a.turn) { c.translate(a.w, a.h); c.rotate(a.turn); }
    return a;
  }
  end(c) { c.restore(); }
}
