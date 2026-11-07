// AR 3D kit for era:'ar' games (see docs/ar-3d.md): 3D objects that sit in your real room.
//
// The back camera picture fills the screen and the phone's gyro turns the 3D camera, so things you
// place stay put in the room while you move the phone around (look-around AR: you turn on the spot,
// you don't walk around). It uses the Next Gen renderer (hd3d.js) with a see-through background,
// real-time shadows that fall on your real floor, and reflections.
//
// Fallbacks, so every AR game still plays anywhere:
//  - no camera (refused, desktop): a virtual room is drawn behind the scene instead;
//  - no gyro (desktop, refused motion): drag on the screen to look around (v.drag(dx, dy)).
//
// Making it sit in the room better:
//  - floor calibration: the first time, the player drags a grid until it lies on their real floor.
//    That sets how high the phone is held (stored), so things stand on the real floor. A small
//    "Floor" chip redoes it any time. Games pause while it's open (v.calibrating) and pass their
//    input through v.input(...) first.
//  - light estimation: the camera picture's brightness and colour set the 3D lights, so objects
//    dim in a dark room and pick up warm lamp light.
//  - on Android the compass-locked orientation is used, so "straight ahead" doesn't drift.
import { HDView, pbr, surface, speckle, sun, THREE } from './hd3d.js';
import { startCamera, stopCamera, orientation, haptic } from './device.js';
import { store } from '../util.js';
const { Group, Mesh, PlaneGeometry, BoxGeometry, ShadowMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, Vector3, Quaternion, Euler, BackSide, GridHelper } = THREE;

// A 50 cm grid of bright lines that fades out towards its edges, for lining up the floor.
let GT = null;
function gridTex() {
  if (GT) return GT;
  const S = 512, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), g = cv.getContext('2d');
  g.strokeStyle = '#19e3b1'; g.lineWidth = 2.5;
  for (let i = 0; i <= 12; i++) { const p = 2 + i * (S - 4) / 12; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  g.globalCompositeOperation = 'destination-in';
  const f = g.createRadialGradient(S / 2, S / 2, S * .1, S / 2, S / 2, S / 2); f.addColorStop(0, '#000'); f.addColorStop(1, '#0000');
  g.fillStyle = f; g.fillRect(0, 0, S, S);
  GT = new CanvasTexture(cv); GT.colorSpace = SRGBColorSpace; GT.anisotropy = 8;
  return GT;
}

/** World floor height in metres. The 3D camera sits at FLOOR + the player's calibrated eye height
 *  (1.3 m until calibrated), so a game can always put things on the floor at y = FLOOR. */
export const FLOOR = -1.3;
const EYE_KEY = 'gs_ar_eye', EYE_MIN = .3, EYE_MAX = 2.1;
// The long side of a phone's main camera sees roughly this many degrees.
const LONG_FOV = 64;

let ROOM = null;
function roomLooks() {
  if (ROOM) return ROOM;
  const wood = surface(256, ({ col, h, r, size: S }) => {
    for (let y = 0; y < S; y += 32) {
      const v = 120 + Math.random() * 30 | 0; col.fillStyle = `rgb(${v + 40},${v},${v - 40})`; col.fillRect(0, y, S, 32);
      h.fillStyle = '#000'; h.fillRect(0, y, S, 2); col.fillStyle = '#0003'; col.fillRect(0, y, S, 2);
      const cut = Math.random() * S; h.fillRect(cut, y, 2, 32);
      r.fillStyle = Math.random() < .5 ? '#888' : '#aaa'; r.fillRect(0, y + 2, S, 30);
    }
    speckle(col, S, 900, '#3a2210', 2, .25);
  }, { strength: 2 });
  const paint = surface(128, ({ col, size: S }) => { col.fillStyle = '#d9d4ca'; col.fillRect(0, 0, S, S); speckle(col, S, 600, '#a09888', 1.2, .25); });
  ROOM = { floor: pbr('#ffffff', { tex: wood.repeat(6, 6), rough: .7 }), wall: pbr('#bdb6aa', { tex: paint.repeat(4, 2), rough: .95, side: BackSide }) };
  return ROOM;
}

const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0), Q1 = new Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
const eu = new Euler(), q0 = new Quaternion(), qd = new Quaternion(), qy = new Quaternion(), tmp = new Vector3();

