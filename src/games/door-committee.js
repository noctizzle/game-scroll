// Door Committee: a Next Gen puzzle walk through the Hollowell Door Assurance Lab, a spotless test
// facility where every department of a game studio must sign off a door before anyone may walk
// through it. Each room is one department's idea of what a door should do, played for laughs.
// Inspired by Liz England's essay "The Door Problem" (2014), in which every job on a game turns out
// to have its own questions about doors. Original facility, characters and lines.
//
// Tap the floor to walk (or hold and drag), tap a door to go to it. From the third room you carry
// the lab's one piece of equipment, a rubber doorstop: tap an open door to wedge it, tap it again
// (or the wedge button) to get the wedge back.
import gs from '../gamescroll.js';
const { sounds, sfx, noise, say } = gs.sound;
const { haptic } = gs.device;
const { Juice } = gs.juice;
const { Keys } = gs.controls;
const { NavGrid } = gs.ai;
const { HDView, Particles, pbr, rbox, surface, speckle, spot, THREE } = gs.hd;

let W = 300, H = 300;
const COLS = 11, ROWS = 9, MAXD = 6;
const MINT = '#3fe0b0', RED = '#ff4766', AMBER = '#ffb340', DULL = '#55606a';
const wx = cx => cx - (COLS - 1) / 2, wz = cy => cy - (ROWS - 1) / 2;
const cxOf = x => Math.round(x + (COLS - 1) / 2), cyOf = z => Math.round(z + (ROWS - 1) / 2);

