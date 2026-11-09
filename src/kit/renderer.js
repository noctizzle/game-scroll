// Makes the app's WebGL renderers (Classic Console, Next Gen and AR), in one place so the WebGPU move
// (docs/webgpu-move.md) changes one file. The WebGPU renderer is gpu.js prepareGPU(). Kit use only.
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
