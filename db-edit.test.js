import test from 'node:test';
import assert from 'node:assert/strict';
import {createDbEditor,parseCell,EDIT_RULES} from './db-edit.js';

const fail=(m,s=400)=>{throw Object.assign(Error(m),{status:s});};
const world=()=>{const db={users:[{id:'center',username:'center',role:'CENTER',parentId:null,balance:1000,salt:'s',passHash:'h'},{id:'a',username:'agent',role:'AGENT',parentId:'center',balance:0,salt:'s',passHash:'h'},{id:'p',username:'pl',role:'USER',parentId:'a',balance:100,salt:'s',passHash:'h'}],ledger:[],tables:[],moneyTotal:1100,rakePercent:5};
 let n=0;const edit=createDbEditor({db,store:{},save:()=>{},fail,uid:()=>'id'+(++n),hash:(p,s)=>p+s,secret:()=>'salt',runtime:new Map(),makeTable:()=>{},tableIdle:()=>true,tableSizes:[2,4,5,6,9],gameTypes:['holdem','omaha'],validColor:()=>true,endKey:()=>{},endUserSessions:()=>{}});
 return {db,edit,by:db.users[0]};};

test('database edits: text becomes values again',()=>{
 assert.equal(parseCell('15000'),15000);assert.equal(parseCell('4.5'),4.5);assert.equal(parseCell('true'),true);assert.equal(parseCell('NULL'),null);
 assert.deepEqual(parseCell('{"a":1}'),{a:1});assert.equal(parseCell('007'),'007','leading zeros stay text');assert.equal(parseCell('h_player'),'h_player');
});

test('database edits: a balance changed by hand is an ADJUST and the money total follows',()=>{
 const {db,edit,by}=world();edit(by,{table:'users',action:'update',key:'p',values:{balance:'250'}});
 assert.equal(db.users[2].balance,250);assert.equal(db.moneyTotal,1250);assert.deepEqual(db.ledger.map(x=>[x.type,x.to,x.amount]),[['ADJUST','p',150]]);
 edit(by,{table:'users',action:'delete',key:'p'});assert.equal(db.moneyTotal,1000,'deleting an account removes its money from the total');assert.equal(db.users.length,2);
});

test('database edits: the rules that keep the platform working',()=>{
 const {db,edit,by}=world();
 assert.throws(()=>edit(by,{table:'users',action:'delete',key:'center'}),/cannot be deleted/);
 assert.throws(()=>edit(by,{table:'users',action:'update',key:'center',values:{role:'USER'}}),/keeps its role/);
 assert.throws(()=>edit(by,{table:'users',action:'delete',key:'a'}),/accounts below it/);
 assert.throws(()=>edit(by,{table:'users',action:'update',key:'a',values:{parentId:'p'}}),/below itself/);
 assert.throws(()=>edit(by,{table:'users',action:'update',key:'p',values:{balance:'-1'}}),/whole number/);
 edit(by,{table:'users',action:'update',key:'p',values:{salt:'x',passHash:'y'}});assert.equal(db.users[2].passHash,'h','passwords are never written from here');
 assert.throws(()=>edit(by,{table:'users',action:'insert',values:{username:'nopass',role:'USER',parentId:'a'}}),/password/);
 edit(by,{table:'users',action:'insert',values:{username:'newbie',role:'USER',parentId:'a',balance:'40',password:'Abcdefg1'}});assert.equal(db.users.at(-1).passHash,'Abcdefg1salt');assert.equal(db.moneyTotal,1140);
 assert.throws(()=>edit(by,{table:'settings',action:'update',key:'rakePercent',values:{value:'40'}}),/0–15/);
 assert.throws(()=>edit(by,{table:'settings',action:'delete',key:'moneyTotal'}),/needs this setting/);
 assert.throws(()=>edit(by,{table:'audit',action:'delete',key:1}),/cannot be changed/);
 assert.throws(()=>edit(by,{table:'ledger',action:'delete',key:1}),/not added or removed/);
 assert.equal(EDIT_RULES.meta.update,false);
});
