import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,fail} from './game.js';
import {createBots} from './bots.js';
import {createCenb} from './cenb.js';
import {TABLE_CATALOG} from './table-catalog.js';
import {openStore} from './store.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function setup(){
 const center={id:'center',username:'center',role:'CENTER',balance:10_000_000},db={users:[center],ledger:[],rakePercent:0};
 const engine=createEngine({db}),runtime=new Map();
 for(const [id,size,bb] of [['small',2,100],['large',6,1000]])runtime.set(id,engine.makeTable(id,id,bb/2,bb,'holdem',size));
 let seed=73;const random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
 const manager=createBots({db,runtime,engine,save:()=>{},random});
 const route=(name,body={})=>manager.route('/api/bots/'+name,body,center);
 const names=Array.from({length:30},(_,i)=>'TestName_'+i);
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+[...runtime.values()].reduce((n,t)=>n+t.seats.reduce((m,s)=>m+(s?.stack||0),0),0);
 route('guard');return {db,center,engine,runtime,manager,route,names,total};
}

test('saved name list validates duplicates, survives manager reload and supplies ordinary bulk creation',()=>{
 const {route,db,center,engine,runtime,names}=setup();
 assert.throws(()=>route('names',{names:'Test\ntest'}),/përsëritur/);
 assert.throws(()=>route('names',{names:'<script>'}),/Emrat/);
 route('names',{names:names.join('\n')});
 assert.deepEqual(route('overview').fill.names,names);
 const reloaded=createBots({db,runtime,engine,save:()=>{}});
 assert.deepEqual(reloaded.route('/api/bots/overview',{},center).fill.names,names);
 route('bulk',{count:2,budget:100,tableId:'small',buyin:20,stopLoss:20});
 assert.deepEqual(db.users.filter(u=>u.isBot).map(u=>u.username),names.slice(0,2));
});

test('fill all tables reserves X seats, scales and varies buy-ins, conserves credit and is idempotent',()=>{
 const {route,db,runtime,manager,names,total}=setup();const initial=total();
 route('names',{names});
 const result=route('fill',{tableId:'all',emptySeats:1,buyinMinPercent:30,buyinMaxPercent:80,budgetPercent:200,stopLossPercent:50,stopWinPercent:150,mode:'seat'});
 assert.equal(result.added,6);
 for(const t of runtime.values()){
  assert.equal(t.seats.filter(s=>!s).length,1);
  for(const s of t.seats.filter(Boolean)){
   const b=db.users.find(u=>u.id===s.userId);
   assert.ok(s.stack>=t.bb*30&&s.stack<=t.bb*80);
   assert.equal(b.bot.stopLoss,Math.round(s.stack*.5));
   assert.equal(b.bot.stopWin,Math.round(s.stack*1.5));
   assert.equal(b.bot.funded,s.stack*2);assert.equal(s.sittingOut,true);
  }
 }
 assert.ok(new Set(db.users.filter(u=>u.isBot).map(u=>u.bot.buyin)).size>2);
 manager.tick();manager.tick();assert.equal(runtime.get('large').seats.filter(Boolean).length,5,'fill policy overrides ordinary two-bot cap');
 assert.equal(route('fill',{tableId:'all',emptySeats:1,mode:'seat'}).added,0);
 assert.equal(total(),initial);
});

test('single-table fill can occupy every seat; reducing the target releases excess bots between hands',()=>{
 const {route,runtime,manager,names,total}=setup();const initial=total();route('names',{names});
 assert.equal(route('fill',{tableId:'large',emptySeats:0,mode:'seat'}).added,6);
 manager.tick();assert.equal(runtime.get('large').seats.filter(Boolean).length,6);
 assert.equal(runtime.get('small').seats.filter(Boolean).length,0);
 route('fill',{tableId:'large',emptySeats:4,mode:'seat'});manager.tick();manager.tick();
 assert.equal(runtime.get('large').seats.filter(Boolean).length,2);
 assert.equal(total(),initial);
});

