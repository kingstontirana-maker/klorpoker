import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createPayments,validTronAddress,USDT_TRC20,tronHex} from './payments.js';
// A real, valid Tron address (base58check) for the tests.
function tronAddress(seed){const body=Buffer.concat([Buffer.from([0x41]),crypto.createHash('sha256').update(seed).digest().subarray(0,20)]),sum=crypto.createHash('sha256').update(crypto.createHash('sha256').update(body).digest()).digest().subarray(0,4),bytes=Buffer.concat([body,sum]);const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+bytes.toString('hex')),out='';while(n>0n){out=A[Number(n%58n)]+out;n/=58n;}return out;}

const WALLET='TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',PLAYER_ADDR=tronAddress('player'),OTHER_ADDR=tronAddress('other');
const fail=(m,code=400)=>{const e=Error(m);e.status=code;throw e;};
function world(){
 let clock=1_800_000_000_000,chain=[];
 const center={id:'c',username:'center',role:'CENTER',balance:10_000_000},p1={id:'p1',username:'ana',role:'USER',balance:0},p2={id:'p2',username:'besi',role:'USER',balance:0},agent={id:'a',username:'ag',role:'AGENT',balance:0};
 const db={users:[center,p1,p2,agent],ledger:[]};
 const TOPIC='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
 const info=x=>x.missing?{}:{id:x.transaction_id,blockNumber:x.block??1,blockTimeStamp:x.block_timestamp,receipt:{result:x.result||'SUCCESS'},log:[{address:tronHex(x.logToken||x.token_info.address),topics:[TOPIC,'0'.repeat(64),'0'.repeat(24)+tronHex(x.logTo||x.to)],data:BigInt(x.logValue??x.value).toString(16).padStart(64,'0')}]};
 let top=1000;const fetchImpl=async(url,opt)=>{if(url.endsWith('/walletsolidity/getnowblock'))return {ok:true,json:async()=>({block_header:{raw_data:{number:top}}})};if(url.endsWith('/walletsolidity/gettransactioninfobyid')){const id=JSON.parse(opt.body).value,x=chain.find(c=>c.transaction_id===id);return {ok:true,json:async()=>x?info(x):{}};}assert.match(url,new RegExp('/v1/accounts/'+WALLET+'/transactions/trc20'));assert.match(url,/only_confirmed=true/);return {ok:true,json:async()=>({data:chain,success:true})};};
 const pay=createPayments({db,save:()=>{},fail,fetchImpl,now:()=>clock,apiUrl:'https://stub'});
 const send=(micro,{to=WALLET,token=USDT_TRC20,tx=String(chain.length+1).padStart(64,'a'),...extra}={})=>{chain.unshift({transaction_id:tx,token_info:{address:token,decimals:6},block_timestamp:clock,from:'TXyz',to,type:'Transfer',value:String(micro),...extra});return tx;};
 const find=tx=>chain.find(c=>c.transaction_id===tx);
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+pay.held();
 pay.route('/api/crypto/settings',{address:WALLET,enabled:true,rateIn:0.9,rateOut:0.9,minDeposit:10,minWithdraw:20},center);
 return {db,pay,center,p1,p2,agent,send,find,total,tick:ms=>{clock+=ms;},setTop:n=>{top=n;}};
}

test('a transfer counts only when the chain itself confirms it',async()=>{
 const {pay,center,p1,send,find,total}=world();const start=total();
 const amount=d=>Math.round(Number(d.amount)*1e6);
 // A failed transfer, a fake token behind the real name, another wallet, or another amount in the log: never credited.
 for(const extra of [{result:'REVERT'},{logToken:'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7'},{logTo:'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'},{logValue:'1'}]){
  const d=pay.route('/api/crypto/deposit',{amount:20},p1);send(amount(d),extra);await pay.scan(true);assert.equal(p1.balance,0,JSON.stringify(extra));
  pay.route('/api/crypto/cancel',{id:d.id},p1);}
 assert.equal(pay.route('/api/crypto/admin',{},center).unmatched.length,0,'a fake is not even listed for the centre');
 // Not confirmed yet: it waits, and counts once the chain confirms it.
 const d=pay.route('/api/crypto/deposit',{amount:20},p1),tx=send(amount(d),{missing:true});await pay.scan(true);assert.equal(p1.balance,0);
 find(tx).missing=false;await pay.scan(true);assert.ok(p1.balance>0,'credited after confirmation');assert.equal(total(),start);
});

