import {rakeReport,revenueReport,pct,isUnder} from './rake.js';
import {createBots} from './bots.js';
import {createPayments} from './payments.js';
import {openStore} from './store.js';
import {descendants,recordSeen,sharedGroups,pairSignals,handSummaryFor,handFor,SIGNALS} from './security.js';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {createEngine,LIVE,fail,MAX_TABLES} from './game.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));const SAVE=process.env.STATE_FILE||path.join(ROOT,'data','state.json');const PORT=Number(process.env.PORT||3000);const uid=()=>crypto.randomUUID();const money=n=>Math.round(Number(n)*100);const clean=n=>Math.round(n)/100;const secret=()=>crypto.randomBytes(28).toString('hex');const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');const config={minBuyin:2000,maxBuyin:100000};
// A fresh database never uses a known password: CENTER_PASSWORD, or a random one
// that is printed once in the server log.
const DB_FILE=process.env.DB_FILE||path.join(path.dirname(SAVE),'klor.db'),HANDS_FILE=process.env.HANDS_FILE||path.join(path.dirname(SAVE),'hands.jsonl');
export const store=openStore(DB_FILE);export const currentDb=()=>db;
let db=store.load();
if(!db){const moved=store.importFiles(SAVE,HANDS_FILE);if(moved){db=store.load();console.log(`[Klor Poker] Moved to SQLite (${DB_FILE}): ${db.users.length} accounts, ${db.ledger.length} transactions, ${moved.hands} hands${moved.skipped?`, ${moved.skipped} damaged hand lines skipped`:''}. The old files were left untouched.`);}}
if(!db){const salt=secret(),initial=process.env.CENTER_PASSWORD||crypto.randomBytes(9).toString('base64url');if(!process.env.CENTER_PASSWORD)console.log(`[Klor Poker] New database at ${DB_FILE}. Temporary "center" password: ${initial}`);else console.log(`[Klor Poker] New database at ${DB_FILE} ("center" password from CENTER_PASSWORD).`);db={users:[{id:'center',username:'center',role:'CENTER',parentId:null,salt,passHash:hash(initial,salt),balance:1000000*100}],rakePercent:5,ledger:[],tables:[],nextTable:2};store.commit(db);}
// Recover escrowed table stacks after a process restart.
delete db.rakeCap;
for(const seat of db.escrow||[]){const user=db.users.find(u=>u.id===seat.userId);if(user)user.balance+=seat.amount;}db.escrow=[];
let saveFailed=false,draining=false;
export const runtime=new Map();const tokens=new Map();const rakeClients=new Map();const tableSubs=new Map(),inspectSubs=new Map();let pushQueued=false;const save=()=>{db.escrow=[...runtime.values()].flatMap(t=>t.seats.filter(Boolean).map(s=>({userId:s.userId,amount:s.stack+(LIVE.includes(t.phase)?s.committed:0)})));try{store.commit(db);saveFailed=false;}catch(err){saveFailed=true;console.error('[Klor Poker] state not saved',err.message);}queuePush();};
const engine=createEngine({db,save,onSettle:()=>publishRake(),onEquity:()=>queuePush(),onHand:h=>recordHand(h),canDeal:()=>!draining});
// Hand history: every finished hand is one row of its own, stored as it finishes.
function recordHand(h){h.id=db.handSeq=(db.handSeq||0)+1;try{store.addHand(h);}catch(err){console.error('[Klor Poker] hand history not saved',err);}}
const handSummary=h=>({id:h.id,at:h.startedAt,table:h.table,tableId:h.tableId,game:h.game,hand:h.hand,sb:h.sb,bb:h.bb,players:h.players.map(p=>p.username),bots:h.players.filter(p=>p.bot).map(p=>p.username),board:h.board,pot:h.pot,rake:h.rake,winners:h.winners,showdown:h.showdown});
function listHands(body){const filter={table:body.table?String(body.table):'',player:String(body.player||'').trim().toLowerCase(),from:Number(body.from)||0,to:Number(body.to)||Infinity,before:Number(body.before)||Infinity},limit=Math.max(1,Math.min(200,Number(body.limit)||50)),rows=store.listHands(filter,limit+1);return {hands:rows.slice(0,limit).map(handSummary),more:rows.length>limit,total:db.handSeq||0};}
// Each table has a felt colour (#rrggbb); the whole table design is derived from it.
const DEFAULT_COLOR='#1f9d6b',validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
const GAME_TYPES=['holdem','omaha'];
// Nobody seated or waiting, no hand running and no house player assigned to it.
const tableIdle=t=>!t.seats.some(Boolean)&&['waiting','finished'].includes(t.phase)&&!t.waitlist?.length&&!t.waitOffer&&!db.users.some(x=>x.isBot&&x.bot?.enabled&&x.bot.tableId===t.id);
const makeTable=(id,name,sb,bb,color,game)=>{const t=engine.makeTable(id,name,sb,bb,GAME_TYPES.includes(game)?game:'holdem');t.color=validColor(color)?color.toLowerCase():DEFAULT_COLOR;runtime.set(t.id,t);return t;};
if(!db.tables.length)db.tables=[{id:'1',name:'Emerald One',sb:100,bb:200}];for(const t of db.tables)makeTable(t.id,t.name,t.sb,t.bb,t.color,t.game);
// Every agent has an invite code; players register through an agent's link (/?ref=CODE)
// and land directly under that agent with an empty wallet.
const newInvite=()=>{let c;do c=crypto.randomBytes(5).toString('hex').toUpperCase();while(db.users.some(x=>x.inviteCode===c));return c;};
for(const a of db.users)if(a.role==='AGENT'&&!a.inviteCode)a.inviteCode=newInvite();save();
// Sessions end after SESSION_IDLE_MS without any request (closed tab) and after
// SESSION_MAX_MS at most. One account has one session: a new login signs out the old one.
const SESSION_IDLE_MS=Number(process.env.SESSION_IDLE_MS||30*60000),SESSION_MAX_MS=Number(process.env.SESSION_MAX_MS||12*3600000);
const endReasons=new Map();
// Sessions are kept by a hash of the token, in memory and in the database, so a restart
// signs nobody out and the database cannot be used to sign in.
const tokenKey=token=>crypto.createHash('sha256').update(String(token)).digest('hex');
const storeTry=fn=>{try{return fn();}catch(err){console.error('[Klor Poker] session not saved',err.message);}};
function openSession(userId,ip){const token=secret(),now=Date.now(),s={userId,created:now,lastSeen:now,storedAt:now,ip};tokens.set(tokenKey(token),s);storeTry(()=>store.putSession(tokenKey(token),s));return token;}
function endKey(key,reason){const s=tokens.get(key);if(!s)return;tokens.delete(key);storeTry(()=>store.delSession(key));if(reason){endReasons.set(key,reason);if(endReasons.size>5000)endReasons.delete(endReasons.keys().next().value);}for(const [client,t] of rakeClients)if(tokenKey(t)===key){client.end();rakeClients.delete(client);}}
const endSession=(token,reason)=>endKey(tokenKey(token),reason);
function endUserSessions(userId,reason,except){const keep=except&&tokenKey(except);for(const [key,s] of tokens)if(s.userId===userId&&key!==keep)endKey(key,reason);}
for(const [key,s] of store.sessions()){if(Date.now()-s.lastSeen>SESSION_IDLE_MS||Date.now()-s.created>SESSION_MAX_MS)store.delSession(key);else tokens.set(key,s);}
const sessionUser=key=>{const s=tokens.get(key);if(!s)return null;const now=Date.now();if(now-s.lastSeen>SESSION_IDLE_MS||now-s.created>SESSION_MAX_MS){endKey(key,'Your session has ended. Please sign in again.');return null;}s.lastSeen=now;if(now-(s.storedAt||0)>60000){s.storedAt=now;storeTry(()=>store.putSession(key,s));}const u=db.users.find(u=>u.id===s.userId);if(!u||u.blocked){endKey(key,'This account is blocked.');return null;}return u;};
const me=token=>sessionUser(tokenKey(token));
setInterval(()=>{for(const key of [...tokens.keys()])sessionUser(key);},60000).unref();
// Failed sign-ins are limited per address and account: 5 tries, then 15 minutes' wait.
const loginFails=new Map();const LOGIN_LIMIT=5,LOGIN_LOCK_MS=15*60000;
// Registration attempts per address: 10 per hour.
const registerTries=new Map();const REGISTER_LIMIT=10,REGISTER_WINDOW_MS=3600000;
const clientIp=req=>String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'';
const samePassword=(user,password)=>{const a=Buffer.from(hash(password,user.salt),'hex'),b=Buffer.from(user.passHash,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b);};
const strongEnough=p=>typeof p==='string'&&p.length>=8&&p.length<=128&&/[A-Za-z]/.test(p)&&/\d/.test(p);
const PASSWORD_RULE='The password must have at least 8 characters, with letters and numbers.';
function leaveAllTables(user,reason){for(const t of runtime.values())if(t.seats.some(s=>s?.userId===user.id)){try{engine.leave(t,user);}catch{}}}const roleCheck=(u,...roles)=>{if(!roles.includes(u.role))fail('Forbidden',403);};const childOf=(u,p)=>u.parentId===p.id;
// Revenue-share percentage for a new or existing admin/agent, within the parent's own.
function shareFor(parent,role,value,required=false){if(!['ADMIN','AGENT'].includes(role))return null;if(value===undefined||value===null||value===''){if(required)fail('Enter the percentage');return 0;}const n=Number(value);if(!Number.isFinite(n)||n<0||n>100)fail('The percentage must be 0–100%');const share=pct(n),limit=parent.role==='CENTER'?100:pct(parent.share);if(share>limit)fail(`The percentage cannot be higher than yours (${limit}%)`);return share;}
function stateFor(u){return {user:{id:u.id,username:u.username,role:u.role,parentId:u.parentId,balance:clean(u.balance),...(['ADMIN','AGENT'].includes(u.role)?{share:pct(u.share)}:{}),...(u.role==='AGENT'?{invite:u.inviteCode}:{})},lastTableExit:u.tableExit||null,...(u.role!=='USER'?{rakePercent:db.rakePercent}:{}),seatedTableId:[...runtime.values()].find(t=>t.seats.some(s=>s?.userId===u.id))?.id||null,
 ...(u.role==='USER'?{myTables:[...runtime.values()].flatMap(t=>{const s=t.seats.find(x=>x?.userId===u.id);return s?[{id:t.id,name:t.name,game:t.game,stack:clean(s.stack),myTurn:LIVE.includes(t.phase)&&!t.runout&&t.turn>=0&&t.seats[t.turn]?.userId===u.id,deadline:t.turn>=0?t.deadline:null,sittingOut:!!s.sittingOut}]:[];}),waitlists:[...runtime.values()].flatMap(t=>{const w=engine.waitInfo(t,u.id);return w.position?[{tableId:t.id,name:t.name,position:w.position,count:w.count,offerUntil:w.offerUntil}]:[];}),maxTables:MAX_TABLES}:{}),minBuyin:clean(config.minBuyin),maxBuyin:clean(config.maxBuyin),tables:[...runtime.values()].map(t=>{const l=engine.buyinLimits(t);return {id:t.id,name:t.name,game:t.game,color:t.color,sb:clean(t.sb),bb:clean(t.bb),players:t.seats.filter(Boolean).length,waiting:(t.waitlist||[]).length,...(u.role==='CENTER'?{bots:t.seats.filter(s=>s?.isBot).length}:{}),minBuyin:clean(l.min),maxBuyin:clean(l.max),phase:t.phase,hand:t.hand};})};}
