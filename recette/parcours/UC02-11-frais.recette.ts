import { ETUDIANTS, boutonEncaisser, choisirEtudiant, grandEcran, inscrire, montantRecu, recuEnregistre, type EtudiantRecette } from "./aides";
import { ADMIN, ligneParametre } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";
const NIRINA = ETUDIANTS.nirina;
// Nirina est IF-2026-0001, Tahina IF-2026-0002, Haingo IF-2026-0003 : le suivant est IF-2026-0004.
const HERY: EtudiantRecette = {
  nom: "RANDRIANTSOA",
  prenoms: "Hery",
  sexe: "Masculin",
  naissance: "2006-04-25",
  lieu: "Toamasina",
  telephone: "034 00 000 11",
  adresse: "Lot 52, Morarano, Toamasina",
  filiere: "IF",
  annee: "2026-2027",
  matricule: "IF-2026-0004",
};

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });
test.setTimeout(90_000);

async function ouvrirCreation(page: import("@playwright/test").Page, v: { libelle: string; montant: string; mois: string }) {
  await page.getByRole("button", { name: "Nouveau frais" }).first().click();
  const dialogue = page.getByRole("dialog", { name: "Nouveau frais" });
  await dialogue.getByLabel("Libellé").fill(v.libelle);
  await dialogue.getByLabel("Montant par étudiant (Ar)").fill(v.montant);
  await dialogue.getByRole("combobox", { name: "Exigible en" }).click();
  await page.getByRole("option", { name: v.mois }).click();
  await dialogue.getByRole("checkbox", { name: "IF 1re année" }).check();
  return dialogue;
}

test.describe("UC02-11 : l'administrateur crée deux frais pour IF 1re année", () => {
  test.use({ storageState: SESSIONS.admin });

  test("frais de stage (décembre) et frais d'examen (octobre), avec récapitulatif", async ({ page }) => {
    await test.step("1. Paramètres › Frais : aucun frais pour 2026-2027", async () => {
      await page.goto("/app/parametres/frais");
      await expect(page.getByText(ADMIN)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Frais en cours d'année" })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Année scolaire" })).toContainText("2026-2027 · courante");
      await expect(page.getByText("Aucun frais pour l'année 2026-2027.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-01-frais-vide");
    });

    await test.step("2. Nouveau frais : les mois proposés vont d'octobre 2026 à juillet 2027", async () => {
      await page.getByRole("button", { name: "Nouveau frais" }).first().click();
      const dialogue = page.getByRole("dialog", { name: "Nouveau frais" });
      await expect(dialogue).toContainText("Année 2026-2027. Chaque étudiant des classes cochées reçoit une échéance du même montant.");
      await expect(dialogue.getByRole("button", { name: /^Créer le frais/ })).toBeDisabled();
      await dialogue.getByRole("combobox", { name: "Exigible en" }).click();
      await expect(page.getByRole("option")).toHaveText([
        "Octobre 2026", "Novembre 2026", "Décembre 2026", "Janvier 2027", "Février 2027",
        "Mars 2027", "Avril 2027", "Mai 2027", "Juin 2027", "Juillet 2027",
      ]);
      await capture(page, DOSSIER, "UC02-11-02-mois-proposes");
      await page.keyboard.press("Escape");
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    });

    await test.step("3. Frais de stage, 15 000 Ar, décembre 2026, IF 1re année : le récapitulatif annonce 2 étudiants", async () => {
      const dialogue = await ouvrirCreation(page, { libelle: "Frais de stage", montant: "15000", mois: "Décembre 2026" });
      await expect(dialogue).toContainText("2 étudiants recevront 15 000 Ar, exigibles en décembre 2026.");
      await expect(dialogue.getByRole("button", { name: /^Créer le frais de 15\s000\sAr$/ })).toBeEnabled();
      await capture(page, DOSSIER, "UC02-11-03-recapitulatif");
    });

    await test.step("4. Créer le frais : il apparaît dans la liste avec ses totaux", async () => {
      await page.getByRole("dialog", { name: "Nouveau frais" }).getByRole("button", { name: /^Créer le frais de/ }).click();
      await expect(page.getByText("Frais « Frais de stage » créé. 2 étudiants recevront 15 000 Ar, exigibles en décembre 2026.").first()).toBeVisible();
      const ligne = ligneParametre(page, /Frais de stage/);
      await expect(ligne).toContainText("IF 1re année");
      await expect(ligne).toContainText("Décembre 2026");
      await expect(ligne).toContainText(/15\s000\sAr/);
      await expect(ligne).toContainText(/30\s000\sAr/);
      await expect(page.getByText("1 frais pour l'année 2026-2027.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-04-frais-cree");
    });

    await test.step("5. Frais d'examen, 10 000 Ar, exigible en octobre 2026 (le mois en cours)", async () => {
      const dialogue = await ouvrirCreation(page, { libelle: "Frais d'examen", montant: "10000", mois: "Octobre 2026" });
      await expect(dialogue).toContainText("2 étudiants recevront 10 000 Ar, exigibles en octobre 2026.");
      await dialogue.getByRole("button", { name: /^Créer le frais de 10\s000\sAr$/ }).click();
      await expect(page.getByText("Frais « Frais d'examen » créé.").first()).toBeVisible();
      await expect(page.getByText("2 frais pour l'année 2026-2027.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-05-deux-frais");
    });
  });
});

test.describe("UC02-11 : le secrétariat voit les frais chez les étudiants", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("l'étudiant déjà inscrit les a reçus, le nouvel inscrit aussi, sans rien faire", async ({ page }) => {
    await test.step("6. Fiche de Nirina (inscrite avant les frais) : les deux frais sont dans l'écolage", async () => {
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: NIRINA.matricule }).getByRole("link").first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(NIRINA.nom);
      await expect(page.getByText("Hanitra RAKO")).toBeVisible();
      await expect(page.getByText("Frais de stage").first()).toBeVisible();
      await expect(page.getByText("Frais d'examen").first()).toBeVisible();
      await expect(page.getByText(/925\s000\sAr/).first()).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-06-fiche-nirina");
    });

    await test.step("7. Inscrire RANDRIANTSOA Hery en IF 1re année : il reçoit les frais automatiquement", async () => {
      await inscrire(page, HERY);
      await expect(page.getByText("Frais de stage").first()).toBeVisible();
      await expect(page.getByText("Frais d'examen").first()).toBeVisible();
      await expect(page.getByText(/925\s000\sAr/).first()).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-07-fiche-hery");
    });

    await test.step("8. Encaisser 200 000 Ar pour Hery : droits, octobre, frais d'examen (exigible), puis novembre en partie", async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, HERY);
      await montantRecu(page).fill("200000");
      await expect(page.getByText(/Après ce paiement, il restera\s*725\s000\sAr à payer\./)).toBeVisible();
      await grandEcran(page, 2000);
      await capture(page, DOSSIER, "UC02-11-08-guichet-200000");
      await boutonEncaisser(page, 200_000).click();
      const { zone } = await recuEnregistre(page);
      await expect(zone).toContainText(/Paiement enregistré : reçu R-\d{4}-\d{5}/);
      await capture(page, DOSSIER, "UC02-11-09-recu-200000");
    });

    await test.step("9. Encaisser 710 000 Ar : tout est soldé sauf le frais de stage (frais à venir, soldé en dernier)", async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, HERY);
      await montantRecu(page).fill("710000");
      await expect(page.getByText(/Après ce paiement, il restera\s*15\s000\sAr à payer\./)).toBeVisible();
      await grandEcran(page, 2000);
      await boutonEncaisser(page, 710_000).click();
      await recuEnregistre(page);
      await page.goto("/app/etudiants");
      await page.getByRole("row").filter({ hasText: HERY.matricule }).getByRole("link").first().click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(HERY.nom);
      await expect(page.getByText(/15\s000\sAr/).first()).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-10-fiche-hery-reste-frais");
    });
  });
});

