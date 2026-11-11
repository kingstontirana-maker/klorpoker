// Isolated browser fixtures: never connects to poker or modifies real balances.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve('public/cenb'),out=path.resolve('artifacts');
fs.mkdirSync(out,{recursive:true});
const fixture={guard:{returnPercent:25,dailyLimit:50,weeklyLimit:0,monthlyLimit:0,maxBB:0,maxPerTable:2,today:0,week:0,month:0},bots:[{id:'b',name:'Demo',status:'Stopped',enabled:false,style:'Balanced',mode:'play',tableId:'auto',buyinBB:100,stopLoss:50,equity:120,total:20,session:20,hands:10,rakePaid:0,house:20,returned:5,returnAvailable:15}],tables:[],players:[],decisions:[],catalog:[],log:[],centerBalance:1000};
let settings=[];
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){let raw='';for await(const c of req)raw+=c;let value=fixture;
  if(req.url==='/api/cenb/status')value={ready:true};
  if(req.url==='/api/cenb/bots/settings'){const body=JSON.parse(raw);settings.push(body);fixture.guard.returnPercent=body.returnPercent;value=fixture.guard;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return;
 }
 const name=req.url==='/'?'index.html':req.url.slice(1).replace(/^cenb\//,'');if(!['index.html','cenb.js','cenb.css','logo.webp','icon.png'].includes(name)){res.writeHead(404);res.end();return;}
 res.setHeader('content-type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'image/webp');res.end(name==='cenb.js'?fs.readFileSync(path.join(root,name),'utf8')+'\nwindow.__refresh=refresh;':fs.readFileSync(path.join(root,['logo.webp','icon.png'].includes(name)?'../'+name:name)));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9231','--user-data-dir='+path.join(out,'cenb-test-browser'),'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let target;for(let i=0;i<60;i++){try{target=await(await fetch('http://127.0.0.1:9231/json/new?about:blank',{method:'PUT'})).json();break;}catch{await sleep(200);}}
 assert.ok(target,'Chrome started');socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let seq=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"sessionStorage.setItem('cenbToken','isolated-test')"});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:origin});
 for(let i=0;i<60;i++){if(await ev("document.querySelector('#returnPercent')?.value==='25'"))break;await sleep(100);}
 assert.equal(await ev("document.querySelector('#returnPercent').value"),'25');
 await ev("document.querySelector('[data-tab=limits]').click();document.querySelector('#returnRange').value=40;document.querySelector('#returnRange').dispatchEvent(new Event('input',{bubbles:true}))");
 assert.equal(await ev("document.querySelector('#returnPercent').value"),'40');
 await ev("__refresh()");assert.equal(await ev("document.querySelector('#returnPercent').value"),'40','unsaved edits survive refresh');
 await ev("document.querySelector('#returnPercent').value=101;document.querySelector('#returnPercent').dispatchEvent(new Event('input'))");
 assert.equal(await ev("document.querySelector('#returnsForm').checkValidity()"),false);
 await ev("document.querySelector('#returnPercent').value=30;document.querySelector('#returnPercent').dispatchEvent(new Event('input'));document.querySelector('#returnsForm').requestSubmit()");
 for(let i=0;i<40&&!settings.length;i++)await sleep(100);
 assert.deepEqual(settings,[{returnPercent:30}],'saves only return setting');
 await sleep(150);assert.equal(await ev("document.querySelector('#returnState').textContent"),'30% aktiv');
 assert.ok(await ev("document.querySelector('#botList').textContent.includes('€5.00')&&document.querySelector('#botList').textContent.includes('€15.00')"));
 let shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'cenb-returns-desktop.png'),Buffer.from(shot.data,'base64'));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true,'no horizontal overflow on mobile');
 shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'cenb-returns-mobile.png'),Buffer.from(shot.data,'base64'));
 await ev("document.querySelector('#returnPercent').value=0;document.querySelector('#returnPercent').dispatchEvent(new Event('input'));document.querySelector('#returnsForm').requestSubmit()");
 for(let i=0;i<40&&settings.length<2;i++)await sleep(100);await sleep(100);
 assert.equal(await ev("document.querySelector('#returnState').textContent"),'I çaktivizuar');
 delete fixture.guard.returnPercent;await ev('__refresh()');assert.equal(await ev("document.querySelector('#returnControls').disabled"),true,'unsupported server cannot silently accept settings');
 assert.deepEqual(errors,[]);console.log('PASS: slider, numeric validation, save payload, unsaved edits, statistics, zero/off, old-server fallback and desktop/mobile layouts.');
 await cdp('Browser.close');
}finally{socket?.close();chrome.kill();server.close();}
