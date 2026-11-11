import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {cenbDocument} from './cenb.js';

test('CENB domain and paths select the panel without replacing the poker homepage',()=>{
 for(const host of ['cenb.suprempoker.com','CENB.SUPREMPOKER.COM:3000','cenb.suprempoker.com.'])assert.equal(cenbDocument(host,'/'),'cenb/index.html');
 for(const host of ['suprempoker.com','localhost:3000','cenb.suprempoker.com.example.org'])assert.equal(cenbDocument(host,'/'),null);
 for(const route of ['/cenb','/cenb/','/cenb/index.html'])assert.equal(cenbDocument('localhost',route),'cenb/index.html');
 assert.equal(cenbDocument('cenb.suprempoker.com','/api/cenb/status'),null);
});

test('bundled CENB serves on the poker server and retains its own API authentication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cenb-bundled-'));
 process.env.STATE_FILE=path.join(dir,'state.json');process.env.DB_FILE=path.join(dir,'klor.db');process.env.PORT='0';process.env.TABLE_CATALOG='off';process.env.CENTER_PASSWORD='IsolatedTest123!';
 const {server,store,refreshAnalysis}=await import('./server.js');
 if(!server.listening)await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  let r=await fetch(base);assert.match(await r.text(),/<title>Suprem Poker/);
  for(const route of ['/cenb','/cenb/','/cenb/index.html']){r=await fetch(base+route);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(await r.text(),/<title>CENB/);}
  const panel=await new Promise((resolve,reject)=>{http.get(base,{headers:{host:'cenb.suprempoker.com'}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve(text));}).on('error',reject);});assert.match(panel,/<title>CENB/);
  for(const asset of ['/cenb/cenb.js','/cenb/cenb.css','/logo.webp'])assert.equal((await fetch(base+asset)).status,200);
  const js=await(await fetch(base+'/cenb/cenb.js')).text();assert.ok(js.includes("fetch('/api/cenb/'+path"));assert.ok(js.includes("fetch('/api/cenb/status'"));
  r=await fetch(base+'/api/cenb/status',{method:'POST'});assert.equal(r.status,200);assert.equal(typeof(await r.json()).ready,'boolean');
  r=await fetch(base+'/api/cenb/overview',{method:'POST'});assert.equal(r.status,401,'panel assets grant no management access');
 }finally{await new Promise(r=>server.close(r));await refreshAnalysis();store.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
