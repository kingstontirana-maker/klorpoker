import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,MAX_TABLES,WAIT_OFFER_MS} from './game.js';

function world(n=8){
 const db={users:[{id:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:0};const e=createEngine({db});
 const tables=Array.from({length:6},(_,i)=>e.makeTable(String(i+1),'T'+(i+1),100,200));
 const users=Array.from({length:n},(_,i)=>{const u={id:'u'+i,username:'u'+i,role:'USER',balance:1_000_000};db.users.push(u);return u;});
 return {db,e,tables,users};
}

test('a player can sit at up to four tables, never twice at the same one',()=>{
 const {e,tables,users:[u]}=world(1);
 for(let i=0;i<MAX_TABLES;i++)e.sit(tables[i],u,0,100,tables);
 assert.throws(()=>e.sit(tables[0],u,1,100,tables),/already seated at this table/);
 assert.throws(()=>e.sit(tables[MAX_TABLES],u,0,100,tables),/at most 4 tables/);
 assert.equal(u.balance,1_000_000-4*10000,'each table takes its own buy-in');
 e.leave(tables[0],u);e.sit(tables[MAX_TABLES],u,0,100,tables);assert.ok(tables[MAX_TABLES].seats[0]);
});

test('waiting list: only for full tables, in order, with a held seat',()=>{
 const {e,tables:[t],users}=world(9),all=[t];
 assert.throws(()=>e.joinWaitlist(t,users[6]),/sit down directly/,'no list while a seat is free');
 for(let i=0;i<6;i++)e.sit(t,users[i],i,100,all);
 assert.equal(e.joinWaitlist(t,users[6]).position,1);assert.equal(e.joinWaitlist(t,users[7]).position,2);assert.equal(e.joinWaitlist(t,users[6]).position,1,'joining twice keeps the place');
 assert.throws(()=>e.joinWaitlist(t,users[0]),/already seated/);
 assert.deepEqual(e.snapshot(t,'u7',false).waitlist,{count:2,position:2,offerUntil:null});
 // A seat frees up: it is held for the first player on the list.
 e.leave(t,users[2]);assert.equal(t.waitOffer.userId,'u6');
 assert.throws(()=>e.sit(t,users[7],2,100,all),/held for the next player/);assert.throws(()=>e.sit(t,users[8],2,100,all),/held/);
 assert.ok(e.snapshot(t,'u6',false).waitlist.offerUntil>Date.now());
 e.sit(t,users[6],2,100,all);assert.equal(t.seats[2].userId,'u6');assert.deepEqual(t.waitlist.map(w=>w.userId),['u7']);assert.equal(t.waitOffer,null);
});

test('waiting list: an offer that is not taken passes to the next player',()=>{
 const {e,tables:[t],users}=world(9),all=[t];
 for(let i=0;i<6;i++)e.sit(t,users[i],i,100,all);
 e.joinWaitlist(t,users[6]);e.joinWaitlist(t,users[7]);e.leave(t,users[0]);assert.equal(t.waitOffer.userId,'u6');
 e.tickTable(t,Date.now()+WAIT_OFFER_MS+10);
 assert.equal(t.waitOffer.userId,'u7','the seat now waits for the next player');assert.deepEqual(t.waitlist.map(w=>w.userId),['u7'],'the first player lost the place');
 e.leaveWaitlist(t,users[7]);assert.equal(t.waitOffer,null);assert.equal(t.waitlist.length,0);
 e.sit(t,users[8],0,100,all);assert.equal(t.seats[0].userId,'u8','with nobody waiting the seat is open to everyone');
});

test('with two free seats only one is held',()=>{
 const {e,tables:[t],users}=world(9),all=[t];
 for(let i=0;i<6;i++)e.sit(t,users[i],i,100,all);
 e.joinWaitlist(t,users[6]);e.leave(t,users[0]);e.leave(t,users[1]);
 e.sit(t,users[8],1,100,all);assert.ok(t.seats[1],'one free seat is open');
 assert.throws(()=>e.sit(t,users[7],0,100,all),/held/,'the last one is kept for the list');
});

test('the action timer folds for an absent player without sitting them out; three hands in a row cash out',()=>{
 const {e,tables:[t],users}=world(2),all=[t];
 e.sit(t,users[0],0,100,all);e.sit(t,users[1],1,100,all);
 for(let hand=1;hand<=3;hand++){
  for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;
  assert.ok(e.startHand(t),'hand '+hand+' is dealt: two players are still in');
  const away=t.seats.find(s=>s?.userId==='u1');assert.ok(away.inHand,'the player who timed out is dealt in again');
  // u0 plays, u1 never acts: the timer acts for u1.
  for(let k=0;k<20&&['preflop','flop','turn','river'].includes(t.phase);k++){const s=t.seats[t.turn];if(s.userId==='u1')e.tickTable(t,t.deadline+1);else e.act(t,'u0',t.currentBet>s.roundBet?'call':'check');}
  assert.equal(t.seats.find(s=>s?.userId==='u1')?.sittingOut||false,false,'never sat out by the timer');
 }
 assert.equal(t.seats.find(s=>s?.userId==='u1').inactiveHands,3);
 for(const s of t.seats)if(s)s.lastSeen=Date.now();t.lastActionAt=0;e.startHand(t);
 assert.ok(!t.seats.some(s=>s?.userId==='u1'),'after three timed-out hands the seat is cashed out');
});
