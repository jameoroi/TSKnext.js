const VERSION = 'tsk-next-sw-v3';
const CACHE = `${VERSION}-assets`;
const IMMUTABLE = /^\/_next\/static\//;
const REVALIDATE = /^\/(legacy-assets|media)\//;
const NEVER = /^\/(api|admin|account|checkout|login|owner|operations|supplier|agent)\b/;
const MAX = 300;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add('/offline'))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('tsk-next-sw-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX))) await cache.delete(key);
}

async function first(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

async function swr(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone()).then(() => trim(cache));
      return response;
    })
    .catch(() => hit);
  return hit || fresh;
}

async function navigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    return (await cache.match('/offline')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(navigation(request));
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NEVER.test(url.pathname)) return;
  if (IMMUTABLE.test(url.pathname)) event.respondWith(first(request));
  else if (REVALIDATE.test(url.pathname)) event.respondWith(swr(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'tsk-sw-flush')
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
});
