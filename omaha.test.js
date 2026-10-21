import test from 'node:test';import assert from 'node:assert/strict';import {createEngine,LIVE,maxRaiseTo} from './game.js';import {bestHand,evaluateHand,compare} from './poker.js';

// Pot-Limit Omaha rule checks with a deterministic deck.
function setup(stacks,{sb=100,bb=200}={}){
 const db={users:[{id:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:0,rakeCap:0};
 const e=createEngine({db}),t=e.makeTable('1','O',sb,bb,'omaha'),all=[t];
 stacks.forEach((cents,i)=>{if(cents==null)return;const u={id:'p'+i,username:'p'+i,role:'USER',balance:cents};db.users.push(u);e.sit(t,u,i,cents/100,all);});
 const who=()=>t.seats[t.turn].userId,owe=()=>t.currentBet-t.seats[t.turn].roundBet;
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+t.seats.reduce((n,s)=>n+(s?s.stack:0),0)+(LIVE.includes(t.phase)?t.pot:0);
 const checkDown=()=>{while(LIVE.includes(t.phase)&&t.turn>=0)e.act(t,who(),owe()?'call':'check');};
 const rig=(holes,board)=>{holes.forEach((h,i)=>{if(h&&t.seats[i])t.seats[i].cards=h;});const [a,b,c,d,f]=board;t.deck=['8d',f,'8c',d,'8h',c,b,a,'8s'];};
 return {db,e,t,who,owe,total,checkDown,rig};
}

test('omaha: exactly two hole cards and three board cards',()=>{
 // Four spades in hand with only two on the board: no flush.
 assert.equal(bestHand('omaha',['As','Ks','Qs','Js'],['2s','3s','9h','9d','4c']).rank,'One Pair');
 // Four of a kind on the board cannot be played: only three kings with two hole cards.
 assert.equal(bestHand('omaha',['Ac','2d','5h','8s'],['Kc','Kd','Kh','Ks','Qc']).rank,'Three of a Kind');
 // One heart in hand with four on the board is no flush (it needs two), and A-2-3-4 is four hole cards.
 assert.equal(bestHand('omaha',['Ah','2c','3d','4s'],['Kh','Qh','Jh','9h','5c']).rank,'High Card');
 assert.equal(bestHand('omaha',['Ah','2h','3d','4s'],['Kh','Qh','Jh','9h','5c']).rank,'Flush');
 // The best five always holds two hole cards.
 const b=bestHand('omaha',['9c','9d','2h','3s'],['9h','9s','Kc','Kd','4c']);assert.equal(b.rank,'Four of a Kind');assert.equal(b.cards.filter(c=>['9c','9d','2h','3s'].includes(c)).length,2);
 assert.ok(compare(evaluateHand('omaha',['Ah','2h','3d','4s'],['Kh','Qh','Jh','9h','5c']),evaluateHand('omaha',['Ac','2c','3d','4s'],['Kh','Qh','Jh','9h','5c']))>0);
});

test('omaha: four hole cards each, hidden from the other players',()=>{
 const {e,t}=setup([20000,20000,20000]);e.startHand(t);
 for(const s of t.seats.filter(Boolean))assert.equal(s.cards.length,4);
 assert.equal(new Set(t.seats.flatMap(s=>s?.cards||[])).size,12,'no card dealt twice');
 const view=e.snapshot(t,'p0',false);assert.equal(view.game,'omaha');assert.equal(view.seats[0].cards.length,4);assert.equal(view.seats[1].cards.length,0);assert.equal(view.seats[1].cardCount,4);
});

test('omaha: pot-limit raise sizes preflop and on later streets',()=>{
 const {e,t,who}=setup([100000,100000,100000]);e.startHand(t); // blinds 1/2, button p0 acts first
 assert.equal(who(),'p0');
 // Pot 3 + call 2 = 5, raise to 2 + 5 = 7.
 assert.equal(maxRaiseTo(t,t.seats[0]),700);assert.equal(e.snapshot(t,'p0',false).legalActions.maxRaiseTo,7);assert.equal(e.snapshot(t,'p0',false).legalActions.potLimit,true);
 assert.throws(()=>e.act(t,'p0','raise',7.01),/Pot limit: the maximum raise is €7.00/);
 e.act(t,'p0','raise',7);
 // Small blind: pot 10, owes 6 → pot after call 16, raise to 7 + 16 = 23.
 assert.equal(maxRaiseTo(t,t.seats[1]),2300);e.act(t,'p1','raise',23);
 // Big blind: pot 32, owes 21 → pot after call 53, raise to 23 + 53 = 76.
 assert.equal(maxRaiseTo(t,t.seats[2]),7600);e.act(t,'p2','call');e.act(t,'p0','call');
 assert.equal(t.phase,'flop');assert.equal(t.pot,6900);
 // Postflop the pot-sized bet is the pot itself.
 const first=who();assert.equal(maxRaiseTo(t,t.seats.find(s=>s.userId===first)),6900);
 assert.throws(()=>e.act(t,first,'raise',69.01),/Pot limit: the maximum bet is €69.00/);
 e.act(t,first,'raise',69);
 // Facing a pot bet of 69 in a 138 pot: raise to 69 + 138 + 69 = 276.
 const next=who();assert.equal(maxRaiseTo(t,t.seats.find(s=>s.userId===next)),27600);
 // The minimum raise is unchanged from no limit.
 assert.throws(()=>e.act(t,next,'raise',100),/minimum raise is €138.00/);
});

test('omaha: a short stack can still move all-in below the pot limit',()=>{
 const {e,t}=setup([100000,100000,2500]);e.startHand(t); // p2 is big blind with €25
 e.act(t,'p0','raise',7);e.act(t,'p1','call');
 assert.equal(maxRaiseTo(t,t.seats[2]),2500);e.act(t,'p2','raise',25);assert.ok(t.seats[2].allIn);
});

test('omaha: showdown uses the two-plus-three rule and conserves every cent',()=>{
 const {e,t,total,checkDown,rig}=setup([20000,20000]);const before=total();e.startHand(t);
 // p0 has four hearts but the board holds only two: no flush. p1 makes a straight with K-Q.
 rig([['Ah','2h','3h','4h'],['Kc','Qd','7s','7c']],['Jh','Th','9c','5d','2s']);
 checkDown();
 assert.equal(t.phase,'finished');assert.deepEqual(t.lastResult.winnerIds,['p1']);
 assert.equal(t.lastResult.winningHands.p1.rank,'Straight');assert.equal(total(),before);
 assert.ok(t.events.some(x=>/p1 shows K♣ Q♦ 7♠ 7♣ · Straight/.test(x.text)));
});

test('omaha: hold\'em tables keep no-limit sizing and two cards',()=>{
 const db={users:[{id:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:0};const e=createEngine({db}),t=e.makeTable('2','H',100,200);
 for(const i of [0,1]){const u={id:'h'+i,username:'h'+i,role:'USER',balance:100000};db.users.push(u);e.sit(t,u,i,1000,[t]);}
 e.startHand(t);assert.equal(t.game,'holdem');assert.equal(t.seats[0].cards.length,2);assert.equal(maxRaiseTo(t,t.seats[t.turn]),100000);
});
