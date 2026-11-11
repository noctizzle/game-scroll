import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { rnd } = gs.util;
const { PAL } = gs.palettes;
const { Feel } = gs.effects; const { Ready } = gs.rounds;

// You run the lights at a crossroads. Tap to switch which road has green (there's a short amber
// in between). Cars stuck at a red too long lose patience. Three angry drivers and you're fired.
const P = PAL.ice, W = 160, H = 160, J0 = 66, J1 = 94, SPEED = 38;
// Lanes: dir vector, start point, and the stop line coordinate along the direction of travel.
const LANES = [
  { axis: 'ew', dx: 1, dy: 0, x: -8, y: 84, stop: J0 - 6 },
  { axis: 'ew', dx: -1, dy: 0, x: W + 8, y: 76, stop: J1 + 6 },
  { axis: 'ns', dx: 0, dy: 1, x: 74, y: -8, stop: J0 - 6 },
  { axis: 'ns', dx: 0, dy: -1, x: 86, y: H + 8, stop: J1 + 6 },
];

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready();                                            // traffic starts on the first tap
  let cars, green, amber, score, angry, t, spawn, honks;
  const pos = c => c.lane.dx ? c.x : c.y;
  const ahead = (c, o) => (pos(o) - pos(c)) * (c.lane.dx || c.lane.dy);
  return {
    reset() { cars = []; green = 'ew'; amber = 0; score = 0; angry = 0; t = 0; spawn = 1; honks = []; feel.clear(); ready.reset(); },
    fx(dt) { feel.update(dt); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; spawn -= dt;
      if (amber > 0) { amber -= dt; if (amber <= 0) green = green === 'ew' ? 'ns' : 'ew'; }
      if (spawn <= 0) {
        spawn = Math.max(.55, 1.6 - t / 45) * rnd(.7, 1.3);
        const lane = LANES[Math.random() * 4 | 0];
        if (!cars.some(c => c.lane === lane && Math.abs(pos(c) - (lane.dx ? lane.x : lane.y)) < 16)) cars.push({ lane, x: lane.x, y: lane.y, wait: 0, mad: false, v: SPEED });
      }
      for (const c of cars) {
        const L = c.lane, p = pos(c), dir = L.dx || L.dy, toStop = (L.stop - p) * dir;
        const red = amber > 0 || green !== L.axis;
        let go = !(red && toStop > -1 && toStop < 3);
        for (const o of cars) if (o !== c && o.lane === L) { const a = ahead(c, o); if (a > 0 && a < 13) go = false; }
        c.v = go ? Math.min(SPEED, c.v + 80 * dt) : 0;
        c.x += L.dx * c.v * dt; c.y += L.dy * c.v * dt;
        if (!go && red && toStop > -1) {
          c.wait += dt;
          if (c.wait > 7 && !c.mad) { c.mad = true; angry++; haptic('error'); sfx(330, .3, 'square', .05); honks.push({ x: c.x, y: c.y, l: 1 }); feel.juice.shake(2); if (angry >= 3) return api.over(); }
        } else if (go) c.wait = Math.max(0, c.wait - dt * 2);
      }
      // crash check inside the junction (cars on crossing roads overlapping)
      const inJ = cars.filter(c => c.x > J0 - 4 && c.x < J1 + 4 && c.y > J0 - 4 && c.y < J1 + 4);
      for (const a of inJ) for (const b of inJ) if (a.lane.axis === 'ew' && b.lane.axis === 'ns' && Math.abs(a.x - b.x) < 7 && Math.abs(a.y - b.y) < 7) { haptic('heavy'); sfx(80, .5, 'square', .06, -20); feel.juice.shake(5).burst((a.x + b.x) / 2, (a.y + b.y) / 2, { n: 14, speed: 70, life: .5, size: 2, color: [P[0], P[3]] }); return api.over(); }
      const before = cars.length; cars = cars.filter(c => c.x > -20 && c.x < W + 20 && c.y > -20 && c.y < H + 20);
      if (cars.length < before) { score += before - cars.length; api.score(score); haptic('tick'); }
      for (const h of honks) h.l -= dt; honks = honks.filter(h => h.l > 0);
    },
    draw(c) {
      c.fillStyle = P[2]; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = P[1]; c.fillRect(0, 70, W, 20); c.fillRect(70, 0, 20, H);
      c.fillStyle = P[3]; for (let i = 0; i < W; i += 10) { if (i < 62 || i > 96) { c.fillRect(i, 79, 5, 1); c.fillRect(79, i, 1, 5); } }
      // stop lines + lights
      const lamp = (x, y, axis) => { const on = amber > 0 ? 'amber' : green === axis ? 'go' : 'stop'; c.fillStyle = P[0]; c.fillRect(x - 3, y - 3, 7, 7); c.fillStyle = on === 'go' ? P[3] : on === 'amber' ? P[2] : P[1]; c.fillRect(x - 1, y - 1, 3, 3); };
      lamp(58, 94, 'ew'); lamp(102, 66, 'ew'); lamp(66, 58, 'ns'); lamp(94, 102, 'ns');
      for (const car of cars) {
        const horiz = !!car.lane.dx; c.fillStyle = car.mad ? P[3] : P[0];
        c.fillRect(Math.round(car.x) - (horiz ? 5 : 3), Math.round(car.y) - (horiz ? 3 : 5), horiz ? 10 : 6, horiz ? 6 : 10);
        if (car.wait > 4 && !car.mad && (t * 6 | 0) % 2) { c.fillStyle = P[3]; c.fillRect(Math.round(car.x) - 1, Math.round(car.y) - 1, 2, 2); }
      }
      for (const h of honks) { c.fillStyle = P[0]; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('HONK', h.x, h.y - 8 - (1 - h.l) * 6); }
      feel.end(c, W, H);
      ready.draw(c, W, H, { pixel: true, color: P[0], y: 40, text: 'TAP TO START' });
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = P[0]; c.fillText(amber > 0 ? 'AMBER' : green === 'ew' ? 'GO: <>' : 'GO: ^v', 4, 10);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < angry ? P[3] : P[0]; c.fillRect(W - 10 - i * 8, 4, 5, 5); }
      if (t < 4) { c.fillStyle = P[0]; c.fillText('TAP TO SWITCH', 4, 154); }
    },
    down() { if (ready.go() || amber > 0) return; amber = .9; haptic('medium'); sfx(520, .05, 'square', .03); },
    key(k, d) { if (d && k === ' ') this.down(); },
  };
}

export default {
  id: 'traffic-light', title: 'Traffic Light', tag: 'Pocket · Strategy', retro: true, w: W, h: H, pal: 'ice', goal: 40,
  hint: 'Tap to switch the green light between the two roads. There is a short amber in between. Keep queues moving: three drivers left waiting too long and you are out.',
  make,
};
