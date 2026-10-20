import {renderCard,chipStack,TableVisuals,winningState,betLimits,describeHand,startingHand,preActionFor,seatLayout,feltBox,betPresets,TABLE_COLORS,tablePalette,paletteStyle} from './table-visuals.js';
const $=s=>document.querySelector(s), api=async(path,body)=>{const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(response.status===401&&path!=='login'&&token){sessionEnded(data.error||'Your session has ended. Please sign in again.');}if(!response.ok)throw Error(data.error||'Request failed');return data;};let token=sessionStorage.getItem('pokerToken')||'',profile=null,tableId=null,current=null,updating=false;// Every amount on screen is shown in euro.
const fmt=n=>{const v=Number(n||0);return (v<0?'-€':'€')+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display='none',2800);};const safe=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const card=renderCard;
// Each table lives in its own tab (/?table=ID); the main tab is the lobby.
// A table opens in the same tab (/?table=ID) and goes fullscreen on the same click.
let TABLE_MODE=new URLSearchParams(location.search).get('table');if(TABLE_MODE){tableId=TABLE_MODE;document.body.classList.add('tableTab');}
function goFullscreen(){const root=document.documentElement;if(document.fullscreenElement||!root.requestFullscreen)return;root.requestFullscreen({navigationUI:'hide'}).then(()=>{if(matchMedia('(pointer:coarse)').matches)screen.orientation?.lock?.('landscape').catch(()=>{});}).catch(()=>{});}
function openTableTab(id){if(matchMedia('(pointer:coarse)').matches)goFullscreen();TABLE_MODE=String(id);tableId=TABLE_MODE;current=null;document.body.classList.add('tableTab');history.pushState({table:TABLE_MODE},'','/?table='+encodeURIComponent(TABLE_MODE));setView();tableRefresh();keepAwake?.();}
function leaveTableTab(){TABLE_MODE=null;tableId=null;current=null;visuals.reset();document.body.classList.remove('tableTab');if(new URLSearchParams(location.search).get('table'))history.pushState({},'','/');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});if(profile)setView();refreshProfile().catch(()=>{});}
addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('table');if(id&&profile?.user.role==='USER'){TABLE_MODE=id;tableId=id;document.body.classList.add('tableTab');setView();tableRefresh();}else if(TABLE_MODE)leaveTableTab();});
// Browsers allow fullscreen only after a click, so the table enters it on the first one.
// Browsers only grant fullscreen inside a user action, so every click, tap or key
// at the table re-enters it whenever it is not active (also after Esc).
const TOUCH=matchMedia('(pointer:coarse)').matches;
const enterFullscreen=()=>{if(TABLE_MODE&&TOUCH)goFullscreen();};
for(const type of ['pointerdown','keydown','touchend'])document.addEventListener(type,enterFullscreen,{capture:true});
// Turning the screen sideways: Android allows it inside fullscreen (one tap) and in the
// installed app (no tap at all). iPhone does not, so there the notice asks the player.
const lockLandscape=()=>screen.orientation?.lock?.('landscape').catch(()=>{});
const canRotate=!!(document.documentElement.requestFullscreen&&screen.orientation?.lock);
$('#rotateNow').hidden=!canRotate;if(TABLE_MODE)lockLandscape();
$('#rotateNow').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen({navigationUI:'hide'});await screen.orientation.lock('landscape');}catch{toast('Turn your phone sideways to continue.');}};
const roleNames={CENTER:'Center',ADMIN:'Administrator',AGENT:'Agent',USER:'Player'};
function setView(){const player=profile.user.role==='USER';if(player&&TABLE_MODE&&!tableId){TABLE_MODE=null;document.body.classList.remove('tableTab');if(new URLSearchParams(location.search).get('table'))history.pushState({},'','/');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}if(!TABLE_MODE)tableId=null;$('#lobby').hidden=!player||!!tableId;$('.game').hidden=!player||!tableId;$('#sidebar').hidden=!player||!tableId;$('#backLobby').hidden=!player||!tableId;$('.selectWrap').hidden=true;$('#dashboard').hidden=player;$('#closeDashboard').hidden=!player;$('#adminToggle').hidden=true;$('#workspaceLabel').textContent=player?'Player area':'Panel · '+roleNames[profile.user.role];document.body.dataset.role=profile.user.role;document.body.dataset.view=player?(tableId?'table':'lobby'):'management';requestAnimationFrame(tableId?layoutTable:fitPhone);if(!$('#lobby').hidden)iosHint();}
function showApp(){profile&&($('#login').hidden=true,$('#app').hidden=false);if($('#authDialog').open)$('#authDialog').close();$('#userTag').textContent=profile.user.username+' · '+roleNames[profile.user.role];$('#balanceTag').textContent=fmt(profile.user.balance);$('#adminToggle').hidden=profile.user.role==='USER';}
async function refreshProfile(){const oldSeat=profile?.seatedTableId;profile=await api('state');if(oldSeat&&!profile.seatedTableId&&tableId===oldSeat){tableId=null;current=null;visuals.reset();for(const id of ['#rebuyDialog','#chipDialog'])if($(id).open)$(id).close();toast(profile.lastTableExit?.reason==='IDLE_TABLE'?'You were removed from the table after 10 minutes without play. Your chips were returned to your wallet.':profile.lastTableExit?.reason==='INACTIVE'?'You left the table after two hands without acting. Your chips were returned to your wallet.':'You left the table. Your remaining chips were returned to your wallet.');}showApp();const prev=$('#tables').value;$('#tables').innerHTML=profile.tables.map(t=>`<option value="${t.id}">${safe(t.name)} • ${fmt(t.sb)}/${fmt(t.bb)} • ${t.players}/6</option>`).join('');$('#tables').value=profile.tables.some(t=>t.id===tableId)?tableId:profile.tables[0]?.id;setView();renderLobby();if(profile.user.role!=='USER'&&!$('#rakeForm').contains(document.activeElement)){$('#rakePct').value=profile.rakePercent;}if(profile.user.role!=='USER')renderManagedTables();if($('#chipDialog').open)syncDeposit('chip');}
const portraitQuery=window.matchMedia('(max-width:900px) and (orientation:portrait), (max-width:520px)');const isPortrait=()=>portraitQuery.matches;
// Phones in landscape get the app-style controls: round buttons, a bet panel on demand.
const phoneQuery=window.matchMedia('(max-height:560px) and (orientation:landscape)');const isPhone=()=>phoneQuery.matches;
const visuals=new TableVisuals($('#table'));
// Animations are part of the game feel; the ⋯ menu turns them off.
visuals.motion=sessionStorage.getItem('pokerMotion')!=='off';$('.game').classList.toggle('reducedMotion',!visuals.motion);
$('#motionToggle').setAttribute('aria-pressed',String(visuals.motion));$('#motionToggle').textContent=visuals.motion?'◉ Animations: On':'◉ Animations: Off';
let winnerFocus=null,actionBusy=false,betEditKey='',tableViewKey='',preAction=null,preActionHand=null,preActionBet=null,wasMyTurn=false,presetKey='',chatSeen=0,drawerTab='history';
const LIVE=['preflop','flop','turn','river'];
const markupCache=new WeakMap();
const setMarkup=(node,html)=>{if(markupCache.get(node)!==html){node.innerHTML=html;markupCache.set(node,html);}};
const handNames={'High Card':'High Card','One Pair':'One Pair','Two Pair':'Two Pair','Three of a Kind':'Three of a Kind','Straight':'Straight','Flush':'Flush','Full House':'Full House','Four of a Kind':'Four of a Kind','Straight Flush':'Straight Flush'};
let feltColor=null;
function render(t){if(t.color!==feltColor){feltColor=t.color;const g=$('.game');for(const [k,v] of Object.entries(tablePalette(t.color)))g.style.setProperty(k,v);}
 const previous=current;current=t;const newHand=!previous||previous.id!==t.id||previous.hand!==t.hand;if(newHand){winnerFocus=null;betEditKey='';}if(preActionHand!==t.hand+':'+t.phase){preAction=null;preActionHand=t.hand+':'+t.phase;}
 const mine=t.seats.find(s=>s?.isMe),seatIdx=t.seats.findIndex(s=>s?.isMe),win=winningState(t,winnerFocus);winnerFocus=win.selected;
 $('#activeTableName').textContent=t.name;$('#tableHandInfo').textContent='Hand #'+t.hand+' · '+(t.runout?'All-in · '+phaseLabel(t.phase):phaseLabel(t.phase));$('#runoutLabel').hidden=!t.runout;const collected=Math.max(0,Math.round((t.pot-t.seats.reduce((n,s)=>n+(s?.bet||0),0))*100)/100);$('#potValue').textContent=fmt(t.pot);$('.pot').classList.toggle('settled',t.phase==='finished');$('.pot').classList.toggle('empty',!(t.pot>0));setMarkup($('#potChips'),chipStack(collected));
 for(let i=0;i<5;i++){let slot=$('#community').children[i];if(!slot){slot=document.createElement('div');slot.className='boardSlot';$('#community').append(slot);}const code=t.board[i];setMarkup(slot,card(code,{winning:win.board.has(code),dim:!!win.hand&&!!code&&!win.board.has(code),index:i}));}
 if(tableViewKey!==t.id){$('#seats').replaceChildren();$('#tableBets').replaceChildren();tableViewKey=t.id;}
 const layout=seatLayout(isPortrait(),isPhone()),relativeOf=i=>seatIdx>=0?(i-seatIdx+3+6)%6:i;
 // A seated player has no use for the other JOIN buttons.
 $('#table').classList.toggle('seated',seatIdx>=0);
 t.seats.forEach((seat,i)=>{
  let node=document.getElementById('seat-'+i);if(!node){node=document.createElement('div');node.id='seat-'+i;node.className='seat';$('#seats').append(node);}
  const relative=relativeOf(i);const [x,y]=layout.seats[relative];node.style.setProperty('--x',x+'%');node.style.setProperty('--y',y+'%');node.dataset.visualPosition=relative;
  if(node.dataset.seatUser!==(seat?.id||'')){node.dataset.seatUser=seat?.id||'';node.innerHTML=seat?`<div class="avatarWrap"><svg class="turnRing" viewBox="0 0 100 100" aria-hidden="true"><circle class="timerTrack" cx="50" cy="50" r="45"/><circle class="timerProgress" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="100"/></svg><div class="avatar"></div><span class="timerSeconds"></span><span class="winnerCrown" aria-label="Winner">♛</span></div><div class="seatName"><b></b><strong></strong></div><div class="seatCards"></div><div class="seatAction"></div><div class="blindBadge"></div><div class="winBadge" hidden></div>`:`<button class="emptySeat" data-pos="${i}" aria-label="JOIN · Sit in seat ${i+1}"><span aria-hidden="true">+</span><b>JOIN</b></button>`;}
  node.classList.toggle('me',!!seat?.isMe);node.classList.toggle('active',!!seat&&t.turn===i);node.classList.toggle('foldedSeat',!!seat?.folded);node.classList.toggle('winnerSeat',!!seat&&win.ids.includes(seat.id));node.classList.toggle('allInSeat',!!seat?.allIn&&t.phase!=='finished');
  if(seat){node.querySelector('.avatar').textContent=seat.username.slice(0,2).toUpperCase();node.querySelector('.avatar').style.setProperty('--avatar-hue',String((i*57+135)%360));node.querySelector('.seatName b').textContent=seat.username+(seat.isMe?' · YOU':'');node.querySelector('.seatName strong').textContent=fmt(seat.stack);const blind=t.phase!=='waiting'&&seat.inHand?(i===t.sbPos?'SB':i===t.bbPos?'BB':''):'';node.querySelector('.blindBadge').textContent=blind;node.querySelector('.blindBadge').hidden=!blind;
   const cards=seat.cards.length?seat.cards:Array(seat.cardCount).fill('BACK');setMarkup(node.querySelector('.seatCards'),cards.map((c,k)=>card(c,{winning:seat.id===win.selected&&win.cards.has(c),dim:!!win.hand&&c!=='BACK'&&!(seat.id===win.selected&&win.cards.has(c)),index:k})).join(''));
   const last=seat.lastAction,live=LIVE.includes(t.phase);const label=seat.leaving?'LEAVING':seat.sittingOut&&!(live&&seat.inHand&&!seat.folded)?'SIT OUT':live&&!seat.inHand?'WAITING':seat.folded?(last?.type||'FOLD'):t.phase==='finished'&&win.ids.includes(seat.id)?'':seat.allIn&&t.phase!=='finished'?'ALL-IN':t.phase==='finished'&&seat.folded===false&&seat.inHand?'':last?.type||'';node.classList.toggle('sittingOutSeat',seat.sittingOut||live&&!seat.inHand);const won=t.phase==='finished'&&win.ids.includes(seat.id)?t.lastResult?.payments?.[seat.id]:0,badge=node.querySelector('.winBadge');badge.hidden=!won;badge.textContent=won?'+'+fmt(won):'';node.classList.toggle('selectedWinner',!!won&&seat.id===win.selected);node.querySelector('.seatAction').textContent=label;node.querySelector('.seatAction').dataset.action=label;
  }
  let bet=document.getElementById('tableBet-'+i);if(!bet){bet=document.createElement('div');bet.id='tableBet-'+i;bet.className='tableBet';$('#tableBets').append(bet);}const [bx,by]=layout.bets[relative];bet.style.setProperty('--bx',bx+'%');bet.style.setProperty('--by',by+'%');bet.hidden=!seat||!seat.bet||t.phase==='finished';if(seat)setMarkup(bet,chipStack(seat.bet,{compact:true})+`<span class="betAmount">${fmt(seat.bet)}</span>`);
 });
 const dealer=$('#dealerButton'),dealerSeat=t.button>=0&&t.seats[t.button];dealer.hidden=!dealerSeat;if(dealerSeat){const [dx,dy]=layout.dealer[relativeOf(t.button)];dealer.style.left=dx+'%';dealer.style.top=dy+'%';}
 $('#result').hidden=true;if(false){
  const result=t.lastResult;const payouts=Object.entries(result.payments).map(([id,n])=>{const seat=t.seats.find(s=>s?.id===id);const winner=win.ids.includes(id);return winner?`<button class="winnerChoice ${id===win.selected?'selected':''}" data-winner="${safe(id)}"><span>♛ ${safe(seat?.username||'Player')}</span><strong>+${fmt(n)}</strong><small>${describeHand(result.winningHands?.[id]?.score)||handNames[result.winningHands?.[id]?.rank]||'Won without showdown'}</small></button>`:`<span class="returnedChips">Returned to ${safe(seat?.username||'Player')}: ${fmt(n)}</span>`;}).join('');
  const pots=result.pots.filter(p=>!p.refunded).map((p,i)=>`<span>${i?'SIDE POT '+i:'MAIN POT'} <b>${fmt(p.amount)}</b></span>`).join('');setMarkup($('#result'),`<div class="winnerChoices">${payouts}</div>${result.pots.filter(p=>!p.refunded).length>1?`<div class="potBreakdown">${pots}</div>`:''}`);
 }
 const can=t.turn>=0&&t.seats[t.turn]?.isMe&&!actionBusy&&(!t.actionDeadline||t.serverNow<t.actionDeadline),call=mine?Math.max(0,t.currentBet-mine.bet):0,limits=betLimits(t,mine);
 if(can&&!wasMyTurn){visuals.beep('turn');if(navigator.userActivation?.hasBeenActive)navigator.vibrate?.([40,60,40]);}if(!can)$('.dock').classList.remove('sizing');wasMyTurn=!!can;
 const dock=$('.dock'),inPlay=!!mine&&LIVE.includes(t.phase)&&mine.inHand&&!mine.folded&&!mine.allIn&&!t.leaving&&!t.runout;dock.classList.toggle('myTurn',!!can);dock.classList.toggle('waitingTurn',inPlay&&!can&&t.turn>=0);dock.classList.toggle('idle',!inPlay||t.turn<0&&!can);
 $('#turnInfo').textContent=t.runout?'All-in · cards are being dealt':actionBusy?'Sending your action…':can?'YOUR TURN':t.turn>=0?(t.seats[t.turn]?.username||'Player')+' is acting':t.phase==='finished'?'Hand finished':'Waiting for players';
 $('#inactivityNotice').hidden=!(mine?.inactiveHands>0);$('#inactivityNotice').textContent=mine?.inactiveHands?'Inactive: '+mine.inactiveHands+'/2 · Third hand: removal':'';$('#handStrength').textContent=describeHand(t.myHandScore)||(mine?.inHand&&LIVE.includes(t.phase)&&startingHand(t.myCards))||(mine?'Your chips: '+fmt(mine.stack):'YOUR CARDS');
 $('#callSummary').textContent=t.leaving?'You folded · You leave at the end of the hand':t.timedOut?'You did not act in time · You are sitting out — press ↺ Back to play':t.sittingOut?'You are sitting out · No cards next hand':mine&&LIVE.includes(t.phase)&&!mine.inHand?'Waiting for the next hand'+(t.mustPost?' · You post a big blind to join':''):t.phase==='finished'?'Hand finished · Result credited':mine?call?'To call: '+fmt(Math.min(call,mine.stack))+(call>=mine.stack?' · All-in':''):'You can check for free':'Click JOIN to enter the game';$('#blindInfo').textContent='Blinds '+fmt(t.sb)+' / '+fmt(t.bb);
 for(const key of ['fold','check','call','raise','allIn'])$('#'+key).disabled=!can;$('#check').disabled=!can||call>0;$('#call').disabled=!can||call===0;$('#call').hidden=call===0;$('#check').hidden=call>0;$('#call span').innerHTML=call?`Call <small>${fmt(Math.min(call,mine?.stack||0))}</small>`:'Call';$('#timeBank').hidden=!can||!(t.timeBank>0);$('#timeBank span').textContent='+'+Math.min(20,t.timeBank||0)+'s';$('#raise').disabled=!can||!limits.canRaise;$('#allIn').disabled=!can||!mine?.stack||limits.max>t.currentBet&&!limits.canRaise;
 const range=$('#betRange'),input=$('#betInput'),editKey=[t.id,t.hand,t.phase,t.turn,t.currentBet].join(':');range.min=String(limits.min);range.max=String(limits.max);range.step='.01';input.min=range.min;input.max=range.max;const editing=document.activeElement===input||document.activeElement===range;let value=Number(input.value);if(!editing&&(editKey!==betEditKey||!Number.isFinite(value)||value<limits.min||value>limits.max))value=limits.min;if(!editing){input.value=String(value);range.value=String(value);}betEditKey=editKey;syncBetLabel();range.disabled=input.disabled=!can||!limits.canRaise;const presets=can?betPresets(t,mine):[],key=presets.map(p=>p.label+p.value).join('|');if(key!==presetKey){presetKey=key;$('#betPresets').innerHTML=presets.map(p=>`<button type="button" data-value="${p.value}">${p.label}</button>`).join('');}document.querySelectorAll('#betPresets button,#stepBetDown,#stepBetUp').forEach(b=>b.disabled=!can||!limits.canRaise);
 $('.handControls').setAttribute('aria-busy',String(actionBusy));$('#seatActions').textContent=mine?'Seated in seat '+(seatIdx+1)+' · '+fmt(mine.stack):'Choose one of the free seats';$('#topUp').disabled=!mine||!['waiting','finished'].includes(t.phase)&&mine.inHand;$('#leave').disabled=!mine||!!t.leaving;$('#sitOut').disabled=!mine||!!t.leaving;$('#sitOut').innerHTML=t.sittingOut?'↺ <span>Back</span>':'❚❚ <span>Sit out</span>';$('#sitOut').setAttribute('aria-pressed',String(!!t.sittingOut));$('#showCards').hidden=!t.canShow;dock.classList.toggle('hasExtras',!!t.canShow);$('#startHand').disabled=!mine||!['finished','waiting'].includes(t.phase)||t.seats.filter(s=>s&&s.stack>=t.bb&&!s.sittingOut).length<2;
 renderPreActions(t,mine,can,call);
 renderChat(t);updateRebuy(t);setMarkup($('#events'),t.events.map(e=>`<span><time>${new Date(e.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time>${safe(e.text)}</span>`).join(''));visuals.update(t);
}
$('#seats').addEventListener('click',e=>{const node=e.target.closest('.seat.winnerSeat');if(node&&current){winnerFocus=node.dataset.seatUser;render(current);}});
setInterval(()=>{if(!document.hidden&&tableId)visuals.tick();},100);
$('#soundToggle').onclick=async()=>{if(visuals.sound)visuals.sound=false;else if(!await visuals.enableSound())return toast('Sound is not supported in this browser.');$('#soundToggle').setAttribute('aria-pressed',String(visuals.sound));$('#soundToggle').textContent=visuals.sound?'♫ Sound: On':'♫ Sound: Off';};
$('#motionToggle').onclick=()=>{visuals.motion=!visuals.motion;sessionStorage.setItem('pokerMotion',visuals.motion?'on':'off');$('#motionToggle').setAttribute('aria-pressed',String(visuals.motion));$('#motionToggle').textContent=visuals.motion?'◉ Animations: On':'◉ Animations: Off';$('.game').classList.toggle('reducedMotion',!visuals.motion);};
$('#fullscreenToggle').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Full screen is not supported.')}};
async function applyTable(t){if(!tableId||String(t.id)!==String(tableId))return;render(t);if(current?.seats.every(s=>!s?.isMe)&&rebuyWasOpen){rebuyWasOpen=false;tableId=null;await refreshProfile();toast('Time is up. You left the table.');}}
async function tableRefresh(){if(!token||!profile||!tableId||profile.user.role!=='USER'||updating)return;updating=true;try{const t=await api('table/'+tableId+'/state');await applyTable(t);}catch(e){try{await refreshProfile();if(!profile.seatedTableId){tableId=null;setView();if($('#rebuyDialog').open)$('#rebuyDialog').close();rebuyWasOpen=false;}}catch{}toast(e.message)}finally{updating=false;}}
async function mutate(path,body){try{await api(path,body);await refreshProfile();await tableRefresh();}catch(e){toast(e.message);}}
async function signedIn(d){token=d.token;sessionStorage.setItem('pokerToken',token);profile=d;panelPage='overview';if(new URLSearchParams(location.search).get('ref'))history.replaceState({},'','/');showApp();await refreshProfile();if(profile.user.role!=='USER')await loadDashboard();await tableRefresh();}
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{await signedIn(await api('login',{username:$('#username').value,password:$('#password').value}));}catch(err){toast(err.message)}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();if($('#regPass').value!==$('#regPass2').value)return toast('The passwords do not match');const button=e.target.querySelector('button');button.disabled=true;try{await signedIn(await api('register',{username:$('#regUser').value.trim(),password:$('#regPass').value,code:$('#regCode').value.trim().toUpperCase(),adult:$('#regAdult').checked}));e.target.reset();toast('Welcome to Klor Poker! Your agent can now add credit to your wallet.');}catch(err){toast(err.message)}finally{button.disabled=false;}};
// Home page: the sign-in / register dialog.
function openAuth(tab){document.querySelectorAll('[data-auth-tab][role=tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.authTab===tab)));document.querySelectorAll('[data-auth-panel]').forEach(f=>f.hidden=f.dataset.authPanel!==tab);const d=$('#authDialog');if(!d.open)d.showModal();setTimeout(()=>(tab==='login'?$('#username'):$('#regCode').value?$('#regUser'):$('#regCode')).focus(),50);}
document.addEventListener('click',e=>{const a=e.target.closest('[data-auth]');if(a){e.preventDefault();openAuth(a.dataset.auth);return;}const t=e.target.closest('[data-auth-tab]');if(t){e.preventDefault();openAuth(t.dataset.authTab);}});
$('#authClose').onclick=()=>$('#authDialog').close();
$('#authDialog').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
{const ref=new URLSearchParams(location.search).get('ref');if(ref&&!token){$('#regCode').value=ref.toUpperCase().slice(0,10);openAuth('register');}}
$('#logout').onclick=async()=>{stopRakeStream();stopInspect();try{await api('logout',{})}catch{}token='';profile=null;tableId=null;current=null;visuals.reset();if($('#rebuyDialog').open)$('#rebuyDialog').close();if($('#chipDialog').open)$('#chipDialog').close();sessionStorage.removeItem('pokerToken');document.documentElement.classList.remove('hasSession');if(TABLE_MODE)leaveTableTab();$('#app').hidden=true;$('#login').hidden=false;$('#dashboard').hidden=true;};
$('#tables').onchange=()=>{tableId=$('#tables').value;tableRefresh();};$('#seats').onclick=e=>{const seat=e.target.closest('[data-pos]');if(!seat||profile.user.role!=='USER')return;openChipDialog('sit',Number(seat.dataset.pos));if(current&&LIVE.includes(current.phase))toast('A hand is in play. You get cards from the next hand.');};$('#startHand').onclick=()=>mutate('table/'+tableId+'/start',{});$('#leave').onclick=async()=>{const mine=current?.seats.find(s=>s?.isMe);if(mine&&LIVE.includes(current.phase)&&mine.inHand&&!mine.folded&&!confirm('Leaving during a hand folds your cards. Your chips return to your wallet when the hand ends. Continue?'))return;try{const r=await api('table/'+tableId+'/leave',{});if(r.pending){toast('You folded. You will leave when the hand ends.');await tableRefresh();return;}tableId=null;await refreshProfile();}catch(e){toast(e.message)}};
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
const pageLabels={revenue:['Revenue','Detailed report: how much revenue your network generated, from whom and how.'],rake:['Rake','Commission generated by the players in your network.'],overview:['Overview','Activity and status of your workspace.'],accounts:['Accounts & credit','Manage your accounts and their credit movements.'],history:['Credit history','Latest entries, newest first.'],tables:['Tables','Create tables and see their status.'],inspect:['Live inspection','Every table in real time, with every player\'s cards and win chances. Visible to the center only.'],settings:['Settings','Set the commission for every hand.'],profile:['My account','Your details and role on the platform.']};
function openPanel(page){if(!pageLabels[page]||(['tables','settings','inspect'].includes(page)&&profile.user.role!=='CENTER'))page='overview';panelPage=page;document.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);document.querySelectorAll('[data-panel]').forEach(el=>{el.classList.toggle('active',el.dataset.panel===page);if(el.dataset.panel===page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});$('#panelTitle').textContent=pageLabels[page][0];$('#panelDescription').textContent=pageLabels[page][1];$('#panelBreadcrumb').textContent=roleNames[profile.user.role].toUpperCase()+' / '+pageLabels[page][0].toUpperCase();if(page==='inspect')startInspect();else stopInspect();if(page==='revenue')loadRevenue();}
$('#dashboard').addEventListener('click',e=>{const button=e.target.closest('[data-panel],[data-open-panel]');if(button)openPanel(button.dataset.panel||button.dataset.openPanel);});
function renderChildren(){const query=$('#accountSearch').value.trim().toLowerCase();const children=managedChildren.filter(c=>c.username.toLowerCase().includes(query));$('#children').innerHTML=children.map(c=>`<tr><td><div class="accountCell"><span class="accountAvatar">${safe(c.username[0].toUpperCase())}</span><strong>${safe(c.username)}</strong></div></td><td><span class="roleBadge">${roleNames[c.role]}</span>${c.share!=null?`<span class="shareBadge" title="Rake share">${c.share}%</span>`:''}</td><td class="balanceCell">${fmt(c.balance)}<small class="accountMeta">${c.blocked?'<b class="statusBlocked">● Blocked</b>':c.online?'<b class="statusOnline">● Online</b>':'○ Offline'} · ${c.lastLoginAt?'last sign-in '+new Date(c.lastLoginAt).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'never signed in'}</small></td><td><label class="srOnly" for="amount-${c.id}">Amount for ${safe(c.username)}</label><input class="transferAmount" type="number" step="0.01" min="0.01" placeholder="0.00" id="amount-${c.id}"></td><td><div class="rowActions"><button class="sendButton" data-id="${c.id}" data-dir="send">+ Send</button><button data-id="${c.id}" data-dir="return">↙ Return</button><button class="ghostButton" data-manage="password" data-user="${c.id}" data-name="${safe(c.username)}">🔑 Password</button><button class="ghostButton ${c.blocked?'':'dangerButton'}" data-manage="block" data-user="${c.id}" data-blocked="${c.blocked?1:0}" data-name="${safe(c.username)}">${c.blocked?'✓ Unblock':'⛔ Block'}</button>${c.share!=null?`<button class="ghostButton" data-manage="share" data-user="${c.id}" data-name="${safe(c.username)}" data-share="${c.share}">％ Share</button>`:''}</div></td></tr>`).join('')||`<tr><td colspan="5" class="emptyState"><span>♙</span><strong>${query?'No account found.':'No accounts yet.'}</strong><p>${query?'Try another name.':'Use the form above to create the first account.'}</p></td></tr>`;}
$('#accountSearch').oninput=renderChildren;
function renderManagedTables(){$('#managedTableCount').textContent=profile.tables.length+' TABLES';$('#managedTables').innerHTML=profile.tables.map(t=>`<div class="managedTable"><label class="tableIcon tableColorEdit" style="${paletteStyle(t.color)}" title="Change table colour">♠<input type="color" value="${safe(t.color||'#1f9d6b')}" data-color-table="${safe(t.id)}" aria-label="Colour of ${safe(t.name)}"></label><div><strong>${safe(t.name)}</strong><small>Blinds ${fmt(t.sb)} / ${fmt(t.bb)}</small></div><span class="roleBadge">${t.players}/6 players</span><span class="tableStatus">${phaseLabel(t.phase)}</span></div>`).join('');}
const phaseLabel=phase=>({waiting:'Waiting',finished:'Hand finished',preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River'}[phase]||phase);
async function loadDashboard(){await refreshProfile();const role=profile.user.role;if(role==='USER')return;$('#centerRake').hidden=role!=='CENTER';document.querySelectorAll('.centerOnly').forEach(el=>el.hidden=role!=='CENTER');$('#staffSection').hidden=false;const myShare=profile.user.share;$('#navRole').textContent=roleNames[role]+(myShare!=null?' · '+myShare+'%':'');
 $('#newShareWrap').hidden=!['CENTER','ADMIN'].includes(role);$('#newShare').max=role==='ADMIN'?String(myShare||0):'100';
 $('#newShareHint').textContent=role==='CENTER'?'The admin\'s share of the rake their network generates (0–100%).':role==='ADMIN'?'The agent\'s share of the rake from their players. Maximum: '+(myShare||0)+'% (your share).':'';$('#navUsername').textContent=profile.user.username;const childLabel={CENTER:'Administrators',ADMIN:'Agents',AGENT:'Players'}[role];$('#accountsNavLabel').textContent=childLabel;$('#accountsTitle').textContent='Your '+childLabel.toLowerCase();$('#createAccountTitle').textContent={CENTER:'Create administrator',ADMIN:'Create agent',AGENT:'Create player'}[role];$('#hierarchyHint').textContent={CENTER:'You create administrators and manage their credit. Administrators organise the agent network.',ADMIN:'You create agents and manage their credit. Each agent looks after their own players.',AGENT:'You create players and fund their wallets with credit to play.'}[role];$('#hierarchyPath').innerHTML=['CENTER','ADMIN','AGENT','USER'].map(r=>`<span class="${r===role?'currentRole':''}">${roleNames[r]}</span>`).join('<i>→</i>');$('#accountDetails').innerHTML=`<div><span>Username</span><strong>${safe(profile.user.username)}</strong></div><div><span>Role</span><strong>${roleNames[role]}</strong></div><div><span>Wallet</span><strong>${fmt(profile.user.balance)}</strong></div>`;$('#inviteCard').hidden=role!=='AGENT';if(role==='AGENT')showInvite(profile.user.invite);managedChildren=await api('users');renderChildren();const total=managedChildren.reduce((n,c)=>n+c.balance,0);$('#panelStats').innerHTML=[['Your wallet',fmt(profile.user.balance),'Available credit','↗'],[childLabel,managedChildren.length,'Accounts you manage','♙'],['Credit held below you',fmt(total),'Current wallet balances','↔']].map(([label,value,note,icon])=>`<article class="statCard"><div><span>${label}</span><i>${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`).join('');$('#ledger').hidden=false;const data=await api('ledger');const types={REGISTER:'Player registered',COMMISSION:'Rake commission',SHARE:'Share change',TRANSFER:'Transfer',RAKE:'Commission',BUY_IN:'Table buy-in',REBUY:'Top-up',CASH_OUT:'Table cash-out',BLOCK:'Account blocked',INSPECT:'Table inspection',UNBLOCK:'Account unblocked'};$('#ledgerRows').innerHTML=data.map(x=>`<tr><td>${new Date(x.time).toLocaleString('en-GB')}</td><td><span class="roleBadge">${types[x.type]||safe(x.type)}</span></td><td class="muted">${x.type==='SHARE'?(x.reason==='CAPPED'?'Capped automatically: ':'')+(x.oldShare??0)+'% → '+x.share+'%':x.type==='REGISTER'?'New player via invite link':x.type==='COMMISSION'?'Table #'+safe(x.tableId)+(x.hand?' · hand #'+x.hand:''):x.tableId?'Table #'+safe(x.tableId):x.from===profile.user.id?'Credit sent':x.to===profile.user.id?'Credit received':'Network movement'}</td><td class="number balanceCell">${['SHARE','REGISTER'].includes(x.type)?'—':(x.type==='COMMISSION'?'+':'')+fmt(x.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="emptyState"><strong>No credit movements yet.</strong><p>Transfers will appear here.</p></td></tr>';await loadRakeReport();openPanel(panelPage);}
$('#children').onclick=async e=>{const m=e.target.closest('button[data-manage]');if(m){const name=m.dataset.name;try{if(m.dataset.manage==='share'){const limit=profile.user.role==='CENTER'?100:profile.user.share||0;const v=prompt(`${name}'s share of the rake (0–${limit}%). Now: ${m.dataset.share}%. Applies to future hands.`,m.dataset.share);if(v===null)return;const r=await api('users/share',{userId:m.dataset.user,share:v.replace(',','.')});toast(`${name}: ${r.share}%`+(r.capped?.length?` · capped at ${r.share}%: ${r.capped.join(', ')}`:''));await loadDashboard();return;}if(m.dataset.manage==='block'){const block=m.dataset.blocked!=='1';if(block&&!confirm(`Block ${name}? They will be signed out at once and their table chips returned to their wallet.`))return;await api('users/status',{userId:m.dataset.user,blocked:block});toast(block?`${name} was blocked`:`${name} was unblocked`);}else{const pw=prompt(`New password for ${name} (at least 8 characters, letters and numbers):`);if(!pw)return;await api('users/password',{userId:m.dataset.user,password:pw});toast(`${name}'s password was changed. They must sign in again.`);}await loadDashboard();}catch(err){toast(err.message);}return;}const b=e.target.closest('button[data-id]');if(!b)return;const amount=Number(document.getElementById('amount-'+b.dataset.id)?.value);if(!amount)return toast('Enter the credit amount');try{await api('transfer',{userId:b.dataset.id,direction:b.dataset.dir,amount});await loadDashboard();toast('Credit transferred');}catch(err){toast(err.message);}};
$('#createUser').onsubmit=async e=>{e.preventDefault();try{await api('users/create',{username:$('#newUser').value,password:$('#newPassword').value,...(!$('#newShareWrap').hidden?{share:$('#newShare').value}:{})});$('#newShare').value='0';$('#newUser').value='';$('#newPassword').value='';await loadDashboard();toast('Account created');}catch(err){toast(err.message);}};
$('#rakeForm').onsubmit=async e=>{e.preventDefault();try{await api('rake',{percent:+$('#rakePct').value});await loadDashboard();toast('Settings saved');}catch(err){toast(err.message);}};
$('#tableForm').onsubmit=async e=>{e.preventDefault();try{await api('tables/create',{name:$('#tableName').value,sb:+$('#tableSb').value,bb:+$('#tableBb').value,color:$('#tableColor').value});await refreshProfile();await loadDashboard();toast('Table created');}catch(err){toast(err.message);}};
// Hidden tabs keep checking in every few seconds so a player who just switched
// windows is not taken for someone who left the table.
let pollTick=0;setInterval(async()=>{if(!token||!profile)return;pollTick++;syncTableStream();if(document.hidden){if(pollTick%4===0){try{await refreshProfile();}catch{}}return;}const live=Date.now()-streamSeen<4000;if(!live||pollTick%4===0)await tableRefresh();if(!live||pollTick%3===0){try{await refreshProfile();}catch{}}},1300);
addEventListener('pagehide',e=>{if(TABLE_MODE&&token&&!e.persisted&&current?.seats.some(s=>s?.isMe))navigator.sendBeacon?.('/api/table/'+encodeURIComponent(TABLE_MODE)+'/away',JSON.stringify({token}));});if(token){refreshProfile().then(async()=>{if(profile.user.role!=='USER')await loadDashboard();await tableRefresh();}).catch(()=>{token='';sessionStorage.removeItem('pokerToken');document.documentElement.classList.remove('hasSession');$('#login').hidden=false;const ref=new URLSearchParams(location.search).get('ref');if(ref){$('#regCode').value=ref.toUpperCase().slice(0,10);openAuth('register');}}).finally(()=>document.documentElement.classList.add('ready'));}else document.documentElement.classList.add('ready');

function renderLobby(){if(profile.user.role!=='USER')return;$('#lobbyBalance').textContent=fmt(profile.user.balance);$('#tableCount').textContent=profile.tables.length;$('#creditNotice').textContent=profile.user.balance<=0?'No credit · Contact your agent to play.':'Choose a table to continue';renderLobbyList();}
$('#lobbyTables').onclick=e=>{const b=e.target.closest('[data-table]');if(b)openTableTab(b.dataset.table);};
$('#backLobby').onclick=()=>{if(current?.seats.some(s=>s?.isMe))toast('You are still seated. Return to the table from the lobby within 25 seconds or you will be sat out.');leaveTableTab();};
let rebuyWasOpen=false;
function updateRebuy(t){const dialog=$('#rebuyDialog');if(t.rebuyDeadline&&t.serverNow>=(t.rebuyAvailableAt||0)){rebuyWasOpen=true;$('#rebuyMessage').textContent=`You have less than one big blind on the table. Add credit within ${Math.max(0,Math.ceil((t.rebuyDeadline-t.serverNow)/1000))} seconds. Wallet: ${fmt(profile.user.balance)}.`;syncDeposit('rebuy',!dialog.open?Math.min(profile.user.balance,20):undefined);if(!dialog.open)dialog.showModal();}else if(dialog.open)dialog.close();}
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
 $('#'+prefix+'Validation').textContent=wallet===0?'You have no credit. Contact your agent.':limits.max<limits.min?'Not enough credit or room at the table.':valid?'Selected amount: '+fmt(amount)+'.':'Allowed amount for this table: '+fmt(limits.min)+' – '+fmt(limits.max)+'.';
 return valid;
}
for(const prefix of ['chip','rebuy']){
 $('#'+prefix+'Range').oninput=e=>syncDeposit(prefix,Number(e.target.value));
 $('#'+prefix+'Amount').oninput=()=>syncDeposit(prefix);
}
function openChipDialog(mode,position=null){chipMode=mode;chipPosition=position;const room=profile.tables.find(t=>t.id===tableId);if(!room)return;const limits=depositLimits('chip');$('#chipDialogTitle').textContent=mode==='sit'?'Sit at '+room.name:'Add chips to the table';$('#chipDialogInfo').textContent=`Wallet: ${fmt(profile.user.balance)} · Table limits: ${fmt(limits.min)} – ${fmt(limits.max)}`;syncDeposit('chip',Math.min(limits.max,Math.max(limits.min,mode==='sit'?100:20)));$('#chipDialog').showModal();}
$('#topUp').onclick=()=>openChipDialog('rebuy');
$('#closeChipDialog').onclick=()=>$('#chipDialog').close();
$('#chipForm').onsubmit=async e=>{e.preventDefault();if(!syncDeposit('chip'))return;const button=$('#chipSubmit');button.disabled=true;try{const amount=Number($('#chipAmount').value);await api('table/'+tableId+'/'+chipMode,chipMode==='sit'?{position:chipPosition,buyin:amount}:{amount});$('#chipDialog').close();await refreshProfile();await tableRefresh();}catch(err){toast(err.message)}finally{syncDeposit('chip');}};

function stepBet(direction){if(!current)return;const mine=current.seats.find(s=>s?.isMe),limits=betLimits(current,mine);const value=Math.round(Math.max(limits.min,Math.min(limits.max,Number($('#betInput').value)+direction*current.bb))*100)/100;$('#betInput').value=$('#betRange').value=String(value);syncBetLabel();}
$('#stepBetDown').onclick=()=>stepBet(-1);$('#stepBetUp').onclick=()=>stepBet(1);


let lastPortrait=null;// Phones in landscape: lay the table out on a canvas of at least 730×365 and
// scale it to fill the screen exactly, so every element keeps its proportions.
// PCs and large tablets in landscape: the full table layout is drawn at 1000×760
// (or wider) and scaled to the window, so it fills the window the moment it opens
// and only scales evenly (never re-flows) when the window or full screen changes.
const FIT_W=730,FIT_H=365,DESK_W=1000,DESK_H=760;
// Safe-area insets (notch, rounded corners, home indicator) in CSS px.
let insetProbe=null;
function safeInsets(){if(!insetProbe){insetProbe=document.createElement('div');insetProbe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.append(insetProbe);}
 const cs=getComputedStyle(insetProbe);return {t:parseFloat(cs.paddingTop)||0,r:parseFloat(cs.paddingRight)||0,b:parseFloat(cs.paddingBottom)||0,l:parseFloat(cs.paddingLeft)||0};}
function fitPhone(){const g=$('.game');if(!g)return;const table=document.body.dataset.view==='table',W=innerWidth,H=Math.min(innerHeight,window.visualViewport?.height||innerHeight);
 const phone=table&&isPhone(),desk=table&&!phone&&!isPortrait()&&W>DESK_W,ins=safeInsets();
 document.body.classList.toggle('fitPhone',phone);document.body.classList.toggle('fitDesk',desk);
 if(!phone&&!desk){for(const k of ['--fit-s','--fit-w','--fit-h','--fit-x','--fit-y'])g.style.removeProperty(k);return;}
 // Phones: the canvas is scaled into the safe area (inside the notch and the
 // home indicator), so those never eat into the felt; the strips outside are background.
 const sw=phone?W-ins.l-ins.r:W,sh=phone?H-ins.t-ins.b:H,s=phone?Math.min(sh/FIT_H,sw/FIT_W):Math.min(H/DESK_H,W/DESK_W);
 g.style.setProperty('--fit-x',(phone?ins.l:0)+'px');g.style.setProperty('--fit-y',(phone?ins.t:0)+'px');
 g.style.setProperty('--fit-s',String(s));g.style.setProperty('--fit-w',(phone?sw:W)/s+'px');g.style.setProperty('--fit-h',(phone?sh:H)/s+'px');}
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
 }catch(err){$('#rakeStatus').textContent='The report could not be loaded: '+err.message;}finally{rakeLoading=false;}
}
function renderRakeReport(r){
  $('#rakeScope').textContent=profile.user.role==='CENTER'?'All tables and the whole network.':'Only rake generated by players in your hierarchy.';
  const cards=[['Total rake',fmt(r.total),'generated','％'],['Rake today',fmt(r.today),'Europe/Berlin time','◷'],['Hands with rake',r.hands,'In your network','♠']];
  const html=([label,value,note,icon])=>`<article class="statCard"><div><span>${label}</span><i>${icon}</i></div><strong>${value}</strong><small>${note}</small></article>`;
  $('#rakeStats').innerHTML=cards.map(html).join('');
  let overview=$('#overviewRake');if(!overview){overview=document.createElement('div');overview.id='overviewRake';$('#panelStats').append(overview);}overview.outerHTML=html(['Network rake',fmt(r.total),'See the Rake section','％']).replace('<article ','<article id="overviewRake" ');
  $('#rakePolicy').textContent=`Rake ${r.percent}% of the pot, no cap per hand · No flop, no drop. The network's part is calculated from contributions to each pot. Rake is credited to the Center.`;
  $('#rakeLegacy').hidden=!r.legacyTotal;$('#rakeLegacy').textContent=`${fmt(r.legacyTotal)} are older entries without a network split; they are only included in the Center's total.`;
  $('#rakeRows').innerHTML=r.rows.map(x=>`<tr><td>${new Date(x.time).toLocaleString('en-GB',{timeZone:'Europe/Berlin'})}</td><td>${safe(profile.tables.find(t=>t.id===x.tableId)?.name||'Table #'+x.tableId)}</td><td>${x.hand??'—'}</td><td class="number balanceCell">${fmt(x.amount)}</td></tr>`).join('')||'<tr><td colspan="4" class="emptyState">No rake recorded for your network yet.</td></tr>';
  $('#rakeStatus').textContent='Updated: '+new Date(r.serverNow||Date.now()).toLocaleTimeString('en-GB');
}
$('#refreshRake').onclick=loadRakeReport;
function stopRakeStream(){clearTimeout(rakeRetry);rakeRetry=null;rakeStream?.abort();rakeStream=null;}
async function startRakeStream(){
 if(rakeStream||!token||!profile||profile.user.role==='USER')return;
 clearTimeout(rakeRetry);rakeRetry=null;
 const controller=new AbortController(),session=token;rakeStream=controller;
 try{
  const response=await fetch('/api/rake/events',{headers:{Authorization:'Bearer '+session},signal:controller.signal});
  if([401,403].includes(response.status)){controller.abort();$('#rakeStatus').textContent='Sign in again to see live rake.';return;}
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
 }catch(err){if(!controller.signal.aborted&&token===session)$('#rakeStatus').textContent='Live connection lost. Reconnecting…';}
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
 box.querySelector('[data-pre="check"]').parentElement.hidden=call>0;box.querySelector('[data-pre="call"]').parentElement.lastChild.textContent=call>0?' Call '+fmt(Math.min(call,mine?.stack||0)):' Call any bet';
 if(can&&preAction){const type=preActionFor(preAction,call);preAction=null;if(type)setTimeout(()=>playAction(type),0);}
}
$('#preActions').onchange=e=>{const input=e.target.closest('[data-pre]');if(!input)return;preAction=input.checked?input.dataset.pre:null;preActionBet=current?.currentBet??null;if(current)render(current);};
const rankingExamples=[['Royal Flush','As Ks Qs Js Ts','A to 10 of the same suit'],['Straight Flush','9h 8h 7h 6h 5h','Five cards in a row, same suit'],['Four of a Kind','Kc Kd Kh Ks 2d','Four cards of the same rank'],['Full House','Qh Qd Qs 7c 7d','Three of a kind + a pair'],['Flush','Ad Jd 8d 5d 2d','Five cards of the same suit'],['Straight','Tc 9d 8h 7s 6c','Five cards in a row; A-2-3-4-5 is the lowest'],['Three of a Kind','8c 8d 8s Kh 3d','Three cards of the same rank'],['Two Pair','Jh Jc 4s 4d Ac','Two different pairs'],['One Pair','Th Ts 9c 5d 2h','Two cards of the same rank'],['High Card','Ah Jd 8c 6s 3h','No combination; the highest card decides']];
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
function renderChat(t){const log=$('#chatLog'),messages=t.chat||[],atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<30;setMarkup(log,messages.map(m=>`<p><b>${safe(m.user)}</b><span>${safe(m.text)}</span><time>${new Date(m.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time></p>`).join('')||'<p class="muted">No messages yet. Say hello to the table!</p>');if(atBottom)log.scrollTop=log.scrollHeight;const latest=messages.at(-1)?.id||0,visible=$('#sidebar').classList.contains('open')&&drawerTab==='chat';if(visible)chatSeen=latest;const unread=messages.filter(m=>m.id>chatSeen).length;$('#chatBadge').hidden=!unread;$('#chatBadge').textContent=unread>9?'9+':String(unread);}
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
function sessionEnded(message){if(!token)return;stopRakeStream?.();stopInspect();stopTableStream();token='';profile=null;tableId=null;current=null;try{sessionStorage.removeItem('pokerToken');}catch{}document.documentElement.classList.remove('hasSession');if(typeof TABLE_MODE!=='undefined'&&TABLE_MODE)leaveTableTab();for(const id of ['#rebuyDialog','#chipDialog','#rulesDialog'])if($(id)?.open)$(id).close();try{document.body.dataset.view='login';document.body.classList.remove('tableTab');$('.game').hidden=true;$('#lobby').hidden=true;if(new URLSearchParams(location.search).get('table'))history.replaceState({},'','/');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}catch{}$('#app').hidden=true;$('#login').hidden=false;$('#dashboard').hidden=true;$('#password').value='';const note=$('#loginNotice');if(note){note.textContent=message;note.hidden=false;}openAuth('login');}
// Signed in but untouched for 20 minutes outside a table: sign out.
const IDLE_SIGNOUT_MS=20*60000;let lastInput=Date.now();for(const type of ['pointerdown','keydown','touchstart','wheel'])addEventListener(type,()=>{lastInput=Date.now();},{passive:true,capture:true});
setInterval(async()=>{if(!token||!profile||Date.now()-lastInput<IDLE_SIGNOUT_MS)return;if(profile.seatedTableId)return;try{await api('logout',{});}catch{}sessionEnded('You were signed out automatically after 20 minutes of inactivity.');},30000);
$('#loginForm').addEventListener('submit',()=>{const n=$('#loginNotice');if(n)n.hidden=true;},{capture:true});
$('#passwordForm').onsubmit=async e=>{e.preventDefault();const next=$('#newPass').value;if(next!==$('#newPass2').value)return toast('The new passwords do not match');try{await api('password',{current:$('#curPass').value,next});e.target.reset();toast('Password changed. Your other sessions were closed.');}catch(err){toast(err.message);}};

// ---- Live table stream (server push); polling stays as a fallback ----
let tableStream=null,streamTable=null,streamSeen=0,streamRetry=0;
function stopTableStream(){tableStream?.abort();tableStream=null;streamTable=null;}
function syncTableStream(){const want=token&&profile?.user.role==='USER'&&tableId&&!document.hidden?String(tableId):null;if(want===streamTable&&tableStream)return;stopTableStream();if(want&&Date.now()>=streamRetry)startTableStream(want);}
async function startTableStream(id){const controller=new AbortController(),session=token;tableStream=controller;streamTable=id;
 try{const response=await fetch('/api/table/'+encodeURIComponent(id)+'/stream',{headers:{Authorization:'Bearer '+session},signal:controller.signal});
  if(response.status===401){const d=await response.json().catch(()=>({}));sessionEnded(d.error||'Your session has ended. Please sign in again.');return;}
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
  if(response.status===401){const d=await response.json().catch(()=>({}));sessionEnded(d.error||'Your session has ended. Please sign in again.');return;}
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||'Connection failed');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(!controller.signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let cut;
   while((cut=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,cut);buffer=buffer.slice(cut+2);const data=chunk.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('');if(data){inspectData=JSON.parse(data);inspectData.clock=Date.now()-inspectData.serverNow;renderInspect();}}}
 }catch(err){if(!controller.signal.aborted)$('#inspectStatus').textContent='Connection lost · reconnecting…';}
 finally{if(inspectStream===controller){inspectStream=null;if(!controller.signal.aborted&&panelPage==='inspect')inspectRetry=setTimeout(startInspect,2000);}}}
const inspectPhase={waiting:'Waiting',preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River',finished:'Finished'};
function renderInspect(){const d=inspectData;if(!d)return;const activeOnly=$('#inspectActiveOnly').checked,playing=t=>['preflop','flop','turn','river'].includes(t.phase);
 const tables=d.tables.filter(t=>!activeOnly||t.seats.some(Boolean));const seated=d.tables.reduce((n,t)=>n+t.seats.filter(Boolean).length,0),inPlay=d.tables.reduce((n,t)=>n+t.seats.reduce((m,s)=>m+(s?s.stack+(playing(t)?s.committed:0):0),0),0),live=d.tables.filter(playing).length;
 $('#inspectStatus').innerHTML='<span class="liveDot"></span> Live · updated '+new Date().toLocaleTimeString('en-GB');
 $('#inspectStats').innerHTML=[['Tables',d.tables.length],['Hands in play',live],['Players seated',seated],['On tables',fmt(inPlay)]].map(([k,v])=>'<div><small>'+k+'</small><strong>'+v+'</strong></div>').join('');
 const alerts=d.tables.flatMap(t=>(t.alerts||[]).map(a=>({...a,table:t.name})));$('#inspectAlerts').hidden=!alerts.length;
 $('#inspectAlerts').innerHTML=alerts.map(a=>'<p>⚠ <b>'+safe(a.table)+'</b>: '+a.names.map(safe).join(', ')+' are playing from the same IP address ('+safe(a.ip)+')</p>').join('');
 $('#inspectTables').innerHTML=tables.length?tables.map(t=>{const now=Date.now()-d.clock,left=t.deadline?Math.max(0,Math.ceil((t.deadline-now)/1000)):null,flagged=new Set((t.alerts||[]).flatMap(a=>a.names));
  const seats=t.seats.map((s,i)=>s?'<div class="iSeat'+(t.turn===i?' turn':'')+(s.folded?' folded':'')+(s.sittingOut?' out':'')+(t.result?.winnerIds?.includes(s.userId)?' won':'')+'">'
   +'<div class="iWho"><b>'+safe(s.username)+(i===t.button?'<i class="iTag">D</i>':'')+(i===t.sbPos&&playing(t)?'<i class="iTag">SB</i>':'')+(i===t.bbPos&&playing(t)?'<i class="iTag">BB</i>':'')+(flagged.has(s.username)?'<i class="iTag warn">IP</i>':'')+'</b><small>'+(s.online?'● ':'○ ')+safe(s.ip||'—')+'</small></div>'
   +'<div class="iCards">'+(s.cards.length?s.cards.map(c=>renderCard(c)).join(''):'<span class="iSlot"></span><span class="iSlot"></span>')+'</div>'
   +'<div class="iNums"><strong>'+fmt(s.stack)+'</strong><small>'+(playing(t)&&s.committed?'in pot '+fmt(s.committed):s.sittingOut?'sitting out':'')+'</small></div>'
   +'<div class="iInfo">'+(playing(t)&&s.inHand&&!s.folded?'<div class="iEq">'+(s.equity!=null?'<span style="width:'+s.equity+'%"></span><em>'+s.equity.toFixed(1)+'%</em>':'<em>…</em>')+'</div>':'')+'<small>'+[s.made,s.lastAction?s.lastAction.type+(s.lastAction.amount?' '+fmt(s.lastAction.amount):''):'',t.result?.payments?.[s.userId]?'+'+fmt(t.result.payments[s.userId]):''].filter(Boolean).map(safe).join(' · ')+'</small></div>'
   +'</div>':'').join('');
  return '<article class="iTable"><header><div><h3>'+safe(t.name)+'</h3><small>Blinds '+fmt(t.sb)+'/'+fmt(t.bb)+' · Hand #'+t.hand+'</small></div><span class="iPhase '+t.phase+'">'+(inspectPhase[t.phase]||t.phase)+(left!=null?' · '+left+'s':'')+'</span></header>'
   +'<div class="iBoard">'+[0,1,2,3,4].map(k=>t.board[k]?renderCard(t.board[k]):'<span class="iSlot"></span>').join('')+'<div class="iPot"><small>Pot</small><strong>'+fmt(t.pot)+'</strong>'+(t.result?.rake?'<small>rake '+fmt(t.result.rake)+'</small>':'')+'</div></div>'
   +'<div class="iSeats">'+(seats||'<p class="muted">No players seated.</p>')+'</div>'
   +'<details class="iLog"><summary>Latest events</summary>'+t.events.map(e=>'<p><time>'+new Date(e.at).toLocaleTimeString('en-GB')+'</time> '+safe(e.text)+'</p>').join('')+'</details></article>';}).join(''):'<article class="surface"><p class="muted">No tables with players right now.</p></article>';}
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

window.visualViewport?.addEventListener('resize',layoutTable);// Some browsers (notably iOS Safari) report the new size late after a rotation
// or a fullscreen change, so the layout is measured again a moment later too.
for(const ev of ['orientationchange','fullscreenchange'])(ev==='fullscreenchange'?document:window).addEventListener(ev,()=>{for(const ms of [100,350,800])setTimeout(layoutTable,ms);});

// ---- Table colour: presets, a custom colour and a live preview ----
function setTableColor(hex){$('#tableColor').value=hex;$('#tableColorPreview').setAttribute('style',paletteStyle(hex));document.querySelectorAll('#tableSwatches button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===hex)));}
$('#tableSwatches').innerHTML=TABLE_COLORS.map(([hex,name])=>`<button type="button" class="swatch" data-color="${hex}" title="${name}" aria-label="${name}" style="${paletteStyle(hex)}"><i></i><span>${name}</span></button>`).join('');
$('#tableSwatches').onclick=e=>{const b=e.target.closest('[data-color]');if(b)setTableColor(b.dataset.color);};
$('#tableColor').oninput=e=>setTableColor(e.target.value);
setTableColor(TABLE_COLORS[0][0]);
// Recolour an existing table from the list.
$('#managedTables').addEventListener('change',async e=>{const i=e.target.closest('[data-color-table]');if(!i)return;try{await api('tables/color',{id:i.dataset.colorTable,color:i.value});await refreshProfile();await loadDashboard();toast('Table colour changed');}catch(err){toast(err.message);}});

// ---- Revenue report: how much, from whom and how, with date filters ----
const revTz='Europe/Tirane',revDay=d=>new Intl.DateTimeFormat('en-CA',{timeZone:revTz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const revAdd=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);};
const revRoleNames={CENTER:'Center',ADMIN:'Admin',AGENT:'Agent',USER:'Player',LEGACY:'Archive'};
const revChildLabel={CENTER:'admins',ADMIN:'agents',AGENT:'players'};
// Only the latest request is shown, even if replies arrive out of order.
let revSeq=0;
let revState={preset:'30',from:null,to:null,scope:null},revData=null,revTimer=null;
function revPreset(p){const t=revDay(new Date());const y=t.slice(0,4),m=t.slice(0,7);
 if(p==='today')return [t,t];if(p==='yesterday'){const d=revAdd(t,-1);return [d,d];}if(p==='7')return [revAdd(t,-6),t];if(p==='30')return [revAdd(t,-29),t];
 if(p==='month')return [m+'-01',t];if(p==='lastMonth'){const last=revAdd(m+'-01',-1);return [last.slice(0,7)+'-01',last];}if(p==='year')return [y+'-01-01',t];return ['all',t];}
function revDelta(cur,prev){if(!prev)return cur?'<em class="up">new</em>':'<em>—</em>';const d=Math.round((cur-prev)/prev*1000)/10;return '<em class="'+(d>=0?'up':'down')+'">'+(d>=0?'▲ ':'▼ ')+Math.abs(d)+'%</em>';}
async function loadRevenue(){if(!profile||profile.user.role==='USER')return;
 if(revState.preset){const [f,t]=revPreset(revState.preset);revState.from=f;revState.to=t;}
 $('#revStatus').textContent='Loading…';
 const seq=++revSeq;try{const data=await api('revenue',{from:revState.from,to:revState.to,scope:revState.scope||undefined});if(seq!==revSeq)return;revData=data;revState.from=revData.from;revState.to=revData.to;$('#revFrom').value=revData.from;$('#revTo').value=revData.to;renderRevenue();$('#revStatus').textContent='Updated '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false});}
 catch(err){$('#revStatus').textContent=err.message;if(revState.scope){revState.scope=null;}}
 clearInterval(revTimer);revTimer=setInterval(()=>{if(panelPage==='revenue'&&!document.hidden&&revState.to===revDay(new Date()))loadRevenue();},30000);}
function renderRevenue(){const d=revData;if(!d)return;
 document.querySelectorAll('#revPresets button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===revState.preset)));
 $('#revPath').innerHTML=d.path.map((p,i)=>(i?'<span>›</span>':'')+(i<d.path.length-1?'<button type="button" data-scope="'+safe(p.id)+'">':'<b>')+'<small>'+revRoleNames[p.role]+'</small> '+safe(p.username)+(i<d.path.length-1?'</button>':'</b>')).join('');
 const fmtD=s=>s.split('-').reverse().join('.'),range=fmtD(d.from)+' – '+fmtD(d.to);
 const own=d.root.id===profile.user.id;
 const k=[['Rake generated',fmt(d.totals.rake),revDelta(d.totals.rake,d.previous.rake)+'<small>compared with '+fmtD(d.previous.from)+' – '+fmtD(d.previous.to)+' ('+fmt(d.previous.rake)+')</small>'],
  [own?'Your earnings':d.root.username+'\'s earnings',fmt(d.totals.earned),revDelta(d.totals.earned,d.previous.earned)+'<small>'+(d.root.role==='CENTER'?'rake after network commissions':(d.root.share??0)+'% share of the network rake')+'</small>'],
  ...(d.root.role!=='AGENT'?[['Network commissions',fmt(d.totals.paidToNetwork),'<small>'+(d.root.role==='CENTER'?'paid to admins and agents':'paid to agents')+'</small>']]:[]),
  ['Hands with rake',d.totals.hands.toLocaleString('en-US'),revDelta(d.totals.hands,d.previous.hands)],
  ['Contributing players',d.totals.players,'<small>players who paid rake</small>'],
  ['Average rake / hand',fmt(d.totals.avgPerHand),'<small>'+d.totals.tables+' active tables</small>']];
 $('#revKpis').innerHTML=k.map(([l,v,s])=>'<div class="statCard revKpi"><small>'+l+'</small><strong>'+v+'</strong><div>'+s+'</div></div>').join('');
 // chart
 $('#revChartTitle').textContent=d.bucket==='month'?'Revenue by month':'Revenue by day';$('#revChartNote').textContent=range+' · '+(d.root.role==='CENTER'?'rake received by the center':'rake generated by '+d.root.username+'\'s network');
 const s=d.series,max=Math.max(...s.map(x=>x.rake),0.01),W=Math.max(s.length*22,320),H=180,bw=W/s.length,every=Math.ceil(s.length/12);
 const label=x=>d.bucket==='month'?x.key.slice(5)+'/'+x.key.slice(2,4):x.key.slice(8)+'.'+x.key.slice(5,7);
 $('#revChart').innerHTML='<svg viewBox="0 0 '+W+' '+(H+24)+'" preserveAspectRatio="none" role="img" aria-label="Revenue chart">'+[.25,.5,.75,1].map(f=>'<line x1="0" x2="'+W+'" y1="'+(H-H*f)+'" y2="'+(H-H*f)+'" class="grid"/>').join('')+s.map((x,i)=>{const h=Math.max(x.rake?2:0,x.rake/max*(H-8));return '<g><rect x="'+(i*bw+bw*.15)+'" y="'+(H-h)+'" width="'+(bw*.7)+'" height="'+h+'" rx="3"><title>'+(d.bucket==='month'?x.key:fmtD(x.key))+': '+fmt(x.rake)+' · '+x.hands+' hands</title></rect>'+(i%every===0?'<text x="'+(i*bw+bw/2)+'" y="'+(H+16)+'">'+label(x)+'</text>':'')+'</g>';}).join('')+'</svg><div class="revMax">max. '+fmt(max)+'</div>';
 // who
 $('#revChildNote').textContent=d.byChild.length?'Split by '+d.root.username+'\'s '+(revChildLabel[d.root.role]||'members')+(d.root.role!=='AGENT'?' · click to open their network':''):'';
 $('#revChildren').innerHTML=d.byChild.length?d.byChild.map(c=>'<div class="revRow'+(c.id&&c.role!=='USER'&&c.role!=='LEGACY'?' drill" data-scope="'+safe(c.id)+'" role="button" tabindex="0':'')+'"><div class="revWho"><b>'+safe(c.username)+'</b><small><i class="roleTag">'+revRoleNames[c.role]+(c.sharePct!=null?' · '+c.sharePct+'%':'')+'</i> '+c.hands+' hands'+(c.role!=='USER'&&c.role!=='LEGACY'?' · '+c.players+' players':'')+(c.earned?' · branch commission '+fmt(c.earned):'')+'</small></div><div class="revBar"><span style="width:'+c.share+'%"></span></div><div class="revAmt"><b>'+fmt(c.rake)+'</b><small>'+c.share+'%</small></div></div>').join(''):'<p class="muted">No members at this level.</p>';
 // how
 $('#revTables').innerHTML=d.byTable.length?d.byTable.map(t=>'<div class="revRow"><div class="revWho"><b><i class="dot" style="background:'+safe(t.color||'#1f9d6b')+'"></i>'+safe(t.name)+'</b><small>Blinds '+fmt(t.sb)+'/'+fmt(t.bb)+' · '+t.hands+' hands · '+fmt(t.hands?t.rake/t.hands:0)+'/hand</small></div><div class="revBar"><span style="width:'+t.share+'%"></span></div><div class="revAmt"><b>'+fmt(t.rake)+'</b><small>'+t.share+'%</small></div></div>').join(''):'<p class="muted">No hands with rake in this period.</p>';
 const hm=Math.max(...d.hours.map(h=>h.rake),0.01);
 $('#revHours').innerHTML=d.hours.map(h=>'<div class="hr" title="'+String(h.hour).padStart(2,'0')+':00 – '+fmt(h.rake)+' · '+h.hands+' hands"><span style="height:'+Math.max(h.rake?4:0,h.rake/hm*100)+'%"></span><small>'+(h.hour%3===0?String(h.hour).padStart(2,'0'):'')+'</small></div>').join('');
 renderRevenuePlayers();
 $('#revRecent').innerHTML=d.recent.length?d.recent.map(r=>'<tr><td>'+new Date(r.time).toLocaleString('en-GB',{timeZone:revTz,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})+'</td><td>'+safe(r.table)+'</td><td>#'+(r.hand??'—')+'</td><td class="wrap">'+r.parts.map(p=>(p.player?safe(p.player):'archive')+' <b>'+fmt(p.amount)+'</b>').join(' · ')+'</td><td class="number">'+fmt(r.amount)+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">No hands with rake in this period.</td></tr>';
}
function renderRevenuePlayers(){const q=($('#revSearch').value||'').trim().toLowerCase(),list=(revData?.byPlayer||[]).filter(p=>!q||[p.username,p.agent,p.admin].some(x=>(x||'').toLowerCase().includes(q)));
 $('#revPlayers').innerHTML=list.length?list.map((p,i)=>'<tr><td>'+(i+1)+'</td><td><b>'+safe(p.username)+'</b></td><td>'+safe(p.agent||'—')+'</td><td>'+safe(p.admin||'—')+'</td><td class="number">'+p.hands+'</td><td class="number">'+fmt(p.rake)+'</td><td class="number">'+p.share+'%</td></tr>').join(''):'<tr><td colspan="7" class="muted">'+(q?'No results.':'No player paid rake in this period.')+'</td></tr>';}
$('#revPresets').onclick=e=>{const b=e.target.closest('[data-preset]');if(!b)return;revState.preset=b.dataset.preset;loadRevenue();};
$('#revRange').onsubmit=e=>{e.preventDefault();revState.preset=null;revState.from=$('#revFrom').value;revState.to=$('#revTo').value;loadRevenue();};
$('#revSearch').oninput=renderRevenuePlayers;
const revDrill=e=>{const b=e.target.closest('[data-scope]');if(!b||(e.type==='keydown'&&e.key!=='Enter'))return;revState.scope=b.dataset.scope===profile.user.id?null:b.dataset.scope;loadRevenue();};
for(const id of ['#revChildren','#revPath']){$(id).addEventListener('click',revDrill);$(id).addEventListener('keydown',revDrill);}
$('#revExport').onclick=async()=>{try{$('#revStatus').textContent='Preparing the file…';const r=await api('revenue',{from:revState.from,to:revState.to,scope:revState.scope||undefined,detail:true});
 const esc=v=>{const s=String(v??'');return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
 const lines=[['Date','Time','Table','Hand','Player','Agent','Admin','Rake (€)'].join(';'),...r.rows.map(x=>{const dt=new Date(x.time);return [revDay(dt).split('-').reverse().join('.'),dt.toLocaleTimeString('en-GB',{timeZone:revTz,hour12:false}),x.table,x.hand??'',x.player,x.agent||'',x.admin||'',String(x.amount.toFixed(2)).replace('.',',')].map(esc).join(';');}),'',['Total','','','','','','',String(r.rows.reduce((n,x)=>n+x.amount,0).toFixed(2)).replace('.',',')].join(';')];
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='klor-revenue-'+r.root.username+'-'+r.from+'_'+r.to+'.csv';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
 $('#revStatus').textContent=r.rows.length+' rows exported';}catch(err){$('#revStatus').textContent=err.message;}};

// iPhone/iPad: Safari cannot go full screen, but a Home Screen web app opens without
// Safari's bars, so the table gets the whole screen. Shown once, in the lobby.
function iosHint(){try{if(localStorage.getItem('klorA2HS'))return;}catch{}
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),standalone=navigator.standalone||matchMedia('(display-mode: standalone),(display-mode: fullscreen)').matches;
 if(!ios||standalone||$('#a2hs'))return;const b=document.createElement('div');b.id='a2hs';b.className='a2hs';b.setAttribute('role','note');
 b.innerHTML='<div><b>Full screen on iPhone</b><span>Safari does not allow full screen. Tap <i>Share</i> <em>□↑</em> → <i>Add to Home Screen</i> and open Klor Poker from the icon: the table fills the screen, without Safari\'s bars.</span></div><button type="button" aria-label="Close">✕</button>';
 b.querySelector('button').onclick=()=>{b.remove();try{localStorage.setItem('klorA2HS','1');}catch{}};$('#lobby').prepend(b);}

// ---- Lobby: one responsive list of all tables, with search, filters and sorting ----
let lobbySort={key:'id',dir:1};
const LOBBY_LIVE=['preflop','flop','turn','river'];
function renderLobbyList(){if(!profile||!$('#lobbyTables'))return;
 const q=($('#lobbySearch')?.value||'').trim().toLowerCase(),free=$('#lobbyFree')?.checked,live=$('#lobbyLive')?.checked;
 const list=profile.tables.filter(t=>(!q||t.name.toLowerCase().includes(q)||String(t.id).includes(q.replace('#','')))&&(!free||t.players<6)&&(!live||LOBBY_LIVE.includes(t.phase)));
 const val={id:t=>Number(t.id)||0,name:t=>t.name.toLowerCase(),blinds:t=>t.bb,buyin:t=>t.minBuyin,players:t=>t.players,status:t=>LOBBY_LIVE.includes(t.phase)?1:0};
 list.sort((a,b)=>{const x=val[lobbySort.key](a),y=val[lobbySort.key](b);return ((x>y)-(x<y))*lobbySort.dir||(Number(a.id)-Number(b.id));});
 const canPlay=t=>!(profile.user.balance<=0&&profile.seatedTableId!==t.id);
 const head=[['id','ID'],['name','Table'],['blinds','Blinds'],['buyin','Buy-in'],['players','Players'],['status','Status']];
 const arrow=k=>lobbySort.key===k?(lobbySort.dir>0?' ▲':' ▼'):'';
 $('#lobbyTables').innerHTML='<div class="lobbyList" role="table" aria-label="Tables"><div class="llHead" role="row">'+head.map(([k,l])=>'<button type="button" role="columnheader" class="llSort'+(lobbySort.key===k?' on':'')+'" data-sort="'+k+'" aria-sort="'+(lobbySort.key===k?(lobbySort.dir>0?'ascending':'descending'):'none')+'">'+l+arrow(k)+'</button>').join('')+'<span role="columnheader" class="llHeadAct"></span></div>'
  +(list.length?list.map(t=>{const seated=profile.seatedTableId===t.id,ok=canPlay(t),playing=LOBBY_LIVE.includes(t.phase);
   const seats=Array.from({length:6},(_,i)=>'<i'+(i<t.players?' class="on"':'')+'></i>').join('');
   return '<div class="llRow'+(seated?' seated':'')+(ok?'':' locked')+'" role="row"'+(ok?' data-table="'+safe(t.id)+'"':'')+' style="'+paletteStyle(t.color)+'">'
    +'<span class="llId" role="cell">#'+safe(t.id)+'</span>'
    +'<span class="llName" role="cell"><i class="llDot" aria-hidden="true"></i><b>'+safe(t.name)+'</b>'+(seated?'<em>seated here</em>':'')+'</span>'
    +'<span class="llBlinds" role="cell"><small>Blinds</small>'+fmt(t.sb)+' / '+fmt(t.bb)+'</span>'
    +'<span class="llBuyin" role="cell"><small>Buy-in</small>'+fmt(t.minBuyin)+' – '+fmt(t.maxBuyin)+'</span>'
    +'<span class="llPlayers" role="cell"><small>Players</small><span class="llSeats" aria-hidden="true">'+seats+'</span>'+t.players+'/6</span>'
    +'<span class="llStatus'+(playing?' live':'')+'" role="cell"><span class="statusDot"></span>'+phaseLabel(t.phase)+'</span>'
    +'<span class="llAct" role="cell"><button class="primary" '+(ok?'data-table="'+safe(t.id)+'"':'disabled title="Your credit is zero"')+'>'+(seated?'Go to table':'Open')+' <span>↗</span></button></span></div>';}).join('')
   :'<p class="llEmpty">'+(profile.tables.length?'No table matches your search.':'No tables yet.')+'</p>')+'</div>';}
$('#lobbyTables').addEventListener('click',e=>{const s=e.target.closest('[data-sort]');if(!s)return;e.stopPropagation();const k=s.dataset.sort;lobbySort=lobbySort.key===k?{key:k,dir:-lobbySort.dir}:{key:k,dir:k==='players'||k==='status'?-1:1};renderLobbyList();},true);
for(const id of ['#lobbySearch','#lobbyFree','#lobbyLive'])$(id).addEventListener('input',renderLobbyList);

// ---- Agents: personal invite link for new players ----
function showInvite(code){$('#inviteCode').textContent=code||'—';$('#inviteLink').value=code?location.origin+'/?ref='+code:'';}
$('#inviteCopy').onclick=async()=>{const v=$('#inviteLink').value;if(!v)return;try{await navigator.clipboard.writeText(v);}catch{$('#inviteLink').select();document.execCommand?.('copy');}toast('Invite link copied');};
$('#inviteReset').onclick=async()=>{if(!confirm('Create a new invite link? The current link and code will stop working.'))return;try{const r=await api('invite/reset',{});profile.user.invite=r.invite;showInvite(r.invite);toast('New invite link ready');}catch(err){toast(err.message);}};
