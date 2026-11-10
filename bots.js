import crypto from 'node:crypto';
import {LIVE,canRaise,toCall,maxRaiseTo,fail} from './game.js';
import {evaluateHand,compare,ranks,suits} from './poker.js';


// Decisions use only own hole cards and public information; no future board or hidden hands.

const OLD_SUFFIX=' [BOT]';
const value=c=>ranks.indexOf(c[0])+2;

// What a bot is allowed to know: its own cards and what every player at the table sees.
export function botView(t,s,extra={}){return {...extra,committed:s.committed,facingAllIn:t.seats.some(x=>x&&x!==s&&x.inHand&&!x.folded&&x.allIn&&x.roundBet>s.roundBet),game:t.game||'holdem',phase:t.phase,cards:[...s.cards],board:[...t.board],pot:t.pot,currentBet:t.currentBet,toCall:toCall(t,s),minRaiseTo:t.currentBet+t.minRaise,maxRaiseTo:maxRaiseTo(t,s),stack:s.stack,roundBet:s.roundBet,bb:t.bb,canRaise:canRaise(t,s),opponents:t.seats.filter(x=>x&&x!==s&&x.inHand&&!x.folded).length};}

// Hand strength 0..1 from the bot's own cards and the board.
export function handStrength(v){
 const c=v.cards;if(!c.length)return 0;
 if(v.board.length<3){
  if(v.game==='omaha'){const vals=c.map(value).sort((a,b)=>b-a),suits=Object.values(c.reduce((m,x)=>(m[x[1]]=(m[x[1]]||0)+1,m),{})).sort((a,b)=>b-a);
   let s=vals.reduce((a,b)=>a+b,0)/56*.55;if(new Set(vals).size<4)s+=.06+Math.max(...vals.filter((x,i)=>vals.indexOf(x)!==i))/14*.12;if(suits[0]===2&&suits[1]===2)s+=.12;else if(suits[0]===2)s+=.06;if(vals[0]-vals[3]<=4)s+=.08;return Math.min(1,s);}
  const [a,b]=c.map(value).sort((x,y)=>y-x),suited=c[0][1]===c[1][1];
  return Math.min(1,(a===b?.5+a/28:(a+b)/36)+(suited?.06:0)+(a-b===1||a-b===2?.04:0));}
 const score=evaluateHand(v.game,c,v.board),table=[.15,.42,.62,.74,.8,.84,.92,.97,.99];let s=table[score[0]];
 if(score[0]===1){const top=Math.max(...v.board.map(value));s+=score[1]>=top?.12:score[1]<top-4?-.08:0;}
 // In Hold'em a hand that only plays the board is weaker than it looks.
 if(v.game!=='omaha'&&v.board.length===5&&score[0]<=6){const board=evaluateHand('holdem',[],v.board);if(board[0]===score[0]&&board[1]===score[1])s-=.25;}
 return Math.max(0,Math.min(1,s));}

// Chance of winning, estimated by playing the hand out many times against random
// cards. Only the bot's own cards and the board are known; every unknown card
// (opponents' hands, the rest of the board) is drawn at random from the cards the
// bot cannot see. It never looks at a real opponent's hand.
export function equity(v,iterations,random=Math.random){
 const opp=Math.max(1,Math.min(8,v.opponents||1)),hole=v.game==='omaha'?4:2,known=new Set([...v.cards,...v.board]),deck=[];
 for(const su of suits)for(const r of ranks)if(!known.has(r+su))deck.push(r+su);
 const n=iterations??(v.game==='omaha'?70:170);let won=0;
 for(let i=0;i<n;i++){
  const need=opp*hole+(5-v.board.length);for(let k=0;k<need;k++){const j=k+Math.floor(random()*(deck.length-k));[deck[k],deck[j]]=[deck[j],deck[k]];}
  const board=[...v.board,...deck.slice(opp*hole,need)],mine=evaluateHand(v.game,v.cards,board);let best=1,ties=1;
  for(let o=0;o<opp;o++){const c=compare(evaluateHand(v.game,deck.slice(o*hole,o*hole+hole),board),mine);if(c>0){best=0;break;}if(c===0)ties++;}
  if(best)won+=1/ties;}
 return won/n;}