test('fill validates all tables before creating accounts or moving credit',()=>{
 for(const problem of ['names','credit','percent','range','target','limit']){
  const {route,db,center,names}=setup();route('names',{names:problem==='names'?names.slice(0,1):names});
  if(problem==='credit')center.balance=1;
  if(problem==='limit')route('settings',{maxBB:.5});
  const before=JSON.stringify({users:db.users,ledger:db.ledger,fill:db.botFill});
  if(problem==='limit'){
   const r=route('fill',{tableId:'all'});assert.equal(r.added,0);assert.ok(r.tables.every(t=>t.skipped));continue;
  }
  const body={tableId:'all',...(problem==='percent'?{budgetPercent:99}:{}),...(problem==='range'?{buyinMinPercent:90,buyinMaxPercent:20}:{}),...(problem==='target'?{tableId:'missing'}:{})};
  assert.throws(()=>route('fill',body));
  assert.equal(JSON.stringify({users:db.users,ledger:db.ledger,fill:db.botFill}),before,problem+' failure is non-mutating');
 }
});

test('fill reuses stopped named bots and only funds the missing wallet credit',()=>{
 const {route,db,runtime,names,total}=setup();route('names',{names});const initial=total();
 const body={tableId:'small',emptySeats:1,buyinMinPercent:50,buyinMaxPercent:50,budgetPercent:200,mode:'seat'};
 route('fill',body);const b=db.users.find(u=>u.isBot);const id=b.id;
 route('stopall');assert.equal(runtime.get('small').seats.filter(Boolean).length,0);
 const result=route('fill',body);assert.equal(result.added,1);assert.equal(result.funded,0);
 assert.equal(db.users.filter(u=>u.isBot).length,1);assert.equal(runtime.get('small').seats.find(Boolean).userId,id);
 assert.equal(total(),initial);
});

test('fill skips queues, respects real seats and protects access through CENB',()=>{
 const {route,db,center,engine,runtime,manager,names}=setup();route('names',{names});
 const human={id:'h',username:'human',role:'USER',balance:10000};db.users.push(human);
 engine.sit(runtime.get('small'),human,0,50,[...runtime.values()]);
 runtime.get('large').waitlist=[{userId:'waiting'}];
 const r=route('fill',{tableId:'all',emptySeats:1});assert.equal(r.added,0);assert.ok(r.tables.find(t=>t.id==='large').skipped);
 assert.throws(()=>manager.route('/api/bots/fill',{tableId:'all'},human),/Only the center/);
 const cenb=createCenb({db,bots:manager,save:()=>{},fail,env:{CENB_PASSWORD:'IsolatedTest1234'}});
 assert.throws(()=>cenb.route('bots/fill',{tableId:'small'},null,'test'),/Sign in/);
 const {token}=cenb.route('login',{username:'cenb',password:'IsolatedTest1234'},null,'test');
 cenb.route('bots/fill',{tableId:'small',emptySeats:0},token,'test');
 assert.equal(runtime.get('small').seats.filter(Boolean).length,2);
 assert.ok(db.cenbLog.some(l=>l.action==='Filled virtual-credit tables'));
});

test('one fill covers the complete production table catalog and persists its configuration',()=>{
 const {route,db,center,engine,runtime,total,manager}=setup();runtime.clear();center.balance=10_000_000_000;
 for(const [i,c] of TABLE_CATALOG.entries()){const id=String(i+1);runtime.set(id,engine.makeTable(id,c.name,c.sb,c.bb,c.game,c.size));}
 const initial=total(),names=Array.from({length:1000},(_,i)=>'CatalogBot_'+i);route('names',{names});
 const r=route('fill',{tableId:'all',emptySeats:1,mode:'seat'});
 assert.equal(r.added,TABLE_CATALOG.reduce((n,t)=>n+t.size-1,0));assert.ok(r.added>100);
 for(const t of runtime.values())assert.equal(t.seats.filter(s=>!s).length,1,t.name);
 manager.tick();for(const t of runtime.values())assert.equal(t.seats.filter(s=>!s).length,1,'target remains stable at '+t.name);
 assert.equal(total(),initial);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cenb-fill-'));let store;
 try{
  store=openStore(path.join(dir,'test.db'));store.commit({...db,tables:[]});store.close();
  store=openStore(path.join(dir,'test.db'));const loaded=store.load();
  assert.deepEqual(loaded.botNames,names);assert.deepEqual(loaded.botFill,db.botFill);
 }finally{store?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