function staffRakeReport(u){const r=rakeReport(withOldRake(),u);return {...r,total:clean(r.total),today:clean(r.today),legacyTotal:clean(r.legacyTotal),...(r.botTotal!=null?{botTotal:clean(r.botTotal),botToday:clean(r.botToday)}:{}),rows:r.rows.map(x=>({...x,amount:clean(x.amount),...(x.bot!=null?{bot:clean(x.bot)}:{})})),percent:db.rakePercent,serverNow:Date.now()};}
function publishRake(){for(const [res,token] of rakeClients){const u=me(token);if(!u||u.role==='USER'){res.end();rakeClients.delete(res);continue;}res.write('data: '+JSON.stringify(staffRakeReport(u))+'\n\n');}}
// Older rake rows for reports: read once, kept while reports are in use, then released.
let oldRake=null,oldRakeTimer=null;
function withOldRake(){if(!oldRake)oldRake=store.olderRake();clearTimeout(oldRakeTimer);oldRakeTimer=setTimeout(()=>{oldRake=null;},120000);oldRakeTimer.unref();return oldRake.length?{...db,ledger:[...oldRake,...db.ledger]}:db;}
// Newest 100 entries a viewer may see; older ones are read in pages only if needed.
function ledgerFor(u){const view=x=>{if(u.role==='CENTER')return [x];if(x.type==='RAKE'){const s=x.shares?.find(s=>s.userId===u.id);return s?[{id:x.id,type:'COMMISSION',to:u.id,tableId:x.tableId,hand:x.hand,amount:s.amount,time:x.time}]:[];}return x.from===u.id||x.to===u.id?[x]:[];};let out=db.ledger.flatMap(view).slice(-100),before=Infinity;for(let page=0;out.length<100&&page<50;page++){const older=store.olderLedger(before);if(!older.rows.length)break;out=[...older.rows.flatMap(view),...out].slice(-100);before=older.seq;}return out.reverse().map(x=>({...x,amount:clean(x.amount)}));}
// ---- Activity log: every change staff make, written after it succeeded ----
const AUDITED=new Set(['rake','tables/create','tables/update','tables/delete','tables/color','users/create','users/password','users/status','users/share','users/mute','transfer','invite/reset','moderation/resolve','bots/create','bots/configure','bots/status','bots/delete','bots/guard','bots/settings','crypto/settings','crypto/assign','crypto/ignore','crypto/withdrawal']);
const SECRET_FIELDS=new Set(['password','current','next','token','device']);
function audit(user,action,body,req,extra={}){try{const details=Object.fromEntries(Object.entries(body||{}).filter(([k])=>!SECRET_FIELDS.has(k)));const target=db.users.find(x=>x.id===body?.userId)?.username||runtime.get(String(body?.id??''))?.name||body?.username||body?.name||null;store.addAudit({at:Date.now(),actorId:user.id,actor:user.username,role:user.role,action,target,details:{...details,...extra},ip:clientIp(req)});}catch(err){console.error('[Klor Poker] activity not logged',err.message);}}
// The value before the change, where it is worth showing.
function auditBefore(action,body){if(action==='rake')return {before:db.rakePercent};if(action==='users/share')return {before:pct(db.users.find(x=>x.id===body.userId)?.share)};if(action==='tables/update'){const t=db.tables.find(x=>x.id===String(body.id||''));return t?{before:{name:t.name,sb:clean(t.sb),bb:clean(t.bb),game:t.game}}:{};}return {};}
// ---- Things that need a person's attention ----
const inView=(u,target)=>u.role==='CENTER'||isUnder(db,target,u.id);
function securityReport(days=30){const since=Date.now()-days*86400000,totals=new Map(store.playerTotals(since).map(t=>[t.id,t.hands]));return {days,signals:pairSignals(db.users,store.pairStats(since,SIGNALS.minHands),totals),sharedDevices:sharedGroups(db.users,'seenDevices'),sharedIps:sharedGroups(db.users,'seenIps'),limits:SIGNALS};}
function alertsFor(u){const out=[],add=(level,panel,text)=>out.push({level,panel,text}),day=Date.now()-86400000;
 const open=store.listReports('open').filter(r=>inView(u,r.target_id));if(open.length)add('warn','moderation',open.length+(open.length>1?' chat reports':' chat report')+' to review');
 for(const t of store.playerTotals(day))if(t.net>=SIGNALS.bigWin){const p=db.users.find(x=>x.id===t.id);if(p&&!p.isBot&&inView(u,p.id))add('warn','reports',p.username+' won '+t.net.toFixed(2)+' € in 24 hours ('+t.hands+' hands)');}
 if(u.role==='CENTER'){const c=db.crypto||{},pending=(c.withdrawals||[]).filter(w=>w.status==='pending'),big=pending.filter(w=>w.cents/100>=SIGNALS.bigWithdrawal).length,unmatched=(c.unmatched||[]).filter(x=>!x.status||x.status==='open').length;
  if(pending.length)add(big?'high':'warn','crypto',pending.length+(pending.length>1?' withdrawals':' withdrawal')+' waiting'+(big?' · '+big+' large':''));if(unmatched)add('warn','crypto',unmatched+' crypto '+(unmatched>1?'transfers':'transfer')+' without a player');
  for(const b of db.users.filter(x=>x.isBot&&x.bot?.error))add('info','bots',b.username+' stopped: '+b.bot.error);
  const signals=securityReport().signals;if(signals.length)add(signals.some(s=>s.level==='high')?'high':'warn','security',signals.length+(signals.length>1?' pairs':' pair')+' of players to check');}
 const order={high:0,warn:1,info:2};return out.sort((a,b)=>order[a.level]-order[b.level]);}
