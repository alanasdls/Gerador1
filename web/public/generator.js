import {generateNumbers} from './generator-core.mjs';
const GROUPS=[
[1,'Avestruz','🐦',['01','02','03','04']],[2,'Águia','🦅',['05','06','07','08']],[3,'Burro','🐴',['09','10','11','12']],[4,'Borboleta','🦋',['13','14','15','16']],[5,'Cachorro','🐕',['17','18','19','20']],[6,'Cabra','🐐',['21','22','23','24']],[7,'Carneiro','🐏',['25','26','27','28']],[8,'Camelo','🐫',['29','30','31','32']],[9,'Cobra','🐍',['33','34','35','36']],[10,'Coelho','🐇',['37','38','39','40']],[11,'Cavalo','🐎',['41','42','43','44']],[12,'Elefante','🐘',['45','46','47','48']],[13,'Galo','🐓',['49','50','51','52']],[14,'Gato','🐈',['53','54','55','56']],[15,'Jacaré','🐊',['57','58','59','60']],[16,'Leão','🦁',['61','62','63','64']],[17,'Macaco','🐒',['65','66','67','68']],[18,'Porco','🐖',['69','70','71','72']],[19,'Pavão','🦚',['73','74','75','76']],[20,'Peru','🦃',['77','78','79','80']],[21,'Touro','🐂',['81','82','83','84']],[22,'Tigre','🐅',['85','86','87','88']],[23,'Urso','🐻',['89','90','91','92']],[24,'Veado','🦌',['93','94','95','96']],[25,'Vaca','🐄',['97','98','99','00']]
].map(([id,name,emoji,tens])=>({id,name,emoji,tens}));

const $=selector=>document.querySelector(selector);
let selected=new Set();
let current=[];
let generationMode='normal';

function rand(max){
  if(window.crypto?.getRandomValues){
    const values=new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0]%max;
  }
  return Math.floor(Math.random()*max);
}

function milharForTen(ten){return String(rand(100)).padStart(2,'0')+ten;}

function renderGroups(){
  const grid=$('#groupsGrid');
  grid.innerHTML=GROUPS.map(group=>`
    <button type="button" aria-pressed="${selected.has(group.id)}" class="group-btn ${selected.has(group.id)?'selected':''}" data-id="${group.id}" ${!selected.has(group.id)&&selected.size>=5?'disabled':''}>
      <span class="group-num">${String(group.id).padStart(2,'0')}</span>
      <span class="group-emoji">${group.emoji}</span>
      <span class="group-name">${group.name}</span>
    </button>`).join('');

  grid.querySelectorAll('.group-btn').forEach(button=>{
    button.addEventListener('click',()=>{
      const id=Number(button.dataset.id);
      selected.has(id)?selected.delete(id):selected.add(id);
      updateUI();
    });
  });
}

function updateUI(){
  renderGroups();
  $('#selectionCounter').textContent=`${selected.size}/5`;
  $('#totalThousands').textContent=selected.size?`${$('#generatorQty').value} milhares`:'Selecione seus bichos';
  $('#generateSelected').disabled=!selected.size;
}

function buildSelected(){
  const values=generateNumbers([...selected],generationMode,Number($('#generatorQty').value),rand);
  return [...selected].sort((a,b)=>a-b).map(id=>({...GROUPS[id-1],numbers:values.filter(value=>GROUPS[id-1].tens.includes(value.slice(-2)))})).filter(group=>group.numbers.length);
}

