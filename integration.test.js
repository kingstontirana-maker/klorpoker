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
    const timeoutPlayer=async()=>{
      if(!['preflop','flop','turn','river'].includes(room.phase)){const start=await call('table/1/start',tokens[3],{});assert.ok(start.status===200||['preflop','flop','turn','river'].includes(room.phase),JSON.stringify(start.data));}
      // A timeout folds only when facing a bet; a free option is auto-checked.
      if(room.seats[room.turn].userId==='4')assert.equal((await call('table/1/action',tokens[4],{type:'raise',amount:4})).status,200);
      assert.equal(room.seats[room.turn].userId,'3');
      tickTable(room,room.lastActionAt+30001);
      assert.equal(room.phase,'finished');
      const state=(await call('table/1/state',tokens[3])).data;
      assert.equal(state.seats.find(s=>s?.id==='3').lastAction.type,'AUTO-FOLD');
      return state.seats.find(s=>s?.id==='3').inactiveHands;
    };
    assert.equal(await timeoutPlayer(),1);
    await call('table/1/start',tokens[3],{});
    if(room.seats[room.turn].userId==='4')await call('table/1/action',tokens[4],{type:'call'});
    await call('table/1/action',tokens[3],{type:room.currentBet>room.seats[room.turn].roundBet?'call':'check'});
    assert.equal((await call('table/1/state',tokens[3])).data.seats.find(s=>s?.id==='3').inactiveHands,0);
    await call('table/1/action',tokens[Number(room.seats[room.turn].userId)],{type:'fold'});
    assert.equal(await timeoutPlayer(),1);
    assert.equal(await timeoutPlayer(),2);
    const chips=room.seats.find(s=>s?.userId==='3').stack;
    const before=(await call('state',tokens[3])).data.user.balance;
    const handBefore=room.hand;
    await call('table/1/start',tokens[3],{});
    const removed=(await call('state',tokens[3])).data;
    assert.equal(removed.seatedTableId,null);assert.equal(removed.lastTableExit.reason,'INACTIVE');
    assert.equal(removed.user.balance,before+chips/100);assert.equal(room.hand,handBefore);
  } finally {for(const stream of live)stream.controller.abort();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
