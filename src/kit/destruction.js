// Things that break: shatter any mesh into real pieces (Voronoi fracture from three-pinata) that fly
// apart with gs.physics3d, more pieces near where it was hit; slice a mesh along a plane; and keep
// the rubble tidy (pieces settle, fade and go so phones stay fast). Chain reactions of explosive
// barrels are gs.combat.Explosives.
//
//   const { shatter, slice, Rubble } = gs.destruction;
//   reset() { rubble = new Rubble(view.scene, { max: 60, life: 6 }); }
//   on a big hit: rubble.add(shatter(wall, { pieces: 14, at: hitPoint, world: phys, push: 6, inside: toon('#776655') }));
//   update(dt) { phys.step(dt); rubble.update(dt); }
//
// shatter() removes the mesh and puts the pieces in the scene where it was. Pieces keep its
// material outside and use `inside` on the broken faces. Without a world they just appear in place
// (handy for a cut-scene or your own animation). Breaking is a little slow for big pieces counts:
// about 10-20 pieces is the sweet spot on phones; do it on the hit frame, not every frame.

import { Vector3 } from 'three';
import { DestructibleMesh, FractureOptions } from '@dgreenheck/three-pinata';

const v3 = p => (p ? new Vector3(p.x, p.y, p.z) : null);

/**
 * Breaks a mesh into pieces. pieces: how many; at: the world point it was hit (pieces are smaller
 * there); flat: true for walls and panes (2.5D fracture, faster); inside: material for broken faces;
 * world: a gs.physics3d World3D to make each piece a tumbling body; push: how hard pieces fly out from
 * `at` (metres a second); seed: the same seed breaks the same way. Returns the pieces (meshes, each
 * with .body when there's a world).
 */
export function shatter(mesh, { pieces = 12, at = null, flat = false, inside = null, world = null, push = 4, seed, density = 1, radius = null } = {}) {
  mesh.updateMatrixWorld(true);
  let root = mesh; while (root.parent) root = root.parent;   // pieces live in world space, in the scene
  const dm = new DestructibleMesh(mesh.geometry, mesh.material, inside || mesh.material);
  mesh.matrixWorld.decompose(dm.position, dm.quaternion, dm.scale); dm.updateMatrixWorld(true);
  const local = at ? mesh.worldToLocal(v3(at)) : null;
  const opts = new FractureOptions({
    fractureMethod: 'voronoi', fragmentCount: pieces, seed,
    voronoiOptions: { mode: flat ? '2.5D' : '3D', impactPoint: local || undefined, impactRadius: radius ?? undefined },
  });
  const frags = dm.fracture(opts);
  const out = [];
  for (const f of frags) {
    f.castShadow = mesh.castShadow; f.receiveShadow = mesh.receiveShadow;
    if (f.scale.x !== 1 || f.scale.y !== 1 || f.scale.z !== 1) { f.geometry.scale(f.scale.x, f.scale.y, f.scale.z); f.scale.set(1, 1, 1); }   // bake scale so the physics shape matches
    if (root !== mesh) root.add(f);
    if (world) {
      try {
        f.body = world.hull(f, { density, tag: 'piece' });
        if (push && at) { const d = f.position.clone().sub(v3(at)); const l = d.length() || 1; d.multiplyScalar(push / l * (.6 + Math.random() * .6)); f.body.push(d.x, d.y + push * .3, d.z); f.body.twist((Math.random() - .5) * 6, (Math.random() - .5) * 6, (Math.random() - .5) * 6); }
      } catch (_) { /* too thin for a hull: leave it as decoration */ }
    }
    out.push(f);
  }
  mesh.removeFromParent();
  return out;
}

/** Cuts a mesh in two along a plane (world point and normal). Returns [top, bottom] meshes, added where it was. */
export function slice(mesh, point, normal, { inside = null } = {}) {
  mesh.updateMatrixWorld(true);
  const dm = new DestructibleMesh(mesh.geometry, mesh.material, inside || mesh.material);
  let root = mesh; while (root.parent) root = root.parent;
  mesh.matrixWorld.decompose(dm.position, dm.quaternion, dm.scale); dm.updateMatrixWorld(true);
  const parts = dm.sliceWorld(v3(normal).normalize(), v3(point));
  for (const p of parts) { p.castShadow = mesh.castShadow; if (root !== mesh) root.add(p); }
  mesh.removeFromParent();
  return parts;
}

/**
 * Keeps broken pieces tidy: each lives `life` seconds, then shrinks away; past `max` the oldest go
 * first. Pieces with bodies are removed from physics too.
 */
export class Rubble {
  constructor(scene = null, { max = 60, life = 8, shrink = .6 } = {}) { this.scene = scene; this.max = max; this.life = life; this.shrink = shrink; this.list = []; }
  add(pieces) { for (const m of [].concat(pieces)) { m.userData.rubbleAge = 0; m.userData.rubbleScale = m.scale.x; this.list.push(m); } while (this.list.length > this.max) this.drop(this.list[0]); return this; }
  drop(m) { m.body?.remove(); m.removeFromParent(); m.geometry?.dispose(); this.list = this.list.filter(x => x !== m); }
  update(dt) {
    for (const m of [...this.list]) {
      const a = (m.userData.rubbleAge += dt), end = this.life;
      if (a > end) { const k = 1 - (a - end) / this.shrink; if (k <= 0) { this.drop(m); continue; } m.scale.setScalar(m.userData.rubbleScale * k); }
    }
    return this;
  }
  clear() { for (const m of [...this.list]) this.drop(m); return this; }
  get count() { return this.list.length; }
}
