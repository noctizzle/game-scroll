# Moving the 3D to WebGPU

Game Scroll's 3D (Classic Console, Next Gen, AR) draws with three.js's WebGL renderer. Rob's plan
(2026-11-08): build every engine part so it can move, then a WebGPU path (three.js's `WebGPURenderer`
and TSL node shaders) for top phones that support it, checked against WebGL game by game, then the
default where it's supported, with WebGL kept for older phones.

**Where it is now (stage 1):** Settings › Graphics (test) has a "Use WebGPU for 3D games" switch, shown
on top-end phones that offer WebGPU (off by default). With it on, Next Gen and AR views draw on WebGPU
whenever everything in the view has a WebGPU version, and quietly stay on WebGL otherwise (checked every
frame, so a game that adds an unported effect mid-round moves back before it draws). Classic Console
stays on WebGL for now.

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

## How the WebGPU path works

- `src/kit/gpu.js` (no three.js): the player's pick (`gpuPick`, `setGpuPick`), `hasWebGPU()`, and
  `prepareGPU()`, which loads three's WebGPU build and `hd3d-gpu.js` and makes the one shared
  `WebGPURenderer` (the app calls it while loading the 3D parts). If three falls back to its WebGL 2
  backend, or the GPU is lost, we use our own WebGL path instead.
- `src/kit/hd3d-gpu.js`: the Next Gen look as TSL nodes, piece for piece with `FINAL_EFFECTS` (bloom as
  the same small mip chain, grade, glare, ACES and sRGB, FXAA or lens fringe, vignette, grain on the same
  pixel rows, hurt), three's GTAO plus its denoise for AO, the outdoor air (haze and valley mist) as the
  scene's fog node, GPU particles as instanced sprites reading the same arrays, and contact shadows.
  Shadows redraw every frame on WebGPU (no "only when something moved" yet).
- `src/kit/hd3d.js`: `gpuFits(view)` says what (if anything) keeps a view on WebGL; `HD.info.backend`
  and `HD.info.webgl` (the reason) show it in tests.
- Checks: `node scripts/look-compare.cjs save base` then `check base --webgpu` compares fixed scenes
  (Next Gen at every tier, a dark room with lamps, a headlight and contact shadows) between the two;
  they are within 1.5/255. `npm run build:bundled && node scripts/gpu-games.cjs [--tier n] [--shots dir]`
  plays every Next Gen and AR game on both and reports which draw on WebGPU, any errors, and how
  different the first seconds of play look (a guide: each game's own randomness moves things too). Both
  use SwiftShader's Vulkan driver, so they run without a GPU.

## What still keeps a view on WebGL (the move checklist)

| Part | Where | What it needs for WebGPU |
| --- | --- | --- |
| Cloud shadows and rain on the air | `hd3d.js` `airPatch` (the `'air'` look's light and roughness edits) | TSL nodes on the lit materials' light and roughness |
| Sun shafts | `hd3d.js` `ShaftsPass` | A TSL radial blur (three has `radialBlur`, `godrays`) |
| Reflections | three's `SSRPass` | Three's TSL `ssr()` node |
| Upscaling | `src/kit/sgsr.js` (SGSR 1) and `src/kit/sgsr2.js` (SGSR 2, temporal: jitter, depth, history), GLSL | TSL ports of both (WebGPU stretches for now) |
| Light probe baking | `hd3d.js` `bakeLight` (`WebGLCubeRenderTarget` + `CubeCamera`) | A cube target on the WebGPU renderer |
| Sky dome and sky reflections | `src/kit/sky.js` (ShaderMaterial), `HDView.envFrom` (WebGL PMREM) | A TSL sky and WebGPU's PMREM |
| Game screen effects | `gs.fx3d` (EffectComposer passes) | TSL versions (three has outline, pixelate, DOF...) |
| Classic Console | `src/kit/toon3d.js` ink pass; toon shading is already stock `MeshToonMaterial` | A TSL edge-detect pass, then Console views on WebGPU |
| 3D text | troika-three-text (patches shaders) | Three's own text geometry or an SDF text node |
| 3D particles | three.quarks 0.17 (needs three ≥ 0.182, works on 0.186) | Check its WebGPU support; else our own node particles |
| Outdoor looks: ground, hills, rock, leaves | `src/kit/looks.js` `looks.*` (effects 'ground', 'hills', 'rock', 'leaves' through `lookPatch`; a view using them stays on WebGL) | One TSL node per effect, same `lk...` uniforms |
| Games with their own shaders | `deep-pressure.js` (stays on WebGL), `long-shadow.js` (sky) | Port to kit materials or TSL |

Status from `gpu-games.cjs` (2026-11-09): 18 of 20 Next Gen and AR games draw on WebGPU with no errors;
Long Shadow (sky reflections) and Deep Pressure (its own shader) stay on WebGL.

## Done in the prep PR (#68)

- **Renderers in one place**: `src/kit/renderer.js` `makeRenderer()` makes every WebGL renderer; `gpu.js`
  has `backend(r)`, `gpuName()`, `copyFrame` and an async `readPixels`.
- **Named look effects**: `src/kit/looks.js` `lookPatch(material, name, spec)` is the only way kits
  change a stock material's shader; `lookEffects()` lists them for porting and tests.
- **Final pass in pieces**: `FINAL_EFFECTS` in `hd3d.js`, joined into the same shader as before.
- **three.js 0.186.1** (from 0.180; `PCFSoftShadowMap` became `PCFShadowMap`; `SimplifyModifier.modify`
  became async, so `props.simplify` calls meshoptimizer itself), three.quarks 0.17.1.
- **game-lint warns** on `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, `ShaderChunk` and
  `ShaderLib` in games (a warning, not a failure).

Parts that already move without work: PixiJS (2D effects and sprites) supports WebGPU, so
`look2d` only needs its `preference` changed; decals (`DecalGeometry`) are stock three.js.
