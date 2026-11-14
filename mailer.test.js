import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {sendMail,mailConfigured,codeMail,existingMail} from './mailer.js';

test('the code email carries the code, the notice carries none',()=>{
 const m=codeMail('042137');for(const part of [m.subject,m.text,m.html])assert.ok(part.includes('042137'));
 const n=existingMail();assert.ok(!/\d{6}/.test(n.subject+n.text+n.html));
});

// A tiny SMTP server in the test: it speaks the same steps as a real one (no TLS here).
async function fakeSmtp({password='right-pass'}={}){const seen={lines:[],data:''};
 const server=net.createServer(s=>{let inData=false,buf='';s.write('220 test ESMTP\r\n');
  s.on('data',d=>{buf+=d;let k;while((k=buf.indexOf('\r\n'))>=0){const line=buf.slice(0,k);buf=buf.slice(k+2);
   if(inData){if(line==='.'){inData=false;s.write('250 queued\r\n');}else seen.data+=line+'\n';continue;}
   seen.lines.push(line);const c=line.split(' ')[0];
   if(c==='EHLO')s.write('250-test\r\n250 AUTH PLAIN\r\n');
   else if(c==='AUTH'){const [,user,pass]=Buffer.from(line.split(' ')[2],'base64').toString().split(String.fromCharCode(0));seen.user=user;s.write(pass===password?'235 ok\r\n':'535 Authentication failed\r\n');}
   else if(c==='MAIL'||c==='RCPT')s.write('250 ok\r\n');
   else if(c==='DATA'){inData=true;s.write('354 go\r\n');}
   else if(c==='QUIT'){s.write('221 bye\r\n');s.end();}}});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {port:server.address().port,seen,close:()=>server.close()};}

test('sendMail: our own SMTP: refuses without settings, signs in, sends text and HTML, reports a refusal',async()=>{
 const keys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','EMAIL_FROM','EMAIL_REPLY_TO','SMTP_INSECURE_TEST'],keep=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const k of keys)delete process.env[k];assert.equal(mailConfigured(),false);
  await assert.rejects(sendMail({to:'a@b.co',subject:'s',text:'t',html:'h'}),/not set/);
  const srv=await fakeSmtp();Object.assign(process.env,{SMTP_HOST:'127.0.0.1',SMTP_PORT:String(srv.port),SMTP_USER:'support@suprempoker.com',SMTP_PASS:'right-pass',SMTP_INSECURE_TEST:'1'});
  assert.equal(mailConfigured(),true);const m=codeMail('482913');
  await sendMail({to:'player@example.com',...m});srv.close();
  assert.equal(srv.seen.user,'support@suprempoker.com');
  assert.ok(srv.seen.lines.includes('MAIL FROM:<support@suprempoker.com>'));assert.ok(srv.seen.lines.includes('RCPT TO:<player@example.com>'));
  assert.match(srv.seen.data,/From: Suprem Poker <support@suprempoker.com>/);assert.match(srv.seen.data,/Subject: 482913 is your Suprem Poker verification code/);
  const parts=srv.seen.data.split(/--=_sp_[0-9a-f]+/).map(p=>{const b=p.split('\n\n')[1]||'';return Buffer.from(b.replace(/\n/g,''),'base64').toString();});
  assert.ok(parts.some(p=>p.includes('482913')&&p.includes('<div')),'HTML part');assert.ok(parts.some(p=>p.startsWith('Your Suprem Poker verification code is 482913')),'text part');
  const bad=await fakeSmtp({password:'other'});process.env.SMTP_PORT=String(bad.port);
  await assert.rejects(sendMail({to:'player@example.com',...m}),/sign-in refused: 535/);bad.close();
  await assert.rejects(sendMail({to:'not an address',...m}),/Invalid recipient/);
 }finally{for(const [k,v] of Object.entries(keep)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
