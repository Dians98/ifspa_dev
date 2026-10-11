import { expect, test } from "@playwright/test";
import { COMPTES } from "./comptes";
import { creerClasseTest, supprimerClasseTest, type ClasseTest } from "./mise-en-place-admissions";

// Les tests s'enchaînent sur la même classe : validée par l'admin, vérifiée par le secrétariat, puis annulée.
// Elle appartient à une filière jetable, propre à chaque projet (ordinateur / mobile partagent la base de dev).
test.describe.configure({ mode: "serial" });

let classe: ClasseTest;

test.beforeAll(async () => {
  classe = await creerClasseTest();
});

test.afterAll(async () => {
  if (classe) await supprimerClasseTest(classe);
});

const adresse = () => `/app/admissions?classe=${encodeURIComponent(classe.cle)}`;

test.describe("Passage en année supérieure — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("valider une classe avec un redoublant et un abandon", async ({ page }) => {
    await page.goto(adresse());
    await expect(page.getByRole("heading", { level: 1, name: "Passage en année supérieure" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: classe.libelle })).toBeVisible();

    const [passe, redouble, abandon] = classe.etudiants;
    const case_ = (nom: string) => page.getByRole("checkbox", { name: new RegExp(nom) });
    await expect(case_(passe.nom)).toBeChecked();
    await expect(case_(redouble.nom)).toBeChecked();
    await expect(case_(abandon.nom)).toBeChecked();

    // Décocher : « Redouble » par défaut, avec le choix Redouble / Abandon sur la ligne.
    await case_(redouble.nom).click();
    await case_(abandon.nom).click();
    const choixAbandon = page.getByRole("radiogroup", { name: new RegExp(abandon.nom) });
    await expect(choixAbandon.getByRole("radio", { name: "Redouble" })).toBeChecked();
    await choixAbandon.getByRole("radio", { name: "Abandon" }).click();

    await expect(page.getByRole("button", { name: /Ne passent pas \(2\)/ })).toBeVisible();
    await expect(page.getByText("1 passe en 2e année")).toBeVisible();
    await expect(page.getByText("1 redouble", { exact: true })).toBeVisible();
    await expect(page.getByText("1 abandon", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Valider les ${classe.libelle}` }).click();

    // Une seule confirmation, qui nomme ceux qui ne passent pas.
    const dialogue = page.getByRole("dialog", { name: /Valider le passage/ });
    const exceptions = dialogue.getByRole("list", { name: "Étudiants qui ne passent pas" });
    await expect(exceptions).toContainText(redouble.nom);
    await expect(exceptions).toContainText(abandon.nom);
    await expect(exceptions).not.toContainText(passe.nom);
    await dialogue.getByRole("button", { name: "Valider le passage de 3 étudiants" }).click();

    await expect(page.getByText(/validée : 1 passe en 2e année/)).toBeVisible();
    await expect(dialogue).toBeHidden();

    // Après la validation, l'écran passe à une autre classe : on revient sur celle-ci.
    await page.goto(adresse());
    await expect(page.getByText("Classe validée", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler ce passage" })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    const liste = page.getByRole("list", { name: "Décisions du passage" });
    await expect(liste).toContainText("Passe en 2e année");
    await expect(liste).toContainText("Redouble");
    await expect(liste).toContainText("Abandon");
  });

  test("l'historique propose d'annuler le passage", async ({ page }) => {
    await page.goto("/app/admissions/historique");
    const ligne = page.locator("tr").filter({ hasText: classe.libelle });
    await expect(ligne).toContainText("Actif");
    await expect(ligne.getByRole("button", { name: /Annuler le passage/ })).toBeVisible();
  });
});

test.describe("Passage en année supérieure — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("voit la classe validée mais ne peut pas annuler le passage", async ({ page }) => {
    await page.goto(adresse());
    await expect(page.getByText("Classe validée", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler ce passage" })).toHaveCount(0);

    await page.goto("/app/admissions/historique");
    const ligne = page.locator("tr").filter({ hasText: classe.libelle });
    await expect(ligne).toContainText("Actif");
    await expect(page.getByRole("button", { name: /Annuler le passage/ })).toHaveCount(0);
  });
});

test.describe("Passage en année supérieure — annulation", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("l'administrateur annule : la classe redevient à faire", async ({ page }) => {
    await page.goto(adresse());
    await page.getByRole("button", { name: "Annuler ce passage" }).click();

    const dialogue = page.getByRole("dialog", { name: "Annuler ce passage ?" });
    await expect(dialogue).toContainText("Aucun reçu n'existe");
    await expect(dialogue).toContainText("La classe redevient « À faire »");
    await dialogue.getByRole("button", { name: "Annuler le passage" }).click();

    await expect(page.getByText(/Passage annulé/)).toBeVisible();
    await expect(dialogue).toBeHidden();

    await page.goto(adresse());
    await expect(page.getByRole("checkbox")).toHaveCount(3);
    await expect(page.getByRole("button", { name: `Valider les ${classe.libelle}` })).toBeVisible();

    await page.goto("/app/admissions/historique");
    const ligne = page.locator("tr").filter({ hasText: classe.libelle });
    await expect(ligne).toContainText("Annulé");
  });
});
