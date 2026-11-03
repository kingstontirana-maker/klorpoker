import {evaluateHand,ranks,suits} from './poker.js';

const pack=score=>{let n=0;for(let i=0;i<6;i++)n=n*15+(score[i]||0);return n;};
const straight=mask=>{for(let high=14;high>=6;high--)if((mask&(31<<(high-4)))===(31<<(high-4)))return high;return (mask&16444)===16444?5:0;};

// Evaluate seven Hold'em cards directly; exhaustive preflop enumeration would
// otherwise evaluate 21 five-card combinations for every player and runout.
export function holdemScore(cards){
 const counts=new Uint8Array(15),suitCounts=new Uint8Array(4),masks=new Uint16Array(4);let mask=0;
 for(const card of cards){const rank=card%13+2,suit=Math.floor(card/13);counts[rank]++;suitCounts[suit]++;masks[suit]|=1<<rank;mask|=1<<rank;}
 const top=(source,n,exclude=[])=>{const out=[];for(let r=14;r>=2&&out.length<n;r--)if(source[r]&&!exclude.includes(r))out.push(r);return out;};
 let flush=-1;for(let i=0;i<4;i++)if(suitCounts[i]>=5)flush=i;
 if(flush>=0){const high=straight(masks[flush]);if(high)return pack([8,high]);}
 const four=[],three=[],pairs=[];
 for(let r=14;r>=2;r--){if(counts[r]===4)four.push(r);else if(counts[r]===3)three.push(r);else if(counts[r]===2)pairs.push(r);}
 if(four.length)return pack([7,four[0],...top(counts,1,four)]);
 if(three.length&&(pairs.length||three.length>1))return pack([6,three[0],Math.max(pairs[0]||0,three[1]||0)]);
 if(flush>=0){const rs=[];for(let r=14;r>=2&&rs.length<5;r--)if(masks[flush]&(1<<r))rs.push(r);return pack([5,...rs]);}
 const high=straight(mask);if(high)return pack([4,high]);
 if(three.length)return pack([3,three[0],...top(counts,2,three)]);
 if(pairs.length>1)return pack([2,pairs[0],pairs[1],...top(counts,1,pairs.slice(0,2))]);
 if(pairs.length)return pack([1,pairs[0],...top(counts,3,pairs)]);
 return pack([0,...top(counts,5)]);
}

// Server-only input. Folded hands are dead cards, never contenders. The actual
// shuffled deck and future dealt board are deliberately not part of this input.
export function tableEquityInput(t){
 return {game:t.game||'holdem',board:[...t.board],players:t.seats.filter(s=>s?.inHand&&!s.folded).map(s=>({id:s.userId,cards:[...s.cards]})),dead:t.seats.filter(s=>s?.inHand&&s.folded).flatMap(s=>s.cards)};
}

export function exactTableEquity({game='holdem',board,players,dead=[]}){
 const hole=game==='omaha'?4:2,all=[...board,...players.flatMap(p=>p.cards),...dead],valid=new Set();
 for(const s of suits)for(const r of ranks)valid.add(r+s);
 if(![0,3,4,5].includes(board.length)||!players.length||players.some(p=>p.cards.length!==hole)||new Set(all).size!==all.length||all.some(c=>!valid.has(c)))throw Error('Invalid exact equity input');
 const known=new Set(all),deck=[...valid].filter(c=>!known.has(c)),missing=5-board.length,shares=players.map(()=>0);
 const encode=c=>suits.indexOf(c[1])*13+ranks.indexOf(c[0]);
 const hands=players.map(p=>p.cards.map(encode)),completed=[...board],encodedBoard=board.map(encode),encodedDeck=deck.map(encode);let outcomes=0;
 function visit(start,depth){
  if(depth===missing){
   const scores=players.map((p,i)=>game==='omaha'?pack(evaluateHand(game,p.cards,completed)):holdemScore([...hands[i],...encodedBoard]));
   let best=-1,winners=[];for(let i=0;i<scores.length;i++){if(scores[i]>best){best=scores[i];winners=[i];}else if(scores[i]===best)winners.push(i);}
   for(const i of winners)shares[i]+=1/winners.length;outcomes++;return;
  }
  for(let i=start;i<=deck.length-(missing-depth);i++){completed[board.length+depth]=deck[i];encodedBoard[board.length+depth]=encodedDeck[i];visit(i+1,depth+1);}
 }
 visit(0,0);
 return {players:players.map((p,i)=>({id:p.id,equity:shares[i]/outcomes})),outcomes,exact:true};
}

export function playerEquity(result,id){
 const mine=result.players.find(p=>p.id===id);if(!mine)throw Error('Player missing from exact equity');
 return {equity:mine.equity,opponentEquities:result.players.filter(p=>p.id!==id).map(p=>p.equity),opponentsEquity:1-mine.equity,iterations:result.outcomes,exact:true};
}
