import { champRecherche, choisirFiltreListe, decompte, DOSSIER_UC05 as DOSSIER, lignesListe, nomsAffiches, ouvrirListe } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

const attendre = async (page: import("@playwright/test").Page, noms: string[]) => {
  await expect.poll(() => nomsAffiches(page)).toEqual(noms);
  await expect(lignesListe(page)).toHaveCount(noms.length);
};

test("UC05-02 : filtrer la liste par filière, niveau, année, statut et retard", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Filière « Sage-femmes » : trois étudiantes", async () => {
    await ouvrirListe(page);
    await choisirFiltreListe(page, "Filière", "Sage-femmes");
    await attendre(page, ["RABEMANANJARA Lalaina", "RAKOTONIRINA Hélène", "RAZAFINDRAKOTO Mialy"]);
    await expect(decompte(page)).toHaveText("3 étudiants correspondent aux critères");
    await expect(page).toHaveURL(/filiereId=/);
    await capture(page, DOSSIER, "UC05-02-01-filiere");
  });

  await test.step("2. Niveau « 2e année » (avec toutes les filières) : quatre étudiants passés en 2e année", async () => {
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(decompte(page)).toHaveText("10 étudiants inscrits");
    await choisirFiltreListe(page, "Niveau", "2e année");
    await attendre(page, ["ANDRIANARISOA Tiana", "RAKOTOMALALA Voahirana", "RANDRIAMAHEFA Solofo", "RASOANAIVO Fanja"]);
    await expect(page).toHaveURL(/niveau=2/);
    await capture(page, DOSSIER, "UC05-02-02-niveau");
  });

  await test.step("3. Année « 2025-2026 » : six étudiants y ont une inscription, quatre y ont fait leur 1re année puis sont passés", async () => {
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await choisirFiltreListe(page, "Année scolaire", "2025-2026");
    await attendre(page, [
      "ANDRIANARISOA Tiana",
      "RABEMANANJARA Lalaina",
      "RAKOTOMALALA Voahirana",
      "RANDRIAMAHEFA Solofo",
      "RASOANAIVO Fanja",
      "RAZAFINDRAKOTO Mialy",
    ]);
    await expect(page).toHaveURL(/anneeId=/);
    await capture(page, DOSSIER, "UC05-02-03-annee-2025");
  });

  await test.step("4. Année « 2026-2027 (courante) » avec le niveau « 2e année » : le niveau porte sur cette année-là", async () => {
    await choisirFiltreListe(page, "Année scolaire", "2026-2027 (courante)");
    await attendre(page, [
      "ANDRIAMAMPIANINA Faly",
      "ANDRIANARISOA Tiana",
      "RAKOTOARISOA Nirina",
      "RAKOTOMALALA Voahirana",
      "RAKOTONIRINA Hélène",
      "RAMAROSON Hery",
      "RANDRIAMAHEFA Solofo",
      "RASOANAIVO Fanja",
    ]);
    await choisirFiltreListe(page, "Niveau", "2e année");
    await attendre(page, ["ANDRIANARISOA Tiana", "RAKOTOMALALA Voahirana", "RANDRIAMAHEFA Solofo", "RASOANAIVO Fanja"]);
    await choisirFiltreListe(page, "Niveau", "1re année");
    await attendre(page, ["ANDRIAMAMPIANINA Faly", "RAKOTOARISOA Nirina", "RAKOTONIRINA Hélène", "RAMAROSON Hery"]);
    await capture(page, DOSSIER, "UC05-02-04-annee-et-niveau");
  });

  await test.step("5. Statut « Abandon » : RAMAROSON Hery seulement ; « Exclu » : personne", async () => {
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await choisirFiltreListe(page, "Statut", "Abandon");
    await attendre(page, ["RAMAROSON Hery"]);
    await expect(page).toHaveURL(/statut=ABANDON/);
    await capture(page, DOSSIER, "UC05-02-05-statut-abandon");
    await choisirFiltreListe(page, "Statut", "Exclu");
    await expect(page.getByText("Aucun étudiant ne correspond. Vérifiez l'orthographe du nom ou du matricule, ou effacez les filtres.")).toBeVisible();
    await choisirFiltreListe(page, "Statut", "Actif");
    await expect(decompte(page)).toHaveText("9 étudiants correspondent aux critères");
    await expect(lignesListe(page)).toHaveCount(9);
  });

  await test.step("6. « En retard uniquement » : les six étudiants qui ont des échéances échues impayées", async () => {
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await page.getByRole("checkbox", { name: "En retard uniquement" }).click();
    await attendre(page, [
      "ANDRIANARISOA Tiana",
      "RABEMANANJARA Lalaina",
      "RAKOTOMALALA Voahirana",
      "RANDRIAMAHEFA Solofo",
      "RASOANAIVO Fanja",
      "RAZAFINDRAKOTO Mialy",
    ]);
    await expect(page).toHaveURL(/enRetard=1/);
    await expect(page.getByRole("row").filter({ hasText: "RAKOTOARISOA Nirina" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC05-02-06-en-retard");
  });

  await test.step("7. Les filtres se combinent : « En retard » + « Sage-femmes » + recherche « laina »", async () => {
    await choisirFiltreListe(page, "Filière", "Sage-femmes");
    await attendre(page, ["RABEMANANJARA Lalaina", "RAZAFINDRAKOTO Mialy"]);
    await champRecherche(page).fill("laina");
    await attendre(page, ["RABEMANANJARA Lalaina"]);
    await expect(page).toHaveURL(/q=laina/);
    await expect(page).toHaveURL(/enRetard=1/);
    await expect(page).toHaveURL(/filiereId=/);
    await capture(page, DOSSIER, "UC05-02-07-combinaison");
  });

  await test.step("8. Recharger la page garde les filtres ; « Effacer les filtres » remet la liste complète", async () => {
    await page.reload();
    await expect(champRecherche(page)).toHaveValue("laina");
    await expect(page.getByRole("checkbox", { name: "En retard uniquement" })).toBeChecked();
    await attendre(page, ["RABEMANANJARA Lalaina"]);
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(page).toHaveURL(/\/app\/etudiants$/);
    await expect(decompte(page)).toHaveText("10 étudiants inscrits");
    await expect(page.getByRole("checkbox", { name: "En retard uniquement" })).not.toBeChecked();
  });
});
