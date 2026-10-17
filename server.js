import {rakeReport} from './rake.js';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import {createEngine,LIVE,fail} from './game.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));const SAVE=process.env.STATE_FILE||path.join(ROOT,'data','state.json');const PORT=Number(process.env.PORT||3000);const uid=()=>crypto.randomUUID();const money=n=>Math.round(Number(n)*100);const clean=n=>Math.round(n)/100;const secret=()=>crypto.randomBytes(28).toString('hex');const hash=(p,s)=>crypto.scryptSync(p,s,64).toString('hex');const config={minBuyin:2000,maxBuyin:100000};
// A fresh database never uses a known password: CENTER_PASSWORD, or a random one
// that is printed once in the server log.
let db;try{db=JSON.parse(fs.readFileSync(SAVE,'utf8'));}catch{const salt=secret(),initial=process.env.CENTER_PASSWORD||crypto.randomBytes(9).toString('base64url');if(!process.env.CENTER_PASSWORD)console.log(`[Klor Poker] Databazë e re në ${SAVE}. Fjalëkalimi i përkohshëm i "center": ${initial}`);else console.log(`[Klor Poker] Databazë e re në ${SAVE} (fjalëkalimi i "center" nga CENTER_PASSWORD).`);db={users:[{id:'center',username:'center',role:'CENTER',parentId:null,salt,passHash:hash(initial,salt),balance:1000000*100}],rakePercent:5,ledger:[],tables:[],nextTable:2};}
// Recover escrowed table stacks after a process restart.
delete db.rakeCap;
for(const seat of db.escrow||[]){const user=db.users.find(u=>u.id===seat.userId);if(user)user.balance+=seat.amount;}db.escrow=[];
export const runtime=new Map();const tokens=new Map();const rakeClients=new Map();const save=()=>{db.escrow=[...runtime.values()].flatMap(t=>t.seats.filter(Boolean).map(s=>({userId:s.userId,amount:s.stack+(LIVE.includes(t.phase)?s.committed:0)})));fs.mkdirSync(path.dirname(SAVE),{recursive:true});const tmp=SAVE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,SAVE);};
const engine=createEngine({db,save,onSettle:()=>publishRake()});
const makeTable=(id,name,sb,bb)=>{const t=engine.makeTable(id,name,sb,bb);runtime.set(t.id,t);return t;};
if(!db.tables.length)db.tables=[{id:'1',name:'Emerald One',sb:100,bb:200}];for(const t of db.tables)makeTable(t.id,t.name,t.sb,t.bb);save();
const me=token=>{const id=tokens.get(token);return db.users.find(u=>u.id===id)||null;};const roleCheck=(u,...roles)=>{if(!roles.includes(u.role))fail('Forbidden',403);};const childOf=(u,p)=>u.parentId===p.id;
function stateFor(u){return {user:{id:u.id,username:u.username,role:u.role,parentId:u.parentId,balance:clean(u.balance)},lastTableExit:u.tableExit||null,...(u.role!=='USER'?{rakePercent:db.rakePercent}:{}),seatedTableId:[...runtime.values()].find(t=>t.seats.some(s=>s?.userId===u.id))?.id||null,minBuyin:clean(config.minBuyin),maxBuyin:clean(config.maxBuyin),tables:[...runtime.values()].map(t=>{const l=engine.buyinLimits(t);return {id:t.id,name:t.name,sb:clean(t.sb),bb:clean(t.bb),players:t.seats.filter(Boolean).length,minBuyin:clean(l.min),maxBuyin:clean(l.max),phase:t.phase,hand:t.hand};})};}
function staffRakeReport(u){const r=rakeReport(db,u);return {...r,total:clean(r.total),today:clean(r.today),legacyTotal:clean(r.legacyTotal),percent:db.rakePercent,serverNow:Date.now(),rows:r.rows.map(x=>({...x,amount:clean(x.amount)}))};}
function publishRake(){for(const [res,token] of rakeClients){const u=me(token);if(!u||u.role==='USER'){res.end();rakeClients.delete(res);continue;}res.write('data: '+JSON.stringify(staffRakeReport(u))+'\n\n');}}
async function route(req,res,url,body){const p=url.pathname,token=(req.headers.authorization||'').replace(/^Bearer /,'')||(p.endsWith('/away')&&typeof body.token==='string'?body.token:'');if(p==='/api/login'){const user=db.users.find(x=>x.username.toLowerCase()===String(body.username||'').toLowerCase());if(!user||hash(String(body.password||''),user.salt)!==user.passHash)fail('Invalid credentials',401);const t=secret();tokens.set(t,user.id);return {token:t,...stateFor(user)};}
if(p==='/api/logout'){tokens.delete(token);for(const [client,t] of rakeClients)if(t===token)client.end();return {ok:true};}const u=me(token);if(!u)fail('Login required',401);
if(p==='/api/state')return stateFor(u);
if(p==='/api/users'){roleCheck(u,'CENTER','ADMIN','AGENT');return db.users.filter(x=>x.parentId===u.id).map(x=>({id:x.id,username:x.username,role:x.role,balance:clean(x.balance)}));}
if(p==='/api/users/create'){roleCheck(u,'CENTER','ADMIN','AGENT');const expected={CENTER:'ADMIN',ADMIN:'AGENT',AGENT:'USER'}[u.role];const username=String(body.username||'').trim();const password=String(body.password||'');if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)||password.length===0)fail('Username 3-24 characters and password required');if(db.users.some(x=>x.username.toLowerCase()===username.toLowerCase()))fail('Username exists');const salt=secret();db.users.push({id:uid(),username,role:expected,parentId:u.id,salt,passHash:hash(password,salt),balance:0});save();return {ok:true,role:expected};}
if(p==='/api/transfer'){roleCheck(u,'CENTER','ADMIN','AGENT');const child=db.users.find(x=>x.id===body.userId&&childOf(x,u));if(!child)fail('Direct subordinate not found',404);const amount=money(body.amount);if(!Number.isSafeInteger(amount)||amount<=0)fail('Invalid amount');if(body.direction==='send'){if(u.balance<amount)fail('Insufficient balance');u.balance-=amount;child.balance+=amount;}else if(body.direction==='return'){if(child.balance<amount)fail('Insufficient child balance');child.balance-=amount;u.balance+=amount;}else fail('Direction invalid');db.ledger.push({id:uid(),type:'TRANSFER',from:body.direction==='send'?u.id:child.id,to:body.direction==='send'?child.id:u.id,amount,time:Date.now()});save();return {ok:true};}
if(p==='/api/rake/report'){roleCheck(u,'CENTER','ADMIN','AGENT');return staffRakeReport(u);}
if(p==='/api/rake'){roleCheck(u,'CENTER');const value=Number(body.percent);if(!Number.isFinite(value)||value<0||value>15)fail('Rake duhet të jetë 0–15%');db.rakePercent=value;save();publishRake();return{ok:true};}
if(p==='/api/tables/create'){roleCheck(u,'CENTER');const name=String(body.name||'').trim().slice(0,40),sb=money(body.sb),bb=money(body.bb);if(!name||!Number.isSafeInteger(sb)||!Number.isSafeInteger(bb)||sb<=0||bb<sb*2)fail('Invalid table configuration');const id=String(db.nextTable++);db.tables.push({id,name,sb,bb});makeTable(id,name,sb,bb);save();return {id};}
if(p==='/api/ledger'){roleCheck(u,'CENTER','ADMIN','AGENT');return db.ledger.filter(x=>u.role==='CENTER'||x.from===u.id||x.to===u.id).slice(-100).reverse().map(x=>({...x,amount:clean(x.amount)}));}
if(p.startsWith('/api/table/')){let parts=p.split('/'),t=runtime.get(parts[3]);if(!t)fail('Table not found',404);const seated=t.seats.some(s=>s?.userId===u.id);if(u.role!=='USER')fail('Use your management panel',403);if(!seated&&u.balance<=0)fail('Krediti është zero. Kontaktoni agjentin për të shtuar kredit.',403);
if(parts[4]==='state')return engine.snapshot(t,u.id);
if(parts[4]==='rebuy'){engine.rebuy(t,u,body.amount);return {ok:true};}
if(parts[4]==='sit'){engine.sit(t,u,body.position,body.buyin,[...runtime.values()]);return {ok:true};}
if(parts[4]==='leave')return engine.leave(t,u);
if(parts[4]==='sitout'){engine.sitOut(t,u,!!body.value);return {ok:true};}
if(parts[4]==='show'){engine.show(t,u);return {ok:true};}
if(parts[4]==='away'){engine.away(t,u);return {ok:true};}
if(parts[4]==='timebank'){engine.useTimeBank(t,u);return {ok:true};}
if(parts[4]==='chat'){engine.chat(t,u,body.text);return {ok:true};}
if(parts[4]==='start'){if(!['waiting','finished'].includes(t.phase))fail('Dora është duke u luajtur');if(!seated)fail('Nuk je ulur në tavolinë');if(!engine.startHand(t))fail('Duhen të paktën dy lojtarë me fonde në tavolinë');save();return {ok:true};}
if(parts[4]==='action'){engine.act(t,u.id,body.type,body.amount);return{ok:true};}}
fail('Not found',404);}
export const tickTable=(t,now=Date.now())=>engine.tickTable(t,now);
setInterval(()=>{for(const t of runtime.values())tickTable(t);},250).unref();

const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.webp':'image/webp'};
export const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/rake/events'){
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
