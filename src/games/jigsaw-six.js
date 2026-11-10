// Jigsaw Six: a little picture is cut into pieces and tipped into the tray. Drag each piece to where it
// belongs in the frame; it snaps in when it's close. Finish before the sand runs out. Six pieces at
// first, then nine, then twelve, and every picture is painted fresh.
import gs from '../gamescroll.js';
const { Feel } = gs.effects;
const { haptic } = gs.device;
const { sfx, notes } = gs.sound;
const { rng } = gs.math;
const { clamp } = gs.util;

let W = 360, H = 640;

function make(api) {
  const feel = new Feel();
  let pieces, cols, rows, seed, kind, held, score, solved, time, tmax, t, banner, ended;
  const FW = () => W - 40, FH = () => Math.round((W - 40) * .7), FX = 20, FY = 70;

  // paint the whole picture at (x, y) size w x h; pieces clip a window of it
  function paint(c, x, y, w, h) {
    const r = rng(seed);
    c.save(); c.translate(x, y);
    if (kind === 0) {   // hills at sunset
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ff9e00'); g.addColorStop(1, '#ff4d6d'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff3b0'; c.beginPath(); c.arc(w * (.2 + r() * .6), h * .45, h * .16, 0, 7); c.fill();
      for (let k = 0; k < 3; k++) { c.fillStyle = ['#7b2cbf', '#5a189a', '#3c096c'][k]; c.beginPath(); c.moveTo(0, h); for (let i = 0; i <= 10; i++) c.lineTo(w * i / 10, h * (.55 + k * .12) + Math.sin(i * (1 + r()) + k * 2) * h * .07); c.lineTo(w, h); c.fill(); }
      for (let i = 0; i < 6; i++) { const tx = r() * w, ty = h * .8 + r() * h * .15; c.fillStyle = '#10002b'; c.beginPath(); c.moveTo(tx, ty - h * .18); c.lineTo(tx - 10, ty); c.lineTo(tx + 10, ty); c.fill(); }
    } else if (kind === 1) {   // sea with a boat
      c.fillStyle = '#a2d2ff'; c.fillRect(0, 0, w, h * .55); c.fillStyle = '#0077b6'; c.fillRect(0, h * .55, w, h * .45);
      for (let i = 0; i < 4; i++) { c.fillStyle = '#ffffff'; const cx = r() * w, cy = h * (.1 + r() * .25); c.beginPath(); c.arc(cx, cy, 14, 0, 7); c.arc(cx + 16, cy - 6, 18, 0, 7); c.arc(cx + 34, cy, 13, 0, 7); c.fill(); }
      c.fillStyle = '#90e0ef'; for (let i = 0; i < 14; i++) c.fillRect(r() * w, h * (.6 + r() * .35), 30, 3);
      const bx = w * (.25 + r() * .4); c.fillStyle = '#9c6644'; c.beginPath(); c.moveTo(bx, h * .55); c.lineTo(bx + 90, h * .55); c.lineTo(bx + 75, h * .66); c.lineTo(bx + 15, h * .66); c.fill();
      c.fillStyle = '#fefae0'; c.beginPath(); c.moveTo(bx + 45, h * .2); c.lineTo(bx + 45, h * .52); c.lineTo(bx + 85, h * .52); c.fill(); c.fillStyle = '#e63946'; c.beginPath(); c.moveTo(bx + 42, h * .25); c.lineTo(bx + 42, h * .52); c.lineTo(bx + 10, h * .52); c.fill();
    } else if (kind === 2) {   // space
      c.fillStyle = '#0b090a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; for (let i = 0; i < 60; i++) c.fillRect(r() * w, r() * h, 2, 2);
      const px = w * (.3 + r() * .4), py = h * (.4 + r() * .2), pr = h * .28; c.fillStyle = '#f4a261'; c.beginPath(); c.arc(px, py, pr, 0, 7); c.fill();
      c.fillStyle = '#e76f51'; c.fillRect(px - pr * .9, py - pr * .3, pr * 1.8, pr * .2); c.fillRect(px - pr * .8, py + pr * .2, pr * 1.6, pr * .15);
      c.strokeStyle = '#e9c46a'; c.lineWidth = 6; c.beginPath(); c.ellipse(px, py, pr * 1.6, pr * .35, -.3, 0, 7); c.stroke();
      c.fillStyle = '#2a9d8f'; c.beginPath(); c.arc(w * (r() < .5 ? .15 : .85), h * .2, h * .08, 0, 7); c.fill();
    } else {   // town
      c.fillStyle = '#caf0f8'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd60a'; c.beginPath(); c.arc(w * .85, h * .2, h * .1, 0, 7); c.fill();
      let x0 = 0; while (x0 < w) { const bw = 30 + r() * 40, bh = h * (.3 + r() * .45); c.fillStyle = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f', '#8338ec'][r() * 5 | 0]; c.fillRect(x0, h - bh, bw - 3, bh); c.fillStyle = '#fff8'; for (let yy = h - bh + 10; yy < h - 14; yy += 18) for (let xx = x0 + 6; xx < x0 + bw - 12; xx += 12) c.fillRect(xx, yy, 6, 8); x0 += bw; }
      c.fillStyle = '#6c757d'; c.fillRect(0, h * .92, w, h * .08);
    }
    c.restore();
  }

  function newPuzzle() {
    seed = Math.random() * 1e6 | 0; kind = solved % 4;
    [cols, rows] = solved < 2 ? [3, 2] : solved < 5 ? [3, 3] : [4, 3];
    const pw = FW() / cols, ph = FH() / rows;
    pieces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const tx = FX + c * pw, ty = FY + r * ph;
      pieces.push({ c, r, tx, ty, x: 24 + Math.random() * (W - 48 - pw), y: FY + FH() + 30 + Math.random() * (H - FY - FH() - 60 - ph), w: pw, h: ph, done: false, z: Math.random() });
    }
    pieces.sort((a, b) => a.z - b.z);
    tmax = time = 20 + pieces.length * 5; held = null;
  }

  return {
    reset() { score = 0; solved = 0; t = 0; banner = null; ended = false; newPuzzle(); feel.clear(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (feel.frozen) return;
      t += dt;
      if (banner) { banner.l -= dt; if (banner.l <= 0) { const b = banner; banner = null; if (b.over) return api.over(); newPuzzle(); } return; }
      time -= dt;
      if (time <= 0 && !ended) { ended = true; feel.lose(); banner = { txt: 'Out of time', l: 1.2, over: true }; }
    },
    draw(c) {
      c.fillStyle = '#6d597a'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff10'; for (let i = 0; i < 40; i++) c.fillRect((i * 83) % W, (i * 47) % H, 4, 4);
      // frame with a faint ghost of the picture
      c.fillStyle = '#3d2b3d'; c.fillRect(FX - 6, FY - 6, FW() + 12, FH() + 12);
      c.save(); c.globalAlpha = .15; paint(c, FX, FY, FW(), FH()); c.restore();
      c.strokeStyle = '#ffffff20'; c.lineWidth = 1; for (let i = 1; i < cols; i++) { c.beginPath(); c.moveTo(FX + FW() * i / cols, FY); c.lineTo(FX + FW() * i / cols, FY + FH()); c.stroke(); } for (let i = 1; i < rows; i++) { c.beginPath(); c.moveTo(FX, FY + FH() * i / rows); c.lineTo(FX + FW(), FY + FH() * i / rows); c.stroke(); }
      // sand timer bar
      c.fillStyle = '#00000040'; c.fillRect(FX, 40, FW(), 8); c.fillStyle = time / tmax < .25 ? '#ff6b6b' : '#ffd166'; c.fillRect(FX, 40, FW() * Math.max(0, time / tmax), 8);
      feel.begin(c);
      for (const p of pieces) {
        const lift = p === held ? 4 : 0;
        if (!p.done) { c.fillStyle = '#00000050'; c.fillRect(p.x + 4, p.y + 5, p.w, p.h); }
        c.save(); c.beginPath(); c.rect(p.x - lift, p.y - lift, p.w, p.h); c.clip();
        paint(c, p.x - lift - (p.tx - FX), p.y - lift - (p.ty - FY), FW(), FH());
        c.restore();
        if (!p.done) { c.strokeStyle = p === held ? '#ffd166' : '#ffffffa0'; c.lineWidth = 2; c.strokeRect(p.x - lift, p.y - lift, p.w, p.h); }
      }
      feel.end(c, W, H);
      c.textAlign = 'center'; c.fillStyle = '#ffffffc0'; c.font = '600 13px Rubik, sans-serif';
      c.fillText(`${pieces.filter(p => p.done).length} / ${pieces.length} pieces`, W / 2, H - 16);
      if (solved === 0 && t < 5) c.fillText('Drag pieces into the frame', W / 2, FY + FH() + 22);
      if (banner) { c.fillStyle = '#000000b0'; c.fillRect(0, H * .45 - 34, W, 64); c.fillStyle = '#fff'; c.font = '800 24px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H * .45 + 6); }
    },
    down(x, y) {
      if (banner) return;
      for (let i = pieces.length - 1; i >= 0; i--) { const p = pieces[i]; if (!p.done && x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) { held = p; held.ox = x - p.x; held.oy = y - p.y; pieces.splice(i, 1); pieces.push(p); sfx(700, .02, 'square', .02); haptic('tick'); return; } }
    },
    move(x, y, pr) { if (held && pr) { held.x = clamp(x - held.ox, -held.w / 2, W - held.w / 2); held.y = clamp(y - held.oy, 0, H - held.h / 2); } },
    up() {
      if (!held) return; const p = held; held = null;
      if (Math.hypot(p.x - p.tx, p.y - p.ty) < Math.min(p.w, p.h) * .35) {
        p.x = p.tx; p.y = p.ty; p.done = true; pieces.splice(pieces.indexOf(p), 1); pieces.unshift(p);
        sfx(900, .05, 'triangle', .04); haptic('light');
        if (pieces.every(q => q.done)) {
          solved++; const pts = pieces.length / 3 + Math.floor(time / tmax * 4); score += pts; api.score(score);
          notes('C5 E5 G5 C6', { len: .06 }); feel.win(W / 2, FY + FH() / 2); haptic('success'); banner = { txt: `Done! +${pts}`, l: 1.4 };
        }
      } else sfx(400, .03, 'square', .02);
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'jigsaw-six',
  title: 'Jigsaw Six',
  tag: 'Casual · Puzzle',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 30,
  hint: 'Drag the pieces into the frame where they belong; they snap in when close. Finish the picture before the sand runs out.',
  make,
};
