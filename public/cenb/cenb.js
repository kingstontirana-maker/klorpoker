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
 const g=data.guard,b=data.bots,playing=b.filter(x=>x.seatedAt).length,on=b.filter(x=>x.enabled).length,rake=b.reduce((n,x)=>n+x.rakePaid,0),house=b.reduce((n,x)=>n+x.house,0);
 const humans=data.tables.filter(t=>t.bots>0).reduce((n,t)=>n+t.humans,0);
 const meter=(v,limit)=>limit>0?'<div class="meter" title="'+Math.round(Math.max(0,-v)/limit*100)+'% e limitit"><i style="width:'+Math.min(100,Math.max(0,-v)/limit*100)+'%"></i></div>':'<span>pa limit</span>';
 $('#kpis').innerHTML=[
  ['Shtëpia sot',signed(g.today),g.dailyLimit>0?'Limit '+eur(g.dailyLimit)+meter(g.today,g.dailyLimit):meter(0,0)],
  ['Kjo javë',signed(g.week),g.weeklyLimit>0?'Limit '+eur(g.weeklyLimit)+meter(g.week,g.weeklyLimit):meter(0,0)],
  ['Ky muaj',signed(g.month),g.monthlyLimit>0?'Limit '+eur(g.monthlyLimit)+meter(g.month,g.monthlyLimit):meter(0,0)],
  ['Botat','<b>'+playing+' <small class="muted">/ '+on+' / '+b.length+'</small></b>','<span>në tavolinë / ndezur / gjithsej</span>'],
  ['Lojtarë që luajnë me bota','<b>'+humans+'</b>','<span>lojtarë të vërtetë në tavolina me bota</span>'],
  ['Rake nga botat','<b>'+eur(rake)+'</b>','<span>kthehet te qendra · gjithsej '+(house>=0?'+':'')+eur(house)+'</span>'],
  ['Kthyer te lojtarët','<b>'+eur(b.reduce((n,x)=>n+(x.returned||0),0))+'</b>','<span>Objektivi '+Number(g.returnPercent||0)+'% · në dispozicion '+eur(b.reduce((n,x)=>n+(x.returnAvailable||0),0))+'</span>'],
  ['Kredia e qendrës','<b>'+eur(data.centerBalance)+'</b>','<span>nga këtu financohen botat</span>'],
 ].map(([k,v,s])=>'<div class="kpi"><small>'+k+'</small>'+v.replace(/^<b class/,'<b class')+s+'</div>').join('');
 const stopped=g.stopped||[];$('#banner').classList.toggle('hidden',!stopped.length);$('#banner').textContent=stopped.length?'Limiti i shtëpisë u arrit ('+stopped.map(x=>x.replace('House ','').replace(' limit reached','')).join(', ')+'): të gjithë botat u ndalën dhe nisin vetë në periudhën tjetër.':'';
}

// ---- Bots ----
const statusSq=s=>s.replace('Playing at','Luan te').replace('Looking for a table','Kërkon tavolinë').replace('Waiting for players','Pret lojtarë').replace('Stopped','I ndalur').replace('Loss limit reached','Arriti limitin e humbjes').replace('Win limit reached','Arriti limitin e fitimit').replace('Wallet smaller than the buy-in','Portofoli më i vogël se buy-in').replace(/House (daily|weekly|monthly) limit reached/,(m,p)=>'Limiti '+({daily:'ditor',weekly:'javor',monthly:'mujor'}[p])+' i shtëpisë');
function renderBots(force=false){
 const list=$('#botList');if(!force&&editing&&list.querySelector('[data-edit]'))return;
 const focused=document.activeElement?.closest('#botList [data-act]'),focusId=focused?.closest('[data-id]')?.dataset.id,focusAct=focused?.dataset.act;
 $('#nBots').textContent=data.bots.length;
 list.innerHTML=data.bots.length?data.bots.map(b=>{const err=!b.enabled&&b.status!=='Stopped';
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
  +(editing===b.id?'<form class="edit grid" data-edit>'+configFields(b)+'<button class="gold">Ruaj</button><button type="button" class="ghost" data-act="cancel">Anulo</button></form>':''):'')+'</div></article>';}).join(''):'<div class="card empty">Nuk ka bota ende. Hap "Krijo".</div>';
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

async function refresh(first=false){
 try{data=await api('overview');$('#live').classList.remove('off');renderKpis();renderForms();renderBots();renderOthers();}
 catch(err){$('#live').classList.add('off');if(first)toast(err.message,true);}
}
setInterval(()=>{if(token&&data&&!document.hidden&&!document.activeElement?.closest('form'))refresh();},3000);
if(token)start().catch(()=>signOut());else showSignIn();
