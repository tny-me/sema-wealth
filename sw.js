// SEMA FinanceOS — Service Worker
// Cambia VERSION cada vez que subas cambios a GitHub
const VERSION = '1.0.4';
const CACHE   = 'sema-' + VERSION;

const ARCHIVOS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => k.startsWith('sema-') && k !== CACHE)
              .map(k => caches.delete(k))
        )
      ),
      recuperarAlarmasIDB().then(alarmas => {
        if(alarmas && alarmas.length) programarAlarmas(alarmas);
      }),
      clients.claim()
    ])
  );
});

// Network First para index.html, Cache First para el resto
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;

  if(url.pathname === '/' || url.pathname.endsWith('index.html')){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Mensajes desde la app
self.addEventListener('message', e => {
  if(e.data?.type === 'PROGRAMAR_NOTIFS') programarAlarmas(e.data.alarmas);
  if(e.data?.type === 'CANCELAR_NOTIFS')  cancelarAlarmas();
  if(e.data?.type === 'NOTIF_PRUEBA'){
    self.registration.showNotification('SEMA — Prueba ✅', {
      body: e.data.body || 'Las notificaciones están funcionando.',
      icon: '/icon-192.png', tag: 'sema-prueba',
      data: { url: self.location.origin }
    });
  }
  if(e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if(e.data?.type === 'GET_VERSION'){
    e.source?.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

// Notificaciones
let _timers = [];
function cancelarAlarmas(){ _timers.forEach(t=>clearTimeout(t)); _timers=[]; }
function programarAlarmas(alarmas){
  cancelarAlarmas();
  if(!alarmas||!alarmas.length) return;
  const now = Date.now();
  alarmas.forEach(a => {
    const ms = a.timestamp - now;
    if(ms>0 && ms<30*24*60*60*1000){
      const t = setTimeout(()=>{
        self.registration.showNotification(a.titulo,{
          body:a.cuerpo, icon:'/icon-192.png', badge:'/icon-192.png',
          tag:a.tag||'sema-notif', requireInteraction:a.urgente||false,
          data:{url:self.location.origin}
        });
      }, ms);
      _timers.push(t);
    }
  });
  guardarAlarmasIDB(alarmas);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      const ex = list.find(c=>c.url.startsWith(self.location.origin));
      if(ex) return ex.focus();
      return clients.openWindow(self.location.origin);
    })
  );
});

function getIDB(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open('sema_sw',1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('alarmas',{keyPath:'tag'});
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e);
  });
}
async function guardarAlarmasIDB(alarmas){
  try{
    const db=await getIDB();
    const tx=db.transaction('alarmas','readwrite');
    const s=tx.objectStore('alarmas');
    s.clear(); alarmas.forEach(a=>s.put(a));
  }catch(e){}
}
async function recuperarAlarmasIDB(){
  try{
    const db=await getIDB();
    const tx=db.transaction('alarmas','readonly');
    const s=tx.objectStore('alarmas');
    return new Promise(res=>{ const r=s.getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>res([]); });
  }catch(e){return [];}
}
