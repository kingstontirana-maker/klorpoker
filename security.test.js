import test from 'node:test';
import assert from 'node:assert/strict';
import {seatedFromSameDevice,descendants,recordSeen,sharedGroups,pairSignals,handFor,handSummaryFor} from './security.js';

test('descendants reach every level and stop at the account',()=>{
 const users=[{id:'c'},{id:'a',parentId:'c'},{id:'g',parentId:'a'},{id:'p',parentId:'g'},{id:'x',parentId:'c'}];
 assert.deepEqual(descendants(users,'a').map(u=>u.id).sort(),['g','p']);assert.deepEqual(descendants(users,'p'),[]);
});
test('addresses and devices: newest first, limited, and junk devices ignored',()=>{
 const u={};for(const ip of ['1','2','1','3','4','5','6'])recordSeen(u,ip,'device-abc-123');assert.deepEqual(u.seenIps,['6','5','4','3','1']);assert.deepEqual(u.seenDevices,['device-abc-123']);
 recordSeen(u,'','<script>');assert.equal(u.seenDevices.length,1);
});
test('one device, one account at a table',()=>{
 const users={a:{id:'a',seenDevices:['device-aaaa']},b:{id:'b'},c:{id:'c',seenDevices:['device-aaaa']},bot:{id:'bot'}},find=id=>users[id];
 const t={seats:[{userId:'a',device:'device-aaaa'},null,{userId:'bot',isBot:true,device:'device-bbbb'}]};
 assert.equal(seatedFromSameDevice(t,users.b,'device-aaaa',find),true,'the device of a seat');
 assert.equal(seatedFromSameDevice(t,users.b,'device-cccc',find),false,'another device');
 assert.equal(seatedFromSameDevice(t,users.a,'device-aaaa',find),false,'the same account is not a second account');
 assert.equal(seatedFromSameDevice(t,users.c,'device-new1',find),true,'a new browser, but this account was seen on the device of the seat');
 assert.equal(seatedFromSameDevice({seats:[{userId:'c'}]},users.b,'device-aaaa',find),true,'a seated account was seen on this device');
 assert.equal(seatedFromSameDevice(t,users.b,'device-bbbb',find),false,'bots are left out');
 assert.equal(seatedFromSameDevice(t,users.b,undefined,find),false,'no device sent, nothing to compare');
 assert.equal(seatedFromSameDevice(t,users.b,'no',find),false,'junk is ignored');
});

test('shared groups cover players only',()=>{
 const users=[{id:'1',role:'USER',username:'a',seenIps:['9']},{id:'2',role:'USER',username:'b',seenIps:['9']},{id:'3',role:'AGENT',username:'c',seenIps:['9']},{id:'4',role:'USER',username:'d',seenIps:['8']}];
 assert.deepEqual(sharedGroups(users,'seenIps'),[{value:'9',users:['a','b']}]);
});
test('one sign alone is not flagged; signs together are, the strongest first',()=>{
 const users=[{id:'a',username:'a',seenDevices:['dev-1234'],seenIps:['1']},{id:'b',username:'b',seenDevices:['dev-1234'],seenIps:['1']},{id:'c',username:'c',seenIps:['2']},{id:'d',username:'d',seenIps:['3']},{id:'e',username:'e',seenIps:['4']},{id:'f',username:'f',seenIps:['5']}];
 const hands=new Map([['a',30],['b',30],['c',100],['d',500],['e',40],['f',40]]);
 const out=pairSignals(users,[
  {a:'c',b:'d',hands:100,netA:50,netB:-50},       // regulars: one sign (together for c), small money
  {a:'e',b:'f',hands:35,netA:300,netB:-300},      // together, and money one way
  {a:'a',b:'b',hands:25,netA:1,netB:-1},          // same device, same address, together
  {a:'a',b:'c',hands:5,netA:900,netB:-900},       // too few hands to say anything
 ],hands);
 assert.deepEqual(out.map(s=>s.players.join()),['a,b','e,f']);
 assert.equal(out[0].level,'high');assert.equal(out[1].level,'medium');assert.equal(out[1].winner,'e');assert.equal(out[1].flow,300);
});
test('a player sees their cards and shown cards only, never ids or bot marks',()=>{
 const h={id:1,startedAt:5,table:'T',game:'holdem',hand:2,sb:1,bb:2,board:['2h'],pot:10,showdown:true,winners:['me'],shown:[{username:'me',cards:['Ah','Kh']},{username:'open',cards:['2c','2d']}],winningHands:{me:{rank:'x'},hidden:{rank:'y'}},players:[{userId:'1',username:'me',cards:['Ah','Kh'],result:5},{userId:'2',username:'open',cards:['2c','2d'],result:-1},{userId:'3',username:'hidden',bot:true,cards:['Qs','Qd'],result:-4}]};
 const f=handFor(h,'1'),text=JSON.stringify(f);assert.deepEqual(f.players.map(p=>p.cards.length),[2,2,0]);assert.ok(!text.includes('Qs')&&!text.includes('userId')&&!text.includes('"bot"'));assert.deepEqual(Object.keys(f.winningHands),['me']);
 const s=handSummaryFor(h,'3');assert.deepEqual(s.cards,['Qs','Qd'],'your own cards, even when folded or mucked');assert.equal(s.won,false);assert.equal(h.players[2].bot,true,'the stored hand is not changed');
});
