// Texture compression on the graphics chip (WebGPU): the textures the kit paints in code (surface(),
// gs.models recipes, detail normals) are packed into the phone's own compressed formats (ASTC or ETC2 on
// phones, BC on desktops) by spark.js (Ludicon's real-time GPU encoders), with mipmaps. A compressed
// texture takes a quarter (BC7/ASTC) of the memory and bandwidth of the plain one, so big detailed
// surfaces cost less to draw and leave room for more of them. A texture draws plain at once and
// switches to its packed copy when that's ready (a few milliseconds each, one at a time).
// Copies of a texture made for another repeat (surface().repeat(u, v)) share one packed copy, where
// before each was its own plain upload.
// Which textures: those a kit part marks with userData.gsPack ('srgb' for colour, 'linear' for normals
// and masks). HD.pack = false turns it off (tests); WebGL draws the plain textures as before.
// Kit use only (gpu.js installs it on the WebGPU renderer).

const packed = new WeakMap();   // texture source -> { gpu (GPUTexture) | null (failed), users: Set<Texture> } per renderer
const stats = { packed: 0, saved: 0, failed: 0 };
/** packed: textures packed now; saved: bytes of graphics memory saved; on: false turns packing off (HD.pack). */
export const packing = Object.assign(stats, { on: true });

/** Installs packing on a three WebGPURenderer. Never throws. */
export function installPack(r) {
  try {
    const textures = r._textures, backend = r.backend, device = backend?.device;
    if (!textures || !device || r.gsPack) return;
    const per = new WeakMap(); r.gsPack = per;
    let spark = null, sparkLoad = null, busy = false; const queue = [];
    const load = () => sparkLoad ||= import('@ludicon/spark.js').then(({ Spark }) => Spark.create(device, { cacheTempResources: { minSize: 1024 } })).then(s => (spark = s), e => { console.warn('Texture packing off:', e?.message || e); return null; });
    // one at a time, so a level full of new textures doesn't load the chip all at once
    const next = async () => {
      if (busy || !queue.length) return; busy = true;
      const src = queue.shift(), e = per.get(src);
      try {
        const s = spark || await load();
        if (!s) { e.gpu = null; stats.failed++; return; }
        const t = [...e.users][0], img = t?.image;
        if (!img || !(img.width >= 4) || img.width % 4 || img.height % 4) { e.gpu = null; return; }
        const gpu = await s.encodeTexture(img, { format: 'rgb', srgb: e.kind === 'srgb', mips: true, flipY: !!t.flipY });
        if (!e.users.size) { gpu.destroy(); e.queued = false; return; }   // (all let go while it was packed)
        e.gpu = gpu; e.saved = img.width * img.height * 4 * 4 / 3 * (1 - (/^(bc1|etc2)/.test(gpu.format) ? .125 : .25)); stats.packed++; stats.saved += e.saved;
        // each texture using it drops its plain copy; the next frame binds the packed one (bind groups rebuilt)
        e.swap = true; for (const u of e.users) if (textures.has(u)) textures._destroyTexture(u); e.swap = false;
      } catch (err) { e.gpu = null; stats.failed++; if (stats.failed === 1) console.warn('Texture packing failed:', err?.message || err); }
      finally { busy = false; next(); }
    };
    const unpack = e => {
      e.swap = true; for (const u of e.users) if (textures.has(u)) textures._destroyTexture(u); e.swap = false;
      e.gpu.destroy(); e.gpu = undefined; e.queued = false; stats.packed--; stats.saved -= e.saved;
    };
    const update = textures.updateTexture.bind(textures);
    textures.updateTexture = (t, o = {}) => {
      const kind = t.userData?.gsPack, src = t.source;
      if (!kind || !src || t.isRenderTargetTexture || !stats.on) return update(t, o);
      let e = per.get(src);
      if (!e) { per.set(src, e = { gpu: undefined, kind, users: new Set() }); }
      e.users.add(t);
      // painted again (needsUpdate) after it was packed: every user goes back to plain, and it's packed again
      if (e.gpu) { const td = textures.has(t) && textures.get(t); if (td?.initialized && td.version !== t.version) unpack(e); }
      if (e.gpu === undefined && !e.queued && t.version > 0) { e.queued = true; queue.push(src); next(); }
      if (!e.gpu) return update(t, o);
      // the packed copy, handed to three the way an outside texture is (three/src: Textures.updateTexture)
      t.isExternalTexture = true; t.sourceTexture = e.gpu;
      try { return update(t, o); } finally { delete t.isExternalTexture; delete t.sourceTexture; }
    };
    // a texture let go doesn't destroy the packed copy others share; the last one to go does
    const destroy = backend.destroyTexture.bind(backend);
    backend.destroyTexture = (t, isDefault) => {
      const e = t.source && per.get(t.source), d = backend.get(t);
      if (e?.gpu && d.texture === e.gpu) d.texture = undefined;   // (shared: not this texture's to destroy)
      if (e && !e.swap) {
        e.users.delete(t);
        if (!e.users.size && e.gpu) unpack(e);
      }
      return destroy(t, isDefault);
    };
  } catch (e) { console.warn('Texture packing not installed:', e?.message || e); }
}
