// 3D extras for Console, Next Gen and AR games, from best-in-class free libraries:
//  - text3d(): sharp text inside the 3D world (troika-three-text, MIT): scores over heads, signs, labels.
//  - Particles3D: real 3D particle effects (three.quarks, MIT): fire, smoke, sparks, explosions, magic, snow.
//  - outline / glitch / trails / focus / pixelate: extra screen effects for Next Gen views (three.js's own passes).
//
//   const { text3d, Particles3D, outline } = gs.fx3d;
//   reset() {                                    // make them in make() or reset(): the libraries load first
//     fx = new Particles3D(view.scene);
//     torch = fx.fire({ x: 0, y: 1, z: 0 });     // keeps burning; torch.stop() / torch.remove()
//     label = text3d('PLAYER 1', { size: .3, color: '#fff' }); hero.add(label); label.position.y = 2;
//     outline(view, [chest], { color: '#ffd400' });   // Next Gen only: a glowing edge round things
//   }
//   update(dt) { fx.update(dt); }
//   on a hit:  fx.boom(pos);  fx.sparks(pos);
//
// Like physics, these load the first time a game needs them (the app shows "Loading…" meanwhile).

import { lazy } from './lazy.js';
import { Vector2, Vector3, Vector4, Color, CanvasTexture, MeshBasicMaterial, AdditiveBlending, NormalBlending } from 'three';
const libs = lazy('3D effects', () => import('./fx3d-libs.js'));
export const loadFx3d = () => libs.load();

/* ---------- text in the 3D world ---------- */
/**
 * A text mesh: add it to your scene or to a model. Options: size (height of a capital in world units),
 * color, font: 'regular' | 'bold' | 'pixel', align: 'left' | 'center' | 'right', outline (width,
 * e.g. .04) and outlineColor, maxWidth (wraps), face: true to always face the camera (a label).
 * Change label.text = 'NEW' and call label.sync() to update it.
 */
export function text3d(str, { size = .5, color = '#ffffff', font = 'bold', align = 'center', outline = 0, outlineColor = '#000000', maxWidth = Infinity, face = false } = {}) {
  const L = libs.get();
  const t = new L.Text();
  t.text = String(str); t.font = L.FONTS[font] || L.FONTS.bold; t.fontSize = size; t.color = new Color(color);
  t.anchorX = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'; t.anchorY = 'middle'; t.textAlign = align;
  if (outline) { t.outlineWidth = outline; t.outlineColor = new Color(outlineColor); }
  if (Number.isFinite(maxWidth)) t.maxWidth = maxWidth;
  if (face) t.onBeforeRender = function (r, scene, cam) { this.quaternion.copy(cam.quaternion); };
  t.sync();
  return t;
}

/* ---------- 3D particles ---------- */
let dot = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.4, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return dot = new CanvasTexture(c);
}
const col = (c, a = 1) => { const k = new Color(c); return new Vector4(k.r, k.g, k.b, a); };
const v3c = c => { const k = new Color(c); return new Vector3(k.r, k.g, k.b); };

