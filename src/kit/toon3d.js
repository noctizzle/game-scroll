// Console 3D kit: real-time 3D, cel-shaded (toon ramp) with ink outlines, for era:'console' games.
//
// One shared WebGL renderer draws every Console game (phones only allow a handful of WebGL contexts,
// and the feed can hold many slides). Each game owns a View: a three.js scene + camera. In draw(c)
// a game calls v.frame(), places things with v.put(...) (an immediate-mode pool, so game logic can
// stay as plain arrays of objects), then v.render(c) renders the 3D frame into the slide's 2D
// canvas. HUD text and effects are then drawn on top with the normal 2D canvas calls.
//
// Cameras keep touch input simple, because game logic and input stay in the game's own 2D units:
//  - v.board(W, H): tilted top-down diorama view. Ground point (x, y) is drawn exactly at screen
//    (x, y), so taps still mean "this spot on the floor". Use v.at(x, y, height) for positions.
//  - v.side(W, H): side-on view. Point (x, y) on the z=0 plane maps exactly to screen (x, y).
//    Use v.sv(x, y, z) for positions; z < 0 is further away (background), z > 0 nearer.
//  - v.persp(fov): a free perspective camera (runners, racers) the game moves itself; use
//    v.toScreen(x, y, z) to place 2D HUD effects over 3D things.
import {
  Scene, Color, Fog, OrthographicCamera, PerspectiveCamera, DirectionalLight, HemisphereLight,
  MeshToonMaterial, MeshBasicMaterial, ShaderMaterial, Mesh, Group, DataTexture, NearestFilter, RGBAFormat,
  BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, CapsuleGeometry, TorusGeometry, PlaneGeometry,
  CircleGeometry, RingGeometry, BufferGeometry, BufferAttribute, OctahedronGeometry, DodecahedronGeometry, IcosahedronGeometry, DoubleSide, Vector2, Vector3, SRGBColorSpace,
  WebGLRenderTarget, DepthTexture, UnsignedIntType, MeshNormalMaterial,
} from 'three';

import { copyFrame } from './gpu.js';
import { makeRenderer } from './renderer.js';
export * as THREE from 'three';

/* ---------- shared renderer ---------- */
let R = null, broken = false;
function renderer() {
  if (R || broken) return R;
  try {
    const cv = document.createElement('canvas');
    R = makeRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
    R.outputColorSpace = SRGBColorSpace; R.setPixelRatio(1);
  } catch (e) { broken = true; R = null; }
  return R;
}
/** True if this device can draw the 3D Console games. */
export const has3D = () => !!renderer();

// Max pixels rendered per frame; bigger canvases are rendered smaller and scaled up (keeps phones cool).
const MAX_PX = 1.1e6;
let quality = 1, avgGap = 16, tick = 0;

/* ---------- materials ---------- */
// Three-band toon ramp: shadow, mid, lit. three.js looks it up at dot(N, L) * .5 + .5, so with ten
// steps: facing away = shadow, side-on to the sun = mid, facing it = lit. Nearest filtering gives the
// hard cel-shading steps.
const RAMP = [100, 100, 100, 100, 100, 175, 175, 175, 255, 255];
const ramp = new DataTexture(new Uint8Array(RAMP.flatMap(v => [v, v, v, 255])), RAMP.length, 1, RGBAFormat);
ramp.minFilter = ramp.magFilter = NearestFilter; ramp.needsUpdate = true;

const mats = new Map();
/** Cel-shaded material for a colour (cached). opts.glow makes it self-lit (lamps, gems, lasers). */
export function toon(col, { glow = 0, opacity = 1 } = {}) {
  const k = col + '|' + glow + '|' + opacity;
  let m = mats.get(k);
  if (!m) {
    m = new MeshToonMaterial({ color: col, gradientMap: ramp, transparent: opacity < 1, opacity });
    if (glow) { m.emissive = new Color(col); m.emissiveIntensity = glow; }
    mats.set(k, m);
  }
  return m;
}
/** Unlit flat colour (sky cards, light beams, view cones). */
export function flat(col, opacity = 1, { side = 0, depthWrite } = {}) {
  const k = 'f' + col + '|' + opacity + '|' + side;
  let m = mats.get(k);
  if (!m) { m = new MeshBasicMaterial({ color: col, transparent: opacity < 1, opacity, side: side ? DoubleSide : 0, depthWrite: depthWrite ?? opacity >= 1 }); mats.set(k, m); }
  return m;
}

