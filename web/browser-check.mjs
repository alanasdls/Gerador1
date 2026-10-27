import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {testEnvironment} from './test-support.mjs';

// Usage: node web/browser-check.mjs [path to installed playwright-core]
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]||'playwright-core');
const env=testEnvironment();
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
  assert.equal(await page.locator('#resultsGrid .number-chip').count(),20);
  const numbers=await page.locator('#resultsGrid .number-chip').allTextContents();
  numbers.forEach(n=>assert.match(n,/^\d{4}$/));
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:new URL('gerador-mobile.png',output).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await page.locator('.bottom-nav [data-view="inicio"]').click();await page.locator('[data-mode="dry"]').click();
  assert.equal(await page.locator('#resultsGrid .number-chip').count(),25);
  assert.equal(await page.locator('[data-page="gerador"]').isVisible(),true);
  await page.locator('#closedAnimal').click();assert.equal(await page.locator('#resultsGrid .number-chip').count(),1000);
  await page.locator('.bottom-nav [data-view="historico"]').click();assert.equal(await page.locator('.history-item').count(),3);
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
  console.log('PASS: browser registration, database persistence, session cookie, 3 generators, history, menu, profile, logout and 4 viewport widths.');
  console.log('Screenshots: web/qa-output/');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));env.sqlite.close();
}
