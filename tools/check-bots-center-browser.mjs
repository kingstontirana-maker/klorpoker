// Isolated static preview and API fixtures; never opens the production database.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.writeHead(200,{'content-type':mime[path.extname(file)]||'text/plain','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,debug='http://127.0.0.1:9239';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cenb-browser-'));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9239','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket,target;
try{
 let ready=false;for(let i=0;i<80;i++){try{await fetch(debug+'/json/version');ready=true;break;}catch{await wait(100);}}
 assert.ok(ready,'Chrome debugging ready');
 target=await (await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let seq=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
 const until=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Timed out: '+expression);};
 await cdp('Page.enable');await cdp('Runtime.enable');
 const state={user:{role:'CENTER',balance:1000},tables:[{id:'1',name:'Fixture',minBuyin:20,maxBuyin:200}]};
 const bot={id:'bot-fixture',name:'FixtureBot',enabled:false,risk:'medium',tableId:'1',buyin:40,stopLoss:40,stopWin:50,equity:100,session:0,house:0,rakePaid:0,bluffPercent:9,maxHandPercent:65,thinkMinMs:1200,thinkMaxMs:4000,bonusPaid:0,bonusPercent:0,bonusBase:100,status:'Stopped'};
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('cenbToken','isolated-preview');window.confirm=()=>true;window.__mutations=[];window.__bot=${JSON.stringify(bot)};const originalFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{if(String(url).startsWith('/api/')){const route=String(url),body=options.body?JSON.parse(options.body):{};if(options.method==='POST'){window.__mutations.push({route,body});if(route.endsWith('/status'))__bot.enabled=body.enabled;if(route.endsWith('/configure'))Object.assign(__bot,body);if(route.endsWith('/bonus')){__bot.bonusPercent=Number(body.percent);__bot.bonusPaid=__bot.bonusBase*Number(body.percent)/100;}}const value=route.endsWith('/bots')?[__bot]:route.endsWith('/bots/guard')?{dailyLimit:50,today:0,day:'test',stopped:false}:${JSON.stringify(state)};return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}return originalFetch(url,options);};`});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:origin+'/bots-center.html'});
 await until("!!document.querySelector('#botList [data-id]')&&!document.querySelector('#dashboard').hidden");
 assert.equal(await evaluate("!!document.querySelector('#simulationPanel')"),false,'no simulation panel');
 assert.equal(await evaluate("document.querySelector('[data-config]').elements.bluffPercent.value"),'9');
 await evaluate("(()=>{const f=document.querySelector('[data-config]');f.elements.risk.value='high';f.elements.risk.dispatchEvent(new Event('change',{bubbles:true}));})()");
 assert.equal(await evaluate("document.querySelector('[data-config]').elements.maxHandPercent.value"),'85');
 assert.equal(await evaluate("document.querySelector('[data-config]').elements.bluffPercent.value"),'16');
 await evaluate("document.querySelector('[data-config] button').click()");
 await until("__mutations.some(x=>x.route==='/api/bots/configure')&&!document.querySelector('[data-config] button').disabled");
 const config=await evaluate("__mutations.find(x=>x.route==='/api/bots/configure').body");assert.equal(config.id,'bot-fixture');assert.equal(config.risk,'high');assert.equal(config.bluffPercent,'16');
 await evaluate("document.querySelector('.bonus-panel').open=true;const f=document.querySelector('[data-bonus]');f.elements.percent.value='20';f.requestSubmit(f.querySelector('button'))");
 await until("__mutations.some(x=>x.route==='/api/bots/bonus')");
 assert.equal(await evaluate("__mutations.find(x=>x.route==='/api/bots/bonus').body.percent"),'20');
 assert.ok(await evaluate("document.querySelector('.bonus-panel').textContent.includes('CENTER')"));
 await evaluate("document.querySelector('[data-action=toggle]').click()");
 await until("document.querySelector('[data-config] fieldset').disabled");
 assert.equal(await evaluate("__mutations.find(x=>x.route==='/api/bots/status').body.enabled"),true);
 assert.equal(await evaluate("document.querySelector('[data-bonus] button').disabled"),false,'bonus remains separate from active bot configuration');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait(200);
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'fits mobile');
 await evaluate("document.querySelector('#logout').click()");
 await until("document.querySelector('#dashboard').hidden");
 assert.equal(await evaluate("document.querySelector('#botList').children.length"),0);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('header')).display"),'none');
 assert.deepEqual(errors,[]);
 console.log('PASS: live bot controls, style defaults, declared bonus request, active bot lock, mobile and logout.');
}finally{
 socket?.close();if(target)await fetch(debug+'/json/close/'+target.id).catch(()=>{});chrome.kill();await new Promise(resolve=>server.close(resolve));
}
