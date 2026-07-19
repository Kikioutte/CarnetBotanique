/* Service worker — L'Herbier de Vie
   Stratégies :
   - Coquille applicative (HTML/CSS/JS/données) : pré-cachée à l'installation, servie cache-first.
   - Navigation : network-first (on récupère la dernière version si en ligne), repli cache hors-ligne.
   - Images & polices tierces (Wikimedia, Unsplash, Google Fonts) : stale-while-revalidate plafonné.

   Mise à jour :
   - SHELL_HASH est l'empreinte du contenu des fichiers de SHELL. Elle DOIT changer à chaque
     modification de la coquille (HTML/CSS/JS/manifest/icônes) — c'est ce changement d'octets de
     sw.js qui déclenche la réinstallation du worker chez les visiteurs. Le contrôle
     `npm run test:sw-version:strict` (bloquant en CI) échoue si l'empreinte est périmée ;
     `node scripts/check-sw-version.mjs --fix` la met à jour.
   - Le nouveau worker attend (pas de skipWaiting automatique) : la page propose « Mettre à
     jour » et envoie {type:'SKIP_WAITING'} ; à l'activation, les anciens caches hdv-* sont
     supprimés et clients.claim() reprend la main. Les données utilisateur (localStorage,
     IndexedDB, photos, progression) ne sont jamais touchées : seuls les caches techniques
     hdv-* de l'application sont supprimés. */
'use strict';

const VERSION = 'hdv-v10';
const SHELL_HASH = 'ae5577b36125'; // empreinte du shell — voir scripts/check-sw-version.mjs --fix
const CACHE_PREFIX = 'hdv-';
const SHELL_CACHE = VERSION + '-' + SHELL_HASH + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';
const RUNTIME_MAX_ENTRIES = 260;

// Phase 7 — les polices auto-hébergées (fonts/*.woff2) font partie du SHELL :
// la typographie complète fonctionne hors-ligne dès l'installation, sans
// dépendre de fonts.gstatic.com.
const SHELL = [
  './',
  'index.html',
  'dist/styles.min.css',
  'dist/icons.min.css',
  'dist/app.min.js',
  'plants.json',
  'especes.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/cormorant-garamond-latin.woff2',
  'fonts/cormorant-garamond-latin-ext.woff2',
  'fonts/cormorant-garamond-italic-latin.woff2',
  'fonts/cormorant-garamond-italic-latin-ext.woff2',
  'fonts/montserrat-latin.woff2',
  'fonts/montserrat-latin-ext.woff2'
];

self.addEventListener('install', function (e) {
  // Pas de skipWaiting ici : le worker installé attend que la page le lui demande
  // (bouton « Mettre à jour »), ou prend la main naturellement à la visite suivante
  // quand plus aucun onglet n'est contrôlé par l'ancien worker.
  e.waitUntil(caches.open(SHELL_CACHE).then(function (c) { return c.addAll(SHELL); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        // Ne supprime que les caches techniques de l'application (préfixe hdv-),
        // jamais autre chose ; localStorage/IndexedDB ne sont pas des caches et
        // ne sont pas concernés.
        return k.indexOf(CACHE_PREFIX) === 0 && k !== SHELL_CACHE && k !== RUNTIME_CACHE;
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

  // Navigation : network-first avec repli cache (mode hors-ligne).
  // La réponse est mise en cache sous l'URL réellement demandée (l'ancienne version
  // écrasait l'entrée 'index.html' avec n'importe quelle page, ex. especes.html).
  if (req.mode === 'navigate') {
    e.respondWith(
      (async function () {
        try {
          const res = await fetch(req);
          // Une erreur HTTP ne doit jamais remplacer une page hors-ligne valide.
          // L'écriture est attendue dans respondWith : le worker ne peut pas être
          // interrompu avant la fin du cache.put().
          if (res.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(req, res.clone());
          }
          return res;
        } catch (err) {
          const hit = await caches.match(req, { ignoreSearch: true });
          return hit || caches.match('index.html', { ignoreSearch: true });
        }
      }())
    );
    return;
  }

  // Coquille locale : cache-first. Sûr uniquement parce que SHELL_CACHE change de nom
  // (via SHELL_HASH) dès qu'un fichier du shell change — contrôlé en CI.
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
