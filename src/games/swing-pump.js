// Swing Pump: get the swing going higher and higher. Pump at the right moment, just as the swing stops at
// the end of each swing, by giving the phone a little push forward (or tapping). Pump at the wrong
// time and you lose height. Swing through the stars hung along the arc before the bell rings.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic, onMotion } = gs.device;
const { sfx, notes } = gs.sound;
const { rnd } = gs.util;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let th, om, stars, score, time, t, lastPump, pumpFx, msg, ml, ended, best, moved;
  const PX = () => W / 2, PY = () => 120, L = () => Math.min(H * .5, 300);
  const G = 9.8 / 2.4;
  onMotion(m => {
    // a small forward push of the phone counts as a pump
    const a = Math.hypot(m.ax ?? 0, m.ay ?? 0, m.az ?? 0);
    if (a > 5 && t - lastPump > .35) pump('move');
  });

  function addStar() { const side = Math.random() < .5 ? -1 : 1, amp = Math.min(1.35, .35 + rnd(0, .3) + score * .04); stars.push({ a: side * amp, got: false, l: 8 }); }
  function pump(how) {
    if (ended) return;
    lastPump = t; moved = true;
    // best right at the ends of the swing (slow), worst at the bottom (fast)
    const amp = Math.max(.08, Math.abs(th) + Math.abs(om) / Math.sqrt(G)), slow = 1 - Math.min(1, Math.abs(om) / (Math.sqrt(G) * amp + .01));
    if (slow > .7) { om += Math.sign(-th || 1) * .55 * (1 - Math.min(1, amp / 1.6)); pumpFx = .4; sfx(300 + amp * 200, .08, 'triangle', .04); haptic('light'); msg = 'PUMP!'; ml = .4; }
    else if (slow < .3) { om *= .82; sfx(150, .08, 'square', .03); haptic('warning'); msg = 'TOO SOON'; ml = .5; }
  }

  return {
    reset() { th = .25; om = 0; stars = []; score = 0; time = 60; t = 0; lastPump = -1; pumpFx = 0; msg = ''; ml = 0; ended = false; best = 0; moved = false; addStar(); addStar(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt; if (ml > 0) ml -= dt; pumpFx = Math.max(0, pumpFx - dt);
      // pendulum with a little friction
      om += -G * Math.sin(th) * dt; om *= Math.pow(.97, dt); th += om * dt;
      if (Math.abs(th) > 1.45) { th = Math.sign(th) * 1.45; om = 0; }
      best = Math.max(best, Math.abs(th));
      if (moved) time -= dt;
      for (const s of stars) {
        if (!s.got && Math.abs(th - s.a) < .06) { s.got = true; score += 1 + Math.floor(Math.abs(s.a) * 2); api.score(score); notes('E5 G5', { len: .05 }); const p = seat(); feel.coin(p.x, p.y); haptic('success'); }
        s.l -= dt;
      }
      stars = stars.filter(s => !s.got && s.l > 0);
      while (stars.length < 2) addStar();
      if (time <= 0 && !ended) { ended = true; time = 0; notes('C6 C6', { len: .1 }); api.over(); }
    },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#8ecae6'); g.addColorStop(1, '#ffb703'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#90be6d'; c.fillRect(0, H - 90, W, 90);
      // frame
      c.strokeStyle = '#6c584c'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(PX() - 150, H - 80); c.lineTo(PX() - 40, PY()); c.lineTo(PX() + 40, PY()); c.lineTo(PX() + 150, H - 80); c.stroke();
      // the arc and the stars on it
      c.strokeStyle = '#ffffff30'; c.lineWidth = 2; c.setLineDash([4, 8]); c.beginPath(); c.arc(PX(), PY(), L(), Math.PI / 2 - 1.45, Math.PI / 2 + 1.45); c.stroke(); c.setLineDash([]);
      feel.begin(c);
      for (const s of stars) { const x = PX() + Math.sin(s.a) * L(), y = PY() + Math.cos(s.a) * L(); c.fillStyle = s.l < 2 && Math.floor(t * 8) % 2 ? '#ffffff' : '#ffd60a'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 - 1.57, r = i % 2 ? 6 : 14; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.fill(); }
      const p = seat();
      c.strokeStyle = '#495057'; c.lineWidth = 3; c.beginPath(); c.moveTo(PX() - 10, PY()); c.lineTo(p.x - 14 * Math.cos(th), p.y + 14 * Math.sin(th)); c.moveTo(PX() + 10, PY()); c.lineTo(p.x + 14 * Math.cos(th), p.y - 14 * Math.sin(th)); c.stroke();
      // the swinger: leans back or forward when pumping
      c.save(); c.translate(p.x, p.y); c.rotate(-th);
      c.fillStyle = '#9c6644'; c.fillRect(-18, -3, 36, 6);
      const lean = pumpFx > 0 ? .4 : 0;
      c.fillStyle = '#e63946'; c.save(); c.rotate(-lean); c.fillRect(-7, -32, 14, 30); c.fillStyle = '#ffcdb2'; c.beginPath(); c.arc(0, -40, 9, 0, 7); c.fill(); c.fillStyle = '#6f1d1b'; c.beginPath(); c.arc(0, -43, 9, Math.PI, 0); c.fill(); c.restore();
      c.strokeStyle = '#1d3557'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, 0); c.lineTo(12, 8 + lean * 20); c.lineTo(12 + lean * 20, 26); c.stroke();
      c.restore();
      feel.end(c, W, H);
      c.fillStyle = '#00000030'; c.fillRect(20, 54, W - 40, 8); c.fillStyle = '#ffffff'; c.fillRect(20, 54, (W - 40) * time / 60, 8);
      c.textAlign = 'center'; c.fillStyle = '#1d3557'; c.font = '700 15px Rubik, sans-serif'; c.fillText(`height ${Math.round(Math.abs(th) * 57)}°`, W / 2, H - 50);
      if (ml > 0) { c.font = '800 22px Rubik, sans-serif'; c.fillStyle = msg === 'PUMP!' ? '#fff' : '#d00000'; c.fillText(msg, W / 2, H * .72); }
      if (!moved) { c.fillStyle = '#1d3557'; c.font = '700 16px Rubik, sans-serif'; c.fillText('Tap (or push the phone) as the swing stops', W / 2, H - 24); }
    },
    down() { pump('tap'); },
    key(k, d) { if (d && k === ' ') pump('tap'); },
  };
  function seat() { return { x: PX() + Math.sin(th) * L(), y: PY() + Math.cos(th) * L() }; }
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'swing-pump',
  title: 'Swing Pump',
  tag: 'Casual · Motion',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Tap (or give the phone a little push) just as the swing stops at each end to go higher. Pumping mid-swing slows you. Swing through the stars before time runs out.',
  make,
};
