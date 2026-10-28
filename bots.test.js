import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,LIVE} from './game.js';
import {createBots,botDecision,botView,handStrength,equity} from './bots.js';

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
 let seed=7;const rng=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const base={game:'holdem',phase:'preflop',board:[],pot:300,currentBet:200,toCall:200,minRaiseTo:400,maxRaiseTo:20000,stack:20000,roundBet:0,bb:200,canRaise:true,opponents:1};
 assert.ok(handStrength({...base,cards:['As','Ad']})>handStrength({...base,cards:['7c','2d']}));
 assert.equal(botDecision({...base,cards:['As','Ad']},'low',rng).type,'raise');
 assert.equal(botDecision({...base,cards:['7c','2d'],toCall:8000,currentBet:8000,pot:8300},'low',rng).type,'fold');
 const plo=botDecision({...base,game:'omaha',cards:['As','Ad','Ks','Kd'],maxRaiseTo:700},'high',rng);assert.equal(plo.type,'raise');assert.ok(plo.amount*100<=700,'never above the pot limit');
 assert.equal(botDecision({...base,toCall:0,currentBet:0,canRaise:false,cards:['7c','2d']},'low',rng).type,'check');
 // Equity is estimated from the bot's own cards only and matches known values.
 const eq=equity({...base,cards:['As','Ad']},3000,rng);assert.ok(eq>.8&&eq<.9,'AA vs one random hand ≈ 85%: '+eq);
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

test('bot rake is not revenue: reports count real players only, the house result includes it',async()=>{
 const {revenueReport,rakeReport}=await import('./rake.js');
 const {center,db,engine,t,manager}=world();db.rakePercent=5;db.tables=[{id:'1',name:'Test',sb:100,bb:200}];
 const admin={id:'ad',username:'admin1',role:'ADMIN',parentId:'center',balance:0,share:40},agent={id:'ag',username:'agent1',role:'AGENT',parentId:'ad',balance:0,share:20};
 const h1={id:'h1',username:'human1',role:'USER',parentId:'ag',balance:500000},h2={id:'h2',username:'human2',role:'USER',parentId:'ag',balance:500000};db.users.push(admin,agent,h1,h2);
 manager.route('/api/bots/create',{name:'Marco',budget:2000,tableId:'1',buyin:500,stopLoss:2000,stopWin:2000},center);const b=db.users.find(u=>u.isBot);
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);engine.sit(t,h1,0,500,[t]);engine.sit(t,h2,3,500,[t]);
 for(let hand=0;hand<120;hand++){manager.tick();if(!engine.startHand(t))break;
  for(let k=0;k<200&&LIVE.includes(t.phase);k++){if(t.runout){engine.tickTable(t,t.runout.at+1);continue;}const s=t.seats[t.turn];if(s.userId===b.id){manager.tick(t.turnStartedAt+5000);continue;}engine.act(t,s.userId,t.currentBet>s.roundBet?'call':'check');}
  for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;}
 const rakes=db.ledger.filter(x=>x.type==='RAKE');assert.ok(rakes.length>20);
 const botPaid=rakes.flatMap(x=>x.allocations).filter(a=>a.userId===b.id).reduce((n,a)=>n+a.amount,0),humanPaid=rakes.flatMap(x=>x.allocations).filter(a=>a.userId!==b.id).reduce((n,a)=>n+a.amount,0);
 assert.ok(botPaid>0&&humanPaid>0);assert.ok(rakes.flatMap(x=>x.allocations).filter(a=>a.userId===b.id).every(a=>a.bot),'bot allocations are flagged');
 const rev=revenueReport(db,center,{from:'all'});assert.equal(rev.totals.rake,humanPaid,'revenue = rake of real players');assert.equal(rev.totals.botRake,botPaid,'bot rake shown apart');{const all=revenueReport(db,center,{from:'all',includeBots:true});assert.equal(all.totals.rake,humanPaid+botPaid,'switch on: bot rake included');assert.ok(all.byChild.some(c=>c.username==='Bots (house)'&&c.rake===botPaid));assert.ok(all.byPlayer.some(p=>p.bot));assert.equal(revenueReport(db,admin,{from:'all',includeBots:true}).totals.rake,humanPaid,'only the center can include bots');}
 assert.ok(!rev.byChild.some(c=>c.id===b.id)&&!rev.byPlayer.some(p=>p.id===b.id),'bots are not in the network lists');
 assert.equal(rakeReport(db,center).total,humanPaid);assert.equal(rakeReport(db,center).botTotal,botPaid);
 // Admin and agent shares come only from their own players.
 assert.equal(revenueReport(db,admin,{from:'all'}).totals.rake,humanPaid);assert.equal(revenueReport(db,admin,{from:'all'}).totals.botRake,undefined);
 const row=manager.list().find(x=>x.id===b.id);assert.equal(Math.round(row.rakePaid*100),botPaid);assert.equal(Math.round(row.house*100),Math.round(row.total*100)+botPaid);
});

