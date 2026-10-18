import { montantRegex } from "./aides";
import { boutonSortie, cartesAnnee, dialogueSortie, DOSSIER_UC11 as DOSSIER, dontEnRetard, ETUDIANTS, ouvrirFicheDe, resteAPayer } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

const { mialy } = ETUDIANTS;
const TITRE = "Écolage 2025-2026 · 1re année";
const MOTIF = "Départ à l'étranger avec sa famille";

test("UC11-05 : un abandon du 31 janvier saisi en octobre, les mois suivants ne sont plus dus", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Administrateur : RAZAFINDRAKOTO Mialy (2025-2026) doit 900 000 Ar, tout en retard", async () => {
    await ouvrirFicheDe(page, mialy.nom, mialy.matricule);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(900_000));
    await expect(dontEnRetard(page)).toContainText(montantRegex(900_000));
    await expect(page.getByText("10 mois impayés")).toBeVisible();
    await capture(page, DOSSIER, "UC11-05-01-fiche-en-retard");
  });

  await test.step("2. « Enregistrer une sortie » : la mise en garde annonce 900 000 Ar en retard ; date du 31/01/2026, motif", async () => {
    await boutonSortie(page).click();
    const dialogue = dialogueSortie(page);
    await expect(dialogue).toContainText(/ce qui est en retard reste dû \(900\s000\sAr\)\./);
    await dialogue.getByLabel("Date de sortie").fill("2026-01-31");
    await dialogue.getByLabel("Motif").fill(MOTIF);
    await capture(page, DOSSIER, "UC11-05-02-fenetre-antidatee", dialogue);
  });

  await test.step("3. Enregistrer l'abandon : 6 échéances (février à juillet 2026) ne sont plus dues", async () => {
    await dialogueSortie(page).getByRole("button", { name: "Enregistrer l'abandon" }).click();
    await expect(page.getByText("Abandon enregistré : 6 échéances des mois suivants ne sont plus dues.")).toBeVisible();
    await expect(dialogueSortie(page)).toBeHidden();
    await capture(page, DOSSIER, "UC11-05-03-message");
  });

  await test.step("4. La fiche : sorti le 31/01/2026, reste à payer 420 000 Ar, tout en retard", async () => {
    await expect(page.getByText("Sorti · Abandon le 31/01/2026")).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(420_000));
    await expect(dontEnRetard(page)).toContainText(montantRegex(420_000));
    await expect(page.getByText("4 mois impayés").first()).toBeVisible();
    await expect(page.getByText("6 échéances non dues après la sortie, hors des totaux.")).toBeVisible();
    await capture(page, DOSSIER, "UC11-05-04-fiche-sortie");
  });

  await test.step("5. La grille : droits et octobre à janvier restent « En retard », février à juillet sont « Non due (sortie) »", async () => {
    const cartes = cartesAnnee(page, TITRE);
    await expect(cartes).toHaveCount(11);
    await expect(cartes.filter({ hasText: "Non due (sortie)" })).toHaveCount(6);
    for (const mois of ["Octobre 2025", "Novembre 2025", "Décembre 2025", "Janvier 2026"]) {
      await expect(cartes.filter({ hasText: mois })).toContainText("En retard");
    }
    await expect(cartes.filter({ hasText: "Droits d'inscription" })).toContainText("En retard");
    for (const mois of ["Février 2026", "Mars 2026", "Avril 2026", "Mai 2026", "Juin 2026", "Juillet 2026"]) {
      await expect(cartes.filter({ hasText: mois })).toContainText("Non due (sortie)");
    }
    await capture(page, DOSSIER, "UC11-05-05-grille", page.getByRole("heading", { name: TITRE }).locator("xpath=ancestor::section[1]"));
  });

  await test.step("6. La liste Étudiants : « Abandon » et « En retard · 420 000 Ar »", async () => {
    await page.goto(`/app/etudiants?q=${mialy.matricule}`);
    const ligne = page.getByRole("row").filter({ hasText: mialy.nom });
    await expect(ligne).toContainText("Abandon");
    await expect(ligne).toContainText(/En retard · 420\s000\sAr/);
    await expect(ligne).toContainText("4 mois impayés");
    await capture(page, DOSSIER, "UC11-05-06-liste");
  });
});
