// Service worker de Tambo.
//
// Desarrollo: el tráfico del servidor de desarrollo (módulos de origen,
// HMR, dependencias) pasa SIEMPRE a la red: nunca se cachea ni se
// responde desde caché, así que el HMR no se toca.
//
// Offline: el shell construido (TAMBO_SHELL=1 pnpm build, servido en
// /shell/) se guarda para poder iniciar sin servidor; su HTML se
// revalida en cada visita en línea y los assets con hash son
// inmutables. Las respuestas de /api/* jamás se guardan ni se sirven
// como comprobaciones actuales.
const CACHE = "tambo-v3";
const SHELL_CACHE = "tambo-shell-v1";
const SHELL_URL = "/shell/";
const SHELL = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(async () => {
        // El shell puede no existir todavía (sin build): se intenta sin
        // romper la instalación. Se pre-cachean también sus assets,
        // extraídos del HTML construido.
        try {
          const response = await fetch(SHELL_URL);
          if (!response.ok) return;
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(SHELL_URL, response.clone());
          const html = await response.text();
          const urls = [...html.matchAll(/(?:src|href)="(\/shell\/[^"]+)"/g)].map((m) => m[1]);
          if (urls.length) await cache.addAll(urls);
        } catch {}
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Tráfico del servidor de desarrollo: jamás interceptado.
function esDev(url) {
  return (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.includes("/node_modules/") ||
    url.pathname.endsWith(".ts") ||
    url.pathname.endsWith(".tsx") ||
    url.searchParams.has("t") ||
    url.searchParams.has("import")
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (esDev(url)) return;

  // Navegación: red primero; sin red, la última visita o el shell.
  if (event.request.mode === "navigate" || url.pathname === "/") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => void cache.put(event.request, copy));
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(event.request)) ??
            (await caches.match(SHELL_URL, { cacheName: SHELL_CACHE })) ??
            Response.error(),
        ),
    );
    return;
  }

  // Shell construido: HTML revalidado, assets inmutables cache-first.
  if (url.pathname === SHELL_URL || url.pathname === "/shell") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => void cache.put(SHELL_URL, copy));
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(SHELL_URL, { cacheName: SHELL_CACHE })) ?? Response.error(),
        ),
    );
    return;
  }
  if (url.pathname.startsWith("/shell/assets/")) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          const copy = response.clone();
          void cache.put(event.request, copy);
        }
        return response;
      }),
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
