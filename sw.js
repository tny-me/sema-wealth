// SEMA FinanceOS — Service Worker
// Maneja notificaciones persistentes aunque la app esté cerrada

const CACHE_NAME = 'sema-v1';
const NOTIF_ALARM_KEY = 'sema_notif_alarms';

// ── Instalación ──
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── Recibir mensajes de la app ──
// La app le manda los datos de pagos al SW para que los programe
self.addEventListener('message', e => {
  if(e.data?.type === 'PROGRAMAR_NOTIFS'){
    programarAlarmas(e.data.alarmas);
  }
  if(e.data?.type === 'CANCELAR_NOTIFS'){
    cancelarAlarmas();
  }
  if(e.data?.type === 'NOTIF_PRUEBA'){
    self.registration.showNotification('SEMA — Prueba ✅', {
      body: e.data.body || 'Las notificaciones están funcionando correctamente.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'sema-prueba',
      data: { url: self.location.origin }
    });
  }
});

// ── Programar alarmas usando setTimeout dentro del SW ──
let _timers = [];

function cancelarAlarmas(){
  _timers.forEach(t => clearTimeout(t));
  _timers = [];
}

function programarAlarmas(alarmas){
  cancelarAlarmas();
  if(!alarmas || !alarmas.length) return;

  const now = Date.now();
  alarmas.forEach(alarma => {
    const ms = alarma.timestamp - now;
    // Solo programar si es en los próximos 7 días y en el futuro
    if(ms > 0 && ms < 7 * 24 * 60 * 60 * 1000){
      const t = setTimeout(() => {
        self.registration.showNotification(alarma.titulo, {
          body: alarma.cuerpo,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: alarma.tag || 'sema-notif',
          requireInteraction: alarma.urgente || false,
          data: { url: self.location.origin }
        });
      }, ms);
      _timers.push(t);
    }
  });

  // Guardar en IndexedDB para sobrevivir reinicio del SW
  guardarAlarmasIDB(alarmas);
}

// ── Recuperar alarmas al despertar el SW ──
self.addEventListener('activate', e => {
  e.waitUntil(
    recuperarAlarmasIDB().then(alarmas => {
      if(alarmas && alarmas.length) programarAlarmas(alarmas);
    })
  );
});

// ── Click en notificación — abrir la app ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || self.location.origin;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.startsWith(url));
      if(existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── IndexedDB helpers ──
function getIDB(){
  return new Promise((res, rej) => {
    const req = indexedDB.open('sema_sw', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('alarmas', { keyPath: 'tag' });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e);
  });
}

async function guardarAlarmasIDB(alarmas){
  try {
    const db = await getIDB();
    const tx = db.transaction('alarmas', 'readwrite');
    const store = tx.objectStore('alarmas');
    store.clear();
    alarmas.forEach(a => store.put(a));
  } catch(e){}
}

async function recuperarAlarmasIDB(){
  try {
    const db = await getIDB();
    const tx = db.transaction('alarmas', 'readonly');
    const store = tx.objectStore('alarmas');
    return new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => res([]);
    });
  } catch(e){ return []; }
}
