import './style.css';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import '@fontsource/rubik/latin-800.css';
import { store, hash, fmt } from './util.js';
import { sfx, sound } from './sfx.js';
import { PAL, SHELL } from './palettes.js';
import { isHidden, setRating, rating, logRound, toast as qaToast, openPanel } from './qa.js';
import { rankQueue } from './recommend.js';
import { openMyGames } from './mygames.js';
import { post as consolePost } from './kit/gfx.js';
import { progress } from './kit/progress.js';
import { checkTrophies } from './kit/trophies.js';
import { services } from './kit/services.js';
import { initWallet, toast, shopHTML, bindShop } from './kit/wallet-ui.js';

import { haptic } from './kit/device.js';
import { remote } from './remote.js';

/* ---------- catalogue: every file in src/games/ is one game ---------- */
const modules = import.meta.glob('./games/*.js', { eager: true });
const GAMES = Object.values(modules).map(m => m.default)
  .filter(g => g && g.id && g.make)
  .map(g => ({ likes: 300 + hash(g.id) % 6000, ...g }));
// Games can also stream in from the game host (src/remote.js): updated versions replace the built-in
// copy, and new ones join the feed. They're added to GAMES as metadata and downloaded just before they're due.
remote.init(GAMES, meta => { const g = { likes: 300 + hash(meta.id) % 6000, ...meta }; GAMES.push(g); return g; },
  added => { for (const g of added) if (inPool(g)) queue.splice(Math.random() * (queue.length + 1) | 0, 0, g); });   // new games join this cycle

/* ---------- feed engine ---------- */
const feed=document.getElementById('feed');
let slides=[],active=null,filter='all',lastId=null,io;

function makeSlide(def){
  const el=document.createElement('section');el.className='slide '+(def.retro?'retro':'modern')+(def.era==='console'?' console':'');
  if(def.retro){const p=PAL[def.pal||'moss'];p.forEach((c,i)=>el.style.setProperty('--lcd'+i,c));el.style.setProperty('--shell',SHELL[def.pal||'moss']);}el.setAttribute('aria-label',def.title);
  el.innerHTML=`
    <div class="stage"><div class="device">
      ${def.retro?`<div class="bezel-top${def.era?' dark':''}"><span class="led"></span>${def.era==='console'?'<b class="era">CONSOLE</b>':def.era==='advance'?'<b class="era">ADVANCE</b> · POCKET':def.era==='color'?'<b class="era rainbow">COLOR</b> · POCKET':'DOT MATRIX · POCKET'}</div>`:''}
      <div class="screen"><canvas></canvas><div class="hud"><span class="score">0</span></div><div class="overlay"></div></div>
      ${def.era==='console'?'<div class="bezel-bottom"><span class="slot"></span><span class="pads"><i></i><i></i><i></i></span></div>':def.retro?'<div class="bezel-bottom"><span class="dpad"></span><span class="ab"><i></i><i></i></span></div>':''}
    </div></div>
    <div class="meta">
      <button class="caption" aria-label="How to play ${def.title}"><span class="tag">${def.tag}</span><h2>${def.title}</h2><p>${def.hint}</p><span class="more"><b>ⓘ How to play</b> · Best <span class="best">0</span></span></button>
      <div class="rail">
        <button class="rbtn like" aria-pressed="false"><span class="ic">♥</span><span class="n"></span></button>
        <button class="rbtn meh" aria-label="Meh: hide this game"><span class="ic">👎</span><span>Meh</span></button>
        <button class="rbtn walletbtn" aria-label="Credits and trophies"><span class="ic">◆</span><span class="n">${fmt(progress.credits)}</span></button>
        <button class="rbtn nextbtn" aria-label="Next game"><span class="ic">↓</span><span>Next</span></button>
      </div>
    </div>`;
  const s={def,el,canvas:el.querySelector('canvas'),screen:el.querySelector('.screen'),overlay:el.querySelector('.overlay'),scoreEl:el.querySelector('.score'),
    state:'ready',score:0,overAt:0,dirty:true,w:def.w,h:def.h};
  s.ctx=s.canvas.getContext('2d');
  s.game=def.make(s.api={
    score:n=>{s.score=n;s.scoreEl.textContent=n;if(def.goal&&n>=def.goal)win(s)},
    over:()=>gameOver(s),
    win:()=>win(s),                                     // for games with a natural win (cleared the board, etc.)
    has:id=>!!(s.run&&s.run.items.has(id)),             // is this shop item active for the current run?
  });
  s.game.reset();
  // like
  const likeBtn=el.querySelector('.like'),liked=rating(def.id)>0||(rating(def.id)===0&&store.get('gs_like_'+def.id,false));
  const setLike=v=>{likeBtn.setAttribute('aria-pressed',v);likeBtn.querySelector('.n').textContent=fmt(def.likes+(v?1:0))};setLike(liked);
  likeBtn.onclick=()=>{const v=likeBtn.getAttribute('aria-pressed')!=='true';store.set('gs_like_'+def.id,v);setRating(def.id,v?1:0);rerank();document.querySelectorAll('.slide').forEach(x=>{if(x._s&&x._s.def.id===def.id)x._s.setLike(v)})};
  s.setLike=setLike;
  el.querySelector('.meh').onclick=()=>{const was=rating(def.id);setRating(def.id,-1);if(likeBtn.getAttribute('aria-pressed')==='true'){store.set('gs_like_'+def.id,false);setLike(false)}
    rerank();qaToast(`Hidden: ${def.title}`,()=>{setRating(def.id,was);rerank()});goNext(s)};
  el.querySelector('.nextbtn').onclick=()=>goNext(s);
  s.overlay.onclick=e=>{if(Date.now()-s.overAt<550)return;startGame(s)};
  // pointer input
  const pt=e=>{const r=s.canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width*s.w,(e.clientY-r.top)/r.height*s.h]};
  let pressed=false;
  s.canvas.addEventListener('pointerdown',e=>{if(s.state!=='playing')return;pressed=true;lastGameInput=performance.now();try{s.canvas.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();s.game.down&&s.game.down(...pt(e))});
  s.canvas.addEventListener('pointermove',e=>{if(s.state!=='playing')return;if(pressed)lastGameInput=performance.now();s.game.move&&s.game.move(...pt(e),pressed)});
  const up=e=>{if(!pressed)return;pressed=false;if(s.state==='playing'&&s.game.up)s.game.up(...pt(e))};
  s.canvas.addEventListener('pointerup',up);s.canvas.addEventListener('pointercancel',up);
  s.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  el._s=s;
  el.querySelector('.caption').onclick=()=>openInfo(s);
  renderOverlay(s);updateBest(s);
  return s;
}

