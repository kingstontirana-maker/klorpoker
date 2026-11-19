// The centre's panel: grouped menu with sub-tabs, every user of the platform with a full
// profile, one clear report and a dashboard that answers "how are we doing" at a glance.
import {icon} from './icons.js';

export function createCenterPanel({api,fmt,safe,toast,openPanel,roleNames,openHand}){
 const $=s=>document.querySelector(s);
 const when=t=>t?new Date(t).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
 const day=d=>{const [y,m,dd]=d.split('-');return dd+'.'+m+'.'+y;};
 const ago=t=>{if(!t)return 'never';const s=Math.max(0,(Date.now()-t)/1000);return s<90?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' days ago';};
 const signed=n=>'<b class="'+(n>0?'up':n<0?'down':'')+'">'+(n>0?'+':'')+fmt(n)+'</b>';
 const delta=(cur,prev)=>{if(!prev&&!cur)return '<em class="flat">—</em>';if(!prev)return '<em class="up">new</em>';const p=Math.round((cur-prev)/Math.abs(prev)*100);return '<em class="'+(p>0?'up':p<0?'down':'flat')+'">'+(p>0?'▲ ':p<0?'▼ ':'')+Math.abs(p)+'%</em>';};
 const SUIT={s:'♠',h:'♥',d:'♦',c:'♣'},card=c=>'<b class="ccard'+('hd'.includes(c[1])?' red':'')+'">'+(c[0]==='T'?'10':c[0])+SUIT[c[1]]+'</b>';
 const roleBadge=(r,share)=>'<span class="roleBadge role'+r+'">'+(roleNames[r]||r)+'</span>'+(share!=null?'<span class="shareBadge" title="Rake share">'+share+'%</span>':'');
 const kpi=(label,value,note='',cls='')=>'<div class="statCard ckpi '+cls+'"><small>'+label+'</small><strong>'+value+'</strong>'+(note?'<div>'+note+'</div>':'')+'</div>';

 // ---- Menu: eight groups instead of sixteen pages ----
 const GROUPS=[
  {id:'home',label:'Dashboard',icon:'overview',pages:[['overview','Dashboard']]},
  {id:'people',label:'Users',icon:'users',pages:[['users','All users'],['accounts','Create & credit']]},
  {id:'money',label:'Reports',icon:'revenue',pages:[['summary','Summary'],['revenue','By network'],['reports','Players'],['history','Credit movements']]},
  {id:'play',label:'Tables',icon:'table',pages:[['tables','Tables'],['inspect','Live'],['hands','Hand history']]},
  {id:'pay',label:'Payments',icon:'crypto',pages:[['crypto','Crypto payments']]},
  {id:'safe',label:'Security',icon:'shield',pages:[['security','Fair play'],['moderation','Chat reports'],['activity','Activity log']]},
  {id:'sys',label:'System',icon:'settings',pages:[['settings','Commission'],['database','Database']]},
  {id:'me',label:'My account',icon:'account',pages:[['profile','My account']]}];
 const groupOf=page=>GROUPS.find(g=>g.pages.some(([p])=>p===page));
 function setupNav(){
  const nav=$('.panelNav nav');if(!nav)return;
  for(const el of nav.children)if(!el.dataset.group)el.hidden=true;
  if(!nav.querySelector('[data-group]')){
   nav.insertAdjacentHTML('beforeend',GROUPS.map(g=>'<button type="button" class="navItem centerGroup" data-panel="'+g.pages[0][0]+'" data-group="'+g.id+'"><span class="navIcon">'+icon(g.icon)+'</span> '+g.label+'</button>').join(''));
   const alerts=$('#navAlerts');if(alerts)nav.querySelector('[data-group="home"]').append(alerts);}
  if(!$('#subTabs'))$('.dashHead')?.insertAdjacentHTML('afterend','<nav id="subTabs" class="subTabs" aria-label="Section" hidden></nav>');
  ensurePages();}
 function onOpen(page){
  const g=groupOf(page);
  document.querySelectorAll('.navItem[data-group]').forEach(b=>{const on=b.dataset.group===g?.id;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const bar=$('#subTabs');if(bar){bar.hidden=!g||g.pages.length<2;bar.innerHTML=g&&g.pages.length>1?g.pages.map(([p,l])=>'<button type="button" data-panel="'+p+'"'+(p===page?' class="on" aria-current="page"':'')+'>'+l+'</button>').join(''):'';}
  if(page==='overview'){const t=$('#panelTitle');if(t)t.textContent='Dashboard';const d=$('#panelDescription');if(d)d.textContent='How the platform is doing today, at a glance.';}
  if(page==='users')loadUsers();if(page==='summary')loadReport();if(page==='overview')loadHome();}

 // ---- Pages made here ----
 function ensurePages(){
  if($('[data-page="users"]'))return;
  $('[data-page="overview"]').insertAdjacentHTML('afterbegin','<div id="homeKpis" class="homeKpis"></div><article class="surface homeChart"><div class="sectionHead"><div><h2>Last 14 days</h2><p class="muted">What the centre kept each day, after the network\'s shares.</p></div><button type="button" class="ghostButton" data-panel="summary">Open the report →</button></div><div id="homeChart" class="cbars"></div></article>');
  $('[data-page="overview"]').insertAdjacentHTML('afterend',`
<section class="panelPage" data-page="users" hidden>
 <div id="uCounts" class="uCounts"></div>
 <article class="surface"><div class="uTools">
  <input type="search" id="uSearch" placeholder="Search name or email…" autocomplete="off">
  <select id="uRole"><option value="">Every role</option><option value="USER">Players</option><option value="AGENT">Agents</option><option value="MANAGER">Managers</option><option value="ADMIN">Administrators</option></select>
  <select id="uStatus"><option value="">Any status</option><option value="online">Online now</option><option value="playing">At a table</option><option value="blocked">Blocked</option><option value="direct">Registered alone</option><option value="never">Never signed in</option><option value="idle">No hands in the period</option></select>
  <select id="uUnder"><option value="">Whole platform</option></select>
  <select id="uDays"><option value="7">Stats: 7 days</option><option value="30" selected>Stats: 30 days</option><option value="90">Stats: 90 days</option></select>
  <select id="uSort"><option value="balance">Sort: wallet</option><option value="rake">Sort: rake</option><option value="hands">Sort: hands</option><option value="net">Sort: won / lost</option><option value="login">Sort: last sign-in</option><option value="name">Sort: name</option></select>
  <button type="button" class="ghostButton" id="uCsv">⬇ CSV</button></div>
  <p class="muted" id="uInfo"></p>
  <div class="tableScroll"><table class="dataTable uTable"><thead><tr><th>Account</th><th>Role</th><th>Network</th><th>Wallet</th><th>On tables</th><th>Hands</th><th>Won / lost</th><th>Rake</th><th>Last seen</th></tr></thead><tbody id="uRows"></tbody></table></div>
  <button type="button" class="ghostButton uMore" id="uMore" hidden>Show more</button></article>
</section>
<section class="panelPage" data-page="summary" hidden>
 <article class="surface revFilters"><div id="sPresets" class="revPresets" role="group" aria-label="Period">
  <button type="button" data-p="today">Today</button><button type="button" data-p="yesterday">Yesterday</button><button type="button" data-p="7d">Last 7 days</button><button type="button" data-p="30d" aria-pressed="true">Last 30 days</button><button type="button" data-p="month">This month</button><button type="button" data-p="lastmonth">Last month</button></div>
  <form id="sRange" class="revRange"><label>From<input type="date" id="sFrom" required></label><label>To<input type="date" id="sTo" required></label><button class="primary">Apply</button><button type="button" id="sCsv" class="ghostButton">⬇ Download CSV</button><span id="sStatus" class="muted" role="status"></span></form></article>
 <div id="sBody"></div>
</section>
<dialog id="userDrawer" class="userDrawer"><div id="udBody"></div></dialog>`);
  bindUsers();bindReport();}

 // ---- Dashboard ----
 async function loadHome(){
  try{const [t,w]=await Promise.all([api('center/report',{preset:'today'}),api('center/report',{from:new Date(Date.now()-13*864e5).toLocaleDateString('en-CA',{timeZone:'Europe/Tirane'}),to:new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Tirane'})})]);
   const c=t.current,b=t.before,dir=dirCache;
   $('#homeKpis').innerHTML=[
    kpi('Centre kept today',fmt(c.center),delta(c.center,b.center)+'<small>yesterday '+fmt(b.center)+'</small>','hero'),
    kpi('Rake from players',fmt(c.rake),delta(c.rake,b.rake)+'<small>'+fmt(c.shares)+' to the network</small>'),
    kpi('Players today',c.players,'<small>'+c.newPlayers+' new · '+c.humanHands+' hands with players</small>'),
    kpi('Online now',dir?dir.counts.online:'…','<small>'+(dir?dir.counts.playing+' at a table':'')+'</small>'),
    kpi('Credit in circulation',fmt(t.now.total),'<small>players '+fmt(t.now.players)+' · tables '+fmt(t.now.onTables)+' · created today '+fmt(c.created)+'</small>'),
    kpi('Deposits today',fmt(c.deposits),'<small>'+c.depositCount+' · withdrawals '+fmt(c.withdrawals)+'</small>'),
    kpi('Withdrawals to pay',t.pending.withdrawals,t.pending.withdrawals?'<small><button type="button" class="linkBtn" data-panel="crypto">'+fmt(t.pending.amount)+' · open payments →</button></small>':'<small>nothing waiting</small>',t.pending.withdrawals?'warn':''),
    kpi('CENB bots today',signed(c.cenbResult),'<small>against players · bot rake '+fmt(c.bots)+'</small>')].join('');
   bars($('#homeChart'),w.daily.map(d=>({label:day(d.day).slice(0,5),value:d.center,note:fmt(d.center)+' kept · '+fmt(d.rake)+' rake · '+d.players+' players'})));
   if(!dir)loadDir().then(()=>{if($('[data-page="overview"]').hidden===false)loadHome();});
  }catch(err){toast(err.message);}}
 function bars(el,rows){const max=Math.max(...rows.map(r=>r.value),0);
  el.innerHTML=rows.map(r=>'<div class="cbar" title="'+safe(r.label+' · '+r.note)+'"><i style="height:'+(max>0?Math.max(2,Math.round(r.value/max*100)):2)+'%"></i><small>'+safe(r.label)+'</small></div>').join('')+'<span class="cbarMax">max '+fmt(max)+'</span>';}

 // ---- Every user ----
 let dirCache=null,uLimit=100;
 async function loadDir(){dirCache=await api('center/users',{days:Number($('#uDays')?.value)||30});return dirCache;}
 async function loadUsers(){try{$('#uInfo').textContent='Loading…';await loadDir();fillUnder();renderUsers();}catch(err){toast(err.message);}}
 function fillUnder(){const sel=$('#uUnder'),keep=sel.value,staff=dirCache.rows.filter(r=>r.role!=='USER').sort((a,b)=>['ADMIN','MANAGER','AGENT'].indexOf(a.role)-['ADMIN','MANAGER','AGENT'].indexOf(b.role)||a.username.localeCompare(b.username));
  sel.innerHTML='<option value="">Whole platform</option>'+staff.map(s=>'<option value="'+safe(s.id)+'">Under '+safe(roleNames[s.role])+' '+safe(s.username)+' ('+s.below+')</option>').join('');sel.value=keep;}
 function filtered(){const q=$('#uSearch').value.trim().toLowerCase(),role=$('#uRole').value,st=$('#uStatus').value,under=dirCache.rows.find(r=>r.id===$('#uUnder').value);
  const sorts={balance:(a,b)=>b.balance+b.chips-a.balance-a.chips,rake:(a,b)=>b.rake-a.rake,hands:(a,b)=>b.hands-a.hands,net:(a,b)=>b.net-a.net,login:(a,b)=>(b.lastLoginAt||0)-(a.lastLoginAt||0),name:(a,b)=>a.username.localeCompare(b.username)};
  return dirCache.rows.filter(r=>(!q||r.username.toLowerCase().includes(q)||(r.email||'').toLowerCase().includes(q))&&(!role||r.role===role)
   &&(!st||(st==='online'&&r.online)||(st==='playing'&&r.tables.length)||(st==='blocked'&&r.blocked)||(st==='direct'&&r.direct)||(st==='never'&&!r.lastLoginAt)||(st==='idle'&&r.role==='USER'&&!r.hands))
   &&(!under||r.parent?.id===under.id||r.agent===under.username||r.manager===under.username||r.admin===under.username)).sort(sorts[$('#uSort').value]||sorts.balance);}
 function renderUsers(){const d=dirCache,c=d.counts,rows=filtered();
  $('#uCounts').innerHTML=[['All accounts',c.all,''],['Players',c.USER,'USER'],['Agents',c.AGENT,'AGENT'],['Managers',c.MANAGER,'MANAGER'],['Administrators',c.ADMIN,'ADMIN'],['Online now',c.online,'online'],['At a table',c.playing,'playing'],['Blocked',c.blocked,'blocked']]
   .map(([l,n,f])=>'<button type="button" class="uCount'+((f&&($('#uRole').value===f||$('#uStatus').value===f))||(!f&&!$('#uRole').value&&!$('#uStatus').value)?' on':'')+'" data-uf="'+f+'"><strong>'+n+'</strong><small>'+l+'</small></button>').join('');
  const sum=rows.reduce((n,r)=>n+r.balance+r.chips,0);
  $('#uInfo').innerHTML=rows.length+' of '+d.rows.length+' accounts · credit of the ones shown '+fmt(sum)+' (wallets + chips) · hands, won / lost and rake over the last '+d.days+' days';
  $('#uRows').innerHTML=rows.slice(0,uLimit).map(r=>'<tr data-user="'+safe(r.id)+'" tabindex="0"><td><div class="accountCell"><span class="accountAvatar">'+safe(r.username[0].toUpperCase())+'</span><div><strong>'+safe(r.username)+'</strong>'+(r.email?'<small class="accountMeta">'+safe(r.email)+'</small>':'')+'</div></div></td>'
   +'<td>'+roleBadge(r.role,r.share)+(r.blocked?' <b class="statusBlocked">Blocked</b>':'')+'</td>'
   +'<td class="uNet">'+[r.agent&&'<span>A · '+safe(r.agent)+'</span>',r.manager&&'<span>M · '+safe(r.manager)+'</span>',r.admin&&'<span>AD · '+safe(r.admin)+'</span>'].filter(Boolean).join('')+(r.parent?.role==='CENTER'?'<span>Centre</span>':'')+(r.below?'<small>'+r.below+' below</small>':'')+'</td>'
   +'<td class="num">'+fmt(r.balance)+'</td><td class="num">'+(r.chips?fmt(r.chips)+'<small class="accountMeta">'+safe(r.tables.join(', '))+'</small>':'—')+'</td><td class="num">'+(r.hands||'—')+'</td><td class="num">'+(r.hands?signed(r.net):'—')+'</td><td class="num">'+(r.role==='USER'?fmt(r.rake):r.earned?'<span title="Earned from the rake">'+fmt(r.earned)+' earned</span>':'—')+'</td>'
   +'<td>'+(r.online?'<b class="statusOnline">● Online</b>':'<span class="muted">'+ago(r.lastLoginAt)+'</span>')+'</td></tr>').join('')||'<tr><td colspan="9" class="emptyState"><strong>No account matches.</strong></td></tr>';
  $('#uMore').hidden=rows.length<=uLimit;$('#uMore').textContent='Show more ('+(rows.length-uLimit)+')';}
 function bindUsers(){
  for(const id of ['#uSearch','#uRole','#uStatus','#uUnder','#uSort'])$(id).addEventListener('input',()=>{uLimit=100;if(dirCache)renderUsers();});
  $('#uDays').onchange=loadUsers;$('#uMore').onclick=()=>{uLimit+=200;renderUsers();};
  $('#uCounts').onclick=e=>{const b=e.target.closest('[data-uf]');if(!b)return;const f=b.dataset.uf;$('#uRole').value=['USER','AGENT','MANAGER','ADMIN'].includes(f)?f:'';$('#uStatus').value=['online','playing','blocked'].includes(f)?f:'';renderUsers();};
  $('#uRows').onclick=e=>{const tr=e.target.closest('[data-user]');if(tr)openUser(tr.dataset.user);};
  $('#uRows').onkeydown=e=>{if(e.key==='Enter'){const tr=e.target.closest('[data-user]');if(tr)openUser(tr.dataset.user);}};
  $('#uCsv').onclick=()=>csv('users',['Account','Email','Role','Share %','Agent','Manager','Administrator','Wallet','On tables','Hands','Won / lost','Rake','Earned','Last sign-in','Blocked'],filtered().map(r=>[r.username,r.email||'',roleNames[r.role],r.share??'',r.agent||'',r.manager||'',r.admin||'',r.balance,r.chips,r.hands,r.net,r.rake,r.earned,r.lastLoginAt?new Date(r.lastLoginAt).toISOString():'',r.blocked?'yes':'']));
  $('#userDrawer').addEventListener('click',drawerClick);
  $('#userDrawer').addEventListener('close',()=>{openId=null;});}

 // ---- One user in full ----
 let openId=null,openData=null;
 const TYPES={TRANSFER:'Credit',RAKE:'Rake',CRYPTO_DEPOSIT:'Crypto deposit',CRYPTO_WITHDRAW:'Crypto withdrawal',CRYPTO_WITHDRAW_HOLD:'Withdrawal requested',CRYPTO_WITHDRAW_REFUND:'Withdrawal refunded',BUY_IN:'Buy-in',CASH_OUT:'Left table',REBUY:'Rebuy',BLOCK:'Blocked',UNBLOCK:'Unblocked',SHARE:'Share changed',MINT:'Credit created',ADJUST:'Adjustment',REGISTER:'Registered'};
 async function openUser(id){openId=id;const dlg=$('#userDrawer');if(!dlg.open)dlg.showModal();$('#udBody').innerHTML='<p class="muted udLoading">Loading…</p>';
  try{const a=await api('center/user',{id});if(openId!==id)return;openData=a;renderUser(a);}catch(err){$('#udBody').innerHTML='<p class="muted">'+safe(err.message)+'</p>';}}
 function renderUser(a){const u=a.user,isPlayer=u.role==='USER',s30=a.stats30,all=a.statsAll;
  const chain=[{username:'Centre',role:'CENTER'},...a.path.filter(p=>p.role!=='CENTER')].map(p=>p.id?'<button type="button" class="chainBtn" data-open="'+safe(p.id)+'">'+safe(roleNames[p.role])+' · '+safe(p.username)+'</button>':'<span class="chainBtn">Centre</span>').join('<i>›</i>');
  $('#udBody').innerHTML='<header class="udHead"><span class="accountAvatar big">'+safe(u.username[0].toUpperCase())+'</span><div><h2>'+safe(u.username)+'</h2><p>'+roleBadge(u.role,u.share)+' '+(u.blocked?'<b class="statusBlocked">● Blocked</b>':u.online?'<b class="statusOnline">● Online</b>':'<span class="muted">○ last sign-in '+ago(u.lastLoginAt)+'</span>')+(u.mutedUntil?' <span class="muted">🔇 muted until '+when(u.mutedUntil)+'</span>':'')+'</p>'
   +(u.email?'<p class="muted">'+safe(u.email)+' · registered alone</p>':'')+'</div><button type="button" class="udClose" data-ud="close" aria-label="Close">✕</button></header>'
   +'<div class="udChain">'+chain+'</div>'
   +'<div class="udKpis">'+kpi('Wallet',fmt(u.balance))+kpi('On tables',fmt(u.chips),u.tables.length?'<small>'+safe(u.tables.join(', '))+'</small>':'')
   +(isPlayer?kpi('Rake · 30 days',fmt(a.rake30))+kpi('Won / lost · 30 days',s30?signed(s30.net):'—','<small>'+(s30?.hands||0)+' hands</small>')
     :kpi('Earned · 30 days',fmt(a.earned30),'<small>its share of the rake</small>')+kpi('Its network',a.network.players+' players','<small>'+a.network.accounts+' accounts · credit '+fmt(a.network.balance)+' · rake 30 d '+fmt(a.network.rake)+'</small>'))+'</div>'
   +'<div class="udActions"><label>Amount (€)<input type="number" id="udAmount" min="0.01" step="0.01" placeholder="0.00"></label><button type="button" class="sendButton" data-ud="send">+ Send credit</button><button type="button" data-ud="return">↙ Take back</button>'
   +'<button type="button" class="ghostButton" data-ud="password">🔑 New password</button>'+(isPlayer?'<button type="button" class="ghostButton" data-ud="mute">🔇 '+(u.mutedUntil?'Unmute':'Mute')+'</button>':'')
   +(u.share!=null&&a.path.length===1?'<button type="button" class="ghostButton" data-ud="share">％ Share</button>':'')
   +'<button type="button" class="ghostButton '+(u.blocked?'':'dangerButton')+'" data-ud="block">'+(u.blocked?'✓ Unblock':'⛔ Block')+'</button></div>'
   +'<p class="muted udHint">The centre can act on every account. Credit sent is created by the centre; credit taken back leaves circulation. Both are written in the credit history.</p>'
   +(isPlayer&&all?'<h3>Play</h3><div class="udStats"><div><small>Hands · all time</small><b>'+all.hands+'</b></div><div><small>Won / lost · all time</small>'+signed(all.net)+'</div><div><small>Hands won</small><b>'+(all.hands?Math.round(all.won/all.hands*100):0)+'%</b></div><div><small>Plays the hand (VPIP)</small><b>'+(all.hands?Math.round(all.vpip/all.hands*100):0)+'%</b></div><div><small>Best hand</small>'+signed(all.best)+'</div><div><small>Worst hand</small>'+signed(all.worst)+'</div></div>'
    +'<div class="tableScroll"><table class="dataTable"><thead><tr><th>When</th><th>Table</th><th>Cards</th><th>Result</th></tr></thead><tbody>'+(a.hands.map(h=>'<tr data-hand="'+h.id+'" class="clickRow"><td>'+when(h.time)+'</td><td>'+safe(h.table)+'</td><td>'+h.cards.map(card).join('')+'</td><td class="num">'+signed(h.result)+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">No hands yet.</td></tr>')+'</tbody></table></div>':'')
   +(a.children.length?'<h3>Directly below ('+a.children.length+')</h3><div class="udChildren">'+a.children.map(c=>'<button type="button" data-open="'+safe(c.id)+'"><b>'+safe(c.username)+'</b><small>'+safe(roleNames[c.role])+' · '+fmt(c.balance)+(c.blocked?' · blocked':c.online?' · online':'')+'</small></button>').join('')+'</div>':'')
   +'<h3>Credit movements</h3><div class="tableScroll"><table class="dataTable"><thead><tr><th>When</th><th>What</th><th>Details</th><th>Amount</th></tr></thead><tbody>'+(a.ledger.map(x=>'<tr><td>'+when(x.time)+'</td><td>'+safe(TYPES[x.type]||x.type)+(x.cash?' · cash-out':'')+'</td><td class="muted">'+safe(x.type==='RAKE'?(x.table||'')+(x.hand?' · hand '+x.hand:''):[x.from&&'from '+x.from,x.to&&'to '+x.to].filter(Boolean).join(' '))+'</td><td class="num">'+(x.amount?signed(x.amount):'—')+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">Nothing yet.</td></tr>')+'</tbody></table></div>'
   +'<h3>Sign-ins</h3><p class="muted">Last sign-in '+when(u.lastLoginAt)+' · account since '+when(u.created)+' · '+u.devices+' device'+(u.devices===1?'':'s')+(u.ips.length?' · addresses: '+u.ips.map(safe).join(', '):'')+'</p>';}
 async function drawerClick(e){
  if(e.target===$('#userDrawer')){$('#userDrawer').close();return;}
  const o=e.target.closest('[data-open]');if(o){openUser(o.dataset.open);return;}
  const h=e.target.closest('[data-hand]');if(h&&openHand){openHand(Number(h.dataset.hand));return;}
  const b=e.target.closest('[data-ud]');if(!b||!openData)return;const u=openData.user,act=b.dataset.ud;
  if(act==='close'){$('#userDrawer').close();return;}
  try{
   if(act==='send'||act==='return'){const amount=Number(($('#udAmount').value||'').replace(',','.'));if(!(amount>0)){toast('Enter the amount');return;}
    if(!confirm((act==='send'?'Send '+fmt(amount)+' to ':'Take back '+fmt(amount)+' from ')+u.username+'?'))return;await api('transfer',{userId:u.id,direction:act,amount});toast(act==='send'?'Sent '+fmt(amount)+' to '+u.username:'Took back '+fmt(amount)+' from '+u.username);}
   else if(act==='password'){const pw=prompt('New password for '+u.username+'. They will be signed out everywhere.');if(!pw)return;await api('users/password',{userId:u.id,password:pw});toast('Password changed');}
   else if(act==='mute'){const v=u.mutedUntil?'0':prompt('Mute '+u.username+' in chat for how many minutes?','60');if(v===null)return;await api('users/mute',{userId:u.id,minutes:Number(v)});toast(Number(v)?u.username+' muted':u.username+' can write again');}
   else if(act==='share'){const v=prompt(u.username+'\'s share of the rake (0–100%). Now: '+u.share+'%. Applies to future hands.',String(u.share));if(v===null)return;const r=await api('users/share',{userId:u.id,share:v.replace(',','.')});toast(u.username+': '+r.share+'%');}
   else if(act==='block'){const block=!u.blocked,below=openData.network?.accounts||0;if(block&&!confirm('Block '+u.username+'? They are signed out at once and their table chips go back to their wallet.'))return;
    const network=block&&below>0&&confirm('Block everyone under '+u.username+' too ('+below+')?\n\nOK = the whole network\nCancel = only '+u.username);const r=await api('users/status',{userId:u.id,blocked:block,network});toast((block?u.username+' blocked':u.username+' unblocked')+(r.network?' · with '+r.network+' below':''));}
   await openUser(u.id);dirCache=null;if(!$('[data-page="users"]').hidden)loadUsers();
  }catch(err){toast(err.message);}}

 // ---- The report ----
 let rep=null,repBody={preset:'30d'};
 function bindReport(){
  $('#sPresets').onclick=e=>{const b=e.target.closest('[data-p]');if(!b)return;repBody={preset:b.dataset.p};loadReport();};
  $('#sRange').onsubmit=e=>{e.preventDefault();repBody={from:$('#sFrom').value,to:$('#sTo').value};loadReport();};
  $('#sCsv').onclick=()=>{if(!rep)return;csv('report-'+rep.from+'-'+rep.to,['Day','Rake from players','To the network','Centre kept','Bot rake','Hands','Hands with players','Players','New players','Deposits','Withdrawals','Credit sent to network','Credit returned'],
   rep.daily.map(d=>[d.day,d.rake,d.shares,d.center,d.bots,d.hands,d.humanHands,d.players,d.newPlayers,d.deposits,d.withdrawals,d.toNetwork,d.fromNetwork]));};
  $('#sBody').addEventListener('click',e=>{const o=e.target.closest('[data-open]');if(o)openUser(o.dataset.open);});}
 async function loadReport(){
  document.querySelectorAll('#sPresets [data-p]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.p===repBody.preset)));
  $('#sStatus').textContent='Loading…';
  try{rep=await api('center/report',repBody);$('#sFrom').value=rep.from;$('#sTo').value=rep.to;$('#sStatus').textContent='Updated '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});renderReport(rep);}catch(err){$('#sStatus').textContent=err.message;}}
 function renderReport(r){const c=r.current,b=r.before,n=r.now;
  const label=r.from===r.to?day(r.from):day(r.from)+' – '+day(r.to),prevLabel=r.previous.from===r.previous.to?day(r.previous.from):day(r.previous.from)+' – '+day(r.previous.to);
  const line=(name,cur,prev,{neg=false,strong=false,note=''}={})=>'<tr class="'+(strong?'strong':'')+'"><td>'+name+(note?'<small>'+note+'</small>':'')+'</td><td class="num">'+(neg&&cur?'− ':'')+fmt(cur)+'</td><td class="num muted">'+(neg&&prev?'− ':'')+fmt(prev)+'</td><td class="num">'+delta(cur,prev)+'</td></tr>';
  const count=(name,cur,prev,note='')=>'<tr><td>'+name+(note?'<small>'+note+'</small>':'')+'</td><td class="num">'+cur+'</td><td class="num muted">'+prev+'</td><td class="num">'+delta(cur,prev)+'</td></tr>';
  const head='<p class="sPeriod">Period <b>'+label+'</b> · compared with <b>'+prevLabel+'</b></p><table class="dataTable sTable"><thead><tr><th></th><th class="num">Period</th><th class="num">Before</th><th class="num">Change</th></tr></thead>';
  const maxDay=Math.max(...r.daily.map(d=>d.rake),0);
  const reconciled=n.ok;
  $('#sBody').innerHTML=
   '<div class="sHero">'+kpi('Centre kept',fmt(c.center),delta(c.center,b.center)+'<small>rake '+fmt(c.rake)+' − network '+fmt(c.shares)+'</small>','hero')+kpi('Rake from players',fmt(c.rake),delta(c.rake,b.rake)+'<small>'+c.rakeHands+' hands with rake · '+fmt(c.avgRake)+' a hand</small>')
    +kpi('Active players',c.players,delta(c.players,b.players)+'<small>'+c.newPlayers+' new in the period</small>')+kpi('Hands played',c.humanHands,delta(c.humanHands,b.humanHands)+'<small>with players · '+c.hands+' with bots too</small>')+'</div>'
   +'<div class="sGrid"><article class="surface"><div class="sectionHead"><div><h2>1 · Revenue</h2><p class="muted">The rake real players paid, how it was shared, and what the centre kept.</p></div></div>'+head+'<tbody>'
    +line('Rake paid by players',c.rake,b.rake,{strong:true})+line('Administrators\' share',c.byRole.ADMIN,b.byRole.ADMIN,{neg:true})+line('Managers\' share',c.byRole.MANAGER,b.byRole.MANAGER,{neg:true})+line('Agents\' share',c.byRole.AGENT,b.byRole.AGENT,{neg:true})
    +line('= Centre kept',c.center,b.center,{strong:true})+'</tbody></table><p class="muted sNote">Rake the CENB bots paid: '+fmt(c.bots)+'. It is the house paying itself, so it is not counted as revenue. Bots against players: '+signed(c.cenbResult)+'.</p></article>'
   +'<article class="surface"><div class="sectionHead"><div><h2>2 · Credit created and returned</h2><p class="muted">The centre creates credit: when it gives it, it comes into circulation; when it comes back, it leaves circulation.</p></div></div>'+head+'<tbody>'
    +line('Credit created for the network',c.toNetwork,b.toNetwork,{note:'centre → administrators, agents, players'})+line('Credit created for crypto deposits',c.deposits,b.deposits,{note:c.depositCount+' payments'})+line('Credit created for CENB',c.toCenb,b.toCenb)
    +line('= Credit created',c.created,b.created,{strong:true})
    +line('Returned by the network',c.fromNetwork,b.fromNetwork,{neg:true})+line('Paid out as crypto withdrawals',c.withdrawals,b.withdrawals,{neg:true,note:c.withdrawalCount+' payments'})+line('Returned by CENB',c.fromCenb,b.fromCenb,{neg:true})
    +line('= Credit returned',c.returned,b.returned,{strong:true})
    +line('Change in circulation',c.net,b.net,{strong:true,note:'created − returned − what the centre kept from the rake'})
    +line('Cash-outs to agents',c.cashouts,b.cashouts,{note:'players who gave credit back to their agent; it stays in circulation'})+'</tbody></table></article></div>'
   +'<div class="sGrid"><article class="surface"><div class="sectionHead"><div><h2>3 · Play</h2></div></div>'+head+'<tbody>'
    +count('Hands with real players',c.humanHands,b.humanHands)+count('All hands',c.hands,b.hands,'with bots too')+count('Players who played',c.players,b.players)+count('New players',c.newPlayers,b.newPlayers)+line('Average rake a hand',c.avgRake,b.avgRake)+'</tbody></table></article>'
   +'<article class="surface"><div class="sectionHead"><div><h2>4 · Credit in circulation now</h2><p class="muted">All the credit the centre created that is out there right now, and where it is.</p></div><span class="badge '+(reconciled?'okBadge':'warnBadge')+'">'+(reconciled?'✓ MONEY CHECK OK':'CHECK')+'</span></div><table class="dataTable sTable"><tbody>'
    +[['Players\' wallets',n.players],['On the tables',n.onTables+n.pots],['Agents',n.agents],['Managers',n.managers],['Administrators',n.admins],['CENB (wallet, rake, bots)',n.cenb.wallet+n.cenb.rake+n.cenb.bots],['Withdrawals waiting',n.held]].map(([l,v])=>'<tr><td>'+l+'</td><td class="num">'+fmt(v)+'</td></tr>').join('')
    +'<tr class="strong"><td>Credit in circulation</td><td class="num">'+fmt(n.total)+'</td></tr></tbody></table><p class="muted sNote">'+(reconciled?'The server\'s money check confirms every movement: no credit appeared or disappeared outside the centre\'s own actions.':'The money check found a difference. Open Dashboard → Server.')+' The centre itself holds nothing: it creates credit when it gives it.</p></article></div>'
   +'<article class="surface"><div class="sectionHead"><div><h2>5 · Day by day</h2><p class="muted">Days in Tirana time.</p></div></div><div class="tableScroll"><table class="dataTable sDaily"><thead><tr><th>Day</th><th class="num">Rake</th><th></th><th class="num">Network</th><th class="num">Centre kept</th><th class="num">Hands</th><th class="num">Players</th><th class="num">New</th><th class="num">Deposits</th><th class="num">Withdrawals</th></tr></thead><tbody>'
    +r.daily.slice().reverse().map(d=>'<tr><td>'+day(d.day)+'</td><td class="num">'+fmt(d.rake)+'</td><td class="barCell"><i style="width:'+(maxDay?Math.round(d.rake/maxDay*100):0)+'%"></i></td><td class="num">'+fmt(d.shares)+'</td><td class="num"><b>'+fmt(d.center)+'</b></td><td class="num">'+d.humanHands+'</td><td class="num">'+d.players+'</td><td class="num">'+d.newPlayers+'</td><td class="num">'+fmt(d.deposits)+'</td><td class="num">'+fmt(d.withdrawals)+'</td></tr>').join('')
    +'</tbody><tfoot><tr><td>Total</td><td class="num">'+fmt(c.rake)+'</td><td></td><td class="num">'+fmt(c.shares)+'</td><td class="num"><b>'+fmt(c.center)+'</b></td><td class="num">'+c.humanHands+'</td><td class="num">'+c.players+'</td><td class="num">'+c.newPlayers+'</td><td class="num">'+fmt(c.deposits)+'</td><td class="num">'+fmt(c.withdrawals)+'</td></tr></tfoot></table></div></article>'
   +'<div class="sGrid"><article class="surface"><div class="sectionHead"><div><h2>6 · Network</h2><p class="muted">Rake from each one\'s players, and what each one earned.</p></div></div><div class="tableScroll"><table class="dataTable"><thead><tr><th>Who</th><th class="num">Players</th><th class="num">Rake</th><th class="num">Earned</th></tr></thead><tbody>'
    +(r.network.map(x=>'<tr class="clickRow" data-open="'+safe(x.id)+'"><td><b>'+safe(x.username)+'</b> '+roleBadge(x.role)+'</td><td class="num">'+x.players+'</td><td class="num">'+fmt(x.rake)+'</td><td class="num">'+fmt(x.earned)+'</td></tr>').join('')||'<tr><td colspan="4" class="muted">No rake in this period.</td></tr>')+'</tbody></table></div></article>'
   +'<article class="surface"><div class="sectionHead"><div><h2>7 · Players</h2><p class="muted">Who paid the most rake.</p></div></div><div class="tableScroll"><table class="dataTable"><thead><tr><th>Player</th><th>Agent</th><th class="num">Rake</th></tr></thead><tbody>'
    +(r.players.map(x=>'<tr class="clickRow" data-open="'+safe(x.id)+'"><td><b>'+safe(x.username)+'</b></td><td class="muted">'+safe(x.agent||'—')+'</td><td class="num">'+fmt(x.rake)+'</td></tr>').join('')||'<tr><td colspan="3" class="muted">No rake in this period.</td></tr>')+'</tbody></table></div></article></div>';}

 function csv(name,head,rows){const esc=v=>{const s=String(v??'');return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const blob=new Blob(['﻿'+[head,...rows].map(r=>r.map(esc).join(',')).join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

 return {setupNav,onOpen,openUser};
}