/** Particle effects for one scene. Call update(dt) every frame. Each effect returns { system, stop(), remove(), at(pos) }. */
export class Particles3D {
  constructor(scene) {
    const L = libs.get(); this.L = L; this.Q = L.Q; this.scene = scene;
    this.batch = new L.Q.BatchedRenderer(); scene.add(this.batch);
    this.mats = {
      add: new MeshBasicMaterial({ map: dotTexture(), blending: AdditiveBlending, transparent: true, depthWrite: false }),
      soft: new MeshBasicMaterial({ map: dotTexture(), blending: NormalBlending, transparent: true, depthWrite: false }),
    };
    this.live = new Set();
  }
  /**
   * Your own effect. o: life [min, max] seconds, speed [min, max], size [min, max], colors [from, to],
   * rate (per second, 0 for a burst only), burst (count at the start), loop, duration, shape: 'point' |
   * 'sphere' | 'cone' (radius, angle), gravity (units/s², negative falls), glow (additive), shrink, fade.
   */
  make(pos, o = {}) {
    const Q = this.Q, num = v => Array.isArray(v) ? new Q.IntervalValue(v[0], v[1]) : new Q.ConstantValue(v);
    const shape = o.shape === 'cone' ? new Q.ConeEmitter({ radius: o.radius ?? .1, angle: o.angle ?? .4, thickness: 1, arc: Math.PI * 2 })
      : o.shape === 'point' ? new Q.PointEmitter() : new Q.SphereEmitter({ radius: o.radius ?? .1, thickness: 1, arc: Math.PI * 2 });
    const [c0, c1] = o.colors || ['#ffffff', '#ffffff'];
    const ps = new Q.ParticleSystem({
      duration: o.duration ?? 1, looping: o.loop ?? false, autoDestroy: !(o.loop ?? false), worldSpace: true,
      startLife: num(o.life ?? [.4, .8]), startSpeed: num(o.speed ?? [1, 3]), startSize: num(o.size ?? [.1, .3]),
      startColor: new Q.ConstantColor(col('#ffffff')), startRotation: new Q.IntervalValue(0, Math.PI * 2),
      emissionOverTime: new Q.ConstantValue(o.rate ?? 0),
      emissionBursts: o.burst ? [{ time: 0, count: new Q.ConstantValue(o.burst), cycle: 1, interval: .01, probability: 1 }] : [],
      shape, material: o.glow === false ? this.mats.soft : this.mats.add, renderMode: Q.RenderMode.BillBoard,
    });
    ps.addBehavior(new Q.ColorOverLife(new Q.Gradient([[v3c(c0), 0], [v3c(c1), 1]], [[1, 0], [o.fade === false ? 1 : 0, 1]])));
    if (o.shrink !== false) ps.addBehavior(new Q.SizeOverLife(new Q.PiecewiseBezier([[new Q.Bezier(1, .9, .5, o.grow ? 2 : 0), 0]])));
    if (o.gravity) ps.addBehavior(new Q.ApplyForce(new Vector3(0, Math.sign(o.gravity), 0), new Q.ConstantValue(Math.abs(o.gravity))));
    if (o.up) ps.emitter.rotation.x = -Math.PI / 2;   // cones point up
    const e = ps.emitter; e.position.set(pos?.x || 0, pos?.y || 0, pos?.z || 0);
    this.scene.add(e); this.batch.addSystem(ps);
    const fx = { system: ps, emitter: e, stop: () => { ps.endEmit(); }, remove: () => { ps.dispose(); e.removeFromParent(); this.live.delete(fx); }, at: p => { e.position.set(p.x, p.y, p.z); return fx; } };
    this.live.add(fx);
    if (!(o.loop ?? false)) ps.addEventListener?.('emitEnd', () => setTimeout(() => this.live.delete(fx), 3000));
    return fx;
  }
  /** A burning flame that keeps going (torches, campfires, rockets). */
  fire(pos, { size = 1, color = '#ffb020', end = '#ff2000' } = {}) { return this.make(pos, { loop: true, rate: 40 * size, life: [.4, .8], speed: [.6 * size, 1.4 * size], size: [.25 * size, .5 * size], colors: [color, end], shape: 'cone', angle: .25, radius: .15 * size, up: true }); }
  /** Rising smoke (keeps going). */
  smoke(pos, { size = 1, color = '#777777' } = {}) { return this.make(pos, { loop: true, rate: 12 * size, life: [1.5, 2.5], speed: [.3, .7], size: [.4 * size, .8 * size], colors: [color, color], shape: 'cone', angle: .3, up: true, glow: false, grow: true }); }
  /** A quick shower of sparks. */
  sparks(pos, { color = '#ffe080', count = 30, power = 1 } = {}) { return this.make(pos, { burst: count, life: [.2, .5], speed: [3 * power, 7 * power], size: [.04, .1], colors: [color, '#ff6000'], gravity: -6 }); }
  /** An explosion: a flash of fire and a puff of smoke. */
  boom(pos, { size = 1 } = {}) {
    this.make(pos, { burst: 40, life: [.3, .7], speed: [2 * size, 6 * size], size: [.3 * size, .7 * size], colors: ['#fff2a0', '#ff3000'] });
    this.make(pos, { burst: 15, life: [.8, 1.5], speed: [.5, 1.5 * size], size: [.5 * size, 1 * size], colors: ['#555555', '#222222'], glow: false, grow: true });
    return this.sparks(pos, { count: 20, power: size });
  }
  /** Twinkly magic (keeps going): pickups, portals, spells. */
  magic(pos, { color = '#a070ff', end = '#40e0ff' } = {}) { return this.make(pos, { loop: true, rate: 25, life: [.6, 1.2], speed: [.2, .6], size: [.05, .15], colors: [color, end], radius: .4, gravity: .5 }); }
  /** Falling snow over an area round pos (keeps going). */
  snow(pos, { area = 10, rate = 60 } = {}) { return this.make(pos, { loop: true, rate, life: [3, 5], speed: [0, .2], size: [.04, .1], colors: ['#ffffff', '#ffffff'], radius: area / 2, gravity: -.8, glow: false, shrink: false, fade: false }); }
  update(dt) { this.batch.update(Math.min(dt, .1)); }
  clear() { for (const fx of [...this.live]) fx.remove(); }
}

