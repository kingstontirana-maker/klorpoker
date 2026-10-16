import test from 'node:test';
import assert from 'node:assert/strict';
import {bestFive,evaluate,distribute} from './poker.js';
import {splitChips,timerState,winningState,freshEvents,betLimits,renderCard,tableGeometry} from './public/table-visuals.js';

test('winning five cards identify the wheel and exclude unrelated kickers',()=>{
 const result=bestFive(['As','2h','3d','4c','9d','5s','Kh']);
 assert.deepEqual(result.score,[4,5]);assert.deepEqual(new Set(result.cards),new Set(['As','2h','3d','4c','5s']));
 assert.deepEqual(evaluate(result.cards),result.score);
});
test('a board-playing winner highlights all five board cards and no hole cards',()=>{
 const board=['Th','Jh','Qh','Kh','Ah'],hand=bestFive([...board,'2c','3d']);
 assert.deepEqual(hand.cards,board);
 const win=winningState({phase:'finished',board,lastResult:{showdown:true,winnerIds:['a'],winningHands:{a:hand}}});
 assert.equal(win.board.size,5);assert.equal(win.cards.has('2c'),false);
});
test('highlight selection follows the selected side-pot winner',()=>{
 const board=['2h','3h','4h','8c','9s'];
 const hands={a:bestFive([...board,'Ah','Kh']),b:bestFive([...board,'8d','8s'])};
 const table={phase:'finished',board,lastResult:{showdown:true,winnerIds:['a','b'],winningHands:hands}};
 assert.equal(winningState(table,'a').hand.rank,'Flush');assert.equal(winningState(table,'b').hand.rank,'Three of a Kind');
 assert.equal(winningState({...table,phase:'flop'},'a').cards.size,0);
});
test('chip denominations conserve the full amount including fractional chips',()=>{
 for(const amount of [.01,.29,1.3,17.42,2681.99,100000])assert.equal(splitChips(amount).reduce((sum,p)=>sum+p.cents*p.count,0),Math.round(amount*100));
 assert.deepEqual(splitChips(-10),[]);assert.deepEqual(splitChips(Infinity),[]);
});
test('timer clamps to the server deadline and enters warning and urgent states',()=>{
 assert.equal(timerState(30000,0).fraction,1);assert.equal(timerState(30000,15000).fraction,.5);
 assert.equal(timerState(30000,21000).warning,true);assert.equal(timerState(30000,26000).urgent,true);
 assert.equal(timerState(30000,31000).seconds,0);assert.equal(timerState(30000,-10000).fraction,1);
});
test('polling repeats do not replay chip movements and old hands are skipped',()=>{
 const events=[{seq:1,hand:1},{seq:2,hand:2},{seq:3,hand:2}];
 assert.deepEqual(freshEvents(events,1,2).map(e=>e.seq),[2,3]);assert.deepEqual(freshEvents(events,3,2),[]);
});
test('incomplete all-in limits disable raise while permitting a short all-in target',()=>{
 const table={currentBet:100,minRaise:50,legalActions:{canRaise:false}};
 assert.deepEqual(betLimits(table,{stack:80,bet:30}),{min:110,max:110,canRaise:false});
 assert.deepEqual(betLimits({...table,legalActions:{canRaise:true}},{stack:80,bet:30}),{min:110,max:110,canRaise:true});
});
test('returned uncalled chips are distinguished from contested pot wins',()=>{
 const seats=[{id:'a',position:0,committed:1000,folded:false,cards:['As','Ah']},{id:'b',position:1,committed:200,folded:false,cards:['Ks','Kh']}];
 const result=distribute(seats,['2c','3d','4h','7c','9s']);assert.equal(result.pots[0].refunded,false);assert.equal(result.pots[1].refunded,true);
});
test('card rendering marks only selected winners and never exposes a hidden code',()=>{
 assert.match(renderCard('Ah',{winning:true}),/winningCard/);assert.match(renderCard('2d',{dim:true}),/dimCard/);
 assert.doesNotMatch(renderCard('BACK'),/data-card=/);
});

