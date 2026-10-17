// Оболочка приложения в кэше: на телефоне в зале связь пропадает, и без этого
// экран не откроется вообще — хотя данные уже лежат в localStorage.
//
// Запросы к воркеру iiko сюда не попадают: он на другом домене, их забирает
// собственный кэш приложения, у которого есть сроки годности по типам данных.

const VERSION = "v1";
const SHELL = `iiko-shell-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname;

const SHELL_URLS = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}icons/icon-192.png`, `${SCOPE}icons/icon-512.png`];

self.addEventListener("install", (event) => {
  // Одна упавшая иконка не должна валить установку целиком.
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: "reload" })))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/** Файлы сборки Vite содержат хеш в имени, поэтому их можно отдавать из кэша без проверки. */
const isHashedAsset = (url) => url.pathname.startsWith(`${SCOPE}assets/`);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return;

  // Страница: сначала сеть, чтобы новая версия доезжала сразу после деплоя.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(SCOPE, copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match(SCOPE)) || Response.error()),
    );
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Иконки и манифест: из кэша, но с фоновым обновлением.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
