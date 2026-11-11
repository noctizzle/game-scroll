import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { rnd } = gs.util;
const { haptic } = gs.device;
const { Feel } = gs.effects;

// Circle a planet, tap to launch off on a straight line, and get caught by the next planet's pull. Drift into space and it's over.
const W = 360, H = 640;

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game plays its own sounds
  let planets, cur, ang, dir, ship, cam, score, t, trail, stars, dead;
  function addPlanet(y) {
    const r = rnd(20, 34), last = planets[planets.length - 1];
    let x = rnd(60, W - 60); if (last && Math.abs(x - last.x) < 70) x = last.x + (x < last.x ? -1 : 1) * 90;
    planets.push({ x: Math.max(50, Math.min(W - 50, x)), y, r, hue: rnd(0, 360), spin: rnd(1.4, 2.4) + Math.min(1.2, score * .05), ring: Math.random() < .35 });
  }
  return {
    reset() {
      planets = []; score = 0; t = 0; trail = []; dead = 0; cam = 0; feel.clear();
      planets.push({ x: W / 2, y: H - 140, r: 30, hue: 200, spin: 1.6, ring: false });
      for (let i = 1; i < 6; i++) addPlanet(H - 140 - i * rnd(150, 190));
      cur = planets[0]; ang = -Math.PI / 2; dir = 1; ship = null; this._pos = { x: W / 2, y: H - 186 };
      stars = Array.from({ length: 60 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: rnd(.2, 1) }));
    },
    update(dt) {
      feel.update(dt); t += dt;
      let px, py;
      if (cur) { ang += dir * cur.spin * dt; const orb = cur.r + 16; px = cur.x + Math.cos(ang) * orb; py = cur.y + Math.sin(ang) * orb; }
      else {
        ship.x += ship.vx * dt; ship.y += ship.vy * dt; px = ship.x; py = ship.y;
        for (const p of planets) {
          if (p === ship.from) continue;
          const d = Math.hypot(px - p.x, py - p.y);
          if (d < p.r + 34) {
            cur = p; ang = Math.atan2(py - p.y, px - p.x);
            const cross = (px - p.x) * ship.vy - (py - p.y) * ship.vx; dir = cross > 0 ? 1 : -1;
            if (planets.indexOf(p) > planets.indexOf(ship.from)) { score += planets.indexOf(p) - planets.indexOf(ship.from); api.score(score); }
            sfx(520 + score * 20, .12, 'triangle', .05, 300); haptic('medium'); ship = null;
            feel.juice.burst(px, py, { n: 12, speed: 150, life: .4, size: 3, color: [`hsl(${p.hue},80%,72%)`, '#ffffff'] }); break;
          }
        }
        if (!cur && (px < -30 || px > W + 30 || py > cam + H + 30 || py < cam - 80)) { sfx(160, .5, 'sine', .06, -100); haptic('error'); feel.juice.shake(6); return api.over(); }
      }
      trail.push({ x: px, y: py, a: 1 }); for (const q of trail) q.a -= dt * 2; trail = trail.filter(q => q.a > 0);
      const focus = cur ? cur.y : py; cam += ((focus - H * .62) - cam) * Math.min(1, dt * 3);
      const top = planets[planets.length - 1]; if (top.y > cam - 200) addPlanet(top.y - rnd(150, 200));
      planets = planets.filter(p => p.y < cam + H + 300 || p === cur);
      this._pos = { x: px, y: py };
    },
    fx(dt) { dead += dt; feel.update(dt); },
    draw(c) {
      c.fillStyle = '#070a1a'; c.fillRect(0, 0, W, H);
      for (const s of stars) { const y = ((s.y - cam * s.z * .3) % H + H) % H; c.fillStyle = `rgba(255,255,255,${s.z * .7})`; c.fillRect(s.x, y, s.z * 2, s.z * 2); }
      c.save(); c.translate(0, -cam); feel.begin(c);
      for (const p of planets) {
        c.strokeStyle = `hsla(${p.hue},80%,70%,.12)`; c.lineWidth = 1; c.setLineDash([4, 6]); c.beginPath(); c.arc(p.x, p.y, p.r + 34, 0, 7); c.stroke(); c.setLineDash([]);
        const g = c.createRadialGradient(p.x - p.r * .4, p.y - p.r * .4, 2, p.x, p.y, p.r); g.addColorStop(0, `hsl(${p.hue},80%,72%)`); g.addColorStop(1, `hsl(${p.hue},70%,38%)`);
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
        if (p.ring) { c.strokeStyle = `hsla(${p.hue + 40},80%,80%,.7)`; c.lineWidth = 3; c.beginPath(); c.ellipse(p.x, p.y, p.r * 1.6, p.r * .45, -.4, 0, 7); c.stroke(); }
      }
      for (const q of trail) { c.fillStyle = `rgba(140,220,255,${q.a * .6})`; c.fillRect(q.x - 2, q.y - 2, 4, 4); }
      const pos = this._pos || { x: cur.x, y: cur.y - cur.r - 16 };
      if (!dead || (dead * 10 | 0) % 2) { const heading = cur ? ang + dir * Math.PI / 2 : Math.atan2(ship.vy, ship.vx);
        c.save(); c.translate(pos.x, pos.y); c.rotate(heading); c.fillStyle = '#eaf6ff'; c.beginPath(); c.moveTo(10, 0); c.lineTo(-7, -6); c.lineTo(-4, 0); c.lineTo(-7, 6); c.closePath(); c.fill();
        c.fillStyle = '#ffb347'; c.fillRect(-9, -2, 3, 4); c.restore(); }
      feel.end(c, W, H); c.restore();
    },
    down() {
      if (!cur) return; const sp = 300 + Math.min(160, score * 6), hd = ang + dir * Math.PI / 2;
      ship = { x: this._pos.x, y: this._pos.y, vx: Math.cos(hd) * sp, vy: Math.sin(hd) * sp, from: cur }; cur = null; sfx(300, .08, 'square', .03, 400); haptic('light');
    },
    key(k, d) { if (d && k === ' ') this.down(); },
  };
}

export default {
  id: 'orbit-jump', title: 'Orbit Jump', tag: 'Casual · Timing', retro: false, w: W, h: H,
  hint: 'Tap to launch from your orbit. Fly close to a planet and its pull catches you.',
  goal: 15,
  make,
};
