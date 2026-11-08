// A low-level framework for in-game menus, HUDs and shops, with no look of its own. You describe
// boxes (rows, columns, gaps, padding, growing, scrolling lists) and it works out where each one
// goes with Yoga (Meta's flexbox engine, MIT; loads on first use, so make the UI in make() or
// reset()). It handles taps, holds, drags, scrolling with momentum, and moving focus with keys or a
// controller. Drawing is all yours: ui.each() hands you every box and its state, and your game
// paints it in its own style.
//
//   const { UI } = gs.ui;
//   reset() {
//     ui = new UI(W, H, { dir: 'column', pad: 16, gap: 10, children: [
//       { id: 'title', h: 48 },
//       { id: 'shop', grow: 1, scroll: 'y', gap: 8, children: items.map((it, i) => ({ id: 'item' + i, h: 64, data: it, tap: true })) },
//       { dir: 'row', gap: 8, h: 56, children: [{ id: 'buy', grow: 1, tap: () => buy() }, { id: 'back', w: 96, tap: true }] },
//     ] });
//     ui.on('tap', n => { if (n.id === 'back') close(); });
//   }
//   update(dt) { ui.update(dt); }
//   draw(c) { ui.each((n, b) => { /* your look: */ c.fillStyle = n.pressed ? '#fc0' : n.focused ? '#9cf' : '#345'; c.fillRect(b.x, b.y, b.w, b.h); }); }
//   down(x, y, id) { ui.down(x, y, id); } move(x, y, p, id) { ui.move(x, y, id); } up(x, y, id) { ui.up(x, y, id); } key(k, d) { ui.key(k, d); }
//
// Box fields: id, dir ('row' | 'column'), wrap, justify ('start' | 'centre' | 'end' | 'between' |
// 'around' | 'evenly'), align and self ('start' | 'centre' | 'end' | 'stretch'), grow, shrink,
// basis, w, h (numbers or '50%'), minW, maxW, minH, maxH, aspect, pad, padX, padY, margin, gap,
// at: { l, t, r, b } (placed on top, not in the flow), scroll: 'x' | 'y', hidden, disabled,
// tap (true or a function: it can be pressed and focused), hold, drag, focus (false to skip),
// measure: w => ({ w, h }) for boxes sized by their contents (text), data: anything of yours.

import { lazy } from './lazy.js';

const yoga = lazy('UI layout', () => import('yoga-layout/load').then(async m => ({ Y: await m.loadYoga(), E: m })));
/** Loads the layout engine now (the app does this when a game uses gs.ui). */
export const loadUI = () => yoga.load();

const SLOP = 8, HOLD = .5;
const JUSTIFY = { start: 'FlexStart', centre: 'Center', center: 'Center', end: 'FlexEnd', between: 'SpaceBetween', around: 'SpaceAround', evenly: 'SpaceEvenly' };
const ALIGN = { start: 'FlexStart', centre: 'Center', center: 'Center', end: 'FlexEnd', stretch: 'Stretch', baseline: 'Baseline' };

