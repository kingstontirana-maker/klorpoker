// Email goes out through Resend. Both settings live in the server environment:
// RESEND_API_KEY (the secret key) and EMAIL_FROM, e.g. "Suprem Poker <no-reply@your-domain>".
export const mailConfigured=()=>!!process.env.RESEND_API_KEY&&!!process.env.EMAIL_FROM;

export async function sendMail({to,subject,text,html}){
 if(!mailConfigured())throw Error('RESEND_API_KEY and EMAIL_FROM are not set');
 const res=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:'Bearer '+process.env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,text,html})});
 if(!res.ok)throw Error(`Resend answered ${res.status}: ${(await res.text().catch(()=>'')).slice(0,200)}`);
}

const shell=body=>`<div style="font-family:Arial,sans-serif;max-width:460px;margin:auto;padding:24px;color:#14201b">${body}<p style="color:#6b7a73;font-size:13px">If this was not you, you can ignore this email.</p></div>`;

export const codeMail=code=>({
 subject:`${code} is your Suprem Poker code`,
 text:`Your Suprem Poker sign-up code is ${code}. It works for 10 minutes. If this was not you, you can ignore this email.`,
 html:shell(`<h2 style="margin:0 0 12px">Your sign-up code</h2><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p><p>It works for 10 minutes.</p>`),
});

export const existingMail=()=>({
 subject:'You already have a Suprem Poker account',
 text:'Someone tried to register with this email, but it already has a Suprem Poker account. You can sign in with your username and password. If this was not you, you can ignore this email.',
 html:shell('<h2 style="margin:0 0 12px">You already have an account</h2><p>Someone tried to register with this email. You can sign in with your username and password.</p>'),
});
