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
