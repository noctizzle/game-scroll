// gs.models.human(options): a close-up person, the same skeleton, Rig and Face as gs.poses.person (so
// the same poses, blends, foot planting, face shapes and lip sync drive it), made finer:
//   - the body smoothed with Loop subdivision (three-subdivide), so shoulders, elbows and knees are round
//   - a sculpted head (gs.models.sculpt): skull, jaw, cheekbones, nose, brow, chin and ears, with eye sockets
//   - eyes with a white, a coloured iris and a pupil under a glossy clear coat
//   - hair as a shell with strands that catch the light along their length (anisotropic), in a few styles
//   - skin that lets light through at thin edges (subsurface scattering on WebGPU), clothes in the fabric
//     and leather recipes
// Kit use only: games reach it as gs.models.human.
import { Color, SphereGeometry, Vector3, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { LoopSubdivision } from 'three-subdivide';
import { personParts, assemble, smoothNormals } from '../skin.js';
import { sculpt } from './sculpt.js';
import { material } from './materials.js';
import { pbr } from '../hd3d.js';

// the body's parts smoothed once per build (girth, sleeves, steps) and copied for each person after
const smoothed = new Map();
const subdivider = key => { let i = 0; return (g, n) => {
  const k = key + '|' + n + '|' + i++;
  if (!smoothed.has(k)) {
    let s; try { s = LoopSubdivision.modify(g, n, { split: false, uvSmooth: false, preserveEdges: false, flatOnly: false, maxTriangles: 60000 }); } catch (e) { s = g.index ? g.toNonIndexed() : g.clone(); }
    smoothNormals(s); s.userData.smoothNormals = true;
    if (smoothed.size >= 64) smoothed.delete(smoothed.keys().next().value);
    smoothed.set(k, s);
  }
  g.dispose(); return smoothed.get(k).clone();
}; };

// the head, sculpted (metres, centred where person()'s head is): every person shares one shape per face
const HEAD = [0, 1.57, 0];
const headShapes = (jaw, nose) => [
  { ball: .118, at: [0, .015, -.008], scale: [1, 1.12, 1.08] },                          // skull
  { ball: .085, at: [0, -.055, .02], scale: [1.05 * jaw, 1, 1.05], blend: .05 },          // jaw
  { ball: .028, at: [0, -.1, .062], scale: [1.25, 1, 1], blend: .03 },                    // chin
  ...[1, -1].map(s => ({ ball: .03, at: [s * .055, -.02, .075], blend: .04 })),           // cheekbones
  { capsule: [[0, .02, .105], [0, -.03, .123 + .006 * nose]], r: .014, blend: .025 },     // nose bridge and tip
  ...[1, -1].map(s => ({ ball: .011, at: [s * .013, -.03, .112], blend: .015 })),          // nostrils
  { capsule: [[-.06, .045, .093], [.06, .045, .093]], r: .016, blend: .03 },              // brow ridge
  ...[1, -1].map(s => ({ ball: .024, at: [s * .045, .03, .112], cut: true, blend: .02 })), // eye sockets
  ...[1, -1].map(s => ({ torus: [.02, .007], at: [s * .118, .005, -.01], rot: [0, 0, Math.PI / 2], scale: [1, 1.5, 1], blend: .015 })),   // ears
];
// the shape's local positions moved to where the head sits
const placed = (shapes) => shapes.map(s => s.capsule ? { ...s, capsule: s.capsule.map(p => p.map((v, i) => v + HEAD[i])) } : { ...s, at: (s.at || [0, 0, 0]).map((v, i) => v + HEAD[i]) });

// hair strands: a streaky grey picture the hair colour tints, laid along the strands
let strands = null;
function strandTex() {
  if (strands) return strands;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#b0b0b0'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 400; i++) { const px = (i * 37.17) % 128, l = 128 + (i % 7) * 10; x.strokeStyle = `rgba(${i % 3 ? 255 : 40},${i % 3 ? 255 : 40},${i % 3 ? 255 : 40},${.08 + (i % 5) * .03})`; x.lineWidth = .6 + (i % 3) * .4; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (i % 9 - 4), l); x.stroke(); }
  strands = new CanvasTexture(c); strands.wrapS = strands.wrapT = RepeatWrapping; strands.repeat.set(6, 1); strands.colorSpace = SRGBColorSpace; strands.anisotropy = 4;
  return strands;
}

/**
 * A close-up person: the options of gs.poses.person (body, skin, legs, shoes, hair, eyes, lips, sleeves,
 * girth, scale, shadows) plus hairStyle ('short' | 'long' | 'bun' | 'bald'), iris (eye colour; eyes is the
 * pupil), jaw and nose (1 = average: wider jaw, longer nose), smooth (subdivision steps, 1; 2 for a hero up
 * close), cloth (false: plain clothes, no fabric texture). Returns what person() does: a Group with rig, face,
 * mesh and bones. Make people in make() or reset(): about 0.1 to 0.3 s each on a phone.
 */
export function human(o = {}) {
  const { hairStyle = 'short', iris = '#5a7a9a', jaw = 1, nose = 1, smooth = 1, cloth = true } = o;
  const P = personParts({ ...o, head: false }), { add, one, cols } = P, hairOn = o.hair !== null && hairStyle !== 'bald';
  const cSclera = new Color('#f4f0ea'), cIris = new Color(iris), cPupil = cols.eyes;
  // the sculpted head and neck join (skin), its face shapes as person()'s
  const head = sculpt(placed(headShapes(jaw, nose)), { blend: .04, res: 56 }).clone();
  add(head, one('head'), () => cols.skin, 'head', new Vector3(...HEAD));
  // eyes: white, iris and pupil by the angle from straight ahead
  for (const s of [1, -1]) {
    const c = new Vector3(s * .045, 1.6, .101), eye = new SphereGeometry(.02, 16, 12); eye.translate(c.x, c.y, c.z);
    add(eye, one('head'), p => { const d = p.clone().sub(c).normalize().z; return d > .97 ? cPupil : d > .88 ? cIris : cSclera; }, 'eye', c, { slot: 'eyes' });
    // a lid over the top of the eye (skin), which closes with blink
    const lid = new SphereGeometry(.0212, 14, 6, 0, Math.PI * 2, 0, Math.PI * .3); lid.rotateX(-.15); lid.translate(c.x, c.y, c.z);
    add(lid, one('head'), () => cols.skin, 'lid', c);
    const brow = sculpt([{ capsule: [[-.022, 0, 0], [.022, .004 * s, 0]], r: .005 }], { res: 16 }).clone(); brow.translate(s * .047, 1.643, .112);
    add(brow, one('head'), () => hairOn ? cols.hair : cols.eyes, 'brow', new Vector3(s * .047, 1.643, .112));
  }
  // lips: an upper and a lower, which open, widen and round as person()'s mouth does
  const mouth = new SphereGeometry(.03, 18, 10); mouth.scale(1, .32, .42); mouth.translate(0, 1.52, .112);
  add(mouth, one('head'), () => cols.lips, 'mouth', new Vector3(0, 1.52, .112));
  // hair
  if (hairOn) {
    const cap = new SphereGeometry(.128, 28, 16, 0, Math.PI * 2, 0, Math.PI * .56); cap.scale(1.04, 1.1, 1.1); cap.rotateX(-.85); cap.translate(0, 1.595, -.012);
    add(cap, one('head'), () => cols.hair, null, null, { slot: 'hair' });
    if (hairStyle === 'long') { const back = sculpt([{ capsule: [[0, .02, -.06], [0, -.2, -.09]], r: .1, scale: [1.1, 1, .55] }], { res: 32 }).clone(); back.translate(0, 1.57, 0); add(back, p => [['head', 1 - Math.max(0, Math.min(1, (1.47 - p.y) / .1)) * .5], ['spine', Math.max(0, Math.min(1, (1.47 - p.y) / .1)) * .5]], () => cols.hair, null, null, { slot: 'hair' }); }
    if (hairStyle === 'bun') { const bun = new SphereGeometry(.05, 16, 10); bun.translate(0, 1.69, -.07); add(bun, one('head'), () => cols.hair, null, null, { slot: 'hair' }); }
  }
  // materials: skin lets light through, eyes glossy, hair shines along its strands, clothes in recipes
  const skin = pbr('#ffffff', { rough: .55, sss: { colour: '#e0603c', scale: .6 } });
  const top = cloth ? material('fabric', { colour: '#e8e8e8', repeat: [8, 8] }) : pbr('#ffffff', { rough: .85 });
  const legs = cloth ? material('fabric', { colour: '#d8d8e0', repeat: [10, 14], seed: 2 }) : pbr('#ffffff', { rough: .85 });
  const shoes = cloth ? material('leather', { colour: '#c8c8c8', repeat: [3, 3] }) : pbr('#ffffff', { rough: .5 });
  const hair = pbr('#ffffff', { rough: .45, aniso: .8, anisoDir: Math.PI / 2, map: strandTex() });
  const eyes = pbr('#ffffff', { rough: .2, clear: 1 });
  const out = assemble(P, { ...o, smooth, subdivide: subdivider(JSON.stringify([o.girth ?? 1, o.sleeves ?? 'long'])), mats: { body: top, skin, lips: skin, legs, shoes, hair, eyes } });
  out.name = 'human';
  return out;
}
