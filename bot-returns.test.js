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

test('return calls vary, stay within earned profit and never raise or go all-in',()=>{
 const v={outcome:'loss',toCall:200,stack:1000,pot:1000};
 assert.equal(returnDecision(v,500,()=>0),true);
 assert.equal(returnDecision(v,500,()=>.99),false);
 assert.equal(returnDecision(v,199,()=>0),false);
 assert.equal(returnDecision({...v,stack:200},500,()=>0),false);
 assert.equal(returnDecision({...v,outcome:'unknown'},500,()=>0),false);
 assert.equal(returnDecision({...v,outcome:'win'},500,()=>0),false);
 assert.equal(returnDecision({...v,toCall:0},500,()=>0),false);
});
