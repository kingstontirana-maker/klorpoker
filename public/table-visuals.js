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
export const denominations=[{cents:100000,color:'gold'},{cents:50000,color:'violet'},{cents:10000,color:'black'},{cents:2500,color:'green'},{cents:500,color:'red'},{cents:100,color:'blue'},{cents:25,color:'white'},{cents:5,color:'red'},{cents:1,color:'white'}];
export function splitChips(amount){let remaining=Math.max(0,Math.round(Number(amount)*100));if(!Number.isSafeInteger(remaining))return [];const result=[];for(const d of denominations){const count=Math.floor(remaining/d.cents);if(count){result.push({...d,count});remaining%=d.cents;}}return result;}
export function chipStack(amount,{compact=false}={}){const parts=splitChips(amount);if(!parts.length)return '';return `<span class="chipStacks ${compact?'compactChips':''}" aria-hidden="true">${parts.slice(0,compact?2:4).map(d=>`<span class="chipColumn" style="--chip-count:${Math.min(d.count,6)}">${Array.from({length:Math.min(d.count,6)},(_,i)=>`<i class="pokerChip chip-${d.color}" style="--chip-level:${i}"><b>${d.cents>=100?d.cents/100:d.cents===25?'¼':d.cents/100}</b></i>`).join('')}</span>`).join('')}</span>`;}
export function timerState(deadline,now,duration=30000){const remaining=Math.max(0,(deadline||0)-now);return {remaining,seconds:Math.ceil(remaining/1000),fraction:Math.max(0,Math.min(1,remaining/duration)),urgent:remaining<=5000,warning:remaining<=10000};}
export function winningState(t,focusId){const result=t.phase==='finished'?t.lastResult:null;const ids=result?.winnerIds||[];const selected=ids.includes(focusId)?focusId:ids[0];const hand=result?.showdown?result.winningHands?.[selected]:null;return {ids,selected,hand,board:new Set(hand?.cards.filter(c=>t.board.includes(c))||[]),cards:new Set(hand?.cards||[])};}
export function freshEvents(events,lastSeq,hand){return events.filter(e=>e.seq>lastSeq&&e.hand===hand);}
export const GAME_INFO={holdem:{short:'NLH',name:"No Limit Hold'em",hole:2},omaha:{short:'PLO',name:'Pot Limit Omaha',hole:4}};
export const gameInfo=g=>GAME_INFO[g]||GAME_INFO.holdem;
export function betLimits(t,mine){const stack=Math.round(((mine?.stack||0)+(mine?.bet||0))*100)/100,cap=t.legalActions?.maxRaiseTo,max=mine&&Number.isFinite(cap)&&cap>0?Math.min(stack,cap):stack;return {min:Math.min(t.currentBet+t.minRaise,max),max,canRaise:!!mine&&max>t.currentBet&&(t.legalActions?.canRaise??true)};}

