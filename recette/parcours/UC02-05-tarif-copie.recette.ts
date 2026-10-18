import { ETUDIANTS } from "./aides";
import { envoyerInscription, INSCRITS, recapitulatif, remplirInscription, type Inscrit } from "./aides-inscription";
import { ADMIN, choisirAnneeTarifs, ouvrirTarifs, saisirTarif } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";
const NIRINA = ETUDIANTS.nirina;
// Nirina est IF-2026-0001 (préparation), Tahina IF-2026-0002 (UC02-02) : le suivant est IF-2026-0003.
const HAINGO: Inscrit = { ...INSCRITS.haingo, matricule: "IF-2026-0003" };

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

async function ouvrirFiche(page: import("@playwright/test").Page, matricule: string, nom: string) {
  await page.goto("/app/etudiants");
  await page.getByRole("row").filter({ hasText: matricule }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nom);
}

const echeances = (page: import("@playwright/test").Page) => page.getByRole("listitem").filter({ hasText: "Reste" });

test.describe("UC02-05 : l'administrateur augmente le tarif IF 1re année", () => {
  test.use({ storageState: SESSIONS.admin });

  test("125 000 Ar de droits et 85 000 Ar par mois, avec le garde-fou « pas d'effet sur l'existant »", async ({ page }) => {
    await test.step("1. Paramètres › Tarifs 2026-2027 : IF 1re année à 100 000 Ar de droits, 80 000 Ar x 10 mois, 900 000 Ar", async () => {
      await ouvrirTarifs(page);
      await expect(page.getByText(ADMIN)).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Année scolaire" })).toContainText("2026-2027 · En cours");
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue(/^100\s000$/);
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/^80\s000$/);
      await expect(page.getByLabel("Nombre de mois, IF 1re année")).toHaveValue("10");
      await expect(page.getByRole("row").filter({ hasText: "IF 1re année" })).toContainText(/900\s000\sAr/);
      await expect(page.getByText("Modifier un tarif n'affecte pas les échéances déjà générées.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-05-01-tarifs-avant");
    });

    await test.step("2. Saisir 125 000 et 85 000 : le total passe à 975 000 Ar, Nirina garde l'ancien montant", async () => {
      await saisirTarif(page, "IF 1re année", { droits: "125 000", mensualite: "85 000" });
      await expect(page.getByRole("row").filter({ hasText: "IF 1re année" })).toContainText(/975\s000\sAr/);
      await expect(page.getByText("1 étudiant inscrit garde l'ancien montant.")).toBeVisible();
      await expect(page.getByText("1 classe modifiée, pas encore enregistrée.")).toBeVisible();
      await expect(page.getByText("Enregistrez ou annulez d'abord vos modifications.")).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Année scolaire" })).toBeDisabled();
      await capture(page, DOSSIER, "UC02-05-02-tarif-modifie");
    });

    await test.step("3. Annuler : les montants d'origine reviennent, rien n'est enregistré", async () => {
      await page.getByRole("button", { name: "Annuler" }).click();
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue(/^100\s000$/);
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/^80\s000$/);
      await expect(page.getByText("Modifiez directement les montants dans le tableau.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
      await capture(page, DOSSIER, "UC02-05-03-annule");
    });

    await test.step("4. Saisir de nouveau et Enregistrer : « Tarifs 2026-2027 enregistrés. »", async () => {
      await saisirTarif(page, "IF 1re année", { droits: "125 000", mensualite: "85 000" });
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
      await page.reload();
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue(/^125\s000$/);
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/^85\s000$/);
      await expect(page.getByRole("row").filter({ hasText: "IF 1re année" })).toContainText(/975\s000\sAr/);
      await capture(page, DOSSIER, "UC02-05-04-tarif-enregistre");
    });
  });
});

