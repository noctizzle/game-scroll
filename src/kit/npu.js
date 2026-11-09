// The phone's AI chip (the NPU) for gs.vision and gs.hear, through Game Scroll's NPU plugin
// (plugins/npu): ONNX Runtime with Qualcomm's NPU on Snapdragon phones and Core ML (the Neural Engine)
// on iPhones, the CPU anywhere else. The plugin reads the camera and the mic itself, so pictures and
// sound never pass through the web view: only crops' results come back (landmarks, scores).
// On the web, or if anything here fails, gs.vision and gs.hear use MediaPipe in the web view as before.
// Kit use only.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { NPU_VERSION, NPU_FILES } from './npu-files.js';

const BASE = String((import.meta.env && import.meta.env.VITE_GAMES_URL) || '').replace(/\/+$/, '');
const DIR = BASE ? `${BASE}/ml/${NPU_VERSION}/` : `ml/${NPU_VERSION}/`;   // no games host (dev, tests): files inside the app
const plugin = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NPU') ? registerPlugin('NPU') : null;
const off = () => { try { return globalThis.localStorage?.getItem('gs.npu') === 'off'; } catch { return false; } };   // a switch for testing

/* base64 of little-endian float32s, both ways */
function toF32(b64) {
  const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Float32Array(u.buffer);
}
function fromF32(a) {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

let info = null;
/** Resolves to { available, backend ('qnn' | 'coreml' | 'cpu'), chip } once (available false off the phone apps). */
export function npuInfo() {
  return info ||= (async () => {
    if (!plugin || off()) return { available: false };
    try { const r = await plugin.available(); return { available: !!r.available, backend: r.backend, chip: r.chip || '' }; } catch { return { available: false }; }
  })();
}

const loaded = new Map();
/** Loads a model by name (face-detect, face-mesh, face-shapes, palm-detect, hand-mesh, yamnet); the plugin keeps it after. */
export function loadModel(name) {
  if (!loaded.has(name)) {
    const p = plugin.loadModel({ name, version: NPU_VERSION, url: new URL(DIR + name + '.onnx', location.href).href, sha256: NPU_FILES[name + '.onnx'] }).then(r => { if (!r.loaded) throw new Error(r.reason || 'did not load'); return r; });
    p.catch(() => loaded.delete(name));
    loaded.set(name, p);
  }
  return loaded.get(name);
}

/* ---------- the camera, shared by every tracker ---------- */
let camUsers = 0, camStart = null;
/** Starts the native front camera (shared); resolves to { w, h } of its upright pictures. */
export async function npuCamera() {
  camUsers++;
  try { return await (camStart ||= plugin.cameraStart({ facing: 'user', width: 640, height: 480 }).then(r => { if (!r.started) throw new Error(r.reason || 'no camera'); return r; })); }
  catch (e) { camUsers--; camStart = null; throw e; }
}
export function npuCameraDone() { camUsers = Math.max(0, camUsers - 1); if (!camUsers && camStart) { camStart = null; plugin.cameraStop().catch(() => {}); } }

/**
 * The engine vision-npu.js runs its models with: frame() holds the newest camera picture and gives
 * { id, w, h } (null if there's none newer than `after`); image() crops that picture through a rect
 * into a model; tensor() runs a model on numbers.
 */
export const engine = {
  async frame(after = -1) { const r = await plugin.frame({ after }); return r.id > after ? r : null; },
  async image(model, f, rect, size, [lo, hi]) {
    const r = await plugin.runImage({ model, frame: f.id, rect: { cx: rect.cx, cy: rect.cy, w: rect.w, h: rect.h, a: rect.a }, size, lo, hi });
    return r.outputs.map(toF32);
  },
  async tensor(model, data) { const r = await plugin.runTensor({ model, data: fromF32(data) }); return r.outputs.map(toF32); },
};

/* ---------- the mic ---------- */
/** Starts the native mic for YAMNet (16 kHz mono); resolves true if it's listening. */
export async function npuMic() { try { return !!(await plugin.micStart({ rate: 16000 })).started; } catch { return false; } }
export function npuMicDone() { plugin?.micStop().catch(() => {}); }
/** YAMNet on the last 0.975 s the mic heard: 521 scores (names from yamnetLabels()). */
export async function npuListen() { const r = await plugin.runMic({ model: 'yamnet', samples: 15600 }); return r.outputs.map(toF32)[0]; }
let labels = null;
export const yamnetLabels = () => labels ||= fetch(DIR + 'yamnet-labels.txt').then(r => r.text()).then(t => t.trim().split('\n'));

export { toF32, fromF32 };
