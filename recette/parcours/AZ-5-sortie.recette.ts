import { boutonSortie, cartesAnnee, dialogueSortie } from "./aides-sorties";
import { choisirEtudiant } from "./aides";
import { C, DOSSIER, ouvrirFiche, POSTE_GUICHET, resume } from "./aides-az";
import { ouvrirImpayes, verifierSynthese, ligneEtudiant } from "./aides-impayes";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 5 : C abandonne en décembre 2025 ; l'administrateur l'enregistre, le secrétariat le retrouve au guichet.
test.describe.configure({ mode: "serial" });

const MOTIF = "A quitté l'institut pour raison familiale";

test.describe("Acte 5 : administrateur", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1500 } });

  test("5.1 à 5.4 l'administrateur enregistre l'abandon de C", async ({ page }) => {
    await test.step("5.1 Fiche de RAZAFINDRAKOTO Mialy : « Enregistrer une sortie »", async () => {
      await ouvrirFiche(page, C);
      await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await expect(resume(page, "Reste à payer")).toContainText("1 020 000 Ar");
      await expect(boutonSortie(page)).toBeVisible();
      await capture(page, DOSSIER, "AZ-5-1-fiche-c-active");
    });

    await test.step("5.2 Abandon au 15/12/2025, avec son motif", async () => {
      await boutonSortie(page).click();
      const dialogue = dialogueSortie(page);
      await expect(dialogue.getByRole("radio", { name: "Abandon" })).toBeChecked();
      await dialogue.getByLabel("Date de sortie").fill("2025-12-15");
      await dialogue.getByLabel("Motif").fill(MOTIF);
      await capture(page, DOSSIER, "AZ-5-2-fenetre-sortie", dialogue);
    });

    await test.step("5.3 Enregistrer l'abandon : les mois après décembre ne sont plus dus", async () => {
      const dialogue = dialogueSortie(page);
      await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText("Abandon enregistré : 7 échéances des mois suivants ne sont plus dues.")).toBeVisible();
      await expect(page.getByText("Sorti · Abandon le 15/12/2025")).toBeVisible();
      await expect(resume(page, "Reste à payer")).toContainText("390 000 Ar");
      await expect(cartesAnnee(page, "Écolage 2025-2026 · 1re année").filter({ hasText: "Non due (sortie)" })).toHaveCount(7);
      await capture(page, DOSSIER, "AZ-5-3-fiche-c-sortie");
    });

    await test.step("5.4 Impayés : C n'y figure plus", async () => {
      await ouvrirImpayes(page);
      await expect(ligneEtudiant(page, "RAZAFINDRAKOTO")).toHaveCount(0);
      await verifierSynthese(page, 2, 1_400_000);
      await capture(page, DOSSIER, "AZ-5-4-impayes");
    });
  });
});

test.describe("Acte 5 : secrétariat", () => {
  test.use({ storageState: POSTE_GUICHET, viewport: { width: 1440, height: 1500 } });

  test("5.5 le guichet retrouve C avec le badge Sorti", async ({ page }) => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, C);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Sorti · Abandon")).toBeVisible();
    await expect(page.getByText(/Reste à payer :\s*390\s000\sAr, dont 390\s000\sAr en retard/)).toBeVisible();
    await capture(page, DOSSIER, "AZ-5-5-guichet-c-sorti");
  });
});
