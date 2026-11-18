// The centre's view of the whole platform: every account, one account in full, and one clear
// report for any period. Everything is read from the ledger and the hand history, never
// estimated. Money is in integer cents inside and in euros in what goes out.
import {STAFF,pct} from './rake.js';
import {creditCreated} from './credit.js';
import {LIVE} from './game.js';

const TZ='Europe/Tirane';
const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const partsFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const eur=c=>Math.round(c)/100;
export const tiranaDay=t=>dayFmt.format(t);
export const addDays=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
// Midnight in Tirana of a calendar day, as a timestamp.
export function dayStart(d){const guess=Date.parse(d+'T00:00:00Z');const off=t=>{const p=Object.fromEntries(partsFmt.formatToParts(t).map(x=>[x.type,x.value]));return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-t;};
 let t=guess-off(guess);t=guess-off(t);return t;}
// A period from a preset or two days; the previous period has the same length, just before it.
export function period({preset,from,to}={},now=Date.now()){
 const today=tiranaDay(now);
 if(preset==='today')from=to=today;
 else if(preset==='yesterday')from=to=addDays(today,-1);
 else if(preset==='7d'){to=today;from=addDays(today,-6);}
 else if(preset==='30d'){to=today;from=addDays(today,-29);}
 else if(preset==='month'){to=today;from=today.slice(0,8)+'01';}
 else if(preset==='lastmonth'){const first=today.slice(0,8)+'01';to=addDays(first,-1);from=to.slice(0,8)+'01';}
 else{to=validDay(to)?to:today;from=validDay(from)?from:to;if(from>to)[from,to]=[to,from];}
 const days=Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/864e5)+1;
 const pTo=addDays(from,-1),pFrom=addDays(pTo,-(days-1));
 return {from,to,days,since:dayStart(from),until:dayStart(addDays(to,1)),prev:{from:pFrom,to:pTo,since:dayStart(pFrom),until:dayStart(from)}};
}

