import { expect, test } from "@playwright/test";
import { COMPTES } from "./comptes";
import { test as testAvecEtudiant } from "./mise-en-place";

// Les tests s'enchaînent sur le même étudiant, créé avec un nom unique à chaque exécution
// (les projets ordinateur et mobile partagent la base de dev).
test.describe.configure({ mode: "serial" });

test.describe("Étudiants — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  const suffixe = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase();
  const nom = `ZTEST${suffixe}`;
  const prenoms = "Hélène";
  let urlFiche = "";

  test("inscrire un étudiant IF en 1re année", async ({ page }) => {
    await page.goto("/app/etudiants/nouveau");
    await expect(page.getByRole("heading", { level: 1, name: "Nouvel étudiant" })).toBeVisible();

    await page.getByLabel("Nom", { exact: true }).fill(nom);
    await page.getByLabel("Prénoms").fill(prenoms);
    await page.getByRole("radio", { name: "Féminin" }).click();
    await page.getByLabel("Date de naissance").fill("2005-03-14");
    await page.getByLabel("Lieu de naissance").fill("Toamasina");
    await page.getByLabel("Téléphone", { exact: true }).fill("034 12 345 67");
    await page.getByLabel("Adresse").fill("Lot 12, Tanambao V, Toamasina");

    await page.getByRole("radio", { name: /Infirmier/ }).click();

    // Le récapitulatif annonce le matricule indicatif et l'échéancier avant l'enregistrement.
    await expect(page.getByRole("complementary", { name: "Récapitulatif" })).toContainText(/IF-2026-\d{4}/);
    await expect(page.getByRole("complementary", { name: "Récapitulatif" })).toContainText(/exigibles en octobre 2026/);

    await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();

    await page.waitForURL(/\/app\/etudiants\/[^/?]+\?nouveau=1/);
    urlFiche = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { level: 1 })).toContainText(nom);
    await expect(page.getByRole("heading", { level: 1 }).locator("xpath=..")).toContainText(/IF-2026-\d{4}/);
    await expect(page.getByText(/Étudiant inscrit sous le matricule IF-2026-\d{4}/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Encaisser les droits d'inscription" })).toBeVisible();

    // Une échéance de droits + 10 mensualités.
    await expect(page.getByRole("listitem").filter({ hasText: "Reste" })).toHaveCount(11);
  });

  test("la recherche ignore les accents et se reflète dans l'URL", async ({ page }) => {
    await page.goto("/app/etudiants");
    await page.getByRole("searchbox", { name: /Rechercher/ }).fill(`helene ${nom.toLowerCase()}`);
    await expect(page).toHaveURL(/q=/);
    const lien = page.getByRole("link", { name: new RegExp(nom) });
    await expect(lien).toHaveCount(1);
    await lien.click();
    await expect(page).toHaveURL(new RegExp(`${urlFiche}$`));
  });

  test("modifier le téléphone", async ({ page }) => {
    await page.goto(urlFiche);
    await page.getByRole("link", { name: "Modifier" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Modifier l'étudiant" })).toBeVisible();
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(nom);

    await page.getByLabel("Téléphone", { exact: true }).fill("033 98 765 43");
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

    await page.waitForURL(new RegExp(`${urlFiche}$`));
    await page.getByRole("tab", { name: "Identité" }).click();
    await expect(page.getByText("033 98 765 43")).toBeVisible();
  });

  test("ajouter un tuteur : son nom est exigé dès qu'un téléphone est saisi", async ({ page }) => {
    await page.goto(urlFiche);
    await page.getByRole("link", { name: "Modifier" }).click();

    await page.getByLabel("Téléphone du tuteur").fill("032 11 222 33");
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page.getByLabel("Nom du tuteur")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Nom du tuteur").fill("RAKOTO Jean");
    await page.getByLabel("Profession du tuteur").fill("Commerçant");
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

    await page.waitForURL(new RegExp(`${urlFiche}$`));
    await page.getByRole("tab", { name: "Identité" }).click();
    const tuteur = page.getByRole("definition").filter({ hasText: "RAKOTO Jean" });
    await expect(tuteur).toContainText("Commerçant");
    await expect(tuteur.getByRole("link", { name: "032 11 222 33" })).toBeVisible();
  });
});

test.describe("Étudiants — fiche introuvable", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("un identifiant inconnu affiche la page introuvable", async ({ page }) => {
    // Le statut reste 200 : le squelette (loading.tsx) est déjà envoyé quand la fiche se révèle absente.
    await page.goto("/app/etudiants/identifiant-inconnu");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiant introuvable" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour aux étudiants" })).toBeVisible();
  });
});

testAvecEtudiant.describe("Étudiants — sortie", () => {
  testAvecEtudiant.describe("administrateur", () => {
    testAvecEtudiant.use({ storageState: COMPTES.admin.session });

    testAvecEtudiant("enregistrer un abandon : le statut s'affiche et la sortie n'est plus proposée", async ({ page, etudiant }) => {
      await page.goto(`/app/etudiants/${etudiant.id}`);
      await expect(page.getByText("Actif", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Enregistrer une sortie" }).click();

      const dialogue = page.getByRole("dialog", { name: "Enregistrer une sortie" });
      await expect(dialogue).toContainText("définitive");
      await expect(dialogue.getByRole("radio", { name: "Abandon" })).toBeChecked();

      // Le motif est obligatoire : l'erreur est liée au champ.
      await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
      await expect(dialogue.getByLabel("Motif")).toHaveAttribute("aria-invalid", "true");

      await dialogue.getByLabel("Motif").fill("A quitté l'institut pour raison familiale");
      await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();

      await expect(page.getByText(/Abandon enregistré/)).toBeVisible();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText(/Sorti · Abandon/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Enregistrer une sortie" })).toHaveCount(0);

      await page.getByRole("tab", { name: "Parcours" }).click();
      await expect(page.getByText("Sortie : Abandon")).toBeVisible();
      await expect(page.getByText("A quitté l'institut pour raison familiale")).toBeVisible();
    });
  });

  testAvecEtudiant.describe("secrétariat", () => {
    testAvecEtudiant.use({ storageState: COMPTES.secretariat.session });

    testAvecEtudiant("ne voit pas « Enregistrer une sortie »", async ({ page, etudiant }) => {
      await page.goto(`/app/etudiants/${etudiant.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(etudiant.nom);
      await expect(page.getByRole("link", { name: "Modifier" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Enregistrer une sortie" })).toHaveCount(0);
    });
  });
});
