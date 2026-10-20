// Home page: real game cards, live numbers, gold dust, scroll-driven showcase and reveals.
import {renderCard} from './table-visuals.js';
const home=document.querySelector('#login'),$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const still=matchMedia('(prefers-reduced-motion: reduce)').matches,fine=matchMedia('(pointer:fine)').matches;
$('#hYear').textContent=new Date().getFullYear();

// ---- Casino chips drawn in SVG: a cylinder per chip with edge inserts, and a detailed top face ----
const CHIPS={emerald:{base:'#0e8a5a',light:'#2fe39a',dark:'#03301f',ins:'#f4efe2',inlay:'#0a2b1f',mark:'#e6c88f'},
 black:{base:'#1b1d1c',light:'#4a4f4c',dark:'#030303',ins:'#e6c88f',inlay:'#0b0c0b',mark:'#e6c88f'},
 gold:{base:'#c9a24f',light:'#fbe6a8',dark:'#5e4417',ins:'#121212',inlay:'#7a5a22',mark:'#fff4d6'},
 red:{base:'#b3122e',light:'#ff5a72',dark:'#4d0613',ins:'#f4efe2',inlay:'#3d0510',mark:'#e6c88f'}};
let gid=0;
function chipDefs(c,id){return `<defs><radialGradient id="f${id}" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${c.light}"/><stop offset=".45" stop-color="${c.base}"/><stop offset="1" stop-color="${c.dark}"/></radialGradient><linearGradient id="s${id}" x1="0" x2="1"><stop offset="0" stop-color="${c.dark}"/><stop offset=".3" stop-color="${c.light}"/><stop offset=".55" stop-color="${c.base}"/><stop offset="1" stop-color="${c.dark}"/></linearGradient><radialGradient id="i${id}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${c.base}"/><stop offset="1" stop-color="${c.inlay}"/></radialGradient><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;}
// The top face, drawn as a circle (r=50 around 0,0); squash it for perspective.
function chipFace(c,id){return `<circle r="50" fill="url(#f${id})"/><circle r="44" fill="none" stroke="${c.ins}" stroke-width="11" pathLength="120" stroke-dasharray="9 11" stroke-dashoffset="4"/><circle r="49.2" fill="none" stroke="#0007" stroke-width="1.6"/><circle r="35" fill="none" stroke="${c.mark}" stroke-width="1.4" stroke-dasharray="2 2.4"/><circle r="30" fill="url(#i${id})" stroke="${c.mark}" stroke-width="1.6"/><path d="M0-17C-6-9-16-3-16 5C-16 11-9 14-3 8L-6 17H6L3 8C9 14 16 11 16 5C16-3 6-9 0-17Z" fill="${c.mark}"/><ellipse cx="-14" cy="-22" rx="30" ry="16" fill="url(#g${id})"/>`;}
export function chipStackSVG(color,n){const c=CHIPS[color]||CHIPS.emerald,id=++gid,rx=50,ry=17,t=9,W=104,H=ry*2+t*n+6,cx=52;let s='';
 for(let i=0;i<n;i++){const cy=H-3-ry-t*(i+1),off=i*23+(i%2)*11;
  s+=`<path d="M${cx-rx} ${cy}v${t}a${rx} ${ry} 0 0 0 ${rx*2} 0v-${t}a${rx} ${ry} 0 0 1 -${rx*2} 0z" fill="url(#s${id})"/>`;
  for(let k=0;k<6;k++){const th=(k*60+off)*Math.PI/180,cs=Math.cos(th);if(cs<=.08)continue;const x=cx+rx*Math.sin(th),w=11*cs;s+=`<path d="M${(x-w/2).toFixed(2)} ${(cy+ry*cs*.0).toFixed(2)}h${w.toFixed(2)}v${t}h-${w.toFixed(2)}z" fill="${c.ins}" opacity="${(.55+.45*cs).toFixed(2)}" transform="translate(0 ${(ry*cs).toFixed(2)})"/>`;}
  s+=`<path d="M${cx-rx} ${cy+t}a${rx} ${ry} 0 0 0 ${rx*2} 0" fill="none" stroke="#0008" stroke-width="1"/>`;}
 const top=H-3-ry-t*n;
 return `<svg viewBox="0 0 ${W} ${H}" class="xChipSvg">${chipDefs(c,id)}${s}<g transform="translate(${cx} ${top}) scale(1 ${ry/rx})">${chipFace(c,id)}</g></svg>`;}
export function chipFaceSVG(color){const c=CHIPS[color]||CHIPS.emerald,id=++gid;return `<svg viewBox="-52 -52 104 104" class="xChipSvg">${chipDefs(c,id)}<circle r="51" fill="${c.dark}" transform="translate(0 3)"/>${chipFace(c,id)}</svg>`;}
for(const n of $$('.home [data-chip]')){const [c,k]=n.dataset.chip.split(':');n.innerHTML=chipStackSVG(c,+k);}

// ---- Hero cards: a royal flush dealt face down, flipped and fanned with a burst ----
const SUIT={s:'<path d="M50 6C40 20 10 40 10 60C10 80 35 86 47 68L40 91H60L53 68C65 86 90 80 90 60C90 40 60 20 50 6Z"/>',h:'<path d="M50 89C40 79 7 56 7 31C7 8 36 4 50 25C64 4 93 8 93 31C93 56 60 79 50 89Z"/>'};
function heroCard(code,i){const r=code[0]==='T'?'10':code[0],suit=SUIT[code[1]],court='KQJ'.includes(r);
 const corner=b=>`<span class="xCorner${b?' b':''}"><b>${r}</b><svg viewBox="0 0 100 100">${suit}</svg></span>`;
 const center=`<div class="xPip"><svg viewBox="0 0 100 100">${suit}</svg></div>`;
 return `<div class="xSlot" style="--i:${i};--a:${(i-2)*14}deg;--o:${Math.abs(i-2)*7}px"><div class="xDeal"><div class="xCard"><div class="xFace front">${corner()}${center}${corner(1)}</div><div class="xFace back"><svg viewBox="0 0 100 100">${SUIT.s}</svg></div></div></div></div>`;}

$('#xRain').innerHTML=['emerald','black','gold','emerald','red','black','gold','emerald'].map((c,i)=>`<span style="--x:${4+i*12}%;--y:${[12,68,22,78,8,62,30,74][i]}%;--r:${i*37}deg;--s:${.7+(i%3)*.2}">${chipFaceSVG(c)}</span>`).join('');

// Hand rankings rail, rendered with the game's own cards (doubled for a seamless loop).
const HANDS=[['Royal Flush','As Ks Qs Js Ts'],['Straight Flush','9h 8h 7h 6h 5h'],['Four of a Kind','Kc Kd Kh Ks 2d'],['Full House','Qh Qd Qs 7c 7d'],['Flush','Ad Jd 8d 5d 2d'],['Straight','Tc 9d 8h 7s 6c'],['Three of a Kind','8c 8d 8s Kh 3d'],['Two Pair','Jh Jc 4s 4d Ac'],['One Pair','Th Ts 9c 5d 2h'],['High Card','Ah Jd 8c 6s 3h']];
const rail=HANDS.map(([name,cards],i)=>`<div class="xHand"><div class="xHandCards">${cards.split(' ').map(c=>renderCard(c)).join('')}</div><b>${name}<small>#${i+1}</small></b></div>`).join('');
$('#xRail').innerHTML=rail+rail.replace(/<div class="xHand">/g,'<div class="xHand" aria-hidden="true">');

// Live numbers count up.
function countTo(node,value){const from=Number(node.dataset.value||0);node.dataset.value=value;if(still||from===value){node.textContent=value;return;}const start=performance.now();const step=t=>{const k=Math.min(1,(t-start)/1100),e=1-Math.pow(1-k,4);node.textContent=Math.round(from+(value-from)*e);if(k<1)requestAnimationFrame(step);};requestAnimationFrame(step);}
async function loadStats(){if(home.hidden||document.hidden)return;try{const r=await fetch('/api/public/stats');if(!r.ok)return;const d=await r.json();
 for(const node of $$('[data-count]'))countTo(node,d[node.dataset.count]||0);
 $('#hLiveLine').textContent=d.players?`Live now · ${d.players} player${d.players===1?'':'s'} at the tables`:`${d.tables} table${d.tables===1?'':'s'} open · first seat is yours`;}catch{}}
loadStats();setInterval(loadStats,15000);document.addEventListener('visibilitychange',loadStats);

// Sections slide in as they come into view.
const io='IntersectionObserver' in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}},{threshold:.15,rootMargin:'0px 0px -60px'}):null;
for(const n of $$('.home .reveal'))io?io.observe(n):n.classList.add('in');

