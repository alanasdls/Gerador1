import {ANIMALS,EMOJI,BANKS,SIGNS,PULLS,pad,daySP,sums} from './methods-data.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?value.split('-').reverse().join('/'):'';
const timeText=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'';
const animalText=group=>`${EMOJI[group-1]} ${pad(group)} ${ANIMALS[group-1]}`;
const controllers=new Map(),loads=new Map();
const ANALYSIS_REFRESH_MS=5*60*1000;
let analysisTimer=null,analysisAttempt=null,analysisDataBank='',sumSelection='',sumFollowLatest=true;
const drawKey=draw=>[draw.data,draw.horario,draw.codigo].join('|');
const analysisVisible=()=>document.visibilityState!=='hidden'&&!document.querySelector('[data-page="analises"]').hidden;
function scheduleAnalysis(){
 clearTimeout(analysisTimer);analysisTimer=null;
 if(!analysisVisible()||controllers.has('analysis'))return;
 const wait=analysisAttempt===null?0:Math.max(0,ANALYSIS_REFRESH_MS-(Date.now()-analysisAttempt));
 analysisTimer=setTimeout(()=>{if(analysisVisible())void load('analysis',{background:true});},wait);
}
function busy(prefix,value){const form=$(prefix+'Form');form.querySelector('button').disabled=value;form.setAttribute('aria-busy',String(value));}
async function api(path,options={}){const r=await fetch('/api/metodos/'+path,{cache:'no-store',...options});if(r.status===401){location.replace('/');throw Object.assign(Error('Entre novamente para continuar.'),{status:401});}let data;try{data=await r.json();}catch{throw Error('Não foi possível consultar agora.');}if(!r.ok||!data.ok)throw Object.assign(Error(data.error||'Não foi possível consultar agora.'),{status:r.status});return data;}
async function copy(text){try{await navigator.clipboard.writeText(text);const el=$('toast');el.textContent='Copiado';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2000);}catch{const el=$('toast');el.textContent='Não foi possível copiar. Tente novamente.';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200);}}
function pickGrid(picks){return '<div class="method-picks">'+picks.map(p=>`<div class="method-pick"><strong>${esc(p.milhar)}</strong><small>${esc(p.emoji)} ${esc(p.name||p.animal)}</small></div>`).join('')+'</div>';}
document.querySelectorAll('[data-banks]').forEach(select=>{select.innerHTML=Object.entries(BANKS).map(([key,b])=>`<option value="${key}">${b.name}</option>`).join('');});
$('resultsDate').value=daySP();$('resultsDate').max=daySP();
$('signSelect').insertAdjacentHTML('beforeend',SIGNS.map(([key,name,emoji])=>`<option value="${key}">${emoji} ${name}</option>`).join(''));

