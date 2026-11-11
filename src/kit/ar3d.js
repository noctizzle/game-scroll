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
//
// Native AR (world mode): in the phone app, where the NativeAR plugin and ARKit / ARCore are
// there, the camera picture is drawn natively behind a see-through page and the 3D camera follows
// the phone's real position as well as its turn, so players can walk around things. The floor is
// found, not calibrated (ar-floor.js): from mapped surfaces, from the feature points the phone
// tracks, and from hit tests. If nothing turns up in a few seconds play starts on an estimate,
// which real evidence replaces later; the "Floor" chip lets the player line it up by hand. Light
// comes from the phone's own estimate. v.mode says which is running ('world' or 'look');
// v.surfaces() lists found surfaces and v.hit(x, y) finds where a screen point meets one. If the
// phone can't track the room at all (too dark, nothing to see) the player can carry on in
// look-around mode. Everything else works the same.
import { HDView, HD, pbr, surface, speckle, sun, THREE } from './hd3d.js';
import { pause, built, later } from './slices.js';
import { startCamera, stopCamera, orientation, haptic } from './device.js';
import { store } from '../util.js';
import { prefs } from './prefs.js';
import { nativeStart, nativeStop, nativeHit, nativePoints } from './native-ar.js';
import { FloorFinder, FLOOR_MAX } from './ar-floor.js';
const { Matrix4, Plane, Raycaster, Vector2, Group, Mesh, PlaneGeometry, BoxGeometry, ShadowMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, Vector3, Quaternion, Euler, BackSide, GridHelper } = THREE;

// A 50 cm grid of bright lines that fades out towards its edges, for showing where the floor is.
// White: the material's colour makes it teal on a found floor and amber on an estimated one.
const TEAL = '#19e3b1', AMBER = '#ffc14a';
let GT = null;
function gridTex() {
  if (GT) return GT;
  const S = 512, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), g = cv.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 2.5;
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
  if (ROOM) { for (const s of ROOM.sets) if (s.core.wait) later(s.core.wait); return ROOM; }   // (still with a worker: this card waits for it too)
  pause('Textures');   // (while a card loads, a frame may go by first: slices.js)
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
  ROOM = { floor: pbr('#ffffff', { tex: wood.repeat(6, 6), rough: .7 }), wall: pbr('#bdb6aa', { tex: paint.repeat(4, 2), rough: .95, side: BackSide }), sets: [wood, paint] };
  built();
  return ROOM;
}

const Z = new Vector3(0, 0, 1), Y = new Vector3(0, 1, 0), Q1 = new Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
const eu = new Euler(), q0 = new Quaternion(), qd = new Quaternion(), qy = new Quaternion(), tmp = new Vector3();
const mA = new Matrix4(), mB = new Matrix4(), mC = new Matrix4(), sc = new Vector3(), ray = new Raycaster(), floorPl = new Plane(new Vector3(0, 1, 0), -FLOOR), v2 = new Vector2();
const GOOD = { TRACKING: 1, LIMITED: 1 };
// One listener for every AR view, held weakly: a listener per view kept each dropped card's whole
// scene in memory for the rest of the session.
const views = new Set();
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  for (const r of views) { const v = r.deref(); if (!v) views.delete(r); else try { v.off(); } catch (_) { /* best effort */ } }
});
// The floor of the last round, in the AR session's own space: { y, src, sure }. The session and its
// map of the room carry on between rounds and games, so the next round starts from it.
let KEPT = null, TOLD = false;
// While looking for the floor, where on the screen to ask "what is there?" (across, down).
const RAYS = [[.5, .6], [.28, .72], [.72, .72]];
// a fresh native-AR state: the latest pose and projection, how native space maps to game space,
// and the floor search (scan: the "Find your floor" step is open; lost: tracking has dropped out)
const natState = eye => ({ pose: new Matrix4(), proj: new Matrix4(), has: false, tracking: 'PAUSED', why: 'NONE', light: null, planes: [], pts: 0, yaw0: null, x0: 0, z0: 0, yOff: null, yOffT: 0, M: new Matrix4(), t0: performance.now(),
  ff: new FloorFinder({ eye: Math.max(.7, Math.min(1.7, eye)), kept: KEPT }), fed: false, scan: true, scanT: 0, asking: false, shown: 0, grow: 1, est: false, say: null, sayT: 0, badT: 0, lost: false, lookT: 0, skip: null });

