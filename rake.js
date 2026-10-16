// Integer cents throughout; a pot's rake is shared equally by its contributors.
export function rakeReport(db, user, now=Date.now()) {
  const ids=new Set([user.id]);
  for(let changed=true;changed;){changed=false;for(const u of db.users)if(ids.has(u.parentId)&&!ids.has(u.id)){ids.add(u.id);changed=true;}}
  const rows=db.ledger.filter(x=>x.type==='RAKE').flatMap(x=>{
    const amount=user.role==='CENTER'?x.amount:(x.allocations||[]).filter(a=>ids.has(a.userId)).reduce((n,a)=>n+a.amount,0);
    return amount>0?[{id:x.id,tableId:x.tableId,hand:x.hand??null,time:x.time,amount,legacy:!x.allocations}]:[];
  });
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
  const today=day.format(now),total=rows.reduce((n,x)=>n+x.amount,0);
  return {total,today:rows.filter(x=>day.format(x.time)===today).reduce((n,x)=>n+x.amount,0),hands:rows.length,rows:rows.slice(-100).reverse(),legacyTotal:rows.filter(x=>x.legacy).reduce((n,x)=>n+x.amount,0)};
}
