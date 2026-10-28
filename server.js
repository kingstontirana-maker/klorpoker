import {rakeReport,revenueReport,pct} from './rake.js';
import {createBots} from './bots.js';
import {createPayments} from './payments.js';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {createEngine,LIVE,fail,MAX_TABLES} from './game.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));const SAVE=process.env.STATE_FILE||path.join(ROOT,'data','state.json');const PORT=Number(process.env.PORT||3000);const uid=()=>crypto.randomUUID();const money=n=>Math.round(Number(n)*100);const clean=n=>Math.round(n)/100;const secret=()=>crypto.randomBytes(28).toString('hex');const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');const config={minBuyin:2000,maxBuyin:100000};
// A fresh database never uses a known password: CENTER_PASSWORD, or a random one
// that is printed once in the server log.
let db;try{db=JSON.parse(fs.readFileSync(SAVE,'utf8'));}catch{const salt=secret(),initial=process.env.CENTER_PASSWORD||crypto.randomBytes(9).toString('base64url');if(!process.env.CENTER_PASSWORD)console.log(`[Klor Poker] New database at ${SAVE}. Temporary "center" password: ${initial}`);else console.log(`[Klor Poker] New database at ${SAVE} ("center" password from CENTER_PASSWORD).`);db={users:[{id:'center',username:'center',role:'CENTER',parentId:null,salt,passHash:hash(initial,salt),balance:1000000*100}],rakePercent:5,ledger:[],tables:[],nextTable:2};}
// Recover escrowed table stacks after a process restart.
delete db.rakeCap;
for(const seat of db.escrow||[]){const user=db.users.find(u=>u.id===seat.userId);if(user)user.balance+=seat.amount;}db.escrow=[];
export const runtime=new Map();const tokens=new Map();const rakeClients=new Map();const tableSubs=new Map(),inspectSubs=new Map();let pushQueued=false;const save=()=>{db.escrow=[...runtime.values()].flatMap(t=>t.seats.filter(Boolean).map(s=>({userId:s.userId,amount:s.stack+(LIVE.includes(t.phase)?s.committed:0)})));fs.mkdirSync(path.dirname(SAVE),{recursive:true});writeState(JSON.stringify(db,null,2));queuePush();};
// Atomic write: temp file, then rename. On Windows the rename can fail for a moment
// (an editor, backup or antivirus holding state.json); it is retried and finally
// written in place, and a failed save is logged instead of stopping the server.
function writeState(json){const tmp=SAVE+'.tmp';try{fs.writeFileSync(tmp,json);for(let i=0;;i++){try{fs.renameSync(tmp,SAVE);return;}catch(err){if(i>=4){fs.writeFileSync(SAVE,json);try{fs.unlinkSync(tmp);}catch{}return;}const until=Date.now()+25*(i+1);while(Date.now()<until);}}}catch(err){console.error('[Klor Poker] state not saved',err.message);}}
const engine=createEngine({db,save,onSettle:()=>publishRake(),onEquity:()=>queuePush(),onHand:h=>recordHand(h)});
// ---- Hand history: every finished hand is appended to its own file (one JSON per
// line, never rewritten) so it survives restarts and never bloats state.json. ----
const HANDS_FILE=process.env.HANDS_FILE||path.join(path.dirname(SAVE),'hands.jsonl');
function recordHand(h){h.id=db.handSeq=(db.handSeq||0)+1;try{fs.mkdirSync(path.dirname(HANDS_FILE),{recursive:true});fs.appendFileSync(HANDS_FILE,JSON.stringify(h)+'\n');}catch(err){console.error('[Klor Poker] hand history not saved',err);}}
// Newest first: the file is read backwards in blocks, so recent hands are found
// without loading the whole history.
function* handsNewestFirst(){let fd;try{fd=fs.openSync(HANDS_FILE,'r');}catch{return;}
 try{const size=fs.fstatSync(fd).size,block=256*1024;let pos=size,tail=Buffer.alloc(0);
  // Lines are cut at byte level, so a character is never split between two blocks.
  while(pos>0){const len=Math.min(block,pos);pos-=len;const buf=Buffer.alloc(len);fs.readSync(fd,buf,0,len,pos);const chunk=Buffer.concat([buf,tail]);
   const cut=pos>0?chunk.indexOf(10):-1;if(pos>0&&cut<0){tail=chunk;continue;}
   tail=cut>=0?chunk.subarray(0,cut):Buffer.alloc(0);const lines=chunk.subarray(cut+1).toString('utf8').split('\n');
   for(let i=lines.length-1;i>=0;i--)if(lines[i].trim()){try{yield JSON.parse(lines[i]);}catch{}}}
  }finally{fs.closeSync(fd);}}