export class ARView extends HDView {
  constructor(o = {}) {
    super({ bg: '#0b0f14', env: .7, amb: .9, sky: '#e8eef8', ground: '#6a5e50', fov: 62, ...o });
    this.scene.background = null; this.clearBg = true; this.cam.far = 60;
    // sunlight from above-behind; its shadows land on an invisible floor that only shows shadow
    this.sunL = sun('#fff4e4', 2.4, 7, [-.35, 1, .45]); this.scene.add(this.sunL, this.sunL.target); this.sunL.follow(0, FLOOR, -2);
    super.onTier(T => { this.sunL.setTier(T); this.gameTier?.(T); });
    const catcher = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ color: 0x000000, opacity: .38 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.y = FLOOR + .002; catcher.receiveShadow = true; this.scene.add(catcher);
    // the virtual room, shown only while there is no camera picture
    const L = roomLooks(), room = new Group();
    const fl = new Mesh(new PlaneGeometry(14, 14), L.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = FLOOR; fl.receiveShadow = true;
    const walls = new Mesh(new BoxGeometry(14, 6, 14), L.wall); walls.position.y = FLOOR + 2.98;   // its bottom face sits just under the wooden floor
    const grid = new GridHelper(14, 14, 0xffffff, 0xffffff); grid.position.y = FLOOR + .003; grid.material.transparent = true; grid.material.opacity = .08;
    room.add(fl, walls, grid); this.room = room; this.scene.add(room);
    // calibration grid: a 6 m teal grid on the floor, shown while the player lines it up
    this.calGrid = new Mesh(new PlaneGeometry(6, 6), new MeshBasicMaterial({ map: gridTex(), transparent: true, depthWrite: false, toneMapped: false }));
    this.calGrid.rotation.x = -Math.PI / 2; this.calGrid.position.y = FLOOR + .004; this.calGrid.visible = false; this.scene.add(this.calGrid);
    this.eye = store.get(EYE_KEY, null); this.cal = null; this.chip = null;
    // light estimate from the camera picture
    this.lightCv = null; this.lightN = 0; this.lum = .45; this.tint = [1, 1, 1];
    this.camState = 'off'; this.camera = null; this.yaw0 = null; this.yaw = 0; this.pitch = 0; this.sensor = false;
    this.camQ = new Quaternion();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.off(); });
  }
  /** Let a game react to quality changes (the kit already handles the sun's shadows). */
  onTier(fn) { this.gameTier = fn; return this; }

  /** Call every update while playing: starts the back camera once (asks permission the first time). */
  live() {
    if (this.camState !== 'off') return this;
    this.camState = 'asking';
    startCamera().then(c => {
      if (this.camState !== 'asking') { if (c) stopCamera(); return; }   // switched off while asking
      this.camera = c; this.camState = c ? 'on' : 'denied';
      if (c && this.eye == null) this.calibrate();   // first time with a camera: line up the floor
    });
    return this;
  }
  /** Stop the camera (call from reset() and before api.over()). Denied stays denied for this game. */
  off() { if (this.camState === 'on' || this.camState === 'asking') stopCamera(); if (this.camState !== 'denied') this.camState = 'off'; this.camera = null; return this; }
  /** True while the real camera picture is showing. */
  get seeing() { const v = this.camera?.video; return !!(v && v.readyState >= 2 && v.videoWidth); }

  /** Make where the phone points now "straight ahead" (call from reset()). */
  recenter() { this.yaw0 = null; this.yaw = 0; this.pitch = 0; return this; }
  /** No-gyro fallback: drag to look around (pixels moved). */
  drag(dx, dy) { if (this.sensor) return; this.yaw += dx * .007; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * .006)); }

  /** Point the 3D camera the way the phone points. Call once per frame before draw(). */
  look(dt = 1 / 60) {
    const o = orientation(), d = Math.PI / 180;
    if (o) {
      if (this.absSeen !== o.abs) { this.absSeen = o.abs; this.yaw0 = null; }   // source changed: re-take "ahead"
      eu.set(o.beta * d, o.alpha * d, -o.gamma * d, 'YXZ');
      qd.setFromEuler(eu).multiply(Q1).multiply(q0.setFromAxisAngle(Z, -o.screen * d));
      if (this.yaw0 == null) { tmp.set(0, 0, -1).applyQuaternion(qd); this.yaw0 = Math.atan2(-tmp.x, -tmp.z); }
      qd.premultiply(qy.setFromAxisAngle(Y, -this.yaw0));
      if (!this.sensor) { this.sensor = true; this.camQ.copy(qd); }
      this.camQ.slerp(qd, 1 - Math.exp(-dt * 28));   // smooth out sensor jitter, still feels instant
    } else {
      this.sensor = false;
      this.camQ.setFromEuler(eu.set(this.pitch, this.yaw, 0, 'YXZ'));
    }
    this.cam.quaternion.copy(this.camQ); this.cam.position.set(0, FLOOR + this.eyeH, 0); this.cam.updateMatrixWorld();
    return this;
  }
  /** How high the phone is held above the floor, in metres. */
  get eyeH() { return this.cal ? this.cal.eye : this.eye ?? -FLOOR; }
  /** Where the phone is (the camera position). */
  get eyePos() { return this.cam.position; }

  /* ---------- floor calibration ---------- */
  /** Open floor calibration: drag until the grid lies on the real floor, then tap Done. */
  calibrate() { if (!this.cal) { this.cal = { eye: this.eye ?? -FLOOR, drag: null, moved: 0 }; this.calGrid.visible = true; } return this; }
  /** True while the floor calibration is open: games should not advance (skip update). */
  get calibrating() { return !!this.cal; }
  /**
   * Route a game's input through the kit first: input('down' | 'move' | 'up', x, y, id[, pressed]).
   * Returns true when the kit used it (calibration, or the Floor chip), so the game should ignore it.
   */
  input(kind, x, y, id, pressed) {
    const c = this.cal;
    if (!c) {
      const k = this.chip;
      if (kind === 'down' && k && x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h) { this.calibrate(); haptic('light'); return true; }
      return false;
    }
    if (kind === 'down') { c.drag = { id, y }; c.moved = 0; }
    else if (kind === 'move' && c.drag && c.drag.id === id && pressed) {
      // dragging down lowers the grid: the phone must be held higher than assumed
      const dy = y - c.drag.y; c.drag.y = y; c.moved += Math.abs(dy);
      c.eye = Math.max(EYE_MIN, Math.min(EYE_MAX, c.eye + dy * .006 * Math.max(.6, c.eye)));
    } else if (kind === 'up' && c.drag && c.drag.id === id) {
      const b = c.done; c.drag = null;
      if (c.moved < 8 && b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
        this.eye = Math.round(c.eye * 100) / 100; store.set(EYE_KEY, this.eye); this.cal = null; this.calGrid.visible = false; haptic('success');
      }
    }
    return true;
  }

  /* ---------- light estimation ---------- */
  // Every few frames, shrink the camera picture to 8 x 6 pixels and read its average brightness
  // and colour. The lights ease towards that, so a dim room gives dim, warm or cool objects.
  estimateLight(video) {
    if (this.lightN++ % 6) return;
    try {
      const cv = this.lightCv ||= Object.assign(document.createElement('canvas'), { width: 8, height: 6 });
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, 8, 6);
      const d = g.getImageData(0, 0, 8, 6).data; let r = 0, gr = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += (d[i] / 255) ** 2.2; gr += (d[i + 1] / 255) ** 2.2; b += (d[i + 2] / 255) ** 2.2; }
      const n = d.length / 4; r /= n; gr /= n; b /= n;
      const lum = Math.min(1, Math.pow(.2126 * r + .7152 * gr + .0722 * b, 1 / 2.2)), m = Math.max(r, gr, b, 1e-3);
      const k = .15; this.lum += (lum - this.lum) * k;
      this.tint = this.tint.map((t, i) => t + ((.55 + .45 * [r, gr, b][i] / m) - t) * k);
    } catch { /* picture not readable yet */ }
  }
  applyLight(on) {
    const L = on ? this.lum : .45, [r, g, b] = on ? this.tint : [1, 1, 1];
    this.hemi.intensity = .3 + L * 1.35; this.sunL.intensity = .7 + L * 3.6; this.envI = .25 + L * 1;
    this.hemi.color.setRGB(.91 * r, .93 * g, .97 * b); this.sunL.color.setRGB(r, .96 * g, .9 * b);
  }

  /** Unit vector the phone is pointing along. */
  forward(out = new Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.cam.quaternion); }
  /** Which way the phone faces on the floor plane, in radians (0 = the start direction, turning left is +). */
  heading() { const f = this.forward(tmp); return Math.atan2(-f.x, -f.z); }
  /** Angle in radians between where the phone points and world point p. */
  offAim(p) { const f = this.forward(tmp), c = this.cam.position, x = p.x - c.x, y = p.y - c.y, z = p.z - c.z, l = Math.hypot(x, y, z) || 1; return Math.acos(Math.max(-1, Math.min(1, (f.x * x + f.y * y + f.z * z) / l))); }

  /** Draw the camera picture (or the virtual room), then the 3D scene on top. HUD goes after. */
  draw(c, W, H) {
    this.fit(W, H);
    let fov = 62;
    if (this.seeing) {
      const v = this.camera.video, vw = v.videoWidth, vh = v.videoHeight, s = Math.max(W / vw, H / vh);
      c.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
      // match the 3D lens to what the camera shows, so placed things don't slide as you turn
      const f = Math.max(vw, vh) / 2 / Math.tan(LONG_FOV * Math.PI / 360);
      fov = 2 * Math.atan(H / s / 2 / f) * 180 / Math.PI;
      this.room.visible = false; this.estimateLight(v); this.applyLight(true);
    } else {
      this.applyLight(false);
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b3442'); g.addColorStop(1, '#151a22'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      this.room.visible = true;
    }
    if (Math.abs(this.cam.fov - fov) > .05) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.render(c, W, H);
  }

  /**
   * Edge arrows to things you can't see: items = [{ p: Vector3, col }]. Off-screen and behind-you
   * targets get an arrow on the screen edge pointing the way to turn.
   */
  pointers(c, W, H, items) {
    const m = this.cam.matrixWorldInverse;
    for (const it of items) {
      const [sx, sy, z] = this.toScreen(it.p.x, it.p.y, it.p.z);
      if (z < 1 && sx > 12 && sx < W - 12 && sy > 12 && sy < H - 12) continue;
      const l = tmp.copy(it.p).applyMatrix4(m), a = Math.atan2(-l.y, l.x);
      const rx = W / 2 - 22, ry = H / 2 - 30, k = Math.min(rx / Math.abs(Math.cos(a) || 1e-3), ry / Math.abs(Math.sin(a) || 1e-3));
      const x = W / 2 + Math.cos(a) * k, y = H / 2 + Math.sin(a) * k;
      c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = it.col || '#fff'; c.strokeStyle = '#000a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(13, 0); c.lineTo(-7, -9); c.lineTo(-3, 0); c.lineTo(-7, 9); c.closePath(); c.stroke(); c.fill(); c.restore();
    }
  }
}

