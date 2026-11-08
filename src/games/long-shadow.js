// Long Shadow: a sniper campaign in a made-up 1944 river valley. You are Wren, a lone sharpshooter
// working for Captain Oake's raiders against the Grey Order (a fictional army: no real flags, symbols
// or people). Read the range and the wind, hold your breath and squeeze: bullets drop and drift, so
// you aim above and into the wind. Every shot is loud unless a passing train or the church bell
// covers it. Fire too often from one spot and they find you: squads take cover, close in and call
// down mortars, so you move to the next nest. Hits knock soldiers out: no blood, cartoon KOs.
//
// Kits: gs.hd (the look), gs.outdoors (land, water, trees), gs.props (instanced trees and rocks),
// gs.sky (time of day, rain), gs.poses (soldiers), gs.combat (rifle, health, explosives), gs.tactics
// (cover and squads), gs.ai (paths), gs.brains (the enemy commander learns how you play),
// gs.stealth (bodies get found), gs.missions, gs.cutscene, gs.prompts, gs.gadgets (zip line),
// gs.destruction (the watchtower) and gs.campaign (stars and saves).
import gs from '../gamescroll.js';
const { sounds, noise, tone } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { fbm } = gs.math;
const { Juice } = gs.juice;
const { HDView, Particles, pbr, rbox, sun, surface, speckle, THREE } = gs.hd;
const { Land, Water, tree, rock } = gs.outdoors;
const { Props } = gs.props;
const { Sky, Weather } = gs.sky;
const { figure } = gs.poses;
const { Gun, Health, Explosives } = gs.combat;
const { CoverMap, Squad } = gs.tactics;
const { NavGrid } = gs.ai;
const { Brain } = gs.brains;
const { Bodies } = gs.stealth;
const { Mission } = gs.missions;
const { Cutscene } = gs.cutscene;
const { Prompts } = gs.prompts;
const { Zipline } = gs.gadgets;
const { Campaign } = gs.campaign;
const { shatter } = gs.destruction;
const { Group, Mesh, InstancedMesh, Object3D, Vector3, BoxGeometry, CylinderGeometry, ConeGeometry, PlaneGeometry, SphereGeometry, CapsuleGeometry, TorusGeometry, Color } = THREE;

let W = 300, H = 420;
const TAU = Math.PI * 2;
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------------------------------------------ ballistics
// A slow round (game ballistics) so drop and wind matter at 150-350 m. The rifle is zeroed at 100 m.
const V0 = 430, GRAV = 9.8, WIND_K = 1.2, ZERO = 100;
const dropAt = d => .5 * GRAV * (d / V0) ** 2;
const BORE = dropAt(ZERO) / ZERO;
const holdAt = d => (dropAt(d) - BORE * d) / d;              // radians to aim above the target at range d
const driftAt = (d, w) => .5 * WIND_K * w * (d / V0) ** 2 / d; // radians to aim into the wind at range d

// ------------------------------------------------------------------ the valley
// x runs west to east, z south (+) to north (-), y up. The river winds along x; the Ashvale ridge is
// south (your side), the village of Larkford and the rail line north, a stream and dam north-east.
const RIVER = x => 6 * Math.sin(x * .011);
const RAILZ = -42, RAILH = 4.6, STREAMX = 140;
function shape(x, z) {
  // the ridge rises concave (steeper near the top) so the nests up there see down into the valley
  let h = 2 + 30 * clamp((z - 20) / 150, 0, 1) ** 1.6 - sm(190, 300, z) * 14 + sm(-38, -62, z) * 4 + sm(-165, -300, z) * 40;
  const town = 1 - sm(60, 95, Math.hypot(x + 15, z + 108));
  h += fbm(x * .011 + 3, z * .011 - 2, 4) * 6 * (1 - town * .85) * (1 - .85 * sm(20, 120, z));
  h += Math.max(0, x - 200) * .12 + Math.max(0, -x - 230) * .1;
  const sx = Math.abs(x - STREAMX), stream = (1 - sm(5, 22, sx)) * sm(-30, -60, z);
  h -= stream * 9;
  const rz = Math.abs(z - RIVER(x)); h -= 6.5 * (1 - sm(5, 15, rz));
  const rk = (1 - sm(5, 12, Math.abs(z - RAILZ))) * sm(10, 24, sx);
  h = lerp(h, RAILH - .4, rk);
  return h;
}
const ROADS = [
  [[40, 26], [52, 70], [60, 118], [44, 175]],                       // south road up to the ridge
  [[40, -18], [28, -60], [-12, -96], [-80, -104], [-230, -112]],    // bridge to Larkford and west
  [[-12, -96], [60, -84], [130, -72], [240, -78]],                  // east road (trucks come this way)
];
function roadD(x, z) {
  let best = 99;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const [ax, az] = r[i], [bx, bz] = r[i + 1], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t); if (d < best) best = d;
  }
  return best;
}
// houses: [x, z, w, d, h, turned]
const HOUSES = [
  [-45, -80, 10, 7, 6, 0], [-42, -128, 9, 8, 7, 1], [8, -132, 11, 7, 6, 0], [22, -94, 9, 7, 5, 1], [-62, -112, 8, 8, 6, 0],
  [-2, -78, 8, 6, 5, 0], [36, -116, 10, 8, 6, 1], [-82, -88, 9, 7, 5, 1], [56, -98, 8, 7, 5, 0], [-55, -150, 10, 7, 6, 0],
  [28, -152, 8, 8, 5, 1], [-100, -120, 8, 7, 5, 0],
];
const CHURCH = { x: -15, z: -122, tz: -108 };
const MILL = { x: 70, z: -21 };
const BRIDGE = { x: 40, z0: -17, z1: 22, y: 5.2 };
// nests: where Wren can lie up
const NESTS = {
  ridge: { name: 'Ridge rocks', x: 2, z: 160, up: 1.0, face: { x: 20, z: -80 } },
  tower: { name: 'Water tower', x: -128, z: -54, up: 13.1, face: { x: 0, z: -100 } },
  chapel: { name: 'Chapel belfry', x: 78, z: 76, up: 12.2, face: { x: 20, z: -60 } },
  mill2: { name: 'Windmill', x: -112, z: 116, up: 8.8, face: { x: 0, z: -80 } },
};
const LANDMARKS = [['Mill', MILL.x, 4, MILL.z], ['Church', CHURCH.x, 22, CHURCH.tz], ['Bridge', BRIDGE.x, 5, 0], ['Rail', 140, 6, RAILZ], ['Dam', STREAMX, 22, -205]];

// grid for paths and cover: 4 m cells over most of the valley
const CELL = 4, GX0 = -200, GZ0 = -180, GC = 110, GR = 90;