// Effect nodes live outside the seat/board DOM, so polling cannot destroy a flight.
export class TableVisuals {
  constructor(root){this.root=root;this.lastSeq=0;this.tableId=null;this.hand=0;this.generation=0;this.queue=Promise.resolve();this.scheduled=0;this.clockOffset=0;this.lastSync=0;this.state=null;this.sound=false;this.motion=true;this.audio=null;this.timeoutSoundKey='';}
  reset(){this.generation++;this.root.querySelector('#chipFlights').replaceChildren();this.root.querySelectorAll('.effectActive').forEach(n=>n.classList.remove('effectActive'));this.queue=Promise.resolve();this.scheduled=0;this.turnPending=false;this.lastSeq=0;this.tableId=null;this.state=null;}
  update(t){const initial=this.tableId!==t.id||t.hand<this.hand;this.clockOffset=t.serverNow-Date.now();this.lastSync=Date.now();this.state=t;this.tick();if(initial){this.reset();this.tableId=t.id;this.state=t;this.lastSeq=t.visualEvents?.at(-1)?.seq||0;this.hand=t.hand;return;}if(t.hand!==this.hand){this.generation++;this.root.querySelector('#chipFlights').replaceChildren();this.queue=Promise.resolve();this.scheduled=0;}const events=freshEvents(t.visualEvents||[],this.lastSeq,t.hand);this.lastSeq=Math.max(this.lastSeq,t.visualEvents?.at(-1)?.seq||0);this.hand=t.hand;for(const event of events)this.enqueue(event,t);}
  enqueue(event,t){if(Date.now()+this.clockOffset-event.at>7000)return;const generation=this.generation;const slots=(event.type==='street'||event.type==='board')&&this.motion&&!document.hidden?this.boardSlots(event):[];slots.forEach(s=>s.classList.add('pendingReveal'));if(slots.length)setTimeout(()=>slots.forEach(s=>s.classList.remove('pendingReveal')),6000);this.scheduled++;this.queue=this.queue.then(async()=>{if(generation!==this.generation||!this.motion||document.hidden)return;await this.play(event,t,generation);}).catch(()=>{}).finally(()=>{slots.forEach(s=>s.classList.remove('pendingReveal'));this.scheduled=Math.max(0,this.scheduled-1);if(!this.scheduled&&this.turnPending){this.turnPending=false;this.beep('turn');}});}
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
      // Refunds first, then the main pot and each side pot in turn.
      const pots=e.pots?.length?[...e.pots].sort((a,b)=>Number(b.refunded)-Number(a.refunded)):[{winners:Object.keys(e.payments),share:Object.values(e.payments)}];
      const start={};for(const [id,amount] of Object.entries(e.payments||{})){const plate=seatNode(id)?.querySelector('.seatName strong');if(plate){const now=Number(plate.textContent.replace(/[^\d.-]/g,''));if(Number.isFinite(now)){start[id]=now-amount;plate.textContent=fmtChips(start[id]);}}}
      if(this.state?.lastResult?.showdown)await wait(750);
      potBox?.classList.add('paying');
      for(const [index,p] of pots.entries()){
        if(generation!==this.generation)return;
        if(!p.refunded)this.beep('win');
        await Promise.all(p.winners.map((id,i)=>{const node=seatNode(id),target=node?.querySelector('.avatarWrap');if(!target)return Promise.resolve();return this.fly(pot,target,p.share?.[i]??0,i*120,820,true).then(()=>{start[id]=(start[id]??0)+(p.share?.[i]??0);this.land(node,start[id],p.share?.[i]??0,!p.refunded);});}));
        if(index<pots.length-1)await wait(260);
      }
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
    const connection=document.querySelector('#connectionStatus');if(connection){const stale=Date.now()-this.lastSync>5000;connection.textContent=stale?'Reconnecting…':'Connected';connection.classList.toggle('disconnected',stale);if(stale||t.actionDeadline&&now>=t.actionDeadline){document.querySelectorAll('.actionButtons button,.betPicker input,.betPresets button').forEach(n=>n.disabled=true);if(stale){const info=document.querySelector('#turnInfo');if(info)info.textContent='Connection lost · Reconnecting…';}}}
  }
  async enableSound(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;try{this.audio??=new Audio();await this.audio.resume();this.sound=true;await this.loadSounds();return true;}catch{return false;}}
  // Recorded table sounds (public/sounds): fold, check, bet (call/raise/bet/blinds),
  // allin (all-in and the winner collecting the pot) and card (every card dealt or turned).
  async loadSounds(){if(this.buffers)return;this.buffers={};await Promise.all(['fold','check','bet','allin','card'].map(async name=>{try{const r=await fetch('/sounds/'+name+'.m4a');this.buffers[name]=await this.audio.decodeAudioData(await r.arrayBuffer());}catch{}}));}
  // Table sounds play only for a table on screen, one clear sound at a time: the same
  // sound twice within 60 ms plays once, chips moving to the pot stay quiet right after
  // the bet or call that closed the round, new board cards wait 0.3 s after it, and the
  // 'your turn' chime comes 0.25 s after the previous sound.
  beep(type){if(!this.sound||!this.audio||document.hidden||!this.tableId&&type!=='turn')return;
    const ctx=this.audio,now=ctx.currentTime,last=this.lastSound||{type:'',at:-1};
    if(type===last.type&&type!=='card'&&now-last.at<.06)return;if(type==='chip'&&now-last.at<.45)return;
    // Cards wait for the action that closed the round, then follow each other 150 ms apart.
    const gap=type==='card'?(last.type==='card'?.15:.3):type==='turn'?.25:0,when=Math.max(now,last.at+gap);this.lastSound={type,at:when};
    const file={fold:'fold',check:'check',chip:'bet',bet:'bet',allin:'allin',win:'allin',card:'card'}[type],buf=file&&this.buffers?.[file];
    if(buf){const src=ctx.createBufferSource(),gain=ctx.createGain();gain.gain.value=type==='chip'?.45:.9;src.buffer=buf;src.connect(gain);gain.connect(ctx.destination);src.start(when);return;}const start=when,notes=type==='win'?[523,659,784]:type==='turn'?[660,880]:type==='allin'?[392,523,659]:[({chip:900,card:420,fold:180,check:600,alert:880})[type]||500];notes.forEach((frequency,i)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type=type==='chip'?'triangle':'sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start+i*.1);gain.gain.linearRampToValueAtTime(.035,start+i*.1+.01);gain.gain.exponentialRampToValueAtTime(.001,start+i*.1+.13);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start+i*.1);oscillator.stop(start+i*.1+.15);});}
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
export function seatLayout(portrait=false,phone=false,narrow=false){
 // Phones in landscape: the top player sits a little lower and the lower side
 // players a little higher, so the table fills the screen and the action
 // buttons own the bottom-right corner.
 // Side bets sit beside the cards, above or below the board, never on it; the dealer
 // button sits in the gap next to its seat. (Checked from 568x320 to 932x430.)
 if(phone&&!portrait)return {seats:[[50,-3],[93,24],[93,67],[50,97],[7,67],[7,24]],bets:[[62,20],[76.7,28,'end'],[76.7,70.5,'end'],[40.1,83,'end'],[23.3,70.5,'start'],[23.3,28,'start']],dealer:[[38,18],[82,40],[82,50.5],[63,83],[18,50.5],[18,40]]};
 // Narrow upright windows: the top player's bet sits under the name plate, the side bets
 // grow toward the middle, and the dealer button is beside the seat, never on it.
 if(portrait&&narrow)return {seats:[[50,0],[100,18],[100,75],[50,100],[0,75],[0,18]],bets:[[50,25.5],[80.5,25.5,'end'],[85,63,'end'],[50,67.5],[15,63,'start'],[19.5,25.5,'start']],dealer:[[26,12.5],[81,9],[81,75],[76,86],[19,75],[19,9]]};
 return portrait?{seats:[[50,0],[100,18],[100,75],[50,100],[0,75],[0,18]],bets:[[66,17],[70,36],[76,63],[50,63],[24,63],[30,36]],dealer:[[34,12],[84,9],[84,86],[74,86],[16,86],[16,9]]}
  :{seats:[[50,0],[92,15],[92,85],[50,100],[8,85],[8,15]],bets:[[64,26],[77,32],[77,68],[36,74],[23,68],[23,32]],dealer:[[40,19],[82,21],[83,79],[63,82],[17,79],[18,21]]};
}
// Felt size from the free stage area; text and cards never scale with it.
export function feltBox(width,height,portrait=false,phone=false){
 // Phones in landscape: the felt fills the whole screen, edge to edge.
 if(phone&&!portrait){const top=50,side=Math.max(24,Math.round(width*.05)),button=height<=340?64:74,
  hMax=Math.min(height-top-52,(height-top-12-button-6-62)/.67),w=Math.min(width-2*side,hMax*3.4),h=Math.min(hMax,w/1.9);
  return {width:w,height:h,top,minStage:top+h+52,ratio:w/h};}
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
