import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateHand,compare,ranks,suits} from './poker.js';
import {exactTableEquity,holdemScore,playerEquity,tableEquityInput} from './exact-equity.js';
import {calculateTableEquity} from './equity-service.js';
import {botDecision} from './bots.js';

test('fast evaluator matches reference Holdem evaluation including wheels',()=>{
 let seed=71;const random=()=>(seed=(seed*1664525+1013904223)>>>0)/4294967296;
 const deck=Array.from({length:52},(_,i)=>i),decode=i=>ranks[i%13]+suits[Math.floor(i/13)];
 const pack=s=>{let n=0;for(let i=0;i<6;i++)n=n*15+(s[i]||0);return n;};
 for(let n=0;n<1500;n++){
  for(let i=0;i<7;i++){const j=i+Math.floor(random()*(52-i));[deck[i],deck[j]]=[deck[j],deck[i]];}
  const cards=deck.slice(0,7),text=cards.map(decode);
  assert.equal(holdemScore(cards),pack(evaluateHand('holdem',text.slice(0,2),text.slice(2))));
 }
 const wheel=['As','2s','3s','4s','5s','Kd','Qh'];
 assert.equal(holdemScore(wheel.map(c=>suits.indexOf(c[1])*13+ranks.indexOf(c[0]))),pack([8,5]));
});

test('exact turn probabilities count every possible river and dead cards',()=>{
 const input={board:['2h','3h','4c','9s'],players:[{id:'a',cards:['Ah','Kh']},{id:'b',cards:['9d','9c']}],dead:['Qh','Jh']};
 const result=exactTableEquity(input),known=new Set([...input.board,...input.players.flatMap(p=>p.cards),...input.dead]);
 let wins=0,total=0;
 for(const suit of suits)for(const rank of ranks){const card=rank+suit;if(known.has(card))continue;
  const board=[...input.board,card],c=compare(evaluateHand('holdem',input.players[0].cards,board),evaluateHand('holdem',input.players[1].cards,board));
  wins+=c>0?1:c===0?.5:0;total++;
 }
 assert.equal(result.outcomes,42);assert.equal(result.players[0].equity,wins/total);
 assert.ok(Math.abs(result.players.reduce((n,p)=>n+p.equity,0)-1)<1e-12);
 assert.deepEqual(exactTableEquity(input),result);
});

test('preflop enumeration covers all runouts for actual pocket pairs',async()=>{
 const result=await calculateTableEquity({board:[],players:[{id:'a',cards:['As','Ad']},{id:'b',cards:['Ks','Kd']}]});
 assert.equal(result.outcomes,1712304);
 assert.ok(Math.abs(result.players[0].equity-.826366112559452)<1e-12);
});

test('actual opponent hands change river decisions and the 40 percent budget',()=>{
 const input={board:['Ah','Kd','Qc','7s','2h'],players:[{id:'bot',cards:['As','Jc']},{id:'human',cards:['Ks','Td']}]};
 const view={game:'holdem',cards:input.players[0].cards,board:input.board,opponents:1,pot:10000,currentBet:500,toCall:500,minRaiseTo:1000,maxRaiseTo:10000,stack:10000,roundBet:0,committed:0,bb:200,canRaise:true};
 const win=botDecision(view,'low',()=>.5,playerEquity(exactTableEquity(input),'bot'));
 assert.equal(win.equity,1);assert.equal(win.investmentRate,.4);assert.equal(win.type,'raise');assert.ok(win.amount<=40);
 input.players[1].cards=['Kh','Kc'];
 const lose=botDecision(view,'low',()=>.5,playerEquity(exactTableEquity(input),'bot'));
 assert.equal(lose.equity,0);assert.equal(lose.investmentRate,.15);assert.equal(lose.type,'fold');
});

test('exact ties split equity and Omaha uses exactly two hole cards',()=>{
 const tied=exactTableEquity({board:['As','Ks','Qs','Js','Ts'],players:[{id:'a',cards:['2c','3c']},{id:'b',cards:['4d','5d']}]});
 assert.deepEqual(tied.players.map(p=>p.equity),[.5,.5]);assert.equal(tied.outcomes,1);
 const omaha=exactTableEquity({game:'omaha',board:['As','Ks','Qs','Js','Ts'],players:[{id:'a',cards:['2c','3c','4c','5c']},{id:'b',cards:['9s','8s','2d','3d']}]});
 assert.deepEqual(omaha.players.map(p=>p.equity),[0,1]);
});

test('worker returns exact results, rejects malformed input, and recovers',async()=>{
 const input={board:['Ah','Kd','Qc','7s','2h'],players:[{id:'a',cards:['As','Jc']},{id:'b',cards:['Ks','Td']}]};
 assert.deepEqual(await calculateTableEquity(input),exactTableEquity(input));
 await assert.rejects(calculateTableEquity({...input,dead:['As']}),/Invalid/);
 assert.deepEqual(await calculateTableEquity(input),exactTableEquity(input));
});

test('server input excludes deck order and includes folded hands only as dead cards',()=>{
 const t={game:'holdem',board:['2c','3c','4c'],deck:['As'],seats:[{userId:'a',inHand:true,cards:['Ah','Ad']},{userId:'b',inHand:true,folded:true,cards:['Kh','Kd']},{userId:'c',inHand:true,cards:['Qh','Qd']}]};
 const input=tableEquityInput(t);
 assert.deepEqual(input.players.map(p=>p.id),['a','c']);assert.deepEqual(input.dead,['Kh','Kd']);
 t.deck.reverse();assert.deepEqual(tableEquityInput(t),input);assert.ok(!JSON.stringify(input).includes('As'));
});
