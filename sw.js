/* Service worker — L'Herbier de Vie
   Stratégies :
   - Coquille applicative (HTML/CSS/JS/données) : pré-cachée à l'installation, servie cache-first.
     Incrémenter VERSION à chaque déploiement pour invalider l'ancien cache.
   - Navigation : network-first (on récupère la dernière version si en ligne), repli cache hors-ligne.
   - Images & polices tierces (Wikimedia, Unsplash, Google Fonts) : stale-while-revalidate plafonné. */
'use strict';

const VERSION = 'hdv-v5';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const RUNTIME_MAX_ENTRIES = 260;

const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'css/icons.css',
  'js/app.js',
  'js/extensions-v7.js',
  'js/extensions-v8.js',
  'js/extensions-v9.js',
  'js/extensions-v10.js',
  'plants.json',
  'especes.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf(VERSION) !== 0;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function limitCache(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= RUNTIME_MAX_ENTRIES) return;
    return cache.delete(keys[0]).then(function () { return limitCache(cache); });
  });
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Navigation : network-first avec repli sur l'index en cache (mode hors-ligne)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put('index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('index.html', { ignoreSearch: true });
      })
    );
    return;
  }

  // Coquille locale : cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Ressources tierces mises en cache : images des fiches et polices.
  // Les API (wikipedia/wikidata/gemini) ne sont volontairement PAS interceptées.
  const cacheable =
    url.hostname === 'upload.wikimedia.org' ||
    url.hostname === 'images.unsplash.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (cacheable) {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          const net = fetch(req).then(function (res) {
            if (res.ok || res.type === 'opaque') {
              cache.put(req, res.clone());
              limitCache(cache);
            }
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
  }
});
