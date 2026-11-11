import test from 'node:test';import {sitDeep} from './test-helpers.js';
import assert from 'node:assert/strict';
import {createEngine,LIVE} from './game.js';
import {createBots,botDecision,botView,handStrength,preflopRank,rangeEquity} from './bots.js';
import {createCenb,cenbHost,devHost} from './cenb.js';

const seeded=(a=7)=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
function world(opts={}){
 const center={id:'center',username:'center',role:'CENTER',balance:1000000},db={users:[center],ledger:[],rakePercent:0};
 const runtime=new Map(),engine=createEngine({db}),t=engine.makeTable('1','Test',100,200,'holdem',opts.size||6);runtime.set('1',t);
 const manager=createBots({db,runtime,engine,save:()=>{},random:opts.random||Math.random});
 const human=(i,cents=50000)=>{const u={id:'h'+i,username:'human'+i,role:'USER',balance:cents};db.users.push(u);return u;};
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+[...runtime.values()].reduce((m,x)=>m+x.seats.reduce((n,s)=>n+(s?s.stack:0),0)+(LIVE.includes(x.phase)?x.pot:0),0);
 return {center,db,runtime,engine,t,manager,human,total};
}
// Plays one hand: humans call or check (or follow "policy"), bots decide from the server.
function playHand(engine,manager,t,botIds,policy){
 for(let k=0;k<300&&LIVE.includes(t.phase);k++){
  if(t.runout){engine.tickTable(t,t.runout.at+1);continue;}
  const s=t.seats[t.turn];if(botIds.has(s.userId)){manager.tick(t.turnStartedAt+10000);continue;}
  const owe=t.currentBet-s.roundBet;engine.act(t,s.userId,policy?policy(s,owe):owe?(Math.random()<.7?'call':'fold'):'check');}
 for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;
}

test('bot budgets, permissions, configuration and refunds conserve credit',()=>{
 const {center,db,manager}=world();
 assert.throws(()=>manager.route('/api/bots',{},{role:'AGENT'}),/Only the center/);
 assert.throws(()=>manager.route('/api/bots/create',{name:'NoTable',budget:100,tableId:'x',stopLoss:10},center),/valid table/);assert.equal(center.balance,1000000);
 assert.throws(()=>manager.route('/api/bots/create',{name:'Huge',budget:999999,tableId:'1'},center),/enough credit/);
 manager.route('/api/bots/create',{name:'TestBot',budget:100,tableId:'1',buyin:40,stopLoss:30,stopWin:10},center);const b=db.users[1];
 assert.equal(b.username,'TestBot');assert.ok(b.isBot);assert.equal(center.balance,990000);assert.equal(b.balance,10000);assert.deepEqual([b.bot.buyin,b.bot.stopLoss,b.bot.stopWin],[4000,3000,1000]);
 assert.throws(()=>manager.route('/api/bots/configure',{id:b.id,tableId:'1',risk:'crazy',buyin:40,stopLoss:30},center),/Invalid style/);
 manager.route('/api/bots/configure',{id:b.id,tableId:'auto',buyinBB:50,maxBB:1,stopLoss:30,stopWin:0},center);assert.deepEqual([b.bot.tableId,b.bot.buyinBB,b.bot.maxBB,b.bot.stopWin],['auto',50,100,0]);
 manager.route('/api/bots/topup',{id:b.id,amount:5},center);assert.equal(b.balance,10500);assert.equal(center.balance,989500);
 manager.route('/api/bots/delete',{id:b.id},center);assert.equal(center.balance,1000000);assert.equal(db.users.length,1);
 const made=manager.route('/api/bots/bulk',{count:5,budget:20,tableId:'auto',buyinBB:100,stopLoss:20,risk:'mix'},center);assert.equal(made.ids.length,5);
 const names=db.users.filter(u=>u.isBot).map(u=>u.username);assert.equal(new Set(names.map(n=>n.toLowerCase())).size,5);assert.ok(names.every(n=>/^[a-zA-Z0-9_]{3,18}$/.test(n)));
 assert.deepEqual([...new Set(db.users.filter(u=>u.isBot).map(u=>u.bot.risk))].sort(),['high','low','medium']);assert.equal(center.balance,990000);
});

