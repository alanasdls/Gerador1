// Remove the previous offline cache, which included pages before registration.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('gerador-rebeca'))await caches.delete(name);await self.clients.claim();})()));
// Pages and API responses use the network; customer data is never cached here.
