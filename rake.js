// Integer cents throughout; a pot's rake is shared equally by its contributors.
export function rakeReport(db, user, now=Date.now()) {
  const ids=new Set([user.id]);
  for(let changed=true;changed;){changed=false;for(const u of db.users)if(ids.has(u.parentId)&&!ids.has(u.id)){ids.add(u.id);changed=true;}}
  const rows=db.ledger.filter(x=>x.type==='RAKE').flatMap(x=>{
    const amount=user.role==='CENTER'?x.amount:(x.allocations||[]).filter(a=>ids.has(a.userId)).reduce((n,a)=>n+a.amount,0);
    return amount>0?[{id:x.id,tableId:x.tableId,hand:x.hand??null,time:x.time,amount,legacy:!x.allocations}]:[];
  });
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
  const today=day.format(now),total=rows.reduce((n,x)=>n+x.amount,0);
  return {total,today:rows.filter(x=>day.format(x.time)===today).reduce((n,x)=>n+x.amount,0),hands:rows.length,rows:rows.slice(-100).reverse(),legacyTotal:rows.filter(x=>x.legacy).reduce((n,x)=>n+x.amount,0)};
}

// ---- Revenue report for CENTER / ADMIN / AGENT ----
// Every RAKE entry records which players paid how much of that hand's rake
// (allocations). With the hierarchy (player → agent → admin → centre) this tells
// exactly who generated the revenue and how: per member of the network, per
// player, per table, per day and per hour. Dates are calendar days in Tirana.
const TZ='Europe/Tirane';
const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'});
const hourFmt=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',hourCycle:'h23'});
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'));
const addDays=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
const daysBetween=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5)+1;
export function isUnder(db,id,ancestorId){const byId=new Map(db.users.map(u=>[u.id,u]));for(let u=byId.get(id),i=0;u&&i<50;u=byId.get(u.parentId),i++)if(u.id===ancestorId)return true;return false;}

export function revenueReport(db,viewer,{from,to,scope,detail=false}={},now=Date.now()){
 const byId=new Map(db.users.map(u=>[u.id,u]));
 const root=scope&&scope!==viewer.id?byId.get(scope):viewer;
 if(!root||!isUnder(db,root.id,viewer.id))throw Object.assign(Error('This report is not in your network'),{status:403});
 const rakes=db.ledger.filter(x=>x.type==='RAKE');
 const today=dayFmt.format(now),first=rakes.length?dayFmt.format(Math.min(...rakes.map(x=>x.time))):today;
 to=validDay(to)?to:today;from=from==='all'?first:validDay(from)?from:addDays(to,-29);if(from>to)[from,to]=[to,from];
 const days=daysBetween(from,to),pTo=addDays(from,-1),pFrom=addDays(pTo,-(days-1));
 // The member directly under the report's root on the way up from a player.
 const viaCache=new Map();
 const via=pid=>{if(viaCache.has(pid))return viaCache.get(pid);let u=byId.get(pid),prev=null,i=0;while(u&&u.id!==root.id&&i++<50){prev=u;u=byId.get(u.parentId);}const v=u?prev:null;viaCache.set(pid,v);return v;};
 const upline=pid=>{const p=byId.get(pid),agent=p&&byId.get(p.parentId),admin=agent&&byId.get(agent.parentId);return {agent:agent?.role==='AGENT'?agent.username:null,admin:admin?.role==='ADMIN'?admin.username:agent?.role==='ADMIN'?agent.username:null};};
 const tableOf=id=>db.tables.find(t=>t.id===id)||{};
 const bucketMonth=days>92,bucketOf=d=>bucketMonth?d.slice(0,7):d;
 const series=new Map();if(bucketMonth){for(let d=from;d<=to;d=addDays(d,1))series.set(d.slice(0,7),{key:d.slice(0,7),rake:0,hands:0});}else for(let d=from;d<=to;d=addDays(d,1))series.set(d,{key:d,rake:0,hands:0});
 const hours=Array.from({length:24},(_,h)=>({hour:h,rake:0,hands:0}));
 const children=new Map(),players=new Map(),tables=new Map(),recent=[],rows=[];
 for(const c of db.users.filter(u=>u.parentId===root.id&&u.role!=='CENTER'))children.set(c.id,{id:c.id,username:c.username,role:c.role,share:['ADMIN','AGENT'].includes(c.role)?pct(c.share):null,rake:0,earned:0,hands:new Set(),players:new Set()});
 let total=0,hands=0,prevTotal=0,prevHands=0,earned=0,prevEarned=0,paid=0;const activePlayers=new Set();
 for(const x of rakes){
  const d=dayFmt.format(x.time),cur=d>=from&&d<=to,prev=d>=pFrom&&d<=pTo;if(!cur&&!prev)continue;
  const parts=x.allocations?x.allocations.map(a=>({pid:a.userId,amount:a.amount,v:via(a.userId)})).filter(a=>a.v&&a.amount>0)
   :root.role==='CENTER'?[{pid:null,amount:x.amount,v:null}]:[];
  const sum=parts.reduce((n,a)=>n+a.amount,0);if(!sum)continue;
  // What the root itself earned from this hand, and what went to members under it.
  const sh=x.shares||[],mine=root.role==='CENTER'?sum-sh.reduce((n,q)=>n+q.amount,0):(sh.find(q=>q.userId===root.id)?.amount||0);
  if(prev){prevTotal+=sum;prevHands++;prevEarned+=mine;continue;}
  earned+=mine;for(const q of sh){if(q.userId===root.id)continue;const v=via(q.userId);if(!v)continue;paid+=q.amount;const c=children.get(v.id);if(c)c.earned=(c.earned||0)+q.amount;}
  total+=sum;hands++;
  const b=series.get(bucketOf(d));if(b){b.rake+=sum;b.hands++;}
  const h=hours[Number(hourFmt.format(x.time))%24];h.rake+=sum;h.hands++;
  const t=tables.get(x.tableId)||tables.set(x.tableId,{id:x.tableId,name:tableOf(x.tableId).name||('Table '+x.tableId),color:tableOf(x.tableId).color||null,sb:tableOf(x.tableId).sb||0,bb:tableOf(x.tableId).bb||0,rake:0,hands:0}).get(x.tableId);t.rake+=sum;t.hands++;
  for(const a of parts){
   if(!a.pid){const k='_legacy';const c=children.get(k)||children.set(k,{id:null,username:'Unattributed (before detailed records)',role:'LEGACY',rake:0,hands:new Set(),players:new Set()}).get(k);c.rake+=a.amount;c.hands.add(x.id);continue;}
   activePlayers.add(a.pid);
   const c=children.get(a.v.id)||children.set(a.v.id,{id:a.v.id,username:a.v.username,role:a.v.role,rake:0,hands:new Set(),players:new Set()}).get(a.v.id);c.rake+=a.amount;c.hands.add(x.id);c.players.add(a.pid);
   const p=players.get(a.pid)||players.set(a.pid,{id:a.pid,username:byId.get(a.pid)?.username||a.pid,...upline(a.pid),rake:0,hands:0}).get(a.pid);p.rake+=a.amount;p.hands++;
   if(detail&&rows.length<20000)rows.push({time:x.time,table:t.name,hand:x.hand??null,player:p.username,agent:p.agent,admin:p.admin,amount:a.amount});
  }
  recent.push({time:x.time,table:t.name,tableId:x.tableId,hand:x.hand??null,amount:sum,parts:parts.map(a=>({player:a.pid?byId.get(a.pid)?.username||a.pid:null,amount:a.amount}))});
 }
 const share=n=>total?Math.round(n/total*1000)/10:0;
 const path=[];for(let u=root,i=0;u&&i<50;u=byId.get(u.parentId),i++){path.unshift({id:u.id,username:u.username,role:u.role});if(u.id===viewer.id)break;}
 return {from,to,days,bucket:bucketMonth?'month':'day',root:{id:root.id,username:root.username,role:root.role,share:['ADMIN','AGENT'].includes(root.role)?pct(root.share):null},path,
  totals:{rake:total,earned,paidToNetwork:paid,hands,players:activePlayers.size,tables:tables.size,avgPerHand:hands?Math.round(total/hands):0},
  previous:{from:pFrom,to:pTo,rake:prevTotal,earned:prevEarned,hands:prevHands},
  series:[...series.values()],hours,
  byChild:[...children.values()].map(c=>({id:c.id,username:c.username,role:c.role,rake:c.rake,earned:c.earned||0,sharePct:c.share??null,hands:c.hands.size,players:c.players.size,share:share(c.rake)})).sort((a,b)=>b.rake-a.rake||a.username.localeCompare(b.username)),
  byPlayer:[...players.values()].map(p=>({...p,share:share(p.rake)})).sort((a,b)=>b.rake-a.rake).slice(0,200),
  byTable:[...tables.values()].map(t=>({...t,share:share(t.rake)})).sort((a,b)=>b.rake-a.rake),
  recent:recent.slice(-60).reverse(),...(detail?{rows}:{})};
}

