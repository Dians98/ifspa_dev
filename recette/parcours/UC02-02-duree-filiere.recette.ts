import { ADMIN, ligneParametre, ouvrirFilieres, ouvrirTarifs, saisirTarif } from "./aides-parametres";
import { envoyerInscription, remplirInscription, type Inscrit } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

// Étudiant en 2e année : il fixe à 2 ans la durée minimale de la filière IF.
const TAHINA: Inscrit = {
  nom: "RAKOTONDRAZAKA",
  prenoms: "Tahina",
  sexe: "Masculin",
  naissance: "2004-08-23",
  lieu: "Toamasina",
  telephone: "034 00 000 11",
  adresse: "Lot 5, Ankirihiry, Toamasina",
  filiere: "IF",
  niveau: 2,
  matricule: "IF-2026-0002",
};

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

test.describe("UC02-02 : un étudiant entre en 2e année — secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("inscrire RAKOTONDRAZAKA Tahina en IF 2e année", async ({ page }) => {
    await test.step("1. Inscrire Tahina en 2e année (IF-2026-0002)", async () => {
      await remplirInscription(page, TAHINA);
      await envoyerInscription(page, TAHINA);
      await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
      await capture(page, DOSSIER, "UC02-02-01-tahina-2e-annee");
    });
  });
});

test.describe("UC02-02 : la durée d'une filière — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("la durée fixe les classes à tarifer et ne descend pas sous le niveau inscrit", async ({ page }) => {
    await test.step("2. Ajouter LT, Techniciens de laboratoire, en 2 ans", async () => {
      await ouvrirFilieres(page);
      await page.getByRole("button", { name: "Ajouter une filière" }).click();
      const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
      await dialogue.getByLabel("Code").fill("LT");
      await dialogue.getByLabel("Nom de la filière").fill("Techniciens de laboratoire");
      await dialogue.getByRole("combobox", { name: "Durée des études" }).click();
      await page.getByRole("option", { name: "2 ans" }).click();
      await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
      await expect(page.getByText("Filière LT créée. Saisissez maintenant ses tarifs.")).toBeVisible();
      await expect(ligneParametre(page, /^LT/)).toContainText("2 ans");
    });

    await test.step("3. Paramètres › Tarifs : LT n'a que 2 classes à saisir (1re et 2e année)", async () => {
      await ouvrirTarifs(page);
      await expect(page.getByLabel("Droits d'inscription, LT 1re année")).toBeVisible();
      await expect(page.getByLabel("Droits d'inscription, LT 2e année")).toBeVisible();
      await expect(page.getByLabel("Droits d'inscription, LT 3e année")).toHaveCount(0);
      await expect(page.getByText("2 tarifs sont à saisir.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-02-02-lt-deux-ans");
    });

    await test.step("4. Passer LT à 4 ans : la grille offre maintenant 4 classes", async () => {
      await ouvrirFilieres(page);
      await page.getByRole("button", { name: "Modifier la filière LT" }).click();
      const dialogue = page.getByRole("dialog", { name: "Modifier la filière LT" });
      await expect(dialogue.getByText("Le nom et la durée peuvent changer à tout moment.")).toBeVisible();
      await dialogue.getByRole("combobox", { name: "Durée des études" }).click();
      await page.getByRole("option", { name: "4 ans" }).click();
      await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
      await expect(page.getByText("Filière LT enregistrée.")).toBeVisible();
      await expect(ligneParametre(page, /^LT/)).toContainText("4 ans");
      await ouvrirTarifs(page);
      await expect(page.getByLabel("Droits d'inscription, LT 4e année")).toBeVisible();
      await expect(page.getByText("4 tarifs sont à saisir.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-02-03-lt-quatre-ans");
    });

    await test.step("5. IF a des étudiants en 2e année : le code est figé et « 1 an » n'est plus choisissable", async () => {
      await ouvrirFilieres(page);
      await page.getByRole("button", { name: "Modifier la filière IF" }).click();
      const dialogue = page.getByRole("dialog", { name: "Modifier la filière IF" });
      await expect(dialogue.getByLabel("Code")).toHaveValue("IF");
      await expect(dialogue.getByLabel("Code")).toHaveAttribute("readonly", "");
      await expect(dialogue.getByText(/Le code ne peut plus changer : des étudiants ont déjà un matricule IF-…/)).toBeVisible();
      await expect(dialogue.getByText("Au moins 2 ans : des étudiants sont inscrits jusqu'en 2e année.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-02-04-if-code-fige");
      await dialogue.getByRole("combobox", { name: "Durée des études" }).click();
      await expect(page.getByRole("option", { name: "1 an" })).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("option", { name: "2 ans" })).not.toHaveAttribute("aria-disabled", "true");
      await capture(page, DOSSIER, "UC02-02-05-if-duree-minimale");
      await page.keyboard.press("Escape");
      await dialogue.getByRole("button", { name: "Annuler" }).click();
    });

    await test.step("6. Saisir le tarif de LT 1re année, puis supprimer LT : « avec ses tarifs »", async () => {
      await ouvrirTarifs(page);
      await saisirTarif(page, "LT 1re année", { droits: "90 000", mensualite: "70 000" });
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
      await ouvrirFilieres(page);
      await page.getByRole("button", { name: "Supprimer la filière LT" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer la filière" }).click();
      await expect(page.getByText("Filière LT supprimée, avec ses tarifs.")).toBeVisible();
      await ouvrirTarifs(page);
      await expect(page.getByLabel("Droits d'inscription, LT 1re année")).toHaveCount(0);
      await expect(page.getByText(ADMIN)).toBeVisible();
      await capture(page, DOSSIER, "UC02-02-06-lt-supprimee");
    });
  });
});
