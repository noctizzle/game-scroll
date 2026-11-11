// A pretend NativeAR plugin for the test browser (scripts/ar-floor.cjs): it stands in for ARCore / ARKit,
// so the AR kit's world mode (floor finding, hit tests, surfaces) can be played without a phone.
// Injected before the app loads. The "room" is in native space: y = 0 is where the phone was when
// the session began, as on a phone. Change window.__ar from the test to set a scene up.
(() => {
  window.CapacitorCustomPlatform = { name: 'fake-ar' };   // a native platform as far as Capacitor can tell
  const listeners = {};
  const emit = (ev, d) => { for (const cb of listeners[ev] || []) cb(JSON.parse(JSON.stringify(d))); };
  const S = window.__ar = {
    running: false, starts: 0, stops: 0, hitCalls: 0, t: 0, pointsOn: false,
    phone: { x: 0, y: 0, z: 0, yaw: 0, pitch: -.55 },   // radians; pitch below 0 looks down
    sway: .2,                 // the player moves the phone this far from side to side, metres
    tracking: 'TRACKING', why: 'NONE',
    planes: [],               // mapped surfaces: { id, x, y, z, w, d, kind }
    pointHit: null,           // rays that pass near a feature point: { y, chance, noise }
    cloud: [],                // feature points in the room: { x, y, z }
    cloudNoise: .012,
    picture: false,           // draw the pretend camera picture (for screenshots)
    firstHitOnly: false,      // the older plugin answered with the nearest hit only
    sendPoints: true,         // the older plugin sent no feature points
    light: { intensity: .5, color: [1, 1, 1] },
    room: { floor: -1.3, boxes: [] },   // what the pretend camera shows: the real floor, and boxes { x, z, w, d, top } (tables, sofas)
    rng: (s => () => ((s = Math.imul(s ^ s >>> 15, 2246822507) ^ Math.imul(s ^ s >>> 13, 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296))(12345),
  };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += S.rng(); return (u - 3) / .7071; };
  const FOV = 60 * Math.PI / 180;
  const where = () => ({ x: S.phone.x + Math.sin(S.t * 1.7) * S.sway, y: S.phone.y, z: S.phone.z });
  const turn = () => {
    const a = S.phone.yaw + Math.sin(S.t * 1.1) * .12, p = S.phone.pitch, c = Math.cos(a), s = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    return [[c, 0, -s], [s * sp, cp, c * sp], [s * cp, -sp, c * cp]];   // the camera's x, y and z axes in the room
  };
  const pose = () => { const R = turn(), o = where(); return [...R[0], 0, ...R[1], 0, ...R[2], 0, o.x, o.y, o.z, 1]; };
  const proj = () => { const f = 1 / Math.tan(FOV / 2), a = innerWidth / innerHeight, n = .05, fa = 100; return [f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; };
  const flat = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
  function rayAt(px, py) {
    const f = 1 / Math.tan(FOV / 2), a = innerWidth / innerHeight, R = turn();
    const cx = (px / innerWidth * 2 - 1) * a / f, cy = (1 - py / innerHeight * 2) / f, cz = -1;
    const d = [0, 1, 2].map(i => R[0][i] * cx + R[1][i] * cy + R[2][i] * cz), l = Math.hypot(...d);
    return { o: where(), d: d.map(v => v / l) };
  }
  function hits(px, py) {
    const { o, d } = rayAt(px, py), out = [];
    if (d[1] < -.02) {
      for (const p of S.planes) {
        const t = (p.y - o.y) / d[1]; if (t <= 0) continue;
        const x = o.x + d[0] * t, z = o.z + d[2] * t;
        if (Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2) out.push({ t, kind: 'plane', pose: flat(x, p.y, z), ...(p.kind ? { surface: p.kind } : {}) });
      }
      const ph = S.pointHit;
      if (ph && S.rng() < ph.chance) {
        const y = ph.y + gauss() * (ph.noise || 0), t = (y - o.y) / d[1];
        if (t > 0) out.push({ t, kind: 'point', pose: flat(o.x + d[0] * t, y, o.z + d[2] * t) });
      }
    }
    out.sort((a, b) => a.t - b.t);
    return (S.firstHitOnly ? out.slice(0, 1) : out).map(({ t, ...h }) => h);
  }
  function seen() {   // the feature points in view now, a little noisy, as x, y, z triples in millimetres
    const R = turn(), o = where(), out = [];
    for (const p of S.cloud) {
      const x = p.x - o.x, y = p.y - o.y, z = p.z - o.z, l = Math.hypot(x, y, z) || 1;
      if (-(R[2][0] * x + R[2][1] * y + R[2][2] * z) / l < .78 || l > 6) continue;   // outside the picture
      const k = S.cloudNoise * (1 + l * .5);
      out.push(Math.round((p.x + gauss() * k) * 1000), Math.round((p.y + gauss() * k) * 1000), Math.round((p.z + gauss() * k) * 1000));
    }
    return out;
  }
  // The pretend camera picture, behind the see-through page: a plank floor at the room's real floor
  // height and any boxes, drawn with the same pose and lens the plugin reports. Screenshots then show
  // whether the kit's 3D really sits on the "real" floor.
  let cam = null;
  function picture() {
    if (!cam) { cam = document.createElement('canvas'); cam.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1'; document.body?.prepend(cam); }
    if (!cam.isConnected) { document.body?.prepend(cam); if (!cam.isConnected) return; }
    const W = cam.width = innerWidth, H = cam.height = innerHeight, g = cam.getContext('2d'), R = turn(), o = where(), f = 1 / Math.tan(FOV / 2), a = W / H;
    const to = (x, y, z) => { x -= o.x; y -= o.y; z -= o.z; const cx = R[0][0] * x + R[0][1] * y + R[0][2] * z, cy = R[1][0] * x + R[1][1] * y + R[1][2] * z, cz = R[2][0] * x + R[2][1] * y + R[2][2] * z; return cz > -.08 ? null : [(cx * f / a / -cz + 1) / 2 * W, (1 - cy * f / -cz) / 2 * H]; };
    const hz = (1 - Math.tan(-S.phone.pitch) * f) / 2 * H;   // the horizon line
    const wall = g.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, '#cfc8bb'); wall.addColorStop(1, '#a89f90'); g.fillStyle = wall; g.fillRect(0, 0, W, H);
    g.fillStyle = '#8a6a48'; g.fillRect(0, Math.max(0, hz), W, H);
    const line = (x0, y0, z0, x1, y1, z1, n = 24) => { let last = null; g.beginPath(); for (let i = 0; i <= n; i++) { const p = to(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, z0 + (z1 - z0) * i / n); if (p && last) { g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); } last = p; } g.stroke(); };
    const fy = S.room.floor; g.strokeStyle = '#5b4126'; g.lineWidth = 1.5;
    for (let x = -6; x <= 6; x += .25) line(x, fy, -10, x, fy, 3);
    g.strokeStyle = '#6b4c2c'; g.lineWidth = 1; for (let z = -10; z <= 3; z += 1.5) line(-6, fy, z, 6, fy, z);
    for (const b of S.room.boxes) {
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, t = b.top;
      const quad = (pts, col) => { const q = pts.map(p => to(...p)); if (q.some(p => !p)) return; g.fillStyle = col; g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
      quad([[x0, fy, z1], [x1, fy, z1], [x1, t, z1], [x0, t, z1]], '#3d4d66'); quad([[x0, fy, z0], [x0, fy, z1], [x0, t, z1], [x0, t, z0]], '#34425a'); quad([[x1, fy, z0], [x1, fy, z1], [x1, t, z1], [x1, t, z0]], '#34425a');
      quad([[x0, t, z0], [x1, t, z0], [x1, t, z1], [x0, t, z1]], '#51668a');
    }
  }
  let frameTimer = 0, planeTimer = 0;
  const frame = () => { S.t += 1 / 30; if (S.picture) picture(); emit('frame', { t: S.t * 1000, tracking: S.tracking, why: S.why, pose: pose(), proj: proj(), light: S.light }); };
  const planes = () => {
    const d = { planes: S.tracking === 'TRACKING' ? S.planes.map(p => ({ id: p.id, pose: flat(p.x, p.y, p.z), w: p.w, d: p.d, ...(p.kind ? { kind: p.kind } : {}) })) : [] };
    if (S.sendPoints && S.pointsOn && S.tracking === 'TRACKING') d.points = seen();
    emit('planes', d);
  };
  const methods = {
    available: () => ({ supported: true, installed: true, status: 'SUPPORTED_INSTALLED' }),
    start() { S.running = true; S.starts++; clearInterval(frameTimer); clearInterval(planeTimer); frameTimer = setInterval(frame, 33); planeTimer = setInterval(planes, 250); return { started: true }; },
    stop() { S.running = false; S.stops++; S.pointsOn = false; clearInterval(frameTimer); clearInterval(planeTimer); cam?.remove(); return {}; },
    hitTest({ x, y }) { S.hitCalls++; return { hits: S.running ? hits(x, y) : [] }; },
    points({ on }) { if (!S.sendPoints) throw new Error('not implemented'); S.pointsOn = !!on; return {}; },
  };
  window.Capacitor = {
    PluginHeaders: [{ name: 'NativeAR', methods: [...Object.keys(methods).map(name => ({ name, rtype: 'promise' })), { name: 'addListener' }, { name: 'removeListener' }] }],
    nativePromise: (plugin, method, opts) => new Promise((ok, no) => setTimeout(() => { try { ok(methods[method](opts || {})); } catch (e) { no(e); } }, 4)),
    nativeCallback(plugin, method, opts, cb) { if (method === 'addListener') (listeners[opts.eventName] ||= []).push(cb); return Promise.resolve('fake'); },
  };
})();