// ---- Revenue share: the centre gives an admin X% of the rake its network
// generates; the admin gives each agent Y% (Y ≤ X). For every rake contribution
// of a player: the agent gets Y%, the admin X−Y%, the centre the rest. Cents are
// rounded down for the agent and the admin, so the remainder (and any rounding)
// stays with the centre and the rake is always split exactly.
export const pct=v=>{const n=Number(v);return Number.isFinite(n)?Math.min(100,Math.max(0,Math.round(n*100)/100)):0;};
export function rakeShares(db,allocations=[]){
 // Shares are counted in 1/10000 of a cent; what is below a cent is carried on
 // the account (shareCarry) and paid as soon as it adds up, so over time every
 // admin and agent gets exactly its percentage even on micro-stakes.
 const byId=new Map(db.users.map(u=>[u.id,u])),units=new Map(),total=allocations.reduce((n,a)=>n+a.amount,0);
 for(const a of allocations){
  const player=byId.get(a.userId),agent=player&&byId.get(player.parentId),admin=agent&&byId.get(agent.parentId);
  const adminBp=admin?.role==='ADMIN'?Math.round(pct(admin.share)*100):0,agentBp=agent?.role==='AGENT'?Math.min(Math.round(pct(agent.share)*100),adminBp):0;
  if(agentBp)units.set(agent.id,(units.get(agent.id)||0)+a.amount*agentBp);
  if(adminBp>agentBp)units.set(admin.id,(units.get(admin.id)||0)+a.amount*(adminBp-agentBp));
 }
 const shares=[],carry={};let paid=0;
 for(const [id,u] of units){const all=u+(byId.get(id).shareCarry||0);let cents=Math.min(Math.floor(all/10000),total-paid);cents=Math.max(0,cents);carry[id]=all-cents*10000;paid+=cents;if(cents)shares.push({userId:id,role:byId.get(id).role,amount:cents});}
 return {center:total-paid,shares,carry};
}
