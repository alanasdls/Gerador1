import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {generateNumbers} from './public/generator-core.mjs';
import {PULLS,daySP,sums,animal} from './public/methods-data.mjs';
import {parseDelays,normalizeResults,validDate,lineHistory} from './market.mjs';
import {handler,project} from './bridge/server.mjs';
import {rows,sourceDraw,delayHtml,fixtureFetch} from './methods-fixtures.mjs';
import worker from './worker.mjs';
import {testEnvironment} from './test-support.mjs';
import {researchInternet,dreamText} from './research.mjs';

test('three generator modes use only selected groups and produce the chosen unique count',()=>{
 for(const mode of ['normal','dry','closed'])for(const groups of [[1],[25],[1,7,12,18,25]])for(const count of [1,25,100]){
  const picks=generateNumbers(groups,mode,count);assert.equal(picks.length,count);assert.equal(new Set(picks).size,count);
  assert.ok(picks.every(p=>/^\d{4}$/.test(p)&&groups.includes(animal(p).group)));
  if(mode==='dry')for(const group of groups)assert.ok(new Set(picks.filter(p=>animal(p).group===group).map(p=>p.slice(-2))).size<=1);
 }
 assert.equal(generateNumbers([25],'closed',1,()=>3)[0],'0000');
 for(const groups of [[],[0],[26],[1,1],[1,2,3,4,5,6]])assert.throws(()=>generateNumbers(groups,'normal',10));
 for(const quantity of [0,101,1.5,NaN])assert.throws(()=>generateNumbers([1],'normal',quantity));
});
test('sums match Delamark cumulative year method and preserve zeros',()=>{
 assert.deepEqual(sums('5572',2026).map(p=>p.milhar),['7598','3170','8742','4314']);
 assert.deepEqual(sums('9000',2026).map(p=>p.milhar),['1026','0026','9026','8026']);
 assert.throws(()=>sums('57',2026));
});
test('results enforce date, time, Federal isolation and original seventh-prize width',()=>{
 const now=new Date('2026-10-27T20:00:00Z'),draw={...sourceDraw,data_resultado:'2026-10-27'};
 const payload={extracoes:[draw,{...draw,codigo:'FED',nome:'Federal'}, {...draw,data_resultado:'2026-10-26'}, {...draw,horario:'23:00'}]};
 const rio=normalizeResults(payload,'rio','2026-10-27',now);assert.equal(rio.extracoes.length,1);assert.equal(rio.extracoes[0].premios[6].milhar,'854');
 assert.equal(normalizeResults(payload,'federal','2026-10-27',now).extracoes[0].premios.length,5);
 assert.equal(normalizeResults({extracoes:[{...draw,data_resultado:'2026-10-26'}]},'rio','2026-10-27',now).extracoes.length,0);
 assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-02-28'),true);
});
test('line ranking uses first-prize extraction delays, validates all groups and projects no private fields',()=>{
 const data=project(rows.map(r=>({...r,phone:'private',tenant_id:'private'})));
 assert.equal(data.ranking_linhas[0].linha,3);assert.equal(data.ranking_linhas[0].atraso_extracoes,8);
 assert.doesNotMatch(JSON.stringify(data),/private|phone|tenant_id/);
 assert.throws(()=>project(rows.slice(1)));assert.throws(()=>project(rows.map((r,i)=>i===0?{...r,ultima_aparicao_data:null}:r)));
});

