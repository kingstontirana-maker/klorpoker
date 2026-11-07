import test from 'node:test';
import assert from 'node:assert/strict';
import {sendMail,mailConfigured,codeMail,existingMail} from './mailer.js';

test('the code email carries the code, the notice carries none',()=>{
 const m=codeMail('042137');for(const part of [m.subject,m.text,m.html])assert.ok(part.includes('042137'));
 const n=existingMail();assert.ok(!/\d{6}/.test(n.subject+n.text+n.html));
});

test('sendMail: refuses without settings, calls Resend with them, reports a refusal',async()=>{
 const key=process.env.RESEND_API_KEY,from=process.env.EMAIL_FROM,real=globalThis.fetch;
 try{
  delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;assert.equal(mailConfigured(),false);
  await assert.rejects(sendMail({to:'a@b.co',subject:'s',text:'t',html:'h'}),/not set/);
  process.env.RESEND_API_KEY='test-key';process.env.EMAIL_FROM='Suprem <no-reply@example.com>';assert.equal(mailConfigured(),true);
  let seen;globalThis.fetch=async(url,opt)=>{seen={url,opt};return new Response('{}',{status:200});};
  await sendMail({to:'a@b.co',subject:'s',text:'t',html:'h'});
  assert.equal(seen.url,'https://api.resend.com/emails');assert.equal(seen.opt.headers.authorization,'Bearer test-key');
  assert.deepEqual(JSON.parse(seen.opt.body),{from:'Suprem <no-reply@example.com>',to:['a@b.co'],subject:'s',text:'t',html:'h'});
  globalThis.fetch=async()=>new Response('bad domain',{status:403});
  await assert.rejects(sendMail({to:'a@b.co',subject:'s',text:'t',html:'h'}),/403: bad domain/);
 }finally{globalThis.fetch=real;if(key===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=key;if(from===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=from;}
});
