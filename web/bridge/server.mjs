import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {analysis,BANKS} from './core.mjs';
import {fetchResults} from './source.mjs';
const daySP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function project(rows){
 if(!Array.isArray(rows)||rows.length!==25||new Set(rows.map(r=>Number(r.grupo))).size!==25||rows.some(r=>!Number.isInteger(Number(r.grupo))||r.grupo<1||r.grupo>25||!r.ultima_aparicao_data||!Number.isSafeInteger(Number(r.extracoes_sem_sair))||r.extracoes_sem_sair<0))throw Error('HISTORICO_INCOMPLETO');
 const map=new Map(rows.map(r=>[Number(r.grupo),r]));
 const ranking=Array.from({length:5},(_,i)=>{const linha=i+1,grupos=Array.from({length:5},(_,j)=>i*5+j+1),bichos=grupos.map(grupo=>({grupo,extracoes_sem_sair:Number(map.get(grupo).extracoes_sem_sair)}));return {linha,grupos,bichos,atraso_extracoes:Math.min(...bichos.map(b=>b.extracoes_sem_sair))};}).sort((a,b)=>b.atraso_extracoes-a.atraso_extracoes||a.linha-b.linha);
 return {ok:true,data_referencia:daySP(),ranking_linhas:ranking,historico_atualizado_em:rows.map(r=>r.atualizado_em).filter(v=>Number.isFinite(Date.parse(v))).sort().at(-1)||null};
}
export function handler(keyText,read,source=fetchResults){
 const key=Buffer.from(keyText);
 const pending=new Map();
 const current=bank=>{
  const cacheKey=daySP()+'|'+bank;
  if(!pending.has(cacheKey))pending.set(cacheKey,analysis(bank,read,source).finally(()=>pending.delete(cacheKey)));
  return pending.get(cacheKey);
 };
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 return async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return reply(res,200,{ok:true,service:'rebeca-methods'});
  if(req.method!=='POST'||req.url!=='/rebeca/historico')return reply(res,404,{error:'ROTA_INVALIDA'});
  const supplied=Buffer.from(String(req.headers['x-gateway-key']||''));
  if(supplied.length!==key.length||!timingSafeEqual(key,supplied))return reply(res,403,{error:'NAO_AUTORIZADO'});
  try{
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>256)return reply(res,413,{error:'DADOS_INVALIDOS'});}
   let body;try{body=JSON.parse(raw);}catch{return reply(res,400,{error:'DADOS_INVALIDOS'});}
   if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.banca!=='string'||!Object.hasOwn(BANKS,body.banca))return reply(res,400,{error:'LOTERIA_INVALIDA'});
   const result=await current(body.banca);
   if(result.data_referencia!==daySP())throw Error('VIRADA_DE_DIA');
   return reply(res,200,result);
  }catch{return reply(res,503,{error:'HISTORICO_INDISPONIVEL'});}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {gatewayKey}=JSON.parse(readFileSync('/etc/rebeca-methods/config.json','utf8'));
 const {dbUrl,dbKey}=JSON.parse(readFileSync('/etc/delamark-analysis-vip/config.json','utf8'));
 if(typeof gatewayKey!=='string'||gatewayKey.length<32||dbUrl!=='https://nelrzzyivrmiccxvrjql.supabase.co'||!dbKey)throw Error('CONFIG_INVALID');
 const read=async(table,params)=>{
  if(!['delayed_animal_state','delayed_processed_draws','result_lottery_times'].includes(table))throw Error('TABLE_INVALID');
  const r=await fetch(dbUrl+'/rest/v1/'+table+'?'+new URLSearchParams(params),{redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:dbKey,...(dbKey.startsWith('eyJ')?{Authorization:'Bearer '+dbKey}:{})}});
  if(!r.ok)throw Error('SOURCE_UNAVAILABLE');return r.json();
 };
 createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:8192},handler(gatewayKey,read)).listen(8801,'127.0.0.1');
}
