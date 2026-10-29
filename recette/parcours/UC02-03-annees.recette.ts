import { ADMIN, ligneParametre, ouvrirAnnees } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 }, storageState: SESSIONS.admin });

test("UC02-03 : préparer une année scolaire et la définir comme année courante", async ({ page }) => {
  const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
  const anneeDebut = dialogue.getByLabel("Année de début");

  await test.step("1. Ouvrir Paramètres › Années scolaires : 2026-2027 en cours, 2025-2026 à clôturer", async () => {
    await ouvrirAnnees(page);
    await expect(page.getByText(ADMIN)).toBeVisible();
    const courante = ligneParametre(page, /^2026-2027/);
    await expect(courante).toContainText("Année courante");
    await expect(courante).toContainText("octobre 2026 → juillet 2027");
    await expect(courante).toContainText("En cours");
    const ancienne = ligneParametre(page, /^2025-2026/);
    await expect(ancienne).toContainText("octobre 2025 → juillet 2026");
    await expect(ancienne).toContainText("Ouverte · à clôturer");
    await capture(page, DOSSIER, "UC02-03-01-annees");
  });

  await test.step("2. L'année courante ne se supprime ni ne se clôture : le motif est lisible", async () => {
    const courante = ligneParametre(page, /^2026-2027/);
    await expect(courante.getByRole("button", { name: "Clôturer l'année 2026-2027" })).toHaveCount(0);
    await expect(courante.getByRole("button", { name: "Supprimer l'année 2026-2027" })).toHaveCount(0);
    await courante.getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" }).click();
    await expect(page.getByText("L'année courante ne peut pas être supprimée. Définissez d'abord une autre année comme courante.")).toBeVisible();
    await expect(page.getByText("L'année courante ne peut pas être clôturée. Définissez d'abord une autre année comme courante.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-02-motifs-courante");
    await page.keyboard.press("Escape");
  });

  await test.step("3. Nouvelle année : 2027 proposée, mensualités d'octobre 2027 à juillet 2028", async () => {
    await page.getByRole("button", { name: "Nouvelle année" }).click();
    await expect(anneeDebut).toHaveValue("2027");
    await expect(dialogue.getByText(/Année 2027-2028 : mensualités de octobre 2027 → juillet 2028\./)).toBeVisible();
    await expect(dialogue.getByRole("combobox", { name: "Premier mois des mensualités" })).toContainText("Octobre");
    await capture(page, DOSSIER, "UC02-03-03-nouvelle-annee");
  });

  await test.step("4. Le premier mois se choisit parmi les 12 mois de l'année", async () => {
    await dialogue.getByRole("combobox", { name: "Premier mois des mensualités" }).click();
    await expect(page.getByRole("option")).toHaveText([
      "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
    ]);
    await page.getByRole("option", { name: "Novembre" }).click();
    await expect(dialogue.getByText(/Année 2027-2028 : mensualités de novembre 2027 → août 2028\./)).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-04-premier-mois-novembre");
    await dialogue.getByRole("combobox", { name: "Premier mois des mensualités" }).click();
    await page.getByRole("option", { name: "Octobre" }).click();
    await expect(dialogue.getByText(/mensualités de octobre 2027 → juillet 2028\./)).toBeVisible();
  });

  await test.step("5. Refus : une année qui existe déjà, hors de 2000-2100, vide, avec décimale", async () => {
    await anneeDebut.fill("2026");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText("L'année 2026-2027 existe déjà.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-05-refus-existe-deja");
    await anneeDebut.fill("1999");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText("L'année de début est comprise entre 2000 et 2100.")).toBeVisible();
    await anneeDebut.fill("2101");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText("L'année de début est comprise entre 2000 et 2100.")).toBeVisible();
    await anneeDebut.fill("");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText(/^Indiquez l'année de début/)).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-06-refus-vide");
    await anneeDebut.fill("2027.5");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText("Indiquez l'année de début sans décimales.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-07-refus-decimale");
  });

  await test.step("6. Refus : une année qui chevauche 2026-2027 (qui se termine en juillet 2027)", async () => {
    await anneeDebut.fill("2027");
    await dialogue.getByRole("combobox", { name: "Premier mois des mensualités" }).click();
    await page.getByRole("option", { name: "Mars" }).click();
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText("2027-2028 ne peut pas commencer avant août 2027 : 2026-2027 se termine en juillet 2027.")).toBeVisible();
    await expect(dialogue).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-08-refus-chevauchement");
    await dialogue.getByRole("combobox", { name: "Premier mois des mensualités" }).click();
    await page.getByRole("option", { name: "Juillet" }).click();
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue.getByText("2027-2028 ne peut pas commencer avant août 2027 : 2026-2027 se termine en juillet 2027.")).toBeVisible();
    await dialogue.getByRole("combobox", { name: "Premier mois des mensualités" }).click();
    await page.getByRole("option", { name: "Octobre" }).click();
  });

  await test.step("7. Créer 2027-2028 : elle est « En préparation »", async () => {
    await anneeDebut.fill("2027");
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(page.getByText("Année 2027-2028 créée, en préparation. Saisissez maintenant ses tarifs.")).toBeVisible();
    const nouvelle = ligneParametre(page, /^2027-2028/);
    await expect(nouvelle).toContainText("octobre 2027 → juillet 2028");
    await expect(nouvelle).toContainText("En préparation");
    await expect(nouvelle.getByRole("button", { name: "Définir 2027-2028 comme année courante" })).toBeVisible();
    await expect(nouvelle.getByRole("button", { name: "Clôturer l'année 2027-2028" })).toBeVisible();
    await expect(nouvelle.getByRole("button", { name: "Supprimer l'année 2027-2028" })).toBeVisible();
    await capture(page, DOSSIER, "UC02-03-09-annee-en-preparation");
  });

  await test.step("8. Une année qui commence en septembre : 2028-2029, de septembre 2028 à juin 2029, puis supprimée", async () => {
    await page.getByRole("button", { name: "Nouvelle année" }).click();
    await anneeDebut.fill("2028");
    await dialogue.getByRole("combobox", { name: "Premier mois des mensualités" }).click();
    await page.getByRole("option", { name: "Septembre" }).click();
    await expect(dialogue.getByText(/Année 2028-2029 : mensualités de septembre 2028 → juin 2029\./)).toBeVisible();
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(page.getByText("Année 2028-2029 créée, en préparation. Saisissez maintenant ses tarifs.")).toBeVisible();
    await expect(ligneParametre(page, /^2028-2029/)).toContainText("septembre 2028 → juin 2029");
    await capture(page, DOSSIER, "UC02-03-10-annee-septembre");
    await page.getByRole("button", { name: "Supprimer l'année 2028-2029" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Supprimer l'année 2028-2029 ?");
    await expect(confirmation).toContainText("Aucun étudiant n'y est inscrit. Ses tarifs seront supprimés avec elle, définitivement.");
    await confirmation.getByRole("button", { name: "Supprimer l'année" }).click();
    await expect(page.getByText("Année 2028-2029 supprimée, avec ses tarifs et ses frais.")).toBeVisible();
    await expect(ligneParametre(page, /^2028-2029/)).toHaveCount(0);
  });

  await test.step("9. Définir 2027-2028 comme année courante : une confirmation qui rassure sur 2026-2027", async () => {
    await page.getByRole("button", { name: "Définir 2027-2028 comme année courante" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Définir 2027-2028 comme année courante ?");
    await expect(confirmation).toContainText(
      "2027-2028 sera proposée par défaut à l'encaissement et sur le tableau de bord. 2026-2027 n'est pas supprimée : ses impayés restent encaissables.",
    );
    await capture(page, DOSSIER, "UC02-03-11-confirmer-courante");
    await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
    await expect(page.getByText("2027-2028 est désormais l'année courante.")).toBeVisible();
    await expect(ligneParametre(page, /^2027-2028/)).toContainText("En cours");
    await expect(ligneParametre(page, /^2027-2028/)).toContainText("Année courante");
    await expect(ligneParametre(page, /^2026-2027/)).toContainText("Ouverte · à clôturer");
    await expect(ligneParametre(page, /^2026-2027/)).not.toContainText("Année courante");
    await capture(page, DOSSIER, "UC02-03-12-nouvelle-courante");
  });

  await test.step("10. Effet : l'inscription se fait maintenant en 2027-2028, bloquée tant que son tarif manque", async () => {
    await page.goto("/app/etudiants/nouveau");
    await expect(page.getByText(/Inscription en 2027-2028\./)).toBeVisible();
    await page.getByRole("radio", { name: /Infirmier\(e\)s/ }).click();
    await expect(page.getByText("Le tarif de Infirmier(e)s 1re année manque pour 2027-2028.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Inscrire l'étudiant" })).toBeDisabled();
    await capture(page, DOSSIER, "UC02-03-13-inscription-tarif-manquant");
  });

  await test.step("11. Revenir à 2026-2027 comme année courante", async () => {
    await ouvrirAnnees(page);
    await page.getByRole("button", { name: "Définir 2026-2027 comme année courante" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Définir comme année courante" }).click();
    await expect(page.getByText("2026-2027 est désormais l'année courante.")).toBeVisible();
    await expect(ligneParametre(page, /^2026-2027/)).toContainText("En cours");
    await expect(ligneParametre(page, /^2027-2028/)).toContainText("En préparation");
    await capture(page, DOSSIER, "UC02-03-14-retour-2026");
  });
});
