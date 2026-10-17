import test from 'node:test';import assert from 'node:assert/strict';import {createEngine,LIVE,livePots} from './game.js';

// Engine-level Texas Hold'em rule checks with a deterministic deck.
function setup(stacks,{sb=100,bb=200}={}){
 const db={users:[{id:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:0,rakeCap:0};
 const e=createEngine({db}),t=e.makeTable('1','T',sb,bb),all=[t];
 stacks.forEach((cents,i)=>{if(cents==null)return;const u={id:'p'+i,username:'p'+i,role:'USER',balance:cents};db.users.push(u);e.sit(t,u,i,cents/100,all);});
 const who=()=>t.seats[t.turn].userId,owe=()=>t.currentBet-t.seats[t.turn].roundBet;
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+t.seats.reduce((n,s)=>n+(s?s.stack:0),0)+(LIVE.includes(t.phase)?t.pot:0);
 const checkDown=()=>{while(LIVE.includes(t.phase)&&t.turn>=0)e.act(t,who(),owe()?'call':'check');};
 // Deck pops from the end: burn, flop x3, burn, turn, burn, river.
 const rig=(holes,board)=>{holes.forEach((h,i)=>{if(h&&t.seats[i])t.seats[i].cards=h;});const [a,b,c,d,f]=board;t.deck=['8d',f,'8c',d,'8h',c,b,a,'8s'];};
 return {db,e,t,who,owe,total,checkDown,rig,user:i=>db.users.find(u=>u.id==='p'+i)};
}

test('heads-up: button posts small blind, acts first preflop and last after the flop',()=>{
 const {e,t,who}=setup([10000,10000]);e.startHand(t);
 assert.equal(t.button,0);assert.equal(t.sbPos,0);assert.equal(t.bbPos,1);assert.equal(who(),'p0');
 e.act(t,'p0','call');assert.equal(who(),'p1','big blind keeps the option');
 e.act(t,'p1','check');assert.equal(t.phase,'flop');assert.equal(who(),'p1');
});

test('three-handed: blinds rotate, big blind option, first postflop actor is left of the button',()=>{
 const {e,t,who,checkDown}=setup([10000,10000,10000]);e.startHand(t);
 assert.deepEqual([t.button,t.sbPos,t.bbPos,t.turn],[0,1,2,0]);
 e.act(t,'p0','call');e.act(t,'p1','call');assert.equal(who(),'p2');
 assert.throws(()=>e.act(t,'p0','check'),/radha/);
 e.act(t,'p2','check');assert.equal(t.phase,'flop');assert.equal(who(),'p1');
 checkDown();e.tickTable(t,t.lastActionAt+8000);
 assert.deepEqual([t.button,t.sbPos,t.bbPos],[1,2,0]);
});

test('timeout checks when free and folds when facing a bet',()=>{
 const {e,t,who}=setup([10000,10000]);e.startHand(t);
 e.act(t,'p0','call');e.tickTable(t,t.lastActionAt+30000);
 assert.equal(t.seats[1].lastAction.type,'AUTO-CHECK');assert.equal(t.phase,'flop');
 e.act(t,who(),'raise',4);assert.equal(t.seats[1].lastAction.type,'BET');
 e.tickTable(t,t.lastActionAt+30000);assert.equal(t.seats[0].lastAction.type,'AUTO-FOLD');assert.equal(t.phase,'finished');
});

test('minimum bet and raise sizes follow the last full raise',()=>{
 const {e,t}=setup([10000,10000]);e.startHand(t);
 assert.throws(()=>e.act(t,'p0','raise',3),/minimale është €4.00/);
 e.act(t,'p0','raise',5);assert.equal(t.minRaise,300);
 assert.throws(()=>e.act(t,'p1','raise',7),/minimale është €8.00/);
 e.act(t,'p1','raise',8);e.act(t,'p0','call');assert.equal(t.phase,'flop');
 assert.throws(()=>e.act(t,'p1','raise',1),/Basti minimal është €2.00/);
 e.act(t,'p1','check');assert.throws(()=>e.act(t,'p1','check'),/radha/,'not out of turn');
});

test('a short all-in does not reopen raising, but short all-ins adding to a full raise do',()=>{
 for(const reopen of [false,true]){
  const {e,t,who,total}=setup([50000,50000,2500,3500]);const before=total();e.startHand(t);
  e.act(t,'p3','call');e.act(t,'p0','call');e.act(t,'p1','call');e.act(t,'p2','check');
  assert.equal(t.phase,'flop');assert.equal(who(),'p1');
  e.act(t,'p1','raise',15);e.act(t,'p2','raise',23);assert.equal(t.seats[2].allIn,true);assert.equal(t.minRaise,1500);
  if(reopen)e.act(t,'p3','raise',33);else e.act(t,'p3','fold');
  e.act(t,'p0','call');assert.equal(who(),'p1');
  if(reopen){assert.equal(e.snapshot(t,'p1').legalActions.canRaise,true);e.act(t,'p1','raise',60);}
  else{assert.equal(e.snapshot(t,'p1').legalActions.canRaise,false);assert.throws(()=>e.act(t,'p1','raise',60),/rihapur/);e.act(t,'p1','call');}
  assert.equal(total(),before);
 }
});

test('odd chip goes to the first winner clockwise from the button',()=>{
 const {e,t,checkDown,rig}=setup([10000,10000,10000],{sb:50,bb:101});
 e.startHand(t);rig([['Th','3c'],['5h','6h'],['Td','4c']],['As','Kd','Qc','Jh','2s']);
 checkDown();assert.equal(t.phase,'finished');
 assert.deepEqual(t.lastResult.payments,{p0:151,p2:152});
});

test('showdown: first player left of the button shows, a beaten hand is mucked',()=>{
 const {e,t,checkDown,rig}=setup([10000,10000]);e.startHand(t);
 rig([['2c','7d'],['Ah','Ad']],['Ks','9h','5c','4d','Jc']);checkDown();
 assert.deepEqual(t.lastResult.shown,['p1']);
 assert.deepEqual(e.snapshot(t,'p1').seats[0].cards,[]);
 e.show(t,{id:'p0'});assert.deepEqual(e.snapshot(t,'p1').seats[0].cards,['2c','7d']);
});

test('all-in runout: hands are tabled, then flop, turn and river one at a time, then the winner',()=>{
 const {e,t,rig}=setup([10000,10000]);e.startHand(t);
 rig([['2c','7d'],['Ah','Ad']],['Ks','9h','5c','4d','Jc']);
 e.act(t,'p0','raise',100);e.act(t,'p1','call');
 assert.ok(t.runout);assert.equal(t.board.length,0);assert.equal(t.turn,-1);
 assert.deepEqual(e.snapshot(t,'p0').seats[1].cards,['Ah','Ad'],'all-in hands are face up before the board');
 assert.throws(()=>e.act(t,'p0','check'),/radha/);
 const steps=[];while(t.runout){e.tickTable(t,t.runout.at-1);assert.equal(steps.length?steps.at(-1):0,t.board.length,'nothing is dealt early');e.tickTable(t,t.runout.at);steps.push(t.board.length);}
 assert.deepEqual(steps,[3,4,5,5]);assert.equal(t.phase,'finished');
 assert.deepEqual(t.lastResult.shown.sort(),['p0','p1']);
 const award=t.visualEvents.findLast(v=>v.type==='award');assert.deepEqual(award.pots.map(p=>p.winners),[['p1']]);
});

test('time bank extends the decision once per use and is limited',()=>{
 const {e,t,user}=setup([10000,10000]);e.startHand(t);
 const deadline=t.deadline;e.useTimeBank(t,user(0));assert.equal(t.deadline,deadline+20000);
 e.useTimeBank(t,user(0));assert.equal(t.seats[0].timeBank,0);assert.throws(()=>e.useTimeBank(t,user(0)),/mbaruar/);
 assert.throws(()=>e.useTimeBank(t,user(1)),/radha/);
 e.tickTable(t,deadline+1000);assert.equal(t.phase,'preflop','the extended deadline holds');
});

test('chat trims, limits length and rate',()=>{
 const {e,t,user}=setup([10000,10000]);e.chat(t,user(0),'  përshëndetje   të gjithëve ');
 assert.equal(t.chat[0].text,'përshëndetje të gjithëve');assert.throws(()=>e.chat(t,user(0),'sërish'),/Prit/);
 assert.throws(()=>e.chat(t,user(1),'   '),/bosh/);e.chat(t,user(1),'x'.repeat(500));assert.equal(t.chat[1].text.length,200);
});

test('leaving during a hand folds immediately and cashes out at settlement',()=>{
 const {e,t,who,user,total}=setup([10000,10000,10000]);const before=total();e.startHand(t);
 assert.equal(who(),'p0');const r=e.leave(t,user(2));
 assert.equal(r.pending,true);assert.equal(t.seats[2].folded,true);assert.equal(who(),'p0','turn order is unchanged');
 e.act(t,'p0','fold');assert.equal(t.phase,'finished');assert.equal(t.seats[2],null);
 assert.equal(user(2).balance,10000-200);assert.equal(total(),before);
});

test('a player joining a running game posts a live big blind; sitting out skips the deal',()=>{
 const {e,t,db,checkDown}=setup([10000,10000,10000]);e.startHand(t);checkDown();
 const u={id:'p4',username:'p4',role:'USER',balance:10000};db.users.push(u);e.sit(t,u,4,100,[t]);
 assert.equal(t.seats[4].mustPost,true);e.startHand(t);
 assert.deepEqual([t.button,t.sbPos,t.bbPos],[1,2,4],'joining in the big blind needs no extra post');
 assert.equal(t.seats[4].mustPost,false);checkDown();
 e.sitOut(t,{id:'p0'},true);e.startHand(t);
 assert.equal(t.seats[0].inHand,false);assert.equal(t.seats[4].inHand,true);
 checkDown();e.sitOut(t,{id:'p0'},false);assert.equal(t.seats[0].mustPost,true);
 e.startHand(t);assert.equal(t.seats[0].inHand,true);
 assert.ok([t.sbPos,t.bbPos].includes(0)||t.seats[0].lastAction.type==='POST');
});

test('calling nothing is a check; checking a bet is rejected',()=>{
 const {e,t,who}=setup([10000,10000]);e.startHand(t);
 assert.throws(()=>e.act(t,'p0','check'),/check/);
 e.act(t,'p0','call');e.act(t,'p1','call');assert.equal(t.seats[1].lastAction.type,'CHECK');assert.equal(t.phase,'flop');
});

test('live side pots list the main pot first and ignore uncalled chips',()=>{
 const {e,t}=setup([2000,10000,10000]);e.startHand(t);
 e.act(t,'p0','raise',20);e.act(t,'p1','raise',50);e.act(t,'p2','call');
 assert.equal(t.phase,'flop');
 assert.deepEqual(livePots(t),[{amount:6000,eligible:[0,1,2]},{amount:6000,eligible:[1,2]}]);
 e.act(t,'p1','raise',10);
 assert.deepEqual(livePots(t).map(p=>p.amount),[6000,6000],'an uncalled bet is not a pot yet');
});

test('the button skips a newcomer who still has to post',()=>{
 const {e,t,db,checkDown}=setup([10000,null,null,10000]);e.startHand(t);assert.equal(t.button,0);checkDown();
 const u={id:'p1',username:'p1',role:'USER',balance:10000};db.users.push(u);e.sit(t,u,1,100,[t]);
 assert.equal(t.seats[1].mustPost,true);
 e.startHand(t);assert.equal(t.button,3,'not the newcomer seat 1');assert.deepEqual([t.sbPos,t.bbPos],[0,1]);
});

test('rake is a flat 5% of the contested pot with no per-hand cap',()=>{
 const {e,t,db,rig,total}=setup([68170,62237]);db.rakePercent=5;const before=total();e.startHand(t);
 rig([['As','Ad'],['Ks','Kd']],['2c','7d','9h','Jc','3s']);
 e.act(t,'p0','raise',681.70);e.act(t,'p1','call');while(t.runout)e.tickTable(t,t.runout.at);
 // Contested 2 × €622.37 = €1,244.74 → 5% = €62.23 (rounded down to the cent); €59.33 uncalled returns rake-free.
 const rake=db.ledger.find(x=>x.type==='RAKE');assert.equal(rake.amount,6223);
 assert.equal(t.seats[0].stack,68170+62237-6223);assert.equal(db.users.find(u=>u.role==='CENTER').balance,6223);
 assert.equal(total(),before,'every cent is accounted for');
});

test('a player who leaves without standing up is sat out, loses no blinds and is cashed out later',()=>{
 const {e,t,user,total}=setup([10000,10000,10000]);const before=total();
 const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
 try{
  e.startHand(t);
  // p2 stops checking in; the others keep polling.
  const poll=()=>{e.snapshot(t,'p0');e.snapshot(t,'p1');};
  clock+=26000;poll();e.tickTable(t,clock);
  assert.equal(t.seats[2].sittingOut,true);assert.equal(t.seats[2].autoSitOut,true);
  // In the current hand the absent player acts at once instead of holding the table.
  while(LIVE.includes(t.phase)&&t.turn>=0){const who=t.seats[t.turn];if(who.autoSitOut){e.tickTable(t,clock);continue;}e.act(t,who.userId,t.currentBet>who.roundBet?'call':'check');}
  const stack=t.seats[2].stack;clock+=9000;poll();e.tickTable(t,clock);
  assert.equal(t.seats[2].inHand,false,'not dealt in');assert.equal(t.seats[2].stack,stack,'no blinds while away');
  // Coming back resumes play automatically.
  e.snapshot(t,'p2');assert.equal(t.seats[2].sittingOut,false);
  // Leaving for good: after 5 minutes the chips return to the wallet.
  e.away(t,user(2));clock+=6000;poll();e.tickTable(t,clock);assert.equal(t.seats[2].autoSitOut,true);
  while(LIVE.includes(t.phase)&&t.turn>=0){const who=t.seats[t.turn];if(who.autoSitOut){e.tickTable(t,clock);continue;}e.act(t,who.userId,t.currentBet>who.roundBet?'call':'check');}
  const left=t.seats[2].stack,wallet=user(2).balance;clock+=5*60000;poll();e.tickTable(t,clock);
  assert.equal(t.seats[2],null);assert.equal(user(2).balance,wallet+left);assert.equal(total(),before);
 }finally{Date.now=realNow;}
});

test('a reload (tab closed and reopened within seconds) changes nothing',()=>{
 const {e,t,user}=setup([10000,10000]);e.startHand(t);const turn=t.turn;
 e.away(t,user(turn));e.snapshot(t,'p'+turn);e.tickTable(t,Date.now()+1000);
 assert.equal(t.seats[turn].sittingOut,false);assert.equal(t.turn,turn,'still their decision');
});

test('a finished hand is cleared from the felt when no new hand can start',()=>{
 const {e,t,checkDown,user}=setup([10000,10000]);e.startHand(t);checkDown();
 assert.equal(t.phase,'finished');assert.equal(t.board.length,5);
 e.leave(t,user(1));e.tickTable(t,t.lastActionAt+3000);
 assert.equal(t.board.length,5,'the result stays visible during the reveal pause');
 e.tickTable(t,t.lastActionAt+8000);
 assert.equal(t.phase,'waiting');assert.deepEqual(t.board,[]);assert.equal(t.lastResult,null);assert.equal(t.pot,0);
 assert.deepEqual(t.seats[0].cards,[]);assert.deepEqual(e.snapshot(t,'p0').seats[0].cards,[]);
});
