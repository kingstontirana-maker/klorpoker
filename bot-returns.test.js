import test from 'node:test';
import assert from 'node:assert/strict';
import {returnBudget,returnDecision} from './bot-returns.js';

test('returns use net profit, exclude funding and reserve unpaid hand exposure',()=>{
 const bot={funded:10000};
 assert.equal(returnBudget(bot,10000,50),0);
 assert.equal(returnBudget(bot,9000,50),0);
 assert.equal(returnBudget(bot,14000,25),1000);
 // 1000 already returned out of 4000 profit: no recursive new entitlement.
 assert.equal(returnBudget({...bot,returned:1000},13000,25),0);
 assert.equal(returnBudget({...bot,returned:1000},17000,25),1000);
 assert.equal(returnBudget({...bot,returnHand:{paid:600}},14000,25),400);
 assert.equal(returnBudget(bot,14000,0),0);
 assert.equal(returnBudget(bot,14000,100),4000);
 // Top-ups raise funded as well as equity, leaving the profit unchanged.
 assert.equal(returnBudget({funded:20000},24000,25),1000);
});

test('return calls vary, stay within earned profit and allow budgeted all-in calls',()=>{
 const v={outcome:'loss',toCall:200,stack:1000,pot:1000};
 assert.equal(returnDecision(v,500,()=>0),true);
 assert.equal(returnDecision(v,500,()=>.99),false);
 assert.equal(returnDecision(v,199,()=>0),false);
 assert.equal(returnDecision({...v,stack:200},500,()=>0),true);
 assert.equal(returnDecision({...v,stack:200},300,()=>0),false,'all-in still respects the 60 percent cap');
 assert.equal(returnDecision({...v,outcome:'unknown'},500,()=>0),false);
 assert.equal(returnDecision({...v,outcome:'win'},500,()=>0),false);
 assert.equal(returnDecision({...v,toCall:0},500,()=>0),false);
});

test('selected losing hand follows 50 cents, 1 euro, then a 50-cent all-in within its cap',()=>{
 const v={outcome:'loss',toCall:50,stack:1000,pot:500};
 assert.equal(returnDecision(v,1000,()=>0),true);
 const hand={paid:50,limit:600};
 assert.equal(returnDecision({...v,toCall:100},950,()=>.99,hand),true);
 hand.paid+=100;
 assert.equal(returnDecision({...v,stack:50},850,()=>.99,hand),true,'last 50 cents can be called all-in');
 assert.equal(returnDecision({...v,stack:50,toCall:200},850,()=>.99,hand),true,'only the effective 50-cent cost is budgeted');
 assert.equal(returnDecision({...v,toCall:451},850,()=>0,hand),false,'the hand cap remains binding');
 assert.equal(returnDecision({...v,stack:0},850,()=>0,hand),false);
});

test('losing calls use at most 60 percent of the available return budget per hand',()=>{
 const v={outcome:'loss',toCall:600,stack:10000,pot:2000};
 assert.equal(returnDecision(v,1000,()=>0),true,'exactly 60 percent is allowed');
 assert.equal(returnDecision({...v,toCall:601},1000,()=>0),false);
 assert.equal(returnDecision({...v,toCall:600},1001,()=>0),true,'round down to whole cents');
 const hand={paid:400,limit:600};
 assert.equal(returnDecision({...v,toCall:200},600,()=>0,hand),true);
 assert.equal(returnDecision({...v,toCall:201},600,()=>0,hand),false,'successive calls share one cap');
 assert.equal(returnDecision({...v,toCall:200},10000,()=>0,hand),true);
 assert.equal(returnDecision({...v,toCall:201},10000,()=>0,hand),false,'later budget growth does not reset the cap');
 assert.equal(returnDecision({...v,toCall:100},99,()=>0,hand),false,'current available budget also applies');
 assert.equal(returnDecision({...v,toCall:1},1000,()=>0,{paid:600,limit:600}),false);
 assert.equal(returnDecision({...v,toCall:1},1,()=>0),false);
});