export class ARView extends HDView {
  constructor(o = {}) {
    super({ bg: '#0b0f14', env: .7, amb: .9, sky: '#e8eef8', ground: '#6a5e50', fov: 62, ...o });
    this.scene.background = null; this.clearBg = true; this.cam.far = 60;
    // sunlight from above-behind; its shadows land on an invisible floor that only shows shadow
    this.sunL = sun('#fff4e4', 2.4, 7, [-.35, 1, .45]); this.scene.add(this.sunL, this.sunL.target); this.sunL.follow(0, FLOOR, -2);
    super.onTier(T => { this.sunL.setTier(T); this.gameTier?.(T); });
    const catcher = new Mesh(new PlaneGeometry(40, 40), new ShadowMaterial({ color: 0x000000, opacity: .38 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.y = FLOOR + .002; catcher.receiveShadow = true; this.scene.add(catcher);
    // soft contact shadows right under things, so they sit on the real floor (medium tier and up)
    this.contactShadows = this.contact({ y: FLOOR, size: 6, opacity: .5 }).at(0, -2);
    // the virtual room, shown only while there is no camera picture
    const L = roomLooks(), room = new Group();
    const fl = new Mesh(new PlaneGeometry(14, 14), L.floor); fl.rotation.x = -Math.PI / 2; fl.position.y = FLOOR; fl.receiveShadow = true;
    const walls = new Mesh(new BoxGeometry(14, 6, 14), L.wall); walls.position.y = FLOOR + 2.98;   // its bottom face sits just under the wooden floor
    const grid = new GridHelper(14, 14, 0xffffff, 0xffffff); grid.position.y = FLOOR + .003; grid.material.transparent = true; grid.material.opacity = .08;
    room.add(fl, walls, grid); this.room = room; this.scene.add(room);
    // calibration grid: a 6 m teal grid on the floor, shown while the player lines it up
    this.calGrid = new Mesh(new PlaneGeometry(6, 6), new MeshBasicMaterial({ map: gridTex(), color: TEAL, transparent: true, depthWrite: false, toneMapped: false }));
    this.calGrid.rotation.x = -Math.PI / 2; this.calGrid.position.y = FLOOR + .004; this.calGrid.visible = false; this.scene.add(this.calGrid);
    this.eye = store.get(EYE_KEY, null); this.cal = null; this.chip = null;
    // light estimate from the camera picture
    this.lightCv = null; this.lightN = 0; this.lum = .45; this.tint = [1, 1, 1];
    this.camState = 'off'; this.camera = null; this.yaw0 = null; this.yaw = 0; this.pitch = 0; this.sensor = false;
    this.camQ = new Quaternion(); this.nat = null; this.rect = null; this.noNative = false;
    views.add(new WeakRef(this));   // camera off when the app hides (one listener for all views, below)
  }
  /** Let a game react to quality changes (the kit already handles the sun's shadows). */
  onTier(fn) { this.gameTier = fn; return this; }

  /** Call every update while playing: starts the back camera once (asks permission the first time). */
  live() {
    // the camera was stopped by the app (round over, player left) without off(): ask for it again
    if (this.camState === 'on' && this.camera && this.camera.video.srcObject?.active === false) { this.camState = 'off'; this.camera = null; }
    if (this.camState !== 'off') return this;
    this.camState = 'asking';
    const web = () => startCamera().then(c => {
      if (this.camState !== 'asking') { if (c) stopCamera(); return; }   // switched off while asking
      this.camera = c; this.camState = c ? 'on' : 'denied';
      if (c && this.eye == null) this.calibrate();   // first time with a camera: line up the floor
    });
    if (this.noNative) { web(); return this; }   // the player chose look-around mode (toLook)
    // native AR first (phone app with ARKit / ARCore), else the web camera with the gyro
    nativeStart(this).then(r => {
      if (this.camState !== 'asking') { if (r.started) nativeStop(this); return; }
      if (r.started) { this.camState = 'native'; this.nat = natState(this.eye ?? -FLOOR); this.cal = null; this.calGrid.visible = false; this.feed(true); return; }
      if (r.reason === 'camera') { this.camState = 'denied'; return; }   // camera refused: don't ask twice
      web();
    });
    return this;
  }
  /** Stop the camera (call from reset() and before api.over()). Denied stays denied for this game. */
  off() {
    if (this.camState === 'on' || this.camState === 'asking') stopCamera();
    nativeStop(this); this.nat = null;
    if (this.cal?.world) { this.cal = null; this.calGrid.visible = false; }   // lining the floor up by hand in world mode
    if (this.camState !== 'denied') this.camState = 'off'; this.camera = null; return this;
  }
  /**
   * Leave native AR for look-around mode (the web camera and the gyro) for the rest of this view's
   * life. For rooms the phone can't track: too dark, or nothing for the camera to hold on to.
   */
  toLook() {
    if (!this.nat) return this;
    this.noNative = true; this.nat = null; this.cal = null; this.calGrid.visible = false; this.yaw0 = null;
    this.camState = 'asking';
    // the phone has to let go of the camera before the page can have it
    Promise.resolve(nativeStop(this)).then(() => new Promise(r => setTimeout(r, 250))).then(() => {
      if (this.camState !== 'asking') return;   // switched off meanwhile
      this.camState = 'off'; this.live();
    });
    return this;
  }
  /** True while the real camera picture is showing. */
  get seeing() { if (this.camState === 'native') return true; const v = this.camera?.video; return !!(v && v.readyState >= 2 && v.videoWidth); }
  /** 'world' while native AR tracks the phone's real position (walk around), else 'look' (turn on the spot). */
  get mode() { return this.camState === 'native' ? 'world' : 'look'; }

  /* ---------- native AR (called by native-ar.js) ---------- */
  frame(d) {
    const n = this.nat; if (!n) return;
    if (d.tracking) n.tracking = d.tracking;
    n.why = d.why || 'NONE';
    if (!d.pose) return;
    n.pose.fromArray(d.pose); n.proj.fromArray(d.proj); n.light = d.light || null;
    if (!GOOD[d.tracking]) return;
    const m = d.pose;
    n.ff.pose(m[12], m[13], m[14]);
    if (n.yaw0 == null) {
      // the first good pose (or after recenter): where the phone points becomes "straight ahead" (-z),
      // where it stands becomes x = z = 0, and until a floor is found it's held at the usual height
      n.yaw0 = Math.atan2(m[8], m[10]); n.x0 = m[12]; n.z0 = m[14];
      if (n.ff.floor == null) n.yOffT = FLOOR + n.ff.eye - m[13];
    }
    n.has = true;
    this.floorNews();
    if (n.yOff == null) n.yOff = n.yOffT;
  }
  // mapped surfaces, and (while the floor isn't settled) the feature points the phone is tracking
  planes(list, pts) {
    const n = this.nat; if (!n) return;
    n.planes = list;
    if (!n.has) return;
    if (pts) { n.pts = pts.length / 3 | 0; n.ff.points(pts, .001); }
    n.ff.planes(list.map(p => ({ x: p.pose[12], y: p.pose[13], z: p.pose[14], a: p.w * p.d, kind: p.kind })));
    this.floorNews();
  }
  // Ask the phone for its feature points only while they can still change the answer.
  feed(on) { const n = this.nat; if (!n || n.fed === on) return; n.fed = n.ff.expect = on; nativePoints(on); if (!on) { n.pts = 0; n.ff.clearPoints(); } }
  // The floor finder has news: move the room onto the floor and tell the player.
  floorNews() {
    const n = this.nat, f = n.ff, ev = f.take(); if (!ev) return;
    n.yOffT = FLOOR - f.floor;
    KEPT = { y: f.floor, src: f.src, sure: f.sure };
    if (f.src === 'plane' || f.src === 'hand') this.feed(false);
    if (ev === 'moved') return;
    n.scan = false;
    if (f.sure) { this.eye = Math.round(Math.max(EYE_MIN, Math.min(EYE_MAX, f.py0 - f.floor)) * 100) / 100; store.set(EYE_KEY, this.eye); }   // the usual phone height, for next time's first guess
    if (this.cal) return;   // being lined up by hand: the grid is showing already
    // the grid shows on the floor for a moment: teal for a real floor, amber for an estimate
    n.est = !(f.sure || (ev === 'kept' && f.kept?.sure)); n.shown = 1.8; n.grow = 0;
    n.say = f.src === 'hand' || ev === 'kept' && !n.est ? null : f.sure ? 'Floor found' : TOLD ? 'Floor estimated' : 'Floor estimated: tap to adjust';
    n.sayT = f.sure ? 1.8 : 3.5; if (!f.sure) TOLD = true;
    haptic(f.sure ? 'success' : 'light');
  }
  // While the floor isn't sure, ask where a few screen points meet something, a few times a second.
  // A mapped surface counts at once; rough feature points need three that agree.
  scanFloor(dt) {
    const n = this.nat, r = this.rect;
    if (n.ff.sure || n.asking || !r || !GOOD[n.tracking] || (n.scanT -= dt) > 0) return;
    if (performance.now() - n.t0 > 40000) return this.feed(false);   // an estimate has had long enough to be bettered: stop asking
    n.scanT = n.scan ? .2 : .5; n.asking = true;   // (less often once the round is running on an estimate)
    Promise.all(RAYS.map(([u, v]) => nativeHit(r.left + r.width * u, r.top + r.height * v))).then(all => {
      n.asking = false; if (this.nat !== n) return;
      for (const hs of all) for (const h of hs) n.ff.hit(h.pose[12], h.pose[13], h.pose[14], h.kind, h.surface);
      this.floorNews();
    });
  }
  /**
   * Surfaces native AR has found, in game space: [{ id, p (centre), q (turn), w, d, floor, kind }]. w runs
   * along the surface's own x and d along its z. kind is 'floor' | 'table' | 'seat' | 'other' where the
   * phone can tell (iPhones), else undefined. Empty in look mode.
   */
  surfaces() {
    const n = this.nat; if (!n?.has) return [];
    const fy = n.ff.floor;
    return n.planes.map(s => {
      const p = new Vector3(), q = new Quaternion(); mA.fromArray(s.pose).premultiply(n.M).decompose(p, q, sc);
      return { id: s.id, p, q, w: s.w, d: s.d, floor: fy != null && Math.abs(s.pose[13] - fy) < .05, kind: s.kind && s.kind !== 'none' ? s.kind : undefined };
    });
  }
  /** True once native AR has found the real floor (not while it is only estimated). */
  get floorFound() { return !!this.nat?.ff.sure; }
  /**
   * What the floor height comes from in world mode: 'plane' (a mapped surface), 'points', 'hits' or
   * 'hand' (lined up by the player) are real; 'kept' (last round's), 'rough' and 'guess' are estimates.
   * null while searching, and in look mode.
   */
  get floorSource() { return this.nat?.ff.src ?? null; }
  /**
   * What the AR system is doing, for test scenes (AR Lab): { mode, tracking, why (why tracking is poor),
   * surfaces and points (how many it has), floor (as floorSource), sure, layer (how well a flat layer of
   * points is supported) }.
   */
  status() {
    const n = this.nat, f = n?.ff;
    return { mode: this.mode, tracking: n ? n.tracking : this.sensor ? 'gyro' : 'none', why: n?.why || 'NONE', surfaces: n ? n.planes.length : 0,
      points: n ? n.pts : 0, floor: f?.src ?? null, sure: !!f?.sure, layer: f?.layer ? f.layer.n : 0 };
  }
  /**
   * Where game point (x, y) on the screen meets a real surface: resolves { p: Vector3, kind } or null.
   * kind is 'plane' or 'point' (native AR) or 'floor' (look mode: the line of sight hits FLOOR).
   */
  async hit(x, y) {
    const n = this.nat, r = this.rect;
    if (n?.has && r) {
      const h = (await nativeHit(r.left + x / this.W * r.width, r.top + y / this.H * r.height))[0];
      if (h && this.nat === n) return { p: new Vector3().setFromMatrixPosition(mA.fromArray(h.pose).premultiply(n.M)), kind: h.kind };
      if (h) return null;
    }
    ray.setFromCamera(v2.set(x / this.W * 2 - 1, 1 - y / this.H * 2), this.cam);
    const p = ray.ray.intersectPlane(floorPl, new Vector3());
    return p && p.distanceTo(this.cam.position) < 15 ? { p, kind: 'floor' } : null;
  }
  // native pose -> 3D camera; called from look()
  lookNative() {
    const n = this.nat, now = performance.now(), dt = Math.min(.1, (now - (n.lookT || now)) / 1000), good = !!GOOD[n.tracking];
    n.lookT = now;
    // tracking dropped out: after a second the game waits (v.calibrating) until the room is found again
    n.badT = good ? 0 : n.badT + dt; n.lost = n.has && !n.scan && n.badT > 1;
    if (n.has) {
      n.ff.update(dt, good); this.floorNews();
      n.yOff += (n.yOffT - n.yOff) * (1 - Math.exp(-dt * 6));   // a newly found floor eases in
      n.M.makeTranslation(-n.x0, 0, -n.z0).premultiply(mB.makeRotationY(-n.yaw0)).premultiply(mC.makeTranslation(0, n.yOff, 0));
      mA.multiplyMatrices(n.M, n.pose).decompose(this.cam.position, this.cam.quaternion, sc);
      this.scanFloor(dt);
      // The teal grid means "this is your floor": it spreads out over the floor when it is found (amber
      // when it is only estimated) and shows while the player lines it up by hand. Never while searching.
      const g = this.calGrid, cal = this.cal;
      if (n.shown > 0) n.shown -= dt;
      if (n.sayT > 0) n.sayT -= dt;
      g.visible = !!cal || n.shown > 0;
      if (g.visible) {
        n.grow = Math.min(1, n.grow + dt * (prefs.reduceMotion ? 99 : 2.4));
        g.scale.setScalar(cal ? 1 : .15 + .85 * (1 - (1 - n.grow) ** 3));
        g.material.opacity = cal ? 1 : Math.min(1, n.shown * 1.5);
        g.material.color.set(!cal && n.est ? AMBER : TEAL);
        // on whole half metres, so its lines stay put on the floor as the player moves
        g.position.set(Math.round(this.cam.position.x * 2) / 2, FLOOR + .004, Math.round(this.cam.position.z * 2) / 2);
      }
    } else this.cam.position.set(0, FLOOR + this.eyeH, 0);
    this.sensor = true; this.cam.updateMatrixWorld();
    return this;
  }
  // native projection, cropped from the full screen to where the game's canvas sits
  projectNative(c) {
    const n = this.nat, r = this.rect = c.canvas.getBoundingClientRect(), VW = innerWidth, VH = innerHeight;
    if (!n.has || !r.width || !r.height) return;
    const sx = VW / r.width, ox = (VW - 2 * r.left - r.width) / r.width, sy = VH / r.height, oy = (r.height - VH + 2 * r.top) / r.height;
    mA.set(sx, 0, 0, ox, 0, sy, 0, oy, 0, 0, 1, 0, 0, 0, 0, 1);
    this.cam.projectionMatrix.multiplyMatrices(mA, n.proj); this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
    this.cam.fov = 2 * Math.atan(1 / this.cam.projectionMatrix.elements[5]) * 180 / Math.PI;   // games use fov for sizes
  }

  /** Make where the phone points now "straight ahead" (call from reset()). */
  recenter() {
    this.yaw0 = null; this.yaw = 0; this.pitch = 0;
    // where you stand becomes x = z = 0 (native AR takes it on the next frame), so things a game
    // places now from eyePos line up with the new "ahead" instead of last round's position
    if (this.nat) this.nat.yaw0 = null;
    this.cam.position.x = this.cam.position.z = 0;
    return this;
  }
  /** No-gyro fallback: drag to look around (pixels moved). */
  drag(dx, dy) { if (this.sensor) return; this.yaw += dx * .007; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * .006)); }

  /**
   * Fresh aim (frame generation, hd3d.js aimNow): where the phone points right now, for the frames made
   * between real ones, so the 3D stays pinned to the room at the screen's rate. Leaves the view's own state alone.
   */
  freshAim(cam) {
    if (this.nat) { if (this.nat.has) { mA.multiplyMatrices(this.nat.M, this.nat.pose).decompose(tmp, cam.quaternion, sc); } return; }
    const o = this.sensor ? orientation() : null, d = Math.PI / 180;
    if (o && this.yaw0 != null && this.absSeen === o.abs) {
      eu.set(o.beta * d, o.alpha * d, -o.gamma * d, 'YXZ');
      qd.setFromEuler(eu).multiply(Q1).multiply(q0.setFromAxisAngle(Z, -o.screen * d)).premultiply(qy.setFromAxisAngle(Y, -this.yaw0));
      // the same smoothing look() gives it, for the time since look() ran
      const k = 1 - Math.exp(-Math.min(.05, (performance.now() - (this.lookT || 0)) / 1000) * 28);
      cam.quaternion.copy(this.camQ).slerp(qd, k);
    } else if (!this.sensor) cam.quaternion.setFromEuler(eu.set(this.pitch, this.yaw, 0, 'YXZ'));
  }

  /** Point the 3D camera the way the phone points. Call once per frame before draw(). */
  look(dt = 1 / 60) {
    this.lookT = performance.now();
    if (this.nat) return this.lookNative();
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
  get eyeH() { return this.nat?.has ? this.cam.position.y - FLOOR : this.cal ? this.cal.eye : this.eye ?? -FLOOR; }
  /** Where the phone is (the camera position). */
  get eyePos() { return this.cam.position; }

  /* ---------- floor calibration ---------- */
  /**
   * Open floor calibration: drag until the grid lies on the real floor, then tap Done. In world mode
   * (native AR) it moves the found or estimated floor, and "Scan again" starts the search over.
   */
  calibrate() {
    if (this.cal) return this;
    const n = this.nat, g = this.calGrid;
    if (n) { if (!n.has || n.ff.floor == null) return this; this.cal = { world: true, fy: n.ff.floor, y0: n.ff.floor, drag: null, moved: 0 }; }
    else { this.cal = { eye: this.eye ?? -FLOOR, drag: null, moved: 0 }; g.scale.setScalar(1); g.material.opacity = 1; g.material.color.set(TEAL); g.position.set(0, FLOOR + .004, 0); }
    g.visible = true;
    return this;
  }
  /**
   * True while the game should wait (skip update): floor calibration is open, native AR is looking
   * for the floor, or it has lost track of the room.
   */
  get calibrating() { const n = this.nat; return !!this.cal || !!(n && (n.scan || n.lost)); }
  /**
   * Route a game's input through the kit first: input('down' | 'move' | 'up', x, y, id[, pressed]).
   * Returns true when the kit used it (calibration, or the Floor chip), so the game should ignore it.
   */
  input(kind, x, y, id, pressed) {
    const n = this.nat, on = b => b && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
    if (n && (n.scan || n.lost)) {   // looking for the floor, or for the room again: everything waits
      if (kind === 'up' && on(n.skip)) {
        haptic('light');
        if (n.skip.look) this.toLook(); else { n.ff.giveUp(); this.floorNews(); }   // Skip: carry on with the best estimate
      }
      return true;
    }
    const c = this.cal;
    if (!c) {
      if (kind === 'down' && on(this.chip)) { this.calibrate(); haptic('light'); return true; }
      return false;
    }
    if (kind === 'down') { c.drag = { id, y }; c.moved = 0; }
    else if (kind === 'move' && c.drag && c.drag.id === id && pressed) {
      // dragging down lowers the grid: the floor is further below the phone than assumed
      const dy = y - c.drag.y; c.drag.y = y; c.moved += Math.abs(dy);
      if (c.world) {
        const py = n.ff.py, eye = Math.max(EYE_MIN, Math.min(FLOOR_MAX, (py - c.fy) + dy * .006 * Math.max(.6, py - c.fy)));
        c.fy = py - eye; n.ff.hand(c.fy); this.floorNews(); n.yOff = n.yOffT;
      } else c.eye = Math.max(EYE_MIN, Math.min(EYE_MAX, c.eye + dy * .006 * Math.max(.6, c.eye)));
    } else if (kind === 'up' && c.drag && c.drag.id === id) {
      c.drag = null;
      if (c.moved >= 8) return true;
      if (on(c.done)) {
        if (c.world) { if (c.fy !== c.y0) { this.eye = Math.round(Math.max(EYE_MIN, Math.min(EYE_MAX, n.ff.py - c.fy)) * 100) / 100; store.set(EYE_KEY, this.eye); } n.shown = 0; }
        else { this.eye = Math.round(c.eye * 100) / 100; store.set(EYE_KEY, this.eye); }
        this.cal = null; this.calGrid.visible = false; haptic('success');
      } else if (c.world && on(c.again)) {
        // forget the floor and search again
        KEPT = null; n.ff = new FloorFinder({ eye: n.ff.eye }); n.scan = true; n.t0 = performance.now(); n.shown = 0; n.say = null; n.fed = false; this.feed(true);
        this.cal = null; this.calGrid.visible = false; haptic('light');
      }
    }
    return true;
  }

  /* ---------- light estimation ---------- */
  // Twice a second, shrink the camera picture to 8 x 6 pixels and read its average brightness and
  // colour (reading pixels back makes the graphics chip wait, so not every frame). The lights ease
  // towards that, so a dim room gives dim, warm or cool objects.
  estimateLight(video) {
    const now = performance.now(); if (now - this.lightN < 500) return; this.lightN = now;
    try {
      const cv = this.lightCv ||= Object.assign(document.createElement('canvas'), { width: 8, height: 6 });
      const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, 8, 6);
      const d = g.getImageData(0, 0, 8, 6).data; let r = 0, gr = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += (d[i] / 255) ** 2.2; gr += (d[i + 1] / 255) ** 2.2; b += (d[i + 2] / 255) ** 2.2; }
      const n = d.length / 4; r /= n; gr /= n; b /= n;
      const lum = Math.min(1, Math.pow(.2126 * r + .7152 * gr + .0722 * b, 1 / 2.2)), m = Math.max(r, gr, b, 1e-3);
      const k = .45; this.lum += (lum - this.lum) * k;
      this.tint = this.tint.map((t, i) => t + ((.55 + .45 * [r, gr, b][i] / m) - t) * k);
    } catch { /* picture not readable yet */ }
  }
  nativeLight() {
    const l = this.nat.light; if (!l) return;
    const k = .05, c = l.color || [1, 1, 1], m = Math.max(...c, 1e-3);
    this.lum += (Math.min(1, Math.max(0, l.intensity)) - this.lum) * k;
    this.tint = this.tint.map((t, i) => t + ((.55 + .45 * c[i] / m) - t) * k);
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
    if (this.nat) {
      // the camera picture is drawn natively behind the page: leave the canvas see-through
      this.under = null; this.underCss = '';
      c.clearRect(0, 0, W, H); this.room.visible = false; this.nativeLight(); this.applyLight(true);
      this.projectNative(c); this.render(c, W, H); return;
    }
    if (this.seeing) {
      const v = this.camera.video, vw = v.videoWidth, vh = v.videoHeight, s = Math.max(W / vw, H / vh);
      // the video itself sits under the 3D canvas (CSS object-fit: cover crops it the same way), so
      // it isn't redrawn every frame; tests and screenshots (no direct mode) still draw it here
      this.underCss = '';
      if (HD.direct) this.under = v; else { this.under = null; c.drawImage(v, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s); }
      // match the 3D lens to what the camera shows, so placed things don't slide as you turn
      const f = Math.max(vw, vh) / 2 / Math.tan(LONG_FOV * Math.PI / 360);
      fov = 2 * Math.atan(H / s / 2 / f) * 180 / Math.PI;
      this.room.visible = false; this.estimateLight(v); this.applyLight(true);
    } else {
      this.applyLight(false); this.under = null;
      if (HD.direct) this.underCss = 'linear-gradient(#2b3442, #151a22)';
      else { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b3442'); g.addColorStop(1, '#151a22'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
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

/** A small "camera off / look around" note for the HUD, so players know what the fallback is. Also draws the kit's own panels (finding the floor, lining it up). */
export function arNote(c, v, W, H) {
  if (v.cal) return calHUD(c, v, W, H);
  if (v.nat) return nativeNote(c, v, W, H);
  // the Floor chip: redo the calibration any time the camera is on
  if (v.seeing) floorChip(c, v, H); else v.chip = null;
  let t = null;
  if (v.camState === 'asking') t = 'Starting camera…';
  else if (v.camState === 'denied') t = v.sensor ? 'No camera: playing in a virtual room' : 'No camera: drag to look around';
  else if (!v.sensor && v.seeing) t = 'No motion sensor: drag to look around';
  if (t) pill(c, t, W, v.chip ? H - 64 : H - 34);
}

function floorChip(c, v, H) {
  const k = v.chip = { x: 10, y: H - 36, w: 62, h: 24 };
  c.save(); c.fillStyle = '#04110ecc'; c.strokeStyle = '#19e3b188'; c.lineWidth = 1; c.beginPath(); c.roundRect(k.x, k.y, k.w, k.h, 12); c.fill(); c.stroke();
  c.fillStyle = '#8affdc'; c.font = '700 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('⇕ Floor', k.x + k.w / 2, k.y + 16); c.restore();
}
// (left: start at that x rather than sit in the middle, for a note beside the Floor chip)
function pill(c, t, W, y, alpha = 1, left = null) {
  c.save(); c.globalAlpha = Math.max(0, Math.min(1, alpha)); c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center';
  const w = Math.min(W - 10 - (left ?? 10), c.measureText(t).width + 20), x = left ?? W / 2 - w / 2;
  c.fillStyle = '#000a'; c.beginPath(); c.roundRect(x, y, w, 22, 11); c.fill();
  c.fillStyle = '#fff'; c.fillText(t, x + w / 2, y + 15, w - 16); c.restore();
}
// the dark panel at the top: a title and two lines
function panel(c, W, title, a, b, h = 74) {
  c.textAlign = 'center';
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(16, 60, W - 32, h, 14); c.fill();
  c.fillStyle = '#fff'; c.font = '800 16px Rubik, sans-serif'; c.fillText(title, W / 2, 86, W - 48);
  c.font = '500 12px Rubik, sans-serif'; c.fillStyle = '#c4ccdc';
  c.fillText(a, W / 2, 106, W - 48); c.fillText(b, W / 2, 122, W - 48);
}
function button(c, t, W, y, w, h = 36) {
  const b = { x: W / 2 - w / 2, y, w, h };
  c.fillStyle = '#04110ed9'; c.strokeStyle = '#19e3b166'; c.lineWidth = 1; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, h / 2); c.fill(); c.stroke();
  c.fillStyle = '#8affdc'; c.font = '700 13px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(t, W / 2, y + h / 2 + 5, w - 16);
  return b;
}
// Why the phone can't follow the room, in the player's words (ARCore and ARKit give the same reasons).
const TRACK_HELP = {
  INSUFFICIENT_LIGHT: ['It is too dark for the camera here', 'Turn on a light, or try another room'],
  EXCESSIVE_MOTION: ['The phone is moving too fast', 'Hold it steady, then move it slowly'],
  INSUFFICIENT_FEATURES: ['The camera needs more detail to look at', 'Point at furniture, a rug or the floor\'s edge'],
  CAMERA_UNAVAILABLE: ['Another app is using the camera', 'Close it, then come back here'],
};

function nativeNote(c, v, W, H) {
  const n = v.nat;
  if (n.scan) { v.chip = null; return scanHUD(c, v, W, H); }
  if (n.lost) { v.chip = null; return lostHUD(c, v, W, H); }
  n.skip = null;
  floorChip(c, v, H);
  // beside the chip, on the bottom row that games keep clear (their own hints sit higher)
  if (n.sayT > 0 && n.say) pill(c, n.say, W, v.chip.y + 1, n.sayT * 2, v.chip.x + v.chip.w + 6);
}

// "Find your floor": what to do, how far the search has got, and a way on if it can't be found.
function scanHUD(c, v, W, H) {
  const n = v.nat, f = n.ff, good = n.has && !!GOOD[n.tracking], wait = (performance.now() - n.t0) / 1000, sure = good && f.evidence > .3;
  // (an iPhone that is tracking poorly still gives a pose, with the reason: show the help for that too)
  const [a, b] = !good ? TRACK_HELP[n.why] || ['Getting to know your room', 'Move the phone slowly from side to side']
    : sure ? ['Nearly there', 'Keep moving the phone slowly'] : n.tracking === 'LIMITED' && TRACK_HELP[n.why] || ['Point the phone at the floor a few steps ahead', 'and move it slowly from side to side'];
  c.save();
  panel(c, W, 'Find your floor', a, b, 84);
  const bw = W - 72, p = good ? f.progress : 0;
  c.fillStyle = '#ffffff24'; c.beginPath(); c.roundRect(36, 132, bw, 4, 2); c.fill();
  c.fillStyle = '#19e3b1'; c.beginPath(); c.roundRect(36, 132, Math.max(4, bw * p), 4, 2); c.fill();
  if (good && !sure) {
    // a little phone sliding from side to side: moving it (not just turning it) is what maps a room
    const x = W / 2 + (prefs.reduceMotion ? 0 : Math.sin(performance.now() / 450) * 26), y = H * .58;
    c.globalAlpha = .9; c.strokeStyle = '#fff'; c.fillStyle = '#04110eaa'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x - 11, y - 19, 22, 38, 5); c.fill(); c.stroke();
    c.globalAlpha = .55; c.beginPath(); c.moveTo(W / 2 - 50, y - 6); c.lineTo(W / 2 - 57, y); c.lineTo(W / 2 - 50, y + 6); c.moveTo(W / 2 + 50, y - 6); c.lineTo(W / 2 + 57, y); c.lineTo(W / 2 + 50, y + 6); c.stroke();
    c.globalAlpha = 1;
  }
  // Skip uses the best estimate. If the room can't be tracked at all, offer look-around mode instead.
  n.skip = null;
  if (n.badT > 5) n.skip = { ...button(c, 'Play without room tracking', W, H - 76, 204), look: true };
  else if (good && wait > 2.5) n.skip = button(c, 'Skip', W, H - 76, 100);
  c.restore();
}

// Tracking dropped out in the middle of a round: the game waits, and says how to get it back.
function lostHUD(c, v, W, H) {
  const n = v.nat, [a, b] = TRACK_HELP[n.why] || ['Point the phone back where you were playing', 'and hold it still for a moment'];
  c.save();
  panel(c, W, 'Lost track of your room', a, b);
  n.skip = n.badT > 5 ? { ...button(c, 'Play without room tracking', W, H - 76, 204), look: true } : null;
  c.restore();
}

function calHUD(c, v, W, H) {
  const cal = v.cal, eye = cal.world ? v.nat.ff.py - cal.fy : cal.eye;
  c.save();
  panel(c, W, 'Line up your floor', v.seeing ? 'Point at the floor, then drag up or down' : 'Drag up or down to set your height', 'until the grid lies flat on it');
  c.fillStyle = '#04110ed9'; c.beginPath(); c.roundRect(W / 2 - 75, H - 110, 150, 26, 13); c.fill();
  c.font = '700 13px Rubik, sans-serif'; c.fillStyle = '#8affdc'; c.fillText(`Phone height ${eye.toFixed(2)} m`, W / 2, H - 92);
  const b = cal.done = { x: W / 2 - 60, y: H - 76, w: 120, h: 40 };
  c.fillStyle = '#f2f5fb'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 20); c.fill();
  c.fillStyle = '#05070c'; c.font = '800 14px Rubik, sans-serif'; c.fillText('Done', W / 2, b.y + 25);
  cal.again = null;
  if (cal.world) {
    // world mode: let the phone look for the floor again
    const a = cal.again = { x: 10, y: H - 70, w: 74, h: 28 };
    c.fillStyle = '#04110ed9'; c.strokeStyle = '#19e3b166'; c.lineWidth = 1; c.beginPath(); c.roundRect(a.x, a.y, a.w, a.h, 14); c.fill(); c.stroke();
    c.fillStyle = '#8affdc'; c.font = '700 11px Rubik, sans-serif'; c.fillText('Scan again', a.x + a.w / 2, a.y + 18);
  }
  c.restore();
}

export { THREE };

