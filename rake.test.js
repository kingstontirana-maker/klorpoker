import test from 'node:test';
import assert from 'node:assert/strict';
import {distribute} from './poker.js';
import {rakeReport} from './rake.js';

test('side-pot rake attribution conserves cents and excludes unmatched refunds',()=>{
 const seats=[{id:'p',position:0,committed:1001,cards:['As','Ah']},{id:'q',position:1,committed:203,cards:['Ks','Kh']},{id:'r',position:2,committed:501,cards:['Qs','Qh']}];
 const result=distribute(seats,['2c','3d','4h','7c','9s'],5,1000,true);
 assert.deepEqual(result.rakeContributions,{p:25,q:10,r:25});
 assert.equal(result.totalRake,60);
 assert.equal(Object.values(result.rakeContributions).reduce((a,b)=>a+b,0),result.totalRake);
 assert.equal(Object.values(result.payments).reduce((a,b)=>a+b,0)+result.totalRake,1705);
 assert.deepEqual(distribute(seats.map((s,i)=>({...s,folded:i>0})),[],5,1000,false).rakeContributions,{});
});

test('reports isolate hierarchy branches, preserve legacy and use Berlin dates',()=>{
 const users=[{id:'c',role:'CENTER'}, {id:'a',parentId:'c',role:'ADMIN'}, {id:'b',parentId:'c',role:'ADMIN'}, {id:'g',parentId:'a',role:'AGENT'}, {id:'p',parentId:'g',role:'USER'}, {id:'q',parentId:'b',role:'USER'}];
 const now=Date.parse('2026-10-16T00:30:00+02:00');
 const db={users,ledger:[{id:'old',type:'RAKE',amount:10,time:now-86400000},{id:'new',type:'RAKE',amount:59,time:now,allocations:[{userId:'p',amount:25},{userId:'q',amount:34}]}]};
 assert.equal(rakeReport(db,users[0],now).total,69);
 assert.equal(rakeReport(db,users[0],now).legacyTotal,10);
 const a=rakeReport(db,users[1],now),g=rakeReport(db,users[3],now);
 assert.equal(a.total,25);assert.equal(a.today,25);assert.equal(a.hands,1);assert.deepEqual(a,g);
 assert.equal(rakeReport(db,users[2],now).total,34);
 assert.ok(!JSON.stringify(a).includes('allocations'));
});


test('rake equals capped percent of the full contested pot across side-pot boundaries',()=>{
 const board=['2c','3d','4h','7c','9s'];
 for(const amounts of [[101,203,407],[1,2,3],[999,999,1000],[250,501,1001],[123,456,789]]){
  for(const percent of [0,0.1,2.5,5,7.5,15])for(const cap of [0,1,7,300,10000]){
   const seats=amounts.map((committed,i)=>({id:String(i),position:i,committed,cards:[['As','Ah'],['Ks','Kh'],['Qs','Qh']][i]}));
   const r=distribute(seats,board,percent,cap,true),sorted=[...amounts].sort((a,b)=>a-b),sum=amounts.reduce((a,b)=>a+b,0);
   const expected=Math.min(Math.floor((sum-sorted[2]+sorted[1])*percent/100+1e-9),cap);
   assert.equal(r.totalRake,expected);
   assert.equal(Object.values(r.rakeContributions).reduce((a,b)=>a+b,0),expected);
   assert.equal(Object.values(r.payments).reduce((a,b)=>a+b,0)+r.totalRake,sum);
   assert.equal(r.pots.reduce((a,p)=>a+p.rake,0),expected);
  }
 }
});
