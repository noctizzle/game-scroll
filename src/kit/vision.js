// Face and hand tracking with the front camera, from Google's MediaPipe (Apache-2.0). Games played
// with your face (lean to steer, open your mouth to eat, blink to jump) or your hands (pinch to
// grab, point to aim, show a palm to stop).
//
//   const { Face, Hands } = gs.vision;
//   reset() { face = new Face(); }            // make it in make() or reset(): the library loads first
//   start() { face.start(); }                  // asks for the front camera; face.ready once it's running
//   update(dt) {
//     face.update();                           // looks at the newest camera frame
//     if (face.found) { ship.x = face.x * W; if (face.mouth > .5) chomp(); if (face.blink) jump(); }
//   }
//   over() { face.stop(); }                    // the app also stops it when the round ends
//
// Positions are 0..1 across the screen, mirrored like a selfie (move your head right and x goes up).
// Everything runs on the phone: no picture ever leaves it. The model files (about 4 MB for faces,
// 8 MB for hands, plus a 14 MB engine) download from our games server the first time a face or
// hands game is played, then stay cached.

import { lazy } from './lazy.js';
import { register } from './cleanup.js';
import { ML_VERSION } from './vision-files.js';

const BASE = String((import.meta.env && import.meta.env.VITE_GAMES_URL) || '').replace(/\/+$/, '');
const ML = BASE ? `${BASE}/ml/${ML_VERSION}/` : `ml/${ML_VERSION}/`;   // no games server (dev, tests): served with the app (npm run ml)
const lib = lazy('Face and hand tracking', async () => {
  const [m, loader] = await Promise.all([import('@mediapipe/tasks-vision'), import('@mediapipe/tasks-vision/vision_wasm_internal.js?url')]);
  return { m, files: { wasmLoaderPath: loader.default, wasmBinaryPath: ML + 'vision_wasm_internal.wasm' } };
});
export const loadVision = () => lib.load();

/* one front camera stream, shared by Face and Hands */
let cam = null, users = 0;
let camAsk = null;
async function frontCamera() {
  if (cam) return cam;
  // two trackers starting at once share one request (and one stream)
  return camAsk ||= (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } }, audio: false });
      const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.srcObject = stream; await video.play();
      cam = { video, stream }; return cam;
    } finally { camAsk = null; }
  })();
}
function releaseCamera() { users = Math.max(0, users - 1); if (!users && cam) { cam.stream.getTracks().forEach(t => t.stop()); cam = null; } }
const live = new Set();
/** Stops every tracker (the app calls this when a round ends or the player leaves). */
export function stopVision() { for (const t of [...live]) t.stop(); }
register('vision', { stop: stopVision });

class Tracker {
  constructor(kind) { this.L = lib.get(); this.kind = kind; this.ready = false; this.failed = null; this.running = false; this.lastT = -1; }
  /** Starts the camera and the tracker. Safe to call again. */
  async start() {
    if (this.running) return this;
    this.running = true; live.add(this); users++;
    try {
      const [c] = await Promise.all([frontCamera(), this.task ||= this.makeTask()]);
      // stopped while the camera was being asked for: stop() already gave up our share, so close the
      // camera now that it has arrived, unless another tracker is using it
      if (!this.running) { if (!users && cam) { users = 1; releaseCamera(); } return this; }
      this.video = c.video; this.ready = true;
    } catch (e) {
      this.failed = e;
      if (this.running) { this.running = false; live.delete(this); releaseCamera(); }
      else if (!users && cam) { users = 1; releaseCamera(); }
    }
    return this;
  }
  async makeTask() {
    const { m, files } = this.L, Task = this.kind === 'face' ? m.FaceLandmarker : m.HandLandmarker;
    const opts = this.kind === 'face'
      ? { runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true }
      : { runningMode: 'VIDEO', numHands: this.max || 2 };
    const make = delegate => Task.createFromOptions(files, { baseOptions: { modelAssetPath: ML + (this.kind === 'face' ? 'face_landmarker.task' : 'hand_landmarker.task'), delegate }, ...opts });
    return this.task = await make('GPU').catch(() => make('CPU'));
  }
  stop() {
    if (!this.running) return;
    this.running = false; this.ready = false; live.delete(this); releaseCamera();
  }
  /** Looks at the newest camera frame (call every update). Returns true if there was a new frame. */
  update() {
    if (!this.ready || !this.task || !this.video || this.video.readyState < 2) return false;
    const t = this.video.currentTime; if (t === this.lastT) return false;
    this.lastT = t;
    try { this.read(this.task.detectForVideo(this.video, performance.now())); } catch { return false; }
    return true;
  }
  /** The camera picture, for drawing a mirrored preview: c.save(); c.scale(-1, 1); c.drawImage(face.video, -W, 0, W, H); c.restore(). */
  get picture() { return this.video || null; }
}

