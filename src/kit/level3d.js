// 3D levels from text maps: the same text as gs.tiles and gs.gen ('#' wall, '.' floor, letters as
// marks) built into a 3D level for Console, Next Gen and AR games. Walls in a row are merged into
// long blocks, so a 40 x 30 map is a few hundred boxes in a handful of draw calls, and the same
// blocks become solid in gs.physics3d. Your game picks the materials; the kit builds the shapes.
//
//   const { Level3D } = gs.level3d;
//   reset() {
//     level = new Level3D(`
//       ##########
//       #P...2222#
//       #..~~.22.#
//       #..~~..E.#
//       ##########`, { size: 2, wall: 3, look: { '#': toon('#8a7f6a'), '.': toon('#c9b68f'), '~': toon('#3a8fe8'), '2': toon('#a89870') } });
//     view.add(level.group);
//     phys && level.solid(phys);                    // a World3D: walls and floors become fixed bodies
//     const p = level.find('P')[0];                 // { col, row, x, y, z } in world units
//   }
//   level.at(x, z) -> { col, row, ch }, level.height(x, z) -> floor height there (null over a hole)
//
// Characters: '#' wall (full height), '.' floor, ' ' or '_' a hole (no floor), '1'..'9' a raised floor
// (step x n high: platforms, stairs, plateaus), '~' water (a sunken floor, not solid to walk on in
// physics), '=' a low wall (half height). Any other letter is a mark on plain floor (find() it).
// Row 0 is at the back (-z), column 0 on the left (-x); the map is centred on 0, 0.

import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SHADES = { '#': '#8c8c8c', '=': '#a0a0a0', '.': '#c8c8c8', '~': '#4a8ad0', step: '#b4b4b4' };
const fallback = {};
const plain = k => (fallback[k] ||= new MeshLambertMaterial({ color: SHADES[k] || SHADES['.'] }));

export class Level3D {
  /**
   * text: the map. size: metres per tile. wall: wall height. step: height of each '1'..'9' level.
   * floor: floor thickness. water: how far '~' sits below the floor. look: { char: material } (or a
   * function (char) => material); '1'..'9' fall back to look.step then look['.'], marks to look['.'].
   * shadows: true sets cast/receive shadow on the meshes (Next Gen).
   */
  constructor(text, { size = 1, wall = 2, step = .5, floor = .2, water = .3, look = {}, shadows = false } = {}) {
    const rows = String(text).replace(/^\s*\n|\n\s*$/g, '').split('\n');
    const indent = Math.min(...rows.filter(r => r.trim()).map(r => r.match(/^ */)[0].length));
    this.grid = rows.map(r => r.slice(indent).replace(/\s+$/, ''));
    this.rows = this.grid.length; this.cols = Math.max(...this.grid.map(r => r.length));
    Object.assign(this, { size, wall, step, floorH: floor, water });
    this.x0 = -this.cols * size / 2; this.z0 = -this.rows * size / 2;
    const mat = typeof look === 'function' ? look : ch => look[ch] ?? (ch >= '1' && ch <= '9' ? look.step ?? look['.'] : look['.']) ?? plain(ch >= '1' && ch <= '9' ? 'step' : SHADES[ch] ? ch : '.');
    this.marks = {}; this.blocks = [];
    // runs along each row of the same kind and height, merged into one block each
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const ch = this.ch(c, r), kind = this.kind(ch);
        if (kind === 'hole') { c++; continue; }
        let e = c + 1; while (e < this.cols && this.sameBlock(this.ch(e, r), ch)) e++;
        const top = this.top(ch), bottom = kind === 'water' ? -floor - water : -floor;
        this.blocks.push({ col: c, row: r, cols: e - c, kind, ch: kind === 'mark' ? '.' : ch, top, bottom, solid: kind !== 'water' });
        for (let k = c; k < e; k++) { const m = this.ch(k, r); if (this.kind(m) === 'mark') (this.marks[m] ||= []).push(this.cell(k, r)); }
        c = e;
      }
    }
    // merge blocks that share a material into one mesh
    const byMat = new Map();
    for (const b of this.blocks) {
      const m = mat(b.ch); if (!m) continue;
      const g = new BoxGeometry(b.cols * size, b.top - b.bottom, size);
      g.translate(this.x0 + (b.col + b.cols / 2) * size, (b.top + b.bottom) / 2, this.z0 + (b.row + .5) * size);
      if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g);
    }
    this.group = new Group(); this.group.name = 'level3d';
    for (const [m, list] of byMat) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach(x => x.dispose());
      const mesh = new Mesh(g, m); mesh.castShadow = mesh.receiveShadow = shadows; this.group.add(mesh);
    }
  }
  ch(col, row) { return this.grid[row]?.[col] ?? ' '; }
  kind(ch) {
    if (ch === ' ' || ch === '_') return 'hole';
    if (ch === '#') return 'wall'; if (ch === '=') return 'low'; if (ch === '~') return 'water'; if (ch === '.') return 'floor';
    if (ch >= '1' && ch <= '9') return 'step'; return 'mark';
  }
  sameBlock(a, b) { const ka = this.kind(a), kb = this.kind(b); if (ka === 'mark' || ka === 'floor') return kb === 'mark' || kb === 'floor'; return a === b; }
  /** Top of the solid at a character: floor 0, walls wall height, steps step x n, water below 0. */
  top(ch) {
    const k = this.kind(ch);
    return k === 'wall' ? this.wall : k === 'low' ? this.wall / 2 : k === 'step' ? this.step * +ch : k === 'water' ? -this.water : k === 'hole' ? null : 0;
  }
  /** The world centre of a tile: { col, row, x, y, z } (y is the floor's top there). */
  cell(col, row) { return { col, row, x: this.x0 + (col + .5) * this.size, y: this.top(this.ch(col, row)) ?? 0, z: this.z0 + (row + .5) * this.size }; }
  /** The tile at a world point: { col, row, ch }. */
  at(x, z) { const col = Math.floor((x - this.x0) / this.size), row = Math.floor((z - this.z0) / this.size); return { col, row, ch: this.ch(col, row) }; }
  /** Floor height at a world point (walls count as their tops), or null over a hole or off the map. */
  height(x, z) { return this.top(this.at(x, z).ch); }
  /** Can you walk on this tile (floor, marks, steps; not walls, holes or water)? */
  walkable(col, row) { const k = this.kind(this.ch(col, row)); return k === 'floor' || k === 'mark' || k === 'step'; }
  /** Where a mark letter is: a list of cells. */
  find(ch) { return this.marks[ch] || []; }
  /** Makes the level solid in a gs.physics3d World3D (fixed boxes; water stays open). Returns the bodies. */
  solid(world, o = {}) {
    return this.blocks.filter(b => b.solid).map(b => world.box(null, b.cols * this.size, b.top - b.bottom, this.size, {
      friction: .7, ...o, fixed: true, tag: o.tag ?? (b.kind === 'wall' || b.kind === 'low' ? 'wall' : 'floor'),
      at: { x: this.x0 + (b.col + b.cols / 2) * this.size, y: (b.top + b.bottom) / 2, z: this.z0 + (b.row + .5) * this.size },
    }));
  }
  /** A gs.ai NavGrid-style test: (col, row) => blocked. */
  get blocked() { return (col, row) => !this.walkable(col, row); }
  dispose() { this.group.traverse(o => o.geometry?.dispose()); }
}
