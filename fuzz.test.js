// Randomised whole-game audit (deterministic seed) of the real engine: thousands of hands with random
// players, stacks, bet sizes (legal and illegal), folds, leaves, sit-outs and rebuys.
import test from 'node:test';import assert from 'node:assert/strict';
import {createEngine,LIVE,maxRaiseTo,toCall,canRaise,actionable,inHand} from './game.js';
import {evaluateHand,compare} from './poker.js';
let seed=20261021;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const problems=[],kinds={};const fail=(m,ctx)=>{kinds[m]=(kinds[m]||0)+1;if(problems.length<25)problems.push(m+(ctx?' :: '+ctx:''));};
const stats={hands:0,actions:0,showdowns:0,sidePots:0,splits:0,allInRunouts:0,illegalRejected:0,omaha:0,holdem:0,rake:0,headsUp:0,maxPlayers:0};

// Independent reference: split each contribution level among the best live hands.
function reference(players,board,game){
 const levels=[...new Set(players.filter(p=>p.committed>0).map(p=>p.committed))].sort((a,b)=>a-b);let prev=0;const pay={};
 for(const L of levels){const contrib=players.filter(p=>p.committed>=L);let amount=(L-prev)*contrib.length;prev=L;
  let cand=contrib.filter(p=>!p.folded);if(!cand.length)cand=players.filter(p=>!p.folded);
  let best=null,win=[];if(cand.length===1)win=cand;else for(const p of cand){const v=evaluateHand(game,p.cards,board),c=best?compare(v,best):1;if(c>0){best=v;win=[p];}else if(c===0)win.push(p);}
  win.sort((a,b)=>a.position-b.position);const each=Math.floor(amount/win.length),extra=amount%win.length;win.forEach((w,i)=>pay[w.id]=(pay[w.id]||0)+each+(i<extra?1:0));}
 return pay;}

