import { envoyerInscription, INSCRITS, recapitulatif, remplirIdentite } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { solofo } = INSCRITS;

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-06 : un étudiant s'inscrit directement en 2e année", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Choisir Infirmier(e)s puis ouvrir la liste des niveaux", async () => {
    await page.goto("/app/etudiants/nouveau");
    await remplirIdentite(page, solofo);
    await page.getByRole("radio", { name: /Infirmier\(e\)s/ }).click();
    await page.getByRole("combobox", { name: "Niveau" }).click();
    for (const niveau of ["1re année", "2e année", "3e année"]) {
      await expect(page.getByRole("option", { name: niveau })).toBeVisible();
    }
    await capture(page, DOSSIER, "UC04-06-01-liste-niveaux");
  });

  await test.step("2. Choisir « 2e année » : le matricule indicatif suit la séquence de la filière", async () => {
    await page.getByRole("option", { name: "2e année" }).click();
    await expect(page.getByRole("combobox", { name: "Niveau" })).toContainText("2e année");
    await expect(recapitulatif(page)).toContainText("IF-2026-0005");
    await expect(recapitulatif(page)).toContainText(/Total de l'année\s*900\s000\sAr/);
    await capture(page, DOSSIER, "UC04-06-02-formulaire-2e-annee");
  });

  await test.step("3. Inscrire : la fiche est en 2e année, 2026-2027, avec onze échéances", async () => {
    await envoyerInscription(page, solofo);
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
    await expect(page.getByText("2e année · 2026-2027", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Reste" })).toHaveCount(11);
    await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
    await capture(page, DOSSIER, "UC04-06-03-fiche");
  });

  await test.step("4. L'onglet Parcours : une seule inscription, en 2e année", async () => {
    await page.getByRole("tab", { name: "Parcours" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("2e année");
    await capture(page, DOSSIER, "UC04-06-04-parcours");
  });

  await test.step("5. La liste des étudiants affiche « 2e année » et « 2026-2027 »", async () => {
    await page.goto("/app/etudiants");
    const ligne = page.getByRole("row").filter({ hasText: "IF-2026-0005" });
    await expect(ligne).toContainText("2e année");
    await expect(ligne).toContainText("2026-2027");
    await capture(page, DOSSIER, "UC04-06-05-liste");
  });
});
