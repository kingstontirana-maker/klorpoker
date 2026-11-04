import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from './store.js';

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'klor-store-'));
const sample=()=>({users:[{id:'c',username:'center',role:'CENTER',parentId:null,balance:900},{id:'u',username:'Ana',role:'USER',parentId:'c',balance:100}],ledger:[{id:'l1',type:'TRANSFER',from:'c',to:'u',amount:100,time:5}],tables:[{id:'1',name:'One',sb:100,bb:200},{id:'2',name:'Two',sb:100,bb:200}],rakePercent:5,nextTable:3,escrow:[{userId:'u',amount:50}],crypto:{deposits:[]}});

test('a new database is empty until the first save, then returns exactly what was saved',()=>{
 const file=path.join(tmp(),'a.db');let s=openStore(file);assert.equal(s.load(),null);
 const db=sample();s.commit(db);s.close();
 s=openStore(file);const back=s.load();s.close();
 assert.deepEqual(back,{...db,handSeq:0});
});

test('a save writes only changes: edits, new rows and removals all come back in order',()=>{
 const file=path.join(tmp(),'b.db');let s=openStore(file);const db=sample();s.commit(db);
 db.users[1].balance=70;db.users.push({id:'x',username:'New',role:'USER',parentId:'c',balance:0});db.ledger.push({id:'l2',type:'BUY_IN',amount:30,time:6});db.tables.splice(0,1);db.rakePercent=4;delete db.crypto;s.commit(db);s.close();
 s=openStore(file);const back=s.load();s.close();
 assert.deepEqual(back,{...db,handSeq:0});assert.deepEqual(back.users.map(u=>u.id),['c','u','x']);assert.deepEqual(back.ledger.map(l=>l.id),['l1','l2']);
});

test('a failed save changes nothing, and the next save writes it all',()=>{
 const file=path.join(tmp(),'c.db');let s=openStore(file);const db=sample();s.commit(db);
 db.users[0].balance=800;db.users[1].balance=200;db.users.push({username:'broken'});
 assert.throws(()=>s.commit(db));
 const peek=new DatabaseSync(file);assert.deepEqual(peek.prepare('SELECT balance FROM users ORDER BY rowid').all().map(r=>r.balance),[900,100],'both balances are still the old ones');peek.close();
 db.users.pop();s.commit(db);s.close();
 s=openStore(file);assert.deepEqual(s.load().users.map(u=>u.balance),[800,200]);s.close();
});

test('tables are real: balances and hierarchy can be queried',()=>{
 const file=path.join(tmp(),'d.db');const s=openStore(file);s.commit(sample());s.close();
 const peek=new DatabaseSync(file);assert.equal(peek.prepare("SELECT balance FROM users WHERE username='Ana' AND parent_id='c'").get().balance,100);assert.equal(peek.prepare("SELECT COUNT(*) AS n FROM ledger WHERE type='TRANSFER'").get().n,1);peek.close();
});

test('hands: filters, newest first, and a crash cannot reuse a number',()=>{
 const file=path.join(tmp(),'e.db');let s=openStore(file);s.commit(sample());
 for(let i=1;i<=5;i++)s.addHand({id:i,tableId:i%2?'1':'2',startedAt:i*100,players:[{username:i===3?'Ana':'Besi'}],pot:i});
 assert.deepEqual(s.listHands({},3).map(h=>h.id),[5,4,3]);
 assert.deepEqual(s.listHands({before:5,table:'1'},9).map(h=>h.id),[3,1]);
 assert.deepEqual(s.listHands({player:'ana'},9).map(h=>h.id),[3]);
 assert.deepEqual(s.listHands({from:200,to:300},9).map(h=>h.id),[3,2]);
 assert.equal(s.getHand(4).pot,4);assert.equal(s.getHand(99),null);s.close();
 s=openStore(file);assert.equal(s.load().handSeq,5,'handSeq was never saved, the stored hands decide');s.close();
});

