// Offline test credits only. No API, account, storage or live bot imports.
import {ranks,suits,evaluateHand,compare,distribute} from './poker-core.js';

const styles={low:{bet:.35,bluff:.03,size:.35},medium:{bet:.6,bluff:.09,size:.6},high:{bet:.8,bluff:.18,size:.9}};
export function seededRandom(seed){let n=seed>>>0;return ()=>{n=(n+0x6D2B79F5)|0;let x=Math.imul(n^(n>>>15),1|n);x^=x+Math.imul(x^(x>>>7),61|x);return ((x^(x>>>14))>>>0)/4294967296;};}
function range(value,min,max,name,integer=false){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw Error('Invalid '+name);return value;}
function amount(value,name){range(value,.01,1000000,name);const cents=Math.round(value*100);if(Math.abs(cents-value*100)>.00001)throw Error(name+' needs at most two decimals');return cents;}
export function simulationConfig(input={}){
 const c={hands:200,players:3,botBudget:1000,playerBudget:1000,blind:1,rakePercent:5,targetReturnPercent:20,style:'medium',seed:42,...input};
 range(c.hands,1,2000,'hands',true);range(c.players,1,8,'players',true);range(c.rakePercent,0,20,'rake');range(c.targetReturnPercent,0,100,'target return');range(c.seed,0,4294967295,'seed',true);
 if(!Object.hasOwn(styles,c.style))throw Error('Invalid style');
 c.botCents=amount(c.botBudget,'bot budget');c.playerCents=amount(c.playerBudget,'player budget');c.blindCents=amount(c.blind,'blind');
 if(c.blindCents>Math.min(c.botCents,c.playerCents))throw Error('Blind exceeds starting credits');
 return c;
}
function shuffled(random){const cards=[...suits].flatMap(s=>[...ranks].map(r=>r+s));for(let i=cards.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
// Decisions receive only their own hole cards and the board revealed so far.
export function simulationAction({cards,board,pot,blind,style='medium'},random){
 const p=styles[style];if(!p)throw Error('Invalid style');
 const values=cards.map(c=>ranks.indexOf(c[0])+2);
 const strength=board.length>=3?Math.min(1,.12+evaluateHand('holdem',cards,board)[0]*.17):(values[0]===values[1]?.65+values[0]/45:(values[0]+values[1])/38);
 const bluff=strength<.35&&random()<p.bluff;
 const raise=bluff||random()<p.bet*(.35+strength);
 return {type:raise?'raise':'check',amount:raise?Math.max(blind,Math.round(pot*p.size*(.7+random()*.6))):0,bluff,thinkMs:Math.round(1200+random()*2300)};
}
export function runSimulation(input={}){
 const config=simulationConfig(input),random=seededRandom(config.seed),bot={id:'sim-bot',balance:config.botCents};
 const players=Array.from({length:config.players},(_,i)=>({id:'sim-player-'+(i+1),balance:config.playerCents,bonus:0,hands:0}));
 let rake=0,returnedFromPlay=0,played=0;const history=[],actions={check:0,call:0,raise:0,bluff:0};
 for(let hand=1;hand<=config.hands;hand++){
  const candidates=players.filter(p=>p.balance>=config.blindCents);
  if(bot.balance<config.blindCents||!candidates.length)break;
  const player=candidates[(hand-1)%candidates.length],deck=shuffled(random),botCards=deck.splice(0,2),playerCards=deck.splice(0,2),board=[];
  let contribution=config.blindCents;const decisions=[];
  bot.balance-=contribution;player.balance-=contribution;
  for(const street of ['preflop','flop','turn','river']){
   if(street!=='preflop'){deck.shift();board.push(...deck.splice(0,street==='flop'?3:1));}
   const opponentBet=random()<.5;
   const decision=simulationAction({cards:botCards,board:[...board],pot:contribution*2,blind:config.blindCents,style:config.style},random);
   let requested=decision.amount;
   if(opponentBet){requested=Math.max(requested,Math.round(config.blindCents*(1+random()*3)));if(decision.type==='check')decision.type='call';}
   const paid=Math.min(requested,bot.balance,player.balance);
   if(!paid){decision.type='check';decision.bluff=false;}
   bot.balance-=paid;player.balance-=paid;contribution+=paid;
   actions[decision.type]++;if(decision.bluff&&paid)actions.bluff++;
   decisions.push({street,action:decision.type,bluff:decision.bluff&&paid>0,paid,thinkMs:decision.thinkMs,board:[...board]});
  }
  const result=distribute([{id:bot.id,position:0,cards:botCards,committed:contribution,folded:false},{id:player.id,position:1,cards:playerCards,committed:contribution,folded:false}],board,config.rakePercent,Infinity,true,'holdem');
  bot.balance+=result.payments[bot.id]||0;player.balance+=result.payments[player.id]||0;rake+=result.totalRake;
  const comparison=compare(evaluateHand('holdem',botCards,board),evaluateHand('holdem',playerCards,board));
  // Track the bot's net contribution to a player's winning pot after the bot's rake share.
  const botRake=result.rakeContributions[bot.id]||0;
  if(comparison<0)returnedFromPlay+=Math.max(0,contribution-botRake);
  player.hands++;played++;
  if(history.length===50)history.shift();
  history.push({hand,player:player.id,botCards,playerCards,board:[...board],winner:comparison>0?bot.id:comparison<0?player.id:'split',contribution,rake:result.totalRake,decisions});
 }
 const target=Math.round(config.botCents*config.targetReturnPercent/100),needed=Math.max(0,target-returnedFromPlay),bonus=Math.min(bot.balance,needed);
 // A separately disclosed test-credit transfer, never a changed deal or winner.
 bot.balance-=bonus;
 const each=Math.floor(bonus/players.length),remainder=bonus%players.length;
 players.forEach((p,i)=>{p.bonus=each+(i<remainder?1:0);p.balance+=p.bonus;});
 const initial=config.botCents+config.playerCents*players.length,final=bot.balance+players.reduce((n,p)=>n+p.balance,0)+rake;
 if(initial!==final)throw Error('Simulation credit conservation failed');
 return {mode:'OFFLINE_SIMULATION',units:'virtual cents',model:'Simplified heads-up Holdem: rotating simulated opponents, matched wagers, no folds or side pots.',config,played,bot,players,rake,returnedFromPlay,bonus,target,actualReturn:returnedFromPlay+bonus,actualReturnPercent:(returnedFromPlay+bonus)/config.botCents*100,unmetTarget:Math.max(0,target-returnedFromPlay-bonus),initial,final,actions,history};
}
