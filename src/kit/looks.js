// Named look effects for three.js materials: the one way kits change a stock material's shader
// (outdoor air, ground layers, leaf sway...). Kept apart and named so that, when the 3D moves to
// WebGPU (docs/webgpu-move.md), each effect can be rewritten as a TSL node on its own and checked
// against the WebGL one, instead of hunting for shader patches spread through the kits.
//
//   lookPatch(material, 'air', {
//     uniforms: AIR,                                     // shared { name: { value } } objects
//     vertex: [['#include <fog_vertex>', 'after', '  gsW = ...;']],
//     fragment: [['void main() {', 'before', GLSL_FUNCTIONS], ['#include <fog_fragment>', 'replace', code]],
//     vertexHead: 'varying vec3 gsW;\n',                 // put before everything
//   });
//
// Edits are [anchor, 'before' | 'after' | 'replace', code], where code can be a function (anchor) =>
// string. A missing anchor skips that edit; check(shader) => false skips the whole effect (a
// material without fog, say).
// Each material records its effects in material.userData.gsLooks, and three's program cache key gets
// '|gs<name>' per effect so patched and plain materials never share a program. Kit use only.

const EFFECTS = new Map();   // name -> spec, for the WebGPU port and for tests

/** The named effects kits have registered (name -> spec). */
export const lookEffects = () => EFFECTS;

/** The effect names on a material. */
export const looksOf = m => m?.userData?.gsLooks || [];

function apply(src, edits) {
  for (const [at, how, code] of edits) {
    if (!src.includes(at)) continue;
    const c = typeof code === 'function' ? code(at) : code;
    src = src.replace(at, how === 'before' ? c + at : how === 'after' ? at + c : c);
  }
  return src;
}

/** Adds a named effect to a material (once). Returns true if it was added now. */
export function lookPatch(m, name, spec) {
  if (!m) return false;
  const names = m.userData.gsLooks ||= [];
  if (names.includes(name)) return false;
  EFFECTS.set(name, spec);
  names.push(name);
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    base.call(this, sh, r);
    if (spec.check && !spec.check(sh)) return;
    const v = apply(sh.vertexShader, spec.vertex || []), f = apply(sh.fragmentShader, spec.fragment || []);
    if (spec.uniforms) Object.assign(sh.uniforms, spec.uniforms);
    sh.vertexShader = (spec.vertexHead || '') + v;
    sh.fragmentShader = (spec.fragmentHead || '') + f;
  };
  // three caches programs by this key; the default key is the source of onBeforeCompile, so ask the
  // material's own key with its own onBeforeCompile in place
  m.customProgramCacheKey = function () { const cur = this.onBeforeCompile; this.onBeforeCompile = base; try { return baseKey.call(this) + '|gs' + name; } finally { this.onBeforeCompile = cur; } };
  m.needsUpdate = true;
  return true;
}
