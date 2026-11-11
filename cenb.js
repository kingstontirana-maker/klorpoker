// CENB: the bot control room. It lives on its own address (cenb.suprempoker.com) with its
// own sign-in. The first visit creates that sign-in: the center confirms once with its
// poker account and chooses the CENB username and password; from then on only those open
// CENB, and the poker account no longer does. CENB_PASSWORD on the server, if set, takes
// precedence (username CENB_USER, default "cenb").
import crypto from 'node:crypto';

const IDLE_MS=2*3600_000,MAX_MS=12*3600_000,LOCK_MS=15*60_000;
export const cenbHost=host=>/^cenb\./i.test(String(host||'').split(':')[0]);
export const devHost=host=>['localhost','127.0.0.1','[::1]'].includes(String(host||'').toLowerCase().replace(/:\d+$/,''));
const sha=v=>crypto.createHash('sha256').update(String(v)).digest();
const strong=p=>String(p).length>=12&&/[a-zA-Z]/.test(p)&&/[0-9]/.test(p);

export function createCenb({db,bots,save,fail,env=process.env,checkCenter=()=>false}){
 const envPass=String(env.CENB_PASSWORD||''),envUser=String(env.CENB_USER||'cenb').trim().toLowerCase(),envSalt=crypto.randomBytes(16),envHash=envPass.length>=12?crypto.scryptSync(envPass,envSalt,32):null;
 // Who may sign in: the server setting first, otherwise what was created on the first visit.
 const creds=()=>envHash?{user:envUser,check:p=>crypto.timingSafeEqual(crypto.scryptSync(String(p),envSalt,32),envHash),fromServer:true}
  :db.cenbAuth?{user:db.cenbAuth.user,check:p=>crypto.timingSafeEqual(crypto.scryptSync(String(p),Buffer.from(db.cenbAuth.salt,'hex'),64),Buffer.from(db.cenbAuth.hash,'hex')),fromServer:false}:null;
 const sessions=new Map(),fails=new Map();let globalFails=[];
 db.cenbLog??=[];
 const log=(ip,action,detail='')=>{db.cenbLog.push({at:Date.now(),ip,action,detail:String(detail).slice(0,160)});if(db.cenbLog.length>300)db.cenbLog.splice(0,db.cenbLog.length-300);};
 const center=()=>db.users.find(u=>u.role==='CENTER');
 function sessionOf(token){const s=token&&sessions.get(sha(token).toString('hex'));if(!s)return null;const now=Date.now();if(now-s.seen>IDLE_MS||now-s.created>MAX_MS){sessions.delete(s.key);return null;}s.seen=now;return s;}
 function guard(ip){const now=Date.now();globalFails=globalFails.filter(t=>now-t<LOCK_MS);const f=(fails.get(ip)||[]).filter(t=>now-t<LOCK_MS);fails.set(ip,f);if(f.length>=5||globalFails.length>=30)fail('Too many wrong attempts. Try again in 15 minutes.',429);return f;}
 function wrong(ip,f,what){f.push(Date.now());globalFails.push(Date.now());log(ip,what);save();}
 function openSession(ip){const token=crypto.randomBytes(32).toString('hex'),key=sha(token).toString('hex'),now=Date.now();sessions.set(key,{key,created:now,seen:now,ip});return token;}
 const store=(user,password)=>{const salt=crypto.randomBytes(16);db.cenbAuth={user,salt:salt.toString('hex'),hash:crypto.scryptSync(String(password),salt,64).toString('hex'),at:Date.now()};};
 function login(body,ip){
  const c=creds();if(!c)fail('CENB has no sign-in yet: create it first.',409);
  const f=guard(ip);
  const nameOk=crypto.timingSafeEqual(sha(String(body.username||'').trim().toLowerCase()),sha(c.user)),passOk=c.check(body.password||'');
  if(!nameOk||!passOk){wrong(ip,f,'Failed sign-in');fail('Wrong username or password',401);}
  fails.delete(ip);const token=openSession(ip);log(ip,'Signed in');save();return {token,user:c.user};
 }
 // First visit only: the center proves who it is once and chooses the CENB sign-in.
 function setup(body,ip){
  if(creds())fail('CENB already has a sign-in.',409);
  const f=guard(ip);
  if(!checkCenter(String(body.centerUsername||''),String(body.centerPassword||''))){wrong(ip,f,'Failed CENB setup');fail('The center username or password is wrong',401);}
  const user=String(body.username||'').trim().toLowerCase(),password=String(body.password||'');
  if(!/^[a-z0-9_]{3,24}$/.test(user))fail('CENB username: 3–24 letters, numbers or _');
  if(!strong(password))fail('The CENB password needs at least 12 characters, with letters and numbers');
  if(checkCenter(String(body.centerUsername||''),password))fail('Choose a password different from the center password');
  fails.delete(ip);store(user,password);const token=openSession(ip);log(ip,'Created the CENB sign-in',user);save();return {token,user};
 }
 const LOGGED=new Set(['create','bulk','configure','status','delete','settings','stopall','startall','topup']);
 // p is the path after /api/cenb/
 function route(p,body,token,ip){
  if(p==='login')return login(body,ip);
  if(p==='setup')return setup(body,ip);
  if(p==='status'){const c=creds();return {ready:!!c,setup:!c};}
  const s=sessionOf(token);if(!s)fail('Sign in to CENB',401);
  if(p==='logout'){sessions.delete(s.key);log(ip,'Signed out');save();return {ok:true};}
  if(p==='password'){const c=creds();if(c.fromServer)fail('This sign-in is set on the server (CENB_PASSWORD): change it there.');
   if(!c.check(body.current||''))fail('The current password is wrong',401);if(!strong(body.next||''))fail('The new password needs at least 12 characters, with letters and numbers');
   store(c.user,body.next);for(const [k] of sessions)if(k!==s.key)sessions.delete(k);log(ip,'Changed the CENB password');save();return {ok:true};}
  const c=center();if(!c)fail('There is no center account',500);
  if(p==='overview')return {...bots.route('/api/bots/overview',body,c),centerBalance:c.balance/100,log:db.cenbLog.slice(-40).reverse(),signIn:{user:creds().user,fromServer:creds().fromServer}};
  const name=p.replace(/^bots\//,'');if(!/^[a-z]+$/.test(name))fail('Not found',404);
  const bot=db.users.find(u=>u.isBot&&u.id===body.id);
  const value=bots.route('/api/bots/'+name,body,c);if(value===undefined)fail('Not found',404);
  if(LOGGED.has(name)){log(ip,{create:'Created a bot',bulk:'Created bots',configure:'Changed a bot',status:body.enabled?'Started a bot':'Stopped a bot',delete:'Deleted a bot',settings:'Changed the house limits',stopall:'Stopped every bot',startall:'Started every bot',topup:'Added money to a bot'}[name],bot?.username||body.name||(name==='bulk'?body.count+' × €'+body.budget:''));save();}
  return value;
 }
 setInterval(()=>{const now=Date.now();for(const [k,s] of sessions)if(now-s.seen>IDLE_MS||now-s.created>MAX_MS)sessions.delete(k);},600_000).unref();
 return {route,ready:()=>!!creds()};
}