test.describe("UC02-05 : ce que voit le secrétariat — premier changement", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("Nirina garde 900 000 Ar, le nouvel inscrit paie 975 000 Ar", async ({ page }) => {
    await test.step("5. La fiche de RAKOTOARISOA Nirina (IF-2026-0001) n'a pas bougé : 900 000 Ar", async () => {
      await ouvrirFiche(page, NIRINA.matricule, "RAKOTOARISOA Nirina");
      await expect(echeances(page)).toHaveCount(11);
      await expect(echeances(page).filter({ hasText: "Droits d'inscription" })).toContainText(/100\s000\sAr/);
      await expect(echeances(page).filter({ hasText: /80\s000\sAr/ })).toHaveCount(10);
      await expect(page.getByText(/Sur 900\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC02-05-05-nirina-ancien-tarif");
    });

    await test.step("6. Inscrire RAJAONARISON Haingo en IF 1re année : le récapitulatif annonce 975 000 Ar", async () => {
      await remplirInscription(page, HAINGO);
      await expect(recapitulatif(page)).toContainText("IF-2026-0003");
      await expect(recapitulatif(page)).toContainText(/10 mensualités de\s*85\s000\sAr/);
      await expect(recapitulatif(page)).toContainText(/Total de l'année\s*975\s000\sAr/);
      await capture(page, DOSSIER, "UC02-05-06-recapitulatif-nouveau-tarif");
      await envoyerInscription(page, HAINGO);
      await expect(echeances(page)).toHaveCount(11);
      await expect(echeances(page).filter({ hasText: "Droits d'inscription" })).toContainText(/125\s000\sAr/);
      await expect(echeances(page).filter({ hasText: /85\s000\sAr/ })).toHaveCount(10);
      await expect(page.getByText(/Sur 975\s000\sAr dus au total/)).toBeVisible();
      await capture(page, DOSSIER, "UC02-05-07-haingo-nouveau-tarif");
    });
  });
});

test.describe("UC02-05 : l'administrateur revient au tarif d'origine", () => {
  test.use({ storageState: SESSIONS.admin });

  test("100 000 Ar de droits et 80 000 Ar par mois, 2 étudiants gardent leur montant", async ({ page }) => {
    await test.step("7. Remettre 100 000 et 80 000 : l'écran compte maintenant 2 inscrits qui gardent leur montant", async () => {
      await ouvrirTarifs(page);
      await saisirTarif(page, "IF 1re année", { droits: "100 000", mensualite: "80 000" });
      await expect(page.getByText("2 étudiants inscrits gardent l'ancien montant.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-05-08-retour-tarif");
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2026-2027 enregistrés.")).toBeVisible();
    });

    await test.step("8. Un tarif est propre à son année : 2027-2028 est vierge et 2026-2027 reste inchangé", async () => {
      await choisirAnneeTarifs(page, "2027-2028");
      await expect(page.getByText("6 tarifs sont à saisir.")).toBeVisible();
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue("");
      await saisirTarif(page, "IF 1re année", { droits: "110 000", mensualite: "90 000" });
      await expect(page.getByRole("row").filter({ hasText: "IF 1re année" })).toContainText(/1\s010\s000\sAr/);
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Tarifs 2027-2028 enregistrés.")).toBeVisible();
      await expect(page.getByText("5 tarifs sont à saisir.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-05-09-tarifs-2027");
      await choisirAnneeTarifs(page, "2026-2027");
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveValue(/^100\s000$/);
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/^80\s000$/);
      await capture(page, DOSSIER, "UC02-05-10-tarifs-2026-inchanges");
    });
  });
});

test.describe("UC02-05 : ce que voit le secrétariat — retour au tarif d'origine", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("les deux fiches n'ont pas bougé", async ({ page }) => {
    await test.step("9. Nirina reste à 900 000 Ar et Haingo à 975 000 Ar", async () => {
      await ouvrirFiche(page, NIRINA.matricule, "RAKOTOARISOA Nirina");
      await expect(page.getByText(/Sur 900\s000\sAr dus au total/)).toBeVisible();
      await ouvrirFiche(page, HAINGO.matricule, "RAJAONARISON Haingo");
      await expect(page.getByText(/Sur 975\s000\sAr dus au total/)).toBeVisible();
      await expect(echeances(page).filter({ hasText: /85\s000\sAr/ })).toHaveCount(10);
      await capture(page, DOSSIER, "UC02-05-11-haingo-inchange");
    });
  });
});
