// Sky and weather for 3D games (Console toon, Next Gen HD and AR): a time of day that moves the sun,
// colours the sky, light and fog and brings out stars at night; and rain, snow and storms with
// lightning. Pass the colours your game wants; the kit does the in-betweens and the particles.
//
//   const { Sky, Weather } = gs.sky;
//   reset() {
//     sky = new Sky(view, { time: 17, speed: .2 });          // 5 pm, an in-game hour every 5 seconds
//     rain = new Weather(view, { kind: 'rain', amount: .6 }); // 'rain' | 'snow' | 'storm' | 'clear'
//     rain.onFlash = far => noise(1.2, { vol: .2 * (1 - far), from: 300, to: 60, at: far * 2 });   // thunder
//   }
//   update(dt) { sky.update(dt); rain.update(dt); }
//   sky.time = 6; sky.night (0..1)  rain.set('snow', 1)
//
// Sky follows view.cam each frame (a big dome round it, drawn behind everything). In AR the camera
// feed is the sky, so leave Sky out and use Weather alone. Light: by default Sky drives view.sun and
// view.hemi when the view has them; pass { sun } for a light you made with gs.hd.sun().

import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, Mesh, Points, PointsMaterial, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { Sky as PhysicalSky } from 'three/examples/jsm/objects/Sky.js';
import { prefs } from './prefs.js';

const C = c => new Color(c);
/** The default day: hour -> sky top, horizon, sun colour, sun strength (x the light's own), fill strength. */
export const DAY = [
  [0, { top: '#05070f', horizon: '#141a30', sun: '#7088c0', sunI: .12, amb: .35 }],
  [5, { top: '#0c1430', horizon: '#3a3050', sun: '#8090c0', sunI: .15, amb: .4 }],
  [6.5, { top: '#3a5a9a', horizon: '#f0a070', sun: '#ffb070', sunI: .6, amb: .65 }],
  [9, { top: '#4a88d8', horizon: '#b8d8f0', sun: '#fff0d8', sunI: 1, amb: 1 }],
  [16, { top: '#4a88d8', horizon: '#c0dcf0', sun: '#fff0d8', sunI: 1, amb: 1 }],
  [18.5, { top: '#3a4a8a', horizon: '#f08a50', sun: '#ff9050', sunI: .55, amb: .6 }],
  [20, { top: '#101838', horizon: '#40305a', sun: '#8090c0', sunI: .15, amb: .4 }],
  [24, { top: '#05070f', horizon: '#141a30', sun: '#7088c0', sunI: .12, amb: .35 }],
];
const isToon = v => 'elev' in v && v.pools instanceof Map;   // toon views ink everything on layer 0
const radiusOf = cam => Math.max(10, (cam?.far ?? 100) * .9);

