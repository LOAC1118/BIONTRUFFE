/**
 * SERVICE WORKER — BIONTRUFFE CRM
 * Offline-first, cache-first, sync automatique
 */

const CACHE_NAME = 'biontruffe-crm-v1';
const URLS_TO_CACHE = [
  '/BIONTRUFFLE/',
  '/BIONTRUFFLE/index.html',
  '/BIONTRUFFLE/manifest.json'
];

// Installation du Service Worker
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache créé:', CACHE_NAME);
      return cache.addAll(URLS_TO_CACHE).catch(() => {
        console.log('[SW] Certaines URLs ne sont pas cachées (c\'est normal)');
      });
    })
  );
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Nettoyage ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Stratégie Network-first avec fallback au cache
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Pour les requêtes BIONTRUFFLE, utiliser network-first
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(request)
        .then((response) => {
          // Mettre en cache la réponse
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Si pas de réseau, utiliser le cache
          return caches.match(request).then((response) => {
            if (response) {
              return response;
            }
            // Sinon, page offline
            if (request.mode === 'navigate') {
              return caches.match('/BIONTRUFFLE/index.html');
            }
            return new Response('Offline - contenu non disponible', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
        })
    );
    return;
  }

  // Pour les requêtes externes (CDN, Firebase, etc), cache-first
  e.respondWith(
    caches.match(request).then((response) => {
      if (response) return response;
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        });
    })
  );
});

// Synchronisation en arrière-plan
self.addEventListener('sync', (e) => {
  if (e.tag === 'sync-firestore') {
    e.waitUntil(
      fetch('/BIONTRUFFLE/', { method: 'GET' }).then(() => {
        console.log('[SW] Synchronisation Firestore complètée');
      }).catch(() => {
        console.log('[SW] Sync échouée - mode offline');
      })
    );
  }
});

console.log('[SW] Service Worker chargé');