test('bots only fill thin tables: a real player is needed, a seat stays free, crowded tables are left to people',()=>{
 const {center,db,engine,t,manager,human}=world();
 for(const n of ['A','B','C','D'])manager.route('/api/bots/create',{name:'Bot'+n,budget:200,tableId:'1',buyin:40,stopLoss:100},center);
 for(const b of db.users.filter(u=>u.isBot))manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 manager.tick();assert.equal(t.seats.filter(Boolean).length,0,'no bot sits at an empty table');
 engine.sit(t,human(1),0,100,[t]);for(let i=0;i<5;i++)manager.tick();
 assert.equal(t.seats.filter(s=>s?.isBot).length,2,'two bots per table by default');
 manager.route('/api/bots/settings',{maxPerTable:3},center);for(let i=0;i<5;i++)manager.tick();assert.equal(t.seats.filter(s=>s?.isBot).length,3);
 engine.sit(t,human(2),t.seats.findIndex(s=>!s),100,[t]);manager.tick();
 assert.ok(t.seats.filter(s=>!s).length>=1,'a seat stays free for real players');
 engine.sit(t,human(3),t.seats.findIndex(s=>!s),100,[t]);manager.tick();
 assert.ok(t.seats.filter(s=>s?.isBot).length<=2,'four real players on six seats: bots make room');
 for(const id of ['h1','h2','h3'])engine.leave(t,db.users.find(u=>u.id===id));manager.tick();
 assert.equal(t.seats.filter(Boolean).length,0,'when the real players leave, the bots stand up too');
});

test('honest: the decision never depends on opponents\' cards or the deck',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Honest',budget:500,tableId:'1',buyin:100,stopLoss:500},center);const b=db.users.find(u=>u.isBot);
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 engine.sit(t,human(1,90000),0,200,[t]);engine.sit(t,human(2,90000),2,200,[t]);manager.tick();assert.ok(t.seats.some(s=>s?.userId===b.id));
 let checked=0;
 for(let hand=0;hand<60&&checked<12;hand++){
  if(!engine.startHand(t))break;
  for(let k=0;k<200&&LIVE.includes(t.phase);k++){
   if(t.runout){engine.tickTable(t,t.runout.at+1);continue;}const s=t.seats[t.turn];
   if(s.userId===b.id){
    const v=botView(t,s),others=t.seats.filter(x=>x&&x!==s).flatMap(x=>x.cards);
    const text=JSON.stringify(v);for(const c of [...others,...t.deck.slice(-6)])if(!v.cards.includes(c)&&!v.board.includes(c))assert.ok(!text.includes('"'+c+'"'),'the view holds no hidden card');
    const before=botDecision(v,'medium',seeded(hand));
    // Swap every hidden card around: other players' hands and the deck.
    const saved=t.seats.map(x=>x?[...x.cards]:null),deck=[...t.deck];const hidden=[...others,...t.deck];hidden.reverse();let i=0;
    for(const x of t.seats)if(x&&x!==s)x.cards=x.cards.map(()=>hidden[i++]);t.deck=hidden.slice(i);
    const after=botDecision(botView(t,s),'medium',seeded(hand));
    assert.deepEqual(after,before,'same decision whatever the hidden cards are');checked++;
    t.seats.forEach((x,j)=>{if(x)x.cards=saved[j];});t.deck=deck;
    manager.tick(t.turnStartedAt+10000);continue;}
   engine.act(t,s.userId,t.currentBet>s.roundBet?'call':'check');}
  for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;}
 assert.ok(checked>=5,'enough decisions were compared ('+checked+')');
});

