import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCertainty,certaintyInput,certaintyForPlayer} from './bot-certainty.js';
import {botDecision} from './bots.js';

const base={game:'holdem',cards:['Ah','2c'],board:['As','Ad','Ac'],opponents:1,pot:10000,currentBet:0,toCall:0,minRaiseTo:200,maxRaiseTo:10000,stack:9000,committed:1000,roundBet:0,bb:200,canRaise:true};
const input={game:'holdem',board:base.board,players:[{id:'bot',cards:base.cards},{id:'opponent',cards:['Ks','Qs']}]};

test('strong equity plays while a losing river folds',()=>{
 const result=analyzeCertainty(input),proof=certaintyForPlayer(result,'bot');
 assert.equal(result.outcomes,990);assert.equal(result.exact,true);
 assert.ok(proof.equity>.99&&proof.equity<1);assert.equal(proof.safeToInvest,false);
 assert.ok(result.players[0].witness);
 for(const risk of ['low','medium','high']){
  assert.equal(botDecision(base,risk,()=>0,proof).type,'raise');
  assert.ok(['raise','call'].includes(botDecision({...base,toCall:200,currentBet:200},risk,()=>0,proof).type));
 }
 const turn={...input,board:[...input.board,'Js']};
 assert.equal(certaintyForPlayer(analyzeCertainty(turn),'bot').safeToInvest,false);
 const river={...input,board:[...input.board,'Js','Ts']};
 const beaten=certaintyForPlayer(analyzeCertainty(river),'bot');
 assert.equal(beaten.equity,0);
 assert.equal(botDecision({...base,board:river.board,toCall:200},'low',()=>0,beaten).type,'fold');
});

test('verified winners can invest their entire stack on every street',()=>{
 const locked={board:['Qs','Js','Ts'],players:[{id:'bot',cards:['As','Ks']},{id:'other',cards:['Ah','Ad']}]};
 for(const risk of ['low','medium','high']){
  const flop=certaintyForPlayer(analyzeCertainty(locked),'bot');
  assert.equal(flop.safeToInvest,true);assert.equal(flop.equity,1);
  const view={...base,cards:locked.players[0].cards,board:locked.board};
  const bet=botDecision(view,risk,()=>0,flop);
  assert.equal(bet.type,'raise');assert.ok(bet.amount*100<=view.stack);assert.equal(bet.investmentLimit,10000);
  const capped={...view,stack:8500,committed:1500,toCall:1};
  assert.ok(['raise','call'].includes(botDecision(capped,risk,()=>0,flop).type));
  assert.equal(botDecision({...view,minRaiseTo:600},risk,()=>0,flop).type,'raise');
  assert.equal(botDecision({...view,canRaise:false,toCall:500},risk,()=>0,flop).type,'call');
  assert.equal(botDecision({...view,canRaise:false,toCall:9000},risk,()=>0,flop).type,'call');
  assert.equal(botDecision({...view,canRaise:false,toCall:20000},risk,()=>0,flop).type,'call');
  const riverBoard=[...locked.board,'2d','3d'];
  const river=certaintyForPlayer(analyzeCertainty({...locked,board:riverBoard}),'bot');
  const riverBet=botDecision({...view,board:riverBoard},risk,()=>0,river);
  assert.equal(riverBet.investmentLimit,10000);assert.ok(riverBet.amount*100<=riverBet.remainingInvestment);
  const potLimit=botDecision({...view,game:'omaha',maxRaiseTo:300},risk,()=>0,flop);
  assert.equal(potLimit.amount,3);
 }
});

test('free checks never fold, including worthless and tied hands',()=>{
 for(const chance of [0,.5,1]){
  const d=botDecision({...base,canRaise:false},'low',()=>.5,{exact:true,equity:chance,safeToInvest:false});
  assert.equal(d.type,'check');
 }
});

test('sampled 100 percent and incomplete proofs cannot unlock the stack',()=>{
 for(const proof of [
  {exact:false,equity:1,safeToInvest:true,opponentEquities:[0]},
  {exact:true,equity:1,safeToInvest:true,opponentEquities:[]},
  {exact:true,equity:.5,safeToInvest:false,opponentEquities:[.5]}
 ]){
  const d=botDecision({...base,canRaise:false,toCall:base.stack},'high',()=>0,proof);
  assert.equal(d.type,'fold');assert.equal(d.safeToInvest,false);
 }
});

test('preflop samples probabilities without claiming a guaranteed win',()=>{
 const result=analyzeCertainty({board:[],players:[{id:'a',cards:['As','Ad']},{id:'b',cards:['Ks','Kd']}]});
 assert.equal(result.exact,false);assert.equal(result.outcomes,600);
 assert.ok(result.players[0].equity>.7&&result.players[0].equity<1);
 assert.ok(result.players.every(p=>!p.safeToInvest));
});

test('turn locked wins may go all in while vulnerable leaders cap at 30 percent',()=>{
 const locked={board:['Qs','Js','Ts','2d'],players:[{id:'bot',cards:['As','Ks']},{id:'other',cards:['Ah','Ad']}]};
 const proof=certaintyForPlayer(analyzeCertainty(locked),'bot');
 for(const risk of ['low','medium','high']){
  const rate=1;
  const d=botDecision({...base,cards:locked.players[0].cards,board:locked.board},risk,()=>0,proof);
  assert.equal(d.type,'raise');assert.equal(d.investmentRate,rate);
  assert.equal(d.amount*100,10000*rate-1000);
 }
 const vulnerable={board:['As','7d','2c','9h'],players:[{id:'bot',cards:['Ah','Qd']},{id:'other',cards:['Kh','Kd']}]};
 const p=certaintyForPlayer(analyzeCertainty(vulnerable),'bot');
 assert.equal(p.ahead,true);assert.equal(p.safeToInvest,false);
 const d=botDecision({...base,cards:vulnerable.players[0].cards,board:vulnerable.board},'high',()=>0,p);
 assert.equal(d.type,'raise');assert.equal(d.investmentRate,.3);assert.ok(d.amount*100<=2000);
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