export class Sky {
  /**
   * time: hour 0..24. speed: in-game hours per second (0 = still). day: keyframes like DAY to recolour
   * the day. stars: count (0 for none). physical: true uses three.js's physical sky (Next Gen looks).
   * fog: recolour the scene's fog to the horizon (default true). light: false leaves your lights alone.
   */
  constructor(view, { time = 12, speed = 0, day = DAY, stars = 400, physical = false, fog = true, light = true, sun = view.sun, hemi = view.hemi, tilt = .35 } = {}) {
    Object.assign(this, { view, time, speed, day, fog, light, sunLight: sun || null, hemi: hemi || null, tilt, physical });
    this.base = { sun: sun?.intensity ?? 1, amb: hemi?.intensity ?? 1 };
    this.sunDir = new Vector3(); this.top = C('#000'); this.horizon = C('#000'); this.sunCol = C('#fff'); this.night = 0;
    const R = radiusOf(view.cam);
    if (physical) {
      this.dome = new PhysicalSky(); this.dome.scale.setScalar(R);
      const u = this.dome.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = .004; u.mieDirectionalG.value = .8;
    } else {
      this.dome = new Mesh(new SphereGeometry(1, 32, 16), new ShaderMaterial({
        side: BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: this.top }, horizon: { value: this.horizon }, sunCol: { value: this.sunCol }, sunDir: { value: this.sunDir }, size: { value: .9994 } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }',
        fragmentShader: `varying vec3 vDir; uniform vec3 top, horizon, sunCol, sunDir; uniform float size;
          void main(){ float h = clamp(vDir.y, -1., 1.); vec3 c = mix(horizon, top, pow(max(h, 0.), .55)); c = mix(c, horizon * .55, clamp(-h * 3., 0., 1.));
            float s = dot(normalize(vDir), normalize(sunDir)); c += sunCol * (smoothstep(size, size + .0004, s) * 1.5 + pow(max(s, 0.), 24.) * .35);
            gl_FragColor = vec4(c, 1.); }`,
      }));
      this.dome.scale.setScalar(R);
    }
    this.dome.frustumCulled = false; this.dome.renderOrder = -10; this.dome.name = 'sky';
    if (isToon(view)) this.dome.layers.set(1);
    view.scene.add(this.dome);
    if (stars) {
      const p = new Float32Array(stars * 3);
      for (let i = 0; i < stars; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); p.set([Math.cos(a) * r, Math.abs(u), Math.sin(a) * r], i * 3); }
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(p, 3));
      this.stars = new Points(g, new PointsMaterial({ color: '#ffffff', size: R * .004, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.stars.scale.setScalar(R * .95); this.stars.frustumCulled = false; this.stars.renderOrder = -9;
      if (isToon(view)) this.stars.layers.set(1);
      view.scene.add(this.stars);
    }
    this.apply();
  }
  /** 0..1 through the day (0 midnight, .5 noon). */
  get dayPart() { return this.time / 24; }
  update(dt) {
    if (this.speed) this.time = ((this.time + this.speed * dt) % 24 + 24) % 24;
    const cam = this.view.cam;
    if (cam) { this.dome.position.copy(cam.position); this.stars?.position.copy(cam.position); }
    this.apply(); return this;
  }
  /** Works out the colours and sun for the current time (update() calls it). */
  apply() {
    const t = ((this.time % 24) + 24) % 24, D = this.day;
    let i = 0; while (i < D.length - 2 && D[i + 1][0] <= t) i++;
    const [t0, a] = D[i], [t1, b] = D[i + 1], k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    this.top.set(a.top).lerp(C(b.top), k); this.horizon.set(a.horizon).lerp(C(b.horizon), k); this.sunCol.set(a.sun).lerp(C(b.sun), k);
    const sunI = a.sunI + (b.sunI - a.sunI) * k, amb = a.amb + (b.amb - a.amb) * k;
    // the sun rises in the east (+x) at 6, is highest at 12, sets at 18; the moon takes over at night
    const ang = (t - 6) / 12 * Math.PI, up = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), up, this.tilt).normalize();
    this.night = Math.min(1, Math.max(0, (-up + .1) * 3));
    const lightDir = this.night > .5 ? this.sunDir.clone().negate() : this.sunDir;   // moonlight from the other side
    if (this.physical) this.dome.material.uniforms.sunPosition.value.copy(this.sunDir);
    if (this.stars) this.stars.material.opacity = this.night * .9;
    if (this.light && this.sunLight) {
      this.sunLight.color.copy(this.sunCol); this.sunLight.intensity = this.base.sun * sunI;
      const tgt = this.sunLight.target?.position ?? new Vector3(), d = this.sunLight.position.distanceTo(tgt) || 10;
      this.sunLight.position.copy(tgt).addScaledVector(lightDir, d);
    }
    if (this.light && this.hemi) { this.hemi.intensity = this.base.amb * amb; this.hemi.color.copy(this.top).lerp(C('#ffffff'), .5); }
    const s = this.view.scene;
    if (this.fog && s.fog) s.fog.color.copy(this.horizon);
    if (s.background?.isColor) s.background.copy(this.horizon);
    return this;
  }
  dispose() { this.dome.removeFromParent(); this.dome.geometry?.dispose(); this.dome.material.dispose(); this.stars?.removeFromParent(); this.stars?.geometry.dispose(); }
}

/**
 * Rain, snow and storms round the camera. kind: 'rain' | 'snow' | 'storm' | 'clear'; amount 0..1.
 * area: the box of weather round the camera (default fits the view's units). wind: [x, z] push.
 * Storms flash lightning every few seconds: set onFlash(far) (far 0..1) for thunder. Reduce motion
 * turns flashes down.
 */
