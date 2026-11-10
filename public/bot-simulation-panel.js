const dashboard=document.querySelector('#dashboard');
const panel=document.createElement('details');panel.className='surface';panel.id='simulationPanel';
panel.innerHTML=`<summary>Laboratori i testimit · kredite virtuale</summary>
<p>SIMULIM I VEÇUAR. Të gjithë kundërshtarët janë të simuluar. Nuk përdoren llogari, balanca apo tavolina të platformës.</p>
<p>Model i thjeshtuar Hold’em: një bot kundër një kundërshtari për dorë, kundërshtarë me rotacion, pa fold ose side pots. Letrat dhe fituesit nuk ndryshohen. Koha e mendimit vetëm regjistrohet.</p>
<form id="simulationForm" class="grid">
<label>Duar (1–2000)<input name="hands" type="number" min="1" max="2000" value="200" required></label>
<label>Kundërshtarë virtualë<input name="players" type="number" min="1" max="8" value="3" required></label>
<label>Buxheti i botit (kredite)<input name="botBudget" type="number" min="0.01" max="1000000" step="0.01" value="1000" required></label>
<label>Buxheti për kundërshtar (kredite)<input name="playerBudget" type="number" min="0.01" max="1000000" step="0.01" value="1000" required></label>
<label>Kontributi fillestar për lojtar (kredite)<input name="blind" type="number" min="0.01" max="1000000" step="0.01" value="1" required></label>
<label>Rake (%)<input name="rakePercent" type="number" min="0" max="20" step="0.01" value="5" required></label>
<label>Objektivi i kthimit (% e buxhetit fillestar të botit)<input name="targetReturnPercent" type="number" min="0" max="100" step="0.01" value="20" required></label>
<label>Stili i botit<select name="style"><option value="low">Konservator</option><option value="medium" selected>I balancuar</option><option value="high">Agresiv</option></select></label>
<label>Seed (përsërit të njëjtin test)<input name="seed" type="number" min="0" max="4294967295" value="42" required></label>
<button id="simulationRun">Nis simulimin</button><button type="button" id="simulationCancel" hidden>Anulo</button><button type="button" id="simulationExport" hidden>Shkarko raportin JSON</button>
</form>
<p>Kthimi mat kontributet neto të botit në duart që fitojnë kundërshtarët. Nëse mbetet nën objektiv, diferenca shpërndahet veçmas si bonus i deklaruar nga kreditet e mbetura të botit. Mund ta tejkalojë objektivin gjatë lojës; nuk merren kredite mbrapsht.</p>
<div id="simulationStatus" role="status" aria-live="polite"></div><div id="simulationResult"></div>`;
dashboard.insertBefore(panel,dashboard.querySelector('details'));
const $=s=>panel.querySelector(s),number=n=>new Intl.NumberFormat('sq-AL',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n),credits=c=>number(c/100)+' kr';
let worker=null,report=null;
function finish(){worker?.terminate();worker=null;$('#simulationRun').disabled=false;$('#simulationCancel').hidden=true;}
function render(r){
 const values=[['Duar të luajtura',r.played],['Objektivi',credits(r.target)],['Nga duart e fituara',credits(r.returnedFromPlay)],['Bonus i deklaruar',credits(r.bonus)],['Kthimi faktik',number(r.actualReturnPercent)+'%'],['Objektivi i paplotësuar',credits(r.unmetTarget)],['Rake total',credits(r.rake)],['Gjendja e botit',credits(r.bot.balance)]];
 $('#simulationResult').innerHTML=`<div class="stats">${values.map(([l,v])=>`<div class="stat"><small>${l}</small><strong>${v}</strong></div>`).join('')}</div><p>Check: ${r.actions.check} · Call: ${r.actions.call} · Raise: ${r.actions.raise} · Bluff: ${r.actions.bluff}. Kreditet: ${credits(r.initial)} fillestare = ${credits(r.final)} përfundimtare (përfshirë rake).</p>
 <div class="simulation-scroll"><table><caption>Kundërshtarët virtualë</caption><thead><tr><th>Emri</th><th>Duar</th><th>Gjendja</th><th>Bonus</th></tr></thead><tbody>${r.players.map(p=>`<tr><td>${p.id}</td><td>${p.hands}</td><td>${credits(p.balance)}</td><td>${credits(p.bonus)}</td></tr>`).join('')}</tbody></table></div>
 <details><summary>${r.history.length} duart e fundit · të gjitha letrat e zbuluara pas dorës</summary><div class="simulation-scroll"><table><thead><tr><th>Dora</th><th>Boti</th><th>Kundërshtari</th><th>Board</th><th>Fituesi</th><th>Veprimet e botit</th></tr></thead><tbody>${r.history.map(h=>`<tr><td>${h.hand}</td><td>${h.botCards.join(' ')}</td><td>${h.playerCards.join(' ')}</td><td>${h.board.join(' ')}</td><td>${h.winner}</td><td>${h.decisions.map(d=>`${d.street}: ${d.action}${d.bluff?' (bluff)':''} ${credits(d.paid)} / ${number(d.thinkMs/1000)}s`).join('<br>')}</td></tr>`).join('')}</tbody></table></div></details>`;
}
$('#simulationForm').onsubmit=e=>{
 e.preventDefault();finish();report=null;$('#simulationExport').hidden=true;$('#simulationResult').replaceChildren();
 const data=Object.fromEntries(new FormData(e.target));for(const key of Object.keys(data))if(key!=='style')data[key]=Number(data[key]);
 $('#simulationRun').disabled=true;$('#simulationCancel').hidden=false;$('#simulationStatus').textContent='Po llogaritet simulimi…';
 try{
  worker=new Worker(new URL('./bot-simulation-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{finish();if(data.error){$('#simulationStatus').textContent=data.error;return;}report=data.result;render(report);$('#simulationExport').hidden=false;$('#simulationStatus').textContent='Testi përfundoi. Asnjë veprim nuk u dërgua në platformë.';};
  worker.onerror=()=>{finish();$('#simulationStatus').textContent='Simulimi dështoi. Rifresko faqen dhe provo përsëri.';};worker.postMessage(data);
 }catch{finish();$('#simulationStatus').textContent='Shfletuesi nuk mund të nisë simulimin.';}
};
$('#simulationCancel').onclick=()=>{finish();$('#simulationStatus').textContent='Simulimi u anulua.';};
$('#simulationExport').onclick=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cenb-simulation-'+report.config.seed+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
new MutationObserver(()=>{if(dashboard.hidden){finish();report=null;$('#simulationResult').replaceChildren();$('#simulationExport').hidden=true;$('#simulationStatus').textContent='';}}).observe(dashboard,{attributes:true,attributeFilter:['hidden']});
