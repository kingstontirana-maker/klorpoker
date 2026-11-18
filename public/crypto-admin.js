// The centre's crypto desk: wallet read from the chain, withdrawals to approve and to pay
// (each payment proven on the chain), deposits, transfers to assign, fakes that were
// blocked, and the settings.
export function createCryptoAdmin({api,fmt,safe,toast,qrSvg,refreshProfile,openUser}){
 const $=s=>document.querySelector(s),root=()=>$('#cpRoot');
 const when=t=>t?new Date(t).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
 const short=v=>v?v.slice(0,8)+'…'+v.slice(-6):'—';
 const tx=v=>v?'<a href="https://tronscan.org/#/transaction/'+safe(v)+'" target="_blank" rel="noopener" class="cxLink">'+short(v)+' ↗</a>':'—';
 const addr=v=>v?'<a href="https://tronscan.org/#/address/'+safe(v)+'" target="_blank" rel="noopener" class="cxLink">'+short(v)+' ↗</a>':'—';
 const STATUS={open:'Waiting for payment',credited:'Credited',expired:'Expired',cancelled:'Cancelled',pending:'To approve',approved:'Approved · to pay',verifying:'Checking the payment',paid:'Paid · verified',rejected:'Rejected'};
 const pill=s=>'<span class="cxPill '+s+'">'+(STATUS[s]||s)+'</span>';
 let data=null,walletInfo=null,tab='withdrawals',wFilter='pending',dQuery='',busy=false;

 function shell(){if($('#cpRoot .cxTabs'))return;
  root().innerHTML='<div class="cxTop" id="cxTop"></div><div class="cxKpis" id="cxKpis"></div>'
   +'<nav class="cxTabs" id="cxTabs"></nav><div id="cxBody"></div>';
  root().addEventListener('click',onClick);root().addEventListener('submit',onSubmit);root().addEventListener('input',e=>{if(e.target.id==='cxSearch'){dQuery=e.target.value.trim().toLowerCase();renderBody();}});}
 async function load(){if(busy)return;busy=true;shell();
  try{const [d,w]=await Promise.all([api('crypto/admin'),api('crypto/wallet').catch(()=>({wallet:null}))]);data=d;walletInfo=w.wallet;render();}
  catch(err){toast(err.message);}finally{busy=false;}}
 function render(){const c=data.config,s=data.stats,w=walletInfo,owed=Number(s.owed);
  const covers=w?Number(w.usdt)>=owed:null,lowTrx=w&&Number(w.trx)<30;
  $('#cxTop').innerHTML='<div class="cxWallet"><div class="cxState '+(c.enabled&&c.address?'on':'off')+'">'+(c.enabled&&c.address?'● ACCEPTING PAYMENTS':'○ PAYMENTS ARE OFF')+'</div>'
   +'<h2>'+(w?w.usdt+' <small>USDT</small>':'—')+'</h2><p class="muted">Your wallet on the chain'+(c.address?' · '+addr(c.address):'')+(w?' · '+w.trx+' TRX for network fees'+(lowTrx?' <b class="cxWarn">low: keep at least 30 TRX to send payouts</b>':''):'')+'</p></div>'
   +'<div class="cxOwed '+(covers===false?'bad':'')+'"><small>Owed to players</small><strong>'+s.owed+' USDT</strong><span>'+(covers===null?'':covers?'✓ your wallet covers it':'⚠ your wallet holds less than this')+'</span></div>'
   +'<div class="cxScan"><small>Last blockchain check</small><strong>'+(data.lastScan?new Date(data.lastScan).toLocaleTimeString('en-GB'):'never')+'</strong><button type="button" class="ghostButton" data-cx="scan">↻ Check now</button></div>';
  const k=(l,v,n,cls='')=>'<div class="statCard ckpi '+cls+'"><small>'+l+'</small><strong>'+v+'</strong><div><small>'+n+'</small></div></div>';
  $('#cxKpis').innerHTML=k('Deposits · 24 h',s.deposits.day.usdt+' USDT',s.deposits.day.count+' · 7 days '+s.deposits.week.usdt+' · 30 days '+s.deposits.month.usdt)
   +k('Withdrawals paid · 24 h',s.withdrawals.day.usdt+' USDT',s.withdrawals.day.count+' · 7 days '+s.withdrawals.week.usdt+' · 30 days '+s.withdrawals.month.usdt)
   +k('To approve',s.toApprove,'withdrawals waiting for your decision',s.toApprove?'warn':'')+k('To pay',s.toPay+(s.verifying?' <small>+'+s.verifying+' checking</small>':''),'approved, waiting for your payment',s.toPay?'warn':'')
   +k('Without a deposit',s.unmatched,'transfers to assign or ignore',s.unmatched?'warn':'')+k('Fakes blocked',s.fakes,'fake tokens and failed transfers refused');
  const tabs=[['withdrawals','Withdrawals',s.toApprove+s.toPay+s.verifying],['deposits','Deposits',0],['unmatched','Without a deposit',s.unmatched],['fakes','Blocked fakes',0],['settings','Settings',0],['security','How it is protected',0]];
  $('#cxTabs').innerHTML=tabs.map(([id,l,n])=>'<button type="button" data-cxtab="'+id+'"'+(tab===id?' class="on"':'')+'>'+l+(n?' <i>'+n+'</i>':'')+'</button>').join('');
  renderBody();}

 function renderBody(){const b=$('#cxBody');if(!data)return;
  if(tab==='withdrawals'){const list=data.withdrawals,by=st=>list.filter(w=>w.status===st);
   const filters=[['pending','To approve',by('pending').length],['approved','To pay',by('approved').length],['verifying','Checking',by('verifying').length],['history','History',0]];
   const rows=wFilter==='history'?list.filter(w=>['paid','rejected','cancelled'].includes(w.status)):by(wFilter);
   b.innerHTML='<div class="revPresets cxFilters">'+filters.map(([id,l,n])=>'<button type="button" data-wf="'+id+'" aria-pressed="'+(wFilter===id)+'">'+l+(n?' · '+n:'')+'</button>').join('')+'</div>'
    +(wFilter==='history'?historyTable(rows):rows.length?'<div class="cxCards">'+rows.map(card).join('')+'</div>':'<div class="surface cxEmpty">'+({pending:'No withdrawal waits for approval.',approved:'Nothing to pay.',verifying:'No payment is being checked.'}[wFilter])+'</div>');}
  else if(tab==='deposits'){const rows=data.deposits.filter(d=>!dQuery||d.username.toLowerCase().includes(dQuery)||(d.tx||'').includes(dQuery)||(d.from||'').toLowerCase().includes(dQuery));
   b.innerHTML='<article class="surface"><div class="cxToolbar"><input type="search" id="cxSearch" placeholder="Search player, sender or transaction…" value="'+safe(dQuery)+'"></div><div class="tableScroll"><table class="dataTable"><thead><tr><th>Requested</th><th>Player</th><th class="num">USDT</th><th class="num">Credited</th><th>Status</th><th>Sent from</th><th>Transaction</th></tr></thead><tbody>'
    +(rows.slice(0,200).map(d=>'<tr><td>'+when(d.createdAt)+'</td><td><button type="button" class="linkBtn" data-player="'+safe(d.username)+'">'+safe(d.username)+'</button>'+(d.manual?' <small class="muted">assigned by hand</small>':'')+'</td><td class="num">'+d.amount+'</td><td class="num">'+(d.credited!=null?fmt(d.credited):'—')+'</td><td>'+pill(d.status)+(d.note?' <small class="cxWarn">'+safe(d.note)+'</small>':'')+'</td><td>'+addr(d.from)+(d.shared?' <b class="cxWarn" title="Other players deposited from this address too">shared</b>':'')+'</td><td>'+tx(d.tx)+'</td></tr>').join('')||'<tr><td colspan="7" class="emptyState">No deposits.</td></tr>')+'</tbody></table></div></article>';}
  else if(tab==='unmatched'){b.innerHTML=data.unmatched.length?'<p class="muted cxIntro">Real USDT that reached your wallet (checked on the chain) but matched no open request: wrong amount, or paid after the request expired. Credit it to the right player, or ignore it.</p><div class="cxCards">'+data.unmatched.map(x=>'<form class="surface cxCard" data-tx="'+safe(x.tx)+'"><div class="cxHead"><div><strong>'+x.amount+' USDT</strong><small>'+when(x.at)+'</small></div>'+tx(x.tx)+'</div><p class="muted">From '+addr(x.from)+(x.usedBy.length?' · this address deposited before for <b>'+x.usedBy.map(safe).join(', ')+'</b>':'')+'</p><div class="cxRow"><input name="username" placeholder="Player username" value="'+safe(x.usedBy.length===1?x.usedBy[0]:'')+'" required><button class="primary">Credit player</button><button type="button" class="ghostButton" data-cx="ignore">Ignore</button></div></form>').join('')+'</div>':'<div class="surface cxEmpty">Nothing to assign.</div>';}
  else if(tab==='fakes'){b.innerHTML='<article class="surface"><p class="muted">Transfers that looked like USDT to your wallet but failed the chain check: a token from another contract with the same name, a failed or reverted transaction, or an amount the chain does not show. None of them was credited.</p><div class="tableScroll"><table class="dataTable"><thead><tr><th>When</th><th class="num">Claimed USDT</th><th>From</th><th>Transaction</th></tr></thead><tbody>'
   +(data.rejected.map(x=>'<tr><td>'+when(x.at)+'</td><td class="num">'+x.amount+'</td><td>'+addr(x.from)+'</td><td>'+tx(x.tx)+'</td></tr>').join('')||'<tr><td colspan="4" class="emptyState">None so far.</td></tr>')+'</tbody></table></div></article>';}
  else if(tab==='settings'){const c=data.config;
   b.innerHTML='<form id="cxSettings" class="surface cxSettings"><label class="cxWide">Your USDT TRC20 address<input name="address" value="'+safe(c.address||'')+'" placeholder="T…" autocomplete="off" spellcheck="false"></label>'
    +'<label>Deposit rate (€ per 1 USDT)<input name="rateIn" type="number" step="0.0001" min="0.01" value="'+c.rateIn+'" required></label><label>Withdrawal rate (€ per 1 USDT)<input name="rateOut" type="number" step="0.0001" min="0.01" value="'+c.rateOut+'" required></label>'
    +'<label>Minimum deposit (USDT)<input name="minDeposit" type="number" min="1" step="1" value="'+c.minDeposit+'" required></label><label>Maximum deposit (USDT)<input name="maxDeposit" type="number" min="1" step="1" value="'+c.maxDeposit+'" required></label>'
    +'<label>Minimum withdrawal (€)<input name="minWithdraw" type="number" min="1" step="1" value="'+c.minWithdraw+'" required></label><label>Withdrawal limit a day per player (€) · 0 = none<input name="dailyWithdraw" type="number" min="0" step="1" value="'+c.dailyWithdraw+'" required></label>'
    +'<label>Extra blocks after the block is final · 20 ≈ 1 minute<input name="confirmations" type="number" min="1" max="500" step="1" value="'+c.confirmations+'" required></label>'
    +'<label class="lobbyCheck cxWide"><input type="checkbox" name="enabled"'+(c.enabled?' checked':'')+'> Accept deposits and withdrawals</label><div class="cxWide"><button class="primary">Save</button></div></form>';}
  else b.innerHTML='<article class="surface cxSecurity"><h3>Deposits</h3><ul>'
   +'<li><b>Only the real USDT.</b> A transfer counts only if its Transfer event comes from the official USDT contract on Tron (TR7NHq…jLj6t). Tokens called "USDT" from any other contract are refused.</li>'
   +'<li><b>No "flash USDT".</b> A deposit is credited only after the transaction is in a final (solidified) block, which can no longer be reversed, and '+data.config.confirmations+' blocks deeper. Pending, unconfirmed, failed or reverted transfers never count.</li>'
   +'<li><b>Read twice.</b> The transfer is found in the wallet history, then checked again directly on a final node: success, contract, receiving wallet and exact amount.</li>'
   +'<li><b>One payment, one request.</b> Each request gets a unique amount (e.g. 50.37 USDT), so nobody can claim someone else\'s payment. Every transaction is remembered for good: none is ever credited twice.</li>'
   +'<li><b>No private key on the server.</b> The server only reads the public chain. Money moves out only when you send it from your own wallet.</li></ul>'
   +'<h3>Withdrawals</h3><ul><li><b>You approve each one.</b> The credit is held from the moment the player asks. Nothing is paid without your approval; you can reject and the credit returns.</li>'
   +'<li><b>Risk check first.</b> Before approving you see: deposits and withdrawals of the player, hands played since the last deposit, account age, and whether the address is used by other accounts.</li>'
   +'<li><b>Payment proven on the chain.</b> After you pay, you enter the transaction hash. It is marked paid only when a final block shows real USDT, for the full amount, reaching the player\'s address after the request. The same transaction can never pay two withdrawals.</li>'
   +'<li><b>Limits.</b> Minimum and maximum deposit, minimum withdrawal and a daily withdrawal limit per player, set in Settings.</li></ul></article>';}

 function card(w){const r=w.risk,lvl=r?.level||'ok';
  const riskBox=r?'<div class="cxRisk '+lvl+'"><div class="cxRiskHead"><b>'+({danger:'⛔ High risk',warn:'⚠ Check before approving',ok:'✓ No warning'}[lvl])+'</b></div>'
   +(r.flags.length?'<ul>'+r.flags.map(([l,t])=>'<li class="'+l+'">'+safe(t)+'</li>').join('')+'</ul>':'')
   +'<div class="cxFacts"><span>Deposited <b>'+fmt(r.deposited)+'</b> ('+r.deposits+')</span><span>Withdrawn <b>'+fmt(r.withdrawn)+'</b> ('+r.withdrawals+')</span>'
   +(r.sinceDeposit?'<span>Since last deposit <b>'+r.sinceDeposit.hands+' hands</b> · '+(r.sinceDeposit.net>=0?'+':'')+fmt(r.sinceDeposit.net)+'</span>':'')+(r.allTime?'<span>All time <b>'+r.allTime.hands+' hands</b> · '+(r.allTime.net>=0?'+':'')+fmt(r.allTime.net)+'</span>':'')
   +'<span>Account since <b>'+(r.account.created?new Date(r.account.created).toLocaleDateString('en-GB'):'—')+'</b></span><span>Wallet now <b>'+fmt(r.account.balance)+'</b></span></div></div>':'';
  const head='<div class="cxHead"><div><button type="button" class="linkBtn cxName" data-player="'+safe(w.username)+'">'+safe(w.username)+'</button><small>Requested '+when(w.createdAt)+(w.approvedAt?' · approved '+when(w.approvedAt)+(w.approvedBy?' by '+safe(w.approvedBy):''):'')+'</small></div><div class="cxAmount"><strong>'+w.usdt+' USDT</strong><small>'+fmt(w.euro)+' held</small></div></div>';
  const address='<div class="cxAddr"><span>To</span><button type="button" class="cdAddr" data-copy="'+safe(w.address)+'" data-copy-label="Address">'+safe(w.address)+' <span>Copy</span></button>'+addr(w.address)+'</div>';
  if(w.status==='pending')return '<div class="surface cxCard" data-wd="'+safe(w.id)+'">'+head+address+riskBox+'<div class="cxRow"><button type="button" class="primary" data-cx="approve">✓ Approve</button><button type="button" class="ghostButton dangerButton" data-cx="reject">Reject · return the credit</button></div></div>';
  if(w.status==='approved')return '<form class="surface cxCard" data-wd="'+safe(w.id)+'">'+head+'<div class="cxPay"><div class="cxQr">'+qrSvg(w.address)+'</div><div><p>Send exactly <button type="button" class="cxCopyAmt" data-copy="'+w.usdt+'" data-copy-label="Amount">'+w.usdt+' USDT</button> on <b>TRC20</b> from your wallet to:</p>'+address
   +(w.note?'<p class="cxWarn">'+safe(w.note)+'</p>':'')+'<div class="cxRow"><input name="tx" placeholder="Transaction hash of your payment (64 characters)" spellcheck="false" autocomplete="off" required><button class="primary">Verify the payment</button></div><p class="muted cxHint">It is marked paid only when the chain shows the USDT reached this address.</p></div></div>'+riskBox
   +'<div class="cxRow"><button type="button" class="ghostButton dangerButton" data-cx="reject">Reject · return the credit</button></div></form>';
  return '<div class="surface cxCard" data-wd="'+safe(w.id)+'">'+head+address+'<p class="cxChecking"><span class="cxSpin"></span> Checking '+tx(w.tx)+' on the chain. It completes by itself once the block is final (about a minute).</p></div>';}
 function historyTable(rows){return '<article class="surface"><div class="tableScroll"><table class="dataTable"><thead><tr><th>Requested</th><th>Player</th><th class="num">€</th><th class="num">USDT</th><th>Address</th><th>Status</th><th>Transaction</th><th>Closed</th></tr></thead><tbody>'
  +(rows.map(w=>'<tr><td>'+when(w.createdAt)+'</td><td><button type="button" class="linkBtn" data-player="'+safe(w.username)+'">'+safe(w.username)+'</button></td><td class="num">'+fmt(w.euro)+'</td><td class="num">'+w.usdt+'</td><td>'+addr(w.address)+'</td><td>'+pill(w.status)+(w.note?' <small class="muted">'+safe(w.note)+'</small>':'')+'</td><td>'+tx(w.tx)+'</td><td>'+when(w.paidAt)+'</td></tr>').join('')||'<tr><td colspan="8" class="emptyState">Nothing yet.</td></tr>')+'</tbody></table></div></article>';}

 async function onClick(e){
  const t=e.target.closest('[data-cxtab]');if(t){tab=t.dataset.cxtab;render();return;}
  const f=e.target.closest('[data-wf]');if(f){wFilter=f.dataset.wf;renderBody();return;}
  const c=e.target.closest('[data-copy]');if(c){try{await navigator.clipboard.writeText(c.dataset.copy);}catch{}toast((c.dataset.copyLabel||'Text')+' copied');return;}
  const p=e.target.closest('[data-player]');if(p&&openUser){const users=await api('center/users').catch(()=>null),u=users?.rows.find(x=>x.username===p.dataset.player);if(u)openUser(u.id);return;}
  const a=e.target.closest('[data-cx]');if(!a)return;const act=a.dataset.cx,wd=a.closest('[data-wd]')?.dataset.wd,w=wd&&data.withdrawals.find(x=>x.id===wd);
  try{
   if(act==='scan'){a.disabled=true;const r=await api('crypto/check',{});toast('Checked '+(r.checked||0)+' transfers'+(r.credited?' · '+r.credited+' credited':'')+(r.paid?' · '+r.paid+' payouts confirmed':''));}
   else if(act==='approve'){if(w.risk?.level==='danger'&&!confirm('High risk:\n\n'+w.risk.flags.filter(f=>f[0]==='danger').map(f=>'• '+f[1]).join('\n')+'\n\nApprove anyway?'))return;
    if(!confirm('Approve '+w.usdt+' USDT for '+w.username+'?\n\nYou then send it from your wallet and enter the transaction hash.'))return;await api('crypto/withdrawal',{id:wd,action:'approve'});toast('Approved · now pay it from your wallet');wFilter='approved';}
   else if(act==='reject'){const note=prompt('Reject the withdrawal of '+w.username+'. The credit returns to their wallet.\n\nReason for the player (optional):','');if(note===null)return;await api('crypto/withdrawal',{id:wd,action:'reject',note});toast('Rejected · credit returned');await refreshProfile?.();}
   else if(act==='ignore'){if(!confirm('Ignore this transfer? It will not be credited to anyone.'))return;await api('crypto/ignore',{tx:a.closest('[data-tx]').dataset.tx});toast('Ignored');}
   await load();}catch(err){toast(err.message);}finally{a.disabled=false;}}
 async function onSubmit(e){e.preventDefault();const f=e.target,btn=f.querySelector('button.primary');if(btn)btn.disabled=true;
  try{
   if(f.id==='cxSettings'){await api('crypto/settings',{address:f.address.value.trim(),rateIn:Number(f.rateIn.value),rateOut:Number(f.rateOut.value),minDeposit:Number(f.minDeposit.value),maxDeposit:Number(f.maxDeposit.value),minWithdraw:Number(f.minWithdraw.value),dailyWithdraw:Number(f.dailyWithdraw.value),confirmations:Number(f.confirmations.value),enabled:f.enabled.checked});toast('Crypto settings saved');}
   else if(f.dataset.wd){if(btn)btn.textContent='Checking on the chain…';const r=await api('crypto/withdrawal',{id:f.dataset.wd,action:'paid',tx:f.tx.value.trim()});
    toast(r.status==='paid'?'✓ Payment verified on the chain · withdrawal paid':'Payment received. It is checked again as soon as its block is final.');wFilter=r.status==='paid'?'history':'verifying';}
   else if(f.dataset.tx){const r=await api('crypto/assign',{tx:f.dataset.tx,username:f.username.value});toast('Credited '+fmt(r.credited));}
   await refreshProfile?.();await load();}catch(err){toast(err.message);if(btn){btn.disabled=false;btn.textContent=f.dataset.wd?'Verify the payment':btn.textContent;}}}
 return {load,isEditing:()=>!!root()?.contains(document.activeElement)&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)};
}
