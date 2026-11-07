import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { haptic } from '../kit/device.js';
import { backdrop, box, ball, shadow, glow } from '../kit/gfx.js';

// Turn-based artillery between two squads of battle spuds on hills you can blow apart. On your
// turn, hold the arrows to shuffle along, tap the weapon to switch, then drag back from your spud
// like a slingshot and let go to fire. Rockets drift with the wind, grenades bounce and pop after
// three seconds, and clusters burst into bomblets. Knock enemy spuds into the sea or wipe their
// health out to win the round.
const WEAPONS = [
  { n: 'ROCKET', r: 16, dmg: 45, wind: 1, fuse: 0 },
  { n: 'GRENADE', r: 14, dmg: 40, wind: 0, fuse: 3, bounce: true },
  { n: 'CLUSTER', r: 10, dmg: 22, wind: .5, fuse: 0, split: 4 },
];
const G = 160, POWER = 190;
let W = 240, H = 160;

function make(api) {
  let hgt, units, turn, phase, wind, weapon, shot, aim, timer, score, round, t, parts, msg, dead, aiPlan, walk, settleT, cam;
  const sea = () => H - 8;
  function genTerrain() {
    hgt = new Float32Array(W); const a = rnd(0, 6), b = rnd(0, 6), base = H * .62;
    for (let x = 0; x < W; x++) hgt[x] = base - Math.sin(x / W * Math.PI * 2 + a) * H * .14 - Math.sin(x / W * Math.PI * 5 + b) * H * .07 - Math.sin(x / W * Math.PI) * H * .1;
  }
  const ground = x => hgt[clamp(Math.round(x), 0, W - 1)];
  function newRound() {
    genTerrain(); units = [];
    const xs = [W * .12, W * .3, W * .7, W * .88];
    xs.forEach((x, i) => { const tm = i < 2 ? 0 : 1; units.push({ team: tm, x: x + rnd(-8, 8), y: 0, vy: 0, hp: 100, dead: false, face: tm ? -1 : 1, name: tm ? ['RUSTY', 'MOSS'][i - 2] : ['SPUD', 'TATER'][i] }); });
    for (const u of units) u.y = ground(u.x);
    turn = { team: 0, idx: [0, 0] }; wind = rnd(-1, 1); phase = 'aim'; timer = 25; weapon = 0; msg = { txt: `ROUND ${round}`, l: 1.2 }; cam = 0;
  }
  const active = () => { const team = units.filter(u => u.team === turn.team && !u.dead); return team[turn.idx[turn.team] % team.length]; };
  function blast(x, y, w) {
    const r = w.r; for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(W - 1, Math.ceil(x + r)); i++) { const dy = Math.sqrt(Math.max(0, r * r - (i - x) * (i - x))); if (hgt[i] < y + dy) hgt[i] = Math.max(hgt[i], y + dy); }
    for (let i = 0; i < 18; i++) parts.push({ x, y, vx: rnd(-80, 80), vy: rnd(-110, 10), l: .6, col: i % 2 ? '#f8a020' : '#806040' });
    for (const u of units) { if (u.dead) continue; const d = Math.hypot(u.x - x, u.y - 5 - y); if (d < r * 1.8) { const k = 1 - d / (r * 1.8), dmg = Math.round(w.dmg * k); u.hp -= dmg; u.vy = -90 * k; u.vx = Math.sign(u.x - x || 1) * 70 * k; parts.push({ txt: `-${dmg}`, x: u.x, y: u.y - 16, l: 1, col: u.team ? '#f86060' : '#80c0ff' }); if (u.team === 1) { score += dmg; api.score(Math.floor(score / 10) + (round - 1) * 20); } } }
    haptic('heavy'); sfx(70, .4, 'sawtooth', .07, -30);
  }
  function fire(ang, pow) {
    const u = active(), w = WEAPONS[weapon];
    shot = [{ x: u.x + Math.cos(ang) * 8, y: u.y - 6 + Math.sin(ang) * 8, vx: Math.cos(ang) * pow * POWER, vy: Math.sin(ang) * pow * POWER, w, fuse: w.fuse, t: 0 }];
    phase = 'fly'; u.face = Math.cos(ang) < 0 ? -1 : 1; sfx(300, .15, 'square', .05, 300); haptic('medium');
  }
  function stepShot(s, dt) {
    s.t += dt; s.vx += wind * 40 * s.w.wind * dt; s.vy += G * dt;
    const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
    if (nx < -40 || nx > W + 40 || ny > H + 10) return 'gone';
    if (ny >= ground(nx) && nx >= 0 && nx < W) {
      if (s.w.bounce) { s.vy = -Math.abs(s.vy) * .45; s.vx *= .7; s.y = ground(nx) - 1; s.x = nx; sfx(500, .03, 'square', .02); }
      else return 'hit';
    } else { s.x = nx; s.y = ny; }
    if (!s.w.bounce) for (const u of units) if (!u.dead && Math.hypot(u.x - s.x, u.y - 5 - s.y) < 6 && s.t > .15) return 'hit';
    if (s.w.fuse && s.t >= s.w.fuse) return 'hit';
    return null;
  }
  function endTurn() {
    phase = 'settle'; settleT = .6;
  }
  function nextTurn() {
    const alive = tm => units.some(u => u.team === tm && !u.dead);
    if (!alive(0)) { dead = .01; msg = { txt: 'YOUR SQUAD IS SPUD MASH', l: 9 }; haptic('error'); sfx(110, .8, 'square', .05, -40); return; }
    if (!alive(1)) { round++; score += 200; api.score(Math.floor(score / 10) + (round - 1) * 20); haptic('success'); sfx(880, .5, 'square', .05, 500); newRound(); return; }
    turn.idx[turn.team]++; turn.team = 1 - turn.team; wind = clamp(wind + rnd(-.5, .5), -1, 1); timer = 25; weapon = turn.team === 0 ? weapon : 0; aim = null;
    phase = turn.team === 0 ? 'aim' : 'ai'; aiPlan = null; msg = { txt: turn.team === 0 ? `${active().name}'S TURN` : 'ENEMY TURN', l: .9 };
  }
  function planAI() {
    const u = active(), foe = 1 - u.team, targets = units.filter(v => v.team === foe && !v.dead); let best = null;
    const err = Math.max(.05, .24 - round * .03);
    for (let i = 0; i < 260; i++) {
      const wi = Math.random() < .7 ? 0 : Math.random() < .5 ? 1 : 2, w = WEAPONS[wi], ang = -Math.PI / 2 + rnd(-1.4, 1.4), pow = rnd(.35, 1);
      let s = { x: u.x + Math.cos(ang) * 8, y: u.y - 6 + Math.sin(ang) * 8, vx: Math.cos(ang) * pow * POWER, vy: Math.sin(ang) * pow * POWER, w, t: 0 }, res = null;
      for (let k = 0; k < 400 && !res; k++) { s.t += 1 / 30; s.vx += wind * 40 * w.wind / 30; s.vy += G / 30; s.x += s.vx / 30; s.y += s.vy / 30; if (s.x < -40 || s.x > W + 40 || s.y > H) res = 'gone'; else if (s.x >= 0 && s.x < W && s.y >= ground(s.x)) res = 'hit'; else if (w.fuse && s.t >= w.fuse) res = 'hit'; }
      if (res !== 'hit') continue;
      let val = 0; for (const v of units) { if (v.dead) continue; const d = Math.hypot(v.x - s.x, v.y - 5 - s.y); if (d < w.r * 1.8) val += (1 - d / (w.r * 1.8)) * w.dmg * (v.team === foe ? 1 : -1.3); }
      if (!best || val > best.val) best = { val, ang, pow, wi };
    }
    if (!best) best = { ang: -Math.PI / 2 + (targets[0] && targets[0].x < u.x ? -.6 : .6), pow: .7, wi: 0 };
    best.ang += rnd(-err, err); best.pow = clamp(best.pow + rnd(-err, err) * .6, .2, 1); return best;
  }
  function settle(dt) {
    let moving = false;
    for (const u of units) {
      if (u.dead) continue; const gy = ground(u.x);
      if (u.vx) { u.x = clamp(u.x + u.vx * dt, 2, W - 2); u.vx *= .9; if (Math.abs(u.vx) < 2) u.vx = 0; else moving = true; }
      if (u.y < gy || u.vy < 0) { u.vy += G * 1.6 * dt; u.y += u.vy * dt; moving = true; if (u.y >= ground(u.x) && u.vy > 0) { if (u.vy > 140) { const d = Math.round((u.vy - 140) / 6); u.hp -= d; parts.push({ txt: `-${d}`, x: u.x, y: u.y - 16, l: 1, col: '#f8f8f0' }); } u.y = ground(u.x); u.vy = 0; } }
      else u.y = gy;
      if (u.y > sea() || u.hp <= 0) { u.dead = true; u.hp = 0; for (let i = 0; i < 10; i++) parts.push({ x: u.x, y: Math.min(u.y, sea()), vx: rnd(-40, 40), vy: rnd(-80, -20), l: .6, col: u.team ? '#e05848' : '#4880e0' }); sfx(200, .3, 'square', .05, -100); }
    }
    return moving;
  }
  const self = {
    reset() { score = 0; round = 1; t = 0; parts = []; dead = 0; aim = null; walk = 0; newRound(); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (units) newRound(); },
    update(dt) {
      t += dt; for (const p of parts) { p.l -= dt; if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; } else p.y -= 14 * dt; } parts = parts.filter(p => p.l > 0);
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (dead) { dead += dt; if (dead > 1.8) api.over(); return; }
      if (phase === 'aim' || phase === 'ai') {
        timer -= dt; if (timer <= 0) { endTurn(); return; }
        const u = active();
        if (phase === 'aim' && walk) { const nx = clamp(u.x + walk * 22 * dt, 3, W - 3); if (ground(nx) > u.y - 5) { u.x = nx; u.face = walk; u.y = ground(u.x); } }
        settle(dt);
        if (phase === 'ai') { if (!aiPlan) { aiPlan = planAI(); aiPlan.wait = 1.2; } aiPlan.wait -= dt; aim = { ang: aiPlan.ang, pow: aiPlan.pow * Math.min(1, (1.2 - aiPlan.wait) / .8) }; weapon = aiPlan.wi; if (aiPlan.wait <= 0) { fire(aiPlan.ang, aiPlan.pow); aim = null; } }
      } else if (phase === 'fly') {
        const next = [];
        for (const s of shot) { const r = stepShot(s, dt); if (r === 'hit') { blast(s.x, s.y, s.w); if (s.w.split) for (let i = 0; i < s.w.split; i++) next.push({ x: s.x, y: s.y - 3, vx: rnd(-60, 60), vy: rnd(-110, -60), w: { n: 'BIT', r: 8, dmg: 16, wind: 0, fuse: 0 }, t: 0, fuse: 0 }); } else if (r !== 'gone') next.push(s); }
        shot = next; cam = shot.length ? shot[0].x : cam;
        settle(dt);
        if (!shot.length) endTurn();
      } else if (phase === 'settle') { settleT -= dt; const m = settle(dt); if (!m && settleT <= 0) nextTurn(); }
    },
    draw(c) {
      const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f8a868'); sky.addColorStop(1, '#f8e0a8'); c.fillStyle = sky; c.fillRect(0, 0, W, H);
      glow(c, W * .75, H * .3, 40, '#f8c070', .6); ball(c, W * .75, H * .3, 16, '#f89860', { gloss: 0 });
      const dirt = c.createLinearGradient(0, H * .3, 0, H); dirt.addColorStop(0, '#8a6844'); dirt.addColorStop(1, '#3a2818');
      for (let x = 0; x < W; x++) { const y = hgt[x]; if (y >= sea()) continue; c.fillStyle = dirt; c.fillRect(x, y, 1, H - y); c.fillStyle = '#58b048'; c.fillRect(x, y, 1, 3); c.fillStyle = '#90e070'; c.fillRect(x, y, 1, 1); if ((x * 7 + (y | 0)) % 11 === 0) { c.fillStyle = '#5a4028'; c.fillRect(x, y + 8 + (x % 5) * 3, 1, 2); } }
      backdrop(c, 0, sea(), W, H - sea(), '#4888d8', '#183868'); c.fillStyle = '#78b0f0'; for (let x = 0; x < W; x += 8) c.fillRect(x + (t * 10 % 8), sea(), 4, 1);
      // units
      const cur = (phase === 'aim' || phase === 'ai') ? active() : null;
      for (const u of units) {
        if (u.dead) continue; const x = Math.round(u.x), y = Math.round(u.y);
        shadow(c, x, y, 6, 2, .35); { const g = c.createRadialGradient(x - 2, y - 8, 1, x, y - 5, 7); g.addColorStop(0, '#f0c888'); g.addColorStop(1, '#8a6030'); c.fillStyle = g; } c.beginPath(); c.ellipse(x, y - 5, 5, 6, 0, 0, 7); c.fill(); c.fillStyle = '#a07838'; c.fillRect(x - 2, y - 3, 1, 1); c.fillRect(x + 2, y - 7, 1, 1);
        box(c, x - 5, y - 12, 10, 3, u.team ? '#e05848' : '#4880e0', { r: 1, drop: false }); box(c, x - 3, y - 14.5, 6, 3, u.team ? '#e05848' : '#4880e0', { r: 1.5, drop: false });
        c.fillStyle = '#202020'; c.fillRect(x + u.face * 2 - 1, y - 8, 1, 2); c.fillRect(x + u.face * 2 + 1 * u.face, y - 8, 1, 2);
        c.fillStyle = '#000a'; c.fillRect(x - 8, y - 20, 16, 4); c.fillStyle = u.team ? '#f86060' : '#80c0ff'; c.fillRect(x - 7, y - 19, 14 * Math.max(0, u.hp) / 100, 2);
        if (u === cur && (t * 3 | 0) % 2) { c.fillStyle = '#f8f8f0'; c.beginPath(); c.moveTo(x, y - 22); c.lineTo(x - 3, y - 27); c.lineTo(x + 3, y - 27); c.fill(); }
      }
      // aim line
      if (aim && cur) { const steps = 14; c.fillStyle = '#ffffffb0'; let x = cur.x, y = cur.y - 6, vx = Math.cos(aim.ang) * aim.pow * POWER, vy = Math.sin(aim.ang) * aim.pow * POWER; for (let i = 0; i < steps; i++) { for (let k = 0; k < 4; k++) { vx += wind * 40 * WEAPONS[weapon].wind / 60; vy += G / 60; x += vx / 60; y += vy / 60; } c.fillRect(x - 1, y - 1, 2, 2); } }
      if (shot) for (const s of shot) { ball(c, s.x, s.y, s.w.n === 'BIT' ? 1.5 : 2.5, s.w.bounce ? '#487838' : '#505060', { gloss: .6 }); if (!s.w.bounce) { c.fillStyle = '#f8a02080'; c.fillRect(s.x - s.vx * .02 - 1, s.y - s.vy * .02 - 1, 2, 2); } else if (s.w.fuse) { c.fillStyle = '#f8f8f0'; c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center'; c.fillText(String(Math.ceil(s.w.fuse - s.t)), s.x, s.y - 5); } }
      c.font = '6px "Press Start 2P", monospace'; c.textAlign = 'center';
      for (const p of parts) { if (p.txt) { c.fillStyle = '#000'; c.fillText(p.txt, p.x + 1, p.y + 1); c.fillStyle = p.col; c.fillText(p.txt, p.x, p.y); } else { c.fillStyle = p.col; c.fillRect(p.x, p.y, 2, 2); } }
      // HUD: wind, timer, weapon, walk buttons
      c.fillStyle = '#00000070'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = '#f8f8f0'; c.fillText(`${Math.ceil(timer)}`, 4, 9);
      c.fillText('WIND', 22, 9); c.fillStyle = '#ffffff30'; c.fillRect(50, 4, 40, 4); c.fillStyle = '#80e0ff'; const wv = wind * 20; c.fillRect(70 + Math.min(0, wv), 4, Math.abs(wv), 4);
      c.textAlign = 'right'; c.fillStyle = '#f8e040'; c.fillText(`R${round}`, W - 4, 9);
      if (phase === 'aim') {
        const bh = 18, by = H - bh - 2; c.globalAlpha = .85;
        box(c, 2, by, 22, bh, '#384860', { r: 4 }); box(c, 26, by, 22, bh, '#384860', { r: 4 }); box(c, W - 58, by, 56, bh, '#384860', { r: 4 }); c.globalAlpha = 1;
        c.fillStyle = '#f8f8f0'; c.textAlign = 'center'; c.fillText('◀', 13, by + 12); c.fillText('▶', 37, by + 12); c.fillText(WEAPONS[weapon].n, W - 30, by + 12);
      }
      if (msg) { c.textAlign = 'center'; c.fillStyle = '#000a'; c.fillRect(0, H * .3 - 9, W, 13); c.fillStyle = dead ? '#f86060' : '#f8e040'; c.fillText(msg.txt, W / 2, H * .3); }
      if (t < 8 && phase === 'aim' && !msg) { c.textAlign = 'center'; c.fillStyle = '#202020'; c.fillText('DRAG BACK FROM YOUR SPUD', W / 2, H * .22); }
    },
    down(x, y) {
      if (dead || phase !== 'aim') return; const bh = 18, by = H - bh - 2;
      if (y > by) { if (x < 24) { walk = -1; return; } if (x < 48) { walk = 1; return; } if (x > W - 58) { weapon = (weapon + 1) % WEAPONS.length; haptic('tick'); sfx(700, .04, 'square', .03); return; } }
      aim = { sx: x, sy: y, ang: 0, pow: 0, drag: true };
    },
    move(x, y, p) { if (!p || !aim || !aim.drag || phase !== 'aim') return; const dx = aim.sx - x, dy = aim.sy - y, d = Math.hypot(dx, dy); aim.ang = Math.atan2(dy, dx); aim.pow = clamp(d / 70, 0, 1); },
    up() { walk = 0; if (aim && aim.drag && phase === 'aim') { if (aim.pow > .12) fire(aim.ang, aim.pow); aim = null; } },
    key(k, d) { if (phase !== 'aim') return; if (k === 'ArrowLeft') walk = d ? -1 : 0; if (k === 'ArrowRight') walk = d ? 1 : 0; if (d && k === 'Tab') weapon = (weapon + 1) % 3; if (d && k === ' ') { const u = active(); fire(u.face > 0 ? -.8 : -Math.PI + .8, .75); } },
  };
  return self;
}

export default {
  id: 'shell-duel', title: 'Shell Duel', tag: 'Console · Artillery', retro: true, era: 'console', pal: 'berry', w: 240, h: 160, maxW: 360, maxH: 240, goal: 30,
  hint: 'Your squad of battle spuds takes turns with the enemy. Hold the arrows to shuffle along, tap the weapon name to switch, then drag back like a slingshot and let go to fire. Rockets drift with the wind, grenades bounce for three seconds, clusters split. Blasts dig into the hills. Knock every enemy spud out to win the round.',
  make,
};
