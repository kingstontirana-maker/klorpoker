// ---- Crypto payments: USDT on Tron (TRC20), straight into the center's own wallet ----
// No private key ever lives on the server: deposits are read from the public
// blockchain (TronGrid) and withdrawals are paid by the center by hand.
//
// Deposits: a player asks to deposit N USDT and receives a unique amount to send
// (e.g. 50.37 USDT). Every confirmed USDT transfer into the wallet is matched by
// that exact amount, so nobody can claim someone else's payment. A transfer that
// matches nothing (wrong amount, too late) is listed for the center to assign.
// Withdrawals: the euro amount is taken from the player's wallet and held until the
// center marks it paid (with the transaction hash) or rejects it (money returns).
import crypto from 'node:crypto';

export const USDT_TRC20='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// A Tron address is base58check: 0x41 + 20 bytes + 4 checksum bytes.
export function validTronAddress(a){
 if(typeof a!=='string'||!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a))return false;
 let n=0n;for(const ch of a)n=n*58n+BigInt(B58.indexOf(ch));
 const bytes=[];while(n>0n){bytes.unshift(Number(n&255n));n>>=8n;}
 if(bytes.length!==25||bytes[0]!==0x41)return false;
 const body=Buffer.from(bytes.slice(0,21)),sum=crypto.createHash('sha256').update(crypto.createHash('sha256').update(body).digest()).digest();
 return sum.subarray(0,4).equals(Buffer.from(bytes.slice(21)));
}
const MICRO=1000000n;
const usdt=micro=>(Number(micro)/1e6).toFixed(2);
export const DEPOSIT_TTL_MS=3*3600000,MAX_OPEN_DEPOSITS=3;