test('starting hands are ranked sensibly and equity follows the cards',()=>{
 assert.ok(preflopRank(['As','Ad'])<preflopRank(['Ks','Kd']));assert.ok(preflopRank(['Ks','Kd'])<preflopRank(['As','Kh']));
 assert.ok(preflopRank(['As','Ks'])<preflopRank(['As','Kd']));assert.ok(preflopRank(['7c','2d'])>.9);assert.ok(preflopRank(['As','Ad'])<.01);
 const r=seeded(3),opp=[{actions:[]}];
 const nuts=rangeEquity({game:'holdem',cards:['Ah','Kh'],board:['Qh','Jh','Th']},opp,300,r),air=rangeEquity({game:'holdem',cards:['2c','7d'],board:['Ah','Kh','Qs','9c','4s']},opp,300,r);
 assert.equal(nuts,1);assert.ok(air<.15,'seven-high on the river rarely wins: '+air);
 // A player who raised three times holds a strong range: a middle pair is worth less against it.
 const vsAny=rangeEquity({game:'holdem',cards:['8s','8d'],board:[]},[{actions:[]}],400,seeded(1)),vsTight=rangeEquity({game:'holdem',cards:['8s','8d'],board:[]},[{actions:[{street:'preflop',type:'RAISE'},{street:'preflop',type:'RAISE'},{street:'preflop',type:'RAISE'}]}],400,seeded(1));
 assert.ok(vsTight<vsAny-.1,`tight range ${vsTight} vs any ${vsAny}`);
 assert.ok(handStrength({game:'holdem',cards:['As','Ah'],board:['Ad','7c','2s']})>handStrength({game:'holdem',cards:['Ks','Qh'],board:['Ad','7c','2s']}));
});

test('strong hands play, weak hands give up, legal sizes only',()=>{
 const base={game:'holdem',phase:'flop',pot:1000,currentBet:0,toCall:0,minRaiseTo:200,maxRaiseTo:20000,stack:20000,roundBet:0,committed:500,bb:200,canRaise:true,dealt:2,playersBehind:0,inPosition:true,raisesPreflop:1,opponents:[{id:'o',stack:20000,roundBet:0,committed:500,actions:[{street:'preflop',type:'CALL'}]}]};
 let bets=0;for(let i=0;i<20;i++){const d=botDecision({...base,cards:['As','Ah'],board:['Ad','7c','2s']},'medium',seeded(i));if(d.type==='raise'){bets++;assert.ok(d.amount*100>=200&&d.amount*100<=20000);}else assert.equal(d.type,'check');}
 assert.ok(bets>=12,'a set bets most of the time ('+bets+'/20)');
 const facing={...base,phase:'river',board:['Ad','Kc','Qs','9h','4d'],cards:['2c','3d'],currentBet:3000,toCall:3000,opponents:[{...base.opponents[0],roundBet:3000,actions:[{street:'preflop',type:'RAISE'},{street:'flop',type:'BET'},{street:'turn',type:'BET'},{street:'river',type:'BET'}]}]};
 assert.equal(botDecision(facing,'high',seeded(1)).type,'fold','nothing against a big river bet: fold');
 assert.equal(botDecision({...facing,toCall:0,currentBet:0},'low',seeded(2)).type!=='fold',true,'a free check is never folded');
 const pre={...base,phase:'preflop',board:[],pot:300,currentBet:200,toCall:200,minRaiseTo:400,roundBet:0,committed:0,raisesPreflop:0,playersBehind:3,opponents:[{id:'o',stack:20000,roundBet:200,committed:200,actions:[]},{id:'p',stack:20000,roundBet:100,committed:100,actions:[]}]};
 assert.equal(botDecision({...pre,cards:['As','Ad']},'medium',seeded(1)).type,'raise','aces open');
 assert.equal(botDecision({...pre,cards:['7c','2d']},'medium',seeded(1)).type,'fold','seven-deuce folds');
 const plo={...base,game:'omaha',cards:['As','Ah','Ks','Kh'],board:['Ad','7c','2s'],maxRaiseTo:3000};for(let i=0;i<10;i++){const d=botDecision(plo,'high',seeded(i));if(d.type==='raise')assert.ok(d.amount*100<=3000,'pot limit is respected');}
});

test('bots and real players play many hands: money is conserved and limits stop the bot',()=>{
 const {center,db,engine,t,manager,human,total}=world();
 manager.route('/api/bots/create',{name:'Lucky',budget:300,tableId:'1',buyin:50,stopLoss:30,stopWin:15,risk:'medium'},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 const h1=human(1,500000),h2=human(2,500000);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);const start=total();
 let stopped=false;
 for(let hand=0;hand<600&&!stopped;hand++){manager.tick();if(!engine.startHand(t))break;playHand(engine,manager,t,new Set([b.id]));manager.tick();stopped=!b.bot.enabled;assert.equal(total(),start,'no money created or lost');}
 assert.ok(stopped,'the win or loss limit ends the session');assert.match(b.bot.error,/Win limit|Loss limit|House daily limit/);
 assert.ok(b.bot.hands>0,'hands are counted');
});

