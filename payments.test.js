import test from 'node:test';
import assert from 'node:assert/strict';
import {createPayments,validTronAddress,USDT_TRC20,tronHex} from './payments.js';

const WALLET='TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',PLAYER_ADDR='TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const fail=(m,code=400)=>{const e=Error(m);e.status=code;throw e;};
function world(){
 let clock=1_800_000_000_000,chain=[];
 const center={id:'c',username:'center',role:'CENTER',balance:10_000_000},p1={id:'p1',username:'ana',role:'USER',balance:0},p2={id:'p2',username:'besi',role:'USER',balance:0},agent={id:'a',username:'ag',role:'AGENT',balance:0};
 const db={users:[center,p1,p2,agent],ledger:[]};
 const TOPIC='ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
 const info=x=>x.missing?{}:{id:x.transaction_id,blockNumber:1,receipt:{result:x.result||'SUCCESS'},log:[{address:tronHex(x.logToken||x.token_info.address),topics:[TOPIC,'0'.repeat(64),'0'.repeat(24)+tronHex(x.logTo||x.to)],data:BigInt(x.logValue??x.value).toString(16).padStart(64,'0')}]};
 const fetchImpl=async(url,opt)=>{if(url.endsWith('/walletsolidity/gettransactioninfobyid')){const id=JSON.parse(opt.body).value,x=chain.find(c=>c.transaction_id===id);return {ok:true,json:async()=>x?info(x):{}};}assert.match(url,new RegExp('/v1/accounts/'+WALLET+'/transactions/trc20'));assert.match(url,/only_confirmed=true/);return {ok:true,json:async()=>({data:chain,success:true})};};
 const pay=createPayments({db,save:()=>{},fail,fetchImpl,now:()=>clock,apiUrl:'https://stub'});
 const send=(micro,{to=WALLET,token=USDT_TRC20,tx=String(chain.length+1).padStart(64,'a'),...extra}={})=>{chain.unshift({transaction_id:tx,token_info:{address:token,decimals:6},block_timestamp:clock,from:'TXyz',to,type:'Transfer',value:String(micro),...extra});return tx;};
 const find=tx=>chain.find(c=>c.transaction_id===tx);
 const total=()=>db.users.reduce((n,u)=>n+u.balance,0)+pay.held();
 pay.route('/api/crypto/settings',{address:WALLET,enabled:true,rateIn:0.9,rateOut:0.9,minDeposit:10,minWithdraw:20},center);
 return {db,pay,center,p1,p2,agent,send,find,total,tick:ms=>{clock+=ms;}};
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

test('a paid deposit waits while center credit is too low, then is credited; nothing is credited twice',async()=>{
 const {db,pay,p1,send,tick}=world();const center=db.users.find(u=>u.role==='CENTER'),had=center.balance;center.balance=100;
 const d=pay.route('/api/crypto/deposit',{amount:50},p1);tick(1000);send(Math.round(Number(d.amount)*1e6));tick(1000);await pay.scan();
 assert.equal(p1.balance,0);assert.equal(db.crypto.deposits[0].note,'Center credit is too low');assert.equal(db.crypto.seen.length,0,'kept for the next try');
 center.balance=had;await pay.scan();const paid=Math.floor(Number(d.amount)*0.9*100);assert.equal(p1.balance,paid);assert.equal(db.crypto.deposits[0].status,'credited');assert.equal(db.crypto.deposits[0].note,undefined);
 await pay.scan(true);assert.equal(p1.balance,paid);
});

test('still too low when the deposit expires: the transfer is listed for the center',async()=>{
 const {db,pay,p1,send,tick}=world();db.users.find(u=>u.role==='CENTER').balance=100;
 const d=pay.route('/api/crypto/deposit',{amount:50},p1);tick(1000);const tx=send(Math.round(Number(d.amount)*1e6));tick(1000);await pay.scan();
 tick(4*3600000);await pay.scan(true);assert.equal(db.crypto.unmatched.find(x=>x.tx===tx)?.status,'open');assert.equal(p1.balance,0);
});

test('a late payment is found without any open deposit, even after downtime; open ones are never trimmed away',async()=>{
 const {db,pay,p1,send,tick}=world();const d=pay.route('/api/crypto/deposit',{amount:50},p1);await pay.scan();
 tick(4*3600000);const tx=send(Math.round(Number(d.amount)*1e6));tick(6*60000);await pay.scan();
 assert.equal(db.crypto.unmatched.find(x=>x.tx===tx)?.status,'open','listed by the automatic scan');assert.equal(p1.balance,0);
 const last=db.crypto.lastScan;tick(60000);await pay.scan();assert.equal(db.crypto.lastScan,last,'no extra requests between idle scans');
 tick(20*3600000);const late=send(25_000_000);tick(10*3600000);await pay.scan();assert.equal(db.crypto.unmatched.find(x=>x.tx===late)?.status,'open','30 hours of downtime hide nothing');
 for(let i=0;i<400;i++)db.crypto.unmatched.push({tx:'old'+i,micro:'1',at:1,status:'ignored'});send(26_000_000);tick(6*60000);await pay.scan();assert.ok(db.crypto.unmatched.some(x=>x.tx===tx&&x.status==='open'));
});

test('withdrawals hold the credit until the center pays or rejects',()=>{
 const {pay,center,p1,total}=world();p1.balance=10000;const start=total();
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:50,address:'Tbad'},p1),/valid USDT TRC20/);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:500,address:PLAYER_ADDR},p1),/Not enough credit/);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:5,address:PLAYER_ADDR},p1),/minimum withdrawal/);
 const w=pay.route('/api/crypto/withdraw',{amount:45,address:PLAYER_ADDR},p1);assert.equal(p1.balance,5500);assert.equal(w.usdt,'50.00');assert.equal(total(),start);
 assert.throws(()=>pay.route('/api/crypto/withdraw',{amount:20,address:PLAYER_ADDR},p1),/already have a withdrawal/);
 assert.throws(()=>pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:'123'},center),/64-character/);
 const before=center.balance;pay.route('/api/crypto/withdrawal',{id:w.id,action:'paid',tx:'b'.repeat(64)},center);assert.equal(center.balance,before+4500);assert.equal(total(),start);
 const w2=pay.route('/api/crypto/withdraw',{amount:30,address:PLAYER_ADDR},p1);pay.route('/api/crypto/withdrawal',{id:w2.id,action:'reject',note:'Wrong address'},center);
 assert.equal(p1.balance,5500,'a rejected withdrawal returns the credit');assert.equal(total(),start);
});

test('only players use deposits; settings belong to the center; disabled means no new requests',()=>{
 const {pay,center,agent,p1}=world();
 assert.throws(()=>pay.route('/api/crypto/deposit',{amount:20},agent),/Only players/);
 assert.throws(()=>pay.route('/api/crypto/settings',{address:WALLET,enabled:true},p1),/Only the center/);
 assert.throws(()=>pay.route('/api/crypto/settings',{address:'TNotAnAddress',enabled:true},center),/valid Tron/);
 assert.throws(()=>pay.route('/api/crypto/deposit',{amount:5},p1),/at least 10/);
 pay.route('/api/crypto/settings',{address:WALLET,enabled:false},center);assert.throws(()=>pay.route('/api/crypto/deposit',{amount:20},p1),/not available/);
 assert.equal(pay.route('/api/crypto',{},p1).config.enabled,false);
});
