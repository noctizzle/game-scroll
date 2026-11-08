// A camera for 2D games bigger than the screen: it follows the player with a dead zone, looks ahead
// as they run, zooms, stays inside the level, and gives parallax for background layers. It only
// moves the canvas; what you draw is still yours.
//
//   const { Camera2D } = gs.camera2d;
//   reset() { cam = new Camera2D(W, H, { bounds: [0, 0, map.w, map.h], deadzone: [60, 80], lag: .12 }); }
//   update(dt) { cam.update(dt, hero); }                 // hero: anything with x and y (vx for look-ahead)
//   draw(c) {
//     cam.layer(c, .3, () => drawHills(c));             // far layer: moves at 30% of the camera
//     cam.begin(c);  drawLevel(c);  cam.end(c);          // the world, scrolled and zoomed
//     // HUD here, in screen units
//   }
//   const w = cam.toWorld(x, y);    // a tap in world units;  cam.sees(x, y, w, h) to skip drawing off-screen things
//
// Options: deadzone [w, h] (the box the target can move in before the camera follows), lag (seconds
// to catch up; 0 = locked on), lead (seconds of look-ahead by the target's vx, vy), zoom, bounds
// [x, y, w, h] (the level: the camera never shows outside it), pixel (round to whole pixels).

export class Camera2D {
  constructor(w, h, { deadzone = [0, 0], lag = .12, lead = 0, zoom = 1, bounds = null, pixel = false, x, y } = {}) {
    Object.assign(this, { w, h, deadzone, lag, lead, zoom, bounds, pixel });
    this.x = x ?? w / 2; this.y = y ?? h / 2;   // the world point at the centre of the screen
    this.gx = this.x; this.gy = this.y; this.started = false; this.zoomTo = zoom; this.zoomLag = .2;
    this.shakeX = 0; this.shakeY = 0;
  }
  /** The visible world rectangle: { x, y, w, h }. */
  get view() { const vw = this.w / this.zoom, vh = this.h / this.zoom; return { x: this.x - vw / 2, y: this.y - vh / 2, w: vw, h: vh }; }
  /** Jumps straight to a point (no lag), e.g. on reset or a teleport. */
  snap(x, y) { this.x = this.gx = x; this.y = this.gy = y; this.clamp(); this.started = true; return this; }
  /** Zooms to z over a moment (sec), or at once with sec = 0. */
  zoomIn(z, sec = .25) { this.zoomTo = z; this.zoomLag = sec; if (!sec) this.zoom = z; return this; }
  update(dt, target) {
    if (target) {
      const tx = target.x + (target.vx || 0) * this.lead, ty = target.y + (target.vy || 0) * this.lead;
      if (!this.started) { this.snap(tx, ty); }
      const [dw, dh] = this.deadzone, hw = dw / 2 / this.zoom, hh = dh / 2 / this.zoom;
      if (tx < this.gx - hw) this.gx = tx + hw; else if (tx > this.gx + hw) this.gx = tx - hw;
      if (ty < this.gy - hh) this.gy = ty + hh; else if (ty > this.gy + hh) this.gy = ty - hh;
    }
    if (this.zoom !== this.zoomTo) { const k = this.zoomLag ? 1 - Math.exp(-dt / this.zoomLag * 3) : 1; this.zoom += (this.zoomTo - this.zoom) * k; if (Math.abs(this.zoom - this.zoomTo) < 1e-3) this.zoom = this.zoomTo; }
    const k = this.lag ? 1 - Math.exp(-dt / this.lag) : 1;
    this.x += (this.gx - this.x) * k; this.y += (this.gy - this.y) * k;
    this.clamp();
    return this;
  }
  clamp() {
    if (!this.bounds) return;
    const [bx, by, bw, bh] = this.bounds, vw = this.w / this.zoom / 2, vh = this.h / this.zoom / 2;
    this.x = bw <= vw * 2 ? bx + bw / 2 : Math.max(bx + vw, Math.min(bx + bw - vw, this.x));
    this.y = bh <= vh * 2 ? by + bh / 2 : Math.max(by + vh, Math.min(by + bh - vh, this.y));
    this.gx = bw <= vw * 2 ? this.x : Math.max(bx + vw, Math.min(bx + bw - vw, this.gx));
    this.gy = bh <= vh * 2 ? this.y : Math.max(by + vh, Math.min(by + bh - vh, this.gy));
  }
  offset(f = 1) {
    let ox = this.w / 2 - this.x * this.zoom * f, oy = this.h / 2 - this.y * this.zoom * f;
    if (this.pixel) { ox = Math.round(ox); oy = Math.round(oy); }
    return [ox, oy];
  }
  /** Starts drawing the world: everything until end(c) is in world units. */
  begin(c) { const [ox, oy] = this.offset(); c.save(); c.translate(ox, oy); c.scale(this.zoom, this.zoom); return this; }
  end(c) { c.restore(); return this; }
  /**
   * Draws a background layer that scrolls at factor f of the camera (0 = fixed sky, 1 = with the
   * world). draw runs inside, in layer units; repeat: [w, h] tiles it (0 for no repeat on that axis).
   */
  layer(c, f, draw, { repeat = null } = {}) {
    let [ox, oy] = this.offset(f); c.save();
    if (repeat) {
      const [rw, rh] = repeat;
      if (rw) ox = ((ox % rw) + rw) % rw - rw;
      if (rh) oy = ((oy % rh) + rh) % rh - rh;
      for (let y = oy; y < this.h; y += rh || Infinity) { for (let x = ox; x < this.w; x += rw || Infinity) { c.save(); c.translate(x, y); draw(c); c.restore(); if (!rw) break; } if (!rh) break; }
    } else { c.translate(ox, oy); draw(c); }
    c.restore(); return this;
  }
  /** Screen point (taps arrive in screen units) to world units. */
  toWorld(sx, sy) { const [ox, oy] = this.offset(); return { x: (sx - ox) / this.zoom, y: (sy - oy) / this.zoom }; }
  /** World point to screen units (to put HUD markers over things). */
  toScreen(wx, wy) { const [ox, oy] = this.offset(); return { x: wx * this.zoom + ox, y: wy * this.zoom + oy }; }
  /** Is this world rectangle (or point, with w = h = 0) on screen, give or take margin? */
  sees(x, y, w = 0, h = 0, margin = 16) { const v = this.view, m = margin / this.zoom; return x + w > v.x - m && x < v.x + v.w + m && y + h > v.y - m && y < v.y + v.h + m; }
}
