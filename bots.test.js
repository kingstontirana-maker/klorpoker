import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,LIVE} from './game.js';
import {createBots,botDecision,botView,handStrength} from './bots.js';

function world(){
 const center={id:'center',username:'center',role:'CENTER',balance:1000000},db={users:[center],ledger:[],rakePercent:0};
 const runtime=new Map(),engine=createEngine({db}),t=engine.makeTable('1','Test',100,200);runtime.set('1',t);
 const manager=createBots({db,runtime,engine,save:()=>{}});
 const human=(i,cents=50000)=>{const u={id:'h'+i,username:'human'+i,role:'USER',balance:cents};db.users.push(u);return u;};
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+t.seats.reduce((n,s)=>n+(s?s.stack:0),0)+(LIVE.includes(t.phase)?t.pot:0);
 return {center,db,runtime,engine,t,manager,human,total};
}

test('bot budgets, permissions, configuration and refunds conserve credit',()=>{
 const {center,db,manager}=world();
 assert.throws(()=>manager.route('/api/bots',{},{role:'AGENT'}),/Only the center/);
 assert.throws(()=>manager.route('/api/bots/create',{name:'NoTable',budget:100},center),/valid table/);assert.equal(center.balance,1000000);
 assert.throws(()=>manager.route('/api/bots/create',{name:'Huge',budget:999999,tableId:'1'},center),/enough credit/);
 manager.route('/api/bots/create',{name:'TestBot',budget:100,tableId:'1',buyin:40,stopLoss:30,stopWin:10},center);const b=db.users[1];
 assert.equal(b.username,'TestBot');assert.ok(b.isBot);assert.equal(center.balance,990000);assert.equal(b.balance,10000);assert.deepEqual([b.bot.buyin,b.bot.stopLoss,b.bot.stopWin],[4000,3000,1000]);
 assert.throws(()=>manager.route('/api/bots/configure',{id:b.id,tableId:'1',risk:'crazy',buyin:40,stopLoss:30,stopWin:10},center),/Invalid risk/);
 manager.route('/api/bots/delete',{id:b.id},center);assert.equal(center.balance,1000000);assert.equal(db.users.length,1);
});

test('bots only fill seats: they need a real player and never take the last free seat',()=>{
 const {center,db,engine,t,manager,human}=world();
 for(const n of ['A','B','C','D'])manager.route('/api/bots/create',{name:'Bot'+n,budget:200,tableId:'1',buyin:40,stopLoss:100,stopWin:100},center);
 for(const b of db.users.filter(u=>u.isBot))manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 manager.tick();assert.equal(t.seats.filter(Boolean).length,0,'no bot sits at an empty table');
 engine.sit(t,human(1),0,100,[t]);for(let i=0;i<5;i++)manager.tick();
 assert.equal(t.seats.filter(s=>s?.isBot).length,3,'at most three bots per table');
 engine.sit(t,human(2),5,100,[t]);for(let i=0;i<3;i++)manager.tick();
 assert.equal(t.seats.filter(s=>!s).length,1,'a seat stays free for real players');
 // When the real players leave, the bots stand up too.
 engine.leave(t,db.users.find(u=>u.id==='h1'));engine.leave(t,db.users.find(u=>u.id==='h2'));manager.tick();
 assert.equal(t.seats.filter(Boolean).length,0);
});

test('the decision sees only its own cards and the public table',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Fair',budget:200,tableId:'1',buyin:40,stopLoss:100,stopWin:100},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);engine.sit(t,human(1),0,100,[t]);manager.tick();engine.startHand(t);
 const s=t.seats.find(x=>x?.userId===b.id),v=botView(t,s),seen=JSON.stringify(v);
 const others=t.seats.filter(x=>x&&x!==s).flatMap(x=>x.cards);assert.ok(others.length);
 for(const c of [...others,...t.deck])assert.ok(!seen.includes('"'+c+'"'),'no other card in the view: '+c);
 assert.deepEqual(v.cards,s.cards);
});

test('strong hands play, weak hands give up, pot limit is respected',()=>{
 const base={game:'holdem',phase:'preflop',board:[],pot:300,currentBet:200,toCall:200,minRaiseTo:400,maxRaiseTo:20000,stack:20000,roundBet:0,bb:200,canRaise:true};
 assert.ok(handStrength({...base,cards:['As','Ad']})>handStrength({...base,cards:['7c','2d']}));
 assert.equal(botDecision({...base,cards:['As','Ad']},'low',()=>.5).type,'raise');
 assert.equal(botDecision({...base,cards:['7c','2d'],toCall:8000,currentBet:8000,pot:8300},'low',()=>.9).type,'fold');
 const plo=botDecision({...base,game:'omaha',cards:['As','Ad','Ks','Kd'],maxRaiseTo:700},'high',()=>.5);assert.equal(plo.type,'raise');assert.ok(plo.amount*100<=700,'never above the pot limit');
 assert.equal(botDecision({...base,toCall:0,currentBet:0,canRaise:false,cards:['7c','2d']},'low',()=>.9).type,'check');
});

test('bots and real players play many hands: money is conserved and limits stop the bot',()=>{
 const {center,db,engine,t,manager,human,total}=world();
 manager.route('/api/bots/create',{name:'Lucky',budget:300,tableId:'1',buyin:50,stopLoss:60,stopWin:15,risk:'medium'},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 const h1=human(1,500000),h2=human(2,500000);engine.sit(t,h1,0,500,[t]);engine.sit(t,h2,3,500,[t]);const start=total();
 let stopped=false;
 for(let hand=0;hand<400&&!stopped;hand++){
  manager.tick();if(!engine.startHand(t))break;
  for(let k=0;k<200&&LIVE.includes(t.phase);k++){
   if(t.runout){engine.tickTable(t,t.runout.at+1);continue;}
   const s=t.seats[t.turn];if(s.userId===b.id){manager.tick(t.turnStartedAt+5000);continue;}
   const owe=t.currentBet-s.roundBet;engine.act(t,s.userId,owe?(Math.random()<.7?'call':'fold'):'check');}
  for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;
  manager.tick();stopped=!b.bot.enabled;
  assert.equal(total(),start,'no money created or lost');
 }
 assert.ok(stopped,'the win or loss limit ends the session');assert.match(b.bot.error,/Win limit|Loss limit/);
 const session=(b.balance-b.bot.baseline)/100;assert.ok(session>=15||session<=-60);
});

test('players never learn which seat is a bot; the center does',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Marco',budget:200,tableId:'1',buyin:40,stopLoss:100,stopWin:100},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);const h=human(1);engine.sit(t,h,0,100,[t]);manager.tick();
 const view=engine.snapshot(t,h.id,false),seat=view.seats.find(s=>s?.username==='Marco');
 assert.ok(seat,'the bot is seated under a normal name');assert.ok(!JSON.stringify(view).match(/isBot|"bot"|BOT/),'nothing in the player view marks a bot');
 assert.equal(engine.inspect(t).seats.find(s=>s?.username==='Marco').bot,true,'the center inspection shows it');
 assert.throws(()=>manager.route('/api/bots/create',{name:'human1',budget:10,tableId:'1'},center),/already taken/);
});
