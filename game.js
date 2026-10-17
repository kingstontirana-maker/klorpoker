// Texas Hold'em table engine. Amounts are integer cents; the server owns the
// accounts and persistence, the engine owns seats, betting and settlement.
import crypto from 'node:crypto';
import {deck,distribute,evaluate,compare,rankNames,bestFive,ranks,suits} from './poker.js';
import {rakeShares} from './rake.js';

export const LIVE=['preflop','flop','turn','river'];
export const ACTION_MS=30000,BETWEEN_HANDS_MS=8000,RESULT_REVEAL_MS=8000,REBUY_WINDOW_MS=30000,SIT_OUT_MS=5*60000;
// A seated player whose browser stops checking in is protected: sat out after
// AWAY_MS, cashed out to the wallet after AWAY_CASHOUT_MS.
export const AWAY_MS=25000,AWAY_CASHOUT_MS=3*60000;
// Only players whose screen is connected are dealt in: no check-in for PRESENT_MS
// at the start of a hand means they are sat out before any blind is taken.
export const PRESENT_MS=12000;
// A seat at a table where no hand can be dealt is released after IDLE_TABLE_MS;
// a voluntary break lasts at most SIT_OUT_MS.
export const IDLE_TABLE_MS=10*60000;
// All-in runouts reveal one street at a time; the time bank extends a decision.
export const RUNOUT_STEP_MS=1800,TIME_BANK_START=30000,TIME_BANK_MAX=60000,TIME_BANK_REFILL=2000,TIME_BANK_CHUNK=20000,CHAT_LIMIT=40;
const uid=()=>crypto.randomUUID();
const clean=n=>Math.round(n)/100;
// History lines show amounts in euro.
const eur=n=>'€'+(Math.round(n)/100).toFixed(2);
const money=n=>Math.round(Number(n)*100);
export const fail=(m,code=400)=>{const e=Error(m);e.status=code;throw e;};
const suitSymbols={c:'♣',d:'♦',h:'♥',s:'♠'};
export const cardText=c=>(c[0]==='T'?'10':c[0])+suitSymbols[c[1]];
const phaseNames={flop:'FLOP',turn:'TURN',river:'RIVER'};
const rankNamesSq={'High Card':'Letra e lartë','One Pair':'Çift','Two Pair':'Dy çifte','Three of a Kind':'Tris','Straight':'Shkallë','Flush':'Ngjyrë','Full House':'Full House','Four of a Kind':'Poker','Straight Flush':'Shkallë me ngjyrë'};
const exitNames={INACTIVE:'pasivitet',REBUY_EXPIRED:'pa fonde',SIT_OUT:'pushim i gjatë',IDLE_TABLE:'tavolinë pa lojë',LEFT:'dalje',DISCONNECTED:'u shkëput nga loja'};

export const inHand=s=>!!s&&s.inHand&&!s.folded;
export const actionable=s=>inHand(s)&&!s.allIn;
export const eligible=(t,s)=>!!s&&s.stack>=t.bb&&!s.rebuyDeadline&&!s.sittingOut&&!s.leaveAfterHand;
export const toCall=(t,s)=>Math.max(0,t.currentBet-s.roundBet);
// TDA: betting reopens for a player who already acted only when the raises
// made since their action add up to at least one full raise.
export const canRaise=(t,s)=>actionable(s)&&s.stack>toCall(t,s)&&(!s.acted||t.currentBet-(s.actedAt||0)>=t.minRaise);
export function nextToAct(t,from=t.turn){for(let k=1;k<=6;k++){const i=((from+k)%6+6)%6,s=t.seats[i];if(actionable(s)&&(!s.acted||s.roundBet!==t.currentBet))return i;}return -1;}
// Pots in the middle (bets of the current street are still in front of the
// players). Side pots exist only above an all-in player's total contribution.
export function livePots(t){
 const ps=t.seats.filter(s=>s?.inHand&&s.committed>0),base=s=>s.committed-s.roundBet;
 const caps=[...new Set(ps.filter(s=>s.allIn&&!s.folded&&base(s)===s.committed).map(s=>s.committed))].sort((a,b)=>a-b),pots=[];let prev=0;
 for(const level of [...caps,Infinity]){
  const amount=ps.reduce((n,s)=>n+Math.max(0,Math.min(base(s),level)-prev),0),eligibleSeats=ps.filter(s=>!s.folded&&(!s.allIn||s.committed>=level&&level!==Infinity||s.committed>prev)).map(s=>s.position);
  if(amount>0)pots.push({amount,eligible:eligibleSeats});prev=level;
 }
 return pots;
}

