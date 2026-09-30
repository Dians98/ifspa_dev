import "server-only";

// Vérification anti-robot Cloudflare Turnstile (gratuit).
// Doc : https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// Variables d'environnement :
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY  clé publique (widget)
//   TURNSTILE_SECRET_KEY            clé secrète (vérification serveur)
// En développement sans clés, on utilise les clés de test officielles qui valident toujours.

const CLE_SECRETE_TEST = "1x0000000000000000000000000000000AA";

function cleSecrete() {
  const cle = process.env.TURNSTILE_SECRET_KEY;
  if (cle) return cle;
  if (process.env.NODE_ENV !== "production") return CLE_SECRETE_TEST;
  throw new Error("TURNSTILE_SECRET_KEY doit être défini en production.");
}

export async function verifierTurnstile(jeton: string, ip?: string | null): Promise<boolean> {
  if (!jeton) return false;
  const corps = new FormData();
  corps.append("secret", cleSecrete());
  corps.append("response", jeton);
  if (ip) corps.append("remoteip", ip);

  try {
    const reponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: corps,
      signal: AbortSignal.timeout(10_000),
    });
    const donnees = (await reponse.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!donnees.success) console.warn("[turnstile] refusé", donnees["error-codes"]);
    return donnees.success === true;
  } catch (erreur) {
    console.error("[turnstile] vérification impossible", erreur);
    return false;
  }
}
