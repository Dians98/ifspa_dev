import { expect, test } from "@playwright/test";
import { COMPTES } from "./comptes";

// Frais en cours d'année : créé, modifié puis supprimé dans le même test, avant tout paiement.
// Le verrouillage après paiement et l'ordre de répartition sont couverts par les tests d'intégration.

test.describe("Frais — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("la gestion des frais est réservée à l'administrateur", async ({ page }) => {
    await page.goto("/app/parametres/frais");
    await expect(page.getByText("Accès réservé à l'administrateur")).toBeVisible();
    await expect(page.getByRole("button", { name: "Nouveau frais" })).toHaveCount(0);
  });
});

test.describe("Frais — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("créer un frais avec récapitulatif, le modifier puis le supprimer", async ({ page }, info) => {
    const libelle = `Frais E2E ${info.project.name} ${Date.now().toString(36).toUpperCase()}`;

    await page.goto("/app/parametres/frais");
    await page.getByRole("button", { name: "Nouveau frais" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouveau frais" });

    await dialogue.getByLabel("Libellé").fill(libelle);
    await dialogue.getByLabel("Montant par étudiant (Ar)").fill("15000");
    await dialogue.getByRole("checkbox", { name: "IF 1re année" }).check();

    // Le récapitulatif du serveur précède la validation.
    await expect(dialogue).toContainText(/recevr(a|ont) 15\s000\sAr, exigibles en /);
    await dialogue.getByRole("button", { name: /^Créer le frais de 15\s000\sAr$/ }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText(libelle).first()).toBeVisible();

    await page.getByRole("button", { name: `Modifier le frais ${libelle}` }).click();
    const modification = page.getByRole("dialog", { name: `Modifier « ${libelle} »` });
    await modification.getByLabel("Montant par étudiant (Ar)").fill("20000");
    await modification.getByRole("button", { name: "Enregistrer" }).click();
    await expect(modification).toBeHidden();
    await expect(page.getByText(/20\s000\sAr/).first()).toBeVisible();

    await page.getByRole("button", { name: `Supprimer le frais ${libelle}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer le frais" }).click();
    // Les notifications citent aussi le libellé : seule la page compte.
    await expect(page.getByText(`Frais « ${libelle} » supprimé.`)).toBeVisible();
    await expect(page.getByRole("main").getByText(libelle)).toHaveCount(0);
  });
});
