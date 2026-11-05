import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCertainty,certaintyInput,certaintyForPlayer} from './bot-certainty.js';
import {botDecision} from './bots.js';

const base={game:'holdem',cards:['Ah','2c'],board:['As','Ad','Ac'],opponents:1,pot:10000,currentBet:0,toCall:0,minRaiseTo:200,maxRaiseTo:10000,stack:9000,committed:1000,roundBet:0,bb:200,canRaise:true};
const input={game:'holdem',board:base.board,players:[{id:'bot',cards:base.cards},{id:'opponent',cards:['Ks','Qs']}]};

test('even quads and over 99 percent equity cannot invest if a runout loses',()=>{
 const result=analyzeCertainty(input),proof=certaintyForPlayer(result,'bot');
 assert.equal(result.outcomes,990);assert.equal(result.exact,true);
 assert.ok(proof.equity>.99&&proof.equity<1);assert.equal(proof.safeToInvest,false);
 assert.ok(result.players[0].witness);
 for(const risk of ['low','medium','high']){
  assert.equal(botDecision(base,risk,()=>0,proof).type,'check');
  assert.equal(botDecision({...base,toCall:200,currentBet:200},risk,()=>0,proof).type,'fold');
 }
 const turn={...input,board:[...input.board,'Js']};
 assert.equal(certaintyForPlayer(analyzeCertainty(turn),'bot').safeToInvest,false);
 const river={...input,board:[...input.board,'Js','Ts']};
 const beaten=certaintyForPlayer(analyzeCertainty(river),'bot');
 assert.equal(beaten.equity,0);
 assert.equal(botDecision({...base,board:river.board,toCall:200},'low',()=>0,beaten).type,'fold');
});

test('locked winning hands can invest within cumulative 15 and 40 percent limits',()=>{
 const locked={board:['Qs','Js','Ts'],players:[{id:'bot',cards:['As','Ks']},{id:'other',cards:['Ah','Ad']}]};
 for(const risk of ['low','medium','high']){
  const flop=certaintyForPlayer(analyzeCertainty(locked),'bot');
  assert.equal(flop.safeToInvest,true);assert.equal(flop.equity,1);
  const view={...base,cards:locked.players[0].cards,board:locked.board};
  const bet=botDecision(view,risk,()=>0,flop);
  assert.equal(bet.type,'raise');assert.equal(bet.amount,5);assert.equal(bet.investmentLimit,1500);
  const capped={...view,stack:8500,committed:1500,toCall:1};
  assert.equal(botDecision(capped,risk,()=>0,flop).type,'fold');
  assert.equal(botDecision({...view,minRaiseTo:600},risk,()=>0,flop).type,'check');
  assert.equal(botDecision({...view,canRaise:false,toCall:500},risk,()=>0,flop).type,'call');
  assert.equal(botDecision({...view,canRaise:false,toCall:501},risk,()=>0,flop).type,'fold');
  const riverBoard=[...locked.board,'2d','3d'];
  const river=certaintyForPlayer(analyzeCertainty({...locked,board:riverBoard}),'bot');
  const riverBet=botDecision({...view,board:riverBoard},risk,()=>0,river);
  assert.equal(riverBet.investmentLimit,4000);assert.equal(riverBet.amount,30);
  const potLimit=botDecision({...view,game:'omaha',maxRaiseTo:300},risk,()=>0,flop);
  assert.equal(potLimit.amount,3);
 }
});

test('ties, missing proof and sampled percentages never permit chips',()=>{
 const tied={board:['As','Ks','Qs','Js','Ts'],players:[{id:'bot',cards:['2c','3d']},{id:'other',cards:['4c','5d']}]};
 const proof=certaintyForPlayer(analyzeCertainty(tied),'bot');
 assert.equal(proof.equity,.5);assert.equal(proof.safeToInvest,false);
 for(const p of [undefined,proof,{exact:false,equity:1,safeToInvest:true,opponentEquities:[0]}]){
  assert.equal(botDecision({...base,board:tied.board,toCall:1},'high',()=>0,p).type,'fold');
  assert.equal(botDecision(base,'high',()=>0,p).type,'check');
 }
});

test('preflop rejects uncertainty using real adverse runouts, without guessed percentages',()=>{
 const result=analyzeCertainty({board:[],players:[{id:'a',cards:['As','Ad']},{id:'b',cards:['Ks','Kd']}]});
 assert.equal(result.exact,false);assert.ok(result.outcomes<1712304);
 assert.ok(result.players.every(p=>!p.safeToInvest&&p.equity===null&&p.witness));
});

test('Omaha uses two hole cards; folded players are excluded and their cards are dead',()=>{
 const t={game:'omaha',board:['As','Ks','Qs','Js','Ts'],deck:['Ah'],seats:[
  {userId:'a',inHand:true,cards:['2c','3c','4c','5c']},
  {userId:'b',inHand:true,cards:['9s','8s','2d','3d']},
  {userId:'c',inHand:true,folded:true,cards:['Ah','Ad','Ac','Kd']}
 ]};
 const data=certaintyInput(t);assert.equal(data.players.length,2);assert.equal(data.dead.length,4);assert.ok(!('deck' in data));
 assert.deepEqual(analyzeCertainty(data).players.map(p=>p.equity),[0,1]);
 assert.throws(()=>analyzeCertainty({...data,dead:['9s']}),/Invalid certainty/);
});

test('an uncontested hand needs no exhaustive preflop enumeration',()=>{
 const result=analyzeCertainty({board:[],players:[{id:'only',cards:['As','Ad']}],dead:['Ks','Kd']});
 assert.equal(result.outcomes,1);assert.equal(result.players[0].safeToInvest,true);
});