// ---------- the rooms: one department each ----------
// '#' wall, '.' floor, 'S' start, letters A-F doors (specs below, E is the way out), k keycard, g gem, 1/2 robot stops
const LANGS = [['German', 'AUSGANG'], ['French', 'SORTIE'], ['Spanish', 'SALIDA'], ['Italian', 'USCITA'], ['Dutch', 'UITGANG'], ['Welsh', 'ALLANFA'], ['Swedish', 'UTGÅNG'], ['Polish', 'WYJŚCIE']];
const ROOMS = {
  creative: {
    dept: 'Creative Direction',
    memo: 'The Creative Director has decided this game needs doors. Tap the back wall where one should go.',
    done: 'Bold. Visionary. Rectangular.',
    map: ['###########', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: {}, place: true,
  },
  level: {
    dept: 'Level Design',
    memo: 'Level Design locked the door and hid the keycard somewhere "sensible".',
    done: 'Level Design would like it noted that the key was in a room. With a door.',
    map: ['#####E#####', '#...#.....#', '#.k.#.....#', '#...A.....#', '#####.....#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { E: { type: 'key', label: 'EXIT' }, A: { type: 'auto' } },
  },
  code: {
    dept: 'Gameplay Programming',
    memo: 'Programming made the door open when you get near it. Nobody asked which way round.',
    done: 'Programming has closed the ticket as "works as designed".',
    map: ['#####E#####', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { E: { type: 'shy', label: 'EXIT' } }, wedge: true,
  },
  ai: {
    dept: 'AI Programming',
    memo: 'AI Programming taught the door to open for staff. You are not staff. You are a test.',
    done: 'The robot has filed a complaint about being followed.',
    map: ['#####E#####', '#....2....#', '#.........#', '#####A#####', '#.........#', '#......1..#', '#.........#', '#....S....#', '###########'],
    doors: { E: { type: 'auto', label: 'EXIT' }, A: { type: 'staff', label: 'STAFF ONLY' } }, bot: true,
  },
  art: {
    dept: 'Concept Art',
    memo: 'Concept Art painted a stunning door. Environment Art is still building the real one. Somewhere.',
    done: 'Concept Art has asked for the hatch to be "more heroic".',
    map: ['#####P#####', '#.........#', '#.........#', '#.........E', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { P: { type: 'paint', label: 'EXIT (CONCEPT)' }, E: { type: 'auto', dull: true } },
  },
  money: {
    dept: 'Monetisation',
    memo: 'Monetisation suggests: open the door now for 5 Door Gems, or simply wait.',
    done: 'Thank you for your purchase. Please rate the door.',
    map: ['#####E#####', '#g.......g#', '#..##.##..#', '#.........#', '#g.......g#', '#...#.#...#', '#....g....#', '#....S....#', '###########'],
    doors: { E: { type: 'pay' } },
  },
  qa: {
    dept: 'Quality Assurance',
    memo: 'QA must test this door before anyone may use it. Please help.',
    done: 'Bug filed: door has feelings. Won\'t fix.',
    map: ['#####E#####', '#.........#', '#.........#', '#####T#####', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { E: { type: 'qaexit', label: 'EXIT' }, T: { type: 'auto', label: 'TEST DOOR', qa: true } },
  },
  sound: {
    dept: 'Sound Design',
    memo: 'Sound Design gave the door a lovely hum. Lighting spent their budget on it. Follow the hum.',
    done: 'Lighting would like you to know the dark was intentional.',
    map: ['###########', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: {}, dark: true,
  },
  loc: {
    dept: 'Localisation',
    memo: 'Localisation translated the exit sign. And the cupboard signs. The exit is the one in ',
    done: 'Localisation reminds you a cupboard is also a door, technically.',
    map: ['##A#B#C#D##', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { A: { type: 'loc' }, B: { type: 'loc' }, C: { type: 'loc' }, D: { type: 'loc' } }, loc: true,
  },
  legal: {
    dept: 'Legal',
    memo: 'Legal found a very famous logo on the door. Scrub it off before anyone notices. Rub the door.',
    done: 'Logo removed. The door is now legally a door.',
    map: ['#####E#####', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { E: { type: 'legal', label: 'EXIT' } },
  },
  cut: {
    dept: 'Production',
    memo: 'Production has cut the door for scope. Please enjoy the hole.',
    done: 'Ship it.',
    map: ['#####E#####', '#.........#', '#.........#', '#..##.##..#', '#.........#', '#.........#', '#.........#', '#....S....#', '###########'],
    doors: { E: { type: 'cut' } },
  },
};
const FIRST = ['creative', 'level', 'code', 'ai', 'art', 'money', 'qa', 'sound', 'loc', 'legal', 'cut'];
const LOOP = ['level', 'code', 'ai', 'art', 'money', 'qa', 'sound', 'loc', 'legal'];

const QUIPS = {
  key: ['Locked. Level Design is thrilled you noticed.', 'Still locked. The keycard is in the little room.'],
  shy: ['It closes when you come near. Programming says that is "realistic".', 'Doors are shy. Try the doorstop: tap the door while it is open.'],
  staff: ['STAFF ONLY. The door can tell.', 'Follow the robot. It has the right face.'],
  paint: ['That is a painting of a door. It is very good.', 'Still a painting. The real door is the boring one on the right.', 'You have walked into art. Art won.'],
  pay: ['Insufficient Door Gems. Have you considered waiting?'],
  qaexit: ['Locked until QA has finished testing the other door.'],
  legal: ['Legal hold. Scrub the logo off first: rub the door.'],
  auto: ['The door did not open in time. It has been told.'],
  loc: ['A broom cupboard. In every language.', 'Another cupboard. Very tidy, though.'],
  wedgePaint: 'You cannot wedge a painting open. Believe us, we tried.',
  wedgeShut: 'Wedges work on open doors. That is sort of the whole idea.',
  wedgeLate: 'Too late, it shut. Wedges need a gap.',
  wedgeIn: 'Wedged. Programming calls this "an edge case".',
  issued: 'Facilities have issued you one (1) doorstop. Tap an open door to wedge it.',
};

// ---------- 3D: built once per game module ----------
let v, light, lamp, walls, lows, bases, floorM, voidM, doorPool, painting, player, visor, bot, beacon, brush, keycard, gems, wedgeM, mop, sparks, matCache;
function setup() {
  v = new HDView({ bg: '#0d1115', fog: 0, env: .3, sky: '#eef6ff', ground: '#3a4148', amb: .22, fov: 40 });
  v.exposure = .9;
  v.cam.near = .3; v.cam.far = 80; v.cam.updateProjectionMatrix();
  light = spot('#fffaf2', 14, 34, .62); light.position.set(0, 13, 4); light.target.position.set(0, 0, -.3); v.scene.add(light, light.target);
  v.onTier(T => light.setTier(T));
  lamp = new THREE.PointLight('#bff8e6', 1.2, 5, 1.6); v.scene.add(lamp);

  const tiles = surface(256, ({ col, h, r, size: S }) => {
    col.fillStyle = '#a9b3ba'; col.fillRect(0, 0, S, S); speckle(col, S, 400, '#929ca4', 1.2, .25);
    col.fillStyle = '#6c7780'; col.fillRect(0, 0, S, 5); col.fillRect(0, 0, 5, S);
    h.fillStyle = '#000'; h.fillRect(0, 0, S, 5); h.fillRect(0, 0, 5, S);
    r.fillStyle = '#555'; r.fillRect(8, 8, S - 16, S - 16);
  });
  const panel = surface(256, ({ col, h, size: S }) => {
    col.fillStyle = '#dde2e5'; col.fillRect(0, 0, S, S); speckle(col, S, 200, '#c5ccd1', 1, .2);
    col.fillStyle = '#c7cfd4'; col.fillRect(0, S * .55, S, 3); col.fillRect(0, 0, 3, S);
    h.fillStyle = '#000'; h.fillRect(0, S * .55, S, 3); h.fillRect(0, 0, 3, S);
    col.fillStyle = '#aab3b9'; for (const [x, y] of [[20, 20], [S - 20, 20], [20, S - 20], [S - 20, S - 20]]) { col.beginPath(); col.arc(x, y, 3, 0, 7); col.fill(); }
  });
  const wallMat = pbr('#ffffff', { tex: panel, rough: .4, metal: .05 });
  floorM = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), pbr('#ffffff', { tex: tiles, rep: [COLS, ROWS], rough: .3, metal: .05 }));
  floorM.rotation.x = -Math.PI / 2; floorM.receiveShadow = true; v.scene.add(floorM);
  voidM = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), pbr('#151a1f', { rough: .85 })); voidM.rotation.x = -Math.PI / 2; voidM.position.y = -.02; v.scene.add(voidM);
  walls = new THREE.InstancedMesh(rbox(1, 1.5, 1, .05), wallMat, COLS * ROWS); walls.castShadow = walls.receiveShadow = true; v.scene.add(walls);
  lows = new THREE.InstancedMesh(rbox(1, .3, 1, .05), wallMat, COLS * 2); lows.receiveShadow = true; v.scene.add(lows);
  bases = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, .05, 1.02), pbr(MINT, { glow: 1.8 }), COLS * ROWS); v.scene.add(bases);

  // doors: frame, sliding panel and a status light front and back
  const frameMat = pbr('#59646d', { rough: .3, metal: .6 }), panelMat = pbr('#2e373e', { rough: .3, metal: .5, clear: .6 });
  const stripeMat = pbr(MINT, { glow: 1.2, rough: .4 });
  doorPool = [];
  for (let i = 0; i < MAXD; i++) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.07, 1.5, .34), frameMat); p.position.set(s * .465, .75, 0); p.castShadow = true; g.add(p); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, .24, .34), frameMat); lintel.position.y = 1.38; g.add(lintel);
    const lightMat = pbr('#ffffff', { glow: 2.2, glowCol: MINT });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.7, .09, .37), lightMat); strip.position.y = 1.37; g.add(strip);
    const slide = new THREE.Group(); g.add(slide);
    const pn = new THREE.Mesh(rbox(.86, 1.25, .1, .03), panelMat); pn.position.y = .63; pn.castShadow = true; slide.add(pn);
    const st = new THREE.Mesh(new THREE.BoxGeometry(.87, .08, .11), stripeMat); st.position.y = .7; slide.add(st);
    g.visible = false; v.scene.add(g);
    doorPool.push({ g, slide, lightMat });
  }
  // the painted door: gilded frame and an impossibly heroic glowing arch
  painting = new THREE.Group();
  const gold = pbr('#d8a640', { rough: .25, metal: 1 });
  const fr = new THREE.Mesh(rbox(1.3, 1.5, .14, .05), gold); fr.position.y = .75; painting.add(fr);
  for (const [x, y] of [[-.62, 1.47], [.62, 1.47], [-.62, .03], [.62, .03]]) { const orn = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), gold); orn.position.set(x, y, .06); painting.add(orn); }
  const canvasM = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.28, .04), pbr('#173b4a', { rough: .7 })); canvasM.position.set(0, .72, .05); painting.add(canvasM);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(.32, .045, 8, 24, Math.PI), pbr('#ffd27a', { glow: 3 })); arch.position.set(0, .92, .08); painting.add(arch);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.09, .62, .03), pbr('#ffd27a', { glow: 3 })); leg.position.set(s * .32, .61, .08); painting.add(leg); }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), gold); knob.position.set(.18, .62, .1); painting.add(knob);
  painting.visible = false; v.scene.add(painting);

  // the test walker
  player = new THREE.Group(); player.userData.noHold = true;
  const suit = pbr('#f4f6f8', { rough: .35, clear: .4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .42, 6, 14), suit); body.position.y = .45; body.castShadow = true; player.add(body);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.215, .215, .05, 18), pbr(MINT, { glow: 1.6 })); belt.position.y = .42; player.add(belt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 18, 12), suit); head.position.y = .93; head.castShadow = true; player.add(head);
  visor = new THREE.Mesh(new THREE.BoxGeometry(.24, .08, .1), pbr(MINT, { glow: 2.6 })); visor.position.set(0, .95, .12); player.add(visor);
  player.scale.setScalar(1.3); v.scene.add(player);
  // the custodial robot (staff)
  bot = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, .3, 20), pbr('#f0b43c', { rough: .35, clear: .5 })); shell.position.y = .2; shell.castShadow = true; bot.add(shell);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), pbr('#e9eef1', { rough: .2, metal: .3 })); dome.position.y = .35; bot.add(dome);
  beacon = new THREE.Mesh(new THREE.SphereGeometry(.06, 10, 8), pbr(AMBER, { glow: 4 })); beacon.position.y = .56; bot.add(beacon);
  brush = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .04, 8), pbr('#39424a', { rough: .9 })); brush.position.set(0, .03, .2); bot.add(brush);
  bot.visible = false; v.scene.add(bot);
  // keycard on a pedestal, door gems, the doorstop and a mop for the cupboards
  keycard = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, .55, 16), pbr('#dfe4e7', { rough: .3 })); ped.position.y = .27; ped.castShadow = true; keycard.add(ped);
  const card = new THREE.Mesh(rbox(.3, .03, .2, .01), pbr(MINT, { glow: 2.4 })); card.position.y = .7; card.name = 'card'; keycard.add(card);
  keycard.visible = false; v.scene.add(keycard);
  const gemMat = pbr('#ff4fa3', { glow: 2.6, rough: .15 });
  gems = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.OctahedronGeometry(.15), gemMat); m.castShadow = true; m.visible = false; v.scene.add(m); gems.push(m); }
  wedgeM = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .14, 3), pbr('#ffc23a', { rough: .6, glow: .25 })); wedgeM.rotation.x = Math.PI / 2; wedgeM.castShadow = true; wedgeM.visible = false; v.scene.add(wedgeM);
  mop = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.2, 6), pbr('#c98a4b', { rough: .7 })); stick.position.y = .6; mop.add(stick);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(.3, .12, .14), pbr('#d8dde0', { rough: 1 })); mh.position.y = .04; mop.add(mh);
  mop.visible = false; v.scene.add(mop);
  sparks = new Particles(v, { max: 400, additive: true });
  matCache = { mint: new THREE.Color(MINT), red: new THREE.Color(RED), amber: new THREE.Color(AMBER), dull: new THREE.Color(DULL) };
}