async function route(req,res,url,body){const p=url.pathname,token=(req.headers.authorization||'').replace(/^Bearer /,'')||(p.endsWith('/away')&&typeof body.token==='string'?body.token:'');if(p==='/api/login'){const name=String(body.username||'').toLowerCase().slice(0,40),key=clientIp(req)+'|'+name,now=Date.now(),rec=loginFails.get(key);if(rec&&rec.until>now)fail(`Too many failed attempts. Try again in ${Math.ceil((rec.until-now)/60000)} minutes.`,429);const user=db.users.find(x=>x.username.toLowerCase()===name&&!x.isBot);if(!user||!samePassword(user,String(body.password||''))){const r=rec&&now-rec.first<LOGIN_LOCK_MS?rec:{count:0,first:now,until:0};r.count++;if(r.count>=LOGIN_LIMIT)r.until=now+LOGIN_LOCK_MS;loginFails.set(key,r);fail('Wrong username or password',401);}loginFails.delete(key);if(user.blocked)fail('This account is blocked. Contact your manager.',403);endUserSessions(user.id,'You signed in on another device. This session was closed.');const t=openSession(user.id,clientIp(req));user.lastLoginAt=now;user.lastLoginIp=clientIp(req);recordSeen(user,clientIp(req),body.device);save();if(user.role!=='USER')audit(user,'login',{},req);return {token:t,...stateFor(user)};}
if(p==='/api/register'){const ip=clientIp(req),now=Date.now(),rec=registerTries.get(ip);const r=rec&&now-rec.first<REGISTER_WINDOW_MS?rec:{count:0,first:now};if(r.count>=REGISTER_LIMIT)fail('Too many attempts. Please try again later.',429);r.count++;registerTries.set(ip,r);if(registerTries.size>20000)registerTries.delete(registerTries.keys().next().value);
 const username=String(body.username||'').trim(),password=String(body.password||''),code=String(body.code||'').trim().toUpperCase();
 if(body.adult!==true)fail('You must be 18 or older to register.');if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))fail('Username: 3–24 characters, letters, numbers or _');if(!strongEnough(password))fail(PASSWORD_RULE);
 const agent=/^[0-9A-F]{10}$/.test(code)&&db.users.find(x=>x.role==='AGENT'&&x.inviteCode===code&&!x.blocked);if(!agent)fail('Invalid invite code. Ask your agent for their invite link.');
 if(db.users.some(x=>x.username.toLowerCase()===username.toLowerCase()))fail('That username is taken');
 const salt=secret(),user={id:uid(),username,role:'USER',parentId:agent.id,salt,passHash:hash(password,salt),balance:0,registeredAt:now,lastLoginAt:now,lastLoginIp:ip};recordSeen(user,ip,body.device);db.users.push(user);db.ledger.push({id:uid(),type:'REGISTER',from:agent.id,to:user.id,amount:0,time:now});
 const t=openSession(user.id,ip);save();return {token:t,...stateFor(user)};}
