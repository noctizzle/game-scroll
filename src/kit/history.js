// Undo and redo for puzzle, building and drawing games: keep each step of the round, go back and
// forward through them, and count how many undos a player used. Each step is a copy of the game's
// state (structuredClone), so any plain data works: boards, lists, positions, whole levels.
//
//   const { History } = gs.history;
//   reset() { board = makeBoard(); hist = new History(board, { max: 200 }); }   // the start of the round
//   tap(x, y) { move(board, x, y); hist.push(board, 'move'); }                   // after each change
//   undoButton() { const b = hist.undo(); if (b) board = b; }                     // a fresh copy to keep using
//   redoButton() { const b = hist.redo(); if (b) board = b; }
//   draw() { /* grey the buttons out with hist.canUndo / hist.canRedo; show hist.undos */ }
//
// push(state, label, { merge }): pushes with the same merge key in a row become one step (a slider
// dragged, a line drawn point by point). group(fn) makes everything pushed inside fn one step.
// A new push after an undo drops the steps that were ahead (as in any editor).
//
// Picked over a patch library (immer's produceWithPatches keeps only the changes, but every write must
// go through its produce()): game state is small, and copies work with whatever the game already has.

const copy = x => structuredClone(x);

export class History {
  /** start: the state at the start (copied); max: most steps kept (the oldest go first). */
  constructor(start, { max = 100 } = {}) {
    this.max = Math.max(1, max); this.steps = [{ state: copy(start), label: 'start' }]; this.at = 0;
    this.undos = 0; this.redos = 0; this.lastMerge = null; this.grouping = 0; this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Records the state after a change. Returns this. */
  push(state, label = '', { merge = null } = {}) {
    if (this.grouping) { this.steps[this.at] = { ...this.steps[this.at], state: copy(state) }; return this; }
    this.steps.length = this.at + 1;   // a new change drops what was ahead
    if (merge != null && merge === this.lastMerge && this.at > 0) this.steps[this.at] = { state: copy(state), label };
    else {
      this.steps.push({ state: copy(state), label }); this.at++;
      if (this.steps.length > this.max + 1) { this.steps.shift(); this.at--; }
    }
    this.lastMerge = merge; this.emit('change', this);
    return this;
  }
  /** Everything pushed while fn runs is one step. */
  group(state, label, fn) {
    this.push(state, label); this.grouping++;
    try { fn(); } finally { this.grouping--; this.lastMerge = null; }
    return this;
  }
  get canUndo() { return this.at > 0; }
  get canRedo() { return this.at < this.steps.length - 1; }
  /** The label of the step an undo would take back, and of the one a redo would do again. */
  get undoLabel() { return this.canUndo ? this.steps[this.at].label : null; }
  get redoLabel() { return this.canRedo ? this.steps[this.at + 1].label : null; }
  /** How many steps back there are, and ahead. */
  get back() { return this.at; }
  get ahead() { return this.steps.length - 1 - this.at; }
  /** Goes back n steps: a fresh copy of that state, or null when there's nothing to undo. */
  undo(n = 1) {
    if (!this.canUndo) return null;
    this.at = Math.max(0, this.at - n); this.undos++; this.lastMerge = null; this.emit('undo', this); this.emit('change', this);
    return copy(this.steps[this.at].state);
  }
  /** Goes forward n steps again, or null. */
  redo(n = 1) {
    if (!this.canRedo) return null;
    this.at = Math.min(this.steps.length - 1, this.at + n); this.redos++; this.lastMerge = null; this.emit('redo', this); this.emit('change', this);
    return copy(this.steps[this.at].state);
  }
  /** A copy of the state now (or i steps from the start). */
  now(i = this.at) { return copy(this.steps[Math.max(0, Math.min(this.steps.length - 1, i))].state); }
  /** Back to the start of the round (a step of its own, so it can be undone). */
  restart() { this.push(this.steps[0].state, 'restart'); return copy(this.steps[0].state); }
  /** Forgets every step; state is the new start. */
  clear(state) { this.steps = [{ state: copy(state), label: 'start' }]; this.at = 0; this.undos = this.redos = 0; this.lastMerge = null; this.emit('change', this); return this; }
  /** Plain data for api.save (the last `keep` steps, to stay well inside the save's 8 KB), and back. */
  pack(keep = 10) { const from = Math.max(0, this.at - keep + 1); return { s: this.steps.slice(from, this.at + 1).map(s => [s.label, s.state]), u: this.undos }; }
  unpack(d) {
    if (!d?.s?.length) return this;
    this.steps = d.s.map(([label, state]) => ({ label, state })); this.at = this.steps.length - 1; this.undos = d.u || 0; this.lastMerge = null;
    return this;
  }
}