test('tron addresses are checked with their checksum',()=>{
 assert.equal(tronHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'),'a614f803b6fd780986a42c78ec9c7f77e6ded13c','the official USDT contract');assert.equal(tronHex('nope'),'');
 assert.ok(validTronAddress(WALLET));assert.ok(validTronAddress(PLAYER_ADDR));
 assert.ok(!validTronAddress('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU8'),'one wrong character');assert.ok(!validTronAddress('0x1234'));assert.ok(!validTronAddress(''));
});

test('a deposit is credited only for its exact unique amount, once',async()=>{
 const {pay,center,p1,p2,send,total}=world();const start=total();
 const d=pay.route('/api/crypto/deposit',{amount:50},p1);assert.equal(d.address,WALLET);assert.match(d.amount,/^50\.\d\d$/);assert.notEqual(d.amount,'50.00');
 const d2=pay.route('/api/crypto/deposit',{amount:50},p2);assert.notEqual(d2.amount,d.amount,'two players never get the same amount');
 // A transfer with a different amount, or another token, credits nobody.
 send(50_000_000);send(Math.round(Number(d.amount)*1e6),{token:'TOtherToken1111111111111111111111'});await pay.scan();
 assert.equal(p1.balance,0);assert.equal(p2.balance,0);
 const tx=send(Math.round(Number(d.amount)*1e6));await pay.scan();
 assert.equal(p1.balance,Math.floor(Number(d.amount)*0.9*100),'credited in euro at the deposit rate');assert.equal(p2.balance,0);
 await pay.scan();assert.equal(p1.balance,Math.floor(Number(d.amount)*0.9*100),'the same transfer is never counted twice');
 assert.equal(total(),start,'credit moves from the center to the player');
 const mine=pay.route('/api/crypto',{},p1);assert.equal(mine.deposits[0].status,'credited');assert.equal(mine.deposits[0].tx,tx);
 const admin=pay.route('/api/crypto/admin',{},center);assert.equal(admin.unmatched.length,1,'the wrong-amount transfer waits for the center');
});

test('expired deposits are not credited automatically; the center can assign a transfer',async()=>{
 const {pay,center,p1,send,tick}=world();
 const d=pay.route('/api/crypto/deposit',{amount:20},p1);tick(4*3600000);const tx=send(Math.round(Number(d.amount)*1e6));await pay.scan(true);
 assert.equal(p1.balance,0);assert.equal(pay.route('/api/crypto',{},p1).deposits[0].status,'expired');
 assert.throws(()=>pay.route('/api/crypto/assign',{tx,username:'ana'},p1),/Only the center/);
 pay.route('/api/crypto/assign',{tx,username:'ana'},center);assert.equal(p1.balance,Math.floor(Number(d.amount)*0.9*100));
 assert.throws(()=>pay.route('/api/crypto/assign',{tx,username:'ana'},center),/not found/,'one transfer, one credit');
});

test('a paid deposit is credited even when the center wallet is low: the missing credit is created; nothing is credited twice',async()=>{
 const {db,pay,p1,send,tick}=world();const center=db.users.find(u=>u.role==='CENTER');center.balance=100;
 const d=pay.route('/api/crypto/deposit',{amount:50},p1);tick(1000);send(Math.round(Number(d.amount)*1e6));tick(1000);await pay.scan();
 const paid=Math.floor(Number(d.amount)*0.9*100);assert.equal(p1.balance,paid);assert.equal(db.crypto.deposits[0].status,'credited');
 assert.equal(db.ledger.find(x=>x.type==='MINT')?.amount,paid-100,'only the missing part was created');assert.equal(center.balance,0);
 await pay.scan(true);assert.equal(p1.balance,paid,'credited once');
});

test('a deposit is never stuck on the center wallet: it is credited at once',async()=>{
 const {db,pay,p1,send,tick}=world();db.users.find(u=>u.role==='CENTER').balance=0;
 const d=pay.route('/api/crypto/deposit',{amount:50},p1);tick(1000);const tx=send(Math.round(Number(d.amount)*1e6));tick(1000);await pay.scan();
 tick(4*3600000);await pay.scan(true);assert.ok(!db.crypto.unmatched.some(x=>x.tx===tx),'nothing left waiting');assert.ok(p1.balance>0);
});

test('a late payment is found without any open deposit, even after downtime; open ones are never trimmed away',async()=>{
 const {db,pay,p1,send,tick}=world();const d=pay.route('/api/crypto/deposit',{amount:50},p1);await pay.scan();
 tick(4*3600000);const tx=send(Math.round(Number(d.amount)*1e6));tick(6*60000);await pay.scan();
 assert.equal(db.crypto.unmatched.find(x=>x.tx===tx)?.status,'open','listed by the automatic scan');assert.equal(p1.balance,0);
 const last=db.crypto.lastScan;tick(60000);await pay.scan();assert.equal(db.crypto.lastScan,last,'no extra requests between idle scans');
 tick(20*3600000);const late=send(25_000_000);tick(10*3600000);await pay.scan();assert.equal(db.crypto.unmatched.find(x=>x.tx===late)?.status,'open','30 hours of downtime hide nothing');
 for(let i=0;i<400;i++)db.crypto.unmatched.push({tx:'old'+i,micro:'1',at:1,status:'ignored'});send(26_000_000);tick(6*60000);await pay.scan();assert.ok(db.crypto.unmatched.some(x=>x.tx===tx&&x.status==='open'));
});

test('withdrawals hold the credit; the center approves, pays, and the chain proves the payment',async()=>{
 const {pay,center,p1,total,send,setTop,tick}=world();p1.balance=10000;const start=total();
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:50,address:'Tbad'},p1),/valid USDT TRC20/);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:50,address:WALLET},p1),/platform's own address/);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:50,address:USDT_TRC20},p1),/USDT contract/);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:500,address:PLAYER_ADDR},p1),/Not enough credit/);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:5,address:PLAYER_ADDR},p1),/minimum withdrawal/);
 const w=pay.route('/api/crypto/withdraw',{amount:45,address:PLAYER_ADDR},p1);assert.equal(p1.balance,5500);assert.equal(w.usdt,'50.00');assert.equal(w.status,'pending');assert.equal(total(),start);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:20,address:PLAYER_ADDR},p1),/already have a withdrawal/);
 // No payment before the centre approves.
 await assert.rejects(async()=>pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:'b'.repeat(64)},center),/Approve the withdrawal/);
 pay.route('/api/crypto/withdrawal',{id:w.id,action:'approve'},center);
 assert.throws(()=>pay.route('/api/crypto/withdraw/cancel',{id:w.id},p1),/already approved/,'approved: the player can no longer cancel');
 await assert.rejects(async()=>pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:'123'},center),/64-character/);
 // A transaction that sends less, or to someone else, or a fake token: refused, the withdrawal stays to pay.
 const short=send(49_000_000,{to:PLAYER_ADDR}),wrong=send(50_000_000,{to:OTHER_ADDR}),fake=send(50_000_000,{to:PLAYER_ADDR,logToken:WALLET});
 await assert.rejects(pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:short},center),/sent 49.00 USDT/);
 await assert.rejects(pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:wrong},center),/did not send USDT to the player/);
 await assert.rejects(pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:fake},center),/no real USDT/);
 assert.equal(pay.route('/api/crypto/admin',{},center).withdrawals[0].status,'approved');
 // Not final yet: it waits as verifying, and becomes paid when the chain confirms it.
 setTop(10);tick(20000);const good=send(50_000_000,{to:PLAYER_ADDR});const before=center.balance;
 assert.equal((await pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:good},center)).status,'verifying');assert.equal(center.balance,before);assert.equal(total(),start,'still held');
 setTop(1000);tick(20000);await pay.scan();assert.equal(pay.route('/api/crypto/admin',{},center).withdrawals[0].status,'paid');assert.equal(center.balance,before+4500);assert.equal(total(),start);
 // One transaction pays one withdrawal only.
 const w2=pay.route('/api/crypto/withdraw',{amount:30,address:PLAYER_ADDR},p1);pay.route('/api/crypto/withdrawal',{id:w2.id,action:'approve'},center);
 await assert.rejects(async()=>pay.route('/api/crypto/withdrawal',{id:w2.id,action:'paid',tx:good},center),/already used/);
 pay.route('/api/crypto/withdrawal',{id:w2.id,action:'reject',note:'Wrong address'},center);
 assert.equal(p1.balance,5500,'a rejected withdrawal returns the credit');assert.equal(total(),start);
 // The player can cancel a request the centre has not approved yet.
 const w3=pay.route('/api/crypto/withdraw',{amount:20,address:PLAYER_ADDR},p1);pay.route('/api/crypto/withdraw/cancel',{id:w3.id},p1);assert.equal(p1.balance,5500);assert.equal(total(),start);
});

