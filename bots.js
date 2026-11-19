import crypto from 'node:crypto';
import {centerFunds} from './credit.js';
import {Worker} from 'node:worker_threads';
import {LIVE,canRaise,toCall,maxRaiseTo,fail} from './game.js';
import {decide,handStrength,rangeEquity,preflopRank,STYLES} from './bot-brain.js';
import {evaluateHand,compare} from './poker.js';
import {returnBudget,returnDecision} from './bot-returns.js';
import {AVATARS,avatarExists} from './public/avatars.js';
export {handStrength,rangeEquity,preflopRank,STYLES};

// Virtual-credit house bots use the actual runout to follow winning hands and mix in raises.
// Wallet, stake and house loss limits still apply.

// Bots carry ordinary names; only CENB sees which players are bots.
const OLD_SUFFIX=' [BOT]';
const MAX_BOTS=1000;

// Server-only view: public information plus the actual runout outcome flag.
export function botView(t,s,profileOf=()=>null){
 const idx=t.seats.indexOf(s),size=t.seats.length;
 const acts=(t.record?.actions||[]).map(a=>({street:a.street,seat:a.seat-1,type:a.type,amount:a.amount,to:a.to}));
 const dealt=[];for(let i=1;i<=size;i++){const p=(t.button+i)%size;if(t.seats[p]?.inHand)dealt.push(p);}
 const after=dealt.slice(dealt.indexOf(idx)+1).filter(p=>!t.seats[p].folded&&!t.seats[p].allIn);
 const start=dealt.indexOf(t.bbPos),pre=start<0?dealt:[...dealt.slice(start+1),...dealt.slice(0,start+1)];
 const behind=pre.slice(pre.indexOf(idx)+1).filter(p=>!t.seats[p].folded&&!t.seats[p].allIn).length;
 return {outcome:handOutcome(t,s),game:t.game||'holdem',phase:t.phase,firstFlopAction:t.phase==='flop'&&!acts.some(a=>a.street==='flop'&&a.seat===idx),cards:[...s.cards],board:[...t.board],pot:t.pot,currentBet:t.currentBet,toCall:toCall(t,s),
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
export function botClashView(v,isBotId,mode='balanced'){
 const active=v.opponents.filter(o=>!o.folded);
 return {...v,botClash:active.length>0&&active.every(o=>isBotId(o.id))?mode:'off'};
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

export function createBots({db,runtime,engine,save,olderRake,store=null,random=Math.random,decider=null}){
 for(const u of db.users)if(u.isBot&&u.username.endsWith(OLD_SUFFIX)){const plain=u.username.slice(0,-OLD_SUFFIX.length);if(!db.users.some(x=>x!==u&&x.username.toLowerCase()===plain.toLowerCase()))u.username=plain;}
 const bots=()=>db.users.filter(u=>u.isBot),center=()=>db.users.find(x=>x.role==='CENTER');
 // Every bot has a profile picture from the platform's list: the one fewest bots wear, picked at
 // random among those, so the faces at the tables vary. Bots made before this get one now.
 const pickAvatar=()=>{const used=new Map(AVATARS.map(a=>[a.id,0]));for(const b of bots())if(used.has(b.avatar))used.set(b.avatar,used.get(b.avatar)+1);
  const least=Math.min(...used.values()),pool=[...used].filter(([,n])=>n===least).map(([id])=>id);return pool[Math.floor(random()*pool.length)];};
 {let changed=false;for(const b of bots())if(!avatarExists(b.avatar)){b.avatar=pickAvatar();changed=true;}if(changed)save();}
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
 // ---- CENB wallets ----
 // credit: CENB's capital. The centre credits it; every bot is funded from it and returns to it,
 // and what is left over when the bots are re-credited (their winnings) lands here too.
 // rake (db.cenbRake): the rake the bots paid, kept apart as capital for re-crediting the bots.
 // Only moves between the centre and CENB come in or out; everything else stays inside CENB.
 const freshWallet=!db.cenbWallet;const W=db.cenbWallet??={credit:0,profit:0};
 // One wallet: the profit wallet was merged into the credit wallet (profit is read on the Profit page).
 if(W.profit){W.credit+=W.profit;W.profit=0;}
 const need=n=>{if(n>W.credit)fail('Kuleta e kredisë së CENB ka vetëm €'+(W.credit/100).toFixed(2)+'. Kreditoje CENB nga qendra (mungojnë €'+((n-W.credit)/100).toFixed(2)+').');};
 // The house result: everything CENB holds (bot chips and the three wallets); a credit from
 // the centre or a payment to it moves the period starts, so it is never counted as profit.
 const houseValue=()=>bots().reduce((n,u)=>n+equity(u),0)+W.credit+W.profit+(Number(db.cenbRake)||0);
 function periods(now=Date.now()){
  const k=keys(now);let value=null,changed=false;
  for(const [p,,name] of PERIODS)if(g[p]!==k[p]){value??=houseValue();g[p]=k[p];g[p+'Start']=value;changed=true;
   for(const b of bots())if(b.bot.error===`House ${name} limit reached`){b.bot.error=null;b.bot.enabled=true;b.bot.baseline=equity(b);b.bot.rakeBase=rakeOf(b.id);}}
  if(changed)save();value??=houseValue();
  return {day:value-g.dayStart,week:value-g.weekStart,month:value-g.monthStart};
 }
 const moveStarts=n=>{for(const [p] of PERIODS)g[p+'Start']+=n;};
 // The rake a bot pays stays with CENB (rake wallet), so it is not a loss of the bot: session and
 // total results count it back. rakeBase is the bot's rake when its session started.
 const rakeOf=id=>{botRake();return rakeMap.get(id)?.rake||0;};
 // A bot's total result comes from the hands it played (store), not from its wallet: re-credit,
 // collecting credit or adding money move a bot's money without being a win or a loss.
 // Refreshed at most every 10 s. Without a store (tests) the wallet is used.
 const playCache={at:0,map:null};
 const playTotals=()=>{if(!store?.botPlayTotals)return null;if(!playCache.map||Date.now()-playCache.at>10000){playCache.map=new Map(store.botPlayTotals().map(r=>[r.id,Math.round((r.net||0)*100)]));playCache.at=Date.now();}return playCache.map;};
 const sessionOf=b=>{const r=rakeOf(b.id);b.bot.rakeBase??=r;return equity(b)-b.bot.baseline+(r-b.bot.rakeBase);};
 // The first time the wallets exist, the period starts are taken again so the change of
 // formula is not seen as a profit or a loss.
 if(freshWallet){periods();const v=houseValue();for(const [p] of PERIODS)g[p+'Start']=v;delete db.cenbFlow;save();}
 const wallets=()=>({credit:W.credit/100,profit:W.profit/100,rake:(Number(db.cenbRake)||0)/100,inBots:bots().reduce((n,u)=>n+equity(u),0)/100});
 // ---- Profit report ----
 // Profit of CENB from play = what the bots won at the tables (after rake) + the rake they paid
 // (it comes back to CENB). Days are Europe/Tirane days. Bots playing each other cancel out.
 // Midnight of a Europe/Tirane day, in ms (two passes settle summer/winter time).
 const localMs=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tirane',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(t).map(x=>[x.type,x.value]));return Date.UTC(+p.year,p.month-1,+p.day,+p.hour,+p.minute,+p.second);};
 const dayStart=day=>{const g=Date.parse(day+'T00:00:00Z');let t=g-(localMs(g)-g);t-=localMs(t)-g;return t;};
 const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''));
 function profitReport(body={}){
  const today=tirana(Date.now());let from=validDay(body.from)?body.from:today,to=validDay(body.to)?body.to:today;if(from>to)[from,to]=[to,from];
  const since=dayStart(from),until=dayStart(new Date(Date.parse(to+'T12:00:00Z')+86400000).toISOString().slice(0,10));
  const tableId=body.tableId?String(body.tableId):'',botId=body.botId?String(body.botId):'';
  const rows=store?.botResults?store.botResults(since,until):[],rk=store?.botRake?store.botRake(since,until):[];
  const byBot=new Map(),byTable=new Map(),byDay=new Map(),T={hands:0,net:0,rake:0,won:0};
  const tName=id=>runtime.get(String(id))?.name||(db.tables||[]).find(x=>x.id===String(id))?.name||'#'+id;
  const add=(map,key,init,f)=>{const o=map.get(key)||init();map.set(key,o);f(o);};
  for(const r of rows){if(tableId&&String(r.tableId)!==tableId||botId&&r.id!==botId)continue;const net=Math.round(r.net*100),day=tirana(r.hour*3600000);
   T.hands+=r.hands;T.net+=net;T.won+=r.won;
   add(byBot,r.id,()=>({id:r.id,name:db.users.find(u=>u.id===r.id)?.username||r.name,hands:0,net:0,rake:0,won:0}),o=>{o.hands+=r.hands;o.net+=net;o.won+=r.won;});
   add(byTable,String(r.tableId),()=>({id:String(r.tableId),name:tName(r.tableId),hands:0,net:0,rake:0}),o=>{o.hands+=r.hands;o.net+=net;});
   add(byDay,day,()=>({day,hands:0,net:0,rake:0}),o=>{o.hands+=r.hands;o.net+=net;});}
  for(const r of rk){if(tableId&&String(r.tableId)!==tableId)continue;const day=tirana(r.time);
   for(const a of r.allocations){if(botId&&a.userId!==botId)continue;T.rake+=a.amount;
    add(byBot,a.userId,()=>({id:a.userId,name:db.users.find(u=>u.id===a.userId)?.username||'—',hands:0,net:0,rake:0,won:0}),o=>{o.rake+=a.amount;});
    add(byTable,String(r.tableId),()=>({id:String(r.tableId),name:tName(r.tableId),hands:0,net:0,rake:0}),o=>{o.rake+=a.amount;});
    add(byDay,day,()=>({day,hands:0,net:0,rake:0}),o=>{o.rake+=a.amount;});}}
  const out=o=>({...o,net:o.net/100,rake:o.rake/100,profit:(o.net+o.rake)/100});
  const days=[];for(let d=from;d<=to&&days.length<400;d=new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10))days.push(out(byDay.get(d)||{day:d,hands:0,net:0,rake:0}));
  return {from,to,today,tableId,botId,totals:{...out(T),bots:byBot.size,tables:byTable.size,winRate:T.hands?Math.round(T.won/T.hands*1000)/10:0},
   days,bots:[...byBot.values()].map(out).sort((a,b)=>b.profit-a.profit),tables:[...byTable.values()].map(out).sort((a,b)=>b.profit-a.profit),
   wallets:wallets(),choices:{bots:bots().map(b=>({id:b.id,name:b.username})).sort((a,b)=>a.name.localeCompare(b.name)),tables:[...runtime.values()].map(t=>({id:t.id,name:t.name}))}};}
 // ---- One bot (or all of them) in full: result, who gave it money and who took it, every movement ----
 const MOVES=['BOT_FUND','BOT_REFUND','BOT_RETURN','BOT_RESTORE'],CENB_MOVES=['CENB_CREDIT','CENB_RETURN','CENB_RAKE','CENB_RESTORE'];
 function botReport(body={}){
  const P=profitReport(body),botId=P.botId,since=dayStart(P.from),until=dayStart(new Date(Date.parse(P.to+'T12:00:00Z')+86400000).toISOString().slice(0,10));
  const name=id=>db.users.find(u=>u.id===id)?.username;
  // Who gave the bots money and who took it.
  const opp=new Map();let internal={hands:0,moved:0};
  for(const r of store?.botOpponents?store.botOpponents(since,until,botId||''):[]){
   if(!botId&&r.isBot){internal.hands+=r.hands;internal.moved+=Math.round(r.won*100);continue;}// bots against bots: the money stays in CENB
   const o=opp.get(r.id)||opp.set(r.id,{id:r.id,name:name(r.id)||r.name,bot:!!r.isBot,hands:0,won:0,lost:0}).get(r.id);o.hands+=r.hands;o.won+=Math.round(r.won*100);o.lost+=Math.round(r.lost*100);}
  const opponents=[...opp.values()].map(o=>({...o,won:o.won/100,lost:o.lost/100,net:(o.won-o.lost)/100})).sort((a,b)=>Math.abs(b.net)-Math.abs(a.net)||b.hands-a.hands);
  const vsPlayers=opponents.filter(o=>!o.bot).reduce((n,o)=>n+o.net,0);
  // Every movement of credit: funding, taking back, re-crediting, returns to players; and CENB's own.
  const types=botId?MOVES:[...MOVES,...CENB_MOVES],set=new Set(types);
  const rows=[...(store?.ledgerOlder?store.ledgerOlder(types,since):[]),...db.ledger.filter(x=>set.has(x.type)&&x.time>=since)].filter(x=>x.time<until&&(!botId||x.to===botId));
  const sign={BOT_FUND:1,BOT_REFUND:-1,BOT_RETURN:-1,BOT_RESTORE:1,CENB_CREDIT:1,CENB_RETURN:-1,CENB_RAKE:1,CENB_RESTORE:1};
  const moves=rows.sort((a,b)=>b.time-a.time).slice(0,500).map(x=>({time:x.time,type:x.type,bot:x.type.startsWith('BOT_')?name(x.to)||'—':null,amount:(sign[x.type]||1)*(x.amount||0)/100,
   detail:x.type==='BOT_RETURN'?'hand '+(x.hand??'')+(x.tableId?' · '+(runtime.get(String(x.tableId))?.name||''):''):x.type==='BOT_REFUND'&&x.reclaim?'collected':x.type==='CENB_RESTORE'?(x.bots||0)+' bots':''}));
  const sum=t=>rows.filter(x=>x.type===t).reduce((n,x)=>n+(x.amount||0),0)/100;
  const credit={funded:sum('BOT_FUND'),taken:sum('BOT_REFUND'),returned:sum('BOT_RETURN'),restored:rows.filter(x=>x.type==='BOT_RESTORE').reduce((n,x)=>n+(x.amount||0),0)/100};
  // One bot: its hands, with the opponents and what each won or lost.
  let hands=[];if(botId&&store?.botHands)hands=store.botHands(botId,since,until,Number(body.before)||Number.MAX_SAFE_INTEGER,60).map(h=>{const me=(h.players||[]).find(p=>p.userId===botId);
   return {id:h.id,time:h.startedAt,table:h.table,hand:h.hand,cards:me?.cards||[],board:h.board||[],result:Number(me?.result)||0,folded:!!me?.folded,
    opponents:(h.players||[]).filter(p=>p.userId!==botId).map(p=>({name:name(p.userId)||p.username,bot:!!p.bot,result:Number(p.result)||0}))};});
  const bot=botId?list().find(b=>b.id===botId)||null:null;
  return {...P,bot,opponents,vsPlayers:Math.round(vsPlayers*100)/100,internal:{hands:internal.hands,moved:internal.moved/100},credit,moves,hands};}
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
 const aloneDeadlines=new WeakMap(),leftAlone=new WeakSet();
 const crowd=t=>t.seats.length===2?2:Math.ceil(t.seats.length*.67);
 const fillPolicy=t=>db.botFill?.tables?.[t.id];
 const perTable=t=>fillPolicy(t)?Math.max(0,t.seats.length-fillPolicy(t).emptySeats-humansAt(t)):Math.max(1,Math.min(g.maxPerTable||2,t.seats.length===2?2:t.seats.length-1));
 const stakeOk=(t,b)=>!(g.maxBB>0&&t.bb>g.maxBB)&&!(b.bot.tableId==='auto'&&b.bot.maxBB>0&&t.bb>b.bot.maxBB);
 const buyinFor=(b,t)=>{const l=engine.buyinLimits(t);return b.bot.tableId==='auto'?Math.max(l.min,Math.min(l.max,b.bot.buyinBB*t.bb)):Math.min(b.bot.buyin,l.max);};
 const canJoin=(t,b)=>(!leftAlone.has(b)||t.seats.some(Boolean))&&stakeOk(t,b)&&(fillPolicy(t)?freeAt(t)>fillPolicy(t).emptySeats:(humansAt(t)>=1||b.bot.waitForPlayers)&&humansAt(t)<crowd(t)&&freeAt(t)>=(t.seats.length===2?1:2))&&botsAt(t)<perTable(t)&&!t.waitlist?.length&&!t.waitOffer&&b.balance>=buyinFor(b,t);
 function pickTable(b){
  // The fullest thin table first: one real player waiting alone gets a game at once.
  const options=[...runtime.values()].filter(t=>canJoin(t,b)).map(t=>({t,score:(humansAt(t)===1?3:humansAt(t)===2?2:1)-botsAt(t)*.5+random()*.4}));
  options.sort((a,b)=>b.score-a.score);return options[0]?.t||null;
 }
 // A bot seated by hand on a chosen seat (b.bot.pinned) keeps it: it gives it up only to a player
// on the waiting list, when it is broke, or while it must rebuy.
const shouldLeave=(t,b,s)=>b.bot.pinned===t.id?!!(t.waitlist?.length||t.waitOffer||s.stack<t.bb||s.rebuyDeadline):t.waitlist?.length||t.waitOffer||(fillPolicy(t)?botsAt(t)>perTable(t):(!humansAt(t)&&!b.bot.waitForPlayers)||(t.seats.length>2&&!freeAt(t))||humansAt(t)>=crowd(t)||botsAt(t)>perTable(t))||!stakeOk(t,b)||s.stack<t.bb||s.rebuyDeadline;

 // ---- Managing bots ----
 function rakeByBot(){botRake();return rakeMap;}
 function list(){const rk=rakeByBot(),played=playTotals();return bots().map(u=>{const at=seatOf(u),eq=equity(u),r=rk.get(u.id)||{rake:0,hands:0},auto=u.bot.tableId==='auto',fixed=auto?null:runtime.get(u.bot.tableId);
  return {id:u.id,name:u.username,risk:u.bot.risk,botClash:u.bot.botClash||'balanced',style:STYLES[u.bot.risk]?.label||u.bot.risk,mode:u.bot.mode||'play',waitForPlayers:!!u.bot.waitForPlayers,enabled:u.bot.enabled,tableId:u.bot.tableId,tableName:auto?'Auto':fixed?.name||'—',
   buyin:(u.bot.buyin||0)/100,buyinBB:u.bot.buyinBB||null,maxBB:(u.bot.maxBB||0)/100,stopLoss:u.bot.stopLoss/100,stopWin:(u.bot.stopWin||0)/100,balance:u.balance/100,equity:eq/100,
   session:sessionOf(u)/100,total:(played?(played.get(u.id)||0):eq-u.bot.funded)/100+r.rake/100,net:(played?(played.get(u.id)||0):eq-u.bot.funded)/100,returned:(u.bot.returned||0)/100,returnAvailable:returnBudget(u.bot,eq,g.returnPercent)/100,rakePaid:r.rake/100,house:((played?(played.get(u.id)||0):eq-u.bot.funded)+r.rake)/100,hands:u.bot.hands||0,
   status:u.bot.error||(at?'Playing at '+at.t.name:u.bot.enabled?(auto?'Looking for a table':'Waiting for players'):'Stopped'),seatedAt:at?.t.name||null,seatedId:at?.t.id||null};});}
 function configure(b,body){
  if(body.tableId!==undefined&&String(body.tableId)!==b.bot.pinned)delete b.bot.pinned;
  const risk=body.risk??b.bot.risk??'medium';if(!STYLES[risk])fail('Invalid style');
  const botClash=body.botClash??b.bot.botClash??'balanced';if(!['off','balanced','aggressive'].includes(botClash))fail('Invalid bot clash mode');
  const mode=body.mode??b.bot.mode??'play';if(!['play','seat'].includes(mode))fail('Invalid mode');
  const wait=body.waitForPlayers??b.bot.waitForPlayers??false;
  if(![true,false,'true','false'].includes(wait))fail('Invalid waiting option');
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
  Object.assign(b.bot,{risk,mode,botClash,waitForPlayers:wait===true||wait==='true',stopLoss,stopWin,error:null});
 }
 function create(u,name,amount,body,batch=false){
  if(!/^[a-zA-Z0-9_]{3,18}$/.test(name))fail('Name: 3–18 letters, numbers or _');if(db.users.some(x=>x.username.toLowerCase()===name.toLowerCase()))fail('This name is already taken');if(bots().length>=MAX_BOTS)fail('Maximum '+MAX_BOTS+' bots');
  need(amount);
  const b={id:crypto.randomUUID(),username:name,role:'USER',isBot:true,parentId:u.id,balance:amount,avatar:pickAvatar(),createdAt:Date.now(),bot:{enabled:false,funded:amount,baseline:amount,hands:0}};
  if(!batch)periods();configure(b,body);W.credit-=amount;db.users.push(b);audit('BOT_FUND',b,amount,{from:'cenb'});return b;
 }
 function freshName(){if(db.botNames?.length){const name=db.botNames.find(n=>!db.users.some(x=>x.username.toLowerCase()===n.toLowerCase()));if(!name)fail('Nuk ka më emra të lirë në listë');return name;}for(let i=0;i<200;i++){const n=FIRST[Math.floor(random()*FIRST.length)],t=TAIL[Math.floor(random()*TAIL.length)],name=(random()<.5?n[0].toUpperCase()+n.slice(1):n)+t+(t&&random()<.6?'':Math.floor(10+random()*89));if(name.length<=18&&!db.users.some(x=>x.username.toLowerCase()===name.toLowerCase()))return name;}fail('Could not find a free name');}
 const fillDefaults={emptySeats:1,buyinMinPercent:35,buyinMaxPercent:90,budgetPercent:200,stopLossPercent:100,stopWinPercent:0,risk:'mix',mode:'play'};
 const fillInfo=()=>({settings:{...fillDefaults,...db.botFill?.settings},names:db.botNames||[],tables:db.botFill?.tables||{}});
 function fillTables(body,u){
  const c={...fillDefaults,...db.botFill?.settings,...body};
  for(const [key,min,max] of [['emptySeats',0,9],['buyinMinPercent',10,100],['buyinMaxPercent',10,100],['budgetPercent',100,1000],['stopLossPercent',1,1000],['stopWinPercent',0,1000]]){
   c[key]=Number(c[key]);if(!Number.isFinite(c[key])||c[key]<min||c[key]>max||(key==='emptySeats'&&!Number.isInteger(c[key])))fail('Vlerë e pavlefshme: '+key);
  }
  if(c.buyinMinPercent>c.buyinMaxPercent)fail('Përqindja minimale nuk mund të jetë mbi maksimalen');
  if(!['mix',...Object.keys(STYLES)].includes(c.risk)||!['play','seat'].includes(c.mode))fail('Konfigurim i pavlefshëm');
  const tables=c.tableId==='all'?[...runtime.values()]:[runtime.get(String(c.tableId))];
  if(!tables.length||tables.some(t=>!t))fail('Zgjidh një tavolinë të vlefshme');
  const result=periods();for(const [p,limit] of PERIODS)if(g[limit]>0&&result[p]<=-g[limit])fail('Limiti i shtëpisë është arritur');
  const pool=(db.botNames||[]).map(name=>({name,b:db.users.find(x=>x.username.toLowerCase()===name.toLowerCase())})).filter(x=>!x.b||x.b.isBot&&!x.b.bot.enabled&&!seatOf(x.b));
  const jobs=[],reports=[];let funding=0,newBots=0;
  for(const t of tables){
   const emptySeats=Math.min(c.emptySeats,t.seats.length),needed=Math.max(0,freeAt(t)-emptySeats);
   const skipped=t.waitlist?.length||t.waitOffer?'Ka lojtarë në pritje':g.maxBB>0&&t.bb>g.maxBB?'Mbi limitin e blind-it':null;
   const report={id:t.id,name:t.name,emptySeats,added:0,excess:Math.max(0,botsAt(t)-Math.max(0,t.seats.length-emptySeats-humansAt(t))),skipped};reports.push(report);
   if(skipped)continue;
   const limits=engine.buyinLimits(t),min=Math.max(limits.min,Math.ceil(limits.max*c.buyinMinPercent/100)),max=Math.min(limits.max,Math.floor(limits.max*c.buyinMaxPercent/100));
   for(let i=0;i<needed;i++){
    const person=pool.shift();if(!person)fail('Shto emra në listë: nuk ka mjaft emra të lirë për mbushjen');
    const buyin=min+Math.floor(random()*(max-min+1)),budget=Math.max(buyin,Math.round(buyin*c.budgetPercent/100));
    const config={tableId:t.id,buyin:buyin/100,stopLoss:Math.max(1,Math.round(buyin*c.stopLossPercent/100))/100,stopWin:Math.round(buyin*c.stopWinPercent/100)/100,waitForPlayers:true,mode:c.mode,risk:c.risk==='mix'?['low','medium','high'][jobs.length%3]:c.risk};
    const topup=Math.max(0,budget-(person.b?.balance||0));funding+=topup;if(!person.b)newBots++;
    jobs.push({t,person,budget,topup,config,report});
   }
  }
  if(bots().length+newBots>MAX_BOTS)fail('Mbushja do të tejkalojë kufirin prej '+MAX_BOTS+' botësh');
  if(!Number.isSafeInteger(funding))fail('Invalid funding');need(funding);
  db.botFill??={tables:{}};db.botFill.tables??={};
  db.botFill.settings=Object.fromEntries(Object.keys(fillDefaults).map(k=>[k,c[k]]));
  for(const report of reports)if(!report.skipped)db.botFill.tables[report.id]={emptySeats:report.emptySeats};
  for(const job of jobs){const {t,person,budget,topup,config,report}=job;let b=person.b;
   if(!b)b=create(u,person.name,budget,config,true);
   else{if(topup){W.credit-=topup;b.balance+=topup;b.bot.funded+=topup;audit('BOT_FUND',b,topup,{from:'cenb'});}configure(b,config);}
   b.bot.enabled=true;b.bot.baseline=equity(b);b.bot.rakeBase=rakeOf(b.id);b.bot.error=null;
   engine.sit(t,b,t.seats.findIndex(s=>!s),config.buyin,[...runtime.values()]);
   if(c.mode==='seat')engine.sitOut(t,b,true);
   audit('BOT_MANAGE',b,0,{enabled:true,fill:true});report.added++;
  }
  // Excess bots leave between hands through the normal seating policy.
  save();return {ok:true,added:jobs.length,funded:funding/100,tables:reports};
 }
 // Moves the wallet of every bot that is not at a table back to the centre.
  function reclaim(){const c=center();let returned=0,bots_=0;if(!c)return {returned,bots:0,waiting:0};periods();
   for(const b of bots()){if(seatOf(b)||!(b.balance>0))continue;const n=b.balance;W.credit+=n;b.balance=0;b.bot.funded=Math.max(0,(b.bot.funded||0)-n);b.bot.baseline=0;b.bot.rakeBase=rakeOf(b.id);b.bot.enabled=false;audit('BOT_REFUND',b,n,{reclaim:true,from:b.id,to:'cenb'});returned+=n;bots_++;}
   const waiting=bots().filter(b=>seatOf(b)).length;if(!waiting)delete db.botReclaim;return {returned:returned/100,bots:bots_,waiting};}
 const stop=(b,reason,at)=>{b.bot.enabled=false;b.bot.error=reason||null;if(at)try{engine.leave(at.t,b);}catch{}save();};
 function route(p,body,u){if(!p.startsWith('/api/bots'))return undefined;if(u?.role!=='CENTER')fail('Only the center can manage bots',403);
  if(p==='/api/bots')return list();
  if(p==='/api/bots/guard')return guardInfo();
  if(p==='/api/bots/overview'){const tables=[...runtime.values()].filter(t=>t.seats.some(Boolean)).map(t=>({id:t.id,name:t.name,bb:t.bb/100,sb:t.sb/100,size:t.seats.length,humans:humansAt(t),bots:botsAt(t),waiting:t.waitlist?.length||0,live:LIVE.includes(t.phase)})).sort((a,b)=>b.humans-a.humans);
   return {cenbRake:(Number(db.cenbRake)||0)/100,wallets:wallets(),profitToday:profitReport({}).totals,bots:list(),guard:guardInfo(),fill:fillInfo(),tables,players:playerTypes(),decisions:decisions.slice(-60).reverse(),styles:Object.fromEntries(Object.entries(STYLES).map(([k,v])=>[k,v.label])),
    catalog:[...runtime.values()].map(t=>({id:t.id,name:t.name,bb:t.bb/100,sb:t.sb/100,size:t.seats.length,free:freeAt(t),bots:botsAt(t),humans:humansAt(t),min:engine.buyinLimits(t).min/100,max:engine.buyinLimits(t).max/100}))};}
  if(p==='/api/bots/names'){
   const names=(Array.isArray(body.names)?body.names:String(body.names??'').split(/[\s,;]+/)).map(n=>String(n).trim()).filter(Boolean);
   if(names.length>1000||names.some(n=>!/^[a-zA-Z0-9_]{3,18}$/.test(n)))fail('Emrat: 3–18 shkronja, numra ose _, deri në 1000 emra');
   if(new Set(names.map(n=>n.toLowerCase())).size!==names.length)fail('Lista ka emra të përsëritur');
   db.botNames=names;save();return {ok:true,names};
  }
  if(p==='/api/bots/fill')return fillTables(body,u);
  if(p==='/api/bots/settings'){
   if(body.returnPercent!==undefined){const n=Number(body.returnPercent);if(!Number.isFinite(n)||n<0||n>100)fail('Return percentage must be 0–100');}
   const next={};for(const [k,label] of [['dailyLimit','The daily limit'],['weeklyLimit','The weekly limit'],['monthlyLimit','The monthly limit'],['maxBB','The highest big blind']])if(body[k]!==undefined&&body[k]!==''){const n=Math.round(Number(body[k])*100);if(!Number.isSafeInteger(n)||n<0)fail(label+' must be 0 or more');next[k]=n;}
   if(body.maxPerTable!==undefined&&body.maxPerTable!==''){const n=Number(body.maxPerTable);if(!Number.isInteger(n)||n<1||n>4)fail('Bots per table: 1–4');next.maxPerTable=n;}
   if(body.returnPercent!==undefined)next.returnPercent=Number(body.returnPercent);
   Object.assign(g,next);save();return guardInfo();}
  if(p==='/api/bots/create'){const b=create(u,String(body.name||'').trim(),cents(body.budget,'Budget'),body);save();return {ok:true,id:b.id};}
  if(p==='/api/bots/bulk'){const n=Number(body.count);if(!Number.isInteger(n)||n<1||n>20)fail('Make 1–20 bots at a time');const each=cents(body.budget,'Budget');need(each*n);
   if(db.botNames?.length&&db.botNames.filter(name=>!db.users.some(x=>x.username.toLowerCase()===name.toLowerCase())).length<n)fail('Nuk ka mjaft emra të lirë në listë');
   if(bots().length+n>MAX_BOTS)fail('Maximum '+MAX_BOTS+' bots');const made=[];for(let i=0;i<n;i++)made.push(create(u,freshName(),each,{...body,risk:body.risk==='mix'?['low','medium','high'][i%3]:body.risk}).id);save();return {ok:true,ids:made};}
  // Return every bot's credit to the centre: all bots stop; the ones at a table leave when
  // their hand ends and are emptied then (tick below). The bot accounts stay, with €0.
  if(p==='/api/bots/reclaim'){let stopped=0;for(const b of bots())if(b.bot.enabled||seatOf(b)){stop(b,null,seatOf(b));audit('BOT_MANAGE',b,0,{enabled:false});stopped++;}db.botReclaim=true;const r=reclaim();save();return {ok:true,stopped,...r};}
  // Rake the bots paid is kept by CENB; CENB sends it (all or part) to the centre by hand.
  // Re-credit the bots: the money inside CENB circulates. Every bot that is not at a table goes
  // back to the credit it was funded with: bots that won give to bots that lost, and the rake the
  // bots paid (kept in the CENB wallet) goes back to them too. What is left over is the profit and
  // stays in the CENB wallet. If there is not enough, every bot gets the same share of its funding.
  if(p==='/api/bots/restore'){const free=bots().filter(b=>!seatOf(b)),seated=bots().length-free.length,wallet=Number(db.cenbRake)||0;
   if(!free.length)fail(seated?'Every bot is at a table: press "Ndalo të gjithë", wait for the hands to end, then try again':'There are no bots');
   const pool=free.reduce((n,b)=>n+b.balance,0)+wallet,need=free.reduce((n,b)=>n+Math.max(0,b.bot.funded||0),0);
   const ratio=need>0&&pool<need?pool/need:1;let given=0;
   for(const b of free){const target=Math.floor(Math.max(0,b.bot.funded||0)*ratio);if(target!==b.balance)audit('BOT_RESTORE',b,target-b.balance,{before:b.balance,after:target});b.balance=target;b.bot.baseline=target;b.bot.rakeBase=rakeOf(b.id);given+=target;}
   const left=pool-given;db.cenbRake=0;W.credit+=left;
   db.ledger.push({id:crypto.randomUUID(),type:'CENB_RESTORE',amount:given,bots:free.length,rakeUsed:wallet,toProfit:left,time:Date.now()});save();
   return {ok:true,bots:free.length,seated,full:ratio===1,toBots:given/100,wallet:W.credit/100,walletChange:left/100};}
  // Tables tab: every table with every seat, and the bots that are free to be seated.
  if(p==='/api/bots/tables'){return {tables:[...runtime.values()].map(t=>{const l=engine.buyinLimits(t);return {id:t.id,name:t.name,sb:t.sb/100,bb:t.bb/100,size:t.seats.length,min:l.min/100,max:l.max/100,live:LIVE.includes(t.phase),waiting:t.waitlist?.length||0,
    seats:t.seats.map((s,i)=>{if(!s)return null;const b=s.isBot?db.users.find(u=>u.id===s.userId):null;return {p:i,name:s.username,bot:!!s.isBot,stack:s.stack/100,out:!!s.sittingOut,...(b?{id:b.id,on:!!b.bot?.enabled,leaving:!!s.leaveAfterHand}:{})};})};}),
   free:bots().filter(b=>!seatOf(b)).map(b=>({id:b.id,name:b.username,balance:b.balance/100,risk:b.bot.risk||'medium'}))};}
  // Seat a bot on one chosen empty seat: an existing free bot, or a new one made here. The bot
  // keeps that seat (pinned) and plays at once, also with other bots. Missing wallet credit for
  // the buy-in comes from the centre.
  if(p==='/api/bots/seat'){const t=runtime.get(String(body.tableId||''));if(!t)fail('Choose a table');const pos=Number(body.position);
   if(!Number.isInteger(pos)||pos<0||pos>=t.seats.length)fail('Choose a seat');if(t.seats[pos])fail('This seat is taken');
   if(t.waitlist?.length||t.waitOffer)fail('A player is waiting for a seat at this table');
   const l=engine.buyinLimits(t),buyin=body.buyin===undefined||body.buyin===''?Math.round(l.max*0.6):cents(body.buyin,'Buy-in');if(buyin<l.min||buyin>l.max)fail('Buy-in must be €'+(l.min/100).toFixed(2)+'–€'+(l.max/100).toFixed(2));
   const risk=body.risk||'medium',mode=body.mode||'play';let b;periods();
   if(body.id){b=bots().find(x=>x.id===body.id);if(!b)fail('Bot not found',404);if(seatOf(b))fail('This bot is already at a table');
    const missing=buyin-b.balance;if(missing>0){need(missing);W.credit-=missing;b.balance+=missing;b.bot.funded+=missing;b.bot.baseline+=missing;audit('BOT_FUND',b,missing,{from:'cenb'});}
    configure(b,{tableId:t.id,buyin:buyin/100,risk,mode,waitForPlayers:true,stopLoss:body.stopLoss??(b.bot.stopLoss||b.balance)/100});}
   else{const name=String(body.name||'').trim()||freshName(),budget=body.budget===undefined||body.budget===''?buyin*2:cents(body.budget,'Budget');if(budget<buyin)fail('The budget must cover the buy-in');
    b=create(u,name,budget,{tableId:t.id,buyin:buyin/100,risk,mode,waitForPlayers:true,stopLoss:body.stopLoss??budget/100,stopWin:body.stopWin??0},true);}
   b.bot.enabled=true;b.bot.error=null;b.bot.pinned=t.id;engine.sit(t,b,pos,buyin/100,[...runtime.values()]);b.bot.baseline=equity(b);b.bot.rakeBase=rakeOf(b.id);if(mode==='seat')engine.sitOut(t,b,true);
   audit('BOT_MANAGE',b,0,{enabled:true,seat:pos+1,table:t.name});save();return {ok:true,bot:b.username,seat:pos+1,table:t.name};}
  // CENB wallets and the centre: credit in, credit back, profit out.
  if(p==='/api/bots/wallet'){const c=center();if(!c)fail('No center account');const a=String(body.action||'');
   const n=cents(body.amount,'Amount');periods();
   if(a==='credit'){centerFunds(db,c,n,'cenb credit');if(n>c.balance)fail('The center does not have enough credit');c.balance-=n;W.credit+=n;moveStarts(n);db.ledger.push({id:crypto.randomUUID(),type:'CENB_CREDIT',from:c.id,to:'cenb',amount:n,time:Date.now()});}
   else if(a==='return'){if(n>W.credit)fail('The credit wallet holds only €'+(W.credit/100).toFixed(2));W.credit-=n;c.balance+=n;moveStarts(-n);db.ledger.push({id:crypto.randomUUID(),type:'CENB_RETURN',from:'cenb',to:c.id,amount:n,time:Date.now()});}
   // rake: the bots' rake moves into the CENB wallet. It stays inside CENB, so nothing changes for the periods.
   else if(a==='rake'){const have=Number(db.cenbRake)||0;if(n>have)fail('The bots\' rake holds only €'+(have/100).toFixed(2));db.cenbRake=have-n;W.credit+=n;db.ledger.push({id:crypto.randomUUID(),type:'CENB_RAKE',from:'cenb-rake',to:'cenb',amount:n,time:Date.now()});}
   else fail('Unknown wallet action');save();return {ok:true,wallets:wallets()};}
  if(p==='/api/bots/profit')return profitReport(body);
  if(p==='/api/bots/report')return botReport(body);
  if(p==='/api/bots/watch'){const t=runtime.get(String(body.tableId||''));if(!t)fail('Table not found',404);
   const view=engine.snapshot(t,null,false);delete view.chat;
   const info={};for(const s of t.seats){if(!s?.isBot)continue;const b=bots().find(x=>x.id===s.userId);if(!b)continue;
    info[s.id]={id:b.id,risk:b.bot.risk||'medium',botClash:b.bot.botClash||'balanced',style:STYLES[b.bot.risk]?.label||b.bot.risk,mode:b.bot.mode||'play',enabled:!!b.bot.enabled,balance:b.balance/100,stopLoss:b.bot.stopLoss/100,stopWin:(b.bot.stopWin||0)/100,session:sessionOf(b)/100,hands:b.bot.hands||0,addChips:(b.bot.addChips||0)/100,error:b.bot.error||null};}
   return {...view,bots:info,maxBuyin:engine.buyinLimits(t).max/100,styles:Object.fromEntries(Object.entries(STYLES).map(([k,v])=>[k,v.label]))};}
  if(p==='/api/bots/stopall'){let n=0;for(const b of bots())if(b.bot.enabled||seatOf(b)){stop(b,null,seatOf(b));audit('BOT_MANAGE',b,0,{enabled:false});n++;}save();return {ok:true,stopped:n};}
  if(p==='/api/bots/startall'){let n=0;for(const b of bots())if(!b.bot.enabled&&!/^House /.test(b.bot.error||'')&&b.balance+(seatOf(b)?.s.stack||0)>0){b.bot.enabled=true;b.bot.error=null;b.bot.baseline=equity(b);b.bot.rakeBase=rakeOf(b.id);audit('BOT_MANAGE',b,0,{enabled:true});n++;}save();return {ok:true,started:n};}
  const b=bots().find(x=>x.id===body.id);if(!b)fail('Bot not found',404);
  if(p==='/api/bots/configure'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table before changing it');configure(b,body);audit('BOT_MANAGE',b);}
  // Live, also while it plays: style, mode and limits. It plays its next decision with them.
  else if(p==='/api/bots/live'){const risk=body.risk??b.bot.risk??'medium',mode=body.mode??b.bot.mode??'play';
   if(!STYLES[risk])fail('Invalid style');if(!['play','seat'].includes(mode))fail('Invalid mode');
   const botClash=body.botClash??b.bot.botClash??'balanced';if(!['off','balanced','aggressive'].includes(botClash))fail('Invalid bot clash mode');
   const stopLoss=body.stopLoss===undefined?b.bot.stopLoss:cents(body.stopLoss,'Loss limit'),stopWin=body.stopWin===undefined?(b.bot.stopWin||0):cents(body.stopWin,'Win limit',true);
   const at=seatOf(b);if(at&&b.bot.mode==='seat'&&mode==='play'&&at.s.sittingOut)engine.sitOut(at.t,b,false);
   Object.assign(b.bot,{risk,mode,botClash,stopLoss,stopWin});audit('BOT_MANAGE',b,0,{risk,mode,live:true});}
  // Credit out of a bot, also while it plays: only from its wallet. The chips on the table stay
  // in the game (no player may take chips off the table); they come back when it leaves.
  else if(p==='/api/bots/withdraw'){const n=cents(body.amount,'Amount');if(n>b.balance)fail('The bot wallet holds only €'+(b.balance/100).toFixed(2)+'. Chips on the table come back when it leaves the table.');
   b.balance-=n;W.credit+=n;b.bot.funded=Math.max(0,b.bot.funded-n);b.bot.baseline-=n;audit('BOT_REFUND',b,n,{from:b.id,to:'cenb'});}
  else if(p==='/api/bots/status'){if(typeof body.enabled!=='boolean')fail('Invalid status');
   if(body.enabled){if(/^House /.test(b.bot.error||''))fail('The house limit is reached: raise it or wait for the next period');if(b.bot.tableId!=='auto'&&b.balance<b.bot.buyin&&!seatOf(b))fail('The bot wallet is smaller than its buy-in');b.bot.baseline=equity(b);b.bot.rakeBase=rakeOf(b.id);}
   b.bot.enabled=body.enabled;b.bot.error=null;if(!body.enabled){const at=seatOf(b);if(at)engine.leave(at.t,b);}audit('BOT_MANAGE',b,0,{enabled:body.enabled});}
  else if(p==='/api/bots/topup'){const n=body.amount===undefined&&body.toTable?0:cents(body.amount,'Amount'),at=seatOf(b);
   if(n){need(n);W.credit-=n;b.balance+=n;b.bot.funded+=n;b.bot.baseline+=n;audit('BOT_FUND',b,n,{from:'cenb'});}
   if(body.toTable===true){if(!at)fail('The bot is not at a table');const chips=cents(body.chips??body.amount,'Chips');if(chips>b.balance)fail('The bot wallet holds only €'+(b.balance/100).toFixed(2));
    b.bot.addChips=(b.bot.addChips||0)+chips;const now=!LIVE.includes(at.t.phase)||!at.s.inHand,added=now?chipsToTable(b,at):0;save();return {ok:true,added:added/100,pending:!now};}}
  else if(p==='/api/bots/delete'){if(b.bot.enabled||seatOf(b))fail('Stop the bot and let it leave the table first');W.credit+=b.balance;audit('BOT_REFUND',b,b.balance,{from:b.id,to:'cenb'});db.users.splice(db.users.indexOf(b),1);rakeTotal-=rakeMap.get(b.id)?.rake||0;rakeMap.delete(b.id);}
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
 // Chips asked for at the table: from the bot's wallet to its stack, only between hands (a player
 // may add chips only then) and up to the table's maximum; what does not fit stays in the wallet.
 function chipsToTable(b,at){const want=b.bot.addChips;delete b.bot.addChips;
  const n=Math.min(want,b.balance,engine.buyinLimits(at.t).max-at.s.stack);
  if(n>0)try{engine.rebuy(at.t,b,n/100);return n;}catch{}save();return 0;}
 const think=(d,v)=>{const big=d.type==='raise'&&d.amount*100>=v.stack+v.roundBet-1||d.type==='call'&&v.toCall>=v.stack*.5;
  return big?3000+random()*4000:d.type==='raise'?1500+random()*3000:d.type==='call'?1200+random()*2300:700+random()*1300;};
 function tick(now=Date.now()){
  settleReturns();
  if(db.botReclaim){const r=reclaim();if(r.bots)save();}
  const r=periods(now);
  for(const [p,limit,name] of PERIODS)if(g[limit]>0&&r[p]<=-g[limit])for(const b of bots())if(b.bot.enabled)stop(b,`House ${name} limit reached`,seatOf(b));
  for(const t of runtime.values())if(t.seats.some(Boolean))observe(t);
  for(const b of bots()){
   let at=seatOf(b);if(at)at.s.lastSeen=now;
   if(b.bot.addChips&&at&&(!LIVE.includes(at.t.phase)||!at.s.inHand))chipsToTable(b,at);
   if(!b.bot.enabled)continue;
   try{
    const between=at&&(!LIVE.includes(at.t.phase)||!at.s.inHand),session=sessionOf(b);
    if(at&&between){
     if(b.bot.stopWin>0&&session>=b.bot.stopWin){stop(b,'Win limit reached',at);continue;}
     if(-session>=b.bot.stopLoss){stop(b,'Loss limit reached',at);continue;}
     if(at.t.seats.filter(Boolean).length===1){
      if(!aloneDeadlines.has(at.s))aloneDeadlines.set(at.s,now+3000+random()*2000);
      if(now>=aloneDeadlines.get(at.s)){engine.leave(at.t,b);leftAlone.add(b);save();}
      continue;
     }
     aloneDeadlines.delete(at.s);
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
     if(plan?.key!==key){const v=botClashView(botView(t,s,profileOf),isBotId,b.bot.botClash||'balanced');plan={key,v,d:null,at:0};plans.set(s,plan);
      if(decider){const p=plan;decider(v,b.bot.risk).then(d=>{p.d=d;p.at=Math.max(Date.now(),t.turnStartedAt+think(d,v));}).catch(()=>{p.d=v.toCall?{type:'fold'}:{type:'check'};p.at=Date.now();});}
      else{plan.d=botDecision(v,b.bot.risk,random);plan.at=t.turnStartedAt+think(plan.d,v);}}
     // A decision that never came back: check when free, otherwise fold.
     if(!plan.d&&now-t.turnStartedAt>9000){plan.d=plan.v.toCall?{type:'fold'}:{type:'check'};plan.at=now;}
     if(plan.d&&now>=plan.at){plans.delete(s);const {v}=plan;const current=botClashView(botView(t,s,profileOf),isBotId,b.bot.botClash||'balanced'),d=botDecision(current,b.bot.risk,random);
      // Only humans may receive a deliberate return; avoid bot-to-bot transfers.
      const humanOnly=current.opponents.filter(o=>!o.folded).every(o=>!isBotId(o.id));
      const budget=returnBudget(b.bot,equity(b),g.returnPercent);
      const returning=d.type==='fold'&&humanOnly&&returnDecision(current,budget,random,b.bot.returnHand);
      if(returning)d.type='call';
      const before=equity(b),cost=Math.min(current.toCall,current.stack);
      try{engine.act(t,b.id,d.type,d.amount);
       if(returning){b.bot.returnHand??={tableId:t.id,hand:t.hand,equity:before,paid:0,limit:Math.floor(budget*.6)};b.bot.returnHand.paid+=cost;save();}
      }catch{const fallback=toCall(t,s)?current.outcome==='win'?'call':'fold':'check';engine.act(t,b.id,fallback);d.type=fallback;delete d.amount;}
      decisions.push({at:now,bot:b.username,table:t.name,hand:t.hand,street:v.phase,action:d.type,amount:d.amount??(d.type==='call'?Math.min(v.toCall,v.stack)/100:null),pot:v.pot/100,equity:d.equity==null?null:Math.round(d.equity*100)});
      if(decisions.length>200)decisions.splice(0,decisions.length-200);}}
   }catch(e){stop(b,e.message,seatOf(b));}
  }
 }
 return {route,tick,list,profileOf};
}