test('moving from files: everything arrives, the files stay, duplicate hand numbers are kept apart',()=>{
 const dir=tmp(),state=path.join(dir,'state.json'),hands=path.join(dir,'hands.jsonl'),file=path.join(dir,'klor.db');
 const db={...sample(),handSeq:2};fs.writeFileSync(state,JSON.stringify(db));
 const lines=[1,2,1].map((id,k)=>JSON.stringify({id,tableId:'1',startedAt:k,players:[{username:'Ana'}],pot:k}));fs.writeFileSync(hands,lines.join('\n')+'\nnot json\n');
 const before=fs.readFileSync(state,'utf8');
 let s=openStore(file);const done=s.importFiles(state,hands);assert.equal(done.hands,3);assert.equal(done.skipped,1);s.close();
 assert.equal(fs.readFileSync(state,'utf8'),before,'the old file is untouched');
 s=openStore(file);const back=s.load();assert.deepEqual(back,{...db,handSeq:3});assert.deepEqual(s.listHands({},9).map(h=>h.pot),[2,1,0]);s.close();
});

test('a damaged state file stops the start instead of opening an empty database',()=>{
 const dir=tmp(),state=path.join(dir,'state.json'),file=path.join(dir,'klor.db');fs.writeFileSync(state,'{"users":[');
 const s=openStore(file);assert.throws(()=>s.importFiles(state,path.join(dir,'none')),/Cannot read/);assert.equal(s.load(),null);s.close();
});

test('only the newest transactions load into memory; older ones stay reachable and new ones keep their place',()=>{
 const file=path.join(tmp(),'f.db');let s=openStore(file);const db={...sample(),ledger:Array.from({length:10},(_,i)=>({id:'l'+i,type:i%2?'RAKE':'BUY_IN',amount:i,time:i}))};s.commit(db);s.close();
 s=openStore(file);const back=s.load(3);assert.deepEqual(back.ledger.map(l=>l.id),['l7','l8','l9']);assert.deepEqual(s.olderRake().map(l=>l.id),['l1','l3','l5']);
 const page=s.olderLedger(Infinity,4);assert.deepEqual(page.rows.map(l=>l.id),['l3','l4','l5','l6']);assert.deepEqual(s.olderLedger(page.seq,4).rows.map(l=>l.id),['l0','l1','l2']);
 back.ledger.push({id:'l10',type:'RAKE',amount:1,time:10});s.commit(back);s.close();
 s=openStore(file);assert.deepEqual(s.load(100).ledger.map(l=>l.id),Array.from({length:11},(_,i)=>'l'+i));s.close();
});

test('sessions, activity and reports are stored; statistics fill in for older databases',()=>{
 const file=path.join(tmp(),'g.db');let s=openStore(file);s.commit(sample());
 s.putSession('k1',{userId:'u',created:1});s.putSession('k2',{userId:'c',created:2});s.delSession('k2');assert.deepEqual(s.sessions(),[['k1',{userId:'u',created:1}]]);
 s.addAudit({at:1,actorId:'c',actor:'center',role:'CENTER',action:'rake',details:{percent:4}});s.addAudit({at:2,actor:'admin1',action:'transfer',target:'x'});
 assert.equal(s.listAudit({action:'rake'})[0].details.percent,4);assert.equal(s.listAudit({actor:'admin'}).length,1);assert.equal(s.listAudit({limit:1})[0].action,'transfer');
 s.addHand({id:1,tableId:'1',startedAt:Date.now(),winners:['Ana'],actions:[{street:'preflop',username:'Ana',type:'CALL'},{street:'flop',username:'Besi',type:'BET'}],players:[{userId:'u',username:'Ana',result:5},{userId:'b',username:'Besi',result:-5}]});
 const a=s.playerStats('u'),b=s.playerStats('b');assert.deepEqual([a.hands,a.won,a.vpip,a.net],[1,1,1,5]);assert.deepEqual([b.won,b.vpip,b.net],[0,0,-5]);assert.equal(a.days[0].net,5);
 assert.equal(s.playerHands('u',Infinity,5).length,1);assert.equal(s.playerHands('u',1,5).length,0);s.close();
 // An older database: hands without statistics rows.
 const old=new DatabaseSync(file);old.exec("DELETE FROM hand_players;DELETE FROM meta WHERE key='handPlayers'");old.close();
 s=openStore(file);assert.equal(s.playerStats('u').hands,1,'filled from the stored hands');s.close();
});

test('no files: nothing to import',()=>{
 const dir=tmp(),s=openStore(path.join(dir,'klor.db'));assert.equal(s.importFiles(path.join(dir,'a'),path.join(dir,'b')),null);s.close();
});
