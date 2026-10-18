import { choisirClasse, choisirDecision, decocher, DOSSIER_UC10 as DOSSIER, lienClasse, ouvrirAdmissions } from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });

test.describe("UC10-08 : l'administrateur crée l'année 2027-2028, sans ses tarifs", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 } });

  test("créer 2027-2028", async ({ page }) => {
    await test.step("1. Paramètres › Années scolaires : Nouvelle année 2027-2028, sans tarifs", async () => {
      await page.goto("/app/parametres/annees");
      await expect(page.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Nouvelle année" }).click();
      const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
      await dialogue.getByLabel("Année de début").fill("2027");
      await expect(dialogue.getByText(/Année 2027-2028 : mensualités de/)).toBeVisible();
      await dialogue.getByRole("button", { name: "Créer l'année" }).click();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText("Année 2027-2028 créée, en préparation. Saisissez maintenant ses tarifs.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Tarifs de l'année 2027-2028" })).toBeVisible();
      await capture(page, DOSSIER, "UC10-08-01-annee-2027-creee");
    });
  });
});

test.describe("UC10-08 : le secrétariat voit les classes bloquées", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

  test("tarif manquant : trois classes bloquées", async ({ page }) => {
    await test.step("2. Passage en année supérieure : 2026-2027 vers 2027-2028, trois classes « Tarif manquant »", async () => {
      await ouvrirAdmissions(page);
      await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
      await expect(page.getByText("Fin de l'année 2026-2027 : décidez, classe par classe, qui passe en 2027-2028.")).toBeVisible();
      await expect(page.getByText("0 classe validée sur 3")).toBeVisible();
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("Tarif manquant");
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("2 étudiants");
      await expect(lienClasse(page, "Infirmier(e)s", "2e année")).toContainText("Tarif manquant");
      await expect(lienClasse(page, "Infirmier(e)s", "2e année")).toContainText("3 étudiants");
      await expect(lienClasse(page, "Sage-femmes", "2e année")).toContainText("Tarif manquant");
      await expect(lienClasse(page, "Sage-femmes", "2e année")).toContainText("1 étudiant");
      await capture(page, DOSSIER, "UC10-08-02-classes-tarif-manquant");
    });

    await test.step("3. La classe Infirmier(e)s 1re année : le secrétariat doit demander le tarif à l'administrateur", async () => {
      await choisirClasse(page, "Infirmier(e)s", "1re année");
      await expect(page.getByRole("heading", { name: "Le tarif 2027-2028 des Infirmier(e)s 2e année n'est pas encore saisi" })).toBeVisible();
      await expect(page.getByText("Demandez à l'administrateur de le saisir dans Paramètres › Tarifs. Vous pourrez ensuite valider cette classe.")).toBeVisible();
      await expect(page.getByRole("link", { name: /Saisir le tarif/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Valider les/ })).toHaveCount(0);
      await capture(page, DOSSIER, "UC10-08-03-bloquee-secretariat");
    });
  });
});

test.describe("UC10-08 : l'administrateur saisit le tarif manquant", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1000 } });

  test("lien vers les tarifs de l'année cible, puis saisie du tarif IF 2e année", async ({ page }) => {
    await test.step("4. Même classe vue de l'administrateur : titre et bouton vers les tarifs", async () => {
      await ouvrirAdmissions(page);
      await choisirClasse(page, "Infirmier(e)s", "1re année");
      await expect(page.getByRole("heading", { name: "Saisissez d'abord le tarif 2027-2028 des Infirmier(e)s 2e année" })).toBeVisible();
      await expect(page.getByText("Sans ce tarif, l'application ne peut pas créer les mensualités de cette classe pour l'année suivante.")).toBeVisible();
      await capture(page, DOSSIER, "UC10-08-04-bloquee-administrateur");
    });

    await test.step("5. « Saisir le tarif 2027-2028 » ouvre la grille de l'année cible ; saisir IF 2e année", async () => {
      await page.getByRole("link", { name: "Saisir le tarif 2027-2028" }).click();
      await page.waitForURL("**/app/parametres/tarifs?annee=*");
      await page.getByLabel("Droits d'inscription, IF 2e année").fill("100 000");
      await page.getByLabel("Mensualité, IF 2e année").fill("80 000");
      await expect(page.getByLabel("Nombre de mois, IF 2e année")).toHaveValue("10");
      await capture(page, DOSSIER, "UC10-08-05-tarif-if-2e-saisi");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Modifiez directement les montants dans le tableau.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Mensualité, IF 2e année")).toHaveValue(/80\s000/);
    });
  });
});

test.describe("UC10-08 : le redoublant exige le tarif du même niveau", () => {
  test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1000 } });

  test("IF 1re année devient « À faire » ; décocher un étudiant bloque la validation", async ({ page }) => {
    await test.step("6. La classe Infirmier(e)s 1re année est « À faire » ; les deux autres restent bloquées", async () => {
      await ouvrirAdmissions(page);
      await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("À faire");
      await expect(lienClasse(page, "Infirmier(e)s", "2e année")).toContainText("Tarif manquant");
      await expect(lienClasse(page, "Sage-femmes", "2e année")).toContainText("Tarif manquant");
      await choisirClasse(page, "Infirmier(e)s", "1re année");
      await expect(page.getByText("2 étudiants · passage en 2e année pour 2027-2028")).toBeVisible();
      await expect(page.getByTestId("ligne-etudiant")).toHaveText([/RAKOTOARISOA Nirina/, /RANDRIAMAHEFA Solofo/]);
      await capture(page, DOSSIER, "UC10-08-06-classe-a-faire");
    });

    await test.step("7. Décocher RAKOTOARISOA Nirina : « Redouble » exige le tarif 1re année 2027-2028, absent", async () => {
      await decocher(page, "RAKOTOARISOA Nirina");
      await expect(
        page.getByText("Le tarif 2027-2028 des Infirmier(e)s 1re année n'est pas saisi : un redoublant ne peut pas être enregistré."),
      ).toBeVisible();
      await expect(page.getByText("Demandez à l'administrateur de le saisir dans Paramètres › Tarifs, ou choisissez « Abandon ».")).toBeVisible();
      await expect(page.getByText("Validation impossible : le tarif des redoublants manque (voir l'avertissement plus haut).")).toBeVisible();
      await expect(page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" })).toBeDisabled();
      await capture(page, DOSSIER, "UC10-08-07-redoublant-bloque");
    });

    await test.step("8. Choisir « Abandon » : la validation est de nouveau possible", async () => {
      await choisirDecision(page, "RAKOTOARISOA Nirina", "Abandon");
      await expect(page.getByText("Validation impossible : le tarif des redoublants manque (voir l'avertissement plus haut).")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" })).toBeEnabled();
      await capture(page, DOSSIER, "UC10-08-08-abandon-debloque");
    });
  });
});
