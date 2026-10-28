import {rankLines,dateSP} from './core.mjs';
export const FEDERAL_HISTORY_KEY='federal:history:v1';
const SOURCE='https://servicebus2.caixa.gov.br/portaldeloterias/api/federal';
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
function isoDate(value){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value||'');const date=m?`${m[3]}-${m[2]}-${m[1]}`:null;return validDate(date)?date:null;}
export function normalizeFederal(payload,expected=null,now=new Date()){
 const date=isoDate(payload?.dataApuracao),number=payload?.numero,previous=payload?.numeroConcursoAnterior,next=payload?.numeroConcursoProximo;
 if(payload?.tipoJogo!=='LOTERIA_FEDERAL'||!Number.isSafeInteger(number)||number<1||(expected!==null&&number!==expected)||!Number.isSafeInteger(previous)||previous<0||previous>=number||!date||date>dateSP(now)||!Array.isArray(payload.listaDezenas)||payload.listaDezenas.length!==5||payload.listaDezenas.some(n=>!/^\d{5,6}$/.test(String(n))))throw Error('FEDERAL_CONCURSO_INVALIDO');
 const prizes=payload.listaDezenas.map((n,i)=>({posicao:i+1,milhar:String(n).slice(-4),bilhete:String(n)}));
 const first=prizes[0].milhar;
 return {data:date,horario:'',codigo:'FED-'+number,concurso:number,anterior:previous,milhar_1_premio:first,grupo:Math.ceil((Number(first.slice(-2))||100)/4),premios:prizes,
  proximo:Number.isSafeInteger(next)&&next>number?{concurso:next,data:isoDate(payload.dataProximoConcurso),horario:null}:null};
}
export async function fetchFederal(number=null,fetcher=fetch){
 if(number!==null&&(!Number.isSafeInteger(number)||number<1))throw Error('FEDERAL_CONCURSO_INVALIDO');
 const response=await fetcher(SOURCE+(number===null?'':'/'+number),{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{accept:'application/json','cache-control':'no-cache'}});
 if(!response.ok)throw Error('FEDERAL_FONTE_INDISPONIVEL');
 return response.json();
}
// Persist official contest records, never accumulated counters. A correction
// is recalculated from the ordered sequence and cannot increment delays twice.
export async function loadFederal(store,now=new Date(),source=fetchFederal){
 if(!store?.get||!store?.put)throw Error('FEDERAL_HISTORICO_NAO_CONFIGURADO');
 const [payload,snapshot]=await Promise.all([source(null),store.get(FEDERAL_HISTORY_KEY,'json')]);
 const latest=normalizeFederal(payload,null,now),records=new Map();
 if(snapshot?.version!==1||!Array.isArray(snapshot.contests))throw Error('FEDERAL_HISTORICO_INVALIDO');
 for(const raw of snapshot.contests){const d=normalizeFederal(raw,null,now);if(records.has(d.concurso))throw Error('FEDERAL_HISTORICO_DUPLICADO');records.set(d.concurso,{raw,draw:d});}
 if([...records.keys()].some(n=>n>latest.concurso))throw Error('FEDERAL_FONTE_DESATUALIZADA');
 const before=records.get(latest.concurso)?.draw;
 let changed=!before||JSON.stringify(before)!==JSON.stringify(latest);
 records.set(latest.concurso,{raw:payload,draw:latest});
 const seen=new Map(),ordered=[],warnings=[];let next=latest.concurso,fetches=0;
 try{
  while(next&&seen.size<25){
   let item=records.get(next);
   if(!item){
    if(fetches++>=8)throw Error('FEDERAL_HISTORICO_EM_ATUALIZACAO');
    const raw=await source(next),draw=normalizeFederal(raw,next,now);item={raw,draw};records.set(next,item);changed=true;
   }
   const draw=item.draw;
   if(ordered.length&&draw.data>ordered.at(-1).data)throw Error('FEDERAL_ORDEM_INVALIDA');
   if(!seen.has(draw.grupo))seen.set(draw.grupo,{grupo:draw.grupo,extracoes_sem_sair:ordered.length,ultima_aparicao_data:draw.data,ultima_aparicao_horario:''});
   ordered.push(draw);next=draw.anterior;
  }
  if(seen.size!==25)throw Error('FEDERAL_HISTORICO_INCOMPLETO');
 }catch{warnings.push('HISTORICO_DA_LINHA_INDISPONIVEL');}
 if(changed){
  const contests=[...records.values()].sort((a,b)=>b.draw.concurso-a.draw.concurso).slice(0,256).map(r=>({tipoJogo:r.raw.tipoJogo,numero:r.raw.numero,numeroConcursoAnterior:r.raw.numeroConcursoAnterior,numeroConcursoProximo:r.raw.numeroConcursoProximo,dataApuracao:r.raw.dataApuracao,dataProximoConcurso:r.raw.dataProximoConcurso,listaDezenas:r.raw.listaDezenas}));
  try{await store.put(FEDERAL_HISTORY_KEY,JSON.stringify({version:1,checkedAt:now.toISOString(),contests}));}catch{warnings.push('HISTORICO_CACHE_NAO_ATUALIZADO');}
 }
 const ranking=seen.size===25&&!warnings.includes('HISTORICO_DA_LINHA_INDISPONIVEL')?rankLines([...seen.values()]):[];
 return {latest,records:[...records.values()].map(r=>r.draw).sort((a,b)=>a.concurso-b.concurso),ranking,warnings};
}
export async function federalAnalysis(store,now=new Date(),source=fetchFederal){
 const data=await loadFederal(store,now,source),date=dateSP(now),latest=data.latest;
 return {ok:true,modo:'resultados_api',fonte:'CAIXA',data_referencia:date,consultado_em:now.toISOString(),historico_atualizado_em:now.toISOString(),ranking_linhas:data.ranking,
  analise_atual:data.ranking.length?{resultado_base:latest,proxima_extracao:latest.proximo,linha_mais_atrasada:data.ranking[0]}:null,
  ultima_extracao:latest,extracoes_disponiveis:data.records.filter(d=>d.data===latest.data),avisos:[...data.warnings,...(latest.data!==date?['SEM_EXTRACAO_DE_HOJE']:[])]};
}
export async function federalResults(store,date='',now=new Date(),source=fetchFederal){
 if(date&&!validDate(date))throw Object.assign(Error('DATA_INVALIDA'),{status:400});
 const data=await loadFederal(store,now,source),day=date||data.latest.data;
 return {sucesso:true,nome:'Federal',loteria_canonica:'FEDERAL_CAIXA',data_resultado:day,atualizado_em:now.toISOString(),extracoes:data.records.filter(d=>d.data===day).map(d=>({codigo:d.codigo,nome:'Federal · Concurso '+d.concurso,concurso:d.concurso,data_resultado:d.data,horario:'',premios:d.premios}))};
}
