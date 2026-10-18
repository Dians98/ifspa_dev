import { montantRegex, testPoste as test } from "./aides";
import { DOSSIER_UC08 as DOSSIER, ligneEtudiant, lignesImpayes, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { ouvrirAdmin } from "./aides-paiements";
import { capture, expect } from "./outils";

// Après UC08-06 ; le secrétariat est le poste principal, l'administrateur ouvre une autre fenêtre.
test("UC08-07 : une étudiante abandonne, elle sort de la liste mais sa dette reste encaissable", async ({ page, browser }) => {
  test.setTimeout(120_000);

  await test.step("1. Secrétariat : RABEMANANJARA Lalaina est dans la liste ; sa fiche n'offre pas « Enregistrer une sortie »", async () => {
    await page.setViewportSize({ width: 1440, height: 1500 });
    await ouvrirImpayes(page);
    await verifierSynthese(page, 5, 3_690_000);
    await expect(ligneEtudiant(page, "RABEMANANJARA Lalaina")).toContainText(montantRegex(900_000));
    await ligneEtudiant(page, "RABEMANANJARA Lalaina").getByRole("link", { name: "RABEMANANJARA Lalaina", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RABEMANANJARA");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer une sortie" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC08-07-01-fiche-secretariat");
  });

  await test.step("2. Administrateur : « Enregistrer une sortie », Abandon, motif, « Enregistrer l'abandon »", async () => {
    const { contexte, page: admin } = await ouvrirAdmin(browser, test.info().project.use.baseURL, 1500);
    try {
      await admin.goto("/app/etudiants");
      await admin.getByRole("link", { name: /RABEMANANJARA Lalaina/ }).first().click();
      await expect(admin.getByRole("heading", { level: 1 })).toContainText("RABEMANANJARA");
      await expect(admin.getByText("Administrateur IFSPA", { exact: true })).toBeVisible();
      await admin.getByRole("button", { name: "Enregistrer une sortie" }).click();
      const dialogue = admin.getByRole("dialog", { name: "Enregistrer une sortie" });
      await expect(dialogue.getByRole("radio", { name: "Abandon" })).toBeChecked();
      await dialogue.getByLabel("Motif").fill("A quitté l'institut pour raison familiale");
      await capture(admin, DOSSIER, "UC08-07-02-dialogue-sortie-admin", dialogue);
      await dialogue.getByRole("button", { name: "Enregistrer l'abandon" }).click();
      await expect(dialogue).toBeHidden();
      await expect(admin.getByText(/Sorti · Abandon le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
      await capture(admin, DOSSIER, "UC08-07-03-fiche-sortie-admin");
    } finally {
      await contexte.close();
    }
  });

  await test.step("3. Secrétariat : Impayés ne compte plus que quatre étudiants, Lalaina n'y est plus", async () => {
    await page.getByRole("link", { name: "Impayés", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await verifierSynthese(page, 4, 2_790_000);
    await expect(lignesImpayes(page)).toHaveCount(4);
    await expect(page.getByText("RABEMANANJARA")).toHaveCount(0);
    await capture(page, DOSSIER, "UC08-07-04-liste-sans-lalaina");
  });

  await test.step("4. Sa fiche : « Sorti · Abandon », le reste dû est toujours là et reste encaissable", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /RABEMANANJARA Lalaina/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("RABEMANANJARA");
    await expect(page.getByText(/Sorti · Abandon le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(page.getByText(montantRegex(900_000)).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Encaisser 900\s000\sAr$/ })).toBeVisible();
    await capture(page, DOSSIER, "UC08-07-05-fiche-sortie-secretariat");
  });
});
