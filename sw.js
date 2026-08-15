const CACHE_NAME = 'gemaweya-v18';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate' ||
    (event.request.destination === 'document');

  if (isNavigation) {
    // Network-first for the HTML page so updates show up immediately.
    // Falls back to the cached copy only when offline.
    event.respondWith(
      fetch(event.request).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(()=>{});
        return res;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets (icons, manifest, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(()=>{});
        return res;
      }).catch(() => cached);
    })
  );
});

/* ---------------- Background notification checks (Periodic Background Sync) ----------------
   Only fires on browsers/platforms that support it (currently: installed PWAs on Android
   Chrome/Edge, when the browser decides the app is "frequently used"). There is no equivalent
   API on iOS/desktop Safari or Firefox, so this cannot bring background notifications there. */
const IDB_NAME = 'gemaweya-kv', IDB_STORE = 'kv';
function idbOpenSW(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGetSW(key){
  try{
    const db = await idbOpenSW();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  }catch(e){ return undefined; }
}
async function idbSetSW(key, value){
  try{
    const db = await idbOpenSW();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }catch(e){}
}
async function checkNotifInBackground(){
  const now = Date.now();
  const hour = new Date().getHours();

  // Meal reminder: awake hours, nothing logged in the last 4 hours
  const lastMealTime = (await idbGetSW('last_meal_time')) || 0;
  const bgLastMealNotif = (await idbGetSW('bg_last_meal_notif')) || 0;
  if(hour>=8 && hour<=23 && now - lastMealTime >= 4*60*60*1000 && now - bgLastMealNotif >= 4*60*60*1000){
    await self.registration.showNotification('الجماوية', {
      body: 'وقتها تسجل وجبتك 🍽️', icon: 'icon-192.png', badge: 'icon-192.png'
    });
    await idbSetSW('bg_last_meal_notif', now);
  }

  // Water reminder: every ~2 hours
  const bgLastWaterNotif = (await idbGetSW('bg_last_water_notif')) || 0;
  if(now - bgLastWaterNotif >= 2*60*60*1000){
    await self.registration.showNotification('الجماوية', {
      body: 'خد شوية مياه دلوقتي 💧', icon: 'icon-192.png', badge: 'icon-192.png'
    });
    await idbSetSW('bg_last_water_notif', now);
  }
}
self.addEventListener('periodicsync', (event) => {
  if(event.tag === 'gemaweya-notif-check'){
    event.waitUntil(checkNotifInBackground());
  }
});
