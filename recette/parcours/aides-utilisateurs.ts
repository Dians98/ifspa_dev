import path from "node:path";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { expect, SESSIONS } from "./outils";
import { respecterLimiteConnexion, SANS_SESSION, saisirIdentifiants, viderLimiteConnexion } from "./aides-connexion";

// Gestes partagés par les parcours UC03 (comptes du personnel).

export const DOSSIER = "UC03-comptes";

export const PAGE_UTILISATEURS = "/app/parametres/utilisateurs";

export type Compte = { nom: string; email: string; role: "Secrétariat" | "Administrateur" };

const CONTEXTE = { viewport: { width: 1440, height: 1000 }, locale: "fr-FR", timezoneId: "Indian/Antananarivo" } as const;

export { viderLimiteConnexion };

/** Fenêtre de l'administrateur du seed (session de la recette). */
export async function fenetreAdmin(browser: Browser, viewport: { width: number; height: number } = CONTEXTE.viewport) {
  const contexte = await browser.newContext({ ...CONTEXTE, viewport, storageState: SESSIONS.admin });
  return { contexte, page: await contexte.newPage() };
}

/** Fenêtre vierge, comme le poste d'une personne qui n'est pas encore connectée. */
export async function fenetreVierge(browser: Browser, viewport: { width: number; height: number } = CONTEXTE.viewport) {
  const contexte = await browser.newContext({ ...CONTEXTE, viewport, storageState: SANS_SESSION });
  return { contexte, page: await contexte.newPage() };
}

export async function ouvrirListe(page: Page) {
  await page.goto(PAGE_UTILISATEURS);
  await expect(page.getByRole("heading", { name: "Utilisateurs" }).first()).toBeVisible();
}

export function ligne(page: Page, email: string) {
  return page.locator("tr").filter({ hasText: email });
}

/** Crée le compte par le formulaire « Nouvel utilisateur » ; renvoie le mot de passe provisoire lu à l'écran. */
export async function creerCompte(page: Page, compte: Compte, avantFermeture?: () => Promise<void>): Promise<string> {
  await ouvrirListe(page);
  await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
  const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
  await dialogue.getByLabel("Nom").fill(compte.nom);
  await dialogue.getByLabel("Courriel").fill(compte.email);
  if (compte.role === "Administrateur") {
    await dialogue.getByRole("combobox", { name: "Rôle" }).click();
    await page.getByRole("option", { name: "Administrateur" }).click();
  }
  await dialogue.getByRole("button", { name: "Créer le compte" }).click();
  const resultat = page.getByRole("dialog", { name: `Compte créé pour ${compte.nom}` });
  await expect(resultat).toBeVisible();
  const motDePasse = await lireMotDePasse(resultat);
  if (avantFermeture) await avantFermeture();
  await resultat.getByRole("button", { name: "Terminé" }).click();
  await expect(ligne(page, compte.email)).toBeVisible();
  return motDePasse;
}

export async function lireMotDePasse(dialogue: Locator): Promise<string> {
  const texte = await dialogue.getByText("Mot de passe provisoire").locator("xpath=following-sibling::p").textContent();
  return (texte ?? "").trim();
}

/** Connecte une personne dans sa propre fenêtre vierge, en respectant la limite de tentatives. */
export async function seConnecter(page: Page, email: string, motDePasse: string) {
  await page.goto("/connexion");
  await saisirIdentifiants(page, email, motDePasse);
  await respecterLimiteConnexion(page);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

export async function seConnecterJusqueAuTableauDeBord(page: Page, email: string, motDePasse: string) {
  await seConnecter(page, email, motDePasse);
  await page.waitForURL("**/app/dashboard");
}

/** Le nom et le rôle en bas de la barre latérale prouvent qui est connecté. */
export async function verifierUtilisateur(page: Page, nom: string, role: "Administrateur" | "Secrétariat") {
  const barre = page.getByRole("complementary", { name: "Barre latérale" });
  await expect(barre.getByText(nom, { exact: true })).toBeVisible();
  await expect(barre.getByText(role, { exact: true })).toBeVisible();
}

export async function fermer(...contextes: BrowserContext[]) {
  for (const c of contextes) await c.close();
}

/** Capture de la fenêtre visible seulement (liste longue sur téléphone), rangée comme `capture` avec le suffixe `-mobile`. */
export async function vue(page: Page, nom: string) {
  const fichier = path.resolve(__dirname, "..", "scenarios", DOSSIER, "captures", `${nom}-mobile.png`);
  await page.screenshot({ path: fichier, fullPage: false, animations: "disabled" });
}
