// The house bots' poker brain. It decides only from what any player at the table knows:
// its own cards, the board, the stacks, the pot and the actions everybody saw. Opponents'
// cards and the cards still in the deck are never an input, so a bot can win or lose a
// hand like anyone else. Strength comes from playing well: hand ranges, position, pot
// odds, fold equity and what each opponent has shown over many hands.
import {evaluateHand,compare,ranks,suits} from './poker.js';

const rv=c=>ranks.indexOf(c[0])+2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sig=x=>1/(1+Math.exp(-x));
const AGGRESSIVE=new Set(['BET','RAISE']);

// Styles. "range" widens or narrows the starting hands, "bluff" is how often a profitable
// bluff is really made, "aggr" favours betting over calling, "risk" is how much of the
// stack a hand that is not clearly ahead may cost.
export const STYLES={
 low:{label:'Tight',range:.82,bluff:.25,aggr:-.01,risk:.3,trap:.12},
 medium:{label:'Balanced',range:1,bluff:.45,aggr:0,risk:.4,trap:.18},
 high:{label:'Aggressive',range:1.22,bluff:.7,aggr:.02,risk:.55,trap:.1},
};

// ---- Preflop: every Hold'em starting hand ranked (Chen formula) as its share of the 1326
// possible hands; 0 is the best hand, 1 the worst.
function chen(a,b,suited){
 const pts=v=>v===14?10:v===13?8:v===12?7:v===11?6:v/2;
 if(a===b)return Math.max(5,pts(a)*2)+a/100;
 let s=pts(a)+(suited?2:0);const gap=a-b-1;s-=[0,1,2,4][gap]??5;if(gap<=1&&a<12)s+=1;
 return s+a/100+b/1000;
}
const PREFLOP=(()=>{const list=[];for(let a=14;a>=2;a--)for(let b=a;b>=2;b--){if(a===b)list.push({k:a+'-'+b+'p',s:chen(a,b),n:6});else list.push({k:a+'-'+b+'s',s:chen(a,b,true),n:4},{k:a+'-'+b+'o',s:chen(a,b,false),n:12});}
 list.sort((x,y)=>y.s-x.s);const m=new Map();let acc=0;for(const h of list){m.set(h.k,(acc+h.n/2)/1326);acc+=h.n;}return m;})();
export function preflopRank(cards){const [x,y]=cards.map(rv).sort((p,q)=>q-p);return PREFLOP.get(x+'-'+y+(x===y?'p':cards[0][1]===cards[1][1]?'s':'o'));}
function omahaPreflop(c){const vals=c.map(rv).sort((a,b)=>b-a),cnt=Object.values(c.reduce((m,x)=>(m[x[1]]=(m[x[1]]||0)+1,m),{})).sort((a,b)=>b-a);
 let s=vals.reduce((a,b)=>a+b,0)/56*.55;if(new Set(vals).size<4)s+=.06+Math.max(...vals.filter((x,i)=>vals.indexOf(x)!==i))/14*.12;if(cnt[0]===2&&cnt[1]===2)s+=.12;else if(cnt[0]===2)s+=.06;if(vals[0]-vals[3]<=4)s+=.08;return Math.min(1,s);}

// Made-hand strength 0..1 of some cards on a board (used for the bot and for the hands an
// opponent could hold).
export function handStrength(v){
 const c=v.cards;if(!c.length)return 0;
 if(v.board.length<3)return v.game==='omaha'?omahaPreflop(c):1-preflopRank(c);
 const score=evaluateHand(v.game,c,v.board),table=[.15,.42,.62,.74,.8,.84,.92,.97,.99];let s=table[score[0]];
 if(score[0]===1){const top=Math.max(...v.board.map(rv));s+=score[1]>=top?.12:score[1]<top-4?-.08:0;}
 if(v.game!=='omaha'&&v.board.length===5&&score[0]<=6){const board=v.boardScore||evaluateHand('holdem',[],v.board);if(board[0]===score[0]&&board[1]===score[1])s-=.25;}
 return clamp(s,0,1);
}

