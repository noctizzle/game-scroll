import './style.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-800.css';
import { store, hash, fmt } from './util.js';
import { sfx } from './sfx.js';
import { openFeel, feelIcon } from './feel.js';
import { PAL, SHELL } from './palettes.js';
import { isHidden, setRating, rating, logRound, toast as qaToast, openPanel } from './qa.js';
import { rankQueue as rank, explain } from './recommend.js';
import { live, feedBrain } from './feedsignals.js';
const rankQueue=(pool,all)=>rank(pool,all,live);
import { openMyGames } from './mygames.js';
import { post as consolePost } from './kit/gfx.js';
import { progress, rewardOf } from './kit/progress.js';
import { checkTrophies } from './kit/trophies.js';
import { services } from './kit/services.js';
import { initWallet, toast, shopHTML, bindShop } from './kit/wallet-ui.js';

import { haptic, want } from './kit/device.js';
import { pollPads } from './kit/gamepad.js';
import { stopAll, pauseAll, resumeAll, ownedBy, release } from './kit/cleanup.js';
// Things a game may leave running (music, the camera for face tracking, motion moves): stopped when a round ends or the player leaves.
const stopKits=stopAll;   // every kit registers its own stop (src/kit/cleanup.js)
import { remote } from './remote.js';
import { openSettings } from './settings.js';
import { nativeARProbe, nativeARSupported } from './kit/native-ar.js';
import { hearts } from './hearts.js';
import { playstats } from './playstats.js';
import { boards, rankHTML, openBoard } from './boards.js';
import { perf } from './perf.js';
import { speed, fpsFor, tick as tickHz, screenHz } from './kit/speed.js';
import { history } from './history.js';
import { savesFor } from './saves.js';
import { brainsFor, sendFun } from './brainstore.js';
import { liveBrains, brainStats } from './kit/brains.js';
import { ran as gameRan, awayFor } from './away.js';
import { geoFor, roundStarted, roundEnded } from './geo.js';
import { makeDebug } from './debug.js';
import { show as showTweaks } from './kit/tweak.js';
import { shareGame, onSharedGame } from './share.js';
import { canFull, isFull, anyFull, enterFull, leaveFull, toggleFull, onFullChange } from './fullscreen.js';
import BUNDLED from 'virtual:bundled-games';

/* ---------- catalogue ---------- */
// The app streams every game from the game host (src/remote.js): GAMES holds each game's metadata from
// the online catalogue, and a game's code downloads just before it comes up in the feed.
// Dev and test builds (--mode bundled) have every file in src/games/ built in instead.
const GAMES = BUNDLED.filter(g => g && g.id && g.make).map(g => ({ likes: 300 + hash(g.id) % 6000, ...g }));
const STREAM = remote.enabled;
const playable = g => STREAM ? remote.def(g) : g;   // null while a streamed game is still downloading
let booted = false;
if (STREAM) remote.init(meta => { const g = { likes: 300 + hash(meta.id) % 6000, ...meta }; GAMES.push(g); return g; },
  (added, updated) => { if (booted) catalogueChanged(added, updated); });

/* ---------- feed engine ---------- */
const feed=document.getElementById('feed');
let slides=[],active=null,filter='all',lastId=null,io;

