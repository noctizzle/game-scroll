import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;
const { HDView, Particles, pbr, rbox, surface, speckle, sun, THREE } = gs.hd;
const {
  Group, Mesh, InstancedMesh, Object3D, SphereGeometry, CylinderGeometry, CapsuleGeometry, IcosahedronGeometry, PlaneGeometry, CircleGeometry,
  TorusGeometry, BufferAttribute, MeshBasicMaterial, PointLight, CanvasTexture, Color, DoubleSide, AdditiveBlending, SRGBColorSpace, Vector3,
} = THREE;

// Suit Ops (Next Gen): fight up through an island jungle in a power suit and reach the chopper.
// Drag to walk; the suit fires on its own at the nearest guard, or put a second thumb down and drag
// it to aim and fire yourself (twin-stick). Four suit modes share one energy bar: ARMOR soaks hits,
// CLOAK hides you (your first shot out of cloak hits triple), SPEED doubles your pace, POWER makes
// every round punch through. Energy refills in ARMOR when nothing is hitting you.
// The game logic runs on a flat map in game units (as before); the 3D world is 1 unit = 10 cm.
let W = 200, H = 260;
const K = .1;
const MODES = [
  { k: 'ARMOR', col: '#58a8f8' }, { k: 'CLOAK', col: '#a8f8f8' }, { k: 'SPEED', col: '#f8d048' }, { k: 'POWER', col: '#f85858' },
];

/* ---------- shared look (built once) ---------- */
let M = null;
function looks() {
  if (M) return M;
  const ground = surface(512, g => {          // jungle floor: dark soil, leaf litter, moss
    const { col, h, r, size: S } = g;
    col.fillStyle = '#2e2818'; col.fillRect(0, 0, S, S); h.fillStyle = '#707070'; h.fillRect(0, 0, S, S); r.fillStyle = '#e8e8e8'; r.fillRect(0, 0, S, S);
    speckle(col, S, 3000, '#22200f', 3, .5); speckle(col, S, 1500, '#5a5030', 2.5, .4);
    for (let i = 0; i < 26; i++) { const x = Math.random() * S, y = Math.random() * S, R = rnd(40, 110); for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const gr = col.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R); gr.addColorStop(0, '#3e5a22aa'); gr.addColorStop(1, '#3e5a2200'); col.fillStyle = gr; col.fillRect(x + ox - R, y + oy - R, R * 2, R * 2); } }
    for (let i = 0; i < 700; i++) {     // fallen leaves
      const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28, l = rnd(4, 9), c2 = ['#3e3a1e', '#4a3418', '#34401a', '#4e4424'][i % 4];
      for (const [c, v] of [[col, c2], [h, '#c8c8c8'], [r, '#a0a0a0']]) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = v; c.beginPath(); c.ellipse(0, 0, l, l * .4, 0, 0, 7); c.fill(); c.restore(); }
    }
    for (let i = 0; i < 40; i++) { const x = Math.random() * S, y = Math.random() * S; h.fillStyle = '#e0e0e0'; h.beginPath(); h.arc(x, y, rnd(3, 8), 0, 7); h.fill(); col.fillStyle = '#4a4840'; col.beginPath(); col.arc(x, y, rnd(3, 7), 0, 7); col.fill(); }   // pebbles
  }, { strength: 2 });
  const bark = surface(256, g => {
    const { col, h, r, size: S } = g;
    col.fillStyle = '#4a3a28'; col.fillRect(0, 0, S, S); r.fillStyle = '#f0f0f0'; r.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 2) { const v = 90 + Math.random() * 120 | 0; h.fillStyle = `rgb(${v},${v},${v})`; h.fillRect(x, 0, 2 + Math.random() * 3, S); col.fillStyle = Math.random() < .5 ? '#3a2c1c' : '#5a4834'; col.globalAlpha = .5; col.fillRect(x, 0, 2, S); col.globalAlpha = 1; }
    speckle(col, S, 400, '#5a7a30', 4, .4);
  }, { strength: 3 });
  const leaf = surface(256, g => {            // canopy: layered leaf shapes
    const { col, h, r, size: S } = g;
    col.fillStyle = '#1e4a18'; col.fillRect(0, 0, S, S); h.fillStyle = '#404040'; h.fillRect(0, 0, S, S); r.fillStyle = '#b0b0b0'; r.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28, l = rnd(10, 22), c2 = ['#2e6a22', '#3c7e2a', '#24561c', '#4a8a30'][i % 4];
      for (const [c, v] of [[col, c2], [h, `rgb(${150 + i % 100},${150 + i % 100},${150 + i % 100})`], [r, '#909090']]) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = v; c.beginPath(); c.ellipse(0, 0, l, l * .45, 0, 0, 7); c.fill(); c.restore(); }
    }
  }, { strength: 2.5 });
  // fern frond card with alpha
  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 256; const fx = fc.getContext('2d');
  fx.strokeStyle = '#2a4a18'; fx.lineWidth = 3; fx.beginPath(); fx.moveTo(64, 256); fx.quadraticCurveTo(70, 120, 60, 6); fx.stroke();
  for (let y = 20; y < 246; y += 9) { const w = 50 * Math.sin((y / 256) * Math.PI) + 6, c = y % 18 ? '#3e7a2a' : '#4a8a32'; fx.fillStyle = c; for (const sd of [-1, 1]) { fx.beginPath(); fx.moveTo(64, y); fx.quadraticCurveTo(64 + sd * w * .6, y - 10, 64 + sd * w, y - 2); fx.quadraticCurveTo(64 + sd * w * .5, y + 4, 64, y + 6); fx.fill(); } }
  const fern = new CanvasTexture(fc); fern.colorSpace = SRGBColorSpace;
  const lc = document.createElement('canvas'); lc.width = lc.height = 64; const lx = lc.getContext('2d'), lg = lx.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, '#fff'); lg.addColorStop(1, '#000'); lx.fillStyle = lg; lx.fillRect(0, 0, 64, 64);
  const hx = lx.createLinearGradient(0, 0, 64, 0); hx.addColorStop(0, '#000'); hx.addColorStop(.5, '#0000'); hx.addColorStop(1, '#000'); lx.globalCompositeOperation = 'multiply'; lx.fillStyle = '#fff'; lx.fillRect(0, 0, 64, 64); lx.globalCompositeOperation = 'source-over'; lx.fillStyle = hx; lx.fillRect(0, 0, 64, 64);
  const m = {
    ground: pbr('#ffffff', { tex: ground.repeat(10, 10), rough: 1 }),
    bark: pbr('#ffffff', { tex: bark.repeat(1, 3), rough: 1 }), leaf: pbr('#ffffff', { tex: leaf.repeat(2, 2), rough: 1, sheen: .6, sheenColor: new Color('#a8e070') }),
    fern: pbr('#ffffff', { map: fern, alphaTest: .5, side: DoubleSide, rough: .7 }),
    rock: pbr('#4a5044', { rough: .8 }), moss: pbr('#4a6a2a', { rough: 1 }),
    shaft: new MeshBasicMaterial({ color: new Color('#fff0c0').multiplyScalar(.06), alphaMap: new CanvasTexture(lc), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false }),
    // suit
    plate: pbr('#5a6878', { rough: .3, metal: .6, clear: .8 }), under: pbr('#151a20', { rough: .6, metal: .3 }),
    ghost: pbr('#a8f8f8', { rough: .05, metal: 1, transparent: true, opacity: .18, depthWrite: false, glow: .3 }),
    visor: pbr('#a8f8f8', { glow: 4 }), trims: MODES.map(md => pbr(md.col, { glow: 4 })),
    gun: pbr('#1e2226', { rough: .3, metal: .9, clear: .5 }),
    // guards
    camo: pbr('#8a7650', { rough: .85 }), camoD: pbr('#6a5a3c', { rough: .85 }), vest: pbr('#3e4430', { rough: .6, clear: .2 }),
    skin: pbr('#d8a880', { rough: .5 }), helm: pbr('#4e5638', { rough: .4, metal: .2, clear: .4 }), boot: pbr('#18140f', { rough: .3, clear: .6 }),
    sand: pbr('#a89870', { rough: .95 }), hit: pbr('#ffffff', { glow: 6 }),
    // chopper + pad
    pad: pbr('#5a5e58', { rough: .7 }), paint: pbr('#f0f0e8', { rough: .5 }), heli: pbr('#3e4a38', { rough: .35, metal: .4, clear: .7 }),
    glass: pbr('#90c8e8', { rough: .05, metal: .9, clear: 1, glow: .15 }), red: pbr('#ff3020', { glow: 5 }), greenL: pbr('#30ff60', { glow: 5 }),
    blur: new MeshBasicMaterial({ color: '#202020', transparent: true, opacity: .25, depthWrite: false, side: DoubleSide }),
    tracer: new MeshBasicMaterial({ color: new Color(6, 5, 2.4) }), tracerP: new MeshBasicMaterial({ color: new Color(6, 2, 1.4) }), bolt: new MeshBasicMaterial({ color: new Color(6, .8, .6) }),
  };
  // organic canopy blobs: icospheres pushed in and out
  const blobs = [0, 1, 2].map(k => { const g = new IcosahedronGeometry(1, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new Vector3().fromBufferAttribute(p, i), n = 1 + .18 * Math.sin(v.x * 5 + k) * Math.cos(v.y * 4 - k) + .08 * Math.sin(v.z * 9); p.setXYZ(i, v.x * n, v.y * n * .8, v.z * n); } g.computeVertexNormals(); return g; });
  M = { m, blobs, G: { ball: new SphereGeometry(1, 20, 14), cyl: new CylinderGeometry(1, 1, 1, 16), trunk: new CylinderGeometry(.7, 1, 1, 12, 4), pill: new CapsuleGeometry(1, 1, 5, 12), plane: new PlaneGeometry(1, 1), disc: new CircleGeometry(1, 32), torus: new TorusGeometry(1, .05, 8, 32), rock: new IcosahedronGeometry(1, 1) } };
  return M;
}
function P(geo, mat, o = {}) {
  const m = new Mesh(geo, mat), s = o.s ?? 1;
  m.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  m.castShadow = o.cast !== false; m.receiveShadow = true; return m;
}
const B = (w, h, d, mat, o = {}) => P(rbox(w, h, d, o.r ?? Math.min(w, h, d) * .25), mat, o);

