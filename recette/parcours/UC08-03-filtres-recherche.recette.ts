import { testPoste as test } from "./aides";
import { choisirFiltreImpayes, DOSSIER_UC08 as DOSSIER, ligneEtudiant, lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect } from "./outils";

// Après 00-preparation (A, B, C) et 00e-preparation (G) ; UC08-02 non requis.

test("UC08-03 : retrouver un étudiant ou un groupe parmi les impayés", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const recherche = page.getByRole("searchbox", { name: "Rechercher un étudiant" });
  const region = page.getByRole("region", { name: "Liste des étudiants en retard" });

  await test.step("1. Chercher par nom, sans tenir compte de la casse : « rakotomalala »", async () => {
    await ouvrirImpayes(page);
    await recherche.fill("rakotomalala");
    await expect(page).toHaveURL(/[?&]q=rakotomalala/);
    await verifierSynthese(page, 1, 720_000);
    await expect(lignesImpayes(page)).toHaveCount(1);
    await expect(ligneEtudiant(page, "RAKOTOMALALA Voahirana")).toContainText("IF-2025-0001");
    await capture(page, DOSSIER, "UC08-03-01-recherche-nom");
  });

  await test.step("2. Chercher par prénom : « mialy » ; par début de matricule : « SF-2025 »", async () => {
    await recherche.fill("mialy");
    await expect(page).toHaveURL(/[?&]q=mialy/);
    await verifierSynthese(page, 1, 900_000);
    await expect(ligneEtudiant(page, "RAZAFINDRAKOTO Mialy")).toBeVisible();
    await recherche.fill("SF-2025");
    await expect(page).toHaveURL(/[?&]q=SF-2025/);
    await verifierSynthese(page, 2, 1_800_000);
    await expect(ligneEtudiant(page, "RABEMANANJARA Lalaina")).toBeVisible();
    await expect(ligneEtudiant(page, "RAZAFINDRAKOTO Mialy")).toBeVisible();
    await capture(page, DOSSIER, "UC08-03-02-recherche-matricule");
  });

  await test.step("3. Filtrer par filière : Sage-femmes", async () => {
    await page.goto("/app/impayes");
    await choisirFiltreImpayes(page, "Filière", "Sage-femmes");
    await expect(page).toHaveURL(/[?&]filiereId=/);
    await verifierSynthese(page, 2, 1_800_000);
    await expect(lignesImpayes(page)).toHaveCount(2);
    await capture(page, DOSSIER, "UC08-03-03-filiere-sage-femmes");
  });

  await test.step("4. Filtrer par mois de retard : « 6 mois et plus » garde les six étudiants (9 ou 10 mois de retard)", async () => {
    await page.goto("/app/impayes");
    await page.getByRole("combobox", { name: "Mois de retard" }).click();
    await expect(page.getByRole("option")).toHaveText(["Tout retard", "2 mois et plus", "3 mois et plus", "4 mois et plus", "6 mois et plus"]);
    await page.getByRole("option", { name: "6 mois et plus", exact: true }).click();
    await expect(page).toHaveURL(/[?&]moisMin=6/);
    await verifierSynthese(page, 6, 5_090_000);
    await capture(page, DOSSIER, "UC08-03-04-six-mois-et-plus");
  });

  await test.step("5. Combiner : Infirmier(e)s et 6 mois et plus", async () => {
    await choisirFiltreImpayes(page, "Filière", "Infirmier(e)s");
    await verifierSynthese(page, 4, 3_290_000);
    for (const nom of ["ANDRIANARISOA Tiana", "RANDRIAMAHEFA Solofo", "RASOANAIVO Fanja", "RAKOTOMALALA Voahirana"]) await expect(ligneEtudiant(page, nom)).toBeVisible();
    await expect(ligneEtudiant(page, "Sage-femmes")).toHaveCount(0);
    await capture(page, DOSSIER, "UC08-03-05-filtres-combines");
  });

  await test.step("6. Aucun résultat : niveau 2e année, le message et le lien « Effacer les filtres »", async () => {
    await page.goto("/app/impayes");
    await choisirFiltreImpayes(page, "Niveau", "2e année");
    await expect(page).toHaveURL(/[?&]niveau=2/);
    await expect(region.getByText("Aucun étudiant en retard ne correspond à ces filtres.")).toBeVisible();
    await verifierSynthese(page, 0, 0);
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC08-03-06-aucun-resultat");
  });

  await test.step("7. « Effacer les filtres » ramène la liste complète", async () => {
    await page.getByRole("link", { name: "Effacer les filtres" }).click();
    await page.waitForURL((url) => url.pathname === "/app/impayes" && url.search === "");
    await verifierSynthese(page, 6, 5_090_000);
    await expect(lignesImpayes(page)).toHaveCount(6);
    await capture(page, DOSSIER, "UC08-03-07-filtres-effaces");
  });
});
