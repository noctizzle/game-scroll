import { clamp, rnd } from '../util.js';
import { sfx } from '../sfx.js';
import { PAL } from '../palettes.js';

const R = PAL.amber;

function Bricks(api){
  const W=160,H=160,PW=30,PY=146;let px,tx,b,bricks,sp,score,wave,wait,dead;
  function build(){bricks=[];for(let r=0;r<5;r++)for(let c=0;c<8;c++)bricks.push({x:1+c*20,y:16+r*8,w:18,h:6,r})}
  function serve(){b={x:px,y:PY-3,vx:0,vy:0};wait=.7}
  return{
    reset(){px=tx=W/2;score=0;wave=1;sp=95;dead=0;build();serve()},
    update(dt){
      px+=(tx-px)*Math.min(1,dt*22);px=clamp(px,PW/2,W-PW/2);
      if(wait>0){wait-=dt;b.x=px;b.y=PY-3;if(wait<=0){const a=rnd(-.5,.5);b.vx=Math.sin(a)*sp;b.vy=-Math.cos(a)*sp}return}
      const n=Math.ceil(sp*dt/1.5),h=dt/n;
      for(let s=0;s<n;s++){
        b.x+=b.vx*h;b.y+=b.vy*h;
        if(b.x<1.5){b.x=1.5;b.vx=Math.abs(b.vx);sfx(300,.03)}
        if(b.x>W-1.5){b.x=W-1.5;b.vx=-Math.abs(b.vx);sfx(300,.03)}
        if(b.y<1.5){b.y=1.5;b.vy=Math.abs(b.vy);sfx(300,.03)}
        if(b.vy>0&&b.y+1.5>=PY&&b.y-1.5<=PY+4&&b.x>=px-PW/2-2&&b.x<=px+PW/2+2){const a=clamp((b.x-px)/(PW/2),-1,1)*1.05;b.vx=Math.sin(a)*sp;b.vy=-Math.cos(a)*sp;b.y=PY-1.5;sfx(520,.04)}
        for(let i=0;i<bricks.length;i++){const k=bricks[i];
          if(b.x+1.5>k.x&&b.x-1.5<k.x+k.w&&b.y+1.5>k.y&&b.y-1.5<k.y+k.h){
            const ox=Math.min(b.x+1.5-k.x,k.x+k.w-(b.x-1.5)),oy=Math.min(b.y+1.5-k.y,k.y+k.h-(b.y-1.5));
            if(ox<oy)b.vx=-b.vx;else b.vy=-b.vy;
            bricks.splice(i,1);score+=(5-k.r)*10;api.score(score);sfx(600+(5-k.r)*90,.05);
            sp=Math.min(175,sp+1.2);const m=Math.hypot(b.vx,b.vy);b.vx*=sp/m;b.vy*=sp/m;break}}
        if(!bricks.length){wave++;sp=Math.min(175,95+wave*10);build();serve();sfx(990,.2,'square',.04,400);return}
        if(b.y>H+4)return api.over();
      }
    },
    fx(dt){dead+=dt},
    draw(c){
      c.fillStyle=R[3];c.fillRect(0,0,W,H);
      for(const k of bricks){c.fillStyle=k.r<2?R[0]:k.r<4?R[1]:R[2];c.fillRect(k.x,k.y,k.w,k.h);c.fillStyle=R[3];c.globalAlpha=.35;c.fillRect(k.x,k.y,k.w,1);c.globalAlpha=1}
      c.fillStyle=R[0];c.fillRect(Math.round(px-PW/2),PY,PW,4);c.fillStyle=R[1];c.fillRect(Math.round(px-PW/2)+2,PY+1,PW-4,2);
      if(!dead||(dead*10|0)%2){c.fillStyle=R[0];c.fillRect(Math.round(b.x-1.5),Math.round(b.y-1.5),3,3)}
      c.fillStyle=R[1];for(let i=0;i<wave&&i<8;i++)c.fillRect(W-6-i*5,H-4,3,2);
    },
    down(x){tx=x},move(x,y,p){if(p)tx=x},
    key(k,d){if(!d)return;if(k==='ArrowLeft')tx=px-24;if(k==='ArrowRight')tx=px+24}
  };
}

export default {
  id: 'bricks', title: 'Brick Bounce', tag: 'Pocket · Arcade', retro: true, w: 160, h: 160,
  hint: 'Drag to slide the paddle. Clear the wall.',
  pal: 'amber',
  make: Bricks,
};
