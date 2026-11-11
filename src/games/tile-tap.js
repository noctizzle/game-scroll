import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects;

// Rows of tiles scroll down; tap the lit tile in each row before it leaves the screen. Tapping an empty cell ends the run.
const W = 360, H = 640, COLS = 4, CW = W / COLS, TH = 150;
const NOTES = [262, 294, 330, 349, 392, 440, 494, 523];

function make(api) {
  const feel = new Feel({ sound: false, buzz: false });   // the game has its own sounds and buzzes
  let rows, off, speed, score, t, miss, bad, dead;
  function addRow(y) { rows.push({ y, col: Math.random() * COLS | 0, hit: false }); }
  return {
    reset() { rows = []; for (let i = 0; i < 6; i++) addRow(H - TH * (i + 2)); off = 0; speed = 260; score = 0; t = 0; miss = null; bad = null; dead = 0; feel.clear(); },
    update(dt) {
      feel.update(dt); t += dt; speed = score ? Math.min(780, 260 + score * 6) : 0;
      for (const r of rows) r.y += speed * dt;
      const top = Math.min(...rows.map(r => r.y)); if (top > -TH) addRow(top - TH);
      for (const r of rows) if (!r.hit && r.y > H) { miss = r; sfx(130, .4, 'triangle', .06, -60); haptic('error'); feel.juice.shake(8); return api.over(); }
      rows = rows.filter(r => r.y < H + TH);
    },
    fx(dt) { dead += dt; feel.update(dt); if (miss && dead < .3) for (const r of rows) r.y -= 400 * dt; },
    draw(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#13213a'); g.addColorStop(1, '#0a0f1e'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      feel.begin(c);
      c.fillStyle = '#ffffff12'; for (let i = 1; i < COLS; i++) c.fillRect(i * CW - 1, 0, 2, H);
      for (const r of rows) {
        const x = r.col * CW + 6, y = r.y + 6, w = CW - 12, h = TH - 12;
        if (r.hit) { c.fillStyle = '#ffffff14'; c.beginPath(); c.roundRect(x, y, w, h, 14); c.fill(); continue; }
        const flash = r === miss && (dead * 8 | 0) % 2;
        const tg = c.createLinearGradient(0, y, 0, y + h); tg.addColorStop(0, flash ? '#ff4d6d' : '#4fd1ff'); tg.addColorStop(1, flash ? '#b3123a' : '#3b6cff');
        c.fillStyle = tg; c.beginPath(); c.roundRect(x, y, w, h, 14); c.fill();
        c.fillStyle = '#ffffff40'; c.beginPath(); c.roundRect(x + 8, y + 8, w - 16, 10, 5); c.fill();
      }
      if (bad) { c.fillStyle = (dead * 8 | 0) % 2 ? '#ff4d6d' : '#ff4d6d55'; c.beginPath(); c.roundRect(bad.x + 6, bad.y + 6, CW - 12, TH - 12, 14); c.fill(); }
      c.fillStyle = '#ffffff22'; c.fillRect(0, H - 4, W, 4);
      feel.end(c, W, H);
    },
    down(x, y) {
      const col = Math.min(COLS - 1, x / CW | 0);
      const r = rows.find(r => !r.hit && r.col === col && y >= r.y - 10 && y <= r.y + TH + 10);
      if (r) { r.hit = true; score++; api.score(score); sfx(NOTES[score % NOTES.length] * 2, .12, 'triangle', .06); haptic('light'); feel.juice.burst(col * CW + CW / 2, clamp(y, r.y + 20, r.y + TH - 20), { n: 8, speed: 150, life: .3, size: 3.5, color: ['#4fd1ff', '#ffffff'] }); return; }
      const lane = rows.find(r => y >= r.y && y <= r.y + TH);
      bad = { x: col * CW, y: lane ? lane.y : y - TH / 2 }; sfx(110, .4, 'sawtooth', .06, -40); haptic('error'); feel.juice.shake(8); api.over();
    },
    key(k, d) { if (!d) return; const col = { '1': 0, '2': 1, '3': 2, '4': 3, d: 0, f: 1, j: 2, k: 3 }[k]; if (col == null) return; const r = rows.filter(r => !r.hit).sort((a, b) => b.y - a.y)[0]; if (r) this.down(col * CW + CW / 2, r.y + TH / 2); },
  };
}

export default {
  id: 'tile-tap', title: 'Tile Tap', tag: 'Casual · Rhythm', retro: false, w: W, h: H,
  hint: 'Tap every blue tile before it slides off. Never tap an empty space.',
  goal: 60,
  make,
};
