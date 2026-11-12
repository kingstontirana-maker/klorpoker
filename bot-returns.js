// All amounts are integer virtual-credit cents. Funding is never profit.
export function returnBudget(bot,equity,percent){
 const returned=bot.returned||0,reserved=bot.returnHand?.paid||0;
 const net=equity-bot.funded;
 const target=Math.floor(Math.max(0,net+returned)*percent/100);
 return Math.max(0,Math.min(Math.max(0,net),target-returned)-reserved);
}

export function returnDecision(view,budget,random=Math.random,hand=null){
 // One losing hand may spend at most 60% of the available return budget
 // recorded before its first deliberate losing call, across all streets.
 const paid=hand?.paid||0,limit=hand?.limit??Math.floor((budget+paid)*.6);
 const cost=Math.min(view.toCall,view.stack);
 if(view.outcome!=='loss'||!(view.toCall>0)||!(cost>0)||cost>Math.min(budget,Math.max(0,limit-paid)))return false;
 // Once a hand is selected for a return, follow affordable later bets,
 // including all-in calls, without rerolling the selection on each street.
 if(paid>0)return true;
 // Pay a changing subset of affordable bets; never manufacture a raise size.
 const pressure=cost/Math.max(1,view.pot);
 return random()<Math.max(.15,Math.min(.85,.75-pressure*.3));
}
