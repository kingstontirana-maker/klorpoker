// ---- Crypto payments: USDT on Tron (TRC20), straight into the center's own wallet ----
// No private key ever lives on the server: deposits are read from the public
// blockchain (TronGrid) and withdrawals are paid by the center by hand.
//
// Deposits: a player asks to deposit N USDT and receives a unique amount to send
// (e.g. 50.37 USDT). A transfer counts only when the chain itself proves it: the
// transaction succeeded, the Transfer event comes from the real USDT contract, to this
// wallet, for exactly that amount, in a block that is final (solidified) and a few more
// blocks deep. Fake tokens named "USDT", "flash USDT", failed or reverted transfers and
// anything not final are never credited. Every transaction is remembered for good, so
// none is ever credited twice. A transfer that matches no request is listed for the center.
//
// Withdrawals: the euro amount is taken from the player's wallet and held. The center
// reviews the request (with a risk check) and approves or rejects it; once approved it
// pays from its wallet and enters the transaction hash. The withdrawal is marked paid only
// when the chain shows that USDT reached the player's address, for the full amount, after
// the request. Rejected or cancelled requests return the credit.
import crypto from 'node:crypto';
import {centerFunds} from './credit.js';

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
// The 20-byte hex form of a Tron address, as it appears in a transfer log ('' if invalid).
export function tronHex(a){if(!validTronAddress(a))return '';let n=0n;for(const ch of a)n=n*58n+BigInt(B58.indexOf(ch));const bytes=[];while(n>0n){bytes.unshift(Number(n&255n));n>>=8n;}return Buffer.from(bytes.slice(1,21)).toString('hex');}
const TRANSFER_TOPIC='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MICRO=1000000n;
const usdt=micro=>(Number(micro)/1e6).toFixed(2);
export const DEPOSIT_TTL_MS=3*3600000,MAX_OPEN_DEPOSITS=3,IDLE_SCAN_MS=5*60000;
const HELD=['pending','approved','verifying'];

