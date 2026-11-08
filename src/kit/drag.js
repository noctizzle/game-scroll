// Drag, drop and snap: pick up pieces, drop them into slots, and send them home when the drop isn't
// allowed. For jigsaws, sorting games, matching, shop shelves and inventories. The kit tracks fingers,
// hit tests, snapping and the slide back; your game draws pieces and slots and says what's allowed.
//
//   const { Drag } = gs.drag;
//   reset() {
//     drag = new Drag({ snap: 30, accept: (piece, slot) => slot.kind === piece.kind && !slot.piece });
//     drag.piece({ x: 40, y: 500, w: 50, h: 50, kind: 'red' });          // any object with x, y and w, h or r
//     drag.slot({ x: 100, y: 120, w: 60, h: 60, kind: 'red' });
//     drag.on('drop', (piece, slot) => { feel.coin(slot.x, slot.y); if (drag.slots.every(s => s.piece)) api.win(); })
//         .on('reject', piece => feel.hurt()).on('pick', piece => haptic('tick'));
//   }
//   down(x, y, id) { drag.down(x, y, id); }  move(x, y, p, id) { drag.move(x, y, id); }  up(x, y, id) { drag.up(x, y, id); }
//   update(dt) { drag.update(dt); }                                     // slides pieces home / into slots
//   draw(c) { drag.slots.forEach(drawSlot); drag.pieces.forEach(drawPiece); }   // pieces in drawing order (held last)
//
// Positions are centres. A piece in a slot has piece.slot and slot.piece. piece.held is true while a
// finger has it. Lists: new Drag({ list: { x, y, w, h, gap, axis: 'y' } }) keeps pieces in a row you
// can reorder by dragging (drag.order).

export class Drag {
  constructor({ snap = 24, accept = () => true, lift = 1.08, speed = 14, list = null, swap = false } = {}) {
    Object.assign(this, { snapDist: snap, accept, lift, speed, list, swapping: swap });
    this.pieces = []; this.slots = []; this.held = new Map(); this.handlers = {};
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Adds a piece (its home is where it starts). */
  piece(p) { p.index = this.pieces.length; p.home = { x: p.x, y: p.y }; p.tx = p.x; p.ty = p.y; p.scale = 1; p.slot = null; this.pieces.push(p); if (this.list) this.layout(); return p; }
  slot(s) { s.piece = null; this.slots.push(s); return s; }
  remove(p) { this.pieces = this.pieces.filter(x => x !== p); if (p.slot) p.slot.piece = null; if (this.list) this.layout(); }
  hit(o, x, y, pad = 0) { return o.r != null ? Math.hypot(x - o.x, y - o.y) <= o.r + pad : Math.abs(x - o.x) <= (o.w || 0) / 2 + pad && Math.abs(y - o.y) <= (o.h || 0) / 2 + pad; }
  /** The top piece under a point (pieces later in the list are on top). */
  at(x, y) { for (let i = this.pieces.length - 1; i >= 0; i--) { const p = this.pieces[i]; if (!p.locked && this.hit(p, x, y, 6)) return p; } return null; }

  down(x, y, id = 0) {
    const p = this.at(x, y); if (!p || [...this.held.values()].some(h => h.p === p)) return null;
    this.held.set(id, { p, dx: p.x - x, dy: p.y - y, from: p.slot });
    p.held = true; this.pieces.splice(this.pieces.indexOf(p), 1); this.pieces.push(p);   // on top
    this.emit('pick', p);
    return p;
  }
  move(x, y, id = 0) {
    const h = this.held.get(id); if (!h) return;
    h.p.x = h.p.tx = x + h.dx; h.p.y = h.p.ty = y + h.dy;
    if (this.list) this.reorder(h.p);
    const s = this.nearest(h.p); if (s !== h.over) { h.over = s; this.emit('over', h.p, s); }
  }
  up(x, y, id = 0) {
    const h = this.held.get(id); if (!h) return;
    this.held.delete(id); const p = h.p; p.held = false;
    if (this.list) { this.layout(); this.emit('drop', p, null); return; }
    const s = this.nearest(p);
    if (s && (s === p.slot || this.accept(p, s))) {
      if (s.piece && s.piece !== p) {
        if (!this.swapping) return this.sendHome(p, s);
        const other = s.piece; this.place(other, p.slot); if (!p.slot) { other.slot = null; other.tx = other.home.x; other.ty = other.home.y; }
      }
      this.place(p, s); this.emit('drop', p, s);
    } else if (s || p.slot) this.sendHome(p, s);
    else { p.tx = p.home.x; p.ty = p.home.y; this.emit('home', p); }
  }
  sendHome(p, s) {
    if (p.slot) p.slot.piece = null; p.slot = null; p.tx = p.home.x; p.ty = p.home.y;
    this.emit('reject', p, s);
  }
  /** Puts a piece in a slot (or back home with slot null). */
  place(p, s) {
    if (p.slot) p.slot.piece = null;
    p.slot = s || null;
    if (s) { s.piece = p; p.tx = s.x; p.ty = s.y; } else { p.tx = p.home.x; p.ty = p.home.y; }
    return this;
  }
  nearest(p) {
    let best = null, bd = Infinity;
    for (const s of this.slots) { const d = Math.hypot(s.x - p.x, s.y - p.y); if ((d <= this.snapDist || this.hit(s, p.x, p.y)) && d < bd) { bd = d; best = s; } }
    return best;
  }
  /** Slides pieces towards where they belong and grows held ones a little. */
  update(dt) {
    const k = 1 - Math.exp(-this.speed * dt);
    for (const p of this.pieces) {
      if (!p.held) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; if (Math.abs(p.tx - p.x) < .1) p.x = p.tx; if (Math.abs(p.ty - p.y) < .1) p.y = p.ty; }
      p.scale += ((p.held ? this.lift : 1) - p.scale) * k;
    }
    return this;
  }
  get busy() { return this.held.size > 0 || this.pieces.some(p => p.x !== p.tx || p.y !== p.ty); }

  // ---- reorderable list
  get order() { return this.pieces.slice().sort((a, b) => a.index - b.index); }
  layout() {
    const L = this.list, ax = L.axis === 'x' ? 'x' : 'y', gap = L.gap ?? 8;
    let at = (ax === 'x' ? L.x : L.y);
    this.order.forEach((p, i) => {
      p.index = i; const size = ax === 'x' ? p.w : p.h;
      if (ax === 'x') { p.tx = at + size / 2; p.ty = L.y; } else { p.ty = at + size / 2; p.tx = L.x; }
      at += size + gap; if (!p.held) { p.home = { x: p.tx, y: p.ty }; }
    });
  }
  reorder(p) {
    const ax = this.list.axis === 'x' ? 'x' : 'y', others = this.order.filter(o => o !== p);
    let i = others.findIndex(o => o[ax === 'x' ? 'tx' : 'ty'] > p[ax]); if (i < 0) i = others.length;
    others.splice(i, 0, p); others.forEach((o, k) => { o.index = k; });
    if (p.index !== p.lastIndex) { p.lastIndex = p.index; this.emit('reorder', p, p.index); }
    this.layout();
  }
}
