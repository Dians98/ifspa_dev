import { testPoste as test } from "./aides";
import { choisirFiltreImpayes, DOSSIER_UC08 as DOSSIER, ligneEtudiant, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect } from "./outils";

// À lancer avec `--project mobile`, après UC08-07 (quatre étudiants en retard). Ne modifie rien.
test("UC08-08 : relancer depuis un téléphone, appeler et aller encaisser", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Cas téléphone : lancer avec --project mobile.");

  await test.step("1. Ouvrir Impayés sur téléphone : une carte par étudiant", async () => {
    await ouvrirImpayes(page);
    await verifierSynthese(page, 4, 2_790_000);
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toBeVisible();
    await capture(page, DOSSIER, "UC08-08-01-liste");
  });

  await test.step("2. Le numéro est un lien d'appel assez grand pour le doigt (44 px au moins)", async () => {
    const lien = ligneEtudiant(page, "RASOANAIVO Fanja").getByRole("link", { name: "034 00 000 02" });
    await expect(lien).toHaveAttribute("href", "tel:0340000002");
    const boite = await lien.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    await lien.scrollIntoViewIfNeeded();
    await capture(page, DOSSIER, "UC08-08-02-numero");
  });

  await test.step("3. Filtrer par filière sur téléphone : Sage-femmes", async () => {
    await choisirFiltreImpayes(page, "Filière", "Sage-femmes");
    await expect(page).toHaveURL(/[?&]filiereId=/);
    await verifierSynthese(page, 1, 900_000);
    await capture(page, DOSSIER, "UC08-08-03-filtre-sage-femmes");
  });

  await test.step("4. « Encaisser » sur la carte ouvre le guichet sur cet étudiant", async () => {
    const bouton = ligneEtudiant(page, "RAZAFINDRAKOTO Mialy").getByRole("link", { name: /^Encaisser/ });
    const boite = await bouton.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    await bouton.click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await expect(page.getByText("RAZAFINDRAKOTO Mialy").first()).toBeVisible();
    await expect(page.getByText(/Reste à payer :/)).toBeVisible();
    await capture(page, DOSSIER, "UC08-08-04-guichet");
  });
});