// ---- What an opponent probably holds, from public information only: how they played this
// hand and their habits over earlier hands (profile).
const DEFAULT_PROFILE={vpip:.32,pfr:.16,af:1.6,ftb:.42};
export function opponentModel(o){
 const p={...DEFAULT_PROFILE,...(o.profile||{})},pre=(o.actions||[]).filter(a=>a.street==='preflop');
 const raises=pre.filter(a=>AGGRESSIVE.has(a.type)).length,calls=pre.filter(a=>a.type==='CALL').length;
 const width=raises?Math.max(.02,p.pfr*Math.pow(.36,raises-1)):calls?Math.max(p.pfr+.05,p.vpip):1;
 return {width,bluff:clamp(.12+(p.af-1)*.1,.08,.5),post:(o.actions||[]).filter(a=>a.street!=='preflop'),ftb:p.ftb};
}
const boardAt=(board,street)=>street==='flop'?board.slice(0,3):street==='turn'?board.slice(0,4):board;
function handWeight(game,hand,board,m){
 let w;if(game==='omaha'){const s=omahaPreflop(hand);w=s>=1-m.width*1.1?1:.3;}
 else{const r=preflopRank(hand);w=r<=m.width?1:Math.max(.03,1-(r-m.width)*6);}
 const seen=new Map();const hs=street=>{if(!seen.has(street))seen.set(street,handStrength({game,cards:hand,board:boardAt(board,street),boardScore:m.riverScore}));return seen.get(street);};
 for(const a of m.post){if(a.street==='showdown'||boardAt(board,a.street).length<3)continue;const s=hs(a.street);
  if(AGGRESSIVE.has(a.type))w*=m.bluff+(1-m.bluff)*sig((s-.55)*9);
  else if(a.type==='CALL')w*=.3+.7*sig((s-.38)*8);
  else if(a.type==='CHECK')w*=1-.35*sig((s-.78)*10);}
 return w;
}
function holdemRange(board,m,dead){
 if(board.length===5)m={...m,riverScore:evaluateHand('holdem',[],board)};
 const avail=[];for(const s of suits)for(const r of ranks){const c=r+s;if(!dead.has(c))avail.push(c);}
 const list=[],cum=[];let total=0;
 for(let i=0;i<avail.length;i++)for(let j=i+1;j<avail.length;j++){const h=[avail[i],avail[j]],w=handWeight('holdem',h,board,m);if(w>0.0005){total+=w;list.push(h);cum.push(total);}}
 return {list,cum,total};
}
function drawFrom(range,used,random){
 for(let k=0;k<30;k++){const r=random()*range.total;let lo=0,hi=range.cum.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(range.cum[mid]<r)lo=mid+1;else hi=mid;}const h=range.list[lo];if(!used.has(h[0])&&!used.has(h[1]))return h;}
 return null;
}

// Chance of winning against what each opponent probably holds. The rest of the board is
// drawn at random from the cards the bot cannot see.
export function rangeEquity(v,opponents,iterations,random=Math.random){
 const game=v.game||'holdem',hole=game==='omaha'?4:2,dead=new Set([...v.cards,...v.board]);
 const deck=[];for(const s of suits)for(const r of ranks){const c=r+s;if(!dead.has(c))deck.push(c);}
 const models=opponents.map(o=>o.model||opponentModel(o));if(!models.length)return 1;
 const ranges=game==='omaha'?null:models.map(m=>holdemRange(v.board,m,dead));
 const n=iterations??(game==='omaha'?120:models.length>2?220:320);let won=0,done=0;
 for(let i=0;i<n;i++){
  const used=new Set(),hands=[];let ok=true;
  for(let o=0;o<models.length;o++){
   let h=null;
   if(ranges){h=drawFrom(ranges[o],used,random);}
   else for(let k=0;k<14&&!h;k++){const pick=[];const pool=deck.filter(c=>!used.has(c));for(let x=0;x<hole;x++){const j=x+Math.floor(random()*(pool.length-x));[pool[x],pool[j]]=[pool[j],pool[x]];pick.push(pool[x]);}if(k===13||random()<handWeight(game,pick,v.board,models[o]))h=pick;}
   if(!h){ok=false;break;}for(const c of h)used.add(c);hands.push(h);}
  if(!ok)continue;
  const pool=deck.filter(c=>!used.has(c)),need=5-v.board.length;
  for(let x=0;x<need;x++){const j=x+Math.floor(random()*(pool.length-x));[pool[x],pool[j]]=[pool[j],pool[x]];}
  const board=[...v.board,...pool.slice(0,need)],mine=evaluateHand(game,v.cards,board);let best=1,ties=1;
  for(const h of hands){const c=compare(evaluateHand(game,h,board),mine);if(c>0){best=0;break;}if(c===0)ties++;}
  if(best)won+=1/ties;done++;}
 return done?won/done:.5;
}