function renderDraws(data){
 $('drawResults').innerHTML=data.extracoes.length?data.extracoes.slice().reverse().map((draw,i)=>`<details class="panel draw-card" ${i===0?'open':''}><summary><span>${esc(dateText(draw.data))} · ${esc(draw.horario)}</span><small>${draw.premios.length} prêmios</small></summary><div class="prize-table"><div class="prize-head"><span>Prêmio</span><span>Resultado</span><span>Bicho</span></div>${draw.premios.map(p=>`<div><span>${p.posicao}º</span><strong>${esc(p.milhar)}</strong><span>${esc(p.emoji)} ${esc(p.name)}</span></div>`).join('')}</div></details>`).join(''):'<div class="panel empty-method">Ainda não há resultados publicados para esta data.</div>';
}
function renderLines(data){
 const expanded=[...$('analysisLines').querySelectorAll('details[open]')].map(el=>el.dataset.line);
 const lines=data.ranking_linhas;
 if(!lines.length){$('analysisLines').innerHTML=`<div class="panel empty-method">${esc(data.aviso_linhas||'Histórico indisponível no momento.')}</div>`;return;}
 const first=lines[0];
 const next=data.analise_atual?.proxima_extracao,base=data.analise_atual?.resultado_base;
 $('analysisLines').innerHTML=`<article class="panel leading-line"><span class="eyebrow">LINHA MAIS ATRASADA</span>${next?`<p>Próximo sorteio: ${esc(dateText(next.data))} às ${esc(next.horario)}.</p>`:''}<h2>Linha ${first.linha}</h2><p class="animal-line">${first.grupos.map(g=>`<span>${animalText(g)}</span>`).join('')}</p><p>${first.atraso_extracoes} extrações sem aparecer no 1º prêmio.</p>${base?`<small>Atualizada após o resultado de ${esc(dateText(base.data))} às ${esc(base.horario)} · 1º prêmio: ${esc(base.milhar_1_premio)}.</small>`:''}</article><div class="panel line-ranking"><h2>Análise das 5 linhas</h2><p class="footnote">Toque na linha para consultar cada bicho.</p>${lines.map(line=>`<details data-line="${line.linha}" ${expanded.includes(String(line.linha))?'open':''}><summary><span>Linha ${line.linha}</span><b>${line.atraso_extracoes} extrações</b></summary>${line.bichos.map(b=>`<div class="delay-row"><span>${animalText(b.grupo)}</span><strong>${b.extracoes_sem_sair}</strong></div>`).join('')}</details>`).join('')}</div>`;
}
function renderSums(data){
 const draws=data.extracoes;
 if(!draws.length){$('analysisSums').innerHTML=`<div class="panel empty-method">${esc(data.aviso_soma||'Aguardando resultado para calcular a soma.')}</div>`;return;}
 let selected=sumFollowLatest?-1:draws.findIndex(draw=>drawKey(draw)===sumSelection);
 if(selected<0){selected=draws.length-1;sumFollowLatest=true;}
 $('analysisSums').innerHTML=`<article class="panel"><span class="eyebrow">SOMA POR EXTRAÇÃO</span><h2>Quatro milhares</h2><label class="extraction-label">Resultado apurado usado na soma<select id="sumDraw">${draws.map((d,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(dateText(d.data))} · ${esc(d.horario)}</option>`).join('')}</select></label><div id="sumNumbers"></div><button id="copySums" class="outline-button full-button">Copiar milhares</button></article>`;
 let picks=[];
 function render(){const draw=draws[Number($('sumDraw').value)];if(!draw)return;const first=draw.premios.find(p=>p.posicao===1)?.milhar.slice(-4);if(!first)return;picks=sums(first,Number(data.data_referencia.slice(0,4)));$('sumNumbers').innerHTML=`<p class="footnote">Resultado de ${esc(dateText(draw.data))} às ${esc(draw.horario)} · 1º prêmio: ${esc(first)}.</p>${pickGrid(picks)}<p class="footnote">Soma progressiva do ano ${data.data_referencia.slice(0,4)} com o 1º prêmio, mantendo os quatro últimos dígitos.</p>`;}
 $('sumDraw').onchange=()=>{const index=Number($('sumDraw').value);sumSelection=drawKey(draws[index]);sumFollowLatest=index===draws.length-1;render();};$('copySums').onclick=()=>copy(picks.map(p=>p.milhar).join('\n'));render();
}
function renderDelays(data){$('delayResults').innerHTML=`<div class="panel delay-table">${data.itens.map((row,i)=>`<div class="delay-row"><span><small>${pad(i+1)}º · Grupo ${pad(row.grupo)}</small>${esc(row.emoji)} ${esc(row.animal)}</span><strong>${row.dias===0?'Hoje':row.dias===1?'1 dia':row.dias+' dias'}</strong></div>`).join('')}</div><p class="footnote">Fonte: <a href="${esc(data.fonte_url)}" target="_blank" rel="noopener noreferrer">Bicho Certo</a>. Atrasos em dias; as linhas da Central usam extrações do 1º prêmio.</p>`;}
async function load(prefix,{background=false}={}){
 if(background&&controllers.has(prefix))return;
 controllers.get(prefix)?.abort();const controller=new AbortController();controllers.set(prefix,controller);busy(prefix,true);$(prefix+'Status').textContent='Consultando…';
 const kill=setTimeout(()=>controller.abort(),25000),bank=$(prefix+'Bank').value;
 if(prefix==='analysis'){
  clearTimeout(analysisTimer);analysisAttempt=Date.now();
  if(!background){sumSelection='';sumFollowLatest=true;}
  if(analysisDataBank!==bank){$('analysisLines').replaceChildren();$('analysisSums').replaceChildren();analysisDataBank='';}
 }
 const endpoints={results:'resultados',analysis:'analises',delays:'atrasados'};
 let path=endpoints[prefix]+'?banca='+encodeURIComponent($(prefix+'Bank').value);if(prefix==='results')path+='&data='+encodeURIComponent($('resultsDate').value);
 try{const data=await api(path,{signal:controller.signal});if(controllers.get(prefix)!==controller)return;
  if(prefix==='results')renderDraws(data);else if(prefix==='analysis'){renderLines(data);renderSums(data);}else renderDelays(data);
  $(prefix+'Status').textContent='Consultado em '+timeText(data.consultado_em)+' · Brasília'+(prefix==='analysis'?' · Atualização automática a cada 5 minutos':'');loads.set(prefix,Date.now());
  if(prefix==='analysis')analysisDataBank=bank;
 }catch(error){
  if(controllers.get(prefix)!==controller)return;
  if(prefix==='analysis'&&background&&analysisDataBank===bank&&![401,403].includes(error.status)){
   $('analysisStatus').textContent='Não foi possível atualizar. Exibindo a consulta anterior; nova tentativa automática em 5 minutos.';
  }else{
   $(prefix+'Status').textContent=controller.signal.aborted?'A consulta demorou demais. Tente atualizar.':error.message;
   if(prefix==='analysis'){$('analysisLines').replaceChildren();$('analysisSums').replaceChildren();analysisDataBank='';}else $(prefix==='results'?'drawResults':'delayResults').replaceChildren();
  }
 }
 finally{clearTimeout(kill);if(controllers.get(prefix)===controller){controllers.delete(prefix);busy(prefix,false);if(prefix==='analysis')scheduleAnalysis();}}
}
for(const prefix of ['results','analysis','delays']){$(prefix+'Form').onsubmit=e=>{e.preventDefault();load(prefix);};$(prefix+'Bank').onchange=()=>load(prefix);}
$('resultsDate').onchange=()=>{if($('resultsDate').value)load('results');};
function renderPulls(){
 const query=$('pullSearch').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const cards=ANIMALS.flatMap((name,i)=>{if(query&&!(`${pad(i+1)} ${i+1} ${name}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)))return [];return [`<article class="panel pull-card"><header><span>${EMOJI[i]}</span><div><small>GRUPO ${pad(i+1)}</small><h2>${name}</h2></div></header><small>PUXA</small><div class="pull-tags">${PULLS[i].map(g=>`<span>${animalText(g)}</span>`).join('')}</div></article>`];});
 $('pullResults').innerHTML=cards.join('')||'<p class="empty-method">Nenhum bicho encontrado.</p>';
}
$('pullSearch').oninput=renderPulls;renderPulls();
function renderReading(prefix,data){
 const refs=(data.research||[]).flatMap(ref=>{try{const url=new URL(ref.url);if(url.protocol!=='https:'||!['personare.com.br','astrolink.com.br','astrocentro.com.br'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))return [];return [`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(ref.title)}</a>`];}catch{return [];}});
 $(prefix+'Results').innerHTML=`<article class="panel reading-result"><span class="eyebrow">${esc(data.sign?data.emoji+' '+data.sign:'LEITURA DO SONHO')}</span><h2>Sua leitura</h2><p>${esc(data.description)}</p><p class="footnote">${esc(data.reason)}</p><div class="panel-head"><h2>25 milhares</h2><button id="${prefix}Copy" class="text-button">Copiar</button></div>${pickGrid(data.picks)}<details class="reading-sources"><summary>Fontes da pesquisa</summary>${refs.join('')}</details><p class="footnote">Leitura simbólica e combinações recreativas. Não é previsão de resultado.</p></article>`;
 $(prefix+'Copy').onclick=()=>copy(data.picks.map(p=>p.milhar).join('\n'));
 window.dispatchEvent(new CustomEvent('rebeca:generation',{detail:{title:prefix==='dream'?'Sonhos':'Horóscopo · '+data.sign,count:data.picks.length}}));
}
for(const prefix of ['dream','sign'])$(prefix+'Form').onsubmit=async event=>{
 event.preventDefault();busy(prefix,true);$(prefix+'Status').textContent='Pesquisando os símbolos e preparando sua leitura…';$(prefix+'Results').replaceChildren();
 try{const body=prefix==='dream'?{dream:$('dreamText').value.trim()}:{sign:$('signSelect').value};const data=await api(prefix==='dream'?'sonhos':'horoscopo',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});renderReading(prefix,data);$(prefix+'Status').textContent='Leitura gerada com 25 milhares.';}
 catch(error){$(prefix+'Status').textContent=error.message;}finally{busy(prefix,false);}
};
function enter(name){scheduleAnalysis();const prefix={resultados:'results',atrasados:'delays'}[name];if(prefix&&Date.now()-(loads.get(prefix)||0)>60000)load(prefix);}
window.addEventListener('rebeca:view',event=>enter(event.detail));
window.addEventListener('pageshow',()=>enter(location.hash.slice(1)));enter(location.hash.slice(1));
document.addEventListener('visibilitychange',scheduleAnalysis);
window.addEventListener('focus',scheduleAnalysis);
window.addEventListener('online',scheduleAnalysis);