export class UI {
  /** w, h: the area (your game's W × H); tree: the root box. */
  constructor(w, h, tree = {}) {
    const { Y, E } = yoga.get(); this.Y = Y; this.E = E; this.w = w; this.h = h; this.handlers = {}; this.touches = new Map(); this.focusId = null;
    this.set(tree);
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
  /** Replaces the whole tree (keeps scroll and focus for ids that are still there). */
  set(tree) {
    const old = this.byId || new Map(); this.free();
    this.byId = new Map(); this.list = [];
    const build = (t, parent, depth) => {
      const n = { ...t, id: t.id ?? 'n' + this.list.length, parent, depth, kids: [], box: { x: 0, y: 0, w: 0, h: 0 }, pressed: false, focused: false, press: 0, sx: 0, sy: 0, vx: 0, vy: 0, contentW: 0, contentH: 0 };
      const was = old.get(n.id); if (was) { n.sx = was.sx; n.sy = was.sy; }
      n.ynode = this.Y.Node.create(); this.style(n);
      this.list.push(n); this.byId.set(n.id, n);
      (t.children || []).forEach((c, i) => { const k = build(c, n, depth + 1); n.kids.push(k); n.ynode.insertChild(k.ynode, i); });
      return n;
    };
    this.root = build(tree, null, 0);
    this.layout();
    if (this.focusId && !this.byId.has(this.focusId)) this.focusId = null;
    for (const n of this.list) n.focused = n.id === this.focusId;
    return this;
  }
  style(n) {
    const y = n.ynode, E = this.E, num = v => v != null;
    if (n.dir) y.setFlexDirection(n.dir === 'row' ? E.FlexDirection.Row : E.FlexDirection.Column);
    if (n.wrap) y.setFlexWrap(E.Wrap.Wrap);
    if (n.justify) y.setJustifyContent(E.Justify[JUSTIFY[n.justify]]);
    if (n.align) y.setAlignItems(E.Align[ALIGN[n.align]]);
    if (n.self) y.setAlignSelf(E.Align[ALIGN[n.self]]);
    if (num(n.grow)) y.setFlexGrow(n.grow); if (num(n.shrink)) y.setFlexShrink(n.shrink); else y.setFlexShrink(n.scroll ? 1 : 0);
    if (num(n.basis)) y.setFlexBasis(n.basis);
    if (num(n.w)) y.setWidth(n.w); if (num(n.h)) y.setHeight(n.h);
    if (num(n.minW)) y.setMinWidth(n.minW); if (num(n.maxW)) y.setMaxWidth(n.maxW); if (num(n.minH)) y.setMinHeight(n.minH); if (num(n.maxH)) y.setMaxHeight(n.maxH);
    if (num(n.aspect)) y.setAspectRatio(n.aspect);
    if (num(n.pad)) y.setPadding(E.Edge.All, n.pad); if (num(n.padX)) y.setPadding(E.Edge.Horizontal, n.padX); if (num(n.padY)) y.setPadding(E.Edge.Vertical, n.padY);
    if (num(n.margin)) y.setMargin(E.Edge.All, n.margin);
    if (num(n.gap)) y.setGap(E.Gutter.All, n.gap);
    if (n.hidden) y.setDisplay(E.Display.None);
    if (n.at) { y.setPositionType(E.PositionType.Absolute); for (const [k, e] of [['l', 'Left'], ['t', 'Top'], ['r', 'Right'], ['b', 'Bottom']]) if (num(n.at[k])) y.setPosition(E.Edge[e], n.at[k]); }
    if (n.scroll) y.setOverflow(E.Overflow.Scroll);
    if (n.measure) y.setMeasureFunc((w) => { const m = n.measure(Number.isFinite(w) ? w : Infinity); return { width: m.w, height: m.h }; });
  }
  /** Works out every box again (after you change sizes with update(id, fields) or resize()). */
  layout() {
    if (!this.root) return this;
    this.root.ynode.calculateLayout(this.w, this.h, this.E.Direction.LTR);
    const place = (n, ox, oy, clip) => {
      const l = n.ynode.getComputedLayout(); n.lx = l.left; n.ly = l.top; n.box = { x: ox + l.left, y: oy + l.top, w: l.width, h: l.height };
      n.clip = clip; n.shown = !n.hidden && (!clip || (n.box.x < clip.x + clip.w && n.box.x + n.box.w > clip.x && n.box.y < clip.y + clip.h && n.box.y + n.box.h > clip.y));
      if (n.scroll) { let cw = 0, ch = 0; for (const k of n.kids) { const kl = k.ynode.getComputedLayout(); cw = Math.max(cw, kl.left + kl.width); ch = Math.max(ch, kl.top + kl.height); } n.contentW = cw + (n.pad ?? n.padX ?? 0); n.contentH = ch + (n.pad ?? n.padY ?? 0); this.clampScroll(n, false); }
      const inner = n.scroll ? inter(clip, n.box) : clip;
      for (const k of n.kids) place(k, n.box.x - (n.scroll === 'x' ? n.sx : 0), n.box.y - (n.scroll === 'y' ? n.sy : 0), inner);
    };
    place(this.root, 0, 0, null);
    return this;
  }
  /** Changes a box's fields (size, hidden, data...) and lays out again. */
  update(id, fields) {
    if (typeof id === 'number') return this.tick(id);   // update(dt) is the per-frame call
    const n = this.byId.get(id); if (!n) return this; Object.assign(n, fields);
    const fresh = this.Y.Node.create(); const parent = n.ynode.getParent(), idx = parent ? n.parent.kids.indexOf(n) : -1;
    n.kids.forEach(() => n.ynode.removeChild(n.ynode.getChild(0)));
    if (parent) parent.removeChild(n.ynode);
    n.ynode.free(); n.ynode = fresh; this.style(n);
    n.kids.forEach((k, i) => n.ynode.insertChild(k.ynode, i));
    if (parent) parent.insertChild(n.ynode, idx);
    if (n === this.root) this.root.ynode = fresh;
    return this.layout();
  }
  resize(w, h) { this.w = w; this.h = h; return this.layout(); }
  node(id) { return this.byId.get(id) || null; }
  /** Every box to draw, parents first, with its screen box: fn(node, box, clip). Hidden and scrolled-away boxes are skipped. */
  each(fn) { for (const n of this.list) if (n.shown && this.visible(n)) fn(n, n.box, n.clip); return this; }
  visible(n) { for (let p = n; p; p = p.parent) if (p.hidden) return false; return true; }
  /** The topmost box at x, y that takes taps (or any box with any: true). */
  hit(x, y, { any = false } = {}) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i]; if (!n.shown || !this.visible(n) || n.disabled) continue;
      if (!any && !n.tap && !n.hold && !n.drag && !n.scroll) continue;
      const b = n.box, c = n.clip; if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
      if (c && (x < c.x || y < c.y || x > c.x + c.w || y > c.y + c.h)) continue;
      return n;
    }
    return null;
  }
  scroller(n) { for (let p = n; p; p = p.parent) if (p.scroll) return p; return null; }
  down(x, y, id = 0) {
    const n = this.hit(x, y), t = { x0: x, y0: y, x, y, n, scroll: this.scroller(n), moved: false, held: 0, last: [x, y], vel: [0, 0] };
    this.touches.set(id, t); if (n && (n.tap || n.hold || n.drag)) n.pressed = true;
    if (t.scroll) { t.scroll.vx = t.scroll.vy = 0; }
    if (n?.drag) this.emit('dragstart', n, x, y);
    return n;
  }
  move(x, y, id = 0) {
    const t = this.touches.get(id); if (!t) return;
    const dx = x - t.x, dy = y - t.y; t.vel = [dx, dy]; t.x = x; t.y = y;
    if (!t.moved && Math.hypot(x - t.x0, y - t.y0) > SLOP) { t.moved = true; if (t.n && !t.n.drag) t.n.pressed = false; }
    if (t.n?.drag) { this.emit('drag', t.n, x, y, dx, dy); return; }
    if (t.moved && t.scroll) { const s = t.scroll; if (s.scroll === 'y') s.sy -= dy; else s.sx -= dx; this.clampScroll(s, true); this.layout(); }
  }
  up(x, y, id = 0) {
    const t = this.touches.get(id); if (!t) return; this.touches.delete(id);
    const n = t.n; if (n) n.pressed = false;
    if (n?.drag) { this.emit('drop', n, x, y, this.hit(x, y, { any: true })); return; }
    if (t.moved && t.scroll) { const s = t.scroll; s.vx = -t.vel[0] * 60; s.vy = -t.vel[1] * 60; return; }
    if (!t.moved && n && t.held < HOLD) this.activate(n);
  }
  activate(n) { if (n.disabled) return; n.press = 1; if (typeof n.tap === 'function') n.tap(n); this.emit('tap', n); }
  clampScroll(s, soft) {
    const maxY = Math.max(0, s.contentH - s.box.h), maxX = Math.max(0, s.contentW - s.box.w), rb = soft ? 60 : 0;
    s.sy = Math.max(-rb, Math.min(maxY + rb, s.sy)); s.sx = Math.max(-rb, Math.min(maxX + rb, s.sx)); s.maxX = maxX; s.maxY = maxY;
  }
  /** Each frame: scroll momentum and spring-back, hold timers, the press value (n.press 1 → 0 after a tap, for your own bounce). */
  tick(dt) {
    let moved = false;
    for (const t of this.touches.values()) { if (!t.moved && t.n?.hold) { const before = t.held; t.held += dt; if (before < HOLD && t.held >= HOLD) { t.n.pressed = false; if (typeof t.n.hold === 'function') t.n.hold(t.n); this.emit('hold', t.n); } } }
    const touched = new Set([...this.touches.values()].map(t => t.scroll));
    for (const n of this.list) {
      n.press = Math.max(0, n.press - dt * 4);
      if (!n.scroll || touched.has(n)) continue;
      if (Math.abs(n.vx) + Math.abs(n.vy) > 1) { n.sx += n.vx * dt; n.sy += n.vy * dt; const k = Math.pow(.05, dt); n.vx *= k; n.vy *= k; moved = true; } else n.vx = n.vy = 0;
      const maxY = Math.max(0, n.contentH - n.box.h), maxX = Math.max(0, n.contentW - n.box.w), k = Math.min(1, dt * 12);
      if (n.sy < 0) { n.sy += -n.sy * k; n.vy = 0; moved = true; if (n.sy > -.5) n.sy = 0; } else if (n.sy > maxY) { n.sy -= (n.sy - maxY) * k; n.vy = 0; moved = true; if (n.sy - maxY < .5) n.sy = maxY; }
      if (n.sx < 0) { n.sx += -n.sx * k; n.vx = 0; moved = true; if (n.sx > -.5) n.sx = 0; } else if (n.sx > maxX) { n.sx -= (n.sx - maxX) * k; n.vx = 0; moved = true; if (n.sx - maxX < .5) n.sx = maxX; }
    }
    if (moved) this.layout();
    return this;
  }
  /** Scrolls so a box is in view. */
  show(id) {
    const n = this.byId.get(id), s = n && this.scroller(n.parent); if (!s) return this;
    if (s.scroll === 'y') { const top = n.box.y - s.box.y + s.sy; if (top < s.sy) s.sy = top; else if (top + n.box.h > s.sy + s.box.h) s.sy = top + n.box.h - s.box.h; }
    else { const left = n.box.x - s.box.x + s.sx; if (left < s.sx) s.sx = left; else if (left + n.box.w > s.sx + s.box.w) s.sx = left + n.box.w - s.box.w; }
    this.clampScroll(s, false); return this.layout();
  }
  /** Boxes that can take focus (tap boxes, unless focus: false). */
  get focusable() { return this.list.filter(n => (n.tap || n.focus) && n.focus !== false && !n.disabled && this.visible(n) && !n.hidden); }
  /** Moves focus to a box (by id or node), or clears it with null. */
  focus(id) {
    const n = id && (typeof id === 'string' ? this.byId.get(id) : id); this.focusId = n ? n.id : null;
    for (const m of this.list) m.focused = m === n; if (n) { this.show(n.id); this.emit('focus', n); } return this;
  }
  get focused() { return this.focusId ? this.byId.get(this.focusId) : null; }
  /** Moves focus the nearest way in a direction: 'up' | 'down' | 'left' | 'right'. */
  step(dir) {
    const all = this.focusable; if (!all.length) return this;
    const cur = this.focused; if (!cur) return this.focus(all[0]);
    const c = centre(cur.box), [ux, uy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const n of all) {
      if (n === cur) continue; const p = centre(n.box), dx = p.x - c.x, dy = p.y - c.y, along = dx * ux + dy * uy; if (along <= 1) continue;
      const side = Math.abs(dx * uy - dy * ux), s = along + side * 2.5; if (s < bs) { bs = s; best = n; }
    }
    if (best) this.focus(best); else this.emit('edge', dir);
    return this;
  }
  /** Keys and controller buttons: arrows / WASD move focus, Enter / Space / 'a' press, Escape / Backspace / 'b' fire 'back'. */
  key(k, isDown = true) {
    if (!isDown) return false;
    const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[k];
    if (dir) { this.step(dir); return true; }
    if (k === 'Enter' || k === ' ' || k === 'A') { const f = this.focused; if (f) this.activate(f); return !!f; }
    if (k === 'Escape' || k === 'Backspace' || k === 'B') { this.emit('back'); return true; }
    return false;
  }
  free() { if (this.root) { try { this.root.ynode.freeRecursive(); } catch (_) { /* gone */ } } this.root = null; }
}
const centre = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
function inter(a, b) { if (!a) return { ...b }; const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }; }

/** Wraps text to a width with your font (measureText from your canvas context): returns lines. Handy in measure(). */
export function wrap(c, text, width) {
  const out = []; for (const para of String(text).split('\n')) { let line = ''; for (const word of para.split(' ')) { const t = line ? line + ' ' + word : word; if (c.measureText(t).width > width && line) { out.push(line); line = word; } else line = t; } out.push(line); } return out;
}
