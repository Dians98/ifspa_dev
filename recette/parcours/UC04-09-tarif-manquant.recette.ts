import { envoyerInscription, INSCRITS, recapitulatif, remplirInscription } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { hasina } = INSCRITS;
const MESSAGE_TARIF = "Le tarif de Kinésithérapeutes 1re année manque pour 2026-2027.";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

test.describe("UC04-09 : une filière sans tarif bloque l'inscription — administrateur, ajout de la filière", () => {
  test.use({ storageState: SESSIONS.admin });

  test("ajouter la filière Kinésithérapeutes (KN)", async ({ page }) => {
    await test.step("1. Paramètres › Filières › Ajouter une filière : KN, Kinésithérapeutes, 3 ans", async () => {
      await page.goto("/app/parametres/filieres");
      await expect(page.getByText("Administrateur IFSPA")).toBeVisible();
      await page.getByRole("button", { name: "Ajouter une filière" }).first().click();
      const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
      await dialogue.getByLabel("Code").fill("KN");
      await dialogue.getByLabel("Nom de la filière").fill("Kinésithérapeutes");
      await capture(page, DOSSIER, "UC04-09-01-ajout-filiere", dialogue);
      await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
      await expect(page.getByText("Filière KN créée. Saisissez maintenant ses tarifs.")).toBeVisible();
      await expect(dialogue).toBeHidden();
      await expect(page.getByText("Kinésithérapeutes").first()).toBeVisible();
      await capture(page, DOSSIER, "UC04-09-02-filieres");
    });
  });
});

test.describe("UC04-09 : secrétariat devant le tarif manquant", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("l'inscription en KN est bloquée avec un message clair", async ({ page }) => {
    await test.step("2. Choisir Kinésithérapeutes · KN : message de tarif manquant, bouton « Inscrire l'étudiant » inactif", async () => {
      await remplirInscription(page, hasina);
      await expect(recapitulatif(page)).toContainText(MESSAGE_TARIF);
      await expect(recapitulatif(page)).toContainText("Demandez à l'administrateur de l'ajouter dans Paramètres › Tarifs.");
      await expect(recapitulatif(page)).not.toContainText("Total de l'année");
      await expect(page.getByRole("button", { name: "Inscrire l'étudiant" })).toBeDisabled();
      await expect(page.getByText("Inscription bloquée tant que le tarif de ce niveau manque.")).toBeVisible();
      await capture(page, DOSSIER, "UC04-09-03-secretariat-tarif-manquant");
    });

    await test.step("3. La liste des niveaux signale « tarif manquant » pour chaque niveau de KN", async () => {
      await page.getByRole("combobox", { name: "Niveau" }).click();
      for (const niveau of ["1re année · tarif manquant", "2e année · tarif manquant", "3e année · tarif manquant"]) {
        await expect(page.getByRole("option", { name: niveau })).toBeVisible();
      }
      await capture(page, DOSSIER, "UC04-09-04-niveaux-sans-tarif");
      await page.keyboard.press("Escape");
    });
  });
});

test.describe("UC04-09 : administrateur, saisie du tarif manquant", () => {
  test.use({ storageState: SESSIONS.admin });

  test("le même écran renvoie vers Paramètres › Tarifs, le tarif saisi débloque l'inscription", async ({ page }) => {
    await test.step("4. Même formulaire côté administrateur : un lien « Ajoutez-le dans Paramètres › Tarifs »", async () => {
      await remplirInscription(page, hasina);
      await expect(recapitulatif(page)).toContainText(MESSAGE_TARIF);
      const lien = recapitulatif(page).getByRole("link", { name: "Ajoutez-le dans Paramètres › Tarifs" });
      await expect(lien).toBeVisible();
      await capture(page, DOSSIER, "UC04-09-05-admin-lien-tarifs");
      await lien.click();
      await page.waitForURL("**/app/parametres/tarifs");
    });

    await test.step("5. Saisir le tarif de KN 1re année : 100 000 Ar de droits, 80 000 Ar x 10 mois", async () => {
      await expect(page.getByText("À saisir").first()).toBeVisible();
      await page.getByLabel("Droits d'inscription, KN 1re année").fill("100 000");
      await page.getByLabel("Mensualité, KN 1re année").fill("80 000");
      await expect(page.getByLabel("Nombre de mois, KN 1re année")).toHaveValue("10");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
      await capture(page, DOSSIER, "UC04-09-06-tarif-kn-saisi");
    });
  });
});

test.describe("UC04-09 : secrétariat, l'inscription passe", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("KN 1re année s'inscrit, la séquence de KN commence à 0001", async ({ page }) => {
    await test.step("6. Le formulaire annonce KN-2026-0001 et 900 000 Ar, l'inscription aboutit", async () => {
      await remplirInscription(page, hasina);
      await expect(recapitulatif(page)).toContainText("KN-2026-0001");
      await expect(recapitulatif(page)).not.toContainText(MESSAGE_TARIF);
      await expect(recapitulatif(page)).toContainText(/Total de l'année\s*900\s000\sAr/);
      await expect(page.getByRole("button", { name: "Inscrire l'étudiant" })).toBeEnabled();
      await capture(page, DOSSIER, "UC04-09-07-tarif-present");
      await envoyerInscription(page, hasina);
      await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
      await capture(page, DOSSIER, "UC04-09-08-fiche-kn");
    });
  });
});
