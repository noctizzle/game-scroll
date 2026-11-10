// Face, hand and body tracking with the front camera, from Google's MediaPipe (Apache-2.0). Games
// played with your face (lean to steer, open your mouth to eat, blink to jump), your hands (pinch to
// grab, point to aim, show a palm to stop), your whole body (Body: dance, dodge, squat, jump, arms
// up), you cut out of the camera picture and put inside the game (CutOut), or hand signs (Signs:
// thumbs up, victory, open palm...). Body, CutOut and Signs run in the web view (MediaPipe on the
// graphics chip); Face and Hands use the phone's AI chip in the apps.
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
// Everything runs on the phone: no picture ever leaves it. In the phone apps it runs on the phone's AI
// chip (npu.js: Qualcomm's NPU, Apple's Neural Engine, else the CPU) with the camera read natively;
// on the web, or if that can't start, MediaPipe runs in the web view. The model files (about 4 MB for
// faces, 8 MB for hands, plus a 14 MB engine on the web) download from our games server the first
// time a face or hands game is played, then stay cached.

import { lazy } from './lazy.js';
import { register } from './cleanup.js';
import { ML_VERSION } from './vision-files.js';
import { npuInfo, loadModel, npuCamera, npuCameraDone, engine } from './npu.js';
import { FacePipe, HandPipe } from './vision-npu.js';

const BASE = String((import.meta.env && import.meta.env.VITE_GAMES_URL) || '').replace(/\/+$/, '');
const ML = BASE ? `${BASE}/ml/${ML_VERSION}/` : `ml/${ML_VERSION}/`;   // no games server (dev, tests): served with the app (npm run ml)
const mediapipe = async () => {
  const [m, loader] = await Promise.all([import('@mediapipe/tasks-vision'), import('@mediapipe/tasks-vision/vision_wasm_internal.js?url')]);
  return { m, files: { wasmLoaderPath: loader.default, wasmBinaryPath: ML + 'vision_wasm_internal.wasm' } };
};
// on a phone with the NPU plugin the web engine isn't needed (it loads later only if the plugin fails)
const lib = lazy('Face and hand tracking', async () => (await npuInfo()).available ? { native: true } : mediapipe());
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

// what each kind runs on the web: the MediaPipe task, its model file (vision-files.js) and options
const TASKS = {
  face: { task: 'FaceLandmarker', file: 'face_landmarker.task', opts: () => ({ runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true }) },
  hands: { task: 'HandLandmarker', file: 'hand_landmarker.task', opts: t => ({ runningMode: 'VIDEO', numHands: t.max || 2 }) },
  body: { task: 'PoseLandmarker', file: 'pose_landmarker_lite.task', opts: t => ({ runningMode: 'VIDEO', numPoses: t.max || 1 }) },
  cutout: { task: 'ImageSegmenter', file: 'selfie_segmenter.tflite', opts: () => ({ runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false }) },
  signs: { task: 'GestureRecognizer', file: 'gesture_recognizer.task', opts: t => ({ runningMode: 'VIDEO', numHands: t.max || 2 }) },
};

