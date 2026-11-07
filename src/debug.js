// Debug overlay for game makers. Only in dev and test builds (`npm run dev`, --mode bundled); the
// store apps never turn it on.
//
//   `  (backquote) or F2   overlay on / off   (or __gs.debug() in the console, or ?debug in the URL)
//   [  ]                   slower / faster: 0.1x, 0.25x, 0.5x, 1x, 2x
//   P                      pause the game
//   .                      while paused: step one frame (1/60 s)
//   H                      hitboxes on / off (draws your game's debug(c) hook)
//
// The panel shows frames per second, how long update() and draw() take, the game's size, score and
// state. Hitboxes: give your game object a debug(c) method that outlines whatever you like, in game
// units (physics2d's world.debugDraw(c) outlines every body); it's drawn on top while H is on.
const SPEEDS = [.1, .25, .5, 1, 2];

export function makeDebug() {
  const D = { on: false, boxes: true, speed: 3, paused: false, steps: 0, el: null, fps: 60, upd: 0, drw: 0, lastPaint: 0 };
  const panel = () => {
    if (D.el) return D.el;
    const el = document.createElement('div');
    el.className = 'gs-debug';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:12px/1.35 ui-monospace,Menlo,monospace;color:#d8ffe0;background:#000c;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre;min-width:180px';
    document.body.appendChild(el);
    return D.el = el;
  };
  D.toggle = (v = !D.on) => { D.on = v; panel().style.display = v ? '' : 'none'; if (!v) { D.paused = false; D.speed = 3; } return v; };
  addEventListener('keydown', e => {
    if (e.key === '`' || e.key === 'F2') { D.toggle(); e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!D.on) return;
    const k = e.key.toLowerCase(); let used = true;
    if (k === '[') D.speed = Math.max(0, D.speed - 1);
    else if (k === ']') D.speed = Math.min(SPEEDS.length - 1, D.speed + 1);
    else if (k === 'p') D.paused = !D.paused;
    else if (k === '.') { D.paused = true; D.steps++; }
    else if (k === 'h') D.boxes = !D.boxes;
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  /** The game's dt this frame, and whether update() should run at all. */
  D.time = dt => {
    if (!D.on) return { dt, run: true };
    if (D.paused) { if (D.steps > 0) { D.steps--; return { dt: 1 / 60, run: true }; } return { dt: 0, run: false }; }
    return { dt: dt * SPEEDS[D.speed], run: true };
  };
  /** After the frame is painted: hitboxes and the stats panel. */
  D.after = (s, upd, drw, now) => {
    if (!D.on) return;
    if (D.lastPaint) D.fps = D.fps * .92 + (1000 / Math.max(1, now - D.lastPaint)) * .08;
    D.lastPaint = now; D.upd = D.upd * .9 + upd * .1; D.drw = D.drw * .9 + drw * .1;
    if (D.boxes && s.game.debug) { const c = s.ctx; c.save(); try { s.game.debug(c); } catch (e) { console.warn('[debug]', e); } c.restore(); }
    panel().textContent =
      `${s.def.id}  ${s.state}${D.paused ? '  PAUSED' : ''}\n` +
      `fps ${D.fps.toFixed(0).padStart(3)}   speed ${SPEEDS[D.speed]}x\n` +
      `update ${D.upd.toFixed(2)} ms  draw ${D.drw.toFixed(2)} ms\n` +
      `size ${s.w}x${s.h}  score ${s.score}${s.def.goal ? '/' + s.def.goal : ''}\n` +
      `hitboxes ${s.game.debug ? (D.boxes ? 'on' : 'off') : '(add debug(c))'}\n` +
      '[ ] speed  P pause  . step  H boxes';
  };
  if (/[?&]debug\b/.test(location.search)) D.toggle(true);
  return D;
}
