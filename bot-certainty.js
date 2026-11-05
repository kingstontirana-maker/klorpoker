import {ranks,suits,evaluateHand,compare} from './poker.js';

// Server-only analysis for the virtual-credit experiment. Inspect dealt hands,
// never the shuffled deck order. Folded cards cannot appear on a future board.
export function certaintyInput(t){
 return {game:t.game||'holdem',board:[...t.board],players:t.seats.filter(s=>s?.inHand&&!s.folded).map(s=>({id:s.userId,cards:[...s.cards]})),dead:t.seats.filter(s=>s?.inHand&&s.folded).flatMap(s=>s.cards)};
}

export function analyzeCertainty({game='holdem',board,players,dead=[]}){
 const hole=game==='omaha'?4:2,known=[...board,...players.flatMap(p=>p.cards),...dead],deck=[];
 for(const suit of suits)for(const rank of ranks)deck.push(rank+suit);
 if(!players.length||![0,3,4,5].includes(board.length)||players.some(p=>p.cards.length!==hole)||new Set(known).size!==known.length||known.some(c=>!deck.includes(c)))throw Error('Invalid certainty input');
 if(players.length===1)return {exact:true,outcomes:1,players:[{id:players[0].id,equity:1,safeToInvest:true,witness:null}]};
 const unseen=deck.filter(c=>!known.includes(c)),missing=5-board.length,completed=[...board];
 const stats=players.map(p=>({id:p.id,wins:0,ties:0,losses:0,share:0,witness:null}));let outcomes=0,complete=true;
 function visit(start,depth){
  if(depth===missing){
   const scores=players.map(p=>evaluateHand(game,p.cards,completed));let winners=[0];
   for(let i=1;i<scores.length;i++){const c=compare(scores[i],scores[winners[0]]);if(c>0)winners=[i];else if(c===0)winners.push(i);}
   for(let i=0;i<stats.length;i++){
    const s=stats[i];if(winners.includes(i)){s.share+=1/winners.length;if(winners.length===1)s.wins++;else s.ties++;}else s.losses++;
    if((!winners.includes(i)||winners.length>1)&&!s.witness)s.witness=[...completed];
   }
   outcomes++;
   // Before the flop, one adverse runout per player is sufficient proof that
   // none may invest. Do not label partially counted probabilities as exact.
   return board.length===0&&stats.every(s=>s.witness);
  }
  for(let i=start;i<=unseen.length-(missing-depth);i++){
   completed[board.length+depth]=unseen[i];if(visit(i+1,depth+1))return true;
  }
  return false;
 }
 if(visit(0,0))complete=false;
 return {exact:complete,outcomes,players:stats.map(s=>({id:s.id,equity:complete?s.share/outcomes:null,safeToInvest:complete&&s.wins===outcomes,witness:s.witness}))};
}

export function certaintyForPlayer(result,id){
 const mine=result.players.find(p=>p.id===id);if(!mine)throw Error('Missing certainty player');
 return {exact:result.exact,equity:mine.equity,safeToInvest:mine.safeToInvest,opponentEquities:result.players.filter(p=>p.id!==id).map(p=>p.equity),outcomes:result.outcomes};
}