test('responsive felt keeps racetrack proportions and stays inside its scene',()=>{
 for(const [width,height,portrait] of [[1440,650,false],[1366,520,false],[1024,460,false],[374,480,true],[304,455,true]]){
  const box=tableGeometry(width,height,portrait);assert.ok(Math.abs(box.width/box.height-(portrait?.9:2.3))<.0001);assert.ok(box.width<=width);assert.ok(box.top>=0);assert.ok(box.top+box.height<=Math.max(height,box.minimumSceneHeight)+.01);assert.ok(box.height>250);
 }
});

test('a short room cannot shrink the felt until JOIN buttons overlap',()=>{
 for(const [width,height,portrait] of [[1440,280,false],[1024,200,false],[844,100,false],[510,160,true],[390,220,true],[320,100,true]]){
  const box=tableGeometry(width,height,portrait);assert.ok(box.width>=Math.min(width-(portrait?52:80),portrait?width-52:900));assert.ok(box.height>=250);assert.ok(box.minimumSceneHeight>height);
 }
});

test('all 52 cards use matching SVG suits and two rank indices',()=>{
 for(const suit of 'cdhs')for(const rank of '23456789TJQKA'){
  const html=renderCard(rank+suit);assert.match(html,new RegExp('data-suit="'+suit+'"'));assert.equal((html.match(/class="cornerArtwork"/g)||[]).length,2);assert.equal((html.match(/class="centerSuit"/g)||[]).length,1);assert.equal((html.match(/<text /g)||[]).length,2);assert.equal(html.includes('face red'),suit==='h'||suit==='d');assert.equal((html.match(/>10<\/text>/g)||[]).length,rank==='T'?2:0);
 }
});

test('hand descriptions, starting hands and pre-actions',async()=>{
 const {describeHand,startingHand,preActionFor}=await import('./public/table-visuals.js');
 assert.equal(describeHand([8,14]),'Royal Flush');assert.equal(describeHand([6,13,7]),'Full House K mbi 7');assert.equal(describeHand([2,12,4,9]),'Dy çifte Q dhe 4');assert.equal(describeHand(null),'');
 assert.equal(startingHand(['Ah','Ad']),'Çift A në dorë');assert.equal(startingHand(['Ts','Ks']),'K-10 me ngjyrë');assert.equal(startingHand(['BACK','BACK']),'');
 assert.equal(preActionFor('checkFold',0),'check');assert.equal(preActionFor('checkFold',2),'fold');assert.equal(preActionFor('call',2),'call');assert.equal(preActionFor('check',2),null);
});

test('seat layout, felt sizing and standard bet sizes',async()=>{
 const {seatLayout,feltBox,betPresets}=await import('./public/table-visuals.js');
 for(const portrait of [false,true]){const l=seatLayout(portrait);assert.equal(l.seats.length,6);assert.deepEqual(l.seats[3],[50,100],'the local player sits bottom centre');assert.equal(l.bets.length,6);assert.equal(l.dealer.length,6);}
 const wide=feltBox(1300,560,false);assert.ok(Math.abs(wide.width/wide.height-2.1)<1e-9);assert.ok(wide.top+wide.height<=560);
 const phone=feltBox(375,520,true);assert.ok(phone.width<=375-100);assert.ok(phone.height>phone.width);
 const tiny=feltBox(360,300,true);assert.ok(tiny.width>=260,'a short phone scrolls instead of shrinking the table');assert.ok(tiny.minStage>300);
 const pre={phase:'preflop',bb:2,currentBet:2,minRaise:2,pot:3,legalActions:{canRaise:true}},me={stack:100,bet:0};
 assert.deepEqual(betPresets(pre,me).map(p=>[p.label,p.value]),[['2.5×',5],['3×',6],['4×',8],['Pot',7]]);
 const flop={phase:'flop',bb:2,currentBet:0,minRaise:2,pot:30,legalActions:{canRaise:true}};
 assert.deepEqual(betPresets(flop,me).map(p=>p.value),[10,15,22.5,30]);
 assert.deepEqual(betPresets({...flop,legalActions:{canRaise:false}},me),[]);
 assert.ok(betPresets(flop,{stack:12,bet:0}).every(p=>p.value<=12),'sizes never exceed the stack');
});
