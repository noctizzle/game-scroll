// Skinned 3D people made in code, faces with blend shapes, and lip sync.
//
// person() is one smooth mesh over a skeleton (a three.js SkinnedMesh): elbows, knees, the waist and
// the neck bend like skin instead of showing the joins between parts, and the whole person is one
// draw call. Its bones have the same names and directions as gs.poses.figure(), so the same Rig
// poses, blends (rig.blend, rig.blend2) and foot planting (rig.plant) drive it.
//
// Blend shapes (morph targets) are shapes a mesh can lean towards: person() has open, wide, round
// (the mouth), smile, frown, surprise and blink. shapes(geometry, { name: fn }) adds your own to any
// mesh you build in code. Face eases between them, blinks by itself and moves the mouth to speech.
//
//   const { person } = gs.poses, { Face } = gs.characters;
//   reset() {
//     hero = person({ body: '#c0392b', skin: '#e0ac69', hair: '#2b1a10', mat: c => pbr(c) });
//     view.add(hero);                        // hero.rig, hero.face, hero.mesh, hero.bones
//   }
//   update(dt) {
//     hero.rig.blend({ idle: 0, walk: 1.4, run: 4, sprint: 7 }, speed);   // walk to run by speed, feet in step
//     hero.rig.update(dt, { speed }); hero.rig.plant((x, z) => groundAt(x, z), hero);   // feet on the slope
//     hero.face.update(dt);
//   }
//   hero.face.say('Over here!');             // speaks (gs.sound.say) and the mouth follows the words
//   hero.face.set('smile', 1);               // eases there; set('smile', 0) to let go
//
// The figure faces +z, feet at y = 0, about 1.8 m tall (scale for others). Always show spoken words on
// screen too: the mouth moves even when the phone is muted.

import { Bone, BufferAttribute, Color, Group, LatheGeometry, Matrix4, MeshStandardMaterial, Skeleton, SkinnedMesh, SphereGeometry, BoxGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rig } from './poses.js';
import { say as speak } from './sound.js';

