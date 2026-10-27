const $=id=>document.getElementById(id);
const menu=$('adminMenu'),menuOpener=$('openAdminMenu');
menuOpener.onclick=()=>{menu.showModal();menuOpener.setAttribute('aria-expanded','true');};
$('closeAdminMenu').onclick=()=>menu.close();
menu.addEventListener('close',()=>menuOpener.setAttribute('aria-expanded','false'));
menu.addEventListener('click',event=>{if(event.target===menu){const rect=menu.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)menu.close();}else if(event.target.closest('a'))menu.close();});
$('adminCurrentPage').onclick=()=>{menu.close();window.scrollTo(0,0);};
$('adminMenuLogout').onclick=()=>{menu.close();$('adminLogout').click();};
let setupToken=new URLSearchParams(location.hash.slice(1)).get('configurar')||'';
if(setupToken)history.replaceState(null,'',location.pathname);
let page=1,pages=1,query='',controller;
const phoneText=phone=>phone.replace(/^55(\d{2})(\d{5})(\d{4})$/,'($1) $2-$3');
async function api(route,options={}){const r=await fetch('/api/admin/'+route,{cache:'no-store',...options}),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Não foi possível concluir a consulta.'),{status:r.status});return data;}
function authView(){
 $('adminMenuLogout').hidden=true;
 $('adminCustomers').hidden=true;$('adminAuth').hidden=false;$('customersRows').replaceChildren();$('customerCount').textContent='';
 const setup=!!setupToken;$('authTitle').textContent=setup?'Crie sua senha administrativa':'Entrar como administrador';$('authHint').textContent=setup?'Este link é de uso único. Crie uma senha com pelo menos 12 caracteres.':'Use o telefone autorizado e sua senha administrativa.';
 $('authSubmit').textContent=setup?'Criar senha e acessar':'Entrar';$('adminPassword').autocomplete=setup?'new-password':'current-password';$('confirmLabel').hidden=!setup;$('adminConfirm').required=setup;$('setupHint').hidden=setup;
}
function privateView(){setupToken='';$('adminAuth').hidden=true;$('adminCustomers').hidden=false;$('adminPassword').value='';$('adminConfirm').value='';$('adminMenuLogout').hidden=false;}
function controls(loading){$('previousPage').disabled=loading||page<=1;$('nextPage').disabled=loading||page>=pages;$('customerRefresh').disabled=loading;}
async function customers(){
 controller?.abort();const active=new AbortController();controller=active;controls(true);$('customersStatus').textContent='Consultando cadastros…';$('customersRows').replaceChildren();$('customersEmpty').hidden=true;
 try{const d=await api('clientes?pagina='+page+'&q='+encodeURIComponent(query),{signal:active.signal});if(controller!==active)return;
  pages=d.pages;$('customerCount').textContent=d.total+' cadastros no total'+(query?' · '+d.filtered+' encontrados':'');$('pageCount').textContent='Página '+page+' de '+pages;
  for(const person of d.customers){const row=document.createElement('tr'),name=document.createElement('td'),phone=document.createElement('td');name.textContent=person.name;phone.textContent=phoneText(person.phone);row.append(name,phone);$('customersRows').append(row);}
  $('customersEmpty').hidden=d.customers.length>0;$('customersStatus').textContent='Lista atualizada.';
 }catch(error){if(active.signal.aborted)return;if(error.status===401){authView();$('authStatus').textContent='Sua sessão administrativa terminou. Entre novamente.';}else $('customersStatus').textContent=error.message;}
 finally{if(controller===active)controls(false);}
}
$('adminAuthForm').onsubmit=async event=>{
 event.preventDefault();if(setupToken&&$('adminPassword').value!==$('adminConfirm').value){$('authStatus').textContent='As senhas não conferem.';return;}
 $('authSubmit').disabled=true;$('authStatus').textContent='Verificando acesso…';
 try{await api(setupToken?'configurar':'entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:$('adminPhone').value,password:$('adminPassword').value,...(setupToken?{token:setupToken}:{})})});privateView();page=1;query='';$('customerSearch').value='';await customers();}
 catch(error){$('authStatus').textContent=error.message;if(error.status===409){setupToken='';authView();}}
 finally{$('authSubmit').disabled=false;}
};
$('customerSearchForm').onsubmit=event=>{event.preventDefault();query=$('customerSearch').value.trim();page=1;customers();};
$('customerRefresh').onclick=()=>customers();$('previousPage').onclick=()=>{if(page>1){page--;customers();}};$('nextPage').onclick=()=>{if(page<pages){page++;customers();}};
$('adminLogout').onclick=async()=>{controller?.abort();$('adminLogout').disabled=true;$('adminMenuLogout').disabled=true;try{await api('sair',{method:'POST'});authView();$('authStatus').textContent='Você saiu da administração.';}catch(error){$('customersStatus').textContent=error.message;}finally{$('adminLogout').disabled=false;$('adminMenuLogout').disabled=false;}};
authView();
window.addEventListener('hashchange',()=>{const incoming=new URLSearchParams(location.hash.slice(1)).get('configurar');if(incoming){controller?.abort();setupToken=incoming;history.replaceState(null,'',location.pathname);authView();}});
async function start(){try{await api('session');privateView();await customers();}catch(error){if(error.status!==401)$('authStatus').textContent='Não foi possível verificar o acesso. Tente entrar novamente.';}}
// Never retain a cached customer list when restoring this page from browser history.
window.addEventListener('pagehide',()=>{controller?.abort();$('customersRows').replaceChildren();$('customerCount').textContent='';});
window.addEventListener('pageshow',()=>{if(!setupToken)start();});
fetch('/api/session',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.user?.adminEligible)$('adminPhone').value=phoneText(d.user.phone);}).catch(()=>{});