export function createPayments({db,save,fail,fetchImpl=globalThis.fetch,now=()=>Date.now(),apiUrl=process.env.TRONGRID_URL||'https://api.trongrid.io',apiKey=process.env.TRONGRID_API_KEY||'',playSince=()=>null}){
 db.crypto??={enabled:false,address:'',rateIn:0.9,rateOut:0.9,minDeposit:10,minWithdraw:20,deposits:[],withdrawals:[],unmatched:[],seen:[],lastScan:0};
 const C=db.crypto,uid=()=>crypto.randomUUID(),center=()=>db.users.find(u=>u.role==='CENTER');
 C.confirmations??=20;C.maxDeposit??=10000;C.dailyWithdraw??=0;
 // Every transaction ever handled, kept for good: credited, assigned, ignored, rejected by the
 // chain check, or used to pay a withdrawal. Older data is folded in once.
 if(!C.txs){C.txs={};for(const id of C.seen||[])C.txs[id]='seen';for(const d of C.deposits)if(d.tx)C.txs[d.tx]='deposit';for(const x of C.unmatched)C.txs[x.tx]??=x.status==='open'?'seen':x.status;for(const w of C.withdrawals)if(w.tx)C.txs[w.tx]='withdrawal';}
 const known=id=>Object.hasOwn(C.txs,id);
 const ledger=(type,from,to,amount,extra)=>db.ledger.push({id:uid(),type,from,to,amount,...extra,time:now()});
 const toCents=(micro,rate)=>Math.floor(Number(micro)*rate/10000);           // micro-USDT × €/USDT → cents
 const config=()=>({enabled:C.enabled&&validTronAddress(C.address),address:C.address,network:'TRC20 (Tron)',token:'USDT',rateIn:C.rateIn,rateOut:C.rateOut,minDeposit:C.minDeposit,minWithdraw:C.minWithdraw,maxDeposit:C.maxDeposit,dailyWithdraw:C.dailyWithdraw,confirmations:C.confirmations});
 const pub=d=>({id:d.id,amount:usdt(d.micro),status:d.status,createdAt:d.createdAt,expiresAt:d.expiresAt,credited:d.cents!=null?d.cents/100:null,tx:d.tx||null,rate:d.rate});
 const pubW=w=>({id:w.id,euro:w.cents/100,usdt:w.usdt,address:w.address,status:w.status,createdAt:w.createdAt,approvedAt:w.approvedAt||null,tx:w.tx||null,note:w.note||null,paidAt:w.paidAt||null});
 function expire(){const t=now();for(const d of C.deposits)if(d.status==='open'&&t>d.expiresAt)d.status='expired';}
 const headers=()=>({'content-type':'application/json',...(apiKey?{'TRON-PRO-API-KEY':apiKey}:{})});
 async function post(path,body){const r=await fetchImpl(apiUrl+path,{method:'POST',headers:headers(),body:JSON.stringify(body)});if(!r.ok)return null;return r.json().catch(()=>null);}

 // ---- blockchain ----
 // The newest final (solidified) block. Transfers must be this deep before they count.
 let solidCache={at:0,n:0};
 async function solidBlock(){if(now()-solidCache.at<15000&&solidCache.n)return solidCache.n;const b=await post('/walletsolidity/getnowblock',{}).catch(()=>null);const n=Number(b?.block_header?.raw_data?.number)||0;if(n)solidCache={at:now(),n};return n||null;}
 // The confirmed transaction, straight from a final block: did it succeed, and which real USDT
 // Transfer events does it hold? null = not final or deep enough yet (ask again later).
 async function finalTransfers(id){
  const i=await post('/walletsolidity/gettransactioninfobyid',{value:id});if(!i||i.id!==id)return null;
  const top=await solidBlock();if(!top||!(Number(i.blockNumber)>0)||Number(i.blockNumber)>top-C.confirmations)return null;
  const token=tronHex(USDT_TRC20);
  return {ok:i.receipt?.result==='SUCCESS',time:Number(i.blockTimeStamp)||0,block:Number(i.blockNumber),
   transfers:(i.log||[]).filter(l=>String(l.address||'').toLowerCase().slice(-40)===token&&l.topics?.[0]===TRANSFER_TOPIC)
    .map(l=>({from:String(l.topics?.[1]||'').toLowerCase().slice(-40),to:String(l.topics?.[2]||'').toLowerCase().slice(-40),micro:BigInt('0x'+(l.data||'0'))}))};}
 // A deposit: true / false (never counts) / null (later).
 async function onChain(id,micro){const f=await finalTransfers(id);if(!f)return null;const to=tronHex(C.address);return f.ok&&f.transfers.some(t=>t.to===to&&t.micro===micro);}
 // A withdrawal payout: the full amount of real USDT reached the player's address, after the request.
 async function payoutCheck(w,tx){const f=await finalTransfers(tx);if(!f)return null;
  if(!f.ok)return {ok:false,reason:'This transaction failed on the chain'};
  const to=tronHex(w.address),got=f.transfers.filter(t=>t.to===to).reduce((n,t)=>n+t.micro,0n),need=BigInt(Math.round(Number(w.usdt)*1e6));
  if(!f.transfers.length)return {ok:false,reason:'This transaction holds no real USDT transfer'};
  if(got===0n)return {ok:false,reason:'This transaction did not send USDT to the player\'s address'};
  if(got<need)return {ok:false,reason:'It sent '+usdt(got)+' USDT; the player must receive '+w.usdt+' USDT'};
  if(f.time&&f.time<w.createdAt-60000)return {ok:false,reason:'This transaction is older than the withdrawal request'};
  return {ok:true,micro:String(got),time:f.time};}

 let scanning=null;
 async function scan(force=false){
  if(!validTronAddress(C.address))return {checked:0};
  expire();const open=C.deposits.filter(d=>d.status==='open'),verifying=C.withdrawals.filter(w=>w.status==='verifying');
  // With no deposit open the wallet is still checked every few minutes, so a payment
  // that comes late is listed for the center instead of being missed.
  if(!force&&!open.length&&!verifying.length&&now()-(C.lastScan||0)<IDLE_SCAN_MS)return {checked:0};
  if(scanning)return scanning;
  scanning=(async()=>{try{
   let paid=0;for(const w of verifying){const r=await payoutCheck(w,w.tx).catch(()=>null);if(!r)continue;if(r.ok){markPaid(w,r);paid++;}else{Object.assign(w,{status:'approved',note:'Payment check failed: '+r.reason});delete C.txs[w.tx];w.tx=null;}}
   // Back to the last good scan, so downtime cannot hide a transfer.
   const since=Math.max(0,Math.min(...open.map(d=>d.createdAt),now()-6*3600000,C.lastScan||Infinity)-10*60000);
   const url=`${apiUrl}/v1/accounts/${C.address}/transactions/trc20?only_confirmed=true&only_to=true&limit=200&contract_address=${USDT_TRC20}&min_timestamp=${since}`;
   // Up to 10 pages of 200 transfers, newest first.
   const rows=[];let next='';for(let page=0;page<10;page++){const r=await fetchImpl(url+(next?'&fingerprint='+encodeURIComponent(next):''),{headers:apiKey?{'TRON-PRO-API-KEY':apiKey}:{}});if(!r.ok)throw Error('TronGrid '+r.status);const b=await r.json();rows.push(...(b.data||[]));next=b.meta?.fingerprint;if(!next||(b.data||[]).length<200)break;}
   let credited=0;
   for(const x of rows){
    const id=x.transaction_id;if(!id||known(id))continue;
    if(x.to!==C.address||x.token_info?.address!==USDT_TRC20||x.type&&x.type!=='Transfer')continue;
    const micro=BigInt(x.value||0),at=Number(x.block_timestamp)||now();
    const real=await onChain(id,micro).catch(()=>null);if(real===null)continue;
    if(!real){console.error('[Suprem Poker] crypto: transfer '+id+' failed the chain check and was ignored');C.txs[id]='fake';C.rejected=[...(C.rejected||[]).slice(-199),{tx:id,micro:String(micro),from:x.from||'',at}];continue;}
    const d=C.deposits.find(d=>d.status==='open'&&BigInt(d.micro)===micro&&at>=d.createdAt-60000&&at<=d.expiresAt);
    // Center credit too low: not marked as known, so it is credited as soon as it can be.
    if(d){if(!creditDeposit(d,id,at,x.from))continue;credited++;}else{C.unmatched.push({tx:id,micro:String(micro),from:x.from,at,status:'open'});C.txs[id]='unmatched';}}
   C.unmatched=[...C.unmatched.filter(x=>x.status!=='open').slice(-300),...C.unmatched.filter(x=>x.status==='open')];C.lastScan=now();save();return {checked:rows.length,credited,paid};
  }finally{scanning=null;}})();
  return scanning;}
 function creditDeposit(d,tx,at,from=''){if(known(tx)&&C.txs[tx]!=='unmatched')return false;const u=db.users.find(x=>x.id===d.userId),c=center();if(!u||!c)return false;const cents=toCents(d.micro,d.rate);centerFunds(db,c,cents,'crypto deposit');if(c.balance<cents){d.note='Center credit is too low';return false;}
  c.balance-=cents;u.balance+=cents;delete d.note;Object.assign(d,{status:'credited',tx,paidAt:at,cents,from:from||d.from||''});C.txs[tx]='deposit';ledger('CRYPTO_DEPOSIT',c.id,u.id,cents,{tx,usdt:usdt(d.micro),rate:d.rate,sender:from||''});return true;}
 function markPaid(w,r){const c=center();Object.assign(w,{status:'paid',paidAt:now(),paidMicro:r.micro,chainTime:r.time||null});delete w.note;C.txs[w.tx]='withdrawal';c.balance+=w.cents;
  ledger('CRYPTO_WITHDRAW',w.userId,c.id,w.cents,{withdrawal:w.id,usdt:w.usdt,tx:w.tx,address:w.address,verified:true});}
 const refund=(w,status,note)=>{const player=db.users.find(v=>v.id===w.userId);Object.assign(w,{status,note:note||null,closedAt:now()});if(player)player.balance+=w.cents;ledger('CRYPTO_WITHDRAW_REFUND',null,w.userId,w.cents,{withdrawal:w.id,reason:status});};

 // ---- What the center sees before it approves a withdrawal ----
 function risk(w){
  const u=db.users.find(x=>x.id===w.userId),flags=[],t=now();
  const deps=C.deposits.filter(d=>d.userId===w.userId&&d.status==='credited'),paid=C.withdrawals.filter(x=>x.userId===w.userId&&x.status==='paid');
  const deposited=deps.reduce((n,d)=>n+(d.cents||0),0),withdrawn=paid.reduce((n,x)=>n+x.cents,0),lastDep=deps.reduce((m,d)=>Math.max(m,d.paidAt||d.createdAt||0),0);
  const created=u?.registeredAt||u?.createdAt||null,play=lastDep?playSince(w.userId,lastDep):null,all=playSince(w.userId,0);
  const others=new Set([...C.withdrawals.filter(x=>x.address===w.address&&x.userId!==w.userId).map(x=>x.username),...C.deposits.filter(d=>d.from===w.address&&d.userId!==w.userId).map(d=>d.username)]);
  const senders=new Set(deps.map(d=>d.from).filter(Boolean)),before=paid.some(x=>x.address===w.address);
  if(!u)flags.push(['danger','The account no longer exists']);else if(u.blocked)flags.push(['danger','The account is blocked']);
  if(others.size)flags.push(['danger','This address is also used by: '+[...others].join(', ')]);
  if(lastDep&&play&&play.hands<10)flags.push(['warn','Only '+play.hands+' hands since the last deposit ('+new Date(lastDep).toISOString().slice(0,10)+'): deposit and withdraw without playing']);
  if(created&&t-created<86400000)flags.push(['warn','New account: less than a day old']);
  if(!before)flags.push(['info','First withdrawal to this address']);
  if(senders.has(w.address))flags.push(['ok','The player deposited from this same address']);
  const profit=withdrawn+w.cents-deposited;if(profit>0)flags.push(['info','Withdrawing €'+(profit/100).toFixed(2)+' more than deposited by crypto']);
  return {account:{created,blocked:!!u?.blocked,balance:(u?.balance||0)/100},deposited:deposited/100,deposits:deps.length,withdrawn:withdrawn/100,withdrawals:paid.length,
   sinceDeposit:play?{hands:play.hands,net:play.net}:null,allTime:all?{hands:all.hands,net:all.net}:null,senders:[...senders],flags,
   level:flags.some(f=>f[0]==='danger')?'danger':flags.some(f=>f[0]==='warn')?'warn':'ok'};}

 // ---- The center's wallet, read from the chain (cached for a minute) ----
 let walletCache={at:0,v:null};
 async function wallet(){if(!validTronAddress(C.address))return null;if(walletCache.v&&now()-walletCache.at<60000&&walletCache.v.address===C.address)return walletCache.v;
  const r=await fetchImpl(apiUrl+'/v1/accounts/'+C.address,{headers:apiKey?{'TRON-PRO-API-KEY':apiKey}:{}}).catch(()=>null);if(!r?.ok)return walletCache.v;const b=await r.json().catch(()=>null),a=b?.data?.[0]||{};
  const t=(a.trc20||[]).find(x=>Object.keys(x)[0]===USDT_TRC20);walletCache={at:now(),v:{address:C.address,usdt:t?usdt(Object.values(t)[0]):'0.00',trx:((Number(a.balance)||0)/1e6).toFixed(2),at:now()}};return walletCache.v;}
 function stats(){const t=now(),sum=(list,since,f)=>list.filter(x=>(x.paidAt||x.createdAt)>=since).reduce((n,x)=>n+f(x),0);
  const deps=C.deposits.filter(d=>d.status==='credited'),paid=C.withdrawals.filter(w=>w.status==='paid');
  const day=t-86400000,week=t-7*86400000,month=t-30*86400000;
  return {deposits:{day:{usdt:usdt(sum(deps,day,d=>Number(d.micro))),count:deps.filter(d=>d.paidAt>=day).length},week:{usdt:usdt(sum(deps,week,d=>Number(d.micro))),count:deps.filter(d=>d.paidAt>=week).length},month:{usdt:usdt(sum(deps,month,d=>Number(d.micro))),count:deps.filter(d=>d.paidAt>=month).length}},
   withdrawals:{day:{usdt:sum(paid,day,w=>Number(w.usdt)).toFixed(2),count:paid.filter(w=>w.paidAt>=day).length},week:{usdt:sum(paid,week,w=>Number(w.usdt)).toFixed(2),count:paid.filter(w=>w.paidAt>=week).length},month:{usdt:sum(paid,month,w=>Number(w.usdt)).toFixed(2),count:paid.filter(w=>w.paidAt>=month).length}},
   toApprove:C.withdrawals.filter(w=>w.status==='pending').length,toPay:C.withdrawals.filter(w=>w.status==='approved').length,verifying:C.withdrawals.filter(w=>w.status==='verifying').length,
   owed:C.withdrawals.filter(w=>HELD.includes(w.status)).reduce((n,w)=>n+Number(w.usdt),0).toFixed(2),unmatched:C.unmatched.filter(x=>x.status==='open').length,fakes:(C.rejected||[]).length};}

 // ---- routes ----
 function route(p,body,u){if(!p.startsWith('/api/crypto'))return undefined;
  if(p==='/api/crypto'){expire();const mine=u.role==='USER';return {config:config(),deposits:mine?C.deposits.filter(d=>d.userId===u.id).slice(-20).reverse().map(pub):[],withdrawals:mine?C.withdrawals.filter(w=>w.userId===u.id).slice(-20).reverse().map(pubW):[]};}
  if(p==='/api/crypto/deposit'){if(u.role!=='USER')fail('Only players deposit with crypto',403);if(!config().enabled)fail('Crypto deposits are not available right now');expire();
   const amount=Number(body.amount);if(!Number.isInteger(amount)||amount<C.minDeposit||amount>(C.maxDeposit||100000))fail(`Choose a whole USDT amount from ${C.minDeposit} to ${C.maxDeposit||100000}`);
   if(C.deposits.filter(d=>d.userId===u.id&&d.status==='open').length>=MAX_OPEN_DEPOSITS)fail('You already have open deposits. Pay one of them or wait until it expires.');
   // A unique amount (+0.01 … +0.99 USDT) ties the transfer to this request.
   const taken=new Set(C.deposits.filter(d=>d.status==='open').map(d=>d.micro));let micro=null;
   const start=crypto.randomInt(0,99);for(let i=0;i<99;i++){const k=(start+i)%99+1,m=String(BigInt(amount)*MICRO+BigInt(k)*10000n);if(!taken.has(m)){micro=m;break;}}
   if(!micro)fail('Too many open deposits for this amount. Choose another amount.');
   const d={id:uid(),userId:u.id,username:u.username,micro,rate:C.rateIn,status:'open',createdAt:now(),expiresAt:now()+DEPOSIT_TTL_MS};C.deposits.push(d);C.deposits=[...C.deposits.filter(x=>x.status==='open'),...C.deposits.filter(x=>x.status!=='open')].sort((a,b)=>a.createdAt-b.createdAt).slice(-5000);save();
   return {...pub(d),address:C.address,network:'TRC20 (Tron)',token:'USDT',euro:toCents(micro,d.rate)/100};}
  if(p==='/api/crypto/check'){if(u.role!=='USER'&&u.role!=='CENTER')fail('Forbidden',403);const k='check:'+u.id;checks[k]=checks[k]||0;if(now()-checks[k]<10000)fail('Please wait a few seconds before checking again',429);checks[k]=now();return scan(u.role==='CENTER').then(r=>({ok:true,...r}));}
  if(p==='/api/crypto/cancel'){const d=C.deposits.find(d=>d.id===body.id&&d.userId===u.id&&d.status==='open');if(!d)fail('Deposit not found',404);d.status='cancelled';save();return {ok:true};}
  if(p==='/api/crypto/withdraw'){if(u.role!=='USER')fail('Only players withdraw with crypto',403);if(!config().enabled)fail('Crypto withdrawals are not available right now');
   const cents=Math.round(Number(body.amount)*100),address=String(body.address||'').trim();
   if(!Number.isSafeInteger(cents)||cents<C.minWithdraw*100)fail(`The minimum withdrawal is €${C.minWithdraw}`);if(cents>u.balance)fail('Not enough credit in your wallet (chips on a table are not included)');
   if(!validTronAddress(address))fail('Enter a valid USDT TRC20 (Tron) address, starting with T');
   if(address===C.address)fail('This is the platform\'s own address. Enter your own USDT TRC20 address.');
   if(address===USDT_TRC20)fail('This is the USDT contract, not a wallet. Enter your own USDT TRC20 address.');
   if(C.withdrawals.some(w=>w.userId===u.id&&HELD.includes(w.status)))fail('You already have a withdrawal waiting');
   if(C.dailyWithdraw>0){const day=C.withdrawals.filter(w=>w.userId===u.id&&w.createdAt>now()-86400000&&!['rejected','cancelled'].includes(w.status)).reduce((n,w)=>n+w.cents,0);if(day+cents>C.dailyWithdraw*100)fail('The limit is €'+C.dailyWithdraw+' a day. You can still withdraw €'+Math.max(0,(C.dailyWithdraw*100-day)/100).toFixed(2)+' today.');}
   u.balance-=cents;const w={id:uid(),userId:u.id,username:u.username,cents,usdt:(cents/100/C.rateOut).toFixed(2),rate:C.rateOut,address,status:'pending',createdAt:now()};C.withdrawals.push(w);
   ledger('CRYPTO_WITHDRAW_HOLD',u.id,null,cents,{withdrawal:w.id,usdt:w.usdt,address});save();return pubW(w);}
  // The player may take back a request the center has not approved yet.
  if(p==='/api/crypto/withdraw/cancel'){const w=C.withdrawals.find(w=>w.id===body.id&&w.userId===u.id);if(!w)fail('Withdrawal not found',404);if(w.status!=='pending')fail('The center already approved it: it can no longer be cancelled');refund(w,'cancelled','Cancelled by the player');save();return {ok:true};}
  // ---- center ----
  if(u.role!=='CENTER')fail('Only the center manages crypto payments',403);
  if(p==='/api/crypto/admin'){expire();const name=id=>db.users.find(x=>x.id===id)?.username;
   return {config:{...config(),enabled:C.enabled},lastScan:C.lastScan,stats:stats(),
    deposits:C.deposits.slice(-300).reverse().map(d=>({...pub(d),username:d.username,note:d.note||null,from:d.from||null,manual:!!d.manual,shared:d.from?C.deposits.some(x=>x.from===d.from&&x.userId!==d.userId):false})),
    unmatched:C.unmatched.filter(x=>x.status==='open').slice(-100).reverse().map(x=>({tx:x.tx,amount:usdt(x.micro),from:x.from,at:x.at,usedBy:[...new Set(C.deposits.filter(d=>d.from&&d.from===x.from).map(d=>d.username))]})),
    rejected:(C.rejected||[]).slice(-50).reverse().map(x=>({tx:x.tx,amount:usdt(x.micro),from:x.from,at:x.at})),
    withdrawals:C.withdrawals.slice(-300).reverse().map(w=>({...pubW(w),username:w.username,approvedBy:w.approvedBy?name(w.approvedBy)||'center':null,...(HELD.includes(w.status)?{risk:risk(w)}:{})}))};}
  if(p==='/api/crypto/wallet')return wallet().then(w=>({wallet:w}));
  if(p==='/api/crypto/settings'){const address=String(body.address??C.address).trim(),num=(v,lo,hi,name)=>{const n=Number(v);if(!Number.isFinite(n)||n<lo||n>hi)fail(name+' is invalid');return n;};
   if(address&&!validTronAddress(address))fail('This is not a valid Tron (TRC20) address');
   if(address===USDT_TRC20)fail('This is the USDT contract, not a wallet');
   Object.assign(C,{address,enabled:!!body.enabled&&!!address,rateIn:num(body.rateIn??C.rateIn,.01,10,'Deposit rate'),rateOut:num(body.rateOut??C.rateOut,.01,10,'Withdrawal rate'),minDeposit:Math.round(num(body.minDeposit??C.minDeposit,1,100000,'Minimum deposit')),minWithdraw:Math.round(num(body.minWithdraw??C.minWithdraw,1,100000,'Minimum withdrawal')),
    maxDeposit:Math.round(num(body.maxDeposit??C.maxDeposit,1,1000000,'Maximum deposit')),dailyWithdraw:Math.round(num(body.dailyWithdraw??C.dailyWithdraw,0,10000000,'Daily withdrawal limit')),confirmations:Math.round(num(body.confirmations??C.confirmations,1,500,'Confirmations'))});
   if(C.maxDeposit<C.minDeposit)fail('The maximum deposit must be at least the minimum');
   ledger('CRYPTO_SETTINGS',u.id,null,0,{address,enabled:C.enabled,rateIn:C.rateIn,rateOut:C.rateOut,maxDeposit:C.maxDeposit,dailyWithdraw:C.dailyWithdraw,confirmations:C.confirmations});save();return {ok:true,config:config()};}
  if(p==='/api/crypto/assign'){const x=C.unmatched.find(x=>x.tx===body.tx&&x.status==='open');if(!x)fail('Transfer not found',404);const player=db.users.find(v=>v.username.toLowerCase()===String(body.username||'').trim().toLowerCase()&&v.role==='USER'&&!v.isBot);if(!player)fail('Player not found',404);
   const d={id:uid(),userId:player.id,username:player.username,micro:x.micro,rate:C.rateIn,status:'open',createdAt:x.at,expiresAt:x.at,manual:true};if(!creditDeposit(d,x.tx,x.at,x.from))fail(d.note||'Could not credit');C.deposits.push(d);x.status='assigned';x.userId=player.id;save();return {ok:true,credited:d.cents/100};}
  if(p==='/api/crypto/ignore'){const x=C.unmatched.find(x=>x.tx===body.tx&&x.status==='open');if(!x)fail('Transfer not found',404);x.status='ignored';C.txs[x.tx]='ignored';save();return {ok:true};}
  if(p==='/api/crypto/withdrawal'){const w=C.withdrawals.find(w=>w.id===body.id);if(!w||!HELD.includes(w.status))fail('Withdrawal not found',404);const c=center();
   if(body.action==='approve'){if(w.status!=='pending')fail('Already approved');const player=db.users.find(v=>v.id===w.userId);if(!player)fail('The account no longer exists');if(player.blocked&&body.force!==true)fail('The account is blocked. Reject the withdrawal, or unblock the account first.');
    Object.assign(w,{status:'approved',approvedAt:now(),approvedBy:u.id});delete w.note;ledger('CRYPTO_WITHDRAW_APPROVE',u.id,w.userId,0,{withdrawal:w.id,usdt:w.usdt,address:w.address});save();return {ok:true,status:w.status};}
   if(body.action==='reject'){if(w.status==='verifying')fail('A payment is being checked on the chain. Wait for the check first.');refund(w,'rejected',String(body.note||'').slice(0,200)||null);save();return {ok:true,status:w.status};}
   if(body.action==='paid'){if(w.status==='pending')fail('Approve the withdrawal before you pay it');if(w.status==='verifying')fail('This payment is already being checked');
    const tx=String(body.tx||'').trim().toLowerCase();if(!/^[0-9a-f]{64}$/.test(tx))fail('Enter the 64-character transaction hash of your payment');
    if(known(tx))fail('This transaction was already used ('+C.txs[tx]+'). Every payment needs its own transaction.');
    Object.assign(w,{status:'verifying',tx,submittedAt:now()});C.txs[tx]='withdrawal';save();
    // Checked on the chain at once; if it is not final yet, the regular scan finishes it.
    return payoutCheck(w,tx).catch(()=>null).then(r=>{if(w.status!=='verifying')return {ok:true,status:w.status};
     if(!r){save();return {ok:true,status:'verifying'};}
     if(r.ok){markPaid(w,r);save();return {ok:true,status:'paid'};}
     Object.assign(w,{status:'approved',note:'Payment check failed: '+r.reason});delete C.txs[tx];w.tx=null;save();fail(r.reason);});}
   fail('Invalid action');}
  fail('Not found',404);}
 const checks={};
 // Money held for withdrawals not paid yet is still the player's: counted in totals.
 const held=()=>C.withdrawals.filter(w=>HELD.includes(w.status)).reduce((n,w)=>n+w.cents,0);
 return {route,scan,held,config};
}