function showResults(title,data){
  current=data;
  $('#resultsSection').hidden=false;
  $('#resultTitle').textContent=title;
  const promoter=$('#promoter').value.trim();
  $('#resultMeta').textContent=`${data.reduce((total,group)=>total+group.numbers.length,0)} milhares${promoter?` · Promotora: ${promoter}`:''}`;

  const isClosed=data.some(group=>group.closed);
  const isDry=data.some(group=>group.dry);
  const isCardLayout=isClosed||isDry;

  $('#resultsGrid').className=isCardLayout
    ?`results-grid closed-results${isDry?' dry-results':''}`
    :'results-grid';

  $('#resultsGrid').innerHTML=data.map(group=>isCardLayout?`
    <article class="result-card closed-card ${group.dry?'dry-card':''}" data-group="${group.id}">
      <div class="closed-head">
        <span class="animal-emoji closed-emoji">${group.emoji}</span>
        <div class="closed-name">
          <small>${String(group.id).padStart(2,'0')}</small>
          <strong>${group.name.toUpperCase()}</strong>
        </div>
        <div class="closed-tens">${group.tens.join('·')}</div>
      </div>
      <div class="numbers closed-numbers ${group.dry?'dry-numbers':''}">
        ${group.numbers.map(number=>`<button type="button" class="number-chip closed-chip" data-number="${number}">${number}</button>`).join('')}
      </div>
      <div class="closed-actions">
        <button type="button" class="closed-copy">📋 Copiar</button>
        <button type="button" class="closed-share">📸 Compartilhar</button>
      </div>
    </article>`:`
    <article class="result-card">
      <div class="result-top">
        <div class="animal"><span class="animal-emoji">${group.emoji}</span><span>${group.name}</span></div>
        <span class="badge">GRUPO ${String(group.id).padStart(2,'0')}</span>
      </div>
      <div class="numbers">${group.numbers.map(number=>`<span class="number-chip">${number}</span>`).join('')}</div>
    </article>`).join('');

  if(isCardLayout){
    document.querySelectorAll('.closed-chip').forEach(button=>{
      button.addEventListener('click',()=>copyTextValue(button.dataset.number));
    });
    document.querySelectorAll('.closed-card').forEach(card=>{
      const group=data.find(item=>item.id===Number(card.dataset.group));
      const formatGroup=group.dry?formatDryGroup:formatClosedGroup;
      card.querySelector('.closed-copy').addEventListener('click',()=>copyTextValue(formatGroup(group)));
      card.querySelector('.closed-share').addEventListener('click',async()=>{
        const text=formatGroup(group);
        const shareTitle=group.dry?`${group.name} - Tiro Seco`:`${group.name} - Bicho Fechado`;
        if(navigator.share){
          try{await navigator.share({title:shareTitle,text});}catch{}
        }else{
          openExternal(`https://wa.me/?text=${encodeURIComponent(text)}`);
        }
      });
    });
  }

  saveHistory(title,data);
  $('#resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
}

function formatDryGroup(group){
  const promoter=$('#promoter').value.trim()||'Rebeca';
  return `Palpites de ${promoter}\nTIRO SECO\n${String(group.id).padStart(2,'0')} - ${group.emoji} ${group.name.toUpperCase()}\nDezenas: ${group.tens.join(' · ')}\n\n${group.numbers.join(' · ')}`;
}

function formatClosedGroup(group){
  const promoter=$('#promoter').value.trim()||'Rebeca';
  const rows=[];
  for(let i=0;i<group.numbers.length;i+=4) rows.push(group.numbers.slice(i,i+4).join('  '));
  return `Palpites de ${promoter}\n${String(group.id).padStart(2,'0')} - ${group.emoji} ${group.name.toUpperCase()}\nDezenas: ${group.tens.join(' · ')}\n\n${rows.join('\n')}`;
}

async function copyTextValue(text){
  try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast('Copiado');}
    else if(copyFallback(text)){toast('Copiado');}
    else{toast('Não foi possível copiar');}
  }catch{copyFallback(text)?toast('Copiado'):toast('Não foi possível copiar');}
}

function formatText(){
  const promoter=$('#promoter').value.trim();
  const lines=[promoter?`Palpites de ${promoter}`:'Palpites',''];

  current.forEach(group=>{
    group.numbers.forEach(number=>{
      lines.push(`${number} - ${group.emoji} ${group.name}`);
    });
  });

  return lines.join('\n');
}

function toast(message){
  const element=$('#toast');
  element.textContent=message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>element.classList.remove('show'),2100);
}

