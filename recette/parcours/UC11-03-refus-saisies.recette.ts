import type { Page } from "@playwright/test";
import { montantRegex } from "./aides";
import { aujourdhui, boutonSortie, dialogueSortie, DOSSIER_UC11 as DOSSIER, ouvrirFicheDe, resteAPayer, SECTION_H } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

const { faly } = SECTION_H;

const motif = (page: Page) => dialogueSortie(page).getByLabel("Motif");
const date = (page: Page) => dialogueSortie(page).getByLabel("Date de sortie");
const valider = (page: Page) => dialogueSortie(page).getByRole("button", { name: "Enregistrer l'abandon" }).click();

test("UC11-03 : les saisies refusées par la fenêtre de sortie", async ({ page }) => {
  test.setTimeout(120_000);
  const jour = aujourdhui();

  await test.step("1. Administrateur : ouvrir la fenêtre de sortie de ANDRIAMAMPIANINA Faly, sans motif, puis valider", async () => {
    await ouvrirFicheDe(page, faly.nom, faly.matricule);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await boutonSortie(page).click();
    await valider(page);
    await expect(dialogueSortie(page).getByText("Indiquez le motif de la sortie (3 caractères au moins).")).toBeVisible();
    await expect(dialogueSortie(page)).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-01-motif-vide", dialogueSortie(page));
  });

  await test.step("2. Motif trop court (« ab ») : même message", async () => {
    await motif(page).fill("ab");
    await valider(page);
    await expect(dialogueSortie(page).getByText("Indiquez le motif de la sortie (3 caractères au moins).")).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-02-motif-court", dialogueSortie(page));
  });

  await test.step("3. Motif de 501 caractères : « Motif trop long (500 caractères maximum). »", async () => {
    await motif(page).fill("x".repeat(501));
    await valider(page);
    await expect(dialogueSortie(page).getByText("Motif trop long (500 caractères maximum).")).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-03-motif-long", dialogueSortie(page));
  });

  await test.step("4. Date effacée : « Indiquez une date de sortie valide. »", async () => {
    await motif(page).fill("Départ volontaire pour raison familiale");
    await date(page).fill("");
    await valider(page);
    await expect(dialogueSortie(page).getByText("Indiquez une date de sortie valide.")).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-04-date-vide", dialogueSortie(page));
  });

  await test.step("5. Date dans le futur : « La date de sortie ne peut pas être dans le futur. » (refus du serveur)", async () => {
    await date(page).fill("2026-12-01");
    await valider(page);
    await expect(dialogueSortie(page).getByText("La date de sortie ne peut pas être dans le futur.").first()).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-05-date-future", dialogueSortie(page));
  });

  await test.step("6. Date avant le début de l'année : « La date de sortie ne peut pas précéder le début de son année en cours (01/10/2026). »", async () => {
    await date(page).fill("2026-09-30");
    await valider(page);
    await expect(
      dialogueSortie(page).getByText("La date de sortie ne peut pas précéder le début de son année en cours (01/10/2026).").first(),
    ).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-06-date-avant-annee", dialogueSortie(page));
  });

  await test.step("7. Annuler : l'étudiant reste « Actif », rien n'a changé", async () => {
    await dialogueSortie(page).getByRole("button", { name: "Annuler" }).click();
    await expect(dialogueSortie(page)).toBeHidden();
    await expect(page.getByText("Actif", { exact: true })).toBeVisible();
    await expect(page.getByText(/Sorti ·/)).toHaveCount(0);
    await expect(resteAPayer(page)).toHaveText(montantRegex(900_000));
    await expect(boutonSortie(page)).toBeVisible();
    await page.reload();
    await expect(page.getByText("Actif", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC11-03-07-toujours-actif");
    await boutonSortie(page).click();
    await expect(date(page)).toHaveValue(jour.iso);
    await expect(motif(page)).toHaveValue("");
  });
});
