import { boutonSortie, DOSSIER_UC11 as DOSSIER, ouvrirFicheDe, SECTION_H } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

const { faly, hery } = SECTION_H;

test("UC11-04 : le secrétariat ne voit pas « Enregistrer une sortie »", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Secrétariat : la fiche d'un étudiant actif n'a pas de bouton de sortie", async () => {
    await ouvrirFicheDe(page, faly.nom, faly.matricule);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(page.getByText("Actif", { exact: true })).toBeVisible();
    const entete = page.getByRole("region", { name: "Identité de l'étudiant" });
    await expect(entete.getByRole("link", { name: "Encaisser", exact: true })).toBeVisible();
    await expect(entete.getByRole("link", { name: "Modifier" })).toBeVisible();
    await expect(boutonSortie(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sortie|abandon|exclusion/i })).toHaveCount(0);
    await capture(page, DOSSIER, "UC11-04-01-fiche-active-secretariat");
  });

  await test.step("2. Secrétariat : la fiche d'un étudiant sorti (RAMAROSON Hery) n'en a pas non plus, mais lit sa sortie", async () => {
    await ouvrirFicheDe(page, hery.nom, hery.matricule);
    await expect(page.getByText(/Sorti · Abandon le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(boutonSortie(page)).toHaveCount(0);
    await page.getByRole("tab", { name: "Parcours" }).click();
    await expect(page.getByRole("tabpanel", { name: "Parcours" })).toContainText("Sortie : Abandon");
    await capture(page, DOSSIER, "UC11-04-02-fiche-sortie-secretariat");
  });

  await test.step("3. Aucune rubrique d'administration dans le menu du secrétariat", async () => {
    const menu = page.getByRole("navigation", { name: "Menu principal" });
    await expect(menu.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: "Étudiants" })).toBeVisible();
  });
});
