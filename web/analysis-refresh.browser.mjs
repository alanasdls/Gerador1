import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {testEnvironment} from './test-support.mjs';
import {fixtureFetch,currentAnalysisFixture} from './methods-fixtures.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.argv[2]||'playwright-core');
const env=testEnvironment();env.REBECA_ANALYSIS_KEY='synthetic-analysis-key';
let calls=0,version=0,mode='ok';
globalThis.fetch=async(input,options)=>{
 if(new URL(input).pathname!=='/rebeca/historico')return fixtureFetch(input,options);
 calls++;if(mode==='fail')throw Error('TEST_SOURCE_OFFLINE');if(mode==='hang')return new Promise(()=>{});
 const data=currentAnalysisFixture(),base={...data.ultima_extracao,horario:version?'14:20':'11:20',codigo:version?'H1420':'H1120',milhar_1_premio:version?'0001':'5572'};
 const top=data.ranking_linhas.find(line=>line.linha===(version?4:3));
 data.ranking_linhas=[top,...data.ranking_linhas.filter(line=>line!==top)];
 data.analise_atual={resultado_base:base,proxima_extracao:{data:base.data,horario:version?'16:20':'14:20'},linha_mais_atrasada:top};
 data.ultima_extracao=base;data.extracoes_disponiveis=[{...base,horario:'09:20',codigo:'H0920'},base];
 return Response.json(data);
};
const server=createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const response=await worker.fetch(new Request(`http://localhost:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),env);
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://localhost:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date()});
 const registered=await context.request.post(origin+'/api/cadastro',{headers:{origin},data:{name:'Teste local',phone:'11912345678'}});assert.equal(registered.status(),200);
 await page.goto(origin+'/painel#analises');await page.waitForSelector('.leading-line');assert.equal(calls,1);
 await page.locator('.line-ranking details[data-line="3"] summary').click();
 const older=await page.locator('#sumDraw option').first().getAttribute('value');await page.locator('#sumDraw').selectOption(older);
 version=1;await page.clock.runFor(299000);assert.equal(calls,1);
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});assert.equal(calls,1);
 await page.clock.runFor(1000);await page.waitForFunction(()=>document.querySelector('.leading-line h2')?.textContent==='Linha 4');assert.equal(calls,2);
 assert.match(await page.locator('.leading-line').textContent(),/às 14:20/);
 assert.equal(await page.locator('#sumDraw').inputValue(),older);assert.equal(await page.locator('.line-ranking details[data-line="3"]').getAttribute('open'),'');
 console.log('PASS: no extra request before five minutes, focus is debounced, and API result updates line while keeping selected sum.');
 async function menu(view){await page.locator('#openMenu').click();await page.locator(`#menuDialog [data-view="${view}"]`).click();}
 await menu('inicio');const outside=calls;await page.clock.runFor(600000);assert.equal(calls,outside);
 await menu('analises');await page.clock.runFor(1);await page.waitForFunction(()=>document.querySelector('#analysisForm').getAttribute('aria-busy')==='false');assert.equal(calls,outside+1);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});const hidden=calls;await page.clock.runFor(600000);assert.equal(calls,hidden);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(1);await page.waitForFunction(()=>document.querySelector('#analysisForm').getAttribute('aria-busy')==='false');assert.equal(calls,hidden+1);
 console.log('PASS: no polling outside the analysis screen or in a hidden tab; returning after five minutes refreshes once.');
 const manual=calls;await page.locator('#analysisForm button').click();await page.waitForFunction(()=>document.querySelector('#analysisForm').getAttribute('aria-busy')==='false');assert.equal(calls,manual+1);
 await page.clock.runFor(299000);assert.equal(calls,manual+1);mode='fail';await page.clock.runFor(1000);await page.waitForFunction(()=>document.querySelector('#analysisStatus').textContent.includes('consulta anterior'));assert.equal(calls,manual+2);assert.equal(await page.locator('.leading-line h2').textContent(),'Linha 4');
 mode='ok';await page.clock.runFor(300000);await page.waitForFunction(()=>document.querySelector('#analysisStatus').textContent.includes('a cada 5 minutos'));assert.equal(calls,manual+3);
 mode='hang';await page.clock.runFor(300000);await page.waitForFunction(()=>document.querySelector('#analysisForm').getAttribute('aria-busy')==='true');await page.clock.runFor(25000);await page.waitForFunction(()=>document.querySelector('#analysisStatus').textContent.includes('consulta anterior'));
 mode='ok';await page.clock.runFor(275000);await page.waitForFunction(()=>document.querySelector('#analysisStatus').textContent.includes('a cada 5 minutos'));
 console.log('PASS: manual refresh works immediately and resets the timer; outages/timeouts retain labeled old data and recover at five minutes.');
 await page.locator('#analysisBank').selectOption('capital-v3');await page.waitForSelector('.leading-line');await page.waitForFunction(()=>document.querySelector('#analysisForm').getAttribute('aria-busy')==='false');
 assert.match(await page.locator('.leading-line').textContent(),/às \d{2}:00/);assert.equal(await page.locator('#delaysBank option[value="capital-v3"]').count(),0);
 await menu('resultados');await page.locator('#resultsBank').selectOption('capital-v3');await page.waitForFunction(()=>document.querySelector('#resultsForm').getAttribute('aria-busy')==='false');assert.ok(await page.locator('.draw-card').count());assert.match(await page.locator('.draw-card').first().textContent(),/\d{2}:00/);
 await menu('analises');console.log('PASS: Capital V3 selector reaches the real Worker calculation and results, with separate source history.');
 await page.locator('#analysisBank').selectOption('federal');await page.waitForFunction(()=>document.querySelector('.leading-line')?.textContent.includes('Concurso 6112'));assert.match(await page.locator('.leading-line').textContent(),/24\/10\/2026/);assert.doesNotMatch(await page.locator('.leading-line').textContent(),/null|undefined/);assert.equal(await page.locator('#sumNumbers .method-pick').count(),4);
 await menu('resultados');await page.locator('#resultsDate').fill('2026-10-24');await page.locator('#resultsBank').selectOption('federal');await page.waitForFunction(()=>document.querySelector('.draw-card')?.textContent.includes('Concurso 6112'));assert.equal(await page.locator('.prize-table strong').count(),5);assert.equal(await page.locator('.prize-table strong').first().textContent(),'4383');await menu('analises');
 console.log('PASS: Federal line and sums use the real Worker route, show the official contest/date, and results include five prizes.');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);console.log('PASS: four viewport widths and no uncaught browser errors.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));env.sqlite.close();}
