// CENB · the bot control room. Its own sign-in; the token lives only in this tab.
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=n=>'€'+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const signed=n=>'<b class="'+(n>0?'up':n<0?'down':'')+'">'+(n>0?'+':'')+eur(n)+'</b>';
const ago=t=>{const s=Math.round((Date.now()-t)/1000);return s<60?s+' sek':s<3600?Math.round(s/60)+' min':Math.round(s/3600)+' orë';};
let token=null;try{token=sessionStorage.getItem('cenbToken');}catch{}
let data=null,tab='bots',editing=null,expandedBot=null;

function toast(text,bad=false){const t=$('#toast');t.textContent=text;t.className='show'+(bad?' bad':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className='',3200);}
async function api(path,body){
 const r=await fetch('/api/cenb/'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body||{})});
 const j=await r.json().catch(()=>({error:'The server did not answer'}));
 if(r.status===401&&!['login','setup','password'].includes(path)){signOut();throw Error('Hyr sërish në CENB');}
 if(!r.ok)throw Error(j.error||'Error');return j;
}
function signOut(){token=null;try{sessionStorage.removeItem('cenbToken');}catch{}data=null;$('#app').classList.add('hidden');$('#login').classList.remove('hidden');showSignIn();}

$('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginErr').textContent='';const f=e.target;
 try{const r=await api('login',{username:f.username.value,password:f.password.value});token=r.token;try{sessionStorage.setItem('cenbToken',token);}catch{}f.reset();await start();}
 catch(err){$('#loginErr').textContent=err.message;}};
$('#setupForm').onsubmit=async e=>{e.preventDefault();$('#setupErr').textContent='';const f=e.target;if(f.password.value!==f.again.value){$('#setupErr').textContent='Fjalëkalimet e reja nuk janë njësoj';return;}
 try{const r=await api('setup',{centerUsername:f.centerUsername.value,centerPassword:f.centerPassword.value,username:f.username.value,password:f.password.value});token=r.token;try{sessionStorage.setItem('cenbToken',token);}catch{}f.reset();toast('Hyrja e CENB u krijua. Përdoruesi: '+r.user);await start();}
 catch(err){$('#setupErr').textContent=err.message;}};
$('#passForm').onsubmit=async e=>{e.preventDefault();const f=e.target;if(f.next.value!==f.again.value)return toast('Fjalëkalimet e reja nuk janë njësoj',true);try{await api('password',{current:f.current.value,next:f.next.value});f.reset();toast('Fjalëkalimi u ndryshua');}catch(err){toast(err.message,true);}};
async function showSignIn(){try{const s=await fetch('/api/cenb/status',{method:'POST'}).then(r=>r.json());$('#setupForm').classList.toggle('hidden',!s.setup);$('#loginForm').classList.toggle('hidden',!!s.setup);}catch{}}
$('#logout').onclick=async()=>{try{await api('logout');}catch{}signOut();};

async function start(){$('#login').classList.add('hidden');$('#app').classList.remove('hidden');await refresh(true);}

