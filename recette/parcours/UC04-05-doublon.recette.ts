import { INSCRITS, remplirInscription, type Inscrit } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { voahirana } = INSCRITS;
// Même nom, mêmes prénoms, même date de naissance : une homonyme saisie par la secrétaire (autre téléphone).
const HOMONYME: Inscrit = { ...voahirana, telephone: "034 00 000 11", lieu: "Fenerive-Est", matricule: "IF-2026-0004" };
const MESSAGE =
  "Un étudiant porte déjà ce nom, ces prénoms et cette date de naissance : RAKOTOMALALA Voahirana (IF-2026-0001). S'il s'agit bien d'une autre personne, confirmez la création.";

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-05 : un doublon possible est signalé, la création demande une confirmation", async ({ page }) => {
  test.setTimeout(120_000);
  const alerte = page.getByRole("alert").filter({ hasText: "Cet étudiant existe peut-être déjà" });

  await test.step("1. Saisir une seconde RAKOTOMALALA Voahirana née le 14/03/2005 : l'inscription est suspendue", async () => {
    await remplirInscription(page, HOMONYME);
    await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();
    await expect(alerte).toBeVisible();
    await expect(alerte).toContainText(MESSAGE);
    await expect(page).toHaveURL(/\/app\/etudiants\/nouveau$/);
    await expect(page.getByRole("button", { name: "Créer quand même" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Corriger la saisie" })).toBeVisible();
    await capture(page, DOSSIER, "UC04-05-01-avertissement-doublon");
  });

  await test.step("2. « Corriger la saisie » : l'avertissement se ferme, rien n'est créé", async () => {
    await page.getByRole("button", { name: "Corriger la saisie" }).click();
    await expect(alerte).toBeHidden();
    await expect(page.getByLabel("Prénoms")).toHaveValue("Voahirana");
    await capture(page, DOSSIER, "UC04-05-02-saisie-corrigee");
  });

  await test.step("3. Valider de nouveau puis « Créer quand même » : IF-2026-0004 est attribué", async () => {
    await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();
    await expect(alerte).toBeVisible();
    await page.getByRole("button", { name: "Créer quand même" }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/]+\?nouveau=1/);
    await expect(page.getByText("Étudiant inscrit sous le matricule IF-2026-0004")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RAKOTOMALALA Voahirana");
    await capture(page, DOSSIER, "UC04-05-03-fiche-homonyme");
  });

  await test.step("4. La liste montre les deux homonymes, chacun avec son matricule", async () => {
    await page.goto("/app/etudiants");
    await expect(page.getByText("6 étudiants inscrits")).toBeVisible();
    const lignes = page.getByRole("row").filter({ hasText: "RAKOTOMALALA Voahirana" });
    await expect(lignes).toHaveCount(2);
    await expect(lignes.filter({ hasText: "IF-2026-0001" })).toHaveCount(1);
    await expect(lignes.filter({ hasText: "IF-2026-0004" })).toHaveCount(1);
    await capture(page, DOSSIER, "UC04-05-04-liste-homonymes");
  });
});