// How likely one opponent folds to a bet of "frac" times the pot.
function foldChance(o,frac,street){
 if(o.allIn)return 0;const m=o.model;
 let f=m.ftb*(.65+.55*Math.min(1.6,frac));
 f*=Math.pow(.6,m.post.filter(a=>AGGRESSIVE.has(a.type)).length);
 if(street==='preflop'&&m.width<.1)f*=.5;
 return clamp(f,.03,.85);
}

const shove=v=>v.roundBet+v.stack;
function raiseTo(v,target){
 if(!v.canRaise)return null;target=Math.round(target);
 if(target>=shove(v)*.82)target=shove(v);
 target=Math.min(target,v.maxRaiseTo,shove(v));
 if(target<v.minRaiseTo&&target!==shove(v))target=Math.min(v.minRaiseTo,shove(v),v.maxRaiseTo);
 if(target<=v.currentBet||(target<v.minRaiseTo&&target!==shove(v)))return null;
 return target;
}
const act={fold:{type:'fold'},check:{type:'check'},call:{type:'call'}};
const raise=(v,target,why)=>{const t=raiseTo(v,target);return t?{type:'raise',amount:t/100,why}:null;};
const passive=v=>v.toCall?act.call:act.check;
const foldOrCheck=v=>v.toCall?act.fold:act.check;

// ---- Preflop: ranges by position, how many raised before, stack depth and who raised.
function preflop(v,st,random){
 const bb=v.bb,raises=v.raisesPreflop||0,opps=v.opponents||[];
 const effBB=Math.min(v.stack+v.roundBet,Math.max(1,...opps.map(o=>o.stack+o.roundBet)))/bb;
 let r=v.game==='omaha'?1-omahaPreflop(v.cards):preflopRank(v.cards);
 const behind=v.playersBehind??2,headsUp=(v.dealt||2)===2;
 const openBase=headsUp?.72:behind<=1?.45:behind===2?.42:behind===3?.27:behind===4?.2:behind===5?.16:.13;
 const open=openBase*st.range,raiser=opps.filter(o=>o.actions?.some(a=>a.street==='preflop'&&AGGRESSIVE.has(a.type))).pop();
 const loose=raiser?clamp((raiser.profile?.pfr??.16)/.16,.6,1.8):1;
 // Short stacks: push or fold.
 if(effBB<=13){
  const push=clamp(open*(1.6-effBB/26),.06,.75),callShove=clamp(.05*loose*st.range+(v.toCall<=v.pot*.4?.08:0),.03,.3);
  if(!raises&&r<=push)return raise(v,shove(v),'push')||passive(v);
  if(raises&&r<=callShove)return v.toCall>=v.stack?act.call:(raise(v,shove(v),'re-shove')||act.call);
  return foldOrCheck(v);}
 if(!raises){
  const limpers=opps.filter(o=>o.actions?.some(a=>a.street==='preflop'&&a.type==='CALL')).length;
  if(!v.toCall)return r<=.12*st.range?raise(v,bb*(3.5+limpers),'iso-raise')||act.check:act.check;
  if(r<=open)return raise(v,bb*((headsUp?2.4:2.3)+limpers),'open')||passive(v);
  if(v.isSB&&!limpers&&r<=.55*st.range&&v.toCall<=bb/2)return act.call;
  if(limpers&&r<=open*1.35&&v.toCall<=bb&&behind<=2)return act.call;
  return act.fold;}
 const price=v.toCall/bb;
 if(raises===1){
  const three=.045*loose*st.range,call=(.13+(v.isBB?.12:0)+(behind===0?.03:0))*loose*st.range*(price>4?.7:1);
  if(r<=three)return raise(v,v.currentBet*(behind===0?3:3.6),'3-bet')||act.call;
  if(r<=call)return act.call;
  if(r<=.11&&random()<st.bluff*.2)return raise(v,v.currentBet*3.3,'light 3-bet')||act.fold;
  return act.fold;}
 if(raises===2){if(r<=.022)return raise(v,effBB<45?shove(v):v.currentBet*2.3,'4-bet')||act.call;if(r<=.05*loose*st.range)return act.call;return act.fold;}
 if(r<=.012)return raise(v,shove(v),'all-in')||act.call;if(r<=.02&&price<effBB*.5)return act.call;return act.fold;
}

