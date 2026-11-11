// CENB: the bot control room. It lives on its own address (cenb.suprempoker.com) with its
// own sign-in, set by CENB_USER and CENB_PASSWORD on the server. No poker account,
// not even the center, can open it, and the poker site cannot be reached through it.
import crypto from 'node:crypto';

const IDLE_MS=2*3600_000,MAX_MS=12*3600_000,LOCK_MS=15*60_000;
export const cenbHost=host=>/^cenb\./i.test(String(host||'').split(':')[0]);
export const devHost=host=>['localhost','127.0.0.1','[::1]'].includes(String(host||'').toLowerCase().replace(/:\d+$/,''));

export function createCenb({db,bots,save,fail,env=process.env}){
 const user=String(env.CENB_USER||'cenb').trim().toLowerCase(),password=String(env.CENB_PASSWORD||'');
 const ready=password.length>=12,salt=crypto.randomBytes(16),digest=p=>crypto.scryptSync(String(p),salt,32),expected=ready?digest(password):null;
 const sessions=new Map(),fails=new Map();let globalFails=[];
 db.cenbLog??=[];
 const log=(ip,action,detail='')=>{db.cenbLog.push({at:Date.now(),ip,action,detail:String(detail).slice(0,160)});if(db.cenbLog.length>300)db.cenbLog.splice(0,db.cenbLog.length-300);};
 const center=()=>db.users.find(u=>u.role==='CENTER');
 function sessionOf(token){const s=token&&sessions.get(crypto.createHash('sha256').update(token).digest('hex'));if(!s)return null;const now=Date.now();if(now-s.seen>IDLE_MS||now-s.created>MAX_MS){sessions.delete(s.key);return null;}s.seen=now;return s;}
 function login(body,ip){
  if(!ready)fail('CENB is not set up yet: add CENB_PASSWORD (at least 12 characters) to the server settings.',503);
  const now=Date.now();globalFails=globalFails.filter(t=>now-t<LOCK_MS);const f=(fails.get(ip)||[]).filter(t=>now-t<LOCK_MS);
  if(f.length>=5||globalFails.length>=30)fail('Too many wrong attempts. Try again in 15 minutes.',429);
  const nameOk=crypto.timingSafeEqual(crypto.createHash('sha256').update(String(body.username||'').trim().toLowerCase()).digest(),crypto.createHash('sha256').update(user).digest());
  const passOk=crypto.timingSafeEqual(digest(body.password||''),expected);
  if(!nameOk||!passOk){f.push(now);fails.set(ip,f);globalFails.push(now);log(ip,'Failed sign-in');save();fail('Wrong username or password',401);}
  fails.delete(ip);const token=crypto.randomBytes(32).toString('hex'),key=crypto.createHash('sha256').update(token).digest('hex');
  sessions.set(key,{key,created:now,seen:now,ip});log(ip,'Signed in');save();return {token,user};
 }
 const LOGGED=new Set(['create','bulk','configure','status','delete','settings','stopall','startall','topup']);
 // p is the path after /api/cenb/
 function route(p,body,token,ip){
  if(p==='login')return login(body,ip);
  if(p==='status')return {ready,user:ready?user:null};
  const s=sessionOf(token);if(!s)fail('Sign in to CENB',401);
  if(p==='logout'){sessions.delete(s.key);log(ip,'Signed out');save();return {ok:true};}
  const c=center();if(!c)fail('There is no center account',500);
  if(p==='overview')return {...bots.route('/api/bots/overview',body,c),centerBalance:c.balance/100,log:db.cenbLog.slice(-40).reverse()};
  const name=p.replace(/^bots\//,'');if(!/^[a-z]+$/.test(name))fail('Not found',404);
  const bot=db.users.find(u=>u.isBot&&u.id===body.id);
  const value=bots.route('/api/bots/'+name,body,c);if(value===undefined)fail('Not found',404);
  if(LOGGED.has(name)){log(ip,{create:'Created a bot',bulk:'Created bots',configure:'Changed a bot',status:body.enabled?'Started a bot':'Stopped a bot',delete:'Deleted a bot',settings:'Changed the house limits',stopall:'Stopped every bot',startall:'Started every bot',topup:'Added money to a bot'}[name],bot?.username||body.name||(name==='bulk'?body.count+' × €'+body.budget:''));save();}
  return value;
 }
 setInterval(()=>{const now=Date.now();for(const [k,s] of sessions)if(now-s.seen>IDLE_MS||now-s.created>MAX_MS)sessions.delete(k);},600_000).unref();
 return {route,ready};
}
