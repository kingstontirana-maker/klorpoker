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
const cardIndex=(rank,suit,bottom=false)=>`<span class="cardCorner ${bottom?'bottomCorner':''}" aria-hidden="true"><svg class="cornerArtwork" viewBox="0 0 20 34" fill="currentColor"><text x="10" y="14" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700">${rank}</text><svg x="4" y="19" width="12" height="12" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" fill="currentColor">${suitShapes[suit]}</svg></svg></span>`;
export function renderCard(code,{winning=false,dim=false,index=0}={}){
 if(!code)return `<div class="card blank" aria-label="Letër ende e pahapur">${suitIcon('s')}</div>`;
 if(code==='BACK')return `<div class="card back" style="--deal-index:${index}" aria-label="Letër e fshehur">${suitIcon('s')}</div>`;
 if(!/^[2-9TJQKA][cdhs]$/.test(code))return renderCard(null);
 const rank=code[0]==='T'?'10':code[0],suit=code[1];
 return `<div class="card face ${'hd'.includes(suit)?'red':''} ${winning?'winningCard':''} ${dim?'dimCard':''}" data-card="${escape(code)}" data-suit="${suit}" style="--deal-index:${index}" aria-label="${escape(rank+symbols[suit])}${winning?' · kombinimi fitues':''}">${cardIndex(rank,suit)}${suitIcon(suit)}${cardIndex(rank,suit,true)}</div>`;
}
export const denominations=[{cents:100000,color:'gold'},{cents:50000,color:'violet'},{cents:10000,color:'black'},{cents:2500,color:'green'},{cents:500,color:'red'},{cents:100,color:'blue'},{cents:25,color:'white'},{cents:5,color:'red'},{cents:1,color:'white'}];
export function splitChips(amount){let remaining=Math.max(0,Math.round(Number(amount)*100));if(!Number.isSafeInteger(remaining))return [];const result=[];for(const d of denominations){const count=Math.floor(remaining/d.cents);if(count){result.push({...d,count});remaining%=d.cents;}}return result;}
export function chipStack(amount,{compact=false}={}){const parts=splitChips(amount);if(!parts.length)return '';return `<span class="chipStacks ${compact?'compactChips':''}" aria-hidden="true">${parts.slice(0,compact?2:4).map(d=>`<span class="chipColumn" style="--chip-count:${Math.min(d.count,6)}">${Array.from({length:Math.min(d.count,6)},(_,i)=>`<i class="pokerChip chip-${d.color}" style="--chip-level:${i}"><b>${d.cents>=100?d.cents/100:d.cents===25?'¼':d.cents/100}</b></i>`).join('')}</span>`).join('')}</span>`;}
export function timerState(deadline,now,duration=30000){const remaining=Math.max(0,(deadline||0)-now);return {remaining,seconds:Math.ceil(remaining/1000),fraction:Math.max(0,Math.min(1,remaining/duration)),urgent:remaining<=5000,warning:remaining<=10000};}
export function winningState(t,focusId){const result=t.phase==='finished'?t.lastResult:null;const ids=result?.winnerIds||[];const selected=ids.includes(focusId)?focusId:ids[0];const hand=result?.showdown?result.winningHands?.[selected]:null;return {ids,selected,hand,board:new Set(hand?.cards.filter(c=>t.board.includes(c))||[]),cards:new Set(hand?.cards||[])};}
export function freshEvents(events,lastSeq,hand){return events.filter(e=>e.seq>lastSeq&&e.hand===hand);}
export function betLimits(t,mine){const max=Math.round(((mine?.stack||0)+(mine?.bet||0))*100)/100;return {min:Math.min(t.currentBet+t.minRaise,max),max,canRaise:!!mine&&max>t.currentBet&&(t.legalActions?.canRaise??true)};}