// Navigation turns solid after the hero; the showcase straightens as it scrolls in.
const nav=$('.xNav'),device=$('.xDevice');let ticking=false;
function onScroll(){ticking=false;if(home.hidden)return;nav.classList.toggle('scrolled',scrollY>40);
 const r=device.getBoundingClientRect(),vh=innerHeight,p=Math.max(0,Math.min(1,(vh-r.top)/(vh*.85)));
 device.style.setProperty('--tilt',(still?0:18*(1-p)).toFixed(2)+'deg');device.style.setProperty('--sc',(still?1:.92+.08*p).toFixed(3));}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll);}},{passive:true});onScroll();

// Hero cards lean towards the pointer; tiles light up under it.
if(!still&&fine){
 for(const t of $$('.xTile'))t.addEventListener('pointermove',e=>{const r=t.getBoundingClientRect();t.style.setProperty('--mx',e.clientX-r.left+'px');t.style.setProperty('--my',e.clientY-r.top+'px');});
}

// Gold dust drifting up through the hero light.
const canvas=$('.xDust'),ctx=canvas.getContext('2d');let W=0,H=0,dots=[];
function size(){const dpr=Math.min(2,devicePixelRatio||1);W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=W*dpr;canvas.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);const n=Math.round(Math.min(90,W*H/14000));dots=Array.from({length:n},()=>({x:Math.random()*W,y:Math.random()*H,r:Math.random()*1.6+.3,v:Math.random()*.35+.08,a:Math.random()*Math.PI*2,s:Math.random()*.02+.005}));}
function frame(){if(!home.hidden&&!document.hidden&&scrollY<innerHeight*1.2){ctx.clearRect(0,0,W,H);for(const d of dots){d.y-=d.v;d.a+=d.s;d.x+=Math.sin(d.a)*.25;if(d.y<-5){d.y=H+5;d.x=Math.random()*W;}const o=.35+.45*Math.abs(Math.sin(d.a*2));ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,6.283);ctx.fillStyle=`rgba(246,222,170,${o})`;ctx.shadowColor='rgba(230,200,143,.9)';ctx.shadowBlur=d.r*6;ctx.fill();}}requestAnimationFrame(frame);}
if(!still){size();addEventListener('resize',size);requestAnimationFrame(frame);}

// Smooth scrolling for the menu links.
for(const a of $$('.home a[href^="#"]'))a.addEventListener('click',e=>{const id=a.getAttribute('href');const t=id.length>1&&document.querySelector(id);if(t){e.preventDefault();t.scrollIntoView({behavior:still?'auto':'smooth'});}});
