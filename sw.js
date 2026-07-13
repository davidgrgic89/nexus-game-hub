/* Nexus Game Hub — app-shell service worker.
 *
 * Replaces the old no-op worker with a real one:
 *  - Precaches the app shell on install so the site works fully offline.
 *  - Network-first for same-origin GETs: online visitors always get the latest
 *    HTML/JS/CSS (no stale-shell surprises after a deploy), while offline
 *    visitors fall back to the cached copy (navigations fall back to index.html).
 *  - Leaves cross-origin traffic (Steam CDN images, CheapShark API) and our own
 *    /api/ serverless proxy (Cloudflare Pages Function) completely untouched —
 *    those must always hit the network so deals/screenshots are never served stale.
 *
 * Bump CACHE when the shell asset list changes to retire old caches.
 */
const CACHE = 'nexus-shell-v2';
const SHELL = ['./', './index.html', './app.js', './styles.css', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // a single 404 shouldn't block activation
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  // Only cache clean, same-origin 200s. Skip opaque/partial/errored responses.
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  caches.open(CACHE).then((c) => c.put(request, response)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Cross-origin (Steam images, APIs) and the serverless proxy: hit the network
  // directly, no caching — these must stay fresh.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Network-first with cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => { putInCache(req, res.clone()); return res; })
      .catch(() => caches.match(req).then(
        (hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
      ))
  );
});
