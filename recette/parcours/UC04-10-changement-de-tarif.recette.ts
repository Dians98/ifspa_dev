import { envoyerInscription, INSCRITS, recapitulatif, remplirInscription } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { voahirana, haingo: base } = INSCRITS;
const haingo = { ...base, tranches: 3 } as const;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

test.describe("UC04-10 : changement de tarif — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("IF 1re année passe à 125 000 Ar de droits et 85 000 Ar par mois", async ({ page }) => {
    await test.step("1. Paramètres › Tarifs : modifier IF 1re année, l'écran annonce que les inscrits gardent l'ancien montant", async () => {
      await page.goto("/app/parametres/tarifs");
      await expect(page.getByText("Administrateur IFSPA")).toBeVisible();
      await expect(page.getByText("Modifier un tarif n'affecte pas les échéances déjà générées.")).toBeVisible();
      await page.getByLabel("Droits d'inscription, IF 1re année").fill("125 000");
      await page.getByLabel("Mensualité, IF 1re année").fill("85 000");
      await expect(page.getByText("4 étudiants inscrits gardent l'ancien montant.")).toBeVisible();
      await expect(page.getByText("1 classe modifiée, pas encore enregistrée.")).toBeVisible();
      await capture(page, DOSSIER, "UC04-10-01-tarif-modifie");
    });

    await test.step("2. Enregistrer : « Tarifs 2026-2027 enregistrés. », total 975 000 Ar", async () => {
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue(/125\s000/);
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/85\s000/);
      await expect(page.getByText(/975\s000\sAr/)).toBeVisible();
      await capture(page, DOSSIER, "UC04-10-02-tarif-enregistre");
    });
  });
});

test.describe("UC04-10 : changement de tarif — secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("les inscrits gardent leur échéancier, le nouvel inscrit prend le nouveau tarif", async ({ page }) => {
    await test.step("3. La fiche de RAKOTOMALALA Voahirana (IF-2026-0001) n'a pas bougé : 900 000 Ar, droits 100 000 Ar, mensualités 80 000 Ar", async () => {
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: voahirana.matricule }).getByRole("link").first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("RAKOTOMALALA Voahirana");
      await expect(page.getByText(voahirana.matricule, { exact: true }).first()).toBeVisible();
      const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
      await expect(grille).toHaveCount(11);
      await expect(grille.filter({ hasText: "Droits d'inscription" })).toContainText(/100\s000\sAr/);
      await expect(grille.filter({ hasText: /80\s000\sAr/ })).toHaveCount(10);
      await expect(page.getByText(/Sur 900\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC04-10-03-ancien-inscrit");
    });

    await test.step("4. Nouvel étudiant IF 1re année, droits en 3 fois : le récapitulatif applique le nouveau tarif", async () => {
      await remplirInscription(page, haingo);
      await expect(recapitulatif(page)).toContainText("IF-2026-0006");
      await expect(recapitulatif(page)).toContainText(/Droits 1\/3\s*· octobre\s*43\s000\sAr/);
      await expect(recapitulatif(page)).toContainText(/Droits 2\/3\s*· novembre\s*41\s000\sAr/);
      await expect(recapitulatif(page)).toContainText(/Droits 3\/3\s*· décembre\s*41\s000\sAr/);
      await expect(recapitulatif(page)).toContainText(/10 mensualités de\s*85\s000\sAr/);
      await expect(recapitulatif(page)).toContainText(/Total de l'année\s*975\s000\sAr/);
      await capture(page, DOSSIER, "UC04-10-04-formulaire-nouveau-tarif");
    });

    await test.step("5. Inscrire : la fiche montre 975 000 Ar, droits 43 000 + 41 000 + 41 000 Ar (le reste sur la 1re tranche)", async () => {
      await envoyerInscription(page, haingo);
      const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
      await expect(grille).toHaveCount(13);
      await expect(grille.filter({ hasText: "Droits — tranche 1/3" })).toContainText(/43\s000\sAr/);
      await expect(grille.filter({ hasText: "Droits — tranche 2/3" })).toContainText(/41\s000\sAr/);
      await expect(grille.filter({ hasText: "Droits — tranche 3/3" })).toContainText(/41\s000\sAr/);
      await expect(grille.filter({ hasText: /85\s000\sAr/ })).toHaveCount(10);
      await expect(page.getByText(/Sur 975\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC04-10-05-fiche-nouveau-tarif");
    });

    await test.step("6. Redécouper les droits de Voahirana en 3 fois : le découpage part de ses 100 000 Ar d'origine", async () => {
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: voahirana.matricule }).getByRole("link").first().click();
      await page.getByRole("button", { name: "Modifier le paiement des droits 2026-2027" }).click();
      const dialogue = page.getByRole("dialog", { name: "Droits d'inscription 2026-2027" });
      await dialogue.getByRole("radio", { name: "En 3 fois" }).click();
      await dialogue.getByRole("button", { name: "Payer les droits en 3 fois" }).click();
      await expect(page.getByText("Droits 2026-2027 payables en 3 fois.")).toBeVisible();
      const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
      await expect(grille).toHaveCount(13);
      await expect(grille.filter({ hasText: "Droits — tranche 1/3" })).toContainText(/34\s000\sAr/);
      await expect(grille.filter({ hasText: "Droits — tranche 2/3" })).toContainText(/33\s000\sAr/);
      await expect(grille.filter({ hasText: "Droits — tranche 3/3" })).toContainText(/33\s000\sAr/);
      await expect(page.getByText(/Sur 900\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC04-10-06-redecoupage-ancien-tarif");
    });
  });
});