class Tracker {
  constructor(kind) { this.L = lib.get(); this.kind = kind; this.ready = false; this.failed = null; this.running = false; this.lastT = -1; }
  /** Starts the camera and the tracker. Safe to call again. */
  async start() {
    if (this.running) return this;
    this.running = true; live.add(this);
    if (this.L.native && !this.noNative && !this.preview && (this.kind === 'face' || this.kind === 'hands')) {
      try { await this.startNative(); return this; }
      catch (e) { console.warn('NPU vision did not start, using the web one:', e); this.noNative = true; }
      if (!this.running) return this;
    }
    users++; this.web = true;   // our share of the web camera
    try {
      const [c] = await Promise.all([frontCamera(), this.task ||= this.makeTask()]);
      // stopped while the camera was being asked for: stop() already gave up our share, so close the
      // camera now that it has arrived, unless another tracker is using it
      if (!this.running) { if (!users && cam) { users = 1; releaseCamera(); } return this; }
      this.video = c.video; this.ready = true;
    } catch (e) {
      this.failed = e;
      if (this.running) { this.running = false; live.delete(this); this.web = false; releaseCamera(); }
      else if (!users && cam) { users = 1; releaseCamera(); }
    }
    return this;
  }
  // the phone's AI chip: the plugin reads the camera, vision-npu.js finds and follows the face or hands
  async startNative() {
    const models = this.kind === 'face' ? ['face-detect', 'face-mesh', 'face-shapes'] : ['palm-detect', 'hand-mesh'];
    await Promise.all(models.map(loadModel));
    if (!this.running) return;
    await npuCamera();
    if (!this.running) { npuCameraDone(); return; }
    this.native = { pipe: this.kind === 'face' ? new FacePipe(engine) : new HandPipe(engine, { max: this.max || 2 }), last: -1, busy: false, fresh: null };
    this.backend = 'npu'; this.ready = true;
  }
  async makeTask() {
    if (this.L.native) this.L = await mediapipe();
    const { m, files } = this.L, k = TASKS[this.kind], Task = m[k.task];
    const make = delegate => Task.createFromOptions(files, { baseOptions: { modelAssetPath: ML + k.file, delegate }, ...k.opts(this) });
    return this.task = await make('GPU').catch(() => make('CPU'));
  }
  stop() {
    if (!this.running) return;
    this.running = false; this.ready = false; live.delete(this);
    if (this.native) { this.native = null; npuCameraDone(); }
    if (this.web) { this.web = false; releaseCamera(); }
  }
  /** Looks at the newest camera frame (call every update). Returns true if there was a new frame. */
  update() {
    const n = this.native;
    if (n) {
      // one look at a time, each on the newest picture; the result arrives on a later update
      if (!n.busy) {
        n.busy = true;
        engine.frame(n.last).then(f => f && (n.last = f.id, n.pipe.track(f))).then(r => { if (r && this.native === n) n.fresh = r; })
          .catch(() => {}).finally(() => { n.busy = false; });
      }
      if (!n.fresh) return false;
      this.read(n.fresh); n.fresh = null; return true;
    }
    if (!this.ready || !this.task || !this.video || this.video.readyState < 2) return false;
    const t = this.video.currentTime; if (t === this.lastT) return false;
    this.lastT = t;
    try { this.look(this.task, this.video, performance.now()); } catch { return false; }
    return true;
  }
  look(task, video, ms) { this.read(task.recognizeForVideo ? task.recognizeForVideo(video, ms) : task.detectForVideo(video, ms)); }
  /** The camera picture, for drawing a mirrored preview: c.save(); c.scale(-1, 1); c.drawImage(face.video, -W, 0, W, H); c.restore().
   *  Made with { preview: true } only: on the AI chip the camera never enters the web view, so it is null. */
  get picture() { return this.video || null; }
}

/**
 * One face. found, x, y (the nose, 0..1, mirrored), size (0..1, bigger when close), yaw (turn left
 * -1 .. right 1), pitch (down -1 .. up 1), roll (tilt, radians), mouth (0 shut .. 1 wide open),
 * smile, blink (both eyes shut), winkLeft, winkRight, brows (raised 0..1), points (478 landmarks
 * {x, y, z}), shapes (all 52 expression scores by name).
 */
export class Face extends Tracker {
  /** preview: true if the game draws the camera picture (face.picture): it runs in the web view then, as the AI chip never shows the picture. */
  constructor({ preview = false } = {}) { super('face'); this.preview = preview; this.found = false; this.x = .5; this.y = .5; this.size = 0; this.yaw = 0; this.pitch = 0; this.roll = 0; this.mouth = 0; this.smile = 0; this.blink = false; this.winkLeft = false; this.winkRight = false; this.brows = 0; this.points = []; this.shapes = {}; }
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
  constructor({ max = 2, preview = false } = {}) { super('hands'); this.max = max; this.preview = preview; this.list = []; }
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

/* ---------- whole body ---------- */

// MediaPipe's 33 body points, by the player's own left and right (the picture is mirrored, so the
// player's left hand is on the left of the screen, like a mirror)
const JOINTS = { nose: 0, leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftHand: 15, rightHand: 16,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftFoot: 27, rightFoot: 28 };
const knee = (a, b, c) => {   // the angle at b, degrees (180 = straight leg)
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)))) * 180 / Math.PI;
};

