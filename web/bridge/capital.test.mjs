import test from 'node:test';
import assert from 'node:assert/strict';
import {capitalTimes,capitalNext,normalizeCapital,createCapitalAnalysis,capitalResults} from './capital.mjs';
const date='2026-10-28',now=new Date(date+'T17:30:00Z');
const ids={'10:00':32,'11:00':27,'13:00':31,'14:00':9,'16:00':28,'18:00':10,'20:00':30,'22:00':29};
function dayDraws(day){
 const distance=Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
 return capitalTimes(day).filter(time=>day!==date||time<='14:00').map((time,i)=>{const group=((distance*8+i)%25+25)%25+1;return {data:day,horario:time,codigo:'H'+time.replace(':',''),grupo:group,milhar_1_premio:String(group*4%100).padStart(4,'0')};});
}
test('Capital V3 identity, canonical hours and original prizes stay separate from LT Capital',()=>{
 const base={loteria_id:9,data_resultado:date,premios:[{posicao:1,milhar:'8804',grupo:1},{posicao:7,milhar:'0097',grupo:25}]};
 const payload={ok:true,loteria_canonica:'CAPITAL',extracoes:[base]};
 const draws=normalizeCapital(payload,date,now);assert.equal(draws[0].horario,'14:00');assert.equal(draws[0].premios[1].milhar,'097');
 assert.throws(()=>normalizeCapital({sucesso:true,extracoes:[{horario:'14:40',premios:base.premios}]},date,now),/IDENTIDADE/);
 for(const change of [{loteria_id:28},{data_resultado:'2026-10-27'},{loteria_id:999,horario:'14:40'}])assert.deepEqual(normalizeCapital({...payload,extracoes:[{...base,...change}]},date,now),[]);
 assert.equal(capitalTimes('2026-10-25').includes('11:00'),false);
 assert.deepEqual(capitalNext({data:'2026-10-25',horario:'10:00'}),{data:'2026-10-25',horario:'13:00'});
 assert.deepEqual(capitalNext({data:'2026-10-24',horario:'22:00'}),{data:'2026-10-25',horario:'10:00'});
});
test('all 25 animal delays come from consecutive V3 first prizes and history is reused on refresh',async()=>{
 const calls=[],source=async day=>{calls.push(day);return dayDraws(day);};
 const run=createCapitalAnalysis(source,{edgeCache:()=>null,maxDays:9});
 const data=await run(now);assert.equal(data.ranking_linhas.length,5);assert.deepEqual(data.avisos,[]);
 const ordered=calls.flatMap(dayDraws).sort((a,b)=>(b.data+b.horario).localeCompare(a.data+a.horario));
 for(const line of data.ranking_linhas)for(const animal of line.bichos)assert.equal(animal.extracoes_sem_sair,ordered.findIndex(d=>d.grupo===animal.grupo));
 assert.equal(data.ultima_extracao.horario,'14:00');assert.equal(data.analise_atual.proxima_extracao.horario,'16:00');
 const firstCalls=calls.length;const next=await run(new Date(now.getTime()+300000));assert.equal(calls.length,firstCalls+1);assert.deepEqual(next.ranking_linhas,data.ranking_linhas);
});
test('complete historical days use the shared edge cache across fresh instances; today is always queried',async()=>{
 const store=new Map(),cache={match:async key=>store.get(key.url)?.clone(),put:async(key,value)=>store.set(key.url,value.clone())};
 let calls=0;const source=async day=>{calls++;return dayDraws(day);};
 await createCapitalAnalysis(source,{edgeCache:()=>cache,maxDays:9})(now);const initial=calls;
 const data=await createCapitalAnalysis(source,{edgeCache:()=>cache,maxDays:9})(now);assert.equal(data.ranking_linhas.length,5);assert.equal(calls,initial+1);
});
test('missing draw or unseen groups suppress the ranking instead of inventing a delay; failed history retries',async()=>{
 let broken=true;
 const source=async day=>{const draws=dayDraws(day);return broken&&day==='2026-10-27'?draws.slice(1):draws;};
 const run=createCapitalAnalysis(source,{edgeCache:()=>null,maxDays:9});
 const partial=await run(now);assert.deepEqual(partial.ranking_linhas,[]);assert.equal(partial.ultima_extracao.horario,'14:00');
 broken=false;assert.equal((await run(now)).ranking_linhas.length,5);
 const gap=await createCapitalAnalysis(async day=>day===date?dayDraws(day).slice(1):dayDraws(day),{edgeCache:()=>null})(now);assert.deepEqual(gap.ranking_linhas,[]);
 const short=await createCapitalAnalysis(async()=>[],{edgeCache:()=>null,maxDays:1})(now);assert.equal(short.analise_atual,null);
});
test('before first draw, the previous day retains its date and next draw is today; outages reject',async()=>{
 const early=await createCapitalAnalysis(async day=>day===date?[]:dayDraws(day),{edgeCache:()=>null,maxDays:9})(new Date(date+'T10:00:00Z'));
 assert.equal(early.ultima_extracao.data,'2026-10-27');assert.ok(early.avisos.includes('SEM_EXTRACAO_DE_HOJE'));assert.deepEqual(early.analise_atual.proxima_extracao,{data:date,horario:'10:00'});
 await assert.rejects(createCapitalAnalysis(async()=>{throw Error('offline')})(now),/offline/);
 await assert.rejects(capitalResults('2026-02-30'),/DATA_INVALIDA/);
});
