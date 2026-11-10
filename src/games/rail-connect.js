// Rail Connect: the little train leaves the left station when the clock hits zero. Drag from the
// station to lay track square by square, round the trees and ponds, to the station on the right.
// Pass the post offices on the way for bonus points. Drag back over track to pick it up. You can keep
// laying track ahead of a moving train, but if it runs off the end it derails.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { C16 } = gs.palettes;
const { text } = gs.pixel;
const { haptic } = gs.device;
const { sfx, notes, noise } = gs.sound;

let W = 160, H = 192;
const GX = 9, GY = 9;

function make(api) {
  const feel = new Feel({ pixel: true });
  let grid, start, end, route, budget, count, train, level, score, lives, t, banner, drawing, puffs, posts;
  const geo = () => { const s = Math.floor(Math.min((W - 6) / GX, (H - 30) / GY)), x = Math.round((W - s * GX) / 2), y = Math.round(16 + (H - 24 - s * GY) / 2); return { s, x, y }; };
  const ck = (x, y) => y * GX + x;

  function newMap() {
    for (let tries = 0; tries < 100; tries++) {
      grid = new Array(GX * GY).fill(0);   // 0 grass, 1 tree, 2 water, 3 post office
      start = [0, 1 + Math.random() * (GY - 2) | 0]; end = [GX - 1, 1 + Math.random() * (GY - 2) | 0];
      const blocks = 10 + level * 3;
      for (let i = 0; i < blocks; i++) { const x = 1 + Math.random() * (GX - 2) | 0, y = Math.random() * GY | 0; grid[ck(x, y)] = Math.random() < .6 ? 1 : 2; }
      // a pond as a block
      if (level > 1) { const px = 2 + Math.random() * (GX - 5) | 0, py = Math.random() * (GY - 2) | 0; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) grid[ck(px + a, py + b)] = 2; }
      grid[ck(...start)] = 0; grid[ck(...end)] = 0;
      // check there's a way through (BFS) and how long it is
      const dist = new Array(GX * GY).fill(-1), q = [ck(...start)]; dist[q[0]] = 0;
      while (q.length) { const c = q.shift(), x = c % GX, y = c / GX | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, n = ck(nx, ny); if (nx < 0 || ny < 0 || nx >= GX || ny >= GY || dist[n] >= 0 || grid[n] === 1 || grid[n] === 2) continue; dist[n] = dist[c] + 1; q.push(n); } }
      const d = dist[ck(...end)]; if (d < 0) continue;
      posts = []; for (let i = 0; i < 2 + (level > 2 ? 1 : 0); i++) { const x = 2 + Math.random() * (GX - 4) | 0, y = Math.random() * GY | 0; if (grid[ck(x, y)] === 0 && dist[ck(x, y)] >= 0) { grid[ck(x, y)] = 3; posts.push(ck(x, y)); } }
      budget = d + 1 + 8; break;
    }
    route = [ck(...start)]; count = Math.max(6, 14 - level); train = null; puffs = [];
    banner = { txt: `LINE ${level}`, l: 1 };
  }
  function crash(why) {
    lives--; feel.boom(trainXY()[0], trainXY()[1], { size: .7 }); haptic('error'); noise(.5, { vol: .15, from: 1500, to: 60 });
    banner = { txt: why, sub: lives > 0 ? `${lives} TRAINS LEFT` : '', l: 1.6, next: lives > 0 ? 'again' : 'over' };
  }
  function trainXY() { const { s, x, y } = geo(); if (!train) return [x, y]; const i = Math.min(route.length - 1, Math.floor(train.p)), j = Math.min(route.length - 1, i + 1), f = train.p - i; const a = route[i], b = route[j]; return [x + ((a % GX) + ((b % GX) - (a % GX)) * f) * s + s / 2, y + ((a / GX | 0) + ((b / GX | 0) - (a / GX | 0)) * f) * s + s / 2]; }

  const game = {
    reset() { level = 1; score = 0; lives = 3; t = 0; drawing = false; feel.clear(); newMap(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.next === 'over') return api.over(); if (b.next === 'win') { level++; newMap(); } if (b.next === 'again') newMap(); } return; }
      if (!train) { count -= dt; if (Math.floor(count + dt) !== Math.floor(count) && count < 4) { sfx(700, .05, 'square', .03); haptic('tick'); } if (count <= 0) { train = { p: 0, got: new Set() }; sfx(900, .3, 'square', .04, -300); } return; }
      train.p += dt * (1.6 + level * .12);
      const [tx, ty] = trainXY(); if (Math.random() < dt * 8) puffs.push({ x: tx, y: ty - 4, l: .7 });
      for (const p of puffs) { p.l -= dt; p.y -= 10 * dt; } puffs = puffs.filter(p => p.l > 0);
      const cell = route[Math.min(route.length - 1, Math.floor(train.p + .5))];
      if (grid[cell] === 3 && !train.got.has(cell)) { train.got.add(cell); score += 3; api.score(score); feel.coin(tx, ty); feel.juice.pop(tx, ty - 8, '+3 POST', { color: C16[4] }); }
      if (train.p >= route.length - 1) {
        if (route[route.length - 1] === ck(...end)) { const left = budget - (route.length - 1), pts = 4 + Math.floor(left / 3); score += pts; api.score(score); notes('C5 E5 G5 C6', { len: .07 }); feel.win(tx, ty); haptic('success'); banner = { txt: 'ON TIME!', sub: `+${pts}`, l: 1.4, next: 'win' }; }
        else crash('DERAILED!');
      }
    },
    draw(c) {
      const { s, x: X, y: Y } = geo();
      c.fillStyle = C16[6]; c.fillRect(0, 0, W, H);
      for (let i = 0; i < GX * GY; i++) {
        const x = X + (i % GX) * s, y = Y + (i / GX | 0) * s, v = grid[i];
        c.fillStyle = ((i % GX) + (i / GX | 0)) % 2 ? C16[5] : '#68c850'; c.fillRect(x, y, s, s);
        if (v === 1) { c.fillStyle = C16[11]; c.fillRect(x + s / 2 - 1, y + s - 6, 3, 5); c.fillStyle = C16[6]; c.fillRect(x + 3, y + 2, s - 6, s - 7); c.fillRect(x + 5, y + 1, s - 10, 2); }
        if (v === 2) { c.fillStyle = C16[8]; c.fillRect(x, y, s, s); c.fillStyle = C16[7]; c.fillRect(x + 2 + ((t * 2 | 0) % 3), y + 4, 5, 1); }
        if (v === 3) { c.fillStyle = C16[2]; c.fillRect(x + 3, y + 5, s - 6, s - 8); c.fillStyle = C16[1]; c.fillRect(x + 5, y + 7, s - 10, 3); c.fillStyle = C16[12]; c.fillRect(x + 2, y + 3, s - 4, 2); }
      }
      // track: sleepers and two rails between route cells
      for (let k = 1; k < route.length; k++) {
        const a = route[k - 1], b = route[k], ax = X + (a % GX) * s + s / 2, ay = Y + (a / GX | 0) * s + s / 2, bx = X + (b % GX) * s + s / 2, by = Y + (b / GX | 0) * s + s / 2;
        const horiz = ay === by;
        c.fillStyle = C16[12]; for (let u = 0; u <= 4; u++) { const px = Math.round(ax + (bx - ax) * u / 4), py = Math.round(ay + (by - ay) * u / 4); if (horiz) c.fillRect(px - 1, py - 4, 2, 9); else c.fillRect(px - 4, py - 1, 9, 2); }
        c.fillStyle = C16[13]; if (horiz) { c.fillRect(Math.min(ax, bx), ay - 3, Math.abs(bx - ax) + 1, 1); c.fillRect(Math.min(ax, bx), ay + 3, Math.abs(bx - ax) + 1, 1); } else { c.fillRect(ax - 3, Math.min(ay, by), 1, Math.abs(by - ay) + 1); c.fillRect(ax + 3, Math.min(ay, by), 1, Math.abs(by - ay) + 1); }
      }
      // stations
      for (const [sx, sy, col] of [[...start, C16[8]], [...end, C16[2]]]) { const x = X + sx * s, y = Y + sy * s; c.fillStyle = col; c.fillRect(x + 1, y + 1, s - 2, s - 2); c.fillStyle = C16[1]; c.fillRect(x + 3, y + 3, s - 6, 3); }
      feel.begin(c);
      if (train) {
        const [tx, ty] = trainXY(); c.fillStyle = C16[0]; c.fillRect(Math.round(tx) - 5, Math.round(ty) - 4, 10, 8); c.fillStyle = C16[2]; c.fillRect(Math.round(tx) - 4, Math.round(ty) - 3, 8, 6); c.fillStyle = C16[4]; c.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
        for (const p of puffs) { c.fillStyle = C16[14]; c.globalAlpha = p.l; c.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4); } c.globalAlpha = 1;
      }
      feel.end(c, W, H);
      text(c, `TRACK ${budget - (route.length - 1)}`, 3, 4, { color: C16[1] });
      text(c, train ? 'GO!' : `${Math.max(0, Math.ceil(count))}`, W - 4, 4, { color: !train && count < 4 ? C16[4] : C16[1], align: 'right' });
      for (let i = 0; i < lives; i++) { c.fillStyle = C16[2]; c.fillRect(W / 2 + 20 + i * 6, 4, 4, 4); }
      if (banner) { text(c, banner.txt, W / 2, H / 2 - 8, { font: 'big', align: 'center', color: C16[1], outline: C16[0] }); if (banner.sub) text(c, banner.sub, W / 2, H / 2 + 6, { align: 'center', color: C16[4], outline: C16[0] }); }
      else if (level === 1 && route.length < 2) text(c, 'DRAG FROM THE BLUE STATION', W / 2, H - 8, { align: 'center', color: C16[1], outline: C16[0] });
    },
    down(x, y) { drawing = true; game.move(x, y, true); },
    move(x, y, p) {
      if (!p || !drawing || banner) return;
      const { s, x: X, y: Y } = geo(), cx = Math.floor((x - X) / s), cy = Math.floor((y - Y) / s);
      if (cx < 0 || cy < 0 || cx >= GX || cy >= GY) return;
      const c = ck(cx, cy), last = route[route.length - 1];
      if (c === last) return;
      // back over the last piece: pick it up (not under the train)
      if (route.length > 1 && c === route[route.length - 2] && (!train || train.p < route.length - 2)) { route.pop(); sfx(200, .03, 'square', .02); haptic('tick'); return; }
      const lx = last % GX, ly = last / GX | 0;
      if (Math.abs(cx - lx) + Math.abs(cy - ly) !== 1) return;
      if (grid[c] === 1 || grid[c] === 2 || route.includes(c) || last === ck(...end)) { if (grid[c] === 1 || grid[c] === 2) haptic('warning'); return; }
      if (route.length - 1 >= budget) { feel.juice.pop(x, y - 8, 'NO TRACK', { color: C16[2] }); haptic('warning'); return; }
      route.push(c); sfx(400 + route.length * 10, .03, 'square', .02); haptic('light');
    },
    up() { drawing = false; },
  };
  return game;
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'rail-connect',
  title: 'Rail Connect',
  tag: 'Color · Trains',
  retro: true, era: 'color', pal: 'lemon',
  w: 160, h: 192, maxW: 220, maxH: 240,
  goal: 30,
  hint: 'Drag from the blue station to lay track to the red one before the train leaves. Pass post offices for bonus points. Run out of track and it derails.',
  make,
};
