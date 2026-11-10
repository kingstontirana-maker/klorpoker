import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {openStore} from './store.js';

test('hierarchy, credit gating, rebuy, server timeout and persisted escrow', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'baron-test-'));
  const file=path.join(dir,'state.json');
  const password='TestPassword123!';
  const users=['CENTER','ADMIN','AGENT','USER','USER'].map((role,i)=>({id:String(i),username:'test'+i,role,parentId:i?String(i===4?2:i-1):null,salt:'test-salt',passHash:crypto.scryptSync(password,'test-salt',64).toString('hex'),balance:i===0?100000:0}));
  fs.writeFileSync(file,JSON.stringify({users,rakePercent:5,rakeCap:300,ledger:[],tables:[],nextTable:2}));
  process.env.STATE_FILE=file;process.env.PORT='0';process.env.TABLE_CATALOG='off';
  const {server,runtime,tickTable,store,currentDb,shutdown,refreshAnalysis,mailer,checkMoney}=await import('./server.js');
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(route,token,body)=>{const r=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(token||''),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const stored=()=>{const s=openStore(path.join(dir,'klor.db')),value=s.load();s.close();return value;};
  const live=[];
  try {
    for(const route of ['/bots','/bots/']){
      const page=await fetch(base+route);
      assert.equal(page.status,200);
      assert.match(await page.text(),/bots-center\.js/);
      assert.equal(page.headers.get('cache-control'),'no-store');
    }
    const {get}=await import('node:http');
    const botHome=await new Promise((resolve,reject)=>{
      get(base+'/',{headers:{Host:'cenb.suprempoker.com'}},res=>{
        let html='';res.setEncoding('utf8');res.on('data',chunk=>html+=chunk);res.on('end',()=>resolve(html));
      }).on('error',reject);
    });
    assert.match(botHome,/bots-center\.js/);
    const mainHome=await fetch(base+'/');
    assert.doesNotMatch(await mainHome.text(),/bots-center\.js/);
    const tokens=[];
    for(let i=0;i<5;i++)tokens.push((await call('login','',{username:'test'+i,password})).data.token);
    assert.equal((await call('rake/events',tokens[3])).status,403);
    assert.equal((await call('rake/events','')).status,401);
    // Registration: a code by email, and every new player lands under the agent the centre chose.
    const outbox=[];mailer.send=async m=>{outbox.push(m);};
    const details=(over={})=>({username:'newbie',email:'New.Bie@Example.com',password:'Newbie12345',adult:true,...over}),codeIn=m=>m.text.match(/\b\d{6}\b/)?.[0];
    assert.equal((await call('register/start','',details())).status,503,'closed until the centre chooses an agent');assert.equal(outbox.length,0);
    assert.equal((await call('signup/agents',tokens[2])).status,403);assert.equal((await call('signup/agent',tokens[2],{id:'2'})).status,403);
    assert.equal((await call('signup/agent',tokens[0],{id:'3'})).status,400,'only an agent');
    assert.equal((await call('signup/agent',tokens[0],{id:'2'})).status,200);assert.deepEqual((await call('signup/agents',tokens[0])).data.agents.map(a=>a.username),['test2']);
    assert.equal((await call('register/start','',details({adult:false}))).status,400);assert.equal((await call('register/start','',details({email:'nope'}))).status,400);assert.equal(outbox.length,0);
    assert.equal((await call('register/start','',details())).status,200);assert.equal(outbox.length,1);assert.equal(outbox[0].to,'new.bie@example.com');const code=codeIn(outbox[0]);assert.match(code,/^\d{6}$/);
    assert.equal((await call('register/start','',details())).status,429,'one code a minute');assert.equal(outbox.length,1);
    assert.ok(!JSON.stringify(currentDb()).includes(code),'the code is not stored');
    const wrong=code==='000000'?'000001':'000000';
    assert.equal((await call('register/verify','',details({code:wrong}))).status,400);assert.equal((await call('register/verify','',details({code,email:'other@example.com'}))).status,400);
    const reg=await call('register/verify','',details({code,email:'NEW.BIE@example.com'}));
    assert.equal(reg.status,200);assert.equal(reg.data.user.role,'USER');assert.equal(reg.data.user.parentId,'2');assert.equal(reg.data.user.balance,0);assert.equal((await call('state',reg.data.token)).status,200);
    assert.equal(reg.data.user.email,undefined,'the email is not sent back');assert.equal(currentDb().users.find(x=>x.username==='newbie').email,'new.bie@example.com');
    assert.equal((await call('register/verify','',details({code,username:'again'}))).status,400,'a code works once');
    // A player who registered alone: the agent sees them, but only the centre touches wallet and login.
    {const id=reg.data.user.id,seen=(await call('users',tokens[2])).data.find(x=>x.username==='newbie');assert.equal(seen.direct,true);
     assert.equal((await call('transfer',tokens[0],{userId:id,amount:10,direction:'send'})).status,200,'the centre can');
     for(const [path,payload] of [['transfer',{userId:id,amount:5,direction:'return'}],['transfer',{userId:id,amount:5,direction:'send'}],['users/password',{userId:id,password:'Stolen12345'}],['users/status',{userId:id,blocked:true}]])assert.equal((await call(path,tokens[2],payload)).status,404,'the agent cannot: '+path);
     assert.equal(currentDb().users.find(x=>x.id===id).balance,1000,'the wallet is untouched');assert.equal((await call('state',reg.data.token)).status,200,'still signed in');
     assert.equal((await call('state',reg.data.token)).data.user.direct,true);assert.ok((await call('users',tokens[0])).data.some(x=>x.id===id),'the centre lists them');assert.ok(!(await call('users',tokens[1])).data.some(x=>x.id===id));
     // Cash-out: the agent asks, and only the player's confirmation moves the money.
     const wallet=i=>currentDb().users.find(x=>x.id===i).balance,agentStart=wallet('2'),ask=amount=>call('cashout/request',tokens[2],{userId:id,amount}),open=async()=>(await call('state',reg.data.token)).data.user.cashout;
     assert.equal((await ask(11)).status,400,'not more than the wallet');assert.equal((await ask(-1)).status,400);assert.equal((await call('cashout/request',tokens[3],{userId:id,amount:1})).status,403);assert.equal((await call('cashout/request',tokens[2],{userId:'3',amount:1})).status,404,'an old player keeps the old way');
     assert.equal((await ask(4)).status,200);assert.equal((await ask(1)).status,400,'one request at a time');assert.equal(wallet(id),1000,'asking moves nothing');
     let c=await open();assert.equal(c.amount,4);assert.equal(c.agent,'test2');assert.equal((await call('state',tokens[2])).data.user.pendingCashouts,1);assert.equal((await call('users',tokens[2])).data.find(x=>x.id===id).cashout.amount,4);
     assert.equal((await call('cashout/respond',tokens[3],{id:c.id,accept:true})).status,404,'not their request');assert.equal((await call('cashout/respond',tokens[2],{id:c.id,accept:true})).status,403);
     assert.equal((await call('cashout/respond',reg.data.token,{id:c.id,accept:false})).status,200);assert.equal(await open(),null);assert.equal(wallet(id),1000,'declined');assert.equal(wallet('2'),agentStart);
     assert.equal((await ask(4)).status,200);assert.equal((await call('cashout/cancel',tokens[2],{userId:id})).status,200);assert.equal(await open(),null,'cancelled');
     assert.equal((await ask(4)).status,200);c=await open();currentDb().cashouts.find(x=>x.id===c.id).expires=Date.now()-1;assert.equal(await open(),null,'it runs out');assert.equal((await call('cashout/respond',reg.data.token,{id:c.id,accept:true})).status,404);assert.equal(wallet(id),1000);
     assert.equal((await ask(4)).status,200);c=await open();currentDb().users.find(x=>x.id===id).balance=100;assert.equal((await call('cashout/respond',reg.data.token,{id:c.id,accept:true})).status,400,'the wallet shrank');assert.equal(wallet('2'),agentStart);currentDb().users.find(x=>x.id===id).balance=1000;
     assert.equal((await call('cashout/respond',reg.data.token,{id:c.id,accept:true})).status,200);assert.equal(wallet(id),600);assert.equal(wallet('2'),agentStart+400,'the money moved once');assert.equal((await call('cashout/respond',reg.data.token,{id:c.id,accept:true})).status,404,'it cannot run twice');
     assert.ok(currentDb().ledger.some(x=>x.cash&&x.from===id&&x.to==='2'&&x.amount===400));
     assert.equal((await call('transfer',tokens[2],{userId:id,amount:1,direction:'return'})).status,404,'Return stays closed for the agent');
     // Back to where the rest of this test expects the agent and the player.
     currentDb().users.find(x=>x.id==='2').balance=agentStart;currentDb().users.find(x=>x.id===id).balance=1000;
     assert.equal((await call('transfer',tokens[0],{userId:id,amount:10,direction:'return'})).status,200);assert.equal(currentDb().users.find(x=>x.id===id).balance,0);
     // Blocking an agent with their network leaves such a player playing.
     assert.equal((await call('users/create',tokens[1],{username:'agentx',password:'Agentx12345'})).status,200);const ax=(await call('users',tokens[1])).data.find(x=>x.username==='agentx').id;
     currentDb().users.push({id:'direct1',username:'direct1',email:'direct1@example.com',role:'USER',parentId:ax,salt:'s',passHash:'h',balance:0},{id:'old1',username:'old1',role:'USER',parentId:ax,salt:'s',passHash:'h',balance:0});
     assert.equal((await call('users/status',tokens[1],{userId:ax,blocked:true,network:true})).status,200);assert.ok(currentDb().users.find(x=>x.id==='old1').blocked);assert.ok(!currentDb().users.find(x=>x.id==='direct1').blocked);}
    assert.equal((await call('register/start','',details({email:'second@example.com'}))).status,400,'that username is taken');
    // An email already in use gets the same answer, but a notice and no code.
    outbox.length=0;const taken=await call('register/start','',details({username:'newbie2'}));assert.equal(taken.status,200);assert.deepEqual(taken.data,{sent:true});assert.equal(outbox.length,1);assert.equal(codeIn(outbox[0]),undefined,'no code');assert.match(outbox[0].subject,/already have/);
    assert.equal((await call('register/verify','',details({username:'newbie2',code:'123456'}))).status,400);
    // Five wrong codes end a code, even the right one after that.
    outbox.length=0;assert.equal((await call('register/start','',details({username:'tries',email:'tries@example.com'}))).status,200);const triesCode=codeIn(outbox[0]),bad=triesCode==='111111'?'222222':'111111';
    for(let i=0;i<5;i++)assert.equal((await call('register/verify','',details({username:'tries',email:'tries@example.com',code:bad}))).status,400);
    assert.equal((await call('register/verify','',details({username:'tries',email:'tries@example.com',code:triesCode}))).status,400);
    // A failed email is reported, and the address can try again at once.
    mailer.send=async()=>{throw Error('down');};assert.equal((await call('register/start','',details({username:'mailfail',email:'mailfail@example.com'}))).status,502);
    mailer.send=async m=>{outbox.push(m);};outbox.length=0;assert.equal((await call('register/start','',details({username:'mailfail',email:'mailfail@example.com'}))).status,200);assert.equal(outbox.length,1);
    const stats=(await call('public/stats','')).data;assert.equal(typeof stats.tables,'number');assert.ok(!/test\d|passHash|salt/.test(JSON.stringify(stats)));
    for(const index of [0,1,2]){
      const controller=new AbortController();
      const response=await fetch(base+'/api/rake/events',{headers:{Authorization:'Bearer '+tokens[index]},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])});
      assert.match(response.headers.get('content-type'),/text\/event-stream/);
      const reader=response.body.getReader();let buffer='';
      const next=async()=>{while(true){let boundary=buffer.indexOf('\n\n');if(boundary>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(event.startsWith('data: '))return JSON.parse(event.slice(6));}const {done,value}=await reader.read();if(done)throw Error('Live stream closed');buffer+=new TextDecoder().decode(value);}};
      live.push({controller,next});assert.equal((await next()).total,0);
    }
    assert.equal((await call('table/1/state',tokens[0])).status,403);
    assert.equal((await call('table/1/state',tokens[3])).status,403);
    assert.equal((await call('transfer',tokens[0],{userId:'3',direction:'send',amount:100})).status,404);
    for(const [from,to] of [[0,1],[1,2],[2,3]])assert.equal((await call('transfer',tokens[from],{userId:String(to),direction:'send',amount:100})).status,200);
    assert.equal((await call('table/1/state',tokens[3])).status,200);
    assert.equal((await call('table/1/sit',tokens[3],{position:0,buyin:20})).status,200);
    assert.equal((await call('table/1/rebuy',tokens[3],{amount:81})).status,400);
    assert.equal((await call('table/1/rebuy',tokens[3],{amount:10})).status,200);
    assert.equal(stored().escrow[0].amount,3000);
    assert.equal((await call('ledger',tokens[1])).data.length,4,'two transfers, and the block of agentx with its old player');
    // A broke seat persisted at a finished hand receives exactly 30 seconds.
    // Exercise the real game through an all-in, with no browser driving timers.
    await call('table/1/leave',tokens[3],{});
    assert.equal((await call('transfer',tokens[2],{userId:'3',direction:'return',amount:20})).status,200);
    await call('transfer',tokens[2],{userId:'4',direction:'send',amount:20});
    await call('table/1/sit',tokens[3],{position:0,buyin:20});
    await call('table/1/sit',tokens[4],{position:1,buyin:20});
    await call('table/1/start',tokens[3],{});
    const initial=(await call('table/1/state',tokens[3])).data;
    assert.equal(initial.phase,'preflop');
    assert.equal(initial.seats[1].cards.length,0);
    assert.deepEqual(initial.visualEvents.filter(e=>e.hand===initial.hand).slice(0,3).map(e=>e.type),['deal','bet','bet']);
    assert.ok(initial.visualEvents.every(e=>!('cards' in e)));
    assert.equal(initial.actionDuration,30000);
    const acting=initial.seats[initial.turn].isMe?3:4;
    await call('table/1/action',tokens[acting],{type:'raise',amount:20});
    await call('table/1/action',tokens[acting===3?4:3],{type:'call'});
    // The all-in board is dealt street by street by the server clock.
    const room1=runtime.get('1');for(let i=0;i<6&&room1.runout;i++)tickTable(room1,room1.runout.at);
    const done=(await call('table/1/state',tokens[3])).data;
    assert.equal(done.phase,'finished');
    for(const stream of live){const update=await stream.next();assert.equal(update.total,2);assert.equal(update.rows[0].hand,done.hand);}
    assert.equal((await call('table/1/action',tokens[acting],{type:'call'})).status,400);
    assert.equal((await call('rake/report',tokens[0])).data.total,2,'settlement cannot charge rake twice');
    assert.equal(done.visualEvents.at(-1).type,'award');
    assert.ok(done.lastResult.winnerIds.length>0);
    for(const id of done.lastResult.winnerIds){assert.equal(done.lastResult.winningHands[id].cards.length,5);assert.ok(done.lastResult.winningHands[id].cards.every(c=>[...done.board,...done.seats.find(s=>s?.id===id).cards].includes(c)));}
    assert.equal((await call('rake/report',tokens[3])).status,403);
    assert.equal((await call('rake',tokens[1],{percent:4,cap:3})).status,403);
    assert.ok(!('rakePercent' in (await call('state',tokens[3])).data));
    assert.ok(!('totalRake' in done.lastResult));
    assert.ok(!('rakeContributions' in done.lastResult));
    assert.ok(done.lastResult.pots.every(p=>!('rake' in p)));
    assert.ok(done.events.every(e=>!e.text.includes('rake')));
    for(const i of [0,1,2]){
      const report=await call('rake/report',tokens[i]);assert.equal(report.status,200);
      assert.equal(report.data.total,2);assert.equal(report.data.hands,1);
      assert.equal(report.data.rows[0].hand,done.hand);
      assert.ok(!('allocations' in report.data.rows[0]));
    }
    const saved=stored();assert.equal(saved.users.reduce((n,u)=>n+u.balance,0)+saved.escrow.reduce((n,s)=>n+s.amount,0),100000);
    const broke=done.seats.find(s=>s&&s.stack===0);
    if(broke){
      const index=broke.id==='3'?3:4;
      const state=(await call('table/1/state',tokens[index])).data;
      assert.equal(state.rebuyAvailableAt,state.lastResult.at+8000);
      assert.equal(state.rebuyDeadline-state.rebuyAvailableAt,30000);
      assert.ok(state.rebuyDeadline-state.serverNow>37000);
      const room=runtime.get('1');tickTable(room,state.rebuyDeadline-1);
      assert.equal((await call('state',tokens[index])).data.seatedTableId,'1');
      tickTable(room,state.rebuyDeadline+1);
      assert.equal((await call('state',tokens[index])).data.seatedTableId,null);
    }

    // Inactivity is counted by hands, manual play resets it, and the third
    // hand cannot charge another blind to a player removed for inactivity.
    for(const index of [3,4]){const state=(await call('state',tokens[index])).data;if(state.seatedTableId)await call('table/1/leave',tokens[index],{});}
    await call('transfer',tokens[2],{userId:'3',direction:'return',amount:20});
    await call('transfer',tokens[2],{userId:'4',direction:'send',amount:20});
    assert.equal((await call('table/1/sit',tokens[3],{position:0,buyin:20})).status,200);
    assert.equal((await call('table/1/sit',tokens[4],{position:1,buyin:20})).status,200);
    const room=runtime.get('1');
    // A missed decision folds (or checks) for the player; play goes on and the
    // player stays in (switching tabs is not leaving). Three such hands cash out.
    await call('table/1/start',tokens[3],{});
    if(room.seats[room.turn].userId==='4')assert.equal((await call('table/1/action',tokens[4],{type:'raise',amount:4})).status,200);
    assert.equal(room.seats[room.turn].userId,'3');
    tickTable(room,room.lastActionAt+30001);
    assert.equal(room.phase,'finished');
    let mine=(await call('table/1/state',tokens[3])).data;
    assert.equal(mine.seats.find(s=>s?.id==='3').lastAction.type,'AUTO-FOLD');
    assert.equal(mine.sittingOut,false);assert.equal(mine.seats.find(s=>s?.id==='3').inactiveHands,1);
    // Every hand is kept for the center: newest first, with all cards and actions.
    {const list=await call('hands',tokens[0],{});assert.equal(list.status,200);assert.ok(list.data.hands.length>=2);const last=list.data.hands[0];assert.equal(last.hand,room.hand);assert.ok(list.data.hands.every((h,i,a)=>!i||a[i-1].id>h.id),'newest first');
     const full=(await call('hands/get',tokens[0],{id:last.id})).data;assert.equal(full.tableId,'1');assert.ok(full.players.every(p=>p.cards.length===2));
     assert.ok(full.actions.some(a=>a.type==='SB')&&full.actions.some(a=>a.type==='BB')&&full.actions.some(a=>a.type==='AUTO-FOLD'));
     assert.equal(Math.round(Object.values(full.payments).reduce((a,b)=>a+b,0)*100+full.rake*100),Math.round(full.pot*100),'payments + rake = pot');
     assert.equal((await call('hands',tokens[1],{})).status,403,'admins cannot read hand history');assert.equal((await call('hands',tokens[3],{})).status,403);
     assert.equal((await call('hands',tokens[0],{player:'test4',limit:1})).data.hands.length,1);assert.equal((await call('hands',tokens[0],{player:'nobody'})).data.hands.length,0);
     assert.equal((await call('hands/get',tokens[0],{id:999999})).status,404);}
    // A voluntary break: no blind is taken until the player comes back.
    assert.equal((await call('table/1/sitout',tokens[3],{value:true})).status,200);
    const stackOut=room.seats.find(s=>s?.userId==='3').stack;
    assert.equal((await call('table/1/start',tokens[3],{})).status,400,'no hand without a second active player');
    assert.equal(room.seats.find(s=>s?.userId==='3').stack,stackOut,'no blind is taken while sitting out');
    // Coming back by choice makes the player eligible again.
    assert.equal((await call('table/1/sitout',tokens[3],{value:false})).status,200);
    assert.equal((await call('table/1/start',tokens[3],{})).status,200);
    await call('table/1/action',tokens[Number(room.seats[room.turn].userId)],{type:'fold'});
    // A break that is never ended returns the chips to the wallet.
    if(room.seats[room.turn]?.userId==='3'||['preflop','flop','turn','river'].includes(room.phase))tickTable(room,room.lastActionAt+30001);
    await call('table/1/sitout',tokens[3],{value:true});
    const chips=room.seats.find(s=>s?.userId==='3').stack;
    const before=(await call('state',tokens[3])).data.user.balance;
    tickTable(room,Date.now()+5*60000+1000);
    const removed=(await call('state',tokens[3])).data;
    assert.equal(removed.seatedTableId,null);assert.equal(removed.lastTableExit.reason,'SIT_OUT');
    assert.equal(removed.user.balance,before+chips/100);

    // Security: one session per account, sign-in lockout, password rules, blocking, headers.
    const fresh=(await call('login','',{username:'test3',password})).data.token;
    const old=await call('state',tokens[3]);assert.equal(old.status,401);assert.match(old.data.error,/another device/);
    assert.equal((await call('state',fresh)).status,200);
    assert.equal((await call('users/create',tokens[2],{username:'weakpass',password:'short'})).status,400);
    assert.equal((await call('users/create',tokens[2],{username:'goodpass',password:'Fjalekalim9'})).status,200);
    const t4=(await call('users',tokens[2])).data.find(k=>k.username==='test4');assert.ok('lastLoginAt' in t4&&'blocked' in t4);
    assert.equal((await call('users/status',tokens[2],{userId:t4.id,blocked:true})).status,200);
    assert.equal((await call('login','',{username:'test4',password})).status,403);
    assert.equal((await call('state',tokens[4])).status,401);
    assert.equal((await call('users/status',tokens[1],{userId:t4.id,blocked:false})).status,404,'only the direct manager');
    assert.equal((await call('users/status',tokens[2],{userId:t4.id,blocked:false})).status,200);
    const t4b=(await call('login','',{username:'test4',password})).data.token;
    assert.equal((await call('password',t4b,{current:password,next:'abc'})).status,400);
    assert.equal((await call('password',t4b,{current:'wrong',next:'NewPass987'})).status,400);
    assert.equal((await call('password',t4b,{current:password,next:'NewPass987'})).status,200);
    assert.equal((await call('login','',{username:'test4',password:'NewPass987'})).status,200);
    for(let i=0;i<5;i++)assert.equal((await call('login','',{username:'test1',password:'wrong'})).status,401);
    assert.equal((await call('login','',{username:'test1',password})).status,429,'locked after five wrong passwords');
    // Live table stream: the first message is the player's own view of the table.
    {const ctl=new AbortController();const r=await fetch(base+'/api/table/1/stream',{headers:{Authorization:'Bearer '+fresh},signal:AbortSignal.any([ctl.signal,AbortSignal.timeout(5000)])});
     assert.match(r.headers.get('content-type'),/text\/event-stream/);const reader=r.body.getReader();let buf='';while(!buf.includes(String.fromCharCode(10,10))){const {value}=await reader.read();buf+=new TextDecoder().decode(value);}
     const first=JSON.parse(buf.slice(buf.indexOf('data: ')+6,buf.indexOf(String.fromCharCode(10,10))));assert.equal(first.id,'1');assert.ok(Array.isArray(first.seats));ctl.abort();
     assert.equal((await fetch(base+'/api/table/1/stream')).status,401);}
    // Table colour: chosen at creation, validated, shown to players, changeable by the centre only.
    {const made=await call('tables/create',tokens[0],{name:'Ruby',sb:1,bb:2,color:'#8C1D36'});assert.equal(made.status,200);assert.equal(made.data.color,'#8c1d36');
     assert.equal((await call('tables/create',tokens[0],{name:'Bad',sb:1,bb:2,color:'red;}'})).status,400,'only #rrggbb colours');
     assert.equal((await call('tables/create',tokens[0],{name:'Plain',sb:1,bb:2})).data.color,'#1f9d6b','default emerald');
     // Omaha tables: chosen at creation, listed with their game, four cards each.
     const plo=await call('tables/create',tokens[0],{name:'Omaha One',sb:1,bb:2,game:'omaha'});assert.equal(plo.status,200);assert.equal(plo.data.game,'omaha');
     assert.equal((await call('tables/create',tokens[0],{name:'Bad game',sb:1,bb:2,game:'stud'})).status,400);
     assert.equal((await call('tables/create',tokens[0],{name:'Three',sb:1,bb:2,size:3})).status,400,'only 2, 4 or 6 seats');
     {const duel=await call('tables/create',tokens[0],{name:'Duo',sb:1,bb:2,size:2});assert.equal(duel.data.size,2);assert.equal(runtime.get(duel.data.id).seats.length,2);assert.equal((await call('state',tokens[0])).data.tables.find(x=>x.id===duel.data.id).size,2);
      assert.equal((await call('tables/delete',tokens[0],{id:duel.data.id})).status,200);}
     assert.equal((await call('tables/create',tokens[1],{name:'Not center',sb:1,bb:2,game:'omaha'})).status,403);
     const games=(await call('state',tokens[0])).data.tables;assert.equal(games.find(x=>x.id===plo.data.id).game,'omaha');assert.equal(games.find(x=>x.name==='Plain').game,'holdem');
     assert.equal(runtime.get(plo.data.id).game,'omaha');
     const listed=(await call('state',tokens[0])).data.tables.find(t=>t.id===made.data.id);assert.equal(listed.color,'#8c1d36');
     assert.equal((await call('tables/color',tokens[2],{id:made.data.id,color:'#1d4fb3'})).status,403,'only the centre recolours');
     assert.equal((await call('tables/color',tokens[0],{id:made.data.id,color:'#1d4fb3'})).status,200);
     assert.equal(runtime.get(made.data.id).color,'#1d4fb3');}
    // The centre edits or closes a table; blinds and game change only while it is empty.
    {const id=(await call('tables/create',tokens[0],{name:'Temp',sb:1,bb:2})).data.id,t=runtime.get(id);
     assert.equal((await call('tables/update',tokens[1],{id,name:'X'})).status,403,'only the centre edits tables');
     assert.equal((await call('tables/update',tokens[0],{id,name:'Sapphire',sb:2,bb:5,game:'omaha'})).status,200);
     assert.deepEqual([t.name,t.sb,t.bb,t.minRaise,t.game],['Sapphire',200,500,500,'omaha']);
     assert.equal((await call('tables/update',tokens[0],{id,sb:2,bb:3})).status,400,'big blind at least twice the small blind');
     assert.equal((await call('tables/update',tokens[0],{id,name:'   '})).status,400);
     assert.equal((await call('tables/update',tokens[0],{id:'nope',name:'X'})).status,404);
     // A seated player (same shape as the engine's seats; sitting out so no hand starts).
     t.seats[2]={userId:'ghost',username:'ghost',isBot:false,position:2,stack:500,cards:[],inHand:false,folded:false,allIn:false,committed:0,roundBet:0,acted:false,actedAt:0,inactiveHands:0,lastTimeoutHand:null,mustPost:false,sittingOut:true,sitOutSince:Date.now(),lastSeen:Date.now(),timeBank:0};
     assert.equal((await call('tables/update',tokens[0],{id,sb:1,bb:2})).status,400,'blinds locked while someone is seated');
     assert.equal((await call('tables/update',tokens[0],{id,name:'Sapphire Two'})).status,200,'renaming is always allowed');assert.equal(t.name,'Sapphire Two');
     assert.equal((await call('tables/delete',tokens[0],{id})).status,400,'an occupied table stays open');
     t.seats[2]=null;
     assert.equal((await call('tables/delete',tokens[2],{id})).status,403);
     assert.equal((await call('tables/delete',tokens[0],{id})).status,200);
     assert.equal(runtime.has(id),false);assert.ok(!(await call('state',tokens[0])).data.tables.some(x=>x.id===id),'gone from the lobby');
     assert.equal((await call('tables/delete',tokens[0],{id})).status,404);}
    // Revenue share: centre → admin (≤100%), admin → agent (≤ its own); lowering an admin caps its agents.
    {assert.equal((await call('users/share',tokens[0],{userId:'1',share:20})).status,200);
     assert.equal((await call('users/share',tokens[1],{userId:'2',share:25})).status,400,'an agent never above its admin');
     assert.equal((await call('users/share',tokens[1],{userId:'2',share:15})).data.share,15);
     assert.equal((await call('users/share',tokens[2],{userId:'3',share:5})).status,403,'agents give no share to players');
     assert.equal((await call('users/share',tokens[0],{userId:'2',share:5})).status,404,'only the direct manager');
     assert.equal((await call('users/share',tokens[0],{userId:'1',share:'abc'})).status,400);
     const low=(await call('users/share',tokens[0],{userId:'1',share:10})).data;assert.deepEqual(low.capped,['test2']);
     assert.equal((await call('users',tokens[1])).data.find(x=>x.id==='2').share,10);
     assert.equal((await call('state',tokens[1])).data.user.share,10);}
    {assert.equal((await call('users/create',tokens[0],{username:'admin_x',password:'Abcd12345',share:101})).status,400,'at most 100%');
     assert.equal((await call('users/create',tokens[0],{username:'admin_x',password:'Abcd12345',share:30})).data.share,30);
     assert.equal((await call('users/create',tokens[1],{username:'agent_x',password:'Abcd12345',share:11})).status,400,'within the admin limit of 10%');
     assert.equal((await call('users/create',tokens[1],{username:'agent_x',password:'Abcd12345',share:7.5})).data.share,7.5);
     assert.equal((await call('users/create',tokens[2],{username:'player_x',password:'Abcd12345',share:5})).data.share,null,'players have no share');}
    // Center inspection: only the center, every hole card exactly as dealt, and the access is logged.
    {const open=tok=>fetch(base+'/api/inspect/stream',{headers:{Authorization:'Bearer '+tok},signal:AbortSignal.timeout(5000)});
     assert.equal((await open(fresh)).status,403);assert.equal((await open(tokens[2])).status,403);assert.equal((await fetch(base+'/api/inspect/stream')).status,401);
     const r=await open(tokens[0]);assert.ok(r.headers.get('content-type').includes('text/event-stream'));const reader=r.body.getReader();let buf='';while(!buf.includes(String.fromCharCode(10,10))){const {value}=await reader.read();buf+=new TextDecoder().decode(value);}
     const view=JSON.parse(buf.slice(buf.indexOf('data: ')+6,buf.indexOf(String.fromCharCode(10,10))));reader.cancel();
     for(const t of runtime.values()){const seen=view.tables.find(x=>x.id===t.id);assert.ok(seen);t.seats.forEach((s,i)=>assert.deepEqual(seen.seats[i]?.cards??null,s?s.cards:null));}
     assert.ok((await call('ledger',tokens[0])).data.some(x=>x.type==='INSPECT'),'inspection is logged');}
    const page=await fetch(base+'/');assert.equal(page.headers.get('x-frame-options'),'DENY');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const pass=i=>i===4?'NewPass987':password,signIn=async i=>(await call('login','',{username:'test'+i,password:pass(i)})).data.token;
    // Health check, open to the proxy without signing in.
    {const h=await call('health','');assert.equal(h.status,200);assert.equal(h.data.ok,true);}
    // Activity log: staff changes are recorded without secrets; only the center reads it.
    {const C=await signIn(0);
     await call('rake',C,{percent:4});await call('users/password',C,{userId:'1',password:'Another12345'});await call('users/password',C,{userId:'1',password});
     const log=await call('audit',C,{limit:200});assert.equal(log.status,200);const rake=log.data.rows.find(r=>r.action==='rake');assert.equal(rake.actor,'test0');assert.equal(rake.details.percent,4);assert.equal(typeof rake.details.before,'number');
     const pw=log.data.rows.find(r=>r.action==='users/password');assert.equal(pw.target,'test1');assert.ok(!JSON.stringify(log.data).includes('Another12345'),'passwords never reach the log');
     assert.ok(log.data.rows.some(r=>r.action==='login'&&r.actor==='test0'),'staff sign-ins are logged');
     assert.equal((await call('audit',await signIn(2),{})).status,403);await call('rake',C,{percent:5});}
    // Blocking a whole network, and restoring exactly what it blocked.
    {const C=await signIn(0),A=await signIn(2);
     await call('users/status',A,{userId:'4',blocked:true});
     const listed=(await call('users',C)).data.find(x=>x.id==='1');assert.ok(listed.below>=3,'the panel knows how many are below');
     const b=await call('users/status',C,{userId:'1',blocked:true,network:true});assert.equal(b.status,200);assert.ok(b.data.network>=2,'the agent and its players; one was already blocked');
     for(const i of [2,3,4])assert.equal((await call('login','',{username:'test'+i,password:pass(i)})).status,403,'test'+i+' cannot sign in');
     assert.equal((await call('users/status',C,{userId:'1',blocked:false})).data.network,b.data.network);
     for(const i of [2,3])assert.equal((await call('login','',{username:'test'+i,password})).status,200,'test'+i+' is back');
     assert.equal((await call('login','',{username:'test4',password:pass(4)})).status,403,'blocked for their own reason, it stays');
     await call('users/status',await signIn(2),{userId:'4',blocked:false});
     const one=await call('users/status',await signIn(0),{userId:'1',blocked:true});assert.equal(one.data.network,0);assert.equal((await call('login','',{username:'test2',password})).status,200,'without the option only that account stops');await call('users/status',await signIn(0),{userId:'1',blocked:false});}
    // Chat: report, review, mute; staff only inside their network.
    {const P3=await signIn(3),P4=await signIn(4),A=await signIn(2),C=await signIn(0);const t=runtime.get('1');
     t.chat=[{id:900,user:'test4',text:'rude words',at:Date.now()}];
     assert.equal((await call('table/1/report',P3,{message:999})).status,404);
     assert.equal((await call('table/1/report',P4,{message:900})).status,400,'not your own message');
     assert.equal((await call('table/1/report',P3,{message:900})).status,200);await call('table/1/report',P3,{message:900});
     const list=await call('moderation',A,{});assert.equal(list.status,200);assert.equal(list.data.reports.length,1,'reporting twice counts once');assert.equal(list.data.reports[0].target,'test4');
     assert.equal((await call('moderation',P3,{})).status,403);
     assert.equal((await call('moderation/resolve',A,{id:list.data.reports[0].id,minutes:30})).status,200);assert.equal((await call('moderation',A,{})).data.reports.length,0);
     assert.equal((await call('table/1/chat',P4,{text:'hello'})).status,403,'muted');
     assert.equal((await call('users/mute',C,{userId:'4',minutes:0})).status,200);assert.equal((await call('table/1/chat',P4,{text:'hello'})).status,200,'unmuted');
     assert.equal((await call('users/mute',P3,{userId:'4',minutes:5})).status,403);
     const alerts=await call('alerts',C,{});assert.equal(alerts.status,200);assert.ok(Array.isArray(alerts.data.alerts));assert.equal((await call('alerts',P3,{})).status,403);
     assert.equal((await call('security',C,{})).status,200);assert.equal((await call('security',A,{})).status,403);
     const report=await call('reports/players',A,{days:30});assert.equal(report.status,200);assert.ok(report.data.rows.length&&report.data.rows.every(r=>r.agent==='test2'),'an agent sees its own players');assert.equal((await call('reports/players',P3,{})).status,403);}
    // A player's own hands: their cards, others' only if shown, no bot marks or ids.
    {const P=await signIn(3),C=await signIn(0);store.addHand({id:900001,tableId:'1',table:'One',game:'holdem',hand:9,sb:1,bb:2,startedAt:Date.now(),button:1,board:['2h','3h','4c','9s','Kd'],pot:10,rake:0,showdown:true,winners:['test3'],shown:[{username:'test3',cards:['Ah','Kh'],rank:'Pair'}],winningHands:{test3:{rank:'Pair',cards:[]}},actions:[{street:'preflop',username:'test3',type:'RAISE',amount:4}],players:[{seat:1,userId:'3',username:'test3',cards:['Ah','Kh'],stack:50,end:55,result:5},{seat:2,userId:'b1',username:'hidden',bot:true,cards:['Qs','Qd'],stack:50,end:45,result:-5,folded:true}]});
     const mine=await call('my/hands',P,{limit:1});assert.equal(mine.status,200);assert.equal(mine.data.hands[0].id,900001);assert.deepEqual(mine.data.hands[0].cards,['Ah','Kh']);
     const full=await call('my/hands/get',P,{id:900001});assert.equal(full.status,200);const text=JSON.stringify(full.data);assert.ok(!text.includes('Qs'),'a card that was not shown stays hidden');assert.ok(!text.includes('"bot"')&&!text.includes('userId'));
     assert.equal((await call('my/hands/get',await signIn(4),{id:900001})).status,404,'not your hand');
     const stats=await call('my/stats',P,{});assert.equal(stats.status,200);assert.ok(stats.data.hands>=1);assert.ok(stats.data.vpip>=1);assert.equal((await call('my/stats',C,{})).status,403);}
    // A table that fails does not stop the server or the other tables.
    {const C=await signIn(0),bad=runtime.get('1'),good=[...runtime.values()].find(t=>t.id!=='1');const wait=ms=>new Promise(r=>setTimeout(r,ms));
     const offer=bad.waitOffer;Object.defineProperty(bad,'waitOffer',{configurable:true,get(){throw new Error('boom');},set(){}});good.tickFails=0;await wait(5600);
     assert.ok(bad.tickFails>=20,'it keeps being retried');assert.equal(good.tickFails,0);assert.equal((await call('health','')).status,200,'the server is up');
     const alert=(await call('alerts',C,{})).data.alerts.map(a=>a.text).join(' | ');assert.match(alert,/stopped with an error/);assert.match(alert,/boom/);
     delete bad.waitOffer;bad.waitOffer=offer;await wait(400);assert.equal(bad.tickFails,0,'it recovers by itself');}
    // Saving fails: staff are told, money actions stop, and everything is saved once it works.
    {const C=await signIn(0),real=store.commit;const target=(await call('users',C)).data[0].id;store.commit=()=>{throw new Error('disk full');};
     try{assert.equal((await call('rake',C,{percent:6})).status,200,'the change that met the failure stays in memory');
      assert.equal((await call('health','')).status,503);const blocked=await call('transfer',C,{userId:target,direction:'send',amount:1});assert.equal(blocked.status,503);assert.match(blocked.data.error,/not done/);
      assert.equal((await call('login','',{username:'test0',password})).status,200,'staff can still sign in to see why');
      assert.equal((await call('table/1/sit',await signIn(3),{position:5,buyin:20})).status,503);
      assert.match((await call('alerts',await signIn(0),{})).data.alerts[0].text,/cannot be saved/);}
     finally{store.commit=real;}
     const again=await signIn(0);assert.equal((await call('transfer',again,{userId:target,direction:'send',amount:1})).status,200,'it works again at once');assert.equal((await call('health','')).status,200);assert.equal(stored().rakePercent,6,'the earlier change was saved too');await call('rake',again,{percent:5});}
    // One device, one account at a table; another table is fine.
    {const center=await signIn(0),a=await signIn(3),b=await signIn(4),one=(await call('tables/create',center,{name:'Devices',sb:1,bb:2})).data.id,two=(await call('tables/create',center,{name:'Devices two',sb:1,bb:2})).data.id;
     for(const i of ['3','4'])currentDb().users.find(x=>x.id===i).balance+=10000;
     assert.equal((await call('table/'+one+'/sit',a,{position:0,buyin:20,device:'device-aaaa'})).status,200);
     const same=await call('table/'+one+'/sit',b,{position:1,buyin:20,device:'device-aaaa'});assert.equal(same.status,400);assert.match(same.data.error,/this device/);assert.ok(!runtime.get(one).seats[1]);
     // Before an update: no new seats or hands while the running ones finish.
     assert.equal((await call('maintenance',b,{on:true})).status,403);const on=await call('maintenance',center,{on:true});assert.equal(on.data.on,true);
     const wait=await call('table/'+one+'/sit',b,{position:1,buyin:20,device:'device-bbbb'});assert.equal(wait.status,503);assert.match(wait.data.error,/update/);
     assert.equal((await call('table/'+one+'/state',a)).data.restarting,true,'players see that new hands are paused');
     assert.equal((await call('maintenance',center,{on:false})).data.on,false);
     assert.equal((await call('table/'+one+'/sit',b,{position:1,buyin:20,device:'device-bbbb'})).status,200);
     // Profile picture: only from the list, and the table shows it at once.
     assert.equal((await call('profile/avatar',a,{id:'nope'})).status,400);assert.equal((await call('profile/avatar',a,{id:'<script>'})).status,400);assert.equal((await call('profile/avatar',center,{id:'boss'})).status,403);
     assert.equal((await call('state',a)).data.user.avatarAsked,false);assert.equal((await call('profile/avatar',a,{skip:true})).status,200);{const me=(await call('state',a)).data.user;assert.equal(me.avatarAsked,true);assert.equal(me.avatar,null);}
     assert.equal((await call('profile/avatar',a,{id:'boss'})).data.avatar,'boss');assert.equal((await call('state',a)).data.user.avatar,'boss');assert.equal((await call('table/'+one+'/state',b)).data.seats[0].avatar,'boss','the other player sees it');assert.equal((await call('table/'+one+'/state',b)).data.seats[1].avatar,null);
     for(const [id,token] of [[one,a],[one,b]])assert.equal((await call('table/'+id+'/leave',token,{})).status,200);
     assert.equal(runtime.get(two).seats.filter(Boolean).length,0);}
    // Declared bot bonuses move actual platform credit and are visible to the recipient.
    {const C=await signIn(0),P=await signIn(3),A=await signIn(2);
     const table=(await call('tables/create',C,{name:'Declared bonus',sb:1,bb:2})).data.id;
     const made=await call('bots/create',C,{name:'BonusApi',budget:50,tableId:table,buyin:20,risk:'medium',bluffPercent:7,maxHandPercent:60,thinkMinMs:800,thinkMaxMs:2000});
     assert.equal(made.status,200);const id=made.data.id;
     assert.equal((await call('table/'+table+'/sit',P,{position:0,buyin:20})).status,200);
     assert.equal((await call('bots/bonus',P,{id,percent:10})).status,403);
     assert.equal((await call('bots/bonus',A,{id,percent:10})).status,403);
     const before=(await call('state',P)).data.user.balance,centerBefore=(await call('state',C)).data.user.balance;
     const result=await call('bots/bonus',C,{id,percent:10});assert.equal(result.status,200);assert.equal(result.data.amount,5);
     assert.equal((await call('state',P)).data.user.balance,before+5);assert.equal((await call('state',C)).data.user.balance,centerBefore-5);
     const entries=(await call('ledger',P)).data.filter(x=>x.type==='BOT_BONUS');assert.equal(entries.length,1);assert.equal(entries[0].amount,5);assert.equal(entries[0].to,'3');
     assert.equal(stored().users.find(x=>x.id===id).bot.bonusPaid,500,'paid target survives database reload');
     assert.equal((await call('bots/bonus',C,{id,percent:10})).status,400);
     assert.ok((await call('audit',C,{})).data.rows.some(x=>x.action==='bots/bonus'));
     assert.equal((await call('table/'+table+'/leave',P,{})).status,200);
     assert.equal((await call('bots/delete',C,{id})).status,200);
    }
    // The money check: everything adds up, and one cent out of place is caught and kept until the centre confirms.
    {const center=await signIn(0);await call('money/accept',center,{});assert.equal(checkMoney(),true);const s=(await call('maintenance/status',center)).data;assert.equal(s.money.ok,true);assert.ok(s.money.total>0);
     currentDb().users.find(x=>x.id==='3').balance+=1;assert.equal(checkMoney(),false);
     const bad=(await call('maintenance/status',center)).data.money;assert.equal(bad.ok,false);assert.equal(bad.mismatch.difference,0.01);assert.ok((await call('alerts',center,{})).data.alerts.some(a=>/Money check/.test(a.text)));
     currentDb().users.find(x=>x.id==='3').balance-=1;assert.equal(checkMoney(),false,'it stays flagged until the centre has looked');
     assert.equal((await call('money/accept',await signIn(3),{})).status,403);assert.equal((await call('money/accept',center,{})).data.money.ok,true);assert.equal(checkMoney(),true);}
    // Stopping: running hands may finish, no new hands, no new seats, and the state is saved.
    {await shutdown(1500);const before=[...runtime.values()].map(x=>x.hand);for(const x of runtime.values()){for(const s of x.seats)if(s)s.lastSeen=Date.now();x.lastActionAt=0;tickTable(x);}assert.deepEqual([...runtime.values()].map(x=>x.hand),before,'no new hand is dealt');assert.equal((await call('table/1/sit',await signIn(3),{position:5,buyin:20})).status,503);}
    // What is stored is exactly what the game has in memory, after the whole session.
    store.commit(currentDb());assert.deepEqual({...stored(),handSeq:0},{...JSON.parse(JSON.stringify(currentDb())),handSeq:0});
  } finally {for(const stream of live)stream.controller.abort();await new Promise(resolve=>server.close(resolve));await refreshAnalysis();store.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
