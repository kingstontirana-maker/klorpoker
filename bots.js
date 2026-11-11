import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {LIVE,canRaise,toCall,maxRaiseTo,fail} from './game.js';
import {decide,handStrength,rangeEquity,preflopRank,STYLES} from './bot-brain.js';
import {evaluateHand,compare} from './poker.js';
import {returnBudget,returnDecision} from './bot-returns.js';
export {handStrength,rangeEquity,preflopRank,STYLES};

// Virtual-credit house bots use the actual runout to play passively.
// Wallet, stake and house loss limits still apply.

// Bots carry ordinary names; only CENB sees which players are bots.
const OLD_SUFFIX=' [BOT]';

// Server-only view: public information plus the actual runout outcome flag.
export function botView(t,s,profileOf=()=>null){
 const idx=t.seats.indexOf(s),size=t.seats.length;
 const acts=(t.record?.actions||[]).map(a=>({street:a.street,seat:a.seat-1,type:a.type,amount:a.amount,to:a.to}));
 const dealt=[];for(let i=1;i<=size;i++){const p=(t.button+i)%size;if(t.seats[p]?.inHand)dealt.push(p);}
 const after=dealt.slice(dealt.indexOf(idx)+1).filter(p=>!t.seats[p].folded&&!t.seats[p].allIn);
 const start=dealt.indexOf(t.bbPos),pre=start<0?dealt:[...dealt.slice(start+1),...dealt.slice(0,start+1)];
 const behind=pre.slice(pre.indexOf(idx)+1).filter(p=>!t.seats[p].folded&&!t.seats[p].allIn).length;
 return {outcome:handOutcome(t,s),game:t.game||'holdem',phase:t.phase,cards:[...s.cards],board:[...t.board],pot:t.pot,currentBet:t.currentBet,toCall:toCall(t,s),
  minRaiseTo:t.currentBet+t.minRaise,maxRaiseTo:maxRaiseTo(t,s),stack:s.stack,roundBet:s.roundBet,committed:s.committed,bb:t.bb,canRaise:canRaise(t,s),
  dealt:dealt.length,isSB:idx===t.sbPos,isBB:idx===t.bbPos,playersBehind:behind,inPosition:after.length===0,
  raisesPreflop:acts.filter(a=>a.street==='preflop'&&(a.type==='BET'||a.type==='RAISE')).length,
  opponents:dealt.filter(p=>p!==idx).map(p=>{const o=t.seats[p];return {id:o.userId,folded:o.folded,allIn:o.allIn,stack:o.stack,roundBet:o.roundBet,committed:o.committed,actions:acts.filter(a=>a.seat===p),profile:profileOf(o.userId)};})};
}
// Read a copy with the engine's burn/pop order; never alter the actual deal.
export function handOutcome(t,s){
 try{
  const board=[...t.board],deck=[...t.deck];
  while(board.length<5){deck.pop();const count=board.length===0?3:1;for(let i=0;i<count;i++){const c=deck.pop();if(!c)return 'unknown';board.push(c);}}
  const score=evaluateHand(t.game||'holdem',s.cards,board);let tied=false;
  for(const o of t.seats){if(!o||o===s||!o.inHand||o.folded)continue;
   const c=compare(evaluateHand(t.game||'holdem',o.cards,board),score);if(c>0)return 'loss';if(c===0)tied=true;}
  return tied?'tie':'win';
 }catch{return 'unknown';}
}
export const botDecision=(v,style='medium',random=Math.random)=>decide(v,style,random);

// Decisions on a separate thread (bot-worker.js). If the thread fails, it is started again;
// a decision that does not come back in time becomes a check or a fold.
export function workerDecider(){
 let worker=null,next=0;const waiting=new Map();
 const start=()=>{worker=new Worker(new URL('./bot-worker.js',import.meta.url));
  worker.on('message',({id,decision})=>{const w=waiting.get(id);if(w){waiting.delete(id);w.resolve(decision);}if(!waiting.size)worker?.unref();});
  worker.on('error',err=>{console.error('[Suprem Poker] bot thread',err.message);});
  worker.on('exit',()=>{worker=null;for(const w of waiting.values())w.reject(Error('bot thread stopped'));waiting.clear();});
  // The thread keeps the process running only while a decision is being made.
  worker.unref();};
 return (view,style)=>new Promise((resolve,reject)=>{if(!worker)start();const id=++next;waiting.set(id,{resolve,reject});worker.ref();worker.postMessage({id,view,style});});
}

