import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,LIVE} from './game.js';
import {TABLE_CATALOG,CATALOG_NAMES,TABLE_GREEN,seedCatalog} from './table-catalog.js';

const world=(size,sb=100,bb=200,game='holdem')=>{
 const db={users:[{id:'c',username:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:5,tables:[]};
 const e=createEngine({db}),t=e.makeTable('1','T',sb,bb,game,size);
 for(let i=0;i<8;i++)db.users.push({id:'u'+i,username:'u'+i,role:'USER',balance:100000000});
 return {db,e,t,user:i=>db.users[i+1]};
};

test('a table has exactly the seats it was made with',()=>{
 for(const size of [2,4,6]){const {e,t,user}=world(size);assert.equal(t.seats.length,size);
  for(let i=0;i<size;i++)e.sit(t,user(i),i,100,[t]);
  assert.throws(()=>e.sit(t,user(7),size,100,[t]),/seat is taken/,'no seat beyond the table');}
 assert.equal(world(3).t.seats.length,6,'other sizes fall back to six');
});

test('the full ladder of buy-ins follows the blinds',()=>{
 const {e,t}=world(6,1,2);assert.deepEqual(e.buyinLimits(t),{min:20,max:200},'€0.20 to €2 at €0.01/€0.02');
 const high=world(6,2500,5000);assert.deepEqual(high.e.buyinLimits(high.t),{min:50000,max:500000},'€500 to €5,000 at €25/€50');
});

test('heads-up: the button posts the small blind and acts first, and the button moves',()=>{
 const {e,t,user}=world(2);e.sit(t,user(0),0,100,[t]);e.sit(t,user(1),1,100,[t]);assert.ok(e.startHand(t));
 const first=t.button;assert.equal(t.sbPos,first);assert.equal(t.bbPos,1-first);assert.equal(t.turn,first);
 e.act(t,t.seats[t.turn].userId,'fold');for(let g=0;g<5&&LIVE.includes(t.phase);g++)e.tickTable(t,Date.now()+60000);
 assert.ok(e.startHand(t));assert.equal(t.button,1-first);
});

test('hands at 2, 4 and 6 seats keep every cent, at the smallest and largest stakes',()=>{
 for(const size of [2,4,6])for(const [sb,bb] of [[1,2],[2,5],[10,25],[2500,5000]])for(const game of ['holdem','omaha'])for(let round=0;round<60;round++){
  const {db,e,t,user}=world(size,sb,bb,game),l=e.buyinLimits(t);
  for(let i=0;i<size;i++)e.sit(t,user(i),i,(l.min+Math.floor(Math.random()*(l.max-l.min)))/100,[t]);
  const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+t.seats.reduce((m,s)=>m+(s?s.stack:0),0)+(LIVE.includes(t.phase)?t.pot:0),start=total();
  assert.ok(e.startHand(t));
  for(let g=0;g<80&&LIVE.includes(t.phase);g++){
   if(t.runout){e.tickTable(t,t.runout.at+1);continue;}
   const s=t.seats[t.turn],r=Math.random(),canCall=t.currentBet>s.roundBet;
   try{if(r<.2)e.act(t,s.userId,'fold');else if(r<.5)e.act(t,s.userId,'raise',(s.roundBet+s.stack)/100);else e.act(t,s.userId,canCall?'call':'check');}
   catch{e.act(t,s.userId,canCall?'call':'check');}
  }
  assert.ok(!LIVE.includes(t.phase),'the hand finishes');assert.equal(total(),start,'no cent appears or disappears');
  for(const s of t.seats)assert.ok(s.stack>=0&&Number.isInteger(s.stack));
 }
});

test('the catalog: six tables per name, in a row, numbered I to VI, all green',()=>{
 const roman=['I','II','III','IV','V','VI'];
 assert.equal(TABLE_CATALOG.length,36);assert.equal(new Set(TABLE_CATALOG.map(t=>t.name.toLowerCase())).size,36);
 assert.deepEqual(TABLE_CATALOG.slice(0,6).map(t=>t.name),roman.map(r=>'Imperium '+r));
 CATALOG_NAMES.forEach(({name},n)=>roman.forEach((r,i)=>assert.equal(TABLE_CATALOG[n*6+i].name,name+' '+r,'in a row')));
 for(const t of TABLE_CATALOG){assert.ok([2,4,6].includes(t.size));assert.ok(t.sb>0&&t.bb>=t.sb*2,t.name);assert.ok(t.name.length<=40);assert.equal(t.color,TABLE_GREEN);assert.equal(t.game,'holdem');}
 for(const size of [2,4,6])assert.equal(TABLE_CATALOG.filter(t=>t.size===size).length,12);
 for(let i=3;i<36;i+=3)assert.ok(TABLE_CATALOG[i].bb>TABLE_CATALOG[i-3].bb,'stakes rise along the list');
});

test('the catalog opens once and keeps what is already there',()=>{
 const db={tables:[{id:'1',name:'Emerald One',sb:100,bb:200,color:'#a8792a'},{id:'7',name:'Monaco II',sb:300,bb:600}],nextTable:8};
 assert.equal(seedCatalog(db),35,'the name already taken is skipped');
 assert.equal(db.tables.find(t=>t.name==='Monaco II').sb,300,'an existing table keeps its blinds');
 assert.ok(db.tables.every(t=>t.color===TABLE_GREEN),'every table is green');
 const ids=db.tables.map(t=>t.id);assert.equal(new Set(ids).size,ids.length,'ids are unique');assert.equal(db.nextTable,Math.max(...ids.map(Number))+1);
 db.tables=db.tables.filter(t=>t.name!=='Supreme III');const count=db.tables.length;assert.equal(seedCatalog(db),0,'a closed table does not come back');assert.equal(db.tables.length,count);
});
