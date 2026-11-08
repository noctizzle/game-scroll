import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Customers line up with burger orders. Tap the ingredients to stack them in the order on the ticket,
// then tap SERVE. Quick service earns tips. A wrong burger goes in the bin; three walk-outs and you're closed.
const W = 360, H = 640;
const ING = [
  { k: 'bun', col: '#e0a050', h: 14 }, { k: 'patty', col: '#6a3a1e', h: 12 }, { k: 'cheese', col: '#ffcc33', h: 6 },
  { k: 'lettuce', col: '#5ac85a', h: 6 }, { k: 'tomato', col: '#e8443a', h: 7 }, { k: 'onion', col: '#e8d8f0', h: 5 },
];
const FACES = ['#f2c79a', '#c68a5a', '#8d5a3b', '#ffd9b0'];

function make(api) {
  let queue, stack, served, walked, t, spawn, msg, coins;
  function order() {
    const n = clamp(2 + Math.floor(served / 3), 2, 6), mid = [];
    for (let i = 0; i < n; i++) mid.push(1 + (Math.random() * 5 | 0));
    if (!mid.includes(1)) mid[0] = 1;
    return [0, ...mid, 0];
  }
  function addCustomer() { queue.push({ ord: order(), pat: Math.max(9, 22 - served * .5), wait: 0, face: FACES[Math.random() * 4 | 0], x: W + 40 }); }
  function serve() {
    if (!queue.length || !stack.length) return;
    const cu = queue[0], ok = stack.length === cu.ord.length && stack.every((k, i) => k === cu.ord[i]);
    if (ok) {
      const tip = Math.max(0, Math.round((1 - cu.wait / cu.pat) * 5)); served++; coins += 3 + tip; api.score(coins);
      msg = { txt: tip >= 4 ? `PERFECT +${3 + tip}` : `+${3 + tip}`, l: 1, good: true }; haptic('success'); sfx(880, .15, 'triangle', .05, 300);
      queue.shift(); if (queue.length < 2) addCustomer();
    } else { msg = { txt: 'WRONG ORDER', l: 1, good: false }; haptic('error'); sfx(150, .3, 'triangle', .05, -40); cu.wait += 3; }
    stack = [];
  }
  return {
    reset() { queue = []; stack = []; served = 0; walked = 0; t = 0; spawn = 6; msg = null; coins = 0; addCustomer(); },
    update(dt) {
      t += dt; if (msg) msg.l -= dt; spawn -= dt;
      if (spawn <= 0) { spawn = Math.max(5, 12 - served * .3); if (queue.length < 3) addCustomer(); }
      queue.forEach((cu, i) => { cu.x += ((60 + i * 110) - cu.x) * Math.min(1, dt * 4); cu.wait += dt * (i === 0 ? 1 : .5); });
      const gone = queue.filter(cu => cu.wait > cu.pat);
      for (const cu of gone) { queue.splice(queue.indexOf(cu), 1); walked++; haptic('error'); sfx(200, .3, 'square', .04, -60); msg = { txt: 'WALKED OUT', l: 1 }; if (walked >= 3) return api.over(); }
      if (!queue.length) addCustomer();
    },
    draw(c) {
      c.fillStyle = '#ffe8c8'; c.fillRect(0, 0, W, H); c.fillStyle = '#c84a3a'; for (let x = 0; x < W; x += 40) { c.fillRect(x, 0, 20, 30); }
      c.fillStyle = '#8a5a3a'; c.fillRect(0, 250, W, 20);
      // customers with order tickets
      queue.forEach((cu, i) => {
        const x = cu.x, k = cu.wait / cu.pat;
        c.fillStyle = '#5a7ad0'; c.beginPath(); c.roundRect(x - 26, 190, 52, 60, 14); c.fill();
        c.fillStyle = cu.face; c.beginPath(); c.arc(x, 170, 22, 0, 7); c.fill();
        c.fillStyle = '#222'; c.fillRect(x - 8, 165, 4, 4); c.fillRect(x + 4, 165, 4, 4);
        c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); if (k < .5) c.arc(x, 176, 7, .3, 2.8); else if (k < .8) { c.moveTo(x - 6, 180); c.lineTo(x + 6, 180); } else c.arc(x, 186, 7, 3.5, 5.9); c.stroke();
        c.fillStyle = '#ffffff'; c.fillRect(x - 30, 46, 60, 100); c.fillStyle = k > .75 ? '#ff4040' : '#5ac85a'; c.fillRect(x - 30, 140, 60 * (1 - clamp(k, 0, 1)), 6);
        let y = 132; for (let j = 0; j < cu.ord.length; j++) { const g = ING[cu.ord[j]]; c.fillStyle = g.col; c.fillRect(x - 22, y - 9, 44, 9); y -= 11; }
        if (i === 0) { c.strokeStyle = '#ffd34a'; c.lineWidth = 3; c.strokeRect(x - 31, 45, 62, 102); }
      });
      // the plate and stack
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(W / 2, 430, 90, 16, 0, 0, 7); c.fill();
      let y = 425; stack.forEach((k, i) => {
        const g = ING[k], top = k === 0 && i > 0; c.fillStyle = g.col; c.beginPath();
        if (k === 0) c.roundRect(W / 2 - 62, y - g.h, 124, g.h, top ? [14, 14, 4, 4] : [4, 4, 10, 10]); else c.roundRect(W / 2 - (k === 2 ? 66 : 60), y - g.h, k === 2 ? 132 : 120, g.h, 4);
        c.fill(); y -= g.h + 1;
      });
      // ingredient buttons
      ING.forEach((g, i) => {
        const bx = 14 + (i % 3) * 112, by = 470 + (i / 3 | 0) * 62;
        c.fillStyle = '#ffffffcc'; c.beginPath(); c.roundRect(bx, by, 100, 54, 12); c.fill();
        c.fillStyle = g.col; c.beginPath(); c.roundRect(bx + 14, by + 12, 72, 14, 6); c.fill();
        c.fillStyle = '#5a3a22'; c.font = '600 12px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(g.k, bx + 50, by + 44);
      });
      c.fillStyle = '#ff6b6b'; c.beginPath(); c.roundRect(14, 598, 100, 36, 10); c.fill(); c.fillStyle = '#5ac85a'; c.beginPath(); c.roundRect(126, 598, 220, 36, 10); c.fill();
      c.fillStyle = '#fff'; c.font = '400 10px "Press Start 2P", monospace'; c.fillText('BIN', 64, 621); c.fillText('SERVE', 236, 621);
      c.textAlign = 'left'; c.fillStyle = '#5a3a22'; c.fillText(`$${coins}`, 12, 290);
      for (let i = 0; i < 3; i++) { c.fillStyle = i < walked ? '#ff4040' : '#00000020'; c.fillRect(W - 50 + i * 14, 282, 10, 10); }
      if (msg && msg.l > 0) { c.globalAlpha = clamp(msg.l * 2, 0, 1); c.fillStyle = msg.good ? '#2e8a4a' : '#d03a3a'; c.font = '400 14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(msg.txt, W / 2, 320); c.globalAlpha = 1; }
    },
    down(x, y) {
      if (y >= 598 && y <= 634) { if (x < 120) { stack = []; haptic('warning'); sfx(200, .1, 'triangle', .03); } else serve(); return; }
      for (let i = 0; i < 6; i++) {
        const bx = 14 + (i % 3) * 112, by = 470 + (i / 3 | 0) * 62;
        if (x >= bx && x <= bx + 100 && y >= by && y <= by + 54 && stack.length < 9) { stack.push(i); haptic('tick'); sfx(300 + i * 60, .05, 'triangle', .04); }
      }
    },
    key(k, d) { if (d && k === ' ' && queue.length) { stack = queue[0].ord.slice(); serve(); } },
  };
}

export default {
  id: 'chef-orders', title: 'Chef Orders', tag: 'Casual · Time', retro: false, w: W, h: H, goal: 40,
  hint: 'Build each burger from the bottom up, in the order on the highlighted ticket, then tap Serve. Quick service earns tips. Three walk-outs and you are closed.',
  make,
};
