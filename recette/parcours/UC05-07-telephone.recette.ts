import { champRecherche, chercher, decompte, DOSSIER_UC05 as DOSSIER, lignesListe, ouvrirFicheDe, ouvrirListe } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat });

// À lancer avec --project mobile (Pixel 7) : les captures prennent le suffixe -mobile.
test("UC05-07 : la liste et la fiche d'un étudiant sur téléphone", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Liste des étudiants : une carte par étudiant, la recherche reste utilisable", async () => {
    await ouvrirListe(page);
    await expect(decompte(page)).toHaveText("10 étudiants inscrits");
    await expect(lignesListe(page)).toHaveCount(10);
    await capture(page, DOSSIER, "UC05-07-01-liste");
    await chercher(page, "rakoto");
    await expect(decompte(page)).toHaveText("4 étudiants correspondent aux critères");
    await expect(lignesListe(page)).toHaveCount(4);
    await expect(champRecherche(page)).toHaveValue("rakoto");
    const hauteur = (await champRecherche(page).boundingBox())?.height ?? 0;
    expect(hauteur).toBeGreaterThanOrEqual(44);
    await capture(page, DOSSIER, "UC05-07-02-recherche");
  });

  await test.step("2. Ouvrir la fiche de RAKOTOMALALA Voahirana : identité, boutons, situation de l'écolage", async () => {
    await page.getByRole("link", { name: "RAKOTOMALALA Voahirana" }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/?]+$/);
    const entete = page.getByRole("region", { name: "Identité de l'étudiant" });
    await expect(entete.getByRole("heading", { level: 1 })).toHaveText("RAKOTOMALALA Voahirana");
    await expect(entete).toContainText("IF-2025-0001");
    for (const bouton of [
      entete.getByRole("link", { name: /^Encaisser 720\s000\sAr$/ }),
      entete.getByRole("button", { name: "Imprimer le relevé" }),
      entete.getByRole("link", { name: "Télécharger le relevé d'écolage en PDF" }),
      entete.getByRole("link", { name: "Modifier" }),
    ]) {
      await expect(bouton).toBeVisible();
      expect((await bouton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByText(/Reste à payer/).first()).toBeVisible();
    await capture(page, DOSSIER, "UC05-07-03-fiche");
  });

  await test.step("3. Les onglets Identité, Parcours et Paiements se lisent sans défilement horizontal de la page", async () => {
    for (const onglet of ["Identité", "Parcours", "Paiements (1)"]) {
      const tab = page.getByRole("tab", { name: onglet });
      await tab.click();
      expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debordement).toBeLessThanOrEqual(0);
    }
    await expect(page.getByRole("row").filter({ hasText: "R-2026-00021" })).toContainText(/180\s000\sAr/);
    await capture(page, DOSSIER, "UC05-07-04-paiements");
  });
});
