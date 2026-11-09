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
| Outdoor air (haze, mist, cloud shadows, wet) | `hd3d.js` `airPatch`, now the named look effect `'air'` via `src/kit/looks.js` `lookPatch` | A TSL node added to each material's colour/fog (`lookEffects()` lists every patch to port) |
| Final pass: bloom, ACES, grade, glare, vignette, grain, FXAA | `hd3d.js` `FinalPass`, split into `FINAL_EFFECTS` (one named GLSL piece each) | One TSL node per piece; three's `bloom()` and tone mapping |
| Sun shafts | `hd3d.js` `ShaftsPass` (GLSL, 3 small passes) | A TSL radial blur node |
| Ambient occlusion, reflections | three's `GTAOPass`, `SSRPass` | Three's TSL `ao()` and `ssr()` nodes |
| Upscaling | `src/kit/sgsr.js` (GLSL) | A TSL port of SGSR 1 |
| Light probe baking | `hd3d.js` `bakeLight` (`WebGLCubeRenderTarget` + `CubeCamera`) | A cube target for WebGPU; the read back is already async |
| Sky dome | `src/kit/sky.js` (ShaderMaterial) | A TSL sky (three has `SkyMesh` for WebGPU) |
| Classic Console ink lines | `src/kit/toon3d.js` ink pass (ShaderMaterial edge detect on normals + depth). The toon shading itself is already stock `MeshToonMaterial` | A TSL edge-detect pass |
| 3D text | troika-three-text (patches shaders) | Three's own text geometry or an SDF text node |
| 3D particles | three.quarks 0.17 (needs three ≥ 0.182, works on 0.186) | Check its WebGPU support; else our own node particles |
| GPU points particles | `hd3d.js` `Particles` (ShaderMaterial) | A TSL points material |
| Card pictures and test reads | `src/kit/gpu.js` `copyFrame` and `readPixels` (already async) | Nothing more: `readPixels` uses `readRenderTargetPixelsAsync` |
| Outdoor looks: ground, hills, rock, leaves | `src/kit/looks.js` `looks.*` (effects 'ground', 'hills', 'rock', 'leaves' through `lookPatch`) | One TSL node per effect, same `lk...` uniforms |
| Games with their own shaders | `deep-pressure.js` | Port to kit materials or TSL |

## Already done (prep PR)

- **One renderer maker**: `src/kit/gpu.js` `makeRenderer()` makes every 3D renderer (toon3d, hd3d, AR),
  and `backend(r)`, `gpuName()`, `hasWebGPU()` live there. The WebGPU path only changes this file first.
- **Named look effects**: `src/kit/looks.js` `lookPatch(material, name, spec)` is the only way kits
  change a stock material's shader; `lookEffects()` lists them for porting and tests.
- **Final pass in pieces**: `FINAL_EFFECTS` in `hd3d.js` (head, main, smooth, bloom, grade, glare,
  tone, vignette, grain, hurt, out), joined into the same shader as before.
- **three.js 0.186.1** (from 0.180; `PCFSoftShadowMap` became `PCFShadowMap`), three.quarks 0.17.1.
  troika, InstancedMesh2, three-pinata and three.terrain.js work unchanged.
- **game-lint warns** on `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `ShaderChunk` and
  `ShaderLib` in games (a warning, not a failure).
- **Look compare**: `node scripts/look-compare.cjs save <dir>` takes fixed Next Gen (every tier) and
  Console shots; `check <dir>` compares against them and writes `.new.png` for anything that moved.
  This is the tool for checking the WebGPU path against WebGL.

Parts that already move without work: PixiJS (2D effects and sprites) supports WebGPU, so
`look2d` only needs its `preference` changed; decals (`DecalGeometry`) and light probes (`LightProbe`)
are stock three.js.
