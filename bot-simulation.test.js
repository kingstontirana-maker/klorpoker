import test from 'node:test';
import assert from 'node:assert/strict';
import {runSimulation,simulationConfig,simulationAction,seededRandom} from './public/bot-simulation.js';
import {compare,evaluateHand} from './poker.js';

test('offline hands conserve credits, use distinct cards and settle by poker ranking',()=>{
 for(const style of ['low','medium','high'])for(const seed of [0,7,42]){
  const r=runSimulation({hands:60,seed,style,botBudget:200,playerBudget:400,targetReturnPercent:35});
  assert.equal(r.mode,'OFFLINE_SIMULATION');assert.equal(r.initial,r.final);
  assert.equal(r.bot.balance+r.players.reduce((n,p)=>n+p.balance,0)+r.rake,r.initial);
  assert.ok(r.bot.balance>=0&&r.players.every(p=>p.balance>=0));
  assert.equal(r.players.reduce((n,p)=>n+p.bonus,0),r.bonus);
  assert.equal(r.actualReturn,r.returnedFromPlay+r.bonus);
  assert.equal(r.unmetTarget,Math.max(0,r.target-r.actualReturn));
  for(const h of r.history){
   assert.equal(new Set([...h.botCards,...h.playerCards,...h.board]).size,9);
   const comparison=compare(evaluateHand('holdem',h.botCards,h.board),evaluateHand('holdem',h.playerCards,h.board));
   assert.equal(h.winner,comparison>0?'sim-bot':comparison<0?h.player:'split');
   assert.equal(h.rake,Math.floor(h.contribution*2*r.config.rakePercent/100+1e-9));
   assert.deepEqual(h.decisions.map(d=>d.board.length),[0,3,4,5]);
  }
 }
});

test('return targets only affect the disclosed transfer after the same hands',()=>{
 const a=runSimulation({hands:12,targetReturnPercent:0,seed:8});
 const b=runSimulation({hands:12,targetReturnPercent:100,seed:8});
 assert.deepEqual(a.history,b.history);assert.equal(a.rake,b.rake);assert.equal(a.returnedFromPlay,b.returnedFromPlay);
 assert.equal(a.bonus,0);assert.ok(b.bonus>0);assert.equal(b.actualReturn,b.target);
 assert.equal(a.bot.balance-b.bot.balance,b.bonus);
 assert.equal(a.players.reduce((n,p)=>n+p.balance,0)+b.bonus,b.players.reduce((n,p)=>n+p.balance,0));
});

test('simulation is repeatable and different seeds vary the cards and decisions',()=>{
 const input={hands:30,seed:13};assert.deepEqual(runSimulation(input),runSimulation(input));
 assert.notDeepEqual(runSimulation(input).history,runSimulation({...input,seed:14}).history);
});

test('styles vary aggression and decisions have no hidden-card input',()=>{
 const view={cards:['7h','2c'],board:['As','Kd','9s'],pot:500,blind:100};
 const counts={};
 for(const style of ['low','medium','high']){
  const random=seededRandom(23);let raises=0,bluffs=0;const timings=new Set();
  for(let i=0;i<1000;i++){
   const d=simulationAction({...view,style},random);if(d.type==='raise')raises++;if(d.bluff)bluffs++;timings.add(d.thinkMs);
   assert.ok(d.thinkMs>=1200&&d.thinkMs<=3500);
  }
  counts[style]={raises,bluffs};assert.ok(timings.size>100);
 }
 assert.ok(counts.high.raises>counts.medium.raises&&counts.medium.raises>counts.low.raises);
 assert.ok(counts.high.bluffs>counts.low.bluffs);
 const a=simulationAction({...view,style:'medium'},seededRandom(4));
 const b=simulationAction({...view,style:'medium',opponentCards:['Ah','Ad'],futureBoard:['Ac','Ks']},seededRandom(4));
 assert.deepEqual(a,b);
});

test('insufficient credit stops play; no target creates credit or a negative balance',()=>{
 const r=runSimulation({hands:2000,botBudget:.01,playerBudget:.01,blind:.01,rakePercent:20,targetReturnPercent:100});
 assert.ok(r.played<2000);assert.equal(r.initial,r.final);assert.ok(r.bot.balance>=0);
 assert.equal(r.actualReturnPercent,r.actualReturn/r.config.botCents*100);
 const free=runSimulation({hands:15,rakePercent:0});assert.equal(free.rake,0);
});

test('invalid test controls are rejected before simulation',()=>{
 for(const input of [{hands:0},{hands:2001},{hands:1.5},{players:0},{players:9},{rakePercent:21},{targetReturnPercent:101},{targetReturnPercent:-1},{botBudget:Infinity},{botBudget:.001},{blind:1001},{style:'unknown'},{style:'toString'},{seed:NaN},{seed:-1},{botBudget:'1000'}])assert.throws(()=>simulationConfig(input));
});
