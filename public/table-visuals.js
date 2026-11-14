const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fmtChips=n=>'€'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbols={h:'♥',d:'♦',c:'♣',s:'♠'};
const suitShapes={
 h:'<path d="M50 89C40 79 7 56 7 31C7 8 36 4 50 25C64 4 93 8 93 31C93 56 60 79 50 89Z"/>',
 d:'<path d="M50 5L89 50L50 95L11 50Z"/>',
 s:'<path d="M50 6C40 20 10 40 10 60C10 80 35 86 47 68L40 91H60L53 68C65 86 90 80 90 60C90 40 60 20 50 6Z"/>',
 c:'<circle cx="50" cy="27" r="20"/><circle cx="29" cy="55" r="20"/><circle cx="71" cy="55" r="20"/><path d="M45 53H55L59 90H41Z"/>'
};
const suitIcon=suit=>`<svg class="centerSuit" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true" fill="currentColor">${suitShapes[suit]}</svg>`;
// The card face: a large rank with its suit in the top-left corner and one large suit
// in the bottom-right, so the whole card is used and reads at a glance at every size.
// Overlapping cards (Omaha) still show the corner. "10" is narrowed to fit the corner.
const cardIndex=(rank,suit)=>`<span class="cardCorner" aria-hidden="true"><svg class="cornerArtwork" viewBox="0 0 24 42" fill="currentColor"><text x="12" y="19.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="700"${rank==='10'?' textLength="23" lengthAdjust="spacingAndGlyphs"':''}>${rank}</text><svg x="2.5" y="23" width="19" height="19" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" fill="currentColor">${suitShapes[suit]}</svg></svg></span>`;
export function renderCard(code,{winning=false,dim=false,index=0}={}){
 if(!code)return `<div class="card blank" aria-label="Card not dealt yet">${suitIcon('s')}</div>`;
 if(code==='BACK')return `<div class="card back" style="--deal-index:${index}" aria-label="Hidden card">${suitIcon('s')}</div>`;
 if(!/^[2-9TJQKA][cdhs]$/.test(code))return renderCard(null);
 const rank=code[0]==='T'?'10':code[0],suit=code[1];
 return `<div class="card face ${'hd'.includes(suit)?'red':''} ${winning?'winningCard':''} ${dim?'dimCard':''}" data-card="${escape(code)}" data-suit="${suit}" style="--deal-index:${index}" aria-label="${escape(rank+symbols[suit])}${winning?' · winning hand':''}">${cardIndex(rank,suit)}${suitIcon(suit)}</div>`;
}
// One payment per player for a hand. A player who only got an uncalled bet back did not win.
export function payoutFlights(e){const pots=e.pots||[],wins=new Set(pots.filter(p=>!p.refunded).flatMap(p=>p.winners));return Object.entries(e.payments||{}).filter(([,amount])=>amount>0).map(([id,amount])=>({id,amount,won:!pots.length||wins.has(id)}));}
export const denominations=[{cents:100000,color:'gold'},{cents:50000,color:'violet'},{cents:10000,color:'black'},{cents:2500,color:'green'},{cents:500,color:'red'},{cents:100,color:'blue'},{cents:25,color:'white'},{cents:5,color:'red'},{cents:1,color:'white'}];
export function splitChips(amount){let remaining=Math.max(0,Math.round(Number(amount)*100));if(!Number.isSafeInteger(remaining))return [];const result=[];for(const d of denominations){const count=Math.floor(remaining/d.cents);if(count){result.push({...d,count});remaining%=d.cents;}}return result;}
export function chipStack(amount,{compact=false}={}){const parts=splitChips(amount);if(!parts.length)return '';return `<span class="chipStacks ${compact?'compactChips':''}" aria-hidden="true">${parts.slice(0,compact?2:4).map(d=>`<span class="chipColumn" style="--chip-count:${Math.min(d.count,6)}">${Array.from({length:Math.min(d.count,6)},(_,i)=>`<i class="pokerChip chip-${d.color}" style="--chip-level:${i}"><b>${d.cents>=100?d.cents/100:d.cents===25?'¼':d.cents/100}</b></i>`).join('')}</span>`).join('')}</span>`;}
export function timerState(deadline,now,duration=30000){const remaining=Math.max(0,(deadline||0)-now);return {remaining,seconds:Math.ceil(remaining/1000),fraction:Math.max(0,Math.min(1,remaining/duration)),urgent:remaining<=5000,warning:remaining<=10000};}
export function winningState(t,focusId){const result=t.phase==='finished'?t.lastResult:null;const ids=result?.winnerIds||[];const selected=ids.includes(focusId)?focusId:ids[0];const hand=result?.showdown?result.winningHands?.[selected]:null;return {ids,selected,hand,board:new Set(hand?.cards.filter(c=>t.board.includes(c))||[]),cards:new Set(hand?.cards||[])};}
export function freshEvents(events,lastSeq,hand){return events.filter(e=>e.seq>lastSeq&&e.hand===hand);}
export const GAME_INFO={holdem:{short:'',name:"No Limit Hold'em",hole:2},omaha:{short:'PLO',name:'Pot Limit Omaha',hole:4}};
export const gameInfo=g=>GAME_INFO[g]||GAME_INFO.holdem;
export function betLimits(t,mine){const stack=Math.round(((mine?.stack||0)+(mine?.bet||0))*100)/100,cap=t.legalActions?.maxRaiseTo,max=mine&&Number.isFinite(cap)&&cap>0?Math.min(stack,cap):stack;return {min:Math.min(t.currentBet+t.minRaise,max),max,canRaise:!!mine&&max>t.currentBet&&(t.legalActions?.canRaise??true)};}

