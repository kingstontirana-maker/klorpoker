import test from 'node:test';
import assert from 'node:assert/strict';
import {botClashView,botDecision} from './bots.js';

test('bot clashes exclude every active human, including all-ins and unknown IDs',()=>{
 const isBot=id=>id==='bot';
 const view=opponents=>botClashView({opponents},isBot);
 assert.equal(view([{id:'bot'},{id:'human'}]).botClash,'off');
 assert.equal(view([{id:'bot'},{id:'human',allIn:true}]).botClash,'off');
 assert.equal(view([{id:'bot'},{id:'unknown'}]).botClash,'off');
 assert.equal(view([{id:'bot'},{id:'human',folded:true}]).botClash,'balanced');
 assert.equal(view([{id:'bot',allIn:true}]).botClash,'balanced');
 assert.equal(view([]).botClash,'off');
 assert.equal(botClashView({opponents:[{id:'bot'}]},isBot,'off').botClash,'off');
});

test('clashes contest losing hands and respect raise limits',()=>{
 const v={botClash:'aggressive',outcome:'loss',phase:'flop',toCall:200,stack:2000,roundBet:0,currentBet:200,minRaiseTo:400,maxRaiseTo:700,bb:100,pot:1000,canRaise:true};
 assert.equal(botDecision(v,'medium',()=>.9).type,'call');
 const d=botDecision(v,'medium',()=>0);
 assert.equal(d.type,'raise');
 assert.ok(d.amount>=4&&d.amount<=7);
 assert.equal(botDecision({...v,canRaise:false},'medium',()=>0).type,'call');
 assert.equal(botDecision({...v,botClash:'off'},'medium',()=>.9).type,'fold');
});

test('the clash cap: a bot alone with bots never puts more than half the cap into the hand',()=>{
 const isBot=id=>id==='bot';
 assert.equal(botClashView({opponents:[{id:'bot'}],bb:20},isBot,'balanced',10).clashCap,100,'10 BB of €0.20 → €1 for each bot');
 assert.equal(botClashView({opponents:[{id:'bot'}],bb:20},isBot,'balanced',0).clashCap,0,'0 = no cap');
 const v={botClash:'aggressive',clashCap:100,phase:'flop',toCall:20,stack:2000,roundBet:0,committed:40,currentBet:20,minRaiseTo:40,maxRaiseTo:2000,bb:20,pot:100,canRaise:true};
 const d=botDecision(v,'medium',()=>0);assert.equal(d.type,'raise');assert.ok(d.amount*100<=60,'raise only up to the room left: '+d.amount);
 assert.equal(botDecision({...v,committed:100},'medium',()=>0).type,'call','at the cap: no more raises, only call');
 assert.equal(botDecision({...v,clashCap:0},'medium',()=>0).amount>0.6,true,'without a cap the raise is bigger');
});