if(p==='/api/public/stats'){const tables=[...runtime.values()];return {tables:tables.length,players:tables.reduce((n,t)=>n+t.seats.filter(Boolean).length,0),live:tables.filter(t=>LIVE.includes(t.phase)).length,featured:tables.slice().sort((a,b)=>b.seats.filter(Boolean).length-a.seats.filter(Boolean).length).slice(0,6).map(t=>({name:t.name,game:t.game,color:t.color,sb:clean(t.sb),bb:clean(t.bb),players:t.seats.filter(Boolean).length,live:LIVE.includes(t.phase)}))};}
if(p==='/api/health'){let ok=false;try{ok=store.ping();}catch{}if(!ok||saveFailed)fail('unhealthy',503);return {ok:true,uptime:Math.round(process.uptime()),restarting:draining};}
if(p==='/api/logout'){endSession(token);return {ok:true};}const u=me(token);if(!u)fail(endReasons.get(tokenKey(token))||'Sign in to continue.',401);
if(req.headers['x-klor-visible']==='1'&&u.role==='USER'){const now=Date.now();for(const t of runtime.values())for(const seat of t.seats)if(seat?.userId===u.id&&!seat.sittingOut)seat.lastSeen=now;}
if(p==='/api/state')return stateFor(u);
{const bots=botManager.route(p,body,u);if(bots!==undefined)return bots;}
{const pay=payments.route(p,body,u);if(pay!==undefined)return pay;}
if(p==='/api/invite/reset'){roleCheck(u,'AGENT');u.inviteCode=newInvite();save();return {invite:u.inviteCode};}
if(p==='/api/users'){roleCheck(u,'CENTER','ADMIN','AGENT');return db.users.filter(x=>x.parentId===u.id&&!x.isBot).map(x=>({id:x.id,username:x.username,role:x.role,balance:clean(x.balance),...(['ADMIN','AGENT'].includes(x.role)?{share:pct(x.share)}:{}),blocked:!!x.blocked,below:['ADMIN','AGENT'].includes(x.role)?descendants(db.users,x.id).filter(d=>!d.isBot).length:0,mutedUntil:x.mutedUntil>Date.now()?x.mutedUntil:null,lastLoginAt:x.lastLoginAt||null,online:[...tokens.values()].some(s=>s.userId===x.id)}));}
// Your own password; other sessions of the account are signed out.
if(p==='/api/password'){if(!samePassword(u,String(body.current||'')))fail('The current password is wrong',400);if(!strongEnough(body.next))fail(PASSWORD_RULE);u.salt=secret();u.passHash=hash(body.next,u.salt);endUserSessions(u.id,'Your password was changed. Please sign in again.',token);save();return {ok:true};}
// Staff manage their direct accounts: new password, block and unblock.
if(p==='/api/users/password'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child)fail('Direct subordinate not found',404);if(!strongEnough(body.password))fail(PASSWORD_RULE);child.salt=secret();child.passHash=hash(body.password,child.salt);endUserSessions(child.id,'Your password was changed by your manager. Please sign in again.');save();return {ok:true};}
if(p==='/api/users/status'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child)fail('Direct subordinate not found',404);child.blocked=!!body.blocked;const mark=(x,blocked)=>{if(blocked){endUserSessions(x.id,'This account is blocked.');leaveAllTables(x);}db.ledger.push({id:uid(),type:blocked?'BLOCK':'UNBLOCK',from:u.id,to:x.id,amount:0,time:Date.now()});};mark(child,child.blocked);
 // Optionally everyone below as well. Unblocking restores exactly those accounts, not
 // ones that were already blocked for their own reasons.
 let network=0;if(child.blocked&&body.network===true){for(const x of descendants(db.users,child.id))if(!x.isBot&&!x.blocked){x.blocked=true;x.blockedBy=child.id;mark(x,true);network++;}}else if(!child.blocked){for(const x of descendants(db.users,child.id))if(x.blockedBy===child.id){x.blocked=false;delete x.blockedBy;mark(x,false);network++;}}
 delete child.blockedBy;save();return {ok:true,blocked:child.blocked,network};}
