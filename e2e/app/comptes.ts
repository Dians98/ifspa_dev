import path from "node:path";
import { expect, type Page } from "@playwright/test";

function variable(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`${nom} doit être défini dans .env (voir .env.example), puis : npm run db:seed`);
  return valeur;
}

/** Comptes créés par le seed (prisma/seed.ts). */
export const COMPTES = {
  admin: {
    get email() { return variable("SEED_ADMIN_EMAIL"); },
    get motDePasse() { return variable("SEED_ADMIN_PASSWORD"); },
    session: path.resolve(__dirname, "../../playwright/.auth/admin.json"),
  },
  secretariat: {
    get email() { return variable("SEED_USER_EMAIL"); },
    get motDePasse() { return variable("SEED_USER_PASSWORD"); },
    session: path.resolve(__dirname, "../../playwright/.auth/secretariat.json"),
  },
};

export async function seConnecter(page: Page, email: string, motDePasse: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

/** Sur mobile, le menu est un tiroir : il n'existe dans la page qu'une fois ouvert. */
export async function ouvrirMenu(page: Page) {
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeVisible();
}

export async function attendreTableauDeBord(page: Page) {
  await page.waitForURL("**/app/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
}
