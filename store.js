// SQLite storage. The game keeps working on the `db` object in memory; every save writes
// only what changed, inside one transaction, so a save is stored whole or not at all.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SCHEMA=`
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,data TEXT NOT NULL,
 username TEXT GENERATED ALWAYS AS (json_extract(data,'$.username')) VIRTUAL,
 role TEXT GENERATED ALWAYS AS (json_extract(data,'$.role')) VIRTUAL,
 parent_id TEXT GENERATED ALWAYS AS (json_extract(data,'$.parentId')) VIRTUAL,
 balance INTEGER GENERATED ALWAYS AS (json_extract(data,'$.balance')) VIRTUAL);
CREATE INDEX IF NOT EXISTS users_parent ON users(parent_id);
CREATE TABLE IF NOT EXISTS ledger(seq INTEGER PRIMARY KEY AUTOINCREMENT,data TEXT NOT NULL,
 type TEXT GENERATED ALWAYS AS (json_extract(data,'$.type')) VIRTUAL,
 time INTEGER GENERATED ALWAYS AS (json_extract(data,'$.time')) VIRTUAL);
CREATE INDEX IF NOT EXISTS ledger_time ON ledger(time);
CREATE TABLE IF NOT EXISTS game_tables(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hands(id INTEGER PRIMARY KEY,table_id TEXT,started_at INTEGER,players TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS hands_started ON hands(started_at);
CREATE INDEX IF NOT EXISTS ledger_type ON ledger(type);
CREATE TABLE IF NOT EXISTS hand_players(hand_id INTEGER NOT NULL,user_id TEXT NOT NULL,username TEXT,started_at INTEGER,result REAL NOT NULL,won INTEGER NOT NULL,vpip INTEGER NOT NULL,bot INTEGER NOT NULL,PRIMARY KEY(hand_id,user_id));
CREATE INDEX IF NOT EXISTS hand_players_user ON hand_players(user_id,hand_id);
CREATE INDEX IF NOT EXISTS hand_players_started ON hand_players(started_at);
CREATE TABLE IF NOT EXISTS sessions(key TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,actor_id TEXT,actor TEXT,role TEXT,action TEXT NOT NULL,target TEXT,details TEXT,ip TEXT);
CREATE TABLE IF NOT EXISTS chat_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,reporter_id TEXT,reporter TEXT,target_id TEXT,target TEXT,table_name TEXT,message TEXT,status TEXT NOT NULL DEFAULT 'open',resolved_by TEXT,resolved_at INTEGER,outcome TEXT);
`;
const ROWS=new Set(['users','ledger','tables']);
const handPlayers=h=>(h.players||[]).map(p=>String(p.username).toLowerCase()).join('\n');
// Only the newest transactions stay in memory; older ones are read when a report needs them.
export const TOTALS_SQL='SELECT user_id AS id,COUNT(*) AS hands,SUM(result) AS net,MAX(started_at) AS last FROM hand_players WHERE started_at>=? AND started_at<=? GROUP BY user_id';
export const PAIR_SQL='SELECT a.user_id AS a,b.user_id AS b,COUNT(*) AS hands,SUM(a.result) AS netA,SUM(b.result) AS netB FROM hand_players a JOIN hand_players b ON a.hand_id=b.hand_id AND a.user_id<b.user_id WHERE a.started_at>=? AND a.bot=0 AND b.bot=0 GROUP BY a.user_id,b.user_id HAVING hands>=?';
export const LEDGER_KEEP=Number(process.env.LEDGER_KEEP||20000);
const VOLUNTARY=new Set(['CALL','BET','RAISE']);

export function openStore(file){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const sql=new DatabaseSync(file);
 // WAL with FULL sync: a finished commit survives a crash or a power cut.
 sql.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000;');
 sql.exec(SCHEMA);
 const q={
  putUser:sql.prepare('INSERT INTO users(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'),
  delUser:sql.prepare('DELETE FROM users WHERE id=?'),
  putTable:sql.prepare('INSERT INTO game_tables(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data'),
  delTable:sql.prepare('DELETE FROM game_tables WHERE id=?'),
  putSetting:sql.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
  delSetting:sql.prepare('DELETE FROM settings WHERE key=?'),
  addLedger:sql.prepare('INSERT INTO ledger(data) VALUES(?)'),
  addHand:sql.prepare('INSERT INTO hands(id,table_id,started_at,players,data) VALUES(?,?,?,?,?)'),
  getHand:sql.prepare('SELECT data FROM hands WHERE id=?'),
  setMeta:sql.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
  getMeta:sql.prepare('SELECT value FROM meta WHERE key=?'),
 };
 // What is already stored, so a save only touches rows that changed. It is updated only
 // after a commit: a failed save is simply written again by the next one.
 let saved={users:new Map(),tables:new Map(),settings:new Map(),ledger:0};
 // During a rolling deploy the old and the new server run together on this file. The
 // newest server claims it; from then on the older one can no longer write, so the two
 // can never mix their data (for example paying table chips back twice).
 const instance=crypto.randomUUID();let claimed=false;
 const guard=()=>{if(claimed&&q.getMeta.get('owner')?.value!==instance)throw new Error('Another server now owns the database');};
 const owned=fn=>(...args)=>{guard();return fn(...args);};
 const transaction=fn=>{sql.exec('BEGIN IMMEDIATE');try{guard();const value=fn();sql.exec('COMMIT');return value;}catch(err){sql.exec('ROLLBACK');throw err;}};
 const syncRows=(rows,before,after,put,del)=>{for(const row of rows){const json=JSON.stringify(row);after.set(row.id,json);if(before.get(row.id)!==json)put.run(row.id,json);}for(const id of before.keys())if(!after.has(id))del.run(id);};
 const write=db=>{
  const next={users:new Map(),tables:new Map(),settings:new Map(),ledger:db.ledger.length};
  syncRows(db.users,saved.users,next.users,q.putUser,q.delUser);
  syncRows(db.tables,saved.tables,next.tables,q.putTable,q.delTable);
  for(let i=saved.ledger;i<db.ledger.length;i++)q.addLedger.run(JSON.stringify(db.ledger[i]));
  for(const [key,value] of Object.entries(db)){if(ROWS.has(key)||value===undefined)continue;const json=JSON.stringify(value);next.settings.set(key,json);if(saved.settings.get(key)!==json)q.putSetting.run(key,json);}
  for(const key of saved.settings.keys())if(!next.settings.has(key))q.delSetting.run(key);
  return next;
 };
 const addHandPlayer=sql.prepare('INSERT OR IGNORE INTO hand_players(hand_id,user_id,username,started_at,result,won,vpip,bot) VALUES(?,?,?,?,?,?,?,?)');
 const insertPlayers=h=>{for(const p of h.players||[])if(p.userId)addHandPlayer.run(h.id,p.userId,p.username??null,h.startedAt??null,Number(p.result)||0,(h.winners||[]).includes(p.username)?1:0,(h.actions||[]).some(a=>a.street==='preflop'&&a.username===p.username&&VOLUNTARY.has(a.type))?1:0,p.bot?1:0);};
 const insertHand=h=>{q.addHand.run(h.id,h.tableId==null?null:String(h.tableId),h.startedAt??null,handPlayers(h),JSON.stringify(h));insertPlayers(h);};
 // Databases made before player statistics existed: fill them once from the stored hands.
 if(!q.getMeta.get('handPlayers'))transaction(()=>{for(const r of sql.prepare('SELECT data FROM hands').all())insertPlayers(JSON.parse(r.data));q.setMeta.run('handPlayers','1');});
 let oldestSeq=1;
 const store={
  claim(){claimed=true;q.setMeta.run('owner',instance);},
  isOwner:()=>!claimed||q.getMeta.get('owner')?.value===instance,
  // The stored data, or null for a database that was never filled.
  load(keep=LEDGER_KEEP){
   if(!q.getMeta.get('created'))return null;
   const parse=(rows,field='data')=>rows.map(r=>JSON.parse(r[field]));
   const db={users:parse(sql.prepare('SELECT data FROM users ORDER BY rowid').all()),ledger:[],tables:parse(sql.prepare('SELECT data FROM game_tables ORDER BY rowid').all())};
   const recent=sql.prepare('SELECT seq,data FROM ledger ORDER BY seq DESC LIMIT ?').all(keep).reverse();db.ledger=parse(recent);oldestSeq=recent[0]?.seq??1;
   for(const {key,value} of sql.prepare('SELECT key,value FROM settings').all())db[key]=JSON.parse(value);
   saved={users:new Map(db.users.map(u=>[u.id,JSON.stringify(u)])),tables:new Map(db.tables.map(t=>[t.id,JSON.stringify(t)])),settings:new Map(Object.entries(db).filter(([k])=>!ROWS.has(k)).map(([k,v])=>[k,JSON.stringify(v)])),ledger:db.ledger.length};
   // A crash between a stored hand and the next save must not reuse its number.
   db.handSeq=Math.max(db.handSeq||0,store.lastHandId());
   return db;
  },
  commit(db){saved=transaction(()=>{const next=write(db);q.setMeta.run('created',q.getMeta.get('created')?.value||String(Date.now()));return next;});},
  addHand:h=>{transaction(()=>insertHand(h));},
  ping:()=>sql.prepare('SELECT 1 AS ok').get().ok===1,
  // Transactions older than the ones in memory.
  olderRake:()=>sql.prepare("SELECT data FROM ledger WHERE type='RAKE' AND seq<? ORDER BY seq").all(oldestSeq).map(r=>JSON.parse(r.data)),
  olderLedger(before=Infinity,size=2000){const rows=sql.prepare('SELECT seq,data FROM ledger WHERE seq<? ORDER BY seq DESC LIMIT ?').all(Math.min(before,oldestSeq),size).reverse();return {rows:rows.map(r=>JSON.parse(r.data)),seq:rows[0]?.seq??0};},
  // Sessions: only a hash of the token is stored, so the file cannot be used to sign in.
  sessions:()=>sql.prepare('SELECT key,data FROM sessions').all().map(r=>[r.key,JSON.parse(r.data)]),
  putSession:owned((key,s)=>{sql.prepare('INSERT INTO sessions(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(key,JSON.stringify(s));}),
  delSession:owned(key=>{sql.prepare('DELETE FROM sessions WHERE key=?').run(key);}),
  // Who did what, and when.
  addAudit:owned(e=>{sql.prepare('INSERT INTO audit(at,actor_id,actor,role,action,target,details,ip) VALUES(?,?,?,?,?,?,?,?)').run(e.at,e.actorId??null,e.actor??null,e.role??null,e.action,e.target??null,e.details?JSON.stringify(e.details):null,e.ip??null);}),
  listAudit({before=Infinity,actor='',action='',limit=50}={}){const where=[],args=[];if(Number.isFinite(before)){where.push('id<?');args.push(before);}if(actor){where.push('instr(lower(actor),?)>0');args.push(actor);}if(action){where.push('action=?');args.push(action);}return sql.prepare(`SELECT id,at,actor,role,action,target,details,ip FROM audit ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id DESC LIMIT ?`).all(...args,limit).map(r=>({...r,details:r.details?JSON.parse(r.details):null}));},
  // Chat reports.
  addReport:owned(r=>{sql.prepare('INSERT INTO chat_reports(at,reporter_id,reporter,target_id,target,table_name,message) VALUES(?,?,?,?,?,?,?)').run(r.at,r.reporterId,r.reporter,r.targetId,r.target,r.table,r.message);}),
  reportExists:(reporterId,targetId,message)=>!!sql.prepare("SELECT 1 FROM chat_reports WHERE reporter_id=? AND target_id=? AND message=? AND status='open'").get(reporterId,targetId,message),
  listReports:(status='open',limit=200)=>sql.prepare('SELECT * FROM chat_reports WHERE status=? ORDER BY id DESC LIMIT ?').all(status,limit).map(r=>({...r})),
  getReport:id=>{const r=sql.prepare('SELECT * FROM chat_reports WHERE id=?').get(id);return r?{...r}:null;},
  resolveReport:owned((id,by,outcome)=>{sql.prepare("UPDATE chat_reports SET status='closed',resolved_by=?,resolved_at=?,outcome=? WHERE id=?").run(by,Date.now(),outcome,id);}),
  // A player's own hands and numbers.
  playerHands:(userId,before,limit)=>sql.prepare('SELECT h.data FROM hand_players p JOIN hands h ON h.id=p.hand_id WHERE p.user_id=? AND p.hand_id<? ORDER BY p.hand_id DESC LIMIT ?').all(userId,Number.isFinite(before)?before:Number.MAX_SAFE_INTEGER,limit).map(r=>JSON.parse(r.data)),
  playerStats(userId,since=0){const t=sql.prepare('SELECT COUNT(*) AS hands,COALESCE(SUM(won),0) AS won,COALESCE(SUM(vpip),0) AS vpip,COALESCE(SUM(result),0) AS net,COALESCE(MAX(result),0) AS best,COALESCE(MIN(result),0) AS worst FROM hand_players WHERE user_id=? AND started_at>=?').get(userId,since);return {...t,days:sql.prepare("SELECT date(started_at/1000,'unixepoch') AS day,COUNT(*) AS hands,SUM(result) AS net FROM hand_players WHERE user_id=? AND started_at>=? GROUP BY day ORDER BY day").all(userId,since).map(d=>({...d}))};},
  // Totals per player over a period, and pairs of players who shared hands.
  playerTotals:(since=0,until=Number.MAX_SAFE_INTEGER)=>sql.prepare(TOTALS_SQL).all(since,until).map(r=>({...r})),
  getHand(id){const row=q.getHand.get(id);return row?JSON.parse(row.data):null;},
  lastHandId:()=>sql.prepare('SELECT COALESCE(MAX(id),0) AS id FROM hands').get().id,
  // Newest first; `limit` rows at most.
  listHands({before=Infinity,from=0,to=Infinity,table='',player=''},limit){
   const where=['started_at>=?'],args=[from];
   if(Number.isFinite(before)){where.push('id<?');args.push(before);}
   if(Number.isFinite(to)){where.push('started_at<=?');args.push(to);}
   if(table){where.push('table_id=?');args.push(table);}
   if(player){where.push('instr(players,?)>0');args.push(player);}
   return sql.prepare(`SELECT data FROM hands WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args,limit).map(r=>JSON.parse(r.data));
  },
  // First start after the move from files: state.json and hands.jsonl go in together or
  // not at all, the result is compared with the files, and the files are left untouched.
  // Returns the data, or null when there is no state file. A state file that cannot be
  // read stops the start: opening an empty database instead would lose every account.
  importFiles(stateFile,handsFile){
   let db=null;
   if(fs.existsSync(stateFile)){try{db=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch(err){throw new Error(`Cannot read ${stateFile} (${err.message}). Fix or restore it before starting.`);}db.users??=[];db.ledger??=[];db.tables??=[];}
   const hands=[];let skipped=0,last=0;
   if(fs.existsSync(handsFile))for(const line of fs.readFileSync(handsFile,'utf8').split('\n')){if(!line.trim())continue;try{const h=JSON.parse(line);h.id=Number(h.id)>last?Number(h.id):last+1;last=h.id;hands.push(h);}catch{skipped++;}}
   transaction(()=>{
    sql.exec('DELETE FROM hands;DELETE FROM hand_players;');
    for(const h of hands)insertHand(h);
    if(db){
     db.handSeq=Math.max(db.handSeq||0,last);
     saved=write(db);
     const count=sql.prepare('SELECT COUNT(*) AS users,COALESCE(SUM(balance),0) AS balance FROM users').get(),ledger=sql.prepare('SELECT COUNT(*) AS n FROM ledger').get().n,stored=sql.prepare('SELECT COUNT(*) AS n FROM hands').get().n;
     if(count.users!==db.users.length||count.balance!==db.users.reduce((n,u)=>n+(u.balance||0),0)||ledger!==db.ledger.length||stored!==hands.length)throw new Error('The imported data does not match the files; nothing was changed.');
     q.setMeta.run('created',String(Date.now()));q.setMeta.run('imported',JSON.stringify({at:Date.now(),users:db.users.length,ledger:db.ledger.length,hands:hands.length}));
    }
   });
   return db&&{db,hands:hands.length,skipped};
  },
  close(){sql.close();},
 };
 return store;
}