/**
 * The player's whole body (stand back so the camera sees you). found; x, y (the middle of the hips,
 * 0..1, mirrored); joints by name ({ x, y, seen 0..1 }: nose, leftShoulder, rightShoulder,
 * leftElbow, rightElbow, leftHand, rightHand, leftHip, rightHip, leftKnee, rightKnee, leftFoot,
 * rightFoot); and moves: armsUp, leftUp, rightUp (a hand above the head), lean (-1 left .. 1 right),
 * squat (0 standing .. 1 deep), jump (true on the update a jump starts), clap (hands meet, true once),
 * points (all 33). people: every body when made with { max: 2 } or more.
 */
export class Body extends Tracker {
  constructor({ max = 1, preview = false } = {}) {
    super('body'); this.max = max; this.preview = preview; this.noNative = true;
    this.found = false; this.x = .5; this.y = .5; this.joints = {}; this.points = []; this.people = [];
    this.armsUp = false; this.leftUp = false; this.rightUp = false; this.lean = 0; this.squat = 0; this.jump = false; this.clap = false;
    this.base = null; this.vy = 0; this.lastY = null; this.wasClap = false; this.inAir = false;
  }
  read(r) {
    const all = r.landmarks || [];
    this.people = all.map(p => named(p, r));
    const p = all[0]; this.found = !!p; this.jump = false; this.clap = false;
    if (!p) { this.lastY = null; return; }
    const j = this.joints = this.people[0]; this.points = p;
    const hip = { x: (j.leftHip.x + j.rightHip.x) / 2, y: (j.leftHip.y + j.rightHip.y) / 2 };
    this.x = hip.x; this.y = hip.y;
    const head = j.nose.y, shoulderW = Math.abs(j.leftShoulder.x - j.rightShoulder.x) || .1;
    this.leftUp = j.leftHand.seen > .5 && j.leftHand.y < head; this.rightUp = j.rightHand.seen > .5 && j.rightHand.y < head;
    this.armsUp = this.leftUp && this.rightUp;
    const sx = (j.leftShoulder.x + j.rightShoulder.x) / 2;
    this.lean = Math.max(-1, Math.min(1, (sx - hip.x) / shoulderW * 2));
    const legs = [['leftHip', 'leftKnee', 'leftFoot'], ['rightHip', 'rightKnee', 'rightFoot']].filter(l => l.every(n => j[n].seen > .4));
    if (legs.length) this.squat = Math.max(0, Math.min(1, (170 - legs.reduce((a, l) => a + knee(j[l[0]], j[l[1]], j[l[2]]), 0) / legs.length) / 80));
    // a jump: the hips rise fast and well above where they rest
    const now = performance.now();
    if (this.lastY != null) { const dt = Math.max(.016, (now - this.lastT) / 1000); this.vy = (hip.y - this.lastY) / dt; }
    this.lastY = hip.y; this.lastT = now;
    if (this.base == null) this.base = hip.y;
    if (!this.inAir) this.base += (hip.y - this.base) * .1;
    const up = this.base - hip.y, torso = Math.abs(hip.y - (j.leftShoulder.y + j.rightShoulder.y) / 2) || .2;
    if (!this.inAir && up > torso * .18 && this.vy < -torso * 1.5) { this.inAir = true; this.jump = true; }
    else if (this.inAir && up < torso * .06) this.inAir = false;
    const together = Math.hypot(j.leftHand.x - j.rightHand.x, j.leftHand.y - j.rightHand.y) < shoulderW * .35 && j.leftHand.seen > .5 && j.rightHand.seen > .5;
    this.clap = together && !this.wasClap; this.wasClap = together;
  }
}
function named(p) {
  const out = {};
  for (const [n, i] of Object.entries(JOINTS)) {
    const q = p[i] || { x: .5, y: .5, visibility: 0 };
    out[n] = { x: 1 - q.x, y: q.y, seen: q.visibility ?? 1 };
  }
  // MediaPipe names body sides from the person's view, as we do, so they stay as they are
  return out;
}

/* ---------- the player cut out of the camera picture ---------- */

