// Service worker de l'app compagnon : l'app s'ouvre même sans réseau.
// - pages : réseau d'abord (toujours la dernière version), cache en secours ;
// - fichiers du build (noms hachés) : cache d'abord ;
// - jamais de mise en cache des appels OneDrive / Microsoft (autres origines).
const BUILD = "2026-10-08T15:41:26.625Z";
const CACHE = `bp-mobile-${BUILD}`;
const PRECACHE = ["assets/plus-jakarta-sans-latin-wght-normal-eXO_dkmS.woff2","assets/plus-jakarta-sans-latin-ext-wght-normal-DmpS2jIq.woff2","assets/inter-latin-wght-normal-Dx4kXJAl.woff2","assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","assets/index-abRNHCQg.css","assets/index-BZVr5H-E.js","assets/onedrive-nRxoc0s9.js","assets/jsQR-BSMHczVO.js","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png"];

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
