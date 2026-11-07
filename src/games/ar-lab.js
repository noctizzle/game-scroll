import { sfx } from '../sfx.js';
import { haptic, want } from '../kit/device.js';
import { ARView, arNote, FLOOR } from '../kit/ar3d.js';
import { pbr, THREE } from '../kit/hd3d.js';
const { Group, Mesh, BoxGeometry, PlaneGeometry, EdgesGeometry, LineSegments, LineBasicMaterial, MeshBasicMaterial, DoubleSide } = THREE;

// AR Lab: a test scene for native AR (not in the feed; open it from Settings > AR test).
// A 20 cm cube sits on your floor 1.5 m ahead. Walk around it: with native AR it should stay put on
// the real floor and you should see its sides. Found surfaces show as teal outlines, and tapping
// one drops a small cube where you tapped. The panel shows what the AR system is doing.
let W = 300, H = 460;
const COLS = ['#ff5a7a', '#ffc23a', '#5ad86a', '#4ab0ff', '#b06aff'];

function make(api) {
  want('motion');
  let v, cube, drops, planeG, planes, placed, tap, note, noteT;
  const mats = COLS.map(c => pbr(c, { rough: .35 }));
  const box = new BoxGeometry(1, 1, 1), flat = new PlaneGeometry(1, 1);
  const fill = new MeshBasicMaterial({ color: '#19e3b1', transparent: true, opacity: .12, depthWrite: false, side: DoubleSide, toneMapped: false });
  const edge = new LineBasicMaterial({ color: '#19e3b1', transparent: true, opacity: .8, toneMapped: false });
  const edges = new EdgesGeometry(flat);
  function setup() {
    v = new ARView();
    cube = new Mesh(box, pbr('#f2f5fb', { rough: .3, metal: .1 })); cube.scale.setScalar(.2); cube.castShadow = cube.receiveShadow = true;
    // coloured faces would need a texture; a stripe on top shows which way it faces
    const stripe = new Mesh(box, mats[0]); stripe.scale.set(1.02, .2, .3); stripe.position.set(0, .41, -.36); cube.add(stripe);
    v.scene.add(cube);
    drops = new Group(); v.scene.add(drops);
    planeG = new Group(); v.scene.add(planeG); planes = new Map();
  }
  function say(s) { note = s; noteT = 1.6; }
  function showPlanes() {
    const seen = new Set();
    for (const s of v.surfaces?.() || []) {
      seen.add(s.id);
      let g = planes.get(s.id);
      if (!g) {
        g = new Group(); const f = new Mesh(flat, fill), e = new LineSegments(edges, edge);
        f.rotation.x = e.rotation.x = -Math.PI / 2; g.add(f, e); planeG.add(g); planes.set(s.id, g);
      }
      g.position.copy(s.p); g.quaternion.copy(s.q); g.scale.set(s.w, 1, s.d);
      g.children[1].material = edge; g.children[0].material.opacity = s.floor ? .18 : .1;
    }
    for (const [id, g] of planes) if (!seen.has(id)) { planeG.remove(g); planes.delete(id); }
  }
  return {
    reset() {
      v?.off(); v?.recenter();
      placed = 0; tap = null; note = null; noteT = 0;
      if (v) { drops.clear(); cube.position.set(0, FLOOR + .1, -1.5); cube.rotation.set(0, 0, 0); }
    },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      if (!v) return; v.live(); noteT -= dt;
      if (v.calibrating) return;
      // the home cube sits on whatever floor height the kit has now
      cube.position.y = FLOOR + .1;
    },
    draw(c) {
      if (!v) { setup(); this.reset(); }
      v.look(1 / 60); showPlanes();
      v.draw(c, W, H);
      v.pointers(c, W, H, [{ p: cube.position, col: '#f2f5fb' }]);
      // status panel
      const n = v.nat, cp = v.eyePos, rows = [
        ['Mode', v.mode === 'world' ? 'World (native AR)' : `Look-around (${v.camState})`],
        ['Tracking', n ? n.tracking : v.sensor ? 'gyro' : 'none'],
        ['Surfaces', n ? `${n.planes.length}${v.floorFound ? ' · floor found' : ''}` : '-'],
        ['Phone', `${cp.x.toFixed(2)}, ${(cp.y - FLOOR).toFixed(2)} up, ${cp.z.toFixed(2)}`],
        ['Cube', `${cube.position.distanceTo(cp).toFixed(2)} m away`],
      ];
      c.save(); c.fillStyle = '#04110ed0'; c.beginPath(); c.roundRect(10, 44, W - 20, 16 + rows.length * 15, 10); c.fill();
      c.font = '600 10px Rubik, sans-serif';
      rows.forEach(([k, t], i) => { c.fillStyle = '#8affdc'; c.textAlign = 'left'; c.fillText(k, 20, 60 + i * 15); c.fillStyle = '#fff'; c.fillText(t, 82, 60 + i * 15); });
      c.textAlign = 'center'; c.font = '600 12px Rubik, sans-serif'; c.fillStyle = '#ffffffd0';
      c.fillText(v.mode === 'world' ? 'Walk round the cube · tap a surface to drop one' : 'Tap the floor to drop a cube', W / 2, H - 52);
      if (noteT > 0 && note) { c.font = '800 18px Rubik, sans-serif'; c.lineWidth = 4; c.strokeStyle = '#000a'; c.strokeText(note, W / 2, H * .45); c.fillStyle = '#fff'; c.fillText(note, W / 2, H * .45); }
      c.restore();
      arNote(c, v, W, H);
    },
    down(x, y, id) { if (v?.input?.('down', x, y, id)) return; tap = { x, y, id }; },
    move(x, y, pressed, id) { v?.input?.('move', x, y, id, pressed); },
    up(x, y, id) {
      if (v?.input?.('up', x, y, id)) return;
      if (!tap || tap.id !== id || Math.hypot(x - tap.x, y - tap.y) > 14) { tap = null; return; }
      tap = null;
      const ask = v.hit ? v.hit(x, y) : Promise.resolve(null);
      ask.then(h => {
        if (!h) { say('No surface there'); haptic('warning'); return; }
        const m = new Mesh(box, mats[placed % COLS.length]); m.scale.setScalar(.08); m.castShadow = true;
        m.position.copy(h.p); m.position.y += .04; drops.add(m);
        if (drops.children.length > 30) drops.remove(drops.children[0]);
        placed++; api.score(placed); say(h.kind === 'plane' ? 'On a surface' : h.kind === 'point' ? 'On a rough spot' : 'On the floor');
        haptic('light'); sfx(700, .08, 'triangle', .04, 200);
      });
    },
  };
}

export default {
  id: 'ar-lab',
  title: 'AR Lab',
  tag: 'AR · Test',
  retro: true, era: 'ar', pal: 'grape',
  w: 300, h: 460, maxW: 600, maxH: 680,
  goal: 5, reward: 0,
  hint: 'A test scene for AR: a cube sits on your floor. Walk around it to check it stays put, and tap surfaces to drop small cubes. Not a real game.',
  traits: ['theme:lab'],
  make,
};
