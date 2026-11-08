# Moving the 3D to WebGPU

Game Scroll's 3D (Classic Console, Next Gen, AR) draws with three.js's WebGL renderer. Rob's plan
(2026-11-08): stay on WebGL for now, build every engine part so it can move, then add a WebGPU path
(three.js's `WebGPURenderer` and TSL node shaders) for phones that support it, check it against WebGL
on screenshots game by game, and make it the default there, with WebGL kept for older phones.

The rules for new 3D code until then:

- Use three.js's stock materials and lights (`MeshStandardMaterial`, `MeshPhysicalMaterial`,
  `MeshToonMaterial`, `LightProbe`...). The WebGPU renderer turns them into node materials itself.
- No new `onBeforeCompile` patches, and no raw `ShaderMaterial` in games (game-lint warns).
  A look the kits need goes through `lookPatch()` in `src/kit/looks.js`, so it is named and can be
  swapped for a node in one place.
- Each screen effect is its own small pass with its own settings, so it can be rewritten in TSL on
  its own and compared side by side.
- Only the kits make renderers, and pixel reads go through one place that can wait (WebGPU reads
  pixels back asynchronously).

## What is WebGL-only today (the move checklist)

| Part | Where | What it needs for WebGPU |
| --- | --- | --- |
| Outdoor air (haze, mist, cloud shadows, wet) | `src/kit/hd3d.js` `airPatch` (onBeforeCompile) | A TSL node added to each material's colour/fog |
| Final pass: bloom, ACES, grade, glare, vignette, grain, FXAA | `hd3d.js` `FinalPass` (GLSL) | Three's TSL `bloom()`, tone mapping and our grade as nodes |
| Sun shafts | `hd3d.js` `ShaftsPass` (GLSL, 3 small passes) | A TSL radial blur node |
| Ambient occlusion, reflections | three's `GTAOPass`, `SSRPass` | Three's TSL `ao()` and `ssr()` nodes |
| Upscaling | `src/kit/sgsr.js` (GLSL) | A TSL port of SGSR 1 |
| Light probe baking | `hd3d.js` `bakeLight` (`WebGLCubeRenderTarget` + `CubeCamera`) | A cube target for WebGPU; the read back is already async |
| Sky dome | `src/kit/sky.js` (ShaderMaterial) | A TSL sky (three has `SkyMesh` for WebGPU) |
| Classic Console toon shading | `src/kit/toon3d.js` (ShaderMaterial) | `MeshToonMaterial` |
| 3D text | troika-three-text (patches shaders) | Three's own text geometry or an SDF text node |
| 3D particles | three.quarks | Check its WebGPU support; else our own node particles |
| GPU points particles | `hd3d.js` `Particles` (ShaderMaterial) | A TSL points material |
| Card pictures and test reads | `toDataURL` / `readPixels` | `await renderer.readRenderTargetPixelsAsync` |
| Outdoor looks: ground, hills, rock, leaves | `src/kit/looks.js` (`lookPatch`, onBeforeCompile; listed in `material.userData.gsLooks`) | One TSL node per look name, same uniforms (`lk...`) |
| Games with their own shaders | `deep-pressure.js` | Port to kit materials or TSL |

Parts that already move without work: PixiJS (2D effects and sprites) supports WebGPU, so
`look2d` only needs its `preference` changed; decals (`DecalGeometry`) and light probes (`LightProbe`)
are stock three.js.
