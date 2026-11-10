import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCertainty,certaintyInput,futureBoard} from './bot-certainty.js';

test('future board follows pop order and burn cards on every street without mutation',()=>{
 const full=['Qs','Js','Ts','2d','3d'];
 const deck=['3d','5c','2d','6c','Ts','Js','Qs','7c'];
 for(const [board,remaining] of [[[],deck],[full.slice(0,3),deck.slice(0,4)],[full.slice(0,4),deck.slice(0,2)],[full,[]]]){
  const t={board:[...board],deck:[...remaining]},before=structuredClone(t);
  assert.deepEqual(futureBoard(t),full);assert.deepEqual(t,before);
 }
});

test('preflop samples probabilities without claiming a guaranteed win',()=>{
 const result=analyzeCertainty({board:[],players:[{id:'a',cards:['As','Ad']},{id:'b',cards:['Ks','Kd']}]});
 assert.equal(result.exact,false);assert.equal(result.outcomes,600);
 assert.ok(result.players[0].equity>.7&&result.players[0].equity<1);
 assert.ok(result.players.every(p=>!p.safeToInvest));
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
