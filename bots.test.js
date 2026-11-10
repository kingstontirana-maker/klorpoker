import test from 'node:test';import {sitDeep} from './test-helpers.js';
import assert from 'node:assert/strict';
import {createEngine,LIVE} from './game.js';
import {createBots,botDecision,botView,handStrength,equity} from './bots.js';
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

function world(random){
 const center={id:'center',username:'center',role:'CENTER',balance:1000000},db={users:[center],ledger:[],rakePercent:0};
 const runtime=new Map(),engine=createEngine({db}),t=engine.makeTable('1','Test',100,200);runtime.set('1',t);
 const manager=createBots({db,runtime,engine,save:()=>{},random});
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
 assert.ok(['call','raise'].includes(botDecision({...base,cards:['As','Ad']},'low',rng).type),'AA plays a reasonably priced preflop bet');
 assert.equal(botDecision({...base,cards:['7c','2d'],toCall:8000,currentBet:8000,pot:8300},'low',rng).type,'fold');
 for(let i=0;i<10;i++){const plo=botDecision({...base,game:'omaha',cards:['As','Ad','Ks','Kd'],board:['Qs','Js','Ts'],maxRaiseTo:700},'high',rng);if(plo.type==='raise')assert.ok(plo.amount*100<=700,'never above the pot limit');}
 assert.equal(botDecision({...base,toCall:0,currentBet:0,canRaise:false,cards:['7c','2d']},'low',rng).type,'check');
 // Equity is estimated from the bot's own cards only and matches known values.
 const eq=equity({...base,cards:['As','Ad']},3000,rng);assert.ok(eq>.8&&eq<.9,'AA vs one random hand ≈ 85%: '+eq);
});

test('bots and real players play many hands: money is conserved and limits stop the bot',()=>{
 const {center,db,engine,t,manager,human,total}=world();
 manager.route('/api/bots/create',{name:'Lucky',budget:300,tableId:'1',buyin:50,stopLoss:60,stopWin:15,risk:'medium'},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 const h1=human(1,500000),h2=human(2,500000);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);const start=total();
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
 assert.ok(stopped,'the win or loss limit ends the session');assert.match(b.bot.error,/Win limit|Loss limit|House daily limit/);
 const session=(b.balance-b.bot.baseline)/100;if(!/House daily limit/.test(b.bot.error))assert.ok(session>=15||session<=-60);
});

test('players see a bot label without hidden cards; the center can inspect',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Marco',budget:200,tableId:'1',buyin:40,stopLoss:100,stopWin:100},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);const h=human(1);engine.sit(t,h,0,100,[t]);manager.tick();
 const view=engine.snapshot(t,h.id,false),seat=view.seats.find(s=>s?.username==='Marco');
 assert.ok(seat,'the bot is seated');assert.equal(seat.bot,true);assert.deepEqual(seat.cards,[],'bot cards stay hidden');
 assert.equal(engine.inspect(t).seats.find(s=>s?.username==='Marco').bot,true,'the center inspection shows it');
 assert.throws(()=>manager.route('/api/bots/create',{name:'human1',budget:10,tableId:'1'},center),/already taken/);
});

test('bot rake is not revenue: reports count real players only, the house result includes it',async()=>{
 const {revenueReport,rakeReport}=await import('./rake.js');
 const {center,db,engine,t,manager}=world();db.rakePercent=5;db.tables=[{id:'1',name:'Test',sb:100,bb:200}];
 const admin={id:'ad',username:'admin1',role:'ADMIN',parentId:'center',balance:0,share:40},agent={id:'ag',username:'agent1',role:'AGENT',parentId:'ad',balance:0,share:20};
 const h1={id:'h1',username:'human1',role:'USER',parentId:'ag',balance:500000},h2={id:'h2',username:'human2',role:'USER',parentId:'ag',balance:500000};db.users.push(admin,agent,h1,h2);
 manager.route('/api/bots/create',{name:'Marco',budget:2000,tableId:'1',buyin:200,stopLoss:2000,stopWin:2000},center);const b=db.users.find(u=>u.isBot);
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);
 for(let hand=0;hand<120;hand++){manager.tick();if(!engine.startHand(t))break;
  for(let k=0;k<200&&LIVE.includes(t.phase);k++){if(t.runout){engine.tickTable(t,t.runout.at+1);continue;}const s=t.seats[t.turn];if(s.userId===b.id){manager.tick(t.turnStartedAt+5000);continue;}engine.act(t,s.userId,t.currentBet>s.roundBet?'call':'check');}
  for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;}
 // Both bots and humans contribute rake when they contest pots.
 const rakes=db.ledger.filter(x=>x.type==='RAKE');assert.ok(rakes.length>0);
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
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);const h1=human(1,500000),h2=human(2,500000);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);
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

