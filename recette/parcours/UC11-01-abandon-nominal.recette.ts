import { aujourdhui, boutonSortie, cartesAnnee, dialogueSortie, DOSSIER_UC11 as DOSSIER, dontEnRetard, ouvrirFicheDe, resteAPayer, SECTION_H } from "./aides-sorties";
import { montantRegex } from "./aides";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1300 } });

const { hery } = SECTION_H;
const MOTIF = "A quitté l'institut pour raison familiale";

test("UC11-01 : un étudiant de 1re année abandonne en octobre", async ({ page }) => {
  test.setTimeout(120_000);
  const jour = aujourdhui();

  await test.step("1. Administrateur : la fiche de RAMAROSON Hery propose « Enregistrer une sortie »", async () => {
    await ouvrirFicheDe(page, hery.nom, hery.matricule);
    await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
    await expect(page.getByText("Actif", { exact: true })).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(900_000));
    await expect(dontEnRetard(page)).toHaveText("Aucun retard");
    await expect(boutonSortie(page)).toBeVisible();
    await capture(page, DOSSIER, "UC11-01-01-fiche-active");
  });

  await test.step("2. « Enregistrer une sortie » : Abandon est coché, la date du jour est proposée, le motif est vide", async () => {
    await boutonSortie(page).click();
    const dialogue = dialogueSortie(page);
    await expect(dialogue.getByText("L'étudiant n'apparaîtra plus dans les passages en année supérieure.")).toBeVisible();
    await expect(dialogue).toContainText("Cette sortie est définitive. Les mois après la sortie ne seront plus dus ; rien n'est en retard aujourd'hui.");
    await expect(dialogue.getByRole("radio", { name: "Abandon" })).toBeChecked();
    await expect(dialogue.getByRole("radio", { name: "Exclusion" })).not.toBeChecked();
    await expect(dialogue.getByLabel("Date de sortie")).toHaveValue(jour.iso);
    await expect(dialogue.getByLabel("Motif")).toHaveValue("");
    await expect(dialogue.getByText("Obligatoire : il reste visible dans le parcours de l'étudiant.")).toBeVisible();
    await expect(dialogue.getByRole("button", { name: "Enregistrer l'abandon" })).toBeVisible();
    await capture(page, DOSSIER, "UC11-01-02-fenetre-sortie", dialogue);
  });

  await test.step("3. Saisir le motif et « Enregistrer l'abandon »", async () => {
    const dialogue = dialogueSortie(page);
    await dialogue.getByLabel("Motif").fill(MOTIF);
    await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
    await expect(page.getByText("Abandon enregistré : 9 échéances des mois suivants ne sont plus dues.")).toBeVisible();
    await expect(dialogue).toBeHidden();
    await capture(page, DOSSIER, "UC11-01-03-message");
  });

  await test.step("4. La fiche : « Sorti · Abandon le … », plus de bouton de sortie, reste à payer 180 000 Ar", async () => {
    await expect(page.getByText(`Sorti · Abandon le ${jour.fr}`)).toBeVisible();
    await expect(boutonSortie(page)).toHaveCount(0);
    await expect(page.getByText("Actif", { exact: true })).toHaveCount(0);
    await expect(resteAPayer(page)).toHaveText(montantRegex(180_000));
    await expect(dontEnRetard(page)).toHaveText("Aucun retard");
    await expect(page.getByText(/Sur 180\s000\sAr dus au total/)).toBeVisible();
    await expect(page.getByText("9 échéances non dues après la sortie, hors des totaux.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Identité de l'étudiant" }).getByRole("link", { name: "Encaisser", exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC11-01-04-fiche-sortie");
  });

  await test.step("5. La grille : droits et octobre restent dus, novembre à juillet sont « Non due (sortie) »", async () => {
    const cartes = cartesAnnee(page, "Écolage 2026-2027 · 1re année");
    await expect(cartes).toHaveCount(11);
    await expect(cartes.filter({ hasText: "Non due (sortie)" })).toHaveCount(9);
    await expect(cartes.filter({ hasText: "Droits d'inscription" })).toContainText("À venir");
    await expect(cartes.filter({ hasText: "Octobre 2026" })).toContainText("À venir");
    await expect(cartes.filter({ hasText: "Novembre 2026" })).toContainText("Non due (sortie)");
    await expect(cartes.filter({ hasText: "Juillet 2027" })).toContainText("Non due (sortie)");
    await capture(page, DOSSIER, "UC11-01-05-grille", page.getByRole("heading", { name: "Écolage 2026-2027 · 1re année" }).locator("xpath=ancestor::section[1]"));
  });

  await test.step("6. L'onglet Parcours garde la sortie : date, type et motif", async () => {
    await page.getByRole("tab", { name: "Parcours" }).click();
    const parcours = page.getByRole("tabpanel", { name: "Parcours" });
    await expect(parcours).toContainText(`Sortie : Abandon`);
    await expect(parcours).toContainText(jour.fr);
    await expect(parcours).toContainText(MOTIF);
    await capture(page, DOSSIER, "UC11-01-06-parcours");
  });
});
