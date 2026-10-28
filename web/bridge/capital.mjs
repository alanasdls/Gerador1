import {rankLines,dateSP} from './core.mjs';
import {normalizeResults,TIMES} from './source.mjs';

const SOURCE='https://api-sorte777v3.alanasdls.workers.dev/fontes/trivo/capital';
const DAY_MS=86400000;
const offset=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*DAY_MS).toISOString().slice(0,10);
export function capitalTimes(date){
 const sunday=new Date(date+'T12:00:00Z').getUTCDay()===0;
 return ['10:00','11:00','13:00','14:00','16:00','18:00','20:00','22:00'].filter(t=>!sunday||t!=='11:00');
}
export function capitalNext(draw){
 const next=capitalTimes(draw.data).find(t=>t>draw.horario);
 const date=next?draw.data:offset(draw.data,1);
 return {data:date,horario:next||capitalTimes(date)[0]};
}
export function normalizeCapital(payload,date,now=new Date()){
 if(payload?.loteria_canonica!=='CAPITAL')throw Error('CAPITAL_IDENTIDADE_INVALIDA');
 const draws=normalizeResults(payload,'capital-v3',date,now);
 const schedule=capitalTimes(date);
 if(draws.some(d=>!schedule.includes(d.horario)))throw Error('CAPITAL_GRADE_INVALIDA');
 return draws.map(draw=>{
  const original=payload.extracoes.find(d=>d.data_resultado===date&&TIMES['capital-v3'][d.loteria_id]===draw.horario);
  const prizes=(original.premios||[]).filter(p=>Number.isInteger(Number(p.posicao))&&p.posicao>=1&&p.posicao<=7&&/^\d{3,5}$/.test(String(p.milhar))).map(p=>({posicao:Number(p.posicao),milhar:String(p.milhar).slice(Number(p.posicao)===7?-3:-4)}));
  return {...draw,premios:prizes};
 });
}
export async function fetchCapitalDay(date,now=new Date(),fetcher=fetch){
 const r=await fetcher(SOURCE+'?data='+date,{redirect:'manual',signal:AbortSignal.timeout(6500),headers:{accept:'application/json','cache-control':'no-cache'}});
 if(!r.ok)throw Error('RESULTADOS_API_INDISPONIVEIS');
 return normalizeCapital(await r.json(),date,now);
}
function validHistory(draws,date,complete){
 if(!Array.isArray(draws))return false;
 const schedule=capitalTimes(date),expected=complete?schedule:schedule.filter(t=>t<=(draws.at(-1)?.horario||''));
 return draws.length===expected.length&&draws.every((d,i)=>d.data===date&&d.horario===expected[i]&&/^\d{4}$/.test(d.milhar_1_premio)&&d.grupo===Math.ceil((Number(d.milhar_1_premio.slice(-2))||100)/4));
}
// Capital V3 has its own history. Never read the shared "capital" counters:
// those belong to LT Capital (:40), a different sequence of results.
export function createCapitalAnalysis(source=fetchCapitalDay,{edgeCache=()=>globalThis.caches?.default,maxDays=45}={}){
 const memory=new Map(),pending=new Map();
 async function past(date,now){
  const saved=memory.get(date);
  if(saved&&now.getTime()-saved.at<DAY_MS)return saved.draws;
  if(pending.has(date))return pending.get(date);
  const task=(async()=>{
   const key=new Request(SOURCE+'?data='+date+'&history_cache=capital-v3-v1');
   let cache;try{cache=edgeCache();}catch{}
   let draws;
   try{const hit=await cache?.match(key);if(hit){const data=await hit.json();if(data.version===1&&data.date===date&&validHistory(data.draws,date,true))draws=data.draws;}}catch{}
   if(!draws){
    draws=await source(date,now);
    if(!validHistory(draws,date,true))throw Error('CAPITAL_HISTORICO_INCOMPLETO');
    try{await cache?.put(key,Response.json({version:1,date,draws},{headers:{'Cache-Control':'public, max-age=86400'}}));}catch{}
   }
   memory.set(date,{at:now.getTime(),draws});
   while(memory.size>60)memory.delete(memory.keys().next().value);
   return draws;
  })().finally(()=>pending.delete(date));
  pending.set(date,task);return task;
 }
 return async(now=new Date())=>{
  const date=dateSP(now),today=await source(date,now),warnings=[];
  let recent=[...today].reverse(),ranking=[];
  try{
   if(!validHistory(today,date,false))throw Error('CAPITAL_HISTORICO_INCOMPLETO');
   const seen=new Map();
   const scan=()=>{for(let i=0;i<recent.length;i++){const d=recent[i];if(!seen.has(d.grupo))seen.set(d.grupo,{grupo:d.grupo,extracoes_sem_sair:i,ultima_aparicao_data:d.data,ultima_aparicao_horario:d.horario});}};
   scan();
   for(let age=1;seen.size<25&&age<=maxDays;age+=3){
    const days=Array.from({length:Math.min(3,maxDays-age+1)},(_,i)=>offset(date,-age-i));
    const batch=await Promise.allSettled(days.map(day=>past(day,now)));
    for(const result of batch){
     if(result.status!=='fulfilled')throw Error('CAPITAL_HISTORICO_INCOMPLETO');
     recent.push(...[...result.value].reverse());scan();if(seen.size===25)break;
    }
   }
   ranking=rankLines([...seen.values()]);
  }catch{warnings.push('HISTORICO_DA_LINHA_INDISPONIVEL');}
  const latest=recent[0]||null;
  if(!latest)warnings.push('SEM_RESULTADO_RECENTE_VIP');
  else if(latest.data!==date)warnings.push('SEM_EXTRACAO_DE_HOJE');
  return {ok:true,modo:'resultados_api',data_referencia:date,consultado_em:now.toISOString(),historico_atualizado_em:now.toISOString(),ranking_linhas:ranking,
   analise_atual:latest&&ranking.length?{resultado_base:latest,proxima_extracao:capitalNext(latest),linha_mais_atrasada:ranking[0]}:null,
   ultima_extracao:latest,extracoes_disponiveis:recent.filter(d=>d.data===latest?.data).reverse(),avisos:warnings};
 };
}
export const capitalAnalysis=createCapitalAnalysis();
export async function capitalResults(date=dateSP(new Date())){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Object.assign(Error('DATA_INVALIDA'),{status:400});
 const now=new Date(),draws=await fetchCapitalDay(date,now);
 return {sucesso:true,loteria_canonica:'CAPITAL',nome:'Capital',data_resultado:date,atualizado_em:now.toISOString(),extracoes:draws.map(d=>({codigo:d.codigo,nome:'Capital '+d.horario,data_resultado:d.data,horario:d.horario,premios:d.premios}))};
}