test('history request uses Workers-compatible manual redirects and rejects redirected credentials',async()=>{
 await assert.rejects(lineHistory('rio',{REBECA_ANALYSIS_KEY:'synthetic'},async(url,options)=>{
  assert.equal(options.redirect,'manual');assert.equal(options.headers['x-gateway-key'],'synthetic');
  return new Response(null,{status:302,headers:{location:'https://untrusted.test/'}});
 }),/HISTORY_HTTP_302/);
});
test('delay parser requires all 25 actual animals and rejects incomplete source pages',()=>{
 const parsed=parseDelays(delayHtml);assert.equal(parsed.length,25);assert.equal(parsed[0].grupo,25);assert.equal(parsed.at(-1).dias,0);
 assert.throws(()=>parseDelays('<p>Sem resultados</p>'));
 assert.equal(PULLS.length,25);for(const groups of PULLS)assert.ok(groups.length&&groups.every(g=>Number.isInteger(g)&&g>=1&&g<=25));
 assert.deepEqual(PULLS[0],[25,2,13,19,20]);assert.deepEqual(PULLS[24],[21,1,7]);
});
test('history bridge requires its dedicated key and only reads whitelisted lottery history',async()=>{
 const key='synthetic-key-that-is-long-enough',read=[];
 const server=createServer(handler(key,async lottery=>{read.push(lottery);return rows;}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/rebeca/historico`;
 try{
  const post=(body,k=key)=>fetch(url,{method:'POST',headers:{'x-gateway-key':k},body:JSON.stringify(body)});
  assert.equal((await post({banca:'rio'},'wrong')).status,403);assert.equal(read.length,0);
  for(const body of [{banca:'unknown'},{banca:'rio',tenant_id:'mark'},null])assert.equal((await post(body)).status,400);
  const r=await post({banca:'rio'});assert.equal(r.status,200);assert.equal((await r.json()).ranking_linhas.length,5);assert.deepEqual(read,['rio-federal']);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('methods require a session, preserve origin checks, and do not expose a cross route',async()=>{
 const env=testEnvironment(),origin='https://rebeca.test';
 try{
  for(const path of ['resultados','atrasados','analises'])assert.equal((await worker.fetch(new Request(origin+'/api/metodos/'+path),env)).status,401);
  assert.equal((await worker.fetch(new Request(origin+'/api/metodos/cruz'),env)).status,404);
  const r=await worker.fetch(new Request(origin+'/api/cadastro',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:'Teste',phone:'11912345678'})}),env),cookie=r.headers.get('set-cookie').split(';')[0];
  assert.equal((await worker.fetch(new Request(origin+'/api/metodos/sonhos',{method:'POST',headers:{origin:'https://wrong.test',cookie,'content-type':'application/json'},body:'{}'}),env)).status,403);
  assert.equal((await worker.fetch(new Request(origin+'/api/metodos/resultados?banca=unknown',{headers:{cookie}}),env)).status,400);
  assert.equal((await worker.fetch(new Request(origin+'/api/metodos/resultados?data=2026-02-30',{headers:{cookie}}),env)).status,400);
 }finally{env.sqlite.close();}
});
test('authenticated methods run the full result, line, delay and research flows with isolated fixtures',async()=>{
 const env=testEnvironment();env.REBECA_ANALYSIS_KEY='synthetic-test-key';const original=globalThis.fetch;globalThis.fetch=fixtureFetch;
 const origin='https://rebeca.test';
 try{
  const r=await worker.fetch(new Request(origin+'/api/cadastro',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:'Leitora',phone:'11912345678'})}),env),cookie=r.headers.get('set-cookie').split(';')[0];
  for(const [path,field] of [['resultados?data='+daySP(),'extracoes'],['atrasados','itens'],['analises','ranking_linhas']]){
   const response=await worker.fetch(new Request(origin+'/api/metodos/'+path,{headers:{cookie}}),env);assert.equal(response.status,200);const data=await response.json();assert.ok(data[field].length);assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
  for(const [path,body] of [['sonhos',{dream:'Cavalo perto do rio'}],['horoscopo',{sign:'aries'}]]){
   const response=await worker.fetch(new Request(origin+'/api/metodos/'+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)}),env);
   assert.equal(response.status,200);const data=await response.json();assert.equal(data.picks.length,25);assert.equal(new Set(data.picks.map(p=>p.milhar)).size,25);assert.ok(data.research.length);assert.doesNotMatch(JSON.stringify(data),/DELAMARK|cruz/i);
  }
  globalThis.fetch=async()=>{throw Error('upstream failed');};
  const failure=await worker.fetch(new Request(origin+'/api/metodos/resultados',{headers:{cookie}}),env);assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/upstream failed/);
 }finally{globalThis.fetch=original;env.sqlite.close();}
});
test('panel exposes all requested tools and excludes the cross',()=>{
 const html=readFileSync(new URL('./public/app.html',import.meta.url),'utf8');
 for(const view of ['gerador','analises','resultados','atrasados','puxadas','sonhos','horoscopo'])assert.ok(html.includes(`data-page="${view}"`));
 assert.doesNotMatch(html,/cruz/i);
});

test('research resolves relative search links and uses real sources when search is unavailable',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.personare.com.br%2Fconteudo%2Fsonho">Sonhos</a><a class="result__snippet">Simbologia dos sonhos</a>');
  assert.equal((await researchInternet(['sonho']))[0].url,'https://www.personare.com.br/conteudo/sonho');
  globalThis.fetch=async(url,options)=>new URL(url).hostname==='html.duckduckgo.com'?new Response('Temporarily unavailable',{status:202}):fixtureFetch(url,options);
  const refs=await researchInternet(['tema raro'],3,{dream:'Uma paisagem desconhecida'});assert.equal(refs[0].general,true);assert.match(dreamText('paisagem',refs,[],'x').description,/geral/);
  const sign=await researchInternet([],3,{sign:'aries'});assert.equal(sign[0].url,'https://www.astrolink.com.br/aries');
 }finally{globalThis.fetch=original;}
});
