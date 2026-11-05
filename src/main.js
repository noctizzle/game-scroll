import './style.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import { store, hash, fmt } from './util.js';
import { sfx, sound } from './sfx.js';
import { PAL, SHELL } from './palettes.js';

/* ---------- catalogue: every file in src/games/ is one game ---------- */
const modules = import.meta.glob('./games/*.js', { eager: true });
const GAMES = Object.values(modules).map(m => m.default)
  .filter(g => g && g.id && g.make)
  .map(g => ({ likes: 300 + hash(g.id) % 6000, ...g }));

/* ---------- feed engine ---------- */
const feed=document.getElementById('feed');
let slides=[],active=null,filter='all',lastId=null,io;

function makeSlide(def){
  const el=document.createElement('section');el.className='slide '+(def.retro?'retro':'modern');
  if(def.retro){const p=PAL[def.pal||'moss'];p.forEach((c,i)=>el.style.setProperty('--lcd'+i,c));el.style.setProperty('--shell',SHELL[def.pal||'moss']);}el.setAttribute('aria-label',def.title);
  el.innerHTML=`
    <div class="stage"><div class="device">
      ${def.retro?'<div class="bezel-top"><span class="led"></span>DOT MATRIX · POCKET</div>':''}
      <div class="screen"><canvas></canvas><div class="hud"><span class="score">0</span></div><div class="overlay"></div></div>
      ${def.retro?'<div class="bezel-bottom"><span class="dpad"></span><span class="ab"><i></i><i></i></span></div>':''}
    </div></div>
    <div class="meta">
      <div class="caption"><span class="tag">${def.tag}</span><h2>${def.title}</h2><p>${def.hint}</p></div>
      <div class="rail">
        <button class="rbtn like" aria-pressed="false"><span class="ic">♥</span><span class="n"></span></button>
        <div class="rbtn bestchip"><span class="ic best">0</span><span>Best</span></div>
        <button class="rbtn nextbtn" aria-label="Next game"><span class="ic">↓</span><span>Next</span></button>
      </div>
    </div>`;
  const s={def,el,canvas:el.querySelector('canvas'),screen:el.querySelector('.screen'),overlay:el.querySelector('.overlay'),scoreEl:el.querySelector('.score'),
    state:'ready',score:0,overAt:0,dirty:true};
  s.ctx=s.canvas.getContext('2d');
  s.game=def.make({score:n=>{s.score=n;s.scoreEl.textContent=n},over:()=>gameOver(s)});
  s.game.reset();
  // like
  const likeBtn=el.querySelector('.like'),liked=store.get('gs_like_'+def.id,false);
  const setLike=v=>{likeBtn.setAttribute('aria-pressed',v);likeBtn.querySelector('.n').textContent=fmt(def.likes+(v?1:0))};setLike(liked);
  likeBtn.onclick=()=>{const v=likeBtn.getAttribute('aria-pressed')!=='true';store.set('gs_like_'+def.id,v);document.querySelectorAll('.slide').forEach(x=>{if(x._s&&x._s.def.id===def.id)x._s.setLike(v)})};
  s.setLike=setLike;
  el.querySelector('.nextbtn').onclick=()=>goNext(s);
  s.overlay.onclick=e=>{if(Date.now()-s.overAt<550)return;startGame(s)};
  // pointer input
  const pt=e=>{const r=s.canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width*def.w,(e.clientY-r.top)/r.height*def.h]};
  let pressed=false;
  s.canvas.addEventListener('pointerdown',e=>{if(s.state!=='playing')return;pressed=true;try{s.canvas.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();s.game.down&&s.game.down(...pt(e))});
  s.canvas.addEventListener('pointermove',e=>{if(s.state!=='playing')return;s.game.move&&s.game.move(...pt(e),pressed)});
  const up=e=>{if(!pressed)return;pressed=false;if(s.state==='playing'&&s.game.up)s.game.up(...pt(e))};
  s.canvas.addEventListener('pointerup',up);s.canvas.addEventListener('pointercancel',up);
  s.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  el._s=s;
  renderOverlay(s);updateBest(s);
  return s;
}

function best(id){return store.get('gs_best_'+id,0)}
function updateBest(s){s.el.querySelector('.best').textContent=fmt(best(s.def.id))}

function renderOverlay(s){
  const d=s.def,cue='<div class="swipe-cue">Swipe up for the next game</div>';
  if(s.state==='ready'){
    s.overlay.innerHTML=`<div class="ov-k">${d.retro?'Insert coin':'Tap to start'}</div><div class="ov-title">${d.title}</div><div class="ov-hint">${d.hint}</div><button class="play">${d.retro?'PRESS START':'Play'}</button>${cue}`;
  }else if(s.state==='over'){
    const b=best(d.id),isNew=s.score>0&&s.score>=b&&s.newBest;
    s.overlay.innerHTML=`<div class="ov-k">Game over</div><div class="ov-score">${s.score}</div>${isNew?'<div class="ov-new">NEW BEST</div>':`<div class="ov-best">Best ${b}</div>`}<button class="play">${d.retro?'RETRY':'Play again'}</button>${cue}`;
  }
  s.overlay.hidden=s.state==='playing';
}

