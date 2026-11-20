/// <reference lib="webworker" />
import {assets, immutable} from '$app/manifest';
const worker = self as unknown as ServiceWorkerGlobalScope;
const scope = new URL(worker.registration.scope);
const paths = [...assets, ...immutable].map(item=>new URL(item.path.replace(/^\//,''),scope).pathname);
const prefix='rai-app-'+scope.pathname+'-';
const version=paths.join('|').split('').reduce((hash,char)=>Math.imul(hash,31)+char.charCodeAt(0)|0,0);
const key=prefix+version;
worker.addEventListener('install', event => {
  event.waitUntil(caches.open(key).then(cache => cache.addAll([...new Set([...paths, scope.pathname])])).catch(async error=>{
    await caches.delete(key);
    throw error;
  }));
});
worker.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== key) await caches.delete(name);
    await worker.clients.claim();
  })());
});
worker.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin) return;
  if (paths.includes(url.pathname)) event.respondWith(caches.open(key).then(async cache => await cache.match(url.pathname) ?? fetch(event.request)));
  else if (event.request.mode === 'navigate' && url.pathname === scope.pathname) event.respondWith(fetch(event.request).catch(async () => await (await caches.open(key)).match(scope.pathname) ?? Response.error()));
});
