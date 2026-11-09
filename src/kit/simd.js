// Does this phone's WebAssembly have SIMD (one instruction working on four numbers at once)? On
// phones it turns into ARM Neon, so physics runs noticeably faster. Nearly every phone from the last
// few years has it (Safari 16.4+, Chrome 91+); older ones get the plain build. Checked once by
// compiling a tiny module that uses a SIMD instruction (the check from wasm-feature-detect).
const PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
let has = null;
/** True when WebAssembly SIMD works here. `?nosimd` in the URL (dev and tests) says no. */
export function wasmSimd() {
  if (has !== null) return has;
  try { if (typeof location !== 'undefined' && /[?&]nosimd\b/.test(location.search)) return (has = false); } catch (_) {}
  try { has = typeof WebAssembly === 'object' && WebAssembly.validate(PROBE); } catch (_) { has = false; }
  return has;
}
/** For tests: forget the answer, or set one. */
export function setWasmSimd(v = null) { has = v; }
