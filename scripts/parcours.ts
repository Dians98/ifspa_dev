// Parcours A-Z (recette/PARCOURS-A-Z.md) : remet la base de dev au point de départ du parcours.
//   pnpm parcours:vider --confirmer                         base de dev (ifspa)
//   pnpm parcours:vider --confirmer --base ifspa_recette    base de recette, pour dérouler le parcours sur le port 3200
// Garde les comptes, les filières et l'établissement ; vide années, tarifs, étudiants, échéances, paiements,
// admissions, blocs de reçus et compteurs (les matricules et les reçus repartent à 0001). Sauvegarde d'abord.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Sans CASCADE : si une table oubliée ici référence l'une d'elles, Postgres refuse au lieu de la vider en silence.
const TABLES = [
  "paiement_ligne",
  "paiement",
  "echeance",
  "ligne_admission",
  "inscription",
  "operation_admission",
  "etudiant",
  "tarif",
  "annee_scolaire",
  "bloc_numeros",
  "compteur",
];

function urlDev(): URL {
  const brute = process.env.DATABASE_URL;
  if (!brute) throw new Error("DATABASE_URL manque dans .env.");
  const u = new URL(brute);
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) {
    throw new Error(`Refus : la base n'est pas locale (${u.hostname}).`);
  }
  const i = process.argv.indexOf("--base");
  const base = i > 0 ? process.argv[i + 1] : "ifspa";
  if (base !== "ifspa" && base !== "ifspa_recette") {
    throw new Error(`Refus : seules les bases « ifspa » et « ifspa_recette » se vident (reçu ${base}).`);
  }
  u.pathname = `/${base}`;
  return u;
}

function sauvegarder(nomBase: string): string {
  const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const dossier = path.resolve("data/sauvegardes");
  mkdirSync(dossier, { recursive: true });
  const fichier = path.join(dossier, `${nomBase}-avant-parcours-${horodatage}.sql`);
  const dump = spawnSync("docker", ["exec", "ifspa-db", "pg_dump", "-U", "ifspa", "-d", nomBase, "--clean", "--if-exists"], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (dump.status !== 0) throw new Error(`Sauvegarde impossible : ${dump.stderr || "docker indisponible"}`);
  writeFileSync(fichier, dump.stdout);
  return fichier;
}

async function vider() {
  if (!process.argv.includes("--confirmer")) {
    console.error("Vide les étudiants, paiements, années et tarifs de la base de dev. Relancer avec --confirmer.");
    process.exit(1);
  }
  const url = urlDev();
  const fichier = sauvegarder(url.pathname.slice(1));
  console.log(`✓ Sauvegarde : ${path.relative(process.cwd(), fichier)}`);

  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  try {
    const avant = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM etudiant");
    await c.query(`TRUNCATE TABLE ${TABLES.map((t) => `"public"."${t}"`).join(", ")}`);
    console.log(`✓ Base ${url.pathname.slice(1)} vidée (${avant.rows[0].n} étudiants supprimés). Comptes et filières conservés.`);
  } finally {
    await c.end();
  }
}

vider().catch((e) => {
  console.error(e instanceof Error && e.message ? e.message : e);
  process.exit(1);
});
