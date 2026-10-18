import path from "node:path";
import { test as base, type Locator, type Page } from "@playwright/test";

const RACINE = path.resolve(__dirname, "..");

export const SESSIONS = {
  admin: path.resolve(RACINE, "../playwright/.auth/recette-admin.json"),
  secretariat: path.resolve(RACINE, "../playwright/.auth/recette-secretariat.json"),
};

/**
 * Capture rangée dans le scénario : `recette/scenarios/<dossierUC>/captures/<nom>.png`,
 * suffixée `-mobile` sur le projet mobile. Une nouvelle exécution remplace l'image.
 */
export async function capture(page: Page, dossierUC: string, nom: string, zone?: Locator) {
  const suffixe = base.info().project.name === "mobile" ? "-mobile" : "";
  const fichier = path.join(RACINE, "scenarios", dossierUC, "captures", `${nom}${suffixe}.png`);
  if (zone) await zone.screenshot({ path: fichier, animations: "disabled" });
  else await page.screenshot({ path: fichier, fullPage: true, animations: "disabled" });
}

/** `window.print` neutralisé (la boîte d'impression bloquerait le parcours), compté dans `window.__impressions`. */
export const test = base.extend({
  page: async ({ page }, fournir) => {
    await page.addInitScript(() => {
      const fenetre = window as unknown as { __impressions: number };
      fenetre.__impressions = 0;
      window.print = () => {
        fenetre.__impressions += 1;
      };
    });
    await fournir(page);
  },
});

export { expect } from "@playwright/test";
