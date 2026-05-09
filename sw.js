const CACHE_NAME = 'english-recap-v1';
const ASSETS = ['./', './index.html', './vocab.html', './review.html', './styles.css', './app.js', './manifest.json', './data/articles.json'];
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
