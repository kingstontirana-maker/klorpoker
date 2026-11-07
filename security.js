// Fair-play signals and what a player may see of their own hands. Everything here only
// informs the center: shared addresses or one-way money are reasons to look, not proof.
export const SIGNALS={minHands:20,togetherShare:.7,oneWayFlow:100,bigWin:500,bigWithdrawal:500};

// All accounts below an account, at any depth (not the account itself).
export function descendants(users,id){const out=[],seen=new Set([id]);for(let added=true;added;){added=false;for(const u of users)if(seen.has(u.parentId)&&!seen.has(u.id)){seen.add(u.id);out.push(u);added=true;}}return out;}

// The last few addresses and devices an account signed in from.
export function recordSeen(user,ip,device,keep=5){const add=(key,value)=>{if(!value)return;const list=(user[key]||[]).filter(x=>x!==value);list.unshift(value);user[key]=list.slice(0,keep);};add('seenIps',ip);if(typeof device==='string'&&/^[\w-]{8,64}$/.test(device))add('seenDevices',device);}

// Two accounts from one device do not sit at one table. It compares the device of this
// request and of each seat, and the devices each account was seen on before.
export function seatedFromSameDevice(t,user,device,findUser){
 const mine=/^[\w-]{8,64}$/.test(device||'')?device:'';
 return t.seats.some(s=>{if(!s||s.userId===user.id||s.isBot)return false;const other=findUser(s.userId);
  return (!!mine&&(s.device===mine||(other?.seenDevices||[]).includes(mine)))||(!!s.device&&(user.seenDevices||[]).includes(s.device));});
}

// Players who share an address or a device. Family or a café can share an address, so
// a device is the stronger sign.
export function sharedGroups(users,key){const groups=new Map();for(const u of users){if(u.role!=='USER'||u.isBot)continue;for(const value of u[key]||[]){if(!groups.has(value))groups.set(value,[]);groups.get(value).push(u);}}return [...groups.entries()].filter(([,list])=>list.length>1).map(([value,list])=>({value,users:list.map(u=>u.username)}));}

// pairs: {a,b,hands,netA,netB} over a period; handsOf: user id -> hands in that period.
export function pairSignals(users,pairs,handsOf){
 const byId=new Map(users.map(u=>[u.id,u])),shares=(a,b,key)=>(a[key]||[]).some(x=>(b[key]||[]).includes(x)),out=[];
 for(const p of pairs){const a=byId.get(p.a),b=byId.get(p.b);if(!a||!b||a.isBot||b.isBot||p.hands<SIGNALS.minHands)continue;
  const device=shares(a,b,'seenDevices'),ip=shares(a,b,'seenIps'),together=p.hands/Math.max(1,Math.min(handsOf.get(p.a)||0,handsOf.get(p.b)||0)),flow=p.netA*p.netB<0?Math.min(Math.abs(p.netA),Math.abs(p.netB)):0,reasons=[];
  if(device)reasons.push('Same device');if(ip)reasons.push('Same address');if(together>=SIGNALS.togetherShare)reasons.push('Nearly always at the same table');if(flow>=SIGNALS.oneWayFlow)reasons.push('Money moves one way');
  // One reason alone is common among honest players; two together are worth a look.
  if(reasons.length>=2)out.push({players:[a.username,b.username],hands:p.hands,together:Math.round(Math.min(1,together)*100),flow:Math.round(flow*100)/100,winner:flow?(p.netA>0?a.username:b.username):null,reasons,level:device||(flow>=SIGNALS.oneWayFlow&&ip)?'high':'medium'});}
 return out.sort((x,y)=>(x.level===y.level?y.flow-x.flow:x.level==='high'?-1:1));
}

// ---- A player's own hand history: their cards, and others' only if shown at the table ----
const shownIn=h=>new Set((h.shown||[]).map(s=>s.username));
export function handSummaryFor(h,userId){const me=h.players.find(p=>p.userId===userId);return {id:h.id,at:h.startedAt,table:h.table,game:h.game,hand:h.hand,sb:h.sb,bb:h.bb,board:h.board,pot:h.pot,cards:me?.cards||[],result:me?.result??0,won:!!me&&(h.winners||[]).includes(me.username),folded:!!me?.folded,showdown:!!h.showdown};}
export function handFor(h,userId){const shown=shownIn(h);const {players,winningHands,...rest}=h;
 return {...rest,players:players.map(({userId:id,bot,cards,...p})=>({...p,cards:id===userId||shown.has(p.username)?cards:[]})),winningHands:Object.fromEntries(Object.entries(winningHands||{}).filter(([name])=>shown.has(name)))};}
