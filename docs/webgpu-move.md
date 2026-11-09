# Moving the 3D to WebGPU

Game Scroll's 3D (Classic Console, Next Gen, AR) draws with three.js's WebGL renderer. Rob's plan
(2026-11-08): build every engine part so it can move, then a WebGPU path (three.js's `WebGPURenderer`
and TSL node shaders) for top phones that support it, checked against WebGL game by game, then the
default where it's supported, with WebGL kept for older phones.

**Where it is now (stage 3, 2026-11-09):** there is no setting. On any device that offers WebGPU, Next
Gen and AR views draw on WebGPU
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
  (Next Gen at every tier, a dark room with lamps, a headlight and contact shadows, an outdoor valley)
  between the two; they are within 2.5/255. `npm run build:bundled && node scripts/gpu-games.cjs [--tier n] [--shots dir]`
  plays every Next Gen and AR game on both and reports which draw on WebGPU, any errors, and how
  different the first seconds of play look (a guide: each game's own randomness moves things too). Both
  use SwiftShader's Vulkan driver, so they run without a GPU.

## What still keeps a view on WebGL (the move checklist)

| Part | Where | What it needs for WebGPU |
| --- | --- | --- |
| Reflections | three's `SSRPass` | Three's TSL `ssr()` node |
| Upscaling | `src/kit/sgsr.js` (SGSR 1, GLSL) | A TSL port of SGSR 1 (only AR, `v.upscaler = 'sgsr1'` and SSR frames use it; on WebGPU they stretch). SGSR 2 is done: `sgsr2Gpu` in `hd3d-gpu.js` |
| Light probe baking | `hd3d.js` `bakeLight` (`WebGLCubeRenderTarget` + `CubeCamera`) | A cube target on the WebGPU renderer |
| Game screen effects | `gs.fx3d` (EffectComposer passes) | TSL versions (three has outline, pixelate, DOF...) |
| Classic Console | `src/kit/toon3d.js` ink pass; toon shading is already stock `MeshToonMaterial` | A TSL edge-detect pass, then Console views on WebGPU |
| 3D text | troika-three-text (patches shaders) | Three's own text geometry or an SDF text node |
| 3D particles | three.quarks 0.17 (needs three ≥ 0.182, works on 0.186) | Check its WebGPU support; else our own node particles |
| Sky glow cap and shafts threshold | `sky.js` soft knee in the physical dome, `v.shaftsAt`; `hd3d.js` `ShaftsPass.bright()` (`thr`/`hi`/`cap`/`gain`) | The same knee in `gpuMaterials.skyDome` and the same mask numbers in `GpuChain`'s shafts |
| Sized points | `gs.sky` stars and snow (`PointsMaterial` with `size`) | WebGPU draws points 1 pixel wide whatever the size: sprites (instanced quads) instead. They don't keep a view on WebGL; they are just thin |

Status from `gpu-games.cjs` (2026-11-09): all 20 Next Gen and AR games draw on WebGPU with no errors.

## GPU particles

`gs.hd.GPUParticles` is the first part made WebGPU-first: a TSL compute pass (`src/kit/particles-gpu.js`)
moves them in storage buffers that the sprites read, with the same rules run on the CPU for WebGL. The
look-compare `sparks` scene checks the two match.

## Done for Long Shadow and Deep Pressure

- **Outdoor looks as TSL**: `gpuLooks` in `hd3d-gpu.js` has `ground` (fields, roads, wear), `hills`,
  `rock` (three-way texture), `leaves` (wind sway, see-through edges, light through the leaves) and `air`
  (haze and mist as fog, cloud shade on the sun, wet ground with `gpuWet`), plus Deep Pressure's `pulse`.
  The WebGL looks still come from `looks.js`; `PORTED_LOOKS` in `hd3d.js` lists the ones with a twin.
- **Sun shafts and depth of field** are passes in `GpuChain` (a quarter-size bright mask plus a radial
  blur; a 16-tap blur by depth), each built only once a view uses it.
- **Shadow cascades**: the near and far sun lights' `colorNode` carries the same fade weights as the
  WebGL light edit (`gpuSunLight`, `setCascade`).
- **Sky**: the dome is a TSL twin (`gpuMaterials.skyDome`, Preetham and the painted gradient, clouds),
  swapped in by `material.userData.gsGpu`. Sky reflections bake again on whichever renderer draws
  (`HDView.envFor`), through `envFrom`'s `wrap` so the baked sun is softened the same way on both.
- **Tree impostors** read their bake back into a plain texture, so they draw on either renderer. The bake
  also left the WebGL viewport small (the next frame drew into a corner); it now puts it back.
- **Props** (`@three.ez/instanced-mesh`, no WebGPU support) get plain `InstancedMesh` twins per level of
  detail (`gpuProps`), culled and sorted into levels on the CPU each frame from the library's own arrays.
- **AO only where WebGL has it**: the normal target's alpha marks pixels that take AO, so see-through
  and `noAO` things (leaves, the first-person rifle) aren't darkened.
- `look-compare` has an outdoor scene at tier 1, tier 3 and with the physical sky; WebGPU is within
  2.4/255 of WebGL on all three. `Q=feat=-shafts,-props...` turns pieces off on both runs to find a gap.

three.js 0.186 gotchas found on the way (worked around in the kit):

- WebGPU `PMREMGenerator` sets its cube camera's near and far on the first bake only, so a later bake
  with a bigger far still clips. Every bake uses one far (`ENV_FAR`, 5000).
- The renderer switches a camera to WebGPU's 0..1 depth only when the camera's setting differs; SGSR 2's
  jitter put back a matrix saved before the switch, so on WebGPU the near clip sat at twice its distance.
  `HDView.render` now sets the camera's coordinate system before anything saves its matrix.
- `copyTextureToTexture` into a render target that is never drawn into keeps its old size after
  `setSize` (the fold-out freeze, fixed in #79 by drawing into two targets in turn).
- A node set on a WebGL material (`colorNode`, `positionNode`...) carries over to its node twin; vertex
  colours multiply after `colorNode`; WGSL can't sample a texture with automatic mip levels inside a
  branch that differs per pixel, so the clouds are worked out everywhere and masked.

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