/** A small "camera off / look around" note for the HUD, so players know what the fallback is. */
export function arNote(c, v, W, H) {
  if (v.cal) return calHUD(c, v, W, H);
  // the Floor chip: redo the calibration any time the camera is on
  if (v.seeing) {
    const k = v.chip = { x: 10, y: H - 36, w: 62, h: 24 };
    c.save(); c.fillStyle = '#04110ecc'; c.strokeStyle = '#19e3b188'; c.lineWidth = 1; c.beginPath(); c.roundRect(k.x, k.y, k.w, k.h, 12); c.fill(); c.stroke();
    c.fillStyle = '#8affdc'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('⇕ Floor', k.x + k.w / 2, k.y + 16); c.restore();
  } else v.chip = null;
  let t = null;
  if (v.camState === 'asking') t = 'Starting camera…';
  else if (v.camState === 'denied') t = v.sensor ? 'No camera: playing in a virtual room' : 'No camera: drag to look around';
  else if (!v.sensor && v.seeing) t = 'No motion sensor: drag to look around';
  if (!t) return;
  c.save(); c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center';
  const w = c.measureText(t).width + 20; c.fillStyle = '#000a'; const y = v.chip ? H - 64 : H - 34; c.beginPath(); c.roundRect(W / 2 - w / 2, y, w, 22, 11); c.fill();
  c.fillStyle = '#fff'; c.fillText(t, W / 2, y + 15); c.restore();
}

function calHUD(c, v, W, H) {
  const cal = v.cal;
  c.save(); c.textAlign = 'center';
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(16, 60, W - 32, 74, 14); c.fill();
  c.fillStyle = '#fff'; c.font = '800 16px Rubik, sans-serif'; c.fillText('Line up your floor', W / 2, 86);
  c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#c4ccdc';
  c.fillText(v.seeing ? 'Point at the floor, then drag up or down' : 'Drag up or down to set your height', W / 2, 106);
  c.fillText('until the grid lies flat on it', W / 2, 122);
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(W / 2 - 75, H - 110, 150, 26, 13); c.fill();
  c.font = '700 13px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`Phone height ${cal.eye.toFixed(2)} m`, W / 2, H - 92);
  const b = cal.done = { x: W / 2 - 60, y: H - 76, w: 120, h: 40 };
  c.fillStyle = '#f2f5fb'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 20); c.fill();
  c.fillStyle = '#05070c'; c.font = '800 14px Rubik, sans-serif'; c.fillText('Done', W / 2, b.y + 25);
  c.restore();
}

export { THREE };

