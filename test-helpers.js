// Rule tests need stacks deeper than a table allows at the door (100 big blinds):
// the player sits at the maximum and the rest moves from wallet to stack, as a win would.
export function sitDeep(e,t,u,pos,euros,all=[t]){
 const cents=Math.round(euros*100),max=e.buyinLimits(t).max;
 if(cents<=max)return e.sit(t,u,pos,euros,all);
 e.sit(t,u,pos,max/100,all);u.balance-=cents-max;t.seats[pos].stack+=cents-max;
}
