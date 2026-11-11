// Ink Ward: jelly blobs pour from a spout. Draw springy ink lines to bounce them past the spikes and
// into the jar. Each level gives you a pot of ink; tap a line to rub it out and get the ink back.
import gs from '../gamescroll.js';
const { Physics } = gs.physics;
const { Stroke } = gs.strokes;
const { Feel } = gs.effects; const { Ready } = gs.rounds;
const { haptic } = gs.device;
const { sfx, sounds } = gs.sound;
const { rng } = gs.math;

let W = 360, H = 640;
const BR = 9, COLS = ['#ff5d8f', '#ffb547', '#5ad1ff', '#8ee05a', '#b48cff'];

function make(api) {
  const feel = new Feel();
  const ready = new Ready({ eat: false, text: 'Draw a line to start' });   // the spout waits for the first line
  let phys, level, lines, stroke, ink, inkMax, blobs, left, jar, inJar, need, spout, pour, spikes, score, t, banner, ended, erasing;

  function segDist(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l));
    return Math.hypot(px - a[0] - dx * k, py - a[1] - dy * k);
  }
  const lineNear = (x, y) => lines.find(l => l.pts.some((p, i) => i && segDist(x, y, l.pts[i - 1], p) < 16));

  function build() {
    phys?.free?.();
    phys = new Physics({ gravity: 700, scale: 30 });
    const r = rng(level * 977 + 13);
    lines = []; blobs = []; spikes = []; stroke = null; inJar = 0; ended = 0;
    phys.line([[0, -200], [0, H + 50]]); phys.line([[W, -200], [W, H + 50]]);
    spout = { x: r.range(50, W - 50), y: 70 };
    // the jar sits low, away from under the spout
    let jx; do { jx = r.range(60, W - 60); } while (Math.abs(jx - spout.x) < 90);
    jar = { x: jx, y: H - 150, w: 84, h: 70 };
    phys.line([[jar.x - jar.w / 2 - 6, jar.y - 6], [jar.x - jar.w / 2, jar.y + jar.h], [jar.x + jar.w / 2, jar.y + jar.h], [jar.x + jar.w / 2 + 6, jar.y - 6]], { friction: .6, bounce: .05 });
    // spike bars between spout and jar
    const n = Math.min(4, 1 + Math.floor(level / 2));
    for (let i = 0; i < n; i++) {
      const w = r.range(70, 130), x = r.range(w / 2 + 10, W - w / 2 - 10), y = r.range(190, H - 250);
      if (Math.abs(y - jar.y) < 80 && Math.abs(x - jar.x) < w / 2 + 50) continue;
      spikes.push({ x, y, w, thing: phys.box(x, y, w, 12, { fixed: true, tag: 'spike' }) });
    }
    // a ledge right under the spout from level 3, so the first bounce matters
    if (level >= 3) { const lx = spout.x + (r() < .5 ? -1 : 1) * 30; phys.line([[lx - 40, 150], [lx + 40, 158]]); spikes.push({ ledge: true, x: lx, y: 154 }); }
    left = 14 + Math.min(6, level); need = Math.min(left - 3, 7 + level);
    inkMax = ink = 700 + level * 40; pour = -2.2;
    phys.onHit((a, b) => {
      const blob = a.tag === 'blob' ? a : b.tag === 'blob' ? b : null, other = blob === a ? b : a;
      if (blob && other.tag === 'spike' && !blob.popped) { blob.popped = true; feel.hit(blob.x, blob.y, { power: .5 }); feel.juice.burst(blob.x, blob.y, { n: 12, speed: 160, color: blob.col, gravity: 400 }); haptic('warning'); }
      if (blob && other.tag === 'ink') sfx(300 + Math.random() * 200, .05, 'sine', .03, 300);
    });
    banner = { txt: `LEVEL ${level}`, sub: `${need} IN THE JAR`, l: 2 };
  }

  function addLine(s) {
    const pts = s.simplify(3); if (pts.length < 2) return;
    const thing = phys.line(pts, { bounce: .55, friction: .1, tag: 'ink' });
    lines.push({ pts, thing, cost: s.length });
  }

  return {
    reset() { level = 1; score = 0; t = 0; erasing = null; build(); feel.clear(); ready.reset(); },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      feel.update(dt); if (!ready.update(dt) || feel.frozen) return;
      t += dt; if (banner) { banner.l -= dt; if (banner.l <= 0) banner = null; }
      if (ended) { ended -= dt; if (ended <= 0) { if (inJar >= need) { level++; build(); } else api.over(); } return; }
      pour += dt;
      if (pour > .75 && left > 0) { pour = 0; left--; const b = phys.circle(spout.x + (Math.random() - .5) * 4, spout.y + 14, BR, { bounce: .35, friction: .2, tag: 'blob' }); b.col = COLS[(Math.random() * COLS.length) | 0]; blobs.push(b); sfx(500, .06, 'sine', .04, -200); }
      phys.step(dt);
      for (const b of blobs) {
        if (b.popped) { b.remove(); b.gone = true; continue; }
        if (b.y > H + 30) { b.remove(); b.gone = true; continue; }
        if (b.x > jar.x - jar.w / 2 && b.x < jar.x + jar.w / 2 && b.y > jar.y + 10 && Math.hypot(b.vx, b.vy) < 120 && !b.counted) {
          b.counted = true; inJar++; score++; api.score(score); feel.coin(b.x, b.y); feel.combo(inJar, jar.x, jar.y - 20);
          if (inJar === need) { feel.powerup(jar.x, jar.y); feel.juice.pop(jar.x, jar.y - 50, 'FULL!', { color: '#2a9d5c' }); }
        }
      }
      blobs = blobs.filter(b => !b.gone);
      // settled blobs in the jar fade out to keep things tidy
      for (const b of blobs) if (b.counted) { b.fade = (b.fade || 0) + dt; if (b.fade > 3) { b.remove(); b.gone = true; } }
      blobs = blobs.filter(b => !b.gone);
      if (left === 0 && blobs.every(b => b.counted || Math.hypot(b.vx, b.vy) < 5) && pour > 2.5) {
        ended = 1.4;
        if (inJar >= need) { feel.win(W / 2, H / 2); banner = { txt: 'JAR FULL!', sub: `+${Math.round(ink / 50)} INK BONUS`, l: 1.4 }; score += Math.round(ink / 50); api.score(score); }
        else { feel.lose(); banner = { txt: 'NOT ENOUGH', sub: `${inJar} / ${need}`, l: 1.4 }; }
      }
    },
    draw(c) {
      c.fillStyle = '#f7f1e3'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#d9e6f2'; c.lineWidth = 1; for (let y = 40; y < H; y += 28) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.strokeStyle = '#f2b8b8'; c.beginPath(); c.moveTo(34, 0); c.lineTo(34, H); c.stroke();
      feel.begin(c);
      // spout
      c.fillStyle = '#6c757d'; c.fillRect(spout.x - 26, 0, 52, spout.y - 10); c.fillRect(spout.x - 14, spout.y - 12, 28, 16);
      c.fillStyle = '#495057'; c.fillRect(spout.x - 26, spout.y - 16, 52, 6);
      // spikes and ledges
      for (const s of spikes) {
        if (s.ledge) { c.strokeStyle = '#495057'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(s.x - 40, 150); c.lineTo(s.x + 40, 158); c.stroke(); continue; }
        c.fillStyle = '#343a40'; c.fillRect(s.x - s.w / 2, s.y - 3, s.w, 9);
        c.fillStyle = '#e63946';
        for (let x = s.x - s.w / 2; x < s.x + s.w / 2 - 2; x += 10) { c.beginPath(); c.moveTo(x, s.y - 3); c.lineTo(x + 5, s.y - 13); c.lineTo(x + 10, s.y - 3); c.fill(); c.beginPath(); c.moveTo(x, s.y + 6); c.lineTo(x + 5, s.y + 15); c.lineTo(x + 10, s.y + 6); c.fill(); }
      }
      // jar
      const jl = jar.x - jar.w / 2, jr = jar.x + jar.w / 2, fill = Math.min(1, inJar / need);
      c.fillStyle = '#9be7b4'; c.fillRect(jl + 2, jar.y + jar.h - fill * (jar.h - 6), jar.w - 4, fill * (jar.h - 6));
      c.strokeStyle = '#4a6fa5'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath(); c.moveTo(jl - 6, jar.y - 6); c.lineTo(jl, jar.y + jar.h); c.lineTo(jr, jar.y + jar.h); c.lineTo(jr + 6, jar.y - 6); c.stroke();
      c.fillStyle = '#4a6fa5'; c.font = '700 18px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText(`${inJar}/${need}`, jar.x, jar.y + jar.h + 26);
      // ink lines
      for (const l of lines) {
        c.strokeStyle = l === erasing ? '#e63946' : '#1d3557'; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); l.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
      }
      stroke?.draw(c, { width: 7, color: '#457b9d' });
      // blobs
      for (const b of blobs) {
        const s = 1 + Math.min(.25, Math.hypot(b.vx, b.vy) / 3000), a = b.counted ? Math.max(0, 1 - (b.fade || 0) / 3) : 1;
        c.globalAlpha = a; c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx)); c.scale(s, 1 / s);
        c.fillStyle = b.col; c.beginPath(); c.arc(0, 0, BR + 1, 0, 7); c.fill(); c.restore();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x - 3, b.y - 2, 3, 0, 7); c.arc(b.x + 3, b.y - 2, 3, 0, 7); c.fill();
        c.fillStyle = '#222'; c.beginPath(); c.arc(b.x - 3 + b.vx / 400, b.y - 2 + b.vy / 400, 1.5, 0, 7); c.arc(b.x + 3 + b.vx / 400, b.y - 2 + b.vy / 400, 1.5, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
      feel.end(c, W, H);
      c.textAlign = 'center';
      // HUD: ink pot and drops left
      c.fillStyle = '#1d355722'; c.fillRect(16, H - 36, W - 32, 14); c.fillStyle = ink < inkMax * .15 ? '#e63946' : '#1d3557'; c.fillRect(16, H - 36, (W - 32) * ink / inkMax, 14);
      c.fillStyle = '#1d3557'; c.font = '600 13px Rubik, sans-serif'; c.textAlign = 'left'; c.fillText('INK', 16, H - 44);
      c.textAlign = 'right'; c.fillText(`${left} blobs to come · level ${level}`, W - 16, H - 44);
      if (banner) { c.fillStyle = '#1d3557'; c.textAlign = 'center'; c.font = '800 34px Rubik, sans-serif'; c.fillText(banner.txt, W / 2, H / 2 - 40); c.font = '600 18px Rubik, sans-serif'; c.fillText(banner.sub, W / 2, H / 2 - 12); }
      if (t < 4 && level === 1) { c.fillStyle = '#457b9d'; c.font = '600 15px Rubik, sans-serif'; c.textAlign = 'center'; c.fillText('Draw lines to bounce blobs into the jar', W / 2, H / 2 + 20); c.fillText('Tap a line to rub it out', W / 2, H / 2 + 42); }
      ready.draw(c, W, H, { color: '#1d3557', shadow: null, y: H / 2 + 78 });
    },
    down(x, y) { ready.go(); if (ended) return; erasing = lineNear(x, y); stroke = new Stroke().add(x, y); },
    move(x, y, p) {
      if (!p || !stroke || ended) return;
      const before = stroke.length; stroke.add(x, y);
      if (stroke.length > 14) erasing = null;
      ink -= stroke.length - before;
      if (ink <= 0) { ink = 0; addLine(stroke); stroke = null; haptic('warning'); sounds.hurt(); }
    },
    up() {
      if (!stroke) return;
      if (erasing && stroke.length < 14) {
        ink = Math.min(inkMax, ink + stroke.length + erasing.cost); erasing.thing.remove(); lines = lines.filter(l => l !== erasing);
        sfx(200, .1, 'sawtooth', .03, -100); haptic('light');
      } else if (stroke.length >= 14) { addLine(stroke); haptic('tick'); sfx(700, .05, 'triangle', .03, 200); }
      else ink = Math.min(inkMax, ink + stroke.length);
      stroke = null; erasing = null;
    },
  };
}

/** @type {import('../gamescroll.js').GameDef} */
export default {
  id: 'ink-ward',
  title: 'Ink Ward',
  tag: 'Casual · Drawing',
  retro: false,
  w: 360, h: 640, maxH: 800,
  goal: 25,
  hint: 'Draw springy ink lines to bounce the falling blobs past the spikes and into the jar. Tap a line to rub it out.',
  make,
};
