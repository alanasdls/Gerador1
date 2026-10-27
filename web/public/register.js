const form=document.getElementById('registrationForm'),button=document.getElementById('registerButton'),status=document.getElementById('registrationStatus');
form.addEventListener('submit',async event=>{
 event.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='Preparando seu acesso...';
 try{const r=await fetch('/api/cadastro',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:form.elements.name.value,phone:form.elements.phone.value}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Não foi possível concluir o cadastro.');location.assign('/painel');}
 catch(error){status.textContent=error.name==='TimeoutError'?'A conexão demorou. Tente novamente.':error.message;button.disabled=false;}
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
