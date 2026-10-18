import { montantRegex, testPoste as test } from "./aides";
import { DOSSIER_UC08 as DOSSIER, ligneEtudiant, lignesImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect } from "./outils";

// Après 00-preparation (A, B, C) et 00e-preparation (G).

test("UC08-02 : la liste des étudiants en retard, avec ce qu'il faut pour les relancer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await test.step("1. Ouvrir Impayés par le menu : six étudiants en retard, 5 090 000 Ar à recouvrer", async () => {
    await page.goto("/app/dashboard");
    await page.getByRole("link", { name: "Impayés", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Situation au \d{2}\/\d{2}\/\d{4} : échéances échues et non soldées, toutes années\.$/)).toBeVisible();
    await verifierSynthese(page, 6, 5_090_000);
    await expect(lignesImpayes(page)).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toBeVisible();
    await capture(page, DOSSIER, "UC08-02-01-liste");
  });

  await test.step("2. Lire l'ordre : du plus grand retard au plus petit, puis du plus gros montant", async () => {
    const noms = ["ANDRIANARISOA Tiana", "RABEMANANJARA Lalaina", "RANDRIAMAHEFA Solofo", "RAZAFINDRAKOTO Mialy", "RASOANAIVO Fanja", "RAKOTOMALALA Voahirana"];
    const lignes = lignesImpayes(page);
    for (const [i, nom] of noms.entries()) await expect(lignes.nth(i)).toContainText(nom);
    await expect(page.getByRole("columnheader")).toContainText(["Étudiant", "Filière · niveau", "Mois en retard", "Reste en retard", "Dernier paiement", "Téléphone"]);
    await capture(page, DOSSIER, "UC08-02-02-tableau", page.getByRole("region", { name: "Liste des étudiants en retard" }));
  });

  await test.step("3. Chaque ligne : matricule, filière, niveau, mois, année, reste en retard, dernier paiement, téléphone", async () => {
    const fanja = ligneEtudiant(page, "RASOANAIVO Fanja");
    await expect(fanja).toContainText("IF-2025-0002");
    await expect(fanja).toContainText("Infirmier(e)s");
    await expect(fanja).toContainText("1re année");
    await expect(fanja).toContainText("10 mois");
    await expect(fanja).toContainText("Année 2025-2026");
    await expect(fanja).toContainText(montantRegex(770_000));
    await expect(fanja).toContainText("17/10/2026");
    await expect(fanja).toContainText(montantRegex(130_000));
    await expect(fanja).toContainText("034 00 000 02");
    const voahirana = ligneEtudiant(page, "RAKOTOMALALA Voahirana");
    await expect(voahirana).toContainText("9 mois");
    await expect(voahirana).toContainText(montantRegex(720_000));
    await expect(voahirana).toContainText(montantRegex(180_000));
    const tiana = ligneEtudiant(page, "ANDRIANARISOA Tiana");
    await expect(tiana).toContainText("Aucun");
    await expect(tiana).toContainText(montantRegex(900_000));
    await capture(page, DOSSIER, "UC08-02-03-lignes", page.getByRole("region", { name: "Liste des étudiants en retard" }));
  });

  await test.step("4. L'étudiant à jour (NIRINA, inscrit en 2026-2027) n'est pas dans la liste", async () => {
    await expect(page.getByText("RAKOTOARISOA Nirina")).toHaveCount(0);
    await expect(page.getByText("IF-2026-0001")).toHaveCount(0);
  });

  await test.step("5. Le téléphone est un lien d'appel", async () => {
    const lien = ligneEtudiant(page, "RASOANAIVO Fanja").getByRole("link", { name: "034 00 000 02" });
    await expect(lien).toHaveAttribute("href", "tel:0340000002");
  });

  await test.step("6. Cliquer le nom ouvre la fiche, dont les chiffres sont ceux de la liste", async () => {
    await ligneEtudiant(page, "RASOANAIVO Fanja").getByRole("link", { name: "RASOANAIVO Fanja", exact: true }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RASOANAIVO");
    await expect(page.getByText("Reste à payer", { exact: true })).toBeVisible();
    await expect(page.getByText("10 mois impayés")).toBeVisible();
    await expect(page.getByText(montantRegex(770_000)).first()).toBeVisible();
    await capture(page, DOSSIER, "UC08-02-04-fiche-fanja");
  });
});
