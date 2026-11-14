// Email goes out from our own mailbox (support@suprempoker.com) over SMTP, written here with
// Node's own net/tls: no outside service in between. Settings in the server environment:
//   SMTP_USER  the mailbox, e.g. support@suprempoker.com            (required)
//   SMTP_PASS  its password                                            (required, never logged)
//   SMTP_HOST  default smtp.hostinger.com
//   SMTP_PORT  default 465 (TLS from the start); 587 uses STARTTLS
//   EMAIL_FROM default "Suprem Poker <SMTP_USER>"
//   EMAIL_REPLY_TO optional, where replies go
import net from 'node:net';import tls from 'node:tls';import crypto from 'node:crypto';
const env=()=>({host:process.env.SMTP_HOST||'smtp.hostinger.com',port:Number(process.env.SMTP_PORT||465),user:process.env.SMTP_USER||'',pass:process.env.SMTP_PASS||'',
 from:process.env.EMAIL_FROM||(process.env.SMTP_USER?'Suprem Poker <'+process.env.SMTP_USER+'>':''),replyTo:process.env.EMAIL_REPLY_TO||'',
 // tests only: a local server without TLS
 plain:process.env.SMTP_INSECURE_TEST==='1'});
export const mailConfigured=()=>{const e=env();return !!e.user&&!!e.pass;};

const b64=s=>Buffer.from(s,'utf8').toString('base64');
const wrap=s=>s.replace(/.{1,76}/g,'$&\r\n');
const header=s=>/^[\x20-\x7e]*$/.test(s)?s:'=?UTF-8?B?'+b64(s)+'?=';
const address=s=>{const m=String(s).match(/<([^>]+)>/);return (m?m[1]:String(s)).trim();};
const nameAddr=s=>{const m=String(s).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);return m?(m[1]?header(m[1])+' ':'')+'<'+m[2]+'>':'<'+address(s)+'>';};

// The whole message: plain text and HTML in one multipart/alternative, both base64 encoded.
export function buildMessage({from,to,replyTo,subject,text,html,date=new Date(),id=crypto.randomUUID()}){
 const domain=address(from).split('@')[1]||'localhost',boundary='=_sp_'+crypto.randomBytes(12).toString('hex');
 return ['From: '+nameAddr(from),'To: <'+address(to)+'>',...(replyTo?['Reply-To: <'+address(replyTo)+'>']:[]),'Subject: '+header(subject),'Date: '+date.toUTCString().replace('GMT','+0000'),
  'Message-ID: <'+id+'@'+domain+'>','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"','',
  '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(b64(text||'')),
  '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(b64(html||'')),
  '--'+boundary+'--',''].join('\r\n');
}