function makeSuit() {
  const { m, G } = looks(), g = new Group(), body = new Group(); g.add(body); body.position.y = .95;
  const trims = [];
  const legs = [-1, 1].map(k => { const l = new Group(); l.position.set(k * .13, .95, 0); l.add(B(.16, .5, .18, m.plate, { y: -.25 }), B(.14, .42, .16, m.under, { y: -.68 }), B(.18, .1, .28, m.plate, { y: -.92, z: .04 })); const tr = B(.17, .03, .19, m.trims[0], { y: -.42, cast: false }); l.add(tr); trims.push(tr); g.add(l); return l; });
  body.add(B(.46, .5, .3, m.plate, { y: .28 }), B(.4, .2, .26, m.under, { y: .0 }), B(.3, .1, .06, m.plate, { y: .36, z: .16 }));
  for (const k of [-1, 1]) body.add(B(.2, .16, .26, m.plate, { x: k * .3, y: .48 }));
  const chest = B(.36, .03, .02, m.trims[0], { y: .2, z: .155, cast: false }); body.add(chest); trims.push(chest);
  const head = new Group(); head.position.y = .68; body.add(head);
  head.add(B(.22, .24, .24, m.plate, { r: .08 }), B(.17, .05, .02, m.visor, { y: .02, z: .12, cast: false }));
  const arms = new Group(); arms.position.set(0, .42, 0); body.add(arms);
  for (const k of [-1, 1]) arms.add(B(.11, .34, .12, m.plate, { x: k * .3, y: -.12, z: .12, rx: -1.1 }));
  const gun = new Group(); gun.position.set(.1, -.1, .38); arms.add(gun);
  gun.add(B(.07, .1, .5, m.gun), B(.04, .04, .26, m.gun, { z: .35 }), B(.05, .12, .06, m.gun, { y: -.1, z: .05 }));
  const gt = B(.075, .015, .3, m.trims[0], { y: .055, cast: false }); gun.add(gt); trims.push(gt);
  const parts = []; g.traverse(o => { if (o.isMesh && !trims.includes(o) && o.material !== m.visor) { o.userData.base = o.material; parts.push(o); } });
  const sh = new Mesh(G.disc, new MeshBasicMaterial({ color: '#000', transparent: true, opacity: .35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; sh.scale.setScalar(.45); g.add(sh);
  return { g, body, legs, arms, trims, parts, setMode(i) { for (const t of trims) t.material = m.trims[i]; for (const p of parts) p.material = i === 1 ? m.ghost : p.userData.base; for (const p of parts) p.castShadow = i !== 1; } };
}
function makeGuard(kind) {
  const { m, G } = looks(), g = new Group(), s = kind === 'heavy' ? 1.25 : 1;
  if (kind === 'nest') {
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.add(P(G.pill, m.sand, { sx: .2, sy: .25, sz: .2, x: Math.cos(a) * .85, y: .2, z: Math.sin(a) * .85, rx: Math.PI / 2, rz: a })); if (i % 2) g.add(P(G.pill, m.sand, { sx: .19, sy: .24, sz: .19, x: Math.cos(a) * .85, y: .48, z: Math.sin(a) * .85, rx: Math.PI / 2, rz: a })); }
    const gun = new Group(); gun.position.y = .8; g.add(gun); gun.add(B(.2, .2, .5, m.gun), P(G.cyl, m.gun, { sx: .04, sy: .8, sz: .04, z: .6, rx: Math.PI / 2 }), B(.5, .4, .04, m.vest, { y: .1, z: .2 }));
    g.add(P(G.cyl, m.gun, { sx: .05, sy: .8, sz: .05, y: .4 }));
    const helm = P(G.ball, m.helm, { sx: .16, sy: .12, sz: .17, y: .78, z: -.35 }); g.add(helm);
    g.userData.aim = gun; return g;
  }
  const legs = [-1, 1].map(k => { const l = new Group(); l.position.set(k * .12 * s, .85 * s, 0); l.add(P(G.pill, m.camoD, { sx: .09 * s, sy: .3 * s, sz: .09 * s, y: -.36 * s }), B(.13 * s, .1 * s, .24 * s, m.boot, { y: -.8 * s, z: .04 })); g.add(l); return l; });
  const body = new Group(); body.position.y = .85 * s; g.add(body);
  body.add(P(G.pill, m.camo, { sx: .2 * s, sy: .22 * s, sz: .15 * s, y: .3 * s }), B(.4 * s, .34 * s, .3 * s, m.vest, { y: .32 * s, r: .05 }));
  body.add(P(G.ball, m.skin, { s: .13 * s, y: .72 * s }), P(G.ball, m.helm, { sx: .16 * s, sy: .11 * s, sz: .17 * s, y: .79 * s }));
  const gun = new Group(); gun.position.set(.12 * s, .32 * s, .25 * s); body.add(gun);
  gun.add(B(.06, .08, .55, m.gun, { z: .1 }), B(.05, .12, .05, m.gun, { y: -.1 }));
  for (const k of [-1, 1]) body.add(P(G.pill, m.camo, { sx: .07 * s, sy: .16 * s, sz: .07 * s, x: k * .22 * s, y: .38 * s, z: .15, rx: -1.2 }));
  const sh = new Mesh(G.disc, new MeshBasicMaterial({ color: '#000', transparent: true, opacity: .35, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; sh.scale.setScalar(.4 * s); g.add(sh);
  g.userData.legs = legs; g.userData.body = body; g.userData.aim = gun; g.rotation.order = 'YXZ';
  return g;
}
function makeChopper() {
  const { m, G } = looks(), g = new Group();
  g.add(P(G.cyl, m.pad, { sx: 5, sy: .25, sz: 5, y: .12 }), P(G.torus, m.paint, { s: 4, rx: Math.PI / 2, y: .26, cast: false }));
  for (const [x, z, w, d] of [[-1, 0, .35, 2.4], [1, 0, .35, 2.4], [0, 0, 2, .35]]) g.add(P(G.plane, m.paint, { sx: w, sy: d, x, y: .26, z, rx: -Math.PI / 2, cast: false }));
  const lights = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, l = P(G.ball, m.greenL, { s: .1, x: Math.cos(a) * 4.6, y: .3, z: Math.sin(a) * 4.6, cast: false }); g.add(l); lights.push(l); }
  const h = new Group(); h.position.set(0, .25, -.5); g.add(h);
  h.add(P(G.pill, m.heli, { sx: 1.3, sy: 1.6, sz: 1.3, y: 1.4, rx: Math.PI / 2 }), P(G.ball, m.glass, { sx: 1.05, sy: .9, sz: 1, y: 1.55, z: 1.3 }));
  h.add(P(G.cyl, m.heli, { sx: .3, sy: 4.5, sz: .25, y: 1.7, z: -3.6, rx: Math.PI / 2 - .08 }), B(.1, 1.2, .8, m.heli, { y: 2.3, z: -5.7 }));
  for (const k of [-1, 1]) h.add(P(G.cyl, m.gun, { sx: .06, sy: 3.2, sz: .06, x: k * .9, y: .15, rx: Math.PI / 2 }), P(G.cyl, m.gun, { sx: .04, sy: .6, sz: .04, x: k * .8, y: .45, z: .6, rz: k * .3 }), P(G.cyl, m.gun, { sx: .04, sy: .6, sz: .04, x: k * .8, y: .45, z: -.7, rz: k * .3 }));
  const beacon = P(G.ball, m.red, { s: .12, y: 2.85, cast: false }); h.add(beacon);
  const rotor = new Group(); rotor.position.y = 2.75; h.add(rotor);
  rotor.add(P(G.cyl, m.gun, { sx: .12, sy: .3, sz: .12 }), B(7.5, .05, .3, m.gun, { cast: false }), B(.3, .05, 7.5, m.gun, { cast: false }));
  const disc = new Mesh(G.disc, m.blur); disc.scale.setScalar(3.8); disc.position.y = 2.8; h.add(disc);
  g.userData = { rotor, lights, beacon, disc }; return g;
}

function make(api) {
  let p, trees, foes, downs, shots, bolts, cam, L, stage, score, t, mode, energy, msg, stick, aimF, dead, cleared, fireT, ambush, hurtT, flashT;
  let v, sunL, add, dust, smoke, suit, world, chopper, treeIM, foeMeshes, trIM, boIM, muzzle, built;
  const barH = 34, top = 0;
  function setup() {
    if (v) return;
    const { m, G } = looks();
    v = new HDView({ bg: '#33503e', fog: .022, env: .25, sky: '#b8d8f0', ground: '#2a3418', amb: .35, fov: 46 });
    v.exposure = .95; v.bloom = .6;
    sunL = sun('#ffe4b0', 4.6, 14, [-.55, 1, .5]); v.scene.add(sunL, sunL.target); v.onTier(T => sunL.setTier(T));
    const gr = P(G.plane, m.ground, { sx: 200, sy: 200, rx: -Math.PI / 2, cast: false }); v.scene.add(gr); v.ground = gr;
    add = new Particles(v, { max: 360, additive: true }); smoke = new Particles(v, { max: 140, additive: false }); dust = new Particles(v, { max: 120, additive: true });
    suit = makeSuit(); v.scene.add(suit.g);
    muzzle = new PointLight('#ffd890', 0, 6, 1.6); v.scene.add(muzzle);
    trIM = new InstancedMesh(G.pill, m.tracer, 40); boIM = new InstancedMesh(G.pill, m.bolt, 60); trIM.frustumCulled = boIM.frustumCulled = false; v.scene.add(trIM, boIM);
    trIM.userData.p = new InstancedMesh(G.pill, m.tracerP, 40); trIM.userData.p.frustumCulled = false; v.scene.add(trIM.userData.p);
    // sun shafts slanting through the canopy, near the camera
    v.shafts = []; for (let i = 0; i < 6; i++) { const s = new Mesh(G.plane, m.shaft); s.scale.set(rnd(1.5, 3), 22, 1); s.rotation.set(0, rnd(-.5, .5), .45); v.scene.add(s); v.shafts.push({ m: s, ox: rnd(-12, 12), oz: rnd(-14, 4) }); }
  }
  function build() {
    setup();
    L = 1300 + stage * 260; trees = []; foes = []; downs = []; shots = []; bolts = [];
    for (let i = 0; i < L / 22; i++) { const r = rnd(9, 16), tr = { x: rnd(r + 14, W - r - 14), y: rnd(80, L - 60), r }; if (Math.abs(tr.x - W / 2) < 30 && tr.y > L - 140) continue; if (trees.some(o => Math.hypot(o.x - tr.x, o.y - tr.y) < o.r + r + 15)) continue; trees.push(tr); }
    const n = 6 + stage * 3;
    for (let i = 0; i < n; i++) {
      const y = 80 + (L - 260) * (i + Math.random() * .6) / n, kind = stage > 0 && Math.random() < .2 + stage * .04 ? 'heavy' : Math.random() < .2 ? 'nest' : 'grunt';
      foes.push({ x: rnd(20, W - 20), y, kind, hp: kind === 'heavy' ? 9 : kind === 'nest' ? 6 : 3, max: kind === 'heavy' ? 9 : kind === 'nest' ? 6 : 3, alert: 0, cd: rnd(.5, 1.5), dir: Math.random() < .5 ? 1 : -1, flash: 0, walk: 0 });
    }
    p = { x: W / 2, y: L - 50, hp: 100, face: Math.PI, walk: 0 }; cam = p.y; energy = 100; mode = 0; ambush = false; cleared = 0; fireT = 0; hurtT = 9; flashT = 0;
    msg = { txt: `ZONE ${stage + 1}`, sub: 'Reach the chopper', l: 2.2 };
    buildWorld();
  }
  function buildWorld() {
    const { m, G, blobs } = looks(), mx = new Object3D();
    if (world) { v.scene.remove(world); world.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }
    world = new Group(); v.scene.add(world);
    // trees in the play area + a dense wall of jungle beyond both edges
    const all = trees.map(tr => ({ x: tr.x, y: tr.y, s: tr.r / 12 }));
    for (let y = -80; y < L + 120; y += 22) for (const side of [-1, 1]) all.push({ x: side < 0 ? rnd(-40, -8) : W + rnd(8, 40), y: y + rnd(-8, 8), s: rnd(1.3, 1.9) });
    for (let x = -40; x < W + 40; x += 24) all.push({ x: x + rnd(-6, 6), y: rnd(-50, -10), s: rnd(1.3, 1.8) });
    const ferns = [];
    const fernN = Math.min(1600, (L / 6 | 0) * 3);
    for (let i = 0; i < fernN; i++) ferns.push({ x: Math.random() < .7 ? rnd(-10, W + 10) : rnd(-40, W + 40), y: rnd(-40, L + 40), s: rnd(.6, 1.4), a: Math.random() * 3 });
    // Instanced in 25 m strips along the map, so strips off screen are skipped (frustum culling)
    const fernGeo = new PlaneGeometry(1, 1); fernGeo.translate(0, .5, 0); const FR = 5;   // a fern = 5 fronds fanned out
    const CH = 250;
    for (let y0 = -100; y0 < L + 150; y0 += CH) {
      const tr = all.filter(o => o.y >= y0 && o.y < y0 + CH), fe = ferns.filter(o => o.y >= y0 && o.y < y0 + CH);
      if (tr.length) {
        const trunks = new InstancedMesh(G.trunk, m.bark, tr.length), crowns = blobs.map(b => new InstancedMesh(b, m.leaf, tr.length));
        tr.forEach((o, i) => {
          const s = o.s, X = o.x * K, Z = o.y * K, hgt = 2.2 + s * 1.3;
          mx.position.set(X, hgt / 2, Z); mx.rotation.set(rnd(-.05, .05), Math.random() * 6, rnd(-.05, .05)); mx.scale.set(.26 * s, hgt, .26 * s); mx.updateMatrix(); trunks.setMatrixAt(i, mx.matrix);
          crowns.forEach((cm, k) => { const a = k * 2.1 + i, d = k ? 1.1 * s : 0; mx.position.set(X + Math.cos(a) * d, hgt + (k ? -.4 : .4) * s, Z + Math.sin(a) * d); mx.rotation.set(0, a, 0); mx.scale.setScalar((k ? 1.05 : 1.4) * s); mx.updateMatrix(); cm.setMatrixAt(i, mx.matrix); });
        });
        for (const im of [trunks, ...crowns]) { im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); world.add(im); }
      }
      if (fe.length) {
        const fi = new InstancedMesh(fernGeo, m.fern, fe.length * FR); fi.receiveShadow = true;
        fe.forEach((o, i) => { for (let k = 0; k < FR; k++) { mx.position.set(o.x * K, .02, o.y * K); mx.rotation.set(0, o.a + k * Math.PI * 2 / FR + rnd(-.2, .2), 0); mx.rotateX(rnd(.7, 1.15)); mx.scale.set(o.s * .45, o.s * rnd(.8, 1.1), 1); mx.updateMatrix(); fi.setMatrixAt(i * FR + k, mx.matrix); } });
        fi.computeBoundingSphere(); world.add(fi);
      }
    }
    // mossy rocks
    const rocks = new InstancedMesh(G.rock, m.rock, 60); rocks.castShadow = rocks.receiveShadow = true;
    for (let i = 0; i < 60; i++) { mx.position.set(rnd(0, W) * K, 0, rnd(0, L) * K); mx.rotation.set(rnd(0, 3), rnd(0, 3), 0); mx.scale.set(rnd(.3, .7), rnd(.2, .45), rnd(.3, .7)); mx.updateMatrix(); rocks.setMatrixAt(i, mx.matrix); }
    world.add(rocks);
    v.ground.position.set(W * K / 2, 0, L * K / 2); v.ground.scale.set(W * K + 160, L * K + 160, 1);
    for (const tx of [m.ground.map, m.ground.normalMap, m.ground.roughnessMap]) tx.repeat.set((W * K + 160) / 5, (L * K + 160) / 5);   // ~5 m per tile
    chopper = makeChopper(); chopper.position.set(W / 2 * K, 0, 26 * K); world.add(chopper);
    foeMeshes = new Map(); for (const f of foes) { const g = makeGuard(f.kind); g.position.set(f.x * K, 0, f.y * K); world.add(g); foeMeshes.set(f, g); }
    built = true; v.warmed = false;
  }
  function blocked(x, y, r) { for (const tr of trees) if (Math.hypot(x - tr.x, y - tr.y) < tr.r + r) return tr; return null; }
  function push(o, r) { for (const tr of trees) { const dx = o.x - tr.x, dy = o.y - tr.y, d = Math.hypot(dx, dy), m = tr.r + r; if (d < m && d > 0) { o.x = tr.x + dx / d * m; o.y = tr.y + dy / d * m; } } o.x = clamp(o.x, r, W - r); }
  function burst(x, y, h, n, col, sp = 3) { for (let i = 0; i < n; i++) add.emit({ x: x * K, y: h, z: y * K, vx: rnd(-sp, sp), vy: rnd(0, sp * 1.2), vz: rnd(-sp, sp), life: rnd(.2, .45), size: .035, col, grav: 9, floor: .02 }); }
  function hurt(dmg) {
    hurtT = 0;
    if (mode === 0) { const soak = Math.min(energy / 2.5, dmg * .6); energy -= soak * 2.5; dmg -= soak; burst(p.x, p.y, 1.3, 8, [1, 3, 6], 2); }
    if (mode === 1) { mode = 0; suit.setMode(0); msg = { txt: 'CLOAK BROKEN', l: .8 }; }
    if (dmg > 0) { p.hp -= dmg; haptic('heavy'); sfx(120, .12, 'sawtooth', .05, -40); } else { haptic('light'); sfx(700, .04, 'square', .03, -200); }
    if (p.hp <= 0) { p.hp = 0; dead = .01; haptic('error'); msg = { txt: 'SUIT OFFLINE', l: 9 }; sfx(90, .6, 'sawtooth', .05, -50); }
  }
  function setMode(i) { mode = i; suit.setMode(i); haptic('medium'); sfx(300 + i * 150, .08, 'triangle', .04, 300); const c = new Color(MODES[i].col); for (let k = 0; k < 18; k++) add.emit({ x: p.x * K + rnd(-.3, .3), y: rnd(.2, 1.8), z: p.y * K + rnd(-.3, .3), vy: rnd(.3, 1.2), life: rnd(.4, .8), size: .03, col: [c.r * 4, c.g * 4, c.b * 4] }); }
  function shoot(a) {
    const pow = mode === 3;
    shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: (pow ? 3 : 1) * (ambush ? 3 : 1), pierce: pow, l: .6, hit: new Set() }); ambush = false;
    fireT = pow ? .42 : .22; if (pow) energy -= 5; sfx(pow ? 220 : 900, .03, 'square', .03, -300); flashT = .05; p.face = a;
    const mxp = (p.x + Math.cos(a) * 9) * K, mzp = (p.y + Math.sin(a) * 9) * K;
    muzzle.position.set(mxp, 1.2, mzp); muzzle.intensity = 6;
    for (let i = 0; i < 4; i++) add.emit({ x: mxp, y: 1.2, z: mzp, vx: Math.cos(a) * rnd(2, 5) + rnd(-1, 1), vy: rnd(-.3, .8), vz: Math.sin(a) * rnd(2, 5) + rnd(-1, 1), life: rnd(.05, .12), size: .02, col: [6, 4, 1.5] });
    smoke.emit({ x: mxp, y: 1.2, z: mzp, vx: Math.cos(a) * .5, vy: .3, vz: Math.sin(a) * .5, life: .6, size: .15, grow: 3, col: [.7, .7, .68], a: .2 });
  }
  const self = {
    reset() { stage = 0; score = 0; t = 0; dead = 0; stick = null; aimF = null; build(); suit.setMode(0); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (p) build(); },
    update(dt) {
      t += dt; flashT = Math.max(0, flashT - dt); muzzle.intensity *= Math.pow(.001, dt);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      add.update(dt); smoke.update(dt); dust.update(dt);
      for (const d of downs) d.t += dt; downs = downs.filter(d => { if (d.t > 4) { world.remove(d.m); return false; } return true; });
      if (dead) { dead += dt; if (dead > 2) api.over(); return; }
      if (cleared) { cleared += dt; p.y -= 40 * dt; if (cleared > 2) { stage++; build(); suit.setMode(0); } return; }
      hurtT += dt;
      if (mode === 0) { if (hurtT > 1.5) energy = Math.min(100, energy + 10 * dt); }
      else if (mode === 1) energy -= 9 * dt;
      else if (mode === 2 && stick && stick.m > .1) energy -= 16 * dt;
      if (energy <= 0 && mode !== 0) { energy = 0; mode = 0; suit.setMode(0); haptic('medium'); msg = { txt: 'ENERGY OUT', l: .8 }; }
      if (stick && stick.m > .05) { const sp = (mode === 2 ? 130 : 66) * stick.m; p.x += Math.cos(stick.a) * sp * dt; p.y += Math.sin(stick.a) * sp * dt; p.walk += sp * dt * .12; if (!aimF) p.face = stick.a; if (mode === 2 && Math.random() < dt * 20) dust.emit({ x: p.x * K, y: .1, z: p.y * K, vy: .5, vx: rnd(-.5, .5), vz: rnd(-.5, .5), life: .5, size: .05, col: [3, 2.4, .6] }); }
      push(p, 6); p.y = clamp(p.y, 20, L - 10);
      cam += (p.y - cam) * Math.min(1, dt * 5);
      if (p.y < 44) { cleared = .01; const bonus = Math.round(p.hp) + 50; score += bonus; api.score(score); haptic('success'); sfx(660, .5, 'square', .05, 400); msg = { txt: `EXTRACTED +${bonus}`, sub: 'Next zone', l: 2 }; return; }
      fireT -= dt;
      if (mode !== 1 && fireT <= 0) {
        if (aimF && aimF.m > .25) shoot(aimF.a);   // twin-stick: fire where the second thumb points
        else if (!aimF) { let best = null, bd = 125; for (const f of foes) { const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < bd) { best = f; bd = d; } } if (best) shoot(Math.atan2(best.y - p.y, best.x - p.x)); }
      }
      if (mode === 1) ambush = true;
      for (const s of shots) {
        s.l -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (blocked(s.x, s.y, 0)) { s.l = 0; burst(s.x, s.y, 1.2, 6, [3, 2, .8]); }
        for (const f of foes) if (!s.hit.has(f) && Math.hypot(f.x - s.x, f.y - s.y) < 8) {
          f.hp -= s.dmg; f.flash = .1; f.alert = 3; s.hit.add(f); if (!s.pierce) s.l = 0; burst(s.x, s.y, 1.2, 8, [6, 3.5, 1]);
          if (f.hp <= 0) { const pts = f.kind === 'heavy' ? 30 : f.kind === 'nest' ? 20 : 10; score += pts; api.score(score); sfx(200, .1, 'square', .05, -100); haptic('light'); const g = foeMeshes.get(f); downs.push({ m: g, t: 0, f, dir: Math.atan2(s.vx, s.vy) }); for (let i = 0; i < 12; i++) smoke.emit({ x: f.x * K, y: .5, z: f.y * K, vx: rnd(-1, 1), vy: rnd(.3, 1), vz: rnd(-1, 1), life: 1.2, size: .3, grow: 2, col: [.5, .48, .4], a: .3 }); }
          break;
        }
      }
      shots = shots.filter(s => s.l > 0); foes = foes.filter(f => f.hp > 0);
      for (const f of foes) {
        f.flash = Math.max(0, f.flash - dt); const d = Math.hypot(p.x - f.x, p.y - f.y), sees = mode === 1 ? d < 22 : d < 135;
        if (sees) f.alert = 3; else f.alert = Math.max(0, f.alert - dt);
        let mv = 0;
        if (f.kind !== 'nest') {
          if (f.alert > 0 && mode !== 1) { const a = Math.atan2(p.y - f.y, p.x - f.x), want = d > 80 ? 1 : d < 50 ? -1 : 0, sp = f.kind === 'heavy' ? 18 : 30; f.x += Math.cos(a) * sp * want * dt; f.y += Math.sin(a) * sp * want * dt; mv = Math.abs(want) * sp; }
          else { f.x += f.dir * 16 * dt; mv = 16; if (f.x < 16 || f.x > W - 16 || blocked(f.x + f.dir * 6, f.y, 5)) f.dir *= -1; }
          push(f, 6);
        }
        f.walk += mv * dt * .15;
        if (f.alert > 0 && mode !== 1 && d < 150) {
          f.cd -= dt;
          if (f.cd <= 0) {
            const a = Math.atan2(p.y - f.y, p.x - f.x), n = f.kind === 'nest' ? 3 : 1;
            for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * .22; bolts.push({ x: f.x, y: f.y, vx: Math.cos(aa) * 110, vy: Math.sin(aa) * 110, l: 2.2, dmg: f.kind === 'heavy' ? 18 + stage * 2 : 9 + stage }); }
            f.cd = (f.kind === 'nest' ? 1.5 : f.kind === 'heavy' ? 1.4 : 1.1) * Math.max(.65, 1 - stage * .06); sfx(400, .03, 'square', .02, -200);
            add.emit({ x: (f.x + Math.cos(a) * 7) * K, y: 1.1, z: (f.y + Math.sin(a) * 7) * K, life: .08, size: .12, col: [6, 2, 1] });
          }
        }
      }
      for (const b of bolts) { b.l -= dt; b.x += b.vx * dt; b.y += b.vy * dt; if (blocked(b.x, b.y, 0)) { b.l = 0; burst(b.x, b.y, 1.1, 4, [5, 1.4, 1]); } if (Math.hypot(b.x - p.x, b.y - p.y) < 6) { b.l = 0; hurt(b.dmg); if (dead) return; } }
      bolts = bolts.filter(b => b.l > 0);
      if (Math.random() < dt * 14) dust.emit({ x: p.x * K + rnd(-8, 8), y: rnd(.3, 3), z: cam * K + rnd(-10, 4), vx: rnd(-.1, .1), vy: rnd(-.05, .1), vz: rnd(-.1, .1), life: rnd(2, 4), size: .02, col: [2, 2.4, 1], a: .6, fadeIn: 1 });
    },
    fx(dt) { add.update(dt); smoke.update(dt); dust.update(dt); },
    draw(c) {
      if (!built) build();
      const cx = clamp(p.x, W * .3, W * .7) * K, cz = cam * K;
      v.cam.position.set(cx, 9.5, cz + 7.5); v.cam.lookAt(cx, 0, cz - 2);
      sunL.follow(p.x * K, 0, cz - 4);
      for (const s of v.shafts) s.m.position.set(cx + s.ox, 6, cz + s.oz);
      // suit
      const sg = suit.g; sg.position.set(p.x * K, 0, p.y * K); sg.rotation.y = Math.PI / 2 - p.face;
      const moving = stick && stick.m > .1, sw = moving ? Math.sin(p.walk * 4) * .6 : 0;
      suit.legs[0].rotation.x = sw; suit.legs[1].rotation.x = -sw; suit.body.position.y = .95 + (moving ? Math.abs(Math.cos(p.walk * 4)) * .04 : Math.sin(t * 2) * .01);
      suit.arms.rotation.x = flashT > 0 ? -.08 : 0;
      sg.visible = !(hurtT < .3 && (t * 20 | 0) % 2);
      // guards
      for (const f of foes) {
        const g = foeMeshes.get(f); g.position.set(f.x * K, 0, f.y * K); g.visible = Math.abs(f.y - cam) < 220;
        const a = Math.atan2(p.x - f.x, p.y - f.y);
        if (f.kind === 'nest') { g.userData.aim.rotation.y = a; continue; }
        g.rotation.set(0, f.alert > 0 ? a : (f.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        const s2 = Math.sin(f.walk * 4) * .5; g.userData.legs[0].rotation.x = s2; g.userData.legs[1].rotation.x = -s2;
        g.userData.body.rotation.x = f.flash > 0 ? -.25 : 0;
      }
      for (const d of downs) {
        const g = d.m, k = Math.min(1, d.t / .5), e = 1 - (1 - k) ** 3;
        if (d.f.kind === 'nest') { g.position.y = -e * .3 - Math.max(0, d.t - 2.5) * .4; g.userData.aim.rotation.x = e * .6; continue; }
        g.rotation.set(-e * Math.PI / 2 * .95, d.dir + Math.PI, 0, 'YXZ'); g.position.y = e * .18 - Math.max(0, d.t - 2.5) * .4;
      }
      // tracers (instanced): streaks along their velocity
      const mx = new Object3D(); let nt = 0, np = 0, nb = 0;
      for (const s of shots) { mx.position.set(s.x * K, 1.2, s.y * K); mx.rotation.set(0, Math.atan2(s.vx, s.vy), 0); mx.rotateX(Math.PI / 2); mx.scale.set(.03, .5, .03); mx.updateMatrix(); if (s.pierce) { if (np < 40) trIM.userData.p.setMatrixAt(np++, mx.matrix); } else if (nt < 40) trIM.setMatrixAt(nt++, mx.matrix); }
      for (const b of bolts) { mx.position.set(b.x * K, 1.1, b.y * K); mx.rotation.set(0, Math.atan2(b.vx, b.vy), 0); mx.rotateX(Math.PI / 2); mx.scale.set(.035, .35, .035); mx.updateMatrix(); if (nb < 60) boIM.setMatrixAt(nb++, mx.matrix); }
      trIM.count = nt; trIM.userData.p.count = np; boIM.count = nb;
      for (const im of [trIM, trIM.userData.p, boIM]) im.instanceMatrix.needsUpdate = true;
      // chopper
      const ud = chopper.userData; ud.rotor.rotation.y = t * 22; ud.disc.visible = true; ud.beacon.visible = (t * 2 | 0) % 2 === 0;
      ud.lights.forEach((l, i) => l.visible = ((t * 6 | 0) % 8) === i || ((t * 6 | 0) % 8) === (i + 4) % 8);
      v.hurt = Math.max(hurtT < .4 ? (.4 - hurtT) * 2 : 0, p.hp < 40 && !dead ? .25 + Math.sin(t * 6) * .1 : 0);
      v.render(c, W, H);
      hud(c);
    },
    // touch: first finger walks (stick). A second finger, anywhere above the mode bar, aims and
    // fires (drag in the direction to shoot). The mode bar takes taps from any finger.
    down(x, y, id = 0) {
      if (dead || cleared) return;
      if (y > H - barH) { const i = clamp(Math.floor(x / (W / 4)), 0, 3); const nm = i === mode ? 0 : i; if (nm !== 0 && energy < 8) { sfx(150, .05, 'square', .03); return; } setMode(nm); return; }
      const f = { id, x, y, a: 0, m: 0 };
      if (!stick) stick = f; else if (!aimF) aimF = f;
    },
    move(x, y, pr, id = 0) {
      if (!pr) return; const f = stick && stick.id === id ? stick : aimF && aimF.id === id ? aimF : null; if (!f) return;
      const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy); f.a = Math.atan2(dy, dx); f.m = clamp(d / 22, 0, 1); if (d > 30) { f.x = x - dx / d * 30; f.y = y - dy / d * 30; }
    },
    up(x, y, id = 0) { if (stick && stick.id === id) stick = null; else if (aimF && aimF.id === id) aimF = null; },
    key(k, d) { const dirs = { ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowRight: 0 }; if (k in dirs) stick = d ? { id: 'k', x: W / 2, y: H / 2, a: dirs[k], m: 1 } : null; else if (d && '1234'.includes(k)) self.down((+k - .5) * W / 4, H - 5, 'kb'); },
    get dbg() { return { p, foes, trees }; },
  };
  function hud(c) {
    const u = Math.min(W, H) / 220;
    c.save(); c.textBaseline = 'middle';
    // where the guards are: little markers over their heads
    for (const f of foes) {
      if (Math.abs(f.y - cam) > 200) continue; const [fx, fy, fz] = v.toScreen(f.x * K, 2.3, f.y * K); if (fz > 1) continue;
      if (f.alert > 0 && mode !== 1) { c.fillStyle = '#ff5a4a'; c.font = `800 ${10 * u}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText('!', fx, fy - 6 * u); }
      if (f.hp < f.max) { c.fillStyle = '#0008'; c.fillRect(fx - 9 * u, fy, 18 * u, 2.5 * u); c.fillStyle = '#ff5a4a'; c.fillRect(fx - 9 * u, fy, 18 * u * f.hp / f.max, 2.5 * u); }
    }
    for (const s of [stick, aimF]) if (s && s.id !== 'k') { c.strokeStyle = s === aimF ? '#ff8a6a80' : '#ffffff50'; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(s.x, s.y, 22, 0, 7); c.stroke(); c.fillStyle = s === aimF ? '#ff8a6a60' : '#ffffff50'; c.beginPath(); c.arc(s.x + Math.cos(s.a) * s.m * 22, s.y + Math.sin(s.a) * s.m * 22, 7, 0, 7); c.fill(); }
    // health + energy (top left)
    const glass = (x, y, w, h) => { c.fillStyle = '#05070cb0'; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill(); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke(); };
    glass(6 * u, 6 * u, 92 * u, 26 * u);
    const bar = (y, val, col, lab) => { c.fillStyle = '#f2f5fbcc'; c.font = `700 ${6.5 * u}px Rubik, sans-serif`; c.textAlign = 'left'; c.fillText(lab, 12 * u, y); c.fillStyle = '#ffffff1a'; c.fillRect(30 * u, y - 2 * u, 60 * u, 4 * u); c.fillStyle = col; c.fillRect(30 * u, y - 2 * u, 60 * u * clamp(val, 0, 100) / 100, 4 * u); };
    bar(14 * u, p.hp, p.hp < 40 ? '#ff5a4a' : '#5ae07a', 'HP'); bar(24 * u, energy, MODES[mode].col, 'EN');
    c.textAlign = 'right'; c.font = `800 ${8 * u}px Rubik, sans-serif`; c.fillStyle = '#f2f5fbcc'; c.fillText(`ZONE ${stage + 1}`, W - 8 * u, 13 * u);
    // mode bar
    const bw = W / 4, by = H - barH;
    c.fillStyle = '#05070cc8'; c.fillRect(0, by, W, barH);
    MODES.forEach((md, i) => {
      const x = i * bw + 3, on = i === mode; c.fillStyle = on ? md.col : '#ffffff12'; c.beginPath(); c.roundRect(x, by + 5, bw - 6, barH - 10, 8); c.fill();
      if (on) { c.shadowColor = md.col; c.shadowBlur = 10; c.fill(); c.shadowBlur = 0; }
      c.fillStyle = on ? '#05070c' : md.col; c.textAlign = 'center'; c.font = `800 ${7.5 * u}px Rubik, sans-serif`; c.fillText(md.k, x + (bw - 6) / 2, by + barH / 2 + .5);
    });
    if (msg) {
      c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = '#05070c99'; c.fillRect(0, H * .34 - 18 * u, W, 36 * u);
      c.fillStyle = dead ? '#ff6a5a' : '#fff'; c.font = `800 ${17 * u}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, H * .34 - 3 * u);
      if (msg.sub) { c.fillStyle = '#7cc4ff'; c.font = `600 ${7.5 * u}px Rubik, sans-serif`; c.fillText(msg.sub, W / 2, H * .34 + 10 * u); } c.globalAlpha = 1;
    }
    if (t < 6 && stage === 0 && !msg) { c.textAlign = 'center'; c.fillStyle = '#f2f5fbcc'; c.font = `600 ${7 * u}px Rubik, sans-serif`; c.fillText('Drag to move · the suit fires itself', W / 2, by - 20 * u); c.fillText('2nd thumb: drag to aim · tap a mode below', W / 2, by - 9 * u); }
    c.restore();
  }
  return self;
}

export default {
  id: 'suit-ops', title: 'Suit Ops', tag: 'Next Gen · Jungle', retro: true, era: 'nextgen', pal: 'moss', w: 220, h: 300, maxW: 580, maxH: 440, goal: 300, reward: 20,
  hint: 'Fight up through the jungle to the chopper. Drag to walk; your suit fires on its own, or drag a second thumb to aim yourself. Tap a mode: ARMOR soaks hits and recharges energy, CLOAK hides you and makes your first shot triple, SPEED doubles your pace, POWER rounds punch through. Tap the active mode again to go back to ARMOR.',
  traits: ['theme:military'],
  make,
};