test('players never learn which seat is a bot',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Marco',budget:200,tableId:'1',buyin:40,stopLoss:100},center);const b=db.users[1];
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);const h=human(1);engine.sit(t,h,0,100,[t]);manager.tick();
 const view=engine.snapshot(t,h.id,false),seat=view.seats.find(s=>s?.username==='Marco');
 assert.ok(seat,'the bot is seated under a normal name');assert.ok(!JSON.stringify(view).match(/isBot|"bot"|BOT/),'nothing in the player view marks a bot');
 assert.throws(()=>manager.route('/api/bots/create',{name:'human1',budget:10,tableId:'1',stopLoss:5},center),/already taken/);
});

test('bot rake is not revenue: reports count real players only, the house result includes it',async()=>{
 const {revenueReport,rakeReport}=await import('./rake.js');
 const {center,db,engine,t,manager}=world();db.rakePercent=5;db.tables=[{id:'1',name:'Test',sb:100,bb:200}];
 const admin={id:'ad',username:'admin1',role:'ADMIN',parentId:'center',balance:0,share:40},agent={id:'ag',username:'agent1',role:'AGENT',parentId:'ad',balance:0,share:20};
 const h1={id:'h1',username:'human1',role:'USER',parentId:'ag',balance:500000},h2={id:'h2',username:'human2',role:'USER',parentId:'ag',balance:500000};db.users.push(admin,agent,h1,h2);
 manager.route('/api/bots/create',{name:'Marco',budget:2000,tableId:'1',buyin:200,stopLoss:2000},center);const b=db.users.find(u=>u.isBot);
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);
 for(let hand=0;hand<150;hand++){manager.tick();if(!engine.startHand(t))break;playHand(engine,manager,t,new Set([b.id]),(s,owe)=>owe?'call':'check');}
 const rakes=db.ledger.filter(x=>x.type==='RAKE');assert.ok(rakes.length>0);
 const botPaid=rakes.flatMap(x=>x.allocations).filter(a=>a.userId===b.id).reduce((n,a)=>n+a.amount,0),humanPaid=rakes.flatMap(x=>x.allocations).filter(a=>a.userId!==b.id).reduce((n,a)=>n+a.amount,0);
 assert.ok(botPaid>0&&humanPaid>0);
 const rev=revenueReport(db,center,{from:'all'});assert.equal(rev.totals.rake,humanPaid,'revenue = rake of real players');assert.equal(rev.totals.botRake,botPaid,'bot rake shown apart');
 assert.equal(rakeReport(db,center).total,humanPaid);assert.equal(rakeReport(db,center).botTotal,botPaid);
 const row=manager.list().find(x=>x.id===b.id);assert.equal(Math.round(row.rakePaid*100),botPaid);assert.equal(Math.round(row.house*100),Math.round(row.total*100)+botPaid);
});

test('seat-only bots fill a seat and never lose a cent',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Filler',budget:200,tableId:'1',buyin:50,stopLoss:100,mode:'seat'},center);const b=db.users.find(u=>u.isBot);
 manager.route('/api/bots/status',{id:b.id,enabled:true},center);const h1=human(1,500000),h2=human(2,500000);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);
 manager.tick();assert.ok(t.seats.some(s=>s?.userId===b.id),'the bot sits');const start=b.balance+t.seats.find(s=>s?.userId===b.id).stack;
 for(let hand=0;hand<80;hand++){manager.tick();if(!engine.startHand(t))break;assert.ok(!t.seats.find(s=>s?.userId===b.id)?.inHand,'never dealt in');playHand(engine,manager,t,new Set(),(s,owe)=>owe?'call':'check');}
 const seat=t.seats.find(s=>s?.userId===b.id);assert.ok(seat,'still seated after many hands');assert.equal(b.balance+seat.stack,start,'not one cent lost');
});

