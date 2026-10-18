import { choisirClasse, decocher, DOSSIER_UC10 as DOSSIER, ETUDIANTS_IF as IF, lienClasse, ouvrirAdmissions } from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });

test.describe("UC10-07 : toutes les classes de l'année sont passées, l'année suivante n'existe pas", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

  test("secrétariat : écran bloqué, sans lien vers les Paramètres", async ({ page }) => {
    test.setTimeout(120_000);

    await test.step("1. Rétablir le passage des Infirmier(e)s 1re année (annulé en UC10-04), comme en UC10-01", async () => {
      await ouvrirAdmissions(page);
      await expect(page.getByText("Fin de l'année 2025-2026 : décidez, classe par classe, qui passe en 2026-2027.")).toBeVisible();
      await expect(page.getByText("1 classe validée sur 2")).toBeVisible();
      await choisirClasse(page, "Infirmier(e)s", "1re année");
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("À faire");
      await decocher(page, IF.solofo);
      await page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" }).click();
      const dialogue = page.getByRole("dialog", { name: "Valider le passage des Infirmier(e)s 1re année ?" });
      await dialogue.getByRole("button", { name: "Valider le passage de 4 étudiants" }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText("Infirmier(e)s 1re année validée : 3 passent en 2e année · 1 redouble.")).toBeVisible();
      await capture(page, DOSSIER, "UC10-07-01-derniere-classe-validee");
    });

    await test.step("2. L'année 2026-2027 devient la source : l'année 2027-2028 n'existe pas, le passage est bloqué", async () => {
      await ouvrirAdmissions(page);
      await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
      const ecran = page.getByRole("region", { name: "Passage impossible" });
      await expect(ecran).toBeVisible();
      await expect(ecran.getByRole("heading", { name: "Le passage en année supérieure n'est pas possible pour le moment" })).toBeVisible();
      console.log(`ECRAN-BLOQUE-SEC ${await ecran.innerText()}`);
      await expect(page.getByRole("link", { name: /Ouvrir Paramètres/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Paramètres/ })).toHaveCount(0);
      await capture(page, DOSSIER, "UC10-07-02-bloque-secretariat");
    });
  });
});

test.describe("UC10-07 : l'administrateur voit le lien vers les années", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 } });

  test("administrateur : lien « Ouvrir Paramètres › Années scolaires »", async ({ page }) => {
    await test.step("3. Même écran avec le lien vers Paramètres › Années scolaires", async () => {
      await ouvrirAdmissions(page);
      await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      const ecran = page.getByRole("region", { name: "Passage impossible" });
      await expect(ecran).toBeVisible();
      await expect(ecran.getByRole("link", { name: "Ouvrir Paramètres › Années scolaires" })).toBeVisible();
      await capture(page, DOSSIER, "UC10-07-03-bloque-administrateur");
    });

    await test.step("4. Le lien ouvre Paramètres › Années scolaires", async () => {
      await page.getByRole("link", { name: "Ouvrir Paramètres › Années scolaires" }).click();
      await page.waitForURL("**/app/parametres/annees");
      await expect(page.getByText("2026-2027").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Nouvelle année" })).toBeVisible();
      await capture(page, DOSSIER, "UC10-07-04-parametres-annees");
    });
  });
});