const handSummary=h=>({id:h.id,at:h.startedAt,table:h.table,tableId:h.tableId,game:h.game,hand:h.hand,sb:h.sb,bb:h.bb,players:h.players.map(p=>p.username),bots:h.players.filter(p=>p.bot).map(p=>p.username),board:h.board,pot:h.pot,rake:h.rake,winners:h.winners,showdown:h.showdown});
function listHands(body){const table=body.table?String(body.table):'',player=String(body.player||'').trim().toLowerCase(),from=Number(body.from)||0,to=Number(body.to)||Infinity,before=Number(body.before)||Infinity,limit=Math.max(1,Math.min(200,Number(body.limit)||50));const out=[];let more=false;
 for(const h of handsNewestFirst()){if(h.id>=before||h.startedAt>to)continue;if(h.startedAt<from)break;if(table&&h.tableId!==table)continue;if(player&&!h.players.some(p=>p.username.toLowerCase().includes(player)))continue;if(out.length===limit){more=true;break;}out.push(handSummary(h));}
 return {hands:out,more,total:db.handSeq||0};}
// Each table has a felt colour (#rrggbb); the whole table design is derived from it.
const DEFAULT_COLOR='#1f9d6b',validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
const GAME_TYPES=['holdem','omaha'];
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
function endSession(token,reason){const s=tokens.get(token);if(!s)return;tokens.delete(token);if(reason){endReasons.set(token,reason);if(endReasons.size>5000)endReasons.delete(endReasons.keys().next().value);}for(const [client,t] of rakeClients)if(t===token){client.end();rakeClients.delete(client);}}
function endUserSessions(userId,reason,except){for(const [t,s] of tokens)if(s.userId===userId&&t!==except)endSession(t,reason);}
const me=token=>{const s=tokens.get(token);if(!s)return null;const now=Date.now();if(now-s.lastSeen>SESSION_IDLE_MS||now-s.created>SESSION_MAX_MS){endSession(token,'Your session has ended. Please sign in again.');return null;}s.lastSeen=now;const u=db.users.find(u=>u.id===s.userId);if(!u||u.blocked){endSession(token,'This account is blocked.');return null;}return u;};
setInterval(()=>{for(const t of [...tokens.keys()])me(t);},60000).unref();
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
function staffRakeReport(u){const r=rakeReport(db,u);return {...r,total:clean(r.total),today:clean(r.today),legacyTotal:clean(r.legacyTotal),...(r.botTotal!=null?{botTotal:clean(r.botTotal),botToday:clean(r.botToday)}:{}),rows:r.rows.map(x=>({...x,amount:clean(x.amount),...(x.bot!=null?{bot:clean(x.bot)}:{})})),percent:db.rakePercent,serverNow:Date.now()};}
function publishRake(){for(const [res,token] of rakeClients){const u=me(token);if(!u||u.role==='USER'){res.end();rakeClients.delete(res);continue;}res.write('data: '+JSON.stringify(staffRakeReport(u))+'\n\n');}}
async function route(req,res,url,body){const p=url.pathname,token=(req.headers.authorization||'').replace(/^Bearer /,'')||(p.endsWith('/away')&&typeof body.token==='string'?body.token:'');if(p==='/api/login'){const name=String(body.username||'').toLowerCase().slice(0,40),key=clientIp(req)+'|'+name,now=Date.now(),rec=loginFails.get(key);if(rec&&rec.until>now)fail(`Too many failed attempts. Try again in ${Math.ceil((rec.until-now)/60000)} minutes.`,429);const user=db.users.find(x=>x.username.toLowerCase()===name&&!x.isBot);if(!user||!samePassword(user,String(body.password||''))){const r=rec&&now-rec.first<LOGIN_LOCK_MS?rec:{count:0,first:now,until:0};r.count++;if(r.count>=LOGIN_LIMIT)r.until=now+LOGIN_LOCK_MS;loginFails.set(key,r);fail('Wrong username or password',401);}loginFails.delete(key);if(user.blocked)fail('This account is blocked. Contact your manager.',403);endUserSessions(user.id,'You signed in on another device. This session was closed.');const t=secret();tokens.set(t,{userId:user.id,created:now,lastSeen:now,ip:clientIp(req)});user.lastLoginAt=now;user.lastLoginIp=clientIp(req);save();return {token:t,...stateFor(user)};}
if(p==='/api/register'){const ip=clientIp(req),now=Date.now(),rec=registerTries.get(ip);const r=rec&&now-rec.first<REGISTER_WINDOW_MS?rec:{count:0,first:now};if(r.count>=REGISTER_LIMIT)fail('Too many attempts. Please try again later.',429);r.count++;registerTries.set(ip,r);if(registerTries.size>20000)registerTries.delete(registerTries.keys().next().value);
 const username=String(body.username||'').trim(),password=String(body.password||''),code=String(body.code||'').trim().toUpperCase();
 if(body.adult!==true)fail('You must be 18 or older to register.');if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))fail('Username: 3–24 characters, letters, numbers or _');if(!strongEnough(password))fail(PASSWORD_RULE);
 const agent=/^[0-9A-F]{10}$/.test(code)&&db.users.find(x=>x.role==='AGENT'&&x.inviteCode===code&&!x.blocked);if(!agent)fail('Invalid invite code. Ask your agent for their invite link.');
 if(db.users.some(x=>x.username.toLowerCase()===username.toLowerCase()))fail('That username is taken');
 const salt=secret(),user={id:uid(),username,role:'USER',parentId:agent.id,salt,passHash:hash(password,salt),balance:0,registeredAt:now,lastLoginAt:now,lastLoginIp:ip};db.users.push(user);db.ledger.push({id:uid(),type:'REGISTER',from:agent.id,to:user.id,amount:0,time:now});
 const t=secret();tokens.set(t,{userId:user.id,created:now,lastSeen:now,ip});save();return {token:t,...stateFor(user)};}
