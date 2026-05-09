const CACHE_NAME = 'english-recap-v2';
const ASSETS = [
  '/english-recap-app/',
  '/english-recap-app/index.html',
  '/english-recap-app/vocab.html',
  '/english-recap-app/review.html',
  '/english-recap-app/styles.css',
  '/english-recap-app/app.js',
  '/english-recap-app/manifest.json',
  '/english-recap-app/data/articles.json'
];
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function(cache) { return cache.addAll(ASSETS); }));
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener('fetch', function(e) {
  e.respondWith(fetch(e.request).then(function(r) {
    if(r.status === 200) { caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, r.clone()); }); }
    return r;
  }).catch(function(){ return caches.match(e.request); }));
});