test('random whole games (Hold\'em and Omaha): money, turns, limits, rake and payouts stay correct',()=>{
for(let table=0;table<80;table++){
 const game=rnd()<.5?'omaha':'holdem';stats[game]++;
 const rake=pick([0,0,5,3.5,10]);
 const db={users:[{id:'c',username:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:rake,tables:[]};
 const e=createEngine({db}),sb=pick([1,5,10,25,50,100]),bb=sb*2,t=e.makeTable('1','F',sb,bb,game);
 const n=2+Math.floor(rnd()*5);const lim=e.buyinLimits(t);
 for(let i=0;i<6;i++){const u={id:'u'+i,username:'u'+i,role:'USER',balance:lim.max*3};db.users.push(u);}
 const seats=[0,1,2,3,4,5].sort(()=>rnd()-.5).slice(0,n);
 for(const i of seats){const u=db.users.find(x=>x.id==='u'+i);const amt=lim.min+Math.floor(rnd()*(lim.max-lim.min)/100)*100;e.sit(t,u,i,amt/100,[t]);}
 const grand=()=>db.users.reduce((s,u)=>s+u.balance,0)+t.seats.reduce((s,x)=>s+(x?x.stack:0),0)+(LIVE.includes(t.phase)?t.pot:0);
 const start=grand();
 for(let h=0;h<30;h++){
  for(const s of t.seats)if(s){s.lastSeen=Date.now();if(s.rebuyDeadline){const u=db.users.find(x=>x.id===s.userId);try{e.rebuy(t,u,(lim.min)/100);}catch{}} if(s.sittingOut&&rnd()<.7){try{e.sitOut(t,db.users.find(x=>x.id===s.userId),false);}catch{}}}
  for(let i=0;i<6;i++)if(!t.seats[i]&&rnd()<.15){const u=db.users.find(x=>x.id==='u'+i);if(!t.seats.some(s=>s?.userId===u.id)&&u.balance>=lim.min)try{e.sit(t,u,i,lim.min/100,[t]);}catch{}}
  if(!e.startHand(t))break;stats.hands++;
  const dealt=t.seats.filter(s=>s?.inHand).length;stats.maxPlayers=Math.max(stats.maxPlayers,dealt);if(dealt===2)stats.headsUp++;
  const hole=game==='omaha'?4:2;
  for(const s of t.seats)if(s?.inHand&&s.cards.length!==hole)fail('wrong hole card count',game+' '+s.cards.length);
  const all=[...t.seats.flatMap(s=>s?.cards||[]),...t.board,...t.deck];if(new Set(all).size!==52||all.length!==52)fail('deck integrity',all.length+'/'+new Set(all).size);
  // blinds
  if(t.seats[t.sbPos]?.lastAction?.type!=='SB'||t.seats[t.bbPos]?.lastAction?.type!=='BB')fail('blinds not posted');
  let guard=0,snapPlayers=null,left=false;
  while(LIVE.includes(t.phase)){
   if(++guard>400){fail('hand did not terminate');break;}
   if(t.runout){stats.allInRunouts+=t.board.length===0?0:0;snapPlayers=t.seats.map(s=>s&&{...s,cards:[...s.cards]});e.tickTable(t,t.runout.at+1);continue;}
   if(t.turn<0){fail('live hand without a player to act',t.phase);break;}
   const s=t.seats[t.turn];if(!actionable(s))fail('turn on a player who cannot act');
   const owe=toCall(t,s),max=maxRaiseTo(t,s),r=rnd();
   if(t.pot!==t.seats.reduce((n,x)=>n+(x?x.committed:0),0)+0&&false)fail('pot mismatch');
   const committed=t.seats.reduce((n,x)=>n+(x?.inHand||x?.committed?x.committed:0),0);if(committed!==t.pot)fail('pot != sum of contributions',t.pot+' vs '+committed);
   // occasionally try something illegal; it must be rejected without changing anything
   if(r<.06){const before=JSON.stringify([t.pot,t.currentBet,t.turn]);const bad=pick([max+1,t.currentBet,-5,s.roundBet+s.stack+100]);try{e.act(t,s.userId,'raise',bad/100);fail('illegal raise accepted',game+' bad='+bad+' max='+max+' cur='+t.currentBet);}catch{stats.illegalRejected++;if(JSON.stringify([t.pot,t.currentBet,t.turn])!==before)fail('rejected action changed state');}continue;}
   if(r<.08){const other=t.seats.find(x=>x&&x!==s);if(other){try{e.act(t,other.userId,'check');fail('out-of-turn action accepted');}catch{stats.illegalRejected++;}}continue;}
   if(r<.09&&s){const u=db.users.find(x=>x.id===s.userId);left=true;e.leave(t,u);stats.actions++;continue;}
   let type,amt;
   if(r<.25)type='fold';else if(r<.62)type=owe?'call':'check';
   else if(canRaise(t,s)){type='raise';const min=Math.min(t.currentBet+t.minRaise,s.roundBet+s.stack),q=rnd();amt=q<.3?min:q<.55?max:Math.min(max,Math.max(min,Math.round(min+(max-min)*rnd())));if(amt<min)amt=min;}
   else type=owe?'call':'check';
   snapPlayers=t.seats.map(x=>x&&{...x,cards:[...x.cards]});
   const potBefore=t.pot;
   try{e.act(t,s.userId,type,amt!=null?amt/100:undefined);stats.actions++;}catch(err){fail('legal action rejected',type+' '+amt+' max='+max+' min='+(t.currentBet+t.minRaise)+' stack='+(s.roundBet+s.stack)+' '+err.message);break;}
   if(type==='raise'&&game==='omaha'){const inc=t.pot-potBefore;}
  }
  if(t.phase==='finished'){
   const res=t.lastResult;const paid=Object.values(res.payments).reduce((a,b)=>a+b,0);
   if(t.board.length<3&&res.totalRake)fail('rake taken without a flop');{const contested=res.pots.filter(p=>!p.refunded).reduce((a,p)=>a+p.amount+(p.rake||0),0);const want=t.board.length>=3?Math.floor(contested*rake/100+1e-9):0;if(Math.abs(want-res.totalRake)>0)fail('rake amount',res.totalRake+' vs '+want);}if(paid+res.totalRake!==t.pot)fail('payout + rake != pot',paid+'+'+res.totalRake+' vs '+t.pot);
   stats.rake+=res.totalRake;if(res.showdown)stats.showdowns++;if(res.pots.filter(p=>!p.refunded).length>1)stats.sidePots++;if(res.pots.some(p=>p.winners.length>1&&!p.refunded))stats.splits++;
   if(rake===0&&res.showdown&&!left){const players=t.seats.flatMap((x,i)=>x?.inHand?[{id:x.id,cards:x.cards,folded:x.folded,committed:x.committed,position:(i-t.button+5)%6}]:[]);
    const ref=reference(players,t.board,game);for(const id of new Set([...Object.keys(ref),...Object.keys(res.payments)]))if(Math.abs((ref[id]||0)-(res.payments[id]||0))>1)fail('payout differs from reference',game+' '+id+' engine='+(res.payments[id]||0)+' ref='+(ref[id]||0)+' board='+t.board.join(''));}
   if(res.showdown&&t.board.length!==5)fail('showdown without full board');
   for(const id of res.winnerIds||[]){const w=res.winningHands?.[id];if(w&&game==='omaha'){const s=t.seats.find(x=>x?.id===id)||snapPlayers?.find(x=>x?.id===id);const own=w.cards.filter(c=>(s?.cards||[]).includes(c)).length;if(s&&own!==2)fail('omaha winning hand does not use exactly two hole cards',w.cards.join(' '));}}
  }
  for(const s of t.seats)if(s&&s.stack<0)fail('negative stack');
  if(grand()!==start)fail('money not conserved',game+' diff '+(grand()-start)+' hand '+t.hand);
  // the next hand needs time to pass
  t.lastActionAt=0;for(const s of t.seats)if(s){s.lastSeen=Date.now();}
 }
}
assert.deepEqual(problems,[]);
assert.ok(stats.hands>1000&&stats.showdowns>500&&stats.sidePots>100&&stats.illegalRejected>500,JSON.stringify(stats));
});