test('house limits: daily and weekly limits stop every bot; stop-all and start-all work',()=>{
 const {center,db,engine,t,manager,human}=world();
 for(const n of ['A','B'])manager.route('/api/bots/create',{name:'Bot'+n,budget:300,tableId:'1',buyin:50,stopLoss:300},center);
 manager.route('/api/bots/settings',{dailyLimit:20},center);for(const b of db.users.filter(u=>u.isBot))manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 engine.sit(t,human(1),0,100,[t]);manager.tick();assert.equal(manager.route('/api/bots/guard',{},center).today,0);
 db.users.find(u=>u.username==='BotA').balance-=1500;db.users.find(u=>u.username==='BotB').balance-=1000;manager.tick();
 const g=manager.route('/api/bots/guard',{},center);assert.equal(g.today,-25);assert.equal(g.week,-25);assert.deepEqual(g.stopped,['House daily limit reached']);
 assert.ok(db.users.filter(u=>u.isBot).every(b=>!b.bot.enabled&&b.bot.error==='House daily limit reached'));
 assert.ok(!t.seats.some(s=>s&&db.users.find(u=>u.id===s.userId)?.isBot),'the bots left the table');
 assert.throws(()=>manager.route('/api/bots/status',{id:db.users.find(u=>u.isBot).id,enabled:true},center),/house limit/);
 assert.throws(()=>manager.route('/api/bots/settings',{dailyLimit:-1},center),/0 or more/);assert.throws(()=>manager.route('/api/bots/settings',{maxPerTable:9},center),/1–4/);
 // Raising the limit and starting again; then the weekly limit catches it.
 manager.route('/api/bots/settings',{dailyLimit:0,weeklyLimit:30},center);for(const b of db.users.filter(u=>u.isBot))b.bot.error=null;
 assert.equal(manager.route('/api/bots/startall',{},center).started,2);manager.tick();
 db.users.find(u=>u.username==='BotA').balance-=600;manager.tick();assert.ok(db.users.filter(u=>u.isBot).every(b=>b.bot.error==='House weekly limit reached'));
 manager.route('/api/bots/settings',{weeklyLimit:0},center);for(const b of db.users.filter(u=>u.isBot))b.bot.error=null;manager.route('/api/bots/startall',{},center);manager.tick();
 assert.equal(manager.route('/api/bots/stopall',{},center).stopped,2);assert.ok(db.users.filter(u=>u.isBot).every(b=>!b.bot.enabled));
});

test('auto mode: a bot finds the table where a real player sits alone, within the stake ceiling',()=>{
 const {center,db,engine,runtime,manager,human}=world();
 const low=engine.makeTable('2','Low',5,10,'holdem',6),high=engine.makeTable('3','High',500,1000,'holdem',6),empty=engine.makeTable('4','Empty',5,10,'holdem',6);for(const x of [low,high,empty])runtime.set(x.id,x);runtime.delete('1');
 manager.route('/api/bots/create',{name:'Roamer',budget:50,tableId:'auto',buyinBB:100,maxBB:1,stopLoss:50},center);const b=db.users.find(u=>u.isBot);manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 engine.sit(high,human(1,500000),0,1000,[...runtime.values()]);manager.tick();assert.ok(!high.seats.some(s=>s?.userId===b.id),'above its big blind ceiling');
 engine.sit(low,human(2),0,10,[...runtime.values()]);manager.tick();
 const seat=low.seats.find(s=>s?.userId===b.id);assert.ok(seat,'sits with the lone player');assert.equal(seat.stack,1000,'100 big blinds');assert.ok(!empty.seats.some(Boolean));
});