function getHistory(){
  try{
    const items=JSON.parse(localStorage.getItem('milharHistory')||'[]');
    return Array.isArray(items)?items.filter(item=>item&&typeof item.title==='string'&&item.title.length<=100&&Number.isInteger(item.count)&&item.count>=0&&Number.isFinite(Date.parse(item.time))).slice(0,8):[];
  }
  catch{return [];}
}
function saveHistory(title,data){
  const history=getHistory();
  history.unshift({title,time:new Date().toISOString(),count:data.reduce((total,group)=>total+group.numbers.length,0)});
  try{localStorage.setItem('milharHistory',JSON.stringify(history.slice(0,8)));}catch{}
  renderHistory();
}
function renderHistory(){
  const history=getHistory();
  const list=$('#historyList');
  list.replaceChildren();
  if(!history.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Nenhum resultado salvo neste aparelho.';list.append(empty);}
  history.forEach(item=>{
    const row=document.createElement('div'),title=document.createElement('span'),time=document.createElement('span');
    row.className='history-item';title.className='history-title';time.className='history-time';
    title.textContent=`${item.title} · ${item.count} milhares`;
    time.textContent=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(item.time));
    row.append(title,time);list.append(row);
  });
}

function copyFallback(text){
  const area=document.createElement('textarea');
  area.value=text;
  area.setAttribute('readonly','');
  area.style.position='fixed';
  area.style.opacity='0';
  document.body.appendChild(area);
  area.select();
  let copied=false;
  try{copied=document.execCommand('copy');}catch{}
  document.body.removeChild(area);
  return copied;
}

function openExternal(url){
  const popup=window.open(url,'_blank','noopener,noreferrer');
  if(!popup){window.location.assign(url);}
}

const modeNames={normal:'Normal',dry:'Tiro seco',closed:'Bicho fechado'};
$('#generateSelected').addEventListener('click',()=>{try{showResults(modeNames[generationMode],buildSelected());}catch(e){toast(e.message);}});
document.querySelectorAll('[data-generator-mode]').forEach(button=>button.addEventListener('click',()=>{
 generationMode=button.dataset.generatorMode;
 document.querySelectorAll('[data-generator-mode]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
 $('#modeHint').textContent=generationMode==='dry'?'Uma dezena é sorteada por bicho selecionado para formar as milhares.':'Usa as quatro dezenas de cada bicho selecionado, sem repetir milhares.';
}));
$('#generatorQty').addEventListener('input',()=>{const quantity=Number($('#generatorQty').value);if(Number.isInteger(quantity)&&quantity>=1&&quantity<=100)updateUI();});
window.addEventListener('rebeca:generation',event=>{
 const {title,count}=event.detail||{};
 if(typeof title==='string'&&title.length<=80&&Number.isInteger(count)&&count>0&&count<=100)saveHistory(title,[{numbers:Array(count).fill('')}]);
});

$('#copyBtn').addEventListener('click',async()=>{
  const text=formatText();
  try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast('Resultados copiados');}
    else if(copyFallback(text)){toast('Resultados copiados');}
    else{toast('Não foi possível copiar');}
  }catch{copyFallback(text)?toast('Resultados copiados'):toast('Não foi possível copiar');}
});

$('#whatsappBtn').addEventListener('click',()=>{
  const text=encodeURIComponent(formatText());
  openExternal(`https://wa.me/5511974251066?text=${text}`);
});

$('#groupTipsBtn')?.addEventListener('click',event=>{
  event.preventDefault();
  openExternal('https://chat.whatsapp.com/EKCNVtICX00EgFwthqCWTk');
});

$('#sorte777Btn')?.addEventListener('click',event=>{
  event.preventDefault();
  openExternal('https://app.sortesete77.com?p=EgOCGZN5');
});

$('#clearHistory').addEventListener('click',()=>{
  try{localStorage.removeItem('milharHistory');}catch{}
  renderHistory();
  toast('Histórico limpo');
});

$('#year').textContent=new Date().getFullYear();
updateUI();
renderHistory();

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
}
