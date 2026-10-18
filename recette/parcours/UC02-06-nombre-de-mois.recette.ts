import { envoyerInscription, recapitulatif, remplirInscription, type Inscrit } from "./aides-inscription";
import { ADMIN, ouvrirTarifs, saisirTarif } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";
const LOVA: Inscrit = {
  nom: "RAMAROSON",
  prenoms: "Lova",
  sexe: "Féminin",
  naissance: "2005-09-12",
  lieu: "Toamasina",
  telephone: "034 00 000 12",
  adresse: "Lot 77, Tanambao I, Toamasina",
  filiere: "SF",
  matricule: "SF-2026-0001",
};

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

const echeances = (page: import("@playwright/test").Page) => page.getByRole("listitem").filter({ hasText: "Reste" });

test.describe("UC02-06 : SF 1re année passe à 9 mois — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("9 mensualités au lieu de 10", async ({ page }) => {
    await test.step("1. Tarifs 2026-2027 : SF 1re année, nombre de mois 9, total 820 000 Ar", async () => {
      await ouvrirTarifs(page);
      await expect(page.getByText(ADMIN)).toBeVisible();
      await saisirTarif(page, "SF 1re année", { mois: "9" });
      await expect(page.getByRole("row").filter({ hasText: "SF 1re année" })).toContainText(/820\s000\sAr/);
      await expect(page.getByText("1 classe modifiée, pas encore enregistrée.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-06-01-sf-neuf-mois");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
    });
  });
});

test.describe("UC02-06 : une étudiante s'inscrit en SF — secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("l'échéancier s'arrête en juin 2027", async ({ page }) => {
    await test.step("2. Inscrire RAMAROSON Lova : le récapitulatif annonce 9 mensualités, 820 000 Ar", async () => {
      await remplirInscription(page, LOVA);
      await expect(recapitulatif(page)).toContainText("SF-2026-0001");
      await expect(recapitulatif(page)).toContainText(/9 mensualités de\s*80\s000\sAr/);
      await expect(recapitulatif(page)).toContainText(/Total de l'année\s*820\s000\sAr/);
      await capture(page, DOSSIER, "UC02-06-02-recapitulatif-neuf-mois");
    });

    await test.step("3. La fiche : droits + 9 mensualités d'octobre 2026 à juin 2027, pas de juillet 2027", async () => {
      await envoyerInscription(page, LOVA);
      await expect(echeances(page)).toHaveCount(10);
      await expect(echeances(page).filter({ hasText: /80\s000\sAr/ })).toHaveCount(9);
      await expect(echeances(page).filter({ hasText: "Octobre 2026" })).toHaveCount(1);
      await expect(echeances(page).filter({ hasText: "Juin 2027" })).toHaveCount(1);
      await expect(echeances(page).filter({ hasText: "Juillet 2027" })).toHaveCount(0);
      await expect(page.getByText(/Sur 820\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC02-06-03-fiche-lova");
    });
  });
});

test.describe("UC02-06 : retour à 10 mois — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("SF 1re année repasse à 10 mois", async ({ page }) => {
    await test.step("4. Remettre 10 mois : le total redevient 900 000 Ar, l'étudiante inscrite garde 9 mois", async () => {
      await ouvrirTarifs(page);
      await saisirTarif(page, "SF 1re année", { mois: "10" });
      await expect(page.getByRole("row").filter({ hasText: "SF 1re année" })).toContainText(/900\s000\sAr/);
      await expect(page.getByText("1 étudiant inscrit garde l'ancien montant.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-06-04-retour-dix-mois");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
    });
  });
});

test.describe("UC02-06 : la fiche de Lova — secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("elle garde ses 9 mensualités", async ({ page }) => {
    await test.step("5. Sa fiche n'a pas changé : 820 000 Ar, toujours sans juillet 2027", async () => {
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: LOVA.matricule }).getByRole("link").first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RAMAROSON Lova");
      await expect(echeances(page)).toHaveCount(10);
      await expect(echeances(page).filter({ hasText: "Juillet 2027" })).toHaveCount(0);
      await expect(page.getByText(/Sur 820\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC02-06-05-fiche-lova-inchangee");
    });
  });
});
