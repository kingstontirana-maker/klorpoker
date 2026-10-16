// Run against a separate headless Chrome debugging session. All API data below
// is injected in that tab: no real users, balances or hands are modified.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const origin=process.env.PREVIEW_ORIGIN||'http://localhost:3000';
const debug=process.env.CHROME_DEBUG||'http://127.0.0.1:9228';
const target=await (await fetch(debug+'/json/new?about:blank',{method:'PUT'})).json();
const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let seq=0;const pending=new Map(),errors=[];
socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);});
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const state={user:{id:'staff',username:'demo_staff',role:'CENTER',balance:1000},rakePercent:5,rakeCap:3,seatedTableId:null,tables:[{id:'1',name:'Emerald One',sb:1,bb:2,players:0,phase:'waiting'}]};
const report={total:125.5,today:12.5,hands:18,percent:5,cap:3,legacyTotal:0,rows:[{id:'r1',tableId:'1',hand:42,time:Date.now(),amount:1.5}]};
try{
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(origin)}){sessionStorage.setItem('pokerToken','isolated-preview');window.__profile=${JSON.stringify(state)};window.__report=${JSON.stringify(report)};const originalFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(String(url).startsWith('/api/')){const route=String(url);if(route.endsWith('/rake/events'))return new Response(new ReadableStream({start(c){window.__rakeController=c;c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(__report)+'\\n\\n'));}}),{headers:{'content-type':'text/event-stream'}});const value=route.endsWith('/rake/report')?__report:route.endsWith('/users')||route.endsWith('/ledger')?[]:__profile;return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});}return originalFetch(url,options);};}`});
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await cdp('Page.navigate',{url:origin});
 for(let i=0;i<80;i++){if(await evaluate("!!document.querySelector('#overviewRake')"))break;await wait(100);}
 for(const role of ['CENTER','ADMIN','AGENT']){
  await evaluate(`__profile.user.role=${JSON.stringify(role)};document.querySelector('#adminToggle').click()`);
  await wait(1600);await evaluate("document.querySelector('[data-panel=rake]').click()");
  assert.equal(await evaluate("document.querySelector('[data-page=rake]').hidden"),false);
  assert.equal(await evaluate("document.querySelector('#centerRake').hidden"),role!=='CENTER');
  assert.ok(await evaluate("document.querySelector('#rakeStats').textContent.includes('125.50')"));
  assert.ok(await evaluate("document.querySelector('#rakeRows').textContent.includes('Emerald One')"));
  if(role==='CENTER'){
   await evaluate("(()=>{const message='data: '+JSON.stringify({...__report,total:126.25,today:13.25})+'\\n\\n';const bytes=new TextEncoder().encode(message);__rakeController.enqueue(bytes.slice(0,13));__rakeController.enqueue(bytes.slice(13));})()");await wait(100);
   assert.ok(await evaluate("document.querySelector('#rakeStats').textContent.includes('126.25')"),'server push immediately updates report');
   assert.ok(await evaluate("document.querySelector('#overviewRake').textContent.includes('126.25')"),'overview updates from the same push');
  }
  if(role==='AGENT'){
   await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait(250);
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'management panel fits phone');
   fs.mkdirSync('artifacts',{recursive:true});const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('artifacts/rake-agent-mobile.png',Buffer.from(shot.data,'base64'));
  }
 }
 await evaluate("__profile.user.role='USER'");await wait(1500);
 assert.equal(await evaluate("document.querySelector('#dashboard').hidden"),true);
 assert.deepEqual(errors,[]);console.log('PASS: rake totals, history, role access and responsive management panels.');
}finally{socket.close();if(socket.readyState!==WebSocket.CLOSED)await new Promise(resolve=>socket.addEventListener('close',resolve,{once:true}));await fetch(debug+'/json/close/'+target.id).catch(()=>{});}