// One SMTP conversation. Every reply is checked; any unexpected answer stops with an error
// that names the step (the password is never part of it).
export async function sendMail({to,subject,text,html}){
 const e=env();if(!mailConfigured())throw Error('SMTP_USER and SMTP_PASS are not set');
 if(!/^[^\s@<>]+@[^\s@<>]+$/.test(address(to)))throw Error('Invalid recipient');
 let socket=await new Promise((ok,bad)=>{const s=e.plain||e.port!==465?net.connect(e.port,e.host):tls.connect({port:e.port,host:e.host,servername:e.host});
  s.once(e.plain||e.port!==465?'connect':'secureConnect',()=>ok(s));s.once('error',bad);s.setTimeout(15000,()=>s.destroy(Error('SMTP timeout')));});
 let buf='',waiting=null;
 const attach=s=>{s.setEncoding('utf8');s.on('data',d=>{buf+=d;flush();});s.on('error',err=>{if(waiting){const w=waiting;waiting=null;w.bad(err);}});};
 const flush=()=>{if(!waiting)return;const lines=buf.split('\r\n');for(let i=0;i<lines.length-1;i++)if(/^\d{3} /.test(lines[i])){const reply=lines.slice(0,i+1).join('\n');buf=lines.slice(i+1).join('\r\n');const w=waiting;waiting=null;w.ok(reply);return;}};
 const read=()=>new Promise((ok,bad)=>{waiting={ok,bad};flush();});
 const expect=async(step,codes)=>{const r=await read();if(!codes.includes(r.slice(0,3)))throw Error('SMTP '+step+' refused: '+r.split('\n').pop().slice(0,160));return r;};
 const cmd=(line,step,codes)=>{socket.write(line+'\r\n');return expect(step,codes);};
 attach(socket);
 try{
  await expect('greeting',['220']);
  let ehlo=await cmd('EHLO suprempoker.com','EHLO',['250']);
  if(!e.plain&&e.port!==465){if(!/STARTTLS/i.test(ehlo))throw Error('The mail server does not offer STARTTLS');await cmd('STARTTLS','STARTTLS',['220']);
   socket.removeAllListeners('data');socket=await new Promise((ok,bad)=>{const s=tls.connect({socket,servername:e.host},()=>ok(s));s.once('error',bad);});buf='';attach(socket);
   ehlo=await cmd('EHLO suprempoker.com','EHLO',['250']);}
  await cmd('AUTH PLAIN '+Buffer.from('\0'+e.user+'\0'+e.pass,'utf8').toString('base64'),'sign-in',['235']);
  await cmd('MAIL FROM:<'+address(e.from)+'>','sender',['250']);
  await cmd('RCPT TO:<'+address(to)+'>','recipient',['250','251']);
  await cmd('DATA','DATA',['354']);
  const msg=buildMessage({from:e.from,to,replyTo:e.replyTo,subject,text,html}).replace(/\r\n\./g,'\r\n..');
  await cmd(msg+'\r\n.','message',['250']);
  socket.write('QUIT\r\n');
 }finally{setTimeout(()=>socket.destroy(),200).unref?.();}
}

// Branded email: dark header with the logo, white card, plain footer. Inline styles only
// (email programs ignore style sheets); the logo is a PNG for Outlook and older Gmail apps.
const SITE=process.env.PUBLIC_URL||'https://suprempoker.com';
// The address shown for questions: SUPPORT_EMAIL, else the reply address, else the mailbox that sends.
const support=()=>process.env.SUPPORT_EMAIL||address(process.env.EMAIL_REPLY_TO||process.env.SMTP_USER||'support@suprempoker.com');
const shell=body=>`<div style="background:#eef2f0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:480px;margin:auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe6e2"><div style="background:#08100d;padding:18px 24px;text-align:center"><img src="${SITE}/apple-touch-icon.png" width="44" height="44" alt="" style="vertical-align:middle;border-radius:10px"><span style="color:#e6c88f;font-size:20px;font-weight:700;vertical-align:middle;margin-left:10px">Suprem Poker</span></div><div style="padding:26px 28px;color:#14201b;font-size:15px;line-height:1.5">${body}</div><div style="padding:16px 28px;border-top:1px solid #eef2f0;color:#6b7a73;font-size:12px;line-height:1.5">If this was not you, you can ignore this email. Questions: <a href="mailto:${support()}" style="color:#1f9d6b">${support()}</a></div></div></div>`;

export const codeMail=code=>({
 subject:`${code} is your Suprem Poker verification code`,
 text:`Your Suprem Poker verification code is ${code}. It works for 10 minutes. Never share it with anyone. If this was not you, you can ignore this email. Questions: ${support()}`,
 html:shell(`<h2 style="margin:0 0 6px;font-size:20px">Your verification code</h2><p style="margin:0 0 18px;color:#4a5a53">Enter this code on Suprem Poker to finish creating your account.</p><div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#f3f7f5;border:1px solid #dfe6e2;border-radius:12px;padding:16px 0;color:#0b5c3d">${code}</div><p style="margin:18px 0 0;color:#4a5a53">The code works for 10 minutes. Never share it with anyone.</p>`),
});

export const existingMail=()=>({
 subject:'You already have a Suprem Poker account',
 text:'Someone tried to register with this email, but it already has a Suprem Poker account. You can sign in with your username and password. If this was not you, you can ignore this email.',
 html:shell('<h2 style="margin:0 0 12px">You already have an account</h2><p>Someone tried to register with this email. You can sign in with your username and password.</p>'),
});