/* ---------- extra screen effects (Next Gen views) ---------- */
function addPass(view, pass) {
  (view.extras ||= []).push(pass);
  pass.remove = () => { view.extras = view.extras.filter(p => p !== pass); pass.dispose?.(); };
  return pass;
}
/** A glowing outline round objects (pickups, the selected unit). pass.selectedObjects = [...] changes them. */
export function outline(view, objects, { color = '#ffffff', hidden = '#444444', strength = 3, thickness = 1, pulse = 0 } = {}) {
  const L = libs.get(), p = new L.OutlinePass(new Vector2(256, 256), view.scene, view.cam, objects);
  p.visibleEdgeColor.set(color); p.hiddenEdgeColor.set(hidden); p.edgeStrength = strength; p.edgeThickness = thickness; p.pulsePeriod = pulse;
  return addPass(view, p);
}
/** A digital glitch (hits, hacking, a broken robot). Remove it after a moment: const g = glitch(v); later g.remove(). */
export function glitch(view, { wild = false } = {}) { const L = libs.get(), p = new L.GlitchPass(); p.goWild = wild; return addPass(view, p); }
/** Motion trails (speed, dreams, being dizzy). damp 0..1: how long the trail lingers. */
export function trails(view, damp = .85) { const L = libs.get(), p = new L.AfterimagePass(damp); return addPass(view, p); }
/** Depth of field: things at `focus` units from the camera are sharp, the rest blurs. */
export function focus(view, { focus: f = 10, aperture = .002, maxblur = .01 } = {}) { const L = libs.get(); return addPass(view, new L.BokehPass(view.scene, view.cam, { focus: f, aperture, maxblur })); }
/** Big chunky pixels (a retro look or a transition). size: pixel size in screen pixels. */
export function pixelate(view, size = 4) {
  const L = libs.get();
  const p = new L.ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new Vector2(1, 1) }, size: { value: size } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 res; uniform float size; varying vec2 vUv; void main(){ vec2 d = size / res; gl_FragColor = texture2D(tDiffuse, d * (floor(vUv / d) + .5)); }',
  });
  const set = p.setSize.bind(p); p.setSize = (w, h) => { set(w, h); p.uniforms.res.value.set(w, h); };
  return addPass(view, p);
}
