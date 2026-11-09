// One place that talks to the graphics chip: its name, whether it has WebGPU, the shared WebGPU
// renderer, and frame copies and pixel reads that work on both. Classic Console (toon3d.js), Next Gen and
// AR (hd3d.js) and the speed check (speed.js) all come here, so the move to WebGPU (docs/webgpu-move.md)
// changes this file instead of every kit. On any device that offers WebGPU, prepareGPU() makes the one
// WebGPURenderer that Next Gen and AR views draw with when everything in them has a WebGPU version
// (hd3d.js); renderer.js makes the WebGL ones, used everywhere else.
// No three.js here (the app loads it only with the first 3D game): three's WebGPU build is a dynamic import.
// Not for games: they get 3D through gs.toon, gs.hd and gs.ar.

/** 'webgl' or 'webgpu' for a renderer from makeRenderer or webgpu(). */
export const backend = r => r?.gsBackend || 'webgl';

let chip = null;
/** The graphics chip's name, read once from a throwaway context ('' if unknown). */
export function gpuName() {
  if (chip != null) return chip;
  chip = '';
  try {
    const cv = document.createElement('canvas'), g = cv.getContext('webgl2') || cv.getContext('webgl');
    if (g) {
      const e = g.getExtension('WEBGL_debug_renderer_info');
      chip = String((e && g.getParameter(e.UNMASKED_RENDERER_WEBGL)) || g.getParameter(g.RENDERER) || '');
      g.getExtension('WEBGL_lose_context')?.loseContext();   // give the context straight back
    }
  } catch (_) { /* no WebGL: stays '' */ }
  return chip;
}

let gpuAsked = null;
/** Resolves true if this device offers WebGPU (asked once). */
export function hasWebGPU() {
  return gpuAsked ||= (async () => {
    try { return !!(globalThis.navigator?.gpu && await navigator.gpu.requestAdapter()); } catch (_) { return false; }
  })();
}

/**
 * Copies the renderer's last frame into a 2D canvas: drawImage(renderer canvas, sx, sy, sw, sh, dx, dy,
 * dw, dh). Call it straight after rendering, in the same task: neither WebGL (without
 * preserveDrawingBuffer) nor WebGPU keeps the picture after that.
 */
export function copyFrame(r, c, sx, sy, sw, sh, dx, dy, dw, dh) {
  c.drawImage(r.domElement, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Reads pixels from a render target. Always a promise, as it is on WebGPU; on WebGL it uses three's
 * async read where there is one (no stall), else the plain read.
 */
export function readPixels(r, target, x, y, w, h, buf = new Uint8Array(w * h * 4)) {
  if (r.readRenderTargetPixelsAsync) return r.readRenderTargetPixelsAsync(target, x, y, w, h, buf).then(() => buf);
  r.readRenderTargetPixels(target, x, y, w, h, buf);
  return Promise.resolve(buf);
}

/* ---------- WebGPU: always, where the device has it ---------- */
// Rob (2026-11-09): no setting; 3D games use WebGPU whenever the device supports it and WebGL otherwise.
// setGpuPick stays for tests and the look-compare / gpu-games scripts (they draw each backend in turn);
// it isn't saved.
let pick = 'webgpu';
/** 'webgpu' (the default: used where the device has it) or 'webgl' (tests only). */
export const gpuPick = () => pick;
/** Tests only: draw with WebGL ('webgl') or WebGPU where there is one ('webgpu'). */
export function setGpuPick(v) { pick = v === 'webgl' ? 'webgl' : 'webgpu'; if (pick === 'webgpu') prepareGPU(); }

let gpu = null, gpuLoad = null;
/**
 * Gets WebGPU ready if the device has it: loads three's WebGPU build and the
 * Next Gen WebGPU effects (hd3d-gpu.js), and makes the shared WebGPURenderer. Never rejects; resolves
 * to the same thing webgpu() returns. The app calls it while loading the 3D parts.
 */
export function prepareGPU() {
  if (pick !== 'webgpu') return Promise.resolve(null);
  return gpuLoad ||= (async () => {
    try {
      if (!await hasWebGPU()) { console.warn('WebGPU: no adapter'); return null; }
      const [W, fx] = await Promise.all([import('three/webgpu'), import('./hd3d-gpu.js')]);
      const canvas = document.createElement('canvas');
      const r = new W.WebGPURenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
      await r.init();
      if (!r.backend?.isWebGPUBackend) { console.warn('WebGPU: three fell back to WebGL 2'); r.dispose(); return null; }   // three fell back to WebGL 2: keep our own WebGL path
      r.gsBackend = 'webgpu';
      r.backend.device?.lost?.then(() => { if (gpu?.r === r) gpu = null; gpuLoad = null; });   // the GPU went away: back to WebGL
      return gpu = { r, W, fx };
    } catch (e) { console.warn('WebGPU did not start:', e); gpuLoad = null; return null; }
  })();
}
/** The ready WebGPU setup { r (WebGPURenderer), W (three/webgpu), fx (hd3d-gpu.js) }, or null (not supported, not ready, or WebGL forced for a test). */
export const webgpu = () => pick === 'webgpu' ? gpu : null;

/* ---------- compute only (no drawing): gs.ai Swarm and other number crunching ---------- */
let compute = null;
/**
 * A WebGPU device for compute shaders, or null where there's no WebGPU. Shares the 3D renderer's
 * device when WebGPU drawing is already running, else asks for its own (once). Never rejects. Callers keep a CPU
 * version for when this is null or the device is lost.
 */
export function computeDevice() {
  return compute ||= (async () => {
    try {
      const shared = webgpu()?.r?.backend?.device;   // already made for 3D: share it (never load three for this)
      if (shared) return shared;
      if (!await hasWebGPU()) return null;
      const a = await navigator.gpu.requestAdapter(), d = a && await a.requestDevice();
      if (!d) return null;
      d.lost?.then(() => { compute = null; });
      return d;
    } catch (_) { compute = null; return null; }
  })();
}