let WD = null;
function world() {
  if (WD) return WD;
  const v = new HDView({ bg: '#b9bcb4', fog: .0024, env: .35, sky: '#c8d2e0', ground: '#5a5242', amb: .55, fov: 62 });
  v.cam.near = .3; v.cam.far = 1100; v.cam.updateProjectionMatrix();
  v.exposure = .95; v.bloom = .3;
  const sl = sun('#fff0d8', 2.6, 34, [-.5, .75, .35]); v.scene.add(sl, sl.target); v.onTier(T => sl.setTier(T));
  v.sun = sl;

  // ---- land, with the nests and the village levelled
  const land = new Land({ kind: shape, size: 640, segments: 128, colours: [[-7, '#4c4a3e'], [-1.2, '#6b6650'], [1.5, '#56692f'], [9, '#64753a'], [22, '#566a33'], [34, '#4f5f35'], [46, '#6c6a58']] });
  land.flatten(-15, -108, 58, 6.4, 30);
  for (const n of Object.values(NESTS)) land.flatten(n.x, n.z, 5, undefined, 6);
  land.flatten(MILL.x, MILL.z - 3, 9, 4.2, 6);
  // roads painted onto the vertex colours
  {
    const g = land.mesh.geometry, col = g.attributes.color, pos = g.attributes.position, n = col.count, dirt = new Color('#8b7a58'), c = new Color();
    const S = land.size, seg = land.segments;
    for (let i = 0; i < n; i++) {
      const cc = i % (seg + 1), rr = Math.floor(i / (seg + 1)), x = -S / 2 + cc * S / seg, z = -S / 2 + rr * S / seg;
      const d = roadD(x, z); if (d > 5) continue;
      const k = 1 - sm(2.2, 5, d); c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(dirt, k * .9); col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true; void pos;
  }
  v.scene.add(land.object);
  land.grass({ count: 9000, colour: '#738a3c', above: 14, steep: .35, far: 42, height: .8, wind: .6 });

  const river = new Water({ level: -1.4, waves: .08, size: 640, segments: 40, colour: '#43626a', opacity: .93 });
  v.scene.add(river.mesh);
  const lake = new Water({ level: 23, waves: .18, size: 150, segments: 20, colour: '#40606e', opacity: .95 });
  lake.mesh.position.set(STREAMX, 0, -282); v.scene.add(lake.mesh);

  // ---- materials (built once)
  const plaster = surface(256, ({ col, h, size: S }) => { col.fillStyle = '#d8cfbd'; col.fillRect(0, 0, S, S); speckle(col, S, 900, '#a89c86', 2, .35); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S); speckle(h, S, 1500, '#000', 1.5, .3); for (let y = 0; y < S; y += 32) { h.fillStyle = '#6668'; h.fillRect(0, y, S, 2); } });
  const tiles = surface(256, ({ col, h, size: S }) => { col.fillStyle = '#7a3d2c'; col.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 16) for (let x = (y / 16 % 2) * 12; x < S; x += 24) { col.fillStyle = `hsl(12,${35 + Math.random() * 15}%,${26 + Math.random() * 10}%)`; col.fillRect(x, y, 22, 14); h.fillStyle = '#fff'; h.fillRect(x, y, 22, 12); } speckle(col, S, 400, '#2a1a12', 1.5, .3); });
  const stone = surface(256, ({ col, h, size: S }) => { col.fillStyle = '#8c887c'; col.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 20) for (let x = (y / 20 % 2) * 16; x < S; x += 32) { col.fillStyle = `hsl(40,8%,${42 + Math.random() * 16}%)`; col.fillRect(x + 1, y + 1, 30, 18); h.fillStyle = '#ddd'; h.fillRect(x + 2, y + 2, 28, 16); } speckle(col, S, 600, '#3a3830', 1.4, .3); });
  const wood = surface(128, ({ col, h, size: S }) => { col.fillStyle = '#6b4a30'; col.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { col.fillStyle = `rgba(30,18,10,${Math.random() * .3})`; col.fillRect(0, Math.random() * S, S, 1 + Math.random() * 2); } h.fillStyle = '#888'; h.fillRect(0, 0, S, S); });
  const M = {
    wall: pbr('#ffffff', { tex: plaster, rep: [2, 2], rough: .92 }), roof: pbr('#ffffff', { tex: tiles, rep: [3, 2], rough: .8 }),
    stone: pbr('#ffffff', { tex: stone, rep: [2, 2], rough: .9 }), wood: pbr('#ffffff', { tex: wood, rough: .85 }),
    glass: pbr('#1a2128', { rough: .15, metal: .4, glow: 0, glowCol: '#ffb860' }), iron: pbr('#3a3c3e', { rough: .45, metal: .8 }),
    rail: pbr('#6a6560', { rough: .35, metal: .9 }), dark: pbr('#24221f', { rough: .8 }), sand: pbr('#a39270', { rough: 1 }),
    drum: pbr('#a8352a', { rough: .5, metal: .3, clear: .3 }), green: pbr('#4c5a32', { rough: .7 }), brass: pbr('#c8a24a', { rough: .25, metal: 1 }),
    cloth: pbr('#c9bc8e', { rough: 1, side: THREE.DoubleSide }), canvas: pbr('#5d6150', { rough: 1 }), lamp: pbr('#ffcf80', { glow: 3 }),
    plant: pbr('#ffffff', { vertexColors: true, rough: .9 }),
  };
  M.glass.emissive = new Color('#ffb860'); M.glass.emissiveIntensity = 0;
  WD = { v, sl, land, river, lake, M };
  const solids = WD.solids = [];   // boxes that stop bullets: { x0, y0, z0, x1, y1, z1, kind }
  const box = (x, y, z, w, h, d, kind = 'wall') => solids.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2, kind });
  const mesh = (geo, mat, x, y, z, ry = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; v.scene.add(m); return m; };
  const ground = (x, z) => land.height(x, z);

  // ---- houses: walls, roofs and windows, each one draw call (instanced)
  const N = HOUSES.length + 3;
  const walls = new InstancedMesh(rbox(1, 1, 1, .02), M.wall, N), roofs = new InstancedMesh(roofGeo(), M.roof, N), wins = new InstancedMesh(new BoxGeometry(1, 1, 1), M.glass, N * 6);
  const o = new Object3D(); let wi = 0, hi = 0;
  const house = (x, z, w, d, h, turned, mat = walls) => {
    const y = ground(x, z) - .4, ww = turned ? d : w, dd = turned ? w : d;
    o.position.set(x, y + h / 2, z); o.rotation.set(0, 0, 0); o.scale.set(ww, h + .4, dd); o.updateMatrix(); mat.setMatrixAt(hi, o.matrix);
    o.position.set(x, y + h + .4, z); o.rotation.set(0, turned ? Math.PI / 2 : 0, 0); o.scale.set(w + .8, Math.min(w, d) * .45, d + .8); o.updateMatrix(); roofs.setMatrixAt(hi, o.matrix);
    hi++;
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const along = (i - 1) * ww * .3;
      o.rotation.set(0, 0, 0); o.position.set(x + along, y + h * .62, z + s * (dd / 2 + .02)); o.scale.set(1, 1.2, .1); o.updateMatrix(); wins.setMatrixAt(wi++, o.matrix);
    }
    box(x, y, z, ww, h + .4, dd, 'house');
  };
  for (const hs of HOUSES) house(...hs);
  // the mill (with the radio post on its balcony)
  house(MILL.x, MILL.z, 11, 8, 8, 0);
  walls.count = roofs.count = hi; wins.count = wi;
  for (const m of [walls, roofs, wins]) { m.castShadow = m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; v.scene.add(m); }
  WD.wins = wins;
  const millY = ground(MILL.x, MILL.z);
  mesh(new BoxGeometry(9, .25, 1.6), M.wood, MILL.x, millY + 4.4, MILL.z + 4.8);                      // balcony
  for (const s of [-1, 1]) mesh(new BoxGeometry(.15, 1, .15), M.wood, MILL.x + s * 4.4, millY + 4.9, MILL.z + 5.5);
  mesh(new BoxGeometry(9, .1, .1), M.wood, MILL.x, millY + 5.4, MILL.z + 5.55);
  const wheel = mesh(new CylinderGeometry(3.2, 3.2, 1, 18), M.wood, MILL.x + 7, millY + 1.2, MILL.z + 1); wheel.rotation.z = Math.PI / 2; WD.wheel = wheel;
  const mast = mesh(new CylinderGeometry(.06, .08, 9, 6), M.iron, MILL.x - 4, millY + 12, MILL.z - 2); void mast;
  WD.flagA = flag(v, M, MILL.x + 4, millY + 8.4 + 3.4, MILL.z - 3);

  // church and tower (the M2 marksman sits in the belfry)
  const cy = ground(CHURCH.x, CHURCH.z) - .3;
  mesh(rbox(9, 9, 18, .1), M.stone, CHURCH.x, cy + 4.5, CHURCH.z); box(CHURCH.x, cy, CHURCH.z, 9, 9, 18, 'stone');
  mesh(roofGeo(), M.roof, CHURCH.x, cy + 9, CHURCH.z, Math.PI / 2).scale.set(19, 4, 10);
  mesh(rbox(5, 17, 5, .08), M.stone, CHURCH.x, cy + 8.5, CHURCH.tz); box(CHURCH.x, cy, CHURCH.tz, 5, 17, 5, 'stone');
  for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) mesh(new BoxGeometry(.6, 4, .6), M.stone, CHURCH.x + dx, cy + 19, CHURCH.tz + dz);
  mesh(new BoxGeometry(5.4, .6, 5.4), M.stone, CHURCH.x, cy + 21.2, CHURCH.tz); box(CHURCH.x, cy + 20.9, CHURCH.tz, 5.4, .6, 5.4, 'stone');
  mesh(new ConeGeometry(3.6, 7, 4), M.roof, CHURCH.x, cy + 25, CHURCH.tz, Math.PI / 4);
  WD.bell = mesh(new CylinderGeometry(.35, .8, 1.1, 12, 1, true), M.brass, CHURCH.x, cy + 20, CHURCH.tz);
  WD.churchTop = { x: CHURCH.x, y: cy + 17, z: CHURCH.tz };

  // the stone road bridge
  const by = BRIDGE.y;
  mesh(rbox(7, 1.2, BRIDGE.z1 - BRIDGE.z0, .1), M.stone, BRIDGE.x, by - .6, (BRIDGE.z0 + BRIDGE.z1) / 2);
  for (const s of [-1, 1]) { mesh(rbox(.5, .9, BRIDGE.z1 - BRIDGE.z0, .1), M.stone, BRIDGE.x + s * 3.3, by + .45, (BRIDGE.z0 + BRIDGE.z1) / 2); box(BRIDGE.x + s * 3.3, by, (BRIDGE.z0 + BRIDGE.z1) / 2, .5, .9, BRIDGE.z1 - BRIDGE.z0, 'low'); }
  for (const z of [-7, 2.5, 12]) mesh(rbox(5, 8, 3, .2), M.stone, BRIDGE.x, by - 5.2, z);
  box(BRIDGE.x, by - 9, (BRIDGE.z0 + BRIDGE.z1) / 2, 7, 9, BRIDGE.z1 - BRIDGE.z0, 'stone');

  // the railway: sleepers, rails and the iron bridge over the stream
  const sleepers = new InstancedMesh(new BoxGeometry(2.6, .18, .4), M.wood, 520); let si = 0;
  for (let x = -318; x < 318; x += 1.24) { o.position.set(x, RAILH, RAILZ); o.rotation.set(0, Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix(); sleepers.setMatrixAt(si++, o.matrix); }
  sleepers.count = si; sleepers.receiveShadow = true; v.scene.add(sleepers);
  for (const s of [-.72, .72]) mesh(new BoxGeometry(636, .14, .1), M.rail, 0, RAILH + .16, RAILZ + s).castShadow = false;
  for (const s of [-1, 1]) { mesh(new BoxGeometry(34, .4, .4), M.iron, STREAMX, RAILH + 3.2, RAILZ + s * 2); for (let i = -4; i <= 4; i++) mesh(new BoxGeometry(.3, 3.2, .3), M.iron, STREAMX + i * 4, RAILH + 1.6, RAILZ + s * 2).rotation.z = i % 2 ? .6 : -.6; }
  mesh(new BoxGeometry(34, .5, 4.4), M.iron, STREAMX, RAILH - .3, RAILZ);
  // the water tower (M1's second nest)
  const tw = { x: NESTS.tower.x, z: NESTS.tower.z + 2.2 }, ty = ground(NESTS.tower.x, NESTS.tower.z);
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) mesh(new CylinderGeometry(.18, .22, 10, 6), M.iron, tw.x + dx, ty + 5, tw.z + dz);
  mesh(new CylinderGeometry(2.7, 2.7, 3.2, 20), M.wood, tw.x, ty + 11.4, tw.z);
  // the dam up the stream, holding the lake
  const dy = 0;
  mesh(rbox(70, 26, 7, .3), M.stone, STREAMX, dy + 1, -206); for (let i = -2; i <= 2; i++) mesh(rbox(3, 3, 8, .2), M.stone, STREAMX + i * 12, dy + 15.5, -206);
  // the chapel belfry on the south bank (M2's first nest)
  const ch = NESTS.chapel, chy = ground(ch.x, ch.z) - .2;
  mesh(rbox(4.4, 11, 4.4, .1), M.stone, ch.x, chy + 5.5, ch.z);
  for (const [dx, dz] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) mesh(new BoxGeometry(.5, 2.6, .5), M.stone, ch.x + dx, chy + 12.3, ch.z + dz);
  mesh(new ConeGeometry(3.4, 3.6, 4), M.roof, ch.x, chy + 15.4, ch.z, Math.PI / 4);
  mesh(rbox(6, 6, 10, .1), M.stone, ch.x, chy + 3, ch.z + 6.5);
  mesh(roofGeo(), M.roof, ch.x, chy + 6, ch.z + 6.5, Math.PI / 2).scale.set(11, 2.6, 7);
  // the windmill on the ridge (M2's second nest) with turning sails
  const wm = { x: NESTS.mill2.x, z: NESTS.mill2.z + 3.4 }, wmy = ground(wm.x, wm.z) - .2;
  mesh(new CylinderGeometry(2.4, 3.6, 10, 12), M.wall, wm.x, wmy + 5, wm.z);
  mesh(new ConeGeometry(2.8, 3, 12), M.roof, wm.x, wmy + 11.4, wm.z);
  const sails = new Group(); sails.position.set(wm.x - 3.1, wmy + 9.6, wm.z); sails.rotation.y = Math.PI / 2;
  for (let i = 0; i < 4; i++) { const s = new Mesh(new BoxGeometry(1.4, 9, .1), M.cloth); s.position.y = 4.6; const arm = new Group(); arm.rotation.z = i * Math.PI / 2; arm.add(s); sails.add(arm); }
  const spin = new Group(); spin.add(...sails.children); sails.add(spin); WD.sails = spin;
  sails.traverse(m => { if (m.isMesh) m.castShadow = true; }); v.scene.add(sails);
  WD.flagB = flag(v, M, ch.x + 12, chy + 6.8, ch.z - 4);
  // the ridge nest: a tumble of rocks and a log to lie behind
  const rd = NESTS.ridge, ry = ground(rd.x, rd.z);
  for (const [dx, dz, s] of [[-2.6, -2.2, 1.5], [2.4, -2.4, 1.3], [3.8, -.6, 1.1], [-3.9, -.4, 1.2], [4.6, 1.6, 1], [-4.4, 1.8, 1.3]]) mesh(rock({ size: s * 1.6, colour: '#8a867a', seed: dx * 7 + 3 }), M.plant, rd.x + dx, ry - .5, rd.z + dz);
  mesh(new CylinderGeometry(.22, .25, 3.2, 8), M.wood, rd.x, ry - .02, rd.z - 1.8).rotation.z = Math.PI / 2;

  // ---- field walls along the south road and north bank: cover for advancing squads
  WD.lowCells = new Set();
  const wallStones = new InstancedMesh(rbox(3.8, 1, .8, .2), M.stone, 160); let wsi = 0;
  const fieldWall = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 4);
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = ground(x, z);
      o.position.set(x, y + .45, z); o.rotation.set(0, Math.atan2(bx - ax, bz - az) + Math.PI / 2, 0); o.scale.set(1, 1, 1); o.updateMatrix(); wallStones.setMatrixAt(wsi++, o.matrix);
      box(x, y, z, 2.2, 1.05, 2.2, 'low'); WD.lowCells.add(cellKey(x, z));
    }
  };
  fieldWall(58, 40, 68, 62); fieldWall(28, 30, 30, 70); fieldWall(64, 98, 76, 132); fieldWall(20, 104, 36, 136);
  fieldWall(-6, -40, 24, -50); fieldWall(54, -48, 84, -44); fieldWall(-60, -60, -24, -62); fieldWall(-40, 40, -10, 58); fieldWall(-90, 80, -60, 100);
  wallStones.count = wsi; wallStones.castShadow = wallStones.receiveShadow = true; v.scene.add(wallStones);

  // ---- trees and rocks (instanced, with simpler shapes far away)
  const props = new Props(v.scene);
  props.kind('pine', tree({ kind: 'pine', height: 10, leaves: '#2f4a2c', trunk: '#4a3626' }), M.plant, { lod: [90, 220], shadowFar: 60 });
  props.kind('oak', tree({ kind: 'round', height: 9, leaves: '#4d6230', trunk: '#4e3a28' }), M.plant, { lod: [90, 220], shadowFar: 60 });
  props.kind('rock', rock({ size: 2.2, colour: '#7f7b70', seed: 4 }), M.plant, { lod: [120], shadowFar: 50 });
  const clear = (x, z) => {
    if (roadD(x, z) < 7 || Math.abs(z - RIVER(x)) < 16 || Math.abs(z - RAILZ) < 10 || Math.hypot(x + 15, z + 108) < 70 || Math.hypot(x - MILL.x, z - MILL.z) < 20) return true;
    for (const n of Object.values(NESTS)) { if (Math.hypot(x - n.x, z - n.z) < 14) return true; }
    // keep the views from the nests to the village open
    if (z > -60 && z < 150 && x > -150 && x < 110) return true;
    return false;
  };
  land.scatter(props, 'pine', 170, { below: 60, steep: .6, gap: 6, seed: 3, keepOut: (x, z) => clear(x, z) || z > -150, scale: [.8, 1.4] });
  land.scatter(props, 'oak', 150, { steep: .5, gap: 7, seed: 5, keepOut: (x, z) => clear(x, z) || z < -170, scale: [.7, 1.3] });
  land.scatter(props, 'rock', 70, { steep: .7, gap: 8, seed: 9, keepOut: clear, scale: [.5, 1.6] });
  props.done(); WD.props = props;

  // ---- moving things
  WD.train = makeTrain(M); v.scene.add(WD.train);
  WD.dust = new Particles(v, { max: 500, additive: false });
  WD.sparks = new Particles(v, { max: 300, additive: true });
  WD.trail = new Particles(v, { max: 260, additive: false });
  WD.smoke = new Particles(v, { max: 200, additive: false });
  const bullet = new Mesh(new CapsuleGeometry(.05, .22, 4, 8), M.brass); bullet.rotation.order = 'YXZ'; bullet.visible = false; v.scene.add(bullet); WD.bullet = bullet;
  // tracers from enemy fire (pooled)
  WD.tracers = Array.from({ length: 10 }, () => { const m = new Mesh(new BoxGeometry(.05, .05, 1), pbr('#ffd890', { glow: 6 })); m.visible = false; v.scene.add(m); return m; });
  // first-person rifle (shown when not scoped)
  const gun = new Group();
  const stock = new Mesh(rbox(.07, .1, .62, .02), M.wood); stock.position.set(0, -.02, .1); gun.add(stock);
  const barrel = new Mesh(new CylinderGeometry(.014, .016, .7, 8), M.iron); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .03, -.5); gun.add(barrel);
  const scopeT = new Mesh(new CylinderGeometry(.026, .026, .32, 12), M.iron); scopeT.rotation.x = Math.PI / 2; scopeT.position.set(0, .1, -.12); gun.add(scopeT);
  const bolt = new Mesh(new CylinderGeometry(.008, .008, .09, 6), M.brass); bolt.rotation.z = Math.PI / 2; bolt.position.set(.06, .04, .05); gun.add(bolt);
  gun.position.set(.16, -.17, -.38); gun.traverse(m => { m.castShadow = false; m.userData.noAO = true; }); v.cam.add(gun); WD.gun = gun; WD.bolt = bolt;
  // nest markers (a soft flare where you can move to)
  WD.marks = new Particles(v, { max: 8, additive: true });
  // a helmet that pops off on a head shot
  WD.helmets = Array.from({ length: 4 }, () => { const m = new Mesh(new SphereGeometry(.15, 12, 8, 0, TAU, 0, Math.PI / 2), pbr('#3a4238', { rough: .6 })); m.visible = false; m.castShadow = true; v.scene.add(m); return { m, vx: 0, vy: 0, vz: 0, life: 0 }; });

  // ---- paths and cover
  const coverAt = (c, r) => { if (WD.lowCells.has(c + ',' + r)) return true; const x = GX0 + (c + .5) * CELL, z = GZ0 + (r + .5) * CELL; return solidAt(x, z, solids); };
  WD.cover = new CoverMap(GC, GR, coverAt, { size: CELL, x0: GX0, y0: GZ0, low: (c, r) => WD.lowCells.has(c + ',' + r) });
  WD.nav = new NavGrid(GC, GR, CELL, (c, r) => {
    const x = GX0 + (c + .5) * CELL, z = GZ0 + (r + .5) * CELL;
    if (Math.abs(x - BRIDGE.x) < 4 && z > BRIDGE.z0 - 2 && z < BRIDGE.z1 + 2) return false;
    return coverAt(c, r) || land.height(x, z) < -.6 || land.slope(x, z) > .55;
  });
  return WD;
}
function roadZ(x) { const r = ROADS[2]; for (let i = r.length - 2; i >= 0; i--) { const [ax, az] = r[i], [bx, bz] = r[i + 1]; if (x >= ax) return az + (bz - az) * clamp((x - ax) / (bx - ax), 0, 1); } return r[0][1]; }
function cellKey(x, z) { return Math.floor((x - GX0) / CELL) + ',' + Math.floor((z - GZ0) / CELL); }
function solidAt(x, z, solids) { for (const b of solids) if (b.kind !== 'low' && x > b.x0 - .5 && x < b.x1 + .5 && z > b.z0 - .5 && z < b.z1 + .5 && b.y0 < 30) return true; return false; }
function roofGeo() {
  // a unit gable roof: 1 wide (x), 1 high, 1 deep (z), ridge along z
  const g = new THREE.BufferGeometry(), p = [-.5, 0, -.5, .5, 0, -.5, 0, 1, -.5, -.5, 0, .5, .5, 0, .5, 0, 1, .5];
  const idx = [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
  const pos = []; for (const i of idx) pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] + pos[i * 3 + 2], pos[i * 3 + 1] + pos[i * 3 + 2] * .5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function flag(v, M, x, y, z) {
  const pole = new Mesh(new CylinderGeometry(.05, .06, 4, 6), M.iron); pole.position.set(x, y - 2, z); v.scene.add(pole);
  const g = new PlaneGeometry(2, 1.1, 10, 4), cloth = new Mesh(g, M.cloth); cloth.position.set(x, y - .55, z); cloth.castShadow = true; v.scene.add(cloth);
  return { cloth, base: Float32Array.from(g.attributes.position.array), x, y, z };
}
function makeTrain(M) {
  const t = new Group(), body = pbr('#2b2d2f', { rough: .5, metal: .6 }), red = pbr('#6e2a22', { rough: .7 });
  const boiler = new Mesh(new CylinderGeometry(1.1, 1.1, 7, 16), body); boiler.rotation.z = Math.PI / 2; boiler.position.set(1, 2.1, 0); t.add(boiler);
  const cab = new Mesh(rbox(3, 3, 2.8, .15), body); cab.position.set(-3.6, 2.6, 0); t.add(cab);
  const chim = new Mesh(new CylinderGeometry(.35, .45, 1.4, 10), body); chim.position.set(3.6, 3.6, 0); t.add(chim);
  for (let i = 0; i < 4; i++) { const wh = new Mesh(new CylinderGeometry(.75, .75, .3, 14), M.iron); wh.rotation.x = Math.PI / 2; wh.position.set(-3 + i * 2.2, .75, 1.25); t.add(wh); const w2 = wh.clone(); w2.position.z = -1.25; t.add(w2); }
  for (let i = 1; i <= 5; i++) { const w = new Mesh(rbox(8.4, 3, 2.8, .15), i % 2 ? red : M.canvas); w.position.set(-6 - i * 9, 2.3, 0); t.add(w); }
  t.traverse(m => { if (m.isMesh) m.castShadow = true; });
  t.userData.chim = chim; t.visible = false; return t;
}

// soldiers: figures from gs.poses, shared materials per colour
const MATS = new Map();
const mat = c => { if (!MATS.has(c)) MATS.set(c, pbr(c, { rough: .82 })); return MATS.get(c); };
const LOOKS = {
  grey: { body: '#5b636d', legs: '#434950', skin: '#d8ab84', hair: '#3b433a', shoes: '#1e1c1a' },
  officer: { body: '#3c424a', legs: '#2c3036', skin: '#d8ab84', hair: '#30343a', shoes: '#141210' },
  ally: { body: '#6a6f3e', legs: '#555b34', skin: '#e2b48d', hair: '#4c5530', shoes: '#2a2218' },
};
const POOL = {};
function man(look) {
  const list = POOL[look] ||= [];
  const free = list.find(f => !f.userData.used);
  if (free) { free.userData.used = true; free.visible = true; return free; }
  const f = figure({ ...LOOKS[look], mat });
  const p = f.rig.parts;
  const rifle = new Mesh(new BoxGeometry(.05, 1.05, .07), mat('#3e2c1e')); rifle.position.set(0, -.36, .02); p.foreR.add(rifle);
  if (look !== 'ally') { const band = new Mesh(new CylinderGeometry(.075, .075, .07, 8), mat('#d9c25a')); band.position.y = -.14; p.armL.add(band); }
  const pack = new Mesh(rbox(.3, .34, .16, .04), mat(look === 'ally' ? '#4f5530' : '#4a4f45')); pack.position.set(0, .26, -.2); p.spine.add(pack);
  const aerial = new Mesh(new CylinderGeometry(.008, .01, 1.3, 4), mat('#222222')); aerial.position.set(.1, .95, -.24); p.spine.add(aerial);
  f.userData = { used: true, look, rifle, pack, aerial, helmet: p.head.children[1] };
  f.traverse(m => { if (m.isMesh) m.castShadow = true; });
  list.push(f); WD.v.scene.add(f);
  return f;
}
function freeMen() { for (const k in POOL) for (const f of POOL[k]) { f.userData.used = false; f.visible = false; } }

// ------------------------------------------------------------------ campaign
const CHAPTERS = [{ id: 'ashvale', name: 'Ashvale', missions: [
  { id: 'm1', name: 'The Mill Radio', stars: ['Finish', 'Stop the call inside 30 s', 'Finish under 3:00'] },
  { id: 'm2', name: 'Bells at Dusk', stars: ['Finish', 'Every one of Hale\'s squad home', 'Marksman with your first shot'] },
] }];
const SEALED = [['3', 'The Dam'], ['4', 'Night Rail'], ['5', 'Long Shadow']];
const BRIEF = {
  m1: 'Dawn. A Grey Order radio post in the old mill. Stop the operator before he calls in their column, then get out on the supply train.',
  m2: 'Dusk and rain. Sergeant Hale\'s squad must cross the stone bridge into Larkford. Find their marksman, silence the gun nest, keep the squad alive.',
};
const OAKE = 'CAPT. OAKE', HALE = 'SGT. HALE';
// a muted, filmic day for the valley (gs.sky keyframes: hour -> colours)
const DAY = [
  [0, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }],
  [5, { top: '#10162a', horizon: '#3a3a4a', sun: '#8090c0', sunI: .15, amb: .4 }],
  [6.5, { top: '#5a6a8a', horizon: '#d6bea0', sun: '#ffc890', sunI: .7, amb: .7 }],
  [8.5, { top: '#6a8cb8', horizon: '#cfd5cc', sun: '#fff0d8', sunI: 1, amb: 1 }],
  [16, { top: '#6a8cb8', horizon: '#cfd5cc', sun: '#fff0d8', sunI: 1, amb: 1 }],
  [18, { top: '#3c465e', horizon: '#9c8f8a', sun: '#ffb27a', sunI: .6, amb: .75 }],
  [20, { top: '#121a30', horizon: '#3a3448', sun: '#8090c0', sunI: .15, amb: .4 }],
  [24, { top: '#06080f', horizon: '#161a28', sun: '#7088c0', sunI: .12, amb: .35 }],
];

