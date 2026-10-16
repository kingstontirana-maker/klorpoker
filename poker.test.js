import test from 'node:test';import assert from 'node:assert/strict';import {evaluate,compare,distribute,deck} from './poker.js';
test('secure shuffle makes a complete 52 card deck',()=>{let d=deck();assert.equal(d.length,52);assert.equal(new Set(d).size,52)});
test('straight flush beats quads',()=>assert.ok(compare(evaluate(['9h','Th','Jh','Qh','Kh','2c','3d']),evaluate(['As','Ah','Ad','Ac','2s','3d','4c']))>0));
test('wheel is five-high',()=>assert.deepEqual(evaluate(['As','2h','3d','4c','5s','8c','Th']),[4,5]));
test('flush beats straight',()=>assert.ok(compare(evaluate(['2h','5h','8h','Jh','Kh']),evaluate(['9s','Tc','Jd','Qh','Ks']))>0));
test('side pot allocation and rake cap',()=>{const seats=[{id:'a',position:0,committed:500,folded:false,cards:['As','Ah']},{id:'b',position:1,committed:200,folded:false,cards:['Ks','Kh']},{id:'c',position:2,committed:500,folded:false,cards:['Qs','Qh']}];const r=distribute(seats,['2c','3d','4h','7c','9s'],5,40,true);assert.equal(r.totalRake,40);assert.equal(r.payments.a,1160);assert.equal(r.pots.length,2);});
test('preflop rake is zero under no flop no drop',()=>{const seats=[{id:'a',position:0,committed:200,folded:false,cards:['As','Ah']},{id:'b',position:1,committed:200,folded:true,cards:[]}];assert.equal(distribute(seats,[],5,40,false).totalRake,0)});

test('unmatched all-in chips are returned without rake',()=>{const seats=[{id:'a',position:0,committed:1000,folded:false,cards:['As','Ah']},{id:'b',position:1,committed:200,folded:false,cards:['Ks','Kh']}];const r=distribute(seats,['2c','3d','4h','7c','9s'],5,1000,true);assert.equal(r.totalRake,20);assert.equal(r.payments.a,1180);});

test('kickers decide equal pairs and two pairs',()=>{
 assert.ok(compare(evaluate(['Ah','Kd','As','9c','5d','3h','2c']),evaluate(['Ac','Qd','Ad','9h','5c','3s','2d']))>0);
 assert.ok(compare(evaluate(['Kh','Kd','7s','7c','Ad','3h','2c']),evaluate(['Ks','Kc','7h','7d','Qd','3s','2d']))>0);
 assert.equal(compare(evaluate(['Kh','Kd','7s','7c','Ad','Ah','2c']),evaluate(['Kh','Kd','7s','7c','Ad','As','3c'])),0,'only the best five cards count');
});
test('board-playing hands split the pot',()=>{const board=['As','Ks','Qd','Jc','Th'];const seats=[{id:'a',position:0,committed:300,folded:false,cards:['2c','3d']},{id:'b',position:1,committed:300,folded:false,cards:['4c','5d']}];const r=distribute(seats,board,0,0,true);assert.deepEqual(r.payments,{a:300,b:300});});
test('dead money from an out-of-turn fold goes to the remaining player',()=>{const seats=[{id:'a',position:0,committed:100,folded:false,cards:['2c','3d']},{id:'b',position:1,committed:200,folded:true,cards:['Ac','Ad']},{id:'c',position:2,committed:0,folded:true,cards:[]}];const r=distribute(seats,[],5,100,false);assert.deepEqual(r.payments,{a:300});assert.equal(r.totalRake,0);});
test('a folded blind does not split one contest into two pots',()=>{const seats=[{id:'sb',position:0,committed:100,folded:true,cards:[]},{id:'a',position:1,committed:6000,folded:false,allIn:true,cards:['As','Ad']},{id:'b',position:2,committed:6000,folded:false,cards:['Kh','Kd']}];const r=distribute(seats,['2c','7d','9h','Jc','3s'],0,0,true);assert.equal(r.pots.length,1);assert.deepEqual(r.payments,{a:12100});});