export function createEngine({db,save=()=>{},onSettle=()=>{},onEquity=()=>{}}){
 const findUser=id=>db.users.find(u=>u.id===id);
 const event=(t,text)=>{t.events.unshift({text,at:Date.now(),hand:t.hand});t.events=t.events.slice(0,60);};
 function visual(t,type,detail={}){const e={seq:++t.visualSeq,hand:t.hand,type,at:Date.now(),...detail};t.visualEvents.push(e);t.visualEvents=t.visualEvents.slice(-100);return e;}
 const seatOf=(t,userId)=>t.seats.findIndex(s=>s?.userId===userId);

 function makeTable(id,name,sb,bb){return {id:String(id),name,sb,bb,hand:0,phase:'waiting',button:-1,sbPos:-1,bbPos:-1,turn:-1,lastAggressor:-1,board:[],pot:0,currentBet:0,minRaise:bb,deck:[],seats:Array(6).fill(null),events:[],lastResult:null,lastActionAt:0,turnStartedAt:0,deadline:0,runout:null,visualEvents:[],visualSeq:0,chat:[],chatSeq:0};}
 function setTurn(t,i){t.turn=i;t.lastActionAt=t.turnStartedAt=Date.now();t.deadline=i>=0?t.turnStartedAt+ACTION_MS:0;}
 // Bets in front of the players slide into the middle at the end of a round.
 function collect(t){const bets=Object.fromEntries(t.seats.filter(s=>s?.roundBet>0).map(s=>[s.userId,clean(s.roundBet)]));if(Object.keys(bets).length)visual(t,'collect',{bets});}

 function cashOutSeat(t,index,reason){const s=t.seats[index];if(!s)return;const u=findUser(s.userId);if(u){u.balance+=s.stack;u.tableExit={tableId:t.id,reason,at:Date.now()};}db.ledger.push({id:uid(),type:'CASH_OUT',to:s.userId,tableId:t.id,amount:s.stack,reason,time:Date.now()});t.seats[index]=null;event(t,`${s.username} u largua · ${exitNames[reason]||reason}`);visual(t,'leave',{userId:s.userId,position:index,reason});}
 function removeInactive(t){for(let i=0;i<t.seats.length;i++)if((t.seats[i]?.inactiveHands||0)>=2)cashOutSeat(t,i,'INACTIVE');}
 function commit(t,s,n){s.stack-=n;s.roundBet+=n;s.committed+=n;t.pot+=n;s.allIn=s.stack===0;}

 // Back to an empty felt: no board, no cards, no result, no pot.
 function clearTable(t){
  t.phase='waiting';setTurn(t,-1);t.board=[];t.pot=0;t.currentBet=0;t.runout=null;t.lastResult=null;t.sbPos=t.bbPos=-1;
  for(const s of t.seats)if(s)Object.assign(s,{cards:[],committed:0,roundBet:0,folded:false,allIn:false,acted:false,lastAction:null,inHand:false});
 }

 function startHand(t){
  removeInactive(t);
  const real=Date.now();for(const s of t.seats)if(s&&!s.sittingOut&&real-(s.lastSeen??real)>PRESENT_MS)markAway(t,s);
  if(t.seats.filter(s=>eligible(t,s)).length<2){clearTable(t);return false;}
  t.hand++;t.phase='preflop';t.board=[];t.pot=0;t.currentBet=0;t.minRaise=t.bb;t.deck=deck();t.lastResult=null;t.lastAggressor=-1;
  // The button never moves onto a player who still has to post to enter.
  const canButton=s=>eligible(t,s)&&!s.mustPost,anyButton=t.seats.some(canButton);
  let x=t.button;for(let k=1;k<=6;k++){x=(x+1+6)%6;if(anyButton?canButton(t.seats[x]):eligible(t,t.seats[x])){t.button=x;break;}}
  t.runout=null;
  for(const s of t.seats)if(s){Object.assign(s,{cards:[],committed:0,roundBet:0,folded:false,allIn:false,acted:false,actedAt:0,lastAction:null,inHand:eligible(t,s)});if(s.inHand)s.timeBank=Math.min(TIME_BANK_MAX,(s.timeBank??TIME_BANK_START)+TIME_BANK_REFILL);}
  const order=[];for(let i=1;i<=6;i++){const p=(t.button+i)%6;if(t.seats[p]?.inHand)order.push(p);}
  for(let c=0;c<2;c++)for(const pos of order)t.seats[pos].cards.push(t.deck.pop());
  visual(t,'deal',{button:t.button});
  // Heads-up: the button posts the small blind and acts first preflop.
  const headsUp=order.length===2;t.sbPos=headsUp?t.button:order[0];t.bbPos=headsUp?order[0]:order[1];
  const post=(pos,n,type)=>{const s=t.seats[pos],v=Math.min(s.stack,n);commit(t,s,v);s.lastAction={type,amount:clean(v),at:Date.now()};visual(t,'bet',{position:pos,userId:s.userId,amount:clean(v),label:type});};
  post(t.sbPos,t.sb,'SB');post(t.bbPos,t.bb,'BB');
  // A player who joined or returned from sitting out posts one live big blind,
  // unless they are already in a blind position.
  for(const pos of order){const s=t.seats[pos];if(s.mustPost&&!headsUp&&pos!==t.sbPos&&pos!==t.bbPos){post(pos,t.bb,'POST');event(t,`${s.username} paguan big blind për të hyrë në lojë`);}s.mustPost=false;}
  t.currentBet=Math.max(...order.map(p=>t.seats[p].roundBet));
  setTurn(t,nextToAct(t,t.bbPos));
  event(t,`Dora #${t.hand} nisi · blinds ${eur(t.sb)}/${eur(t.bb)} · dealer ${t.seats[t.button].username}`);
  if(t.turn<0)progress(t);
  return true;
 }

 function dealStreet(t){
  collect(t);
  t.deck.pop();const count=t.board.length===0?3:1;for(let i=0;i<count;i++)t.board.push(t.deck.pop());
  t.phase=t.board.length===3?'flop':t.board.length===4?'turn':'river';
  t.currentBet=0;t.minRaise=t.bb;t.lastAggressor=-1;for(const s of t.seats)if(s){s.roundBet=0;s.acted=false;s.actedAt=0;}
  visual(t,'street',{phase:t.phase,count:t.board.length});event(t,`${phaseNames[t.phase]} · ${t.board.map(cardText).join(' ')}`);
 }

 function progress(t){
  if(t.seats.filter(inHand).length===1)return finish(t,false);
  const n=nextToAct(t);if(n>=0)return setTurn(t,n);
  const allIn=t.seats.filter(actionable).length<=1;
  if(t.phase==='river'&&!allIn)return finish(t,true);
  // Nobody can bet any more: table the hands, then deal the board street by street.
  if(allIn){collect(t);for(const s of t.seats)if(s)s.roundBet=0;t.currentBet=0;setTurn(t,-1);t.runout={at:Date.now()+RUNOUT_STEP_MS};visual(t,'reveal',{ids:t.seats.filter(inHand).map(s=>s.id)});event(t,'All-in · letrat hapen në tavolinë');return;}
  dealStreet(t);setTurn(t,nextToAct(t,t.button));
 }

 function runoutStep(t,now){
  if(t.board.length<5){dealStreet(t);t.runout={at:now+(t.board.length<5?RUNOUT_STEP_MS:RUNOUT_STEP_MS*0.8)};return;}
  t.runout=null;finish(t,true);
 }

 // Online showdown order: the last river aggressor shows first, otherwise the
 // first player left of the button. A losing hand is mucked unless anyone is all-in.
 function showdownOrder(t){
  const allIn=t.seats.some(s=>inHand(s)&&s.allIn),start=t.lastAggressor>=0&&inHand(t.seats[t.lastAggressor])?t.lastAggressor:(t.button+1)%6,shown=[];let best=null;
  for(let k=0;k<6;k++){const s=t.seats[(start+k)%6];if(!inHand(s))continue;const score=evaluate([...s.cards,...t.board]);if(allIn||!best||compare(score,best)>=0){shown.push(s.id);if(!best||compare(score,best)>0)best=score;}}
  return shown;
 }

 function finish(t,showdown){
  // Odd chips go to the first winner clockwise from the button.
  collect(t);t.runout=null;
  const players=t.seats.flatMap((s,i)=>s?.inHand?[{...s,position:(i-t.button+5)%6}]:[]);
  // Rake is a flat percentage of the contested pot; there is no per-hand cap.
  const result=distribute(players,t.board,db.rakePercent,Infinity,t.board.length>=3);
  for(const s of t.seats)if(s&&result.payments[s.id])s.stack+=result.payments[s.id];
  const byId=id=>t.seats.find(s=>s?.id===id);
  const winnerIds=[...new Set(result.pots.filter(p=>!p.refunded).flatMap(p=>p.winners))];
  const shown=showdown?showdownOrder(t):[];
  const winningHands=showdown?Object.fromEntries(winnerIds.map(id=>[id,bestFive([...t.board,...byId(id).cards])])):{};
  if(showdown){for(const id of shown){const s=byId(id),b=bestFive([...t.board,...s.cards]);event(t,`${s.username} tregon ${s.cards.map(cardText).join(' ')} · ${rankNamesSq[b.rank]}`);}for(const s of t.seats)if(inHand(s)&&!shown.includes(s.id))event(t,`${s.username} nuk i tregon letrat (muck)`);}
  let contested=0;for(const p of result.pots){const names=p.winners.map(id=>byId(id)?.username).join(' & ');if(p.refunded)event(t,`Basti i pakonkurruar ${eur(p.amount)} iu kthye ${names}`);else{event(t,`${names} ${p.winners.length>1?'ndajnë':'fiton'} ${eur(p.amount)} · ${contested?'side pot '+contested:'poti kryesor'}`);contested++;}}
  visual(t,'award',{payments:Object.fromEntries(Object.entries(result.payments).map(([id,n])=>[id,clean(n)])),winnerIds,pots:result.pots.map(p=>({amount:clean(p.amount),winners:p.winners,refunded:p.refunded,share:p.winners.map((id,i)=>clean(Math.floor(p.amount/p.winners.length)+(i<p.amount%p.winners.length?1:0)))}))});
  t.lastResult={...result,winnerIds,winningHands,showdown,shown,at:Date.now(),hands:shown.map(id=>{const s=byId(id),b=bestFive([...t.board,...s.cards]);return {id,username:s.username,cards:s.cards,rank:b.rank,score:b.score};})};
  for(const s of t.seats)if(s)s.roundBet=0;
  t.phase='finished';setTurn(t,-1);
  for(let i=0;i<t.seats.length;i++)if(t.seats[i]?.leaveAfterHand)cashOutSeat(t,i,'LEFT');
  for(const s of t.seats)if(s&&s.stack<t.bb&&!s.rebuyDeadline){s.rebuyAvailableAt=t.lastResult.at+RESULT_REVEAL_MS;s.rebuyDeadline=s.rebuyAvailableAt+REBUY_WINDOW_MS;}
  // Rake is split at once: each admin/agent receives its percentage of the rake its
  // players paid (revenue share), the centre keeps the rest. The split is stored.
  if(result.totalRake){const allocations=Object.entries(result.rakeContributions).map(([userId,amount])=>({userId,amount})),split=rakeShares(db,allocations);db.users.find(u=>u.role==='CENTER').balance+=split.center;for(const sh of split.shares){const r=findUser(sh.userId);if(r)r.balance+=sh.amount;}for(const [id,c] of Object.entries(split.carry)){const r=findUser(id);if(r)r.shareCarry=c;}db.ledger.push({id:uid(),type:'RAKE',tableId:t.id,hand:t.hand,amount:result.totalRake,allocations,...(split.shares.length?{shares:split.shares}:{}),time:Date.now()});}
  save();onSettle();
 }

 function act(t,userId,type,amount,automatic=false){
  if(!LIVE.includes(t.phase))fail('Dora nuk është aktive');
  const p=seatOf(t,userId);if(p<0||p!==t.turn)fail('Nuk është radha jote');
  const s=t.seats[p],owe=toCall(t,s),at=Date.now();
  // A timed-out player checks when checking is free, and folds otherwise.
  if(automatic&&type==='fold'&&owe===0)type='check';
  if(type==='call'&&owe===0)type='check';
  if(type==='fold'){s.folded=true;s.acted=true;s.lastAction={type:automatic?'AUTO-FOLD':'FOLD',at};visual(t,'fold',{position:p,userId});event(t,`${s.username} ${automatic?'bën fold automatik (pa veprim)':'bën fold'}`);}
  else if(type==='check'){if(owe)fail('Nuk mund të bësh check: ka bast për të ndjekur');s.acted=true;s.actedAt=t.currentBet;s.lastAction={type:automatic?'AUTO-CHECK':'CHECK',at};visual(t,'check',{position:p,userId});event(t,`${s.username} ${automatic?'bën check automatik (pa veprim)':'bën check'}`);}
  else if(type==='call'){const n=Math.min(owe,s.stack);commit(t,s,n);s.acted=true;s.actedAt=t.currentBet;s.lastAction={type:s.allIn?'ALL-IN':'CALL',amount:clean(n),at};visual(t,'bet',{position:p,userId,amount:clean(n),label:s.lastAction.type});event(t,`${s.username} bën call ${eur(n)}${s.allIn?' · all-in':''}`);}
  else if(type==='raise'){
   if(!canRaise(t,s))fail(s.acted?'Basti nuk është rihapur pas një all-in të paplotë':'Nuk ke fonde të mjaftueshme për të ngritur');
   const target=money(amount),max=s.roundBet+s.stack,opening=t.currentBet===0;
   if(!Number.isSafeInteger(target)||target<=t.currentBet||target>max)fail('Shuma e bastit është e pavlefshme');
   const increment=target-t.currentBet;
   if(increment<t.minRaise&&target!==max)fail(`${opening?'Basti minimal':'Ngritja minimale'} është ${eur(t.currentBet+t.minRaise)}`);
   const n=target-s.roundBet;commit(t,s,n);
   // Only a full raise reopens the betting and sets the next minimum raise.
   if(increment>=t.minRaise){t.minRaise=increment;for(const o of t.seats)if(actionable(o))o.acted=false;}
   t.currentBet=target;s.acted=true;s.actedAt=target;t.lastAggressor=p;
   s.lastAction={type:s.allIn?'ALL-IN':opening?'BET':'RAISE',amount:clean(target),at};visual(t,'bet',{position:p,userId,amount:clean(n),label:s.lastAction.type});
   event(t,`${s.username} ${opening?'bën bet':'ngre në'} ${eur(target)}${s.allIn?' · all-in':''}`);
  }
  else fail('Veprim i pavlefshëm');
  if(automatic){if(s.lastTimeoutHand!==t.hand){s.inactiveHands=(s.inactiveHands||0)+1;s.lastTimeoutHand=t.hand;}if(!s.sittingOut){s.sittingOut=true;s.sitOutSince=Date.now();s.timedOut=true;event(t,`${s.username} nuk veproi në kohë · në pushim derisa të kthehet`);}}else{s.inactiveHands=0;s.lastTimeoutHand=null;s.lastSeen=Date.now();}
  progress(t);save();
 }

 function sit(t,u,position,buyin,allTables){
  if(u.role!=='USER')fail('Vetëm lojtarët mund të luajnë',403);
  if(allTables.some(room=>room.seats.some(s=>s?.userId===u.id)))fail('Je ulur tashmë në një tavolinë');
  const pos=Number(position),amount=money(buyin),limits=buyinLimits(t);
  if(!Number.isInteger(pos)||pos<0||pos>=6||t.seats[pos])fail('Vendi nuk është i lirë');
  if(!Number.isSafeInteger(amount)||amount<limits.min||amount>limits.max||u.balance<amount)fail(`Buy-in i pavlefshëm (${eur(limits.min)}–${eur(limits.max)})`);
  u.balance-=amount;u.tableExit=null;
  // Joining a running game requires a live big blind before the first hand.
  const running=t.hand>0&&t.seats.filter(s=>eligible(t,s)).length>=2;
  t.seats[pos]={id:u.id,userId:u.id,username:u.username,position:pos,stack:amount,cards:[],inHand:false,folded:false,allIn:false,committed:0,roundBet:0,acted:false,actedAt:0,inactiveHands:0,lastTimeoutHand:null,mustPost:running,sittingOut:false,lastSeen:Date.now(),timeBank:TIME_BANK_START};
  db.ledger.push({id:uid(),type:'BUY_IN',from:u.id,tableId:t.id,amount,time:Date.now()});event(t,`${u.username} u ul në vendin ${pos+1}${LIVE.includes(t.phase)?' · luan nga dora e ardhshme':''}`);save();
 }

 // Leaving during a hand folds the cards now and cashes out at settlement.
 function leave(t,u){
  const i=seatOf(t,u.id);if(i<0)fail('Nuk je ulur në tavolinë');const s=t.seats[i];
  if(!LIVE.includes(t.phase)||!s.inHand){cashOutSeat(t,i,'LEFT');save();return {ok:true,pending:false};}
  s.leaveAfterHand=true;
  if(!s.folded&&!s.allIn){if(t.turn===i)act(t,u.id,'fold');else{s.folded=true;s.acted=true;s.lastAction={type:'FOLD',at:Date.now()};visual(t,'fold',{position:i,userId:u.id});event(t,`${s.username} bën fold dhe largohet`);if(t.seats.filter(inHand).length===1)finish(t,false);}}
  save();return {ok:true,pending:!!t.seats[i]};
 }

 function rebuy(t,u,value){
  const s=t.seats[seatOf(t,u.id)];if(!s)fail('Nuk je ulur në tavolinë');
  if(LIVE.includes(t.phase)&&s.inHand)fail('Çipat shtohen ndërmjet duarve');
  if(s.rebuyDeadline&&Date.now()>=s.rebuyDeadline)fail('Afati i riblerjes përfundoi');
  const amount=money(value),max=buyinLimits(t).max;
  if(!Number.isSafeInteger(amount)||amount<=0||amount>u.balance||s.stack+amount>max||s.stack+amount<t.bb)fail('Shuma e pavlefshme ose kredit i pamjaftueshëm');
  u.balance-=amount;s.stack+=amount;delete s.rebuyDeadline;delete s.rebuyAvailableAt;db.ledger.push({id:uid(),type:'REBUY',from:u.id,tableId:t.id,amount,time:Date.now()});save();
 }

 function markAway(t,s,reason){
  if(!s||s.sittingOut)return;s.sittingOut=true;s.autoSitOut=true;s.sitOutSince=Date.now();s.awayHand=t.hand;
  event(t,`${s.username} ${reason||'u shkëput'} · nuk merr letra derisa të kthehet`);save();
 }
 // A returning player only posts to re-enter if hands were dealt without them.
 function comeBack(t,s){
  if(s.timedOut){s.autoSitOut=false;return;}   // a timed-out player returns only by choice
  s.sittingOut=false;s.autoSitOut=false;delete s.sitOutSince;s.inactiveHands=0;s.lastTimeoutHand=null;
  s.mustPost=t.hand>(s.awayHand??t.hand)&&t.seats.filter(o=>o!==s&&eligible(t,o)).length>=2;
  event(t,`${s.username} u rikthye në lojë`);save();
 }
 // The tab was closed: if the player is not back within 5 seconds (a reload is),
 // the normal away protection takes over.
 function away(t,u){const s=t.seats[seatOf(t,u.id)];if(s&&!s.sittingOut)s.lastSeen=Math.min(s.lastSeen??Date.now(),Date.now()-AWAY_MS+5000);}

 function sitOut(t,u,value){
  const s=t.seats[seatOf(t,u.id)];if(!s)fail('Nuk je ulur në tavolinë');
  if(value){if(!s.sittingOut){s.sittingOut=true;s.sitOutSince=Date.now();event(t,`${s.username} bën pushim`);}}
  else if(s.sittingOut){s.sittingOut=false;s.autoSitOut=false;s.timedOut=false;delete s.sitOutSince;s.inactiveHands=0;s.lastTimeoutHand=null;s.mustPost=t.seats.filter(o=>o!==s&&eligible(t,o)).length>=2;event(t,`${s.username} u kthye në lojë`);}
  save();
 }

 // After the hand a player may voluntarily show cards that were not tabled.
 function show(t,u){
  const s=t.seats[seatOf(t,u.id)];if(!s||t.phase!=='finished'||!t.lastResult||s.cards.length!==2)fail('Nuk ka letra për të treguar');
  if(!t.lastResult.shown.includes(s.id)){t.lastResult.shown.push(s.id);event(t,`${s.username} tregon ${s.cards.map(cardText).join(' ')}`);}
 }

 function useTimeBank(t,u){
  const i=seatOf(t,u.id),s=t.seats[i];if(!s||i!==t.turn||!LIVE.includes(t.phase))fail('Nuk është radha jote');
  const add=Math.min(TIME_BANK_CHUNK,s.timeBank||0);if(add<=0)fail('Koha shtesë ka mbaruar');
  s.timeBank-=add;t.deadline+=add;event(t,`${s.username} përdor ${Math.round(add/1000)} sekonda kohë shtesë`);save();
 }

 function chat(t,u,text){
  const message=String(text||'').replace(/\s+/g,' ').trim().slice(0,200);if(!message)fail('Mesazhi është bosh');
  t.chatTimes??={};if(Date.now()-(t.chatTimes[u.id]||0)<1200)fail('Prit pak para mesazhit tjetër');t.chatTimes[u.id]=Date.now();
  t.chat.push({id:++t.chatSeq,user:u.username,text:message,at:Date.now()});t.chat=t.chat.slice(-CHAT_LIMIT);
 }

 function buyinLimits(t){return {min:Math.max(2000,t.bb*10),max:Math.max(100000,t.bb*100)};}

 function snapshot(t,userId,seen=true){
  const present=seen&&t.seats.find(s=>s?.userId===userId);if(present){present.lastSeen=Date.now();if(present.autoSitOut)comeBack(t,present);}
  const mine=t.seats.find(s=>s?.userId===userId),shown=new Set(t.phase==='finished'?t.lastResult?.shown||[]:t.runout?t.seats.filter(inHand).map(s=>s.id):[]);
  const myScore=mine?.inHand&&mine.cards.length===2&&t.board.length>=3?evaluate([...mine.cards,...t.board]):null;
  const ready=t.seats.filter(s=>eligible(t,s)).length;
  const result=t.lastResult;
  return {
   myHandRank:myScore?rankNames[myScore[0]]:null,myHandScore:myScore,myCards:mine?.cards||[],
   visualEvents:t.visualEvents,
   nextHandAt:['waiting','finished'].includes(t.phase)&&ready>=2?Math.max(t.lastActionAt+BETWEEN_HANDS_MS,Date.now()):null,
   legalActions:{canRaise:!!mine&&canRaise(t,mine),isBet:t.currentBet===0,toCall:clean(mine?toCall(t,mine):0),minRaiseTo:clean(t.currentBet+t.minRaise),maxRaiseTo:clean(mine?mine.stack+mine.roundBet:0)},
   serverNow:Date.now(),actionDeadline:t.turn>=0?t.deadline:null,actionDuration:t.turn>=0?t.deadline-t.turnStartedAt:ACTION_MS,runout:!!t.runout,timeBank:Math.floor((mine?.timeBank||0)/1000),chat:t.chat,
   rebuyAvailableAt:mine?.rebuyAvailableAt||null,rebuyDeadline:mine?.rebuyDeadline||null,
   sittingOut:!!mine?.sittingOut,timedOut:!!mine?.timedOut,leaving:!!mine?.leaveAfterHand,mustPost:!!mine?.mustPost,
   canShow:!!mine&&t.phase==='finished'&&!!result&&mine.cards.length===2&&!shown.has(mine.id),
   id:t.id,name:t.name,color:t.color||null,sb:clean(t.sb),bb:clean(t.bb),phase:t.phase,hand:t.hand,button:t.button,sbPos:t.sbPos,bbPos:t.bbPos,turn:t.turn,board:t.board,pot:clean(t.pot),currentBet:clean(t.currentBet),minRaise:clean(t.minRaise),
   pots:LIVE.includes(t.phase)?livePots(t).map(p=>({amount:clean(p.amount),eligible:p.eligible})):[],
   seats:t.seats.map((s,i)=>s?{inactiveHands:s.inactiveHands||0,lastAction:s.lastAction||null,id:s.id,position:i,username:s.username,stack:clean(s.stack),bet:clean(s.roundBet),folded:s.folded,allIn:s.allIn,inHand:s.inHand,sittingOut:!!s.sittingOut,leaving:!!s.leaveAfterHand,waiting:!s.inHand&&!s.sittingOut,cardCount:s.cards.length,cards:s.userId===userId||shown.has(s.id)?s.cards:[],isMe:s.userId===userId}:null),
   events:t.events.slice(0,30),
   lastResult:result?{...Object.fromEntries(Object.entries(result).filter(([k])=>!['totalRake','rakeContributions'].includes(k))),payments:Object.fromEntries(Object.entries(result.payments).map(([k,v])=>[k,clean(v)])),pots:result.pots.map(p=>({...Object.fromEntries(Object.entries(p).filter(([k])=>k!=='rake')),amount:clean(p.amount)}))}:null
  };
 }

 // Timers are authoritative even when the browser disconnects.
 function tickTable(t,now=Date.now()){
  let changed=false;
  const real=Date.now();
  for(let i=0;i<t.seats.length;i++){const s=t.seats[i];if(!s)continue;const idle=!s.inHand||!LIVE.includes(t.phase);
   if(!s.sittingOut&&real-(s.lastSeen??real)>=AWAY_MS){markAway(t,s);changed=true;}
   if(s.autoSitOut&&real-s.sitOutSince>=AWAY_CASHOUT_MS&&idle){cashOutSeat(t,i,'DISCONNECTED');changed=true;continue;}
   if(s.rebuyDeadline&&now>=s.rebuyDeadline&&idle){cashOutSeat(t,i,'REBUY_EXPIRED');changed=true;}
   else if(s.sittingOut&&now-s.sitOutSince>=SIT_OUT_MS&&idle){cashOutSeat(t,i,'SIT_OUT');changed=true;}
   else if(t.phase==='waiting'){s.idleSince??=now;if(now-s.idleSince>=IDLE_TABLE_MS){cashOutSeat(t,i,'IDLE_TABLE');changed=true;}}
   else delete s.idleSince;}
  if(LIVE.includes(t.phase)){if(changed)save();if(t.runout){if(now>=t.runout.at){runoutStep(t,now);save();}return;}if(t.turn>=0&&(now>=t.deadline||t.seats[t.turn].autoSitOut))act(t,t.seats[t.turn].userId,'fold',undefined,true);return;}
  if(now-t.lastActionAt>=BETWEEN_HANDS_MS){if(t.seats.some(s=>(s?.inactiveHands||0)>=2)){removeInactive(t);changed=true;}if(t.seats.filter(s=>eligible(t,s)).length>=2){startHand(t);changed=true;}else if(t.phase==='finished'||t.board.length||t.seats.some(s=>s?.cards.length)){clearTable(t);changed=true;}}
  if(changed)save();
 }

 // ---- Center inspection: the whole table, every hole card, live win chances ----
 // Win chances are recomputed only when the board or the players in the hand
 // change: exact on the turn/river, sampled earlier. The work runs in small
 // chunks between other events so no table ever waits for it.
 const equityJobs=new WeakMap();
 function equity(t){
  const live=t.seats.filter(s=>inHand(s)&&s.cards.length===2);if(live.length<2)return {};
  const key=t.hand+'|'+t.board.join('')+'|'+live.map(s=>s.id).join();let job=equityJobs.get(t);
  if(job?.key!==key){
   const known=new Set([...t.board,...t.seats.flatMap(s=>s?.cards||[])]),rest=[];for(const su of suits)for(const r of ranks)if(!known.has(r+su))rest.push(r+su);
   const need=5-t.board.length,boards=need===0?[[]]:need===1?rest.map(c=>[c]):Array.from({length:need===2?250:150},()=>{const pick=new Set();while(pick.size<need)pick.add(rest[Math.floor(Math.random()*rest.length)]);return [...pick];});
   job={key,value:job?.value&&job.hand===t.hand?job.value:{},hand:t.hand,ready:false};equityJobs.set(t,job);
   const players=live.map(s=>({id:s.id,cards:s.cards})),board=[...t.board],share=Object.fromEntries(players.map(p=>[p.id,0]));let i=0;
   const step=()=>{if(equityJobs.get(t)!==job)return;for(const end=Math.min(boards.length,i+Math.max(2,Math.floor(40/players.length)));i<end;i++){const full=[...board,...boards[i]];let best=null,winners=[];for(const p of players){const v=evaluate([...p.cards,...full]),c=best?compare(v,best):1;if(c>0){best=v;winners=[p.id];}else if(c===0)winners.push(p.id);}for(const id of winners)share[id]+=1/winners.length;}
    if(i<boards.length)return setImmediate(step);job.value=Object.fromEntries(Object.entries(share).map(([id,n])=>[id,Math.round(n/boards.length*1000)/10]));job.ready=true;onEquity();};
   setImmediate(step);
  }
  return job.ready?job.value:Object.fromEntries(Object.keys(job.value).filter(id=>live.some(s=>s.id===id)).map(id=>[id,null]));
 }
 function inspect(t){
  const eq=LIVE.includes(t.phase)||t.runout?equity(t):{};
  return {id:t.id,name:t.name,sb:clean(t.sb),bb:clean(t.bb),phase:t.phase,hand:t.hand,board:t.board,pot:clean(t.pot),currentBet:clean(t.currentBet),turn:t.turn,button:t.button,sbPos:t.sbPos,bbPos:t.bbPos,deadline:t.turn>=0?t.deadline:null,runout:!!t.runout,
   seats:t.seats.map((s,i)=>s?{position:i,userId:s.userId,username:s.username,stack:clean(s.stack),bet:clean(s.roundBet),committed:clean(s.committed),cards:s.cards,inHand:!!s.inHand,folded:!!s.folded,allIn:!!s.allIn,sittingOut:!!s.sittingOut,lastAction:s.lastAction||null,
    made:s.cards.length===2&&t.board.length>=3?rankNamesSq[bestFive([...t.board,...s.cards]).rank]:null,equity:eq[s.id]??null}:null),
   result:t.phase==='finished'&&t.lastResult?{winnerIds:t.lastResult.winnerIds,payments:Object.fromEntries(Object.entries(t.lastResult.payments).map(([k,v])=>[k,clean(v)])),rake:clean(t.lastResult.totalRake||0)}:null,
   events:t.events.slice(0,8)};
 }

 return {makeTable,startHand,act,sit,leave,rebuy,sitOut,away,show,useTimeBank,chat,snapshot,tickTable,cashOutSeat,buyinLimits,inspect};
}
