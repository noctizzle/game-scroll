import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp, rnd } = gs.util;

// Real-time battle on a 6x3 grid. Your net-runner owns the blue panels, glitch programs own the
// red ones. Tap a blue panel to jump there and dodge; tap the red side to fire your buster down
// your row. Battle chips load into the tray over time: tap one to fire a sword, cannon, bomb,
// wide slash or heal. Clear each wave of glitches before they wear you down.
const CHIPS = {
  SWORD: { col: '#80f8ff', txt: 'SWD' }, WIDE: { col: '#c890ff', txt: 'WID' }, CANNON: { col: '#f8a040', txt: 'CAN' },
  BOMB: { col: '#f86060', txt: 'BMB' }, HEAL: { col: '#88f070', txt: '+HP' },
};
const KEYS = Object.keys(CHIPS);
let W = 160, H = 176;

function make(api) {
  let me, foes, shots, marks, fx, chips, gauge, hp, wave, score, t, busterCd, msg, shake, waveT;
  const TRAY = 30, top = 18;
  const pw = () => Math.floor(W / 6), ph = () => Math.min(Math.floor((H - top - TRAY - 14) / 3), Math.round(pw() * .8));
  const ox = () => (W - pw() * 6) / 2, oy = () => top + Math.max(0, (H - top - TRAY - 6 - ph() * 3) * .6);
  const cell = (c, r) => ({ x: ox() + c * pw() + pw() / 2, y: oy() + r * ph() + ph() / 2 });
  function newWave() {
    wave++; foes = []; const n = Math.min(3, 1 + (wave > 1) + (wave > 3)), kinds = wave < 2 ? ['shooter'] : wave < 4 ? ['shooter', 'dropper'] : ['shooter', 'dropper', 'charger'];
    const used = new Set();
    for (let i = 0; i < n; i++) { let c, r; do { c = 3 + (Math.random() * 3 | 0); r = Math.random() * 3 | 0; } while (used.has(c + ',' + r)); used.add(c + ',' + r);
      const k = kinds[Math.random() * kinds.length | 0]; const base = { shooter: 6, dropper: 7, charger: 9 }[k];
      foes.push({ k, c, r, hp: Math.round(base * (1 + wave * .18)), max: Math.round(base * (1 + wave * .18)), cd: rnd(1.4, 2.4), moveT: rnd(1, 2), warn: 0, hit: 0, dash: null }); }
    msg = { txt: `WAVE ${wave}`, l: 1.2 };
  }
  const occupied = (c, r) => foes.some(f => f.c === c && f.r === r);
  function damageFoe(f, n) {
    if (!f || f.dead) return; f.hp -= n; f.hit = .15; fx.push({ x: cell(f.c, f.r).x, y: cell(f.c, f.r).y - 10, txt: `${n}`, l: .6 });
    if (f.hp <= 0) { f.dead = true; score += 1; api.score(score); haptic('medium'); sfx(180, .25, 'square', .05, -60); for (let i = 0; i < 10; i++) fx.push({ x: cell(f.c, f.r).x, y: cell(f.c, f.r).y, vx: rnd(-60, 60), vy: rnd(-60, 30), l: .4, col: '#f86060' }); }
    else { haptic('light'); sfx(600, .04, 'square', .03); }
  }
  function hurtMe(n) { if (me.inv > 0) return; hp -= n; me.inv = .6; shake = .25; haptic('heavy'); sfx(140, .2, 'sawtooth', .05, -60); fx.push({ x: cell(me.c, me.r).x, y: cell(me.c, me.r).y - 12, txt: `-${n}`, l: .7, col: '#f86060' }); }
  function useChip(i) {
    const ch = chips[i]; if (!ch) return; chips[i] = null; haptic('medium');
    if (ch === 'SWORD' || ch === 'WIDE') { const rows = ch === 'WIDE' ? [0, 1, 2] : [me.r]; for (const r of rows) damageFoe(foes.find(f => !f.dead && f.c === me.c + 1 && f.r === r), ch === 'WIDE' ? 4 : 6); fx.push({ slash: true, c: me.c + 1, rows, l: .2 }); sfx(900, .1, 'sawtooth', .04, -500); }
    else if (ch === 'CANNON') { const f = foes.filter(f => !f.dead && f.r === me.r && f.c > me.c).sort((a, b) => a.c - b.c)[0]; damageFoe(f, 7); fx.push({ beam: true, r: me.r, c: me.c, l: .2 }); sfx(120, .2, 'square', .05, -30); shake = .15; }
    else if (ch === 'BOMB') { const c = Math.min(5, me.c + 3), r = me.r; fx.push({ bomb: true, from: cell(me.c, me.r), to: cell(c, r), l: .45, c, r }); sfx(500, .2, 'triangle', .04, -300); }
    else if (ch === 'HEAL') { hp = Math.min(20, hp + 5); fx.push({ x: cell(me.c, me.r).x, y: cell(me.c, me.r).y - 12, txt: '+5', l: .8, col: '#88f070' }); sfx(800, .2, 'triangle', .05, 400); }
  }
  function buster() { if (busterCd > 0) return; busterCd = .28; const f = foes.filter(f => !f.dead && f.r === me.r && f.c > me.c).sort((a, b) => a.c - b.c)[0]; fx.push({ pew: true, r: me.r, c: me.c, to: f ? f.c : 6, l: .08 }); sfx(1300, .03, 'square', .02, -400); if (f) damageFoe(f, 1); }
  const self = {
    reset() { me = { c: 1, r: 1, inv: 0 }; foes = []; shots = []; marks = []; fx = []; chips = ['SWORD', 'CANNON', null]; gauge = 0; hp = 20; wave = 0; score = 0; t = 0; busterCd = 0; msg = null; shake = 0; waveT = 1; },
    resize(w, h) { W = w; H = h; },
    update(dt) {
      t += dt; shake = Math.max(0, shake - dt); busterCd -= dt; me.inv = Math.max(0, me.inv - dt); if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (!foes.length) { waveT -= dt; if (waveT <= 0) { newWave(); waveT = 1.6; } }
      gauge += dt / 6; if (gauge >= 1) { gauge = 0; for (let i = 0; i < 3; i++) if (!chips[i]) { chips[i] = KEYS[Math.random() * KEYS.length | 0]; sfx(1000, .05, 'square', .03, 300); break; } }
      const pace = 1 + Math.min(.8, wave * .07);
      for (const f of foes) {
        f.hit = Math.max(0, f.hit - dt); if (f.dead) continue;
        if (f.dash) { f.dash.x -= 170 * dt; const col = Math.floor((f.dash.x - ox()) / pw()); if (col === me.c && f.r === me.r && !f.dash.hit) { f.dash.hit = true; hurtMe(3); } if (f.dash.x < ox() - 20) f.dash = null; continue; }
        f.moveT -= dt; if (f.moveT <= 0 && f.warn <= 0) { f.moveT = rnd(1, 2) / pace; const opts = []; for (let c = 3; c < 6; c++) for (let r = 0; r < 3; r++) if (!occupied(c, r) && Math.abs(c - f.c) + Math.abs(r - f.r) === 1) opts.push([c, r]); if (opts.length) { const o = opts[Math.random() * opts.length | 0]; if (f.k === 'shooter' && Math.random() < .5) { const same = opts.find(o2 => o2[1] === me.r); if (same) { f.c = same[0]; f.r = same[1]; } else { f.c = o[0]; f.r = o[1]; } } else { f.c = o[0]; f.r = o[1]; } } }
        f.cd -= dt * pace;
        if (f.warn > 0) { f.warn -= dt; if (f.warn <= 0) {
          if (f.k === 'shooter') { shots.push({ r: f.r, x: cell(f.c, f.r).x, hit: false }); sfx(400, .06, 'square', .03, -200); }
          else if (f.k === 'dropper') { marks.push({ c: f.warnAt.c, r: f.warnAt.r, t: .7 }); }
          else { f.dash = { x: cell(f.c, f.r).x }; sfx(250, .2, 'sawtooth', .04, -100); }
          f.cd = rnd(2, 3); } }
        else if (f.cd <= 0) { f.warn = .55; if (f.k === 'dropper') f.warnAt = { c: me.c, r: me.r }; sfx(1500, .03, 'square', .02); }
      }
      foes = foes.filter(f => !f.dead || f.hit > 0); if (foes.every(f => f.dead)) { if (foes.length) { score += 3; api.score(score); haptic('success'); sfx(880, .3, 'square', .05, 500); msg = { txt: 'WAVE CLEAR', l: 1 }; } foes = []; }
      for (const s of shots) { s.x -= 110 * dt; const col = Math.floor((s.x - ox()) / pw()); if (!s.hit && col === me.c && s.r === me.r) { s.hit = true; hurtMe(2); } }
      shots = shots.filter(s => !s.hit && s.x > ox() - 6);
      for (const m of marks) { m.t -= dt; if (m.t <= 0) { m.done = true; fx.push({ boom: true, c: m.c, r: m.r, l: .25 }); sfx(100, .2, 'square', .05, -30); if (me.c === m.c && me.r === m.r) hurtMe(3); } }
      marks = marks.filter(m => !m.done);
      for (const f of fx) { f.l -= dt; if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; } else if (f.txt) f.y -= 16 * dt; if (f.bomb && f.l <= 0 && !f.hitDone) { f.hitDone = true; for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) damageFoe(foes.find(o => !o.dead && o.c === f.c + dc && o.r === f.r + dr), dc || dr ? 3 : 6); fx.push({ boom: true, c: f.c, r: f.r, l: .25 }); shake = .2; } }
      fx = fx.filter(f => f.l > 0);
      if (hp <= 0) { haptic('error'); sfx(90, .6, 'sawtooth', .06, -40); return api.over(); }
    },
    draw(c) {
      const PW = pw(), PH = ph(), sx = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
      c.fillStyle = '#081828'; c.fillRect(0, 0, W, H); c.save(); c.translate(sx, 0);
      c.strokeStyle = '#103050'; c.lineWidth = 1; for (let y = (t * 10) % 12; y < H; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      for (let col = 0; col < 6; col++) for (let r = 0; r < 3; r++) {
        const x = ox() + col * PW, y = oy() + r * PH, mine = col < 3, mk = marks.find(m => m.c === col && m.r === r);
        c.fillStyle = mine ? '#3060d0' : '#c84050'; c.fillRect(x + 1, y + 1, PW - 2, PH - 2); c.fillStyle = mine ? '#5888f0' : '#e86878'; c.fillRect(x + 3, y + 3, PW - 6, PH - 7);
        c.fillStyle = mine ? '#204090' : '#882838'; c.fillRect(x + 1, y + PH - 4, PW - 2, 3);
        if (mk && (t * 12 | 0) % 2) { c.fillStyle = '#f8f8f0a0'; c.fillRect(x + 3, y + 3, PW - 6, PH - 7); }
      }
      // shots, beams
      for (const s of shots) { const y = cell(0, s.r).y - 4; c.fillStyle = '#f8d838'; c.fillRect(s.x - 3, y - 2, 6, 4); c.fillStyle = '#f8f8f0'; c.fillRect(s.x - 1, y - 1, 2, 2); }
      for (const f of fx) {
        if (f.pew) { const a = cell(f.c, f.r), b = cell(Math.min(5.5, f.to), f.r); c.fillStyle = '#f8f070'; c.fillRect(a.x + 6, a.y - 6, b.x - a.x - 6, 2); }
        if (f.beam) { const a = cell(f.c, f.r); c.fillStyle = '#f8a040'; c.fillRect(a.x + 6, a.y - 8, W - a.x, 5); c.fillStyle = '#f8f8f0'; c.fillRect(a.x + 6, a.y - 7, W - a.x, 2); }
        if (f.slash) for (const r of f.rows) { const p = cell(f.c, r); c.strokeStyle = '#80f8ff'; c.lineWidth = 2; c.beginPath(); c.arc(p.x - PW / 2, p.y - 4, PW * .6, -1, 1); c.stroke(); }
        if (f.boom) { const p = cell(f.c, f.r); c.fillStyle = (t * 20 | 0) % 2 ? '#f8f8f0' : '#f8a040'; c.fillRect(p.x - PW / 2 + 2, p.y - PH / 2 + 2, PW - 4, PH - 4); }
        if (f.bomb) { const k = 1 - f.l / .45, x = f.from.x + (f.to.x - f.from.x) * k, y = f.from.y + (f.to.y - f.from.y) * k - Math.sin(k * Math.PI) * 26; c.fillStyle = '#303040'; c.fillRect(x - 3, y - 3, 6, 6); c.fillStyle = '#f86060'; c.fillRect(x - 1, y - 5, 2, 2); }
      }
      // foes
      for (const f of foes) {
        const p = f.dash ? { x: f.dash.x, y: cell(f.c, f.r).y } : cell(f.c, f.r), x = Math.round(p.x), y = Math.round(p.y) - 4, fl = f.hit > 0 && (t * 30 | 0) % 2, warn = f.warn > 0 && (t * 16 | 0) % 2;
        c.globalAlpha = f.dead ? .4 : 1;
        c.fillStyle = fl ? '#f8f8f0' : warn ? '#f8f070' : f.k === 'shooter' ? '#e8a030' : f.k === 'dropper' ? '#a058e0' : '#e04848';
        if (f.k === 'shooter') { c.fillRect(x - 5, y - 6, 10, 10); c.fillRect(x - 9, y - 2, 4, 3); c.fillStyle = '#101018'; c.fillRect(x - 3, y - 3, 2, 2); }
        else if (f.k === 'dropper') { c.fillRect(x - 6, y - 8, 12, 7); c.fillRect(x - 4, y - 1, 8, 4); c.fillStyle = '#f8f8f0'; c.fillRect(x - 3, y - 6, 2, 2); c.fillRect(x + 1, y - 6, 2, 2); }
        else { c.fillRect(x - 7, y - 5, 14, 9); c.fillRect(x - 9, y - 1, 2, 4); c.fillStyle = '#f8f8f0'; c.fillRect(x - 6, y - 3, 3, 2); }
        c.fillStyle = '#101018'; c.fillRect(x - 7, y + 7, 14, 3); c.fillStyle = '#f8f8f0'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(Math.max(0, f.hp), x, y + 14);
        c.globalAlpha = 1;
      }
      // net-runner
      const p = cell(me.c, me.r), x = Math.round(p.x), y = Math.round(p.y) - 4;
      if (!(me.inv > 0 && (t * 20 | 0) % 2)) {
        c.fillStyle = '#2850c8'; c.fillRect(x - 4, y - 4, 8, 9); c.fillStyle = '#80f8ff'; c.fillRect(x - 4, y - 9, 8, 5); c.fillStyle = '#f8d0a8'; c.fillRect(x - 2, y - 7, 5, 3);
        c.fillStyle = '#101018'; c.fillRect(x + 1, y - 6, 1, 1); c.fillStyle = '#f8d838'; c.fillRect(x + 4, y - 2, 4, 3); c.fillStyle = '#204090'; c.fillRect(x - 3, y + 5, 2, 3); c.fillRect(x + 1, y + 5, 2, 3);
      }
      for (const f of fx) { if (f.txt) { c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillStyle = '#101018'; c.fillText(f.txt, f.x + 1, f.y + 1); c.fillStyle = f.col || '#f8f8f0'; c.fillText(f.txt, f.x, f.y); } else if (f.vx != null) { c.fillStyle = f.col; c.fillRect(f.x | 0, f.y | 0, 2, 2); } }
      c.restore();
      // HUD
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'left'; c.fillStyle = '#101018'; c.fillRect(2, 2, 34, 11); c.fillStyle = hp <= 6 ? '#f86060' : '#f8f8f0'; c.fillText(`HP${hp}`, 4, 10);
      c.textAlign = 'right'; c.fillStyle = '#80a8d0'; c.fillText(`W${wave}`, W - 4, 10);
      // chip tray
      const ty = H - TRAY; c.fillStyle = '#102848'; c.fillRect(0, ty, W, TRAY); c.fillStyle = '#204878'; c.fillRect(0, ty, W, 1);
      c.fillStyle = '#204878'; c.fillRect(4, ty + 3, W - 8, 3); c.fillStyle = '#80f8ff'; c.fillRect(4, ty + 3, (W - 8) * gauge, 3);
      const bw = (W - 16) / 3; for (let i = 0; i < 3; i++) { const bx = 4 + i * (bw + 4), by = ty + 9, ch = chips[i];
        c.fillStyle = ch ? CHIPS[ch].col : '#183858'; c.fillRect(bx, by, bw, TRAY - 12); if (ch) { c.fillStyle = '#101018'; c.textAlign = 'center'; c.fillText(CHIPS[ch].txt, bx + bw / 2, by + 11); } }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#f8f8f0'; c.fillText(msg.txt, W / 2, oy() - 4 > 14 ? oy() - 4 : oy() + 3 * PH + 10); }
      if (t < 5) { c.textAlign = 'center'; c.fillStyle = '#80a8d0'; c.fillText('BLUE: MOVE  RED: FIRE', W / 2, oy() + 3 * PH + 10); }
    },
    down(x, y) {
      if (y >= H - TRAY) { const bw = (W - 16) / 3, i = Math.floor((x - 4) / (bw + 4)); if (i >= 0 && i < 3) useChip(i); return; }
      const col = Math.floor((x - ox()) / pw()), r = clamp(Math.floor((y - oy()) / ph()), 0, 2);
      if (col >= 3) { buster(); return; }
      if (col >= 0 && col < 3) { if (col !== me.c || r !== me.r) { me.c = col; me.r = r; haptic('tick'); sfx(300, .03, 'square', .02, 200); } else buster(); }
    },
    key(k, d) {
      if (!d) return; const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (m) { me.c = clamp(me.c + m[0], 0, 2); me.r = clamp(me.r + m[1], 0, 2); }
      if (k === ' ') buster(); const n = '123'.indexOf(k); if (n >= 0) useChip(n);
    },
  };
  return self;
}

export default {
  id: 'grid-duel', title: 'Grid Duel', tag: 'Advance · Battle', retro: true, era: 'advance', pal: 'teal', w: 160, h: 176, maxW: 240, maxH: 260, goal: 20,
  hint: 'Tap a blue panel to jump there and dodge. Tap the red side to fire down your row. Chips load into the tray: tap one for a sword, wide slash, cannon, bomb or heal. Flashing glitches are about to attack.',
  make,
};
