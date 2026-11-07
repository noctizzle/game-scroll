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
import { HDView, pbr, surface, speckle, sun, THREE } from './hd3d.js';
import { startCamera, stopCamera, orientation } from './device.js';
const { Group, Mesh, PlaneGeometry, BoxGeometry, ShadowMaterial, Vector3, Quaternion, Euler, BackSide, GridHelper } = THREE;

/** Floor height in metres: the phone is the eye, about 1.3 m above the floor. */
export const FLOOR = -1.3;
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
    this.cam.quaternion.copy(this.camQ); this.cam.position.set(0, 0, 0); this.cam.updateMatrixWorld();
    return this;
  }
  /** Unit vector the phone is pointing along. */
  forward(out = new Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.cam.quaternion); }
  /** Which way the phone faces on the floor plane, in radians (0 = the start direction, turning left is +). */
  heading() { const f = this.forward(tmp); return Math.atan2(-f.x, -f.z); }
  /** Angle in radians between where the phone points and world point p. */
  offAim(p) { const f = this.forward(tmp); const l = Math.hypot(p.x, p.y, p.z) || 1; return Math.acos(Math.max(-1, Math.min(1, (f.x * p.x + f.y * p.y + f.z * p.z) / l))); }

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
      this.room.visible = false;
    } else {
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
  let t = null;
  if (v.camState === 'asking') t = 'Starting camera…';
  else if (v.camState === 'denied') t = v.sensor ? 'No camera: playing in a virtual room' : 'No camera: drag to look around';
  else if (!v.sensor && v.seeing) t = 'No motion sensor: drag to look around';
  if (!t) return;
  c.save(); c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center';
  const w = c.measureText(t).width + 20; c.fillStyle = '#000a'; c.beginPath(); c.roundRect(W / 2 - w / 2, H - 34, w, 22, 11); c.fill();
  c.fillStyle = '#fff'; c.fillText(t, W / 2, H - 19); c.restore();
}

export { THREE };