// ------------------------------------------------------------------ the game
function make(api) {
  const fx = new Juice();
  const camp = new Campaign(CHAPTERS).attach(api);
  const gun = new Gun({ damage: 100, rate: .95, mag: 5, reload: 2.6, spread: 0, bloom: 0, recoil: .03, sideways: .3, recover: 3, auto: false, range: 600, head: 2 });
  const me = new Health({ max: 100, regen: 14, delay: 4 });
  const bodies = new Bodies({ range: 22 });
  bodies.on('found', (b, g) => { g.sus = 1; heat = Math.min(1.2, heat + .12); });
  // The Grey Order's field commander: starts from simple rules (the teacher) and learns how you play
  const boss = new Brain(api, {
    name: 'grey-commander', inputs: 8, actions: ['hold', 'push', 'flank', 'mortar', 'watch'], hidden: [10],
    teacher: s => s[0] < .35 ? (s[1] > .45 ? 'watch' : 'hold') : s[0] < 1 ? 'push' : s[2] > .3 ? 'mortar' : s[3] > .5 ? 'flank' : 'push',
    limits: { react: .9, perSecond: 1 },
    rules: (s, a) => (a === 'mortar' && (s[0] < .9 || s[4] < .35 || s[7] < .15)) ? 'push' : ((a === 'push' || a === 'flank') && s[6] <= 0) ? 'hold' : a,
  });
  let mission, mid, state, t, score, men, allies, nest, nestId, look, scoped, glass, zoom, breath, gasp, heat, located, alertedN, squad, shots, bulletCam, train, timers;
  let cut, qte, qteKind, zip, move, mortar, bell, storm, sky, rain, tower, drums, car, op, cs, mgNest, sel, favour, saveNest, tagT, hits, ptr, pinch, lastShotT, firstShotHit, opTime, coverMsg, lineFx, slowmo, keys, endT, outroDone, briefT, quietT, mortarCool;

  const tmpV = new Vector3(), tmpA = new Vector3(), tmpB = new Vector3();
  const nestEye = n => { const y = WD.land.height(n.x, n.z) + n.up + .5; return { x: n.x, y, z: n.z }; };
  const groundAt = (x, z) => (Math.abs(x - BRIDGE.x) < 3.4 && z > BRIDGE.z0 && z < BRIDGE.z1) ? Math.max(BRIDGE.y, WD.land.height(x, z)) : WD.land.height(x, z);
  const dirOf = (yaw, pitch, out = tmpV) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const fovNow = () => 62 / (scoped ? zoom : glass ? 3.2 : 1);

  // ---- soldiers
  function soldier(o) {
    const look_ = o.look || 'grey', m = man(look_);
    const s = { get down() { return this.ko; }, get alive() { return !this.ko; }, kind: 'rifle', x: 0, y: 0, yaw: 0, hp: 1, maxHp: 1, ko: false, alert: false, route: null, ri: 0, wt: 0, speed: 0, path: null, pathTo: null, fireT: rnd(1, 3), order: { do: 'hold' }, tagged: false, look: look_, sus: 0, crouch: false, aimAt: null, vx: 0, vy: 0, ...o, m };
    m.userData.aerial.visible = s.kind === 'radio'; m.userData.pack.visible = s.kind === 'radio' || s.look === 'ally';
    m.userData.helmet.visible = true; m.userData.rifle.visible = s.kind !== 'officer';
    m.rig.play('idle', { fade: 0 }); m.rig.upper(null);
    s.gy = groundAt(s.x, s.y) + (s.lift || 0); m.position.set(s.x, s.gy, s.y); m.rotation.y = s.yaw;
    return s;
  }
  const alive = list => list.filter(s => !s.ko);
  const wakeUp = (s, why) => {
    if (s.ko || s.alert || s.fixed) return;
    s.alert = true; s.sus = 1; if (!squad.members.includes(s)) squad.members.push(s);
    squad.alerted = true; s.order = { do: 'hold' };
    if (why === 'body') say('Man down! Sniper!', 'GREY ORDER', 1.6);
  };
  function knockOut(s, head, d, viaCam) {
    if (s.ko) return;
    s.ko = true; s.m.rig.play('downed', { fade: .25 }); s.m.rig.upper(null);
    squad.hurt(s); squad.cover.free(s);
    bodies.add(s.x, s.y, s);
    let pts = 100; const tags = [];
    if (head) { pts += 100; tags.push('HEAD'); popHelmet(s); }
    if (d > 200) { pts += Math.round(d / 2); tags.push(Math.round(d) + ' M'); }
    if (masked()) { pts += 50; tags.push('COVERED'); }
    if (!s.alert) { pts += 50; tags.push('UNSEEN'); }
    if (viaCam) pts += 50;
    score += pts; api.score(score);
    s.koFx = { pts, tags, t: 0 };
    sounds.coin(1.2); haptic(head ? 'success' : 'medium');
    for (let i = 0; i < 14; i++) WD.sparks.emit({ x: s.x, y: s.gy + 1.6, z: s.y, vx: rnd(-1.5, 1.5), vy: rnd(1, 3), vz: rnd(-1.5, 1.5), life: .9, size: .16, col: [3, 2.4, .6], drag: 2, grav: 2 });
    // anyone close and calm hears it and gets suspicious
    for (const o of men) if (!o.ko && !o.alert && Math.hypot(o.x - s.x, o.y - s.y) < 26) o.sus = Math.max(o.sus, .6);
    if (squad.alerted) boss.feel(.3);
  }
  function popHelmet(s) {
    const h = WD.helmets.find(q => q.life <= 0) || WD.helmets[0]; s.m.userData.helmet.visible = false;
    s.m.rig.parts.head.getWorldPosition(tmpA);
    h.m.position.copy(tmpA).y += .14; h.m.visible = true; h.life = 4; h.vx = rnd(-1, 1); h.vy = 5; h.vz = rnd(-1, 1); h.spin = rnd(6, 12);
  }
  function hitSpheres(s, out) {
    const p = s.m.rig.parts; out.length = 0;
    p.head.getWorldPosition(tmpA); out.push([tmpA.x, tmpA.y + .12, tmpA.z, .17, true]);
    p.spine.getWorldPosition(tmpA); out.push([tmpA.x, tmpA.y + .24, tmpA.z, .27, false]);
    p.hips.getWorldPosition(tmpA); out.push([tmpA.x, tmpA.y - .05, tmpA.z, .24, false]);
    return out;
  }
  const SPH = [];

  // ---- the player's shots
  function fire() {
    if (state !== 'play' || move || bulletCam) return;
    const eye = WD.v.cam.position, [sy, sp] = sway();
    const d = dirOf(look.yaw + sy, look.pitch + sp + BORE, tmpB).clone();
    const s = gun.pull({ x: eye.x, y: eye.y, z: eye.z }, d, true); gun.pull(eye, d, false);
    if (!s.length) { if (gun.reloading) tone(220, { len: .05, wave: 'square', vol: .03 }); return; }
    lastShotT = t; if (cs && !cs.ko) gun.shotsAtCs++;
    const b = { x: eye.x, y: eye.y - .05, z: eye.z, vx: d.x * V0, vy: d.y * V0, vz: d.z * V0, life: 2.2, dist: 0, masked: masked() };
    shots.push(b);
    // loud unless something covers it
    heat = clamp(heat + (b.masked ? .04 : .3), 0, 1.2);
    for (const o of men) if (!o.ko && !o.alert && !b.masked) o.sus = Math.max(o.sus, .35);
    noise(.5, { vol: .32, from: 2600, to: 120 }); tone(70, { len: .25, wave: 'sine', vol: .25, slide: -30 });
    haptic('heavy'); fx.shake(scoped ? 2 : 5);
    if (!scoped) for (let i = 0; i < 10; i++) WD.smoke.emit({ x: eye.x + d.x * 1.2, y: eye.y + d.y * 1.2 - .1, z: eye.z + d.z * 1.2, vx: rnd(-.4, .4) + d.x * 2, vy: rnd(0, .5), vz: rnd(-.4, .4) + d.z * 2, life: 1.4, size: .5, grow: 3, col: [.75, .72, .66], a: .35, drag: 2 });
    // bullet cam for good long shots (worked out ahead from where things are heading)
    if (!gs.prefs.reduceMotion) {
      const p = predict(b);
      if (p && (p.d > 150 || (p.head && p.d > 90))) { bulletCam = { b, t: 0, target: p.s, scale: clamp(p.time / 1.9, .02, .4), hold: 0, from: { x: eye.x, y: eye.y, z: eye.z } }; WD.bullet.visible = true; tone(880, { len: .5, wave: 'sine', vol: .04, slide: -500 }); }
    }
    boltT = 1.1;
  }
  let boltT = 0;
  function sway() {
    if (!scoped) return [0, 0];
    const amp = .0032 * (breath.held && breath.v > 0 ? .1 : 1) * (gasp > 0 ? 2.6 : 1) * (1 + (1 - me.frac) * .8) * (8 / zoom) ** .3;
    return [(Math.sin(t * 1.1) * .6 + Math.sin(t * 2.3 + 1) * .4) * amp, (Math.sin(t * 1.7 + 2) * .6 + Math.sin(t * .7) * .4) * amp * .8];
  }
  function predict(b0) {
    const b = { ...b0 };
    for (let i = 0; i < 160; i++) {
      const dt = 1 / 120, x0 = b.x, y0 = b.y, z0 = b.z;
      stepBullet(b, dt);
      const h = hitTest(x0, y0, z0, b.x, b.y, b.z, i * dt);
      if (h) return h.s ? { s: h.s, head: h.head, d: h.d, time: i * dt } : null;
    }
    return null;
  }
  function stepBullet(b, dt) {
    b.vy -= GRAV * dt; b.vx += wind.x * WIND_K * dt; b.vz += wind.z * WIND_K * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
  }
  // what a bullet path from p0 to p1 hits first: { t, s?, head?, box?, ground?, d }
  function hitTest(x0, y0, z0, x1, y1, z1, ahead = 0) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz) || 1e-6, eye = WD.v.cam.position;
    let best = null; const take = (tt, o) => { if (tt >= 0 && tt <= 1 && (!best || tt < best.t)) best = { t: tt, ...o }; };
    for (const s of men) {
      if (s.ko) continue;
      const sx = s.x + s.vx * ahead, sz = s.y + s.vy * ahead;
      const k = clamp(((sx - x0) * dx + (s.gy + 1 - y0) * dy + (sz - z0) * dz) / (L * L), 0, 1);
      if (Math.hypot(x0 + dx * k - sx, y0 + dy * k - s.gy - 1, z0 + dz * k - sz) > 2.2) continue;
      for (const [cx, cy, cz, r, head] of hitSpheres(s, SPH)) {
        const ox = x0 - cx - s.vx * ahead, oy = y0 - cy, oz = z0 - cz - s.vy * ahead, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - r * r, a = L * L, disc = bq * bq - a * cq;
        if (disc >= 0) take((-bq - Math.sqrt(disc)) / a, { s, head });
      }
    }
    for (const b of drums || []) { if (b.gone) continue; const ox = x0 - b.x, oy = y0 - b.y - .5, oz = z0 - b.z, bq = ox * dx + oy * dy + oz * dz, cq = ox * ox + oy * oy + oz * oz - .5, disc = bq * bq - L * L * cq; if (disc >= 0) take((-bq - Math.sqrt(disc)) / (L * L), { drum: b }); }
    for (const b of WD.solids) {
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, d, lo, hi] of [[x0, dx, b.x0, b.x1], [y0, dy, b.y0, b.y1], [z0, dz, b.z0, b.z1]]) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; }
        let a = (lo - p) / d, c = (hi - p) / d; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { ok = false; break; }
      }
      if (ok) take(t0, { box: b });
    }
    for (let i = 1, n = Math.ceil(L / 1.5); i <= n; i++) { const k = i / n, x = x0 + dx * k, y = y0 + dy * k, z = z0 + dz * k; if (y < WD.land.height(x, z)) { take(k, { ground: true }); break; } }
    if (best) best.d = Math.hypot(x0 + dx * best.t - eye.x, y0 + dy * best.t - eye.y, z0 + dz * best.t - eye.z);
    return best;
  }
  function updateShots(dt) {
    for (const b of shots) {
      const steps = Math.max(1, Math.ceil(dt * V0 / 4));
      for (let i = 0; i < steps && !b.dead; i++) {
        const x0 = b.x, y0 = b.y, z0 = b.z; stepBullet(b, dt / steps);
        const h = hitTest(x0, y0, z0, b.x, b.y, b.z);
        if (h) { b.dead = true; const hx = x0 + (b.x - x0) * h.t, hy = y0 + (b.y - y0) * h.t, hz = z0 + (b.z - z0) * h.t; impact(b, h, hx, hy, hz); }
        else if (b.life <= 0) b.dead = true;
      }
      if (!b.dead && Math.random() < .9) WD.trail.emit({ x: b.x, y: b.y, z: b.z, life: .5, size: .07, col: [.85, .85, .8], a: .5, grow: 2 });
    }
    shots = shots.filter(s => !s.dead);
  }
  function impact(b, h, x, y, z) {
    const viaCam = bulletCam && bulletCam.b === b;
    if (viaCam) { bulletCam.hold = .65; bulletCam.at = { x, y, z }; }
    if (h.s) {
      knockOut(h.s, h.head, h.d, viaCam);
      if (firstShotHit == null) firstShotHit = true;
      if (h.s === cs && gun.shotsAtCs === 1) cs.oneShot = true;
    } else {
      if (firstShotHit == null) firstShotHit = false;
      const stoneHit = h.box && h.box.kind !== 'house';
      for (let i = 0; i < 12; i++) WD.dust.emit({ x, y: y + .1, z, vx: rnd(-1.5, 1.5), vy: rnd(.5, 3), vz: rnd(-1.5, 1.5), life: 1.2, size: .45, grow: 2, col: stoneHit ? [.7, .68, .62] : [.52, .44, .32], a: .8, drag: 2.5, grav: 3 });
      if (stoneHit) for (let i = 0; i < 6; i++) WD.sparks.emit({ x, y, z, vx: rnd(-3, 3), vy: rnd(0, 3), vz: rnd(-3, 3), life: .25, size: .08, col: [4, 3, 1.4], drag: 1 });
      // a near miss makes them jumpy
      for (const s of men) if (!s.ko && Math.hypot(s.x - x, s.y - z) < 8) { s.sus = 1; if (!b.masked || Math.hypot(s.x - x, s.y - z) < 3) wakeUp(s, 'miss'); }
    }
    if (h.drum) drumHit(h.drum);
  }

  // ---- enemies' shots at you (and at Hale's squad)
  const enemyShot = (s, target, kind) => {
    const from = { x: s.x, y: s.gy + 1.45, z: s.y }, eye = WD.v.cam.position;
    for (let i = 0; i < 4; i++) WD.sparks.emit({ x: from.x, y: from.y, z: from.z, vx: rnd(-1, 1), vy: rnd(0, 1), vz: rnd(-1, 1), life: .08, size: .5, col: [5, 3.5, 1.5] });
    const toMe = target === 'me', d = toMe ? Math.hypot(from.x - eye.x, from.z - eye.z) : Math.hypot(from.x - target.x, from.z - target.y);
    if (toMe) {
      const exposed = scoped || glass ? 1 : .55;
      const skill = .6 + boss.skill * .6;
      const chance = clamp((kind === 'cs' ? .9 : kind === 'mg' ? .3 : .42) - d / (kind === 'cs' ? 900 : 320), .04, .9) * exposed * skill;
      const hit = Math.random() < chance;
      tracer(from, { x: eye.x + rnd(-2, 2) * (hit ? .2 : 1), y: eye.y + rnd(-1, 1.4) * (hit ? .2 : 1), z: eye.z + rnd(-2, 2) * (hit ? .2 : 1) });
      setTimeout0(d / 600, () => {
        if (state !== 'play' || move) return;
        if (hit) { hurtMe(kind === 'cs' ? 42 : kind === 'mg' ? 9 : 15, from); haptic('error'); fx.shake(4); tone(140, { len: .15, wave: 'sawtooth', vol: .08, slide: -60 }); if (me.hp > 0) boss.feel(.6); if (me.hp < 25) boss.feel(-.5); }
        else { tone(rnd(1800, 2600), { len: .09, wave: 'sine', vol: .05, slide: -1200 }); boss.feel(.2); }
      });
      noise(.12, { vol: .1 * clamp(80 / d, .15, 1), from: 1600, to: 300 });
    } else {
      tracer(from, { x: target.x + rnd(-1, 1), y: target.gy + 1, z: target.y + rnd(-1, 1) });
      const chance = (kind === 'mg' ? .4 : .22) * (target.crouch ? .35 : 1);
      if (Math.random() < chance && !target.ko) { target.hp -= kind === 'mg' ? 12 : 18; if (target.hp <= 0) allyDown(target); }
    }
  };
  function tracer(a, b) {
    const m = WD.tracers.find(q => !q.visible) || WD.tracers[0];
    m.visible = true; m.userData = { a, b, t: 0, life: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 500 + .05 };
  }
  function updateTracers(dt) {
    for (const m of WD.tracers) {
      if (!m.visible) continue; const u = m.userData; u.t += dt; const k = u.t / u.life;
      if (k >= 1) { m.visible = false; continue; }
      const x = lerp(u.a.x, u.b.x, k), y = lerp(u.a.y, u.b.y, k), z = lerp(u.a.z, u.b.z, k);
      m.position.set(x, y, z); m.lookAt(u.b.x, u.b.y, u.b.z); m.scale.set(1, 1, 6);
    }
  }
  function hurtMe(n, from) {
    me.hurt(n); const e = WD.v.cam.position, rel = angDiff(Math.atan2(-(from.x - e.x), -(from.z - e.z)), look.yaw);
    hits.push({ angle: -rel, life: 1.2 });
  }
  // game-time delays (they pause with the game)
  function setTimeout0(sec, fn) { timers.push({ at: t + sec, fn }); }

  // ---- masking sounds: the train and the church bell
  function masked() { return (train.on && Math.abs(train.x) < 190) || (bell.ring > 0) || (storm > 0); }

  // ---- mortars (the commander's call)
  function callMortars() {
    if (mortar || mortarCool > 0 || !nest) return;
    mortar = { n: 3, next: 1.2, at: nestEye(nest) }; mortarCool = 16;
    say('Mortars! Move, Wren!', OAKE, 2);
  }
  function updateMortar(dt) {
    mortarCool -= dt;
    if (!mortar) return;
    mortar.next -= dt;
    if (mortar.next <= 0) {
      const i = 3 - mortar.n, off = [24, 12, 5][i] * rnd(.8, 1.2), a = rnd(0, TAU), x = mortar.at.x + Math.cos(a) * off, z = mortar.at.z + Math.sin(a) * off, y = WD.land.height(x, z);
      tone(1400, { len: 1, wave: 'sine', vol: .05, slide: -900 });
      setTimeout0(1, () => {
        for (let k = 0; k < 30; k++) WD.dust.emit({ x, y: y + .3, z, vx: rnd(-5, 5), vy: rnd(3, 11), vz: rnd(-5, 5), life: 2, size: 1.2, grow: 2.5, col: [.45, .38, .3], a: .9, drag: 1.5, grav: 6 });
        for (let k = 0; k < 10; k++) WD.sparks.emit({ x, y: y + .5, z, vx: rnd(-6, 6), vy: rnd(2, 9), vz: rnd(-6, 6), life: .4, size: .6, col: [5, 2.6, .8], drag: 2 });
        noise(.9, { vol: .45, from: 900, to: 50 }); haptic('heavy');
        if (nest && !move) {
          const e = nestEye(nest), dd = Math.hypot(e.x - x, e.z - z); fx.shake(clamp(30 / dd, 2, 12));
          if (dd < 8) { hurtMe(Math.round(34 * (1 - dd / 9)), { x, y, z }); boss.feel(me.hp > 0 ? 1 : .2); }
        }
      });
      mortar.next = 2.2; if (--mortar.n <= 0) mortar = null;
    }
  }

  // ---- moving between nests
  function nextNest() { const list = mission.nests; const i = list.indexOf(nestId); return list[i + 1] || (mid === 'm2' ? list[0] : null); }
  function startMove(to) {
    if (move || !to) return;
    const from = nestEye(nest), dest = nestEye(NESTS[to]);
    scoped = false; glass = false; breath.held = false;
    if (nestId === 'ridge' && to === 'tower') {
      zip = new Zipline({ x: from.x, y: from.y + 2.2, z: from.z }, { x: dest.x, y: dest.y + 1.6, z: dest.z }, { gravity: 170, drag: .14 });
      zip.ride(); move = { to, kind: 'zip', t: 0 };
      noise(5, { vol: .06, from: 3000, to: 1500, filter: 'bandpass', q: 3 });
      say('Riding the line down. Keep your head low.', OAKE, 2.4);
    } else {
      const mid_ = { x: (from.x + dest.x) / 2, y: Math.max(from.y, dest.y) + 6, z: (from.z + dest.z) / 2 + 10 };
      move = { to, kind: 'run', t: 0, cs: new Cutscene([{ at: 0, cam: [from, mid_, dest], look: NESTS[to].face && { x: NESTS[to].face.x, y: 8, z: NESTS[to].face.z }, time: 3.2, ease: 'inOut' }], { bars: .08 }) };
    }
    haptic('medium');
  }
  function arrive(to) {
    const old = nestId; nestId = to; nest = NESTS[to]; move = null; zip = null;
    heat *= .25; located = false; mortar = null; squad.still = 0;
    // they keep hunting where you were
    squadTarget = { x: NESTS[old].x, y: NESTS[old].z };
    const e = nestEye(nest); look.yaw = Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)); look.pitch = -.06;
    say('In position: ' + nest.name + '.', null, 1.6);
  }
  let squadTarget = null;

  // ---- lines on the radio
  function say(text, who = null, time = 2.6) { lineFx = { text, who, life: time, t: 0 }; }

  // ---- Hale's squad (mission 2)
  function allyDown(a) { if (a.ko) return; a.ko = true; a.m.rig.play('downed'); say(a.name + ' is down!', HALE, 2); haptic('warning'); }

  // ---- the watchtower and its fuel drums (mission 2)
  function buildTower() {
    const M = WD.M, g = new Group(), x = 86, z = -70, y = WD.land.height(x, z);
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) { const l = new Mesh(new BoxGeometry(.3, 7, .3), M.wood); l.position.set(dx, 3.5, dz); g.add(l); }
    const deck = new Mesh(new BoxGeometry(4.2, .3, 4.2), M.wood); deck.position.y = 7; g.add(deck);
    const hut = new Mesh(new BoxGeometry(3.6, 1.2, 3.6), M.wood); hut.position.y = 7.7; g.add(hut);
    const top = new Mesh(new ConeGeometry(3.2, 1.6, 4), M.roof); top.position.y = 9.6; top.rotation.y = Math.PI / 4; g.add(top);
    g.position.set(x, y, z); g.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; }); WD.v.scene.add(g);
    return { g, x, z, y, pieces: [] };
  }
  function drumHit(b) { if (b.gone) return; boom.light(b, true); }
  const boom = new Explosives({ fuse: .2, radius: 7, damage: 100 });
  boom.on('boom', (e, b) => {
    const { x, y, z } = e.at;
    for (let k = 0; k < 40; k++) WD.dust.emit({ x, y: y + 1, z, vx: rnd(-6, 6), vy: rnd(2, 12), vz: rnd(-6, 6), life: 2.6, size: 1.6, grow: 2.5, col: [.2, .19, .18], a: .9, drag: 1.2, grav: 3 });
    for (let k = 0; k < 30; k++) WD.sparks.emit({ x, y: y + 1, z, vx: rnd(-8, 8), vy: rnd(3, 12), vz: rnd(-8, 8), life: .7, size: 1, col: [6, 2.8, .6], drag: 1.6, grav: 4 });
    noise(1.4, { vol: .5, from: 700, to: 40 }); haptic('heavy'); fx.shake(6);
    for (const s of men) if (!s.ko && Math.hypot(s.x - x, s.y - z) < e.radius) knockOut(s, false, 0, false);
    if (tower && !tower.down && Math.hypot(tower.x - x, tower.z - z) < 9) {
      tower.down = true; const pieces = [];
      for (const m of [...tower.g.children]) { m.updateMatrixWorld(true); const ps = shatter(m, { pieces: 5, at: { x, y: y + 2, z }, inside: WD.M.wood, seed: 3 }); pieces.push(...ps); }
      tower.g.removeFromParent();
      for (const p of pieces) { p.castShadow = true; const dx = p.position.x - x, dz = p.position.z - z, l = Math.hypot(dx, dz) || 1; p.userData.v = { x: dx / l * rnd(3, 8), y: rnd(3, 9), z: dz / l * rnd(3, 8), r: rnd(-4, 4) }; }
      tower.pieces = pieces;
    }
    if (b?.mesh) b.mesh.visible = false;
    if (car && car.on && Math.hypot(car.x - x, car.z - z) < 14) { car.stopped = true; car.smoke = true; if (car.gunner && !car.gunner.ko) knockOut(car.gunner, false, 0, false); }
    score += 150; api.score(score);
  });
  function buildCar() {
    const M = WD.M, g = new Group(), body = pbr('#4a4f48', { rough: .6, metal: .4 });
    const hull = new Mesh(rbox(2.4, 1.4, 5, .2), body); hull.position.y = 1.2; g.add(hull);
    const turret = new Mesh(rbox(1.5, .7, 1.6, .2), body); turret.position.set(0, 2.2, -.3); g.add(turret);
    const barrel = new Mesh(new CylinderGeometry(.08, .08, 1.6, 8), M.iron); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 2.2, -1.6); g.add(barrel);
    for (const [dx, dz] of [[-1.2, -1.6], [1.2, -1.6], [-1.2, 1.6], [1.2, 1.6]]) { const w = new Mesh(new CylinderGeometry(.55, .55, .4, 14), M.dark); w.rotation.z = Math.PI / 2; w.position.set(dx, .55, dz); g.add(w); }
    g.traverse(m => { if (m.isMesh) m.castShadow = true; }); g.visible = false; WD.v.scene.add(g);
    temps.push(g); return { g, x: 240, z: -78, stopped: false, on: false, fireT: 3 };
  }

  // ---- missions
  const missions = {
    m1: {
      nests: ['ridge', 'tower'], time: 7.6, weather: 'clear', fog: .0028,
      setup() {
        op = soldier({ kind: 'radio', x: MILL.x - 2, y: MILL.z + 5, lift: 4.55, yaw: Math.PI, fixed: true, route: [[MILL.x - 3, MILL.z + 5, 4], [MILL.x + 3, MILL.z + 5, 3], [MILL.x + 1, MILL.z + 3.2, 3]] });
        op.send = 0; op.sending = false;
        men.push(op,
          soldier({ x: MILL.x + 9, y: MILL.z + 8, route: [[MILL.x + 9, MILL.z + 8, 3], [MILL.x - 9, MILL.z + 8, 2], [MILL.x - 9, MILL.z - 8, 3], [MILL.x + 9, MILL.z - 8, 2]] }),
          soldier({ x: MILL.x - 12, y: MILL.z - 2, yaw: Math.PI, route: [[MILL.x - 12, MILL.z - 2, 5], [MILL.x - 20, MILL.z - 18, 4]] }),
          soldier({ x: -10, y: -96, yaw: 2.2 }), soldier({ x: -18, y: -92, yaw: .4, route: [[-18, -92, 6], [-30, -70, 5]] }),
          soldier({ x: 10, y: -100, yaw: -1 }),
          soldier({ x: -60, y: RAILZ + 3, route: [[-60, RAILZ + 3, 2], [60, RAILZ + 3, 2]] }),
          soldier({ kind: 'officer', look: 'officer', x: -8, y: -104, yaw: Math.PI, spotter: true }),
        );
      },
      intro: () => [
        { at: 0, cam: [{ x: -90, y: 46, z: -190 }, { x: 10, y: 28, z: -70 }, { x: 60, y: 30, z: 60 }, { ...nestEye(NESTS.ridge), y: nestEye(NESTS.ridge).y + .2, z: NESTS.ridge.z + 3 }], look: (tt) => tt < 4 ? { x: MILL.x, y: 6, z: MILL.z } : { x: 20, y: 6, z: -60 }, time: 7.2, ease: 'inOut' },
        { at: .3, say: 'Wren, Oake here. The Grey Order keeps a radio post in the old mill.', who: OAKE, time: 3.3 },
        { at: 3.7, say: 'If their operator calls in the column, our raid is finished. Stop him.', who: OAKE, time: 3.4 },
      ],
      *script(m) {
        yield m.until(() => state === 'play');
        m.objective('Drag to look round. Find the mill by the river', { at: { x: MILL.x, y: 6, z: MILL.z } });
        yield m.any(m.until(() => facing(MILL.x, MILL.z) < .2), m.wait(8));
        m.objective('Tap the glasses and hold them on the man with the aerial', { at: op });
        say('Field glasses first. Find the man with the aerial.', OAKE, 3);
        yield m.until(() => op.tagged || op.ko);
        if (!op.ko) { op.sending = true; say('He\'s calling it in. You have a minute!', OAKE, 3); }
        m.objective('Scope in, hold your breath and stop the operator', { at: op });
        coverMsg = 'Wait for the train: it covers the sound of your shot';
        yield m.until(() => op.ko);
        opTime = op.send;
        m.checkpoint('radio');
        say('Radio\'s dead. Their patrol is stirring. Thin them out.', OAKE, 3);
        truckIn();
        const o = m.objective('Knock out the patrol');
        yield m.until(() => { const n = alive(men).length; o.text = 'Knock out the patrol: ' + n + ' left'; return n <= 1; });
        m.checkpoint('patrol');
        if (nestId !== 'tower') { m.objective('The supply train is due. Tap MOVE and ride the line to the water tower'); say('Supply train\'s due. Ride the line down to the water tower!', OAKE, 3); yield m.until(() => nestId === 'tower'); }
        m.objective('Jump onto the train as it passes under you');
        train.final = true; train.on = true; train.x = -235; train.speed = 14;
        yield m.until(() => train.x > -150);
        qteKind = 'train'; qte.start([{ kind: 'tap', time: 1.6 }, { kind: 'swipe', dir: 'down', time: 1.4 }], { slow: .3 });
        yield m.until(() => !qte.active);
        outro([{ at: 0, cam: [{ x: train.x + 6, y: RAILH + 6, z: RAILZ + 12 }, { x: train.x + 30, y: RAILH + 9, z: RAILZ + 28 }], look: (tt) => ({ x: train.x - 10, y: RAILH + 3, z: RAILZ }), time: 4.5, ease: 'out' },
          { at: .2, say: 'Good work, Wren. The column never got the call.', who: OAKE, time: 3.6 }]);
        yield m.until(() => outroDone);
      },
      stars: () => [true, opTime != null && opTime < 30, mission.time < 180],
    },
    m2: {
      nests: ['chapel', 'mill2'], time: 18.1, weather: 'rain', fog: .0045,
      setup() {
        const cy = WD.churchTop;
        cs = soldier({ kind: 'cs', x: CHURCH.x, y: CHURCH.tz + 1.6, lift: cy.y - groundAt(CHURCH.x, CHURCH.tz + 1.6) + .2, yaw: 0, fixed: true, crouch: true, see: 0 });
        mgNest = { x: BRIDGE.x - 2, z: -27 };
        const g1 = soldier({ kind: 'mg', x: mgNest.x, y: mgNest.z, yaw: 0, fixed: true, crouch: true }), g2 = soldier({ kind: 'mg2', x: mgNest.x + 2, y: mgNest.z - 1.5, yaw: 0, fixed: true, crouch: true });
        men.push(cs, g1, g2,
          soldier({ x: 22, y: -92, yaw: .3 }), soldier({ x: 56, y: -88, yaw: -.2 }), soldier({ x: -4, y: -70, yaw: 0, route: [[-4, -70, 4], [24, -56, 4]] }),
          soldier({ x: 30, y: -40, yaw: .1, route: [[30, -40, 3], [56, -42, 3]] }),
          soldier({ kind: 'officer', look: 'officer', x: -6, y: -98, yaw: 0, spotter: true }),
        );
        allies = ['Hale', 'Pike', 'Dunn'].map((name, i) => { const a = soldier({ look: 'ally', x: BRIDGE.x - 2 + i * 2, y: 44 + i * 3, yaw: Math.PI, fixed: true, ally: true, name }); a.hp = 100; a.leg = 0; return a; });
        // the sandbag nest by the bridge
        sandbags(mgNest.x + 1, mgNest.z + 2.2);
        tower = buildTower();
        drums = [0, 1, 2].map(i => {
          const b = boom.add({ x: tower.x - 1.2 + i * 1.1, y: tower.y, z: tower.z - 3.4, size: .5 });
          b.mesh = new Mesh(new CylinderGeometry(.4, .4, 1, 12), WD.M.drum); b.mesh.position.set(b.x, b.y + .5, b.z); b.mesh.castShadow = true; WD.v.scene.add(b.mesh); temps.push(b.mesh);
          return b;
        });
        car = buildCar();
        // the car's hatch gunner: knock him out and it stops too
        car.gunner = soldier({ kind: 'cargun', x: car.x, y: car.z, lift: 2.1, fixed: true });
        car.gunner.m.visible = false; men.push(car.gunner);
      },
      intro: () => [
        { at: 0, cam: [{ x: 120, y: 30, z: -120 }, { x: 70, y: 18, z: -20 }, { x: 46, y: 18, z: 64 }, { ...nestEye(NESTS.chapel), y: WD.land.height(NESTS.chapel.x, NESTS.chapel.z) + 2 }], look: { x: 40, y: 4, z: 0 }, time: 6.4, ease: 'inOut' },
        { at: .3, say: 'Hale\'s squad crosses the old bridge at dusk. Keep them alive, Wren.', who: OAKE, time: 3.2 },
        { at: 3.6, say: 'Get up that belfry. The bell will cover your shots.', who: OAKE, time: 2.8 },
      ],
      *script(m) {
        yield m.until(() => state === 'play');
        qteKind = 'climb'; qte.start([{ kind: 'swipe', dir: 'up', time: 1.8, optional: true }, { kind: 'swipe', dir: 'up', time: 1.6, optional: true }, { kind: 'hold', hold: .7, time: 2.4, optional: true }], { slow: 1 });
        climbT = 0;
        yield m.until(() => !qte.active);
        m.objective('A marksman watches from the church tower. Find his glint', { at: cs });
        say('Careful: their marksman is in the church tower. Look for the glint.', OAKE, 3.2);
        yield m.until(() => cs.ko);
        m.checkpoint('marksman');
        say('Moving onto the bridge. Cover us, Wren.', HALE, 2.6);
        allyGo = 1;
        yield m.until(() => allies.some(a => a.y < 14) || m.time > 999);
        const g = men.filter(s => s.kind === 'mg' || s.kind === 'mg2'); mgOn = true;
        say('Gun nest! We\'re pinned!', HALE, 2.2);
        m.objective('Silence the gun nest at the far end of the bridge', { at: { x: mgNest.x, y: 5, z: mgNest.z } });
        yield m.until(() => g.every(s => s.ko));
        allyGo = 2; mgOn = false;
        say('Gun\'s quiet. Pushing up!', HALE, 2.2);
        const rifles = men.filter(s => s.kind === 'rifle');
        for (const s of rifles) wakeUp(s);
        const o = m.objective('Clear the bridgehead');
        yield m.until(() => { const n = alive(rifles).length; o.text = 'Clear the bridgehead: ' + n + ' left'; return n === 0; });
        car.on = true; car.g.visible = true;
        say('Armour on the east road! Hit the fuel drums under the watchtower!', HALE, 3.2);
        m.objective('Shoot the red fuel drums as the armoured car passes', { at: { x: tower.x, y: tower.y + 1, z: tower.z + 3 } });
        yield m.until(() => car.stopped);
        allyGo = 3;
        say('That stopped it! Into the square, lads.', HALE, 2.6);
        m.objective('Cover the squad into the square');
        yield m.until(() => alive(allies).every(a => a.done));
        outro([{ at: 0, cam: [{ x: -5, y: 9, z: -70 }, { x: -25, y: 12, z: -78 }], look: { x: -12, y: 7, z: -96 }, time: 4.2, ease: 'out' },
          { at: .2, say: 'Larkford is ours. Fine shooting, Wren.', who: HALE, time: 3.6 }]);
        yield m.until(() => outroDone);
      },
      stars: () => [true, allies.every(a => !a.ko), !!cs.oneShot],
    },
  };
  let climbT = 0, allyGo = 0, mgOn = false; const temps = [];
  function sandbags(x, z) {
    if (!WD.bags) { WD.bags = new InstancedMesh(rbox(1.1, .45, .6, .2), WD.M.sand, 24); WD.bags.castShadow = WD.bags.receiveShadow = true; WD.v.scene.add(WD.bags); }
    const o = new Object3D(); let i = 0; const y = groundAt(x, z);
    for (let row = 0; row < 2; row++) for (let k = 0; k < 7; k++) { const a = -1.3 + k * .43; o.position.set(x + Math.sin(a) * 2.4, y + .22 + row * .42, z - Math.cos(a) * -2.4 * -1); o.rotation.set(0, a, 0); o.updateMatrix(); WD.bags.setMatrixAt(i++, o.matrix); }
    WD.bags.count = i; WD.bags.instanceMatrix.needsUpdate = true; WD.bags.visible = true;
    WD.solids.push({ x0: x - 2.6, x1: x + 2.6, y0: y, y1: y + .85, z0: z - .5, z1: z + .6, kind: 'low', temp: true });
  }
  function truckIn() {
    // four more come down the east road
    for (let i = 0; i < 4; i++) { const s = soldier({ x: 150 + i * 3, y: -72 - i, yaw: -Math.PI / 2 }); s.route = [[60 - i * 6, -86 + i * 2, 2]]; s.late = true; s.sus = .7; men.push(s); }
  }
  function facing(x, z) { const e = WD.v.cam.position; return Math.abs(angDiff(look.yaw, Math.atan2(-(x - e.x), -(z - e.z)))); }
  function outro(steps) { cut = new Cutscene(steps, { bars: .14 }); cut.on('end', () => { outroDone = true; }); state = 'outro'; scoped = false; glass = false; }

  // ---- moving soldiers
  function walk(s, tx, tz, speed, dt) {
    if ((s.pathTo?.x !== tx || s.pathTo?.z !== tz) && pathBudget > 0) {
      pathBudget--; s.pathTo = { x: tx, z: tz };
      const p = WD.nav.path(s.x - GX0, s.y - GZ0, tx - GX0, tz - GZ0);
      s.path = p ? p.map(q => ({ x: q.x + GX0, z: q.y + GZ0 })) : [{ x: tx, z: tz }]; s.pi = 1;
      if (s.path.length < 2) s.pi = 0;
    }
    if (!s.path || s.pathTo?.x !== tx || s.pathTo?.z !== tz) s.path = [{ x: tx, z: tz }], s.pi = 0;
    const q = s.path[Math.min(s.pi, s.path.length - 1)], dx = q.x - s.x, dz = q.z - s.y, d = Math.hypot(dx, dz);
    if (d < .4) { if (s.pi < s.path.length - 1) s.pi++; else { s.vx = s.vy = 0; return true; } }
    const k = Math.min(1, speed * dt / (d || 1)); s.vx = dx / (d || 1) * speed; s.vy = dz / (d || 1) * speed;
    s.x += dx * k; s.y += dz * k; s.yaw = turnTo(s.yaw, Math.atan2(dx, dz), dt * 6);
    return false;
  }
  const turnTo = (a, b, k) => a + clamp(angDiff(b, a), -k, k);
  function updateMen(dt) {
    const eye = WD.v.cam.position; pathBudget = 2;
    for (const s of men) {
      const m = s.m; let speed = 0;
      if (s.ko) { m.rig.update(dt, { speed: 0 }); if (s.koFx) s.koFx.t += dt; continue; }
      s.vx = s.vy = 0;
      if (s.kind === 'radio') {
        // paces the balcony; steps inside (behind the wall) now and then
        if (s.route) { const r = s.route[s.ri]; if (Math.hypot(r[0] - s.x, r[1] - s.y) > .2) { const d = Math.hypot(r[0] - s.x, r[1] - s.y), k = Math.min(1, 1.1 * dt / d); s.vx = (r[0] - s.x) / d * 1.1; s.vy = (r[1] - s.y) / d * 1.1; s.x += (r[0] - s.x) * k; s.y += (r[1] - s.y) * k; speed = 1.1; s.yaw = turnTo(s.yaw, Math.atan2(r[0] - s.x, r[1] - s.y), dt * 4); } else if ((s.wt += dt) > r[2]) { s.wt = 0; s.ri = (s.ri + 1) % s.route.length; } }
        if (s.sending) { s.send += dt; if (s.send > 60) mission.fail('The call went through. The column is coming.'); }
        m.rig.upper(s.sending ? 'aim' : null);
      } else if (s.kind === 'cs') {
        // the marksman: scans, then settles on you when he sees you looking at him (scope glint both ways)
        const lookAtMe = Math.atan2(eye.x - s.x, eye.z - s.y);
        s.yaw = turnTo(s.yaw, lookAtMe + Math.sin(t * .4) * .5 * (1 - s.see), dt * 1.5);
        const watching = Math.abs(angDiff(s.yaw, lookAtMe)) < .12;
        s.see = clamp(s.see + (watching && (scoped || glass) ? dt * .45 : -dt * .2), 0, 1);
        if (s.see >= 1 && (s.fireT -= dt) <= 0) { s.fireT = 3.4; enemyShot(s, 'me', 'cs'); s.see = .55; }
        m.rig.play('crouch'); m.rig.upper('aim');
      } else if (s.kind === 'mg' || s.kind === 'mg2') {
        m.rig.play('crouch'); m.rig.upper(s.kind === 'mg' || men.find(o => o.kind === 'mg').ko ? 'aim' : null);
        const gunner = s.kind === 'mg' || men.find(o => o.kind === 'mg')?.ko;
        if (mgOn && gunner && (s.fireT -= dt) <= 0) {
          s.fireT = rnd(.12, .2); s.burst = (s.burst || 0) + 1; if (s.burst > 8) { s.burst = 0; s.fireT = 1.4; }
          const tgt = alive(allies)[Math.floor(Math.random() * alive(allies).length)];
          if (tgt) { s.yaw = turnTo(s.yaw, Math.atan2(tgt.x - s.x, tgt.y - s.y), dt * 3); enemyShot(s, tgt, 'mg'); }
          noise(.07, { vol: .08, from: 2000, to: 300 });
        }
        if (s.kind === 'mg2' && men.find(o => o.kind === 'mg').ko && !s.moved) { s.moved = true; s.x = mgNest.x; s.y = mgNest.z; }
      } else if (s.kind === 'cargun') {
        m.visible = !!car?.on; if (car) { s.x = car.x; s.y = car.z + .4; s.yaw = Math.PI / 2 + Math.PI; }
        m.rig.play('idle'); m.rig.upper('aim');
      } else if (s.alert) {
        const o = s.order || { do: 'hold' };
        if (o.do === 'move' && o.to) { if (!walk(s, o.to.x, o.to.y, 3.3, dt)) speed = 3.3; s.crouch = false; }
        else if (o.do === 'shoot') {
          const p = o.from || { x: s.x, y: s.y };
          if (Math.hypot(p.x - s.x, p.y - s.y) > .5) { walk(s, p.x, p.y, 2.2, dt); speed = 2.2; }
          s.crouch = false; s.yaw = turnTo(s.yaw, Math.atan2(o.at.x - s.x, o.at.y - s.y), dt * 4);
          if ((s.fireT -= dt) <= 0) { s.fireT = rnd(1.6, 3); const ally = allies && nearestAlly(s); if (ally) enemyShot(s, ally, 'rifle'); else if (located && nest && !move) enemyShot(s, 'me', 'rifle'); }
        } else if (o.do === 'throw') {
          s.order = { do: 'hold' };
          if (nest && !move && Math.hypot(s.x - nest.x, s.y - nest.z) < 40) { const e = nestEye(nest); setTimeout0(2, () => { if (nestId && !move && nest && Math.hypot(e.x - nest.x, e.z - nest.z) < 1) { hurtMe(24, { x: s.x, y: s.gy, z: s.y }); fx.shake(8); noise(.8, { vol: .4, from: 800, to: 60 }); } }); say('Grenade!', null, 1.2); }
        } else { s.crouch = !!o.spot; if (allies) { const ally = nearestAlly(s); if (ally && (s.fireT -= dt) <= 0) { s.fireT = rnd(2, 3.5); enemyShot(s, ally, 'rifle'); } } }
        m.rig.play(speed > 0 ? 'run' : s.crouch ? 'crouch' : 'idle'); m.rig.upper(speed > 0 ? null : 'aim');
      } else {
        // calm: patrol or stand; suspicion grows when bullets land near or a friend drops
        if (s.route) {
          const r = s.route[s.ri % s.route.length];
          if (Math.hypot(r[0] - s.x, r[1] - s.y) > .6) { walk(s, r[0], r[1], s.late ? 2.6 : 1.3, dt); speed = s.late ? 2.6 : 1.3; }
          else if ((s.wt += dt) > r[2]) { s.wt = 0; s.ri++; if (s.late) { s.route = null; s.sus = .8; } }
        }
        if (s.sus > .5) { s.yaw += Math.sin(t * 2 + s.x) * dt; }
        s.sus = Math.max(0, s.sus - dt * .05);
        m.rig.play(speed > 2 ? 'run' : speed > 0 ? 'walk' : 'idle'); m.rig.upper(null);
        if (s.spotter && spotting) { s.yaw = turnTo(s.yaw, Math.atan2(eye.x - s.x, eye.z - s.y), dt * 2); m.rig.upper('aim'); }
      }
      s.gy = groundAt(s.x, s.y) + (s.lift || 0);
      m.position.set(s.x, s.gy, s.y); m.rotation.y = s.yaw;
      // far soldiers animate less often
      const far = Math.hypot(s.x - eye.x, s.y - eye.z) > 160 && !scoped;
      if (!far || (frame + (s.x | 0)) % 3 === 0) m.rig.update(far ? dt * 3 : dt, { speed, aim: s.alert ? -.05 : 0 });
    }
    bodies.update(dt, men.filter(s => !s.ko && !s.fixed));
  }
  let frame = 0, spotting = false;
  function nearestAlly(s) { if (!allies) return null; let best = null, bd = 140; for (const a of allies) { if (a.ko || a.done) continue; const d = Math.hypot(a.x - s.x, a.y - s.y); if (d < bd) { bd = d; best = a; } } return best; }
  function updateAllies(dt) {
    if (!allies) return;
    const legs = [null, [[BRIDGE.x, 10], [BRIDGE.x - 1, -6]], [[BRIDGE.x - 3, -30], [28, -56]], [[10, -82]]];
    for (const [i, a] of allies.entries()) {
      let speed = 0;
      if (!a.ko && !a.done) {
        const pinned = mgOn && a.y < 16;
        const route = legs[Math.min(allyGo, 3)];
        if (pinned) { a.crouch = true; }
        else if (route) {
          a.crouch = false; const tgt = route[Math.min(a.leg, route.length - 1)], tx = tgt[0] + i * 2 - 2, tz = tgt[1] + i * 2;
          if (Math.hypot(tx - a.x, tz - a.y) > .6) { const sp = allyGo === 3 ? 4.6 : 3.2; walk(a, tx, tz, sp, dt); speed = sp; } else if (a.leg < route.length - 1) a.leg++; else { a.leg = 0; if (allyGo === 3) a.done = true; a.crouch = true; if (allyGo < 3) a.atLeg = allyGo; }
        }
        if (allyGo !== a.lastGo) { a.lastGo = allyGo; a.leg = 0; }
      }
      a.gy = groundAt(a.x, a.y); a.m.position.set(a.x, a.gy, a.y); a.m.rotation.y = a.yaw;
      if (!a.ko) a.m.rig.play(speed > 0 ? 'run' : a.crouch ? 'crouch' : 'idle');
      a.m.rig.update(dt, { speed });
    }
    if (allies.filter(a => a.ko).length >= 2) mission.fail('Hale\'s squad was lost on the bridge.');
  }

  // ---- input
  const BTN = {};
  function layout() {
    const r = Math.min(34, W * .11);
    BTN.fire = { x: W - r - 16, y: H - r - 22, r };
    BTN.scope = { x: W - r * .75 - 16 - r * .25, y: H - r * 2 - 22 - r * .9, r: r * .72 };
    BTN.left = { x: r + 16, y: H - r - 22, r: r * .86 };
    BTN.move = { x: W - 120, y: 66, w: 108, h: 26 };
  }
  const inBtn = (b, x, y) => b && (b.w ? x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h : Math.hypot(x - b.x, y - b.y) <= b.r * 1.15);
  function toggleScope() {
    if (state !== 'play' || move) return;
    scoped = !scoped; glass = false; haptic('tick'); tone(scoped ? 520 : 380, { len: .05, wave: 'triangle', vol: .04 });
  }
  function toggleGlass() { if (state !== 'play' || move) return; glass = !glass; scoped = false; haptic('tick'); tone(660, { len: .04, wave: 'triangle', vol: .03 }); }

  // ---- the round
  function begin(id) {
    mid = id; const def = missions[id];
    freeMen(); men = []; allies = null; shots = []; timers = []; tower?.g.removeFromParent(); for (const p of tower?.pieces || []) { p.removeFromParent(); p.geometry?.dispose(); }
    tower = null; drums = null; car = null; op = null; cs = null; boom.list.length = 0; if (WD.bags) WD.bags.visible = false;
    WD.solids = WD.solids.filter(b => !b.temp);
    for (const h of WD.helmets) { h.life = 0; h.m.visible = false; }
    bodies.list.length = 0; for (const m of temps) m.removeFromParent(); temps.length = 0;
    squad = new Squad([], { cover: WD.cover, sees: (a, b) => WD.nav.sees(a.x - GX0, a.y - GZ0, b.x - GX0, b.y - GZ0), range: 110, grenades: 2, camp: 10, aggression: .5 });
    squadTarget = null; allyGo = 0; mgOn = false;
    sky.time = def.time; WD.v.scene.fog.density = def.fog;
    rain.set(def.weather === 'rain' ? 'storm' : 'clear', def.weather === 'rain' ? .75 : 0);
    WD.v.exposure = def.weather === 'rain' ? .85 : .95;
    WD.wins.material.emissiveIntensity = def.weather === 'rain' ? 1.6 : 0;
    def.setup();
    nestId = def.nests[0]; nest = NESTS[nestId];
    const e = nestEye(nest); look = { yaw: Math.atan2(-(nest.face.x - e.x), -(nest.face.z - e.z)), pitch: -.06 };
    mission = new Mission(def.script.bind(def));
    mission.nests = def.nests;
    cut = new Cutscene(def.intro(), { bars: .14 }); state = 'intro';
    train = { on: id === 'm1', x: -420, speed: 30, next: 26, final: false };
    WD.train.visible = false;
    bell = { ring: 0, next: id === 'm2' ? 14 : 1e9 };
    wind = { x: id === 'm1' ? 2.5 : -4, z: 0, base: id === 'm1' ? 2.5 : -4 };
  }
  let wind = { x: 0, z: 0, base: 0 };
  let briefRows = [], briefGo = null, failMsg = '', pathBudget = 0;
  const fmtT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  return {
    reset() {
      world(); layout();
      if (!sky) { sky = new Sky(WD.v, { time: 7, stars: 300, sun: WD.sl, day: DAY }); rain = new Weather(WD.v, { kind: 'clear', amount: 0, wind: [-2, 0], area: 40 }); rain.onFlash = far => { storm = 1.6; noise(1.6, { vol: .3 * (1 - far * .6), from: 260, to: 40, at: far * 1.5 }); }; }
      fx.clear(); me.reset(); gun.ammo = gun.mag; gun.reloadLeft = 0; gun.reserve = Infinity; gun.shotsAtCs = 0;
      state = 'brief'; briefT = 0; t = 0; score = 0; heat = 0; located = false; alertedN = 0; frame = 0;
      scoped = false; glass = false; zoom = 7; breath = { v: 1, held: false }; gasp = 0; storm = 0;
      bulletCam = null; WD.bullet.visible = false; move = null; zip = null; mortar = null; mortarCool = 0; qte = new Prompts({ radius: 56, swipe: 40 }); qteKind = null;
      ptr = new Map(); pinch = null; lastShotT = -99; firstShotHit = null; opTime = null; coverMsg = null; lineFx = null; endT = 0; outroDone = false; quietT = 0;
      keys = {}; hits = []; tagT = 0; spotting = false;
      sel = (camp.next() || camp.missions[0]).id;
      favour = api.load({})?.nests || {};
      begin(sel);
      state = 'brief';
      fx.clear();
    },
    resize(w, h) { W = w; H = h; layout(); },
    update(dtReal) {
      frame++;
      fx.update(dtReal); breathT(dtReal);
      if (state === 'brief') { briefT += dtReal; sky.update(dtReal); rain.update(dtReal); return; }
      // slow motion: bullet cam, quick-time moments
      let ts = 1;
      if (bulletCam) ts = bulletCam.hold > 0 ? .06 : bulletCam.scale;
      qte.update(dtReal); if (qte.active) ts *= qte.timeScale;
      const dt = Math.min(dtReal, 1 / 20) * ts;
      t += dt;
      // timers
      for (const tm of timers) if (t >= tm.at && !tm.done) { tm.done = true; tm.fn(); }
      timers = timers.filter(tm => !tm.done);
      sky.update(dtReal); rain.update(dtReal); storm = Math.max(0, storm - dtReal);
      WD.land.update(dt, WD.v.cam);
      WD.wheel.rotation.x += dt * .5; WD.sails.rotation.z += dt * .35;
      // wind gusts
      wind.x = wind.base + Math.sin(t * .23) * 1.2 + Math.sin(t * .71 + 2) * .5;
      for (const f of [WD.flagA, WD.flagB]) {
        const p = f.cloth.geometry.attributes.position, b = f.base, s = Math.sign(wind.x) || 1, k = clamp(Math.abs(wind.x) / 6, .1, 1);
        f.cloth.position.x = f.x + s * 1; f.cloth.scale.x = s;
        for (let i = 0; i < p.count; i++) { const x = b[i * 3] + 1; p.setZ(i, Math.sin(x * 3 - t * 8 * k) * .14 * x * k); p.setY(i, b[i * 3 + 1] - (1 - k) * x * .35); }
        p.needsUpdate = true;
      }
      if (state === 'intro' || state === 'outro') {
        cut.update(dt);
        if (state === 'intro' && cut.done) { state = 'play'; const s = cut.shot; if (s?.look) { const dx = s.look.x - s.x, dy = s.look.y - s.y, dz = s.look.z - s.z; look.yaw = Math.atan2(-dx, -dz); look.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.5, .35); } }
        updateMen(dt); updateAllies(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt);
        if (state === 'outro') { mission.update(dt); trainUpdate(dt); }
        if (outroDone && state === 'outro') finish(true);
        return;
      }
      if (state === 'fail' || state === 'won') { endT -= dtReal; updateMen(dt); WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); if (endT <= 0 && state) { const s0 = state; state = 'done'; if (s0) api.over(); } return; }
      if (state !== 'play') return;

      // climbing the belfry (mission 2 start)
      if (qteKind === 'climb') { climbT = qte.active ? Math.min(1, climbT + dt * .2) : 1; }
      if (qteKind === 'climb' && !qte.active) qteKind = null;
      if (qteKind === 'train' && !qte.active) { qteKind = null; }

      mission.update(dt);
      gun.update(dt); me.update(dt); for (const h of hits) h.life -= dtReal; hits = hits.filter(h => h.life > 0);
      boltT = Math.max(0, boltT - dt);
      if (gun.reloaded) tone(300, { len: .08, wave: 'square', vol: .03 });
      // keys
      const kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), ky = (keys.ArrowUp || keys.w ? 1 : 0) - (keys.ArrowDown || keys.s ? 1 : 0);
      if (kx || ky) { const f = fovNow() / 62; look.yaw -= kx * dt * 1.2 * f; look.pitch += ky * dt * .8 * f; }
      clampLook();
      // masking
      trainUpdate(dt);
      bell.next -= dt; if (bell.next <= 0) { bell.next = 26; bell.ring = 6; } if (bell.ring > 0) { bell.ring -= dt; if (Math.floor(bell.ring * 1.2) !== Math.floor((bell.ring + dt) * 1.2)) tone(392, { len: 1.4, wave: 'sine', vol: .06 }); WD.bell.rotation.z = Math.sin(t * 5) * .5; }
      // heat: they work out where you are
      quietT = t - lastShotT;
      if (heat > 0 && !squad.alerted) heat = Math.max(0, heat - dt * .015);
      if (heat >= 1 && !located && nest) {
        located = true; squadTarget = { x: nest.x, y: nest.z };
        for (const s of men) if (!s.ko && !s.fixed && Math.hypot(s.x - nest.x, s.y - nest.z) < 330) wakeUp(s);
        say('They\'ve spotted your position!', OAKE, 2.4); haptic('warning');
      }
      // the commander decides about once a second
      if (frame % 30 === 0) {
        const leftN = alive(men).length, fav = favourOf(nestId);
        const see = [heat, fav, clamp(quietT / 20, 0, 1), leftN / Math.max(1, men.length), me.frac, masked() ? 1 : -1, squad.alerted ? 1 : 0, clamp(mission.time / 120, 0, 1)];
        const a = boss.act(see, .5), what = boss.action;
        squad.aggression = what === 'push' ? .75 : what === 'flank' ? .6 : .3;
        if (what === 'flank') squad.lastFlank = -99;
        if (what === 'mortar' && located) callMortars();
        spotting = what === 'watch';
        void a;
      }
      if (spotting && nest && (scoped || glass) && !masked()) heat = Math.min(1.2, heat + dt * .03 * (1 + favourOf(nestId)));
      if (squad.alerted) {
        const tgt = squadTarget || (nest ? { x: nest.x + (1 - heat) * 40, y: nest.z + (1 - heat) * 30 } : { x: 0, y: 0 });
        squad.update(dt, tgt);
      }
      // suspicious soldiers that are close to a found body or a near miss wake up
      for (const s of men) if (!s.ko && !s.alert && !s.fixed && s.sus >= 1) wakeUp(s);
      updateMortar(dt);
      updateMen(dt); updateAllies(dt); updateShots(dt); updateTracers(dt);
      if (car && car.on && !car.stopped) {
        car.x -= dt * 6; car.z = roadZ(car.x); if (car.x < 30) { car.stopped = true; mission.fail('The armoured car reached the bridge.'); }
        if (car.gunner?.ko) { car.stopped = true; car.smoke = true; }
        car.g.position.set(car.x, WD.land.height(car.x, car.z), car.z); car.g.rotation.y = Math.PI / 2;
        noise(.05, { vol: .015, from: 200, to: 120 });
        if ((car.fireT -= dt) <= 0) { car.fireT = 1.4; const a = alive(allies || [])[0]; if (a) enemyShot({ x: car.x, y: car.z, gy: WD.land.height(car.x, car.z) + 1 }, a, 'mg'); }
        for (const b of drums || []) if (!b.gone && Math.hypot(car.x - b.x, car.z - b.z) < 9) car.near = true;
      }
      if (car?.smoke) WD.smoke.emit({ x: car.x, y: WD.land.height(car.x, car.z) + 2.4, z: car.z, vx: rnd(-.3, .3), vy: 2, vz: rnd(-.3, .3), life: 3, size: 1.4, grow: 2, col: [.15, .14, .13], a: .7 });
      boom.update(dt);
      for (const p of tower?.pieces || []) { const u = p.userData.v; if (!u) continue; u.y -= 15 * dt; p.position.x += u.x * dt; p.position.y += u.y * dt; p.position.z += u.z * dt; p.rotation.x += u.r * dt; const g = WD.land.height(p.position.x, p.position.z); if (p.position.y < g) { p.position.y = g; u.x *= .5; u.z *= .5; u.y = Math.abs(u.y) * .2; u.r *= .5; if (Math.abs(u.y) < .5) p.userData.v = null; } }
      for (const h of WD.helmets) if (h.life > 0) { h.life -= dt; h.vy -= 12 * dt; h.m.position.x += h.vx * dt; h.m.position.y += h.vy * dt; h.m.position.z += h.vz * dt; h.m.rotation.x += h.spin * dt; const g = WD.land.height(h.m.position.x, h.m.position.z); if (h.m.position.y < g) { h.m.position.y = g; h.vy = Math.abs(h.vy) * .35; h.vx *= .5; h.vz *= .5; h.spin *= .5; } if (h.life <= 0) h.m.visible = false; }
      WD.dust.update(dt); WD.sparks.update(dt); WD.smoke.update(dt); WD.trail.update(dt);
      // tagging with the glasses
      if (glass) {
        const eye = WD.v.cam.position; let best = null, bd = .05;
        for (const s of men) { if (s.ko || s.tagged) continue; const a = Math.abs(angDiff(look.yaw, Math.atan2(-(s.x - eye.x), -(s.y - eye.z)))), p = Math.abs(look.pitch - Math.atan2(s.gy + 1 - eye.y, Math.hypot(s.x - eye.x, s.y - eye.z))); const d = Math.hypot(a, p); if (d < bd) { bd = d; best = s; } }
        if (best && best === tagT?.s) { tagT.t += dt; if (tagT.t > .45) { best.tagged = true; tagT = null; haptic('light'); tone(1200, { len: .05, wave: 'sine', vol: .04 }); score += 10; api.score(score); } }
        else tagT = best ? { s: best, t: 0 } : null;
      } else tagT = null;
      // bullet cam
      if (bulletCam) {
        bulletCam.t += dtReal;
        if (bulletCam.hold > 0) { bulletCam.hold -= dtReal; if (bulletCam.hold <= 0) { bulletCam = null; WD.bullet.visible = false; } }
        else if (bulletCam.b.dead || bulletCam.t > 4) { bulletCam = null; WD.bullet.visible = false; }
      }
      // moving between nests
      if (move) {
        move.t += dt;
        if (move.kind === 'zip') { zip.update(dt); if (zip.done) arrive(move.to); }
        else { move.cs.update(dt); if (move.cs.done) arrive(move.to); }
      }
      if (nest && !move) favour[nestId] = (favour[nestId] || 0) + dt;
      // losing
      if (me.dead || me.hp <= 0) mission.fail('Wren is down.');
      if (mission.failed && state === 'play') finish(false);
      WD.v.hurt = clamp(1 - me.frac, 0, 1) * .9;
      // the operator's and the marksman's scope glints, nest markers
      if (cs && !cs.ko && frame % 2 === 0) { const g = .5 + cs.see * 2.5; WD.sparks.emit({ x: cs.x, y: cs.gy + 1.15, z: cs.y + .4, life: .1, size: .3 + cs.see * .6, col: [g * 2, g * 2, g * 1.6] }); }
      if (spotting) for (const s of men) if (s.spotter && !s.ko && frame % 3 === 0) WD.sparks.emit({ x: s.x, y: s.gy + 1.6, z: s.y + .3, life: .1, size: .25, col: [2, 2, 1.6] });
      if (!move && nextNest() && (located || mission.time > 20) && frame % 4 === 0) { const n = NESTS[nextNest()], e = nestEye(n); WD.marks.emit({ x: e.x, y: e.y + 2.5, z: e.z, life: .2, size: 1.6, col: [3, 2.6, 1.2] }); }
      WD.marks.update(dtReal);
      breathT(0);
    },
    draw(c) {
      const v = WD.v, cam = v.cam;
      // the camera: cutscene, zip line, bullet cam or you
      let gunVis = false;
      if (state === 'brief') {
        const a = briefT * .05; cam.position.set(Math.sin(a) * 160 + 20, 70, Math.cos(a) * 160 - 40); cam.lookAt(0, 6, -60);
      } else if ((state === 'intro' || state === 'outro') && cut?.shot) {
        const s = cut.shot; cam.position.set(s.x, s.y, s.z); if (s.look) cam.lookAt(s.look.x, s.look.y, s.look.z);
      } else if (move) {
        if (move.kind === 'zip' && zip) { const p = zip.hands; cam.position.set(p.x, p.y - .9, p.z); const d = zip.dir; cam.lookAt(p.x + d.x * 10, p.y + d.y * 10 - 1.5, p.z + d.z * 10); }
        else if (move.cs?.shot) { const s = move.cs.shot; cam.position.set(s.x, s.y, s.z); if (s.look) cam.lookAt(s.look.x, s.look.y, s.look.z); }
      } else if (bulletCam && bulletCam.hold <= 0 && !bulletCam.b.dead) {
        const b = bulletCam.b, l = Math.hypot(b.vx, b.vy, b.vz), dx = b.vx / l, dy = b.vy / l, dz = b.vz / l;
        cam.position.set(b.x - dx * 2.2 + dz * .45, b.y - dy * 2.2 + .3, b.z - dz * 2.2 - dx * .45); cam.lookAt(b.x + dx * 4, b.y + dy * 4, b.z + dz * 4);
        WD.bullet.position.set(b.x, b.y, b.z); WD.bullet.rotation.set(0, 0, 0); WD.bullet.lookAt(b.x + dx, b.y + dy, b.z + dz); WD.bullet.rotateX(Math.PI / 2);
      } else if (bulletCam && bulletCam.hold > 0 && bulletCam.at) {
        const a = bulletCam.at, f = bulletCam.from, dx = a.x - f.x, dz = a.z - f.z, l = Math.hypot(dx, dz);
        cam.position.set(a.x - dx / l * 4 + dz / l * 2.5, a.y + 1, a.z - dz / l * 4 - dx / l * 2.5); cam.lookAt(a.x, a.y, a.z);
        WD.bullet.visible = false;
      } else if (nest) {
        const e = nestEye(nest);
        let y = e.y; if (qteKind === 'climb') y = lerp(WD.land.height(nest.x, nest.z) + 1.6, e.y, sm(0, 1, climbT));
        const [sy, sp] = sway(), kick = boltT > .8 ? (boltT - .8) * .25 : 0;
        cam.position.set(e.x, y, e.z);
        const d = dirOf(look.yaw + sy, look.pitch + sp + kick, tmpV);
        cam.lookAt(e.x + d.x, y + d.y, e.z + d.z);
        gunVis = !scoped && !glass && state === 'play';
      }
      WD.gun.visible = gunVis; if (gunVis) { WD.gun.position.y = -.17 - (boltT > 0 ? Math.sin(boltT * 3) * .02 : 0); WD.bolt.position.z = .05 + (boltT > .2 && boltT < .9 ? .06 : 0); }
      const f = (state === 'play' && !move && !bulletCam) ? fovNow() : 62;
      if (Math.abs(cam.fov - f) > .01) { cam.fov = f; cam.updateProjectionMatrix(); }
      // shadows near what you're looking at
      cam.getWorldDirection(tmpA); const reach = scoped ? 180 : 24;
      WD.sl.follow(cam.position.x + tmpA.x * reach, cam.position.y + tmpA.y * reach, cam.position.z + tmpA.z * reach);
      if (WD.train.visible) { WD.train.position.set(train.x, RAILH, RAILZ); }
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      hud(c);
    },
    down(x, y, id) {
      if (state === 'brief') return briefTap(x, y);
      if (state === 'intro' && cut) { cut.skip(); return; }
      if (state !== 'play') return;
      if (qte.active) { qte.down(x, y); ptr.set(id, { x, y, sx: x, sy: y, role: 'qte' }); return; }
      if (bulletCam) { bulletCam = null; WD.bullet.visible = false; return; }
      if (inBtn(BTN.fire, x, y)) { fire(); ptr.set(id, { role: 'fire', x, y }); return; }
      if (inBtn(BTN.scope, x, y)) { toggleScope(); ptr.set(id, { role: 'btn', x, y }); return; }
      if (inBtn(BTN.left, x, y)) { if (scoped) { breath.held = true; ptr.set(id, { role: 'breath', x, y }); } else { toggleGlass(); ptr.set(id, { role: 'btn', x, y }); } return; }
      if (!move && nextNest() && inBtn(BTN.move, x, y)) { startMove(nextNest()); ptr.set(id, { role: 'btn', x, y }); return; }
      const aims = [...ptr.values()].filter(p => p.role === 'aim');
      if (aims.length === 1) { const a = aims[0]; a.role = 'pinch'; pinch = { d: Math.hypot(x - a.x, y - a.y), zoom, a, b: null }; const p = { x, y, sx: x, sy: y, role: 'pinch' }; pinch.b = p; ptr.set(id, p); return; }
      ptr.set(id, { x, y, sx: x, sy: y, role: 'aim', t: 0 });
    },
    move(x, y, pressed, id) {
      if (!pressed) return; const p = ptr.get(id); if (!p) return;
      if (p.role === 'qte') { qte.move(x, y); return; }
      if (p.role === 'aim') {
        const k = (fovNow() * Math.PI / 180) / H * 1.15;
        look.yaw -= (x - p.x) * k; look.pitch -= (y - p.y) * k; clampLook();   // drag right to look right, up to look up
      } else if (p.role === 'pinch' && pinch) {
        p.x = x; p.y = y; const d = Math.hypot(pinch.a.x - pinch.b.x, pinch.a.y - pinch.b.y);
        if (!scoped && d > pinch.d * 1.25 && state === 'play') { scoped = true; glass = false; pinch.d = d; pinch.zoom = zoom; }
        else if (scoped) zoom = clamp(pinch.zoom * d / pinch.d, 3, 12);
        return;
      }
      p.x = x; p.y = y;
    },
    up(x, y, id) {
      const p = ptr.get(id); ptr.delete(id);
      if (p?.role === 'qte') qte.up(x, y);
      if (p?.role === 'breath') breath.held = false;
      if (p?.role === 'pinch') { pinch = null; for (const q of ptr.values()) if (q.role === 'pinch') q.role = 'aim'; }
    },
    key(k, isDown) {
      keys[k] = isDown; if (!isDown) { if (k === 'Shift') breath.held = false; return; }
      if (state === 'brief' && (k === 'Enter' || k === ' ')) return go();
      if (state === 'intro' && cut) return cut.skip();
      if (qte.active) { if (k === ' ' || k === 'Enter') qte.down(); return; }
      if (k === ' ' || k === 'f') fire();
      if (k === 'z' || k === 'e') toggleScope();
      if (k === 'b' || k === 'q') toggleGlass();
      if (k === 'Shift') breath.held = true;
      if (k === 'm' && nextNest()) startMove(nextNest());
      if (k === '=' || k === '+') zoom = clamp(zoom + 1, 3, 12);
      if (k === '-') zoom = clamp(zoom - 1, 3, 12);
    },
    pause() { breath.held = false; ptr.clear(); },
  };

  // ---------------------------------------------------------------- helpers in make's scope
  function clampLook() { look.pitch = clamp(look.pitch, -.55, .4); }
  function breathT(dt) {
    if (!breath) return;
    if (breath.held && scoped && breath.v > 0) { breath.v -= dt / 4.5; if (breath.v <= 0) { breath.v = 0; gasp = 2; tone(180, { len: .3, wave: 'triangle', vol: .04 }); } }
    else breath.v = Math.min(1, breath.v + dt * (gasp > 0 ? .1 : .35));
    gasp = Math.max(0, gasp - dt);
  }
  function favourOf(id) { const list = mission?.nests || []; let all = 0; for (const n of list) all += favour[n] || 0; return all > 30 ? (favour[id] || 0) / all : 0; }
  function trainUpdate(dt) {
    if (!train.on) { train.next -= dt; if (train.next <= 0 && mid === 'm1') { train.on = true; train.x = -420; train.speed = 30; tone(520, { len: .9, wave: 'triangle', vol: .05 }); tone(620, { len: .9, wave: 'triangle', vol: .04, at: .1 }); } WD.train.visible = false; return; }
    WD.train.visible = true;
    if (train.final && qteKind !== 'train' && train.x > -150) train.speed = Math.max(4, train.speed - dt * 2);
    train.x += train.speed * dt;
    if (frame % 3 === 0) { const ch = WD.train.userData.chim; ch.getWorldPosition(tmpA); WD.smoke.emit({ x: tmpA.x, y: tmpA.y + .8, z: tmpA.z, vx: -train.speed * .3 + rnd(-.3, .3), vy: 2.5, vz: rnd(-.3, .3), life: 3.5, size: 1.4, grow: 3, col: [.82, .8, .76], a: .55, drag: .4 }); }
    if (masked() && frame % 20 === 0) noise(.4, { vol: .05 * clamp(1 - Math.abs(train.x) / 220, .1, 1), from: 400, to: 200 });
    if (train.x > 420) { train.on = false; train.next = 34; }
  }
  function finish(won) {
    if (won) {
      const st = missions[mid].stars();
      camp.finish(mid, { stars: st });
      score += 500 + st.filter(Boolean).length * 250; api.score(score);
      const d = api.load({}) || {}; d.nests = favour; api.save(d);
      boss.result(true);
      api.win(); state = 'won'; endT = 2.4; sounds.win(); haptic('success');
    } else {
      boss.result(false);
      const d = api.load({}) || {}; d.nests = favour; api.save(d);
      state = 'fail'; endT = 2.2; sounds.lose(); haptic('error'); failMsg = mission.failed || 'Mission failed';
    }
  }
  function go() { begin(sel); haptic('medium'); sounds.click?.(); }
  function briefTap(x, y) {
    if (briefT < .3) return;
    for (const r of briefRows) if (y >= r.y && y <= r.y + r.h && x >= r.x && x <= r.x + r.w) { if (r.id && camp.open(r.id)) { sel = r.id; begin(sel); state = 'brief'; haptic('tick'); } return; }
    if (inBtn(briefGo, x, y)) go();
  }

  // ---------------------------------------------------------------- the HUD (drawn for this game only)
  function hud(c) {
    const ink = '#2b2a26', paper = '#ece2c8', brass = '#c8a24a', red = '#b8412e';
    if (state === 'brief') return dossier(c, ink, paper, brass, red);
    if (cut && (state === 'intro' || state === 'outro')) { cut.drawBars(c, W, H, '#0b0b0a'); radioLine(c, cut.line, brass); if (state === 'intro') { c.fillStyle = '#ffffff88'; c.font = '600 10px Rubik, sans-serif'; c.textAlign = 'right'; c.fillText('TAP TO SKIP', W - 12, H - 10); } return; }
    if (move) { if (move.cs) move.cs.drawBars(c, W, H, '#0b0b0a'); stamp(c, move.kind === 'zip' ? 'ON THE LINE' : 'MOVING', W / 2, H * .78, brass); radioLine(c, lineFx, brass); return; }
    if (bulletCam) { c.fillStyle = '#0006'; c.fillRect(0, 0, W, H * .06); c.fillRect(0, H * .94, W, H * .06); const b = bulletCam.b; const d = Math.hypot(b.x - bulletCam.from.x, b.z - bulletCam.from.z); c.font = '700 13px "Courier New", monospace'; c.fillStyle = brass; c.textAlign = 'center'; c.fillText(Math.round(d) + ' m', W / 2, H * .94 - 8); koPops(c); return; }
    const sc = scoped, gl = glass;
    // tags above soldiers, KO pops
    tags(c, brass, red);
    koPops(c);
    if (sc) scopeView(c, brass, red); else if (gl) glassView(c, brass);
    else crosshair(c);
    // hit direction arrows
    for (const h of hits) { const a = h.angle - Math.PI / 2; c.save(); c.translate(W / 2 + Math.cos(a) * 70, H / 2 + Math.sin(a) * 70); c.rotate(a + Math.PI / 2); c.globalAlpha = clamp(h.life, 0, 1); c.fillStyle = red; c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 4); c.lineTo(-9, 4); c.fill(); c.restore(); }
    objectiveSlip(c, ink, paper, red);
    windGauge(c, brass);
    heatBar(c, ink, paper, red);
    buttons(c, brass, red);
    radioLine(c, lineFx, brass);
    if (qte.active) qteDraw(c, brass);
    if (state === 'fail' || state === 'won') stamp(c, state === 'won' ? 'MISSION COMPLETE' : failMsg, W / 2, H * .45, state === 'won' ? brass : red, true);
  }
  function stamp(c, text, x, y, col, big) {
    c.save(); c.translate(x, y); c.rotate(-.06); c.font = `800 ${big ? 18 : 14}px Rubik, sans-serif`; c.textAlign = 'center'; const w = Math.min(W - 30, c.measureText(text).width + 24);
    c.fillStyle = '#0b0b0acc'; c.fillRect(-w / 2, -18, w, 30); c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(-w / 2 + 3, -15, w - 6, 24); c.fillStyle = col; c.fillText(text, 0, 2, w - 14); c.restore();
  }
  function radioLine(c, l, brass) {
    if (lineFx) { lineFx.life -= 1 / 60; if (lineFx.life <= 0) lineFx = null; }
    if (!l || !l.text) return;
    const y = H - (cut?.playing ? H * .07 + 8 : 120), w = Math.min(W - 24, 340);
    c.save(); c.font = '500 12px Rubik, sans-serif';
    const lines = wrap(c, l.text, w - 22);
    const hh = 14 * lines.length + (l.who ? 16 : 8) + 6;
    c.fillStyle = '#12110ecc'; roundRect(c, W / 2 - w / 2, y - hh, w, hh, 6); c.fill();
    c.fillStyle = brass; c.fillRect(W / 2 - w / 2, y - hh, 3, hh);
    let yy = y - hh + 14;
    if (l.who) { c.font = '700 9px "Courier New", monospace'; c.fillStyle = brass; c.textAlign = 'left'; c.fillText('◉ ' + l.who, W / 2 - w / 2 + 12, yy); yy += 14; c.font = '500 12px Rubik, sans-serif'; }
    c.fillStyle = '#f2ead6'; c.textAlign = 'left'; for (const s of lines) { c.fillText(s, W / 2 - w / 2 + 12, yy); yy += 14; }
    c.restore();
  }
  function wrap(c, text, w) { const out = []; let line = ''; for (const word of text.split(' ')) { const tryL = line ? line + ' ' + word : word; if (c.measureText(tryL).width > w && line) { out.push(line); line = word; } else line = tryL; } if (line) out.push(line); return out; }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function objectiveSlip(c, ink, paper, red) {
    const o = mission.objectives.filter(q => !q.done).at(-1); if (!o) return;
    c.save(); c.textAlign = 'left'; c.font = '600 11px Rubik, sans-serif'; const w = Math.min(W * .58, 220), lines = wrap(c, o.text, w - 18), h = 18 + lines.length * 13;
    c.translate(10, 10); c.rotate(-.015);
    c.fillStyle = paper; c.shadowColor = '#0006'; c.shadowBlur = 6; c.fillRect(0, 0, w, h); c.shadowBlur = 0;
    c.fillStyle = red; c.fillRect(0, 0, 3, h);
    c.fillStyle = '#8a7f66'; c.font = '700 8px "Courier New", monospace'; c.fillText('ORDERS · ' + fmtT(mission.time), 9, 11);
    c.fillStyle = ink; c.font = '600 11px Rubik, sans-serif'; lines.forEach((s, i) => c.fillText(s, 9, 24 + i * 13));
    if (op?.sending && !op.ko) { const k = clamp(op.send / 60, 0, 1); c.fillStyle = '#0002'; c.fillRect(9, h - 5, w - 18, 3); c.fillStyle = red; c.fillRect(9, h - 5, (w - 18) * k, 3); }
    c.restore();
    // a marker towards the objective
    const at = o.at; if (!at || scoped) return;
    const ax = at.m ? at.x : at.x, ay = at.m ? at.gy + 2.2 : at.y, az = at.m ? at.y : at.z;
    if (at.ko) return;
    const [sx, sy, sz] = WD.v.toScreen(ax, ay, az);
    if (sz < 1 && sx > 0 && sx < W && sy > 0 && sy < H) { c.strokeStyle = red; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, sy - 12); c.lineTo(sx + 6, sy - 4); c.lineTo(sx, sy + 4); c.lineTo(sx - 6, sy - 4); c.closePath(); c.stroke(); }
    else { const e = WD.v.cam.position, a = angDiff(Math.atan2(-(ax - e.x), -(az - e.z)), look.yaw), side = a > 0 ? -1 : 1; c.fillStyle = red; c.save(); c.translate(side > 0 ? W - 14 : 14, H * .42); c.scale(side, 1); c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -8); c.lineTo(-4, 8); c.fill(); c.restore(); }
  }
  function windGauge(c, brass) {
    const x = W - 58, y = 12, w = 48, h = 46;
    c.save(); c.fillStyle = '#12110ebb'; roundRect(c, x, y, w, h, 6); c.fill();
    // wind relative to where you look: the arrow points the way the bullet will drift
    const rel = Math.atan2(wind.z, wind.x) + look.yaw, cross = Math.cos(rel) * Math.hypot(wind.x, wind.z);
    c.translate(x + w / 2, y + 18);
    const n = Math.min(3, Math.round(Math.abs(cross) / 1.5));
    c.fillStyle = brass; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center';
    for (let i = 0; i < 3; i++) { c.globalAlpha = i < n ? 1 : .2; const ox = (i - 1) * 9 * Math.sign(cross || 1); c.beginPath(); c.moveTo(ox + 4 * Math.sign(cross || 1), 0); c.lineTo(ox - 3 * Math.sign(cross || 1), -6); c.lineTo(ox - 3 * Math.sign(cross || 1), 6); c.closePath(); c.fill(); }
    c.globalAlpha = 1; c.fillText('WIND ' + Math.abs(cross).toFixed(1), 0, 20);
    c.restore();
  }
  function heatBar(c, ink, paper, red) {
    const w = Math.min(150, W - 4 * BTN.left.r - 50), x = W / 2 - w / 2, y = H - 24;
    c.save();
    c.fillStyle = '#12110eaa'; roundRect(c, x - 4, y - 3, w + 8, 16, 8); c.fill();
    const k = clamp(heat, 0, 1);
    const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7c8a45'); g.addColorStop(.6, '#d0a040'); g.addColorStop(1, red);
    c.fillStyle = g; roundRect(c, x, y, Math.max(6, w * k), 10, 5); c.fill();
    c.fillStyle = '#f2ead6'; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center';
    c.fillText(located ? 'THEY KNOW WHERE YOU ARE' : masked() ? (train.on ? '♪ TRAIN COVERS SHOTS' : bell.ring > 0 ? '♪ BELL COVERS SHOTS' : '♪ THUNDER COVERS SHOTS') : heat > .5 ? 'THEY ARE LISTENING' : 'UNHEARD', W / 2, y + 8);
    if (masked()) { c.strokeStyle = '#9fd070'; c.lineWidth = 1.5; roundRect(c, x - 4, y - 3, w + 8, 16, 8); c.stroke(); }
    if (coverMsg && op && !op.ko && op.sending && !masked() && mid === 'm1') { c.fillStyle = '#f2ead6cc'; c.font = '500 9px Rubik, sans-serif'; for (const [i, l] of wrap(c, coverMsg, w + 10).entries()) c.fillText(l, W / 2, y - 22 + i * 11); }
    c.restore();
  }
  function crosshair(c) {
    c.strokeStyle = '#ffffffaa'; c.lineWidth = 1.5; c.beginPath(); c.arc(W / 2, H / 2, 3, 0, TAU); c.stroke();
  }
  function scopeView(c, brass, red) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * .44, fovR = fovNow() * Math.PI / 180, px = H / fovR;   // units per radian
    c.save();
    c.fillStyle = '#050505'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, R, 0, TAU, true); c.fill('evenodd');
    const g = c.createRadialGradient(cx, cy, R * .7, cx, cy, R); g.addColorStop(0, '#0000'); g.addColorStop(1, '#000d'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    c.strokeStyle = '#8a7a50'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    // the Wren reticle: fine cross with an open centre, drop chevrons below, wind dots to the sides
    c.strokeStyle = '#0d0d0c'; c.fillStyle = '#0d0d0c'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - 6, cy); c.moveTo(cx + 6, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy - 6); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - R * .55, cy); c.moveTo(cx + R * .55, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy + R); c.lineTo(cx, cy + R * .62); c.stroke();
    c.lineWidth = 1.2; c.font = '700 8px "Courier New", monospace'; c.textAlign = 'left';
    for (const d of [200, 300, 400]) { const yy = cy + holdAt(d) * px; if (yy > cy + R * .6) break; c.beginPath(); c.moveTo(cx - 6, yy - 3); c.lineTo(cx, yy); c.lineTo(cx + 6, yy - 3); c.stroke(); c.fillText(String(d / 100), cx + 8, yy + 3); }
    c.beginPath(); c.moveTo(cx, cy + 6); c.lineTo(cx, cy + R * .62); c.stroke();
    for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * i * .0015 * px, cy, 1.4, 0, TAU); c.fill(); }
    // tagged target help: range and how far to hold over
    const tg = nearTagged();
    if (tg) {
      const { d, s } = tg, cross = Math.cos(Math.atan2(wind.z, wind.x) + look.yaw) * Math.hypot(wind.x, wind.z);
      const hold = holdAt(d) * px, drift = driftAt(d, cross) * px;
      c.strokeStyle = red; c.lineWidth = 1.2; c.beginPath(); c.arc(cx + drift, cy + hold, 4, 0, TAU); c.stroke();
      c.fillStyle = '#f2ead6'; c.textAlign = 'center'; c.font = '700 9px "Courier New", monospace';
      c.fillText(Math.round(d) + ' m' + (s.kind === 'radio' ? ' · OPERATOR' : s.kind === 'officer' ? ' · OFFICER' : ''), cx, cy - R * .8);
    }
    // zoom and breath on the ring
    c.fillStyle = brass; c.font = '700 10px "Courier New", monospace'; c.textAlign = 'center'; c.fillText(zoom.toFixed(0) + '×', cx, cy + R + 14 > H - 8 ? cy + R - 10 : cy + R + 14);
    c.strokeStyle = gasp > 0 ? red : '#bfe0ff'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R + 6, Math.PI * .75, Math.PI * .75 + Math.PI * .5 * breath.v); c.stroke();
    // rounds as brass cartridges along the lower ring
    for (let i = 0; i < gun.mag; i++) { const a = Math.PI * .35 - i * .09, x = cx + Math.cos(a) * (R - 14), y = cy + Math.sin(a) * (R - 14); c.fillStyle = i < gun.ammo ? brass : '#ffffff22'; c.beginPath(); c.ellipse(x, y, 2.4, 5, a, 0, TAU); c.fill(); }
    if (gun.reloading) { c.fillStyle = '#f2ead6'; c.font = '700 9px "Courier New", monospace'; c.fillText('RELOADING', cx, cy + R * .4); }
    else if (boltT > 0) { c.fillStyle = '#f2ead699'; c.font = '700 8px "Courier New", monospace'; c.fillText('BOLT', cx, cy + R * .4); }
    c.restore();
  }
  function nearTagged() {
    const e = WD.v.cam.position; let best = null, ba = .08;
    for (const s of men) { if (!s.tagged || s.ko) continue; const a = Math.abs(angDiff(look.yaw, Math.atan2(-(s.x - e.x), -(s.y - e.z)))); if (a < ba) { ba = a; best = { s, d: Math.hypot(s.x - e.x, s.y - e.z) }; } }
    return best;
  }
  function glassView(c, brass) {
    const r = Math.min(W * .3, H * .3), cy = H / 2, ox = r * .78;
    c.save(); c.fillStyle = '#060606';
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2 + ox, cy, r, 0, TAU); c.clip('evenodd');
    c.beginPath(); c.rect(0, 0, W, H); c.arc(W / 2 - ox, cy, r, 0, TAU); c.fill('evenodd'); c.restore();
    c.strokeStyle = '#ffffff55'; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2 - r * 1.3, cy); c.lineTo(W / 2 + r * 1.3, cy); c.stroke();
    for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(W / 2 + i * r * .2, cy - (i % 5 ? 3 : 7)); c.lineTo(W / 2 + i * r * .2, cy); c.stroke(); }
    if (tagT) { c.strokeStyle = brass; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, cy, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(tagT.t / .45, 0, 1)); c.stroke(); }
    c.fillStyle = brass; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('HOLD ON A SOLDIER TO TAG', W / 2, cy + r + 16);
    c.restore();
  }
  function tags(c, brass, red) {
    for (const s of men) {
      if (!s.tagged || s.ko) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 2.2, s.y); if (z > 1 || x < 0 || x > W || y < 0 || y > H) continue;
      c.fillStyle = s.alert ? red : brass; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y - 6); c.lineTo(x + 4, y - 6); c.fill();
      if (!scoped) { c.font = '700 7px "Courier New", monospace'; c.textAlign = 'center'; c.fillText(Math.round(Math.hypot(s.x - WD.v.cam.position.x, s.y - WD.v.cam.position.z)) + 'm', x, y - 9); }
    }
  }
  function koPops(c) {
    for (const s of men) {
      const k = s.koFx; if (!k || k.t > 2.2) continue;
      const [x, y, z] = WD.v.toScreen(s.x, s.gy + 1.6, s.y); if (z > 1) continue;
      const a = clamp(2.2 - k.t, 0, 1), yy = y - 20 - k.t * 10;
      c.save(); c.globalAlpha = a; c.textAlign = 'center';
      c.font = '800 16px Rubik, sans-serif'; c.fillStyle = '#ffe9a8'; c.strokeStyle = '#000a'; c.lineWidth = 3; c.strokeText('KO +' + k.pts, x, yy); c.fillText('KO +' + k.pts, x, yy);
      c.font = '700 8px "Courier New", monospace'; c.fillStyle = '#f2ead6'; c.fillText(k.tags.join(' · '), x, yy + 12);
      c.restore();
    }
  }
  function buttons(c, brass, red) {
    const disc = (b, label, on, ring) => {
      c.save(); c.translate(b.x, b.y);
      const g = c.createRadialGradient(-b.r * .3, -b.r * .4, b.r * .1, 0, 0, b.r); g.addColorStop(0, on ? '#f0d488' : '#3b3830'); g.addColorStop(1, on ? '#8a6a28' : '#1a1916'); c.fillStyle = g;
      c.globalAlpha = .92; c.beginPath(); c.arc(0, 0, b.r, 0, TAU); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = brass; c.lineWidth = 1.5; c.stroke();
      if (ring != null) { c.strokeStyle = '#f2ead6'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, b.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * ring); c.stroke(); }
      c.fillStyle = on ? '#2b2a26' : '#f2ead6'; c.font = `800 ${Math.round(b.r * .32)}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(label, 0, b.r * .12);
      c.restore();
    };
    const ready = !gun.reloading && boltT <= 0 && gun.ammo > 0;
    disc(BTN.fire, 'FIRE', ready, gun.reloading ? gun.reloading : null);
    if (!scoped) { c.font = '700 8px "Courier New", monospace'; c.textAlign = 'center'; c.fillStyle = brass; c.fillText('●'.repeat(gun.ammo) + '○'.repeat(gun.mag - gun.ammo), BTN.fire.x, BTN.fire.y + BTN.fire.r + 12); }
    disc(BTN.scope, scoped ? 'BACK' : 'SCOPE', scoped);
    if (scoped) disc(BTN.left, 'BREATH', breath.held && breath.v > 0, breath.v);
    else disc(BTN.left, glass ? 'BACK' : 'GLASS', glass);
    const nn = nextNest();
    if (nn && !move) {
      const b = BTN.move, hot = located || mortar;
      c.save(); c.fillStyle = hot ? red : '#12110ecc'; roundRect(c, b.x, b.y, b.w, b.h, 6); c.fill();
      if (hot && Math.floor(t * 3) % 2) { c.strokeStyle = '#f2ead6'; c.lineWidth = 2; c.stroke(); }
      c.fillStyle = '#f2ead6'; c.font = '700 9px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('MOVE ▸ ' + NESTS[nn].name.toUpperCase(), b.x + b.w / 2, b.y + 16, b.w - 8);
      c.restore();
    }
  }
  function qteDraw(c, brass) {
    const p = qte.now; if (!p) return;
    const k = clamp(p.t / p.time0, 0, 1), x = p.x ?? W / 2, y = p.y ?? H * .55;
    c.save(); c.strokeStyle = brass; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 30 + 40 * k, 0, TAU); c.stroke();
    c.fillStyle = '#12110ecc'; c.beginPath(); c.arc(x, y, 28, 0, TAU); c.fill();
    c.fillStyle = '#f2ead6'; c.font = '800 12px Rubik, sans-serif'; c.textAlign = 'center';
    const label = p.kind === 'tap' ? 'TAP' : p.kind === 'hold' ? 'HOLD' : p.kind === 'mash' ? 'TAP!' : p.dir === 'up' ? '▲ SWIPE' : p.dir === 'down' ? '▼ SWIPE' : 'SWIPE';
    c.fillText(label, x, y + 4);
    if (p.kind === 'hold') { c.strokeStyle = '#9fd070'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.held / p.hold, 0, 1)); c.stroke(); }
    c.font = '700 9px "Courier New", monospace'; c.fillStyle = brass; c.fillText(qteKind === 'climb' ? 'CLIMB THE BELFRY' : 'JUMP FOR THE TRAIN', x, y - 52 - 40 * k);
    c.restore();
  }
  function dossier(c, ink, paper, brass, red) {
    c.fillStyle = '#0b0b0a88'; c.fillRect(0, 0, W, H);
    const w = Math.min(W - 24, 360), x = W / 2 - w / 2, y = H < 380 ? 10 : Math.max(14, H * .06);
    c.save();
    const fh = H < 380 ? H - y - 12 : Math.min(H - y - 14, 380);
    c.fillStyle = '#5b4a30'; roundRect(c, x - 4, y - 4, w + 8, fh + 8, 8); c.fill();
    c.fillStyle = paper; roundRect(c, x, y, w, fh, 6); c.fill();
    c.fillStyle = red; c.font = '800 22px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('LONG SHADOW', x + 14, y + 32);
    c.fillStyle = '#8a7f66'; c.font = '700 9px "Courier New", monospace'; c.fillText('FIELD FILE · CODENAME WREN · ASHVALE 1944', x + 14, y + 46, w - 28);
    let yy = y + 60; briefRows = [];
    for (const m of camp.missions) {
      const on = m.id === sel, open = camp.open(m.id), st = camp.starList(m.id);
      c.fillStyle = on ? '#d9cba6' : '#0000'; c.fillRect(x + 8, yy, w - 16, H < 380 ? 31 : 34);
      c.fillStyle = open ? ink : '#8a7f66'; c.font = '700 13px Rubik, sans-serif'; c.fillText((camp.missions.indexOf(m) + 1) + ' · ' + m.name, x + 16, yy + 15);
      c.font = '700 12px Rubik, sans-serif'; c.fillStyle = brass; c.textAlign = 'right'; c.fillText(st.map(s => s ? '★' : '☆').join(''), x + w - 16, yy + 15); c.textAlign = 'left';
      c.fillStyle = '#8a7f66'; c.font = '600 9px "Courier New", monospace'; c.fillText(open ? (camp.done(m.id) ? 'DONE' : 'READY') : 'LOCKED: FINISH THE ONE ABOVE', x + 16, yy + 28);
      briefRows.push({ x: x + 8, y: yy, w: w - 16, h: 34, id: m.id });
      yy += H < 380 ? 33 : 38;
    }
    const short = H < 380;
    if (short) { c.fillStyle = '#8a7f66'; c.font = '700 10px Rubik, sans-serif'; c.fillText(SEALED.map(([n, name]) => n + ' · ' + name).join('   '), x + 16, yy + 12, w - 32); c.fillStyle = red; c.font = '700 8px "Courier New", monospace'; c.fillText('SEALED · COMING SOON', x + 16, yy + 23); yy += 30; }
    else for (const [n, name] of SEALED) { c.fillStyle = '#8a7f66'; c.font = '700 12px Rubik, sans-serif'; c.fillText(n + ' · ' + name, x + 16, yy + 14); c.font = '700 8px "Courier New", monospace'; c.fillStyle = red; c.textAlign = 'right'; c.fillText('SEALED · COMING SOON', x + w - 16, yy + 14); c.textAlign = 'left'; yy += 22; }
    yy += 6;
    const textW = short ? w - 160 : w - 32;
    c.fillStyle = ink; c.font = '500 11px Rubik, sans-serif'; for (const s of wrap(c, BRIEF[sel], textW)) { c.fillText(s, x + 16, yy + 10); yy += 14; }
    const gx = short ? x + w - 76 : W / 2, gy = short ? Math.min(yy - 10, H - 40) : Math.min(H - 54, yy + 40); briefGo = { x: gx, y: gy, r: 28 };
    c.translate(gx, gy); c.rotate(-.08); c.strokeStyle = red; c.lineWidth = 3; c.strokeRect(-56, -18, 112, 36); c.fillStyle = red; c.font = '800 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('GO', 0, 7);
    c.restore();
    briefGo.r = 56;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'long-shadow',
  title: 'Long Shadow',
  tag: 'Next Gen · Sniper',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 1500, reward: 30,
  hint: 'A sniper campaign in a 1944 valley. Drag to look, tap GLASS to tag soldiers, SCOPE in, hold BREATH and FIRE: aim above far targets and into the wind. Shoot while the train or bell is loud, and MOVE when they find you.',
  traits: ['theme:military', 'genre:shooter'],
  creator: 'Game Scroll',
  make,
};
