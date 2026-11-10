// Space Mining: your mothership sits in an asteroid field. Tap an asteroid to send a drone: it flies out
// (using fuel), mines for a moment and flies home. Gold asteroids pay, ice ones refuel you, and a full
// hold buys another drone. Keep clear of the red storm zones. Out of fuel, or out of time, and it's over.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd, clamp } = gs.util;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let rocks, drones, fuel, cash, score, time, t, storms, stars, msg, ml, ended;
  const SHIP = () => ({ x: W / 2, y: H - 110 });

  function addRock() {
    const kind = Math.random() < .45 ? 'gold' : Math.random() < .55 ? 'ice' : 'rock';
    rocks.push({ x: rnd(30, W - 30), y: rnd(90, H - 220), r: rnd(14, 26), kind, left: kind === 'rock' ? 2 : 3, vx: rnd(-6, 6), vy: rnd(-4, 4), spin: Math.random() * 6, pts: [...Array(9)].map(() => rnd(.75, 1.1)) });
  }

  return {
    reset() { rocks = []; for (let i = 0; i < 7; i++) addRock(); drones = [0, 1].map(() => ({ s: 'home', x: 0, y: 0, k: 0, rock: null, load: null })); fuel = 100; cash = 0; score = 0; time = 120; t = 0; storms = []; msg = ''; ml = 0; ended = false; stars = [...Array(60)].map(() => [Math.random(), Math.random()]); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; time -= dt;
      for (const r of rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.spin += dt * .3; if (r.x < 20 || r.x > W - 20) r.vx *= -1; if (r.y < 80 || r.y > H - 210) r.vy *= -1; }
      rocks = rocks.filter(r => r.left > 0 || drones.some(d => d.rock === r)); while (rocks.length < 7) addRock();
      // meteor storms: warned, then deadly for a while
      if (Math.random() < dt / 9) storms.push({ x: rnd(40, W - 40), y: rnd(120, H - 240), r: rnd(40, 70), warn: 2, l: 6 });
      for (const s of storms) { if (s.warn > 0) s.warn -= dt; else s.l -= dt; } storms = storms.filter(s => s.l > 0);
      const sh = SHIP();
      for (const d of drones) {
        if (d.s === 'home') { d.x = sh.x; d.y = sh.y; continue; }
        const tx = d.s === 'back' ? sh.x : d.rock.x, ty = d.s === 'back' ? sh.y : d.rock.y, dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy);
        if (d.s === 'out' || d.s === 'back') { const sp = 150 * dt; if (dist < sp) { d.x = tx; d.y = ty; if (d.s === 'out') { d.s = 'mine'; d.k = 0; } else arrive(d); } else { d.x += dx / dist * sp; d.y += dy / dist * sp; } }
        else if (d.s === 'mine') { d.x = tx; d.y = ty; d.k += dt; if (d.k > 1.6) { d.load = d.rock.kind; d.rock.left--; d.rock = null; d.s = 'back'; sfx(500, .05, 'triangle', .03); } }
        for (const s of storms) if (s.warn <= 0 && d.s !== 'home' && Math.hypot(d.x - s.x, d.y - s.y) < s.r) { feel.boom(d.x, d.y, { size: .5 }); haptic('error'); d.s = 'lost'; msg = 'Drone lost in the storm!'; ml = 1.5; }
      }
      drones = drones.filter(d => d.s !== 'lost');
      if ((time <= 0 || (fuel <= 0 && drones.every(d => d.s === 'home')) || drones.length === 0) && !ended) { ended = true; time = Math.max(0, time); feel.lose(); api.over(); }
    },
    draw(c) {
      c.fillStyle = '#03071e'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff90'; for (const [x, y] of stars) c.fillRect(x * W, y * H, 1.5, 1.5);
      for (const s of storms) { c.fillStyle = s.warn > 0 ? (Math.floor(t * 6) % 2 ? '#ff000030' : '#ff000010') : '#d0000050'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 7); c.fill(); if (s.warn <= 0) { c.fillStyle = '#ffba08'; for (let i = 0; i < 4; i++) c.fillRect(s.x + rnd(-s.r, s.r) * .7, s.y + rnd(-s.r, s.r) * .7, 3, 8); } }
      feel.begin(c);
      for (const r of rocks) {
        if (r.left <= 0) continue;
        c.save(); c.translate(r.x, r.y); c.rotate(r.spin);
        c.fillStyle = r.kind === 'gold' ? '#7f5539' : r.kind === 'ice' ? '#5e6472' : '#495057';
        c.beginPath(); r.pts.forEach((k, i) => { const a = i / r.pts.length * 6.283; c.lineTo(Math.cos(a) * r.r * k, Math.sin(a) * r.r * k); }); c.closePath(); c.fill();
        c.fillStyle = r.kind === 'gold' ? '#ffd60a' : r.kind === 'ice' ? '#90e0ef' : '#6c757d';
        for (let i = 0; i < r.left + 1; i++) c.fillRect(Math.cos(i * 2.1) * r.r * .4 - 3, Math.sin(i * 2.1) * r.r * .4 - 3, 6, 6);
        c.restore();
      }
      const sh = SHIP();
      c.fillStyle = '#adb5bd'; c.beginPath(); c.ellipse(sh.x, sh.y, 60, 20, 0, 0, 7); c.fill(); c.fillStyle = '#6c757d'; c.fillRect(sh.x - 40, sh.y - 4, 80, 8); c.fillStyle = '#4cc9f0'; c.beginPath(); c.arc(sh.x, sh.y - 12, 14, Math.PI, 0); c.fill();
      for (const d of drones) {
        if (d.s === 'home') continue;
        c.fillStyle = d.load === 'gold' ? '#ffd60a' : d.load === 'ice' ? '#90e0ef' : '#f8f9fa'; c.beginPath(); c.arc(d.x, d.y, 6, 0, 7); c.fill();
        c.strokeStyle = '#f8f9fa60'; c.lineWidth = 1; c.beginPath(); c.moveTo(d.x - 9, d.y); c.lineTo(d.x + 9, d.y); c.stroke();
        if (d.s === 'mine') { c.strokeStyle = '#f72585'; c.lineWidth = 2; c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x + Math.cos(t * 30) * 10, d.y + Math.sin(t * 30) * 10); c.stroke(); }
      }
      feel.end(c, W, H);
      // HUD
      const idle = drones.filter(d => d.s === 'home').length;
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '700 14px Rubik, sans-serif'; c.fillText(`Fuel`, 16, H - 52); c.fillStyle = '#ffffff20'; c.fillRect(56, H - 63, 110, 12); c.fillStyle = fuel < 20 ? '#e63946' : '#90e0ef'; c.fillRect(56, H - 63, 110 * clamp(fuel / 100, 0, 1), 12);
      c.fillStyle = '#fff'; c.fillText(`Drones ${idle}/${drones.length} ready`, 16, H - 28);
      c.textAlign = 'right'; c.fillText(`Time ${Math.ceil(Math.max(0, time))}`, W - 16, H - 52);
      // buy a drone
      const can = cash >= 10; c.fillStyle = can ? '#f72585' : '#f7258540'; c.beginPath(); c.roundRect(W - 130, H - 46, 114, 30, 8); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '700 13px Rubik, sans-serif'; c.fillText(`+Drone (${cash}/10)`, W - 73, H - 26);
      if (ml > 0) { c.font = '700 16px Rubik, sans-serif'; c.fillStyle = '#ffba08'; c.fillText(msg, W / 2, 70); }
      else if (t < 6) { c.font = '600 14px Rubik, sans-serif'; c.fillStyle = '#fff'; c.fillText('Tap an asteroid to send a drone', W / 2, 70); }
    },
    down(x, y) {
      if (y > H - 50 && x > W - 132) { if (cash >= 10) { cash -= 10; drones.push({ s: 'home', x: 0, y: 0, k: 0, rock: null, load: null }); notes('C5 G5', { len: .06 }); haptic('success'); } return; }
      let best = null, bd = 1e9; for (const r of rocks) { if (r.left <= 0) continue; const d = Math.hypot(r.x - x, r.y - y); if (d < r.r + 16 && d < bd) { bd = d; best = r; } }
      if (!best) return;
      const d = drones.find(q => q.s === 'home'); if (!d) { msg = 'All drones are out'; ml = 1; sfx(200, .08, 'square', .03); return; }
      const sh = SHIP(), cost = Math.hypot(best.x - sh.x, best.y - sh.y) / 30;
      if (fuel < cost) { msg = 'Not enough fuel: mine ice!'; ml = 1.2; sfx(150, .1, 'square', .03); haptic('warning'); return; }
      fuel -= cost; d.s = 'out'; d.rock = best; d.load = null; sfx(700, .08, 'triangle', .03, 300); haptic('light');
    },
  };

  function arrive(d) {
    d.s = 'home';
    if (d.load === 'gold') { score += 3; cash += 3; api.score(score); notes('E5 G5', { len: .05 }); feel.coin(SHIP().x, SHIP().y - 20); }
    else if (d.load === 'ice') { fuel = Math.min(100, fuel + 22); sfx(900, .08, 'triangle', .03); }
    else if (d.load) { score += 1; cash += 1; api.score(score); }
    d.load = null;
  }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'space-mining',
  title: 'Space Mining',
  tag: 'Casual · Strategy',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 60,
  hint: 'Tap asteroids to send drones: gold pays, ice refuels, and 10 earned buys another drone. Flights cost fuel and storms destroy drones. Out of fuel or time ends it.',
  make,
};
