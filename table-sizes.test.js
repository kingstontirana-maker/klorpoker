import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine,LIVE} from './game.js';
import {TABLE_CATALOG,TABLE_GREEN,seedCatalog,RETIRED_V3,RETIRED_V4} from './table-catalog.js';

const world=(size,sb=100,bb=200,game='holdem')=>{
 const db={users:[{id:'c',username:'c',role:'CENTER',balance:0}],ledger:[],rakePercent:5,tables:[]};
 const e=createEngine({db}),t=e.makeTable('1','T',sb,bb,game,size);
 for(let i=0;i<12;i++)db.users.push({id:'u'+i,username:'u'+i,role:'USER',balance:100000000});
 return {db,e,t,user:i=>db.users[i+1]};
};

test('a table has exactly the seats it was made with',()=>{
 for(const size of [2,4,5,6,9]){const {e,t,user}=world(size);assert.equal(t.seats.length,size);
  for(let i=0;i<size;i++)e.sit(t,user(i),i,100,[t]);
  assert.throws(()=>e.sit(t,user(11),size,100,[t]),/seat is taken/,'no seat beyond the table');}
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

test('hands at 2, 4, 5, 6 and 9 seats keep every cent, at the smallest and largest stakes',()=>{
 for(const size of [2,4,5,6,9])for(const [sb,bb] of [[1,2],[2,5],[10,25],[2500,5000],[10000,20000]])for(const game of ['holdem','omaha'])for(let round=0;round<60;round++){
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

test('the catalog: the list as given, in order, all green',()=>{
 assert.equal(TABLE_CATALOG.length,164);assert.equal(new Set(TABLE_CATALOG.map(t=>t.name.toLowerCase())).size,164,'every name once');
 for(const [size,count] of [[9,11],[6,74],[5,12],[4,36],[2,31]])assert.equal(TABLE_CATALOG.filter(t=>t.size===size).length,count,size+' seats');
 const by=n=>TABLE_CATALOG.find(t=>t.name===n);
 assert.deepEqual([by('Porto I').sb,by('Porto I').bb,by('Porto I').size],[1,2,9]);assert.deepEqual([by('Vienna II').sb,by('Vienna II').bb,by('Vienna II').size],[10,20,9]);assert.ok(!by('Vienna III'));
 assert.deepEqual([by('Valencia VII').sb,by('Valencia VII').bb,by('Valencia VII').size],[15,25,6]);assert.ok(!by('Valencia VIII'));assert.deepEqual([by('Sevilla I').sb,by('Sevilla I').bb,by('Sevilla VII').size],[25,50,6]);
 assert.deepEqual([by('Milano IX').sb,by('Milano IX').bb,by('Milano IX').size],[5,10,6]);assert.ok(!by('Milano X'));
 assert.deepEqual([by('Macau III').sb,by('Macau III').bb,by('Macau III').size],[10000,20000,5]);assert.deepEqual([by('Singapore I').bb,by('Courchevel II').bb,by('Mykonos III').bb],[10000,6000,5000]);
 assert.deepEqual([by('St. Moritz I').sb,by('St. Moritz I').bb,by('St. Moritz I').size],[4000,8000,6]);assert.deepEqual([by('Gstaad I').bb,by('Gstaad I').size],[8000,2]);assert.deepEqual([by('Abu Dhabi I').sb,by('Abu Dhabi I').bb],[1000,2000]);
 assert.equal(by('Düsseldorf III').size,4);assert.deepEqual([by('Boston I').sb,by('Boston I').bb,by('Boston I').size],[500,1000,2]);assert.equal(by('Saint-Tropez III').bb,100);
 assert.equal(TABLE_CATALOG[0].name,'Porto I');assert.equal(TABLE_CATALOG.at(-1).name,'Gstaad I');
 for(const t of TABLE_CATALOG){assert.ok([2,4,5,6,9].includes(t.size));assert.ok(t.sb>0&&t.bb>t.sb,t.name);assert.equal(t.color,TABLE_GREEN);assert.equal(t.game,'holdem');}
});

test('the catalog replaces every table once, and ids keep counting up',()=>{
 const db={tableCatalog:1,nextTable:60,tables:[{id:'1',name:'Emerald One',sb:100,bb:200},{id:'59',name:'Monaco II',sb:5,bb:10,size:6}]};
 assert.equal(seedCatalog(db),164);assert.equal(db.tables.length,164);assert.ok(!db.tables.some(t=>t.name==='Emerald One'),'old tables are closed');
 assert.equal(db.tables[0].id,'60');assert.equal(db.nextTable,224);assert.equal(new Set(db.tables.map(t=>t.id)).size,164);
 db.tables=db.tables.filter(t=>t.name!=='Paris III');assert.equal(seedCatalog(db),0,'a closed table does not come back');assert.equal(db.tables.length,163);
});

test('catalog v4: a running database closes 14 nine-seat tables and opens Valencia and Sevilla',()=>{
 const now={tableCatalog:1,nextTable:60,tables:[]};seedCatalog(now);
 // what version 3 held: the current list without the 14 new six-seat tables, with the 14 nine-seat ones
 const v4new=t=>/^(Valencia|Sevilla) /.test(t.name);let id=500;
 const db={tableCatalog:3,nextTable:500,tables:[...now.tables.filter(t=>!v4new(t)).map(t=>({...t,id:String(id++)})),...RETIRED_V4.map(name=>({id:String(id++),name,sb:5,bb:10,size:9,game:'holdem'})),{id:String(id++),name:'Centre table',sb:100,bb:200,size:9}]};
 const before=db.tables.length,start=id;
 assert.equal(seedCatalog(db),14);assert.equal(db.tableCatalog,4);assert.equal(db.tables.length,before);
 for(const n of RETIRED_V4)assert.ok(!db.tables.some(t=>t.name===n),n+' closed');
 assert.ok(db.tables.some(t=>t.name==='Centre table'),'a table the centre made stays');
 const added=db.tables.filter(v4new);assert.equal(added.length,14);assert.ok(added.every(t=>Number(t.id)>=start&&t.size===6),'new ids, six seats');
 assert.deepEqual([...new Set(added.map(t=>t.sb+'/'+t.bb))].sort(),['15/25','25/50']);
 assert.equal(db.tables.filter(t=>t.size===9&&t.name!=='Centre table').length,11,'11 nine-seat tables stay');
 assert.equal(new Set(db.tables.map(t=>t.id)).size,db.tables.length);assert.equal(seedCatalog(db),0,'runs once');
});

test('catalog: a version 2 database takes both steps (v3 and v4)',()=>{
 const now={tableCatalog:1,nextTable:60,tables:[]};seedCatalog(now);let id=900;
 const v3v4=t=>t.size===5||t.bb===8000||/^(Valencia|Sevilla) /.test(t.name);
 const db={tableCatalog:2,nextTable:900,tables:[...now.tables.filter(t=>!v3v4(t)).map(t=>({...t,id:String(id++)})),...[...RETIRED_V3,...RETIRED_V4].map(name=>({id:String(id++),name,sb:5,bb:10,size:6,game:'holdem'}))]};
 assert.equal(seedCatalog(db),28);assert.equal(db.tableCatalog,4);assert.equal(db.tables.length,164);
 assert.deepEqual(db.tables.map(t=>t.name).sort(),now.tables.map(t=>t.name).sort(),'ends with exactly the current list');
});
