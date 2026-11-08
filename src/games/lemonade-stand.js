import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Five days running a lemonade stand. Each morning, read the forecast, then set how many cups to make
// and what to charge. Hot days sell more and people pay more; rain keeps them home. Make the most money.
const W = 360, H = 640, DAYS = 5, CUP_COST = 10;
const WEATHER = [
  { k: 'HOT', icon: 'sun', demand: 1.4, pay: 1.3 }, { k: 'SUNNY', icon: 'sun', demand: 1, pay: 1 },
  { k: 'CLOUDY', icon: 'cloud', demand: .65, pay: .85 }, { k: 'RAINY', icon: 'rain', demand: .3, pay: .7 },
];

function make(api) {
  let day, cash, cups, price, wx, actual, phase, timer, sold, made, walkers, t, log, result;
  function morning() {
    day++; wx = Math.random() * 4 | 0;
    // The real weather is usually the forecast, sometimes a step off.
    actual = Math.random() < .7 ? wx : clamp(wx + (Math.random() < .5 ? -1 : 1), 0, 3);
    phase = 'plan'; cups = clamp(cups || 30, 0, Math.floor(cash / CUP_COST)); price = price || 50; sold = 0; walkers = []; result = null;
  }
  function open() {
    made = cups; cash -= made * CUP_COST; phase = 'day'; timer = 8; haptic('medium'); sfx(600, .1, 'triangle', .04, 200);
  }
  function close() {
    const income = sold * price; cash += income; api.score(Math.max(0, Math.round((cash - 200) / 100)));
    result = { sold, made, income, cost: made * CUP_COST, profit: income - made * CUP_COST }; log.push(result.profit);
    phase = 'night'; timer = 2.2; haptic(result.profit > 0 ? 'success' : 'warning'); sfx(result.profit > 0 ? 880 : 200, .2, 'triangle', .05, result.profit > 0 ? 200 : -50);
  }
  return {
    reset() { day = 0; cash = 200; cups = 30; price = 50; t = 0; log = []; morning(); },
    update(dt) {
      t += dt;
      if (phase === 'day') {
        timer -= dt; const W2 = WEATHER[actual];
        if (Math.random() < dt * 9 * W2.demand) walkers.push({ x: Math.random() < .5 ? -20 : W + 20, y: rnd(370, 420), dir: 0, buy: null, stop: 0 });
        for (const w of walkers) {
          w.dir ||= w.x < 0 ? 1 : -1; w.x += w.dir * 90 * dt;
          if (w.buy === null && Math.abs(w.x - W / 2) < 20) {
            const willing = 60 * W2.pay * rnd(.5, 1.6); w.buy = sold < made && price <= willing;
            if (w.buy) { sold++; w.stop = .5; haptic('tick'); sfx(1200, .04, 'square', .03); }
          }
          if (w.stop > 0) { w.stop -= dt; w.x -= w.dir * 90 * dt; }
        }
        walkers = walkers.filter(w => w.x > -40 && w.x < W + 40);
        if (timer <= 0) close();
      } else if (phase === 'night') { timer -= dt; if (timer <= 0) { if (day >= DAYS || cash < CUP_COST) return api.over(); morning(); } }
    },
    draw(c) {
      const sky = phase === 'night' ? '#1a1a3a' : ['#ffd27a', '#8fd3ff', '#b8c4d0', '#7a8a9a'][phase === 'day' ? actual : wx];
      c.fillStyle = sky; c.fillRect(0, 0, W, H); c.fillStyle = '#7cc46a'; c.fillRect(0, 430, W, H - 430);
      c.fillStyle = '#d9d0c0'; c.fillRect(0, 360, W, 70);
      // stand
      c.fillStyle = '#ffe14d'; c.fillRect(120, 300, 120, 80); c.fillStyle = '#ff6b8a'; for (let i = 0; i < 6; i++) c.fillRect(110 + i * 24, 270, 12, 30);
      c.fillStyle = '#fff'; c.fillRect(110, 270, 140, 6); c.fillStyle = '#7a4a22'; c.font = '700 14px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('LEMONADE', 180, 330); c.fillText(`${price}¢`, 180, 352);
      for (const w of walkers) { c.fillStyle = '#5a7ad0'; c.fillRect(w.x - 7, w.y - 20, 14, 22); c.fillStyle = '#f2c79a'; c.beginPath(); c.arc(w.x, w.y - 27, 7, 0, 7); c.fill(); if (w.buy) { c.fillStyle = '#ffe14d'; c.fillRect(w.x + 6, w.y - 14, 6, 9); } }
      if (phase === 'day' && actual === 3) { c.strokeStyle = '#ffffff70'; c.lineWidth = 1; for (let i = 0; i < 40; i++) { const x = (i * 37 + t * 60) % W, y = (i * 53 + t * 400) % 430; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 10); c.stroke(); } }
      // header
      c.fillStyle = '#00000060'; c.fillRect(0, 0, W, 54); c.fillStyle = '#fff'; c.font = '400 10px "Press Start 2P", monospace'; c.textAlign = 'left';
      c.fillText(`DAY ${day}/${DAYS}`, 12, 22); c.fillText(`$${(cash / 100).toFixed(2)}`, 12, 42);
      c.textAlign = 'right'; c.fillText(phase === 'plan' ? `FORECAST: ${WEATHER[wx].k}` : phase === 'day' ? `TODAY: ${WEATHER[actual].k}` : 'NIGHT', W - 12, 22);
      if (phase === 'day') { c.fillText(`SOLD ${sold}/${made}`, W - 12, 42); }
      if (phase === 'plan') {
        c.fillStyle = '#ffffffe8'; c.beginPath(); c.roundRect(16, 446, W - 32, 180, 16); c.fill();
        const row = (y, label, val, sub) => {
          c.fillStyle = '#5a3a22'; c.font = '600 14px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText(label, 32, y + 6); c.font = '600 11px Rubik, sans-serif'; c.fillStyle = '#8a6a4a'; c.fillText(sub, 32, y + 24);
          c.fillStyle = '#ffd34a'; c.beginPath(); c.roundRect(176, y - 16, 44, 40, 10); c.fill(); c.beginPath(); c.roundRect(296, y - 16, 44, 40, 10); c.fill();
          c.fillStyle = '#5a3a22'; c.font = '800 22px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('−', 198, y + 11); c.fillText('+', 318, y + 11); c.font = '800 18px Rubik, sans-serif'; c.fillText(val, 258, y + 10);
        };
        row(480, 'Cups to make', String(cups), `${CUP_COST}¢ each = $${(cups * CUP_COST / 100).toFixed(2)}`);
        row(540, 'Price per cup', `${price}¢`, 'hot days pay more');
        c.fillStyle = '#5ac85a'; c.beginPath(); c.roundRect(96, 578, 168, 40, 12); c.fill(); c.fillStyle = '#fff'; c.font = '400 11px "Press Start 2P", monospace'; c.fillText('OPEN STAND', 180, 603);
      }
      if (phase === 'night' && result) {
        c.fillStyle = '#ffffffe8'; c.beginPath(); c.roundRect(40, 140, W - 80, 160, 16); c.fill(); c.fillStyle = '#5a3a22'; c.textAlign = 'center'; c.font = '600 15px Rubik, sans-serif';
        c.fillText(`Sold ${result.sold} of ${result.made} cups`, W / 2, 180); c.fillText(`Takings $${(result.income / 100).toFixed(2)}  ·  Costs $${(result.cost / 100).toFixed(2)}`, W / 2, 212);
        c.fillStyle = result.profit >= 0 ? '#2e8a4a' : '#d03a3a'; c.font = '400 16px "Press Start 2P", monospace'; c.fillText(`${result.profit >= 0 ? '+' : '−'}$${(Math.abs(result.profit) / 100).toFixed(2)}`, W / 2, 262);
      }
    },
    down(x, y) {
      if (phase !== 'plan') return;
      const maxCups = Math.floor(cash / CUP_COST);
      if (y > 460 && y < 506) { if (x > 172 && x < 224) cups = Math.max(0, cups - 5); if (x > 292 && x < 344) cups = Math.min(maxCups, cups + 5); haptic('tick'); }
      else if (y > 520 && y < 566) { if (x > 172 && x < 224) price = Math.max(10, price - 5); if (x > 292 && x < 344) price = Math.min(200, price + 5); haptic('tick'); }
      else if (y > 576 && y < 620 && x > 96 && x < 264) open();
    },
    key(k, d) { if (d && k === ' ' && phase === 'plan') { cups = Math.min(Math.floor(cash / CUP_COST), [45, 35, 20, 8][wx]); price = [75, 55, 45, 35][wx]; open(); } },
  };
}

export default {
  id: 'lemonade-stand', title: 'Lemonade Stand', tag: 'Casual · Strategy', retro: false, w: W, h: H, goal: 50,
  hint: 'Each morning read the forecast, choose how many cups to make and what to charge, then open up. Hot days sell more. Unsold cups are wasted. Score is your profit in dollars after five days.',
  make,
};