if(p==='/api/public/stats'){const tables=[...runtime.values()];return {tables:tables.length,players:tables.reduce((n,t)=>n+t.seats.filter(Boolean).length,0),live:tables.filter(t=>LIVE.includes(t.phase)).length,featured:tables.slice().sort((a,b)=>b.seats.filter(Boolean).length-a.seats.filter(Boolean).length).slice(0,6).map(t=>({name:t.name,game:t.game,color:t.color,sb:clean(t.sb),bb:clean(t.bb),players:t.seats.filter(Boolean).length,live:LIVE.includes(t.phase)}))};}
if(p==='/api/logout'){endSession(token);return {ok:true};}const u=me(token);if(!u)fail(endReasons.get(token)||'Sign in to continue.',401);
if(req.headers['x-klor-visible']==='1'&&u.role==='USER'){const now=Date.now();for(const t of runtime.values())for(const seat of t.seats)if(seat?.userId===u.id&&!seat.sittingOut)seat.lastSeen=now;}
if(p==='/api/state')return stateFor(u);
{const bots=botManager.route(p,body,u);if(bots!==undefined)return bots;}
{const pay=payments.route(p,body,u);if(pay!==undefined)return pay;}
if(p==='/api/invite/reset'){roleCheck(u,'AGENT');u.inviteCode=newInvite();save();return {invite:u.inviteCode};}
if(p==='/api/users'){roleCheck(u,'CENTER','ADMIN','AGENT');return db.users.filter(x=>x.parentId===u.id&&!x.isBot).map(x=>({id:x.id,username:x.username,role:x.role,balance:clean(x.balance),...(['ADMIN','AGENT'].includes(x.role)?{share:pct(x.share)}:{}),blocked:!!x.blocked,lastLoginAt:x.lastLoginAt||null,online:[...tokens.values()].some(s=>s.userId===x.id)}));}
// Your own password; other sessions of the account are signed out.
if(p==='/api/password'){if(!samePassword(u,String(body.current||'')))fail('The current password is wrong',400);if(!strongEnough(body.next))fail(PASSWORD_RULE);u.salt=secret();u.passHash=hash(body.next,u.salt);endUserSessions(u.id,'Your password was changed. Please sign in again.',token);save();return {ok:true};}
// Staff manage their direct accounts: new password, block and unblock.
if(p==='/api/users/password'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child)fail('Direct subordinate not found',404);if(!strongEnough(body.password))fail(PASSWORD_RULE);child.salt=secret();child.passHash=hash(body.password,child.salt);endUserSessions(child.id,'Your password was changed by your manager. Please sign in again.');save();return {ok:true};}
if(p==='/api/users/status'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child)fail('Direct subordinate not found',404);child.blocked=!!body.blocked;if(child.blocked){endUserSessions(child.id,'This account is blocked.');leaveAllTables(child);}db.ledger.push({id:uid(),type:child.blocked?'BLOCK':'UNBLOCK',from:u.id,to:child.id,amount:0,time:Date.now()});save();return {ok:true,blocked:child.blocked};}
if(p==='/api/users/create'){roleCheck(u,'CENTER','ADMIN','AGENT');const expected={CENTER:'ADMIN',ADMIN:'AGENT',AGENT:'USER'}[u.role];const username=String(body.username||'').trim();const password=String(body.password||'');if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))fail('Username: 3–24 characters, letters, numbers or _');if(!strongEnough(password))fail(PASSWORD_RULE);if(db.users.some(x=>x.username.toLowerCase()===username.toLowerCase()))fail('Username exists');const salt=secret();const share=shareFor(u,expected,body.share);db.users.push({id:uid(),username,role:expected,parentId:u.id,salt,passHash:hash(password,salt),balance:0,...(share!==null?{share}:{}),...(expected==='AGENT'?{inviteCode:newInvite()}:{})});save();return {ok:true,role:expected,share};}
// Change a direct admin's or agent's percentage. Lowering an admin below its agents
// brings those agents down to the new limit. Applies to the following hands only.
if(p==='/api/users/share'){roleCheck(u,'CENTER','ADMIN');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child||!['ADMIN','AGENT'].includes(child.role))fail('Direct subordinate not found',404);const share=shareFor(u,child.role,body.share,true);const old=pct(child.share);child.share=share;const capped=[];if(child.role==='ADMIN')for(const a of db.users.filter(x=>x.parentId===child.id&&x.role==='AGENT'&&pct(x.share)>share)){capped.push(a.username);db.ledger.push({id:uid(),type:'SHARE',from:child.id,to:a.id,amount:0,share,oldShare:pct(a.share),reason:'CAPPED',time:Date.now()});a.share=share;}db.ledger.push({id:uid(),type:'SHARE',from:u.id,to:child.id,amount:0,share,oldShare:old,time:Date.now()});save();return {ok:true,share,capped};}
if(p==='/api/transfer'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u)&&!x.isBot);if(!child)fail('Direct subordinate not found',404);const amount=money(body.amount);if(!Number.isSafeInteger(amount)||amount<=0)fail('Invalid amount');if(body.direction==='send'){if(u.balance<amount)fail('Insufficient balance');u.balance-=amount;child.balance+=amount;}else if(body.direction==='return'){if(child.balance<amount)fail('Insufficient child balance');child.balance-=amount;u.balance+=amount;}else fail('Direction invalid');db.ledger.push({id:uid(),type:'TRANSFER',from:body.direction==='send'?u.id:child.id,to:body.direction==='send'?child.id:u.id,amount,time:Date.now()});save();return {ok:true};}
// Revenue report: who generated the rake, how and when, for the viewer's own network.
if(p==='/api/hands'){roleCheck(u,'CENTER');return listHands(body);}
if(p==='/api/hands/get'){roleCheck(u,'CENTER');const id=Number(body.id);for(const h of handsNewestFirst()){if(h.id===id)return h;if(h.id<id)break;}fail('Hand not found',404);}
if(p==='/api/revenue'){roleCheck(u,'CENTER','ADMIN','AGENT');const r=revenueReport(db,u,{from:body.from,to:body.to,scope:body.scope?String(body.scope):undefined,detail:!!body.detail,includeBots:u.role==='CENTER'&&body.includeBots===true});const e=x=>({...x,rake:clean(x.rake)});return {...r,totals:{...r.totals,rake:clean(r.totals.rake),earned:clean(r.totals.earned),paidToNetwork:clean(r.totals.paidToNetwork),...(r.totals.botRake!=null?{botRake:clean(r.totals.botRake)}:{}),avgPerHand:clean(r.totals.avgPerHand)},previous:{...e(r.previous),earned:clean(r.previous.earned)},series:r.series.map(e),hours:r.hours.map(e),byChild:r.byChild.map(x=>({...e(x),earned:clean(x.earned)})),byPlayer:r.byPlayer.map(e),byTable:r.byTable.map(x=>({...e(x),sb:clean(x.sb),bb:clean(x.bb)})),recent:r.recent.map(x=>({...x,amount:clean(x.amount),parts:x.parts.map(q=>({...q,amount:clean(q.amount)}))})),...(r.rows?{rows:r.rows.map(x=>({...x,amount:clean(x.amount)}))}:{})};}
if(p==='/api/rake/report'){roleCheck(u,'CENTER','ADMIN','AGENT');return staffRakeReport(u);}
if(p==='/api/rake'){roleCheck(u,'CENTER');const value=Number(body.percent);if(!Number.isFinite(value)||value<0||value>15)fail('Rake must be 0–15%');db.rakePercent=value;save();publishRake();return{ok:true};}
if(p==='/api/tables/create'){roleCheck(u,'CENTER');const name=String(body.name||'').trim().slice(0,40),sb=money(body.sb),bb=money(body.bb);if(!name||!Number.isSafeInteger(sb)||!Number.isSafeInteger(bb)||sb<=0||bb<sb*2)fail('Invalid table configuration');if(body.color!==undefined&&!validColor(body.color))fail('Invalid table colour');const game=body.game===undefined?'holdem':String(body.game);if(!GAME_TYPES.includes(game))fail('Invalid game type');const color=validColor(body.color)?body.color.toLowerCase():DEFAULT_COLOR;const id=String(db.nextTable++);db.tables.push({id,name,sb,bb,color,game});makeTable(id,name,sb,bb,color,game);save();return {id,color,game};}
// The centre can recolour an existing table; players see it on the next update.
if(p==='/api/tables/color'){roleCheck(u,'CENTER');const t=runtime.get(String(body.id||'')),rec=db.tables.find(x=>x.id===String(body.id||''));if(!t||!rec)fail('Table not found',404);if(!validColor(body.color))fail('Invalid table colour');t.color=rec.color=body.color.toLowerCase();save();return {ok:true,color:t.color};}
if(p==='/api/ledger'){roleCheck(u,'CENTER','ADMIN','AGENT','USER');return db.ledger.flatMap(x=>{if(u.role==='CENTER')return [x];if(x.type==='RAKE'){const s=x.shares?.find(s=>s.userId===u.id);return s?[{id:x.id,type:'COMMISSION',to:u.id,tableId:x.tableId,hand:x.hand,amount:s.amount,time:x.time}]:[];}return x.from===u.id||x.to===u.id?[x]:[];}).slice(-100).reverse().map(x=>({...x,amount:clean(x.amount)}));}
if(p.startsWith('/api/table/')){let parts=p.split('/'),t=runtime.get(parts[3]);if(!t)fail('Table not found',404);const seated=t.seats.some(s=>s?.userId===u.id);if(u.role!=='USER')fail('Use your management panel',403);if(!seated&&u.balance<=0)fail('Your credit is zero. Contact your agent to add credit.',403);
if(parts[4]==='state')return engine.snapshot(t,u.id,url.searchParams.get('bg')!=='1');
if(parts[4]==='rebuy'){engine.rebuy(t,u,body.amount);return {ok:true};}
if(parts[4]==='sit'){engine.sit(t,u,body.position,body.buyin,[...runtime.values()]);return {ok:true};}
if(parts[4]==='leave')return engine.leave(t,u);
if(parts[4]==='sitout'){engine.sitOut(t,u,!!body.value);return {ok:true};}
if(parts[4]==='show'){engine.show(t,u);return {ok:true};}
if(parts[4]==='away'){engine.away(t,u);return {ok:true};}
if(parts[4]==='timebank'){engine.useTimeBank(t,u);return {ok:true};}
if(parts[4]==='chat'){engine.chat(t,u,body.text);return {ok:true};}
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
function openTableStream(req,res,tableId){const token=(req.headers.authorization||'').replace(/^Bearer /,''),u=me(token);if(!u)fail('Sign in to continue.',401);if(u.role!=='USER')fail('Forbidden',403);const t=runtime.get(tableId);if(!t)fail('Table not found',404);if(!t.seats.some(s=>s?.userId===u.id)&&u.balance<=0)fail('Your credit is zero. Contact your agent to add credit.',403);
 res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','connection':'keep-alive','x-accel-buffering':'no'});
 tableSubs.set(res,{token,userId:u.id,tableId});res.write('data: '+JSON.stringify(engine.snapshot(t,u.id))+'\n\n');
 const beat=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);beat.unref();
 res.on('close',()=>{clearInterval(beat);tableSubs.delete(res);if(![...tableSubs.values()].some(s=>s.userId===u.id&&s.tableId===tableId))engine.away(t,u);});}
