// Côté navigateur : inscription du service worker d'Encaisser et purge de ses caches.

const PREFIXE_CACHE = "ifspa-encaisser-";
export const PORTEE_ENCAISSER = "/app/encaisser";

/** En production seulement : en dev, il servirait des pages périmées et gênerait les E2E. */
export async function enregistrerServiceWorker(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const version = process.env.NEXT_PUBLIC_VERSION_BUILD ?? "0";
  try {
    await navigator.serviceWorker.register(`/sw-encaisser.js?v=${version}`, { scope: PORTEE_ENCAISSER });
  } catch {
    // Contexte non sécurisé (http hors localhost) ou navigateur trop ancien : l'écran reste utilisable en ligne.
  }
}

/** À la déconnexion : la page en cache contient des noms d'étudiants. */
export async function viderCachesEncaisser(): Promise<void> {
  if (!("caches" in window)) return;
  const noms = await caches.keys();
  await Promise.all(noms.filter((n) => n.startsWith(PREFIXE_CACHE)).map((n) => caches.delete(n)));
}
