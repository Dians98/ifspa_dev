import { expect, test, type Locator, type Page } from "@playwright/test";
import { COMPTES } from "./comptes";

async function choisirDuree(dialogue: Locator, page: Page, libelle: string) {
  await dialogue.getByRole("combobox", { name: "Durée des études" }).click();
  await page.getByRole("option", { name: libelle }).click();
}

/** Un essai précédent interrompu a pu laisser l'année jetable en base. */
async function supprimerAnneeSiPresente(page: Page, libelle: string) {
  await page.goto("/app/parametres/annees");
  const bouton = page.getByRole("button", { name: `Supprimer l'année ${libelle}` });
  if (await bouton.count()) {
    await bouton.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer l'année" }).click();
    await expect(bouton).toHaveCount(0);
  }
}

async function supprimerFiliereSiPresente(page: Page, code: string) {
  await page.goto("/app/parametres/filieres");
  const bouton = page.getByRole("button", { name: `Supprimer la filière ${code}` });
  if (await bouton.count()) {
    await bouton.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer la filière" }).click();
    await expect(bouton).toHaveCount(0);
  }
}

// Données jetables propres à chaque projet (ordinateur / mobile tournent en parallèle sur la même base de dev),
// supprimées en fin de test. L'année courante et ses tarifs ne sont jamais modifiés.
function jetables(projet: string) {
  const mobile = projet.includes("mobile");
  return {
    code: mobile ? "ZZM" : "ZZD",
    anneeDebut: mobile ? 2098 : 2099,
  };
}

test.describe("Paramètres — secrétariat", () => {
  test.use({ storageState: COMPTES.secretariat.session });

  test("l'accès est réservé à l'administrateur", async ({ page }) => {
    await page.goto("/app/parametres/tarifs");
    await expect(page.getByText("Accès réservé à l'administrateur")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  });
});

test.describe("Paramètres — administrateur", () => {
  test.use({ storageState: COMPTES.admin.session });

  test("/app/parametres ouvre les filières", async ({ page }) => {
    await page.goto("/app/parametres");
    await page.waitForURL("**/app/parametres/filieres");
    await expect(page.getByRole("navigation", { name: "Sections des paramètres" })).toBeVisible();
    await expect(page.getByText("Infirmier(e)s").first()).toBeVisible();
  });

  test("ajouter puis supprimer une filière", async ({ page }, info) => {
    const { code } = jetables(info.project.name);
    await supprimerFiliereSiPresente(page, code);

    await page.getByRole("button", { name: "Ajouter une filière" }).click();
    const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
    await dialogue.getByLabel("Code").fill(code.toLowerCase());
    await dialogue.getByLabel("Nom de la filière").fill(`Filière de test ${code}`);
    await choisirDuree(dialogue, page, "2 ans");
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText(`Filière de test ${code}`)).toBeVisible();

    // Code déjà pris : refus clair, rien de créé.
    await page.getByRole("button", { name: "Ajouter une filière" }).click();
    await dialogue.getByLabel("Code").fill(code);
    await dialogue.getByLabel("Nom de la filière").fill("Doublon");
    await choisirDuree(dialogue, page, "2 ans");
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(dialogue.getByText(/déjà utilisé/i)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: `Supprimer la filière ${code}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer la filière" }).click();
    await expect(page.getByText(`Filière de test ${code}`)).toHaveCount(0);
  });

  test("créer une année, saisir un tarif, puis la supprimer", async ({ page }, info) => {
    const { anneeDebut } = jetables(info.project.name);
    const libelle = `${anneeDebut}-${anneeDebut + 1}`;
    await supprimerAnneeSiPresente(page, libelle);

    await page.getByRole("button", { name: "Nouvelle année" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
    await dialogue.getByLabel("Année de début").fill(String(anneeDebut));
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText(libelle).first()).toBeVisible();

    await page.getByRole("link", { name: `Tarifs de l'année ${libelle}` }).click();
    await page.waitForURL("**/app/parametres/tarifs?annee=*");
    await expect(page.getByText("À saisir").first()).toBeVisible();

    const enregistrer = page.getByRole("button", { name: "Enregistrer" });
    await expect(enregistrer).toBeDisabled();
    await page.getByLabel("Droits d'inscription, IF 1re année").fill("120 000");
    await page.getByLabel("Mensualité, IF 1re année").fill("90000");
    await page.getByLabel("Nombre de mois, IF 1re année").fill("10");
    await expect(enregistrer).toBeEnabled();
    await enregistrer.click();
    // Le bouton est aussi désactivé pendant l'envoi : attendre la fin réelle de l'enregistrement.
    await expect(page.getByText("Modifiez directement les montants dans le tableau.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/90\s?000/);
    // 120 000 + 90 000 × 10
    await expect(page.getByText(/1\s?020\s?000\s?Ar/)).toBeVisible();

    await page.goto("/app/parametres/annees");
    await page.getByRole("button", { name: `Supprimer l'année ${libelle}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer l'année" }).click();
    await expect(page.getByRole("button", { name: `Supprimer l'année ${libelle}` })).toHaveCount(0);
  });

  test("un montant invalide est signalé sans rien enregistrer", async ({ page }) => {
    await page.goto("/app/parametres/tarifs");
    const champ = page.getByLabel("Mensualité, IF 1re année");
    const avant = await champ.inputValue();
    await champ.fill("80,5");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText(/entier|chiffres|virgule/i).first()).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(avant);
  });

  test("utilisateurs : pas de changement de rôle sur son propre compte", async ({ page }) => {
    const nomAdmin = process.env.SEED_ADMIN_NAME ?? "Administrateur";
    await page.goto("/app/parametres/utilisateurs");
    await expect(page.getByText(COMPTES.admin.email)).toBeVisible();
    await expect(page.getByText(COMPTES.secretariat.email)).toBeVisible();
    await expect(page.getByRole("button", { name: `Changer le rôle de ${nomAdmin}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Désactiver le compte de ${nomAdmin}` })).toHaveCount(0);

    await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvel utilisateur" });
    await dialogue.getByRole("button", { name: "Créer le compte" }).click();
    await expect(dialogue.getByLabel("Nom")).toHaveAttribute("aria-invalid", "true");
    await expect(dialogue.getByLabel("Rôle")).toBeVisible();
  });
});
