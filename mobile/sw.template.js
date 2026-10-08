// Service worker de l'app compagnon : l'app s'ouvre même sans réseau.
// - pages : réseau d'abord (toujours la dernière version), cache en secours ;
// - fichiers du build (noms hachés) : cache d'abord ;
// - jamais de mise en cache des appels OneDrive / Microsoft (autres origines).
const BUILD = "__BUILD__";
const CACHE = `bp-mobile-${BUILD}`;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["./", ...PRECACHE]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(cles.filter((k) => k.startsWith("bp-mobile-") && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copie = r.clone();
            caches.open(CACHE).then((c) => c.put("./", copie));
          }
          return r;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (trouve) =>
        trouve ||
        fetch(req).then((r) => {
          if (r.ok) {
            const copie = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copie));
          }
          return r;
        })
    )
  );
});
