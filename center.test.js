import test from 'node:test';import assert from 'node:assert/strict';
import {createCenter,period,dayStart,tiranaDay} from './center.js';

const NOW=Date.parse('2026-11-18T10:00:00Z');
function world(){
 const users=[{id:'c',username:'center',role:'CENTER',balance:100000},{id:'a',username:'adm',role:'ADMIN',parentId:'c',share:40,balance:5000},
  {id:'g',username:'agt',role:'AGENT',parentId:'a',share:20,balance:3000},{id:'p',username:'pl',role:'USER',parentId:'g',balance:2000,registeredAt:NOW-3600e3},
  {id:'q',username:'old',role:'USER',parentId:'g',balance:1000,registeredAt:NOW-40*864e5},{id:'b',username:'bot1',role:'USER',isBot:true,balance:700}];
 const T=NOW-2*3600e3,Y=NOW-26*3600e3;
 const ledger=[
  // today: player paid €1.00 rake; agent 20c, admin 20c, centre 60c; a bot paid 30c
  {type:'RAKE',time:T,tableId:'1',amount:130,allocations:[{userId:'p',amount:100},{userId:'b',amount:30,bot:true}],shares:[{userId:'g',role:'AGENT',amount:20},{userId:'a',role:'ADMIN',amount:20}]},
  // yesterday: €0.50 from the old player, no shares recorded
  {type:'RAKE',time:Y,tableId:'1',amount:50,allocations:[{userId:'q',amount:50}],shares:[]},
  {type:'MINT',time:T,amount:10000},{type:'TRANSFER',time:T,from:'c',to:'a',amount:4000},{type:'TRANSFER',time:T,from:'a',to:'c',amount:500},
  {type:'TRANSFER',time:T,from:'p',to:'g',amount:300,cash:true},{type:'CRYPTO_DEPOSIT',time:T,from:'c',to:'p',amount:2500},{type:'CRYPTO_WITHDRAW',time:Y,from:'p',to:'c',amount:900},
 ];
 const db={users,ledger,tables:[{id:'1',name:'Porto I'}],cenbWallet:{credit:1000},cenbRake:30};
 const runtime=new Map([['1',{name:'Porto I',phase:'waiting',pot:0,seats:[{userId:'p',stack:400},{userId:'b',isBot:true,stack:300},null]}]]);
 const store={handHours:()=>[{h:Math.floor(T/3600000),hands:12,humanHands:10,botNet:-1.5}],playerHours:()=>[{h:Math.floor(T/3600000),id:'p'}],playerTotals:()=>[{id:'p',hands:12,net:3.25,last:T}],playerStats:()=>({hands:12,won:4,vpip:6,net:3.25,best:2,worst:-1,days:[]}),playerHands:()=>[]};
 return {db,runtime,center:createCenter({db,store,runtime,online:id=>id==='p',cenbValue:()=>({wallet:1000,rake:30,bots:700})})};
}

test('periods are calendar days in Tirana, with the same length just before',()=>{
 assert.equal(tiranaDay(Date.parse('2026-11-17T23:30:00Z')),'2026-11-18','00:30 in Tirana is the next day');
 assert.equal(dayStart('2026-11-18'),Date.parse('2026-11-17T23:00:00Z'));
 assert.equal(dayStart('2026-07-01'),Date.parse('2026-06-30T22:00:00Z'),'summer time');
 const p=period({preset:'7d'},NOW);assert.deepEqual([p.from,p.to,p.days,p.prev.from,p.prev.to],['2026-11-12','2026-11-18',7,'2026-11-05','2026-11-11']);
 assert.deepEqual([period({preset:'lastmonth'},NOW).from,period({preset:'lastmonth'},NOW).to],['2026-10-01','2026-10-31']);
 assert.deepEqual([period({from:'2026-11-10',to:'2026-11-01'},NOW).from,period({from:'2026-11-10',to:'2026-11-01'},NOW).to],['2026-11-01','2026-11-10']);
});

