import { ADMIN, ouvrirTarifs, saisirTarif } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 }, storageState: SESSIONS.admin });

test("UC02-07 : les montants de tarif doivent être des entiers en ariary, tout ou rien", async ({ page }) => {
  const enregistrer = () => page.getByRole("button", { name: "Enregistrer" }).click();
  const erreurs = page.getByRole("main");

  async function refuser(classe: string, champ: "droits" | "mensualite" | "mois", saisie: string, message: string) {
    await saisirTarif(page, classe, { [champ]: saisie });
    await enregistrer();
    await expect(erreurs.getByText(message, { exact: true })).toBeVisible();
  }

  await test.step("1. Ouvrir Tarifs 2026-2027", async () => {
    await ouvrirTarifs(page);
    await expect(page.getByText(ADMIN)).toBeVisible();
  });

  await test.step("2. Une virgule dans la mensualité (80 000,50) : refusé, la saisie est signalée", async () => {
    await refuser("IF 1re année", "mensualite", "80 000,50", "Saisissez un montant entier en ariary, sans virgule ni point (ex. 80 000).");
    await expect(erreurs.getByRole("alert")).toContainText("Vérifiez les champs signalés.");
    await capture(page, DOSSIER, "UC02-07-01-refus-virgule");
  });

  await test.step("3. Un point (80.000) : même refus", async () => {
    await refuser("IF 1re année", "mensualite", "80.000", "Saisissez un montant entier en ariary, sans virgule ni point (ex. 80 000).");
  });

  await test.step("4. Zéro, négatif, texte, vide : chacun a son message", async () => {
    await refuser("IF 1re année", "mensualite", "0", "Le montant doit être supérieur à 0.");
    await refuser("IF 1re année", "mensualite", "-5000", "Le montant ne peut pas être négatif.");
    await refuser("IF 1re année", "mensualite", "abc", "Saisissez uniquement des chiffres (ex. 80 000).");
    await refuser("IF 1re année", "mensualite", "", "Saisissez un montant.");
    await capture(page, DOSSIER, "UC02-07-02-refus-vide");
  });

  await test.step("5. Un montant démesuré (2 000 000 000) : « vérifiez le nombre de zéros »", async () => {
    await refuser("IF 1re année", "mensualite", "2 000 000 000", "Montant trop élevé : vérifiez le nombre de zéros.");
    await capture(page, DOSSIER, "UC02-07-03-refus-trop-eleve");
  });

  await test.step("6. Le nombre de mois est compris entre 1 et 10 : 11 et 0 refusés", async () => {
    await saisirTarif(page, "IF 1re année", { mensualite: "80 000" });
    await refuser("IF 1re année", "mois", "11", "Le nombre de mois est compris entre 1 et 10.");
    await capture(page, DOSSIER, "UC02-07-04-refus-onze-mois");
    await refuser("IF 1re année", "mois", "0", "Le nombre de mois est compris entre 1 et 10.");
    await refuser("IF 1re année", "mois", "dix", "Indiquez le nombre de mois.");
  });

  await test.step("7. Tout ou rien : un tarif valide (IF 1re année, 110 000 Ar) avec un tarif invalide (SF 1re année, 0) : rien n'est enregistré", async () => {
    await saisirTarif(page, "IF 1re année", { droits: "110 000", mensualite: "80 000", mois: "10" });
    await saisirTarif(page, "SF 1re année", { droits: "0" });
    await enregistrer();
    await expect(erreurs.getByText("Le montant doit être supérieur à 0.", { exact: true })).toBeVisible();
    await expect(page.getByText("2 classes modifiées, pas encore enregistrées.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-07-05-tout-ou-rien");
    await page.reload();
    await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue(/^100\s000$/);
    await expect(page.getByLabel("Droits d'inscription, SF 1re année")).toHaveValue(/^100\s000$/);
    await capture(page, DOSSIER, "UC02-07-06-rien-enregistre");
  });

  await test.step("8. « 90 000 Ar » et « 90000 » sont acceptés et remis en forme (90 000), en entiers", async () => {
    await saisirTarif(page, "SF 2e année", { droits: "100000", mensualite: "90 000 Ar" });
    await page.getByLabel("Droits d'inscription, SF 2e année").blur();
    await page.getByLabel("Mensualité, SF 2e année").blur();
    await expect(page.getByLabel("Droits d'inscription, SF 2e année")).toHaveValue(/^100\s000$/);
    await expect(page.getByLabel("Mensualité, SF 2e année")).toHaveValue(/^90\s000$/);
    await expect(page.getByRole("row").filter({ hasText: "SF 2e année" })).toContainText(/1\s000\s000\sAr/);
    await enregistrer();
    await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
    await capture(page, DOSSIER, "UC02-07-07-montants-reformates");
  });

  await test.step("9. Remettre SF 2e année à 80 000 Ar", async () => {
    await saisirTarif(page, "SF 2e année", { mensualite: "80 000" });
    await enregistrer();
    await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Mensualité, SF 2e année")).toHaveValue(/^80\s000$/);
  });
});
