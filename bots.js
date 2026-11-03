import crypto from 'node:crypto';
import {LIVE,canRaise,toCall,maxRaiseTo,fail} from './game.js';
import {evaluateHand,compare,ranks,suits} from './poker.js';
import {tableEquityInput,playerEquity} from './exact-equity.js';
import {calculateTableEquity} from './equity-service.js';

// ---- Experimental virtual-credit table-filling bots ----
// The server calculates exact equity from all dealt hands. The decision receives
// percentages only, never opponents' cards or the actual upcoming deck order.
// The center controls the risk: budget, buy-in, loss limit, win limit and style.

// Bots carry ordinary names; only the center sees which players are bots
// (isBot on the account and on the seat). Older bots named "Name [BOT]" are renamed.
const OLD_SUFFIX=' [BOT]';
const STYLE={low:{call:.5,raise:.8,bluff:.02,size:.5,exposure:.15},medium:{call:.42,raise:.72,bluff:.05,size:.66,exposure:.3},high:{call:.35,raise:.64,bluff:.09,size:.8,exposure:.5}};
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
export function equityEstimate(v,iterations,random=Math.random){
 const opp=Math.max(1,Math.min(5,v.opponents||1)),hole=v.game==='omaha'?4:2,known=new Set([...v.cards,...v.board]),deck=[];
 for(const su of suits)for(const r of ranks)if(!known.has(r+su))deck.push(r+su);
 const n=iterations??(v.game==='omaha'?70:170),shares=Array(opp+1).fill(0);
 if(!Number.isInteger(n)||n<1)throw new RangeError('Iterations must be a positive integer');
 for(let i=0;i<n;i++){
  const need=opp*hole+(5-v.board.length);for(let k=0;k<need;k++){const j=k+Math.floor(random()*(deck.length-k));[deck[k],deck[j]]=[deck[j],deck[k]];}
  const board=[...v.board,...deck.slice(opp*hole,need)],scores=[evaluateHand(v.game,v.cards,board)];
  for(let o=0;o<opp;o++)scores.push(evaluateHand(v.game,deck.slice(o*hole,o*hole+hole),board));
  let winners=[0];for(let j=1;j<scores.length;j++){const c=compare(scores[j],scores[winners[0]]);if(c>0)winners=[j];else if(c===0)winners.push(j);}
  for(const j of winners)shares[j]+=1/winners.length;}
 // Equity includes the player's share of tied pots. Opponents are anonymous:
 // no individual advantage can be inferred without public evidence about them.
 const mine=shares[0]/n;
 return {equity:mine,opponentEquities:shares.slice(1).map(x=>x/n),opponentsEquity:1-mine,iterations:n};}
export function equity(v,iterations,random=Math.random){return equityEstimate(v,iterations,random).equity;}
// Tight and disciplined: the bot puts money in only when its chance of winning beats
// the price it has to pay (pot odds) by a safety margin, and bets for value with
// strong hands. Bluffs are rare and small. "risk" only changes the margins.
const PLAN={low:{margin:.1,value:.68,bluff:.01,size:.6},medium:{margin:.06,value:.62,bluff:.03,size:.66},high:{margin:.03,value:.56,bluff:.05,size:.75}};
export function botDecision(v,risk='low',random=Math.random,probabilities){
 const p=PLAN[risk]||PLAN.low,estimate=probabilities??equityEstimate(v,undefined,random),eq=estimate.equity,opp=Math.max(1,v.opponents||1);
 // Budget is cumulative for the whole hand, including blinds and earlier streets.
 // Reconstruct the starting table stack so repeated bets cannot reset the limit.
 const invested=v.committed||0,startingStack=v.stack+invested;
 const leading=v.board.length===5&&estimate.opponentEquities.every(x=>eq>x);
 const investmentRate=leading?.4:.15,investmentLimit=Math.floor(startingStack*investmentRate);
 const remainingInvestment=Math.max(0,Math.min(v.stack,investmentLimit-invested));
 const result=action=>({...action,...estimate,investmentRate,investmentLimit,remainingInvestment});
 // Against more players a hand needs more equity to be strong.
 const strong=Math.max(p.value-(opp-1)*.08,1/(opp+1)+.18);
 const callCost=Math.min(v.toCall,v.stack),price=callCost/Math.max(1,v.pot+callCost);
 // Share of its chips the bot has already put into this pot: past a third it is
 // committed and calls whenever the price is right instead of giving the pot away.
 const committed=(v.committed||0)/Math.max(1,(v.committed||0)+v.stack);
 const allInCall=v.toCall>=v.stack||!!v.facingAllIn;
 // Someone who shoves often holds all kinds of hands: then pot odds alone decide.
 const loose=(v.shoveRate||0)>=.25;
 const margin=committed>=.3||loose?0:allInCall?p.margin*.3:p.margin;
 if(v.canRaise&&remainingInvestment>0){
  const bluff=!estimate.exact&&eq<strong&&!v.toCall&&random()<p.bluff;
  if(eq>=strong||bluff){
   const want=v.currentBet===0?p.size*Math.max(v.pot,v.bb*2):v.currentBet+p.size*(v.pot+v.toCall),ceiling=Math.min(v.maxRaiseTo,v.roundBet+remainingInvestment),target=Math.min(ceiling,Math.max(v.minRaiseTo,Math.round(want))),cost=target-v.roundBet;
   // Respect both the cumulative budget and the engine's minimum raise.
   const legalRaise=target>=v.minRaiseTo||target===v.roundBet+v.stack;
   if(legalRaise&&target>v.currentBet&&cost<=remainingInvestment&&(!bluff||cost<=Math.min(v.pot*.5,v.stack*.1)))return result({type:'raise',amount:target/100});}}
 if(!v.toCall)return result({type:'check'});
 return result({type:callCost<=remainingInvestment&&eq>=price+margin?'call':'fold'});}