const decisionView={game:'holdem',phase:'preflop',cards:['7c','2d'],board:[],pot:300,currentBet:200,toCall:100,minRaiseTo:400,maxRaiseTo:10000,stack:9900,roundBet:100,bb:200,canRaise:true,opponents:1,committed:100};
test('small preflop calls reach the flop, free checks never fold, expensive weak calls fold',()=>{
 for(const risk of ['low','medium','high'])for(let seed=1;seed<=6;seed++){
  assert.notEqual(botDecision(decisionView,risk,seeded(seed)).type,'fold');
  assert.equal(botDecision({...decisionView,toCall:0,canRaise:false},risk,seeded(seed)).type,'check');
  assert.equal(botDecision({...decisionView,toCall:8000,currentBet:8100,pot:8200},risk,seeded(seed)).type,'fold');
 }
});

test('hand budget is cumulative; no external certainty proof unlocks extra credit',()=>{
 const view={...decisionView,cards:['As','Ad'],board:['Ac','Ah','2s'],phase:'flop',pot:3000,currentBet:1000,toCall:1000,roundBet:0,stack:7000,committed:3000};
 const a=botDecision(view,'high',seeded(6),{maxHandPercent:30});assert.equal(a.type,'fold');assert.equal(a.remainingInvestment,0);
 const normal=botDecision(view,'high',seeded(6));
 const fake=botDecision(view,'high',seeded(6),{exact:true,equity:0,safeToInvest:false,opponentEquities:[1],winningFlopAnswered:true});
 assert.deepEqual(normal,fake);
 const limited=botDecision({...view,committed:0,stack:10000},'high',seeded(8),{maxHandPercent:20});
 if(limited.type==='raise')assert.ok(limited.amount*100<=2000);
});

test('value hands mix checks and raises; bluff control adds occasional small raises',()=>{
 const value={...decisionView,cards:['As','Ks'],board:['Qs','Js','Ts'],phase:'flop',pot:600,currentBet:0,toCall:0,roundBet:0,committed:0};
 const outcomes=new Set(),bluffs=[];
 for(let seed=1;seed<=24;seed++){
  outcomes.add(botDecision(value,'high',seeded(seed)).type);
  bluffs.push(botDecision({...value,cards:['7h','2d'],board:['As','Kd','Qc','Jh','8s']},'high',seeded(seed),{bluffPercent:30}));
 }
 assert.ok(outcomes.has('raise')&&outcomes.has('check'),'strong hands do not always use the same action');
 assert.ok(bluffs.some(d=>d.type==='raise'&&d.bluff));
 assert.ok(bluffs.some(d=>d.type==='check'));
 for(const d of bluffs)if(d.bluff)assert.ok(d.amount*100<=Math.floor(value.stack*.08));
 const reraises=[];for(let seed=1;seed<=10;seed++)reraises.push(botDecision({...value,toCall:200,currentBet:200,minRaiseTo:400},'high',seeded(seed)));
 assert.ok(reraises.some(d=>d.type==='raise'&&d.amount>=4));
});

test('live decisions never read the remaining deck or opponents hole cards',()=>{
 const {center,db,engine,t,manager,human}=world(seeded(88));
 manager.route('/api/bots/create',{name:'PublicOnly',budget:200,tableId:'1',buyin:100,stopLoss:100,stopWin:100},center);
 const bot=db.users.find(u=>u.isBot);manager.route('/api/bots/status',{id:bot.id,enabled:true},center);
 engine.sit(t,human(1),0,100,[t]);manager.tick();engine.startHand(t);
 const s=t.seats.find(x=>x?.isBot),opponent=t.seats.find(x=>x&&!x.isBot);
 s.cards=['Ah','Qd'];t.board=['As','7c','2h'];t.phase='flop';t.turn=s.position;t.currentBet=200;s.roundBet=0;t.runout=null;
 Object.defineProperty(t,'deck',{get(){throw Error('Read future cards');}});
 Object.defineProperty(opponent,'cards',{get(){throw Error('Read opponent cards');}});
 const captured=[];engine.act=(...args)=>captured.push(args);
 manager.tick(t.turnStartedAt+5000);
 assert.equal(bot.bot.enabled,true);assert.equal(captured.length,1);assert.ok(['fold','check','call','raise'].includes(captured[0][2]));
});

test('center configures behaviour, rejects invalid inputs and cannot edit an active bot',()=>{
 const {center,db,manager}=world();
 manager.route('/api/bots/create',{name:'Tunable',budget:100,tableId:'1',buyin:40,risk:'medium',bluffPercent:12,maxHandPercent:70,thinkMinMs:600,thinkMaxMs:2500},center);
 const b=db.users.find(u=>u.isBot),row=manager.list()[0];
 assert.deepEqual([row.bluffPercent,row.maxHandPercent,row.thinkMinMs,row.thinkMaxMs],[12,70,600,2500]);
 const before=JSON.stringify(b.bot);
 for(const bad of [{bluffPercent:31},{bluffPercent:-1},{maxHandPercent:101},{maxHandPercent:0},{thinkMinMs:3000,thinkMaxMs:2000},{thinkMaxMs:10001}]){
  assert.throws(()=>manager.route('/api/bots/configure',{id:b.id,tableId:'1',buyin:40,...bad},center));assert.equal(JSON.stringify(b.bot),before);
 }
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 assert.throws(()=>manager.route('/api/bots/configure',{id:b.id,tableId:'1',buyin:40},center),/Stop the bot/);
 manager.route('/api/bots/status',{id:b.id,enabled:false},center);assert.equal(b.bot.enabled,false);
});

