/* LocalMind service worker: caches the app shell and same-origin assets.
   Model weights are deliberately not precached and never handled here: they
   are fetched by WebLLM on explicit request and stored in OPFS.

   It also enforces offline ("kill switch") mode: when the marker exists in
   Cache Storage, every cross-origin request is refused, whatever its method.
   That marker is written by the page (src/offline.ts), which shares this
   origin's Cache Storage. */

/* Two caches on purpose. Files under /assets/ carry a content hash in their name,
   so a new deploy never reuses an old URL: those entries stay valid forever and
   wiping them on every update only forces a re-download. The shell (index.html,
   manifest, icons) must be replaced on each update, so it lives in its own cache
   named after the app version. */
const SHELL_CACHE = "localmind-shell-v3";
const ASSET_CACHE = "localmind-assets-v1";
const OFFLINE_MODE_CACHE = "localmind-offline-mode";
const OFFLINE_MODE_KEY = "/__localmind-offline-mode__";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL);
      await cacheAssetLinks();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE && key !== OFFLINE_MODE_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function offlineModeEnabled() {
  try {
    const cache = await caches.open(OFFLINE_MODE_CACHE);
    return Boolean(await cache.match(OFFLINE_MODE_KEY));
  } catch {
    return false;
  }
}

function blockedResponse() {
  return new Response(
    JSON.stringify({
      error: "Offline mode is on. LocalMind blocked a request that would leave this page.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/sw.js")) return;

  // Cross-origin traffic is checked for every method: a POST beacon must not
  // slip past just because the cache below only handles GET.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      (async () => {
        if (await offlineModeEnabled()) return blockedResponse();
        return fetch(request);
      })(),
    );
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// Vite sets `Vary: Origin` on assets, but install stores them without an Origin
// header while module scripts send one. Ignore Vary for this same-origin cache.
async function matchCached(cache, request) {
  const direct = await cache.match(request);
  if (direct) return direct;
  return cache.match(request, { ignoreVary: true });
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const fallback = async () =>
    (await matchCached(cache, request)) ||
    (await matchCached(cache, "./index.html")) ||
    (await matchCached(cache, "./")) ||
    new Response("Offline and the app shell is not cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      return response;
    }
    // Some proxies answer with 5xx instead of a network error when the host is down.
    if (response.status >= 500) return fallback();
    return response;
  } catch {
    return fallback();
  }
}

/** A content-hashed build artifact. Its URL changes whenever its bytes change. */
function isImmutableAsset(url) {
  return url.pathname.includes("/assets/") && /-[\w-]{8,}\.(?:js|css|woff2?)$/.test(url.pathname);
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await matchCached(cache, request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // `await` the write: a service worker can be stopped as soon as it responds.
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Asset unavailable offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await matchCached(cache, request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const response = await network;
  if (response) return response;

  return new Response("Asset unavailable offline.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Read index.html after install and cache the hashed entry script and stylesheet.
async function cacheAssetLinks() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  try {
    const response = await fetch("./index.html", { cache: "reload" });
    if (!response.ok) return;
    const html = await response.text();
    const urls = new Set();

    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const value = match[1];
      if (!value.startsWith("./")) continue;
      if (value.endsWith("manifest.webmanifest")) continue;
      urls.add(new URL(value, self.registration.scope).href);
    }

    await Promise.all(
      [...urls].map(async (url) => {
        try {
          const asset = await fetch(url, { cache: "reload" });
          if (!asset.ok) return;
          // Hashed build output is immutable; everything else belongs to the shell.
          const target = isImmutableAsset(new URL(url)) ? assets : shell;
          await target.put(url, asset);
        } catch {
          // Best effort; runtime caching covers the next request.
        }
      }),
    );
  } catch {
    // Offline during install is fine; the shell is already cached.
  }
}