test('flash USDT and fakes never count; the centre sees the risks before it approves',async()=>{
 const {db,pay,center,p1,p2,send,total}=world();const start=total();
 const d=pay.route('/api/crypto/deposit',{amount:50},p1),micro=Math.round(Number(d.amount)*1e6);
 // "Flash": listed by the indexer, but no final block holds it. Never credited.
 send(micro,{missing:true});await pay.scan(true);assert.equal(p1.balance,0);
 // A final block, but not deep enough yet: waits.
 db.crypto.confirmations=20;const shallow=send(micro,{block:990});await pay.scan(true);assert.equal(p1.balance,0);assert.ok(!db.crypto.txs[shallow],'not decided yet');
 // A token from another contract with the same name: rejected and listed apart.
 send(micro,{logToken:WALLET});await pay.scan(true);assert.equal(p1.balance,0);assert.equal(pay.route('/api/crypto/admin',{},center).rejected.length,1);
 // Deep enough now: credited once, with the address that sent it.
 db.crypto.confirmations=5;await pay.scan(true);assert.ok(p1.balance>0);const once=p1.balance;await pay.scan(true);assert.equal(p1.balance,once);
 assert.equal(db.crypto.deposits.find(x=>x.tx===shallow).from,'TXyz');assert.equal(total(),start);
 // The transaction list is kept for good, even when old records are trimmed away.
 db.crypto.deposits=[];db.crypto.unmatched=[];const again=pay.route('/api/crypto/deposit',{amount:50},p1);db.crypto.deposits.find(x=>x.id===again.id).micro=String(micro);await pay.scan(true);assert.equal(p1.balance,once,'never credited twice');
 // Risk: the address p1 withdraws to was used by p2 too.
 p2.balance=5000;const o=pay.route('/api/crypto/withdraw',{amount:20,address:OTHER_ADDR},p2);pay.route('/api/crypto/withdrawal',{id:o.id,action:'reject'},center);
 const w=pay.route('/api/crypto/withdraw',{amount:20,address:OTHER_ADDR},p1),r=pay.route('/api/crypto/admin',{},center).withdrawals.find(x=>x.id===w.id).risk;
 assert.equal(r.level,'danger');assert.ok(r.flags.some(f=>/also used by: besi/.test(f[1])));
 // A blocked account cannot be approved by mistake.
 p1.blocked=true;assert.throws(()=>pay.route('/api/crypto/withdrawal',{id:w.id,action:'approve'},center),/blocked/);
});

test('only players use deposits; settings belong to the center; disabled means no new requests',()=>{
 const {pay,center,agent,p1}=world();
 assert.throws(()=>pay.route('/api/crypto/deposit',{amount:20},agent),/Only players/);
 assert.throws(()=>pay.route('/api/crypto/settings',{address:WALLET,enabled:true},p1),/Only the center/);
 assert.throws(()=>pay.route('/api/crypto/settings',{address:'TNotAnAddress',enabled:true},center),/valid Tron/);
 assert.throws(()=>pay.route('/api/crypto/deposit',{amount:5},p1),/from 10 to/);
 pay.route('/api/crypto/settings',{address:WALLET,enabled:false},center);assert.throws(()=>pay.route('/api/crypto/deposit',{amount:20},p1),/not available/);
 assert.equal(pay.route('/api/crypto',{},p1).config.enabled,false);
});