// Ink lines: after the colour pass, the scene is drawn again with view-space normals + depth
// (small offscreen target), and a full-screen pass inks every pixel where the depth jumps
// (silhouettes) or the surface turns sharply (creases, box edges). That is the classic cel-shaded
// "drawn" look, it is the same width on every shape, and costs one extra cheap pass.
// Things on layer 1 (unlit flat materials, parts made with line:false) get no ink.
let normRT = null, normMat = null, inkQuad = null, inkCam = null;
const inkU = {
  tN: { value: null }, tD: { value: null }, px: { value: new Vector2() }, persp: { value: 0 }, near: { value: 1 }, far: { value: 100 },
  dTol: { value: 1 }, fade: { value: new Vector2(1e9, 1e9) }, ink: { value: new Color('#14101c') },
};
function inkSetup() {
  if (inkQuad) return;
  normMat = new MeshNormalMaterial();
  inkCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  inkQuad = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: inkU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tN, tD; uniform vec2 px; uniform float persp, near, far, dTol; uniform vec2 fade; uniform vec3 ink;
      float lin(vec2 uv){ float d = texture2D(tD, uv).x; if (persp > .5) { float z = d * 2. - 1.; return 2. * near * far / (far + near - z * (far - near)); } return near + d * (far - near); }
      vec3 nrm(vec2 uv){ return texture2D(tN, uv).xyz * 2. - 1.; }
      void main(){
        float dc = lin(vUv); vec3 nc = nrm(vUv); float e = 0.;
        vec2 o[4]; o[0] = vec2(px.x, 0.); o[1] = vec2(-px.x, 0.); o[2] = vec2(0., px.y); o[3] = vec2(0., -px.y);
        for (int i = 0; i < 4; i++) {
          float d = lin(vUv + o[i]); vec3 n = nrm(vUv + o[i]);
          float tol = dTol * (persp > .5 ? min(d, dc) * .06 + .02 : 1.);
          // only the nearer side of a depth jump gets the line, so lines hug the object in front
          if (d - dc > tol) e = 1.;
          if (dot(n, nc) < .55 && texture2D(tD, vUv + o[i]).x < 1.) e = max(e, .85);
        }
        if (texture2D(tD, vUv).x >= 1.) e = 0.;
        e *= 1. - smoothstep(fade.x, fade.y, dc);
        if (e < .01) discard; gl_FragColor = vec4(ink, e);
      }`,
  }));
}

/* ---------- shapes (unit sized; scale them) ---------- */
export const G = {
  box: new BoxGeometry(1, 1, 1),
  ball: new SphereGeometry(1, 18, 12),
  cyl: new CylinderGeometry(1, 1, 1, 16),
  cone: new ConeGeometry(1, 1, 16),
  pill: new CapsuleGeometry(.5, 1, 4, 10),
  ring: new TorusGeometry(1, .25, 8, 20),
  gem: new OctahedronGeometry(1),
  rock: new DodecahedronGeometry(1),
  blob: new IcosahedronGeometry(1, 1),
  plane: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  disc: new CircleGeometry(1, 20).rotateX(-Math.PI / 2),
  prism: new CylinderGeometry(.5, .5, 1, 3).rotateX(-Math.PI / 2), // roof: ridge along z, apex up
  hoop: new RingGeometry(.86, 1, 32).rotateX(-Math.PI / 2),
};

/**
 * A cel-shaded mesh with an ink outline. geo is a geometry (G.box etc.), col a hex colour or a
 * material. Options: s (uniform scale) or sx/sy/sz, x/y/z offset, rx/ry/rz rotation, line (false
 * for no outline). Returns the mesh; add more parts to it with mesh.add(part(...)).
 */
export function part(geo, col, o = {}) {
  const m = new Mesh(geo, typeof col === 'string' ? toon(col, o) : col);
  if (o.line === false || (typeof col !== 'string' && col.isMeshBasicMaterial)) m.layers.set(1);
  const s = o.s ?? 1; m.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  m.position.set(o.x || 0, o.y || 0, o.z || 0); m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  return m;
}
/** Group several parts into one object: grp(part(...), part(...)). */
export function grp(...kids) { const g = new Group(); for (const k of kids) g.add(k); return g; }

// Unlit and see-through meshes (beams, cones, shadows, glows) never get ink lines.
function noInk(o) { o.traverse(m => { if (m.isMesh && (m.material.isMeshBasicMaterial || m.material.transparent)) m.layers.set(1); }); }

/* ---------- view ---------- */
export class View {
  constructor({ bg = '#88c8f0', fog = null, sun = [-.5, 1, .6], sunI = 2.2, sky = '#ffffff', ground = '#808080', amb = 1.1 } = {}) {
    this.scene = new Scene(); this.scene.background = new Color(bg);
    if (fog) this.scene.fog = new Fog(fog[0], fog[1], fog[2]);
    this.sun = new DirectionalLight('#fff6e8', sunI); this.sun.position.set(...sun); this.scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight(sky, ground, amb); this.scene.add(this.hemi);
    this.pools = new Map(); this.kinds = new Map(); this.W = 160; this.H = 160; this.mode = 'board';
    this.cam = new OrthographicCamera(-80, 80, 80, -80, -2000, 4000); this.elev = .9;
  }
  /**
   * Tilted top-down view of a W x H floor. elev = camera angle above the horizon (radians).
   * Default is orthographic: floor point (x, y) is drawn exactly at screen (x, y), so input needs no
   * change. With fov (degrees) it is a real perspective view (far side smaller, the strongest 3D
   * look); then turn screen taps into floor points with v.pick(x, y), and place 2D labels with
   * v.toScreen(...v.at(x, y, h)). zoom > 1 crops in closer.
   */
  board(W, H, elev = this.elev, fov = 0, zoom = 1) {
    this.mode = 'board'; this.elev = elev;
    if (!fov) {
      this.W = W; this.H = H; this.persp3 = false;
      if (!this.cam.isOrthographicCamera) this.cam = new OrthographicCamera(-80, 80, 80, -80, -2000, 4000);
      const c = this.cam; c.left = -W / 2; c.right = W / 2; c.top = H / 2; c.bottom = -H / 2; c.updateProjectionMatrix();
      c.position.set(0, Math.sin(elev) * 1000, Math.cos(elev) * 1000); c.lookAt(0, 0, 0);
      this.sin = Math.sin(elev); this.cos = Math.cos(elev); return this;
    }
    const key = [W, H, elev, fov, zoom].join();
    if (this.fitKey === key) return this;
    this.W = W; this.H = H; this.persp3 = true; this.sin = 1; this.cos = Math.cos(elev); this.fitKey = key;
    if (!this.cam.isPerspectiveCamera) this.cam = new PerspectiveCamera(fov, W / H, 1, 6000);
    const c = this.cam; c.clearViewOffset(); c.fov = fov; c.aspect = W / H; c.near = 1; c.far = 6000; c.updateProjectionMatrix();
    // fit: move the camera back/forward and slide its aim until the floor just fills the screen
    let D = Math.max(W, H) * 1.2, tz = 0; const v = new Vector3();
    for (let i = 0; i < 30; i++) {
      c.position.set(0, Math.sin(elev) * D, tz + Math.cos(elev) * D); c.lookAt(0, 0, tz); c.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const [x, z] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) { v.set(x, 0, z).project(c); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      const span = Math.max((x1 - x0) / 2, (y1 - y0) / 2) * zoom; D *= .5 + .5 * span; tz -= (y0 + y1) / 2 * H * .25;
    }
    return this;
  }
  /** Floor point (x, y) under screen point (sx, sy) of a perspective board view (identity otherwise). */
  pick(sx, sy) {
    if (!this.persp3) return [sx, sy];
    const c = this.cam; c.updateMatrixWorld();
    const a = new Vector3(sx / this.W * 2 - 1, 1 - sy / this.H * 2, -1).unproject(c), b = new Vector3(sx / this.W * 2 - 1, 1 - sy / this.H * 2, 1).unproject(c);
    const k = a.y / (a.y - b.y); return [a.x + (b.x - a.x) * k + this.W / 2, a.z + (b.z - a.z) * k + this.H / 2];
  }
  /** Position for floor point (x, y) of a board view, h units above the floor. */
  at(x, y, h = 0) { return [x - this.W / 2, h, (y - this.H / 2) / this.sin]; }
  /** Screen point of floor point (x, y) at height h (for 2D labels over 3D things). */
  over(x, y, h = 0) { return this.persp3 ? this.toScreen(...this.at(x, y, h)) : [x, y - h * this.cos]; }
  /**
   * Side-on view; fov in degrees (small = flatter). ex/ey move the eye left/right and up/down (game
   * units, ey > 0 = above centre) with a shifted lens, so you look down on (or along) the scene while
   * the z=0 plane still lines up exactly with the screen.
   */
  side(W, H, fov = 32, ex = 0, ey = 0) {
    this.mode = 'side'; this.W = W; this.H = H;
    if (!this.cam.isPerspectiveCamera) this.cam = new PerspectiveCamera(fov, W / H, 1, 6000);
    const c = this.cam, D = H / 2 / Math.tan(fov * Math.PI / 360);
    c.fov = 2 * Math.atan(1.5 * H / D) * 180 / Math.PI; c.aspect = W / H; c.near = 2; c.far = 6000;
    c.position.set(ex, ey, D); c.lookAt(ex, ey, 0); this.dist = D;
    c.setViewOffset(3 * W, 3 * H, W - ex, H + ey, W, H); c.updateProjectionMatrix(); return this;
  }
  /** Position for screen point (x, y) of a side view at depth z (negative = behind). */
  sv(x, y, z = 0) { return [x - this.W / 2, this.H / 2 - y, z]; }
  /** Free perspective camera. Move v.cam yourself. */
  persp(W, H, fov = 60, near = .1, far = 400) {
    this.mode = 'persp'; this.W = W; this.H = H;
    if (!this.cam.isPerspectiveCamera) this.cam = new PerspectiveCamera(fov, W / H, near, far);
    const c = this.cam; c.clearViewOffset(); c.fov = fov; c.aspect = W / H; c.near = near; c.far = far; c.updateProjectionMatrix(); return this;
  }
  /** Logical screen position of a world point (for 2D effects over 3D things). */
  toScreen(x, y, z) { const p = new Vector3(x, y, z).project(this.cam); return [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H, p.z]; }

  /** Register a prefab: make() returns an Object3D. Then v.put(kind, ...) draws copies of it. */
  def(kind, make) { this.kinds.set(kind, make); return this; }
  /** Start a frame: every pooled object is hidden until put() again. */
  frame() { for (const p of this.pools.values()) p.n = 0; return this; }
  /**
   * Place one copy of a prefab this frame at world position p ([x,y,z], e.g. from v.at or v.sv).
   * o: ry/rx/rz rotation, s or sx/sy/sz scale. Returns the object to tweak (it keeps its children).
   */
  put(kind, p, o) {
    let pool = this.pools.get(kind); if (!pool) { pool = { list: [], n: 0 }; this.pools.set(kind, pool); }
    let ob = pool.list[pool.n];
    if (!ob) {
      const mk = this.kinds.get(kind); ob = mk ? mk(kind) : part(G.box, '#ff00ff'); noInk(ob);
      // a bare mesh keeps its own size/offset; put() moves and scales a wrapper around it
      if (!ob.isGroup) { const g = new Group(); g.add(ob); g.userData = ob.userData; ob = g; }
      pool.list.push(ob); this.scene.add(ob);
    }
    pool.n++; ob.visible = true; ob.position.set(p[0], p[1], p[2]);
    if (o) { ob.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0); const s = o.s ?? 1; ob.scale.set(o.sx ?? s, o.sy ?? s, o.sz ?? s); }
    else { ob.rotation.set(0, 0, 0); ob.scale.set(1, 1, 1); }
    return ob;
  }
  /**
   * A flat see-through polygon lying on the floor of a board view (torch cones, zones, ripples).
   * pts = [[x, y], ...] in game units, filled as a fan from pts[0]. Up to 64 points.
   */
  fan(pts, col, a = .4, h = .3) {
    if (!this.kinds.has('__fan')) this.def('__fan', () => {
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(64 * 9), 3));
      const m = new Mesh(g, new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide })); m.frustumCulled = false; m.renderOrder = 1; m.layers.set(1); return m;
    });
    const m = this.put('__fan', [0, 0, 0]).children[0], arr = m.geometry.attributes.position.array, n = Math.min(pts.length, 64);
    const P = i => this.at(pts[i][0], pts[i][1], h);
    let k = 0; const o = P(0);
    for (let i = 1; i < n - 1; i++) { const b = P(i), c = P(i + 1); arr.set(o, k); arr.set(b, k + 3); arr.set(c, k + 6); k += 9; }
    m.geometry.setDrawRange(0, k / 3); m.geometry.attributes.position.needsUpdate = true;
    m.material.color.set(col); m.material.opacity = a; return m;
  }
  /** Add a permanent object (floors, walls, scenery). */
  add(...obs) { for (const o of obs) { noInk(o); this.scene.add(o); } return obs[0]; }
  /** Remove everything added with add() (for a level rebuild), keeping pools and lights. */
  clear() {
    const keep = new Set([this.sun, this.sun.target, this.hemi]); for (const p of this.pools.values()) for (const o of p.list) keep.add(o);
    for (const o of [...this.scene.children]) if (!keep.has(o)) this.scene.remove(o);
  }
  /** Render this frame into the 2D canvas context c (which uses the game's logical units). */
  render(c, w = this.W, h = this.H) {
    for (const p of this.pools.values()) for (let i = p.n; i < p.list.length; i++) p.list[i].visible = false;
    const r = renderer();
    if (!r) { c.fillStyle = '#' + this.scene.background.getHexString(); c.fillRect(0, 0, w, h); return; }
    // adaptive resolution: if frames come slower than ~45 fps, render fewer pixels (down to half size)
    const now = performance.now(), gap = now - (this.lastT || now); this.lastT = now;
    if (gap > 0 && gap < 200) { avgGap = avgGap * .95 + gap * .05; if (++tick % 30 === 0) quality = Math.max(.5, Math.min(1, quality * (avgGap > 22 ? .88 : avgGap < 18 ? 1.05 : 1))); }
    let pw = c.canvas.width, ph = c.canvas.height; const q = Math.min(1, Math.sqrt(MAX_PX / (pw * ph))) * quality; pw = Math.max(1, Math.round(pw * q)); ph = Math.max(1, Math.round(ph * q));
    const cv = r.domElement; if (cv.width !== pw || cv.height !== ph) r.setSize(pw, ph, false);
    const cam = this.cam; cam.layers.enableAll();
    r.setRenderTarget(null); r.render(this.scene, cam);
    if (this.ink !== false) {
      // normals + depth pass at the same size, then the ink pass on top
      inkSetup();
      if (!normRT || normRT.width !== pw || normRT.height !== ph) {
        normRT?.dispose(); normRT = new WebGLRenderTarget(pw, ph, { depthTexture: new DepthTexture(pw, ph) });
        normRT.depthTexture.type = UnsignedIntType;
      }
      const bg = this.scene.background, fog = this.scene.fog; this.scene.background = null; this.scene.fog = null; this.scene.overrideMaterial = normMat;
      // (gs.fx3d's text and particles are added straight to the scene: no ink lines round letters and sparks)
      const hid = []; this.scene.traverse(o => { if (o.userData.gsNoInk && o.visible) { o.visible = false; hid.push(o); } });
      cam.layers.set(0); r.setRenderTarget(normRT); r.setClearColor(0x8080ff, 1); r.clear(); r.render(this.scene, cam);
      for (const o of hid) o.visible = true;
      this.scene.background = bg; this.scene.fog = fog; this.scene.overrideMaterial = null; cam.layers.enableAll(); r.setRenderTarget(null);
      const k = Math.max(1, Math.round(.75 * ph / h));
      inkU.tN.value = normRT.texture; inkU.tD.value = normRT.depthTexture; inkU.px.value.set(k / pw, k / ph);
      inkU.persp.value = cam.isPerspectiveCamera ? 1 : 0; inkU.near.value = cam.near; inkU.far.value = cam.far;
      // ortho: depth tolerance in world units ~ a few pixels' worth; persp: relative
      inkU.dTol.value = cam.isPerspectiveCamera ? 1 : Math.max(1.5, 6 * (cam.top - cam.bottom) / ph * k);
      if (fog) inkU.fade.value.set(fog.near, fog.far); else inkU.fade.value.set(1e9, 2e9);
      r.autoClear = false; r.render(inkQuad, inkCam); r.autoClear = true;
    }
    c.save(); c.imageSmoothingEnabled = true; copyFrame(R, c, 0, 0, pw, ph, 0, 0, w, h); c.restore();
  }
}

/* ---------- common prefabs ---------- */
/** Soft round contact shadow lying on the floor (put it at the object's feet). */
export function blob(r = 1, a = .32) { const m = new Mesh(G.disc, flat('#000000', a)); m.layers.set(1); m.scale.set(r, 1, r); m.position.y = .25; m.renderOrder = -1; return grp(m); }
/** A simple cel-shaded character: body pill, head ball, eyes. Returns a group with .body/.head. */
export function dude({ body = '#3060c0', skin = '#f8c890', hat = null, h = 10, eyes = '#14101c' } = {}) {
  const g = new Group(), b = part(G.pill, body, { sx: h * .55, sy: h * .45, sz: h * .45, y: h * .4 });
  const hd = part(G.ball, skin, { s: h * .26, y: h * .92 });
  for (const sx of [-1, 1]) hd.add(part(G.ball, eyes, { s: .2, x: sx * .38, y: .1, z: .88, line: false }));
  if (hat) hd.add(part(G.ball, hat, { sx: 1.08, sy: .55, sz: 1.08, y: .45 }));
  g.add(b, hd); g.body = b; g.head = hd; return g;
}
