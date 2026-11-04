// SQLite storage. The game keeps working on the `db` object in memory; every save writes
// only what changed, inside one transaction, so a save is stored whole or not at all.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

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
`;
const ROWS=new Set(['users','ledger','tables']);
const handPlayers=h=>(h.players||[]).map(p=>String(p.username).toLowerCase()).join('\n');

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
 const transaction=fn=>{sql.exec('BEGIN IMMEDIATE');try{const value=fn();sql.exec('COMMIT');return value;}catch(err){sql.exec('ROLLBACK');throw err;}};
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
 const insertHand=h=>q.addHand.run(h.id,h.tableId==null?null:String(h.tableId),h.startedAt??null,handPlayers(h),JSON.stringify(h));
 const store={
  // The stored data, or null for a database that was never filled.
  load(){
   if(!q.getMeta.get('created'))return null;
   const parse=(rows,field='data')=>rows.map(r=>JSON.parse(r[field]));
   const db={users:parse(sql.prepare('SELECT data FROM users ORDER BY rowid').all()),ledger:parse(sql.prepare('SELECT data FROM ledger ORDER BY seq').all()),tables:parse(sql.prepare('SELECT data FROM game_tables ORDER BY rowid').all())};
   for(const {key,value} of sql.prepare('SELECT key,value FROM settings').all())db[key]=JSON.parse(value);
   saved={users:new Map(db.users.map(u=>[u.id,JSON.stringify(u)])),tables:new Map(db.tables.map(t=>[t.id,JSON.stringify(t)])),settings:new Map(Object.entries(db).filter(([k])=>!ROWS.has(k)).map(([k,v])=>[k,JSON.stringify(v)])),ledger:db.ledger.length};
   // A crash between a stored hand and the next save must not reuse its number.
   db.handSeq=Math.max(db.handSeq||0,store.lastHandId());
   return db;
  },
  commit(db){saved=transaction(()=>{const next=write(db);q.setMeta.run('created',q.getMeta.get('created')?.value||String(Date.now()));return next;});},
  addHand:h=>{insertHand(h);},
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
    sql.exec('DELETE FROM hands');
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
