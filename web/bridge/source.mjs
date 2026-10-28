// Source draw IDs use the same canonical times as the historical collector.
const ROUTES={'look-goias':'look','rio-federal':'rio-federal',bahia:'bahia','sao-paulo':'sao-paulo',nacional:'nacional',lotep:'lotep'};
export const TIMES=Object.freeze({
 'look-goias':{118:'07:20',104:'09:20',22:'11:20',23:'14:20',24:'16:20',25:'18:20',26:'21:20',119:'23:20'},
 'rio-federal':{120:'09:20',11:'11:00',12:'14:20',13:'16:00',16:'21:20'},
 bahia:{85:'10:00',86:'12:00',87:'15:00',88:'19:00',89:'21:00'},
 'sao-paulo':{122:'08:20',95:'10:00',125:'12:00',46:'13:20',47:'15:30',112:'17:20',123:'19:00',48:'20:00'},
 nacional:{38:'02:00',39:'08:00',40:'10:00',41:'12:00',42:'15:00',43:'17:00',113:'21:00',114:'23:00'},
 lotep:{50:'09:00',51:'10:00',52:'12:00',53:'15:00',54:'18:00',55:'20:00'}
});
export function normalizeResults(payload,lottery,date,now=new Date()){
 const federal=lottery==='federal-caixa';
 if(payload?.erro==='TRIVO_RESULTADO_HTTP_200'&&String(payload.resposta_preview).trim()==='0')return [];
 if(payload?.ok!==true&&!(federal&&payload?.sucesso===true))throw Error('RESULTADOS_API_INVALIDOS');
 if(!Array.isArray(payload.extracoes))throw Error('RESULTADOS_API_INVALIDOS');
 const output=new Map();
 for(const draw of payload.extracoes){
  if(draw.data_resultado!==date||draw.data_confere===false||/MALUCA/i.test(`${draw.codigo||''} ${draw.nome||''}`))continue;
  if(federal&&!(/FEDERAL/i.test(draw.nome||'')||draw.codigo==='FED'))continue;
  const horario=federal?draw.horario:TIMES[lottery]?.[draw.loteria_id];
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario||'')||Date.parse(`${date}T${horario}:00-03:00`)>now.getTime())continue;
  const prizes=Array.isArray(draw.premios)?draw.premios:[],first=prizes.find(p=>Number(p.posicao)===1);
  if(!first||!/^\d{4,5}$/.test(String(first.milhar||'')))continue;
  // The line uses only the published first prize; later prizes don't delay it.
  const milhar=String(first.milhar).slice(-4),last=Number(milhar.slice(-2)),grupo=Math.ceil((last||100)/4);
  if(first.grupo!=null&&Number(first.grupo)!==grupo)throw Error('PRIMEIRO_PREMIO_INVALIDO');
  const item={data:date,horario,codigo:'H'+horario.replace(':',''),milhar_1_premio:milhar,grupo};
  const existing=output.get(horario);
  if(existing&&existing.milhar_1_premio!==milhar)throw Error('RESULTADO_CONFLITANTE');
  output.set(horario,item);
 }
 return [...output.values()].sort((a,b)=>a.horario.localeCompare(b.horario));
}
export async function fetchResults(lottery,date,fetcher=fetch,now=new Date()){
 const federal=lottery==='federal-caixa';
 if(!federal&&!Object.hasOwn(ROUTES,lottery))throw Error('LOTERIA_VIP_INVALIDA');
 const url=federal?`https://apidelamak.alanasdls.workers.dev/resultados?banca=rio-federal&data=${date}`:`https://api-sorte777v3.alanasdls.workers.dev/fontes/trivo/${ROUTES[lottery]}?data=${date}`;
 const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(6500),headers:{accept:'application/json','cache-control':'no-cache'}});
 if(!response.ok)throw Error('RESULTADOS_API_INDISPONIVEIS');
 return normalizeResults(await response.json(),lottery,date,now);
}
