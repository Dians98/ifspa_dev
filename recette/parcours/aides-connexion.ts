import { expect, type Page } from "@playwright/test";
import { attendreTableauDeBord, COMPTES } from "../../e2e/app/comptes";

// Gestes partagés par les parcours UC01 (connexion et cadre de l'application).

export const DOSSIER = "UC01-connexion";

/** Fenêtre vierge : aucun cookie, comme un poste qui n'a jamais ouvert l'application. */
export const SANS_SESSION = { cookies: [], origins: [] };

export const NOM_ADMIN = "Administrateur IFSPA";
export const NOM_SECRETARIAT = "Hanitra RAKOTO";

// Better Auth refuse la 4e connexion (HTTP 429) tant qu'aucune pause de 10 s n'a séparé les précédentes.
const PAUSE_MS = 10_700;
const MAX_PAR_RAFALE = 3;
let rafale = { compte: 0, dernier: 0 };

/** À appeler au début d'un cas : laisse retomber la rafale des cas précédents et de la connexion d'amorçage. */
export async function viderLimiteConnexion(page: Page) {
  await page.waitForTimeout(PAUSE_MS);
  rafale = { compte: 0, dernier: 0 };
}

export async function respecterLimiteConnexion(page: Page) {
  const ecoule = Date.now() - rafale.dernier;
  if (ecoule >= PAUSE_MS) rafale.compte = 0;
  else if (rafale.compte >= MAX_PAR_RAFALE) {
    await page.waitForTimeout(PAUSE_MS - ecoule);
    rafale.compte = 0;
  }
  rafale.compte += 1;
  rafale.dernier = Date.now();
}

export async function saisirIdentifiants(page: Page, email: string, motDePasse: string) {
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(motDePasse);
}

/** Ouvre /connexion, saisit les identifiants et valide, en respectant la limite de tentatives. */
export async function seConnecterAvec(page: Page, email: string, motDePasse: string, retour?: string) {
  await page.goto(retour ? `/connexion?retour=${encodeURIComponent(retour)}` : "/connexion");
  await saisirIdentifiants(page, email, motDePasse);
  await respecterLimiteConnexion(page);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

export async function connecterAdmin(page: Page) {
  await seConnecterAvec(page, COMPTES.admin.email, COMPTES.admin.motDePasse);
  await attendreTableauDeBord(page);
}

export async function connecterSecretariat(page: Page) {
  await seConnecterAvec(page, COMPTES.secretariat.email, COMPTES.secretariat.motDePasse);
  await attendreTableauDeBord(page);
}

/** Le nom et le rôle affichés en bas de la barre latérale prouvent qui est connecté. */
export async function verifierUtilisateur(page: Page, nom: string, role: "Administrateur" | "Secrétariat") {
  const barre = page.getByRole("complementary", { name: "Barre latérale" });
  await expect(barre.getByText(nom, { exact: true })).toBeVisible();
  await expect(barre.getByText(role, { exact: true })).toBeVisible();
}