/**
 * The player cut out of the camera: cut.picture is a canvas of the camera picture with everything
 * but the person see-through (mirrored like a selfie), ready for c.drawImage(cut.picture, x, y, w, h)
 * inside your game. found: someone is there; amount: how much of the picture is the person (0..1).
 * soft (0..1): how soft the edge is. Runs in the web view.
 */
export class CutOut extends Tracker {
  constructor({ soft = .5, size = 256 } = {}) {
    super('cutout'); this.noNative = true; this.preview = true; this.soft = soft;
    this.found = false; this.amount = 0;
    this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d');
    this.maskCanvas = document.createElement('canvas'); this.maskCtx = this.maskCanvas.getContext('2d');
    this.size = size;
  }
  get picture() { return this.found ? this.canvas : null; }
  look(task, video, ms) {
    task.segmentForVideo(video, ms, res => {
      const m = res.confidenceMasks?.[0]; if (!m) { this.found = false; return; }
      const w = m.width, h = m.height, conf = m.getAsFloat32Array();
      if (this.maskCanvas.width !== w || this.maskCanvas.height !== h) { this.maskCanvas.width = w; this.maskCanvas.height = h; this.img = this.maskCtx.createImageData(w, h); }
      const d = this.img.data, lo = .5 - this.soft * .4, span = Math.max(.02, this.soft * .8); let sum = 0;
      for (let i = 0; i < conf.length; i++) { const a = Math.max(0, Math.min(1, (conf[i] - lo) / span)); sum += a; d[i * 4 + 3] = a * 255; }
      this.maskCtx.putImageData(this.img, 0, 0);
      this.amount = sum / conf.length; this.found = this.amount > .02;
      const vw = video.videoWidth || w, vh = video.videoHeight || h, s = Math.min(1, this.size / Math.max(vw, vh)) * 2;
      const cw = Math.round(vw * s), ch = Math.round(vh * s);
      if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
      const c = this.ctx; c.save(); c.clearRect(0, 0, cw, ch); c.translate(cw, 0); c.scale(-1, 1);
      c.drawImage(video, 0, 0, cw, ch); c.globalCompositeOperation = 'destination-in'; c.drawImage(this.maskCanvas, 0, 0, cw, ch); c.restore();
    });
  }
}

/* ---------- hand signs ---------- */

const SIGN = { Thumb_Up: 'thumbs-up', Thumb_Down: 'thumbs-down', Victory: 'victory', Open_Palm: 'open-palm', Closed_Fist: 'fist', Pointing_Up: 'point-up', ILoveYou: 'love', None: 'none' };
/**
 * Hand signs: signs.list is [{ sign, score, side, x, y }] with sign one of 'thumbs-up',
 * 'thumbs-down', 'victory', 'open-palm', 'fist', 'point-up', 'love', 'none'. signs.sign is the first
 * hand's sign; signs.showing(name) is true while any hand makes it; signs.made is the sign that
 * just started this update (or null), for one-shot actions. Runs in the web view.
 */
export class Signs extends Tracker {
  constructor({ max = 2, sure = .6 } = {}) { super('signs'); this.max = max; this.noNative = true; this.sure = sure; this.list = []; this.sign = 'none'; this.made = null; this.held = 0; }
  get found() { return this.list.length > 0; }
  showing(name) { return this.list.some(h => h.sign === name); }
  read(r) {
    this.list = (r.gestures || []).map((g, i) => {
      const top = g[0] || { categoryName: 'None', score: 0 }, p = r.landmarks?.[i] || [];
      return { sign: top.score >= this.sure ? SIGN[top.categoryName] || 'none' : 'none', score: top.score,
        side: r.handedness?.[i]?.[0]?.categoryName === 'Left' ? 'right' : 'left', x: p[9] ? 1 - p[9].x : .5, y: p[9] ? p[9].y : .5 };
    });
    const s = this.list[0]?.sign || 'none';
    // a sign counts once it has held for two looks in a row (one blurry frame isn't a sign)
    this.held = s === this.pending ? this.held + 1 : 1; this.pending = s;
    this.made = null;
    if (this.held === 2 && s !== this.sign) { this.sign = s; if (s !== 'none') this.made = s; }
  }
}
