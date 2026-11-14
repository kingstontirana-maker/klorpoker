// The centre has no credit limit: it creates credit. Whenever the centre gives out more than
// its wallet holds, the missing part is created first and recorded as a MINT transaction, and
// the money check total grows by the same amount, so the check stays exact and every euro
// that exists can still be traced to where it came from.
import crypto from 'node:crypto';
export function centerFunds(db,center,cents,reason='credit'){
 if(!center||center.role!=='CENTER'||!Number.isSafeInteger(cents)||cents<=0)return 0;
 const missing=cents-center.balance;if(missing<=0)return 0;
 center.balance+=missing;db.moneyTotal=(Number(db.moneyTotal)||0)+missing;
 db.ledger.push({id:crypto.randomUUID(),type:'MINT',to:center.id,amount:missing,reason,time:Date.now()});
 return missing;
}
// All credit the centre has created since the start (the first €1,000,000 included).
export const creditCreated=db=>100000000+db.ledger.filter(x=>x.type==='MINT').reduce((n,x)=>n+x.amount,0);
