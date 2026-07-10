const cacheVersion = "__CACHE_VERSION__";
const precachePaths = /* __PRECACHE_ASSETS__ */ [];

const appScope = self.registration.scope;
const cachePrefix = `neuro-precache:${appScope}:`;
const cacheName = `${cachePrefix}${cacheVersion}`;
const legacyRuntimeCache = `neuro-runtime:${appScope}`;
const appShellUrl = new URL("index.html", appScope).href;
const precacheUrls = precachePaths.map((path) => new URL(path, appScope).href);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) =>
      cache.addAll(
        precacheUrls.map(
          (url) => new Request(url, { cache: "reload", credentials: "same-origin" })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== cacheName &&
                (key.startsWith(cachePrefix) || key === legacyRuntimeCache)
            )
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(cacheName);
  let networkResponse = null;

  try {
    // Keep this versioned precache immutable. Mixing a newly deployed index
    // into an older cache can strand that index without its new hashed assets.
    // The next Service Worker installs the complete new version atomically.
    networkResponse = await fetch(request);
    if (networkResponse.ok) return networkResponse;
  } catch {
    // A rejected fetch and a temporary non-2xx response both fall through to
    // the internally consistent install-time precache below.
  }

  const cached = await cache.match(request);
  if (cached) return cached;

  if (request.mode === "navigate") {
    const appShell = await cache.match(appShellUrl);
    if (appShell) return appShell;
  }

  return networkResponse || Response.error();
}