test('bots learn players\' habits from public actions only',()=>{
 const {center,db,engine,t,manager,human}=world();
 manager.route('/api/bots/create',{name:'Scout',budget:500,tableId:'1',buyin:100,stopLoss:500},center);const b=db.users.find(u=>u.isBot);manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 const h1=human(1,500000),h2=human(2,500000);sitDeep(engine,t,h1,0,500);sitDeep(engine,t,h2,3,500);
 for(let hand=0;hand<40;hand++){manager.tick();if(!engine.startHand(t))break;playHand(engine,manager,t,new Set([b.id]),(s,owe)=>s.userId==='h1'?(owe?'call':'check'):(owe?'fold':'check'));manager.tick();}
 const p1=manager.profileOf('h1'),p2=manager.profileOf('h2');assert.ok(p1&&p2);assert.ok(p1.hands>=10);
 assert.ok(p1.vpip>p2.vpip,'the caller plays more hands than the folder');assert.ok(p2.ftb>p1.ftb,'the folder folds more to bets');
 const stored=JSON.stringify(db.botProfiles);assert.ok(!/[2-9TJQKA][cdhs]/.test(stored.replace(/"[^"]*":/g,'')),'only numbers are kept, no cards');
});

test('CENB: its own sign-in, lockout, and only its own address',()=>{
 const db={users:[{id:'c',username:'center',role:'CENTER',balance:100000}],ledger:[]},fail=(m,s=400)=>{throw Object.assign(Error(m),{status:s});};
 const bots={route:(p)=>p==='/api/bots/overview'?{bots:[],guard:{}}:p==='/api/bots/guard'?{ok:1}:undefined};
 const off=createCenb({db,bots,save:()=>{},fail,env:{}});assert.throws(()=>off.route('login',{username:'cenb',password:'x'},'','1.1.1.1'),/not set up/);
 assert.throws(()=>createCenb({db,bots,save:()=>{},fail,env:{CENB_PASSWORD:'short'}}).route('login',{username:'cenb',password:'short'},'','1'),/not set up/,'a short password is not accepted');
 const c=createCenb({db,bots,save:()=>{},fail,env:{CENB_USER:'Boss',CENB_PASSWORD:'a-long-test-passphrase'}});
 assert.throws(()=>c.route('overview',{},'','1.1.1.1'),/Sign in/);
 for(let i=0;i<5;i++)assert.throws(()=>c.route('login',{username:'boss',password:'wrong'},'','2.2.2.2'),/Wrong username or password/);
 assert.throws(()=>c.route('login',{username:'boss',password:'a-long-test-passphrase'},'','2.2.2.2'),/Too many/,'locked after five tries');
 const {token}=c.route('login',{username:'BOSS',password:'a-long-test-passphrase'},'','3.3.3.3');assert.ok(token.length>=64);
 assert.equal(c.route('overview',{},token,'3.3.3.3').centerBalance,1000);assert.deepEqual(c.route('bots/guard',{},token,'3.3.3.3'),{ok:1});
 assert.throws(()=>c.route('bots/nothing',{},token,'3'),/Not found/);
 assert.ok(db.cenbLog.some(l=>l.action==='Failed sign-in')&&db.cenbLog.some(l=>l.action==='Signed in'));
 c.route('logout',{},token,'3');assert.throws(()=>c.route('overview',{},token,'3'),/Sign in/);
 assert.ok(cenbHost('cenb.suprempoker.com')&&cenbHost('CENB.suprempoker.com:443')&&!cenbHost('suprempoker.com')&&!cenbHost('www.suprempoker.com'));
 assert.ok(devHost('localhost:3100')&&devHost('127.0.0.1')&&!devHost('suprempoker.com'));
});

test('decisions on the bot thread come back and the game plays on with them',async()=>{
 const {workerDecider}=await import('./bots.js');const decide=workerDecider();
 const v={game:'holdem',phase:'river',cards:['As','Ah'],board:['Ad','Ac','7s','2h','9d'],pot:1000,currentBet:0,toCall:0,minRaiseTo:200,maxRaiseTo:20000,stack:20000,roundBet:0,committed:500,bb:200,canRaise:true,dealt:2,playersBehind:0,inPosition:true,raisesPreflop:1,opponents:[{id:'o',stack:20000,roundBet:0,committed:500,actions:[]}]};
 const d=await decide(v,'medium');assert.ok(['check','raise'].includes(d.type));assert.equal(d.equity,1);
 const {center,db,engine,t,human,runtime}=world();const manager=createBots({db,runtime,engine,save:()=>{},decider:decide});
 manager.route('/api/bots/create',{name:'Threaded',budget:500,tableId:'1',buyin:100,stopLoss:500},center);const b=db.users.find(u=>u.isBot);manager.route('/api/bots/status',{id:b.id,enabled:true},center);
 sitDeep(engine,t,human(1,500000),0,500);manager.tick();assert.ok(engine.startHand(t));
 let acted=false;for(let k=0;k<400&&LIVE.includes(t.phase)&&!acted;k++){const s=t.seats[t.turn];if(s?.userId===b.id){const hand=t.hand,turn=t.turnStartedAt;manager.tick(Date.now());await new Promise(r=>setTimeout(r,700));manager.tick(turn+20000);acted=t.hand!==hand||t.turnStartedAt!==turn||!LIVE.includes(t.phase);}else engine.act(t,s.userId,t.currentBet>s.roundBet?'call':'check');}
 assert.ok(acted,'the bot acted with the answer from its thread');
});