/* ---------- how-to-play sheet: tapping the caption opens the full description ---------- */
let infoDlg=null;
function openInfo(s){
  const d=s.def;
  if(!infoDlg){infoDlg=document.createElement('dialog');infoDlg.className='info';document.body.appendChild(infoDlg);
    infoDlg.addEventListener('click',e=>{if(e.target===infoDlg)infoDlg.close()});
    infoDlg.addEventListener('close',()=>{const t=infoDlg._s;if(t){t.paused=false;lastT=performance.now()}})}
  infoDlg._s=s;if(s.state==='playing')s.paused=true;
  const kind=d.era==='console'?'Console-style game':d.era==='advance'?'Advance-style pocket game':d.era==='color'?'Colour pocket game':d.retro?'Dot-matrix pocket game':'Phone game';
  infoDlg.innerHTML=`<div class="info-card"><button class="info-x" aria-label="Close">✕</button>
    <span class="tag">${d.tag}</span><h2>${d.title}</h2><div class="info-k">${kind}</div>
    <h3>How to play</h3><p>${d.hint}</p>
    <div class="info-stats"><div><b>${fmt(best(d.id))}</b>Your best</div>${d.goal?`<div><b>${d.goal}</b>Score to win</div>`:''}</div>
    <button class="play info-play">${s.state==='playing'?'Keep playing':'Play'}</button></div>`;
  infoDlg.querySelector('.info-x').onclick=()=>infoDlg.close();
  infoDlg.querySelector('.info-play').onclick=()=>{const was=s.state;infoDlg.close();if(was!=='playing'&&active===s&&Date.now()-s.overAt>550)startGame(s)};
  infoDlg.showModal();
}
function best(id){return progress.best(id)}
function updateBest(s){s.el.querySelector('.best').textContent=fmt(best(s.def.id))}