if(p==='/api/users/create'){roleCheck(u,'CENTER','ADMIN','AGENT');const expected={CENTER:'ADMIN',ADMIN:'AGENT',AGENT:'USER'}[u.role];const username=String(body.username||'').trim();const password=String(body.password||'');if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))fail('Username: 3–24 characters, letters, numbers or _');if(!strongEnough(password))fail(PASSWORD_RULE);if(db.users.some(x=>x.username.toLowerCase()===username.toLowerCase()))fail('Username exists');const salt=secret();const share=shareFor(u,expected,body.share);db.users.push({id:uid(),username,role:expected,parentId:u.id,salt,passHash:hash(password,salt),balance:0,...(share!==null?{share}:{}),...(expected==='AGENT'?{inviteCode:newInvite()}:{})});save();return {ok:true,role:expected,share};}
// Change a direct admin's or agent's percentage. Lowering an admin below its agents
// brings those agents down to the new limit. Applies to the following hands only.
if(p==='/api/users/share'){roleCheck(u,'CENTER','ADMIN');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child||!['ADMIN','AGENT'].includes(child.role))fail('Direct subordinate not found',404);const share=shareFor(u,child.role,body.share,true);const old=pct(child.share);child.share=share;const capped=[];if(child.role==='ADMIN')for(const a of db.users.filter(x=>x.parentId===child.id&&x.role==='AGENT'&&pct(x.share)>share)){capped.push(a.username);db.ledger.push({id:uid(),type:'SHARE',from:child.id,to:a.id,amount:0,share,oldShare:pct(a.share),reason:'CAPPED',time:Date.now()});a.share=share;}db.ledger.push({id:uid(),type:'SHARE',from:u.id,to:child.id,amount:0,share,oldShare:old,time:Date.now()});save();return {ok:true,share,capped};}
if(p==='/api/transfer'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u)&&!x.isBot);if(!child)fail('Direct subordinate not found',404);const amount=money(body.amount);if(!Number.isSafeInteger(amount)||amount<=0)fail('Invalid amount');if(body.direction==='send'){if(u.balance<amount)fail('Insufficient balance');u.balance-=amount;child.balance+=amount;}else if(body.direction==='return'){if(child.balance<amount)fail('Insufficient child balance');child.balance-=amount;u.balance+=amount;}else fail('Direction invalid');db.ledger.push({id:uid(),type:'TRANSFER',from:body.direction==='send'?u.id:child.id,to:body.direction==='send'?child.id:u.id,amount,time:Date.now()});save();return {ok:true};}
// Revenue report: who generated the rake, how and when, for the viewer's own network.
// A player's own hands and numbers.
if(p==='/api/my/hands'){roleCheck(u,'USER');const limit=Math.max(1,Math.min(100,Number(body.limit)||30)),rows=store.playerHands(u.id,Number(body.before)||Infinity,limit+1);return {hands:rows.slice(0,limit).map(h=>handSummaryFor(h,u.id)),more:rows.length>limit};}
if(p==='/api/my/hands/get'){roleCheck(u,'USER');const hand=store.getHand(Number(body.id));if(!hand||!hand.players.some(x=>x.userId===u.id))fail('Hand not found',404);return handFor(hand,u.id);}
if(p==='/api/my/stats'){roleCheck(u,'USER');const days=[7,30,90].includes(Number(body.days))?Number(body.days):0;return store.playerStats(u.id,days?Date.now()-days*86400000:0);}
// Chat moderation: staff act on players in their own network.
if(p==='/api/users/mute'){roleCheck(u,'CENTER','ADMIN','AGENT');const target=db.users.find(x=>x.id===body.userId&&x.role==='USER');if(!target||!inView(u,target.id))fail('Player not found in your network',404);const minutes=Number(body.minutes);if(!Number.isFinite(minutes)||minutes<0||minutes>10080)fail('Mute for 0 to 10080 minutes');if(minutes)target.mutedUntil=Date.now()+minutes*60000;else delete target.mutedUntil;save();return {ok:true,mutedUntil:target.mutedUntil||null};}
if(p==='/api/moderation'){roleCheck(u,'CENTER','ADMIN','AGENT');return {reports:store.listReports(body.status==='closed'?'closed':'open').filter(r=>inView(u,r.target_id)).map(r=>({id:r.id,at:r.at,reporter:r.reporter,target:r.target,targetId:r.target_id,table:r.table_name,message:r.message,status:r.status,resolvedBy:r.resolved_by,outcome:r.outcome}))};}
if(p==='/api/moderation/resolve'){roleCheck(u,'CENTER','ADMIN','AGENT');const r=store.getReport(Number(body.id));if(!r||!inView(u,r.target_id))fail('Report not found',404);if(r.status!=='open')fail('This report was already handled');const minutes=Number(body.minutes)||0;if(minutes<0||minutes>10080)fail('Mute for 0 to 10080 minutes');const target=db.users.find(x=>x.id===r.target_id);if(minutes&&target){target.mutedUntil=Date.now()+minutes*60000;save();}store.resolveReport(r.id,u.username,minutes?'muted '+minutes+' min':'dismissed');return {ok:true};}
// Center: activity log and fair-play signals. Everyone on staff: what needs attention, and a player report.
if(p==='/api/audit'){roleCheck(u,'CENTER');const limit=Math.max(1,Math.min(200,Number(body.limit)||50)),rows=store.listAudit({before:Number(body.before)||Infinity,actor:String(body.actor||'').trim().toLowerCase(),action:String(body.action||''),limit:limit+1});return {rows:rows.slice(0,limit),more:rows.length>limit};}
if(p==='/api/security'){roleCheck(u,'CENTER');return securityReport([7,30,90].includes(Number(body.days))?Number(body.days):30);}
if(p==='/api/alerts'){roleCheck(u,'CENTER','ADMIN','AGENT');return {alerts:alertsFor(u)};}
if(p==='/api/reports/players'){roleCheck(u,'CENTER','ADMIN','AGENT');const days=Number(body.days)||0,since=days?Date.now()-days*86400000:0,totals=new Map(store.playerTotals(since).map(t=>[t.id,t])),players=db.users.filter(x=>x.role==='USER'&&!x.isBot&&inView(u,x.id)),byId=new Map(db.users.map(x=>[x.id,x])),rake=new Map();for(const x of withOldRake().ledger)if(x.type==='RAKE'&&x.time>=since)for(const a of x.allocations||[])if(!a.bot)rake.set(a.userId,(rake.get(a.userId)||0)+a.amount);return {days,rows:players.map(x=>{const t=totals.get(x.id);return {id:x.id,username:x.username,agent:byId.get(x.parentId)?.username||'',balance:clean(x.balance),hands:t?.hands||0,net:Math.round((t?.net||0)*100)/100,rake:clean(rake.get(x.id)||0),lastPlayed:t?.last||null,lastLogin:x.lastLoginAt||null,registered:x.registeredAt||null,blocked:!!x.blocked};})};}
if(p==='/api/hands'){roleCheck(u,'CENTER');return listHands(body);}
if(p==='/api/hands/get'){roleCheck(u,'CENTER');const hand=store.getHand(Number(body.id));if(!hand)fail('Hand not found',404);return hand;}
if(p==='/api/revenue'){roleCheck(u,'CENTER','ADMIN','AGENT');const r=revenueReport(withOldRake(),u,{from:body.from,to:body.to,scope:body.scope?String(body.scope):undefined,detail:!!body.detail,includeBots:u.role==='CENTER'&&body.includeBots===true});const e=x=>({...x,rake:clean(x.rake)});return {...r,totals:{...r.totals,rake:clean(r.totals.rake),earned:clean(r.totals.earned),paidToNetwork:clean(r.totals.paidToNetwork),...(r.totals.botRake!=null?{botRake:clean(r.totals.botRake)}:{}),avgPerHand:clean(r.totals.avgPerHand)},previous:{...e(r.previous),earned:clean(r.previous.earned)},series:r.series.map(e),hours:r.hours.map(e),byChild:r.byChild.map(x=>({...e(x),earned:clean(x.earned)})),byPlayer:r.byPlayer.map(e),byTable:r.byTable.map(x=>({...e(x),sb:clean(x.sb),bb:clean(x.bb)})),recent:r.recent.map(x=>({...x,amount:clean(x.amount),parts:x.parts.map(q=>({...q,amount:clean(q.amount)}))})),...(r.rows?{rows:r.rows.map(x=>({...x,amount:clean(x.amount)}))}:{})};}
if(p==='/api/rake/report'){roleCheck(u,'CENTER','ADMIN','AGENT');return staffRakeReport(u);}
if(p==='/api/rake'){roleCheck(u,'CENTER');const value=Number(body.percent);if(!Number.isFinite(value)||value<0||value>15)fail('Rake must be 0–15%');db.rakePercent=value;save();publishRake();return{ok:true};}
if(p==='/api/tables/create'){roleCheck(u,'CENTER');const name=String(body.name||'').trim().slice(0,40),sb=money(body.sb),bb=money(body.bb);if(!name||!Number.isSafeInteger(sb)||!Number.isSafeInteger(bb)||sb<=0||bb<sb*2)fail('Invalid table configuration');if(body.color!==undefined&&!validColor(body.color))fail('Invalid table colour');const game=body.game===undefined?'holdem':String(body.game);if(!GAME_TYPES.includes(game))fail('Invalid game type');const color=validColor(body.color)?body.color.toLowerCase():DEFAULT_COLOR;const id=String(db.nextTable++);db.tables.push({id,name,sb,bb,color,game});makeTable(id,name,sb,bb,color,game);save();return {id,color,game};}
// The centre can recolour an existing table; players see it on the next update.
// Edit a table: the name at any time; blinds and game only while it is empty.
if(p==='/api/tables/update'){roleCheck(u,'CENTER');const id=String(body.id||''),t=runtime.get(id),rec=db.tables.find(x=>x.id===id);if(!t||!rec)fail('Table not found',404);const name=body.name===undefined?rec.name:String(body.name).trim().slice(0,40);if(!name)fail('Enter a table name');const sb=body.sb===undefined?rec.sb:money(body.sb),bb=body.bb===undefined?rec.bb:money(body.bb),game=body.game===undefined?(t.game||'holdem'):String(body.game);if(!Number.isSafeInteger(sb)||!Number.isSafeInteger(bb)||sb<=0||bb<sb*2)fail('Invalid table configuration');if(!GAME_TYPES.includes(game))fail('Invalid game type');if(sb!==rec.sb||bb!==rec.bb||game!==(t.game||'holdem')){if(!tableIdle(t))fail('Blinds and game can change only while the table is empty');rec.sb=t.sb=sb;rec.bb=t.bb=t.minRaise=bb;rec.game=t.game=game;}rec.name=t.name=name;save();return {ok:true};}
// Close a table nobody uses: it leaves the lobby; its hand history stays.
if(p==='/api/tables/delete'){roleCheck(u,'CENTER');const id=String(body.id||''),t=runtime.get(id),i=db.tables.findIndex(x=>x.id===id);if(!t||i<0)fail('Table not found',404);if(db.tables.length<2)fail('Keep at least one table');if(!tableIdle(t))fail('Only an empty table can be closed');db.tables.splice(i,1);runtime.delete(id);save();return {ok:true};}
if(p==='/api/tables/color'){roleCheck(u,'CENTER');const t=runtime.get(String(body.id||'')),rec=db.tables.find(x=>x.id===String(body.id||''));if(!t||!rec)fail('Table not found',404);if(!validColor(body.color))fail('Invalid table colour');t.color=rec.color=body.color.toLowerCase();save();return {ok:true,color:t.color};}
if(p==='/api/ledger'){roleCheck(u,'CENTER','ADMIN','AGENT','USER');return ledgerFor(u);}
if(p.startsWith('/api/table/')){let parts=p.split('/'),t=runtime.get(parts[3]);if(!t)fail('Table not found',404);const seated=t.seats.some(s=>s?.userId===u.id);if(u.role!=='USER')fail('Use your management panel',403);if(!seated&&u.balance<=0)fail('Your credit is zero. Contact your agent to add credit.',403);
if(parts[4]==='state')return engine.snapshot(t,u.id,url.searchParams.get('bg')!=='1');
if(parts[4]==='rebuy'){engine.rebuy(t,u,body.amount);return {ok:true};}
if(['sit','start','rebuy'].includes(parts[4])&&draining)fail('The server is restarting. Please try again in a moment.',503);
if(parts[4]==='sit'){engine.sit(t,u,body.position,body.buyin,[...runtime.values()]);return {ok:true};}
if(parts[4]==='leave')return engine.leave(t,u);
if(parts[4]==='sitout'){engine.sitOut(t,u,!!body.value);return {ok:true};}
if(parts[4]==='show'){engine.show(t,u);return {ok:true};}
if(parts[4]==='away'){engine.away(t,u);return {ok:true};}
if(parts[4]==='timebank'){engine.useTimeBank(t,u);return {ok:true};}
if(parts[4]==='chat'){engine.chat(t,u,body.text);return {ok:true};}
if(parts[4]==='report'){const m=(t.chat||[]).find(x=>x.id===Number(body.message)),target=m&&db.users.find(x=>x.username===m.user);if(!m||!target)fail('Message not found',404);if(target.id===u.id)fail('You cannot report your own message');if(store.reportExists(u.id,target.id,m.text))return {ok:true};store.addReport({at:Date.now(),reporterId:u.id,reporter:u.username,targetId:target.id,target:target.username,table:t.name,message:m.text});return {ok:true};}
if(parts[4]==='waitlist'){save();return body.join===false?engine.leaveWaitlist(t,u):engine.joinWaitlist(t,u);}
if(parts[4]==='start'){if(!['waiting','finished'].includes(t.phase))fail('A hand is in progress');if(!seated)fail('You are not seated at this table');if(!engine.startHand(t))fail('At least two players with chips are needed');save();return {ok:true};}
if(parts[4]==='action'){engine.act(t,u.id,body.type,body.amount);return{ok:true};}}
fail('Not found',404);}
export const tickTable=(t,now=Date.now())=>engine.tickTable(t,now);
// Live tables: every connected player receives their own view as soon as the
// table changes (and every 2 s as a heartbeat). Presence comes only from the
// player's own requests (a half-open socket proves nothing); when the
// stream closes the away protection starts at once.
// Every few seconds, a player with an open table connection (tab visible or not) is
// present at all of their seats.
setInterval(()=>{const now=Date.now(),users=new Set([...tableSubs.values()].map(s=>s.userId));if(!users.size)return;for(const t of runtime.values())for(const seat of t.seats)if(seat&&users.has(seat.userId))seat.lastSeen=now;},3000).unref();
function pushTables(){pushQueued=false;pushInspect();for(const [res,sub] of tableSubs){const u=me(sub.token),t=runtime.get(sub.tableId);if(!u||!t||u.role!=='USER'){res.end();tableSubs.delete(res);continue;}try{res.write('data: '+JSON.stringify(engine.snapshot(t,u.id,false))+'\n\n');}catch{tableSubs.delete(res);}}}
function queuePush(){if(!pushQueued&&(tableSubs.size||inspectSubs.size)){pushQueued=true;setImmediate(pushTables);}}
setInterval(()=>{if(tableSubs.size||inspectSubs.size)pushTables();},1000).unref();
// A connection that drops (tunnel, network change) gets time to come back before the
// player counts as away. Closing the page on purpose still takes 5 seconds.
const RECONNECT_GRACE_MS=20000;
function openTableStream(req,res,tableId){const token=(req.headers.authorization||'').replace(/^Bearer /,''),u=me(token);if(!u)fail('Sign in to continue.',401);if(u.role!=='USER')fail('Forbidden',403);const t=runtime.get(tableId);if(!t)fail('Table not found',404);if(!t.seats.some(s=>s?.userId===u.id)&&u.balance<=0)fail('Your credit is zero. Contact your agent to add credit.',403);
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});
 tableSubs.set(res,{token,userId:u.id,tableId});res.write('data: '+JSON.stringify(engine.snapshot(t,u.id))+'\n\n');
 const beat=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);beat.unref();
 res.on('close',()=>{clearInterval(beat);tableSubs.delete(res);if(![...tableSubs.values()].some(s=>s.userId===u.id&&s.tableId===tableId))engine.away(t,u,RECONNECT_GRACE_MS);});}
