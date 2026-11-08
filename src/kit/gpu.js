// One place that makes the app's 3D renderers and talks to the graphics chip. Classic Console
// (toon3d.js), Next Gen and AR (hd3d.js) and the speed check (speed.js) all come here, so the move
// to WebGPU (docs/webgpu-move.md) changes this file instead of every kit. Today every renderer is
// three.js's WebGLRenderer; backend() says which one a renderer is.
// Not for games: they get 3D through gs.toon, gs.hd and gs.ar.
import { WebGLRenderer } from 'three';

/** Makes a three.js renderer on a new canvas (options as WebGLRenderer's), or throws if this device can't. */
export function makeRenderer(o = {}) {
  const canvas = o.canvas || document.createElement('canvas');
  const r = new WebGLRenderer({ powerPreference: 'high-performance', ...o, canvas });
  r.gsBackend = 'webgl';
  // keep the page alive if the phone takes the graphics context away (the kits make it again)
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  return r;
}

/** 'webgl' (or 'webgpu' once that path exists) for a renderer from makeRenderer. */
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

let webgpu = null;
/** Resolves true if this device offers WebGPU (asked once). Nothing uses WebGPU yet. */
export function hasWebGPU() {
  return webgpu ||= (async () => {
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
