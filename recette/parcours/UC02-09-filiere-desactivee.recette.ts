import { choisirEtudiant, ETUDIANTS } from "./aides";
import { ADMIN, ligneParametre, ouvrirFilieres, ouvrirTarifs } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";
const MIALY = ETUDIANTS.mialy;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

test.describe("UC02-09 : désactiver SF, qui a des étudiants — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("la filière sort des inscriptions, ses étudiants restent suivis", async ({ page }) => {
    await test.step("1. Désactiver la filière SF (3 étudiants actifs)", async () => {
      await ouvrirFilieres(page);
      await expect(page.getByText(ADMIN)).toBeVisible();
      await expect(ligneParametre(page, /^SF/)).toContainText("3");
      await page.getByRole("button", { name: "Désactiver la filière SF" }).click();
      await expect(page.getByText("Filière désactivée : elle n'est plus proposée à l'inscription.")).toBeVisible();
      await expect(ligneParametre(page, /^SF/)).toContainText("Désactivée");
      await expect(ligneParametre(page, /^SF/)).toContainText("3");
      await capture(page, DOSSIER, "UC02-09-01-sf-desactivee");
    });

    await test.step("2. Ses tarifs restent saisissables : SF est gardée dans la grille pour le passage de ses étudiants", async () => {
      await ouvrirTarifs(page);
      await expect(page.getByLabel("Droits d'inscription, SF 1re année")).toBeVisible();
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toBeVisible();
      await capture(page, DOSSIER, "UC02-09-02-tarifs-sf-gardee");
    });
  });
});

test.describe("UC02-09 : ce que voit le secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("SF n'est plus proposée à l'inscription mais l'étudiante reste encaissable", async ({ page }) => {
    await test.step("3. Le formulaire d'inscription ne propose plus Sage-femmes", async () => {
      await page.goto("/app/etudiants/nouveau");
      await expect(page.getByRole("radio", { name: /Infirmier\(e\)s/ })).toBeVisible();
      await expect(page.getByRole("radio", { name: /Sage-femmes/ })).toHaveCount(0);
      await capture(page, DOSSIER, "UC02-09-03-inscription-sans-sf");
    });

    await test.step("4. La liste des étudiants montre toujours les sage-femmes, filière désactivée comprise", async () => {
      await page.goto("/app/etudiants");
      await expect(page.getByRole("row").filter({ hasText: MIALY.matricule })).toContainText("Sage-femmes");
      await expect(page.getByRole("row").filter({ hasText: "SF-2026-0001" })).toContainText("RAMAROSON Lova");
      await capture(page, DOSSIER, "UC02-09-04-liste-avec-sf");
    });

    await test.step("5. Au guichet, RAZAFINDRAKOTO Mialy (SF) est trouvée avec son reste à payer", async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, MIALY);
      await expect(page.getByText(/Reste à payer :\s*900\s000\sAr, dont 900\s000\sAr en retard/)).toBeVisible();
      await capture(page, DOSSIER, "UC02-09-05-guichet-sf");
    });
  });
});

test.describe("UC02-09 : réactiver SF — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("SF revient dans les inscriptions", async ({ page }) => {
    await test.step("6. Réactiver SF", async () => {
      await ouvrirFilieres(page);
      await page.getByRole("button", { name: "Réactiver la filière SF" }).click();
      await expect(page.getByText("Filière activée.")).toBeVisible();
      await expect(ligneParametre(page, /^SF/)).toContainText("Active");
      await page.goto("/app/etudiants/nouveau");
      await expect(page.getByRole("radio", { name: /Sage-femmes/ })).toBeVisible();
      await capture(page, DOSSIER, "UC02-09-06-inscription-avec-sf");
    });
  });
});
