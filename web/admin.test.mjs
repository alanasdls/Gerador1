import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {ADMIN_PHONE,digest} from './admin.mjs';
import {testEnvironment} from './test-support.mjs';
const origin='https://rebeca.test',password='Synthetic-private-admin-42',invite='synthetic-single-use-invitation';
const request=(path,body,cookie='',extra={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
const cookieOf=r=>r.headers.get('set-cookie')?.split(';')[0]||'';
async function environment(){const env=testEnvironment();env.REBECA_ADMIN_SETUP_HASH=await digest(invite);env.REBECA_ADMIN_PEPPER='synthetic-pepper-only-for-tests-123456789';return env;}
async function register(env,name,phone){return cookieOf(await worker.fetch(request('/api/cadastro',{name,phone}),env));}
async function setup(env){const r=await worker.fetch(request('/api/admin/configurar',{phone:ADMIN_PHONE,password,token:invite}),env);assert.equal(r.status,200);return cookieOf(r);}

test('typing the admin phone in ordinary registration does not reveal any contacts',async()=>{
 const env=await environment();try{
  const regular=await register(env,'Cliente privado','11912345678'),claimed=await register(env,'Telefone informado','11998909994');
  for(const cookie of ['',regular,claimed]){const r=await worker.fetch(request('/api/admin/clientes',undefined,cookie),env);assert.equal(r.status,401);assert.doesNotMatch(await r.text(),/Cliente privado|5511912345678/);assert.equal(r.headers.get('cache-control'),'private, no-store');}
  assert.equal((await (await worker.fetch(request('/api/session',undefined,claimed),env)).json()).user.adminEligible,true);
  assert.equal((await (await worker.fetch(request('/api/session',undefined,regular),env)).json()).user.adminEligible,false);
  assert.equal((await worker.fetch(request('/api/admin/clientes',undefined,claimed.replace('__Host-rebeca_session','__Host-rebeca_admin')),env)).status,401);
 }finally{env.sqlite.close();}
});

test('single-use setup requires both invitation and authorized phone; credentials are never returned',async()=>{
 const env=await environment();try{
  for(const body of [{phone:ADMIN_PHONE,password,token:'wrong'},{phone:'11912345678',password,token:invite}])assert.equal((await worker.fetch(request('/api/admin/configurar',body),env)).status,403);
  assert.equal((await worker.fetch(request('/api/admin/configurar',{phone:ADMIN_PHONE,password:'short',token:invite}),env)).status,400);
  const r=await worker.fetch(request('/api/admin/configurar',{phone:ADMIN_PHONE,password,token:invite}),env);assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict; Max-Age=28800/);
  const stored=env.sqlite.prepare('SELECT * FROM admin_credentials').get();assert.notEqual(stored.password_hash,password);assert.notEqual(stored.password_hash,await digest(password));assert.equal(stored.phone,ADMIN_PHONE);
  assert.equal((await worker.fetch(request('/api/admin/configurar',{phone:ADMIN_PHONE,password:'replacement-password',token:invite}),env)).status,409);assert.deepEqual(env.sqlite.prepare('SELECT * FROM admin_credentials').get(),stored);
  assert.doesNotMatch(await r.text(),/salt|hash|token|Synthetic/);
  assert.equal((await worker.fetch(request('/api/admin/configurar',{phone:ADMIN_PHONE,password,token:invite},'',{origin:'https://foreign.test'}),env)).status,403);
 }finally{env.sqlite.close();}
});

test('admin login, pagination, name/phone search, expiry and logout enforce server authorization',async()=>{
 const env=await environment();try{
  const insert=env.sqlite.prepare('INSERT INTO customers(id,name,phone,created_at,privacy_version) VALUES(?,?,?,?,?)');
  for(let i=0;i<55;i++)insert.run('c'+i,'Pessoa '+i,'551190000'+String(i).padStart(4,'0'),i,'test');
  insert.run('literal','Nome com % literal','5511999999999',100,'test');
  let cookie=await setup(env);
  let data=await (await worker.fetch(request('/api/admin/clientes',undefined,cookie),env)).json();assert.equal(data.total,56);assert.equal(data.customers.length,50);assert.equal(data.pages,2);assert.deepEqual(Object.keys(data.customers[0]).sort(),['name','phone']);
  data=await (await worker.fetch(request('/api/admin/clientes?pagina=2',undefined,cookie),env)).json();assert.equal(data.customers.length,6);
  data=await (await worker.fetch(request('/api/admin/clientes?q=%25',undefined,cookie),env)).json();assert.equal(data.filtered,1);
  data=await (await worker.fetch(request('/api/admin/clientes?q=11%2099999-9999',undefined,cookie),env)).json();assert.equal(data.filtered,1);
  insert.run('name-digits','Outro nome','5511934000000',101,'test');
  data=await (await worker.fetch(request('/api/admin/clientes?q=Pessoa%2034',undefined,cookie),env)).json();assert.equal(data.filtered,1);assert.equal(data.customers[0].name,'Pessoa 34');
  const long='Nome de busca longo com espaços e acentos que não existe nesta lista'.slice(0,80);
  const longResponse=await worker.fetch(request('/api/admin/clientes?q='+encodeURIComponent(long),undefined,cookie),env);assert.equal(longResponse.status,200);assert.equal((await longResponse.json()).filtered,0);
  assert.equal((await worker.fetch(request('/api/admin/clientes?pagina=-1',undefined,cookie),env)).status,400);
  await worker.fetch(request('/api/admin/sair',{},cookie),env);assert.equal((await worker.fetch(request('/api/admin/clientes',undefined,cookie),env)).status,401);
  assert.equal((await worker.fetch(request('/api/admin/entrar',{phone:ADMIN_PHONE,password:'wrong-password-long'}),env)).status,401);
  const login=await worker.fetch(request('/api/admin/entrar',{phone:'(11) 99890-9994',password}),env);assert.equal(login.status,200);cookie=cookieOf(login);
  env.sqlite.exec('UPDATE admin_sessions SET expires_at=1');assert.equal((await worker.fetch(request('/api/admin/clientes',undefined,cookie),env)).status,401);
  cookie=cookieOf(await worker.fetch(request('/api/admin/entrar',{phone:ADMIN_PHONE,password}),env));
  await worker.fetch(request('/api/sair',{},cookie),env);assert.equal((await worker.fetch(request('/api/admin/session',undefined,cookie),env)).status,401);
 }finally{env.sqlite.close();}
});

test('administrative login throttles guesses and enforces body and origin limits',async()=>{
 const env=await environment();try{
  for(let i=0;i<8;i++)assert.equal((await worker.fetch(request('/api/admin/entrar',{phone:ADMIN_PHONE,password}),env)).status,401);
  assert.equal((await worker.fetch(request('/api/admin/entrar',{phone:ADMIN_PHONE,password}),env)).status,429);
  assert.equal((await worker.fetch(request('/api/admin/entrar',{phone:ADMIN_PHONE,password},'',{origin:'https://foreign.test'}),env)).status,403);
  assert.equal((await worker.fetch(request('/api/admin/entrar',{password:'x'.repeat(3000)}),env)).status,413);
  assert.equal((await worker.fetch(request('/api/admin/entrar',{},'',{'content-type':'text/plain'}),env)).status,415);
 }finally{env.sqlite.close();}
});