// ---- After the flop: expected value of every reasonable action, using the equity against
// each opponent's likely hands and how often they fold.
function postflop(v,st,random,E){
 const opps=(v.opponents||[]).filter(o=>!o.folded),pot=v.pot,street=v.phase,R=street==='river'||v.inPosition?1:.9;
 const live=opps.filter(o=>!o.allIn),callCost=Math.min(v.toCall,v.stack),starting=v.stack+v.committed;
 const options=[];
 if(v.toCall)options.push({a:act.fold,ev:0},{a:act.call,ev:R*E*(pot+callCost)-callCost});
 else options.push({a:act.check,ev:R*E*pot});
 if(v.canRaise&&live.length){
  const fracs=v.toCall?[.6,1]:[.33,.5,.75,1];const top=opps.reduce((m,o)=>o.roundBet>m.roundBet?o:m,opps[0]);
  const targets=fracs.map(f=>v.currentBet+f*(pot+v.toCall));if(v.stack+v.roundBet<=pot*1.6||E>.82)targets.push(shove(v));
  for(const want of targets){const T=raiseTo(v,want);if(!T||options.some(x=>x.T===T))continue;
   const add=T-v.roundBet,frac=(T-v.currentBet)/Math.max(1,pot+v.toCall);
   const fe=live.reduce((p,o)=>p*foldChance(o,frac,street),1);
   const oppAdd=Math.min(T-top.roundBet,top.stack),Ec=E*(1-.25*Math.min(1.5,frac)*(1-E));
   let ev=fe*pot+(1-fe)*(R*Ec*(pot+add+oppAdd)-add)+st.aggr*pot;
   options.push({a:{type:'raise',amount:T/100},ev,T,bluff:Ec<.35});}}
 // A hand that is not clearly ahead does not risk more than the style allows.
 const capped=o=>E<.62&&(o.a.type==='call'||o.a.type==='raise')&&(o.a.type==='call'?v.committed+callCost:o.T-v.roundBet+v.committed)>starting*st.risk&&!(o.a.type==='call'&&callCost<=pot*.12);
 let pool=options.filter(o=>!capped(o));if(!pool.length)pool=options.filter(o=>o.a.type!=='raise'&&o.a.type!=='call');
 // Profitable bluffs are mixed in, not made every time.
 pool=pool.filter(o=>!o.bluff||random()<st.bluff);
 // Slow-play a monster now and then.
 if(!v.toCall&&E>.85&&street!=='river'&&random()<st.trap)return act.check;
 pool.sort((a,b)=>b.ev-a.ev);let pick=pool[0];
 if(pool[1]&&pool[1].ev>=pick.ev-.04*pot&&random()<.15)pick=pool[1];
 if(pick.a.type==='fold'&&!v.toCall)return act.check;
 return pick.a;
}

// One decision. v is the bot's view of the table (see botView in bots.js).
export function decide(v,style='medium',random=Math.random){
 if(Object.hasOwn(v,'outcome')){
  const type=!v.toCall?'check':v.outcome==='win'&&v.toCall<v.stack?'call':'fold';
  return {type,equity:v.outcome==='win'?1:v.outcome==='loss'?0:null};
 }
 const st=STYLES[style]||STYLES.medium;
 const opponents=(v.opponents||[]).filter(o=>!o.folded).map(o=>({...o,model:opponentModel(o)}));
 if(v.board.length<3){const d=preflop({...v,opponents},st,random);return {...d,equity:null};}
 const E=rangeEquity(v,opponents,undefined,random);
 const d=postflop({...v,opponents},st,random,E);
 if(d.type==='fold'&&!v.toCall)return {...act.check,equity:E};
 return {...d,equity:E};
}
