import {renderCard,chipStack,TableVisuals,winningState,betLimits,describeHand,startingHand,preActionFor,seatLayout,feltBox,betPresets} from './table-visuals.js';
const $=s=>document.querySelector(s), api=async(path,body)=>{const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(response.status===401&&path!=='login'&&token){sessionEnded(data.error||'Sesioni përfundoi. Hyr përsëri.');}if(!response.ok)throw Error(data.error||'Request failed');return data;};let token=sessionStorage.getItem('pokerToken')||'',profile=null,tableId=null,current=null,updating=false;// Every amount on screen is shown in euro.
const fmt=n=>{const v=Number(n||0);return (v<0?'-€':'€')+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display='none',2800);};const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const card=renderCard;
// Each table lives in its own tab (/?table=ID); the main tab is the lobby.
// A table opens in the same tab (/?table=ID) and goes fullscreen on the same click.
let TABLE_MODE=new URLSearchParams(location.search).get('table');if(TABLE_MODE){tableId=TABLE_MODE;document.body.classList.add('tableTab');}
function goFullscreen(){const root=document.documentElement;if(document.fullscreenElement||!root.requestFullscreen)return;root.requestFullscreen({navigationUI:'hide'}).then(()=>{if(matchMedia('(pointer:coarse)').matches)screen.orientation?.lock?.('landscape').catch(()=>{});}).catch(()=>{});}
function openTableTab(id){goFullscreen();TABLE_MODE=String(id);tableId=TABLE_MODE;current=null;document.body.classList.add('tableTab');history.pushState({table:TABLE_MODE},'','/?table='+encodeURIComponent(TABLE_MODE));setView();tableRefresh();keepAwake?.();}
function leaveTableTab(){TABLE_MODE=null;tableId=null;current=null;visuals.reset();document.body.classList.remove('tableTab');if(new URLSearchParams(location.search).get('table'))history.pushState({},'','/');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});if(profile)setView();refreshProfile().catch(()=>{});}
addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('table');if(id&&profile?.user.role==='USER'){TABLE_MODE=id;tableId=id;document.body.classList.add('tableTab');setView();tableRefresh();}else if(TABLE_MODE)leaveTableTab();});
// Browsers allow fullscreen only after a click, so the table enters it on the first one.
// Browsers only grant fullscreen inside a user action, so every click, tap or key
// at the table re-enters it whenever it is not active (also after Esc).
const enterFullscreen=()=>{if(TABLE_MODE)goFullscreen();};
for(const type of ['pointerdown','keydown','touchend'])document.addEventListener(type,enterFullscreen,{capture:true});
// Turning the screen sideways: Android allows it inside fullscreen (one tap) and in the
// installed app (no tap at all). iPhone does not, so there the notice asks the player.
const lockLandscape=()=>screen.orientation?.lock?.('landscape').catch(()=>{});
const canRotate=!!(document.documentElement.requestFullscreen&&screen.orientation?.lock);
$('#rotateNow').hidden=!canRotate;if(TABLE_MODE)lockLandscape();
$('#rotateNow').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen({navigationUI:'hide'});await screen.orientation.lock('landscape');}catch{toast('Ktheje telefonin anash për të vazhduar.');}};
const roleNames={CENTER:'Qendra',ADMIN:'Administratori',AGENT:'Agjenti',USER:'Lojtari'};
function setView(){const player=profile.user.role==='USER';if(player&&TABLE_MODE&&!tableId){TABLE_MODE=null;document.body.classList.remove('tableTab');if(new URLSearchParams(location.search).get('table'))history.pushState({},'','/');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}if(!TABLE_MODE)tableId=null;$('#lobby').hidden=!player||!!tableId;$('.game').hidden=!player||!tableId;$('#sidebar').hidden=!player||!tableId;$('#backLobby').hidden=!player||!tableId;$('.selectWrap').hidden=true;$('#dashboard').hidden=player;$('#closeDashboard').hidden=!player;$('#adminToggle').hidden=true;$('#workspaceLabel').textContent=player?'Hapësira e lojtarit':'Paneli · '+roleNames[profile.user.role];document.body.dataset.role=profile.user.role;document.body.dataset.view=player?(tableId?'table':'lobby'):'management';requestAnimationFrame(tableId?layoutTable:fitPhone);}
function showApp(){profile&&($('#login').hidden=true,$('#app').hidden=false);$('#userTag').textContent=profile.user.username+' · '+roleNames[profile.user.role];$('#balanceTag').textContent=fmt(profile.user.balance);$('#adminToggle').hidden=profile.user.role==='USER';}
async function refreshProfile(){const oldSeat=profile?.seatedTableId;profile=await api('state');if(oldSeat&&!profile.seatedTableId&&tableId===oldSeat){tableId=null;current=null;visuals.reset();for(const id of ['#rebuyDialog','#chipDialog'])if($(id).open)$(id).close();toast(profile.lastTableExit?.reason==='IDLE_TABLE'?'U ngrite nga tavolina pas 10 minutash pa lojë. Çipat u kthyen në portofol.':profile.lastTableExit?.reason==='INACTIVE'?'U largove nga tavolina pas dy duarve pa veprim. Çipat u kthyen në portofol.':'U largove nga tavolina. Çipat e mbetur u kthyen në portofol.');}showApp();const prev=$('#tables').value;$('#tables').innerHTML=profile.tables.map(t=>`<option value="${t.id}">${safe(t.name)} • ${fmt(t.sb)}/${fmt(t.bb)} • ${t.players}/6</option>`).join('');$('#tables').value=profile.tables.some(t=>t.id===tableId)?tableId:profile.tables[0]?.id;setView();renderLobby();if(profile.user.role!=='USER'&&!$('#rakeForm').contains(document.activeElement)){$('#rakePct').value=profile.rakePercent;}if(profile.user.role!=='USER')renderManagedTables();if($('#chipDialog').open)syncDeposit('chip');}
const portraitQuery=window.matchMedia('(max-width:900px) and (orientation:portrait), (max-width:520px)');const isPortrait=()=>portraitQuery.matches;
// Phones in landscape get the app-style controls: round buttons, a bet panel on demand.
const phoneQuery=window.matchMedia('(max-height:560px) and (orientation:landscape)');const isPhone=()=>phoneQuery.matches;
const visuals=new TableVisuals($('#table'));
// Animations are part of the game feel; the ⋯ menu turns them off.
visuals.motion=sessionStorage.getItem('pokerMotion')!=='off';$('.game').classList.toggle('reducedMotion',!visuals.motion);
$('#motionToggle').setAttribute('aria-pressed',String(visuals.motion));$('#motionToggle').textContent=visuals.motion?'◉ Animimet: Po':'◉ Animimet: Jo';
let winnerFocus=null,actionBusy=false,betEditKey='',tableViewKey='',preAction=null,preActionHand=null,preActionBet=null,wasMyTurn=false,presetKey='',chatSeen=0,drawerTab='history';
const LIVE=['preflop','flop','turn','river'];
const markupCache=new WeakMap();
const setMarkup=(node,html)=>{if(markupCache.get(node)!==html){node.innerHTML=html;markupCache.set(node,html);}};
const handNames={'High Card':'Letra më e lartë','One Pair':'Një çift','Two Pair':'Dy çifte','Three of a Kind':'Tris','Straight':'Shkallë','Flush':'Ngjyrë','Full House':'Full House','Four of a Kind':'Poker','Straight Flush':'Shkallë me ngjyrë'};
function render(t){
 const previous=current;current=t;const newHand=!previous||previous.id!==t.id||previous.hand!==t.hand;if(newHand){winnerFocus=null;betEditKey='';}if(preActionHand!==t.hand+':'+t.phase){preAction=null;preActionHand=t.hand+':'+t.phase;}
 const mine=t.seats.find(s=>s?.isMe),seatIdx=t.seats.findIndex(s=>s?.isMe),win=winningState(t,winnerFocus);winnerFocus=win.selected;
 $('#activeTableName').textContent=t.name;$('#tableHandInfo').textContent='Dora #'+t.hand+' · '+(t.runout?'All-in · '+phaseLabel(t.phase):phaseLabel(t.phase));$('#runoutLabel').hidden=!t.runout;const collected=Math.max(0,Math.round((t.pot-t.seats.reduce((n,s)=>n+(s?.bet||0),0))*100)/100);$('#potValue').textContent=fmt(t.pot);$('.pot').classList.toggle('settled',t.phase==='finished');$('.pot').classList.toggle('empty',!(t.pot>0));setMarkup($('#potChips'),chipStack(collected));
 for(let i=0;i<5;i++){let slot=$('#community').children[i];if(!slot){slot=document.createElement('div');slot.className='boardSlot';$('#community').append(slot);}const code=t.board[i];setMarkup(slot,card(code,{winning:win.board.has(code),dim:!!win.hand&&!!code&&!win.board.has(code),index:i}));}
 if(tableViewKey!==t.id){$('#seats').replaceChildren();$('#tableBets').replaceChildren();tableViewKey=t.id;}
 const layout=seatLayout(isPortrait(),isPhone()),relativeOf=i=>seatIdx>=0?(i-seatIdx+3+6)%6:i;
 // A seated player has no use for the other JOIN buttons.
 $('#table').classList.toggle('seated',seatIdx>=0);
 t.seats.forEach((seat,i)=>{
  let node=document.getElementById('seat-'+i);if(!node){node=document.createElement('div');node.id='seat-'+i;node.className='seat';$('#seats').append(node);}
  const relative=relativeOf(i);const [x,y]=layout.seats[relative];node.style.setProperty('--x',x+'%');node.style.setProperty('--y',y+'%');node.dataset.visualPosition=relative;
  if(node.dataset.seatUser!==(seat?.id||'')){node.dataset.seatUser=seat?.id||'';node.innerHTML=seat?`<div class="avatarWrap"><svg class="turnRing" viewBox="0 0 100 100" aria-hidden="true"><circle class="timerTrack" cx="50" cy="50" r="45"/><circle class="timerProgress" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="100"/></svg><div class="avatar"></div><span class="timerSeconds"></span><span class="winnerCrown" aria-label="Fitues">♛</span></div><div class="seatName"><b></b><strong></strong></div><div class="seatCards"></div><div class="seatAction"></div><div class="blindBadge"></div><div class="winBadge" hidden></div>`:`<button class="emptySeat" data-pos="${i}" aria-label="JOIN · Ulu në vendin ${i+1}"><span aria-hidden="true">+</span><b>JOIN</b></button>`;}
  node.classList.toggle('me',!!seat?.isMe);node.classList.toggle('active',!!seat&&t.turn===i);node.classList.toggle('foldedSeat',!!seat?.folded);node.classList.toggle('winnerSeat',!!seat&&win.ids.includes(seat.id));node.classList.toggle('allInSeat',!!seat?.allIn&&t.phase!=='finished');
  if(seat){node.querySelector('.avatar').textContent=seat.username.slice(0,2).toUpperCase();node.querySelector('.avatar').style.setProperty('--avatar-hue',String((i*57+135)%360));node.querySelector('.seatName b').textContent=seat.username+(seat.isMe?' · TI':'');node.querySelector('.seatName strong').textContent=fmt(seat.stack);const blind=t.phase!=='waiting'&&seat.inHand?(i===t.sbPos?'SB':i===t.bbPos?'BB':''):'';node.querySelector('.blindBadge').textContent=blind;node.querySelector('.blindBadge').hidden=!blind;
   const cards=seat.cards.length?seat.cards:Array(seat.cardCount).fill('BACK');setMarkup(node.querySelector('.seatCards'),cards.map((c,k)=>card(c,{winning:seat.id===win.selected&&win.cards.has(c),dim:!!win.hand&&c!=='BACK'&&!(seat.id===win.selected&&win.cards.has(c)),index:k})).join(''));
   const last=seat.lastAction,live=LIVE.includes(t.phase);const label=seat.leaving?'LARGOHET':seat.sittingOut&&!(live&&seat.inHand&&!seat.folded)?'PUSHIM':live&&!seat.inHand?'PRET':seat.folded?(last?.type||'FOLD'):t.phase==='finished'&&win.ids.includes(seat.id)?'':seat.allIn&&t.phase!=='finished'?'ALL-IN':t.phase==='finished'&&seat.folded===false&&seat.inHand?'':last?.type||'';node.classList.toggle('sittingOutSeat',seat.sittingOut||live&&!seat.inHand);const won=t.phase==='finished'&&win.ids.includes(seat.id)?t.lastResult?.payments?.[seat.id]:0,badge=node.querySelector('.winBadge');badge.hidden=!won;badge.textContent=won?'+'+fmt(won):'';node.classList.toggle('selectedWinner',!!won&&seat.id===win.selected);node.querySelector('.seatAction').textContent=label;node.querySelector('.seatAction').dataset.action=label;
  }
  let bet=document.getElementById('tableBet-'+i);if(!bet){bet=document.createElement('div');bet.id='tableBet-'+i;bet.className='tableBet';$('#tableBets').append(bet);}const [bx,by]=layout.bets[relative];bet.style.setProperty('--bx',bx+'%');bet.style.setProperty('--by',by+'%');bet.hidden=!seat||!seat.bet||t.phase==='finished';if(seat)setMarkup(bet,chipStack(seat.bet,{compact:true})+`<span class="betAmount">${fmt(seat.bet)}</span>`);
 });
 const dealer=$('#dealerButton'),dealerSeat=t.button>=0&&t.seats[t.button];dealer.hidden=!dealerSeat;if(dealerSeat){const [dx,dy]=layout.dealer[relativeOf(t.button)];dealer.style.left=dx+'%';dealer.style.top=dy+'%';}
 $('#result').hidden=true;if(false){
  const result=t.lastResult;const payouts=Object.entries(result.payments).map(([id,n])=>{const seat=t.seats.find(s=>s?.id===id);const winner=win.ids.includes(id);return winner?`<button class="winnerChoice ${id===win.selected?'selected':''}" data-winner="${safe(id)}"><span>♛ ${safe(seat?.username||'Lojtari')}</span><strong>+${fmt(n)}</strong><small>${describeHand(result.winningHands?.[id]?.score)||handNames[result.winningHands?.[id]?.rank]||'Fitore pa showdown'}</small></button>`:`<span class="returnedChips">Kthim ${safe(seat?.username||'Lojtari')}: ${fmt(n)}</span>`;}).join('');
  const pots=result.pots.filter(p=>!p.refunded).map((p,i)=>`<span>${i?'SIDE POT '+i:'POTI KRYESOR'} <b>${fmt(p.amount)}</b></span>`).join('');setMarkup($('#result'),`<div class="winnerChoices">${payouts}</div>${result.pots.filter(p=>!p.refunded).length>1?`<div class="potBreakdown">${pots}</div>`:''}`);
 }
 const can=t.turn>=0&&t.seats[t.turn]?.isMe&&!actionBusy&&(!t.actionDeadline||t.serverNow<t.actionDeadline),call=mine?Math.max(0,t.currentBet-mine.bet):0,limits=betLimits(t,mine);
 if(can&&!wasMyTurn){visuals.beep('turn');if(navigator.userActivation?.hasBeenActive)navigator.vibrate?.([40,60,40]);}if(!can)$('.dock').classList.remove('sizing');wasMyTurn=!!can;
 const dock=$('.dock'),inPlay=!!mine&&LIVE.includes(t.phase)&&mine.inHand&&!mine.folded&&!mine.allIn&&!t.leaving&&!t.runout;dock.classList.toggle('myTurn',!!can);dock.classList.toggle('waitingTurn',inPlay&&!can&&t.turn>=0);dock.classList.toggle('idle',!inPlay||t.turn<0&&!can);
 $('#turnInfo').textContent=t.runout?'All-in · letrat po hapen':actionBusy?'Duke dërguar veprimin…':can?'RADHA JOTE':t.turn>=0?(t.seats[t.turn]?.username||'Lojtari')+' është në radhë':t.phase==='finished'?'Dora përfundoi':'Në pritje të lojtarëve';
 $('#inactivityNotice').hidden=!(mine?.inactiveHands>0);$('#inactivityNotice').textContent=mine?.inactiveHands?'Pasivitet: '+mine.inactiveHands+'/2 · Dora e tretë: largim':'';$('#handStrength').textContent=describeHand(t.myHandScore)||(mine?.inHand&&LIVE.includes(t.phase)&&startingHand(t.myCards))||(mine?'Çipat e tu: '+fmt(mine.stack):'LETRAT E TUA');
 $('#callSummary').textContent=t.leaving?'Bëre fold · Largohesh në fund të dorës':t.timedOut?'Nuk veprove në kohë · Je në pushim — shtyp ↺ Kthehu për të luajtur':t.sittingOut?'Je në pushim · Nuk merr letra në dorën tjetër':mine&&LIVE.includes(t.phase)&&!mine.inHand?'Pret dorën e ardhshme'+(t.mustPost?' · Paguan big blind për të hyrë':''):t.phase==='finished'?'Dora përfundoi · Rezultati u kreditua':mine?call?'Për të ndjekur: '+fmt(Math.min(call,mine.stack))+(call>=mine.stack?' · All-in':''):'Mund të bësh check pa vënë para':'Kliko JOIN për të hyrë në lojë';$('#blindInfo').textContent='Blinds '+fmt(t.sb)+' / '+fmt(t.bb);
 for(const key of ['fold','check','call','raise','allIn'])$('#'+key).disabled=!can;$('#check').disabled=!can||call>0;$('#call').disabled=!can||call===0;$('#call').hidden=call===0;$('#check').hidden=call>0;$('#call span').innerHTML=call?`Call <small>${fmt(Math.min(call,mine?.stack||0))}</small>`:'Call';$('#timeBank').hidden=!can||!(t.timeBank>0);$('#timeBank span').textContent='+'+Math.min(20,t.timeBank||0)+'s';$('#raise').disabled=!can||!limits.canRaise;$('#allIn').disabled=!can||!mine?.stack||limits.max>t.currentBet&&!limits.canRaise;
 const range=$('#betRange'),input=$('#betInput'),editKey=[t.id,t.hand,t.phase,t.turn,t.currentBet].join(':');range.min=String(limits.min);range.max=String(limits.max);range.step='.01';input.min=range.min;input.max=range.max;const editing=document.activeElement===input||document.activeElement===range;let value=Number(input.value);if(!editing&&(editKey!==betEditKey||!Number.isFinite(value)||value<limits.min||value>limits.max))value=limits.min;if(!editing){input.value=String(value);range.value=String(value);}betEditKey=editKey;syncBetLabel();range.disabled=input.disabled=!can||!limits.canRaise;const presets=can?betPresets(t,mine):[],key=presets.map(p=>p.label+p.value).join('|');if(key!==presetKey){presetKey=key;$('#betPresets').innerHTML=presets.map(p=>`<button type="button" data-value="${p.value}">${p.label}</button>`).join('');}document.querySelectorAll('#betPresets button,#stepBetDown,#stepBetUp').forEach(b=>b.disabled=!can||!limits.canRaise);
 $('.handControls').setAttribute('aria-busy',String(actionBusy));$('#seatActions').textContent=mine?'Ulur në vendin '+(seatIdx+1)+' · '+fmt(mine.stack):'Zgjidh një nga vendet e lira';$('#topUp').disabled=!mine||!['waiting','finished'].includes(t.phase)&&mine.inHand;$('#leave').disabled=!mine||!!t.leaving;$('#sitOut').disabled=!mine||!!t.leaving;$('#sitOut').innerHTML=t.sittingOut?'↺ <span>Kthehu</span>':'❚❚ <span>Pushim</span>';$('#sitOut').setAttribute('aria-pressed',String(!!t.sittingOut));$('#showCards').hidden=!t.canShow;dock.classList.toggle('hasExtras',!!t.canShow);$('#startHand').disabled=!mine||!['finished','waiting'].includes(t.phase)||t.seats.filter(s=>s&&s.stack>=t.bb&&!s.sittingOut).length<2;
 renderPreActions(t,mine,can,call);
 renderChat(t);updateRebuy(t);setMarkup($('#events'),t.events.map(e=>`<span><time>${new Date(e.at).toLocaleTimeString('sq-AL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time>${safe(e.text)}</span>`).join(''));visuals.update(t);
}
$('#seats').addEventListener('click',e=>{const node=e.target.closest('.seat.winnerSeat');if(node&&current){winnerFocus=node.dataset.seatUser;render(current);}});
setInterval(()=>{if(!document.hidden&&tableId)visuals.tick();},100);
$('#soundToggle').onclick=async()=>{if(visuals.sound)visuals.sound=false;else if(!await visuals.enableSound())return toast('Tingujt nuk mbështeten në këtë shfletues.');$('#soundToggle').setAttribute('aria-pressed',String(visuals.sound));$('#soundToggle').textContent=visuals.sound?'♫ Tingujt: Po':'♫ Tingujt: Jo';};
$('#motionToggle').onclick=()=>{visuals.motion=!visuals.motion;sessionStorage.setItem('pokerMotion',visuals.motion?'on':'off');$('#motionToggle').setAttribute('aria-pressed',String(visuals.motion));$('#motionToggle').textContent=visuals.motion?'◉ Animimet: Po':'◉ Animimet: Jo';$('.game').classList.toggle('reducedMotion',!visuals.motion);};
$('#fullscreenToggle').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Ekrani i plotë nuk mbështetet.')}};
async function applyTable(t){if(!tableId||String(t.id)!==String(tableId))return;render(t);if(current?.seats.every(s=>!s?.isMe)&&rebuyWasOpen){rebuyWasOpen=false;tableId=null;await refreshProfile();toast('Afati përfundoi. U largove nga tavolina.');}}
async function tableRefresh(){if(!token||!profile||!tableId||profile.user.role!=='USER'||updating)return;updating=true;try{const t=await api('table/'+tableId+'/state');await applyTable(t);}catch(e){try{await refreshProfile();if(!profile.seatedTableId){tableId=null;setView();if($('#rebuyDialog').open)$('#rebuyDialog').close();rebuyWasOpen=false;}}catch{}toast(e.message)}finally{updating=false;}}
async function mutate(path,body){try{await api(path,body);await refreshProfile();await tableRefresh();}catch(e){toast(e.message);}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('login',{username:$('#username').value,password:$('#password').value});token=d.token;sessionStorage.setItem('pokerToken',token);profile=d;panelPage='overview';showApp();await refreshProfile();if(profile.user.role!=='USER')await loadDashboard();await tableRefresh();}catch(err){toast(err.message)}};
$('#logout').onclick=async()=>{stopRakeStream();stopInspect();try{await api('logout',{})}catch{}token='';profile=null;tableId=null;current=null;visuals.reset();if($('#rebuyDialog').open)$('#rebuyDialog').close();if($('#chipDialog').open)$('#chipDialog').close();sessionStorage.removeItem('pokerToken');document.documentElement.classList.remove('hasSession');if(TABLE_MODE)leaveTableTab();$('#app').hidden=true;$('#login').hidden=false;$('#dashboard').hidden=true;};
$('#tables').onchange=()=>{tableId=$('#tables').value;tableRefresh();};$('#seats').onclick=e=>{const seat=e.target.closest('[data-pos]');if(!seat||profile.user.role!=='USER')return;openChipDialog('sit',Number(seat.dataset.pos));if(current&&LIVE.includes(current.phase))toast('Dora po luhet. Merr letra nga dora e ardhshme.');};$('#startHand').onclick=()=>mutate('table/'+tableId+'/start',{});$('#leave').onclick=async()=>{const mine=current?.seats.find(s=>s?.isMe);if(mine&&LIVE.includes(current.phase)&&mine.inHand&&!mine.folded&&!confirm('Largimi gjatë dorës bën fold. Çipat kthehen në portofol kur dora përfundon. Vazhdo?'))return;try{const r=await api('table/'+tableId+'/leave',{});if(r.pending){toast('Bëre fold. Do të largohesh kur dora të përfundojë.');await tableRefresh();return;}tableId=null;await refreshProfile();}catch(e){toast(e.message)}};
$('#sitOut').onclick=()=>mutate('table/'+tableId+'/sitout',{value:!current?.sittingOut});$('#showCards').onclick=()=>mutate('table/'+tableId+'/show',{});
async function playAction(type,amount){if(actionBusy||!current||!current.seats[current.turn]?.isMe)return;actionBusy=true;render(current);try{await api('table/'+tableId+'/action',{type,amount});await tableRefresh();await refreshProfile();}catch(e){toast(e.message);}finally{actionBusy=false;if(current)render(current);}}
for(const type of ['fold','check','call'])$('#'+type).onclick=()=>playAction(type);
// On a phone the first tap on Raise opens the bet panel and the second confirms it.
$('#raise').onclick=()=>{const dock=$('.dock');if(isPhone()&&!dock.classList.contains('sizing')){dock.classList.add('sizing');syncBetLabel();return;}dock.classList.remove('sizing');playAction('raise',Number($('#betInput').value));};
$('#closeSizing').onclick=()=>{$('.dock').classList.remove('sizing');syncBetLabel();};
$('#allIn').onclick=()=>{const mine=current?.seats.find(s=>s?.isMe);if(!mine)return;const target=Math.round((mine.stack+mine.bet)*100)/100;playAction(target<=current.currentBet?'call':'raise',target);};
$('#betPresets').onclick=e=>{const button=e.target.closest('[data-value]');if(!button||button.disabled)return;$('#betInput').value=$('#betRange').value=button.dataset.value;syncBetLabel();};
$('#betRange').oninput=()=>{$('#betInput').value=$('#betRange').value;syncBetLabel();};$('#betInput').oninput=()=>{$('#betRange').value=$('#betInput').value;syncBetLabel();};
$('#adminToggle').onclick=()=>{$('#dashboard').hidden=false;loadDashboard()};$('#closeDashboard').onclick=()=>$('#dashboard').hidden=true;
let panelPage='overview',managedChildren=[];
const pageLabels={rake:['Rake','Komisioni i gjeneruar nga lojtarët e rrjetit tënd.'],overview:['Përmbledhje','Aktiviteti dhe gjendja e hapësirës tënde.'],accounts:['Llogaritë dhe krediti','Menaxho llogaritë e vartësve dhe lëvizjet e kreditit.'],history:['Historiku i kreditit','Regjistrimet e fundit, të renditura nga më i riu.'],tables:['Tavolinat','Krijo tavolina dhe shiko gjendjen e tyre.'],inspect:['Inspektimi live','Çdo tavolinë në kohë reale, me letrat e të gjithë lojtarëve dhe shanset e fitores. E dukshme vetëm për qendrën.'],settings:['Konfigurimi','Përcakto komisionin dhe kufirin për çdo dorë.'],profile:['Llogaria ime','Të dhënat dhe roli yt në platformë.']};
function openPanel(page){if(!pageLabels[page]||(['tables','settings','inspect'].includes(page)&&profile.user.role!=='CENTER'))page='overview';panelPage=page;document.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);document.querySelectorAll('[data-panel]').forEach(el=>{el.classList.toggle('active',el.dataset.panel===page);if(el.dataset.panel===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#panelTitle').textContent=pageLabels[page][0];$('#panelDescription').textContent=pageLabels[page][1];$('#panelBreadcrumb').textContent=roleNames[profile.user.role].toUpperCase()+' / '+pageLabels[page][0].toUpperCase();if(page==='inspect')startInspect();else stopInspect();}
$('#dashboard').addEventListener('click',e=>{const button=e.target.closest('[data-panel],[data-open-panel]');if(button)openPanel(button.dataset.panel||button.dataset.openPanel);});
function renderChildren(){const query=$('#accountSearch').value.trim().toLowerCase();const children=managedChildren.filter(c=>c.username.toLowerCase().includes(query));$('#children').innerHTML=children.map(c=>`<tr><td><div class="accountCell"><span class="accountAvatar">${safe(c.username[0].toUpperCase())}</span><strong>${safe(c.username)}</strong></div></td><td><span class="roleBadge">${roleNames[c.role]}</span></td><td class="balanceCell">${fmt(c.balance)}<small class="accountMeta">${c.blocked?'<b class="statusBlocked">● Bllokuar</b>':c.online?'<b class="statusOnline">● Online</b>':'○ Offline'} · ${c.lastLoginAt?'hyrja e fundit '+new Date(c.lastLoginAt).toLocaleString('sq-AL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'nuk ka hyrë ende'}</small></td><td><label class="srOnly" for="amount-${c.id}">Shuma për ${safe(c.username)}</label><input class="transferAmount" type="number" step="0.01" min="0.01" placeholder="0.00" id="amount-${c.id}"></td><td><div class="rowActions"><button class="sendButton" data-id="${c.id}" data-dir="send">+ Dërgo</button><button data-id="${c.id}" data-dir="return">↙ Rikthe</button><button class="ghostButton" data-manage="password" data-user="${c.id}" data-name="${safe(c.username)}">🔑 Fjalëkalim</button><button class="ghostButton ${c.blocked?'':'dangerButton'}" data-manage="block" data-user="${c.id}" data-blocked="${c.blocked?1:0}" data-name="${safe(c.username)}">${c.blocked?'✓ Zhblloko':'⛔ Blloko'}</button></div></td></tr>`).join('')||`<tr><td colspan="5" class="emptyState"><span>♙</span><strong>${query?'Nuk u gjet asnjë llogari.':'Ende nuk ka llogari.'}</strong><p>${query?'Provo një emër tjetër.':'Përdor formularin më sipër për të krijuar llogarinë e parë.'}</p></td></tr>`;}
$('#accountSearch').oninput=renderChildren;
function renderManagedTables(){$('#managedTableCount').textContent=profile.tables.length+' TAVOLINA';$('#managedTables').innerHTML=profile.tables.map(t=>`<div class="managedTable"><div class="tableIcon">♠</div><div><strong>${safe(t.name)}</strong><small>Blinds ${fmt(t.sb)} / ${fmt(t.bb)}</small></div><span class="roleBadge">${t.players}/6 lojtarë</span><span class="tableStatus">${phaseLabel(t.phase)}</span></div>`).join('');}
const phaseLabel=phase=>({waiting:'Në pritje',finished:'Dora përfundoi',preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River'}[phase]||phase);
async function loadDashboard(){await refreshProfile();const role=profile.user.role;if(role==='USER')return;$('#centerRake').hidden=role!=='CENTER';document.querySelectorAll('.centerOnly').forEach(el=>el.hidden=role!=='CENTER');$('#staffSection').hidden=false;$('#navRole').textContent=roleNames[role];$('#navUsername').textContent=profile.user.username;const childLabel={CENTER:'Administratorët',ADMIN:'Agjentët',AGENT:'Lojtarët'}[role];$('#accountsNavLabel').textContent=childLabel;$('#accountsTitle').textContent=childLabel+' e tu';$('#createAccountTitle').textContent={CENTER:'Krijo administrator',ADMIN:'Krijo agjent',AGENT:'Krijo lojtar'}[role];$('#hierarchyHint').textContent={CENTER:'Krijon administratorë dhe menaxhon kreditin e tyre. Administratorët organizojnë rrjetin e agjentëve.',ADMIN:'Krijon agjentë dhe menaxhon kreditin e tyre. Secili agjent kujdeset për lojtarët e vet.',AGENT:'Krijon lojtarë dhe furnizon portofolin e tyre me kredit për lojë.'}[role];$('#hierarchyPath').innerHTML=['CENTER','ADMIN','AGENT','USER'].map(r=>`<span class="${r===role?'currentRole':''}">${roleNames[r]}</span>`).join('<i>→</i>');$('#accountDetails').innerHTML=`<div><span>Përdoruesi</span><strong>${safe(profile.user.username)}</strong></div><div><span>Roli</span><strong>${roleNames[role]}</strong></div><div><span>Portofoli</span><strong>${fmt(profile.user.balance)}</strong></div>`;managedChildren=await api('users');renderChildren();const total=managedChildren.reduce((n,c)=>n+c.balance,0);$('#panelStats').innerHTML=[['Portofoli yt',fmt(profile.user.balance),'Kredit i disponueshëm','↗'],[childLabel,managedChildren.length,'Llogari nën menaxhimin tënd','♙'],['Krediti te vartësit',fmt(total),'Gjendja aktuale e portofoleve','↔']].map(([label,value,note,icon])=>`<article class="statCard"><div><span>${label}</span><i>${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`).join('');$('#ledger').hidden=false;const data=await api('ledger');const types={TRANSFER:'Transfertë',RAKE:'Komision',BUY_IN:'Hyrje në tavolinë',REBUY:'Shtim fondesh',CASH_OUT:'Dalje nga tavolina',BLOCK:'Bllokim llogarie',INSPECT:'Inspektim tavolinash',UNBLOCK:'Zhbllokim llogarie'};$('#ledgerRows').innerHTML=data.map(x=>`<tr><td>${new Date(x.time).toLocaleString('sq-AL')}</td><td><span class="roleBadge">${types[x.type]||safe(x.type)}</span></td><td class="muted">${x.tableId?'Tavolina #'+safe(x.tableId):x.from===profile.user.id?'Kredit i dërguar':x.to===profile.user.id?'Kredit i marrë':'Lëvizje në rrjet'}</td><td class="number balanceCell">${fmt(x.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="emptyState"><strong>Ende nuk ka lëvizje krediti.</strong><p>Transfertat do të shfaqen këtu.</p></td></tr>';await loadRakeReport();openPanel(panelPage);}
$('#children').onclick=async e=>{const m=e.target.closest('button[data-manage]');if(m){const name=m.dataset.name;try{if(m.dataset.manage==='block'){const block=m.dataset.blocked!=='1';if(block&&!confirm(`Të bllokohet ${name}? Do të dalë menjëherë nga platforma dhe çipat e tavolinës do t'i kthehen në portofol.`))return;await api('users/status',{userId:m.dataset.user,blocked:block});toast(block?`${name} u bllokua`:`${name} u zhbllokua`);}else{const pw=prompt(`Fjalëkalimi i ri për ${name} (të paktën 8 karaktere, me shkronja dhe numra):`);if(!pw)return;await api('users/password',{userId:m.dataset.user,password:pw});toast(`Fjalëkalimi i ${name} u ndryshua. Duhet të hyjë përsëri.`);}await loadDashboard();}catch(err){toast(err.message);}return;}const b=e.target.closest('button[data-id]');if(!b)return;const amount=Number(document.getElementById('amount-'+b.dataset.id)?.value);if(!amount)return toast('Vendos shumën e kreditit');try{await api('transfer',{userId:b.dataset.id,direction:b.dataset.dir,amount});await loadDashboard();toast('Krediti u transferua');}catch(err){toast(err.message);}};
$('#createUser').onsubmit=async e=>{e.preventDefault();try{await api('users/create',{username:$('#newUser').value,password:$('#newPassword').value});$('#newUser').value='';$('#newPassword').value='';await loadDashboard();toast('Llogaria u krijua');}catch(err){toast(err.message);}};
$('#rakeForm').onsubmit=async e=>{e.preventDefault();try{await api('rake',{percent:+$('#rakePct').value});await loadDashboard();toast('Konfigurimi u ruajt');}catch(err){toast(err.message);}};
$('#tableForm').onsubmit=async e=>{e.preventDefault();try{await api('tables/create',{name:$('#tableName').value,sb:+$('#tableSb').value,bb:+$('#tableBb').value});await refreshProfile();await loadDashboard();toast('Tavolina u krijua');}catch(err){toast(err.message);}};
// Hidden tabs keep checking in every few seconds so a player who just switched
// windows is not taken for someone who left the table.
let pollTick=0;setInterval(async()=>{if(!token||!profile)return;pollTick++;syncTableStream();if(document.hidden){if(pollTick%4===0){try{await refreshProfile();}catch{}}return;}const live=Date.now()-streamSeen<4000;if(!live||pollTick%4===0)await tableRefresh();if(!live||pollTick%3===0){try{await refreshProfile();}catch{}}},1300);
addEventListener('pagehide',e=>{if(TABLE_MODE&&token&&!e.persisted&&current?.seats.some(s=>s?.isMe))navigator.sendBeacon?.('/api/table/'+encodeURIComponent(TABLE_MODE)+'/away',JSON.stringify({token}));});if(token){refreshProfile().then(async()=>{if(profile.user.role!=='USER')await loadDashboard();await tableRefresh();}).catch(()=>{token='';sessionStorage.removeItem('pokerToken');document.documentElement.classList.remove('hasSession');$('#login').hidden=false;}).finally(()=>document.documentElement.classList.add('ready'));}else document.documentElement.classList.add('ready');

function renderLobby(){if(profile.user.role!=='USER')return;$('#lobbyBalance').textContent=fmt(profile.user.balance);$('#tableCount').textContent=profile.tables.length;$('#creditNotice').textContent=profile.user.balance<=0?'Pa kredit · Kontakto agjentin për të luajtur.':'Zgjidh një tavolinë për të vazhduar';$('#lobbyTables').innerHTML=profile.tables.map(t=>`<article class="lobbyCard"><div class="lobbyCardTop"><span class="tableStatus"><span class="statusDot"></span>${phaseLabel(t.phase)}</span><span class="muted">NO LIMIT</span></div><div class="miniTable"><span>♠</span><i></i><i></i><i></i><i></i><i></i><i></i></div><h2>${safe(t.name)}</h2><div class="tableMetrics"><div><small>BLINDS</small><strong>${fmt(t.sb)} / ${fmt(t.bb)}</strong></div><div><small>LOJTARË</small><strong>${t.players}<span> / 6</span></strong></div></div><div class="buyinLine"><span>Buy-in</span><b>${fmt(t.minBuyin)} – ${fmt(t.maxBuyin)}</b></div><button class="primary" data-table="${safe(t.id)}" ${profile.user.balance<=0&&profile.seatedTableId!==t.id?'disabled':''}>${profile.seatedTableId===t.id?'Shko te tavolina':'Hap tavolinën'} <span>↗</span></button></article>`).join('');}
$('#lobbyTables').onclick=e=>{const b=e.target.closest('[data-table]');if(b)openTableTab(b.dataset.table);};
$('#backLobby').onclick=()=>{if(current?.seats.some(s=>s?.isMe))toast('Je ende i ulur. Kthehu te tavolina nga lobby brenda 25 sekondave që të mos kalosh në pushim.');leaveTableTab();};
let rebuyWasOpen=false;
function updateRebuy(t){const dialog=$('#rebuyDialog');if(t.rebuyDeadline&&t.serverNow>=(t.rebuyAvailableAt||0)){rebuyWasOpen=true;$('#rebuyMessage').textContent=`Ke më pak se një big blind në tavolinë. Shto kredit brenda ${Math.max(0,Math.ceil((t.rebuyDeadline-t.serverNow)/1000))} sekondave. Portofoli: ${fmt(profile.user.balance)}.`;syncDeposit('rebuy',!dialog.open?Math.min(profile.user.balance,20):undefined);if(!dialog.open)dialog.showModal();}else if(dialog.open)dialog.close();}
$('#rebuyDialog').addEventListener('cancel',e=>e.preventDefault());
$('#rebuyForm').onsubmit=async e=>{e.preventDefault();if(!syncDeposit('rebuy'))return;try{await api('table/'+tableId+'/rebuy',{amount:Number($('#rebuyAmount').value)});rebuyWasOpen=false;await refreshProfile();await tableRefresh();}catch(err){toast(err.message)}};

let chipMode='sit',chipPosition=null;
function depositLimits(prefix){
 const room=profile.tables.find(t=>t.id===tableId),mine=current?.seats.find(s=>s?.isMe);
 if(!room)return {min:1,max:0};
 const sit=prefix==='chip'&&chipMode==='sit';
 return {min:sit?room.minBuyin:Math.max(.01,Math.round((room.bb-(mine?.stack||0))*100)/100),max:Math.max(0,Math.min(profile.user.balance,room.maxBuyin-(sit?0:mine?.stack||0)))};
}
function syncDeposit(prefix,value){
 const input=$('#'+prefix+'Amount'),range=$('#'+prefix+'Range'),wallet=Math.max(0,profile.user.balance),limits=depositLimits(prefix);
 input.min=0;input.max=wallet;range.max=wallet;range.disabled=wallet===0;
 if(value!==undefined)input.value=String(value);
 if(Number(input.value)>wallet)input.value=String(wallet);
 const amount=Number(input.value);range.value=String(Math.max(0,Math.min(wallet,amount||0)));
 $('#'+prefix+'RangeMax').textContent=fmt(wallet);$('#'+prefix+'Selected').textContent=fmt(amount||0);range.setAttribute('aria-valuetext',fmt(amount||0));
 const valid=input.value!==''&&Number.isFinite(amount)&&amount>=limits.min&&amount<=limits.max&&Math.abs(amount*100-Math.round(amount*100))<.000001;
 $('#'+prefix+'Submit').disabled=!valid;
 $('#'+prefix+'Validation').textContent=wallet===0?'Nuk ke kredit. Kontakto agjentin.':limits.max<limits.min?'Krediti ose hapësira në tavolinë nuk mjafton.':valid?'Shuma e zgjedhur: '+fmt(amount)+'.':'Shuma e lejuar për tavolinën: '+fmt(limits.min)+' – '+fmt(limits.max)+'.';
 return valid;
}
for(const prefix of ['chip','rebuy']){
 $('#'+prefix+'Range').oninput=e=>syncDeposit(prefix,Number(e.target.value));
 $('#'+prefix+'Amount').oninput=()=>syncDeposit(prefix);
}
function openChipDialog(mode,position=null){chipMode=mode;chipPosition=position;const room=profile.tables.find(t=>t.id===tableId);if(!room)return;const limits=depositLimits('chip');$('#chipDialogTitle').textContent=mode==='sit'?'Ulu në '+room.name:'Shto para në tavolinë';$('#chipDialogInfo').textContent=`Portofoli: ${fmt(profile.user.balance)} · Kufiri i tavolinës: ${fmt(limits.min)} – ${fmt(limits.max)}`;syncDeposit('chip',Math.min(limits.max,Math.max(limits.min,mode==='sit'?100:20)));$('#chipDialog').showModal();}
$('#topUp').onclick=()=>openChipDialog('rebuy');
$('#closeChipDialog').onclick=()=>$('#chipDialog').close();
$('#chipForm').onsubmit=async e=>{e.preventDefault();if(!syncDeposit('chip'))return;const button=$('#chipSubmit');button.disabled=true;try{const amount=Number($('#chipAmount').value);await api('table/'+tableId+'/'+chipMode,chipMode==='sit'?{position:chipPosition,buyin:amount}:{amount});$('#chipDialog').close();await refreshProfile();await tableRefresh();}catch(err){toast(err.message)}finally{syncDeposit('chip');}};

function stepBet(direction){if(!current)return;const mine=current.seats.find(s=>s?.isMe),limits=betLimits(current,mine);const value=Math.round(Math.max(limits.min,Math.min(limits.max,Number($('#betInput').value)+direction*current.bb))*100)/100;$('#betInput').value=$('#betRange').value=String(value);syncBetLabel();}
$('#stepBetDown').onclick=()=>stepBet(-1);$('#stepBetUp').onclick=()=>stepBet(1);


let lastPortrait=null;// Phones in landscape: lay the table out on a canvas of at least 730×365 and
// scale it to fill the screen exactly, so every element keeps its proportions.
const FIT_W=730,FIT_H=365;
function fitPhone(){const g=$('.game');if(!g)return;const on=isPhone()&&document.body.dataset.view==='table';document.body.classList.toggle('fitPhone',on);
 if(!on){for(const k of ['--fit-s','--fit-w','--fit-h'])g.style.removeProperty(k);return;}
 const W=innerWidth,H=Math.min(innerHeight,window.visualViewport?.height||innerHeight),s=Math.min(H/FIT_H,W/FIT_W);
 g.style.setProperty('--fit-s',String(s));g.style.setProperty('--fit-w',W/s+'px');g.style.setProperty('--fit-h',H/s+'px');}
function layoutTable(){fitPhone();const stage=$('.tableStage');if(!stage||!stage.clientWidth)return;const portrait=isPortrait(),box=feltBox(stage.clientWidth,stage.clientHeight,portrait,isPhone());$('.game').style.setProperty('--stage-min',Math.ceil(box.minStage)+'px');stage.style.setProperty('--felt-w',box.width+'px');stage.style.setProperty('--felt-h',box.height+'px');stage.style.setProperty('--felt-top',box.top+'px');const mode=portrait+':'+isPhone();if(lastPortrait!==null&&lastPortrait!==mode&&current)render(current);lastPortrait=mode;}
new ResizeObserver(layoutTable).observe($('.tableStage'));
// Backup for tabs that were opened in the background: measure again when shown.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestAnimationFrame(layoutTable);});addEventListener('pageshow',()=>requestAnimationFrame(layoutTable));
window.addEventListener('resize',layoutTable);

let rakeLoading=false,rakeStream=null,rakeRetry=null;
async function loadRakeReport(){
 if(rakeLoading||!token||!profile||profile.user.role==='USER')return;
 rakeLoading=true;const requestedToken=token;
 try{
  const r=await api('rake/report');if(token!==requestedToken)return;renderRakeReport(r);startRakeStream();
 }catch(err){$('#rakeStatus').textContent='Raporti nuk u ngarkua: '+err.message;}finally{rakeLoading=false;}
}
function renderRakeReport(r){
  $('#rakeScope').textContent=profile.user.role==='CENTER'?'Të gjitha tavolinat dhe i gjithë rrjeti.':'Vetëm rake i gjeneruar nga lojtarët nën hierarkinë tënde.';
  const cards=[['Rake gjithsej',fmt(r.total),'të gjeneruar','％'],['Rake sot',fmt(r.today),'Sipas orës Europe/Berlin','◷'],['Duart me rake',r.hands,'Në rrjetin tënd','♠']];
  const html=([label,value,note,icon])=>`<article class="statCard"><div><span>${label}</span><i>${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`;
  $('#rakeStats').innerHTML=cards.map(html).join('');
  let overview=$('#overviewRake');if(!overview){overview=document.createElement('div');overview.id='overviewRake';$('#panelStats').append(overview);}overview.outerHTML=html(['Rake i rrjetit',fmt(r.total),'Shiko seksionin Rake','％']).replace('<article ','<article id="overviewRake" ');
  $('#rakePolicy').textContent=`Rake ${r.percent}% e pot-it, pa kufi për dorë · Pa flop, pa rake. Pjesa e rrjetit llogaritet nga kontributet në çdo pot. Rake kreditohet te Qendra.`;
  $('#rakeLegacy').hidden=!r.legacyTotal;$('#rakeLegacy').textContent=`${fmt(r.legacyTotal)} janë regjistrime të vjetra pa ndarje sipas rrjetit; përfshihen vetëm në totalin e Qendrës.`;
  $('#rakeRows').innerHTML=r.rows.map(x=>`<tr><td>${new Date(x.time).toLocaleString('sq-AL',{timeZone:'Europe/Berlin'})}</td><td>${safe(profile.tables.find(t=>t.id===x.tableId)?.name||'Tavolina #'+x.tableId)}</td><td>${x.hand??'—'}</td><td class="number balanceCell">${fmt(x.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="emptyState">Ende nuk ka rake të regjistruar për rrjetin tënd.</td></tr>';
  $('#rakeStatus').textContent='Përditësuar: '+new Date(r.serverNow||Date.now()).toLocaleTimeString('sq-AL');
}
$('#refreshRake').onclick=loadRakeReport;
function stopRakeStream(){clearTimeout(rakeRetry);rakeRetry=null;rakeStream?.abort();rakeStream=null;}
async function startRakeStream(){
 if(rakeStream||!token||!profile||profile.user.role==='USER')return;
 clearTimeout(rakeRetry);rakeRetry=null;
 const controller=new AbortController(),session=token;rakeStream=controller;
 try{
  const response=await fetch('/api/rake/events',{headers:{Authorization:'Bearer '+session},signal:controller.signal});
  if([401,403].includes(response.status)){controller.abort();$('#rakeStatus').textContent='Hyr përsëri për të parë rake live.';return;}
  if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('Live connection unavailable');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(!controller.signal.aborted){
   const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
   let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){
    const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
    const data=event.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
    if(data&&token===session&&profile?.user.role!=='USER')renderRakeReport(JSON.parse(data));
   }
  }
 }catch(err){if(!controller.signal.aborted&&token===session)$('#rakeStatus').textContent='Lidhja live u ndërpre. Duke u rilidhur…';}
 finally{
  if(rakeStream===controller)rakeStream=null;
  if(!controller.signal.aborted&&token===session&&profile?.user.role!=='USER')rakeRetry=setTimeout(startRakeStream,2000);
 }
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&profile?.user.role!=='USER')loadRakeReport();});

// Bet vs raise follows the rules: the first wager of a street is a bet.
function syncBetLabel(){const value=Number($('#betInput').value)||0;$('#betLabel').textContent=fmt(value);if(!current)return;const mine=current.seats.find(s=>s?.isMe),limits=betLimits(current,mine);const word=mine&&value>=limits.max?'All-in':current.legalActions?.isBet?'Bet':'Raise';$('#raise span').innerHTML=isPhone()&&$('.dock').classList.contains('sizing')?`OK <small>${fmt(value)}</small>`:`${word} <small>${fmt(value)}</small>`;}
// Pre-selected actions fire once when the turn arrives; a changed bet cancels "Check".
function renderPreActions(t,mine,can,call){
 const box=$('#preActions'),eligibleNow=!!mine&&LIVE.includes(t.phase)&&mine.inHand&&!mine.folded&&!mine.allIn&&!t.leaving;
 if(preAction==='check'&&preActionBet!==null&&preActionBet!==t.currentBet)preAction=null;
 box.hidden=!eligibleNow||can;box.querySelectorAll('[data-pre]').forEach(i=>{i.checked=i.dataset.pre===preAction;});
 box.querySelector('[data-pre="check"]').parentElement.hidden=call>0;box.querySelector('[data-pre="call"]').parentElement.lastChild.textContent=call>0?' Call '+fmt(Math.min(call,mine?.stack||0)):' Call çdo bast';
 if(can&&preAction){const type=preActionFor(preAction,call);preAction=null;if(type)setTimeout(()=>playAction(type),0);}
}
$('#preActions').onchange=e=>{const input=e.target.closest('[data-pre]');if(!input)return;preAction=input.checked?input.dataset.pre:null;preActionBet=current?.currentBet??null;if(current)render(current);};
const rankingExamples=[['Royal Flush','As Ks Qs Js Ts','Shkallë A-10 me të njëjtën ngjyrë'],['Shkallë me ngjyrë','9h 8h 7h 6h 5h','Pesë letra radhazi me të njëjtën ngjyrë'],['Poker','Kc Kd Kh Ks 2d','Katër letra të njëjta'],['Full House','Qh Qd Qs 7c 7d','Tris + çift'],['Ngjyrë','Ad Jd 8d 5d 2d','Pesë letra me të njëjtën ngjyrë'],['Shkallë','Tc 9d 8h 7s 6c','Pesë letra radhazi; A-2-3-4-5 është shkalla më e ulët'],['Tris','8c 8d 8s Kh 3d','Tre letra të njëjta'],['Dy çifte','Jh Jc 4s 4d Ac','Dy çifte të ndryshme'],['Çift','Th Ts 9c 5d 2h','Dy letra të njëjta'],['Letra e lartë','Ah Jd 8c 6s 3h','Asnjë kombinim; vendos letra më e lartë']];
$('#handRankings').innerHTML=rankingExamples.map(([name,cards,note])=>`<li><div class="rankingCards">${cards.split(' ').map(c=>card(c)).join('')}</div><div><strong>${name}</strong><small>${note}</small></div></li>`).join('');
document.addEventListener('click',e=>{if(e.target.closest('#rulesToggle,[data-open-rules]'))$('#rulesDialog').showModal();});
$('#closeRules').onclick=()=>$('#rulesDialog').close();

// Keyboard shortcuts for the acting player: F fold, C check/call, R bet/raise.
document.addEventListener('keydown',e=>{if(document.body.dataset.view!=='table'||e.ctrlKey||e.metaKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase(),target=key==='f'?'#fold':key==='c'?($('#call').hidden?'#check':'#call'):key==='r'?'#raise':null;if(!target)return;const button=$(target);if(button&&!button.disabled&&!button.hidden){e.preventDefault();button.click();}});
$('#timeBank').onclick=()=>mutate('table/'+tableId+'/timebank',{});
// History and chat drawer.
function setDrawer(open){$('#sidebar').classList.toggle('open',open);$('#drawerToggle').setAttribute('aria-expanded',String(open));if(open&&drawerTab==='chat'){chatSeen=current?.chat?.at(-1)?.id||chatSeen;$('#chatBadge').hidden=true;}}
$('#drawerToggle').onclick=()=>setDrawer(!$('#sidebar').classList.contains('open'));$('#drawerClose').onclick=()=>setDrawer(false);
document.querySelectorAll('[data-drawer-tab]').forEach(tab=>tab.onclick=()=>{drawerTab=tab.dataset.drawerTab;document.querySelectorAll('[data-drawer-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)));document.querySelectorAll('[data-drawer-panel]').forEach(p=>p.hidden=p.dataset.drawerPanel!==drawerTab);setDrawer(true);if(drawerTab==='chat')$('#chatInput').focus();});
function renderChat(t){const log=$('#chatLog'),messages=t.chat||[],atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<30;setMarkup(log,messages.map(m=>`<p><b>${safe(m.user)}</b><span>${safe(m.text)}</span><time>${new Date(m.at).toLocaleTimeString('sq-AL',{hour:'2-digit',minute:'2-digit'})}</time></p>`).join('')||'<p class="muted">Ende nuk ka mesazhe. Përshëndit tavolinën!</p>');if(atBottom)log.scrollTop=log.scrollHeight;const latest=messages.at(-1)?.id||0,visible=$('#sidebar').classList.contains('open')&&drawerTab==='chat';if(visible)chatSeen=latest;const unread=messages.filter(m=>m.id>chatSeen).length;$('#chatBadge').hidden=!unread;$('#chatBadge').textContent=unread>9?'9+':String(unread);}
async function sendChat(text){if(!text.trim()||!tableId)return;try{await api('table/'+tableId+'/chat',{text});$('#chatInput').value='';await tableRefresh();const log=$('#chatLog');log.scrollTop=log.scrollHeight;}catch(e){toast(e.message);}}
$('#chatForm').onsubmit=e=>{e.preventDefault();sendChat($('#chatInput').value);};
document.querySelector('.quickChat').onclick=e=>{const b=e.target.closest('[data-chat]');if(b)sendChat(b.dataset.chat);};
document.addEventListener('click',e=>{const menu=document.querySelector('.moreMenu');if(menu?.open&&!menu.contains(e.target))menu.open=false;if(e.target.closest('.moreList button'))setTimeout(()=>{menu.open=false;},0);});

// During an all-in runout follow the server's street-by-street reveal closely.
setInterval(()=>{if(current?.runout&&!document.hidden)tableRefresh();},450);


// Keep the phone screen awake while a table is open.
let wakeLock=null;const keepAwake=async()=>{if(!TABLE_MODE||document.hidden||wakeLock||!navigator.wakeLock)return;try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;});}catch{}};
keepAwake();document.addEventListener('visibilitychange',keepAwake);document.addEventListener('pointerdown',keepAwake,{once:true});

// ---- Session end, idle sign-out and password change ----
function sessionEnded(message){if(!token)return;stopRakeStream?.();stopInspect();stopTableStream();token='';profile=null;tableId=null;current=null;try{sessionStorage.removeItem('pokerToken');}catch{}document.documentElement.classList.remove('hasSession');if(typeof TABLE_MODE!=='undefined'&&TABLE_MODE)leaveTableTab();for(const id of ['#rebuyDialog','#chipDialog','#rulesDialog'])if($(id)?.open)$(id).close();try{document.body.dataset.view='login';document.body.classList.remove('tableTab');$('.game').hidden=true;$('#lobby').hidden=true;if(new URLSearchParams(location.search).get('table'))history.replaceState({},'','/');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}catch{}$('#app').hidden=true;$('#login').hidden=false;$('#dashboard').hidden=true;$('#password').value='';const note=$('#loginNotice');if(note){note.textContent=message;note.hidden=false;}}
// Signed in but untouched for 20 minutes outside a table: sign out.
const IDLE_SIGNOUT_MS=20*60000;let lastInput=Date.now();for(const type of ['pointerdown','keydown','touchstart','wheel'])addEventListener(type,()=>{lastInput=Date.now();},{passive:true,capture:true});
setInterval(async()=>{if(!token||!profile||Date.now()-lastInput<IDLE_SIGNOUT_MS)return;if(profile.seatedTableId)return;try{await api('logout',{});}catch{}sessionEnded('U nxore automatikisht pas 20 minutash pa aktivitet.');},30000);
$('#loginForm').addEventListener('submit',()=>{const n=$('#loginNotice');if(n)n.hidden=true;},{capture:true});
$('#passwordForm').onsubmit=async e=>{e.preventDefault();const next=$('#newPass').value;if(next!==$('#newPass2').value)return toast('Fjalëkalimet e reja nuk përputhen');try{await api('password',{current:$('#curPass').value,next});e.target.reset();toast('Fjalëkalimi u ndryshua. Sesionet e tjera u mbyllën.');}catch(err){toast(err.message);}};

// ---- Live table stream (server push); polling stays as a fallback ----
let tableStream=null,streamTable=null,streamSeen=0,streamRetry=0;
function stopTableStream(){tableStream?.abort();tableStream=null;streamTable=null;}
function syncTableStream(){const want=token&&profile?.user.role==='USER'&&tableId&&!document.hidden?String(tableId):null;if(want===streamTable&&tableStream)return;stopTableStream();if(want&&Date.now()>=streamRetry)startTableStream(want);}
async function startTableStream(id){const controller=new AbortController(),session=token;tableStream=controller;streamTable=id;
 try{const response=await fetch('/api/table/'+encodeURIComponent(id)+'/stream',{headers:{Authorization:'Bearer '+session},signal:controller.signal});
  if(response.status===401){const d=await response.json().catch(()=>({}));sessionEnded(d.error||'Sesioni përfundoi. Hyr përsëri.');return;}
  if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('stream');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(!controller.signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let cut;
   while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);streamSeen=Date.now();const data=chunk.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('');if(data&&token===session){try{await applyTable(JSON.parse(data));}catch{}}}}
 }catch{}finally{if(tableStream===controller){tableStream=null;streamTable=null;if(!controller.signal.aborted)streamRetry=Date.now()+2000;}}}
// A hidden screen is not a present player: the stream closes and the table is
// no longer polled, so after AWAY_MS the server sits the player out instead of
// taking blinds. Coming back reconnects at once and resumes play.
document.addEventListener('visibilitychange',()=>{syncTableStream();if(!document.hidden)tableRefresh();});

// ---- Center: live inspection of every table (all hole cards, win chances) ----
let inspectStream=null,inspectRetry=null,inspectData=null;
function stopInspect(){clearTimeout(inspectRetry);inspectRetry=null;inspectStream?.abort();inspectStream=null;}
async function startInspect(){if(inspectStream||!token||profile?.user.role!=='CENTER')return;clearTimeout(inspectRetry);const controller=new AbortController(),session=token;inspectStream=controller;$('#inspectStatus').textContent='Duke u lidhur…';
 try{const response=await fetch('/api/inspect/stream',{headers:{Authorization:'Bearer '+session},signal:controller.signal});
  if(response.status===401){const d=await response.json().catch(()=>({}));sessionEnded(d.error||'Sesioni përfundoi. Hyr përsëri.');return;}
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||'Lidhja dështoi');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(!controller.signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let cut;
   while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);const data=chunk.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('');if(data){inspectData=JSON.parse(data);inspectData.clock=Date.now()-inspectData.serverNow;renderInspect();}}}
 }catch(err){if(!controller.signal.aborted)$('#inspectStatus').textContent='Lidhja u ndërpre · rilidhje…';}
 finally{if(inspectStream===controller){inspectStream=null;if(!controller.signal.aborted&&panelPage==='inspect')inspectRetry=setTimeout(startInspect,2000);}}}
const inspectPhase={waiting:'Në pritje',preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River',finished:'Përfunduar'};
function renderInspect(){const d=inspectData;if(!d)return;const activeOnly=$('#inspectActiveOnly').checked,playing=t=>['preflop','flop','turn','river'].includes(t.phase);
 const tables=d.tables.filter(t=>!activeOnly||t.seats.some(Boolean));const seated=d.tables.reduce((n,t)=>n+t.seats.filter(Boolean).length,0),inPlay=d.tables.reduce((n,t)=>n+t.seats.reduce((m,s)=>m+(s?s.stack+(playing(t)?s.committed:0):0),0),0),live=d.tables.filter(playing).length;
 $('#inspectStatus').innerHTML='<span class="liveDot"></span> Live · përditësuar '+new Date().toLocaleTimeString('sq-AL');
 $('#inspectStats').innerHTML=[['Tavolina',d.tables.length],['Duar në lojë',live],['Lojtarë ulur',seated],['Në tavolina',fmt(inPlay)]].map(([k,v])=>'<div><small>'+k+'</small><strong>'+v+'</strong></div>').join('');
 const alerts=d.tables.flatMap(t=>(t.alerts||[]).map(a=>({...a,table:t.name})));$('#inspectAlerts').hidden=!alerts.length;
 $('#inspectAlerts').innerHTML=alerts.map(a=>'<p>⚠ <b>'+safe(a.table)+'</b>: '+a.names.map(safe).join(', ')+' luajnë nga e njëjta adresë IP ('+safe(a.ip)+')</p>').join('');
 $('#inspectTables').innerHTML=tables.length?tables.map(t=>{const now=Date.now()-d.clock,left=t.deadline?Math.max(0,Math.ceil((t.deadline-now)/1000)):null,flagged=new Set((t.alerts||[]).flatMap(a=>a.names));
  const seats=t.seats.map((s,i)=>s?'<div class="iSeat'+(t.turn===i?' turn':'')+(s.folded?' folded':'')+(s.sittingOut?' out':'')+(t.result?.winnerIds?.includes(s.userId)?' won':'')+'">'
   +'<div class="iWho"><b>'+safe(s.username)+(i===t.button?'<i class="iTag">D</i>':'')+(i===t.sbPos&&playing(t)?'<i class="iTag">SB</i>':'')+(i===t.bbPos&&playing(t)?'<i class="iTag">BB</i>':'')+(flagged.has(s.username)?'<i class="iTag warn">IP</i>':'')+'</b><small>'+(s.online?'● ':'○ ')+safe(s.ip||'—')+'</small></div>'
   +'<div class="iCards">'+(s.cards.length?s.cards.map(c=>renderCard(c)).join(''):'<span class="iSlot"></span><span class="iSlot"></span>')+'</div>'
   +'<div class="iNums"><strong>'+fmt(s.stack)+'</strong><small>'+(playing(t)&&s.committed?'në pot '+fmt(s.committed):s.sittingOut?'pushim':'')+'</small></div>'
   +'<div class="iInfo">'+(playing(t)&&s.inHand&&!s.folded?'<div class="iEq">'+(s.equity!=null?'<span style="width:'+s.equity+'%"></span><em>'+s.equity.toFixed(1)+'%</em>':'<em>…</em>')+'</div>':'')+'<small>'+[s.made,s.lastAction?s.lastAction.type+(s.lastAction.amount?' '+fmt(s.lastAction.amount):''):'',t.result?.payments?.[s.userId]?'+'+fmt(t.result.payments[s.userId]):''].filter(Boolean).map(safe).join(' · ')+'</small></div>'
   +'</div>':'').join('');
  return '<article class="iTable"><header><div><h3>'+safe(t.name)+'</h3><small>Blinds '+fmt(t.sb)+'/'+fmt(t.bb)+' · Dora #'+t.hand+'</small></div><span class="iPhase '+t.phase+'">'+(inspectPhase[t.phase]||t.phase)+(left!=null?' · '+left+'s':'')+'</span></header>'
   +'<div class="iBoard">'+[0,1,2,3,4].map(k=>t.board[k]?renderCard(t.board[k]):'<span class="iSlot"></span>').join('')+'<div class="iPot"><small>Poti</small><strong>'+fmt(t.pot)+'</strong>'+(t.result?.rake?'<small>rake '+fmt(t.result.rake)+'</small>':'')+'</div></div>'
   +'<div class="iSeats">'+(seats||'<p class="muted">Asnjë lojtar i ulur.</p>')+'</div>'
   +'<details class="iLog"><summary>Ngjarjet e fundit</summary>'+t.events.map(e=>'<p><time>'+new Date(e.at).toLocaleTimeString('sq-AL')+'</time> '+safe(e.text)+'</p>').join('')+'</details></article>';}).join(''):'<article class="surface"><p class="muted">Nuk ka tavolina me lojtarë për momentin.</p></article>';}
$('#inspectActiveOnly').onchange=renderInspect;
setInterval(()=>{if(panelPage==='inspect'&&inspectData&&!document.hidden)renderInspect();},1000);
document.addEventListener('visibilitychange',()=>{if(panelPage!=='inspect'||profile?.user.role!=='CENTER')return;if(document.hidden)stopInspect();else startInspect();});

// A tab left open can outlive its server session while background polling is
// throttled. The instant it regains focus we re-check the session; a 401 routes
// through api() -> sessionEnded(), so a dead session can never keep a live UI.
let revalidating=false;
async function revalidateSession(){if(!token||!profile||revalidating)return;revalidating=true;try{await refreshProfile();}catch{}finally{revalidating=false;}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)revalidateSession();});
addEventListener('focus',revalidateSession);addEventListener('pageshow',revalidateSession);

window.visualViewport?.addEventListener('resize',layoutTable);addEventListener('orientationchange',()=>setTimeout(layoutTable,250));
