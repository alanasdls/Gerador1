// Read-only analysis of historical counters and results already available in the API.
export const BANKS=Object.freeze({'look-goias':'look-goias',rio:'rio-federal',bahia:'bahia','sao-paulo':'sao-paulo',nacional:'nacional',lotep:'lotep',federal:'federal-caixa'});
export const dateSP=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const groups=line=>Array.from({length:5},(_,i)=>(line-1)*5+i+1);
export function rankLines(states){
 if(!Array.isArray(states)||states.length!==25||new Set(states.map(s=>Number(s.grupo))).size!==25||states.some(s=>!Number.isInteger(Number(s.grupo))||s.grupo<1||s.grupo>25||!s.ultima_aparicao_data||!Number.isSafeInteger(Number(s.extracoes_sem_sair))||s.extracoes_sem_sair<0))throw Error('HISTORICO_DA_LINHA_INDISPONIVEL');
 const map=new Map(states.map(s=>[Number(s.grupo),s]));
 return Array.from({length:5},(_,i)=>{
  const linha=i+1,grupos=groups(linha),bichos=grupos.map(grupo=>({grupo,extracoes_sem_sair:Number(map.get(grupo).extracoes_sem_sair)}));
  return {linha,grupos,bichos,atraso_extracoes:Math.min(...bichos.map(b=>b.extracoes_sem_sair))};
 }).sort((a,b)=>b.atraso_extracoes-a.atraso_extracoes||a.linha-b.linha);
}
export const drawKey=draw=>`${draw.data||draw.data_resultado}|${draw.horario}`;
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'');
const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);

export async function readHistory(read,lottery){
 const query={select:'id,data_resultado,horario,processado_em',loteria_codigo:'eq.'+lottery,order:'processado_em.desc',limit:'1'};
 // The collector writes its completion marker after all 25 counters. Read on
 // both sides of the counters to avoid a partially applied historical draw.
 for(let attempt=0;attempt<3;attempt++){
  const before=(await read('delayed_processed_draws',query))[0];
  const states=await read('delayed_animal_state',{select:'grupo,extracoes_sem_sair,ultima_aparicao_data,ultima_aparicao_horario,atualizado_em',loteria_codigo:'eq.'+lottery,limit:'25'});
  rankLines(states);
  const after=(await read('delayed_processed_draws',query))[0];
  if(before&&after&&before.id===after.id&&validDate(after.data_resultado)&&validTime(after.horario)&&Number.isFinite(Date.parse(after.processado_em))&&states.every(s=>Number.isFinite(Date.parse(s.atualizado_em))&&Date.parse(s.atualizado_em)<=Date.parse(after.processado_em)&&validTime(s.ultima_aparicao_horario)&&`${s.ultima_aparicao_data}|${s.ultima_aparicao_horario}`<=drawKey(after)))return {states,marker:after};
 }
 throw Error('HISTORICO_EM_ATUALIZACAO');
}

export function projectResults(states,marker,draws){
 rankLines(states);
 const ordered=[...new Map(draws.map(d=>[drawKey(d),d])).values()].sort((a,b)=>drawKey(a).localeCompare(drawKey(b)));
 const latest=ordered.at(-1);
 if(!latest||drawKey(latest)<drawKey(marker))throw Error('RESULTADO_ANTERIOR_AO_HISTORICO');
 const saved=ordered.find(d=>drawKey(d)===drawKey(marker));
 // A corrected first prize at the history boundary requires a refreshed
 // baseline. Never count the draw twice or combine conflicting counters.
 if(saved&&Number(states.find(s=>Number(s.grupo)===saved.grupo)?.extracoes_sem_sair)!==0)throw Error('HISTORICO_EM_ATUALIZACAO');
 let current=states.map(s=>({...s,extracoes_sem_sair:Number(s.extracoes_sem_sair)}));
 for(const draw of ordered.filter(d=>drawKey(d)>drawKey(marker))){
  current=current.map(s=>Number(s.grupo)===draw.grupo?{...s,extracoes_sem_sair:0,ultima_aparicao_data:draw.data,ultima_aparicao_horario:draw.horario}:{...s,extracoes_sem_sair:s.extracoes_sem_sair+1});
 }
 return rankLines(current);
}

export function nextDraw(draw,times){
 const schedule=[...new Set(times.filter(validTime))].sort();
 if(!schedule.length)return null;
 const next=schedule.find(time=>time>draw.horario),horario=next||schedule[0];
 return {data:next?draw.data:addDays(draw.data,1),horario};
}

export async function analysis(bank,read,source,now=new Date()){
 if(!Object.hasOwn(BANKS,bank))throw Error('LOTERIA_VIP_INVALIDA');
 const date=dateSP(now),lottery=BANKS[bank];
 const [history,today]=await Promise.allSettled([readHistory(read,lottery),source(lottery,date)]);
 if(today.status!=='fulfilled')throw Error('RESULTADOS_API_INDISPONIVEIS');
 let draws=today.value,ranking=[],warning=[];
 const baseline=history.status==='fulfilled'?history.value:null;
 if(baseline){
  const age=(Date.parse(date+'T12:00:00Z')-Date.parse(baseline.marker.data_resultado+'T12:00:00Z'))/86400000;
  if(age<0||age>7)warning.push('HISTORICO_DA_LINHA_INDISPONIVEL');
  else{
   const previous=await Promise.all(Array.from({length:age},(_,i)=>source(lottery,addDays(baseline.marker.data_resultado,i))));
   draws=[...previous.flat(),...draws];
   try{ranking=projectResults(baseline.states,baseline.marker,draws);}catch{warning.push('HISTORICO_EM_ATUALIZACAO');}
  }
 }else warning.push('HISTORICO_DA_LINHA_INDISPONIVEL');
 if(!draws.length){
  const previous=await Promise.all(Array.from({length:4},(_,i)=>source(lottery,addDays(date,-i-1))));
  draws=previous.flat();
 }
 const unique=[...new Map(draws.map(d=>[drawKey(d),d])).values()].sort((a,b)=>drawKey(a).localeCompare(drawKey(b)));
 const latest=unique.at(-1)||null;
 if(!latest)warning.push('SEM_RESULTADO_RECENTE_VIP');
 if(latest&&latest.data!==date)warning.push('SEM_EXTRACAO_DE_HOJE');
 const times=latest?await read('result_lottery_times',{select:'horario',loteria_codigo:'eq.'+lottery,ativo:'eq.true',order:'horario.asc',limit:'30'}):[];
 return {ok:true,modo:'resultados_api',data_referencia:date,consultado_em:now.toISOString(),ranking_linhas:ranking,
  historico_atualizado_em:baseline?.marker.processado_em||null,
  analise_atual:latest&&ranking.length?{resultado_base:latest,proxima_extracao:nextDraw(latest,times.map(t=>t.horario)),linha_mais_atrasada:ranking[0]}:null,
  ultima_extracao:latest,extracoes_disponiveis:unique.filter(d=>d.data===latest?.data),avisos:[...new Set(warning)]};
}
