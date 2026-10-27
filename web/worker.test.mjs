import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {registration} from './worker.mjs';
import {testEnvironment} from './test-support.mjs';

const origin='https://rebeca.test';
const post=(body,extra={})=>new Request(origin+'/api/cadastro',{method:'POST',headers:{origin,'content-type':'application/json',...extra},body:JSON.stringify(body)});
const person={name:'Pessoa de teste',phone:'(11) 91234-5678'};
const get=(path,cookie='')=>new Request(origin+path,{headers:{cookie}});

test('normalizes the two fields and rejects invalid values',()=>{
  assert.deepEqual(registration({name:'  Maria   da Silva ',phone:'+55 (11) 91234-5678'}),{name:'Maria da Silva',phone:'5511912345678'});
  for(const value of [null,{}, {name:'A',phone:person.phone},{name:'<script>',phone:person.phone},{name:'12',phone:person.phone},{name:person.name,phone:'123'},{name:person.name,phone:'99999999999'}]) assert.equal(registration(value),null);
});

test('registration persists once, opens the panel and keeps sessions private',async()=>{
  const env=testEnvironment();
  try {
    assert.equal((await worker.fetch(get('/painel'),env)).status,302);
    assert.equal((await worker.fetch(get('/api/session'),env)).status,401);
    assert.equal((await worker.fetch(get('/api/customers'),env)).status,404);
    const response=await worker.fetch(post(person),env);
    assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
    const stored=env.sqlite.prepare('SELECT * FROM customers').get();
    assert.equal(stored.name,person.name); assert.equal(stored.phone,'5511912345678');
    const session=env.sqlite.prepare('SELECT * FROM sessions').get();
    assert.notEqual(session.token_hash,cookie.split('=')[1]);
    const panel=await worker.fetch(get('/painel',cookie),env);
    assert.equal(panel.status,200); assert.equal(panel.headers.get('cache-control'),'private, no-store');
    assert.match(panel.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await worker.fetch(get('/',cookie),env)).headers.get('location'),'/painel');
    assert.equal((await (await worker.fetch(get('/api/session',cookie),env)).json()).user.name,person.name);

    // Reusing a phone does not disclose or overwrite its original customer name.
    const repeated=await worker.fetch(post({...person,name:'Outro navegador'}),env);
    const repeatedCookie=repeated.headers.get('set-cookie').split(';')[0];
    assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM customers').get().n,1);
    assert.equal(env.sqlite.prepare('SELECT name FROM customers').get().name,person.name);
    assert.equal((await (await worker.fetch(get('/api/session',repeatedCookie),env)).json()).user.name,'Outro navegador');
    const logout=await worker.fetch(new Request(origin+'/api/sair',{method:'POST',headers:{origin,cookie}}),env);
    assert.equal(logout.status,200); assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal((await worker.fetch(get('/api/session',cookie),env)).status,401);
    env.sqlite.exec('UPDATE sessions SET expires_at=1');
    assert.equal((await worker.fetch(get('/api/session',repeatedCookie),env)).status,401);
  } finally {env.sqlite.close();}
});

test('blocks cross-origin, malformed, oversized and excessive requests',async()=>{
  const env=testEnvironment();
  try {
    assert.equal((await worker.fetch(post(person,{origin:'https://elsewhere.test'}),env)).status,403);
    assert.equal((await worker.fetch(post(person,{'content-type':'text/plain'}),env)).status,415);
    assert.equal((await worker.fetch(post({name:'x'.repeat(3000),phone:person.phone}),env)).status,413);
    assert.equal((await worker.fetch(post({name:'X',phone:'123'}),env)).status,400);
    for(let i=0;i<20;i++) assert.equal((await worker.fetch(post(person),env)).status,200);
    assert.equal((await worker.fetch(post(person),env)).status,429);
    assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM customers').get().n,1);
    assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,20);
  } finally {env.sqlite.close();}
});

test('database failure never reports a successful registration',async()=>{
  const response=await worker.fetch(post(person),{DB:{prepare(){throw Error('private diagnostic');}}});
  assert.equal(response.status,503);
  assert.equal(response.headers.get('set-cookie'),null);
  assert.doesNotMatch(await response.text(),/private diagnostic/);
});
