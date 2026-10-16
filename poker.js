import { randomInt } from 'node:crypto';
export const ranks='23456789TJQKA';
export const suits='cdhs';
export function deck(){const a=[];for(const s of suits)for(const r of ranks)a.push(r+s);for(let i=a.length-1;i>0;i--){let j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
const combos=(a,k)=>{if(k===0)return [[]];if(a.length<k)return [];return combos(a.slice(1),k-1).map(c=>[a[0],...c]).concat(combos(a.slice(1),k));};
const straightHigh=values=>{const u=[...new Set(values)].sort((a,b)=>b-a);if(u.includes(14))u.push(1);for(let i=0;i<=u.length-5;i++)if(u[i]-u[i+4]===4)return u[i];return 0;};
export function score5(cards){const nums=cards.map(c=>ranks.indexOf(c[0])+2), suit=cards.map(c=>c[1]);const count={};for(const x of nums)count[x]=(count[x]||0)+1;const groups=Object.entries(count).map(([r,n])=>({r:+r,n})).sort((a,b)=>b.n-a.n||b.r-a.r);const order=[...nums].sort((a,b)=>b-a);const flush=suit.every(s=>s===suit[0]);const straight=straightHigh(nums);
 if(flush&&straight)return [8,straight];if(groups[0].n===4)return [7,groups[0].r,groups[1].r];if(groups[0].n===3&&groups[1].n===2)return[6,groups[0].r,groups[1].r];if(flush)return[5,...order];if(straight)return[4,straight];if(groups[0].n===3)return[3,groups[0].r,...groups.slice(1).map(g=>g.r).sort((a,b)=>b-a)];if(groups[0].n===2&&groups[1].n===2)return[2,Math.max(groups[0].r,groups[1].r),Math.min(groups[0].r,groups[1].r),groups[2].r];if(groups[0].n===2)return[1,groups[0].r,...groups.slice(1).map(g=>g.r).sort((a,b)=>b-a)];return[0,...order];}
export function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){let d=(a[i]??0)-(b[i]??0);if(d)return Math.sign(d);}return 0;}
export function evaluate(cards){if(cards.length<5)throw Error('Need at least five cards');let best=null;for(const c of combos(cards,5)){const s=score5(c);if(!best||compare(s,best)>0)best=s;}return best;}
// Keep the first equally strong combination. Passing board cards first makes
// a board-playing hand highlight the board instead of an arbitrary hole card.
export function bestFive(cards){if(cards.length<5)throw Error('Need at least five cards');let best=null,selected=[];for(const c of combos(cards,5)){const score=score5(c);if(!best||compare(score,best)>0){best=score;selected=c;}}return {cards:selected,score:best,rank:rankNames[best[0]]};}
export const rankNames=['High Card','One Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
export function distribute(seats,board,rakePercent=0,rakeCap=Infinity,flopSeen=true){
 const eligible=seats.filter(s=>s.committed>0),levels=[...new Set(eligible.map(s=>s.committed))].sort((a,b)=>a-b),alive=seats.filter(s=>!s.folded);
 let prev=0,totalRake=0,taxableTotal=0;
 const payments={},rakeContributions={},pots=[];
 for(const level of levels){
  const contributors=eligible.filter(s=>s.committed>=level);
  let amount=(level-prev)*contributors.length;prev=level;if(!amount)continue;
  // Chips above every live player's contribution (a player folded out of turn)
  // are dead money for the players still in the hand.
  let candidates=contributors.filter(s=>!s.folded);const dead=!candidates.length;if(dead)candidates=alive;if(!candidates.length)throw Error('No winner available');
  // Round once against cumulative contested chips, not separately per side pot.
  if(flopSeen&&(contributors.length>1||dead))taxableTotal+=amount;
  const target=Math.min(Math.floor(taxableTotal*rakePercent/100+1e-9),rakeCap);
  const rake=Math.max(0,Math.min(amount,target-totalRake));totalRake+=rake;
  if(rake){const ordered=[...contributors].sort((a,b)=>a.position-b.position);ordered.forEach((s,i)=>{rakeContributions[s.id]=(rakeContributions[s.id]||0)+Math.floor(rake/ordered.length)+(i<rake%ordered.length?1:0);});}
  amount-=rake;
  // Adjacent levels contested by the same players form one pot.
  const key=candidates.map(s=>s.id).sort().join()+(contributors.length===1&&!dead?':refund':'');
  const last=pots.at(-1);if(last&&last.key===key){last.amount+=amount;last.rake+=rake;}else pots.push({key,amount,rake,candidates,refunded:contributors.length===1&&!dead});
 }
 for(const pot of pots){
  let winners=[];
  if(pot.candidates.length===1)winners=pot.candidates;
  else{let best=null;for(const s of pot.candidates){const sc=evaluate([...s.cards,...board]);if(!best||compare(sc,best)>0){best=sc;winners=[s];}else if(compare(sc,best)===0)winners.push(s);}}
  const each=Math.floor(pot.amount/winners.length),extra=pot.amount%winners.length;
  winners.sort((a,b)=>a.position-b.position);winners.forEach((w,i)=>payments[w.id]=(payments[w.id]||0)+each+(i<extra?1:0));
  pot.winners=winners.map(w=>w.id);delete pot.key;delete pot.candidates;
 }
 return {payments,pots,totalRake,rakeContributions};
}