const PROFILES={
 low:{aggression:.48,bluffPercent:3,maxHandPercent:40,margin:.035,size:.45},
 medium:{aggression:.68,bluffPercent:9,maxHandPercent:65,margin:.015,size:.65},
 high:{aggression:.85,bluffPercent:16,maxHandPercent:85,margin:0,size:.85}
};
const setting=(body,key,fallback,min,max)=>{const n=body[key]===undefined?fallback:Number(body[key]);if(!Number.isFinite(n)||n<min||n>max)fail(`${key} must be ${min}–${max}`);return n;};
export function botDecision(v,risk='low',random=Math.random,settings={}){
 const style=PROFILES[risk]||PROFILES.low;
 // Ignore legacy certainty proofs: neither opponent hands nor future cards enter this calculation.
 const chance=equity(v,undefined,random),invested=v.committed||0,startingStack=v.stack+invested;
 const percent=setting(settings,'maxHandPercent',style.maxHandPercent,10,100),bluffPercent=setting(settings,'bluffPercent',style.bluffPercent,0,30);
 const investmentLimit=Math.floor(startingStack*percent/100),remainingInvestment=Math.max(0,Math.min(v.stack,investmentLimit-invested));
 const callCost=Math.min(v.toCall,v.stack),potOdds=callCost/(v.pot+callCost||1);
 const result=action=>({...action,equity:chance,investmentRate:percent/100,investmentLimit,remainingInvestment});
 // An inexpensive preflop call reaches the flop without the old 15% certainty gate.
 const cheapPreflop=v.board.length===0&&callCost<=v.bb&&callCost<=startingStack*.05;
 const priceIsGood=chance>potOdds+style.margin+(v.facingAllIn?.07:0);
 if(v.toCall&&(callCost>remainingInvestment||(!cheapPreflop&&!priceIsGood)))return result({type:'fold'});
 const valueThreshold=Math.max(.52,1/((v.opponents||1)+1)+.16),valueBet=chance>=valueThreshold;
 const bluffRoom=Math.min(remainingInvestment,Math.floor(startingStack*.08));
 const bluff=!valueBet&&v.opponents<=2&&!v.facingAllIn&&v.toCall<=v.bb&&random()<bluffPercent/100;
 const raiseRoom=bluff?bluffRoom:remainingInvestment;
 if(v.canRaise&&raiseRoom>v.toCall&&((valueBet&&random()<style.aggression)||bluff)){
  const fraction=style.size*(.65+random()*.7);
  const want=v.currentBet+Math.max(v.bb,Math.round((v.pot+v.toCall)*fraction));
  const ceiling=Math.min(v.maxRaiseTo,v.roundBet+raiseRoom);
  const target=Math.min(ceiling,Math.max(v.minRaiseTo,want));
  if(target>v.currentBet&&(target>=v.minRaiseTo||target===v.roundBet+v.stack))return result({type:'raise',amount:target/100,bluff});
 }
 return result({type:v.toCall?'call':'check'});
}
export function createBots({db,runtime,engine,save,olderRake,random=Math.random}){
 const thinking=new WeakMap();
 for(const u of db.users)if(u.isBot&&u.username.endsWith(OLD_SUFFIX)){const plain=u.username.slice(0,-OLD_SUFFIX.length);if(!db.users.some(x=>x!==u&&x.username.toLowerCase()===plain.toLowerCase()))u.username=plain;}
 const bots=()=>db.users.filter(u=>u.isBot),center=()=>db.users.find(x=>x.role==='CENTER');
 const seatOf=u=>{for(const t of runtime.values()){const s=t.seats.find(x=>x?.userId===u.id);if(s)return {t,s};}return null;};
 const equity=u=>{const at=seatOf(u);return u.balance+(at?at.s.stack+(LIVE.includes(at.t.phase)&&at.s.inHand?at.s.committed:0):0);};
 const audit=(type,u,amount=0,extra={})=>db.ledger.push({id:crypto.randomUUID(),type,from:center()?.id,to:u.id,amount,...extra,time:Date.now()});
 const isHuman=s=>s&&!db.users.find(u=>u.id===s.userId)?.isBot;
 // House protection: all bots together may lose at most dailyLimit per calendar day
 // (Tirana time). The house result counts chips and the rake bots paid back to the center.
 db.botGuard??={dailyLimit:5000,day:'',start:0};
 const dayOf=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tirane',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 let rakeSeen=0,rakeTotal=0,rakeMap=new Map(),oldCounted=false;
 function botRake(){const ids=new Set(bots().map(u=>u.id)),count=x=>{if(x.type!=='RAKE')return;for(const a of x.allocations||[])if(a.bot||ids.has(a.userId)){rakeTotal+=a.amount;const r=rakeMap.get(a.userId)||{rake:0,hands:0};r.rake+=a.amount;r.hands++;rakeMap.set(a.userId,r);}};if(!oldCounted){oldCounted=true;for(const x of olderRake?.()||[])count(x);}for(;rakeSeen<db.ledger.length;rakeSeen++)count(db.ledger[rakeSeen]);return rakeTotal;}
 const houseValue=()=>bots().reduce((n,u)=>n+equity(u),0)+botRake();
 function guardToday(now=Date.now()){const g=db.botGuard,d=dayOf(now);if(g.day!==d){g.day=d;g.start=houseValue();for(const b of bots())if(b.bot.error==='House daily limit reached'){b.bot.error=null;b.bot.enabled=true;b.bot.baseline=equity(b);}save();}return houseValue()-g.start;}
 const cents=(v,label)=>{const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<=0)fail(label+' must be a positive amount');return n;};
 // Rake a bot pays goes straight back to the center, so the house result of a bot
 // is its chip result plus the rake it paid.
 function rakeByBot(){botRake();return rakeMap;}
 function list(){const rk=rakeByBot();return bots().map(u=>{const at=seatOf(u),eq=equity(u),r=rk.get(u.id)||{rake:0,hands:0};return {rakePaid:r.rake/100,rakeHands:r.hands,house:(eq-u.bot.funded+r.rake)/100,id:u.id,name:u.username,risk:u.bot.risk,bluffPercent:u.bot.bluffPercent??PROFILES[u.bot.risk||'low'].bluffPercent,maxHandPercent:u.bot.maxHandPercent??PROFILES[u.bot.risk||'low'].maxHandPercent,thinkMinMs:u.bot.thinkMinMs??1200,thinkMaxMs:u.bot.thinkMaxMs??4000,bonusPaid:(u.bot.bonusPaid||0)/100,bonusPercent:u.bot.bonusPercent||0,bonusBase:u.bot.funded/100,mode:u.bot.mode||'play',enabled:u.bot.enabled,tableId:u.bot.tableId,buyin:u.bot.buyin/100,stopLoss:u.bot.stopLoss/100,stopWin:(u.bot.stopWin||0)/100,balance:u.balance/100,equity:eq/100,session:(eq-u.bot.baseline)/100,total:(eq-u.bot.funded)/100,status:u.bot.error||(at?'Playing at '+at.t.name:u.bot.enabled?'Waiting for players':'Stopped')};});}
 function configure(b,body,t){
  if(!['low','medium','high'].includes(body.risk||'low'))fail('Invalid risk');const l=engine.buyinLimits(t);
  const buyin=body.buyin===undefined?Math.min(b.balance,l.max):cents(body.buyin,'Buy-in'),stopLoss=cents(body.stopLoss??b.balance/100,'Loss limit'),stopWin=cents(body.stopWin??Math.max(l.min,buyin/2)/100,'Win limit');
  if(buyin<l.min||buyin>l.max)fail(`Buy-in must be within the table limits (€${(l.min/100).toFixed(2)}–€${(l.max/100).toFixed(2)})`);if(buyin>b.balance)fail('Buy-in is larger than the bot wallet');
  if(body.mode!==undefined&&!['play','seat'].includes(body.mode))fail('Invalid mode');
  const profile=PROFILES[body.risk||'low'];
  const bluffPercent=setting(body,'bluffPercent',b.bot.bluffPercent??profile.bluffPercent,0,30),maxHandPercent=setting(body,'maxHandPercent',b.bot.maxHandPercent??profile.maxHandPercent,10,100);
  const thinkMinMs=Math.round(setting(body,'thinkMinMs',b.bot.thinkMinMs??1200,500,10000)),thinkMaxMs=Math.round(setting(body,'thinkMaxMs',b.bot.thinkMaxMs??4000,500,10000));
  if(thinkMinMs>thinkMaxMs)fail('Minimum thinking time exceeds maximum');
  Object.assign(b.bot,{tableId:t.id,risk:body.risk||'low',mode:body.mode||b.bot.mode||'play',buyin,stopLoss,stopWin,bluffPercent,maxHandPercent,thinkMinMs,thinkMaxMs,error:null});}
 function route(p,body,u){if(!p.startsWith('/api/bots'))return undefined;if(u.role!=='CENTER')fail('Only the center can manage bots',403);
  if(p==='/api/bots')return list();
  if(p==='/api/bots/guard'){const g=db.botGuard;return {dailyLimit:g.dailyLimit/100,today:guardToday()/100,day:g.day,stopped:bots().some(b=>b.bot.error==='House daily limit reached')};}
  if(p==='/api/bots/settings'){const n=Math.round(Number(body.dailyLimit)*100);if(!Number.isSafeInteger(n)||n<0)fail('The daily limit must be 0 or more');db.botGuard.dailyLimit=n;save();return {ok:true};}
  if(p==='/api/bots/create'){
   const name=String(body.name||'').trim();if(!/^[a-zA-Z0-9_]{3,18}$/.test(name))fail('Name: 3–18 letters, numbers or _');if(db.users.some(x=>x.username.toLowerCase()===name.toLowerCase()))fail('This name is already taken');if(bots().length>=100)fail('Maximum 100 bots');
   const amount=cents(body.budget,'Budget');if(amount>u.balance)fail('The center does not have enough credit for this budget');
   const t=runtime.get(String(body.tableId||''));if(!t)fail('Choose a valid table');
   const b={id:crypto.randomUUID(),username:name,role:'USER',isBot:true,parentId:u.id,balance:amount,bot:{enabled:false,funded:amount,baseline:amount}};
   guardToday();configure(b,body,t);u.balance-=amount;db.users.push(b);db.botGuard.start+=amount;audit('BOT_FUND',b,amount);save();return {ok:true,id:b.id};}
  const b=bots().find(x=>x.id===body.id);if(!b)fail('Bot not found',404);
  if(p==='/api/bots/bonus'){
   // The percentage is a cumulative declared promotion budget, paid from CENTER.
   // It never changes the bot's cards, hand result, session limits or rake.
   const percent=setting(body,'percent',0,.01,100),target=Math.round(b.bot.funded*percent/100),paid=b.bot.bonusPaid||0,amount=target-paid;
   if(amount<=0)fail('This bonus target is already paid; choose a higher cumulative percentage');
   const t=runtime.get(b.bot.tableId);if(!t)fail('Table not found');
   const recipients=t.seats.filter(isHuman).map(s=>db.users.find(x=>x.id===s.userId)).filter(x=>x&&x.role==='USER'&&!x.blocked);
   if(!recipients.length)fail('There are no eligible players at this table');
   if(amount<recipients.length)fail('Bonus is too small to give every player at least one cent');
   if(u.balance<amount)fail('The center does not have enough credit for this bonus');
   const awards=recipients.map((x,i)=>({user:x,amount:Math.floor(amount/recipients.length)+(i<amount%recipients.length?1:0)}));
   const batchId=crypto.randomUUID();u.balance-=amount;
   for(const a of awards){a.user.balance+=a.amount;db.ledger.push({id:crypto.randomUUID(),type:'BOT_BONUS',from:u.id,to:a.user.id,amount:a.amount,botId:b.id,tableId:t.id,percent,batchId,time:Date.now()});}
   b.bot.bonusPaid=target;b.bot.bonusPercent=percent;save();
   return {ok:true,amount:amount/100,percent,awards:awards.map(a=>({username:a.user.username,amount:a.amount/100}))};
  }
  if(p==='/api/bots/configure'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table before changing it');const t=runtime.get(String(body.tableId));if(!t)fail('Table not found');configure(b,body,t);audit('BOT_MANAGE',b);}
  else if(p==='/api/bots/status'){if(typeof body.enabled!=='boolean')fail('Invalid status');
   // A new session starts from the bot's current money; the limits count from there.
   if(body.enabled){if(b.balance<b.bot.buyin&&!seatOf(b))fail('The bot wallet is smaller than its buy-in');b.bot.baseline=equity(b);}
   b.bot.enabled=body.enabled;b.bot.error=null;if(!body.enabled){const at=seatOf(b);if(at)engine.leave(at.t,b);}audit('BOT_MANAGE',b,0,{enabled:body.enabled});}
  else if(p==='/api/bots/delete'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table first');guardToday();const left=b.balance+(rakeMap.get(b.id)?.rake||0);u.balance+=b.balance;audit('BOT_REFUND',b,b.balance);db.users.splice(db.users.indexOf(b),1);db.botGuard.start-=left;rakeTotal-=rakeMap.get(b.id)?.rake||0;rakeMap.delete(b.id);}
  else fail('Not found',404);
  save();return {ok:true};}
 const stop=(b,reason,at)=>{b.bot.enabled=false;b.bot.error=reason;if(at)try{engine.leave(at.t,b);}catch{}save();};
 function tick(now=Date.now()){
  const today=guardToday(now),limit=db.botGuard.dailyLimit;
  if(limit>0&&today<=-limit)for(const b of bots())if(b.bot.enabled)stop(b,'House daily limit reached',seatOf(b));
  for(const b of bots()){
   let at=seatOf(b);if(at)at.s.lastSeen=now;
   if(!b.bot.enabled)continue;
   try{
    const between=at&&(!LIVE.includes(at.t.phase)||!at.s.inHand),session=equity(b)-b.bot.baseline;
    if(at&&between){
     if(session>=b.bot.stopWin){stop(b,'Win limit reached',at);continue;}
     if(-session>=b.bot.stopLoss){stop(b,'Loss limit reached',at);continue;}
     const humans=at.t.seats.filter(isHuman).length,free=at.t.seats.filter(s=>!s).length;
     // Bots only fill seats: they leave when no real player is left, or when the
     // table is full so that a real player can always sit down.
     if(!humans||!free||at.s.stack<at.t.bb||at.s.rebuyDeadline){engine.leave(at.t,b);save();continue;}}
    if(!at){const t=runtime.get(b.bot.tableId);if(!t){stop(b,'Table removed');continue;}
     if(-(equity(b)-b.bot.baseline)>=b.bot.stopLoss){stop(b,'Loss limit reached');continue;}
     if(b.balance<b.bot.buyin){stop(b,'Wallet smaller than the buy-in');continue;}
     const humans=t.seats.filter(isHuman).length,free=t.seats.filter(s=>!s).length,botsHere=t.seats.filter(s=>s&&!isHuman(s)).length;
     if(!humans||free<2||botsHere>=3)continue;
     engine.sit(t,b,t.seats.findIndex(s=>!s),Math.min(b.bot.buyin,engine.buyinLimits(t).max)/100,[...runtime.values()]);
     // Seat only: sits out at once, before any hand can deal it in, so it never pays a blind.
     if(b.bot.mode==='seat')engine.sitOut(t,b,true);save();continue;}
    if(b.bot.mode==='seat'){if(!at.s.sittingOut)engine.sitOut(at.t,b,true);at.s.sitOutSince=now;if(!(LIVE.includes(at.t.phase)&&at.t.seats[at.t.turn]===at.s))continue;}
    const {t,s}=at;
    if(LIVE.includes(t.phase)&&t.seats[t.turn]===s&&!t.runout){
     // Each new turn gets its own delay; cap it against the server deadline.
     const key=`${t.hand}:${t.phase}:${t.turnStartedAt}:${t.currentBet}:${s.roundBet}`;
     let thought=thinking.get(s);
     if(!thought||thought.key!==key){
      const min=b.bot.thinkMinMs??1200,max=b.bot.thinkMaxMs??4000;
      const pressure=toCall(t,s)>s.stack*.2?.8:0;
      const delay=Math.min(max,Math.round(min+random()*(max-min)+pressure*500));
      thought={key,at:Math.min(t.turnStartedAt+delay,(t.deadline||Infinity)-750)};thinking.set(s,thought);
     }
     if(now>=thought.at){
      thinking.delete(s);
      const d=botDecision(botView(t,s),b.bot.risk,random,b.bot);
      try{engine.act(t,b.id,d.type,d.amount);}catch{engine.act(t,b.id,toCall(t,s)?'fold':'check');}
     }}
   }catch(e){stop(b,e.message,seatOf(b));}
  }
 }
 return {route,tick,list};
}