// Effect nodes live outside the seat/board DOM, so polling cannot destroy a flight.
export class TableVisuals {
  constructor(root){this.root=root;this.lastSeq=0;this.tableId=null;this.hand=0;this.generation=0;this.queue=Promise.resolve();this.scheduled=0;this.clockOffset=0;this.lastSync=0;this.state=null;this.sound=false;this.motion=true;this.audio=null;this.timeoutSoundKey='';}
  reset(){this.generation++;this.root.querySelector('#chipFlights').replaceChildren();this.root.querySelectorAll('.effectActive').forEach(n=>n.classList.remove('effectActive'));this.queue=Promise.resolve();this.scheduled=0;this.lastSeq=0;this.tableId=null;this.state=null;}
  update(t){const initial=this.tableId!==t.id||t.hand<this.hand;this.clockOffset=t.serverNow-Date.now();this.lastSync=Date.now();this.state=t;this.tick();if(initial){this.reset();this.tableId=t.id;this.state=t;this.lastSeq=t.visualEvents?.at(-1)?.seq||0;this.hand=t.hand;return;}if(t.hand!==this.hand){this.generation++;this.root.querySelector('#chipFlights').replaceChildren();this.queue=Promise.resolve();this.scheduled=0;}const events=freshEvents(t.visualEvents||[],this.lastSeq,t.hand);this.lastSeq=Math.max(this.lastSeq,t.visualEvents?.at(-1)?.seq||0);this.hand=t.hand;for(const event of events)this.enqueue(event,t);}
  enqueue(event,t){if(Date.now()+this.clockOffset-event.at>7000)return;const generation=this.generation;this.scheduled++;this.queue=this.queue.then(async()=>{if(generation!==this.generation||!this.motion||document.hidden)return;await this.play(event,t,generation);}).catch(()=>{}).finally(()=>{this.scheduled=Math.max(0,this.scheduled-1);});}
  async play(e,t,generation){if(this.state?.hand!==e.hand)return;
    const seatNode=id=>this.root.querySelector(`[data-seat-user="${id||''}"]`);
    const seat=seatNode(e.userId)?.querySelector('.avatarWrap');
    const pot=this.root.querySelector('#potChips')||this.root.querySelector('.pot'),potBox=this.root.querySelector('.pot');
    // A bet slides from the player to the chips in front of them.
    if(e.type==='bet'&&e.amount>0&&seat){this.beep(e.label==='ALL-IN'?'allin':'chip');const spot=this.betSpot(seatNode(e.userId));await this.fly(seat,spot||pot,e.amount,0,420);}
    // End of a betting round: every stack in front of a player is pulled into the pot.
    else if(e.type==='collect'){this.beep('chip');potBox?.classList.add('incoming');await Promise.all(Object.entries(e.bets||{}).map(([id,amount],i)=>{const from=this.betSpot(seatNode(id));return from?this.fly(from,pot,amount,i*60,480):Promise.resolve();}));potBox?.classList.remove('incoming');this.animate(pot,[{transform:'scale(.8)'},{transform:'scale(1.12)',offset:.6},{transform:'scale(1)'}],{duration:320});}
    else if(e.type==='reveal'){this.beep('card');await Promise.all((e.ids||[]).map((id,i)=>Promise.all([...(seatNode(id)?.querySelectorAll('.seatCards .card')||[])].map((card,k)=>this.animate(card,[{transform:'rotateY(90deg) scale(.9)',filter:'brightness(.6)'},{transform:'rotateY(0) scale(1)',filter:'brightness(1)'}],{duration:420,delay:i*160+k*90})))));}
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
      this.beep('card');const count=e.type==='board'?5:e.count;const from=e.type==='board'?e.fromCount||0:count===3?0:count===4?3:4;await Promise.all([...this.root.querySelectorAll('#community .face')].slice(from,count).map((node,i)=>this.flipBoard(node,i*140)));
    }else if(e.type==='fold'&&seat){this.beep('fold');const cards=seat.closest('.seat').querySelector('.seatCards');await this.animate(cards,[{opacity:1,transform:'translateX(-50%) translateY(0)'},{opacity:.25,transform:'translateX(-50%) translateY(14px) rotate(-6deg)'}],{duration:320});}
    else if(e.type==='check'){this.beep('check');const node=seatNode(e.userId);this.animate(node?.querySelector('.avatarWrap'),[{transform:'scale(1)'},{transform:'scale(1.07)'},{transform:'scale(1)'}],{duration:300});}
    if(generation!==this.generation)return;
  }
  // The position of a player's bet spot, even while the stack itself is hidden.
  betSpot(seatNode){const index=seatNode?.id?.replace('seat-','');const bet=index!=null&&this.root.querySelector('#tableBet-'+index);if(!bet)return null;if(!bet.hidden&&bet.getBoundingClientRect().width)return bet;const table=this.root.getBoundingClientRect();const x=parseFloat(bet.style.getPropertyValue('--bx')),y=parseFloat(bet.style.getPropertyValue('--by'));if(!Number.isFinite(x)||!Number.isFinite(y))return null;return {getBoundingClientRect:()=>({left:table.left+table.width*x/100,top:table.top+table.height*y/100,width:0,height:0})};}
  land(node,value,amount,win){const plate=node?.querySelector('.seatName');if(!plate)return;const strong=plate.querySelector('strong');if(strong)strong.textContent=fmtChips(value);if(!this.motion)return;this.animate(plate,[{transform:'translateX(-50%) scale(1)'},{transform:'translateX(-50%) scale(1.08)',offset:.35},{transform:'translateX(-50%) scale(1)'}],{duration:520});if(win&&amount>0){const badge=node.querySelector('.winBadge');if(badge)this.animate(badge,[{transform:'translateX(-50%) scale(.4)',opacity:0},{transform:'translateX(-50%) scale(1.25)',opacity:1,offset:.6},{transform:'translateX(-50%) scale(1)',opacity:1}],{duration:520});}}
  flipBoard(node,delay){if(!node)return Promise.resolve();const from=this.root.querySelector('#dealOrigin');return this.dealCard(from,node,delay,true);}
  animate(node,keyframes,options){if(!node||!this.motion||!node.animate)return Promise.resolve();return node.animate(keyframes,{easing:'cubic-bezier(.2,.75,.25,1)',...options}).finished.catch(()=>{});}
  async dealCard(from,to,delay,flip=false){if(!from||!to)return;const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),sx=b.width/to.offsetWidth||1,sy=b.height/to.offsetHeight||1;const dx=(a.left-b.left)/sx,dy=(a.top-b.top)/sy;await this.animate(to,flip?[{transform:`translate(${dx}px,${dy}px) rotateY(180deg) scale(.5)`,opacity:0,filter:'brightness(.4)'},{transform:'translate(0,0) rotateY(90deg) scale(1)',opacity:1,filter:'brightness(.6)',offset:.55},{transform:'translate(0,0) rotateY(0) scale(1)',opacity:1,filter:'brightness(1)'}]:[{transform:`translate(${dx}px,${dy}px) rotate(-18deg) scale(.3)`,opacity:0},{transform:'translate(0,0) rotate(0) scale(1)',opacity:1}],{duration:flip?620:480,delay});}
  async fly(from,to,amount,delay=0,duration=620,big=false){if(!from||!to||!this.motion||!(amount>0))return;const layer=this.root.querySelector('#chipFlights'),r=layer.getBoundingClientRect(),a=from.getBoundingClientRect(),b=to.getBoundingClientRect();const sx=r.width/layer.offsetWidth||1,sy=r.height/layer.offsetHeight||1;const node=document.createElement('div');node.className='flyingChips'+(big?' bigFlight':'');node.innerHTML=chipStack(amount,{compact:!big});node.style.left=`${(a.left+a.width/2-r.left)/sx}px`;node.style.top=`${(a.top+a.height/2-r.top)/sy}px`;layer.append(node);const dx=(b.left+b.width/2-a.left-a.width/2)/sx,dy=(b.top+b.height/2-a.top-a.height/2)/sy;try{await this.animate(node,[{transform:'translate(-50%,-50%) scale(.7)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.1},{transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-(big?40:22)}px)) scale(${big?1.15:1.03})`,opacity:1,offset:.5},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.9)`,opacity:1,offset:.92},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.8)`,opacity:0}],{duration,delay,easing:'cubic-bezier(.3,.7,.25,1)'});}finally{node.remove();}}
  tick(){const t=this.state;if(!t)return;const now=Date.now()+this.clockOffset;const timer=timerState(t.actionDeadline,now,t.actionDuration);const active=this.root.querySelector('.seat.active');if(active){const ring=active.querySelector('.timerProgress');if(ring)ring.style.strokeDashoffset=String(100*(1-timer.fraction));active.classList.toggle('timeWarning',timer.warning);active.classList.toggle('timeUrgent',timer.urgent);const label=active.querySelector('.timerSeconds');if(label)label.textContent=String(timer.seconds);active.querySelector('.avatarWrap')?.setAttribute('aria-label',`Koha e mbetur: ${timer.seconds} sekonda`);if(t.seats[t.turn]?.isMe&&timer.urgent&&timer.seconds>0){const key=`${t.hand}:${t.actionDeadline}`;if(this.timeoutSoundKey!==key){this.timeoutSoundKey=key;this.beep('alert');}}}
    const next=document.querySelector('#nextHandCountdown');if(next)next.textContent=t.nextHandAt?`Dora tjetër pas ${Math.max(0,Math.ceil((t.nextHandAt-now)/1000))}s`:'';
    const connection=document.querySelector('#connectionStatus');if(connection){const stale=Date.now()-this.lastSync>5000;connection.textContent=stale?'Duke rilidhur…':'Lidhja aktive';connection.classList.toggle('disconnected',stale);if(stale||t.actionDeadline&&now>=t.actionDeadline){document.querySelectorAll('.actionButtons button,.betPicker input,.betPresets button').forEach(n=>n.disabled=true);if(stale){const info=document.querySelector('#turnInfo');if(info)info.textContent='Lidhja u ndërpre · Duke rilidhur…';}}}
  }
  async enableSound(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;try{this.audio??=new Audio();await this.audio.resume();this.sound=true;this.beep('check');return true;}catch{return false;}}
  beep(type){if(!this.sound||!this.audio||document.hidden)return;const ctx=this.audio,start=ctx.currentTime,notes=type==='win'?[523,659,784]:type==='turn'?[660,880]:type==='allin'?[392,523,659]:[({chip:900,card:420,fold:180,check:600,alert:880})[type]||500];notes.forEach((frequency,i)=>{const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type=type==='chip'?'triangle':'sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start+i*.1);gain.gain.linearRampToValueAtTime(.035,start+i*.1+.01);gain.gain.exponentialRampToValueAtTime(.001,start+i*.1+.13);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start+i*.1);oscillator.stop(start+i*.1+.15);});}
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
 return ['Letra e lartë '+v(score[1]),'Çift '+v(score[1]),`Dy çifte ${v(score[1])} dhe ${v(score[2])}`,'Tris '+v(score[1]),`Shkallë deri në ${v(score[1])}`,`Ngjyrë me ${v(score[1])} të lartë`,`Full House ${v(score[1])} mbi ${v(score[2])}`,'Poker '+v(score[1]),score[1]===14?'Royal Flush':`Shkallë me ngjyrë deri në ${v(score[1])}`][score[0]]||'';
}
export function startingHand(cards){
 if(cards?.length!==2||cards.some(c=>!/^[2-9TJQKA][cdhs]$/.test(c)))return '';
 const order='23456789TJQKA',[a,b]=[...cards].sort((x,y)=>order.indexOf(y[0])-order.indexOf(x[0])),r=c=>c[0]==='T'?'10':c[0];
 return a[0]===b[0]?`Çift ${r(a)} në dorë`:`${r(a)}-${r(b)} ${a[1]===b[1]?'me ngjyrë':'pa ngjyrë'}`;
}
// The automatic action a pre-selected choice produces when the turn arrives.
export function preActionFor(choice,toCall){if(choice==='checkFold')return toCall>0?'fold':'check';if(choice==='call')return toCall>0?'call':'check';if(choice==='check')return toCall>0?null:'check';return null;}

// Seat, bet-spot and dealer-button coordinates (percent of the felt) for the
// player-relative positions 0..5; position 3 is always the local player.
export function seatLayout(portrait=false,phone=false){
 // Phones in landscape: the top player sits a little lower and the lower side
 // players a little higher, so the table fills the screen and the action
 // buttons own the bottom-right corner.
 if(phone&&!portrait)return {seats:[[50,4],[86,16],[92,61],[50,100],[8,61],[14,16]],bets:[[66,25],[72,36],[80,54],[35,84],[20,54],[28,36]],dealer:[[42,21],[77,25],[83,48],[62,84],[17,48],[23,25]]};
 return portrait?{seats:[[50,0],[100,18],[100,75],[50,100],[0,75],[0,18]],bets:[[66,17],[70,36],[76,63],[50,63],[24,63],[30,36]],dealer:[[34,12],[84,9],[84,86],[74,86],[16,86],[16,9]]}
  :{seats:[[50,0],[92,15],[92,85],[50,100],[8,85],[8,15]],bets:[[64,26],[77,32],[77,68],[36,74],[23,68],[23,32]],dealer:[[40,19],[82,21],[83,79],[63,82],[17,79],[18,21]]};
}
// Felt size from the free stage area; text and cards never scale with it.
export function feltBox(width,height,portrait=false,phone=false){
 // Phones in landscape: the felt fills the whole screen, edge to edge.
 if(phone&&!portrait){const top=50,bottom=48,side=Math.max(24,Math.round(width*.05)),w0=width-2*side,h0=height-top-bottom,w=Math.min(w0,h0*3),h=Math.min(h0,w/1.7);return {width:w,height:h,top:top+Math.max(0,(h0-h)/2),minStage:top+bottom+180,ratio:w/h};}
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
