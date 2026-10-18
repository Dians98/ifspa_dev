// Recette fonctionnelle : base dédiée `ifspa_recette` et application sur le port 3200, à côté du dev (3100).
//   pnpm recette:base  → crée la base si besoin, applique les migrations, la vide, puis lance le seed
//   pnpm recette:app   → démarre le build courant (`pnpm build` avant) sur cette base
import "dotenv/config";
import { spawn } from "node:child_process";
import { Client } from "pg";

const NOM_BASE = "ifspa_recette";
const PORT = 3200;

function urlRecette(): string {
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new Error("DATABASE_URL manque dans .env.");
  const u = new URL(dev);
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) {
    throw new Error(`La recette ne tourne que sur une base locale (reçu : ${u.hostname}).`);
  }
  u.pathname = `/${NOM_BASE}`;
  return u.toString();
}

function lancer(commande: string, env: Record<string, string>): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const p = spawn(commande, { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 ? resoudre() : rejeter(new Error(`« ${commande} » a échoué (code ${code}).`))));
  });
}

async function avecClient<T>(url: string, travail: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await travail(c);
  } finally {
    await c.end();
  }
}

async function preparerBase() {
  const url = urlRecette();
  const serveur = new URL(url);
  serveur.pathname = "/postgres";

  await avecClient(serveur.toString(), async (c) => {
    const existe = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [NOM_BASE]);
    if (existe.rowCount === 0) {
      await c.query(`CREATE DATABASE ${NOM_BASE}`);
      console.log(`✓ Base ${NOM_BASE} créée`);
    }
  });

  await lancer("pnpm prisma migrate deploy", { DATABASE_URL: url });

  await avecClient(url, async (c) => {
    const { rows: base } = await c.query<{ nom: string }>("SELECT current_database() AS nom");
    if (base[0]?.nom !== NOM_BASE) throw new Error(`Refus de vider ${base[0]?.nom} : seule ${NOM_BASE} se vide.`);
    const { rows } = await c.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length > 0) {
      await c.query(`TRUNCATE TABLE ${rows.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }
    console.log(`✓ ${NOM_BASE} vidée`);
  });

  await lancer("pnpm prisma db seed", { DATABASE_URL: url });
  console.log(`✓ Recette prête : pnpm build puis pnpm recette:app (http://localhost:${PORT})`);
}

async function demarrerApp() {
  // BETTER_AUTH_URL doit suivre le port, sinon la connexion est refusée (origine non reconnue).
  await lancer(`pnpm exec next start -p ${PORT}`, {
    DATABASE_URL: urlRecette(),
    BETTER_AUTH_URL: `http://localhost:${PORT}`,
  });
}

const commande = process.argv[2];
const actions: Record<string, () => Promise<void>> = { base: preparerBase, app: demarrerApp };
const action = actions[commande ?? ""];
if (!action) {
  console.error("Usage : tsx scripts/recette.ts base | app");
  process.exit(1);
}
action().catch((e) => {
  // Postgres injoignable : AggregateError au message vide.
  console.error(e instanceof Error && e.message ? e.message : e);
  process.exit(1);
});
