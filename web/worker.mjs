const COOKIE='__Host-rebeca_session',MAX_AGE=60*60*24*90;
const encoder=new TextEncoder();
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY'};
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
const cookie=(value,age=MAX_AGE)=>`${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function tokenOf(request){const v=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(v||'')?v:null;}
export function registration(value){
 if(!value||typeof value.name!=='string'||typeof value.phone!=='string')return null;
 const name=value.name.normalize('NFC').trim().replace(/\s+/g,' ');
 let phone=value.phone.replace(/[\s()+.-]/g,'');if(phone.startsWith('55')&&phone.length===13)phone=phone.slice(2);
 if(name.length<2||name.length>80||/[<>\x00-\x1f\x7f]/.test(name)||!/[\p{L}]/u.test(name))return null;
 if(!/^[1-9][0-9]9[0-9]{8}$/.test(phone)||/^(\d)\1+$/.test(phone))return null;
 return {name,phone:'55'+phone};
}
async function session(request,env){
 const token=tokenOf(request);if(!token)return null;
 return env.DB.prepare('SELECT s.display_name AS name,c.phone FROM sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=?1 AND s.expires_at>?2').bind(await hash(token),Date.now()).first();
}
async function asset(request,env,path,privatePage=false){
 const url=new URL(request.url);url.pathname=path;
 const r=await env.ASSETS.fetch(new Request(url,request));
 const result=new Response(r.body,r);result.headers.set('x-content-type-options','nosniff');
 result.headers.set('referrer-policy','strict-origin-when-cross-origin');result.headers.set('x-frame-options','DENY');
 if(privatePage||path.endsWith('.html'))result.headers.set('cache-control','private, no-store');
 if(path.endsWith('.html'))result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 return result;
}
export default {async fetch(request,env){
 try{
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/api/')){
   if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return json({error:'Solicitação inválida.'},403);
   if(path==='/api/cadastro'&&request.method==='POST'){
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Solicitação inválida.'},415);
    if(Number(request.headers.get('content-length')||0)>2048)return json({error:'Dados muito longos.'},413);
    const raw=await request.text();if(raw.length>2048)return json({error:'Dados muito longos.'},413);
    let value;try{value=registration(JSON.parse(raw));}catch{return json({error:'Confira os dados informados.'},400);}
    if(!value)return json({error:'Informe seu nome e um celular válido com DDD.'},400);
    const now=Date.now(),bucket=await hash(new Date(now).toISOString().slice(0,10)+':'+(request.headers.get('cf-connecting-ip')||'local'));
    const rate=await env.DB.prepare('INSERT INTO registration_limits(bucket,attempts,expires_at) VALUES(?1,1,?2) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,now+86400000).first();
    if(rate.attempts>20)return json({error:'Muitas tentativas. Tente novamente mais tarde.'},429);
    const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const statements=[
     env.DB.prepare('INSERT INTO customers(id,name,phone,created_at,privacy_version) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(phone) DO NOTHING').bind(crypto.randomUUID(),value.name,value.phone,now,'2026-10-27'),
     env.DB.prepare('INSERT INTO sessions(token_hash,customer_id,display_name,expires_at) SELECT ?1,id,?2,?3 FROM customers WHERE phone=?4').bind(await hash(token),value.name,now+MAX_AGE*1000,value.phone),
     env.DB.prepare('DELETE FROM sessions WHERE expires_at<?1').bind(now),
     env.DB.prepare('DELETE FROM registration_limits WHERE expires_at<?1').bind(now)
    ];
    const old=tokenOf(request);if(old)statements.push(env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(await hash(old)));
    await env.DB.batch(statements);
    return json({ok:true,name:value.name},200,{'set-cookie':cookie(token)});
   }
   if(path==='/api/session'&&request.method==='GET'){
    const user=await session(request,env);return user?json({ok:true,user}):json({error:'Entre para continuar.'},401);
   }
   if(path==='/api/sair'&&request.method==='POST'){
    const token=tokenOf(request);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(await hash(token)).run();
    return json({ok:true},200,{'set-cookie':cookie('',0)});
   }
   return json({error:'Página não encontrada.'},404);
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers});
  if(path==='/painel'||path==='/painel/'||path==='/app.html'){
   if(!await session(request,env))return new Response(null,{status:302,headers:{...headers,location:'/'}});
   return asset(request,env,'/app.html',true);
  }
  if(path==='/'||path==='/index.html'){
   if(await session(request,env))return new Response(null,{status:302,headers:{...headers,location:'/painel'}});
   return asset(request,env,'/index.html');
  }
  return asset(request,env,path);
 }catch{return json({error:'Não foi possível concluir agora. Tente novamente em instantes.'},503);}
}};
