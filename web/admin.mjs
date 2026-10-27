export const ADMIN_PHONE='5511998909994';
const COOKIE='__Host-rebeca_admin',AGE=8*60*60,encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
export const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const cookie=(token,age=AGE)=>`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const tokenOf=req=>{const value=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null;};
const phoneOf=value=>{const n=typeof value==='string'?value.replace(/[\s()+.-]/g,''):'';return n.length===11?'55'+n:n;};
const reply=(data,status=200,extra={})=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY',...extra}});
const validPassword=value=>typeof value==='string'&&value.length>=12&&value.length<=128;
export async function passwordHash(password,salt,pepper){
 if(typeof pepper!=='string'||pepper.length<32)throw Error('ADMIN_CONFIG_MISSING');
 const hmac=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const secret=await crypto.subtle.sign('HMAC',hmac,encoder.encode(password));
 const key=await crypto.subtle.importKey('raw',secret,'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));
}
export async function adminSession(req,env){
 const token=tokenOf(req);if(!token)return null;
 return env.DB.prepare('SELECT phone FROM admin_sessions WHERE token_hash=?1 AND phone=?2 AND expires_at>?3').bind(await digest(token),ADMIN_PHONE,Date.now()).first();
}
export async function revokeAdmin(req,env){const token=tokenOf(req);if(token)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?1').bind(await digest(token)).run();}
async function issue(req,env){
 const token=random(),now=Date.now();
 await revokeAdmin(req,env);
 await env.DB.batch([
  env.DB.prepare('INSERT INTO admin_sessions(token_hash,phone,expires_at) VALUES(?1,?2,?3)').bind(await digest(token),ADMIN_PHONE,now+AGE*1000),
  env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?1').bind(now)
 ]);
 return reply({ok:true},200,{'set-cookie':cookie(token)});
}
async function limited(req,env){
 const now=Date.now(),bucket='admin:'+await digest((req.headers.get('cf-connecting-ip')||'local')+':'+Math.floor(now/900000));
 const row=await env.DB.prepare('INSERT INTO registration_limits(bucket,attempts,expires_at) VALUES(?1,1,?2) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,now+900000).first();
 return row.attempts>8;
}
export async function adminApi(req,env,url){
 const path=url.pathname;
 if(path==='/api/admin/session'&&req.method==='GET'){
  const user=await adminSession(req,env);return user?reply({ok:true,user}):reply({error:'Entre como administrador.'},401);
 }
 if(path==='/api/admin/clientes'&&req.method==='GET'){
  if(!await adminSession(req,env))return reply({error:'Acesso restrito ao administrador.'},401);
  const q=(url.searchParams.get('q')||'').trim().slice(0,80),page=Number(url.searchParams.get('pagina')||'1');
  if(!Number.isSafeInteger(page)||page<1||page>100000)return reply({error:'Página inválida.'},400);
  const escape=value=>value.replace(/[\\%_]/g,'\\$&'),digits=/^[\d\s()+.-]+$/.test(q)?q.replace(/\D/g,''):'',params=[q,'%'+escape(q)+'%',digits,'%'+digits+'%'];
  const where="(?1='' OR name LIKE ?2 ESCAPE '\\' OR (?3<>'' AND phone LIKE ?4))";
  const {total}=await env.DB.prepare('SELECT count(*) AS total FROM customers').first();
  const {filtered}=await env.DB.prepare('SELECT count(*) AS filtered FROM customers WHERE '+where).bind(...params).first();
  const {results}=await env.DB.prepare('SELECT name,phone FROM customers WHERE '+where+' ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?5').bind(...params,(page-1)*50).all();
  return reply({ok:true,customers:results,total,filtered,page,pages:Math.max(1,Math.ceil(filtered/50))});
 }
 if(!['/api/admin/configurar','/api/admin/entrar','/api/admin/sair'].includes(path)||req.method!=='POST')return reply({error:'Página não encontrada.'},404);
 if(req.headers.get('origin')!==url.origin)return reply({error:'Solicitação inválida.'},403);
 if(path==='/api/admin/sair'){await revokeAdmin(req,env);return reply({ok:true},200,{'set-cookie':cookie('',0)});}
 if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Solicitação inválida.'},415);
 if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'Dados muito longos.'},413);
 const raw=await req.text();if(raw.length>2048)return reply({error:'Dados muito longos.'},413);
 let input;try{input=JSON.parse(raw);}catch{return reply({error:'Confira os dados informados.'},400);}
 if(await limited(req,env))return reply({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'},429);
 const phone=phoneOf(input?.phone),password=input?.password;
 if(path==='/api/admin/configurar'){
  if(phone!==ADMIN_PHONE||typeof input?.token!=='string'||!equal(await digest(input.token),env.REBECA_ADMIN_SETUP_HASH))return reply({error:'Link de configuração inválido ou telefone não autorizado.'},403);
  if(!validPassword(password))return reply({error:'Crie uma senha com 12 a 128 caracteres.'},400);
  const exists=await env.DB.prepare('SELECT phone FROM admin_credentials WHERE phone=?1').bind(ADMIN_PHONE).first();
  if(exists)return reply({error:'A senha administrativa já foi configurada. Entre com sua senha.'},409);
  const salt=random(),derived=await passwordHash(password,salt,env.REBECA_ADMIN_PEPPER);
  // Atomic insert prevents a reused invite from replacing an existing password.
  const saved=await env.DB.prepare('INSERT INTO admin_credentials(phone,password_salt,password_hash,created_at) VALUES(?1,?2,?3,?4) ON CONFLICT(phone) DO NOTHING RETURNING phone').bind(ADMIN_PHONE,salt,derived,Date.now()).first();
  if(!saved)return reply({error:'A senha administrativa já foi configurada. Entre com sua senha.'},409);
  return issue(req,env);
 }
 const row=await env.DB.prepare('SELECT password_salt,password_hash FROM admin_credentials WHERE phone=?1').bind(ADMIN_PHONE).first();
 if(phone!==ADMIN_PHONE||!validPassword(password)||!row)return reply({error:'Telefone ou senha inválidos.'},401);
 const actual=await passwordHash(password,row.password_salt,env.REBECA_ADMIN_PEPPER);
 if(!equal(actual,row.password_hash))return reply({error:'Telefone ou senha inválidos.'},401);
 return issue(req,env);
}