setInterval(()=>{for(const t of runtime.values())tickTable(t);},250).unref();
// Table-filling bots act from the server; they are never logged in.
const botManager=createBots({db,runtime,engine,save});
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
 }if(url.pathname.startsWith('/api/')){let input='';for await(const c of req){input+=c;if(input.length>50_000)fail('Body too large',413);}let body={};try{body=input?JSON.parse(input):{};}catch{fail('Invalid JSON');}const value=await route(req,res,url,body);res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));return;}let name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));let f=path.resolve(ROOT,'public',name);if(!f.startsWith(path.resolve(ROOT,'public')+path.sep))fail('Forbidden',403);let contents=fs.readFileSync(f);
 // Stamp stylesheet and script links with their modification time so phones and
 // browsers always fetch the newest version after a change.
 if(name==='index.html')contents=String(contents).replace(/(\/[\w.-]+\.(?:css|js))\?v=[\w.-]+/g,(m,file)=>{try{return file+'?v='+Math.round(fs.statSync(path.join(ROOT,'public',file)).mtimeMs).toString(36);}catch{return m;}});
 res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':name==='index.html'?'no-store':'no-cache'});res.end(contents);}catch(err){const status=err.status||(err.code==='ENOENT'?404:500);res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({error:status===500?'Server error':err.message}));if(status===500)console.error(err);}});
server.listen(PORT,()=>console.log(`Klor Poker http://localhost:${PORT}`));