function renderOverlay(s){
  const d=s.def,cue='<div class="swipe-cue">Swipe up for the next game</div>';
  if(s.state==='ready'){
    s.overlay.innerHTML=`<div class="ov-k">${d.retro?'Insert coin':'Tap to start'}</div><div class="ov-title">${d.title}</div><div class="ov-hint">${d.hint}</div>${goalHTML(d)}<button class="play">${d.retro?'PRESS START':'Play'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
  }else if(s.state==='over'){
    const b=best(d.id),isNew=s.score>0&&s.score>=b&&s.newBest;
    const res=s.paid?`<div class="ov-win">${s.won==='first'?'FIRST WIN ':'WIN '}+${s.paid} CREDITS</div>`:d.goal?`<div class="ov-goal">Score ${d.goal} to win credits</div>`:'';
    s.el.querySelectorAll('.toast').forEach(t=>t.remove());   // the game-over screen repeats what they said
    const tro=(s.trophies||[]).map(t=>`<div class="ov-trophy">🏆 ${t.name}</div>`).join('');
    s.overlay.innerHTML=`<div class="ov-k">${s.paid?'You won':'Game over'}</div><div class="ov-score">${s.score}</div>${isNew?'<div class="ov-new">NEW BEST</div>':`<div class="ov-best">Best ${b}</div>`}${res}${tro}<button class="play">${d.retro?'RETRY':'Play again'}</button>${shopHTML(d)}${cue}`;
    bindShop(s.overlay,d,()=>renderOverlay(s));
  }
  s.overlay.hidden=s.state==='playing';
}

function goalHTML(d){
  if(!d.goal)return'';
  const w=progress.wins(d.id),r=d.reward||10;
  return d.retro?`<div class="ov-goal">Win at ${d.goal} · <b>+${w?r:r*2}</b> credits</div>`
    :`<div class="ov-goal">Score ${d.goal} to win <b>◆${w?r:r*2}</b>${w?'':' (first win pays double)'}</div>`;
}

function startGame(s){
  if(active!==s)return;
  // Boosts the player owns for this game are used up on this run; unlocks stay on.
  s.run={items:new Set()};
  for(const it of s.def.shop||[])if(it.kind==='unlock'?progress.owned(s.def.id,it)>0:progress.use(s.def.id,it))s.run.items.add(it.id);
  s.won=false;s.paid=0;s.trophies=[];progress.played(s.def.id);
  s.game.reset();s.score=0;s.scoreEl.textContent='0';s.state='playing';s.newBest=false;s.startAt=Date.now();
  s.el.classList.add('playing');s.el.classList.remove('over');feed.classList.add('locked');s.startPerf=performance.now();renderOverlay(s);
  sfx(660,.08,'square',.04,300);
}
// A run counts as a win the first time its score reaches the game's goal (or the game calls
// api.win()). It pays credits once per run and the game carries on.
function win(s){
  if(s.won||s.state!=='playing')return;
  const r=progress.win(s.def.id,s.def.reward||10);
  s.won=r.first?'first':'yes';s.paid=r.paid;
  toast(s.el,`WIN +${r.paid} CREDITS`,'win');haptic('success');sfx(880,.12,'triangle',.06,440);
  awardTrophies(s);
}
function awardTrophies(s){
  for(const t of checkTrophies()){toast(s.el,`🏆 ${t.name}`,'trophy');services.unlock(t.id);(s.trophies||=[]).push(t)}
}
function gameOver(s){
  if(s.state!=='playing')return;
  s.state='over';s.overAt=Date.now();logRound(s.def.id,s.overAt-s.startAt);s.el.classList.remove('playing');s.el.classList.add('over');feed.classList.remove('locked');
  if(progress.score(s.def.id,s.score))s.newBest=true;
  awardTrophies(s);services.reportRun(s.def);
  updateBest(s);if(!s.won)haptic('error');sfx(220,.35,'square',.05,-150);
  s.overlay.hidden=true;setTimeout(()=>{if(s.state==='over')renderOverlay(s)},450);
}
function resetSlide(s){if(s.state==='playing')logRound(s.def.id,Date.now()-s.startAt);s.state='ready';s.run=null;s.el.classList.remove('playing','over');s.game.reset();s.score=0;s.scoreEl.textContent='0';renderOverlay(s);s.dirty=true}
function goPrev(s){
  const i=slides.indexOf(s);if(i<=0)return;
  if(s.state==='playing')resetSlide(s);feed.classList.remove('locked');
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
    if(!feed.classList.contains('locked')||!active||e.target.closest('.screen,dialog'))return;
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
  if(s.state==='playing')resetSlide(s);feed.classList.remove('locked');
  const i=slides.indexOf(s);if(i>=slides.length-2)addBatch();
  slides[i+1].el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

// Each game has a base size (def.w x def.h). Games that set maxW / maxH are "fluid": after the base
// size is scaled to fit, the leftover space is handed to the game as extra width or height (up to
// the max, in multiples of def.step if set) through game.resize(w, h), so tall phones and unfolded foldables are filled, not letterboxed.
const CHROME={retro:[28,88],modern:[0,0]};
function fit(s){
  const st=s.el.querySelector('.stage'),d=s.def,[cw,ch]=CHROME[d.retro?'retro':'modern'];
  const aw=st.clientWidth-cw,ah=st.clientHeight-ch;
  if(aw<=0||ah<=0)return;
  let sc=Math.min(aw/d.w,ah/d.h);
  if(d.retro){if(sc>=2)sc=Math.floor(sc*4)/4;sc=Math.max(1,sc)}else sc=Math.max(.3,sc);
  const st2=d.step||1,grow=(b,m,a)=>b+Math.floor(Math.max(0,Math.min(m||b,Math.floor(a/sc))-b)/st2)*st2;
  const w=grow(d.w,d.maxW,aw),h=grow(d.h,d.maxH,ah);
  if(w!==s.w||h!==s.h){s.w=w;s.h=h;s.game.resize&&s.game.resize(w,h)}
  s.screen.style.width=Math.round(w*sc)+'px';s.screen.style.height=Math.round(h*sc)+'px';
  // Pocket games draw chunky pixels; Console games render at full device resolution, smoothed and lit.
  const pixel=d.retro&&d.era!=='console';
  if(pixel){s.canvas.width=w;s.canvas.height=h;s.ctx.setTransform(1,0,0,1,0,0)}
  else{const k=sc*Math.min(2.5,window.devicePixelRatio||1);s.canvas.width=Math.round(w*k);s.canvas.height=Math.round(h*k);s.ctx.setTransform(k,0,0,k,0,0)}
  s.ctx.imageSmoothingEnabled=!pixel;s.canvas.classList.toggle('hires',!pixel);s.dirty=true;
}

// Shuffled queue over the whole catalogue; the feed pulls a few at a time so 1000 games never means 1000 slides in the DOM.
let queue=[];
function inPool(g){return (filter.startsWith('id:')||!isHidden(g.id))&&(filter==='all'||(filter.startsWith('id:')?g.id===filter.slice(3):filter==='pocket'?g.retro&&g.era!=='console':filter==='console'?g.era==='console':!g.retro))}
function pickDefs(n=6){
  let pool=GAMES.filter(inPool);
  if(!pool.length)pool=GAMES;
  const out=[],later=[];let tries=pool.length*2+n;
  while(out.length<n&&pool.length&&tries-->0){
    if(!queue.length){queue=rankQueue(pool,GAMES);if(queue.length>1&&queue[0].id===lastId)queue.push(queue.shift())}
    const q=queue.shift(),d=remote.def(q);
    if(!d){if(remote.has(q.id))later.push(q);continue}   // streamed game still downloading: it goes in the next batch
    out.push(d);lastId=d.id;
    if(pool.length<n&&out.length>=pool.length)break;
  }
  queue.unshift(...later);
  remote.prefetch(queue.slice(0,8));   // download the next few now so they're ready by the time you swipe to them
  return out;
}
// After a heart or Meh, re-rank the games still waiting in this cycle so similar ones come sooner.
function rerank(){if(queue.length>1)queue=rankQueue(queue.filter(g=>!isHidden(g.id)),GAMES)}
function paint(s){s.game.draw(s.ctx);if(s.def.era==='console'){s.ctx.save();consolePost(s.ctx,s.w||s.def.w,s.h||s.def.h);s.ctx.restore()}}
function addBatch(){
  const defs=pickDefs();
  for(const d of defs){const s=makeSlide(d);feed.appendChild(s.el);slides.push(s);fit(s);paint(s);io.observe(s.el)}
  // Nothing ready yet (only streamed games left and still downloading): try again once they arrive.
  if(!defs.length&&queue.some(g=>remote.has(g.id))){const gen=built;Promise.all(queue.slice(0,6).map(g=>remote.load(g.id))).then(()=>{if(gen!==built)return;addBatch();if(!active&&slides[0])setActive(slides[0])})}
}

// Play a chosen game now: slot it in right after the current game and scroll to it.
function playNow(id){
  const g=GAMES.find(x=>x.id===id);if(!g)return;
  const def=remote.def(g);if(!def){remote.load(id).then(d=>{if(d)playNow(id)});return}
  const i=active?slides.indexOf(active):-1;if(active&&active.state==='playing')resetSlide(active);feed.classList.remove('locked');
  const s=makeSlide(def),next=slides[i+1];feed.insertBefore(s.el,next?next.el:null);slides.splice(i+1,0,s);fit(s);paint(s);io.observe(s.el);
  requestAnimationFrame(()=>s.el.scrollIntoView({behavior:'auto'}));
}
function setActive(s){
  if(active===s)return;
  if(active&&active.state!=='ready')resetSlide(active);
  feed.classList.remove('locked');active=s;s.dirty=true;
  if(slides.indexOf(s)>=slides.length-3)addBatch();
}

let built=0;
function rebuild(){
  built++;slides.forEach(s=>io.unobserve(s.el));feed.innerHTML='';slides=[];active=null;lastId=null;queue=[];feed.scrollTop=0;addBatch();if(slides[0])setActive(slides[0]);
}

let resizeAt=0;
io=new IntersectionObserver(es=>{if(performance.now()-resizeAt<500)return;for(const e of es)if(e.isIntersecting&&e.intersectionRatio>=.6)setActive(e.target._s)},{root:feed,threshold:[.6]});

let lastT=performance.now();
function frame(now){
  const dt=Math.min(.033,(now-lastT)/1000);lastT=now;
  requestAnimationFrame(frame);
  const s=active;
  if(s){
    // one broken game must never stop the loop (that froze every game): end its round instead
    try{
      if(s.state==='playing'&&!s.paused)s.game.update(dt);else if(s.state==='over'&&s.game.fx)s.game.fx(dt);
      if(s.state!=='ready'||s.dirty){paint(s);s.dirty=false}
    }catch(e){console.error(s.def.id,e);s.dirty=false;if(s.state==='playing')try{gameOver(s)}catch(_){}}
  }
}

/* keyboard (desktop preview) */
addEventListener('keydown',e=>{
  const s=active;if(!s)return;
  if(s.state==='playing'){if(s.game.key){s.game.key(e.key,true)}if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();return}
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if(Date.now()-s.overAt>550)startGame(s)}
  else if(e.key==='ArrowDown'||e.key==='PageDown'){e.preventDefault();goNext(s)}
});
addEventListener('keyup',e=>{const s=active;if(s&&s.state==='playing'&&s.game.key)s.game.key(e.key,false)});

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

/* top bar */
const logo=document.querySelector('.logo');logo.setAttribute('role','button');logo.tabIndex=0;logo.title='QA panel';
logo.onclick=()=>openPanel(GAMES,best);
const mineBtn=document.createElement('button');mineBtn.className='iconbtn';mineBtn.id='mine';mineBtn.setAttribute('aria-label','My games: hearted and Meh');mineBtn.textContent='♥';
const muteBtn=document.getElementById('mute');muteBtn.before(mineBtn);
mineBtn.onclick=()=>openMyGames({games:GAMES,best,play:playNow,changed:(id,r)=>{slides.forEach(x=>{if(x.def.id===id)x.setLike(r>0)});rerank()},qa:()=>openPanel(GAMES,best)});
const paintMute=()=>{muteBtn.textContent=sound.muted?'🔇':'🔊';muteBtn.setAttribute('aria-pressed',String(sound.muted))};paintMute();
muteBtn.onclick=()=>{sound.muted=!sound.muted;store.set('gs_muted',sound.muted);paintMute()};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{if(filter===b.dataset.f)return;filter=b.dataset.f;
  document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));rebuild()});

function boot(){initWallet(GAMES);services.init(GAMES);rebuild();requestAnimationFrame(frame);if(document.fonts)document.fonts.ready.then(()=>slides.forEach(s=>s.dirty=true))}
boot();
// Coming back to the app: look for game updates (cheap: one small catalogue file).
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&remote.enabled)remote.refresh()});

// Test hook used by scripts/smoke.cjs
window.__gs={GAMES,remote,progress,api:s=>s.api,get size(){return active&&[active.w,active.h]},get active(){return active},start:()=>startGame(active),only(id){filter='id:'+id;rebuild()}};
