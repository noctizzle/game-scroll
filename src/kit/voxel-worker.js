// Meshes gs.voxels chunks off the main thread (see voxel-mesh.js).
import { meshChunk } from './voxel-mesh.js';

self.onmessage = e => {
  const { job, data, info } = e.data;
  try {
    const m = meshChunk(data, info), list = [];
    for (const g of [m.solid, m.clear]) if (g) list.push(g.pos.buffer, g.nrm.buffer, g.col.buffer, g.idx.buffer);
    self.postMessage({ job, mesh: m }, list);
  } catch (err) { self.postMessage({ job, error: String(err && err.message || err) }); }
};
