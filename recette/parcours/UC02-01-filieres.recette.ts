import { ADMIN, ligneParametre, ouvrirFilieres } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 }, storageState: SESSIONS.admin });

test("UC02-01 : ajouter, corriger, désactiver et supprimer une filière", async ({ page }) => {
  await test.step("1. Ouvrir Paramètres › Filières : IF et SF, 3 ans, étudiants actifs, aucune suppression possible", async () => {
    await ouvrirFilieres(page);
    await expect(page.getByText(ADMIN)).toBeVisible();
    const IF = ligneParametre(page, /^IF/);
    await expect(IF).toContainText("Infirmier(e)s");
    await expect(IF).toContainText("3 ans");
    await expect(IF).toContainText("Active");
    await expect(IF.getByRole("button", { name: "Supprimer la filière IF" })).toHaveCount(0);
    await expect(ligneParametre(page, /^SF/)).toContainText("Sage-femmes");
    await capture(page, DOSSIER, "UC02-01-01-filieres");
  });

  await test.step("2. Pourquoi IF ne se supprime pas : le motif sous l'icône d'information", async () => {
    await ligneParametre(page, /^IF/).getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" }).click();
    await expect(page.getByText(/Cette filière ne peut pas être supprimée : \d+ étudiants y sont rattachés\./)).toBeVisible();
    await capture(page, DOSSIER, "UC02-01-02-motif-suppression");
    await page.keyboard.press("Escape");
  });

  await test.step("3. Ajouter KN : refus d'un code déjà utilisé (IF)", async () => {
    await page.getByRole("button", { name: "Ajouter une filière" }).click();
    const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
    await dialogue.getByLabel("Code").fill("if");
    await dialogue.getByLabel("Nom de la filière").fill("Kinésithérapeutes");
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(dialogue.getByText("Le code IF est déjà utilisé par une autre filière.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-01-03-refus-code-pris");
  });

  await test.step("4. Refus d'un code d'une seule lettre, puis d'un nom vide", async () => {
    const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
    await dialogue.getByLabel("Code").fill("K");
    await dialogue.getByLabel("Nom de la filière").fill("");
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(dialogue.getByText("Le code compte 2 ou 3 lettres sans accent (ex. IF).").first()).toBeVisible();
    await expect(dialogue.getByText("Indiquez le nom de la filière.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-01-04-refus-code-nom");
  });

  await test.step("5. Corriger : KN, Kinésithérapeutes, 4 ans, puis Enregistrer la filière", async () => {
    const dialogue = page.getByRole("dialog", { name: "Ajouter une filière" });
    await dialogue.getByLabel("Code").fill("kn");
    await dialogue.getByLabel("Nom de la filière").fill("Kinésithérapeutes");
    await dialogue.getByRole("combobox", { name: "Durée des études" }).click();
    await page.getByRole("option", { name: "4 ans" }).click();
    await capture(page, DOSSIER, "UC02-01-05-formulaire-kn");
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(page.getByText("Filière KN créée. Saisissez maintenant ses tarifs.")).toBeVisible();
    const KN = ligneParametre(page, /^KN/);
    await expect(KN).toContainText("Kinésithérapeutes");
    await expect(KN).toContainText("4 ans");
    await expect(KN).toContainText("Active");
    await capture(page, DOSSIER, "UC02-01-06-kn-creee");
  });

  await test.step("6. Modifier KN : le nom devient « Kinésithérapie »", async () => {
    await page.getByRole("button", { name: "Modifier la filière KN" }).click();
    const dialogue = page.getByRole("dialog", { name: "Modifier la filière KN" });
    await expect(dialogue.getByLabel("Code")).toHaveValue("KN");
    await dialogue.getByLabel("Nom de la filière").fill("Kinésithérapie");
    await dialogue.getByRole("button", { name: "Enregistrer la filière" }).click();
    await expect(page.getByText("Filière KN enregistrée.")).toBeVisible();
    await expect(ligneParametre(page, /^KN/)).toContainText("Kinésithérapie");
    await capture(page, DOSSIER, "UC02-01-07-kn-renommee");
  });

  await test.step("7. Désactiver KN : elle n'est plus proposée à l'inscription", async () => {
    await page.getByRole("button", { name: "Désactiver la filière KN" }).click();
    await expect(page.getByText("Filière désactivée : elle n'est plus proposée à l'inscription.")).toBeVisible();
    await expect(ligneParametre(page, /^KN/)).toContainText("Désactivée");
    await capture(page, DOSSIER, "UC02-01-08-kn-desactivee");
  });

  await test.step("7 bis. Le formulaire d'inscription ne propose plus KN", async () => {
    await page.goto("/app/etudiants/nouveau");
    await expect(page.getByRole("radio", { name: /Infirmier\(e\)s/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Sage-femmes/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Kinésithérapie/ })).toHaveCount(0);
    await capture(page, DOSSIER, "UC02-01-08b-inscription-sans-kn");
    await ouvrirFilieres(page);
  });

  await test.step("8. Réactiver KN", async () => {
    await page.getByRole("button", { name: "Réactiver la filière KN" }).click();
    await expect(page.getByText("Filière activée.")).toBeVisible();
    await expect(ligneParametre(page, /^KN/)).toContainText("Active");
    await page.goto("/app/etudiants/nouveau");
    await expect(page.getByRole("radio", { name: /Kinésithérapie/ })).toBeVisible();
    await capture(page, DOSSIER, "UC02-01-08c-inscription-avec-kn");
    await ouvrirFilieres(page);
  });

  await test.step("9. Supprimer KN (aucun étudiant) : une confirmation, puis la filière disparaît", async () => {
    await page.getByRole("button", { name: "Supprimer la filière KN" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Supprimer la filière KN ?");
    await expect(confirmation).toContainText("Aucun étudiant n'y est rattaché. Cette suppression est définitive.");
    await capture(page, DOSSIER, "UC02-01-09-confirmer-suppression");
    await confirmation.getByRole("button", { name: "Supprimer la filière" }).click();
    await expect(page.getByText("Filière KN supprimée, avec ses tarifs.")).toBeVisible();
    await expect(ligneParametre(page, /^KN/)).toHaveCount(0);
    await capture(page, DOSSIER, "UC02-01-10-kn-supprimee");
  });
});