function startGame(s){
  if(active!==s)return;
  s.game.reset();s.score=0;s.scoreEl.textContent='0';s.state='playing';s.newBest=false;
  s.el.classList.add('playing');s.el.classList.remove('over');feed.classList.add('locked');renderOverlay(s);
  sfx(660,.08,'square',.04,300);
}
function gameOver(s){
  if(s.state!=='playing')return;
  s.state='over';s.overAt=Date.now();s.el.classList.remove('playing');s.el.classList.add('over');feed.classList.remove('locked');
  if(s.score>best(s.def.id)){store.set('gs_best_'+s.def.id,s.score);s.newBest=true}
  updateBest(s);sfx(220,.35,'square',.05,-150);
  s.overlay.hidden=true;setTimeout(()=>{if(s.state==='over')renderOverlay(s)},450);
}
function resetSlide(s){s.state='ready';s.el.classList.remove('playing','over');s.game.reset();s.score=0;s.scoreEl.textContent='0';renderOverlay(s);s.dirty=true}
function goNext(s){
  if(s.state==='playing')resetSlide(s);feed.classList.remove('locked');
  const i=slides.indexOf(s);if(i>=slides.length-2)addBatch();
  slides[i+1].el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

function fit(s){
  const st=s.el.querySelector('.stage'),aw=st.clientWidth,ah=st.clientHeight,d=s.def;
  if(!aw||!ah)return;
  let sc;
  if(d.retro){sc=Math.min((aw-48)/d.w,(ah-110)/d.h);if(sc>=2)sc=Math.floor(sc*2)/2;sc=Math.max(1,sc)}
  else sc=Math.max(.3,Math.min(aw/d.w,ah/d.h));
  s.screen.style.width=Math.round(d.w*sc)+'px';s.screen.style.height=Math.round(d.h*sc)+'px';
  if(d.retro){s.canvas.width=d.w;s.canvas.height=d.h;s.ctx.setTransform(1,0,0,1,0,0)}
  else{const k=sc*Math.min(2.5,window.devicePixelRatio||1);s.canvas.width=Math.round(d.w*k);s.canvas.height=Math.round(d.h*k);s.ctx.setTransform(k,0,0,k,0,0)}
  s.ctx.imageSmoothingEnabled=!d.retro;s.dirty=true;
}

// Shuffled queue over the whole catalogue; the feed pulls a few at a time so 1000 games never means 1000 slides in the DOM.
let queue=[];
function pickDefs(n=6){
  const pool=GAMES.filter(g=>filter==='all'||(filter.startsWith('id:')?g.id===filter.slice(3):filter==='pocket'?g.retro:!g.retro));
  const out=[];
  while(out.length<n&&pool.length){
    if(!queue.length){queue=[...pool].sort(()=>Math.random()-.5);if(queue.length>1&&queue[0].id===lastId)queue.push(queue.shift())}
    const d=queue.shift();out.push(d);lastId=d.id;
    if(pool.length<n&&out.length>=pool.length)break;
  }
  return out;
}
function addBatch(){for(const d of pickDefs()){const s=makeSlide(d);feed.appendChild(s.el);slides.push(s);fit(s);s.game.draw(s.ctx);io.observe(s.el)}}

function setActive(s){
  if(active===s)return;
  if(active&&active.state!=='ready')resetSlide(active);
  feed.classList.remove('locked');active=s;s.dirty=true;
  if(slides.indexOf(s)>=slides.length-3)addBatch();
}

function rebuild(){
  slides.forEach(s=>io.unobserve(s.el));feed.innerHTML='';slides=[];active=null;lastId=null;queue=[];feed.scrollTop=0;addBatch();setActive(slides[0]);
}

let resizeAt=0;
io=new IntersectionObserver(es=>{if(performance.now()-resizeAt<500)return;for(const e of es)if(e.isIntersecting&&e.intersectionRatio>=.6)setActive(e.target._s)},{root:feed,threshold:[.6]});

let lastT=performance.now();
function frame(now){
  const dt=Math.min(.033,(now-lastT)/1000);lastT=now;
  const s=active;
  if(s){
    if(s.state==='playing')s.game.update(dt);else if(s.state==='over'&&s.game.fx)s.game.fx(dt);
    if(s.state!=='ready'||s.dirty){s.game.draw(s.ctx);s.dirty=false}
  }
  requestAnimationFrame(frame);
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
const muteBtn=document.getElementById('mute');
const paintMute=()=>{muteBtn.textContent=sound.muted?'🔇':'🔊';muteBtn.setAttribute('aria-pressed',String(sound.muted))};paintMute();
muteBtn.onclick=()=>{sound.muted=!sound.muted;store.set('gs_muted',sound.muted);paintMute()};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{if(filter===b.dataset.f)return;filter=b.dataset.f;
  document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));rebuild()});

function boot(){rebuild();requestAnimationFrame(frame);if(document.fonts)document.fonts.ready.then(()=>slides.forEach(s=>s.dirty=true))}
boot();

// Test hook used by scripts/smoke.cjs
window.__gs={GAMES,get active(){return active},start:()=>startGame(active),only(id){filter='id:'+id;rebuild()}};