// ---- Tabs ----
$('#tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;$$('#tabs [data-tab]').forEach(x=>x.classList.toggle('on',x===b));$$('[data-pane]').forEach(p=>p.classList.toggle('hidden',p.dataset.pane!==tab));};

// ---- Settings shared by "one bot", "many bots" and "edit" ----
function configFields(c={},mix=false){
 const tables=data?.catalog||[],styles=data?.styles||{low:'Tight',medium:'Balanced',high:'Aggressive'},auto=(c.tableId??'auto')==='auto';
 return '<label>Stili<select name="risk">'+(mix?'<option value="mix">Të përziera</option>':'')+Object.entries(styles).map(([k,v])=>'<option value="'+k+'"'+((c.risk||(mix?'mix':'medium'))===k?' selected':'')+'>'+safe(v)+'</option>').join('')+'</select></label>'
  +'<label>Mënyra<select name="mode"><option value="play">Luan duar</option><option value="seat"'+(c.mode==='seat'?' selected':'')+'>Vetëm zë vend · nuk luan</option></select></label>'
  +'<label>Kur niset<select name="waitForPlayers"><option value="false">Ulet kur ka lojtarë</option><option value="true"'+(c.waitForPlayers?' selected':'')+'>Ulet direkt · luan edhe me bota</option></select></label>'
  +'<label>Tavolina<select name="tableId" data-table><option value="auto"'+(auto?' selected':'')+'>Auto · zgjedh vetë ku duhet</option>'+tables.map(t=>'<option value="'+safe(t.id)+'"'+(c.tableId===t.id?' selected':'')+'>'+safe(t.name)+' · '+eur(t.sb)+'/'+eur(t.bb)+' · '+t.size+' vende</option>').join('')+'</select></label>'
  +'<label data-auto'+(auto?'':' class="hidden"')+'>Buy-in (big blinds)<input name="buyinBB" type="number" min="10" max="100" step="1" value="'+(c.buyinBB||100)+'"></label>'
  +'<label data-auto'+(auto?'':' class="hidden"')+'>Big blind max (€) · 0 pa limit<input name="maxBB" type="number" min="0" step="0.01" value="'+(c.maxBB||0)+'"></label>'
  +'<label data-fixed'+(auto?' class="hidden"':'')+'>Buy-in (€)<input name="buyin" type="number" min="0.01" step="0.01" value="'+(c.buyin||'')+'"></label>'
  +'<label>Limit humbjeje (€)<input name="stopLoss" type="number" min="0.01" step="0.01" value="'+(c.stopLoss||'')+'" required></label>'
  +'<label>Limit fitimi (€) · 0 pa limit<input name="stopWin" type="number" min="0" step="0.01" value="'+(c.stopWin??0)+'"></label>';
}
function bindConfig(root){const sel=root.querySelector('[data-table]');if(!sel)return;const sync=()=>{const auto=sel.value==='auto';root.querySelectorAll('[data-auto]').forEach(x=>x.classList.toggle('hidden',!auto));root.querySelectorAll('[data-fixed]').forEach(x=>x.classList.toggle('hidden',auto));
 const t=(data?.catalog||[]).find(t=>t.id===sel.value),b=root.querySelector('[name=buyin]');if(t&&b){b.min=t.min;b.max=t.max;b.placeholder=eur(t.min)+' – '+eur(t.max);if(!b.value)b.value=t.max;}};sel.onchange=sync;sync();}
const formBody=f=>{const o=Object.fromEntries(new FormData(f));const auto=o.tableId==='auto';if(auto)delete o.buyin;else{delete o.buyinBB;delete o.maxBB;}return o;};
function renderForms(){for(const box of $$('[data-config]')){const form=box.closest('form');if(form.contains(document.activeElement)&&box.childElementCount)continue;if(box.dataset.done)continue;box.innerHTML=configFields({},box.hasAttribute('data-mix'));box.dataset.done='1';bindConfig(form);}}
$('#createOne').onsubmit=async e=>{e.preventDefault();try{await api('bots/create',formBody(e.target));toast('Boti u krijua. Shtyp "Nis" kur të jesh gati.');e.target.name.value='';await refresh();}catch(err){toast(err.message,true);}};
$('#createMany').onsubmit=async e=>{e.preventDefault();try{const r=await api('bots/bulk',formBody(e.target));toast(r.ids.length+' bota u krijuan, të ndalur.');await refresh();}catch(err){toast(err.message,true);}};

// ---- Numbers at the top ----
function renderKpis(){
 const g=data.guard,W=data.wallets||{credit:0,profit:0,rake:0,inBots:0},b=data.bots,playing=b.filter(x=>x.seatedAt).length,on=b.filter(x=>x.enabled).length,rake=b.reduce((n,x)=>n+x.rakePaid,0),house=b.reduce((n,x)=>n+x.house,0);
 const humans=data.tables.filter(t=>t.bots>0).reduce((n,t)=>n+t.humans,0);
 const meter=(v,limit)=>limit>0?'<div class="meter" title="'+Math.round(Math.max(0,-v)/limit*100)+'% e limitit"><i style="width:'+Math.min(100,Math.max(0,-v)/limit*100)+'%"></i></div>':'<span>pa limit</span>';
 $('#kpis').innerHTML=[
  ['Profit sot ↗',signed(data.profitToday?.profit||0),'<span>'+(data.profitToday?.hands||0)+' duar · tavolina '+signed(data.profitToday?.net||0).replace('<b','<i').replace('</b>','</i>')+' · rake '+eur(data.profitToday?.rake||0)+'</span>'+(g.dailyLimit>0?'<span>Limit humbjeje '+eur(g.dailyLimit)+'</span>'+meter(g.today,g.dailyLimit):''),'profitCard'],
  ['Kuleta e kredisë','<b>'+eur(W.credit)+'</b>','<span>nga qendra · prej këtu financohen botat · në bota '+eur(W.inBots)+'</span><div class="miniRow"><button type="button" class="mini" data-wallet="credit">+ Nga qendra</button><button type="button" class="mini ghost" data-wallet="return"'+(W.credit>0?'':' disabled')+'>Kthe te qendra</button></div>'],
  ['Kuleta e fitimit','<b class="'+(W.profit>0?'up':'')+'">'+eur(W.profit)+'</b>','<span>fitimet e CENB pas rikreditimit të botave</span><div class="miniRow"><button type="button" class="mini" data-wallet="profit"'+(W.profit>0?'':' disabled')+'>Dërgo te qendra</button></div>'],
  ['Botat','<b>'+playing+' <small class="muted">/ '+on+' / '+b.length+'</small></b>','<span>në tavolinë / ndezur / gjithsej</span>'],
  ['Lojtarë që luajnë me bota','<b>'+humans+'</b>','<span>lojtarë të vërtetë në tavolina me bota</span>'],
  ['Rake i botave','<b>'+eur(data.cenbRake||0)+'</b>','<span>i ndarë nga fitimi · u kthehet botave me Rikrediti · gjithsej '+eur(rake)+'</span><button type="button" id="sendRake" class="mini"'+((data.cenbRake||0)>0?'':' disabled')+'>Dërgo te qendra</button>'],
  ['Kthyer te lojtarët','<b>'+eur(b.reduce((n,x)=>n+(x.returned||0),0))+'</b>','<span>Objektivi '+Number(g.returnPercent||0)+'% · në dispozicion '+eur(b.reduce((n,x)=>n+(x.returnAvailable||0),0))+'</span>'],
 ].map(([k,v,s,cls])=>'<div class="kpi'+(cls?' '+cls:'')+'"'+(cls==='profitCard'?' role="button" tabindex="0" title="Hap detajet e profitit"':'')+'><small>'+k+'</small>'+v.replace(/^<b class/,'<b class')+s+'</div>').join('');
 const stopped=g.stopped||[];$('#banner').classList.toggle('hidden',!stopped.length);$('#banner').textContent=stopped.length?'Limiti i shtëpisë u arrit ('+stopped.map(x=>x.replace('House ','').replace(' limit reached','')).join(', ')+'): të gjithë botat u ndalën dhe nisin vetë në periudhën tjetër.':'';
}

// ---- Bots ----
const statusSq=s=>s.replace('Playing at','Luan te').replace('Looking for a table','Kërkon tavolinë').replace('Waiting for players','Pret lojtarë').replace('Stopped','I ndalur').replace('Loss limit reached','Arriti limitin e humbjes').replace('Win limit reached','Arriti limitin e fitimit').replace('Wallet smaller than the buy-in','Portofoli më i vogël se buy-in').replace(/House (daily|weekly|monthly) limit reached/,(m,p)=>'Limiti '+({daily:'ditor',weekly:'javor',monthly:'mujor'}[p])+' i shtëpisë');
function renderBots(force=false){
 const list=$('#botList');if(!force&&editing&&list.querySelector('[data-edit]'))return;
 const focused=document.activeElement?.closest('#botList [data-act]'),focusId=focused?.closest('[data-id]')?.dataset.id,focusAct=focused?.dataset.act;
 $('#nBots').textContent=data.bots.length;const shown=filterBots(data.bots);$('#bfCount').textContent=shown.length+' nga '+data.bots.length;
 list.innerHTML=shown.length?shown.map(b=>{const err=!b.enabled&&b.status!=='Stopped';
  const open=expandedBot===b.id;
  return '<article class="bot'+(b.seatedAt?' on':'')+(err?' err':'')+'" data-id="'+safe(b.id)+'" role="listitem"><button type="button" class="botRow" data-act="details" aria-expanded="'+open+'" aria-controls="bot-details-'+safe(b.id)+'">'
  +'<span class="botIdentity"><span class="avatar">'+safe(b.name[0].toUpperCase())+'</span><span class="botName"><strong>'+safe(b.name)+'</strong><span class="pill'+(b.enabled?' on':err?' warn':'')+'">'+(b.enabled?'Ndezur':'Fikur')+'</span><small>'+safe(statusSq(b.status))+'</small></span></span>'
  +'<span class="rowMetric"><small>Tavolina · stili</small><strong>'+safe(b.seatedAt||(b.tableId==='auto'?'Auto':b.tableName))+'</strong><span>'+safe(b.style)+' · '+(b.mode==='seat'?'vetëm vend':'luan duar')+'</span></span>'
  +'<span class="rowMetric"><small>Portofol + stack</small><strong>'+eur(b.equity)+'</strong></span>'
  +'<span class="rowMetric"><small>Kjo seancë</small>'+signed(b.session)+'</span>'
  +'<span class="rowMetric"><small>Fitimi total</small>'+signed(b.total)+'</span>'
  +'<span class="rowMetric"><small>Duar</small><strong>'+b.hands+'</strong></span>'
  +'<span class="botChevron" aria-hidden="true">'+(open?'−':'+')+'</span></button>'
  +'<div id="bot-details-'+safe(b.id)+'" class="botDetails"'+(open?'':' hidden')+'>'+(open?'<h2>Statistikat · '+safe(b.name)+'</h2><div class="tag">'+(b.tableId==='auto'?'Auto · '+b.buyinBB+' BB'+(b.maxBB>0?' · deri '+eur(b.maxBB)+' BB':''):safe(b.tableName)+' · '+eur(b.buyin))+' · humbje max '+eur(b.stopLoss)+(b.stopWin>0?' · fitim max '+eur(b.stopWin):'')+' · '+(b.waitForPlayers?'ulet direkt':'ulet kur ka lojtarë')+'</div>'
  +'<div class="stats"><div><small>Portofol + stack</small><b>'+eur(b.equity)+'</b></div><div><small>Kjo seancë</small>'+signed(b.session)+'</div><div><small>Që nga krijimi</small>'+signed(b.total)+'</div><div><small>Duar</small><b>'+b.hands+'</b></div><div><small>Rake</small><b>'+eur(b.rakePaid)+'</b></div><div><small>Shtëpia</small>'+signed(b.house)+'</div></div>'
  +'<div class="stats returnStats"><div><small>Kthyer te lojtarët</small><b>'+eur(b.returned)+'</b></div><div><small>Në dispozicion për kthim</small><b>'+eur(b.returnAvailable)+'</b></div></div>'
  +'<div class="botBtns">'+(b.enabled?'<button class="small danger" data-act="stop">■ Ndalo</button>':'<button class="small gold" data-act="start">▶ Nis</button>')+'<button class="small" data-act="edit"'+(b.enabled||b.seatedAt?' disabled title="Ndale botin dhe prit sa të ngrihet"':'')+'>Ndrysho</button><button class="small" data-act="topup"'+(b.seatedAt?' disabled':'')+'>+ Para</button><button class="small ghost" data-act="delete"'+(b.enabled||b.seatedAt?' disabled':'')+'>Fshi</button></div>'
  +(b.enabled||b.seatedAt?'<p class="editHint">Për të ndryshuar konfigurimin, ndale botin dhe prit të largohet nga tavolina.</p>':'')
  +(editing===b.id?'<form class="edit grid" data-edit>'+configFields(b)+'<button class="gold">Ruaj</button><button type="button" class="ghost" data-act="cancel">Anulo</button></form>':''):'')+'</div></article>';}).join(''):'<div class="card empty">'+(data.bots.length?'Asnjë bot nuk përputhet me filtrat.':'Nuk ka bota ende. Hap "Krijo".')+'</div>';
 const f=list.querySelector('[data-edit]');if(f)bindConfig(f);
 if(focused){const row=[...list.querySelectorAll('[data-id]')].find(x=>x.dataset.id===focusId);row?.querySelector('[data-act="'+focusAct+'"]')?.focus({preventScroll:true});}
}
$('#botList').onclick=async e=>{const btn=e.target.closest('[data-act]');if(!btn)return;const id=btn.closest('[data-id]').dataset.id,act=btn.dataset.act,b=data.bots.find(x=>x.id===id);
 try{
  if(act==='details'){expandedBot=expandedBot===id?null:id;editing=null;renderBots(true);return;}
  else if(act==='start'){await api('bots/status',{id,enabled:true});toast(b.name+' u nis');}
  else if(act==='stop'){await api('bots/status',{id,enabled:false});toast(b.name+' u ndal');}
  else if(act==='edit'){editing=editing===id?null:id;renderBots(true);return;}
  else if(act==='cancel'){editing=null;renderBots(true);return;}
  else if(act==='topup'){const v=prompt('Sa euro të shtohen te '+b.name+'? (nga kredia e qendrës)');if(!v)return;await api('bots/topup',{id,amount:v});toast('U shtuan '+eur(v));}
  else if(act==='delete'){if(!confirm('Të fshihet '+b.name+'? Paratë e tij kthehen te qendra.'))return;await api('bots/delete',{id});toast(b.name+' u fshi');}
  await refresh();
 }catch(err){toast(err.message,true);}};
$('#botList').onsubmit=async e=>{e.preventDefault();const id=e.target.closest('[data-id]').dataset.id;try{await api('bots/configure',{id,...formBody(e.target)});editing=null;toast('U ruajt');await refresh();}catch(err){toast(err.message,true);}};
$('#reclaimAll').onclick=async()=>{if(!confirm('Të ndalen TË GJITHË botat dhe kredia e tyre të kthehet te kuleta e kredisë së CENB?\n\nBotat që janë në një dorë ngrihen sapo të mbarojë dora, dhe kredia e tyre kthehet vetë pas kësaj. Llogaritë e botave mbeten, me €0.'))return;try{const r=await api('bots/reclaim');toast('U kthyen €'+r.returned.toLocaleString('en-US',{minimumFractionDigits:2})+' nga '+r.bots+' bota'+(r.waiting?' · '+r.waiting+' po mbarojnë dorën, kthehen vetë':''));await refresh();}catch(err){toast(err.message,true);}};
document.addEventListener('click',async e=>{if(!e.target.closest('#sendRake'))return;const pool=data.cenbRake||0;if(!(pool>0))return;
 const v=prompt('Sa të dërgohet nga kuleta e CENB te qendra? Kuleta ka '+eur(pool)+'.\nLëre bosh për të gjithë shumën.',String(pool));if(v===null)return;
 try{const r=await api('bots/sendrake',v.trim()===''?{}:{amount:Number(v.replace(',','.'))});toast(eur(r.sent)+' u dërguan te qendra · mbeten '+eur(r.left));await refresh();}catch(err){toast(err.message,true);}});
$('#restoreBots').onclick=async()=>{if(!confirm('Të rikreditohen botat?\n\n• Çdo bot që nuk është në tavolinë kthehet te kredia me të cilën u financua.\n• Botat që fituan u japin atyre që humbën, dhe rake-u i botave u kthehet atyre.\n• Ajo që mbetet plus shkon te kuleta e CENB.\n\nBotat në tavolinë nuk preken: për t\'i përfshirë, shtyp më parë "Ndalo të gjithë".'))return;
 try{const r=await api('bots/restore');toast(r.bots+' bota u rikredituan'+(r.full?'':' (pjesërisht: kredia nuk mjaftonte)')+' · kuleta e fitimit +'+eur(r.walletChange)+' = '+eur(r.wallet)+(r.seated?' · '+r.seated+' në tavolinë nuk u prekën':''));await refresh();}catch(err){toast(err.message,true);}};
$('#stopAll').onclick=async()=>{if(!confirm('Të ndalen TË GJITHË botat tani? Ata që janë në një dorë ngrihen sapo të mbarojë.'))return;try{const r=await api('bots/stopall');toast(r.stopped+' bota u ndalën');await refresh();}catch(err){toast(err.message,true);}};
$('#startAll').onclick=async()=>{try{const r=await api('bots/startall');toast(r.started+' bota u nisën');await refresh();}catch(err){toast(err.message,true);}};

// ---- Other tabs ----
const table=(head,rows,empty)=>rows.length?'<table><thead><tr>'+head.map(h=>'<th'+(h.endsWith(' ')?' class="num"':'')+'>'+h.trim()+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>':'<div class="empty">'+empty+'</div>';
const num=v=>'<td class="num">'+v+'</td>';
function renderOthers(){
 $('#nTables').textContent=data.tables.length;
 $('#tableList').innerHTML=table(['Tavolina','Blinde','Vende ','Lojtarë ','Bota ','Në pritje ','Dora'],data.tables.map(t=>'<tr><td>'+safe(t.name)+'</td><td>'+eur(t.sb)+' / '+eur(t.bb)+'</td>'+num(t.size)+num(t.humans)+num(t.bots)+num(t.waiting)+'<td>'+(t.live?'<span class="pill on">në lojë</span>':'<span class="pill">pret</span>')+'</td></tr>'),'Asnjë tavolinë me lojtarë tani.');
 $('#playerList').innerHTML=table(['Lojtari','Duar ','VPIP ','PFR ','AF ','Fold ','Stili'],data.players.map(p=>'<tr><td>'+safe(p.name)+'</td>'+num(p.hands)+num(p.vpip+'%')+num(p.pfr+'%')+num(p.af)+num(p.foldToBet+'%')+'<td>'+safe(p.type)+'</td></tr>'),'Botat mësojnë stilin e një lojtari pas 10 duarsh me të.');
 const sq={fold:'Fold',check:'Check',call:'Call',raise:'Raise'},st={preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River'};
 $('#moveList').innerHTML=table(['Kur','Boti','Tavolina','Dora ','Rruga','Veprimi','Shuma ','Poti ','Shanset '],data.decisions.map(d=>'<tr><td>'+ago(d.at)+'</td><td>'+safe(d.bot)+'</td><td>'+safe(d.table)+'</td>'+num('#'+d.hand)+'<td>'+(st[d.street]||d.street)+'</td><td>'+(sq[d.action]||d.action)+'</td>'+num(d.amount!=null?eur(d.amount):'')+num(eur(d.pot))+num(d.equity!=null?d.equity+'%':'—')+'</tr>'),'Asnjë vendim ende.');
 $('#logList').innerHTML=table(['Kur','Veprimi','Detaje','Adresa'],data.log.map(l=>'<tr><td>'+new Date(l.at).toLocaleString('en-GB')+'</td><td>'+safe(l.action)+'</td><td>'+safe(l.detail)+'</td><td class="muted">'+safe(l.ip)+'</td></tr>'),'Asnjë veprim ende.');
 $('#passForm').classList.toggle('hidden',!!data.signIn?.fromServer);
 renderReturns();
 renderFill();
 const f=$('#limitsForm');if(!f.contains(document.activeElement))for(const k of ['dailyLimit','weeklyLimit','monthlyLimit','maxBB','maxPerTable'])f[k].value=data.guard[k];
}
$('#limitsForm').onsubmit=async e=>{e.preventDefault();try{await api('bots/settings',Object.fromEntries(new FormData(e.target)));toast('Limitet u ruajtën');await refresh();}catch(err){toast(err.message,true);}};


// Net-profit return settings have their own form and never overwrite other limits.
const returnsForm=$('#returnsForm'),percentInput=$('#returnPercent'),rangeInput=$('#returnRange');
function returnExample(){const p=Number(percentInput.value);$('#returnExample').textContent=Number.isFinite(p)&&p>=0&&p<=100?'Shembull: për 100 kredi fitim neto para kthimeve, objektivi është '+eur(p)+'. Kthimet e mëparshme zbriten nga objektivi.':'Vendos një përqindje nga 0 deri në 100.';}
percentInput.addEventListener('input',()=>{returnsForm.dataset.dirty='1';if(percentInput.validity.valid)rangeInput.value=percentInput.value;returnExample();});
rangeInput.addEventListener('input',()=>{returnsForm.dataset.dirty='1';percentInput.value=rangeInput.value;returnExample();});
function renderReturns(){
 const supported=Object.hasOwn(data.guard,'returnPercent'),p=Number(data.guard.returnPercent||0);
 $('#returnControls').disabled=!supported;
 $('#returnState').textContent=!supported?'Kërkon përditësim':p>0?p+'% aktiv':'I çaktivizuar';
 $('#returnState').classList.toggle('on',supported&&p>0);
 if(!returnsForm.dataset.dirty){percentInput.value=p;rangeInput.value=p;returnExample();}
 $('#returnSaved').textContent=supported?'E ruajtur: '+p+'% · zbatohet te të gjithë botët.':'Serveri i pokerit nuk e mbështet ende këtë konfigurim. Përditësoje dhe rinise.';
}
returnsForm.onsubmit=async e=>{e.preventDefault();if(!returnsForm.reportValidity())return;const button=$('#saveReturns');button.disabled=true;
 try{const result=await api('bots/settings',{returnPercent:Number(percentInput.value)});if(!Object.hasOwn(result,'returnPercent'))throw Error('Serveri nuk e konfirmoi përqindjen. Përditëso serverin e pokerit.');delete returnsForm.dataset.dirty;data.guard={...data.guard,...result};renderReturns();toast('Përqindja e kthimit u ruajt');await refresh();}
 catch(err){toast(err.message,true);}finally{button.disabled=false;}
};

const fillForm=$('#fillForm'),namesForm=$('#botNamesForm'),namesInput=$('#botNames');
function fillEstimate(){
 const f=fillForm.elements,empty=Number(f.emptySeats.value),lo=Number(f.buyinMinPercent.value),hi=Number(f.buyinMaxPercent.value),budget=Number(f.budgetPercent.value)/100;
 const tables=(data?.catalog||[]).filter(t=>f.tableId.value==='all'||t.id===f.tableId.value);
 let count=0,min=0,max=0;
 for(const t of tables){const n=Math.max(0,(t.free??t.size)-Math.min(empty,t.size));count+=n;min+=n*Math.max(t.min,t.max*lo/100)*budget;max+=n*t.max*hi/100*budget;}
 $('#fillEstimate').textContent=count+' vende për t’u mbushur në '+tables.length+' tavolina. Buxheti i botëve: rreth '+eur(min)+' – '+eur(max)+' kredi virtuale. Botët ekzistues të ripërdorur mund të kërkojnë më pak financim.';
 const names=namesInput.value.split(/[\s,;]+/).filter(Boolean);$('#botNamesCount').textContent=names.length+' emra në listë · '+(data?.fill?.names?.length||0)+' të ruajtur';
}
function renderFill(){
 if(!data)return;
 const supported=!!data.fill;$('#fillControls').disabled=!supported||fillForm.dataset.busy==='1';$('#saveBotNames').disabled=!supported||namesForm.dataset.busy==='1';
 const select=$('#fillTable'),signature=JSON.stringify((data.catalog||[]).map(t=>[t.id,t.name]));
 if(select.dataset.catalog!==signature){const current=select.value;select.innerHTML='<option value="all">Të gjitha tavolinat</option>'+(data.catalog||[]).map(t=>'<option value="'+safe(t.id)+'">'+safe(t.name)+' · '+t.size+' vende</option>').join('');select.value=[...select.options].some(o=>o.value===current)?current:'all';select.dataset.catalog=signature;}
 if(!fillForm.dataset.dirty)for(const [k,v] of Object.entries(data.fill?.settings||{}))if(fillForm.elements.namedItem(k))fillForm.elements.namedItem(k).value=v;
 if(!namesForm.dataset.dirty)namesInput.value=(data.fill?.names||[]).join('\n');
 $('#botNamesSaved').textContent=supported?(data.fill.names?.length||0)+' emra të ruajtur në server.':'Përditëso dhe rinis serverin që të aktivizohen këto opsione.';
 fillEstimate();
}
fillForm.addEventListener('input',()=>{fillForm.dataset.dirty='1';fillEstimate();});
fillForm.addEventListener('change',()=>{fillForm.dataset.dirty='1';fillEstimate();});
namesInput.addEventListener('input',()=>{namesForm.dataset.dirty='1';fillEstimate();});
namesForm.onsubmit=async e=>{e.preventDefault();if(namesForm.dataset.busy)return;namesForm.dataset.busy='1';$('#saveBotNames').disabled=true;
 try{const r=await api('bots/names',{names:namesInput.value});if(!Array.isArray(r.names))throw Error('Serveri nuk e konfirmoi listën');data.fill.names=r.names;delete namesForm.dataset.dirty;toast('Lista e emrave u ruajt');await refresh();}
 catch(err){toast(err.message,true);}finally{delete namesForm.dataset.busy;renderFill();}
};
fillForm.onsubmit=async e=>{e.preventDefault();if(fillForm.dataset.busy||!fillForm.reportValidity())return;
 if(namesForm.dataset.dirty)return toast('Ruaj fillimisht listën e emrave',true);
 const body=Object.fromEntries(new FormData(fillForm));if(Number(body.buyinMinPercent)>Number(body.buyinMaxPercent))return toast('Minimumi i buy-in nuk mund të jetë mbi maksimumin',true);
 fillForm.dataset.busy='1';$('#fillControls').disabled=true;$('#fillResult').textContent='Po mbushen tavolinat…';
 try{const r=await api('bots/fill',body);if(!Array.isArray(r.tables)||!Number.isInteger(r.added))throw Error('Serveri nuk e konfirmoi mbushjen');
  $('#fillResult').textContent=r.added+' bota u ulën · financim '+eur(r.funded)+' kredi virtuale.\n'+r.tables.map(t=>t.name+': '+(t.skipped?'u anashkalua · '+t.skipped:t.added+' bota u shtuan · '+t.emptySeats+' vende bosh të synuara'+(t.excess?' · '+t.excess+' bota të tepërt largohen ndërmjet duarve':''))).join('\n');
  delete fillForm.dataset.dirty;toast('Mbushja përfundoi');await refresh();
 }catch(err){$('#fillResult').textContent=err.message;toast(err.message,true);}finally{delete fillForm.dataset.busy;renderFill();}
};

async function refresh(first=false){
 try{data=await api('overview');$('#live').classList.remove('off');renderKpis();renderForms();renderBots();renderOthers();}
 catch(err){$('#live').classList.add('off');if(first)toast(err.message,true);}
}
setInterval(()=>{if(token&&data&&!document.hidden&&!document.activeElement?.closest('form'))refresh();},3000);
if(token)start().catch(()=>signOut());else showSignIn();

// ---- Tables tab: every seat, and seating a bot on a chosen one ----
let seatData=null,seatPick=null,seatBusy=false;
async function loadSeats(force){if(seatBusy||(!force&&(tab!=='tables'||document.hidden||$('#seatDialog').open)))return;seatBusy=true;try{seatData=await api('bots/tables');renderSeats();}catch(err){if(force)toast(err.message,true);}finally{seatBusy=false;}}
function renderSeats(){if(!seatData)return;const q=$('#seatSearch').value.trim().toLowerCase(),max=Number($('#seatStake').value)||0,freeOnly=$('#seatFreeOnly').checked;
 const prev=Number($('#seatStake').selectedOptions[0]?.previousElementSibling?.value)||0;
 const rows=seatData.tables.filter(t=>(!q||t.name.toLowerCase().includes(q))&&(!max||(t.bb<=max&&(max===9999?t.bb>2:t.bb>prev)))&&(!freeOnly||t.seats.some(s=>!s)));
 $('#seatTables').innerHTML=rows.length?rows.map(t=>'<div class="seatRow"><div class="seatName"><b>'+safe(t.name)+'</b><small>'+eur(t.sb)+' / '+eur(t.bb)+' · '+t.size+' vende'+(t.waiting?' · '+t.waiting+' në pritje':'')+(t.live?' · <span class="pill on">në lojë</span>':'')+'</small></div><div class="seatChips">'
  +t.seats.map((s,i)=>s?(s.bot?'<button type="button" class="seatChip bot'+(s.out?' out':'')+(s.leaving||!s.on?' leaving':'')+'" data-bot="'+safe(s.id||'')+'" data-bot-table="'+safe(t.id)+'" title="Shtyp për ta ndaluar"><i>'+(i+1)+'</i>'+safe(s.name)+(s.leaving||!s.on?' · ngrihet':'')+'</button>':'<span class="seatChip human'+(s.out?' out':'')+'" title="Lojtar · '+eur(s.stack)+'"><i>'+(i+1)+'</i>'+safe(s.name)+'</span>'):'<button type="button" class="seatChip empty" data-seat="'+safe(t.id)+':'+i+'"'+(t.waiting?' disabled title="Një lojtar pret radhën"':'')+'><i>'+(i+1)+'</i>＋ Ulu</button>').join('')+'</div></div>').join(''):'<div class="empty">Asnjë tavolinë nuk përputhet.</div>';}
for(const id of ['#seatSearch','#seatStake','#seatFreeOnly'])$(id).addEventListener('input',renderSeats);
$('#tabs').addEventListener('click',e=>{if(e.target.closest('[data-tab="tables"]'))loadSeats(true);});
setInterval(()=>loadSeats(),4000);
const seatMode=m=>{$$('[data-seatmode]').forEach(b=>b.classList.toggle('on',b.dataset.seatmode===m));$$('[data-seatpane]').forEach(p=>p.classList.toggle('hidden',p.dataset.seatpane!==m));$('#seatForm').dataset.mode=m;};
$('#seatDialog').addEventListener('click',e=>{const b=e.target.closest('[data-seatmode]');if(b&&!b.disabled)seatMode(b.dataset.seatmode);});
$('#seatTables').addEventListener('click',e=>{const b=e.target.closest('[data-seat]');if(!b||b.disabled)return;const [tid,pos]=b.dataset.seat.split(':'),t=seatData.tables.find(x=>x.id===tid);if(!t)return;seatPick={t,pos:Number(pos)};
 const f=$('#seatForm');f.reset();$('#seatTitle').textContent=t.name+' · vendi '+(seatPick.pos+1);$('#seatInfo').textContent='Blinde '+eur(t.sb)+' / '+eur(t.bb)+' · buy-in '+eur(t.min)+' – '+eur(t.max);
 f.buyin.min=t.min;f.buyin.max=t.max;f.buyin.value=(Math.round(t.max*60)/100).toFixed(2);
 f.risk.innerHTML=Object.entries(data?.styles||{low:'Tight',medium:'Balanced',high:'Aggressive'}).map(([k,v])=>'<option value="'+k+'"'+(k==='medium'?' selected':'')+'>'+safe(v)+'</option>').join('');
 const free=seatData.free||[];f.id.innerHTML=free.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+' · '+eur(x.balance)+'</option>').join('');
 $('[data-seatmode="old"]').disabled=!free.length;$('[data-seatmode="old"]').textContent=free.length?'Bot ekzistues ('+free.length+')':'Asnjë bot i lirë';seatMode('new');$('#seatDialog').showModal();});
$('#seatCancel').onclick=()=>$('#seatDialog').close();
$('#seatForm').addEventListener('submit',async e=>{e.preventDefault();if(!seatPick)return;const f=e.target,old=f.dataset.mode==='old',go=$('#seatGo');
 const body={tableId:seatPick.t.id,position:seatPick.pos,buyin:f.buyin.value,risk:f.risk.value,mode:f.mode.value,...(old?{id:f.id.value}:{name:f.name.value.trim(),budget:f.budget.value})};
 go.disabled=true;try{const r=await api('bots/seat',body);$('#seatDialog').close();toast(r.bot+' u ul te '+r.table+', vendi '+r.seat);await loadSeats(true);refresh();}catch(err){toast(err.message,true);}finally{go.disabled=false;}});

// A bot on the seat list: tap it to see it and stop it. It leaves the table as soon as its hand ends.
let botPick=null;
$('#seatTables').addEventListener('click',e=>{const c=e.target.closest('[data-bot]');if(!c||!c.dataset.bot)return;const t=seatData.tables.find(x=>x.id===c.dataset.botTable),s=t?.seats.find(x=>x?.id===c.dataset.bot);if(!s)return;botPick={id:s.id,name:s.name};
 const b=(data?.bots||[]).find(x=>x.id===s.id);$('#botDlgName').textContent=s.name;
 $('#botDlgInfo').textContent=t.name+' · vendi '+(s.p+1)+' · chips '+eur(s.stack)+(b?' · portofoli '+eur(b.balance)+' · '+b.hands+' duar':'')+(s.leaving||!s.on?' · tashmë i ndalur, ngrihet pas dorës':'');
 $('#botDlgStop').disabled=!s.on&&!!s.leaving;$('#botDialog').showModal();});
$('#botDlgClose').onclick=()=>$('#botDialog').close();
$('#botDlgStop').onclick=async()=>{if(!botPick)return;const btn=$('#botDlgStop');btn.disabled=true;try{await api('bots/status',{id:botPick.id,enabled:false});$('#botDialog').close();toast(botPick.name+' u ndal · ngrihet sapo të mbarojë dora');await loadSeats(true);refresh();}catch(err){toast(err.message,true);}finally{btn.disabled=false;}};

// ---- Bots: filters ----
const BF={q:'',status:'',style:'',table:'',sort:'name'};
function filterBots(list){const q=BF.q.toLowerCase();
 const st=b=>b.seatedAt?'playing':!b.enabled?(b.status!=='Stopped'?'err':'off'):'waiting';
 let out=list.filter(b=>(!q||b.name.toLowerCase().includes(q))&&(!BF.style||b.risk===BF.style)&&(!BF.table||b.seatedAt===BF.table||b.tableName===BF.table)
  &&(!BF.status||(BF.status==='on'?b.enabled:st(b)===BF.status)));
 const key={name:b=>b.name.toLowerCase(),total:b=>-b.total,session:b=>-b.session,hands:b=>-b.hands,equity:b=>-b.equity}[BF.sort]||(b=>b.name);
 return out.sort((a,b)=>{const x=key(a),y=key(b);return x<y?-1:x>y?1:0;});}
function fillBotFilters(){if(!data)return;const st=$('#bfStyle'),tb=$('#bfTable');
 const styles=Object.entries(data.styles||{}),tables=[...new Set(data.bots.map(b=>b.seatedAt||b.tableName).filter(x=>x&&x!=='—'&&x!=='Auto'))].sort();
 const keepS=st.value,keepT=tb.value;st.innerHTML='<option value="">Çdo stil</option>'+styles.map(([k,v])=>'<option value="'+k+'">'+safe(v)+'</option>').join('');st.value=keepS;
 tb.innerHTML='<option value="">Çdo tavolinë</option>'+tables.map(t=>'<option>'+safe(t)+'</option>').join('');tb.value=tables.includes(keepT)?keepT:'';}
for(const [id,k] of [['#bfSearch','q'],['#bfStatus','status'],['#bfStyle','style'],['#bfTable','table'],['#bfSort','sort']])$(id).addEventListener('input',e=>{BF[k]=e.target.value;renderBots(true);});
{const r0=refresh;refresh=async(...a)=>{await r0(...a);fillBotFilters();};}

// ---- Wallets ----
document.addEventListener('click',async e=>{const w=e.target.closest('[data-wallet]');if(!w||w.disabled)return;const W=data?.wallets||{};const action=w.dataset.wallet;
 const ask={credit:'Sa kredi t\'i jepet CENB nga qendra?',return:'Sa kredi të kthehet te qendra? Kuleta e kredisë ka '+eur(W.credit),profit:'Sa fitim të dërgohet te qendra? Kuleta e fitimit ka '+eur(W.profit)}[action];
 const def={credit:'',return:String(W.credit||''),profit:String(W.profit||'')}[action];const v=prompt(ask,def);if(v===null||!v.trim())return;
 try{const r=await api('bots/wallet',{action,amount:Number(v.replace(',','.'))});toast({credit:'CENB u kreditua',return:'Kredia u kthye te qendra',profit:'Fitimi u dërgua te qendra'}[action]+' · kredi '+eur(r.wallets.credit)+' · fitim '+eur(r.wallets.profit));await refresh();}catch(err){toast(err.message,true);}});

// ---- Profit ----
const tiranaDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tirane'}).format(t);
const addDay=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function presetRange(p){const today=tiranaDay(Date.now());if(p==='today')return [today,today];if(p==='yesterday'){const y=addDay(today,-1);return [y,y];}
 if(p==='7')return [addDay(today,-6),today];if(p==='30')return [addDay(today,-29),today];if(p==='month')return [today.slice(0,8)+'01',today];
 if(p==='lastmonth'){const first=today.slice(0,8)+'01',last=addDay(first,-1);return [last.slice(0,8)+'01',last];}return [today,today];}
let pfBusy=false;
async function loadProfit(){if(pfBusy)return;pfBusy=true;try{const r=await api('bots/profit',{from:$('#pfFrom').value,to:$('#pfTo').value,botId:$('#pfBot').value,tableId:$('#pfTable').value});renderProfit(r);}catch(err){toast(err.message,true);}finally{pfBusy=false;}}
function renderProfit(r){
 const fill=(sel,list,all)=>{const keep=sel.value;sel.innerHTML='<option value="">'+all+'</option>'+list.map(x=>'<option value="'+safe(x.id)+'">'+safe(x.name)+'</option>').join('');sel.value=list.some(x=>x.id===keep)?keep:'';};
 fill($('#pfBot'),r.choices.bots,'Të gjithë botat');fill($('#pfTable'),r.choices.tables,'Të gjitha tavolinat');
 const T=r.totals;$('#pfTotals').innerHTML=[['Profiti',signed(T.profit)],['Në tavolina (pas rake)',signed(T.net)],['Rake i botave',  '<b>'+eur(T.rake)+'</b>'],['Duar','<b>'+T.hands+'</b>'],['Duar të fituara','<b>'+T.winRate+'%</b>'],['Bota · tavolina','<b>'+T.bots+' · '+T.tables+'</b>'],['Kuleta e fitimit','<b>'+eur(r.wallets.profit)+'</b>']]
  .map(([k,v])=>'<div class="kpi"><small>'+k+'</small>'+v+'</div>').join('');
 const max=Math.max(1,...r.days.map(d=>Math.abs(d.profit)));
 $('#pfChart').innerHTML=r.days.length>1?r.days.map(d=>'<div class="pfBar" title="'+d.day+' · '+eur(d.profit)+'"><i class="'+(d.profit<0?'down':'up')+'" style="height:'+Math.max(2,Math.round(Math.abs(d.profit)/max*100))+'%"></i><small>'+d.day.slice(8)+'</small></div>').join(''):'';
 const row=(cells)=>'<tr>'+cells.join('')+'</tr>';const n=v=>'<td class="num">'+v+'</td>',s=v=>'<td class="num">'+signed(v)+'</td>';
 $('#pfDays').innerHTML=table(['Dita','Duar ','Në tavolina ','Rake ','Profiti '],r.days.slice().reverse().map(d=>row(['<td>'+d.day+'</td>',n(d.hands),s(d.net),n(eur(d.rake)),s(d.profit)])),'Asnjë dorë në këtë periudhë.');
 $('#pfBots').innerHTML=table(['Boti','Duar ','Të fituara ','Në tavolina ','Rake ','Profiti '],r.bots.map(b=>row(['<td>'+safe(b.name)+'</td>',n(b.hands),n(b.won||0),s(b.net),n(eur(b.rake)),s(b.profit)])),'Asnjë bot nuk ka luajtur në këtë periudhë.');
 $('#pfTables').innerHTML=table(['Tavolina','Duar e botave ','Në tavolina ','Rake ','Profiti '],r.tables.map(t=>row(['<td>'+safe(t.name)+'</td>',n(t.hands),s(t.net),n(eur(t.rake)),s(t.profit)])),'Asnjë tavolinë në këtë periudhë.');}
function setPreset(p){$$('#pfPresets [data-p]').forEach(b=>b.classList.toggle('on',b.dataset.p===p));const [f,t]=presetRange(p);$('#pfFrom').value=f;$('#pfTo').value=t;loadProfit();}
$('#pfPresets').addEventListener('click',e=>{const b=e.target.closest('[data-p]');if(b)setPreset(b.dataset.p);});
for(const id of ['#pfFrom','#pfTo'])$(id).addEventListener('change',()=>{$$('#pfPresets [data-p]').forEach(b=>b.classList.remove('on'));loadProfit();});
for(const id of ['#pfBot','#pfTable'])$(id).addEventListener('change',loadProfit);
const openProfit=()=>{$('#tabs [data-tab="profit"]').click();};
document.addEventListener('click',e=>{if(e.target.closest('.profitCard')&&!e.target.closest('button'))openProfit();});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest?.('.profitCard')){e.preventDefault();openProfit();}});
$('#tabs').addEventListener('click',e=>{if(e.target.closest('[data-tab="profit"]')){if(!$('#pfFrom').value)setPreset('today');else loadProfit();}});
setInterval(()=>{if(tab==='profit'&&!document.hidden&&$('#pfTo').value===tiranaDay(Date.now()))loadProfit();},10000);