// Usernames for bots made in bulk: ordinary-looking, never a real player's name.
const FIRST=['marco','luka','andi','elira','nikos','jonas','pablo','sven','dario','ilir','arben','klea','besi','tomas','milan','stefan','leon','ardit','genti','erion','enea','joni','flori','teo','rino','vali','alex','maks','niko','sara','dea','lori','tani','reni','kevin','paolo','hugo','ines','olga','emil'];
const TAIL=['','_ace','_pro','_77','_river','_k','_aa','_win','_tilt','_nuts','_q','_88','_bet'];

export function createBots({db,runtime,engine,save,olderRake,random=Math.random,decider=null}){
 for(const u of db.users)if(u.isBot&&u.username.endsWith(OLD_SUFFIX)){const plain=u.username.slice(0,-OLD_SUFFIX.length);if(!db.users.some(x=>x!==u&&x.username.toLowerCase()===plain.toLowerCase()))u.username=plain;}
 const bots=()=>db.users.filter(u=>u.isBot),center=()=>db.users.find(x=>x.role==='CENTER');
 const seatOf=u=>{for(const t of runtime.values()){const s=t.seats.find(x=>x?.userId===u.id);if(s)return {t,s};}return null;};
 const equity=u=>{const at=seatOf(u);return u.balance+(at?at.s.stack+(LIVE.includes(at.t.phase)&&at.s.inHand?at.s.committed:0):0);};
 const audit=(type,u,amount=0,extra={})=>db.ledger.push({id:crypto.randomUUID(),type,from:center()?.id,to:u.id,amount,...extra,time:Date.now()});
 const isBotId=id=>!!db.users.find(u=>u.id===id)?.isBot;
 const isHuman=s=>s&&!isBotId(s.userId);
 const cents=(v,label,zero=false)=>{const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<0||(!zero&&n===0))fail(label+(zero?' must be 0 or more':' must be a positive amount'));return n;};

 // ---- House limits ----
 const g=db.botGuard??={};
 if(g.start!==undefined&&g.dayStart===undefined){g.dayStart=g.start;delete g.start;}
 for(const [k,v] of Object.entries({returnPercent:0,dailyLimit:5000,weeklyLimit:0,monthlyLimit:0,maxBB:0,maxPerTable:2,day:'',dayStart:0,week:'',weekStart:0,month:'',monthStart:0}))g[k]??=v;
 const PERIODS=[['day','dailyLimit','daily'],['week','weeklyLimit','weekly'],['month','monthlyLimit','monthly']];
 const tirana=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tirane',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 function keys(now){const day=tirana(now),[y,m,d]=day.split('-').map(Number),wd=(new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7,monday=new Date(Date.UTC(y,m-1,d-wd)).toISOString().slice(0,10);return {day,week:monday,month:day.slice(0,7)};}
 let rakeSeen=0,rakeTotal=0,rakeMap=new Map(),oldCounted=false;
 function botRake(){const ids=new Set(bots().map(u=>u.id)),count=x=>{if(x.type!=='RAKE')return;for(const a of x.allocations||[])if(a.bot||ids.has(a.userId)){rakeTotal+=a.amount;const r=rakeMap.get(a.userId)||{rake:0,hands:0};r.rake+=a.amount;r.hands++;rakeMap.set(a.userId,r);}};if(!oldCounted){oldCounted=true;for(const x of olderRake?.()||[])count(x);}for(;rakeSeen<db.ledger.length;rakeSeen++)count(db.ledger[rakeSeen]);return rakeTotal;}
 // The house result: bot chips plus the rake bots paid, which goes back to the center.
 const houseValue=()=>bots().reduce((n,u)=>n+equity(u),0)+botRake();
 function periods(now=Date.now()){
  const k=keys(now);let value=null,changed=false;
  for(const [p,,name] of PERIODS)if(g[p]!==k[p]){value??=houseValue();g[p]=k[p];g[p+'Start']=value;changed=true;
   for(const b of bots())if(b.bot.error===`House ${name} limit reached`){b.bot.error=null;b.bot.enabled=true;b.bot.baseline=equity(b);}}
  if(changed)save();value??=houseValue();
  return {day:value-g.dayStart,week:value-g.weekStart,month:value-g.monthStart};
 }
 const moveStarts=n=>{for(const [p] of PERIODS)g[p+'Start']+=n;};
 function guardInfo(){const r=periods();return {returnPercent:g.returnPercent,dailyLimit:g.dailyLimit/100,weeklyLimit:g.weeklyLimit/100,monthlyLimit:g.monthlyLimit/100,maxBB:g.maxBB/100,maxPerTable:g.maxPerTable,today:r.day/100,week:r.week/100,month:r.month/100,day:g.day,
  stopped:bots().filter(b=>/^House .* limit reached$/.test(b.bot.error||'')).map(b=>b.bot.error).filter((x,i,a)=>a.indexOf(x)===i)};}

 // ---- What bots learn about real players: only public actions, over many hands ----
 db.botProfiles??={};
 const seenHands=new Map();
 const stat=id=>db.botProfiles[id]??=[0,0,0,0,0,0,0];// hands, vpip, pfr, aggressive, calls, faced a bet, folded to a bet
 function profileOf(id){const p=db.botProfiles[id];if(!p)return null;const [n,vp,pf,ag,ca,fa,fo]=p;return {hands:n,vpip:(vp+.32*8)/(n+8),pfr:(pf+.16*8)/(n+8),af:(ag+1.6)/(ca+1),ftb:(fo+.42*6)/(fa+6)};}
 function observe(t){
  const r=t.record;if(!r||!LIVE.includes(t.phase))return;let o=seenHands.get(t.id);
  if(!o||o.hand!==t.hand){o={hand:t.hand,idx:0,vpip:new Set(),pfr:new Set()};seenHands.set(t.id,o);
   for(const s of t.seats)if(s?.inHand){if(isHuman(s))stat(s.userId)[0]++;else{const b=db.users.find(u=>u.id===s.userId);if(b?.bot)b.bot.hands=(b.bot.hands||0)+1;}}}
  for(;o.idx<r.actions.length;o.idx++){const a=r.actions[o.idx],s=t.seats[a.seat-1];if(!s||!isHuman(s)||/^AUTO/.test(a.type))continue;const p=stat(s.userId);
   if(a.street==='preflop'){if(['CALL','BET','RAISE'].includes(a.type)&&!o.vpip.has(s.userId)){o.vpip.add(s.userId);p[1]++;}if(['BET','RAISE'].includes(a.type)&&!o.pfr.has(s.userId)){o.pfr.add(s.userId);p[2]++;}}
   else{if(['BET','RAISE'].includes(a.type))p[3]++;if(a.type==='CALL')p[4]++;if(['FOLD','CALL','RAISE'].includes(a.type))p[5]++;if(a.type==='FOLD')p[6]++;}}
  const ids=Object.keys(db.botProfiles);if(ids.length>2500)for(const id of ids.sort((a,b)=>db.botProfiles[a][0]-db.botProfiles[b][0]).slice(0,ids.length-2000))delete db.botProfiles[id];
 }
 function playerTypes(){return Object.entries(db.botProfiles).filter(([,p])=>p[0]>=10).sort((a,b)=>b[1][0]-a[1][0]).slice(0,40).map(([id,p])=>{const f=profileOf(id),u=db.users.find(x=>x.id===id);
  const type=(f.vpip<.22?'Tight':f.vpip>.4?'Loose':'Regular')+' · '+(f.af>2.2?'aggressive':f.af<1?'passive':'balanced');
  return {name:u?.username||'(closed)',hands:p[0],vpip:Math.round(f.vpip*100),pfr:Math.round(f.pfr*100),af:Math.round(f.af*10)/10,foldToBet:Math.round(f.ftb*100),type};});}

 // ---- Where a bot sits ----
 const humansAt=t=>t.seats.filter(isHuman).length,botsAt=t=>t.seats.filter(s=>s&&!isHuman(s)).length,freeAt=t=>t.seats.filter(s=>!s).length;
 const crowd=t=>t.seats.length===2?2:Math.ceil(t.seats.length*.67);
 const perTable=t=>Math.max(1,Math.min(g.maxPerTable||2,t.seats.length-1));
 const stakeOk=(t,b)=>!(g.maxBB>0&&t.bb>g.maxBB)&&!(b.bot.tableId==='auto'&&b.bot.maxBB>0&&t.bb>b.bot.maxBB);
 const buyinFor=(b,t)=>{const l=engine.buyinLimits(t);return b.bot.tableId==='auto'?Math.max(l.min,Math.min(l.max,b.bot.buyinBB*t.bb)):Math.min(b.bot.buyin,l.max);};
 const canJoin=(t,b)=>stakeOk(t,b)&&humansAt(t)>=1&&humansAt(t)<crowd(t)&&freeAt(t)>=(t.seats.length===2?1:2)&&botsAt(t)<perTable(t)&&!t.waitlist?.length&&!t.waitOffer&&b.balance>=buyinFor(b,t);
 function pickTable(b){
  // The fullest thin table first: one real player waiting alone gets a game at once.
  const options=[...runtime.values()].filter(t=>canJoin(t,b)).map(t=>({t,score:(humansAt(t)===1?3:humansAt(t)===2?2:1)-botsAt(t)*.5+random()*.4}));
  options.sort((a,b)=>b.score-a.score);return options[0]?.t||null;
 }
 const shouldLeave=(t,b,s)=>!humansAt(t)||t.waitlist?.length||t.waitOffer||(t.seats.length>2&&!freeAt(t))||humansAt(t)>=crowd(t)||botsAt(t)>perTable(t)||!stakeOk(t,b)||s.stack<t.bb||s.rebuyDeadline;

 // ---- Managing bots ----
 function rakeByBot(){botRake();return rakeMap;}
 function list(){const rk=rakeByBot();return bots().map(u=>{const at=seatOf(u),eq=equity(u),r=rk.get(u.id)||{rake:0,hands:0},auto=u.bot.tableId==='auto',fixed=auto?null:runtime.get(u.bot.tableId);
  return {id:u.id,name:u.username,risk:u.bot.risk,style:STYLES[u.bot.risk]?.label||u.bot.risk,mode:u.bot.mode||'play',enabled:u.bot.enabled,tableId:u.bot.tableId,tableName:auto?'Auto':fixed?.name||'—',
   buyin:(u.bot.buyin||0)/100,buyinBB:u.bot.buyinBB||null,maxBB:(u.bot.maxBB||0)/100,stopLoss:u.bot.stopLoss/100,stopWin:(u.bot.stopWin||0)/100,balance:u.balance/100,equity:eq/100,
   session:(eq-u.bot.baseline)/100,total:(eq-u.bot.funded)/100,returned:(u.bot.returned||0)/100,returnAvailable:returnBudget(u.bot,eq,g.returnPercent)/100,rakePaid:r.rake/100,house:(eq-u.bot.funded+r.rake)/100,hands:u.bot.hands||0,
   status:u.bot.error||(at?'Playing at '+at.t.name:u.bot.enabled?(auto?'Looking for a table':'Waiting for players'):'Stopped'),seatedAt:at?.t.name||null};});}
 function configure(b,body){
  const risk=body.risk??b.bot.risk??'medium';if(!STYLES[risk])fail('Invalid style');
  const mode=body.mode??b.bot.mode??'play';if(!['play','seat'].includes(mode))fail('Invalid mode');
  const stopLoss=cents(body.stopLoss??(b.bot.stopLoss??b.balance)/100,'Loss limit'),stopWin=cents(body.stopWin??(b.bot.stopWin||0)/100,'Win limit',true);
  if(String(body.tableId??b.bot.tableId)==='auto'){
   const bbs=Math.round(Number(body.buyinBB??b.bot.buyinBB??100));if(!(bbs>=10&&bbs<=100))fail('Auto buy-in must be 10–100 big blinds');
   const maxBB=cents(body.maxBB??(b.bot.maxBB||0)/100,'Highest big blind',true);
   Object.assign(b.bot,{tableId:'auto',buyinBB:bbs,maxBB,buyin:0});
  }else{
   const t=runtime.get(String(body.tableId??b.bot.tableId??''));if(!t)fail('Choose a valid table');const l=engine.buyinLimits(t);
   const buyin=body.buyin===undefined||body.buyin===''?Math.min(b.balance,l.max):cents(body.buyin,'Buy-in');
   if(buyin<l.min||buyin>l.max)fail(`Buy-in must be within the table limits (€${(l.min/100).toFixed(2)}–€${(l.max/100).toFixed(2)})`);if(buyin>b.balance)fail('Buy-in is larger than the bot wallet');
   Object.assign(b.bot,{tableId:t.id,buyin,buyinBB:null,maxBB:0});
  }
  Object.assign(b.bot,{risk,mode,stopLoss,stopWin,error:null});
 }
 function create(u,name,amount,body){
  if(!/^[a-zA-Z0-9_]{3,18}$/.test(name))fail('Name: 3–18 letters, numbers or _');if(db.users.some(x=>x.username.toLowerCase()===name.toLowerCase()))fail('This name is already taken');if(bots().length>=100)fail('Maximum 100 bots');
  if(amount>u.balance)fail('The center does not have enough credit for this budget');
  const b={id:crypto.randomUUID(),username:name,role:'USER',isBot:true,parentId:u.id,balance:amount,createdAt:Date.now(),bot:{enabled:false,funded:amount,baseline:amount,hands:0}};
  periods();configure(b,body);u.balance-=amount;db.users.push(b);moveStarts(amount);audit('BOT_FUND',b,amount);return b;
 }
 function freshName(){for(let i=0;i<200;i++){const n=FIRST[Math.floor(random()*FIRST.length)],t=TAIL[Math.floor(random()*TAIL.length)],name=(random()<.5?n[0].toUpperCase()+n.slice(1):n)+t+(t&&random()<.6?'':Math.floor(10+random()*89));if(name.length<=18&&!db.users.some(x=>x.username.toLowerCase()===name.toLowerCase()))return name;}fail('Could not find a free name');}
 const stop=(b,reason,at)=>{b.bot.enabled=false;b.bot.error=reason||null;if(at)try{engine.leave(at.t,b);}catch{}save();};
 function route(p,body,u){if(!p.startsWith('/api/bots'))return undefined;if(u?.role!=='CENTER')fail('Only the center can manage bots',403);
  if(p==='/api/bots')return list();
  if(p==='/api/bots/guard')return guardInfo();
  if(p==='/api/bots/overview'){const tables=[...runtime.values()].filter(t=>t.seats.some(Boolean)).map(t=>({id:t.id,name:t.name,bb:t.bb/100,sb:t.sb/100,size:t.seats.length,humans:humansAt(t),bots:botsAt(t),waiting:t.waitlist?.length||0,live:LIVE.includes(t.phase)})).sort((a,b)=>b.humans-a.humans);
   return {bots:list(),guard:guardInfo(),tables,players:playerTypes(),decisions:decisions.slice(-60).reverse(),styles:Object.fromEntries(Object.entries(STYLES).map(([k,v])=>[k,v.label])),
    catalog:[...runtime.values()].map(t=>({id:t.id,name:t.name,bb:t.bb/100,sb:t.sb/100,size:t.seats.length,min:engine.buyinLimits(t).min/100,max:engine.buyinLimits(t).max/100}))};}
  if(p==='/api/bots/settings'){
   if(body.returnPercent!==undefined){const n=Number(body.returnPercent);if(!Number.isFinite(n)||n<0||n>100)fail('Return percentage must be 0–100');}
   const next={};for(const [k,label] of [['dailyLimit','The daily limit'],['weeklyLimit','The weekly limit'],['monthlyLimit','The monthly limit'],['maxBB','The highest big blind']])if(body[k]!==undefined&&body[k]!==''){const n=Math.round(Number(body[k])*100);if(!Number.isSafeInteger(n)||n<0)fail(label+' must be 0 or more');next[k]=n;}
   if(body.maxPerTable!==undefined&&body.maxPerTable!==''){const n=Number(body.maxPerTable);if(!Number.isInteger(n)||n<1||n>4)fail('Bots per table: 1–4');next.maxPerTable=n;}
   if(body.returnPercent!==undefined)next.returnPercent=Number(body.returnPercent);
   Object.assign(g,next);save();return guardInfo();}
  if(p==='/api/bots/create'){const b=create(u,String(body.name||'').trim(),cents(body.budget,'Budget'),body);save();return {ok:true,id:b.id};}
  if(p==='/api/bots/bulk'){const n=Number(body.count);if(!Number.isInteger(n)||n<1||n>20)fail('Make 1–20 bots at a time');const each=cents(body.budget,'Budget');if(each*n>u.balance)fail('The center does not have enough credit for this budget');
   if(bots().length+n>100)fail('Maximum 100 bots');const made=[];for(let i=0;i<n;i++)made.push(create(u,freshName(),each,{...body,risk:body.risk==='mix'?['low','medium','high'][i%3]:body.risk}).id);save();return {ok:true,ids:made};}
  if(p==='/api/bots/stopall'){let n=0;for(const b of bots())if(b.bot.enabled||seatOf(b)){stop(b,null,seatOf(b));audit('BOT_MANAGE',b,0,{enabled:false});n++;}save();return {ok:true,stopped:n};}
  if(p==='/api/bots/startall'){let n=0;for(const b of bots())if(!b.bot.enabled&&!/^House /.test(b.bot.error||'')&&b.balance+(seatOf(b)?.s.stack||0)>0){b.bot.enabled=true;b.bot.error=null;b.bot.baseline=equity(b);audit('BOT_MANAGE',b,0,{enabled:true});n++;}save();return {ok:true,started:n};}
  const b=bots().find(x=>x.id===body.id);if(!b)fail('Bot not found',404);
  if(p==='/api/bots/configure'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table before changing it');configure(b,body);audit('BOT_MANAGE',b);}
  else if(p==='/api/bots/status'){if(typeof body.enabled!=='boolean')fail('Invalid status');
   if(body.enabled){if(/^House /.test(b.bot.error||''))fail('The house limit is reached: raise it or wait for the next period');if(b.bot.tableId!=='auto'&&b.balance<b.bot.buyin&&!seatOf(b))fail('The bot wallet is smaller than its buy-in');b.bot.baseline=equity(b);}
   b.bot.enabled=body.enabled;b.bot.error=null;if(!body.enabled){const at=seatOf(b);if(at)engine.leave(at.t,b);}audit('BOT_MANAGE',b,0,{enabled:body.enabled});}
  else if(p==='/api/bots/topup'){if(seatOf(b))fail('Let the bot leave the table first');const n=cents(body.amount,'Amount');if(n>u.balance)fail('The center does not have enough credit');periods();u.balance-=n;b.balance+=n;b.bot.funded+=n;b.bot.baseline+=n;moveStarts(n);audit('BOT_FUND',b,n);}
  else if(p==='/api/bots/delete'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table first');periods();const left=b.balance+(rakeMap.get(b.id)?.rake||0);u.balance+=b.balance;audit('BOT_REFUND',b,b.balance);db.users.splice(db.users.indexOf(b),1);moveStarts(-left);rakeTotal-=rakeMap.get(b.id)?.rake||0;rakeMap.delete(b.id);}
  else fail('Not found',404);
  save();return {ok:true};}

 // ---- Playing ----
 const plans=new WeakMap(),decisions=[];
 function settleReturns(){
  let changed=false;
  for(const b of bots()){
   const h=b.bot.returnHand;if(!h)continue;
   const t=runtime.get(h.tableId);
   if(t&&t.hand===h.hand&&LIVE.includes(t.phase))continue;
   // Cancelled/restarted hands must never count as money returned.
   if(t?.hand===h.hand&&t.lastResult){
    const lost=Math.max(0,h.equity-equity(b));
    const humanWinners=t.lastResult.winnerIds.filter(id=>!isBotId(id));
    // Count only calls lost in pots awarded exclusively to human opponents.
    const humanOnly=t.lastResult.pots.filter(p=>!p.refunded&&p.winners.length&&p.winners.every(id=>!isBotId(id)));
    if(humanWinners.length&&humanOnly.length===t.lastResult.pots.filter(p=>!p.refunded).length){
     // Conservatively exclude the hand's rake from the reported human return.
     const paid=Math.max(0,Math.min(h.paid,lost)-t.lastResult.totalRake);
     b.bot.returned=(b.bot.returned||0)+paid;
     if(paid)audit('BOT_RETURN',b,paid,{tableId:h.tableId,hand:h.hand});
    }
   }
   delete b.bot.returnHand;changed=true;
  }
  if(changed)save();
 }
 const think=(d,v)=>{const big=d.type==='raise'&&d.amount*100>=v.stack+v.roundBet-1||d.type==='call'&&v.toCall>=v.stack*.5;
  return big?3000+random()*4000:d.type==='raise'?1500+random()*3000:d.type==='call'?1200+random()*2300:700+random()*1300;};
 function tick(now=Date.now()){
  settleReturns();
  const r=periods(now);
  for(const [p,limit,name] of PERIODS)if(g[limit]>0&&r[p]<=-g[limit])for(const b of bots())if(b.bot.enabled)stop(b,`House ${name} limit reached`,seatOf(b));
  for(const t of runtime.values())if(t.seats.some(Boolean))observe(t);
  for(const b of bots()){
   let at=seatOf(b);if(at)at.s.lastSeen=now;
   if(!b.bot.enabled)continue;
   try{
    const between=at&&(!LIVE.includes(at.t.phase)||!at.s.inHand),session=equity(b)-b.bot.baseline;
    if(at&&between){
     if(b.bot.stopWin>0&&session>=b.bot.stopWin){stop(b,'Win limit reached',at);continue;}
     if(-session>=b.bot.stopLoss){stop(b,'Loss limit reached',at);continue;}
     if(shouldLeave(at.t,b,at.s)){engine.leave(at.t,b);save();continue;}}
    if(!at){
     if(-session>=b.bot.stopLoss){stop(b,'Loss limit reached');continue;}
     let t;if(b.bot.tableId==='auto')t=pickTable(b);else{t=runtime.get(b.bot.tableId);if(!t){stop(b,'Table removed');continue;}if(!canJoin(t,b)){if(b.balance<buyinFor(b,t))stop(b,'Wallet smaller than the buy-in');continue;}}
     if(!t)continue;
     const free=t.seats.map((s,i)=>s?-1:i).filter(i=>i>=0);
     engine.sit(t,b,free[Math.floor(random()*free.length)],buyinFor(b,t)/100,[...runtime.values()]);
     // Seat only: sits out at once, before any hand can deal it in, so it never pays a blind.
     if(b.bot.mode==='seat')engine.sitOut(t,b,true);save();continue;}
    if(b.bot.mode==='seat'){if(!at.s.sittingOut)engine.sitOut(at.t,b,true);at.s.sitOutSince=now;if(!(LIVE.includes(at.t.phase)&&at.t.seats[at.t.turn]===at.s))continue;}
    const {t,s}=at;
    if(LIVE.includes(t.phase)&&t.seats[t.turn]===s&&!t.runout){
     const key=t.hand+':'+t.phase+':'+t.turnStartedAt;let plan=plans.get(s);
     if(plan?.key!==key){const v=botView(t,s,profileOf);plan={key,v,d:null,at:0};plans.set(s,plan);
      if(decider){const p=plan;decider(v,b.bot.risk).then(d=>{p.d=d;p.at=Math.max(Date.now(),t.turnStartedAt+think(d,v));}).catch(()=>{p.d=v.toCall?{type:'fold'}:{type:'check'};p.at=Date.now();});}
      else{plan.d=botDecision(v,b.bot.risk,random);plan.at=t.turnStartedAt+think(plan.d,v);}}
     // A decision that never came back: check when free, otherwise fold.
     if(!plan.d&&now-t.turnStartedAt>9000){plan.d=plan.v.toCall?{type:'fold'}:{type:'check'};plan.at=now;}
     if(plan.d&&now>=plan.at){plans.delete(s);const {v}=plan;const current=botView(t,s,profileOf),d=botDecision(current,b.bot.risk,random);
      // Only humans may receive a deliberate return; avoid bot-to-bot transfers.
      const humanOnly=current.opponents.filter(o=>!o.folded).every(o=>!isBotId(o.id));
      const returning=d.type==='fold'&&humanOnly&&returnDecision(current,returnBudget(b.bot,equity(b),g.returnPercent),random);
      if(returning)d.type='call';
      const before=equity(b),cost=Math.min(current.toCall,current.stack);
      try{engine.act(t,b.id,d.type,d.amount);
       if(returning){b.bot.returnHand??={tableId:t.id,hand:t.hand,equity:before,paid:0};b.bot.returnHand.paid+=cost;save();}
      }catch{engine.act(t,b.id,toCall(t,s)?'fold':'check');}
      decisions.push({at:now,bot:b.username,table:t.name,hand:t.hand,street:v.phase,action:d.type,amount:d.amount??(d.type==='call'?Math.min(v.toCall,v.stack)/100:null),pot:v.pot/100,equity:d.equity==null?null:Math.round(d.equity*100)});
      if(decisions.length>200)decisions.splice(0,decisions.length-200);}}
   }catch(e){stop(b,e.message,seatOf(b));}
  }
 }
 return {route,tick,list,profileOf};
}
