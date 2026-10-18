import { montantRegex } from "./aides";
import { aujourdhui, boutonSortie, cartesAnnee, dialogueSortie, DOSSIER_UC11 as DOSSIER, dontEnRetard, ouvrirFicheDe, resteAPayer, SECTION_H } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

const { helene } = SECTION_H;
const TITRE = "Écolage 2026-2027 · 1re année";
const MOTIF = "Exclue pour absences répétées et non justifiées";

test("UC11-02 : une étudiante dont les droits sont en 3 fois est exclue", async ({ page }) => {
  test.setTimeout(120_000);
  const jour = aujourdhui();

  await test.step("1. Administrateur : la fiche de RAKOTONIRINA Hélène, droits payés en 3 fois, 900 000 Ar à payer", async () => {
    await ouvrirFicheDe(page, helene.nom, helene.matricule);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(page.getByText("Droits payés en 3 fois")).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(900_000));
    await expect(cartesAnnee(page, TITRE)).toHaveCount(13);
    await capture(page, DOSSIER, "UC11-02-01-fiche-active");
  });

  await test.step("2. « Enregistrer une sortie », choisir « Exclusion » : le bouton devient « Enregistrer l'exclusion »", async () => {
    await boutonSortie(page).click();
    const dialogue = dialogueSortie(page);
    await expect(dialogue.getByRole("button", { name: "Enregistrer l'abandon" })).toBeVisible();
    await dialogue.getByRole("radio", { name: "Exclusion" }).click();
    await expect(dialogue.getByRole("radio", { name: "Exclusion" })).toBeChecked();
    await expect(dialogue.getByRole("button", { name: "Enregistrer l'abandon" })).toHaveCount(0);
    await dialogue.getByLabel("Motif").fill(MOTIF);
    await capture(page, DOSSIER, "UC11-02-02-fenetre-exclusion", dialogue);
  });

  await test.step("3. Enregistrer l'exclusion : 11 échéances ne sont plus dues (2 tranches de droits et 9 mensualités)", async () => {
    await dialogueSortie(page).getByRole("button", { name: "Enregistrer l'exclusion" }).click();
    await expect(page.getByText("Exclusion enregistrée : 11 échéances des mois suivants ne sont plus dues.")).toBeVisible();
    await expect(dialogueSortie(page)).toBeHidden();
    await capture(page, DOSSIER, "UC11-02-03-message");
  });

  await test.step("4. La fiche : « Sorti · Exclu le … », reste à payer 114 000 Ar (tranche 1 de 34 000 Ar et octobre)", async () => {
    await expect(page.getByText(`Sorti · Exclu le ${jour.fr}`)).toBeVisible();
    await expect(boutonSortie(page)).toHaveCount(0);
    await expect(resteAPayer(page)).toHaveText(montantRegex(114_000));
    await expect(dontEnRetard(page)).toHaveText("Aucun retard");
    await expect(page.getByText("11 échéances non dues après la sortie, hors des totaux.")).toBeVisible();
    const cartes = cartesAnnee(page, TITRE);
    await expect(cartes.filter({ hasText: "Non due (sortie)" })).toHaveCount(11);
    await expect(cartes.filter({ hasText: "Droits — tranche 1/3" })).toContainText(/34\s000\sAr/);
    await expect(cartes.filter({ hasText: "Droits — tranche 1/3" })).not.toContainText("Non due (sortie)");
    await expect(cartes.filter({ hasText: "Droits — tranche 2/3" })).toContainText("Non due (sortie)");
    await expect(cartes.filter({ hasText: "Droits — tranche 3/3" })).toContainText("Non due (sortie)");
    await expect(cartes.filter({ hasText: "Octobre 2026" })).not.toContainText("Non due (sortie)");
    await capture(page, DOSSIER, "UC11-02-04-fiche-sortie");
  });

  await test.step("5. L'onglet Parcours : « Sortie : Exclu » avec le motif", async () => {
    await page.getByRole("tab", { name: "Parcours" }).click();
    const parcours = page.getByRole("tabpanel", { name: "Parcours" });
    await expect(parcours).toContainText("Sortie : Exclu");
    await expect(parcours).toContainText(MOTIF);
    await expect(parcours).toContainText(jour.fr);
    await capture(page, DOSSIER, "UC11-02-05-parcours", parcours);
  });
});
