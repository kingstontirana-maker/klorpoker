import test from 'node:test';
import assert from 'node:assert/strict';
import {distribute} from './poker.js';
import {rakeReport,revenueReport,rakeShares} from './rake.js';
import {createEngine,LIVE} from './game.js';

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

test('revenue report: who generated it, how, isolated per branch, with date ranges',()=>{
 const users=[{id:'c',username:'center',role:'CENTER'},{id:'a',username:'adminA',parentId:'c',role:'ADMIN'},{id:'b',username:'adminB',parentId:'c',role:'ADMIN'},
  {id:'g',username:'agentG',parentId:'a',role:'AGENT'},{id:'p',username:'ana',parentId:'g',role:'USER'},{id:'r',username:'rea',parentId:'g',role:'USER'},{id:'q',username:'besi',parentId:'b',role:'USER'}];
 const at=s=>Date.parse(s);
 const db={users,tables:[{id:'1',name:'Emerald',sb:100,bb:200,color:'#1f9d6b'},{id:'2',name:'Ruby',sb:200,bb:400,color:'#8c1d36'}],ledger:[
  {id:'h1',type:'RAKE',tableId:'1',hand:1,amount:60,time:at('2026-10-10T20:15:00+02:00'),allocations:[{userId:'p',amount:30},{userId:'q',amount:30}]},
  {id:'h2',type:'RAKE',tableId:'2',hand:7,amount:90,time:at('2026-10-12T21:40:00+02:00'),allocations:[{userId:'p',amount:40},{userId:'r',amount:50}]},
  {id:'h0',type:'RAKE',tableId:'1',hand:0,amount:15,time:at('2026-10-03T10:00:00+02:00'),allocations:[{userId:'p',amount:15}]},
  {id:'old',type:'RAKE',tableId:'1',amount:5,time:at('2026-10-11T12:00:00+02:00')}]};
 const now=at('2026-10-13T12:00:00+02:00'),range={from:'2026-10-07',to:'2026-10-13'};
 // Centre: everything, split by admin, plus unattributed legacy rake.
 const c=revenueReport(db,users[0],range,now);
 assert.equal(c.totals.rake,155);assert.equal(c.totals.hands,3);assert.equal(c.totals.players,3);
 assert.deepEqual(c.byChild.map(x=>[x.username,x.rake]),[['adminA',120],['adminB',30],['Unattributed (before detailed records)',5]]);
 assert.equal(c.byTable.find(t=>t.name==='Ruby').rake,90);
 assert.equal(c.series.length,7);assert.equal(c.series.find(s=>s.key==='2026-10-12').rake,90);
 assert.equal(c.hours[21].rake,90,'hour of day in Tirana');
 assert.deepEqual([c.previous.from,c.previous.to,c.previous.rake],['2026-09-30','2026-10-06',15]);
 // Admin A sees only its branch: its agent, its players, never adminB's player.
 const a=revenueReport(db,users[1],range,now);
 assert.equal(a.totals.rake,120);assert.deepEqual(a.byChild.map(x=>[x.username,x.rake,x.players]),[['agentG',120,2]]);
 assert.ok(!a.byPlayer.some(p=>p.username==='besi'));
 // Agent G: per player, with the upline of each.
 const g=revenueReport(db,users[3],range,now);
 assert.deepEqual(g.byChild.map(x=>[x.username,x.rake]),[['ana',70],['rea',50]]);
 assert.deepEqual(g.byPlayer.map(p=>[p.username,p.agent,p.admin]),[['ana','agentG','adminA'],['rea','agentG','adminA']]);
 // Drill-down only inside one's own network.
 assert.equal(revenueReport(db,users[0],{...range,scope:'g'},now).totals.rake,120);
 assert.deepEqual(revenueReport(db,users[0],{...range,scope:'g'},now).path.map(p=>p.username),['center','adminA','agentG']);
 assert.throws(()=>revenueReport(db,users[2],{...range,scope:'g'},now),/not in your network/);
 // Detail rows for export add up to the total.
 const d=revenueReport(db,users[0],{...range,detail:true},now);
 assert.equal(d.rows.reduce((n,r)=>n+r.amount,0),150,'attributed rows (legacy has no player)');
});

