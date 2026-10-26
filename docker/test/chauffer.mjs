// Fait compiler chaque page par `next dev` avant les E2E : une première compilation dans le conteneur dépasse
// souvent les 30 s d'un test. Les pages /app exigent une session, d'où la connexion admin du seed.
const BASE = "http://localhost:3100";
const PAGES = [
  "/",
  "/connexion",
  "/app/dashboard",
  "/app/encaisser",
  "/app/etudiants",
  "/app/etudiants/nouveau",
  "/app/etudiants/inexistant",
  "/app/etudiants/inexistant/modifier",
  "/app/impayes",
  "/app/paiements",
  "/app/paiements/inexistant/recu",
  "/app/admissions",
  "/app/admissions/historique",
  "/app/parametres",
  "/app/parametres/annees",
  "/app/parametres/filieres",
  "/app/parametres/tarifs",
  "/app/parametres/utilisateurs",
  "/app/parametres/import",
  "/app/page-introuvable",
];

async function attendreServeur() {
  const fin = Date.now() + 180_000;
  while (Date.now() < fin) {
    try {
      if ((await fetch(`${BASE}/connexion`)).status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("next dev ne répond pas sur 3100.");
}

async function cookieAdmin() {
  const reponse = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }),
  });
  if (!reponse.ok) throw new Error(`Connexion admin refusée (${reponse.status}).`);
  return reponse.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

await attendreServeur();
const cookie = await cookieAdmin();
for (const page of PAGES) {
  const debut = Date.now();
  const { status } = await fetch(`${BASE}${page}`, { headers: { cookie }, redirect: "manual" });
  console.log(`${String(status).padEnd(4)} ${page} (${((Date.now() - debut) / 1000).toFixed(1)} s)`);
}