const BONES = ['hips', 'spine', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR'];
// rest positions in metres (world, feet at 0), each bone's parent
const AT = {
  hips: [0, .97, 0], spine: [0, 1.02, 0], head: [0, 1.44, 0],
  armL: [.22, 1.32, 0], foreL: [.22, 1.02, 0], armR: [-.22, 1.32, 0], foreR: [-.22, 1.02, 0],
  legL: [.1, .97, 0], shinL: [.1, .55, 0], footL: [.1, .09, 0], legR: [-.1, .97, 0], shinR: [-.1, .55, 0], footR: [-.1, .09, 0],
};
const PARENT = { spine: 'hips', head: 'spine', armL: 'spine', foreL: 'armL', armR: 'spine', foreR: 'armR', legL: 'hips', shinL: 'legL', footL: 'shinL', legR: 'hips', shinR: 'legR', footR: 'shinR' };
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a round part from a side profile [[radius, y]...] (bottom to top); cuts: heights where the colour changes,
// given a thin row each side so the edge stays sharp
const lathe = (pts, cuts = []) => {
  const P = pts.slice();
  for (const c of cuts) for (const y of [c - .004, c + .004]) {
    const i = P.findIndex(p => p[1] > y); if (i <= 0) continue;
    const [r0, y0] = P[i - 1], [r1, y1] = P[i]; P.splice(i, 0, [r0 + (r1 - r0) * (y - y0) / (y1 - y0), y]);
  }
  return new LatheGeometry(P.map(([r, y]) => new Vector2(r, y)), 16);
};

/** The face shapes person() has, for Face and your own code. */
export const FACE_SHAPES = ['open', 'wide', 'round', 'smile', 'frown', 'surprise', 'blink'];

/**
 * A skinned person: one smooth mesh, a skeleton, a Rig (rig), a Face (face). Colours: body (top and
 * sleeves), skin, legs, shoes, hair (null for none), eyes, lips; sleeves: 'long' or 'short'; girth: wider
 * or slimmer (1 normal); mat(colour) makes the material (pbr() for Next Gen, toon() for Console; it is
 * copied and given vertex colours); scale for bigger or smaller people.
 */
export function person(o = {}) {
  return assemble(personParts(o), o);
}

/**
 * The parts person() is made of (gs.models.human builds a finer one from them): { parts, add, cols }.
 * add(geometry, weigh(p) => [[bone, weight]...], colour(p) => Color, tag, centre) adds one; cols holds the
 * Colors (body, skin, legs, shoes, hair, eyes, lips: each vertex's colour object says its slot). head: false
 * leaves out the head and face (to make your own).
 */
export function personParts({ body = '#3a6ea5', skin = '#f1c27d', legs = '#2b2b38', shoes = '#1a1a1a', hair = '#3b2a1a', eyes = '#1d1d22', lips = '#9b4a4a',
  sleeves = 'long', girth = 1, head: withHead = true } = {}) {
  const C = c => new Color(c), cBody = C(body), cSkin = C(skin), cLegs = C(legs), cShoes = C(shoes), cHair = C(hair || skin), cEyes = C(eyes), cLips = C(lips);
  const parts = [];
  // a part: geometry in world rest space, how each vertex is weighted, coloured and tagged (for face shapes)
  const add = (g, weigh, colour, tag = null, centre = null, o = {}) => parts.push({ g, weigh, colour, tag, centre, ...o });
  const one = b => () => [[b, 1]];
  const g = girth;
  // torso: hips to neck, flattened front to back; bends at the waist, the neck goes with the head
  const torso = lathe([[0, .86], [.13 * g, .88], [.15 * g, .95], [.14 * g, 1.05], [.17 * g, 1.2], [.19 * g, 1.29], [.17 * g, 1.35], [.1, 1.39], [.055, 1.41], [.05, 1.47], [0, 1.49]], [.99, 1.4]);
  torso.scale(1, 1, .65);
  add(torso, p => { const w = ss(.99, 1.1, p.y), h = ss(1.41, 1.47, p.y); return [['hips', 1 - w], ['spine', w * (1 - h)], ['head', h]]; },
    p => p.y < .99 ? cLegs : p.y > 1.4 ? cSkin : cBody, null, null, { body: true });
  if (withHead) {
    // head (hair on top and round the back) and face
    const head = new SphereGeometry(.13, 18, 14); head.scale(1, 1.1, 1); head.translate(0, 1.57, 0);
    add(head, one('head'), p => hair && (p.y > 1.635 || (p.z < -.02 && p.y > 1.53) || (p.y > 1.6 && Math.abs(p.x) > .1)) ? cHair : cSkin);
    for (const s of [1, -1]) {
      const eye = new SphereGeometry(.02, 10, 8); eye.translate(s * .045, 1.6, .112);
      add(eye, one('head'), () => cEyes, 'eye', new Vector3(s * .045, 1.6, .112));
      const brow = new BoxGeometry(.05, .012, .015, 4, 1, 1); brow.translate(s * .047, 1.643, .108);
      add(brow, one('head'), () => hair ? cHair : cEyes, 'brow', new Vector3(s * .047, 1.643, .108));
    }
    const mouth = new SphereGeometry(.035, 14, 8); mouth.scale(1, .3, .45); mouth.translate(0, 1.52, .118);
    add(mouth, one('head'), () => cLips, 'mouth', new Vector3(0, 1.52, .118));
  }
  // arms: shoulder to wrist in one tube that bends at the elbow; hands
  for (const [s, A, F] of [[1, 'armL', 'foreL'], [-1, 'armR', 'foreR']]) {
    const arm = lathe([[0, .73], [.04, .75], [.045, .85], [.05, .97], [.048, 1.02], [.058, 1.1], [.064, 1.24], [.06, 1.3], [.042, 1.345], [0, 1.36]].map(([r, y]) => [r * g ** .5, y]), [sleeves === 'short' ? 1.1 : .77]);
    arm.translate(s * .22, 0, 0);
    add(arm, p => { const t = ss(.97, 1.07, p.y), up = ss(1.27, 1.37, p.y) * .45; return [[F, 1 - t], [A, t * (1 - up)], ['spine', t * up]]; },
      p => sleeves === 'short' ? (p.y > 1.1 ? cBody : cSkin) : (p.y > .77 ? cBody : cSkin), null, null, { body: true });
    const hand = new SphereGeometry(.05, 10, 8); hand.scale(.85, 1.15, .7); hand.translate(s * .22, .7, .005);
    add(hand, one(F), () => cSkin, null, null, { body: true });
  }
  // legs: hip to ankle, bending at the knee; feet
  for (const [s, L, S, Ft] of [[1, 'legL', 'shinL', 'footL'], [-1, 'legR', 'shinR', 'footR']]) {
    const leg = lathe([[0, .07], [.045, .1], [.05, .2], [.07, .45], [.065, .55], [.08, .7], [.09 * g, .88], [.085 * g, .97], [0, 1]]);
    leg.translate(s * .1, 0, 0);
    add(leg, p => { const t = ss(.5, .6, p.y), top = ss(.9, 1, p.y) * .5; return [[S, 1 - t], [L, t * (1 - top)], ['hips', t * top]]; }, () => cLegs, null, null, { body: true });
    const foot = new BoxGeometry(.11, .09, .25, 2, 1, 3); foot.translate(s * .1, .045, .05);
    add(foot, one(Ft), () => cShoes, null, null, { body: true });
  }
  return { parts, add, one, cols: { body: cBody, skin: cSkin, legs: cLegs, shoes: cShoes, hair: cHair, eyes: cEyes, lips: cLips } };
}

// smooth normals over a whole part, its seams joined (vertices at one place share one normal)
export function smoothNormals(g) {
  const P = g.attributes.position, n = P.count, at = new Map(), id = new Int32Array(n), acc = [];
  const key = i => `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
  for (let i = 0; i < n; i++) { const k = key(i); let j = at.get(k); if (j === undefined) { j = acc.length; at.set(k, j); acc.push(new Vector3()); } id[i] = j; }
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), idx = g.index ? g.index.array : null, tri = idx ? idx.length / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1, i2 = idx ? idx[t * 3 + 2] : t * 3 + 2;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    const f = b.sub(a).cross(c.sub(a)); acc[id[i0]].add(f); acc[id[i1]].add(f); acc[id[i2]].add(f);
  }
  const N = new Float32Array(n * 3); for (let i = 0; i < n; i++) acc[id[i]].clone().normalize().toArray(N, i * 3);
  g.setAttribute('normal', new BufferAttribute(N, 3));
}

/**
 * Parts (personParts) into a skinned person: weights, colours, face shapes, skeleton, Rig and Face.
 * smooth: Loop subdivision steps for the parts marked body (three-subdivide), mats: { slot: material }
 * (slots body, skin, legs, shoes, hair, eyes, lips: one mesh, one draw per material; each is given vertex
 * colours, so pass materials made for this person) instead of one mat(colour) for all.
 */
export function assemble({ parts, cols }, { mat = c => new MeshStandardMaterial({ color: c, roughness: .7 }), mats = null, smooth = 0, subdivide = null, scale = 1, shadows = true } = {}) {
  // finer parts first (their weights and colours are worked out on the finer points)
  const fine = smooth > 0 && subdivide;
  for (const pt of parts) {
    if (fine && pt.body) { pt.g = subdivide(pt.g, smooth); if (!pt.g.userData.smoothNormals) smoothNormals(pt.g); }
    else if (fine || mats || !pt.g.index || parts.some(q => !q.g.index)) { if (pt.g.index) pt.g = pt.g.toNonIndexed(); }
    for (const k of Object.keys(pt.g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) pt.g.deleteAttribute(k);
    if (!pt.g.attributes.uv) pt.g.setAttribute('uv', new BufferAttribute(new Float32Array(pt.g.attributes.position.count * 2), 2));
  }
  // weights, colours, slots and tags onto each part, then one geometry
  const tags = [], slotOf = new Map(Object.entries(cols).map(([k, c]) => [c, k])), slots = [];
  for (const pt of parts) {
    const pos = pt.g.attributes.position, n = pos.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), p = new Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const w = pt.weigh(p).filter(x => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = w.reduce((a, x) => a + x[1], 0) || 1;
      w.forEach(([b, v], k) => { si[i * 4 + k] = BONES.indexOf(b); sw[i * 4 + k] = v / sum; });
      const c = pt.colour(p); c.toArray(col, i * 3); slots.push(pt.slot || slotOf.get(c) || 'body');
      tags.push(pt.tag ? { tag: pt.tag, c: pt.centre } : null);
    }
    pt.g.setAttribute('skinIndex', new BufferAttribute(si, 4)); pt.g.setAttribute('skinWeight', new BufferAttribute(sw, 4)); pt.g.setAttribute('color', new BufferAttribute(col, 3));
  }
  const geo = mergeGeometries(parts.map(pt => pt.g)); parts.forEach(pt => pt.g.dispose());
  addFaceShapes(geo, tags);
  let material;
  if (mats) {
    // one mesh, a group of triangles per material: each triangle goes with most of its corners
    const n = geo.attributes.position.count, idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: n }, (_, i) => i), names = Object.keys(mats), by = names.map(() => []);
    for (let t = 0; t < idx.length; t += 3) {
      const s0 = slots[idx[t]], s1 = slots[idx[t + 1]], s2 = slots[idx[t + 2]], s = s1 === s2 ? s1 : s0;
      by[Math.max(0, names.indexOf(mats[s] ? s : 'body'))].push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const all = by.flat(); geo.setIndex(n > 65535 ? new BufferAttribute(new Uint32Array(all), 1) : new BufferAttribute(new Uint16Array(all), 1));
    geo.clearGroups(); let start = 0; by.forEach((list, i) => { if (list.length) geo.addGroup(start, list.length, i); start += list.length; });
    material = names.map(k => { const m = mats[k]; m.vertexColors = true; m.needsUpdate = true; return m; });   // (made for this person: not copied, so their settings stay as they are)
  } else { const m0 = mat('#ffffff'); material = m0.clone(); material.vertexColors = true; material.color?.set('#ffffff'); }

  // skeleton: bones placed relative to their parents, the same as figure()'s joints
  const bones = {};
  for (const b of BONES) { const bone = new Bone(); bone.name = b; bones[b] = bone; }
  for (const b of BONES) {
    const [x, y, z] = AT[b], par = PARENT[b];
    if (par) { const [px, py, pz] = AT[par]; bones[b].position.set(x - px, y - py, z - pz); bones[par].add(bones[b]); } else bones[b].position.set(x, y, z);
  }
  bones.shinL.userData.ikLength = bones.shinR.userData.ikLength = .46;
  bones.foreL.userData.ikLength = bones.foreR.userData.ikLength = .32;
  const mesh = new SkinnedMesh(geo, material); mesh.castShadow = shadows; mesh.receiveShadow = shadows; mesh.name = 'person';
  mesh.add(bones.hips); mesh.updateMatrixWorld(true); mesh.bind(new Skeleton(BONES.map(b => bones[b])), new Matrix4());
  const root = new Group(); root.add(mesh); root.scale.setScalar(scale);
  root.mesh = mesh; root.bones = bones;
  root.rig = new Rig(bones, { height: 1.8 });
  root.rig.feet = [bones.footL, bones.footR];
  root.face = new Face(mesh);
  return root;
}

// the face's blend shapes, as offsets from the rest shape (morphTargetsRelative)
function addFaceShapes(geo, tags) {
  const pos = geo.attributes.position, n = pos.count, p = new Vector3(), out = {};
  for (const s of FACE_SHAPES) out[s] = new Float32Array(n * 3);
  const put = (s, i, x, y, z) => { const a = out[s]; a[i * 3] += x; a[i * 3 + 1] += y; a[i * 3 + 2] += z; };
  for (let i = 0; i < n; i++) {
    const t = tags[i]; if (!t) continue;
    p.fromBufferAttribute(pos, i); const dx = p.x - t.c.x, dy = p.y - t.c.y, side = Math.abs(dx) / .035;
    if (t.tag === 'mouth') {
      put('open', i, 0, dy * 2.4 - .01, 0);
      put('wide', i, dx * .45, -dy * .3, 0);
      put('round', i, -dx * .4, dy * 1.4, .006);
      put('smile', i, dx * .12, side * side * .012 - .002, 0);
      put('frown', i, 0, -side * side * .01 + .002, 0);
      put('surprise', i, -dx * .25, dy * 1.8 - .004, 0);
    } else if (t.tag === 'eye') {
      put('blink', i, 0, -dy * .88, 0);
      put('surprise', i, 0, dy * .25, 0);
      put('smile', i, 0, dy < 0 ? -dy * .35 : 0, 0);
    } else if (t.tag === 'lid') {   // an eyelid (gs.models.human): turns down over the eye
      const dz = p.z - t.c.z, a = 1.25, c = Math.cos(a), sn = Math.sin(a);
      put('blink', i, 0, dy * c - dz * sn - dy, dy * sn + dz * c - dz);
      put('smile', i, 0, (dy * Math.cos(.25) - dz * Math.sin(.25)) - dy, (dy * Math.sin(.25) + dz * Math.cos(.25)) - dz);
    } else if (t.tag === 'brow') {
      const inner = Math.sign(dx) === -Math.sign(t.c.x) ? Math.abs(dx) / .025 : 0;   // the end nearer the nose
      put('frown', i, 0, -.012 * inner - .003, 0);
      put('surprise', i, 0, .014, 0);
      put('smile', i, 0, .003, 0);
    }
  }
  geo.morphAttributes.position = FACE_SHAPES.map(s => { const a = new BufferAttribute(out[s], 3); a.name = s; return a; });
  geo.morphTargetsRelative = true;
}

/**
 * Blend shapes for a geometry you build in code: shapes(geo, { puff: (p, out) => out.set(0, p.y * .2, 0) })
 * gives the shape "puff", where fn sets out to how far each rest point p moves. Make the mesh after.
 */
export function shapes(geo, fns) {
  const pos = geo.attributes.position, n = pos.count, p = new Vector3(), d = new Vector3();
  const list = geo.morphAttributes.position ||= [];
  if (list.length && !geo.morphTargetsRelative) throw new Error('shapes(): this geometry already has blend shapes that are not offsets');
  for (const [name, fn] of Object.entries(fns)) {
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p.fromBufferAttribute(pos, i); d.set(0, 0, 0); fn(p, d); d.toArray(a, i * 3); }
    const attr = new BufferAttribute(a, 3); attr.name = name; list.push(attr);
  }
  geo.morphTargetsRelative = true;
  return geo;
}

// mouth shapes for letters (open, wide, round): a rough English reading, good enough for a cartoon mouth
const VIS = {};
for (const [ls, v] of [['a', [.9, .2, 0]], ['eiy', [.45, .8, 0]], ['o', [.6, 0, .8]], ['uwq', [.25, 0, 1]], ['mbp', [0, 0, 0]], ['fv', [.1, .45, 0]], ['lntdszckgjrhx', [.3, .3, 0]]]) for (const l of ls) VIS[l] = v;
const VOWEL = /[aeiouy]/;

/**
 * Mouth shapes over time for a line of speech: [{ t, open, wide, round }], t in seconds from the start
 * at the given speaking rate (1 normal). Face.say uses it; it's here for your own mouths too.
 */
export function visemes(text, { rate = 1 } = {}) {
  const cps = 14 * Math.max(.5, Math.min(2, rate)), out = []; let t = 0;
  for (const ch of String(text).toLowerCase()) {
    const v = VIS[ch], pause = /[,;:]/.test(ch) ? .22 : /[.!?]/.test(ch) ? .35 : 0;
    out.push({ t, ch, open: v ? v[0] : 0, wide: v ? v[1] : 0, round: v ? v[2] : 0 });
    t += pause || (v ? (VOWEL.test(ch) ? 1.25 : .85) : .6) / cps;
  }
  out.push({ t, ch: '', open: 0, wide: 0, round: 0 }); out.end = t;
  return out;
}

/**
 * Blend shapes on a mesh (anything with morph targets: person().mesh, or one made with shapes()),
 * eased so they never snap: set(name, amount), say(text) for lip sync, mouth(level) for a mouth
 * driven by anything (the mic, a beat), and blinking by itself (blinkEvery seconds; 0 stops it).
 */
export class Face {
  constructor(mesh, { blinkEvery = 3.5, speed = 12 } = {}) {
    this.mesh = mesh; this.dict = mesh.morphTargetDictionary || {}; this.inf = mesh.morphTargetInfluences || [];
    this.want = {}; this.blinkEvery = blinkEvery; this.speed = speed;
    this.blinkT = blinkEvery * (.5 + Math.random() * .5); this.blinking = 0; this.line = null; this.level = null; this.talk = { open: 0, wide: 0, round: 0 };
  }
  /** Eases a shape to amount (0..1; more pushes it further). */
  set(name, amount = 1) { this.want[name] = amount; return this; }
  /** Says a line out loud (gs.sound.say options: pitch, rate, lang...) and moves the mouth to it. Returns say()'s promise. */
  say(text, o = {}) {
    const line = this.line = { v: visemes(text, o), t: 0, i: 0, spoken: null };
    const p = speak(text, { ...o, onWord: at => { if (this.line !== line) return; const k = line.v.findIndex((x, j) => j >= at); if (k >= 0 && k < line.v.length) line.t = line.v[k].t; } });
    p.then(ok => { if (this.line === line && ok) line.t = Math.max(line.t, line.v.end); });
    return p;
  }
  /** True while the mouth is still moving to a line. */
  get talking() { return !!this.line; }
  /** Stops the mouth (the speech itself: gs.sound.stopTalking()). */
  hush() { this.line = null; return this; }
  /** Opens the mouth by level (0..1) from your own source, or null to stop. */
  mouth(level) { this.level = level; return this; }
  /** One blink now. */
  blink() { this.blinking = .16; return this; }
  update(dt) {
    // blinking by itself
    if (this.blinkEvery > 0 && (this.blinkT -= dt) <= 0) { this.blink(); this.blinkT = this.blinkEvery * (.6 + Math.random() * .8); }
    this.blinking = Math.max(0, this.blinking - dt);
    // the mouth: a line of speech, or a level
    const m = this.talk; let o = 0, w = 0, r = 0;
    if (this.line) {
      const L = this.line; L.t += dt; while (L.i < L.v.length - 1 && L.v[L.i + 1].t <= L.t) L.i++;
      const a = L.v[L.i]; o = a.open; w = a.wide; r = a.round;
      if (L.t >= L.v.end) this.line = null;
    } else if (this.level != null) { o = Math.max(0, Math.min(1, this.level)); w = o * .25; }
    const k = 1 - Math.exp(-30 * dt); m.open += (o - m.open) * k; m.wide += (w - m.wide) * k; m.round += (r - m.round) * k;
    // everything eased towards where it's going
    const e = 1 - Math.exp(-this.speed * dt);
    for (const [name, i] of Object.entries(this.dict)) {
      let goal = this.want[name] ?? 0;
      if (name === 'blink') goal = Math.max(goal, this.blinking > 0 ? Math.sin((1 - this.blinking / .16) * Math.PI) : 0);
      if (name in m) { this.inf[i] = Math.max(0, Math.min(1.5, goal + m[name])); continue; }
      this.inf[i] += (goal - this.inf[i]) * (name === 'blink' ? 1 : e);
    }
    return this;
  }
}