// Effect nodes live outside the seat/board DOM, so polling cannot destroy a flight.
export class TableVisuals {
  constructor(root){this.root=root;this.lastSeq=0;this.tableId=null;this.hand=0;this.generation=0;this.queue=Promise.resolve();this.scheduled=0;this.clockOffset=0;this.lastSync=0;this.state=null;this.sound=false;this.motion=true;this.audio=null;this.timeoutSoundKey='';}
  reset(){this.generation++;this.silence();this.root.querySelector('#chipFlights').replaceChildren();this.root.querySelectorAll('.effectActive').forEach(n=>n.classList.remove('effectActive'));this.queue=Promise.resolve();this.scheduled=0;this.turnPending=false;this.lastSeq=0;this.tableId=null;this.state=null;}
  update(t){const initial=this.tableId!==t.id||t.hand<this.hand;this.clockOffset=t.serverNow-Date.now();this.lastSync=Date.now();this.state=t;this.tick();if(initial){this.reset();this.tableId=t.id;this.state=t;this.lastSeq=t.visualEvents?.at(-1)?.seq||0;this.hand=t.hand;return;}if(t.hand!==this.hand){this.generation++;this.root.querySelector('#chipFlights').replaceChildren();this.queue=Promise.resolve();this.scheduled=0;}const events=freshEvents(t.visualEvents||[],this.lastSeq,t.hand);this.lastSeq=Math.max(this.lastSeq,t.visualEvents?.at(-1)?.seq||0);this.hand=t.hand;for(const event of events)this.enqueue(event,t);}
  enqueue(event,t){if(Date.now()+this.clockOffset-event.at>7000)return;const generation=this.generation;
    // A bet is drawn in front of the player only once its chips have flown there: until
    // then the stack is kept invisible, so it never shows first and then flies in again.
    const betNode=event.type==='bet'&&event.amount>0&&this.motion&&!document.hidden?this.betSpot(this.root.querySelector(`[data-seat-user="${event.userId||''}"]`)):null,landing=betNode?.classList?betNode:null;
    if(landing){landing.classList.add('incoming');landing.dataset.flights=String((Number(landing.dataset.flights)||0)+1);setTimeout(()=>{landing.classList.remove('incoming');landing.dataset.flights='0';},6000);}
    const landed=()=>{if(!landing)return;const left=Math.max(0,(Number(landing.dataset.flights)||1)-1);landing.dataset.flights=String(left);if(!left)landing.classList.remove('incoming');};const slots=(event.type==='street'||event.type==='board')&&this.motion&&!document.hidden?this.boardSlots(event):[];slots.forEach(s=>s.classList.add('pendingReveal'));if(slots.length)setTimeout(()=>slots.forEach(s=>s.classList.remove('pendingReveal')),6000);this.scheduled++;this.queue=this.queue.then(async()=>{if(generation!==this.generation||!this.motion||document.hidden)return;await this.play(event,t,generation);}).catch(()=>{}).finally(()=>{landed();slots.forEach(s=>s.classList.remove('pendingReveal'));this.scheduled=Math.max(0,this.scheduled-1);if(!this.scheduled&&this.turnPending){this.turnPending=false;this.beep('turn');}});}
  // Leaving a table stops every sound still waiting to play.
  silence(){for(const n of this.playing||[])try{n.stop();}catch{}this.playing=new Set();this.lastSound=null;this.clock=null;}
  track(n,end){(this.playing??=new Set()).add(n);n.onended=()=>this.playing.delete(n);try{n.stop(end);}catch{}}
  // "Your turn" sounds once the other players' actions on screen have played.
  turnChime(){this.turnPending=true;setTimeout(()=>{if(this.turnPending&&!this.scheduled){this.turnPending=false;this.beep('turn');}},60);}
  boardSlots(e){const count=e.type==='board'?5:e.count,from=e.type==='board'?e.fromCount||0:count===3?0:count===4?3:4;return [...this.root.querySelectorAll('#community .boardSlot')].slice(from,count);}
  async play(e,t,generation){if(this.state?.hand!==e.hand)return;
    const seatNode=id=>this.root.querySelector(`[data-seat-user="${id||''}"]`);
    const seat=seatNode(e.userId)?.querySelector('.avatarWrap');
    const potBox=this.root.querySelector('.pot'),potChips=this.root.querySelector('#potChips'),pot=potChips?.getClientRects().length?potChips:potBox;
    // A bet slides from the player to the chips in front of them.
    if(e.type==='bet'&&e.amount>0&&seat){if(e.label==='ALL-IN')this.beep('allin');else if(!['SB','BB','POST'].includes(e.label))this.beep('bet');const spot=this.betSpot(seatNode(e.userId));await this.fly(seat,spot||pot,e.amount,0,420);}
    // End of a betting round: every stack in front of a player is pulled into the pot.
    else if(e.type==='collect'){this.beep('chip');potBox?.classList.add('incoming');await Promise.all(Object.entries(e.bets||{}).map(([id,amount],i)=>{const from=this.betSpot(seatNode(id));return from?this.fly(from,pot,amount,i*60,480):Promise.resolve();}));potBox?.classList.remove('incoming');this.animate(pot,[{transform:'scale(.8)'},{transform:'scale(1.12)',offset:.6},{transform:'scale(1)'}],{duration:320});}
    else if(e.type==='reveal'){this.beep('card');await Promise.all((e.ids||[]).map((id,i)=>Promise.all([...(seatNode(id)?.querySelectorAll('.seatCards .card')||[])].map((card,k)=>this.animate(card,[{opacity:0},{opacity:1}],{duration:260,delay:i*160+k*90,easing:'ease-out'})))));}
    else if(e.type==='award'){
      // Each player is paid once, with everything they get from this hand: refund, main
      // pot and side pots together. Those are one sum, however many pots there were.
      const flights=payoutFlights(e);
      const start={};for(const {id,amount} of flights){const plate=seatNode(id)?.querySelector('.seatName strong');if(plate){const now=Number(plate.textContent.replace(/[^\d.-]/g,''));if(Number.isFinite(now)){start[id]=now-amount;plate.textContent=fmtChips(start[id]);}}}
      if(this.state?.lastResult?.showdown)await wait(750);
      if(generation!==this.generation)return;
      potBox?.classList.add('paying');
      if(flights.some(f=>f.won))this.beep('win');
      await Promise.all(flights.map(({id,amount,won},i)=>{const node=seatNode(id),target=node?.querySelector('.avatarWrap');if(!target)return Promise.resolve();return this.fly(pot,target,amount,i*120,820,true).then(()=>{this.land(node,Math.round(((start[id]??0)+amount)*100)/100,amount,won);});}));
      potBox?.classList.remove('paying');
    }else if(e.type==='deal'){
      const deck=this.root.querySelector('#dealOrigin');const cards=[...this.root.querySelectorAll('.seatCards .card')];this.beep('card');await Promise.all(cards.map((node,i)=>this.dealCard(deck,node,i*65)));
    }else if(e.type==='street'||e.type==='board'){
      // like a dealer: each card slides from the deck face down, then turns over
      const slots=this.boardSlots(e);slots.forEach((_,i)=>setTimeout(()=>this.beep('card'),i*150));await Promise.all(slots.map((slot,i)=>this.turnCard(slot,i*150)));
    }else if(e.type==='fold'&&seat){this.beep('fold');const cards=seat.closest('.seat').querySelector('.seatCards');await this.animate(cards,[{opacity:1},{opacity:.25}],{duration:320});}
    else if(e.type==='check'){this.beep('check');const node=seatNode(e.userId);this.animate(node?.querySelector('.avatarWrap'),[{transform:'scale(1)'},{transform:'scale(1.07)'},{transform:'scale(1)'}],{duration:300});}
    if(generation!==this.generation)return;
  }
  // The position of a player's bet spot, even while the stack itself is hidden.
  betSpot(seatNode){const index=seatNode?.id?.replace('seat-','');const bet=index!=null&&this.root.querySelector('#tableBet-'+index);if(!bet)return null;if(!bet.hidden&&bet.getBoundingClientRect().width)return bet;const table=this.root.getBoundingClientRect();const x=parseFloat(bet.style.getPropertyValue('--bx')),y=parseFloat(bet.style.getPropertyValue('--by'));if(!Number.isFinite(x)||!Number.isFinite(y))return null;return {getBoundingClientRect:()=>({left:table.left+table.width*x/100,top:table.top+table.height*y/100,width:0,height:0})};}
  land(node,value,amount,win){const plate=node?.querySelector('.seatName');if(!plate)return;const strong=plate.querySelector('strong');if(strong)strong.textContent=fmtChips(value);if(!this.motion)return;this.animate(plate,[{transform:'translateX(-50%) scale(1)'},{transform:'translateX(-50%) scale(1.08)',offset:.35},{transform:'translateX(-50%) scale(1)'}],{duration:520});if(win&&amount>0){const badge=node.querySelector('.winBadge');if(badge)this.animate(badge,[{transform:'translateX(-50%) scale(.4)',opacity:0},{transform:'translateX(-50%) scale(1.25)',opacity:1,offset:.6},{transform:'translateX(-50%) scale(1)',opacity:1}],{duration:520});}}
  async turnCard(slot,delay=0){
    const face=slot.querySelector('.card');const layer=this.root.querySelector('#chipFlights'),deck=this.root.querySelector('#dealOrigin');
    if(!face||!layer||!deck||!this.motion){slot.classList.remove('pendingReveal');return;}
    const r=layer.getBoundingClientRect(),b=slot.getBoundingClientRect(),a=deck.getBoundingClientRect(),sx=r.width/layer.offsetWidth||1,sy=r.height/layer.offsetHeight||1;
    const back=document.createElement('div');back.className='flyingCard';back.innerHTML=renderCard('BACK');
    const w=b.width/sx,h=b.height/sy,x=(b.left-r.left)/sx,y=(b.top-r.top)/sy;Object.assign(back.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});layer.append(back);
    const dx=(a.left-b.left)/sx-w/2,dy=(a.top-b.top)/sy-h/2;
    try{
      await this.animate(back,[{transform:`translate(${dx}px,${dy}px) rotate(-14deg) scale(.55)`,opacity:0},{transform:`translate(${dx*.25}px,${dy*.25}px) rotate(-3deg) scale(.92)`,opacity:1,offset:.6},{transform:'translate(0,0) rotate(0) scale(1)',opacity:1}],{duration:340,delay,fill:'backwards'});
      await this.animate(back,[{opacity:1},{opacity:0}],{duration:140,easing:'ease-in',fill:'forwards'});
    }finally{back.remove();slot.classList.remove('pendingReveal');}
  }
  flipBoard(node,delay){if(!node)return Promise.resolve();const from=this.root.querySelector('#dealOrigin');return this.dealCard(from,node,delay,true);}
  animate(node,keyframes,options){if(!node||!this.motion||!node.animate)return Promise.resolve();return node.animate(keyframes,{easing:'cubic-bezier(.2,.75,.25,1)',...options}).finished.catch(()=>{});}
  async dealCard(from,to,delay,flip=false){if(!from||!to)return;
    // A face-up card (your own) appears where it lies; only face-down cards travel.
    if(flip||to.classList?.contains('face'))return this.animate(to,[{opacity:0},{opacity:1}],{duration:240,delay,easing:'ease-out'});const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),sx=b.width/to.offsetWidth||1,sy=b.height/to.offsetHeight||1;const dx=(a.left-b.left)/sx,dy=(a.top-b.top)/sy;await this.animate(to,flip?[{opacity:0},{opacity:1}]:[{transform:`translate(${dx}px,${dy}px) rotate(-18deg) scale(.3)`,opacity:0},{transform:'translate(0,0) rotate(0) scale(1)',opacity:1}],{duration:flip?620:480,delay});}
  async fly(from,to,amount,delay=0,duration=620,big=false){if(!from||!to||!this.motion||!(amount>0))return;const layer=this.root.querySelector('#chipFlights'),r=layer.getBoundingClientRect(),a=from.getBoundingClientRect(),b=to.getBoundingClientRect();const sx=r.width/layer.offsetWidth||1,sy=r.height/layer.offsetHeight||1;const node=document.createElement('div');node.className='flyingChips'+(big?' bigFlight':'');node.innerHTML=chipStack(amount,{compact:!big});node.style.left=`${(a.left+a.width/2-r.left)/sx}px`;node.style.top=`${(a.top+a.height/2-r.top)/sy}px`;layer.append(node);const dx=(b.left+b.width/2-a.left-a.width/2)/sx,dy=(b.top+b.height/2-a.top-a.height/2)/sy;try{await this.animate(node,[{transform:'translate(-50%,-50%) scale(.7)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.1},{transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-(big?40:22)}px)) scale(${big?1.15:1.03})`,opacity:1,offset:.5},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.9)`,opacity:1,offset:.92},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.8)`,opacity:0}],{duration,delay,easing:'cubic-bezier(.3,.7,.25,1)'});}finally{node.remove();}}
  tick(){const t=this.state;if(!t)return;const now=Date.now()+this.clockOffset;const timer=timerState(t.actionDeadline,now,t.actionDuration);const active=this.root.querySelector('.seat.active');if(active){const ring=active.querySelector('.timerProgress');if(ring)ring.style.strokeDashoffset=String(100*(1-timer.fraction));active.classList.toggle('timeWarning',timer.warning);active.classList.toggle('timeUrgent',timer.urgent);const label=active.querySelector('.timerSeconds');if(label)label.textContent=String(timer.seconds);active.querySelector('.avatarWrap')?.setAttribute('aria-label',`Time left: ${timer.seconds} seconds`);if(t.seats[t.turn]?.isMe&&timer.urgent&&timer.seconds>0){const key=`${t.hand}:${t.actionDeadline}`;if(this.timeoutSoundKey!==key){this.timeoutSoundKey=key;this.beep('alert');}}}
    const next=document.querySelector('#nextHandCountdown');if(next)next.textContent=t.nextHandAt?`Next hand in ${Math.max(0,Math.ceil((t.nextHandAt-now)/1000))}s`:'';
    const connection=document.querySelector('#connectionStatus');if(connection){const stale=Date.now()-this.lastSync>5000;connection.textContent=stale?'Reconnecting…':'Connected';connection.classList.toggle('disconnected',stale);const banner=document.querySelector('#netBanner');if(banner)banner.hidden=!stale;if(stale||t.actionDeadline&&now>=t.actionDeadline){document.querySelectorAll('.actionButtons button,.betPicker input,.betPresets button').forEach(n=>n.disabled=true);if(stale){const info=document.querySelector('#turnInfo');if(info)info.textContent='Connection lost · Reconnecting…';}}}
  }
  // Phones (iOS Safari, Android) only allow audio from inside a tap, and only once the
  // finger lifts. Everything that unlocks it runs synchronously in that tap: create or
  // resume the context and start a silent sound. Sound counts as on only when the
  // context is really running; otherwise the next tap tries again.
  enableSound(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return Promise.resolve(false);
    try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
    try{this.audio??=new Audio();const ctx=this.audio,silent=ctx.createBufferSource();silent.buffer=ctx.createBuffer(1,1,22050);silent.connect(ctx.destination);silent.start(0);
      const resumed=ctx.state==='running'?Promise.resolve():Promise.race([ctx.resume(),wait(1500)]);
      return resumed.then(()=>{this.sound=ctx.state==='running';if(this.sound)this.loadSounds();return this.sound;}).catch(()=>false);}catch{return Promise.resolve(false);}}
  // Recorded table sounds (public/sounds): fold, check, bet (call/raise/bet/blinds),
  // allin (all-in and the winner collecting the pot) and card (every card dealt or turned).
  async loadSounds(){if(this.buffers)return;this.buffers={};await Promise.all(['fold','check','bet','allin','card'].map(async name=>{try{const r=await fetch('/sounds/'+name+'.m4a');const data=await r.arrayBuffer();this.buffers[name]=await new Promise((ok,no)=>this.audio.decodeAudioData(data,ok,no));}catch{}}));}
  // Table sounds play only for a table on screen, one clear sound at a time: the same
  // sound twice within 60 ms plays once, chips moving to the pot stay quiet right after
  // the bet or call that closed the round, new board cards wait 0.3 s after it, and the
  // 'your turn' chime comes 0.25 s after the previous sound.
  beep(type){if(!this.sound||!this.audio||this.audio.state!=='running'||document.hidden||!this.tableId&&type!=='turn')return;
    const ctx=this.audio,now=ctx.currentTime,wall=performance.now()/1000,clock=this.clock;this.clock={wall,ctx:now};
    // Phones freeze the audio clock when the screen sleeps or the page is in the background.
    // A frozen clock would pile sounds up and play them all at once later: skip instead.
    if(clock&&wall-clock.wall>.5&&now-clock.ctx<(wall-clock.wall)*.5){this.lastSound=null;return;}
    const last=this.lastSound&&this.lastSound.at<=now+1?this.lastSound:{type:'',at:-1};
    if(type===last.type&&type!=='card'&&now-last.at<.06)return;if(type==='chip'&&now-last.at<.45)return;
    // Cards wait for the action that closed the round, then follow each other 150 ms apart.
    const gap=type==='card'?(last.type==='card'?.15:.3):type==='turn'?.25:0,when=Math.max(now,last.at+gap);
    // Never a queue of sounds: one that would start more than a second from now is dropped.
    if(when-now>1)return;this.lastSound={type,at:when};
    const file={fold:'fold',check:'check',chip:'bet',bet:'bet',allin:'allin',win:'allin',card:'card'}[type],buf=file&&this.buffers?.[file];
    // A recorded sound that has not finished loading is skipped, never replaced by a tone.
    if(file){if(buf){const src=ctx.createBufferSource(),gain=ctx.createGain();gain.gain.value=type==='chip'?.45:.9;src.buffer=buf;src.connect(gain);gain.connect(ctx.destination);src.start(when);this.track(src,when+buf.duration+.05);}return;}const start=when,notes=type==='win'?[523,659,784]:type==='turn'?[660,880]:type==='allin'?[392,523,659]:[({chip:900,card:420,fold:180,check:600,alert:880})[type]||500];notes.forEach((frequency,i)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type=type==='chip'?'triangle':'sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start+i*.1);gain.gain.linearRampToValueAtTime(.035,start+i*.1+.01);gain.gain.exponentialRampToValueAtTime(.001,start+i*.1+.13);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start+i*.1);this.track(oscillator,start+i*.1+.15);});}
}

// Geometry changes the felt only. Cards, names and controls keep native sizes.
export function tableGeometry(width,height,portrait=false){
 const ratio=portrait?.9:2.3,topSpace=portrait?70:90,bottomSpace=portrait?120:140;
 const availableWidth=Math.max(1,width-(portrait?52:80));
 const minimumWidth=Math.min(availableWidth,portrait?availableWidth:900);
 const minimumSceneHeight=topSpace+minimumWidth/ratio+bottomSpace;
 const safeHeight=Math.max(height,minimumSceneHeight);
 const availableHeight=safeHeight-topSpace-bottomSpace;
 const feltWidth=Math.min(availableWidth,Math.max(minimumWidth,availableHeight*ratio),1440);
 const feltHeight=feltWidth/ratio;
 return {width:feltWidth,height:feltHeight,top:topSpace+Math.max(0,(availableHeight-feltHeight)/2),ratio,minimumSceneHeight};
}

// Albanian names for evaluator scores ([category, ...ranks]) and starting hands.
const valueNames={2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'};
export function describeHand(score){
 if(!Array.isArray(score))return '';const v=n=>valueNames[n]||'';
 return ['High card '+v(score[1]),'Pair of '+v(score[1]),`Two pair, ${v(score[1])} and ${v(score[2])}`,'Three of a kind, '+v(score[1]),`Straight to ${v(score[1])}`,`Flush, ${v(score[1])} high`,`Full house, ${v(score[1])} over ${v(score[2])}`,'Four of a kind, '+v(score[1]),score[1]===14?'Royal Flush':`Straight flush to ${v(score[1])}`][score[0]]||'';
}
// Omaha starting hands: the ranks high to low plus how the suits combine.
function omahaStart(cards){const order='23456789TJQKA',sorted=[...cards].sort((x,y)=>order.indexOf(y[0])-order.indexOf(x[0])),r=c=>c[0]==='T'?'10':c[0];const counts=Object.values(cards.reduce((m,c)=>(m[c[1]]=(m[c[1]]||0)+1,m),{})).sort((a,b)=>b-a);const suited=counts[0]===2&&counts[1]===2?'double-suited':counts[0]===2?'single-suited':counts[0]>=3?(counts[0]===4?'one suit':'three of a suit'):'rainbow';const pairs=[...new Set(cards.map(c=>c[0]))].length<4;return sorted.map(r).join('')+' · '+suited+(pairs?' · paired':'');}
export function startingHand(cards){
 if(cards?.length===4&&cards.every(c=>/^[2-9TJQKA][cdhs]$/.test(c)))return omahaStart(cards);
 if(cards?.length!==2||cards.some(c=>!/^[2-9TJQKA][cdhs]$/.test(c)))return '';
 const order='23456789TJQKA',[a,b]=[...cards].sort((x,y)=>order.indexOf(y[0])-order.indexOf(x[0])),r=c=>c[0]==='T'?'10':c[0];
 return a[0]===b[0]?`Pocket ${r(a)}s`:`${r(a)}-${r(b)} ${a[1]===b[1]?'suited':'offsuit'}`;
}
// The automatic action a pre-selected choice produces when the turn arrives.
export function preActionFor(choice,toCall){if(choice==='checkFold')return toCall>0?'fold':'check';if(choice==='call')return toCall>0?'call':'check';if(choice==='check')return toCall>0?null:'check';return null;}

// Seat, bet-spot and dealer-button coordinates (percent of the felt) for the
// player-relative positions 0..5; position 3 is always the local player.
// A bet entry may carry an alignment: 'start' puts its left edge on the point, 'end' its
// right edge, so a long amount grows away from the nearest name plate.
// Other table sizes use the six-seat spots: two players face each other, four sit around
// the table with the side players halfway along the edge, and nine add a second player at
// the top and one on each side of the bottom player; five split the top seat in two and
// leave out the upper side seats. "slots" names the six-seat position
// whose styling each seat borrows; "hero" is where the player sitting at the table appears.
export function sizedLayout(base,size=6){
 if(size===2)return {seats:[base.seats[0],base.seats[3]],bets:[base.bets[0],base.bets[3]],dealer:[base.dealer[0],base.dealer[3]],slots:[0,3],hero:1};
 if(size===4){const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2,...a.slice(2)],four=l=>[l[0],mid(l[1],l[2]),l[3],mid(l[4],l[5])];return {seats:four(base.seats),bets:four(base.bets),dealer:four(base.dealer),slots:[0,1,3,5],hero:2};}
 // Five: two players at the top, one low on each side and the player at the bottom.
 if(size===5){const [top,,r2,bottom,l2]=base.seats,dx=v=>Math.max(13,Math.min(24,v)),tl=[top[0]-dx(20),top[1]],tr=[top[0]+dx(20),top[1]];
  const toward=([x,y],kx,ky)=>[x+(50-x)*kx,y+(50-y)*ky];
  return {seats:[tl,tr,r2,bottom,l2],bets:[toward(tl,.12,.46),toward(tr,.12,.46),base.bets[2],base.bets[3],base.bets[4]],dealer:[[tl[0]-8,tl[1]+15],[tr[0]+8,tr[1]+15],base.dealer[2],base.dealer[3],base.dealer[4]],slots:[0,0,2,3,4],hero:3};}
 if(size===9){const [top,r1,r2,bottom,l2,l1]=base.seats,dx=v=>Math.max(13,Math.min(24,v));
  const tl=[top[0]-dx(17),top[1]],tr=[top[0]+dx(17),top[1]],bl=[bottom[0]-dx(23),bottom[1]-1.5],br=[bottom[0]+dx(23),bottom[1]-1.5];
  const toward=([x,y],kx,ky,align)=>[x+(50-x)*kx,y+(50-y)*ky,...(align?[align]:[])];
  const bets=[toward(tl,.12,.46),toward(tr,.12,.46),base.bets[1],base.bets[2],toward(br,.1,.62,'end'),base.bets[3],toward(bl,.1,.62,'start'),base.bets[4],base.bets[5]];
  const dealer=[[tl[0]-8,tl[1]+15],[tr[0]+8,tr[1]+15],base.dealer[1],base.dealer[2],[br[0]+9,br[1]-13],base.dealer[3],[bl[0]-9,bl[1]-13],base.dealer[4],base.dealer[5]];
  return {seats:[tl,tr,r1,r2,br,bottom,bl,l2,l1],bets,dealer,slots:[0,0,1,2,3,3,3,4,5],hero:5};}
 return {...base,slots:[0,1,2,3,4,5],hero:3};
}
// ---- Phones in landscape: the players sit around the table ----
// The canvas is FIT_H (420) px tall; the felt leaves 96 px above it, 85 px below it and
// 70 px on each side (feltBox). Every player is a pod built on the avatar: the cards stand
// half out above the photo (shown cards come in front of the photo and the plate), the
// plate with the name and the credit sits under it, the action tag on the seam.
// Opponents sit on the edge of the felt, spread at equal distances along it, mirrored
// left/right; you sit at the bottom in the middle. The bottom
// corners stay free for the chat button (left) and the action buttons (right).
// Bets lie on the line from the player to the middle of the table, just clear of the pod;
// the dealer button sits beside the pod. Vertically, from the top: the top players
// (pods end 57 px under the avatar), their bets, the pot, the board, your cards, you.
// fw/fh: felt size in px. Coordinates are % of the felt, like the other layouts. The work
// is done in a frame 27 px wider on each side and 46 px higher than the felt. The board
// stands in the exact middle of the felt and the pot right above it.
export const PHONE_POD={up:40,down:57,half:42};
const PHONE_SPREAD={2:0,4:88,5:80,6:79,9:77};
export function phoneLayout(size=6,feltW=726,feltH=235,seated=false){
 const OUT=19,ox=27,oy=46,fw=feltW+2*ox,fh=feltH+oy+15,n=Math.max(1,size-1),cx=fw/2,cy=oy+feltH/2,b=feltH/2+OUT;
 const heroY=fh-13,boardW=50,boardY=cy,potY=cy-boardW*.7-14;
 // the track: the edge of the felt pushed out by OUT px (the players sit on the rail) (a stadium), walked from the
 // bottom middle through the left, the top and the right; angles are seen from the middle
 const r=feltH/2+OUT,half=feltW/2-feltH/2,path=[];
 for(let i=0;i<=1440;i++){const t=i/1440*2*Math.PI;let x=-Math.sin(t),y=Math.cos(t);// direction from the middle
  // where that direction meets the stadium
  let px,py;
  const k=Math.abs(y)>1e-9?r/Math.abs(y):1e9;if(Math.abs(x*k)<=half){px=x*k;py=y*k;}else{const c=x<0?-half:half;const bq=x*c,disc=bq*bq-(c*c-r*r);const u=bq+Math.sqrt(Math.max(0,disc));px=x*u;py=y*u;}
  path.push([cx+px,cy+py]);}
 const len=[0];for(let i=1;i<path.length;i++)len.push(len[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
 const pt=deg=>path[Math.round(deg/360*1440)],at=dist=>{let i=len.findIndex(v=>v>=dist);if(i<1)i=1;const f=(dist-len[i-1])/((len[i]-len[i-1])||1);return [path[i-1][0]+(path[i][0]-path[i-1][0])*f,path[i-1][1]+(path[i][1]-path[i-1][1])*f];};
 const start=PHONE_SPREAD[size]??56,s0=len[Math.round(start/360*1440)],s1=len[Math.round((360-start)/360*1440)];
 const opp=n===1?[pt(180)]:Array.from({length:n},(_,k)=>at(s0+(s1-s0)*k/(n-1)));
 const hero=Math.floor(size/2)===0?0:{2:1,4:2,5:3,6:3,9:5}[size]??3;
 const spots=[];for(let i=0;i<size;i++)spots.push(i===hero?[cx,heroY]:opp[(i-hero-1+size)%size]);
 const pc=(x,y)=>[(x-ox)/feltW*100,(y-oy)/feltH*100],toward=[cx,boardY];
 const seats=[],bets=[],dealer=[],sides=[],inner=[],slots=[];
 spots.forEach(([x,y],i)=>{
  seats.push(pc(x,y));const side=i===hero?'b':y<cy-b*.88?'t':x<cx?'l':x>cx?'r':'t';sides.push(side);inner.push(x>cx?'left':'right');
  slots.push(i===hero?3:side==='t'?0:side==='l'?(y<cy?5:4):(y<cy?1:2));
  if(i===hero&&seated){bets.push([...pc(x-52,y-50),'end']);dealer.push(pc(x+62,y-44));return;}
  if(i===hero){bets.push([...pc(x,y-PHONE_POD.up-14),'chips']);dealer.push(pc(x+56,y-30));return;}
  bets.push(null);dealer.push(null);
 });
 // Bets: straight under the players of the top row; for everyone else on the straight line
 // from the centre of the player (the photo) to the centre of the
 // table, as close as the pod allows: clear of the photo and the cards (±36 px, up to 16 px
 // under the centre) and of the plate (±42 px, 16…57 px under it), 3 px apart. If that spot
 // touches the board, the pot, another player or a bet already placed, the line turns a
 // little (12°, 24°, then 36°) until it is free.
 const box=(x,y,l,t,r,b2)=>[x-l,y-t,x+r,y+b2],hit=(p,q)=>p[0]<q[2]-1&&q[0]<p[2]-1&&p[1]<q[3]-1&&q[1]<p[3]-1;
 const pod=(x,y,i)=>i===hero?box(x,y,56,71,56,76):box(x,y,PHONE_POD.half,PHONE_POD.up,PHONE_POD.half,PHONE_POD.down);
 // each player as two boxes: the photo with its cards, and the plate under it
 const pods=spots.map(([x,y],i)=>i===hero?[pod(x,y,i)]:[[x-36,y-PHONE_POD.up,x+36,y+16],[x-42,y+16,x+42,y+PHONE_POD.down]]);
 const taken=[box(cx,boardY,boardW*2.5+8,boardW*.7,boardW*2.5+8,boardW*.7),box(cx,potY,62,11,62,11),...pods.flat()];
 const clearOf=(x,y,me)=>!hit(me,[x-39,y-PHONE_POD.up-3,x+39,y+19])&&!hit(me,[x-45,y+16,x+45,y+PHONE_POD.down+3]);
 // A bet is its chips with the amount beside them: the chips sit exactly on the point, the
 // amount beside them: on the top row away from the middle, everywhere else toward it.
 const betBox=(bx,by,flip,m=0)=>flip?box(bx,by,80+m,9+m,19+m,9+m):box(bx,by,19+m,9+m,80+m,9+m);
 const along=(x,y,ux,uy,flip)=>{for(let d=20;d<220;d+=2){const bx=x+ux*d,by=y+uy*d;if(clearOf(x,y,betBox(bx,by,flip)))return [bx,by,ux,uy];}return [x+ux*220,y+uy*220,ux,uy];};
 const order=spots.map((s,i)=>i).filter(i=>i!==hero).sort((p,q)=>spots[p][1]-spots[q][1]);
 const heroBet=bets[hero];if(heroBet){const hx=heroBet[0]*feltW/100+ox,hy=heroBet[1]*feltH/100+oy;taken.push(seated?[hx-84,hy-9,hx,hy+9]:betBox(hx,hy,false));}
 for(const i of order){const [x,y]=spots[i];let pick=null;const flip=sides[i]==='t'?x<cx-1:x>cx+1,base=sides[i]==='t'?Math.PI/2:Math.atan2(cy-y,cx-x);
  for(const g of [0,.21,-.21,.42,-.42,.63,-.63]){
   const [bx,by,ux,uy]=along(x,y,Math.cos(base+g),Math.sin(base+g),flip),me=betBox(bx,by,flip);
   pick??=[bx,by,ux,uy];if(!taken.some(t=>!pods[i].includes(t)&&hit(t,me))){pick=[bx,by,ux,uy];break;}}
  bets[i]=[...pc(pick[0],pick[1]),flip?'flip':'chips'];dealer[i]=[pick[2],pick[3]];taken.push(betBox(pick[0],pick[1],flip,1));}
 // The dealer button: beside the pod, turned off the bet direction, at the first angle
 // where it touches no other player, bet, the board or the pot.
 spots.forEach(([x,y],i)=>{if(i===hero)return;const [ux,uy]=dealer[i];let best=null;
  for(const g of [.95,-.95,1.6,-1.6,2.3,-2.3,0]){const vx=ux*Math.cos(g)-uy*Math.sin(g),vy=ux*Math.sin(g)+uy*Math.cos(g);
   const ex=Math.abs(vx)>.01?(PHONE_POD.half+14)/Math.abs(vx):1e9,ey=vy>.01?(PHONE_POD.down+14)/vy:vy<-.01?(PHONE_POD.up+14)/-vy:1e9,e=Math.min(ex,ey),dx=x+vx*e,dy=y+vy*e;
   const me=box(dx,dy,12,12,12,12),own=box(x,y,PHONE_POD.half,PHONE_POD.up,PHONE_POD.half,PHONE_POD.down);
   if(dx<12||dx>fw-12||dy<-2||dy>fh+40)continue;
   if(!taken.some(t=>t!==own&&hit(t,me))){best=[dx,dy];break;}best??=[dx,dy];}
  dealer[i]=pc(...best);taken.push(box(best[0],best[1],12,12,12,12));});
 return {seats,bets,dealer,slots,hero,sides,inner,boardW,boardY:(boardY-oy)/feltH*100,potY:(potY-oy)/feltH*100};
}

export function seatLayout(portrait=false,phone=false,narrow=false){
 // Phones in landscape: the top player sits a little lower and the lower side
 // players a little higher, so the table fills the screen and the action
 // buttons own the bottom-right corner.
 // Side bets sit beside the cards, above or below the board, never on it; the dealer
 // button sits in the gap next to its seat. (Checked from 568x320 to 932x430.)
 if(phone&&!portrait)return {seats:[[50,4],[96.5,24],[96.5,67],[50,97],[3.5,67],[3.5,24]],bets:[[64,21.5],[80,27.5,'end'],[80,70.5,'end'],[40.1,83,'end'],[20,70.5,'start'],[20,27.5,'start']],dealer:[[38,21],[85.5,40],[85.5,50.5],[63,83],[14.5,50.5],[14.5,40]]};
 // Narrow upright windows: the top player's bet sits under the name plate, the side bets
 // grow toward the middle, and the dealer button is beside the seat, never on it.
 if(portrait&&narrow)return {seats:[[50,0],[100,18],[100,75],[50,100],[0,75],[0,18]],bets:[[50,25.5],[80.5,25.5,'end'],[85,63,'end'],[50,67.5],[15,63,'start'],[19.5,25.5,'start']],dealer:[[26,12.5],[81,9],[81,75],[76,86],[19,75],[19,9]]};
 return portrait?{seats:[[50,0],[100,18],[100,75],[50,100],[0,75],[0,18]],bets:[[66,17],[70,36],[76,63],[50,63],[24,63],[30,36]],dealer:[[34,12],[84,9],[84,86],[74,86],[16,86],[16,9]]}
  :{seats:[[50,0],[96,15],[96,85],[50,100],[4,85],[4,15]],bets:[[64,26],[80,32],[80,68],[36,74],[20,68],[20,32]],dealer:[[40,19],[86,21],[87,79],[63,82],[13,79],[14,21]]};
}
// Felt size from the free stage area; text and cards never scale with it.
export function feltBox(width,height,portrait=false,phone=false){
 // The canvas is at least 730×420 (see FIT_H in app.js); the players sit on the rail of the
 // felt (phoneLayout), so it leaves 96 px above it, 85 px below it and 70 px on each side.
 if(phone&&!portrait){const w=Math.max(200,width-140),h=Math.max(120,height-181);return {width:w,height:h,top:96,minStage:height,ratio:w/h};}
 // Short screens (phones in landscape, small phones) use tighter margins.
 const short=portrait?height<620:height<=560;
 const ratio=portrait?.78:2.1,top=portrait?(short?64:72):(short?50:78),bottom=portrait?(short?80:92):(short?48:92),side=portrait?50:(short?14:36);
 const minWidth=portrait?Math.min(262,width-2*side):(short?340:520),maxWidth=1240;
 const byHeight=(height-top-bottom)*ratio,w=Math.max(Math.min(minWidth,width-2*side),Math.min(width-2*side,byHeight,maxWidth));
 const h=w/ratio,minStage=top+bottom+Math.max(minWidth,0)/ratio;
 return {width:w,height:h,top:top+Math.max(0,(height-top-bottom-h)/2),minStage,ratio};
}
// Standard bet sizes: big-blind multiples before the flop, pot fractions after.
export function betPresets(t,mine){
 const limits=betLimits(t,mine);if(!mine||!limits.canRaise)return [];
 const call=Math.max(0,t.currentBet-(mine.bet||0)),potAfterCall=t.pot+call,round=n=>Math.round(n*100)/100;
 const options=t.phase==='preflop'&&t.currentBet<=t.bb?[['2.5×',t.bb*2.5],['3×',t.bb*3],['4×',t.bb*4]]:[['⅓',t.currentBet+potAfterCall/3],['½',t.currentBet+potAfterCall/2],['¾',t.currentBet+potAfterCall*.75]];
 options.push(['Pot',t.currentBet+potAfterCall]);
 return options.map(([label,v])=>({label,value:round(Math.max(limits.min,Math.min(limits.max,v)))})).filter((o,i,a)=>a.findIndex(x=>x.value===o.value)===i);
}

// ---- Table colours: one chosen colour gives the whole felt design ----
export const TABLE_COLORS=[['#1f9d6b','Emerald'],['#1d4fb3','Royal blue'],['#8c1d36','Burgundy'],['#5a2a92','Violet'],['#0f7d8c','Ocean'],['#a8792a','Gold'],['#3b4148','Graphite'],['#b03a2e','Red']];
// Felt gradient (5 shades from light centre to dark edge), neon rim, halo and the
// light pool under the table, all in the hue of the chosen colour. Greys become
// an elegant graphite instead of a muddy colour.
export function tablePalette(hex){
 const m=/^#?([0-9a-f]{6})$/i.exec(hex||''),n=parseInt(m?m[1]:'1f9d6b',16);
 const r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
 let h=0;if(d){h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=Math.round(h*60+360)%360;}
 const s=d?d/(1-Math.abs(2*l-1)):0,S=Math.round(Math.min(78,s*100)),grey=S<12;
 const c=(L,sat=S,a=1)=>`hsl(${h} ${sat}% ${L}% / ${a})`;
 const L=grey?[34,25,18,12,8]:[42,31,22,15,10],rim=Math.min(100,S+20),glow=Math.min(100,S+10);
 return {'--t-1':c(L[0]),'--t-2':c(L[1]),'--t-3':c(L[2]),'--t-4':c(L[3]),'--t-5':c(L[4]),
  '--t-rim':c(grey?70:74,rim,.8),'--t-ring':c(65,glow,.2),'--t-halo1':c(65,glow,.3),'--t-halo2':c(65,glow,.12),'--t-pool':c(51,S,.09),
  '--t-icon-bg':c(16),'--t-icon-fg':c(68),'--t-swatch':c(L[1]),
  // the room around the table takes a dark tint of the same colour
  '--t-amb':c(14,Math.round(S*.6),.8),'--t-room1':c(9,Math.round(S*.45)),'--t-room2':c(6,Math.round(S*.4)),'--t-room3':c(4,Math.round(S*.35))};
}
export const paletteStyle=hex=>Object.entries(tablePalette(hex)).map(([k,v])=>k+':'+v).join(';');