export function createCenter({db,store,runtime,online=()=>false,cenbValue=()=>({wallet:0,rake:0,bots:0}),held=()=>0}){
 const byId=()=>new Map(db.users.map(u=>[u.id,u]));
 // Ledger entries of some types since a moment: the older ones from the database, the newest from memory.
 const ledgerSince=(types,since)=>{const set=new Set(types);return [...(store?.ledgerOlder?store.ledgerOlder(types,since):[]),...db.ledger.filter(x=>set.has(x.type)&&x.time>=since)];};
 const upline=(ids,u)=>{const out={agent:null,manager:null,admin:null,parent:null};const p=ids.get(u.parentId);out.parent=p?{id:p.id,username:p.username,role:p.role}:null;
  for(let x=p,i=0;x&&i<10;x=ids.get(x.parentId),i++){if(x.role==='AGENT')out.agent??=x.username;else if(x.role==='MANAGER')out.manager??=x.username;else if(x.role==='ADMIN')out.admin??=x.username;else break;}return out;};
 const seatsOf=()=>{const m=new Map();for(const t of runtime.values())for(const s of t.seats)if(s){const e=m.get(s.userId)||m.set(s.userId,{chips:0,tables:[]}).get(s.userId);e.chips+=s.stack;e.tables.push(t.name);}return m;};
 const created=u=>u.registeredAt||u.createdAt||null;
 // Rake each player paid, and what each staff member earned, since a moment.
 function rakeSince(since){const paid=new Map(),earned=new Map();for(const x of ledgerSince(['RAKE'],since)){for(const a of x.allocations||[])if(!a.bot)paid.set(a.userId,(paid.get(a.userId)||0)+a.amount);for(const s of x.shares||[])earned.set(s.userId,(earned.get(s.userId)||0)+s.amount);}return {paid,earned};}

 // ---- Every account on the platform ----
 function directory({days=30}={}){
  const ids=byId(),seats=seatsOf(),since=Date.now()-days*864e5,{paid,earned}=rakeSince(since);
  const totals=new Map((store?.playerTotals?store.playerTotals(since):[]).map(t=>[t.id,t]));
  const below=new Map();for(const u of db.users){if(u.isBot)continue;for(let p=ids.get(u.parentId),i=0;p&&i<50;p=ids.get(p.parentId),i++)below.set(p.id,(below.get(p.id)||0)+1);}
  const rows=db.users.filter(u=>!u.isBot&&u.role!=='CENTER').map(u=>{const s=seats.get(u.id),t=totals.get(u.id),up=upline(ids,u);
   return {id:u.id,username:u.username,role:u.role,email:u.email||null,direct:!!u.email,balance:eur(u.balance),chips:eur(s?.chips||0),tables:s?.tables||[],
    ...up,share:STAFF.includes(u.role)?pct(u.share):null,blocked:!!u.blocked,muted:u.mutedUntil>Date.now(),online:online(u.id),lastLoginAt:u.lastLoginAt||null,created:created(u),
    below:below.get(u.id)||0,hands:t?.hands||0,net:Math.round((t?.net||0)*100)/100,rake:eur(paid.get(u.id)||0),earned:eur(earned.get(u.id)||0),lastPlayed:t?.last||null};});
  const count=r=>rows.filter(r).length;
  return {days,rows,counts:{all:rows.length,USER:count(r=>r.role==='USER'),AGENT:count(r=>r.role==='AGENT'),MANAGER:count(r=>r.role==='MANAGER'),ADMIN:count(r=>r.role==='ADMIN'),online:count(r=>r.online),playing:count(r=>r.tables.length>0),blocked:count(r=>r.blocked)}};
 }

 // ---- One account in full ----
 function account(id){
  const ids=byId(),u=ids.get(String(id||''));if(!u||u.isBot||u.role==='CENTER')return null;
  const seats=seatsOf().get(u.id),since30=Date.now()-30*864e5,{paid,earned}=rakeSince(since30);
  const path=[];for(let x=ids.get(u.parentId),i=0;x&&i<50;x=ids.get(x.parentId),i++)path.unshift({id:x.id,username:x.username,role:x.role});
  const children=db.users.filter(x=>x.parentId===u.id&&!x.isBot).map(x=>({id:x.id,username:x.username,role:x.role,balance:eur(x.balance),blocked:!!x.blocked,online:online(x.id)}));
  const network=[];if(u.role!=='USER'){const seen=new Set([u.id]);for(let added=true;added;){added=false;for(const x of db.users)if(seen.has(x.parentId)&&!seen.has(x.id)&&!x.isBot){seen.add(x.id);network.push(x);added=true;}}}
  const name=x=>x==null?null:ids.get(x)?.username||(x==='cenb'?'CENB':String(x));
  const mine=db.ledger.filter(x=>x.type==='RAKE'?(x.allocations||[]).some(a=>a.userId===u.id&&a.amount>0)||(x.shares||[]).some(s=>s.userId===u.id&&s.amount>0):x.from===u.id||x.to===u.id).slice(-60).reverse().map(x=>{
   const amount=x.type==='RAKE'?((x.allocations||[]).find(a=>a.userId===u.id)?.amount||0)+((x.shares||[]).find(s=>s.userId===u.id)?.amount||0):x.amount;
   const sign=x.type==='RAKE'?((x.shares||[]).some(s=>s.userId===u.id)?1:-1):x.to===u.id?1:x.from===u.id?-1:0;
   return {time:x.time,type:x.type,amount:eur(amount)*sign,from:name(x.from),to:name(x.to),table:x.tableId?db.tables.find(t=>t.id===x.tableId)?.name||null:null,hand:x.hand??null,cash:!!x.cash};});
  const hands=(store?.playerHands?store.playerHands(u.id,Infinity,15):[]).map(h=>{const p=(h.players||[]).find(x=>x.userId===u.id);return {id:h.id,time:h.startedAt||null,table:h.table||db.tables.find(t=>t.id===h.tableId)?.name||'',result:Math.round((Number(p?.result)||0)*100)/100,cards:p?.cards||[],won:(h.winners||[]).includes(u.username)};});
  const stats30=store?.playerStats?store.playerStats(u.id,since30):null,statsAll=store?.playerStats?store.playerStats(u.id,0):null;
  const pick=s=>s?{hands:s.hands,won:s.won,vpip:s.vpip,net:Math.round((s.net||0)*100)/100,best:Math.round((s.best||0)*100)/100,worst:Math.round((s.worst||0)*100)/100,days:s.days||[]}:null;
  return {user:{id:u.id,username:u.username,role:u.role,email:u.email||null,direct:!!u.email,balance:eur(u.balance),chips:eur(seats?.chips||0),tables:seats?.tables||[],share:STAFF.includes(u.role)?pct(u.share):null,
    blocked:!!u.blocked,mutedUntil:u.mutedUntil>Date.now()?u.mutedUntil:null,online:online(u.id),lastLoginAt:u.lastLoginAt||null,created:created(u),ips:u.seenIps||[],devices:(u.seenDevices||[]).length},
   path,children,network:u.role==='USER'?null:{accounts:network.length,players:network.filter(x=>x.role==='USER').length,balance:eur(network.reduce((n,x)=>n+x.balance,0)),
    rake:eur(network.reduce((n,x)=>n+(paid.get(x.id)||0),0))},
   rake30:eur(paid.get(u.id)||0),earned30:eur(earned.get(u.id)||0),stats30:pick(stats30),statsAll:pick(statsAll),hands,ledger:mine};
 }

 // ---- The report: one period, every number the centre needs, with the period before ----
 function report(body={},now=Date.now()){
  const P=period(body,now),ids=byId(),isBot=a=>!!a.bot||ids.get(a.userId)?.isBot;
  const center=db.users.find(u=>u.role==='CENTER');
  const rows=ledgerSince(['RAKE','MINT','TRANSFER','CRYPTO_DEPOSIT','CRYPTO_WITHDRAW','CRYPTO_WITHDRAW_HOLD','CRYPTO_WITHDRAW_REFUND','CENB_CREDIT','CENB_RETURN'],P.prev.since).filter(x=>x.time<P.until);
  const blank=()=>({rake:0,bots:0,shares:0,ADMIN:0,MANAGER:0,AGENT:0,center:0,rakeHands:0,minted:0,toNetwork:0,fromNetwork:0,toCenb:0,fromCenb:0,deposits:0,depositCount:0,withdrawals:0,withdrawalCount:0,cashouts:0,newPlayers:0,hands:0,humanHands:0,players:0,cenbResult:0});
  const cur=blank(),prev=blank(),daily=new Map();for(let d=P.from;d<=P.to;d=addDays(d,1))daily.set(d,{day:d,...blank()});
  const agents=new Map(),players=new Map();
  for(const x of rows){const inCur=x.time>=P.since,b=inCur?cur:prev,day=inCur?daily.get(tiranaDay(x.time)):null,both=f=>{f(b);if(day)f(day);};
   if(x.type==='RAKE'){const human=(x.allocations||[]).filter(a=>!isBot(a)).reduce((n,a)=>n+a.amount,0),bot=x.allocations?x.allocations.filter(isBot).reduce((n,a)=>n+a.amount,0):0;
    const legacy=!x.allocations?x.amount:0,sh=x.shares||[],shares=sh.reduce((n,s)=>n+s.amount,0);
    both(v=>{v.rake+=human+legacy;v.bots+=bot;v.shares+=shares;for(const s of sh)if(v[s.role]!==undefined)v[s.role]+=s.amount;v.center+=human+legacy-shares;if(human+legacy>0)v.rakeHands++;});
    if(inCur){for(const s of sh){const u=ids.get(s.userId);const e=agents.get(s.userId)||agents.set(s.userId,{id:s.userId,username:u?.username||'—',role:s.role,earned:0,rake:0,players:new Set()}).get(s.userId);e.earned+=s.amount;}
     for(const a of x.allocations||[]){if(isBot(a))continue;const u=ids.get(a.userId);const p=players.get(a.userId)||players.set(a.userId,{id:a.userId,username:u?.username||'—',agent:u?ids.get(u.parentId)?.username||'':'',rake:0}).get(a.userId);p.rake+=a.amount;
      // The network member who brought the player in, all the way up: each one counts the player's rake.
      for(let p2=u&&ids.get(u.parentId),i=0;p2&&STAFF.includes(p2.role)&&i<10;p2=ids.get(p2.parentId),i++){const e=agents.get(p2.id)||agents.set(p2.id,{id:p2.id,username:p2.username,role:p2.role,earned:0,rake:0,players:new Set()}).get(p2.id);e.rake+=a.amount;e.players.add(a.userId);}}}}
   else if(x.type==='MINT')both(v=>v.minted+=x.amount);
   else if(x.type==='TRANSFER'&&center){if(x.cash)both(v=>v.cashouts+=x.amount);if(x.from===center.id)both(v=>v.toNetwork+=x.amount);else if(x.to===center.id)both(v=>v.fromNetwork+=x.amount);}
   else if(x.type==='CENB_CREDIT')both(v=>v.toCenb+=x.amount);
   else if(x.type==='CENB_RETURN')both(v=>v.fromCenb+=x.amount);
   else if(x.type==='CRYPTO_DEPOSIT')both(v=>{v.deposits+=x.amount;v.depositCount++;});
   else if(x.type==='CRYPTO_WITHDRAW')both(v=>{v.withdrawals+=x.amount;v.withdrawalCount++;});}
  // Hands and players from the hand history, by the hour (Tirana is a whole number of hours from UTC).
  for(const [range,b,isCur] of [[P,cur,true],[P.prev,prev,false]]){
   for(const h of store?.handHours?store.handHours(range.since,range.until):[]){const v=Math.round((h.botNet||0)*100);b.hands+=h.hands;b.humanHands+=h.humanHands;b.cenbResult+=v;if(isCur){const d=daily.get(tiranaDay(h.h*3600000));if(d){d.hands+=h.hands;d.humanHands+=h.humanHands;d.cenbResult+=v;}}}
   const seen=new Set(),perDay=new Map();for(const r of store?.playerHours?store.playerHours(range.since,range.until):[]){seen.add(r.id);if(isCur){const d=tiranaDay(r.h*3600000);(perDay.get(d)||perDay.set(d,new Set()).get(d)).add(r.id);}}
   b.players=seen.size;if(isCur)for(const [d,s] of perDay)if(daily.get(d))daily.get(d).players=s.size;}
  for(const u of db.users){const c=created(u);if(u.isBot||u.role!=='USER'||!c)continue;if(c>=P.since&&c<P.until){cur.newPlayers++;const d=daily.get(tiranaDay(c));if(d)d.newPlayers++;}else if(c>=P.prev.since&&c<P.prev.until)prev.newPlayers++;}
  // Where the money is right now.
  const role=r=>db.users.filter(u=>u.role===r&&!u.isBot).reduce((n,u)=>n+u.balance,0);
  let chips=0,botChips=0,pots=0;for(const t of runtime.values()){for(const s of t.seats)if(s){if(s.isBot)botChips+=s.stack;else chips+=s.stack;}if(LIVE.includes(t.phase))pots+=t.pot;}
  const cenb=cenbValue(),pending=(db.crypto?.withdrawals||[]).filter(w=>w.status==='pending');
  const nowMoney={center:eur(role('CENTER')),admins:eur(role('ADMIN')),managers:eur(role('MANAGER')),agents:eur(role('AGENT')),players:eur(role('USER')),onTables:eur(chips),pots:eur(pots),
   cenb:{wallet:eur(cenb.wallet),rake:eur(cenb.rake),bots:eur(cenb.bots+botChips)},held:eur(held()),created:eur(creditCreated(db))};
  nowMoney.total=Math.round((nowMoney.center+nowMoney.admins+nowMoney.managers+nowMoney.agents+nowMoney.players+nowMoney.onTables+nowMoney.pots+nowMoney.cenb.wallet+nowMoney.cenb.rake+nowMoney.cenb.bots+nowMoney.held)*100)/100;
  const out=v=>({rake:eur(v.rake),shares:eur(v.shares),byRole:{ADMIN:eur(v.ADMIN),MANAGER:eur(v.MANAGER),AGENT:eur(v.AGENT)},center:eur(v.center),bots:eur(v.bots),rakeHands:v.rakeHands,
   minted:eur(v.minted),toNetwork:eur(v.toNetwork),fromNetwork:eur(v.fromNetwork),toCenb:eur(v.toCenb),fromCenb:eur(v.fromCenb),deposits:eur(v.deposits),depositCount:v.depositCount,withdrawals:eur(v.withdrawals),withdrawalCount:v.withdrawalCount,cashouts:eur(v.cashouts),
   hands:v.hands,humanHands:v.humanHands,players:v.players,newPlayers:v.newPlayers,cenbResult:eur(v.cenbResult),avgRake:v.rakeHands?eur(v.rake/v.rakeHands):0});
  return {from:P.from,to:P.to,days:P.days,previous:{from:P.prev.from,to:P.prev.to},current:out(cur),before:out(prev),
   daily:[...daily.values()].map(d=>({day:d.day,...out(d)})),now:nowMoney,
   pending:{withdrawals:pending.length,amount:eur(pending.reduce((n,w)=>n+(w.cents||0),0))},
   network:[...agents.values()].map(a=>({id:a.id,username:a.username,role:a.role,rake:eur(a.rake),earned:eur(a.earned),players:a.players.size})).sort((a,b)=>b.rake-a.rake||b.earned-a.earned).slice(0,50),
   players:[...players.values()].map(p=>({...p,rake:eur(p.rake)})).sort((a,b)=>b.rake-a.rake).slice(0,50)};
 }
 return {directory,account,report};
}
