import { champRecherche, chercher, decompte, DOSSIER_UC05 as DOSSIER, ligneListe, lignesListe, nomsAffiches, ouvrirListe } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

test("UC05-01 : retrouver un étudiant par son nom, ses prénoms ou son matricule", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Secrétariat : menu Étudiants, dix étudiants inscrits, triés par nom", async () => {
    await ouvrirListe(page);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(decompte(page)).toHaveText("10 étudiants inscrits");
    await expect(lignesListe(page)).toHaveCount(10);
    await expect.poll(() => nomsAffiches(page)).toEqual([
      "ANDRIAMAMPIANINA Faly",
      "ANDRIANARISOA Tiana",
      "RABEMANANJARA Lalaina",
      "RAKOTOARISOA Nirina",
      "RAKOTOMALALA Voahirana",
      "RAKOTONIRINA Hélène",
      "RAMAROSON Hery",
      "RANDRIAMAHEFA Solofo",
      "RASOANAIVO Fanja",
      "RAZAFINDRAKOTO Mialy",
    ]);
    await expect(page.getByText("1–10 sur 10")).toBeVisible();
    await capture(page, DOSSIER, "UC05-01-01-liste");
  });

  await test.step("2. Chaque ligne : matricule, filière, niveau et année, statut, situation de l'écolage", async () => {
    await expect(ligneListe(page, "RAKOTOMALALA Voahirana")).toContainText("IF-2025-0001");
    await expect(ligneListe(page, "RAKOTOMALALA Voahirana")).toContainText("Infirmier(e)s");
    await expect(ligneListe(page, "RAKOTOMALALA Voahirana")).toContainText("2e année2026-2027");
    await expect(ligneListe(page, "RAKOTOMALALA Voahirana")).toContainText("Actif");
    await expect(ligneListe(page, "RAKOTOMALALA Voahirana")).toContainText(/En retard · 720\s000\sAr9 mois impayés/);
    await expect(ligneListe(page, "RAKOTOARISOA Nirina")).toContainText("À jour");
    await expect(ligneListe(page, "RAMAROSON Hery")).toContainText("Abandon");
    await expect(ligneListe(page, "RAMAROSON Hery")).toContainText("Aucun retard");
    await expect(ligneListe(page, "RAZAFINDRAKOTO Mialy")).toContainText("1re année2025-2026");
    await expect(ligneListe(page, "RAZAFINDRAKOTO Mialy")).toContainText(/En retard · 900\s000\sAr10 mois impayés/);
    await capture(page, DOSSIER, "UC05-01-02-lignes", page.getByRole("region", { name: "Liste des étudiants" }));
  });

  await test.step("3. Chercher « rakoto » : quatre étudiants (la recherche porte sur un morceau du nom, RAZAFINDRAKOTO compris), et la recherche est dans l'adresse (?q=rakoto)", async () => {
    await chercher(page, "rakoto");
    await expect(page).toHaveURL(/\/app\/etudiants\?q=rakoto$/);
    await expect(decompte(page)).toHaveText("4 étudiants correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["RAKOTOARISOA Nirina", "RAKOTOMALALA Voahirana", "RAKOTONIRINA Hélène", "RAZAFINDRAKOTO Mialy"]);
    await capture(page, DOSSIER, "UC05-01-03-recherche-nom");
  });

  await test.step("4. Les accents sont ignorés : « helene » trouve Hélène, « HÉLÈNE » aussi", async () => {
    await chercher(page, "helene");
    await expect(decompte(page)).toHaveText("1 étudiant correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["RAKOTONIRINA Hélène"]);
    await capture(page, DOSSIER, "UC05-01-04-sans-accent");
    await champRecherche(page).fill("HÉLÈNE");
    await expect(page).toHaveURL(/q=H%C3%89L%C3%88NE/);
    await expect(decompte(page)).toHaveText("1 étudiant correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["RAKOTONIRINA Hélène"]);
  });

  await test.step("5. Par prénom (« voahirana ») et par matricule complet ou partiel (« IF-2025-0003 », « SF-2026 »)", async () => {
    await chercher(page, "voahirana");
    await expect(decompte(page)).toHaveText("1 étudiant correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["RAKOTOMALALA Voahirana"]);
    await champRecherche(page).fill("IF-2025-0003");
    await expect(decompte(page)).toHaveText("1 étudiant correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["ANDRIANARISOA Tiana"]);
    await capture(page, DOSSIER, "UC05-01-05-recherche-matricule");
    await champRecherche(page).fill("SF-2026");
    await expect(decompte(page)).toHaveText("1 étudiant correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["RAKOTONIRINA Hélène"]);
  });

  await test.step("6. Plusieurs mots : « rakoto voahirana » ne garde que Voahirana", async () => {
    await champRecherche(page).fill("rakoto voahirana");
    await expect(decompte(page)).toHaveText("1 étudiant correspondent aux critères");
    await expect.poll(() => nomsAffiches(page)).toEqual(["RAKOTOMALALA Voahirana"]);
  });

  await test.step("7. Aucun résultat : « Aucun étudiant ne correspond. Vérifiez l'orthographe du nom ou du matricule, ou effacez les filtres. »", async () => {
    await champRecherche(page).fill("zzzz");
    await expect(page.getByText("Aucun étudiant ne correspond. Vérifiez l'orthographe du nom ou du matricule, ou effacez les filtres.")).toBeVisible();
    await expect(decompte(page)).toHaveText("0 étudiant correspondent aux critères");
    await expect(lignesListe(page)).toHaveCount(0);
    await capture(page, DOSSIER, "UC05-01-07-aucun-resultat");
  });

  await test.step("8. « Effacer les filtres » : retour à la liste complète, l'adresse n'a plus de ?q=", async () => {
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(page).toHaveURL(/\/app\/etudiants$/);
    await expect(decompte(page)).toHaveText("10 étudiants inscrits");
    await expect(champRecherche(page)).toHaveValue("");
    await expect(lignesListe(page)).toHaveCount(10);
  });

  await test.step("9. Ouvrir directement /app/etudiants?q=rakoto : le champ est rempli, la liste filtrée, et le retour arrière fonctionne", async () => {
    await page.goto("/app/etudiants?q=rakoto");
    await expect(champRecherche(page)).toHaveValue("rakoto");
    await expect(decompte(page)).toHaveText("4 étudiants correspondent aux critères");
    await page.getByRole("link", { name: "RAKOTOMALALA Voahirana" }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/?]+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/etudiants\?q=rakoto$/);
    await expect(champRecherche(page)).toHaveValue("rakoto");
    await expect(lignesListe(page)).toHaveCount(4);
  });
});
