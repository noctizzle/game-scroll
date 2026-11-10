// Balance Scale: weights already hang on one side of the beam. Drag every weight from the tray onto the
// hooks so the beam sits level. Further out pulls harder: 2 kg on hook 3 weighs the same as 3 kg on
// hook 2. Use the whole tray, before the clock runs out.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { approach } = gs.juice;
const { clamp } = gs.util;

let W = 360, H = 640;
const HOOKS = [-4, -3, -2, -1, 1, 2, 3, 4];

function make(api) {
  const feel = new Feel();
  let fixed, tray, placed, drag, angle, level, score, time, t, banner;
  const beamY = () => H * .36, unit = () => (W - 60) / 9, trayY = () => H * .78;
  const torque = () => [...fixed, ...placed].reduce((s, w) => s + w.kg * w.hook, 0);
  const hookXY = (h, k = 0) => { const a = angle, d = h * unit(); return [W / 2 + Math.cos(a) * d, beamY() + Math.sin(a) * d + 22 + k * 30]; };

  function newLevel() {
    for (let tries = 0; tries < 500; tries++) {
      const n = Math.min(5, 2 + Math.floor(level / 2));
      const kgs = Array.from({ length: n }, () => 1 + Math.random() * (level < 3 ? 4 : 6) | 0);
      const sol = kgs.map(() => HOOKS[Math.random() * HOOKS.length | 0]);
      const T = kgs.reduce((s, k, i) => s + k * sol[i], 0);
      if (T === 0) continue;
      // one or two fixed weights cancel it
      const side = -Math.sign(T), opts = [];
      for (const d of [1, 2, 3, 4]) if (Math.abs(T) % d === 0 && Math.abs(T) / d <= 12) opts.push(d);
      if (!opts.length) continue;
      const d = opts[Math.random() * opts.length | 0];
      fixed = [{ kg: Math.abs(T) / d, hook: side * d, fixed: true }];
      // the tray mustn't already balance by just hanging everything at the obvious spots
      tray = kgs.map((kg, i) => ({ kg, id: i })).sort((a, b) => a.kg - b.kg);
      break;
    }
    placed = []; drag = null; angle = 0; time = 30 + tray.length * 6;
    banner = { txt: `Level ${level}`, l: 1 };
  }
  const trayXY = i => [W / 2 + (i - (tray.length - 1) / 2) * 62, trayY()];

  function drawWeight(c, x, y, kg, col) {
    const s = 22 + kg * 2.4;
    c.fillStyle = '#5c677d'; c.fillRect(x - 1, y - 14, 2, 12);
    c.fillStyle = col; c.beginPath(); c.moveTo(x - s * .35, y - 4); c.lineTo(x + s * .35, y - 4); c.lineTo(x + s * .55, y + s * .8); c.lineTo(x - s * .55, y + s * .8); c.closePath(); c.fill();
    c.fillStyle = '#ffffff30'; c.fillRect(x - s * .3, y, 4, s * .6);
    c.fillStyle = '#fff'; c.font = `800 ${12 + kg}px Rubik, sans-serif`; c.textAlign = 'center'; c.fillText(kg, x, y + s * .55);
  }

  return {
    reset() { level = 1; score = 0; t = 0; feel.clear(); newLevel(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      const T = torque();
      angle = approach(angle, clamp(T * .025, -.42, .42), 4, dt);
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); if (b.next) { level++; newLevel(); } } if (banner?.next || banner?.over) return; }
      time -= dt;
      if (time <= 0) { feel.lose(); banner = { txt: 'Out of time', l: 1.3, over: true }; return; }
      if (!tray.length && !drag && T === 0 && Math.abs(angle) < .01) {
        const pts = 3 + level + Math.floor(time / 5); score += pts; api.score(score);
        notes('C5 E5 G5 C6:2', { len: .07 }); feel.win(W / 2, beamY()); haptic('success');
        banner = { txt: 'Level!', sub: `+${pts}`, l: 1.4, next: true };
      }
    },
    draw(c) {
      c.fillStyle = '#f8f3e6'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#2b2d42'; c.font = '700 18px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(`${Math.ceil(time)}s`, 20, 46);
      c.textAlign = 'right'; c.fillText(`Level ${level}`, W - 20, 46);
      // stand
      c.fillStyle = '#8d99ae'; c.beginPath(); c.moveTo(W / 2, beamY()); c.lineTo(W / 2 - 40, H * .62); c.lineTo(W / 2 + 40, H * .62); c.fill();
      c.fillStyle = '#5c677d'; c.fillRect(W / 2 - 80, H * .62, 160, 12);
      feel.begin(c);
      // beam
      c.save(); c.translate(W / 2, beamY()); c.rotate(angle);
      c.fillStyle = Math.abs(angle) < .01 && !tray.length ? '#2a9d8f' : '#bc6c25'; c.fillRect(-unit() * 4.5, -6, unit() * 9, 12);
      for (const h of HOOKS) { c.fillStyle = '#2b2d42'; c.fillRect(h * unit() - 2, 6, 4, 10); c.font = '600 11px Rubik, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(Math.abs(h), h * unit(), 4); }
      c.restore();
      c.fillStyle = '#2b2d42'; c.beginPath(); c.arc(W / 2, beamY(), 8, 0, 7); c.fill();
      // hanging weights (stacked down a chain)
      const stack = new Map();
      for (const w of [...fixed, ...placed]) { const k = stack.get(w.hook) || 0; stack.set(w.hook, k + 1); const [x, y] = hookXY(w.hook, k); drawWeight(c, x, y, w.kg, w.fixed ? '#495057' : '#e76f51'); }
      // tray
      c.fillStyle = '#e9dcc1'; c.beginPath(); c.roundRect(20, trayY() - 30, W - 40, 100, 16); c.fill();
      tray.forEach((w, i) => { if (drag?.w === w) return; const [x, y] = trayXY(i); drawWeight(c, x, y, w.kg, '#e76f51'); });
      if (drag) drawWeight(c, drag.x, drag.y, drag.w.kg, '#f4a261');
      // level gauge
      const T = torque(); c.fillStyle = '#2b2d42'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'center';
      c.fillText(T === 0 ? (tray.length ? 'Level, but use every weight' : 'Balanced!') : T > 0 ? 'Right side is heavier' : 'Left side is heavier', W / 2, H * .7);
      feel.end(c, W, H);
      if (level === 1 && t < 5 && !placed.length) { c.fillStyle = '#6c757d'; c.font = '600 15px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('Drag weights onto the hooks', W / 2, H - 30); }
      if (banner) { c.fillStyle = '#2b2d42e0'; c.fillRect(0, H * .5 - 40, W, 84); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 30px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .5); c.font = '600 17px Rubik, sans-serif'; if (banner.sub) c.fillText(banner.sub, W / 2, H * .5 + 28); }
    },
    down(x, y) {
      if (banner?.next || banner?.over) return;
      const i = tray.findIndex((w, k) => { const [tx, ty] = trayXY(k); return Math.abs(tx - x) < 30 && Math.abs(ty + 10 - y) < 40; });
      if (i >= 0) { drag = { w: tray[i], x, y, from: 'tray' }; sfx(400, .03, 'sine', .03); haptic('tick'); return; }
      // pick a placed weight back off its hook
      const stack = new Map(); let hit = null;
      for (const w of placed) { const k = stack.get(w.hook) || 0; stack.set(w.hook, k + 1); const [hx, hy] = hookXY(w.hook, k); if (Math.abs(hx - x) < 24 && Math.abs(hy + 10 - y) < 26) hit = w; }
      if (hit) { placed = placed.filter(w => w !== hit); tray.push({ kg: hit.kg }); tray.sort((a, b) => a.kg - b.kg); drag = { w: tray.find(w => w.kg === hit.kg), x, y }; sfx(300, .03, 'sine', .03); }
    },
    move(x, y, p) { if (p && drag) { drag.x = x; drag.y = y; } },
    up(x, y) {
      if (!drag) return;
      // nearest hook (by x along the beam) if dropped above the tray
      let best = null, bd = unit() * .6;
      for (const h of HOOKS) { const [hx] = hookXY(h); const d = Math.abs(hx - drag.x); if (d < bd && drag.y < trayY() - 30) { bd = d; best = h; } }
      if (best != null) { tray = tray.filter(w => w !== drag.w); placed.push({ kg: drag.w.kg, hook: best }); sfx(250 + drag.w.kg * 40, .06, 'triangle', .04); haptic('light'); feel.juice.shake(2); }
      drag = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'balance-scale',
  title: 'Balance Scale',
  tag: 'Casual · Logic',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Drag every weight from the tray onto the hooks so the beam balances. Hooks further out pull harder.',
  make,
};