export class Weather {
  constructor(view, { kind = 'rain', amount = 1, area, wind = [0, 0], max = 900, color } = {}) {
    this.view = view; this.wind = wind; this.max = max; this.area = area ?? Math.min(radiusOf(view.cam) * .35, (view.cam?.far ?? 100) > 1000 ? 400 : 30);
    this.flashLeft = 0; this.nextFlash = 3 + Math.random() * 5; this.flashI = 0; this.onFlash = null; this.t = 0;
    this.off = new Float32Array(max * 3); for (let i = 0; i < this.off.length; i++) this.off[i] = Math.random();
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(max * 6), 3));
    this.rainMesh = new LineSegments(g, new LineBasicMaterial({ color: color ?? '#a8c0e0', transparent: true, opacity: .55, depthWrite: false }));
    const pg = new BufferGeometry(); pg.setAttribute('position', new BufferAttribute(new Float32Array(max * 3), 3));
    this.snowMesh = new Points(pg, new PointsMaterial({ color: color ?? '#ffffff', size: this.area * .012, transparent: true, opacity: .9, depthWrite: false }));
    for (const m of [this.rainMesh, this.snowMesh]) { m.frustumCulled = false; m.renderOrder = 5; if (isToon(view)) m.layers.set(1); view.scene.add(m); }
    this.hemiBase = view.hemi?.intensity ?? 1;
    this.set(kind, amount);
  }
  set(kind, amount = this.amount ?? 1) {
    this.kind = kind; this.amount = Math.max(0, Math.min(1, amount));
    this.rainMesh.visible = kind === 'rain' || kind === 'storm'; this.snowMesh.visible = kind === 'snow';
    return this;
  }
  /** Lightning now. */
  flash() {
    const far = Math.random(); this.flashLeft = .35; this.flashI = (1 - far * .6) * prefs.motion;
    this.onFlash?.(far); return this;
  }
  update(dt) {
    this.t += dt; const cam = this.view.cam, A = this.area, n = Math.floor(this.max * this.amount);
    const cx = cam?.position.x ?? 0, cy = cam?.position.y ?? 0, cz = cam?.position.z ?? 0, [wx, wz] = this.wind, o = this.off;
    if (this.rainMesh.visible) {
      const p = this.rainMesh.geometry.attributes.position, a = p.array, fall = A * 1.6, len = A * .03;
      for (let i = 0; i < n; i++) {
        const k = i * 3, y = (((o[k + 1] - this.t * fall / A * (.8 + o[k] * .4)) % 1) + 1) % 1;
        const x = cx + (((o[k] + wx * this.t / A) % 1 + 1) % 1 - .5) * A, z = cz + (((o[k + 2] + wz * this.t / A) % 1 + 1) % 1 - .5) * A, yy = cy + (y - .5) * A;
        a[i * 6] = x; a[i * 6 + 1] = yy; a[i * 6 + 2] = z; a[i * 6 + 3] = x - wx * .02; a[i * 6 + 4] = yy + len; a[i * 6 + 5] = z - wz * .02;
      }
      p.needsUpdate = true; this.rainMesh.geometry.setDrawRange(0, n * 2);
    }
    if (this.snowMesh.visible) {
      const p = this.snowMesh.geometry.attributes.position, a = p.array, fall = A * .12;
      for (let i = 0; i < n; i++) {
        const k = i * 3, y = (((o[k + 1] - this.t * fall / A * (.7 + o[k] * .6)) % 1) + 1) % 1, sway = Math.sin(this.t * 1.3 + i) * .02;
        a[k] = cx + (((o[k] + sway + wx * this.t / A) % 1 + 1) % 1 - .5) * A; a[k + 1] = cy + (y - .5) * A; a[k + 2] = cz + (((o[k + 2] + wz * this.t / A) % 1 + 1) % 1 - .5) * A;
      }
      p.needsUpdate = true; this.snowMesh.geometry.setDrawRange(0, n);
    }
    if (this.kind === 'storm') { this.nextFlash -= dt; if (this.nextFlash <= 0) { this.flash(); this.nextFlash = 4 + Math.random() * 7 / Math.max(.3, this.amount); } }
    const h = this.view.hemi;
    if (this.flashLeft > 0) {
      this.flashLeft -= dt; const on = this.flashLeft > .25 || (this.flashLeft > .08 && this.flashLeft < .16);
      if (h) { if (!this.lit) this.hemiBase = h.intensity; h.intensity = this.hemiBase * (on ? 1 + 4 * this.flashI : 1); this.lit = true; }
    } else if (this.lit && h) { h.intensity = this.hemiBase; this.lit = false; }
    return this;
  }
  /** True for a moment during a lightning flash (to brighten your own sky or flash the screen). */
  get flashing() { return this.flashLeft > 0; }
  dispose() { for (const m of [this.rainMesh, this.snowMesh]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } }
}
