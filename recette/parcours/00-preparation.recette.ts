import { ETUDIANTS, inscrire, type EtudiantRecette } from "./aides";
import { capture, expect, SESSIONS, test } from "./outils";

// À lancer une seule fois après `pnpm recette:base` : il crée l'année 2025-2026, ce que le seed ne fait pas.
const DOSSIER = "00-preparation";

test.describe.configure({ mode: "serial" });
// Écran haut : la capture pleine page ne déforme pas la barre latérale collante.
test.use({ viewport: { width: 1440, height: 1300 } });

test.describe("Préparation — administrateur : l'année 2025-2026 et ses tarifs", () => {
  test.use({ storageState: SESSIONS.admin });

  test("créer 2025-2026, saisir ses tarifs, la rendre courante", async ({ page }) => {
    await test.step("1. Ouvrir Paramètres › Années scolaires", async () => {
      await page.goto("/app/parametres/annees");
      await expect(page.getByText("2026-2027").first()).toBeVisible();
      await expect(page.getByText("Année courante", { exact: true })).toBeVisible();
      await capture(page, DOSSIER, "P-01-annees-seed");
    });

    await test.step("2. Créer l'année 2025-2026", async () => {
      await page.getByRole("button", { name: "Nouvelle année" }).click();
      const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
      await dialogue.getByLabel("Année de début").fill("2025");
      await expect(dialogue.getByText(/Année 2025-2026 : mensualités de/)).toBeVisible();
      await capture(page, DOSSIER, "P-02-nouvelle-annee", dialogue);
      await dialogue.getByRole("button", { name: "Créer l'année" }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByRole("link", { name: "Tarifs de l'année 2025-2026" })).toBeVisible();
    });

    await test.step("3. Saisir les tarifs IF et SF 1re année : 100 000 Ar de droits, 80 000 Ar x 10 mois", async () => {
      await page.getByRole("link", { name: "Tarifs de l'année 2025-2026" }).click();
      await page.waitForURL("**/app/parametres/tarifs?annee=*");
      await expect(page.getByText("À saisir").first()).toBeVisible();
      for (const classe of ["IF 1re année", "SF 1re année"]) {
        await page.getByLabel(`Droits d'inscription, ${classe}`).fill("100 000");
        await page.getByLabel(`Mensualité, ${classe}`).fill("80 000");
        await expect(page.getByLabel(`Nombre de mois, ${classe}`)).toHaveValue("10");
      }
      await capture(page, DOSSIER, "P-03-tarifs-2025-saisis");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2025-2026 enregistrés.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/80\s000/);
      await capture(page, DOSSIER, "P-04-tarifs-2025-enregistres");
    });

    await test.step("4. Définir 2025-2026 comme année courante", async () => {
      await page.goto("/app/parametres/annees");
      await page.getByRole("button", { name: "Définir 2025-2026 comme année courante" }).click();
      const confirmation = page.getByRole("alertdialog");
      await expect(confirmation).toContainText("Définir 2025-2026 comme année courante ?");
      await capture(page, DOSSIER, "P-05-confirmer-2025-courante", confirmation);
      await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
      await expect(confirmation).toBeHidden();
      await expect(page.getByRole("button", { name: "Définir 2026-2027 comme année courante" })).toBeVisible();
    });
  });
});

test.describe("Préparation — secrétariat : les étudiants inscrits en 2025-2026", () => {
  test.use({ storageState: SESSIONS.secretariat });

  const EN_RETARD: EtudiantRecette[] = [
    ETUDIANTS.voahirana,
    ETUDIANTS.fanja,
    ETUDIANTS.tiana,
    ETUDIANTS.mialy,
    ETUDIANTS.lalaina,
    ETUDIANTS.solofo,
  ];

  test("inscrire six étudiants dont toutes les échéances sont échues", async ({ page }) => {
    for (const [i, e] of EN_RETARD.entries()) {
      await test.step(`${i + 5}. Inscrire ${e.nom} ${e.prenoms} (${e.matricule})`, async () => {
        await inscrire(page, e, i === 0 ? () => capture(page, DOSSIER, "P-06-formulaire-rempli") : undefined);
        if (i === 0) {
          await expect(page.getByRole("heading", { name: "Écolage 2025-2026 · 1re année" })).toBeVisible();
          await expect(page.getByText("Dont en retard")).toBeVisible();
          await capture(page, DOSSIER, "P-07-fiche-voahirana");
        }
      });
    }
  });
});

test.describe("Préparation — administrateur : retour à 2026-2027", () => {
  test.use({ storageState: SESSIONS.admin });

  test("rendre 2026-2027 de nouveau courante", async ({ page }) => {
    await test.step("11. Définir 2026-2027 comme année courante", async () => {
      await page.goto("/app/parametres/annees");
      await page.getByRole("button", { name: "Définir 2026-2027 comme année courante" }).click();
      const confirmation = page.getByRole("alertdialog");
      await confirmation.getByRole("button", { name: "Définir comme année courante" }).click();
      await expect(confirmation).toBeHidden();
      await expect(page.getByRole("button", { name: "Définir 2025-2026 comme année courante" })).toBeVisible();
      await capture(page, DOSSIER, "P-08-annees-final");
    });
  });
});

test.describe("Préparation — secrétariat : un étudiant inscrit en 2026-2027", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("inscrire Nirina, dont rien n'est encore en retard", async ({ page }) => {
    await test.step("12. Inscrire RAKOTOARISOA Nirina (IF-2026-0001)", async () => {
      await inscrire(page, ETUDIANTS.nirina);
      await capture(page, DOSSIER, "P-09-fiche-nirina");
    });
  });
});

test.describe("Préparation — contrôle : tous les étudiants au guichet", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("la liste des étudiants montre les sept inscrits", async ({ page }) => {
    await test.step("13. Ouvrir Étudiants", async () => {
      await page.goto("/app/etudiants");
      for (const e of Object.values(ETUDIANTS)) {
        await expect(page.getByText(e.matricule, { exact: true }).first()).toBeVisible();
      }
      await capture(page, DOSSIER, "P-10-liste-etudiants");
    });
  });
});
