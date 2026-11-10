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
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('cenbToken','isolated-preview');window.__mutations=[];const originalFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{if(String(url).startsWith('/api/')){if(options.method==='POST')window.__mutations.push(String(url));const value=String(url).endsWith('/bots')?[]:String(url).endsWith('/bots/guard')?{dailyLimit:50,today:0,day:'test',stopped:false}:${JSON.stringify(state)};return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}return originalFetch(url,options);};`});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:origin+'/bots-center.html'});
 await until("!document.querySelector('#dashboard').hidden");
 await evaluate("import('/bot-simulation-panel.js')");
 await until("!!document.querySelector('#simulationForm')");
 await evaluate("document.querySelector('#simulationPanel').open=true;document.querySelector('#simulationForm').elements.hands.value='80';document.querySelector('#simulationForm').requestSubmit()");
 await until("!document.querySelector('#simulationExport').hidden");
 assert.ok(await evaluate("document.querySelector('#simulationResult').textContent.includes('Kreditet:')"));
 assert.equal(await evaluate("document.querySelectorAll('#simulationResult .stat').length"),8);
 assert.equal(await evaluate('window.__mutations.length'),0,'simulation never mutates API');
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait(200);
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'fits mobile');
 await evaluate("document.querySelector('#simulationForm').elements.hands.value='2000';document.querySelector('#simulationForm').requestSubmit();document.querySelector('#simulationCancel').click()");
 assert.equal(await evaluate("document.querySelector('#simulationRun').disabled"),false);
 assert.ok(await evaluate("document.querySelector('#simulationStatus').textContent.includes('anulua')"));
 await evaluate("document.querySelector('#dashboard').hidden=true");await wait(100);
 assert.equal(await evaluate("document.querySelector('#simulationResult').textContent"),'');
 assert.deepEqual(errors,[]);
 console.log('PASS: browser worker, report, no API mutations, mobile fit, cancel and logout cleanup.');
}finally{
 socket?.close();if(target)await fetch(debug+'/json/close/'+target.id).catch(()=>{});chrome.kill();await new Promise(resolve=>server.close(resolve));
}
