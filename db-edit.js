// Database tab (centre): change, add and delete rows.
//
// The server keeps users, tables, settings and the newest transactions in memory and writes
// them to SQLite on every save, so those rows are changed in memory (a change made only in
// the file would be overwritten a moment later). Hands, hand players and chat reports live
// only in SQLite and are changed there directly.
//
// Rules that keep the platform working:
// • Money: a balance changed or removed by hand is recorded as an ADJUST transaction and the
//   money check total moves with it, so the check stays green and every euro is traceable.
// • Accounts: the center account cannot be deleted or demoted; a deleted account must have no
//   accounts below it and must not be seated; usernames stay unique; passwords and salts are
//   never shown or written here (a new account is given the password typed in the form).
// • Tables: changed, added or removed only while nobody plays at them.
// • Settings that the server needs cannot be deleted; values must be valid JSON.
// • Transactions: past entries can be corrected; they are never added or removed by hand
//   (balances are separate and the history must stay complete).
// • Sessions: a row can only be deleted, which signs that device out.
// • The activity log and meta are read-only: the log records every change made here.
export const EDIT_RULES={
 users:{update:true,insert:true,delete:true,key:'id'},
 game_tables:{update:true,insert:true,delete:true,key:'id'},
 settings:{update:true,insert:true,delete:true,key:'key'},
 ledger:{update:true,insert:false,delete:false,key:'seq'},
 hands:{update:true,insert:true,delete:true,key:'rowid'},
 hand_players:{update:true,insert:true,delete:true,key:'rowid'},
 chat_reports:{update:true,insert:true,delete:true,key:'rowid'},
 sessions:{update:false,insert:false,delete:true,key:'rowid'},
 audit:{update:false,insert:false,delete:false,key:'rowid'},
 meta:{update:false,insert:false,delete:false,key:'rowid'},
};
const LOCKED_USER=new Set(['id','salt','passHash','username_lower']);
const KEPT_SETTINGS=new Set(['rakePercent','moneyTotal','nextTable','tableCatalog','crypto','escrow','botGuard','botProfiles','cenbLog','signupAgentId','handSeq','cashouts','maxBuyin','minBuyin']);
const MASK='••••••';
// What the form sends is text: numbers, true/false, null and JSON become values again.
export function parseCell(v){if(v===null||v===undefined)return null;if(typeof v!=='string')return v;const s=v.trim();if(s==='')return '';if(s==='null'||s==='NULL')return null;if(s==='true')return true;if(s==='false')return false;if(/^-?\d+(\.\d+)?$/.test(s)&&String(Number(s))===s)return Number(s);if(/^[[{]/.test(s)){try{return JSON.parse(s);}catch{}}return v;}

export function createDbEditor({db,store,save,fail,uid,hash,secret,runtime,makeTable,tableIdle,tableSizes,gameTypes,validColor,endKey,endUserSessions}){
 const center=()=>db.users.find(u=>u.role==='CENTER');
 const adjust=(user,delta,by,why)=>{if(!delta)return;db.moneyTotal=(Number(db.moneyTotal)||0)+delta;db.ledger.push({id:uid(),type:'ADJUST',to:user.id,amount:delta,by:by.id,reason:why,time:Date.now()});};
 const seated=id=>[...runtime.values()].some(t=>t.seats.some(s=>s?.userId===id));
 const clean=values=>Object.fromEntries(Object.entries(values||{}).filter(([k,v])=>v!==MASK).map(([k,v])=>[k,parseCell(v)]));

 function users(action,key,values,by){
  if(action==='insert'){
   const v=clean(values),username=String(v.username||'').trim(),password=String(values?.password||'');
   if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))fail('Username: 3–24 characters, letters, numbers or _');
   if(db.users.some(x=>x.username.toLowerCase()===username.toLowerCase()))fail('That username is taken');
   if(!['ADMIN','MANAGER','AGENT','USER'].includes(v.role))fail('Role must be ADMIN, MANAGER, AGENT or USER');
   const parent=db.users.find(x=>x.id===v.parentId);if(!parent)fail('parentId must be an existing account');
   if(!password||password.length>256)fail('Give the new account a password');
   const balance=Number.isSafeInteger(v.balance)&&v.balance>0?v.balance:0,salt=secret();
   const {password:_,passHash,salt:__,id:___,...rest}=v;
   const user={...rest,id:uid(),username,role:v.role,parentId:parent.id,salt,passHash:hash(password,salt),balance};db.users.push(user);adjust(user,balance,by,'database insert');return user.id;}
  const user=db.users.find(x=>x.id===key);if(!user)fail('Row not found',404);
  if(action==='delete'){if(user.role==='CENTER')fail('The center account cannot be deleted');if(db.users.some(x=>x.parentId===user.id))fail('This account has accounts below it: move or delete those first');if(seated(user.id))fail('This player is seated at a table: wait until they leave');
   endUserSessions(user.id,'This account was removed.');adjust(user,-user.balance,by,'database delete');db.users.splice(db.users.indexOf(user),1);return key;}
  const v=clean(values),next={...user};
  for(const [k,x] of Object.entries(v)){if(LOCKED_USER.has(k)||k==='parent_id')continue;next[k]=x;}
  if(next.username!==user.username){const n=String(next.username||'').trim();if(!/^[a-zA-Z0-9_]{3,24}$/.test(n))fail('Username: 3–24 characters, letters, numbers or _');if(db.users.some(x=>x!==user&&x.username.toLowerCase()===n.toLowerCase()))fail('That username is taken');next.username=n;}
  if(user.role==='CENTER'&&next.role!=='CENTER')fail('The center account keeps its role');if(next.role!==user.role&&next.role==='CENTER')fail('There is only one center');if(!['CENTER','ADMIN','MANAGER','AGENT','USER'].includes(next.role))fail('Unknown role');
  if(next.parentId!==user.parentId){if(user.role==='CENTER')fail('The center has no parent');let p=db.users.find(x=>x.id===next.parentId),i=0;if(!p)fail('parentId must be an existing account');for(;p&&i<50;p=db.users.find(x=>x.id===p.parentId),i++)if(p.id===user.id)fail('An account cannot be placed below itself');}
  if(!Number.isSafeInteger(next.balance)||next.balance<0)fail('balance is in cents: a whole number, 0 or more');
  if('share' in next&&next.share!=null&&!(Number(next.share)>=0&&Number(next.share)<=100))fail('share must be 0–100');
  const delta=next.balance-user.balance;Object.keys(user).forEach(k=>{if(!(k in next))delete user[k];});Object.assign(user,next);adjust(user,delta,by,'database edit');
  if(user.blocked)endUserSessions(user.id,'This account is blocked.');return key;}

 function tables(action,key,values){
  const v=clean(values);
  const check=r=>{if(!String(r.name||'').trim())fail('name is required');if(!Number.isSafeInteger(r.sb)||!Number.isSafeInteger(r.bb)||r.sb<=0||r.bb<=r.sb)fail('sb and bb are in cents, bb larger than sb');if(!tableSizes.includes(Number(r.size||6)))fail('size: '+tableSizes.join(', '));if(r.game&&!gameTypes.includes(r.game))fail('game: '+gameTypes.join(' or '));if(r.color&&!validColor(r.color))fail('color: #rrggbb');};
  if(action==='insert'){const id=String(db.nextTable++);const rec={id,name:String(v.name||'').trim().slice(0,40),sb:v.sb,bb:v.bb,color:v.color||'#1f9d6b',game:v.game||'holdem',size:Number(v.size||6)};check(rec);db.tables.push(rec);makeTable(rec.id,rec.name,rec.sb,rec.bb,rec.color,rec.game,rec.size);return id;}
  const rec=db.tables.find(x=>x.id===key),t=runtime.get(key);if(!rec||!t)fail('Row not found',404);if(!tableIdle(t))fail('Somebody is playing at this table: change it when it is empty');
  if(action==='delete'){if(db.tables.length<2)fail('Keep at least one table');db.tables.splice(db.tables.indexOf(rec),1);runtime.delete(key);return key;}
  const next={...rec,...v,id:rec.id};next.size=Number(next.size||6);check(next);Object.assign(rec,next);runtime.delete(key);makeTable(rec.id,rec.name,rec.sb,rec.bb,rec.color,rec.game,rec.size);return key;}

 function settings(action,key,values){
  if(action==='insert'){const k=String(values?.key||'').trim();if(!/^[A-Za-z][\w]{0,40}$/.test(k))fail('key: letters, numbers or _');if(['users','ledger','tables'].includes(k)||k in db)fail('That key already exists');db[k]=parseCell(values?.value);return k;}
  if(!(key in db)||['users','ledger','tables'].includes(key))fail('Row not found',404);
  if(action==='delete'){if(KEPT_SETTINGS.has(key))fail('The server needs this setting: change it instead of deleting it');delete db[key];return key;}
  const value=parseCell(values?.value);if(key==='rakePercent'&&!(typeof value==='number'&&value>=0&&value<=15))fail('rakePercent must be 0–15');if(['moneyTotal','nextTable'].includes(key)&&!Number.isSafeInteger(value))fail(key+' must be a whole number');db[key]=value;return key;}

 function ledger(action,key,values){
  const seq=Number(key),row=store.rawGet('ledger',seq,'seq');if(!row)fail('Row not found',404);const old=JSON.parse(row.data),v=clean(values),next={...old};
  for(const [k,x] of Object.entries(v)){if(['seq','type','time'].includes(k)&&!(k in old))continue;next[k]=x;}
  store.rawSet('ledger',seq,'seq',{data:JSON.stringify(next)});const mem=db.ledger.find(x=>x.id===old.id);if(mem){Object.keys(mem).forEach(k=>{if(!(k in next))delete mem[k];});Object.assign(mem,next);}return key;}

 function sqlOnly(table,action,key,values){
  const cols=store.browseTables().find(t=>t.name===table).columns,real=store.realColumns(table),v=clean(values);
  const toRow=base=>{const row={};let data=base.data?JSON.parse(base.data):null;for(const [k,x] of Object.entries(v)){if(real.includes(k))row[k]=x!==null&&typeof x==='object'?JSON.stringify(x):x;else if(cols.includes('data')){data??={};data[k]=x;}}if(data&&real.includes('data'))row.data=JSON.stringify(data);return row;};
  if(action==='insert')return store.rawInsert(table,toRow({}));
  const row=store.rawGet(table,Number(key),'rowid');if(!row)fail('Row not found',404);
  if(action==='delete'){if(table==='sessions')endKey(row.key,'This device was signed out by the center.');else store.rawDelete(table,Number(key));return key;}
  store.rawSet(table,Number(key),'rowid',toRow(row));return key;}

 return function edit(by,{table,action,key,values}){
  const rule=EDIT_RULES[table];if(!rule)fail('Unknown table',404);if(!['update','insert','delete'].includes(action))fail('Unknown action');
  if(!rule[action])fail(table==='audit'?'The activity log cannot be changed: it records every change, including the ones made here.':table==='ledger'?'Transactions can be corrected, not added or removed.':table==='sessions'?'Sessions can only be deleted (signs that device out).':'This table is read-only.');
  const result=table==='users'?users(action,String(key??''),values,by):table==='game_tables'?tables(action,String(key??''),values):table==='settings'?settings(action,String(key??''),values):table==='ledger'?ledger(action,key,values):sqlOnly(table,action,key,values);
  save();return {ok:true,key:result};};
}
