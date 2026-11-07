import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { backdrop, box, ball, shadow, glow } from '../kit/gfx.js';

// Fight up through an island jungle in a power suit and reach the chopper. Drag anywhere to walk;
// the suit fires on its own at the nearest guard. Four suit modes share one energy bar: ARMOR soaks
// hits, CLOAK hides you (your first shot out of cloak hits triple), SPEED doubles your pace, POWER
// makes every round punch through. Energy refills in ARMOR when nothing is hitting you.
let W = 200, H = 260;
const MODES = [
  { k: 'ARMOR', col: '#58a8f8' }, { k: 'CLOAK', col: '#a8f8f8' }, { k: 'SPEED', col: '#f8d048' }, { k: 'POWER', col: '#f85858' },
];

function make(api) {
  let p, trees, foes, shots, bolts, parts, cam, L, stage, score, t, mode, energy, msg, stick, dead, cleared, fireT, ambush, hurtT;
  const barH = 30, top = 12;
  function build() {
    L = 1300 + stage * 260; trees = []; foes = []; shots = []; bolts = []; parts = [];
    // trees always leave a walkable gap between each other and the edges
    for (let i = 0; i < L / 22; i++) { const r = rnd(9, 16), tr = { x: rnd(r + 14, W - r - 14), y: rnd(80, L - 60), r }; if (Math.abs(tr.x - W / 2) < 30 && tr.y > L - 140) continue; if (trees.some(o => Math.hypot(o.x - tr.x, o.y - tr.y) < o.r + r + 15)) continue; trees.push(tr); }
    const n = 6 + stage * 3;
    for (let i = 0; i < n; i++) {
      const y = 80 + (L - 260) * (i + Math.random() * .6) / n, kind = stage > 0 && Math.random() < .2 + stage * .04 ? 'heavy' : Math.random() < .2 ? 'nest' : 'grunt';
      foes.push({ x: rnd(20, W - 20), y, kind, hp: kind === 'heavy' ? 9 : kind === 'nest' ? 6 : 3, max: kind === 'heavy' ? 9 : kind === 'nest' ? 6 : 3, alert: 0, cd: rnd(.5, 1.5), dir: Math.random() < .5 ? 1 : -1, flash: 0 });
    }
    p = { x: W / 2, y: L - 50, hp: 100 }; cam = p.y - H * .62; energy = 100; mode = 0; ambush = false; cleared = 0; fireT = 0; hurtT = 9;
    msg = { txt: `ZONE ${stage + 1}: REACH THE CHOPPER`, l: 2 };
  }
  function blocked(x, y, r) { for (const tr of trees) if (Math.hypot(x - tr.x, y - tr.y) < tr.r + r) return tr; return null; }
  function push(o, r) { for (const tr of trees) { const dx = o.x - tr.x, dy = o.y - tr.y, d = Math.hypot(dx, dy), m = tr.r + r; if (d < m && d > 0) { o.x = tr.x + dx / d * m; o.y = tr.y + dy / d * m; } } o.x = clamp(o.x, r, W - r); }
  function hurt(dmg) {
    hurtT = 0;
    if (mode === 0) { const soak = Math.min(energy / 2.5, dmg * .6); energy -= soak * 2.5; dmg -= soak; }
    if (mode === 1) { mode = 0; msg = { txt: 'CLOAK BROKEN', l: .8 }; }
    if (dmg > 0) { p.hp -= dmg; haptic('heavy'); sfx(120, .12, 'sawtooth', .05, -40); } else { haptic('light'); sfx(700, .04, 'square', .03, -200); }
    if (p.hp <= 0) { p.hp = 0; dead = .01; haptic('error'); msg = { txt: 'SUIT OFFLINE', l: 9 }; sfx(90, .6, 'sawtooth', .05, -50); }
  }
  const self = {
    reset() { stage = 0; score = 0; t = 0; dead = 0; stick = null; build(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (p) build(); },
    update(dt) {
      t += dt; for (const q of parts) { q.l -= dt; q.x += (q.vx || 0) * dt; q.y += (q.vy || -14) * dt; } parts = parts.filter(q => q.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 2) api.over(); return; }
      if (cleared) { cleared += dt; p.y -= 40 * dt; if (cleared > 2) { stage++; build(); } return; }
      hurtT += dt;
      // energy
      if (mode === 0) { if (hurtT > 1.5) energy = Math.min(100, energy + 10 * dt); }
      else if (mode === 1) energy -= 9 * dt;
      else if (mode === 2 && stick && stick.m > .1) energy -= 16 * dt;
      if (energy <= 0 && mode !== 0) { energy = 0; mode = 0; haptic('medium'); msg = { txt: 'ENERGY OUT', l: .8 }; }
      // move
      if (stick) { const sp = (mode === 2 ? 130 : 66) * stick.m; p.x += Math.cos(stick.a) * sp * dt; p.y += Math.sin(stick.a) * sp * dt; }
      push(p, 6); p.y = clamp(p.y, 20, L - 10);
      cam += (p.y - H * .62 - cam) * Math.min(1, dt * 5); cam = clamp(cam, -top, L - H + barH);
      if (p.y < 44) { cleared = .01; const bonus = Math.round(p.hp) + 50; score += bonus; api.score(score); haptic('success'); sfx(660, .5, 'square', .05, 400); msg = { txt: `EXTRACTED +${bonus}`, l: 2 }; return; }
      // auto fire at nearest visible foe
      fireT -= dt;
      if (mode !== 1 && fireT <= 0) {
        let best = null, bd = 125; for (const f of foes) { const d = Math.hypot(f.x - p.x, f.y - p.y); if (d < bd) { best = f; bd = d; } }
        if (best) { const a = Math.atan2(best.y - p.y, best.x - p.x), pow = mode === 3; shots.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: (pow ? 3 : 1) * (ambush ? 3 : 1), pierce: pow, l: .6, hit: new Set() }); ambush = false; fireT = pow ? .42 : .22; if (pow) energy -= 5; sfx(pow ? 220 : 900, .03, 'square', .03, -300); }
      }
      if (mode === 1) ambush = true;
      // shots
      for (const s of shots) {
        s.l -= dt; s.x += s.vx * dt; s.y += s.vy * dt; if (blocked(s.x, s.y, 0)) s.l = 0;
        for (const f of foes) if (!s.hit.has(f) && Math.hypot(f.x - s.x, f.y - s.y) < 8) { f.hp -= s.dmg; f.flash = .1; f.alert = 3; s.hit.add(f); if (!s.pierce) s.l = 0; if (f.hp <= 0) { const pts = f.kind === 'heavy' ? 30 : f.kind === 'nest' ? 20 : 10; score += pts; api.score(score); parts.push({ txt: `+${pts}`, x: f.x, y: f.y, l: .7 }); for (let i = 0; i < 6; i++) parts.push({ x: f.x, y: f.y, vx: rnd(-40, 40), vy: rnd(-40, 40), l: .4, col: '#f8a040' }); sfx(200, .1, 'square', .05, -100); haptic('light'); } break; }
      }
      shots = shots.filter(s => s.l > 0); foes = foes.filter(f => f.hp > 0);
      // foes
      for (const f of foes) {
        f.flash = Math.max(0, f.flash - dt); const d = Math.hypot(p.x - f.x, p.y - f.y), sees = mode === 1 ? d < 22 : d < 135;
        if (sees) f.alert = 3; else f.alert = Math.max(0, f.alert - dt);
        if (f.kind !== 'nest') {
          if (f.alert > 0 && mode !== 1) { const a = Math.atan2(p.y - f.y, p.x - f.x), want = d > 80 ? 1 : d < 50 ? -1 : 0, sp = f.kind === 'heavy' ? 18 : 30; f.x += Math.cos(a) * sp * want * dt; f.y += Math.sin(a) * sp * want * dt; }
          else { f.x += f.dir * 16 * dt; if (f.x < 16 || f.x > W - 16 || blocked(f.x + f.dir * 6, f.y, 5)) f.dir *= -1; }
          push(f, 6);
        }
        if (f.alert > 0 && mode !== 1 && d < 150) {
          f.cd -= dt;
          if (f.cd <= 0) {
            const a = Math.atan2(p.y - f.y, p.x - f.x), n = f.kind === 'nest' ? 3 : 1;
            for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * .22; bolts.push({ x: f.x, y: f.y, vx: Math.cos(aa) * 110, vy: Math.sin(aa) * 110, l: 2.2, dmg: f.kind === 'heavy' ? 18 + stage * 2 : 9 + stage }); }
            f.cd = (f.kind === 'nest' ? 1.5 : f.kind === 'heavy' ? 1.4 : 1.1) * Math.max(.65, 1 - stage * .06); sfx(400, .03, 'square', .02, -200);
          }
        }
      }
      for (const b of bolts) { b.l -= dt; b.x += b.vx * dt; b.y += b.vy * dt; if (blocked(b.x, b.y, 0)) b.l = 0; if (Math.hypot(b.x - p.x, b.y - p.y) < 6) { b.l = 0; hurt(b.dmg); if (dead) return; } }
      bolts = bolts.filter(b => b.l > 0);
    },
    draw(c) {
      backdrop(c, 0, 0, W, H, '#3a5c2e', '#22401c');
      c.save(); c.translate(0, -cam);
      c.fillStyle = '#365a2c'; for (let y = Math.floor(cam / 40) * 40; y < cam + H; y += 40) for (let x = (y / 40 % 2) * 20; x < W; x += 40) c.fillRect(x, y, 14, 3);
      // landing pad
      box(c, W / 2 - 30, 8, 60, 36, '#707860', { r: 4 }); c.fillStyle = '#f8f8f0'; c.font = '8px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText('H', W / 2, 31);
      const rot = t * 18; c.strokeStyle = '#202820'; c.lineWidth = 2; c.beginPath(); c.moveTo(W / 2 + Math.cos(rot) * 26, 26 + Math.sin(rot) * 8); c.lineTo(W / 2 - Math.cos(rot) * 26, 26 - Math.sin(rot) * 8); c.stroke(); c.lineWidth = 1;
      for (const f of foes) { if (f.y < cam - 20 || f.y > cam + H + 20) continue; const fc = f.flash ? '#f8f8f8' : f.kind === 'heavy' ? '#806048' : f.kind === 'nest' ? '#686860' : '#a07848'; shadow(c, f.x + 2, f.y + 6, 9, 3, .35); if (f.kind === 'nest') { box(c, f.x - 8, f.y - 6, 16, 12, fc, { r: 2 }); box(c, f.x - 2, f.y - 9, 4, 6, '#404038', { r: 1, drop: false }); } else ball(c, f.x, f.y, f.kind === 'heavy' ? 7 : 5, fc);
        if (f.alert > 0 && mode !== 1) { c.fillStyle = '#f84040'; c.fillText('!', f.x, f.y - 9); } if (f.hp < f.max) { c.fillStyle = '#300'; c.fillRect(f.x - 7, f.y + 8, 14, 2); c.fillStyle = '#f84040'; c.fillRect(f.x - 7, f.y + 8, 14 * f.hp / f.max, 2); } }
      for (const s of shots) { glow(c, s.x, s.y, s.pierce ? 6 : 4, s.pierce ? '#f87858' : '#f8f8a0', .7); c.fillStyle = s.pierce ? '#f87858' : '#f8f8a0'; c.fillRect(s.x - 1, s.y - 1, s.pierce ? 3 : 2, s.pierce ? 3 : 2); }
      for (const b of bolts) { glow(c, b.x, b.y, 7, '#f84040', .6); ball(c, b.x, b.y, 2.5, '#f84040', { gloss: .5 }); }
      // you
      const m = MODES[mode]; c.globalAlpha = mode === 1 ? .35 + Math.sin(t * 8) * .1 : 1;
      shadow(c, p.x + 2, p.y + 6, 8, 3, .4); ball(c, p.x, p.y, 6, '#384858'); c.strokeStyle = m.col; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 6, 0, 7); c.stroke(); c.lineWidth = 1;
      if (mode === 2 && stick) { c.fillStyle = '#f8d04860'; c.fillRect(p.x - Math.cos(stick.a) * 12 - 2, p.y - Math.sin(stick.a) * 12 - 2, 4, 4); }
      c.globalAlpha = 1;
      for (const tr of trees) { if (tr.y < cam - 20 || tr.y > cam + H + 20) continue; shadow(c, tr.x + 4, tr.y + 5, tr.r * 1.2, tr.r * .8, .45); ball(c, tr.x, tr.y, tr.r, '#3c7a30', { gloss: .15 }); ball(c, tr.x - tr.r * .3, tr.y - tr.r * .3, tr.r * .5, '#4c9a40', { gloss: .2 }); }
      for (const q of parts) { if (q.txt) { c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#f8e048'; c.fillText(q.txt, q.x, q.y); } else { c.fillStyle = q.col; c.fillRect(q.x, q.y, 2, 2); } }
      c.restore();
      if (stick) { c.strokeStyle = '#ffffff50'; c.beginPath(); c.arc(stick.x, stick.y, 22, 0, 7); c.stroke(); c.fillStyle = '#ffffff50'; c.beginPath(); c.arc(stick.x + Math.cos(stick.a) * stick.m * 22, stick.y + Math.sin(stick.a) * stick.m * 22, 7, 0, 7); c.fill(); }
      if (p.hp < 40) { c.fillStyle = `rgba(200,0,0,${(.4 - p.hp / 100) * (.6 + Math.sin(t * 6) * .4)})`; c.fillRect(0, 0, W, H); }
      // HUD
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#101810'; c.fillRect(0, 0, W, top);
      c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(`HP`, 3, 9); c.fillStyle = '#402020'; c.fillRect(18, 3, 40, 6); c.fillStyle = '#58d858'; c.fillRect(18, 3, 40 * p.hp / 100, 6);
      c.fillStyle = '#f8f8f0'; c.fillText(`EN`, W - 78, 9); c.fillStyle = '#202840'; c.fillRect(W - 63, 3, 32, 6); c.fillStyle = m.col; c.fillRect(W - 63, 3, 32 * clamp(energy, 0, 100) / 100, 6);
      c.textAlign = 'right'; c.fillStyle = '#f8c060'; c.fillText(String(score), W - 3, 9);
      const bw = W / 4; c.fillStyle = '#101810'; c.fillRect(0, H - barH, W, barH);
      MODES.forEach((md, i) => { const x = i * bw; box(c, x + 2, H - barH + 3, bw - 4, barH - 6, i === mode ? md.col : '#283028', { r: 4, drop: false }); c.fillStyle = i === mode ? '#101810' : md.col; c.textAlign = 'center'; c.fillText(md.k, x + bw / 2, H - barH / 2 + 3); });
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000b'; c.fillRect(0, H * .4 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e048'; c.fillText(msg.txt, W / 2, H * .4); }
      if (t < 6 && stage === 0 && !msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H - barH - 24, W, 22); c.fillStyle = '#f8f8f0'; c.fillText('DRAG TO MOVE, SUIT FIRES ITSELF', W / 2, H - barH - 15); c.fillText('TAP A MODE BELOW', W / 2, H - barH - 6); }
    },
    down(x, y) {
      if (dead || cleared) return;
      if (y > H - barH) { const i = clamp(Math.floor(x / (W / 4)), 0, 3); const nm = i === mode ? 0 : i; if (nm !== 0 && energy < 8) { sfx(150, .05, 'square', .03); return; } mode = nm; haptic('medium'); sfx(300 + i * 150, .08, 'triangle', .04, 300); return; }
      stick = { x, y, a: 0, m: 0 };
    },
    move(x, y, pr) { if (!pr || !stick) return; const dx = x - stick.x, dy = y - stick.y, d = Math.hypot(dx, dy); stick.a = Math.atan2(dy, dx); stick.m = clamp(d / 22, 0, 1); if (d > 30) { stick.x = x - dx / d * 30; stick.y = y - dy / d * 30; } },
    up() { stick = null; },
    key(k, d) { const dirs = { ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowRight: 0 }; if (k in dirs) stick = d ? { x: W / 2, y: H / 2, a: dirs[k], m: 1 } : null; else if (d && '1234'.includes(k)) self.down((+k - .5) * W / 4, H - 5); },
  };
  return self;
}

export default {
  id: 'suit-ops', title: 'Suit Ops', tag: 'Console · Jungle', retro: true, era: 'console', pal: 'moss', w: 200, h: 260, maxW: 300, maxH: 420, goal: 300,
  hint: 'Fight up through the jungle to the chopper. Drag anywhere to walk; your suit fires on its own. Tap a mode: ARMOR soaks hits and recharges energy, CLOAK hides you and makes your first shot triple, SPEED doubles your pace, POWER rounds punch through. Tap the active mode again to go back to ARMOR.',
  make,
};
