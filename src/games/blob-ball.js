import gs from '../gamescroll.js';
const { sfx } = gs.sound;
const { haptic } = gs.device;
const { clamp } = gs.util;
const { Feel } = gs.effects; const { Ready } = gs.rounds;

// One-on-one football between two jelly blobs. Hold and slide to move your blob, tap or flick up
// to jump. Head the ball into the other net. First to five wins the match, and every match the
// rival blob gets quicker. Lose a match and it's over.
let W = 220, H = 150;

function make(api) {
  const feel = new Feel({ pixel: true, sound: false, buzz: false });   // the game has its own sounds and buzzes
  const ready = new Ready({ eat: false });                              // kick-off waits for the first touch
  let me, ai, ball, sc, match, goals, t, phase, pt, finger, tapStart, msg, clock;
  const R = 17, BR = 5, G = 520, GOALH = 38, GOALW = 14;
  const floor = () => H - 14;
  function kickoff(towards) {
    me = { x: W * .25, y: floor(), vx: 0, vy: 0 }; ai = { x: W * .75, y: floor(), vx: 0, vy: 0 };
    ball = { x: W / 2 + (towards || 0) * 10, y: H * .35, vx: (towards || 0) * 20, vy: 0 }; phase = 'ready'; pt = 0;
  }
  function startMatch() { sc = [0, 0]; clock = 90; kickoff(0); msg = { txt: `MATCH ${match + 1}`, l: 1.4 }; }
  const aiSpeed = () => Math.min(165, 75 + match * 16), aiLag = () => Math.max(.04, .24 - match * .035);
  function slimeHit(s) {
    const dx = ball.x - s.x, dy = ball.y - s.y, d = Math.hypot(dx, dy);
    if (d < R + BR && ball.y < s.y + 2) {
      const nx = dx / d, ny = dy / d; ball.x = s.x + nx * (R + BR); ball.y = s.y + ny * (R + BR);
      const rvx = ball.vx - s.vx, rvy = ball.vy - s.vy, dot = rvx * nx + rvy * ny;
      if (dot < 0) { ball.vx -= 1.9 * dot * nx; ball.vy -= 1.9 * dot * ny; ball.vx += s.vx * .5; ball.vy += Math.min(0, s.vy) * .4; }
      const sp = Math.hypot(ball.vx, ball.vy); if (sp > 330) { ball.vx *= 330 / sp; ball.vy *= 330 / sp; }
      if (s === me) haptic('light'); sfx(300 + Math.min(400, sp), .04, 'square', .04, 100);
    }
  }
  function moveSlime(s, target, speed, dt, lo, hi) {
    const dx = target - s.x; s.vx = clamp(dx * 8, -speed, speed); s.x = clamp(s.x + s.vx * dt, lo, hi);
    s.vy += G * dt; s.y += s.vy * dt; if (s.y >= floor()) { s.y = floor(); s.vy = 0; }
  }
  function jump(s) { if (s.y >= floor() - .5) { s.vy = -250; if (s === me) sfx(500, .05, 'triangle', .04, 300); } }
  function scored(side) {
    sc[side]++; phase = 'goal'; pt = 0;
    feel.juice.burst(ball.x, ball.y, { n: 18, speed: 120, spread: Math.PI, angle: -Math.PI / 2, life: .8, size: 2, gravity: 300, color: [side ? '#f85858' : '#58c8f8', '#f8f8f0'] });
    if (side === 0) { goals++; api.score(goals); haptic('success'); sfx(880, .3, 'square', .05, 400); msg = { txt: 'GOAL!', l: 1.2 }; }
    else { haptic('error'); sfx(160, .3, 'sawtooth', .05, -50); msg = { txt: 'CONCEDED', l: 1.2 }; feel.juice.shake(3); }
  }
  const self = {
    reset() { match = 0; goals = 0; t = 0; finger = null; tapStart = null; feel.clear(); ready.reset(); startMatch(); },
    fx(dt) { feel.update(dt); },
    resize(w, h) { if (w === W && h === H) return; W = w; H = h; if (me) kickoff(0); },
    update(dt) {
      feel.update(dt); if (!ready.update(dt)) return;
      t += dt; pt += dt;
      if (msg) { msg.l -= dt; if (msg.l <= 0) msg = null; }
      if (phase === 'over') { if (pt > 2) api.over(); return; }
      if (phase === 'won') { if (pt > 2) { match++; startMatch(); } return; }
      if (phase === 'goal') {
        if (pt > 1.3) {
          const done = sc[0] >= 5 || sc[1] >= 5;
          if (done) { if (sc[0] > sc[1]) { phase = 'won'; pt = 0; goals += 3; api.score(goals); msg = { txt: `WON ${sc[0]}-${sc[1]}!`, l: 2 }; haptic('success'); } else { phase = 'over'; pt = 0; msg = { txt: `LOST ${sc[0]}-${sc[1]}`, l: 9 }; } }
          else kickoff(sc[0] > sc[1] ? 1 : -1);
        }
        return;
      }
      if (phase === 'ready') { if (pt > .8) phase = 'play'; else return; }
      clock -= dt;
      if (clock <= 0) { clock = 0; phase = 'goal'; pt = 0; if (sc[0] === sc[1]) { sc[0] = 5; } else if (sc[0] > sc[1]) sc[0] = 5; else sc[1] = 5; if (sc[0] === 5 && sc[1] < 5) msg = { txt: 'TIME!', l: 1.2 }; return; }
      // you
      const tgt = finger ? finger.x : me.x; moveSlime(me, tgt, 150, dt, R, W - R);
      // rival: get between ball and own goal, slightly behind it, and jump at high balls
      const predict = ball.x + ball.vx * aiLag();
      let aimX = predict + 7; if (ball.x < W * .45 && ball.vx < 0) aimX = W * .72; aimX = clamp(aimX, W * .5 + R * .2, W - R);
      moveSlime(ai, aimX, aiSpeed(), dt, R, W - R);
      if (Math.abs(ball.x - ai.x) < 26 && ball.y < ai.y - 22 && ball.y > ai.y - 70 && ball.vy > -40 && Math.random() < dt * (3 + match * 1.5)) jump(ai);
      // ball
      ball.vy += G * .55 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.y > floor() - BR) { ball.y = floor() - BR; ball.vy *= -.7; ball.vx *= .96; }
      if (ball.y < BR + 12) { ball.y = BR + 12; ball.vy = Math.abs(ball.vy) * .6; }
      // goal frames: crossbar and back wall
      for (const [gx, side] of [[0, 1], [W, 0]]) {
        const inX = side ? ball.x < GOALW : ball.x > W - GOALW, barY = floor() - GOALH;
        if (inX && Math.abs(ball.y - barY) < BR + 1 && ball.vy > 0 && ball.y < barY) { ball.vy = -Math.abs(ball.vy) * .6; }
        if (inX && ball.y > barY + BR) { scored(side); return; }
      }
      if (ball.x < BR) { ball.x = BR; ball.vx = Math.abs(ball.vx) * .7; } if (ball.x > W - BR) { ball.x = W - BR; ball.vx = -Math.abs(ball.vx) * .7; }
      slimeHit(me); slimeHit(ai);
    },
    draw(c) {
      c.fillStyle = '#284860'; c.fillRect(0, 0, W, H); feel.begin(c); c.fillStyle = '#386080'; for (let i = 0; i < 8; i++) c.fillRect((i * 53 + 20) % W, 18 + (i * 29) % 40, 2, 2);
      c.fillStyle = '#3c9a48'; c.fillRect(0, floor(), W, H - floor()); c.fillStyle = '#48b058'; for (let x = 0; x < W; x += 20) c.fillRect(x, floor(), 10, H - floor());
      c.fillStyle = '#f8f8f040'; c.fillRect(W / 2 - 1, floor(), 2, H - floor());
      // nets
      for (const side of [0, 1]) { const x = side ? W - GOALW : 0, y = floor() - GOALH; c.fillStyle = '#ffffff20'; c.fillRect(x, y, GOALW, GOALH); c.strokeStyle = '#ffffff50'; for (let i = 4; i < GOALH; i += 6) { c.beginPath(); c.moveTo(x, y + i); c.lineTo(x + GOALW, y + i); c.stroke(); } c.fillStyle = '#f8f8f0'; c.fillRect(x, y - 2, GOALW, 2); c.fillRect(side ? x : x + GOALW - 2, y, 2, GOALH); }
      const blob = (s, col, eye) => { c.fillStyle = col; c.beginPath(); c.arc(s.x, s.y, R, Math.PI, 0); c.fill(); c.fillStyle = '#ffffff40'; c.beginPath(); c.arc(s.x - R * .4, s.y - R * .55, 4, 0, 7); c.fill(); const ex = s.x + eye * R * .45, ey = s.y - R * .55; c.fillStyle = '#f8f8f0'; c.beginPath(); c.arc(ex, ey, 4, 0, 7); c.fill(); const a = Math.atan2(ball.y - ey, ball.x - ex); c.fillStyle = '#101018'; c.beginPath(); c.arc(ex + Math.cos(a) * 2, ey + Math.sin(a) * 2, 2, 0, 7); c.fill(); };
      blob(me, '#48b8f8', 1); blob(ai, '#f85868', -1);
      c.fillStyle = '#f8e848'; c.beginPath(); c.arc(ball.x, ball.y, BR, 0, 7); c.fill(); c.fillStyle = '#c8a828'; c.fillRect(ball.x - 1, ball.y - 3, 2, 2);
      if (ball.y < 14) { c.fillStyle = '#f8e848'; c.fillRect(ball.x - 2, 14, 4, 2); }
      feel.end(c, W, H);
      c.font = '6px "Press Start 2P", monospace'; c.fillStyle = '#10182880'; c.fillRect(0, 0, W, 12);
      c.textAlign = 'left'; c.fillStyle = '#48b8f8'; c.fillText(`YOU ${sc[0]}`, 4, 9); c.textAlign = 'right'; c.fillStyle = '#f85868'; c.fillText(`${sc[1]} RIVAL`, W - 4, 9);
      c.textAlign = 'center'; c.fillStyle = clock < 10 ? '#f8a040' : '#f8f8f0'; c.fillText(`${Math.ceil(clock)}s`, W * .3, 9);
      if (msg) { c.fillStyle = '#000a'; c.fillRect(0, H * .38 - 9, W, 13); c.fillStyle = phase === 'over' ? '#f86060' : '#f8e848'; c.fillText(msg.txt, W / 2, H * .38); }
      if (t < 6 && match === 0 && sc[0] + sc[1] === 0) { c.fillStyle = '#f8f8f0b0'; c.fillText('HOLD + SLIDE TO MOVE', W / 2, H * .55); c.fillText('TAP OR FLICK UP: JUMP', W / 2, H * .55 + 10); }
    },
    down(x, y) { ready.go(); finger = { x, y }; tapStart = { x, y, t }; },
    move(x, y, p) { if (!p || !finger) return; if (finger.y - y > 14) { jump(me); finger.y = y; } else if (y > finger.y) finger.y = y; finger.x = x; },
    up(x, y) { if (tapStart && t - tapStart.t < .22 && Math.hypot((x ?? tapStart.x) - tapStart.x, (y ?? tapStart.y) - tapStart.y) < 8) jump(me); finger = null; },
    key(k, d) { if (!d) { if (k === 'ArrowLeft' || k === 'ArrowRight') finger = null; return; } ready.go(); if (k === 'ArrowLeft') finger = { x: 0, y: 0 }; else if (k === 'ArrowRight') finger = { x: W, y: 0 }; else if (k === 'ArrowUp' || k === ' ') jump(me); },
  };
  return self;
}

export default {
  id: 'blob-ball', title: 'Blob Ball', tag: 'Advance · Football', retro: true, era: 'advance', pal: 'mint', w: 220, h: 150, maxW: 340, maxH: 240, goal: 12,
  hint: 'One-on-one football between two jelly blobs. Hold and slide your finger to move, tap or flick up to jump, and bounce the ball into the rival\'s net. First to five wins the match; each new rival is quicker. Lose a match and it\'s over.',
  make,
};
