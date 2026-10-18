import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { capture } from "./outils";

// Gestes partagés par les parcours UC15 (reprise des données). Les fichiers d'essai sont de vrais fichiers, rangés dans le scénario.

export const DOSSIER_UC15 = "UC15-reprise";
export const DOSSIER_FICHIERS = path.resolve(__dirname, "../scenarios/UC15-reprise/fichiers");
export const fichier = (nom: string): string => path.join(DOSSIER_FICHIERS, nom);

/** Remplit le modèle téléchargé (UC15-01 le télécharge à l'écran) pour tous les cas ; sans effet sur l'application. */
export function fabriquerFichiers() {
  execFileSync("python", ["-I", path.resolve(__dirname, "fabriquer-fichiers-reprise.py"), DOSSIER_FICHIERS], { stdio: "ignore" });
}

export async function ouvrirReprise(page: Page) {
  await page.goto("/app/parametres/import");
  await expect(page.getByRole("heading", { name: "Déposer le fichier rempli" })).toBeVisible();
}

export async function deposer(page: Page, fichiers: string[]) {
  await page.locator('input[type="file"]').setInputFiles(fichiers);
  await expect(page.getByRole("list", { name: "Fichiers choisis" })).toBeVisible();
}

/** Clique « Analyser le fichier » (ou « les fichiers ») et attend le rapport. */
export async function analyser(page: Page) {
  await page.getByRole("button", { name: /^Analyser le(s)? fichiers?$/ }).click();
  await expect(page.getByRole("heading", { name: "Rapport de contrôle" })).toBeVisible({ timeout: 30_000 });
}

/** Capture pleine page : l'écran est agrandi à la hauteur du contenu pour ne pas couper la barre latérale collante. */
export async function captureHaute(page: Page, dossier: string, nom: string, zone?: Locator) {
  const largeur = page.viewportSize()?.width ?? 1440;
  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: largeur, height: Math.max(900, hauteur) });
  await capture(page, dossier, nom, zone);
  await page.setViewportSize({ width: largeur, height: 900 });
}

/** Le texte d'état du rapport (il reçoit le focus). */
export const messageRapport = (page: Page) => page.getByRole("main").locator("p[tabindex='-1']");

/** Nombre d'étudiants annoncé par la liste (« 7 étudiants inscrits »). */
export async function effectifListe(page: Page): Promise<number> {
  await page.goto("/app/etudiants");
  const texte = await page.getByText(/\d+ étudiants? inscrits?/).first().textContent();
  return Number(texte?.match(/(\d+) étudiant/)?.[1] ?? NaN);
}
