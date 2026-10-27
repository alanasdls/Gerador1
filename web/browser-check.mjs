import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {testEnvironment} from './test-support.mjs';
import {fixtureFetch} from './methods-fixtures.mjs';

// Usage: node web/browser-check.mjs [path to installed playwright-core]
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]||'playwright-core');
const env=testEnvironment();
env.REBECA_ANALYSIS_KEY='test-bridge-key';
globalThis.fetch=fixtureFetch;
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(`http://localhost:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  const response=await worker.fetch(request,env);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://localhost:${server.address().port}`;
const output=new URL('./qa-output/',import.meta.url);
await mkdir(output,{recursive:true});
let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('status of 400'))errors.push(m.text());});
  await page.goto(origin);await page.screenshot({path:new URL('cadastro-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  assert.equal(await page.locator('#registrationForm').count(),1);
  await page.locator('#name').fill('Teste de acesso');await page.locator('#phone').fill('123');await page.locator('#registerButton').click();
  await page.waitForFunction(()=>document.getElementById('registrationStatus').textContent.includes('DDD'));
  await page.locator('#phone').fill('(11) 91234-5678');await page.locator('#registerButton').click();
  await page.waitForURL('**/painel');await page.waitForFunction(()=>document.querySelector('[data-user-name]').textContent==='Teste de acesso');
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM customers').get().n,1);
  assert.equal((await context.cookies()).find(c=>c.name==='__Host-rebeca_session').httpOnly,true);
  await page.screenshot({path:new URL('painel-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.locator('.featured [data-view="gerador"]').click();
  for(let i=1;i<=5;i++)await page.locator(`.group-btn[data-id="${i}"]`).click();
  assert.equal(await page.locator('.group-btn:disabled').count(),20);
  await page.locator('#generateSelected').click();
  assert.equal(await page.locator('#resultsGrid .number-chip').count(),100);
  const numbers=await page.locator('#resultsGrid .number-chip').allTextContents();
  numbers.forEach(n=>assert.match(n,/^\d{4}$/));
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:new URL('gerador-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.locator('.bottom-nav [data-view="inicio"]').click();await page.locator('[data-mode="dry"]').click();
  await page.locator('#generatorQty').fill('25');await page.locator('#generateSelected').click();
  assert.equal(await page.locator('#resultsGrid .number-chip').count(),25);
  assert.equal(await page.locator('[data-page="gerador"]').isVisible(),true);
  await page.locator('#closedAnimal').click();await page.locator('#generatorQty').fill('100');await page.locator('#generateSelected').click();assert.equal(await page.locator('#resultsGrid .number-chip').count(),100);
  await page.locator('#copyBtn').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/\d{4}/);
  async function menu(view){await page.locator('#openMenu').click();await page.locator(`#menuDialog [data-view="${view}"]`).click();}
  await menu('historico');assert.equal(await page.locator('.history-item').count(),3);
  await menu('analises');await page.waitForSelector('.leading-line');
  assert.equal(await page.locator('.leading-line h2').textContent(),'Linha 3');
  assert.equal(await page.locator('.line-ranking details').count(),5);
  assert.equal(await page.locator('#sumNumbers .method-pick').count(),4);
  await page.locator('#analysisBank').selectOption('rio');await page.waitForFunction(()=>document.querySelector('#analysisStatus').textContent.startsWith('Consultado'));
  await page.locator('#copySums').click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).split('\n').length,4);
  await page.screenshot({path:new URL('analises-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await menu('resultados');await page.waitForSelector('.prize-table');assert.equal(await page.locator('.prize-table strong').last().textContent(),'854');
  await page.locator('#resultsDate').fill('2026-10-26');await page.locator('#resultsForm button').click();await page.waitForFunction(()=>document.querySelector('#drawResults').textContent.includes('26/10/2026'));
  await menu('atrasados');await page.waitForSelector('.delay-table');assert.equal(await page.locator('.delay-table .delay-row').count(),25);
  await menu('puxadas');assert.equal(await page.locator('.pull-card').count(),25);await page.locator('#pullSearch').fill('aguia');assert.equal(await page.locator('.pull-card').count(),1);await page.locator('#pullSearch').fill('');
  await menu('sonhos');await page.locator('#dreamText').fill('Sonhei com um cavalo perto de um rio');await page.locator('#dreamForm button').click();await page.waitForSelector('#dreamResults .method-pick');assert.equal(await page.locator('#dreamResults .method-pick').count(),25);
  await menu('horoscopo');await page.locator('#signSelect').selectOption('aries');await page.locator('#signForm button').click();await page.waitForSelector('#signResults .method-pick');assert.equal(await page.locator('#signResults .method-pick').count(),25);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const view of ['inicio','gerador','analises','resultados','atrasados','puxadas','sonhos','horoscopo']){
      await menu(view);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${view}: no overflow at ${width}px`);
    }
  }
  await page.setViewportSize({width:390,height:844});await menu('inicio');await page.screenshot({path:new URL('metodos-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  assert.equal(await page.locator('[data-page="cruz"]').count(),0);
  await page.locator('#openMenu').click();assert.equal(await page.locator('#menuDialog').isVisible(),true);
  await page.locator('#menuDialog [data-view="perfil"]').click();assert.equal(await page.locator('[data-page="perfil"]').isVisible(),true);
  assert.equal(await page.locator('[data-user-phone]').textContent(),'(11) 91234-5678');
  assert.equal(await page.locator('#menuDialog').isVisible(),false);
  await page.reload();assert.equal(await page.locator('[data-page="perfil"]').isVisible(),true);
  await page.locator('#signOut').click();await page.waitForURL(origin+'/');
  await page.goto(origin+'/painel');await page.waitForURL(origin+'/');
  assert.equal((await context.request.get(origin+'/api/session')).status(),401);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow at ${width}px`);
  }
  await page.screenshot({path:new URL('cadastro-desktop.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: browser registration, database persistence, session cookie, 3 generators, 6 methods, history, menu, copying, profile, logout and 4 viewport widths.');
  console.log('Screenshots: web/qa-output/');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));env.sqlite.close();
}