test('declared bonus conserves platform credit, splits cents and never pays a target twice',()=>{
 const {center,db,engine,t,manager,human,total}=world();
 manager.route('/api/bots/create',{name:'BonusBot',budget:100.01,tableId:'1',buyin:40},center);
 const bot=db.users.find(u=>u.isBot),h1=human(1),h2=human(2),h3=human(3);for(const [i,h] of [h1,h2,h3].entries())engine.sit(t,h,i,40,[t]);
 engine.sit(t,bot,3,40,[t]);
 const start=total(),wallets=[h1.balance,h2.balance,h3.balance],botWallet=bot.balance,centerBefore=center.balance;
 const result=manager.route('/api/bots/bonus',{id:bot.id,percent:10},center);
 assert.equal(result.amount,10);assert.equal(total(),start);assert.equal(center.balance,centerBefore-1000);assert.equal(bot.balance,botWallet);
 assert.deepEqual([h1.balance-wallets[0],h2.balance-wallets[1],h3.balance-wallets[2]],[334,333,333]);
 const entries=db.ledger.filter(x=>x.type==='BOT_BONUS');assert.equal(entries.length,3);assert.equal(new Set(entries.map(x=>x.batchId)).size,1);
 assert.ok(entries.every(x=>x.from===center.id&&x.tableId===t.id&&x.botId===bot.id));
 assert.throws(()=>manager.route('/api/bots/bonus',{id:bot.id,percent:10},center),/already paid/);
 const recreated=createBots({db,runtime:new Map([[t.id,t]]),engine,save:()=>{}});
 assert.throws(()=>recreated.route('/api/bots/bonus',{id:bot.id,percent:10},center),/already paid/);
 assert.equal(manager.route('/api/bots/bonus',{id:bot.id,percent:15},center).amount,5);
 assert.equal(manager.list()[0].bonusPaid,15);assert.equal(total(),start);
 assert.equal(db.ledger.filter(x=>x.type==='RAKE').length,0);
});

test('bonus rejects unauthorized callers, empty tables, invalid targets and insufficient funds atomically',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'BonusCheck',budget:100,tableId:'1',buyin:40},center);const bot=db.users.find(u=>u.isBot);
 assert.throws(()=>manager.route('/api/bots/bonus',{id:bot.id,percent:10},{role:'AGENT'}),/Only the center/);
 assert.throws(()=>manager.route('/api/bots/bonus',{id:bot.id,percent:10},center),/eligible players/);
 const h=human(1);engine.sit(t,h,0,40,[t]);
 for(const percent of [0,-1,101,'NaN'])assert.throws(()=>manager.route('/api/bots/bonus',{id:bot.id,percent},center));
 center.balance=0;const before=JSON.stringify(db);
 assert.throws(()=>manager.route('/api/bots/bonus',{id:bot.id,percent:10},center),/enough credit/);assert.equal(JSON.stringify(db),before);
 h.blocked=true;assert.throws(()=>manager.route('/api/bots/bonus',{id:bot.id,percent:10},center),/eligible players/);
});

test('center thinking limits are respected and a new turn resets the delay',()=>{
 const {center,db,engine,t,manager,human}=world(seeded(77));
 manager.route('/api/bots/create',{name:'Thinker',budget:100,tableId:'1',buyin:40,thinkMinMs:1000,thinkMaxMs:1000},center);
 const b=db.users.find(u=>u.isBot);manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 engine.sit(t,human(1),0,40,[t]);manager.tick();engine.startHand(t);
 const s=t.seats.find(x=>x?.isBot);t.turn=s.position;t.turnStartedAt=Date.now();t.deadline=t.turnStartedAt+20000;
 const calls=[];engine.act=(...args)=>calls.push(args);
 manager.tick(t.turnStartedAt+999);assert.equal(calls.length,0);
 manager.tick(t.turnStartedAt+1000);assert.equal(calls.length,1);
 t.turnStartedAt+=3000;t.deadline=t.turnStartedAt+20000;
 manager.tick(t.turnStartedAt+999);assert.equal(calls.length,1);
 manager.tick(t.turnStartedAt+1000);assert.equal(calls.length,2);
 manager.route('/api/bots/status',{id:b.id,enabled:false},center);
 const before=calls.length;manager.tick(t.turnStartedAt+10000);assert.equal(calls.length,before,'stopped bots take no more actions');
});