test.describe("UC02-11 : le frais payé se verrouille", () => {
  test.use({ storageState: SESSIONS.admin });

  test("seul le libellé du frais d'examen change ; le frais de stage reste modifiable et supprimable", async ({ page }) => {
    await test.step("10. Liste des frais : le frais d'examen est encaissé et verrouillé", async () => {
      await page.goto("/app/parametres/frais");
      const examen = ligneParametre(page, /Frais d'examen/);
      await expect(examen).toContainText("Déjà payé : seul le libellé change");
      await expect(examen.getByRole("button", { name: "Supprimer le frais Frais d'examen" })).toHaveCount(0);
      await expect(examen.getByRole("button", { name: "Modifier le frais Frais d'examen" })).toBeVisible();
      const stage = ligneParametre(page, /Frais de stage/);
      await expect(stage.getByRole("button", { name: "Supprimer le frais Frais de stage" })).toBeVisible();
      await capture(page, DOSSIER, "UC02-11-11-frais-verrouille");
    });

    await test.step("11. Modifier le frais d'examen : montant et mois grisés, le libellé se change", async () => {
      await page.getByRole("button", { name: "Modifier le frais Frais d'examen" }).click();
      const dialogue = page.getByRole("dialog", { name: "Modifier « Frais d'examen »" });
      await expect(dialogue.getByLabel("Montant par étudiant (Ar)")).toBeDisabled();
      await expect(dialogue.getByRole("combobox", { name: "Exigible en" })).toBeDisabled();
      await expect(dialogue).toContainText("Classes concernées");
      await capture(page, DOSSIER, "UC02-11-12-modifier-verrouille");
      await dialogue.getByLabel("Libellé").fill("Frais d'examen semestriel");
      await dialogue.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Frais « Frais d'examen semestriel » renommé.").first()).toBeVisible();
      await expect(ligneParametre(page, /Frais d'examen semestriel/)).toContainText("Déjà payé : seul le libellé change");
      await capture(page, DOSSIER, "UC02-11-13-frais-renomme");
    });
  });
});
