// Service worker de l'écran Encaisser seul (portée /app/encaisser) : la page et ses ressources restent
// disponibles sans Internet. Pas de manifeste, rien à installer. Les données passent par IndexedDB, pas par ce cache.

const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const PREFIXE = "ifspa-encaisser-";
const CACHE = PREFIXE + VERSION;
const PAGE = "/app/encaisser";
// Logo du ticket : absent du HTML tant qu'aucun reçu n'est affiché, donc à précacher explicitement.
const TOUJOURS = ["/brand/logo-ifspa.png"];
// Connexion lente au guichet : on attend le réseau avant de servir la copie en cache.
const DELAI_RESEAU_MS = 8000;

function estStatique(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/brand/");
}

// Page nue seulement (pas `?etudiant=`, qui figerait une situation), jamais une redirection (session expirée).
function pageValide(reponse) {
  if (!reponse.ok || reponse.redirected || reponse.type !== "basic") return false;
  const url = new URL(reponse.url);
  return url.pathname === PAGE && url.search === "";
}

function ressourcesDe(texte, motif) {
  const urls = new Set();
  for (const m of texte.matchAll(motif)) urls.add(m[1].replace(/&amp;/g, "&"));
  return [...urls];
}

async function preCacher() {
  const cache = await caches.open(CACHE);
  const reponse = await fetch(PAGE, { credentials: "same-origin", cache: "no-store" });
  // Échec volontaire de l'installation : l'ancienne version et son cache restent en place.
  if (!pageValide(reponse)) throw new Error("Page Encaisser indisponible : installation reportée.");
  const html = await reponse.clone().text();
  await cache.put(PAGE, reponse);

  // Le HTML contient aussi les chemins échappés du flux RSC (\"/_next/...\") : l'antislash ferme la capture.
  const ressources = ressourcesDe(html, /["'(](\/(?:_next\/static|_next\/image|brand)\/?[^"'()\s\\]*)/g);
  const feuilles = ressources.filter((u) => u.endsWith(".css"));
  for (const feuille of feuilles) {
    const css = await fetch(feuille).then((r) => (r.ok ? r.text() : ""));
    ressources.push(...ressourcesDe(css, /url\((?:["']?)(\/_next\/static\/[^"')]+)/g));
  }
  await Promise.all(
    [...new Set([...TOUJOURS, ...ressources])].map(async (u) => {
      const r = await fetch(u);
      if (r.ok) await cache.put(u, r);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(preCacher().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((n) => n.startsWith(PREFIXE) && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function avecDelai(promesse, ms) {
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => rejeter(new Error("délai")), ms);
    promesse.then(
      (r) => {
        clearTimeout(minuteur);
        resoudre(r);
      },
      (e) => {
        clearTimeout(minuteur);
        rejeter(e);
      },
    );
  });
}

async function servirPage(requete) {
  const cache = await caches.open(CACHE);
  const reseau = fetch(requete);
  try {
    const reponse = await avecDelai(reseau, DELAI_RESEAU_MS);
    if (pageValide(reponse)) await cache.put(PAGE, reponse.clone());
    return reponse;
  } catch {
    const enCache = await cache.match(PAGE);
    if (enCache) return enCache;
    return reseau;
  }
}

async function servirStatique(requete) {
  const cache = await caches.open(CACHE);
  // `/_next/image` répond avec `Vary: Accept` : sans ignoreVary, l'image en cache n'est jamais retrouvée.
  const enCache = await cache.match(requete, { ignoreVary: true });
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok) await cache.put(requete, reponse.clone());
  return reponse;
}

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  // Données (API, RSC) jamais servies depuis le cache : hors ligne, l'écran lit sa copie IndexedDB.
  if (url.pathname.startsWith("/api/") || requete.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (requete.mode === "navigate" && url.pathname === PAGE) {
    event.respondWith(servirPage(requete));
  } else if (estStatique(url)) {
    event.respondWith(servirStatique(requete));
  }
});