test('revenue share: agent ≤ admin, the centre keeps the rest, no cent is lost',()=>{
 const users=[{id:'c',role:'CENTER'},{id:'a',role:'ADMIN',parentId:'c',share:20},{id:'g',role:'AGENT',parentId:'a',share:15},{id:'p',role:'USER',parentId:'g'},
  {id:'b',role:'ADMIN',parentId:'c'},{id:'h',role:'AGENT',parentId:'b',share:30},{id:'q',role:'USER',parentId:'h'}];
 const db={users};
 {const r=rakeShares(db,[{userId:'p',amount:100}]);assert.deepEqual([r.center,r.shares],[80,[{userId:'g',role:'AGENT',amount:15},{userId:'a',role:'ADMIN',amount:5}]]);}
 assert.deepEqual(rakeShares(db,[{userId:'q',amount:100}]).shares,[],'an agent never gets more than its admin (admin b has 0%)');
 users[1].share=20;users[2].share=40;assert.equal(rakeShares(db,[{userId:'p',amount:100}]).shares.find(s=>s.userId==='g').amount,20,'agent capped at the admin\'s 20%');
 users[2].share=12.5;
 let seed=3;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 let paidAgent=0,owedAgent=0;for(let i=0;i<2000;i++){const allocs=[{userId:'p',amount:1+Math.floor(rnd()*999)},{userId:'q',amount:Math.floor(rnd()*500)}];const r=rakeShares(db,allocs);for(const [id,c] of Object.entries(r.carry))users.find(u=>u.id===id).shareCarry=c;paidAgent+=r.shares.find(x=>x.userId==='g')?.amount||0;owedAgent+=allocs[0].amount*0.125;
  assert.equal(r.center+r.shares.reduce((n,s)=>n+s.amount,0),allocs.reduce((n,a)=>n+a.amount,0));assert.ok(r.shares.every(s=>s.amount>0));}
 assert.ok(Math.abs(paidAgent-owedAgent)<1,'sub-cent remainders are carried, so the agent gets exactly 12.5% over time');
});

test('a hand with rake credits the agent, the admin and the centre at once',()=>{
 const users=[{id:'c',username:'center',role:'CENTER',balance:0},{id:'a',username:'adm',role:'ADMIN',parentId:'c',share:20,balance:0},{id:'g',username:'agt',role:'AGENT',parentId:'a',share:10,balance:0},
  {id:'p0',username:'p0',role:'USER',parentId:'g',balance:100000},{id:'p1',username:'p1',role:'USER',parentId:'g',balance:100000}];
 const db={users,ledger:[],rakePercent:5,tables:[]};const e=createEngine({db}),t=e.makeTable('1','T',100,200);
 e.sit(t,users[3],0,500,[t]);e.sit(t,users[4],1,500,[t]);
 const money=()=>users.reduce((n,u)=>n+u.balance,0)+t.seats.reduce((n,s)=>n+(s?s.stack:0),0)+(LIVE.includes(t.phase)?t.pot:0);const before=money();
 e.startHand(t);const who=()=>t.seats[t.turn].userId,owe=()=>t.currentBet-t.seats[t.turn].roundBet;
 e.act(t,who(),'call');e.act(t,who(),'check');assert.equal(t.phase,'flop');
 e.act(t,who(),'raise',10);e.act(t,who(),'call');while(LIVE.includes(t.phase)&&t.turn>=0)e.act(t,who(),owe()?'call':'check');
 const rake=db.ledger.find(x=>x.type==='RAKE');assert.ok(rake,'rake was taken');
 const agent=users[2].balance,admin=users[1].balance,center=users[0].balance;
 assert.equal(agent+admin+center,rake.amount);assert.ok(agent>0&&admin>0);
 assert.deepEqual(rake.shares.map(s=>[s.userId,s.amount]).sort(),[['a',admin],['g',agent]]);
 assert.equal(money(),before,'money is conserved');
 // the revenue report shows each one's earnings
 const now=Date.now(),r=revenueReport(db,users[1],{},now);assert.equal(r.totals.earned,admin);assert.equal(r.totals.paidToNetwork,agent);
 assert.equal(revenueReport(db,users[0],{},now).totals.earned,center);assert.equal(revenueReport(db,users[2],{},now).totals.earned,agent);
});
