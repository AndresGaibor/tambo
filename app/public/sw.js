// Service worker de producción: red-primero para la navegación (el shell
// nunca queda viejo) y cache para recursos estáticos y capturas. /api/* y
// las rutas del servidor de desarrollo pasan siempre a la red; en desarrollo
// no se registra.
const CACHE = "tambo-v2";
const SHELL = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return;

  // Navegación y bundle: red primero, cache como respaldo sin conexión.
  // Así una actualización del portal llega al siguiente arranque.
  const networkFirst =
    event.request.mode === "navigate" ||
    url.pathname === "/" ||
    /\.(js|mjs|css|webmanifest)$/.test(url.pathname);

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => void cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  // Imágenes y estáticos: cache con revalidación en segundo plano.
  const cacheable =
    url.pathname === "/icon.svg" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/shots/") ||
    url.pathname.startsWith("/assets/");
  if (!cacheable) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void cache.put(event.request, copy);
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