// word wrap for the memo panel
function wrap(c, text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}

function make(api) {
  const fx = new Juice(), keys = new Keys();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
  let room, roomKey, grid, nav, doors, P, B, items, score, time, t, roomT, order, loop, hasKey, gemsGot, payT, scrub, qa, wedge,
    memo, memoT, quip, quipT, stamp, stampT, fade, leaving, nextT, path, waitT, bonkT, humT, langPick, said, ended, ptr, warnT, camLook;

  const cellAt = (cx, cy) => (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) ? '#' : grid[cy][cx];
  const doorAt = (cx, cy) => doors.find(d => d.cx === cx && d.cy === cy);
  const blocked = (cx, cy, who = P) => {
    const ch = cellAt(cx, cy);
    if (ch === '#') return true;
    const d = doorAt(cx, cy); if (!d) return false;
    if (d.type === 'paint') return true;
    return who === P ? d.o < .75 : d.o < .6;
  };
  const showQuip = (s, sec = 2.6) => { quip = s; quipT = sec; };
  const pickQuip = (k, d) => { const l = QUIPS[k] || QUIPS.auto; const i = d ? (d.bonks = (d.bonks || 0) + 1) - 1 : 0; return l[Math.min(i, l.length - 1)]; };

  function locked(d) {
    switch (d.type) {
      case 'key': return !hasKey;
      case 'staff': return true;
      case 'pay': return gemsGot < 5 && payT > 0;
      case 'qaexit': return !qa.done;
      case 'legal': return scrub < 1;
      case 'paint': return true;
      default: return false;
    }
  }
  function wantOpen(d) {
    if (d.wedged || d.type === 'cut') return true;
    const pd = Math.hypot(P.x - d.x, P.z - d.z), bd = B.on ? Math.hypot(B.x - d.x, B.z - d.z) : 99;
    const inCell = cxOf(P.x) === d.cx && cyOf(P.z) === d.cy;
    switch (d.type) {
      case 'shy': return pd > 3.6 || (inCell && d.o > .5);
      case 'staff': return bd < 1.5 || (inCell && d.o > .5);
      case 'loc': return d.real ? pd < 1.6 : d.cupT > 0;
      case 'paint': return false;
      default: return !locked(d) && (pd < 1.6 || bd < 1.4 || inCell);
    }
  }

  function placeDoor(i, ch, cx, cy, spec) {
    const pool = doorPool[i];
    const d = { ch, cx, cy, x: wx(cx), z: wz(cy), o: 0, wedged: false, cupT: 0, bonks: 0, sq: 0, ...spec, pool };
    // which way the wall runs through the door
    const along = cellAt(cx - 1, cy) === '#' && cellAt(cx + 1, cy) === '#';
    d.rot = along ? 0 : Math.PI / 2;
    d.out = [cx === 0 ? -1 : cx === COLS - 1 ? 1 : 0, cy === 0 ? -1 : cy === ROWS - 1 ? 1 : 0];
    if (d.type === 'paint') {
      pool.g.visible = false;
      painting.visible = true; painting.position.set(d.x, 0, d.z + .52); painting.rotation.y = 0;
    } else {
      pool.g.visible = d.type !== 'cut';
      pool.g.position.set(d.x, 0, d.z); pool.g.rotation.y = d.rot;
    }
    return d;
  }

  function loadRoom(key) {
    roomKey = key; room = ROOMS[key];
    grid = room.map.map(r => r.split(''));
    doors = []; items = []; hasKey = false; gemsGot = 0; payT = 20; scrub = 0; humT = 0;
    qa = { side: 's', cross: 0, stood: 0, done: false, gag: 0 };
    for (const p of doorPool) p.g.visible = false;
    painting.visible = false; keycard.visible = false; keycard.getObjectByName('card').visible = true; mop.visible = false; gems.forEach(g => g.visible = false);
    B = { on: !!room.bot, x: 0, z: 0, stops: [], at: 0, wait: 1, path: null };
    if (room.dark) {   // the hum comes from a door somewhere on the walls
      const spots = [];
      for (let x = 2; x <= COLS - 3; x++) spots.push([x, 0]);
      for (let y = 1; y <= 5; y++) spots.push([0, y], [COLS - 1, y]);
      const [cx, cy] = spots[(Math.random() * spots.length) | 0]; grid[cy][cx] = 'E';
    }
    let gi = 0, di = 0;
    langPick = null;
    if (room.loc) {
      const pool = LANGS.slice().sort(() => Math.random() - .5).slice(0, 4);
      langPick = (Math.random() * 4) | 0;
      'ABCD'.split('').forEach((L, i) => { room.doors[L].word = pool[i][1]; room.doors[L].lang = pool[i][0]; room.doors[L].real = i === langPick; });
      langPick = pool[langPick][0];
    }
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const ch = grid[cy][cx];
      if (ch === 'S') { P = { x: wx(cx), z: wz(cy), face: Math.PI }; grid[cy][cx] = '.'; }
      else if (ch === 'k') { keycard.visible = true; keycard.position.set(wx(cx), 0, wz(cy)); items.push({ kind: 'key', x: wx(cx), z: wz(cy) }); grid[cy][cx] = '.'; }
      else if (ch === 'g') { const m = gems[gi++]; m.visible = true; m.position.set(wx(cx), .5, wz(cy)); items.push({ kind: 'gem', x: wx(cx), z: wz(cy), m }); grid[cy][cx] = '.'; }
      else if (ch === '1' || ch === '2') { B.stops[+ch - 1] = { x: wx(cx), z: wz(cy) }; grid[cy][cx] = '.'; }
      else if (/[A-Z]/.test(ch) && di < MAXD) {
        const spec = room.doors[ch] || { type: 'auto' };
        const d = placeDoor(di++, ch, cx, cy, { ...spec, exit: ch === 'E' || (room.loc && spec.real) });
        if (room.dark) { d.type = 'auto'; d.hum = true; }
        doors.push(d);
      }
    }
    if (B.on) { B.x = B.stops[0].x; B.z = B.stops[0].z; }
    bot.visible = B.on;
    // walls and the low front wall; the painting hangs on a wall block
    let n = 0, l = 0, b = 0; const m = new THREE.Matrix4();
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const ch = grid[cy][cx], wall = ch === '#' || ch === 'P';
      if (!wall) continue;
      m.makeTranslation(wx(cx), cy === ROWS - 1 ? .15 : .75, wz(cy));
      if (cy === ROWS - 1) lows.setMatrixAt(l++, m); else walls.setMatrixAt(n++, m);
      m.makeTranslation(wx(cx), .06, wz(cy)); bases.setMatrixAt(b++, m);
    }
    walls.count = n; lows.count = l; bases.count = b;
    walls.instanceMatrix.needsUpdate = lows.instanceMatrix.needsUpdate = bases.instanceMatrix.needsUpdate = true;
    walls.computeBoundingSphere(); lows.computeBoundingSphere(); bases.computeBoundingSphere();
    nav = new NavGrid(COLS, ROWS, 1, (x, y) => { const ch = grid[y][x]; return ch === '#'; }, { diagonal: true });
   
    // light: the sound room is dark apart from the walker's own lamp
    const dark = !!room.dark;
    v.hemi.intensity = dark ? .03 : .22; light.intensity = dark ? 0 : 14; lamp.intensity = dark ? 6 : .5; lamp.distance = dark ? 4.2 : 5;
    v.envI = dark ? .04 : .3; bases.visible = !dark;
    path = null; waitT = 0; bonkT = 0; leaving = null; roomT = 0; said = false;
    memo = { dept: room.dept, text: room.memo + (room.loc ? langPick + '.' : '') }; memo.voice = memo.text; memoT = 0;
    if (room.wedge && wedge.state === 'none') { wedge.state = 'hand'; wedge.issued = true; showQuip(QUIPS.issued, 4.5); }
    if (wedge.state === 'stuck' || wedge.state === 'fly') wedge.state = wedge.issued ? 'hand' : 'none';
    wedgeM.visible = false;
    if (v.shadowsDirty) v.shadowsDirty();
  }

  // ---------- moving ----------
  function goTo(x, z) {
    let tx = Math.max(0, Math.min(COLS - 1, cxOf(x))), ty = Math.max(0, Math.min(ROWS - 1, cyOf(z)));
    if (cellAt(tx, ty) === '#') {   // nearest open cell to where the finger went
      let best = null, bd = 1e9;
      for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) if (cellAt(cx, cy) !== '#') { const dd = (wx(cx) - x) ** 2 + (wz(cy) - z) ** 2; if (dd < bd) { bd = dd; best = [cx, cy]; } }
      if (!best) return; [tx, ty] = best;
    }
    const px = cxOf(P.x) + .5, pz = cyOf(P.z) + .5;
    const r = nav.path(Math.max(.5, Math.min(COLS - .5, px)), Math.max(.5, Math.min(ROWS - .5, pz)), tx + .5, ty + .5);
    if (!r) return;
    path = r.slice(1).map(p => ({ x: p.x - COLS / 2, z: p.y - ROWS / 2 }));
    waitT = 0;
  }
  function bonk(d, quipKey) {
    if (bonkT > 0) return;
    bonkT = .9; path = null;
    if (d) { const dx = P.x - d.x, dz = P.z - d.z, l = Math.hypot(dx, dz) || 1; P.x += dx / l * .18; P.z += dz / l * .18; }
    sounds.hit(); haptic('medium'); fx.shake(5);
    const [sx, sy] = v.toScreen(P.x, 1.2, P.z); fx.pop(sx, sy, 'BONK', { color: '#ffd27a' });
    if (quipKey) showQuip(typeof quipKey === 'string' && !QUIPS[quipKey] ? quipKey : pickQuip(quipKey, d));
  }
  // steps the walker by (dx, dz); stops at walls and closed doors
  function step(dx, dz) {
    const l = Math.hypot(dx, dz); if (!l) return true;
    const lx = P.x + dx / l * .32, lz = P.z + dz / l * .32;
    const cx = cxOf(lx), cy = cyOf(lz);
    if (blocked(cx, cy)) {
      const d = doorAt(cx, cy);
      if (d && d.type !== 'paint' && (!locked(d) || d.type === 'staff') && waitT < .7) { waitT += 1 / 60; return false; }   // give it a moment to open
      if (d) bonk(d, d.type); else path = null;
      return false;
    }
    waitT = 0; P.x += dx; P.z += dz; P.face = Math.atan2(dx, dz); return true;
  }

  // ---------- the doorstop ----------
  function throwWedge(d) {
    if (d.type === 'paint') return showQuip(QUIPS.wedgePaint);
    if (d.o < .35 && !d.wedged) return showQuip(QUIPS.wedgeShut);
    wedge.state = 'fly'; wedge.t = 0; wedge.from = { x: P.x, z: P.z }; wedge.to = d; wedge.back = false;
    sounds.jump(); haptic('light');
  }
  function recall() {
    if (wedge.state !== 'stuck') return;
    const d = wedge.to; d.wedged = false;
    wedge.state = 'fly'; wedge.t = 0; wedge.from = { x: d.x, z: d.z }; wedge.back = true;
    sounds.select(); haptic('light');
  }
  function updateWedge(dt) {
    if (wedge.state !== 'fly') { wedgeM.visible = wedge.state === 'stuck'; return; }
    wedge.t += dt / .38; const k = Math.min(1, wedge.t);
    const to = wedge.back ? { x: P.x, z: P.z } : wedge.to;
    wedgeM.visible = true;
    wedgeM.position.set(wedge.from.x + (to.x - wedge.from.x) * k, .1 + Math.sin(k * Math.PI) * 1.1, wedge.from.z + (to.z - wedge.from.z) * k);
    wedgeM.rotation.z += dt * 18;
    if (k < 1) return;
    if (wedge.back) { wedge.state = 'hand'; wedgeM.visible = false; return; }
    const d = wedge.to;
    if (d.o > .3) {
      d.wedged = true; wedge.state = 'stuck'; wedgeM.position.set(d.x, .07, d.z); wedgeM.rotation.set(Math.PI / 2, 0, d.rot);
      sounds.click(); haptic('heavy'); fx.shake(3); showQuip(QUIPS.wedgeIn, 2);
      for (let i = 0; i < 18; i++) sparks.emit({ x: d.x, y: .1, z: d.z, vx: (Math.random() - .5) * 3, vy: Math.random() * 3, vz: (Math.random() - .5) * 3, life: .5, size: .07, col: [3, 2.2, .6], drag: 2, grav: 6, floor: .02 });
    } else { wedge.from = { x: d.x, z: d.z }; wedge.t = 0; wedge.back = true; showQuip(QUIPS.wedgeLate); sounds.hit(.7); }
  }

  // ---------- taps ----------
  function doorBox(d) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const ax = d.rot ? 0 : .5, az = d.rot ? .5 : 0;
    for (const s of [-1, 1]) for (const y of [0, 1.5]) {
      const [sx, sy] = v.toScreen(d.x + ax * s, y, d.z + az * s);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 4 };
  }
  const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  function ground(x, y) {
    ndc.set(x / W * 2 - 1, -(y / H * 2 - 1)); ray.setFromCamera(ndc, v.cam);
    const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -.01) return null;
    const k = -o.y / d.y; return { x: o.x + d.x * k, z: o.z + d.z * k };
  }
  const wedgeBtn = () => ({ x: W - 40, y: H - 40, r: 26 });
  function tap(x, y) {
    if (leaving || ended) return;
    const wb = wedgeBtn();
    if (wedge.state !== 'none' && Math.hypot(x - wb.x, y - wb.y) < wb.r + 6) { if (wedge.state === 'stuck') recall(); else if (wedge.state === 'hand') { const d = nearestOpen(); if (d) throwWedge(d); else showQuip(QUIPS.wedgeShut); } return; }
    // the Creative Director's room: tap the back wall to put a door there
    if (room.place && !doors.length) {
      const g = ground(x, y);   // a tap on the wall's face lands on the floor behind it
      if (g && cyOf(g.z) <= 0) return buildDoor(Math.max(1, Math.min(COLS - 2, cxOf(g.x))));
    }
    tapDoorOrFloor(x, y);
  }
  function buildDoor(cx) {    // the Creative Director's room: the door goes where you tapped
    grid[0][cx] = 'E'; nav.set(cx, 0, false);
    const d = placeDoor(0, 'E', cx, 0, { type: 'auto', label: 'EXIT', exit: true }); d.o = 0; doors.push(d);
    sounds.powerup(); haptic('success'); fx.shake(6); fx.flash('#ffffff', .25);
    for (let i = 0; i < 40; i++) sparks.emit({ x: d.x, y: .8, z: d.z + .3, vx: (Math.random() - .5) * 5, vy: Math.random() * 5, vz: Math.random() * 3, life: .8, size: .08, col: [.6, 3, 2.2], drag: 1.5, grav: 7, floor: .02 });
    showQuip('Door added. ' + room.done, 3);
    if (v.shadowsDirty) v.shadowsDirty();
  }

  function tapDoorOrFloor(x, y) {
    // doors first (they stand up out of the floor)
    let best = null, bz = -1e9;
    for (const d of doors) if (d.type !== 'cut' && inBox(doorBox(d), x, y) && d.z > bz) { bz = d.z; best = d; }
    if (best) {
      if (best.wedged && wedge.to === best && wedge.state === 'stuck') return recall();
      if (wedge.state === 'hand' && (best.o > .35 || best.type === 'paint')) return throwWedge(best);
      if (best.type === 'legal' && scrub < 1) showQuip('Rub the door to scrub the logo off.', 1.6);
      // walk up to it: the cell in front, on our side
      goTo(wx(best.cx), wz(best.cy));
      sounds.blip(); return;
    }
    const g = ground(x, y); if (g) { goTo(g.x, g.z); sounds.blip(.8); }
  }
  function nearestOpen() {
    let best = null, bd = 1e9;
    for (const d of doors) if (d.o > .35 && !d.wedged && d.type !== 'cut') { const dd = Math.hypot(P.x - d.x, P.z - d.z); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }

  // ---------- the camera ----------
  const EL = 1.02, fitPts = [[-1, 0, 1], [1, 0, 1], [-1, 1.5, -1], [1, 1.5, -1], [-1, 1.5, 1], [1, 1.5, 1]];
  let fitD = 14, fitOff = 0, hudTop = 50;
  function aim(x, z, d) {
    v.cam.aspect = W / H; v.cam.updateProjectionMatrix();
    v.cam.position.set(x, Math.sin(EL) * d, z + fitOff + Math.cos(EL) * d); v.cam.lookAt(x, 0, z + fitOff); v.cam.updateMatrixWorld();
  }
  function bounds(x, z, hx, hz) {
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (const [sx, y, sz] of fitPts) {
      tmp.set(x + sx * hx, y, z + sz * hz).project(v.cam);
      const px = (tmp.x + 1) / 2 * W, py = (1 - tmp.y) / 2 * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0, x1, y0, y1 };
  }
  function fitCamera(x, z, hx, hz) {
    const top = hudTop, bot = H - 6, side = 6;
    for (let pass = 0; pass < 2; pass++) {
      let lo = 3, hi = 60;
      for (let i = 0; i < 14; i++) {
        const d = (lo + hi) / 2; aim(x, z, d); const b = bounds(x, z, hx, hz);
        if (b.x0 < side || b.x1 > W - side || b.y1 - b.y0 > bot - top) lo = d; else hi = d;
      }
      fitD = hi; aim(x, z, fitD);
      // slide the view so the window sits between the HUD and the bottom
      const b = bounds(x, z, hx, hz), want = (top + bot) / 2, got = (b.y0 + b.y1) / 2;
      fitOff += (got - want) / Math.max(1, b.y1 - b.y0) * hz * 2 * .9;
      fitOff = Math.max(-6, Math.min(6, fitOff));
    }
    aim(x, z, fitD);
  }

  // ---------- the round ----------
  function signOff() {
    score++; api.score(score);
    time = Math.min(99, time + (loop ? 11 : 15));
    stamp = { dept: room.dept }; stampT = 1.6;
    sounds.win(); haptic('success'); fx.shake(4);
    showQuip(room.done, 3);
    nextT = .2;
  }
  function nextRoom() {
    let key;
    if (order.length) key = order.shift();
    else { loop++; order = LOOP.slice().sort(() => Math.random() - .5); order.push('cut'); key = order.shift(); }
    loadRoom(key);
    if (loop) memo.text = 'Revision ' + (loop + 1) + '. ' + memo.text;
    fade = 1;
  }

  function updateDoors(dt) {
    for (const d of doors) {
      if (d.cupT > 0) d.cupT -= dt;
      const want = wantOpen(d), inCell = cxOf(P.x) === d.cx && cyOf(P.z) === d.cy;
      // safety sensor: never close on anyone standing in the doorway (QA's door excepted, see below)
      const occupied = inCell || (B.on && cxOf(B.x) === d.cx && cyOf(B.z) === d.cy);
      const target = want || (occupied && !d.qa) ? 1 : 0;
      const sp = d.type === 'shy' && !want ? 7 : 3.2;
      const before = d.o;
      d.o += Math.sign(target - d.o) * Math.min(Math.abs(target - d.o), sp * dt);
      if ((before === 0 && d.o > 0) || (before === 1 && d.o < 1)) { noise(.35, { vol: .05, from: 2400, to: 500, filter: 'bandpass', q: 2 }); }
      // QA's door: stand in it and it tries to close on you
      if (d.qa) {
        if (inCell && d.o > .7) { qa.gag += dt; if (qa.gag > .6) { qa.stood += dt; d.sq = Math.max(0, Math.sin((qa.gag - .6) * 7)) * .5; if (d.sq > .45 && bonkT <= 0) { bonkT = .5; sounds.hit(1.3); haptic('light'); fx.shake(2); } } }
        else { qa.gag = 0; d.sq *= .8; }
      }
      // localisation: the wrong doors are cupboards, and a mop falls out of each
      if (d.type === 'loc' && !d.real && d.cupT <= 0 && !d.cool && Math.hypot(P.x - d.x, P.z - d.z) < 1.25) {
        d.cupT = 1.4; d.cool = true;
        mop.visible = true; mop.position.set(d.x, 0, d.z + .4); mop.rotation.set(0, 0, 0); mop.userData = { t: 0 };
        path = null; P.z = Math.max(P.z, d.z + 1.35); time = Math.max(0, time - 3);
        sounds.hurt(); haptic('heavy'); fx.shake(7);
        const [sx, sy] = v.toScreen(P.x, 1.2, P.z); fx.pop(sx, sy, '-3s', { color: '#ff8a9a' });
        showQuip(pickQuip('loc', null) + ' The exit is the ' + langPick + ' one.', 3);
      }
      if (d.type === 'loc' && d.cool && d.cupT <= 0 && Math.hypot(P.x - d.x, P.z - d.z) > 1.8) d.cool = false;
      // look
      const p = d.pool;
      if (d.type !== 'cut' && d.type !== 'paint') {
        p.slide.position.x = d.o * (1 - d.sq) * .88;
        const col = d.wedged ? matCache.amber : d.dull ? matCache.dull : d.type === 'shy' ? matCache.amber : locked(d) ? matCache.red : matCache.mint;
        p.lightMat.emissive.copy(col);
        p.lightMat.emissiveIntensity = d.hum ? Math.max(0, 1 - Math.hypot(P.x - d.x, P.z - d.z) / 2.6) * 3 : d.dull ? .4 : 2.2;
      }
    }
  }
  function updateBot(dt) {
    if (!B.on) return;
    if (!B.path) { B.wait -= dt; if (B.wait <= 0) { B.at = 1 - B.at; const s = B.stops[B.at]; const r = nav.path(B.x + COLS / 2, B.z + ROWS / 2, s.x + COLS / 2, s.z + ROWS / 2); B.path = r ? r.slice(1).map(p => ({ x: p.x - COLS / 2, z: p.y - ROWS / 2 })) : null; B.wait = 1.4; } }
    else {
      const tgt = B.path[0], dx = tgt.x - B.x, dz = tgt.z - B.z, l = Math.hypot(dx, dz), sp = 1.5 * dt;
      const ahead = l > .01 ? [cxOf(B.x + dx / l * .35), cyOf(B.z + dz / l * .35)] : [cxOf(B.x), cyOf(B.z)];
      const d = doorAt(ahead[0], ahead[1]);
      if (d && d.o < .6) { /* waits for its door */ }
      else if (l <= sp) { B.x = tgt.x; B.z = tgt.z; B.path.shift(); if (!B.path.length) B.path = null; }
      else { B.x += dx / l * sp; B.z += dz / l * sp; bot.rotation.y = Math.atan2(dx, dz); }
    }
    bot.position.set(B.x, 0, B.z); brush.rotation.y += dt * 14;
    beacon.material.emissiveIntensity = 2 + Math.sin(t * 8) * 2;
  }

  return {
    reset() {
      if (!v) setup();
      score = 0; time = 50; t = 0; loop = 0; ended = false;
      wedge = { state: 'none', t: 0, from: null, to: null, back: false };
      order = FIRST.slice(); fade = 1; stamp = null; stampT = 0; quip = null; quipT = 0; nextT = 0; warnT = 0;
      for (const d of doorPool) d.g.visible = false;
      loadRoom(order.shift());
      memo.text = 'Welcome to the Hollowell Door Assurance Lab. Every department must sign off every door. ' + memo.text;
      ptr = null; camLook = new THREE.Vector3(0, 0, -.1);
      sparks.clear(); fx.clear(); keys.clear();
    },
    resize(w, h) { W = w; H = h; },
    // keeps the round across hot reload (and lets tests open any room)
    snapshot() { return { room: roomKey, score, time, order: order.slice(), loop, wedge: wedge.issued ? 'hand' : 'none' }; },
    restore(s) {
      if (!s || !ROOMS[s.room]) return;
      score = s.score | 0; time = Number.isFinite(s.time) ? s.time : 50; loop = s.loop | 0;
      order = Array.isArray(s.order) ? s.order.filter(k => ROOMS[k]) : [];
      wedge = { state: s.wedge === 'hand' ? 'hand' : 'none', issued: s.wedge === 'hand', t: 0, from: null, to: null, back: false };
      loadRoom(s.room); api.score(score);
    },
    update(dt) {
      dt = Math.min(dt, .05);
      fx.update(dt); t += dt; roomT += dt; memoT += dt;
      if (!said) { said = true; say(memo.dept + '. ' + memo.voice, { pitch: .85, rate: 1.05, volume: .8 }); }
      if (quipT > 0) quipT -= dt; if (stampT > 0) stampT -= dt; if (bonkT > 0) bonkT -= dt;
      fade = Math.max(0, fade - dt * 2.5);
      if (!ended) {
        time -= dt;
        if (time < 10 && (warnT -= dt) <= 0) { warnT = 1; sounds.countdown && sounds.countdown(); }
        if (time <= 0) { time = 0; ended = true; say('Time. The committee will reconvene.', { pitch: .85 }); sounds.lose(); api.over(); return; }
      }

      // walking: path from taps, or the arrow keys
      const k = keys.axis(), sp = 3.1 * dt;
      if (leaving) {
        P.x += leaving[0] * 2 * dt; P.z += leaving[1] * 2 * dt; P.face = Math.atan2(leaving[0], leaving[1]);
        nextT -= dt; fade = Math.min(1, fade + dt * 3.5);
        if (nextT <= -.35) { leaving = null; nextRoom(); }
      } else if (k.x || k.y) { path = null; step(k.x * sp, k.y * sp); }
      else if (ptr && ptr.drag && (ptr.reT -= dt) <= 0) { ptr.reT = .15; const g = ground(ptr.x, ptr.y); if (g) goTo(g.x, g.z); }
      if (!leaving && path && path.length) {
        const tgt = path[0], dx = tgt.x - P.x, dz = tgt.z - P.z, l = Math.hypot(dx, dz);
        if (l <= sp) { if (step(dx, dz)) path.shift(); }
        else step(dx / l * sp, dz / l * sp);
        if (path && !path.length) path = null;
      }
      // items
      for (const it of items) {
        if (it.got || Math.hypot(P.x - it.x, P.z - it.z) > .6) continue;
        it.got = true;
        if (it.kind === 'key') { hasKey = true; keycard.getObjectByName('card').visible = false; sounds.powerup(); haptic('success'); showQuip('Keycard acquired. It says DOOR on it, for clarity.'); }
        else { gemsGot++; it.m.visible = false; sounds.coin(1 + gemsGot * .1); haptic('light'); const [sx, sy] = v.toScreen(it.x, 1, it.z); fx.pop(sx, sy, gemsGot + '/5 ◆', { color: '#ff9fd0' }); if (gemsGot === 5) { showQuip('Purchase complete. The door thanks you for your custom.'); sounds.levelup && sounds.levelup(); } }
        for (let i = 0; i < 16; i++) sparks.emit({ x: it.x, y: .6, z: it.z, vx: (Math.random() - .5) * 3, vy: Math.random() * 3, vz: (Math.random() - .5) * 3, life: .5, size: .07, col: it.kind === 'key' ? [.5, 3, 2] : [3, .6, 1.8], drag: 2, grav: 4 });
      }
      if (room.doors.E && room.doors.E.type === 'pay' && gemsGot < 5 && payT > 0) { payT -= dt; if (payT <= 0) showQuip('Your free door is ready. Thank you for your patience.'); }
      // QA's checklist: through, back, and stand in it
      const T = doors.find(d => d.qa);
      if (T && !qa.done) {
        const cy = cyOf(P.z), side = cy < T.cy ? 'n' : cy > T.cy ? 's' : null;
        if (side && side !== qa.side) { qa.side = side; qa.cross++; sounds.select(); haptic('tick'); }
        if (qa.cross >= 2 && qa.stood >= 2.2) { qa.done = true; sounds.levelup ? sounds.levelup() : sounds.win(); haptic('success'); showQuip('QA: all tests passed. The exit is unlocked.'); }
      }
      // the hum: faster and higher the closer the door
      const hd = doors.find(d => d.hum);
      if (hd) {
        const dd = Math.hypot(P.x - hd.x, P.z - hd.z);
        if ((humT -= dt) <= 0) { humT = .14 + dd * .09; sfx(170 + Math.max(0, 9 - dd) * 45, .07, 'sine', .07); if (dd < 6) haptic('tick'); }
      }
      updateDoors(dt); updateBot(dt); updateWedge(dt);
      // out through the exit
      if (!leaving && !ended) {
        const e = doors.find(d => d.exit && cxOf(P.x) === d.cx && cyOf(P.z) === d.cy && d.o > .7);
        if (e) { leaving = e.out[0] || e.out[1] ? e.out : [0, -1]; path = null; signOff(); }
      }
      if (mop.visible) { const u = mop.userData; u.t += dt; mop.rotation.x = Math.min(1.45, u.t * 4); if (u.t > 1.6) mop.visible = false; }
      for (const it of items) if (it.kind === 'gem' && !it.got) { it.m.rotation.y += dt * 2.4; it.m.position.y = .5 + Math.sin(t * 3 + it.x) * .08; }
      keycard.getObjectByName('card').rotation.y += dt * 2;
      sparks.update(dt);
    },
    draw(c) {
      // the walker
      player.position.set(P.x, path || leaving ? Math.abs(Math.sin(t * 11)) * .05 : 0, P.z);
      player.rotation.y += Math.atan2(Math.sin(P.face - player.rotation.y), Math.cos(P.face - player.rotation.y)) * .3;
      lamp.position.set(P.x, 1.6, P.z + .2);
      // camera: a window of the room round the walker (the whole room where the screen is big enough),
      // fitted between the HUD and the bottom edge at any shape
      const hx = Math.min(5.9, W / 2 / 30), hz = Math.min(4.9, (H - 60) / 2 / 26);
      const gx = Math.max(-(5.9 - hx), Math.min(5.9 - hx, P.x)), gz = Math.max(-(4.9 - hz), Math.min(4.9 - hz, P.z));
      camLook.x += (gx - camLook.x) * .08; camLook.z += (gz - camLook.z) * .08;
      // the memo box sits at the top: the room makes way for it, so no door hides under it
      const memoLen = memo.text.length / 60 + 3.5, showMemo = memoT < memoLen && !(quipT > 0);
      c.font = '500 12px Rubik, sans-serif';
      const mw = Math.min(W - 24, 440), lines = showMemo || quipT > 0 ? wrap(c, showMemo ? memo.text : quip, mw - 20).slice(0, 6) : [];
      const bh = lines.length ? 10 + lines.length * 15 + (showMemo ? 12 : 0) : 0;
      hudTop += ((bh ? 34 + bh + 26 : 50) - hudTop) * .1;
      fitCamera(camLook.x, camLook.z, hx, hz);
      fx.begin(c); v.render(c, W, H); fx.end(c, W, H);
      const font = (wt, px) => `${wt} ${px}px Rubik, sans-serif`;

      // door labels and the legal logo
      c.textAlign = 'center';
      for (const d of doors) {
        const [sx, sy0] = v.toScreen(d.x, 1.62, d.z), sy = d.word && d.ch !== 'A' && d.ch !== 'C' ? sy0 - 15 : sy0;
        let label = d.label || (d.word) || '';
        if (d.type === 'pay') label = gemsGot >= 5 || payT <= 0 ? 'EXIT · PAID' : `5 ◆ or wait ${Math.ceil(payT)}s`;
        if (d.hum) label = '';
        if (label) {
          c.font = font(700, 10); const w = c.measureText(label).width + 12;
          c.fillStyle = '#0d1115cc'; c.fillRect(sx - w / 2, sy - 9, w, 15);
          c.fillStyle = d.type === 'staff' ? RED : d.type === 'pay' ? '#ff9fd0' : '#e9fff7'; c.fillText(label, sx, sy + 2);
        }
        if (d.type === 'legal' && scrub < 1) {
          const b = doorBox(d), cx = (b.x0 + b.x1) / 2, cy = b.y0 + (b.y1 - b.y0) * .48, r = Math.min(b.x1 - b.x0, b.y1 - b.y0) * .3;
          c.globalAlpha = 1 - scrub;
          c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill();
          c.fillStyle = '#d12b4a'; c.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .38 : r * .82; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
          c.fill(); c.fillStyle = '#fff'; c.font = font(700, Math.max(7, r * .5)); c.fillText('™', cx + r * .95, cy - r * .7);
          c.globalAlpha = 1;
          c.fillStyle = '#0d1115aa'; c.fillRect(cx - 30, b.y1 + 4, 60, 6); c.fillStyle = MINT; c.fillRect(cx - 30, b.y1 + 4, 60 * scrub, 6);
        }
      }
      // the placement hint in the Creative Director's room
      if (room.place && !doors.length && roomT > 1.5) {
        const [sx, sy] = v.toScreen(0, 1.7, wz(0));
        c.globalAlpha = .55 + Math.sin(t * 5) * .35; c.fillStyle = MINT; c.font = font(700, 12); c.fillText('▼ tap the wall ▼', sx, sy - 4); c.globalAlpha = 1;
      }

      // HUD: time and doors signed
      c.textAlign = 'left'; c.font = font(700, 18);
      c.fillStyle = time < 10 && (t * 4 | 0) % 2 ? '#ff6070' : '#ffffffee'; c.fillText(Math.ceil(time) + 's', 12, 26);
      c.textAlign = 'right'; c.font = font(600, 12); c.fillStyle = '#e9fff7'; c.fillText('Doors signed off: ' + score, W - 12, 24);
      // the committee memo (or the latest remark)
      if (bh) {
        const bx = (W - mw) / 2, by = 34;
        const a = showMemo ? Math.min(1, (memoLen - memoT) * 2) : Math.min(1, quipT * 3);
        c.globalAlpha = a; c.fillStyle = '#0d1115d0'; c.fillRect(bx, by, mw, bh); c.fillStyle = MINT; c.fillRect(bx, by, 4, bh);
        c.textAlign = 'left'; let yy = by + 16;
        if (showMemo) { c.font = font(700, 9); c.fillStyle = MINT; c.fillText('MEMO · ' + memo.dept.toUpperCase(), bx + 12, yy); yy += 14; }
        c.font = font(500, 12); c.fillStyle = '#eef4f6';
        const shown = showMemo ? Math.floor(memoT * 60) : 1e9; let used = 0;
        for (const ln of lines) { c.fillText(ln.slice(0, Math.max(0, shown - used)), bx + 12, yy); used += ln.length; yy += 15; }
        c.globalAlpha = 1;
      }
      c.font = font(700, 9); c.fillStyle = '#9fdcc9'; c.textAlign = 'left'; if (!showMemo && !(quipT > 0)) { c.textAlign = 'right'; c.fillText(memo.dept.toUpperCase() + (room.loc ? ' · EXIT IS IN ' + langPick.toUpperCase() : ''), W - 12, 40); }
      // QA's checklist
      if (doors.some(d => d.qa)) {
        const items2 = [['Walk through the test door', qa.cross >= 1], ['Walk back through it', qa.cross >= 2], ['Stand in it until it gets upset', qa.stood >= 2.2]];
        c.font = font(600, 11); c.textAlign = 'left';
        items2.forEach(([s, ok], i) => { const y = H - 50 + i * 16; c.fillStyle = '#0d1115bb'; c.fillRect(8, y - 11, c.measureText('☐ ' + s).width + 10, 15); c.fillStyle = ok ? MINT : '#e9fff7'; c.fillText((ok ? '☑ ' : '☐ ') + s, 13, y); });
      }
      if (room.doors.E && room.doors.E.type === 'pay') { c.font = font(700, 13); c.textAlign = 'left'; c.fillStyle = '#ff9fd0'; c.fillText('◆ ' + gemsGot + ' / 5', 12, H - 16); }
      // the doorstop button
      if (wedge.state !== 'none') {
        const b = wedgeBtn();
        c.fillStyle = wedge.state === 'stuck' ? '#ffb340dd' : '#0d1115bb'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
        c.strokeStyle = '#ffc23a'; c.lineWidth = 2; c.stroke();
        c.fillStyle = wedge.state === 'stuck' ? '#0d1115' : '#ffc23a';
        c.beginPath(); c.moveTo(b.x - 12, b.y + 6); c.lineTo(b.x + 12, b.y + 6); c.lineTo(b.x + 12, b.y - 6); c.closePath(); c.fill();
        c.font = font(700, 8); c.textAlign = 'center'; c.fillStyle = '#ffe2a0';
        c.fillText(wedge.state === 'stuck' ? 'TAP: RECALL' : wedge.state === 'hand' ? 'DOORSTOP' : '…', b.x, b.y - b.r - 4);
      }
      // the sign-off stamp
      if (stampT > 0 && stamp) {
        const k = Math.min(1, (1.6 - stampT) * 6), s = 1.6 - k * .6;
        c.save(); c.translate(W / 2, H * .52); c.rotate(-.12); c.scale(s, s); c.globalAlpha = Math.min(1, stampT * 2);
        c.strokeStyle = MINT; c.lineWidth = 3; c.strokeRect(-92, -26, 184, 52);
        c.fillStyle = MINT; c.textAlign = 'center'; c.font = font(800, 22); c.fillText('SIGNED OFF', 0, 4);
        c.font = font(700, 10); c.fillText(stamp.dept.toUpperCase(), 0, 19);
        c.restore(); c.globalAlpha = 1;
      }
      if (fade > 0) { c.fillStyle = `rgba(13,17,21,${fade})`; c.fillRect(0, 0, W, H); }
    },
    down(x, y, id) {
      // rubbing Legal's door starts a scrub, anything else is a tap
      const ld = doors.find(d => d.type === 'legal');
      if (ld && scrub < 1 && inBox(doorBox(ld), x, y)) { ptr = { id, x, y, scrub: true, lx: x, ly: y }; return; }
      ptr = { id, x, y, sx: x, sy: y, drag: false, reT: 0 };
      tap(x, y);
    },
    move(x, y, pressed, id) {
      if (!pressed || !ptr || ptr.id !== id) return;
      if (ptr.scrub) {
        scrub = Math.min(1, scrub + Math.hypot(x - ptr.lx, y - ptr.ly) / 900); ptr.lx = x; ptr.ly = y;
        if (Math.random() < .25) { noise(.06, { vol: .04, from: 4000, to: 2500, filter: 'highpass' }); haptic('tick'); }
        if (scrub >= 1) { sounds.powerup(); haptic('success'); showQuip('Logo removed. Legal have gone for a lie-down.'); }
        return;
      }
      ptr.x = x; ptr.y = y;
      if (!ptr.drag && Math.hypot(x - ptr.sx, y - ptr.sy) > 14) ptr.drag = true;
    },
    up(x, y, id) { if (ptr && ptr.id === id) ptr = null; },
    key(k, d) {
      keys.key(k, d);
      if (d && (k === ' ' || k === 'Enter')) {
        if (room.place && !doors.length) return buildDoor(cxOf(P.x));
        if (wedge.state === 'stuck') recall(); else if (wedge.state === 'hand') { const o = nearestOpen(); if (o) throwWedge(o); }
      }
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'door-committee',
  title: 'Door Committee',
  tag: 'Next Gen · Puzzle',
  retro: true, era: 'nextgen', pal: 'grape',
  w: 300, h: 300, maxW: 600, maxH: 420,
  goal: 6, scoreMax: 80, scoreRate: 1,
  hint: 'Every department wants something different from the door: tap to walk, tap doors, and wedge the awkward ones open before the clock runs out. Inspired by Liz England\'s essay "The Door Problem".',
  creator: 'Rob',
  make,
};
