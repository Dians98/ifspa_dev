import { execSync } from "node:child_process";
import { Client } from "pg";
import { urlBaseTest } from "./base-test";

/** Crée la base de test si besoin, puis y applique les migrations (jamais sur la base de dev). */
export default async function setup() {
  const url = urlBaseTest();
  const cible = new URL(url);
  const nomBase = cible.pathname.replace(/^\//, "");

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  maintenance.search = "";
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const existe = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [nomBase]);
    if (existe.rowCount === 0) await client.query(`CREATE DATABASE "${nomBase}"`);
  } finally {
    await client.end();
  }

  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
