import { ADMIN, ligneParametre, ouvrirAnnees, ouvrirTarifs, saisirTarif } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 }, storageState: SESSIONS.admin });

async function creerAnnee(page: import("@playwright/test").Page, anneeDebut: string, libelle: string) {
  await page.getByRole("button", { name: "Nouvelle année" }).click();
  const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
  await dialogue.getByLabel("Année de début").fill(anneeDebut);
  await dialogue.getByRole("button", { name: "Créer l'année" }).click();
  await expect(page.getByText(`Année ${libelle} créée, en préparation. Saisissez maintenant ses tarifs.`)).toBeVisible();
}

test("UC02-10 : une année sans étudiant se supprime avec ses tarifs", async ({ page }) => {
  await test.step("1. Créer 2029-2030 et saisir le tarif IF 1re année", async () => {
    await ouvrirAnnees(page);
    await expect(page.getByText(ADMIN)).toBeVisible();
    await creerAnnee(page, "2029", "2029-2030");
    await page.getByRole("link", { name: "Tarifs de l'année 2029-2030" }).click();
    await page.waitForURL("**/app/parametres/tarifs?annee=*");
    await saisirTarif(page, "IF 1re année", { droits: "120 000", mensualite: "95 000" });
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Tarifs 2029-2030 enregistrés.")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "IF 1re année" })).toContainText(/1\s070\s000\sAr/);
    await capture(page, DOSSIER, "UC02-10-01-tarif-2029");
  });

  await test.step("2. Supprimer 2029-2030 : la confirmation annonce que ses tarifs partent avec elle", async () => {
    await ouvrirAnnees(page);
    await page.getByRole("button", { name: "Supprimer l'année 2029-2030" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Supprimer l'année 2029-2030 ?");
    await expect(confirmation).toContainText("Aucun étudiant n'y est inscrit. Ses tarifs seront supprimés avec elle, définitivement.");
    await capture(page, DOSSIER, "UC02-10-02-confirmer-suppression");
    await confirmation.getByRole("button", { name: "Supprimer l'année" }).click();
    await expect(page.getByText("Année 2029-2030 supprimée, avec ses tarifs et ses frais.")).toBeVisible();
    await expect(ligneParametre(page, /^2029-2030/)).toHaveCount(0);
  });

  await test.step("3. Recréer 2029-2030 : ses tarifs sont tous à saisir, ceux supprimés n'ont pas survécu", async () => {
    await creerAnnee(page, "2029", "2029-2030");
    await page.getByRole("link", { name: "Tarifs de l'année 2029-2030" }).click();
    await page.waitForURL("**/app/parametres/tarifs?annee=*");
    await expect(page.getByText("6 tarifs sont à saisir.")).toBeVisible();
    await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue("");
    await capture(page, DOSSIER, "UC02-10-03-annee-recreee-vierge");
  });

  await test.step("4. Supprimer de nouveau 2029-2030 pour laisser la liste propre", async () => {
    await ouvrirAnnees(page);
    await page.getByRole("button", { name: "Supprimer l'année 2029-2030" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer l'année" }).click();
    await expect(page.getByText("Année 2029-2030 supprimée, avec ses tarifs et ses frais.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-10-04-liste-finale");
  });
});
