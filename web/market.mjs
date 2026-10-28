import {ANIMALS,EMOJI,BANKS,daySP,sums,animal} from './public/methods-data.mjs';
import {capitalAnalysis,capitalResults} from './bridge/capital.mjs';
import {federalAnalysis,federalResults} from './bridge/federal.mjs';
export function bankFor(key){if(!Object.hasOwn(BANKS,key))throw Object.assign(Error('Escolha uma loteria válida.'),{status:400});return BANKS[key];}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function normalizeResults(payload,key,date,now=new Date()){
 bankFor(key);const today=daySP(now),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(now);
 const draws=(Array.isArray(payload?.extracoes)?payload.extracoes:[]).filter(row=>{
  const federal=row.codigo==='FED'||/federal/i.test(String(row.nome));
  return key==='federal'?federal:key==='rio'?!federal:true;
 }).flatMap(row=>{
  const day=String(row.data_resultado||payload.data_resultado||'').slice(0,10),time=String(row.horario||'');
  const verifiedContest=key==='federal'&&Number.isSafeInteger(row.concurso)&&row.concurso>0;
  if(!validDate(day)||(date&&day!==date)||day>today||(!verifiedContest&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))||(day===today&&time>clock))return [];
  const prizes=(Array.isArray(row.premios)?row.premios:[]).flatMap(prize=>{
   const position=Number(prize.posicao),number=String(prize.milhar??'');
   if(!Number.isInteger(position)||position<1||position>(key==='federal'?5:7)||!(position===7?/^\d{3}$/ : /^\d{4,5}$/).test(number))return [];
   return [{posicao:position,milhar:number,...animal(number)}];
  }).sort((a,b)=>a.posicao-b.posicao);
  if(!prizes.some(p=>p.posicao===1))return [];
  return [{codigo:String(row.codigo||time),data:day,horario:time,...(verifiedContest?{concurso:row.concurso}:{}),premios:prizes}];
 }).sort((a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario));
 return {ok:true,nome:BANKS[key].name,data:date||draws.at(-1)?.data||today,consultado_em:now.toISOString(),extracoes:draws};
}
export async function results(key,date,fetcher=fetch,env={}){
 const config=bankFor(key);if(date&&!validDate(date))throw Object.assign(Error('Informe uma data válida.'),{status:400});
 if(key==='capital-v3')return normalizeResults(await capitalResults(date||daySP()),key,date);
 if(key==='federal')return normalizeResults(await federalResults(env.FEDERAL_HISTORY,date),key,date);
 const url=new URL('https://apidelamak.alanasdls.workers.dev/resultados');url.searchParams.set('banca',config.api);if(date)url.searchParams.set('data',date);
 const r=await fetcher(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(10000),cf:{cacheTtl:30}});
 if(!r.ok)throw Error('Os resultados estão indisponíveis. Tente atualizar em instantes.');
 return normalizeResults(await r.json(),key,date);
}
export function parseDelays(html){
 const text=String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&ordm;|&#186;/g,'º').replace(/&nbsp;|&#160;/g,' ').replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&atilde;/g,'ã').replace(/&Aacute;/g,'Á').replace(/&amp;/g,'&').replace(/\s+/g,' ');
 const names=ANIMALS.map(n=>n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()),out=new Map();
 for(const match of text.matchAll(/(\d{1,2})º\s+([A-Za-zÀ-ÿ]+)\s+saiu\s+(?:(?:a\s+(\d+)\s+dias?)|(ontem)|(hoje))\s+no\s+milhar/gi)){
  const index=names.indexOf(match[2].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());if(index<0)continue;
  out.set(index+1,{grupo:index+1,animal:ANIMALS[index],emoji:EMOJI[index],dias:match[3]?Number(match[3]):match[4]?1:0});
 }
 if(out.size!==25)throw Error('A fonte de atrasados está incompleta. Tente novamente em instantes.');
 return [...out.values()].sort((a,b)=>b.dias-a.dias||a.grupo-b.grupo);
}
export async function delays(key,fetcher=fetch){
 const config=bankFor(key);if(!config.delay)throw Object.assign(Error('Esta loteria está disponível em Linhas e somas e Resultados.'),{status:400});
 const url=`https://bichocerto.com/atrasados/${config.delay}/`;
 const r=await fetcher(url,{headers:{accept:'text/html','user-agent':'Mozilla/5.0 Rebeca-Palpites'},signal:AbortSignal.timeout(10000),cf:{cacheTtl:120}});
 if(!r.ok)throw Error('Não foi possível consultar os atrasados. Tente novamente.');
 return {ok:true,nome:config.name,fonte:'Bicho Certo',fonte_url:url,consultado_em:new Date().toISOString(),itens:parseDelays(await r.text())};
}
export async function lineHistory(key,env,fetcher=fetch){
 bankFor(key);if(!env.REBECA_ANALYSIS_KEY)throw Error('HISTORY_CONFIG_MISSING');
 const r=await fetcher('https://vip-api.delamarkpalpites.com/rebeca/historico',{method:'POST',headers:{'content-type':'application/json','x-gateway-key':env.REBECA_ANALYSIS_KEY},body:JSON.stringify({banca:key}),redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('HISTORY_HTTP_'+r.status);
 const data=await r.json();if(!data.ok||data.modo!=='resultados_api'||data.data_referencia!==daySP()||!Array.isArray(data.ranking_linhas)||![0,5].includes(data.ranking_linhas.length)||!Array.isArray(data.extracoes_disponiveis)||!Array.isArray(data.avisos))throw Error('HISTORY_INVALID_RESPONSE');
 return data;
}
export async function analysis(key,env,fetcher=fetch){
 bankFor(key);
 const current=key==='capital-v3'?await capitalAnalysis():key==='federal'?await federalAnalysis(env.FEDERAL_HISTORY):await lineHistory(key,env,fetcher);
 const draws=current.extracoes_disponiveis.map(draw=>({data:draw.data,horario:draw.horario,codigo:draw.codigo,...(draw.concurso?{concurso:draw.concurso}:{}),premios:[{posicao:1,milhar:draw.milhar_1_premio,...animal(draw.milhar_1_premio)}]}));
 const last=draws.at(-1)||null;
 const number=last?.premios.find(p=>p.posicao===1)?.milhar.slice(-4);
 return {ok:true,modo:current.modo,nome:BANKS[key].name,data_referencia:current.data_referencia,consultado_em:current.consultado_em,
  ranking_linhas:current.ranking_linhas,analise_atual:current.analise_atual,
  historico_atualizado_em:current.historico_atualizado_em,avisos:current.avisos,
  aviso_linhas:current.ranking_linhas.length?null:'O histórico está sendo conferido. Tente atualizar em instantes.',
  extracoes:draws,
  ultima_extracao:last,soma:number?sums(number,Number(current.data_referencia.slice(0,4))):[],
  aviso_soma:last?null:'Nenhum resultado recente disponível para calcular a soma.'};
}