setInterval(()=>{for(const t of runtime.values())tickTable(t);},250).unref();
// Table-filling bots act from the server; they are never logged in.
const botManager=createBots({db,runtime,engine,save,olderRake:()=>store.olderRake()});
setInterval(()=>{try{botManager.tick();}catch(err){console.error('[Klor Poker] bots',err);}},500).unref();
// Crypto deposits: the blockchain is checked every 30 seconds while a deposit is open.
const payments=createPayments({db,save,fail});
setInterval(()=>{payments.scan().catch(err=>console.error('[Klor Poker] crypto scan',err.message));},30000).unref();
// Center inspection: every table with every hole card, live. Only the center
// account can open it, it can never sit at a table, and each session is logged.
// Players at one table who connect from the same address are flagged.
function inspectView(){
 const ipOf=userId=>{for(const s of tokens.values())if(s.userId===userId)return s.ip;return db.users.find(u=>u.id===userId)?.lastLoginIp||null;};
 const tables=[...runtime.values()].map(t=>{const view=engine.inspect(t),byIp={};
  for(const s of view.seats)if(s){s.ip=ipOf(s.userId);s.online=[...tokens.values()].some(x=>x.userId===s.userId);if(s.ip)(byIp[s.ip]??=[]).push(s.username);}
  view.alerts=Object.entries(byIp).filter(([,names])=>names.length>1).map(([ip,names])=>({type:'SAME_IP',ip,names}));return view;});
 return {serverNow:Date.now(),rakePercent:db.rakePercent,tables};
}
function pushInspect(){if(!inspectSubs.size)return;let data;for(const [res,token] of inspectSubs){const u=me(token);if(!u||u.role!=='CENTER'){res.end();inspectSubs.delete(res);continue;}data??='data: '+JSON.stringify(inspectView())+'\n\n';try{res.write(data);}catch{inspectSubs.delete(res);}}}
function openInspectStream(req,res){const token=(req.headers.authorization||'').replace(/^Bearer /,''),u=me(token);if(!u)fail('Sign in to continue.',401);if(u.role!=='CENTER')fail('Only the center can inspect tables.',403);
 const last=db.ledger.findLast?.(x=>x.type==='INSPECT'&&x.from===u.id);if(!last||Date.now()-last.time>10*60000){db.ledger.push({id:uid(),type:'INSPECT',from:u.id,amount:0,ip:clientIp(req),time:Date.now()});save();}
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});
 inspectSubs.set(res,token);res.write('data: '+JSON.stringify(inspectView())+'\n\n');
 const beat=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);beat.unref();res.on('close',()=>{clearInterval(beat);inspectSubs.delete(res);});}

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.webp':'image/webp','.m4a':'audio/mp4'};
const SECURITY_HEADERS={'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()','cross-origin-opener-policy':'same-origin',
 'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
export const server=http.createServer(async(req,res)=>{for(const [k,v] of Object.entries(SECURITY_HEADERS))res.setHeader(k,v);if(req.headers['x-forwarded-proto']==='https')res.setHeader('strict-transport-security','max-age=31536000; includeSubDomains');try{const url=new URL(req.url,'http://localhost');const live=url.pathname.match(/^\/api\/table\/([^/]+)\/stream$/);if(live){openTableStream(req,res,decodeURIComponent(live[1]));return;}if(url.pathname==='/api/inspect/stream'){openInspectStream(req,res);return;}if(url.pathname==='/api/rake/events'){
 const token=(req.headers.authorization||'').replace(/^Bearer /,''),u=me(token);if(!u)fail('Login required',401);roleCheck(u,'CENTER','ADMIN','AGENT');
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});
 rakeClients.set(res,token);res.write('data: '+JSON.stringify(staffRakeReport(u))+'\n\n');
 const heartbeat=setInterval(()=>res.write(': keepalive\n\n'),15000);heartbeat.unref();res.on('close',()=>{clearInterval(heartbeat);rakeClients.delete(res);});return;
 }if(url.pathname.startsWith('/api/')){let input='';for await(const c of req){input+=c;if(input.length>50_000)fail('Body too large',413);}let body={};try{body=input?JSON.parse(input):{};}catch{fail('Invalid JSON');}const action=url.pathname.slice(5),audited=req.method==='POST'&&AUDITED.has(action),actor=audited?me((req.headers.authorization||'').replace(/^Bearer /,'')):null,before=actor?auditBefore(action,body):null;const value=await route(req,res,url,body);if(actor&&actor.role!=='USER')audit(actor,action,body,req,{...before,...(value?.network?{network:value.network}:{})});res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));return;}let name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));let f=path.resolve(ROOT,'public',name);if(!f.startsWith(path.resolve(ROOT,'public')+path.sep))fail('Forbidden',403);let contents=fs.readFileSync(f);
 // Stamp stylesheet and script links with their modification time so phones and
 // browsers always fetch the newest version after a change.
 if(name==='index.html')contents=String(contents).replace(/(\/[\w.-]+\.(?:css|js))\?v=[\w.-]+/g,(m,file)=>{try{return file+'?v='+Math.round(fs.statSync(path.join(ROOT,'public',file)).mtimeMs).toString(36);}catch{return m;}});
 res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':name==='index.html'?'no-store':'no-cache'});res.end(contents);}catch(err){const status=err.status||(err.code==='ENOENT'?404:500);res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({error:status===500?'Server error':err.message}));if(status===500)console.error(err);}});
server.listen(PORT,()=>console.log(`Klor Poker http://localhost:${PORT}`));
// Stopping (a deploy sends SIGTERM): no new hands, running hands may finish, then the
// state is saved. A hand still running at the time limit gets its chips back on the next start.
const STOP_WAIT_MS=Number(process.env.STOP_WAIT_MS||25000);let stopping=null;
export function shutdown(wait=STOP_WAIT_MS){return stopping??=new Promise(resolve=>{draining=true;const until=Date.now()+wait,busy=()=>[...runtime.values()].filter(t=>LIVE.includes(t.phase)).length;console.log(`[Klor Poker] Stopping: waiting for ${busy()} running hand(s).`);queuePush();const check=setInterval(()=>{if(busy()&&Date.now()<until)return;clearInterval(check);console.log(`[Klor Poker] Stopped with ${busy()} hand(s) unfinished.`);save();resolve();},200);});}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(stopping)process.exit(0);shutdown().then(()=>{try{store.close();}catch{}process.exit(0);});});
