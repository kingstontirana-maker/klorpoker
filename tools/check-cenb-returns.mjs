// Isolated browser fixtures: never connects to poker or modifies real balances.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve('public/cenb'),out=path.resolve('artifacts');
fs.mkdirSync(out,{recursive:true});
const fixture={guard:{returnPercent:25,dailyLimit:50,weeklyLimit:0,monthlyLimit:0,maxBB:0,maxPerTable:2,today:0,week:0,month:0},bots:[{id:'b',name:'Demo',status:'Stopped',enabled:false,style:'Balanced',mode:'play',tableId:'auto',buyinBB:100,stopLoss:50,equity:120,total:20,session:20,hands:10,rakePaid:0,house:20,returned:5,returnAvailable:15}],tables:[],players:[],decisions:[],catalog:[],log:[],centerBalance:1000};
fixture.bots.push({...fixture.bots[0],id:'b2',name:'SecondBot',enabled:true,status:'Looking for a table'});
fixture.fill={settings:{emptySeats:1,buyinMinPercent:35,buyinMaxPercent:90,budgetPercent:200,stopLossPercent:100,stopWinPercent:0,risk:'mix',mode:'play'},names:['FillName_01','FillName_02'],tables:{}};
fixture.catalog=[{id:'small',name:'Test Small',size:2,free:2,min:10,max:100,bb:1,sb:.5},{id:'large',name:'Test Large',size:6,free:6,min:100,max:1000,bb:10,sb:5}];
let settings=[],configurations=[],fillRequests=[],nameRequests=[];
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){let raw='';for await(const c of req)raw+=c;let value=fixture;
  if(req.url==='/api/cenb/status')value={ready:true};
  if(req.url==='/api/cenb/bots/settings'){const body=JSON.parse(raw);settings.push(body);fixture.guard.returnPercent=body.returnPercent;value=fixture.guard;}
  if(req.url==='/api/cenb/bots/configure'){const body=JSON.parse(raw);configurations.push(body);Object.assign(fixture.bots.find(b=>b.id===body.id),body);value={ok:true};}
  if(req.url==='/api/cenb/bots/names'){const body=JSON.parse(raw);nameRequests.push(body);fixture.fill.names=body.names.split(/\s+/).filter(Boolean);value={ok:true,names:fixture.fill.names};}
  if(req.url==='/api/cenb/bots/fill'){const body=JSON.parse(raw);fillRequests.push(body);value={ok:true,added:1,funded:100,tables:[{id:body.tableId,name:'Test Small',added:1,emptySeats:Number(body.emptySeats)}]};}
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
 assert.equal(await ev("document.querySelectorAll('.botRow').length"),2);
 assert.equal(await ev("document.querySelectorAll('.botDetails:not([hidden])').length"),0);
 assert.ok(await ev("document.querySelector('.botRow').textContent.includes('Demo')&&document.querySelector('.botRow').textContent.includes('€120.00')"),'collapsed row shows main bot data');
 await ev("document.querySelector('.botRow').focus();document.querySelector('.botRow').click()");
 assert.equal(await ev("document.activeElement.getAttribute('aria-expanded')"),'true','opening preserves keyboard focus');
 assert.equal(await ev("document.querySelectorAll('.botDetails:not([hidden])').length"),1);
 await ev("document.querySelector('[data-act=edit]').focus();document.querySelector('[data-act=edit]').click()");
 assert.ok(await ev("!!document.querySelector('[data-edit]')"),'edit opens after focusing the button');
 await ev("document.querySelector('[data-edit] [name=stopLoss]').value=75;document.querySelector('[data-edit] [name=stopLoss]').focus();document.activeElement.blur();__refresh()");
 assert.equal(await ev("document.querySelector('[data-edit] [name=stopLoss]').value"),'75','unsaved configuration survives refresh even after blur');
 await ev("document.querySelector('[data-edit]').requestSubmit()");
 for(let i=0;i<40&&!configurations.length;i++)await sleep(100);
 assert.equal(configurations[0]?.id,'b');assert.equal(configurations[0]?.stopLoss,'75');
 await sleep(150);assert.equal(await ev("!!document.querySelector('[data-edit]')"),false);
 assert.equal(await ev("document.querySelector('.botRow').getAttribute('aria-expanded')"),'true','save keeps bot details open');
 await ev("document.querySelector('[data-id=b2] .botRow').click()");
 assert.equal(await ev("document.querySelector('[data-id=b] .botRow').getAttribute('aria-expanded')"),'false');
 assert.equal(await ev("document.querySelector('[data-id=b2] [data-act=edit]').disabled"),true,'running bot retains configuration guard');
 await ev("document.querySelector('[data-id=b] .botRow').click();__refresh()");
 assert.equal(await ev("document.querySelector('[data-id=b] .botRow').getAttribute('aria-expanded')"),'true','refresh keeps selected bot open');
 await ev("document.querySelector('[data-id=b] [data-act=edit]').click();document.querySelector('[data-act=cancel]').click()");
 assert.equal(await ev("!!document.querySelector('[data-edit]')"),false,'cancel closes edit form');
 await ev("document.querySelector('[data-id=b] .botRow').click()");
 assert.equal(await ev("document.querySelectorAll('.botDetails:not([hidden])').length"),0,'row can collapse again');
 await ev("document.querySelector('[data-id=b] .botRow').click()");
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
 await ev("document.querySelector('[data-tab=bots]').click()");
 let shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'cenb-returns-desktop.png'),Buffer.from(shot.data,'base64'));
 await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true,'no horizontal overflow on mobile');
 shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'cenb-returns-mobile.png'),Buffer.from(shot.data,'base64'));
 await ev("document.querySelector('[data-tab=limits]').click()");
 await ev("document.querySelector('[data-tab=fill]').click()");
 assert.equal(await ev("document.querySelector('#fillTable').options.length"),3);
 await ev("document.querySelector('#botNames').value='FillName_01\\nFillName_02\\nFillName_03';document.querySelector('#botNames').dispatchEvent(new Event('input',{bubbles:true}));__refresh()");
 assert.ok(await ev("document.querySelector('#botNames').value.includes('FillName_03')"),'unsaved name list survives polling');
 await ev("document.querySelector('#fillForm').requestSubmit()");assert.equal(fillRequests.length,0,'unsaved names must be saved first');
 await ev("document.querySelector('#botNamesForm').requestSubmit()");
 for(let i=0;i<40&&!nameRequests.length;i++)await sleep(100);await sleep(150);
 assert.equal(fixture.fill.names.length,3);
 await ev("document.querySelector('#fillTable').value='small';document.querySelector('#fillTable').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#fillForm [name=buyinMinPercent]').value=95;document.querySelector('#fillForm [name=buyinMinPercent]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#fillForm').requestSubmit()");
 assert.equal(fillRequests.length,0,'inverted buy-in range is rejected');
 await ev("document.querySelector('#fillForm [name=buyinMinPercent]').value=30;document.querySelector('#fillForm [name=buyinMinPercent]').dispatchEvent(new Event('input',{bubbles:true}));__refresh()");
 assert.equal(await ev("document.querySelector('#fillForm [name=buyinMinPercent]').value"),'30','unsaved percentages survive refresh');
 await ev("document.querySelector('#fillForm').requestSubmit();document.querySelector('#fillForm').requestSubmit()");
 for(let i=0;i<40&&!fillRequests.length;i++)await sleep(100);await sleep(150);
 assert.equal(fillRequests.length,1,'double submit sends one fill request');assert.equal(fillRequests[0].tableId,'small');assert.equal(fillRequests[0].buyinMinPercent,'30');
 assert.ok(await ev("document.querySelector('#fillResult').textContent.includes('Test Small')"));
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth+1'),true,'fill panel fits mobile');
 shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'cenb-fill-mobile.png'),Buffer.from(shot.data,'base64'));
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await sleep(100);
 shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'cenb-fill-desktop.png'),Buffer.from(shot.data,'base64'));
 await ev("document.querySelector('#fillTable').value='all';document.querySelector('#fillForm').requestSubmit()");
 for(let i=0;i<40&&fillRequests.length<2;i++)await sleep(100);await sleep(150);
 assert.equal(fillRequests[1].tableId,'all');
 await ev("document.querySelector('[data-tab=limits]').click()");
 await ev("document.querySelector('#returnPercent').value=0;document.querySelector('#returnPercent').dispatchEvent(new Event('input'));document.querySelector('#returnsForm').requestSubmit()");
 for(let i=0;i<40&&settings.length<2;i++)await sleep(100);await sleep(100);
 assert.equal(await ev("document.querySelector('#returnState').textContent"),'I çaktivizuar');
 delete fixture.guard.returnPercent;await ev('__refresh()');assert.equal(await ev("document.querySelector('#returnControls').disabled"),true,'unsupported server cannot silently accept settings');
 assert.deepEqual(errors,[]);console.log('PASS: bot list, edit/save, names, percentage ranges, single/all-table fill, duplicate-submit protection, preserved drafts, returns and desktop/mobile layouts.');
 await cdp('Browser.close');
}finally{socket?.close();chrome.kill();server.close();}