test('the report: rake, what the network earned, what the centre keeps, money flows and where the money is',()=>{
 const {center}=world(),r=center.report({preset:'today'},NOW),c=r.current;
 assert.equal(c.rake,1,'only the players\' rake');assert.equal(c.bots,0.3,'the bots\' rake apart');
 assert.equal(c.shares,0.4);assert.deepEqual(c.byRole,{ADMIN:0.2,MANAGER:0,AGENT:0.2});assert.equal(c.center,0.6,'rake − shares');
 assert.equal(c.minted,100);assert.equal(c.toNetwork,40);assert.equal(c.fromNetwork,5);assert.equal(c.cashouts,3);assert.equal(c.deposits,25);assert.equal(c.withdrawals,0);
 assert.equal(c.hands,12);assert.equal(c.humanHands,10);assert.equal(c.players,1);assert.equal(c.newPlayers,1);assert.equal(c.cenbResult,-1.2,'the bots result with their rake counted back (−1.50 + 0.30)');
 assert.equal(r.before.rake,0.5,'yesterday');assert.equal(r.before.center,0.5);assert.equal(r.before.withdrawals,9);
 assert.equal(r.now.players,30);assert.equal(r.now.onTables,4);assert.equal(r.now.cenb.bots,10,'bot wallets and their chips');
 assert.equal(r.now.total,50+30+30+4+10+10+0.3,'credit in circulation: everything outside the centre');assert.equal(r.now.ok,true);
 assert.equal(c.created,65,'created: 40 to the network + 25 for deposits');assert.equal(c.returned,5);assert.equal(c.net,59.4,'created − returned − what the centre kept');
 const agent=r.network.find(x=>x.username==='agt');assert.equal(agent.rake,1);assert.equal(agent.earned,0.2);assert.equal(agent.players,1);
 assert.equal(r.network.find(x=>x.username==='adm').rake,1,'the admin counts the players of its agents');
 assert.deepEqual(r.players.map(p=>[p.username,p.rake,p.agent]),[['pl',1,'agt']]);
 assert.equal(r.daily.length,1);assert.equal(r.daily[0].rake,1);
});

test('every account, with its chain, its money and what it played; one account in full',()=>{
 const {center}=world(),d=center.directory({days:30});
 assert.equal(d.rows.length,4,'no centre, no bots');assert.equal(d.counts.USER,2);assert.equal(d.counts.online,1);assert.equal(d.counts.playing,1);
 const p=d.rows.find(r=>r.username==='pl');assert.deepEqual([p.agent,p.admin,p.parent.username],['agt','adm','agt']);
 assert.equal(p.chips,4);assert.deepEqual(p.tables,['Porto I']);assert.equal(p.hands,12);assert.equal(p.net,3.25);assert.equal(p.rake,1);
 assert.equal(d.rows.find(r=>r.username==='agt').below,2);assert.equal(d.rows.find(r=>r.username==='adm').earned,0.2);
 const a=center.account('g');assert.deepEqual(a.path.map(x=>x.username),['center','adm']);assert.equal(a.children.length,2);assert.equal(a.network.players,2);assert.equal(a.network.rake,1.5);
 assert.equal(center.account('b'),null,'bots are CENB\'s');assert.equal(center.account('c'),null);
 const pl=center.account('p');assert.ok(pl.ledger.some(x=>x.type==='CRYPTO_DEPOSIT'&&x.amount===25));assert.ok(pl.ledger.some(x=>x.type==='RAKE'&&x.amount===-1));
});

test('a member sees only its own network, without e-mails, addresses or devices',()=>{
 const {db,center}=world();db.users.find(u=>u.id==='p').email='pl@example.com';db.users.find(u=>u.id==='p').seenIps=['1.2.3.4'];
 const d=center.directory({rootId:'a'});assert.deepEqual(d.rows.map(r=>r.username).sort(),['agt','old','pl'],'everyone under the admin, not the admin itself');
 assert.equal(d.rows.find(r=>r.username==='pl').email,null);
 assert.deepEqual(center.directory({rootId:'g'}).rows.map(r=>r.username).sort(),['old','pl']);
 const a=center.account('p','a');assert.deepEqual(a.path.map(x=>x.username),['adm','agt'],'the chain starts at the member');assert.deepEqual(a.user.ips,[]);assert.equal(a.user.email,null);
 assert.equal(center.account('a','g'),null,'nothing above or beside it');assert.deepEqual(center.account('p').user.ips,['1.2.3.4']);
});