export function createBots({db,runtime,engine,save,calculateEquity=calculateTableEquity}){
 const calculations=new WeakMap();
 function probabilities(t){
  const input=tableEquityInput(t),key=JSON.stringify(input);let cached=calculations.get(t);
  if(!cached||cached.key!==key){
   cached={key};calculations.set(t,cached);
   const result=calculateEquity(input);
   if(result&&typeof result.then==='function')result.then(value=>{cached.result=value;},error=>{cached.error=error;});
   else cached.result=result;
  }
  if(cached.error)throw cached.error;
  return cached.result;
 }
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
 let rakeSeen=0,rakeTotal=0,rakeMap=new Map();
 function botRake(){const ids=new Set(bots().map(u=>u.id));for(;rakeSeen<db.ledger.length;rakeSeen++){const x=db.ledger[rakeSeen];if(x.type!=='RAKE')continue;for(const a of x.allocations||[])if(a.bot||ids.has(a.userId)){rakeTotal+=a.amount;const r=rakeMap.get(a.userId)||{rake:0,hands:0};r.rake+=a.amount;r.hands++;rakeMap.set(a.userId,r);}}return rakeTotal;}
 const houseValue=()=>bots().reduce((n,u)=>n+equity(u),0)+botRake();
 function guardToday(now=Date.now()){const g=db.botGuard,d=dayOf(now);if(g.day!==d){g.day=d;g.start=houseValue();for(const b of bots())if(b.bot.error==='House daily limit reached'){b.bot.error=null;b.bot.enabled=true;b.bot.baseline=equity(b);}save();}return houseValue()-g.start;}
 const cents=(v,label)=>{const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<=0)fail(label+' must be a positive amount');return n;};
 // Rake a bot pays goes straight back to the center, so the house result of a bot
 // is its chip result plus the rake it paid.
 function rakeByBot(){botRake();return rakeMap;}
 function list(){const rk=rakeByBot();return bots().map(u=>{const at=seatOf(u),eq=equity(u),r=rk.get(u.id)||{rake:0,hands:0};return {rakePaid:r.rake/100,rakeHands:r.hands,house:(eq-u.bot.funded+r.rake)/100,id:u.id,name:u.username,risk:u.bot.risk,mode:u.bot.mode||'play',enabled:u.bot.enabled,tableId:u.bot.tableId,buyin:u.bot.buyin/100,stopLoss:u.bot.stopLoss/100,stopWin:(u.bot.stopWin||0)/100,balance:u.balance/100,equity:eq/100,session:(eq-u.bot.baseline)/100,total:(eq-u.bot.funded)/100,status:u.bot.error||(at?'Playing at '+at.t.name:u.bot.enabled?'Waiting for players':'Stopped')};});}
 function configure(b,body,t){
  if(!['low','medium','high'].includes(body.risk||'low'))fail('Invalid risk');const l=engine.buyinLimits(t);
  const buyin=body.buyin===undefined?Math.min(b.balance,l.max):cents(body.buyin,'Buy-in'),stopLoss=cents(body.stopLoss??b.balance/100,'Loss limit'),stopWin=cents(body.stopWin??Math.max(l.min,buyin/2)/100,'Win limit');
  if(buyin<l.min||buyin>l.max)fail(`Buy-in must be within the table limits (€${(l.min/100).toFixed(2)}–€${(l.max/100).toFixed(2)})`);if(buyin>b.balance)fail('Buy-in is larger than the bot wallet');
  if(body.mode!==undefined&&!['play','seat'].includes(body.mode))fail('Invalid mode');
  Object.assign(b.bot,{tableId:t.id,risk:body.risk||'low',mode:body.mode||b.bot.mode||'play',buyin,stopLoss,stopWin,error:null});}
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
  if(p==='/api/bots/configure'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table before changing it');const t=runtime.get(String(body.tableId));if(!t)fail('Table not found');configure(b,body,t);audit('BOT_MANAGE',b);}
  else if(p==='/api/bots/status'){if(typeof body.enabled!=='boolean')fail('Invalid status');
   // A new session starts from the bot's current money; the limits count from there.
   if(body.enabled){if(b.balance<b.bot.buyin&&!seatOf(b))fail('The bot wallet is smaller than its buy-in');b.bot.baseline=equity(b);}
   b.bot.enabled=body.enabled;b.bot.error=null;if(!body.enabled){const at=seatOf(b);if(at)engine.leave(at.t,b);}audit('BOT_MANAGE',b,0,{enabled:body.enabled});}
  else if(p==='/api/bots/delete'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table first');guardToday();const left=b.balance+(rakeMap.get(b.id)?.rake||0);u.balance+=b.balance;audit('BOT_REFUND',b,b.balance);db.users.splice(db.users.indexOf(b),1);db.botGuard.start-=left;rakeTotal-=rakeMap.get(b.id)?.rake||0;rakeMap.delete(b.id);}
  else fail('Not found',404);
  save();return {ok:true};}
 const shoves=new Map(),seenHand=new Set();
 function observe(t){for(const x of t.seats){if(!x||x.isBot||!x.inHand)continue;const k=t.id+':'+t.hand+':'+x.userId,m=shoves.get(x.userId)||{hands:0,shoves:0};
  if(!seenHand.has(k)){seenHand.add(k);m.hands++;}if(x.allIn&&!seenHand.has(k+':a')){seenHand.add(k+':a');m.shoves++;}shoves.set(x.userId,m);}
  if(seenHand.size>20000)seenHand.clear();}
 const shoveRate=t=>{const ag=t.lastAggressor>=0?t.seats[t.lastAggressor]:t.seats.find(x=>x&&x.inHand&&!x.folded&&x.allIn&&!x.isBot);const m=ag&&shoves.get(ag.userId);return m&&m.hands>=4?m.shoves/m.hands:0;};
 const stop=(b,reason,at)=>{b.bot.enabled=false;b.bot.error=reason;if(at)try{engine.leave(at.t,b);}catch{}save();};
 function tick(now=Date.now()){
  const today=guardToday(now),limit=db.botGuard.dailyLimit;
  if(limit>0&&today<=-limit)for(const b of bots())if(b.bot.enabled)stop(b,'House daily limit reached',seatOf(b));
  for(const t of runtime.values())if(t.seats.some(x=>x?.isBot)&&LIVE.includes(t.phase))observe(t);
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
     engine.sit(t,b,t.seats.findIndex(s=>!s),b.bot.buyin/100,[...runtime.values()]);
     // Seat only: sits out at once, before any hand can deal it in, so it never pays a blind.
     if(b.bot.mode==='seat')engine.sitOut(t,b,true);save();continue;}
    if(b.bot.mode==='seat'){if(!at.s.sittingOut)engine.sitOut(at.t,b,true);at.s.sitOutSince=now;if(!(LIVE.includes(at.t.phase)&&at.t.seats[at.t.turn]===at.s))continue;}
    const {t,s}=at;
    if(LIVE.includes(t.phase)&&t.seats[t.turn]===s&&!t.runout){
     // Think for 1.5–4 seconds like a person would.
     s.botThink??=1500+Math.floor(Math.random()*2500);
     const exact=probabilities(t);
     if(exact&&now-t.turnStartedAt>=s.botThink){delete s.botThink;const d=botDecision(botView(t,s,{shoveRate:shoveRate(t)}),b.bot.risk,Math.random,playerEquity(exact,b.id));try{engine.act(t,b.id,d.type,d.amount);}catch{engine.act(t,b.id,toCall(t,s)?'fold':'check');}}}
   }catch(e){stop(b,e.message,seatOf(b));}
  }
 }
 return {route,tick,list};
}
