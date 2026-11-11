// Stylus Rally: you don't steer the rally car, you draw its line. Ink a path up the winding gravel road
// and the car follows it, as fast as the bends allow. Grass slows it, barrels spin it out. Reach each
// checkpoint before the clock runs down.
import gs from '../gamescroll.js';
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;
const { clamp, rnd } = gs.util;
const { angleDiff } = gs.math;

let W = 176, H = 240;
const ROAD = 34, CP = 1400;

function make(api) {
  const feel = new Feel({ pixel: true });
  const ready = new Ready({ eat: false });                              // the car and the clock wait for the first line
  let car, ink, drawing, cam, time, score, dist, nextCp, barrels, nextB, t, spin, dead, dust, tyre;
  const cx = y => W / 2 + Math.sin(y * .0042) * (W * .2) + Math.sin(y * .011 + 1) * (W * .07);
  const onRoad = (x, y) => Math.abs(x - cx(y)) < ROAD;

  return {
    reset() {
      car = { x: cx(0), y: 0, a: -Math.PI / 2, v: 0 };
      ink = []; drawing = false; cam = -H * .75; time = 16; score = 0; dist = 0; nextCp = -CP; barrels = []; nextB = -300; t = 0; spin = 0; dead = 0; dust = []; tyre = [];
      feel.clear(); ready.reset();
    },
    resize(w, h) { W = w; H = h; },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt) || feel.frozen) return;
      t += dt;
      if (dead) { dead += dt; if (dead > 1.2) api.over(); return; }
      time -= dt;
      if (time <= 0) { dead = .01; feel.lose(); haptic('error'); return; }
      // follow the ink: drop points the car has passed, steer at the next one
      while (ink.length && (Math.hypot(ink[0][0] - car.x, ink[0][1] - car.y) < 10 || ink[0][1] > car.y + 4)) ink.shift();
      let want = car.a;
      if (ink.length) want = Math.atan2(ink[0][1] - car.y, ink[0][0] - car.x);
      const road = onRoad(car.x, car.y);
      if (spin > 0) { spin -= dt; car.a += 12 * dt; car.v *= Math.pow(.96, dt * 60); }
      else {
        const d = angleDiff(car.a, want), turn = clamp(d, -3.2 * dt, 3.2 * dt); car.a += turn;
        // tight bends slow it: speed limit from how much it is turning
        const top = (road ? 165 : 70) * (1 - Math.min(.55, Math.abs(d) * .5));
        car.v += (top - car.v) * Math.min(1, dt * (car.v < top ? 1.6 : 4));
      }
      car.x += Math.cos(car.a) * car.v * dt; car.y += Math.sin(car.a) * car.v * dt;
      car.x = clamp(car.x, 4, W - 4);
      if (car.y > cam + H + 10) car.y = cam + H + 10;
      cam = Math.min(cam, car.y - H * .72);
      if (!road && car.v > 40 && Math.random() < dt * 30) { dust.push({ x: car.x, y: car.y, l: .5, c: '#6a4a2a' }); if (Math.random() < .2) haptic('tick'); }
      if (road && car.v > 120 && Math.random() < dt * 20) dust.push({ x: car.x - Math.cos(car.a) * 6, y: car.y - Math.sin(car.a) * 6, l: .4, c: '#d8c8a0' });
      if (Math.random() < dt * 30) tyre.push({ x: car.x, y: car.y, l: 3 });
      // distance and checkpoints
      const dd = Math.floor(-car.y / 200); if (dd > dist) { score += dd - dist; dist = dd; api.score(score); }
      if (car.y < nextCp) { nextCp -= CP; time += 12; score += 5; api.score(score); feel.powerup(car.x, car.y - cam); feel.juice.pop(car.x, car.y - cam - 16, '+12 SEC', { color: '#f8e040' }); sounds.levelup(); haptic('success'); }
      // barrels on the road
      while (nextB > cam - H) { if (Math.random() < .7) { const y = nextB; barrels.push({ x: cx(y) + rnd(-ROAD + 8, ROAD - 8), y }); } nextB -= rnd(90, 170); }
      for (const b of barrels) if (!b.hit && Math.hypot(b.x - car.x, b.y - car.y) < 9) { b.hit = true; spin = .6; car.v *= .5; feel.hit(car.x, car.y - cam, { power: .7 }); haptic('warning'); time -= 1; }
      barrels = barrels.filter(b => b.y < cam + H + 20);
      for (const d of dust) d.l -= dt; dust = dust.filter(d => d.l > 0);
      for (const r of tyre) r.l -= dt; tyre = tyre.filter(r => r.l > 0);
      if (time < 5 && Math.floor(time + dt) !== Math.floor(time)) sfx(990, .05, 'square', .03);
      if (Math.random() < dt * 8) sfx(60 + car.v * .5, .05, 'sawtooth', .012);
    },
    draw(c) {
      const top = Math.floor(cam);
      c.fillStyle = '#58a038'; c.fillRect(0, 0, W, H);
      // grass speckle and road, row by row
      for (let sy = 0; sy < H; sy += 2) {
        const wy = top + sy, x = cx(wy);
        c.fillStyle = (Math.floor(wy / 16) & 1) ? '#c8b088' : '#bca47c'; c.fillRect(Math.round(x - ROAD), sy, ROAD * 2, 2);
        c.fillStyle = (Math.floor(wy / 8) & 1) ? '#e04040' : '#f8f8f0'; c.fillRect(Math.round(x - ROAD) - 3, sy, 3, 2); c.fillRect(Math.round(x + ROAD), sy, 3, 2);
        if (((wy * 7919) & 31) === 0) { c.fillStyle = '#48882c'; c.fillRect(((wy * 31) % W + W) % W, sy, 2, 2); }
      }
      // checkpoint banner
      const cpy = Math.round(nextCp - top);
      if (cpy > -10 && cpy < H) { const x = cx(nextCp); c.fillStyle = '#3858d8'; c.fillRect(Math.round(x - ROAD - 4), cpy - 3, 4, 10); c.fillRect(Math.round(x + ROAD), cpy - 3, 4, 10); for (let i = 0; i < ROAD * 2; i += 4) { c.fillStyle = (i / 4 & 1) ? '#101018' : '#f8f8f0'; c.fillRect(Math.round(x - ROAD) + i, cpy - 3, 4, 4); } }
      feel.begin(c);
      for (const r of tyre) { c.fillStyle = `rgba(80,60,40,${r.l / 6})`; c.fillRect(Math.round(r.x) - 1, Math.round(r.y - top), 2, 2); }
      for (const b of barrels) { const x = Math.round(b.x), y = Math.round(b.y - top); c.fillStyle = b.hit ? '#784020' : '#d86020'; c.fillRect(x - 4, y - 4, 8, 8); c.fillStyle = '#f8f8f0'; c.fillRect(x - 4, y - 1, 8, 2); }
      // ink
      c.fillStyle = '#3858d8'; for (const p of ink) c.fillRect(Math.round(p[0]) - 1, Math.round(p[1] - top) - 1, 2, 2);
      for (const d of dust) { c.fillStyle = d.c; c.globalAlpha = d.l * 2; c.fillRect(Math.round(d.x) - 2, Math.round(d.y - top) - 2, 4, 4); } c.globalAlpha = 1;
      // the car, turned toward where it drives (8 directions, pixel art)
      const x = Math.round(car.x), y = Math.round(car.y - top);
      c.save(); c.translate(x, y); c.rotate(Math.round((car.a + Math.PI / 2) / (Math.PI / 8)) * (Math.PI / 8));
      c.fillStyle = '#101018'; c.fillRect(-5, -6, 2, 4); c.fillRect(3, -6, 2, 4); c.fillRect(-5, 3, 2, 4); c.fillRect(3, 3, 2, 4);
      c.fillStyle = '#e04040'; c.fillRect(-4, -8, 8, 16); c.fillStyle = '#f8d838'; c.fillRect(-4, -1, 8, 2);
      c.fillStyle = '#88c8f0'; c.fillRect(-3, -5, 6, 3); c.fillStyle = '#f8f8f0'; c.fillRect(-3, -8, 2, 1); c.fillRect(1, -8, 2, 1);
      c.restore();
      feel.end(c, W, H);
      c.fillStyle = '#101018c0'; c.fillRect(0, H - 14, W, 14);
      text(c, `TIME ${Math.max(0, time).toFixed(1)}`, 4, H - 10, { color: time < 5 ? '#f84040' : '#f8f8f0' });
      text(c, `CP ${Math.floor(-nextCp / CP)}`, W - 4, H - 10, { color: '#f8e040', align: 'right' });
      if (ready.playing && t < 3.5) text(c, 'DRAW THE RACING LINE', W / 2, Math.round(H * .35), { align: 'center', color: '#f8f8f0', outline: '#101018' });
      ready.draw(c, W, H, { text: 'DRAW A LINE TO START', pixel: true, color: '#f8f8f0', shadow: '#101018', y: Math.round(H * .35) });
      if (dead) text(c, 'OUT OF TIME', W / 2, H * .4, { font: 'big', align: 'center', color: '#f84040', outline: '#101018' });
    },
    down(x, y) { ready.go(); drawing = true; ink = [[x, y + cam]]; sfx(1200, .02, 'square', .02); },
    move(x, y, p) {
      if (!p || !drawing) return;
      const wy = y + cam, last = ink[ink.length - 1];
      if (!last || Math.hypot(x - last[0], wy - last[1]) > 4) { ink.push([x, wy]); if (ink.length > 400) ink.shift(); }
    },
    up() { drawing = false; },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'stylus-rally',
  title: 'Stylus Rally',
  tag: 'Advance · Racing',
  retro: true, era: 'advance', pal: 'grape',
  w: 176, h: 240, maxW: 240, maxH: 300,
  goal: 60,
  hint: 'Draw a line up the road and the rally car follows it. Keep it on the gravel, miss the barrels, and reach each checkpoint in time.',
  make,
};