export function createPayments({db,save,fail,fetchImpl=globalThis.fetch,now=()=>Date.now(),apiUrl=process.env.TRONGRID_URL||'https://api.trongrid.io',apiKey=process.env.TRONGRID_API_KEY||''}){
 db.crypto??={enabled:false,address:'',rateIn:0.9,rateOut:0.9,minDeposit:10,minWithdraw:20,deposits:[],withdrawals:[],unmatched:[],seen:[],lastScan:0};
 const C=db.crypto,uid=()=>crypto.randomUUID(),center=()=>db.users.find(u=>u.role==='CENTER');
 const ledger=(type,from,to,amount,extra)=>db.ledger.push({id:uid(),type,from,to,amount,...extra,time:now()});
 const toCents=(micro,rate)=>Math.floor(Number(micro)*rate/10000);           // micro-USDT × €/USDT → cents
 const config=()=>({enabled:C.enabled&&validTronAddress(C.address),address:C.address,network:'TRC20 (Tron)',token:'USDT',rateIn:C.rateIn,rateOut:C.rateOut,minDeposit:C.minDeposit,minWithdraw:C.minWithdraw});
 const pub=d=>({id:d.id,amount:usdt(d.micro),status:d.status,createdAt:d.createdAt,expiresAt:d.expiresAt,credited:d.cents!=null?d.cents/100:null,tx:d.tx||null,rate:d.rate});
 const pubW=w=>({id:w.id,euro:w.cents/100,usdt:w.usdt,address:w.address,status:w.status,createdAt:w.createdAt,tx:w.tx||null,note:w.note||null});
 function expire(){const t=now();for(const d of C.deposits)if(d.status==='open'&&t>d.expiresAt)d.status='expired';}

 // ---- blockchain scan ----
 let scanning=null;
 async function scan(force=false){
  if(!validTronAddress(C.address))return {checked:0};
  expire();const open=C.deposits.filter(d=>d.status==='open');
  if(!force&&!open.length)return {checked:0};
  if(scanning)return scanning;
  scanning=(async()=>{try{
   const since=Math.max(0,Math.min(...open.map(d=>d.createdAt),now()-6*3600000)-10*60000);
   const url=`${apiUrl}/v1/accounts/${C.address}/transactions/trc20?only_confirmed=true&only_to=true&limit=200&contract_address=${USDT_TRC20}&min_timestamp=${since}`;
   // Up to 10 pages of 200 transfers, newest first.
   const rows=[];let next='';for(let page=0;page<10;page++){const r=await fetchImpl(url+(next?'&fingerprint='+encodeURIComponent(next):''),{headers:apiKey?{'TRON-PRO-API-KEY':apiKey}:{}});if(!r.ok)throw Error('TronGrid '+r.status);const b=await r.json();rows.push(...(b.data||[]));next=b.meta?.fingerprint;if(!next||(b.data||[]).length<200)break;}
   const body={data:rows};let credited=0;
   for(const x of body.data||[]){
    const id=x.transaction_id;if(!id||C.seen.includes(id))continue;
    if(x.to!==C.address||x.token_info?.address!==USDT_TRC20||x.type&&x.type!=='Transfer')continue;
    const micro=BigInt(x.value||0),at=Number(x.block_timestamp)||now();
    const d=C.deposits.find(d=>d.status==='open'&&BigInt(d.micro)===micro&&at>=d.createdAt-60000&&at<=d.expiresAt);
    if(d&&creditDeposit(d,id,at))credited++;else if(!d)C.unmatched.push({tx:id,micro:String(micro),from:x.from,at,status:'open'});
    C.seen.push(id);}
   C.seen=C.seen.slice(-5000);C.unmatched=C.unmatched.slice(-500);C.lastScan=now();save();return {checked:(body.data||[]).length,credited};
  }finally{scanning=null;}})();
  return scanning;}
 function creditDeposit(d,tx,at){const u=db.users.find(x=>x.id===d.userId),c=center();if(!u||!c)return false;const cents=toCents(d.micro,d.rate);if(c.balance<cents){d.note='Center credit is too low';return false;}
  c.balance-=cents;u.balance+=cents;Object.assign(d,{status:'credited',tx,paidAt:at,cents});ledger('CRYPTO_DEPOSIT',c.id,u.id,cents,{tx,usdt:usdt(d.micro),rate:d.rate});return true;}

 // ---- routes ----
 function route(p,body,u){if(!p.startsWith('/api/crypto'))return undefined;
  if(p==='/api/crypto'){expire();const mine=u.role==='USER';return {config:config(),deposits:mine?C.deposits.filter(d=>d.userId===u.id).slice(-20).reverse().map(pub):[],withdrawals:mine?C.withdrawals.filter(w=>w.userId===u.id).slice(-20).reverse().map(pubW):[]};}
  if(p==='/api/crypto/deposit'){if(u.role!=='USER')fail('Only players deposit with crypto',403);if(!config().enabled)fail('Crypto deposits are not available right now');expire();
   const amount=Number(body.amount);if(!Number.isInteger(amount)||amount<C.minDeposit||amount>100000)fail(`Choose a whole USDT amount, at least ${C.minDeposit}`);
   if(C.deposits.filter(d=>d.userId===u.id&&d.status==='open').length>=MAX_OPEN_DEPOSITS)fail('You already have open deposits. Pay one of them or wait until it expires.');
   // A unique amount (+0.01 … +0.99 USDT) ties the transfer to this request.
   const taken=new Set(C.deposits.filter(d=>d.status==='open').map(d=>d.micro));let micro=null;
   const start=crypto.randomInt(0,99);for(let i=0;i<99;i++){const k=(start+i)%99+1,m=String(BigInt(amount)*MICRO+BigInt(k)*10000n);if(!taken.has(m)){micro=m;break;}}
   if(!micro)fail('Too many open deposits for this amount. Choose another amount.');
   const d={id:uid(),userId:u.id,username:u.username,micro,rate:C.rateIn,status:'open',createdAt:now(),expiresAt:now()+DEPOSIT_TTL_MS};C.deposits.push(d);C.deposits=C.deposits.slice(-5000);save();
   return {...pub(d),address:C.address,network:'TRC20 (Tron)',token:'USDT',euro:toCents(micro,d.rate)/100};}
  if(p==='/api/crypto/check'){if(u.role!=='USER'&&u.role!=='CENTER')fail('Forbidden',403);const k='check:'+u.id;checks[k]=checks[k]||0;if(now()-checks[k]<10000)fail('Please wait a few seconds before checking again',429);checks[k]=now();return scan(u.role==='CENTER').then(r=>({ok:true,...r}));}
  if(p==='/api/crypto/cancel'){const d=C.deposits.find(d=>d.id===body.id&&d.userId===u.id&&d.status==='open');if(!d)fail('Deposit not found',404);d.status='cancelled';save();return {ok:true};}
  if(p==='/api/crypto/withdraw'){if(u.role!=='USER')fail('Only players withdraw with crypto',403);if(!config().enabled)fail('Crypto withdrawals are not available right now');
   const cents=Math.round(Number(body.amount)*100),address=String(body.address||'').trim();
   if(!Number.isSafeInteger(cents)||cents<C.minWithdraw*100)fail(`The minimum withdrawal is €${C.minWithdraw}`);if(cents>u.balance)fail('Not enough credit in your wallet (chips on a table are not included)');
   if(!validTronAddress(address))fail('Enter a valid USDT TRC20 (Tron) address, starting with T');
   if(C.withdrawals.some(w=>w.userId===u.id&&w.status==='pending'))fail('You already have a withdrawal waiting');
   u.balance-=cents;const w={id:uid(),userId:u.id,username:u.username,cents,usdt:(cents/100/C.rateOut).toFixed(2),rate:C.rateOut,address,status:'pending',createdAt:now()};C.withdrawals.push(w);
   ledger('CRYPTO_WITHDRAW_HOLD',u.id,null,cents,{withdrawal:w.id,usdt:w.usdt,address});save();return pubW(w);}
  // ---- center ----
  if(u.role!=='CENTER')fail('Only the center manages crypto payments',403);
  if(p==='/api/crypto/admin'){expire();return {config:{...config(),enabled:C.enabled},lastScan:C.lastScan,deposits:C.deposits.slice(-200).reverse().map(d=>({...pub(d),username:d.username,note:d.note||null})),unmatched:C.unmatched.filter(x=>x.status==='open').slice(-100).reverse().map(x=>({tx:x.tx,amount:usdt(x.micro),from:x.from,at:x.at})),withdrawals:C.withdrawals.slice(-200).reverse().map(w=>({...pubW(w),username:w.username}))};}
  if(p==='/api/crypto/settings'){const address=String(body.address??C.address).trim(),num=(v,lo,hi,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<lo||n>hi)fail(name+' is invalid');return n;};
   if(address&&!validTronAddress(address))fail('This is not a valid Tron (TRC20) address');
   Object.assign(C,{address,enabled:!!body.enabled&&!!address,rateIn:num(body.rateIn??C.rateIn,.01,10,'Deposit rate'),rateOut:num(body.rateOut??C.rateOut,.01,10,'Withdrawal rate'),minDeposit:Math.round(num(body.minDeposit??C.minDeposit,1,100000,'Minimum deposit')),minWithdraw:Math.round(num(body.minWithdraw??C.minWithdraw,1,100000,'Minimum withdrawal'))});
   ledger('CRYPTO_SETTINGS',u.id,null,0,{address,enabled:C.enabled,rateIn:C.rateIn,rateOut:C.rateOut});save();return {ok:true,config:config()};}
  if(p==='/api/crypto/assign'){const x=C.unmatched.find(x=>x.tx===body.tx&&x.status==='open');if(!x)fail('Transfer not found',404);const player=db.users.find(v=>v.username.toLowerCase()===String(body.username||'').trim().toLowerCase()&&v.role==='USER'&&!v.isBot);if(!player)fail('Player not found',404);
   const d={id:uid(),userId:player.id,username:player.username,micro:x.micro,rate:C.rateIn,status:'open',createdAt:x.at,expiresAt:x.at,manual:true};if(!creditDeposit(d,x.tx,x.at))fail(d.note||'Could not credit');C.deposits.push(d);x.status='assigned';x.userId=player.id;save();return {ok:true,credited:d.cents/100};}
  if(p==='/api/crypto/ignore'){const x=C.unmatched.find(x=>x.tx===body.tx&&x.status==='open');if(!x)fail('Transfer not found',404);x.status='ignored';save();return {ok:true};}
  if(p==='/api/crypto/withdrawal'){const w=C.withdrawals.find(w=>w.id===body.id&&w.status==='pending');if(!w)fail('Withdrawal not found',404);const player=db.users.find(v=>v.id===w.userId),c=center();
   if(body.action==='paid'){const tx=String(body.tx||'').trim();if(!/^[0-9a-fA-F]{64}$/.test(tx))fail('Enter the 64-character transaction hash of your payment');Object.assign(w,{status:'paid',tx,paidAt:now()});c.balance+=w.cents;ledger('CRYPTO_WITHDRAW',w.userId,c.id,w.cents,{withdrawal:w.id,usdt:w.usdt,tx,address:w.address});}
   else if(body.action==='reject'){Object.assign(w,{status:'rejected',note:String(body.note||'').slice(0,200)||null,paidAt:now()});if(player)player.balance+=w.cents;ledger('CRYPTO_WITHDRAW_REFUND',null,w.userId,w.cents,{withdrawal:w.id});}
   else fail('Invalid action');save();return {ok:true};}
  fail('Not found',404);}
 const checks={};
 // Money held for pending withdrawals is still the player's: counted in totals.
 const held=()=>C.withdrawals.filter(w=>w.status==='pending').reduce((n,w)=>n+w.cents,0);
 return {route,scan,held,config};
}
