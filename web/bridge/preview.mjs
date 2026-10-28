// Authorized read-only production probe. Prints public analysis only, never credentials.
import {readFileSync,writeFileSync} from 'node:fs';
import {analysis,BANKS} from './core.mjs';
import {fetchResults} from './source.mjs';
const cfg=JSON.parse(readFileSync('/etc/delamark-analysis-vip/config.json','utf8'));
const read=async(table,params)=>{
 if(!['delayed_animal_state','delayed_processed_draws','result_lottery_times'].includes(table))throw Error('TABLE_INVALID');
 const response=await fetch(cfg.dbUrl+'/rest/v1/'+table+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(8000),redirect:'error',headers:{apikey:cfg.dbKey,...(cfg.dbKey.startsWith('eyJ')?{Authorization:'Bearer '+cfg.dbKey}:{})}});
 if(!response.ok)throw Error('DB_HTTP_'+response.status);
 return response.json();
};
const snapshot={};
for(const bank of Object.keys(BANKS)){
 const start=Date.now();
 try{
  const data=await analysis(bank,read,fetchResults);snapshot[bank]=data;
  console.log(JSON.stringify({bank,milliseconds:Date.now()-start,base:data.ultima_extracao?.horario,line:data.analise_atual?.linha_mais_atrasada,warning:data.avisos}));
 }catch(error){console.log(JSON.stringify({bank,error:error.message}));}
}
writeFileSync(new URL('./preview.json',import.meta.url),JSON.stringify(snapshot),{mode:0o600});
