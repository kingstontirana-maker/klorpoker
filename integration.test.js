import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

test('hierarchy, credit gating, rebuy, server timeout and persisted escrow', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'baron-test-'));
  const file=path.join(dir,'state.json');
  const password='TestPassword123!';
  const users=['CENTER','ADMIN','AGENT','USER','USER'].map((role,i)=>({id:String(i),username:'test'+i,role,parentId:i?String(i===4?2:i-1):null,salt:'test-salt',passHash:crypto.scryptSync(password,'test-salt',64).toString('hex'),balance:i===0?100000:0}));
  fs.writeFileSync(file,JSON.stringify({users,rakePercent:5,rakeCap:300,ledger:[],tables:[],nextTable:2}));
  process.env.STATE_FILE=file;process.env.PORT='0';
  const {server,runtime,tickTable}=await import('./server.js');
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const call=async(route,token,body)=>{const r=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(token||''),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
  const live=[];
  try {
    const tokens=[];
    for(let i=0;i<5;i++)tokens.push((await call('login','',{username:'test'+i,password})).data.token);
    assert.equal((await call('rake/events',tokens[3])).status,403);
    assert.equal((await call('rake/events','')).status,401);
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
    assert.equal(JSON.parse(fs.readFileSync(file)).escrow[0].amount,3000);
    assert.equal((await call('ledger',tokens[1])).data.length,2);
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
    const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.users.reduce((n,u)=>n+u.balance,0)+saved.escrow.reduce((n,s)=>n+s.amount,0),100000);
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
    // A missed decision folds (or checks) and sits the player out at once:
    // no further blind is taken until they come back themselves.
    await call('table/1/start',tokens[3],{});
    if(room.seats[room.turn].userId==='4')assert.equal((await call('table/1/action',tokens[4],{type:'raise',amount:4})).status,200);
    assert.equal(room.seats[room.turn].userId,'3');
    tickTable(room,room.lastActionAt+30001);
    assert.equal(room.phase,'finished');
    let mine=(await call('table/1/state',tokens[3])).data;
    assert.equal(mine.seats.find(s=>s?.id==='3').lastAction.type,'AUTO-FOLD');
    assert.equal(mine.sittingOut,true);assert.equal(mine.timedOut,true);
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
    const old=await call('state',tokens[3]);assert.equal(old.status,401);assert.match(old.data.error,/pajisje tjetër/);
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
    const page=await fetch(base+'/');assert.equal(page.headers.get('x-frame-options'),'DENY');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  } finally {for(const stream of live)stream.controller.abort();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