/**
 * One face. found, x, y (the nose, 0..1, mirrored), size (0..1, bigger when close), yaw (turn left
 * -1 .. right 1), pitch (down -1 .. up 1), roll (tilt, radians), mouth (0 shut .. 1 wide open),
 * smile, blink (both eyes shut), winkLeft, winkRight, brows (raised 0..1), points (478 landmarks
 * {x, y, z}), shapes (all 52 expression scores by name).
 */
export class Face extends Tracker {
  constructor() { super('face'); this.found = false; this.x = .5; this.y = .5; this.size = 0; this.yaw = 0; this.pitch = 0; this.roll = 0; this.mouth = 0; this.smile = 0; this.blink = false; this.winkLeft = false; this.winkRight = false; this.brows = 0; this.points = []; this.shapes = {}; }
  read(r) {
    const pts = r.faceLandmarks?.[0];
    this.found = !!pts; if (!pts) return;
    this.points = pts;
    const nose = pts[1], l = pts[234], rr = pts[454], top = pts[10], chin = pts[152];
    this.x = 1 - nose.x; this.y = nose.y; this.size = Math.hypot(rr.x - l.x, rr.y - l.y);
    const mid = (l.x + rr.x) / 2, w = Math.abs(rr.x - l.x) || 1;
    this.yaw = Math.max(-1, Math.min(1, -(nose.x - mid) / w * 4));
    const vm = (top.y + chin.y) / 2, h = Math.abs(chin.y - top.y) || 1;
    this.pitch = Math.max(-1, Math.min(1, -(nose.y - vm) / h * 4 + .3));
    this.roll = -Math.atan2(rr.y - l.y, rr.x - l.x);
    const s = {}; for (const c of r.faceBlendshapes?.[0]?.categories || []) s[c.categoryName] = c.score;
    this.shapes = s;
    this.mouth = Math.min(1, (s.jawOpen || 0) * 1.4);
    this.smile = ((s.mouthSmileLeft || 0) + (s.mouthSmileRight || 0)) / 2;
    const bl = s.eyeBlinkLeft || 0, br = s.eyeBlinkRight || 0;
    // the camera is mirrored, so the player's left eye is MediaPipe's right
    this.blink = bl > .5 && br > .5; this.winkLeft = br > .5 && bl < .3; this.winkRight = bl > .5 && br < .3;
    this.brows = Math.min(1, ((s.browInnerUp || 0) + (s.browOuterUpLeft || 0) + (s.browOuterUpRight || 0)) / 2);
  }
}

/**
 * Up to two hands: hands.list is [{ x, y (the palm, 0..1, mirrored), tipX, tipY (index finger tip),
 * pinch (thumb and index together), pinchX, pinchY, open (all fingers out), fist, point (only the
 * index out), side ('left' | 'right'), points (21 landmarks) }]. hands.first is list[0] or null.
 */
export class Hands extends Tracker {
  constructor({ max = 2 } = {}) { super('hands'); this.max = max; this.list = []; }
  get first() { return this.list[0] || null; }
  get found() { return this.list.length > 0; }
  read(r) {
    this.list = (r.landmarks || []).map((p, i) => {
      const d = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y), palm = d(0, 9) || .1;
      const out = f => d(0, f) > d(0, f - 2) * 1.1;   // tip further from the wrist than the middle joint
      const fingers = [8, 12, 16, 20].map(out);
      const side = r.handednesses?.[i]?.[0]?.categoryName === 'Left' ? 'right' : 'left';   // mirrored
      return {
        x: 1 - p[9].x, y: p[9].y, tipX: 1 - p[8].x, tipY: p[8].y,
        pinch: d(4, 8) < palm * .35, pinchX: 1 - (p[4].x + p[8].x) / 2, pinchY: (p[4].y + p[8].y) / 2,
        open: fingers.every(Boolean), fist: !fingers.some(Boolean), point: fingers[0] && !fingers[1] && !fingers[2] && !fingers[3],
        side, points: p,
      };
    });
  }
}
