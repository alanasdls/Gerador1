import {ANIMALS,EMOJI,BANKS,daySP,sums,animal} from './public/methods-data.mjs';
export function bankFor(key){if(!Object.hasOwn(BANKS,key))throw Object.assign(Error('Escolha uma loteria válida.'),{status:400});return BANKS[key];}
export function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
export function normalizeResults(payload,key,date,now=new Date()){
 bankFor(key);const today=daySP(now),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(now);
 const draws=(Array.isArray(payload?.extracoes)?payload.extracoes:[]).filter(row=>{
  const federal=row.codigo==='FED'||/federal/i.test(String(row.nome));
  return key==='federal'?federal:key==='rio'?!federal:true;
 }).flatMap(row=>{
  const day=String(row.data_resultado||payload.data_resultado||'').slice(0,10),time=String(row.horario||'');
  if(!validDate(day)||(date&&day!==date)||day>today||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||(day===today&&time>clock))return [];
  const prizes=(Array.isArray(row.premios)?row.premios:[]).flatMap(prize=>{
   const position=Number(prize.posicao),number=String(prize.milhar??'');
   if(!Number.isInteger(position)||position<1||position>(key==='federal'?5:7)||!(position===7?/^\d{3}$/ : /^\d{4,5}$/).test(number))return [];
   return [{posicao:position,milhar:number,...animal(number)}];
  }).sort((a,b)=>a.posicao-b.posicao);
  if(!prizes.some(p=>p.posicao===1))return [];
  return [{codigo:String(row.codigo||time),data:day,horario:time,premios:prizes}];
 }).sort((a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario));
 return {ok:true,nome:BANKS[key].name,data:date||draws.at(-1)?.data||today,consultado_em:now.toISOString(),extracoes:draws};
}
export async function results(key,date,fetcher=fetch){
 const config=bankFor(key);if(date&&!validDate(date))throw Object.assign(Error('Informe uma data válida.'),{status:400});
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
 const config=bankFor(key),url=`https://bichocerto.com/atrasados/${config.delay}/`;
 const r=await fetcher(url,{headers:{accept:'text/html','user-agent':'Mozilla/5.0 Rebeca-Palpites'},signal:AbortSignal.timeout(10000),cf:{cacheTtl:120}});
 if(!r.ok)throw Error('Não foi possível consultar os atrasados. Tente novamente.');
 return {ok:true,nome:config.name,fonte:'Bicho Certo',fonte_url:url,consultado_em:new Date().toISOString(),itens:parseDelays(await r.text())};
}
export async function lineHistory(key,env,fetcher=fetch){
 bankFor(key);if(!env.REBECA_ANALYSIS_KEY)throw Error('HISTORY_CONFIG_MISSING');
 const r=await fetcher('https://vip-api.delamarkpalpites.com/rebeca/historico',{method:'POST',headers:{'content-type':'application/json','x-gateway-key':env.REBECA_ANALYSIS_KEY},body:JSON.stringify({banca:key}),redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('HISTORY_HTTP_'+r.status);
 const data=await r.json();if(!data.ok||data.data_referencia!==daySP()||!Array.isArray(data.ranking_linhas)||data.ranking_linhas.length!==5)throw Error('HISTORY_INVALID_RESPONSE');
 return data;
}
export async function analysis(key,env,fetcher=fetch){
 bankFor(key);const now=new Date();
 const [history,latest]=await Promise.allSettled([lineHistory(key,env,fetcher),results(key,'',fetcher)]);
 if(history.status==='rejected')console.warn('Rebeca history unavailable',key,/^HISTORY_[A-Z0-9_]+$/.test(history.reason?.message)?history.reason.message:history.reason?.name||'Error');
 const last=latest.status==='fulfilled'?latest.value.extracoes.at(-1):null;
 const number=last?.premios.find(p=>p.posicao===1)?.milhar.slice(-4);
 return {ok:true,nome:BANKS[key].name,data_referencia:daySP(now),consultado_em:now.toISOString(),
  ranking_linhas:history.status==='fulfilled'?history.value.ranking_linhas:[],
  historico_atualizado_em:history.status==='fulfilled'?history.value.historico_atualizado_em:null,
  aviso_linhas:history.status==='rejected'?(key==='federal'?'O histórico de linhas da Federal ainda não está disponível nesta fonte.':'Não foi possível consultar as linhas agora. Tente atualizar.'):null,
  extracoes:latest.status==='fulfilled'?latest.value.extracoes:[],
  ultima_extracao:last,soma:number?sums(number,Number(daySP(now).slice(0,4))):[],
  aviso_soma:last?null:'Nenhum resultado recente disponível para calcular a soma.'};
}