// Makes the game. A game whose kit is still loading (the physics engine is a few MB, so it loads the
// first time it's needed) throws an error carrying e.kitLoading: show a "loading" screen until it's in,
// then make the game again. A kit that fails to load, or a game that throws while it's being made or
// reset, must not take the feed with it: its card says so and a tap tries again.
const stubGame=(s,msg)=>({reset(){},update(){},draw(c){const w=s.w||s.def.w,h=s.h||s.def.h;c.fillStyle='#111';c.fillRect(0,0,w,h);c.fillStyle='#bbb';c.font=`${Math.round(Math.min(w,h)/14)}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(msg,w/2,h/2)}});
function bootGame(s){
  s.failed=null;
  try{ownedBy(s,()=>{s.game=s.def.make(s.api);s.game.reset()});s.loading=false}
  catch(e){
    if(e&&e.kitLoading){
      s.loading=true;s.game=stubGame(s,'Loading…');
      e.kitLoading.then(()=>{if(s.dropped)return;bootGame(s);s.dirty=true;renderOverlay(s)},err=>{if(s.dropped)return;console.warn('kit failed to load',err);broken(s,'Couldn\u2019t load this game. Check the connection and try again.')});
      return;
    }
    gameFault(s,e);
  }
}
function gameFault(s,e){console.error(s.def.id,e);perf.error(e,s.def.id);broken(s,'This game hit a problem.')}
function broken(s,why){if(isFull(s))leaveFull();if(s.state==='playing')try{gameOver(s)}catch(_){}try{s.game?.dispose?.()}catch(_){}release(s);s.loading=true;s.failed=why;s.game=stubGame(s,'Tap to try again');s.dirty=true;if(s.state!=='ready'){s.state='ready';s.el.classList.remove('playing','over');feed.classList.remove('locked')}renderOverlay(s)}
// A new round: false (and the card shows the problem) if the game threw.
function resetGame(s){try{ownedBy(s,()=>s.game.reset());return true}catch(e){gameFault(s,e);return false}}
function makeSlide(def){
  const el=document.createElement('section');el.className='slide '+(def.retro?'retro':'modern')+(def.era==='console'?' console':def.era==='nextgen'?' console nextgen':def.era==='ar'?' console nextgen ar':'');
  if(def.retro){const p=PAL[def.pal||'moss'];p.forEach((c,i)=>el.style.setProperty('--lcd'+i,c));el.style.setProperty('--shell',SHELL[def.pal||'moss']);}el.setAttribute('aria-label',def.title);
  el.innerHTML=`
    <div class="stage"><div class="device">
      ${def.retro?`<div class="bezel-top${def.era?' dark':''}"><span class="led"></span>${def.era==='console'?'<b class="era">CLASSIC</b> · CONSOLE':def.era==='nextgen'?'<b class="era">NEXT GEN</b> · CONSOLE<button class="fsbtn" aria-label="Full screen" title="Full screen"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4"/></svg></button>':def.era==='ar'?'<b class="era">AR</b> · 3D':def.era==='advance'?'<b class="era">ADVANCE</b> · POCKET':def.era==='color'?'<b class="era rainbow">COLOR</b> · POCKET':'DOT MATRIX · POCKET'}</div>`:''}
      <div class="screen"><canvas></canvas><div class="hud"><span class="score">0</span></div><div class="overlay"></div></div>
      ${def.era==='console'||def.era==='nextgen'||def.era==='ar'?'<div class="bezel-bottom"><span class="slot"></span><span class="pads"><i></i><i></i><i></i></span></div>':def.retro?'<div class="bezel-bottom"><span class="dpad"></span><span class="ab"><i></i><i></i></span></div>':''}
    </div></div>
    <div class="meta">
      <button class="caption" aria-label="How to play ${def.title}"><span class="tag">${def.tag}</span><h2>${def.title}</h2><p>${def.hint}</p><span class="more"><b>ⓘ How to play</b> · Best <span class="best">0</span></span></button>
      <div class="rail">
        <button class="rbtn like" aria-pressed="false"><span class="ic">♥</span><span class="n"></span></button>
        <button class="rbtn meh" aria-label="Meh: hide this game"><span class="ic">👎</span><span>Meh</span></button>
        <button class="rbtn walletbtn" aria-label="Credits and trophies"><span class="ic">◆</span><span class="n">${fmt(progress.credits)}</span></button>
        <button class="rbtn sharebtn" aria-label="Share this game"><span class="ic">↗</span><span>Share</span></button>
        <button class="rbtn nextbtn" aria-label="Next game"><span class="ic">↓</span><span>Next</span></button>
      </div>
    </div>`;
  const s={def,el,canvas:el.querySelector('canvas'),screen:el.querySelector('.screen'),overlay:el.querySelector('.overlay'),scoreEl:el.querySelector('.score'),
    state:'ready',score:0,overAt:0,dirty:true,w:def.w,h:def.h};
  s.ctx=s.canvas.getContext('2d');
  s.api={
    score:n=>{s.score=n;s.scoreEl.textContent=n;if(def.goal&&n>=def.goal)win(s)},
    over:()=>gameOver(s),
    win:()=>win(s),                                     // for games with a natural win (cleared the board, etc.)
    has:id=>!!(s.run&&s.run.items.has(id)),             // is this shop item active for the current run?
    ...savesFor(def),                                     // save(data) / load(fallback) / clearSave(): this game's own save slot
    ...awayFor(def.id),                                 // away(): seconds since this game last ran (idle games)
    brains:brainsFor(def.id),                            // where this game's Tiny Brains keep what they learned (src/brainstore.js)
    ...geoFor(def),                                     // location() / watchLocation(cb): rounded, only during a round (src/geo.js)
  };
  bootGame(s);
  // like
  const likeBtn=el.querySelector('.like'),liked=rating(def.id)>0||(rating(def.id)===0&&store.get('gs_like_'+def.id,false));
  // Shared counts come from the hearts backend; dev/test builds without it keep the old local number.
  const setLike=v=>{likeBtn.setAttribute('aria-pressed',v);likeBtn.querySelector('.n').textContent=fmt(hearts.enabled?hearts.count(def.id,v):def.likes+(v?1:0))};setLike(liked);
  likeBtn.onclick=()=>{const v=likeBtn.getAttribute('aria-pressed')!=='true';if(v)funNote(s,'heart');store.set('gs_like_'+def.id,v);setRating(def.id,v?1:0);hearts.set(def.id,v);rerank();document.querySelectorAll('.slide').forEach(x=>{if(x._s&&x._s.def.id===def.id)x._s.setLike(v)})};
  s.setLike=setLike;
  el.querySelector('.meh').onclick=()=>{funNote(s,'meh');const was=rating(def.id);setRating(def.id,-1);if(likeBtn.getAttribute('aria-pressed')==='true'){store.set('gs_like_'+def.id,false);setLike(false);hearts.set(def.id,false)}
    rerank();qaToast(`Hidden: ${def.title}`,()=>{setRating(def.id,was);rerank()});goNext(s)};
  el.querySelector('.nextbtn').onclick=()=>goNext(s);
  el.querySelector('.sharebtn').onclick=async()=>{haptic('light');const r=await shareGame(def,best(def.id));if(r==='copied')toast(el,'Link copied','info')};
  s.overlay.onclick=e=>{if(Date.now()-s.overAt<550)return;startGame(s)};
  // pointer input
  const pt=e=>{const r=s.canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width*s.w,(e.clientY-r.top)/r.height*s.h]};
  // Multi-touch: each finger is tracked by its pointer id, passed to the game as the last argument
  // (down(x, y, id), move(x, y, pressed, id), up(x, y, id)). One-finger games can ignore it.
  const held=new Set();
  s.canvas.addEventListener('pointerdown',e=>{if(s.state!=='playing')return;held.add(e.pointerId);lastGameInput=performance.now();try{s.canvas.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();s.game.down&&s.game.down(...pt(e),e.pointerId)});
  s.canvas.addEventListener('pointermove',e=>{if(s.state!=='playing')return;const pressed=held.has(e.pointerId);if(pressed)lastGameInput=performance.now();s.game.move&&s.game.move(...pt(e),pressed,e.pointerId)});
  const up=e=>{if(!held.delete(e.pointerId))return;if(s.state==='playing'&&s.game.up)s.game.up(...pt(e),e.pointerId)};
  s.canvas.addEventListener('pointerup',up);s.canvas.addEventListener('pointercancel',up);
  s.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  el._s=s;
  el.querySelector('.caption').onclick=()=>openInfo(s);
  if(canFull(def))el.querySelector('.fsbtn').onclick=e=>{e.stopPropagation();haptic('light');toggleFull(s)};
  renderOverlay(s);updateBest(s);
  return s;
}

/* ---------- how-to-play sheet: tapping the caption opens the full description ---------- */
let infoDlg=null;
// who made the game: def.creator (plain text, set by contributors), otherwise Rob
const creatorOf=d=>String(d.creator||'Rob').slice(0,40).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function openInfo(s){
  const d=s.def;
  if(!infoDlg){infoDlg=document.createElement('dialog');infoDlg.className='info';document.body.appendChild(infoDlg);
    infoDlg.addEventListener('click',e=>{if(e.target===infoDlg)infoDlg.close()});
    infoDlg.addEventListener('close',()=>{const t=infoDlg._s;if(t&&t.pauseWhy==='info')resumeGame(t)})}
  infoDlg._s=s;pauseGame(s,'info');
  const kind=d.era==='console'?'Classic · Console game':d.era==='nextgen'?'Next Gen · Console game':d.era==='ar'?'AR 3D game: uses your camera and motion sensor':d.era==='advance'?'Advance-style pocket game':d.era==='color'?'Colour pocket game':d.retro?'Dot-matrix pocket game':'Phone game';
  infoDlg.innerHTML=`<div class="info-card"><button class="info-x" aria-label="Close">✕</button>
    <span class="tag">${d.tag}</span><h2>${d.title}</h2><div class="info-by">Created by <b>${creatorOf(d)}</b></div><div class="info-k">${kind}</div>
    <h3>How to play</h3><p>${d.hint}</p>${locNote(d)}${sensorNote(d)}
    <div class="info-stats"><div><b>${fmt(best(d.id))}</b>Your best</div>${d.goal?`<div><b>${d.goal}</b>Score to win</div>`:''}</div>
    <button class="play info-play">${s.state==='playing'?'Keep playing':'Play'}</button></div>`;
  infoDlg.querySelector('.info-x').onclick=()=>infoDlg.close();
  infoDlg.querySelector('.info-play').onclick=()=>{const was=s.state;infoDlg.close();if(was!=='playing'&&active===s&&Date.now()-s.overAt>550)startGame(s)};
  infoDlg.showModal();
}
function best(id){return progress.best(id)}
function updateBest(s){s.el.querySelector('.best').textContent=fmt(best(s.def.id))}

// Games that use location say so before Play, so the phone's question doesn't come out of nowhere.
// ...and so do games that use the camera, mic or motion sensor (worked out from their code), and
// iPhones get asked for motion access on the Play tap instead of in the middle of a round.
const SENSOR_WORDS={camera:'camera',mic:'microphone',motion:'motion sensor'};
const sensorNote=d=>{const u=(d.uses||[]).filter(k=>SENSOR_WORDS[k]);if(!u.length||d.era==='ar')return'';const w=u.map(k=>SENSOR_WORDS[k]);
  return`<div class="ov-loc">${u.includes('camera')?'📷':u.includes('mic')?'🎤':'📱'} Uses your ${w.length>1?w.slice(0,-1).join(', ')+' and '+w[w.length-1]:w[0]}${u.includes('camera')||u.includes('mic')?'. Nothing is recorded or leaves your phone':''}.</div>`};
const locNote=d=>d.location?`<div class="ov-loc">📍 Uses your ${d.location==='precise'?'location to walk around':'rough area (about 1 km)'}. It stays on your phone, and you can say no.</div>`:'';
function renderOverlay(s){
  const d=s.def,cue='<div class="swipe-cue">Swipe up for the next game</div>';
  if(s.failed){s.overlay.innerHTML=`<div class="ov-k">Oops</div><div class="ov-title">${d.title}</div><div class="ov-hint">${s.failed}</div><button class="play">Try again</button>${cue}`;s.overlay.hidden=false;return}
  if(s.state==='ready'){
    if(d.uses?.includes('motion'))want('motion');
    s.overlay.innerHTML=`<div class="ov-k">${d.era==='nextgen'||d.era==='ar'?'Ready':d.retro?'Insert coin':'Tap to start'}</div><div class="ov-title">${d.title}</div><div class="ov-hint">${d.hint}</div>${goalHTML(d)}${locNote(d)}${sensorNote(d)}<button class="play">${d.retro?'PRESS START':'Play'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
  }else if(s.state==='over'){
    const b=best(d.id),isNew=s.score>0&&s.score>=b&&s.newBest;
    const res=s.paid?`<div class="ov-win">${s.won==='first'?'FIRST WIN ':'WIN '}+${s.paid} CREDITS</div>`:d.goal?`<div class="ov-goal">Score ${d.goal} to win credits</div>`:'';
    s.el.querySelectorAll('.toast').forEach(t=>t.remove());   // the game-over screen repeats what they said
    const tro=(s.trophies||[]).map(t=>`<div class="ov-trophy">🏆 ${t.name}</div>`).join('');
    s.overlay.innerHTML=`<div class="ov-k">${s.paid?'You won':'Game over'}</div><div class="ov-score">${s.score}</div>${isNew?'<div class="ov-new">NEW BEST</div>':`<div class="ov-best">Best ${b}</div>`}${res}${tro}${rankHTML(s.rank)}<button class="play">${d.retro?'RETRY':'Play again'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
    s.overlay.querySelector('.ov-rank')?.addEventListener('click',e=>{e.stopPropagation();openBoard(d)});
  }
  s.overlay.hidden=s.state==='playing';
}

function goalHTML(d){
  if(!d.goal)return'';
  const w=progress.wins(d.id),r=rewardOf(d.reward);
  return d.retro?`<div class="ov-goal">Win at ${d.goal} · <b>+${w?r:r*2}</b> credits</div>`
    :`<div class="ov-goal">Score ${d.goal} to win <b>◆${w?r:r*2}</b>${w?'':' (first win pays double)'}</div>`;
}

// Pause and resume. A round pauses when the app goes to the background (a call, the home button,
// another app), while the How to play card is open, or on Escape / a controller's Start button. The
// game hears about it through its optional pause() / resume() hooks (stop timers, the mic...), music
// holds where it is, and the player taps "Carry on" to continue (the card resumes by itself on close).
function pauseGame(s,why='away'){
  if(!s||s.state!=='playing'||s.paused)return;
  s.paused=true;s.pauseWhy=why;pauseAll();
  try{s.game.pause?.()}catch(e){console.error(s.def.id,e)}
  if(why!=='info')pauseOv(s);
}
function pauseOv(s){
  {
    let el=s.screen.querySelector('.pause-ov');
    if(!el){el=document.createElement('div');el.className='overlay pause-ov';s.screen.appendChild(el)}
    el.onclick=e=>{e.stopPropagation();resumeGame(s)};
    el.innerHTML=`<div class="ov-k">Paused</div><div class="ov-title">${s.def.title}</div><button class="play">${s.def.retro?'CONTINUE':'Carry on'}</button>${isFull(s)?'<button class="fs-exit">Exit full screen</button>':''}`;
    const fx=el.querySelector('.fs-exit');if(fx)fx.onclick=e=>{e.stopPropagation();leaveFull()};
    el.hidden=false;
  }
}
function resumeGame(s){
  if(!s||!s.paused)return;
  s.paused=false;s.pauseWhy=null;const el=s.screen.querySelector('.pause-ov');if(el)el.hidden=true;
  lastT=performance.now();perf.gap();
  if(s.state!=='playing')return;
  try{s.game.resume?.()}catch(e){console.error(s.def.id,e)}
  resumeAll();
}
function clearPause(s){s.paused=false;s.pauseWhy=null;const el=s.screen.querySelector('.pause-ov');if(el)el.hidden=true}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)pauseGame(active,'away')});

// Fun signals for the game's Tiny Brains (src/brainstore.js): what the player did around a round
// says how fun it was. Played again within 30 s +1, hearted +1 (during or within a minute of the
// round), Meh -1, left the game-over screen within 4 s -0.5. One "again or left" signal per round.
function funNote(s,what){
  const id=s.api.brains,since=s.funAt?Date.now()-s.funAt:Infinity;
  if(what==='heart'){if((s.state==='playing'||since<60000)&&!s.funHeart){s.funHeart=true;sendFun(id,1)}return}
  if(what==='meh'){sendFun(id,-1);return}
  if(s.funSent||!s.funAt)return;
  if(what==='again'&&since<30000){s.funSent=true;sendFun(id,1)}
  else if(what==='left'&&since<4000){s.funSent=true;sendFun(id,-.5)}
}
function startGame(s){
  if(active!==s)return;
  if(s.failed){bootGame(s);s.dirty=true;renderOverlay(s);return}   // the card's "Try again"
  if(s.loading)return;
  if(s.state==='over')funNote(s,'again');s.funHeart=false;
  clearPause(s);
  // Boosts the player owns for this game are used up on this run; unlocks stay on.
  // (taken only once the round has started cleanly, so a game that fails to reset costs nothing)
  const ready=(Array.isArray(s.def.shop)?s.def.shop:[]).filter(it=>it&&progress.owned(s.def.id,it)>0);
  s.run={items:new Set(ready.map(it=>it.id))};
  s.won=false;s.paid=0;s.trophies=[];
  roundStarted(s.def.id);   // before reset(): a location game may ask where the player is there
  s.stale=false;if(!resetGame(s)){roundEnded(s.def.id);return}
  for(const it of ready)if(it.kind!=='unlock')progress.use(s.def.id,it);
  progress.played(s.def.id);playstats.started(s.def.id);perf.started(s.def.id);s.score=0;s.scoreEl.textContent='0';s.state='playing';s.newBest=false;s.startAt=Date.now();
  s.el.classList.add('playing');s.el.classList.remove('over');feed.classList.add('locked');s.startPerf=performance.now();renderOverlay(s);
  sfx(660,.08,'square',.04,300);
}
// A run counts as a win the first time its score reaches the game's goal (or the game calls
// api.win()). It pays credits once per run and the game carries on.
function win(s){
  if(s.won||s.state!=='playing')return;
  const r=progress.win(s.def.id,s.def.reward);
  s.won=r.first?'first':'yes';s.paid=r.paid;
  toast(s.el,`WIN +${r.paid} CREDITS`,'win');haptic('success');sfx(880,.12,'triangle',.06,440);
  awardTrophies(s);
}
function awardTrophies(s){
  for(const t of checkTrophies()){toast(s.el,`🏆 ${t.name}`,'trophy');services.unlock(t.id);(s.trophies||=[]).push(t)}
}
function gameOver(s){
  if(s.state!=='playing')return;clearPause(s);if(isFull(s))leaveFull();
  s.state='over';s.overAt=Date.now();s.funAt=s.overAt;s.funSent=false;stopKits();roundEnded(s.def.id);logRound(s.def.id,s.overAt-s.startAt);playstats.round(s.def.id,s.overAt-s.startAt);perf.ended();s.el.classList.remove('playing');s.el.classList.add('over');feed.classList.remove('locked');
  if(progress.score(s.def.id,s.score))s.newBest=true;
  awardTrophies(s);services.reportRun(s.def);
  s.rank=null;const round=s.overAt;boards.submit(s.def.id,s.score,(s.overAt-s.startAt)/1000).then(r=>{if(r&&s.state==='over'&&s.overAt===round){s.rank=r;if(!s.overlay.hidden)renderOverlay(s)}});
  updateBest(s);if(!s.won)haptic('error');sfx(220,.35,'square',.05,-150);
  s.overlay.hidden=true;setTimeout(()=>{if(s.state==='over')renderOverlay(s)},450);
}
// later: the card is being swiped away, so its game resets (which can rebuild a whole 3D level) once
// the swipe has settled, not in the frame the swipe starts (Play resets it anyway if it comes first)
function resetSlide(s,later=false){if(isFull(s))leaveFull();stopKits();clearPause(s);roundEnded(s.def.id);if(s.state==='playing'){logRound(s.def.id,Date.now()-s.startAt);playstats.round(s.def.id,Date.now()-s.startAt);perf.ended()}s.state='ready';s.run=null;s.el.classList.remove('playing','over');s.score=0;s.scoreEl.textContent='0';
  if(later){s.stale=true;renderOverlay(s);whenCalm(()=>{if(s.stale&&s.state==='ready'&&!s.dropped){s.stale=false;if(resetGame(s))renderOverlay(s);s.dirty=true}});return}
  s.stale=false;if(resetGame(s))renderOverlay(s);s.dirty=true}
function goPrev(s){
  const i=slides.indexOf(s);if(i<=0)return;
  if(s.state==='playing')resetSlide(s,true);feed.classList.remove('locked');
  slides[i-1].el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
// While a game is running the feed is locked so in-game drags never scroll it. A swipe that starts
// outside the game screen (caption, buttons, shell, top bar) still changes game, but only when it
// looks deliberate and not like part of play:
//  - it must start outside the screen; drags that start on the game always belong to the game
//  - no game input in the last 0.8s (a thumb sliding off the screen mid-play is ignored)
//  - a clear vertical flick: at least 70px, mostly vertical, finished within 0.7s
//  - not during the first second of a run, when people are still settling their grip
let lastGameInput=0;
{
  let sw=null;
  addEventListener('pointerdown',e=>{
    if(!feed.classList.contains('locked')||!active||anyFull()||e.target.closest('.screen,dialog'))return;
    sw={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId};
  },{passive:true});
  addEventListener('pointerup',e=>{
    if(!sw||e.pointerId!==sw.id)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y,now=performance.now(),dt=now-sw.t;sw=null;
    const s=active;if(!s||s.state!=='playing')return;
    if(Math.abs(dy)<70||Math.abs(dy)<Math.abs(dx)*1.5||dt>700)return;
    if(now-lastGameInput<800||now-(s.startPerf||0)<1000)return;
    if(dy<0)goNext(s);else goPrev(s);
  });
  addEventListener('pointercancel',()=>{sw=null});
}
function goNext(s){
  if(s.state==='playing')resetSlide(s,true);feed.classList.remove('locked');
  const i=slides.indexOf(s);if(!slides[i+2])topUp();
  if(!slides[i+1])return;
  slides[i+1].el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

// Each game has a base size (def.w x def.h). Games that set maxW / maxH are "fluid": after the base
// size is scaled to fit, the leftover space is handed to the game as extra width or height (up to
// the max, in multiples of def.step if set) through game.resize(w, h), so tall phones and unfolded foldables are filled, not letterboxed.
const CHROME={retro:[28,88],modern:[0,0]};
function fit(s,again){
  const st=s.el.querySelector('.stage'),d=s.def,dev=s.el.querySelector('.device');let [cw,ch]=CHROME[d.retro?'retro':'modern'];
  // use the frame's real border/bezel size once it's laid out, so no space is reserved that the frame doesn't use
  if(dev&&s.screen.offsetWidth>40){const mw=dev.offsetWidth-s.screen.offsetWidth,mh=dev.offsetHeight-s.screen.offsetHeight;if(mw>=0&&mw<=80&&mh>=0&&mh<=160){cw=mw;ch=mh}}
  const aw=st.clientWidth-cw,ah=st.clientHeight-ch;
  if(aw<=0||ah<=0)return;
  let sc=Math.min(aw/d.w,ah/d.h);
  if(d.retro){if(sc>=2)sc=Math.floor(sc*4)/4;sc=Math.max(1,sc)}else sc=Math.max(.3,sc);
  const st2=d.step||1,grow=(b,m,a)=>b+Math.floor(Math.max(0,Math.min(m||b,Math.floor(a/sc))-b)/st2)*st2;
  // full screen (Next Gen): no maxW / maxH cap, so the whole display is filled; still no wider or taller than 2.4 : 1
  const full=isFull(s);let w=grow(d.w,full?9999:d.maxW,aw),h=grow(d.h,full?9999:d.maxH,ah);
  if(full){w=Math.min(w,Math.max(d.w,Math.round(h*2.4)));h=Math.min(h,Math.max(d.h,Math.round(w*2.4)))}
  if(w!==s.w||h!==s.h){s.w=w;s.h=h;s.game.resize&&s.game.resize(w,h)}
  s.screen.style.width=Math.round(w*sc)+'px';s.screen.style.height=Math.round(h*sc)+'px';
  // Pocket games draw chunky pixels; Console games render at full device resolution, smoothed and lit.
  const pixel=d.retro&&d.era!=='console'&&d.era!=='nextgen'&&d.era!=='ar';
  if(pixel){s.canvas.width=w;s.canvas.height=h;s.ctx.setTransform(1,0,0,1,0,0)}
  else{let k=sc*Math.min(2.5,window.devicePixelRatio||1);if(s.lite&&w*h*k*k>LITE_PX)k=Math.sqrt(LITE_PX/(w*h));s.canvas.width=Math.round(w*k);s.canvas.height=Math.round(h*k);s.ctx.setTransform(k,0,0,k,0,0)}
  s.ctx.imageSmoothingEnabled=!pixel;s.canvas.classList.toggle('hires',!pixel);s.dirty=true;
  // first fit of a new slide guessed the frame size; now it's laid out, refit once with the real one
  if(!again&&dev&&dev.offsetHeight-s.screen.offsetHeight!==ch)fit(s,true);
}

// Shuffled queue over the whole catalogue; the feed pulls a few at a time so 1000 games never means 1000 slides in the DOM.
let queue=[];
// ar:'world' games need native AR (walking around), so the feed leaves them out on phones without it.
function inPool(g){return (filter.startsWith('id:')||!isHidden(g.id)&&!(g.ar==='world'&&nativeARSupported()!==true))&&(filter==='all'||(filter.startsWith('id:')?g.id===filter.slice(3):filter==='pocket'?g.retro&&g.era!=='console'&&g.era!=='nextgen'&&g.era!=='ar':filter==='console'?g.era==='console':filter==='nextgen'?g.era==='nextgen':filter==='ar'?g.era==='ar':!g.retro))}
function pickDefs(n=6){
  let pool=GAMES.filter(inPool);
  if(!pool.length)pool=GAMES;
  const out=[],later=[];let tries=pool.length*2+n;
  while(out.length<n&&pool.length&&tries-->0){
    if(!queue.length){queue=rankQueue(pool,GAMES);if(queue.length>1&&queue[0].id===lastId)queue.push(queue.shift())}
    const q=queue.shift(),d=playable(q);
    if(!d){if(remote.has(q.id))later.push(q);if(later.length>=n)break;continue}   // still downloading: it goes in the next batch
    out.push(d);lastId=d.id;
    if(pool.length<n&&out.length>=pool.length)break;
  }
  queue.unshift(...later);
  remote.prefetch(queue.slice(0,AHEAD+3));   // start downloading the games after those too
  return out;
}
// After a heart or Meh, a skip or a real play, or fresh stats from everyone, re-rank the games still
// waiting in this cycle. The next few stay put: they're already downloading.
function rerank(keep=0){if(queue.length<=keep+1)return;const head=queue.slice(0,keep);queue=head.concat(rankQueue(queue.slice(keep).filter(g=>!isHidden(g.id)),GAMES))}
// (a view ends as the next card scrolls in: the re-rank waits until the feed is still)
let rerankDue=false;
history.onChange((id,w)=>{if(w&&!rerankDue){rerankDue=true;whenCalm(()=>{rerankDue=false;rerank(3)})}});
// speed.offscreen tells the 3D kits this card isn't the one being played: draw it without taking the shared
// 3D canvas or the frame-rate tuning away from the card on screen (src/kit/hd3d.js).
const usesHD=d=>d.era==='nextgen'||d.era==='ar';
function paint(s){
  // a game that throws while drawing shows its problem card instead (painting new cards for the feed
  // must never stop at one broken game)
  const off=s!==active;speed.offscreen=off;try{s.game.draw(s.ctx)}catch(e){speed.offscreen=false;gameFault(s,e);try{s.game.draw(s.ctx)}catch(_){}return}finally{speed.offscreen=false}
  if(s.def.era==='console'){s.ctx.save();consolePost(s.ctx,s.w||s.def.w,s.h||s.def.h);s.ctx.restore()}
  // the shared 3D canvas shown on the card being played just drew another card's frame: put its own back
  if(off&&active&&usesHD(s.def)&&usesHD(active.def)&&!active.loading)paint(active);
}
// Always keep AHEAD games downloaded and ready below the one you're on, so swiping never waits.
const AHEAD=5;
// The fresh catalogue arrived after the feed started from the saved one. New games join this cycle.
// Games whose category changed leave the queue, and the slides waiting below you, of a tab they no longer
// belong to, and slides waiting below you are rebuilt with any changed details.
function catalogueChanged(added,updated){
  for(const g of added)if(inPool(g))queue.splice(Math.random()*(queue.length+1)|0,0,g);
  if(!updated.length)return;
  const ids=new Set(updated.map(g=>g.id));
  queue=queue.filter(g=>!ids.has(g.id)||inPool(g));
  const i=active?slides.indexOf(active):-1;
  for(const s of slides.slice(i+1))if(ids.has(s.def.id)){const g=GAMES.find(x=>x.id===s.def.id);dropSlide(s);slides.splice(slides.indexOf(s),1);if(g&&inPool(g))queue.unshift(g)}
  topUp();
}
function topUp(){const ahead=slides.length-1-(active?slides.indexOf(active):0);if(ahead<AHEAD)addBatch(AHEAD-ahead+1)}
// Adding a card means making its game and drawing it the first time, which can take a while (a 3D
// level, its textures). Done in the middle of a swipe, that froze the scroll. So after a swipe the
// feed tops up once it has come to rest and the finger is off, one card at a time, and never while a
// round is being played. There are always AHEAD cards ready below, so nothing is ever missing.
let topT=0,scrollAt=0;
feed.addEventListener('scroll',()=>{scrollAt=performance.now()},{passive:true});
const settling=()=>touches>0||performance.now()-scrollAt<150;
// Calm: the feed has been still, with no finger on it, for a moment (QUIET ms). People swipe on
// quickly after a card lands, so work that can wait (building the next cards, resetting the card
// just left, re-ranking) waits for a calm moment, and then runs one piece per idle slot, so a long
// piece of it doesn't land just as the next swipe starts.
const QUIET=350;let touchAt=0;
const calm=()=>!touches&&performance.now()-Math.max(scrollAt,touchAt)>=QUIET;
const idleSlot=fn=>typeof requestIdleCallback==='function'?requestIdleCallback(fn,{timeout:300}):setTimeout(fn,16);
const calmJobs=[];let calmT=0;
function whenCalm(fn){calmJobs.push(fn);if(!calmT)calmT=setTimeout(calmTick,QUIET)}
function calmTick(){
  calmT=0;if(!calmJobs.length)return;
  if(!calm()){calmT=setTimeout(calmTick,100);return}
  idleSlot(()=>{if(!calm()){calmT=setTimeout(calmTick,100);return}const f=calmJobs.shift();try{f()}catch(e){console.error(e)}if(calmJobs.length)calmT=setTimeout(calmTick,60)});
}
speed.busy=()=>!calm();speed.playing=()=>!!active&&active.state==='playing';
function topUpLater(wait=QUIET){
  clearTimeout(topT);
  const ahead=()=>slides.length-1-(active?slides.indexOf(active):0);
  // with only one card left below (a very quick scroller), don't wait for a calm moment: build as
  // soon as the swipe has come to rest
  const ok=()=>ahead()<=1?!settling():calm();
  topT=setTimeout(()=>{
    if(active&&active.state==='playing')return topUpLater(1000);           // mid-round: after it
    if(!ok())return topUpLater(100);                                        // still moving: wait for it to settle
    idleSlot(()=>{
      if(!ok()||active&&active.state==='playing')return topUpLater(100);
      const n=ahead();
      if(n<AHEAD)addStaged(ok,()=>{if(n+1<AHEAD)topUpLater(120)});
    });
  },wait);
}
// One card, in three pieces with an idle moment between each (making its game, sizing it, drawing
// it the first time), so no single piece is long enough to be felt if a swipe starts meanwhile. A
// card that comes on screen before it's finished is finished at once (setActive).
function addStaged(ok,done){
  const defs=pickDefs(1);if(!defs.length){addBatch(1);done();return}
  const s=makeSlide(defs[0]);s.unready=true;feed.appendChild(s.el);slides.push(s);io.observe(s.el);feedMsg(null);
  const step=(f,next)=>idleSlot(()=>{if(s.dropped||!s.unready)return done();if(!ok()){setTimeout(()=>step(f,next),100);return}f();next?next():done()});
  step(()=>fit(s),()=>step(()=>{s.unready=false;paint(s)}));
}
function finishCard(s){if(!s.unready)return;s.unready=false;fit(s);paint(s)}
let waiting=false;
function addBatch(n=AHEAD+1){
  const defs=pickDefs(n);
  for(const d of defs){const s=makeSlide(d);feed.appendChild(s.el);slides.push(s);fit(s);paint(s);io.observe(s.el)}
  if(defs.length)feedMsg(null);
  if(defs.length>=n||waiting)return;
  // Some of the next games are still downloading: add them as soon as they arrive.
  if(STREAM&&queue.some(g=>remote.has(g.id))){
    if(!slides.length)feedMsg('loading');
    waiting=true;
    Promise.all(queue.slice(0,n-defs.length).map(g=>remote.load(g.id))).then(()=>{waiting=false;if(!slides.length)addBatch();else topUp();if(!active&&slides[0])setActive(slides[0])});
  }else if(!slides.length)feedMsg('offline');
}

// A card in the empty feed: downloading the first games, or offline with none saved yet.
function feedMsg(kind){
  feed.querySelector('.feed-msg')?.remove();
  if(!kind)return;
  const el=document.createElement('div');el.className='feed-msg '+kind;
  el.innerHTML=kind==='loading'?'<div class="fm-spin"></div><p>Loading games…</p>'
    :'<b>No connection</b><p>Games stream in over the internet. Connect and try again. Games you\'ve played recently also work offline.</p><button class="play">Try again</button>';
  const b=el.querySelector('button');if(b)b.onclick=()=>{feedMsg('loading');remote.refresh().then(()=>start())};
  feed.appendChild(el);
}

// Play a chosen game now: slot it in right after the current game and scroll to it.
function playNow(id){
  const g=GAMES.find(x=>x.id===id);if(!g)return;
  const def=playable(g);if(!def){remote.load(id).then(d=>{if(d)playNow(id)});return}
  const i=active?slides.indexOf(active):-1;if(active&&active.state==='playing')resetSlide(active);feed.classList.remove('locked');
  const s=makeSlide(def),next=slides[i+1];feed.insertBefore(s.el,next?next.el:null);slides.splice(i+1,0,s);fit(s);paint(s);io.observe(s.el);
  requestAnimationFrame(()=>s.el.scrollIntoView({behavior:'auto'}));
}
// A shared link: at launch the game goes first in the feed; while the app is open it plays next.
function openShared(id){
  const g=GAMES.find(x=>x.id===id);if(!g)return;
  if(active&&slides.indexOf(active)===0&&active.state==='ready'&&feed.scrollTop<4){
    const def=playable(g);if(!def){remote.load(id).then(d=>{if(d)openShared(id)});return}
    if(active.def.id===id)return;
    const s=makeSlide(def);feed.insertBefore(s.el,slides[0].el);slides.unshift(s);fit(s);paint(s);io.observe(s.el);feed.scrollTop=0;setActive(s);return}
  playNow(id);
}
function setActive(s){
  if(active===s)return;
  stopKits();
  // the card being left: a round in play ends now; a finished one (the game-over screen) is reset
  // once the swipe has settled, as resetting can rebuild a whole 3D level, which mid-swipe is a stutter
  const prev=active;
  if(prev&&prev.state==='over')funNote(prev,'left');
  if(prev&&prev.state==='playing')resetSlide(prev,true);
  else if(prev&&prev.state!=='ready')whenCalm(()=>{if(prev!==active&&prev.state!=='ready'&&!prev.dropped)resetSlide(prev)});
  finishCard(s);feed.classList.remove('locked');active=s;speed.game=s.def;s.dirty=true;if(STREAM)remote.touch(s.def.id);playstats.shown(s.def.id);perf.shown(s.def.id);showTweaks(s);
  // the last card (playNow, a short feed): top up now, else when the swipe has settled
  // (only a feed with nothing below at all builds now, in the middle of the swipe)
  if(!slides[slides.indexOf(s)+1])topUp();else topUpLater(slides.indexOf(s)>=slides.length-2?0:QUIET);schedulePrune();
}

// Cards you've scrolled past stay in the page so you can swipe back, but only the last BEHIND of
// them: every card holds a canvas and a whole game, so a long session would keep using more memory
// until the phone closes the app. Older cards are dropped a few at a time, once the feed has
// settled, and the scroll position is corrected in the same frame so nothing on screen moves.
const BEHIND=8,PRUNE_BATCH=4;
let pruneT=0,touches=0;
addEventListener('pointerdown',()=>{touches++;touchAt=performance.now()},true);
for(const ev of ['pointerup','pointercancel'])addEventListener(ev,()=>{touches=Math.max(0,touches-1);touchAt=performance.now()},true);
function schedulePrune(wait=800){clearTimeout(pruneT);pruneT=setTimeout(pruneBehind,wait)}
function pruneBehind(){
  const i=active?slides.indexOf(active):-1,n=i-BEHIND;
  if(n<PRUNE_BATCH)return;
  const top=()=>active.el.getBoundingClientRect().top-feed.getBoundingClientRect().top;
  if(!calm()||Math.abs(top())>1)return schedulePrune(300);   // still moving or under a finger: try again soon
  const before=top();
  for(const s of slides.splice(0,n))dropSlide(s);
  feed.scrollTop+=top()-before;   // undo the jump (some browsers already did, then this adds 0)
}

// A card leaves the feed for good: let the game tidy up, then free what its kits hold (physics worlds).
function dropSlide(s){s.dropped=true;io.unobserve(s.el);try{s.game.dispose?.()}catch(_){}release(s);s.el.remove()}
let built=0;
function rebuild(){
  built++;slides.forEach(dropSlide);feed.innerHTML='';slides=[];active=null;lastId=null;queue=[];feed.scrollTop=0;addBatch();if(slides[0])setActive(slides[0]);
}

let resizeAt=0;
io=new IntersectionObserver(es=>{if(performance.now()-resizeAt<500)return;for(const e of es)if(e.isIntersecting&&e.intersectionRatio>=.6)setActive(e.target._s)},{root:feed,threshold:[.6]});

// Hot reload (npm run dev, vite.config.js hotGames): a saved game file arrives here and replaces the
// game on its card. The feed, the debug overlay and gs.tweak values stay; a round in progress goes on
// from where it was if the game has snapshot() / restore(data), otherwise it starts again at once.
if(import.meta.hot)import.meta.hot.on('gs:game',async({id,url})=>{
  try{const m=await import(/* @vite-ignore */url+'?t='+Date.now());hotSwap(m.default)}
  catch(e){console.error(`[hot] ${id}:`,e)}
});
function hotSwap(d){
  if(!d||!d.id||!d.make)return;
  let g=GAMES.find(x=>x.id===d.id);
  if(g){try{Object.assign(g,d)}catch(_){const i=GAMES.indexOf(g);GAMES[i]=g={likes:g.likes,...d}}}else GAMES.push(g={likes:300,...d});
  for(const s of slides){
    if(s.def.id!==d.id)continue;
    const playing=s.state==='playing';let snap;
    if(playing&&s.game.snapshot)try{snap=s.game.snapshot()}catch(e){console.warn('[hot] snapshot',e)}
    if(s===active)stopKits();
    try{s.game.dispose?.()}catch(_){}release(s);
    s.def=g;s.w=g.w;s.h=g.h;bootGame(s);fit(s);
    if(playing&&snap!==undefined&&s.game.restore)try{ownedBy(s,()=>s.game.restore(snap))}catch(e){console.warn('[hot] restore',e)}
    else if(playing){s.score=0;s.scoreEl.textContent='0'}
    else if(s.state==='over'){s.state='ready';s.el.classList.remove('over');renderOverlay(s)}
    s.dirty=true;toast(s.el,'♻ '+g.title,'');
  }
  console.info(`[hot] ${d.id} reloaded`);
}

// Debug overlay for makers (src/debug.js): dev and test builds only, never in the store apps.
const DBG=import.meta.env.MODE==='bundled'?makeDebug():null;
let lastT=performance.now(),nextAt=0;
// A 2D game on a big screen (a foldable opened up) draws twice a phone's pixels each frame. If it can't keep
// up (two windows of 45 frames a quarter over the frame budget), its canvas drops to at most LITE_PX and the
// screen stretches it; after ~6 s of easy frames it goes back to full sharpness (once per visit to the card, so it
// can't flip back and forth). A game keeping up is never touched. (Next Gen and AR do the same in hd3d.js.)
const LITE_PX=2.4e6,L2={id:null,t:0,sum:0,cnt:0,slow:0,fast:0,back:0};
function lite2d(s,now,step){
  if(L2.id!==s){L2.id=s;L2.t=0;L2.sum=L2.cnt=L2.slow=L2.fast=L2.back=0}
  const gap=now-(L2.t||now);L2.t=now;if(!(gap>0&&gap<100))return;
  if(!s.lite&&s.canvas.width*s.canvas.height<=LITE_PX)return;
  L2.sum+=gap;if(++L2.cnt<45)return;const a=L2.sum/L2.cnt;L2.sum=L2.cnt=0;
  if(a>step*1.26){L2.fast=0;if(!s.lite&&++L2.slow>=2){L2.slow=0;s.lite=true;fit(s)}}
  else if(a<step*1.044){L2.slow=0;if(s.lite&&!L2.back&&++L2.fast>=8){L2.fast=0;L2.back=1;s.lite=false;fit(s)}}
  else L2.slow=L2.fast=0;
}
function frame(now){
  requestAnimationFrame(frame);
  pollPads(padInput);
  tickHz(now);
  const s=active;
  // Frame rate per game and phone (src/kit/speed.js): on a 120 Hz screen a 60 fps game skips every
  // other refresh, which saves battery and heat. Frames are due on a steady beat (nextAt), not a gap
  // since the last one, so a 60 fps game on a 90 Hz screen alternates 1 and 2 refreshes and still
  // averages 60 (a gap check would wait 2 every time: 45 fps). Slack: a slightly early refresh counts.
  const fps=s?fpsFor(s.def):60,step=1000/fps;
  if(s){
    // a refresh between two real frames: a Next Gen or AR game making frames in between (frame generation,
    // src/kit/framegen.js) shows the one it planned for it
    if(now<nextAt-.4*1000/screenHz()){const b=speed.between;speed.between=null;if(b)try{b()}catch(e){console.warn('frame generation',e)}return}
    nextAt=now-nextAt>step?now+step:nextAt+step;   // fell behind (hidden, a long frame): restart the beat
    speed.between=null;   // (the 3D kit sets it again while this frame draws)
  }
  let dt=Math.min(Math.max(.033,1.25/fps),(now-lastT)/1000);lastT=now;
  if(s){
    // one broken game must never stop the loop (that froze every game): end its round instead
    try{
      let run=true;if(DBG&&DBG.on)({dt,run}=DBG.time(dt));
      const timed=s.state==='playing'&&!s.paused,t0=timed?performance.now():0;
      if(timed){if(run)s.game.update(dt);gameRan(s.def.id)}else if(s.state==='over'&&s.game.fx)s.game.fx(dt);
      const t1=performance.now();
      // a Next Gen / AR card scrolling into place already shows its picture: its first live frame (which
      // moves the shared 3D canvas onto it) waits until the swipe has settled
      // (nor does a finished one keep drawing its game-over scene while it's being swiped away: a whole
      // 3D frame each refresh, on the same graphics chip that's moving the feed)
      const hold=usesHD(s.def)&&(s.state==='ready'&&s.dirty&&settling()||s.state==='over'&&performance.now()-scrollAt<150);
      if(!hold&&(s.state!=='ready'||s.dirty||(DBG&&DBG.on))){paint(s);s.dirty=false}
      if(DBG&&DBG.on)DBG.after(s,timed?t1-t0:0,performance.now()-t1,now);
      // frame timing for the anonymous stutter reports (src/perf.js)
      if(timed&&s.state==='playing'&&!usesHD(s.def))lite2d(s,now,step);
      if(timed&&s.state==='playing')perf.frame(s.def.id,now,performance.now()-t0,1000/fps);else perf.gap();
    }catch(e){console.error(s.def.id,e);perf.error(e,s.def.id);s.dirty=false;if(s.state==='playing')try{gameOver(s)}catch(_){}}
  }
}

/* keyboard (desktop preview) and game controllers (src/kit/gamepad.js turns pads into these keys) */
function keyInput(k,down){
  const s=active;if(!s)return false;
  if(down&&k==='Escape'&&s.state==='playing'){s.paused?resumeGame(s):pauseGame(s,'key');return true}
  if(s.state==='playing'){if(s.paused){if(down&&(k===' '||k==='Enter'))resumeGame(s);return true}if(s.game.key)s.game.key(k,down);return[' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k)}
  if(!down)return false;
  if(k===' '||k==='Enter'){if(Date.now()-s.overAt>550)startGame(s);return true}
  if(k==='ArrowDown'||k==='PageDown'){goNext(s);return true}
  if(k==='ArrowUp'||k==='PageUp'){goPrev(s);return true}
  return false;
}
function padInput(kind,k,down){
  const s=active;if(!s)return;lastGameInput=performance.now();
  if(kind==='start'){if(s.state==='playing'){s.paused?resumeGame(s):pauseGame(s,'pad')}else if(Date.now()-s.overAt>550)startGame(s);return}
  keyInput(k,down);
}
addEventListener('keydown',e=>{if(e.repeat&&active&&active.state!=='playing')return;if(keyInput(e.key,true))e.preventDefault()});
addEventListener('keyup',e=>{keyInput(e.key,false)});



// Folding/unfolding a phone, rotating, or split-screen all arrive as a resize. Refit every
// canvas and keep the current game snapped in place so a running game is not lost.
let rt;
function onResize(){
  slides.forEach(fit);
  if(active){const i=slides.indexOf(active);feed.style.scrollSnapType='none';feed.scrollTop=i*feed.clientHeight;resizeAt=performance.now();requestAnimationFrame(()=>{feed.style.scrollSnapType='';})}
}
addEventListener('resize',()=>{resizeAt=performance.now();clearTimeout(rt);rt=setTimeout(onResize,80)});
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{resizeAt=performance.now();clearTimeout(rt);rt=setTimeout(onResize,80)});
screen.orientation?.addEventListener?.('change',()=>setTimeout(onResize,150));
// Full screen on / off changes the layout without a window resize (and the system bars may resize it again later).
// While it's on the feed stays locked, so a mouse wheel can't scroll the game away underneath.
onFullChange((s,on)=>{if(on)feed.classList.add('locked');else if(s.state!=='playing')feed.classList.remove('locked');if(s.paused&&s.pauseWhy!=='info')pauseOv(s);requestAnimationFrame(onResize)});

// Fresh heart counts from other players: repaint the ♥ number on every slide (keeping your own state).
hearts.onChange(ids=>slides.forEach(x=>{if(!ids||ids.includes(x.def.id))x.setLike(x.el.querySelector('.like').getAttribute('aria-pressed')==='true')}));

/* top bar */
const logo=document.querySelector('.logo');logo.setAttribute('role','button');logo.tabIndex=0;logo.title='QA panel';
logo.onclick=()=>openPanel(GAMES,best);
const mineBtn=document.createElement('button');mineBtn.className='iconbtn';mineBtn.id='mine';mineBtn.setAttribute('aria-label','My games: hearted and Meh');mineBtn.textContent='♥';
const muteBtn=document.getElementById('mute');muteBtn.before(mineBtn);
const setBtn=document.createElement('button');setBtn.className='iconbtn';setBtn.id='settings';setBtn.setAttribute('aria-label','Settings');setBtn.textContent='⚙';
muteBtn.after(setBtn);setBtn.onclick=()=>openSettings({stream:STREAM,cached:()=>remote.cacheInfo(),clear:()=>remote.clearCache(),arTest:()=>playNow('ar-lab')});
mineBtn.onclick=()=>openMyGames({games:GAMES,best,play:playNow,changed:(id,r)=>{hearts.set(id,r>0);slides.forEach(x=>{if(x.def.id===id)x.setLike(r>0)});rerank()},qa:()=>openPanel(GAMES,best)});
// 🔊 opens the Sound & haptics sheet (sound on/off, volume, music, vibration on/off and strength)
muteBtn.setAttribute('aria-label','Sound and haptics');
const paintMute=()=>{muteBtn.textContent=feelIcon()};paintMute();
muteBtn.onclick=()=>openFeel({changed:paintMute});
// feed picker: a styled menu (not the system picker) under the pill in the top bar
const feedBtn=document.getElementById('feed-btn'),feedMenu=document.getElementById('feed-menu'),feedOpts=[...feedMenu.querySelectorAll('[role=option]')];
function feedOpen(on){feedMenu.hidden=!on;feedBtn.setAttribute('aria-expanded',String(on));
  if(on){const b=feedBtn.getBoundingClientRect(),w=Math.min(240,innerWidth-32);feedMenu.style.width=w+'px';feedMenu.style.left=Math.max(16,Math.min(b.left,innerWidth-16-w))-b.left+'px';(feedOpts.find(o=>o.getAttribute('aria-selected')==='true')||feedOpts[0]).focus()}}
function feedPick(o){feedOpen(false);feedBtn.focus();if(filter===o.dataset.f)return;filter=o.dataset.f;
  feedOpts.forEach(x=>x.setAttribute('aria-selected',String(x===o)));const name=o.querySelector('b').textContent;
  document.getElementById('feed-label').textContent=name;feedBtn.setAttribute('aria-label','Show games: '+name);haptic('light');rebuild()}
feedBtn.onclick=e=>{e.stopPropagation();feedOpen(feedMenu.hidden)};
feedOpts.forEach(o=>{o.onclick=e=>{e.stopPropagation();feedPick(o)}});
feedMenu.addEventListener('keydown',e=>{const i=feedOpts.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();feedOpts[(i+(e.key==='ArrowDown'?1:feedOpts.length-1))%feedOpts.length].focus()}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(i>=0)feedPick(feedOpts[i])}
  else if(e.key==='Escape'||e.key==='Tab'){feedOpen(false);feedBtn.focus()}});
document.addEventListener('pointerdown',e=>{if(!feedMenu.hidden&&!e.target.closest('.feedpick'))feedOpen(false)},true);

function boot(){initWallet(GAMES);services.init(GAMES);booted=true;playstats.load(true).then(()=>rerank(3));perf.load(true);
  hearts.reconcile(GAMES.map(g=>g.id),id=>rating(id)>0||(rating(id)===0&&store.get('gs_like_'+id,false)));hearts.load(true);rebuild();onSharedGame(openShared);requestAnimationFrame(frame);if(document.fonts)document.fonts.ready.then(()=>slides.forEach(s=>s.dirty=true))}
// Streaming: with a saved catalogue, start at once and check for updates in the background.
// First launch has to fetch the catalogue before there is anything to show.
function start(){
  if(booted){rebuild();return}
  if(!STREAM){boot();return}
  if(GAMES.length){
    // Give the fresh catalogue a moment so the first games already use its categories; don't wait long.
    let go=()=>{go=()=>{};boot()};remote.refresh().then(()=>go());setTimeout(()=>go(),800);return}
  feedMsg('loading');
  remote.refresh().then(()=>GAMES.length?boot():feedMsg('offline'));
}
nativeARProbe();   // ask early whether walk-around AR games can go in the feed
start();
// Coming back to the app: look for game updates (cheap: one small catalogue file).
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(remote.enabled)remote.refresh();if(active)playstats.shown(active.def.id)}});
// And every 5 minutes while the app is open, so newly published games join the feed without a restart.
if(STREAM)setInterval(()=>{if(document.visibilityState==='visible')remote.refresh()},5*60*1000);

// Test hook used by scripts/smoke.cjs and the other browser tests: dev and test builds, and any build
// driven by a test browser. Never in the store apps, where a game could use it to reach the wallet.
if(import.meta.env.MODE!=='production'||navigator.webdriver)window.__gs={GAMES,remote,progress,playstats,perf,why:id=>{const g=GAMES.find(x=>x.id===id);return g&&explain(g,GAMES,live)},api:s=>s.api,get size(){return active&&[active.w,active.h]},get active(){return active},start:()=>startGame(active),brains:()=>liveBrains(active).map(brainStats),feed:()=>feedBrain.stats(),debug:v=>DBG?DBG.toggle(v):'debug overlay is only in dev builds',only(id){filter='id:'+id;rebuild()}};