test('seat-only bots fill a seat and never lose a cent',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Filler',budget:200,tableId:'1',buyin:50,stopLoss:100,stopWin:100,mode:'seat'},center);const b=db.users.find(u=>u.isBot);
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);const h1=human(1,500000),h2=human(2,500000);engine.sit(t,h1,0,500,[t]);engine.sit(t,h2,3,500,[t]);
 manager.tick();assert.ok(t.seats.some(s=>s?.userId===b.id),'the bot sits');const start=b.balance+t.seats.find(s=>s?.userId===b.id).stack;
 for(let hand=0;hand<80;hand++){manager.tick();if(!engine.startHand(t))break;assert.ok(!t.seats.find(s=>s?.userId===b.id)?.inHand,'never dealt in');
  for(let k=0;k<200&&LIVE.includes(t.phase);k++){if(t.runout){engine.tickTable(t,t.runout.at+1);continue;}const s=t.seats[t.turn];engine.act(t,s.userId,t.currentBet>s.roundBet?'call':'check');}
  for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;}
 const seat=t.seats.find(s=>s?.userId===b.id);assert.ok(seat,'still seated after many hands');assert.equal(b.balance+seat.stack,start,'not one cent lost');
});

test('house protection stops every bot when the daily limit is reached',()=>{
 const {center,db,engine,t,manager,human}=world();
 for(const n of ['A','B'])manager.route('/api/bots/create',{name:'Bot'+n,budget:300,tableId:'1',buyin:50,stopLoss:300,stopWin:300},center);
 manager.route('/api/bots/settings',{dailyLimit:20},center);for(const b of db.users.filter(u=>u.isBot))manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 engine.sit(t,human(1),0,100,[t]);manager.tick();assert.equal(manager.route('/api/bots/guard',{},center).today,0);
 // The bots lose €25 between them (as if it happened at the table).
 db.users.find(u=>u.username==='BotA').balance-=1500;db.users.find(u=>u.username==='BotB').balance-=1000;manager.tick();
 const g=manager.route('/api/bots/guard',{},center);assert.equal(g.today,-25);assert.ok(g.stopped);
 assert.ok(db.users.filter(u=>u.isBot).every(b=>!b.bot.enabled&&b.bot.error==='House daily limit reached'));
 assert.ok(!t.seats.some(s=>s&&db.users.find(u=>u.id===s.userId)?.isBot),'the bots left the table');
 assert.throws(()=>manager.route('/api/bots/settings',{dailyLimit:-1},center),/0 or more/);
});

test('all-ins: the bot calls when the price is right and defends the chips it has put in',()=>{
 let seed=11;const rng=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 // A frequent shover puts €100 in; the bot has the big blind with a hand that is a favourite vs random.
 const shove={game:'holdem',phase:'preflop',board:[],pot:10200,currentBet:10000,toCall:9800,minRaiseTo:10000,maxRaiseTo:10000,stack:9800,roundBet:200,bb:200,canRaise:false,opponents:1,committed:200,facingAllIn:true};
 assert.equal(botDecision({...shove,cards:['Kh','9c'],shoveRate:1},'low',rng).type,'call','K9 calls an always-shover');
 assert.equal(botDecision({...shove,cards:['7c','2d'],shoveRate:1},'low',rng).type,'fold','72 still folds');
 // After betting a third of its stack, the bot does not give the pot away to a shove.
 const committed={game:'holdem',phase:'flop',board:['Qs','8d','3c'],pot:9000,currentBet:9000,toCall:6000,minRaiseTo:9000,maxRaiseTo:9000,stack:6000,roundBet:3000,bb:200,canRaise:false,opponents:1,committed:4000,facingAllIn:true};
 assert.equal(botDecision({...committed,cards:['Qh','Ts']},'low',rng).type,'call','top pair defends after committing');
 // A bluff never risks more than a tenth of the stack.
 for(let i=0;i<200;i++){const d=botDecision({game:'holdem',phase:'flop',board:['As','Kd','7c'],pot:600,currentBet:0,toCall:0,minRaiseTo:200,maxRaiseTo:20000,stack:20000,roundBet:0,bb:200,canRaise:true,opponents:1,committed:300,cards:['4h','2c']},'high',rng);if(d.type==='raise')assert.ok(d.amount*100<=2000,'small bluff only');}
});
