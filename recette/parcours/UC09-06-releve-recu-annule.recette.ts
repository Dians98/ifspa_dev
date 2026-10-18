import path from "node:path";
import { testPoste as test } from "./aides";
import { ligne, ouvrirAdmin, ouvrirPaiements } from "./aides-paiements";
import { contientSuite, dossierCaptures, dossierTemporaire, DOSSIER_UC09 as DOSSIER, pdfEnPng, pdfZonePng, releveDe } from "./aides-impayes";
import { capture, expect } from "./outils";

const RECU = "R-2026-00022";
const MOTIF = "Doublon : reçu saisi deux fois";

// Après UC09-05 : l'administrateur annule le reçu de 130 000 Ar de Fanja, le secrétariat remet un relevé à jour.
test("UC09-06 : un reçu annulé reste visible sur le relevé, mais ne compte plus", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const dossier = dossierTemporaire("uc09-06");
  const captures = dossierCaptures(DOSSIER);

  await test.step("1. Administrateur : Paiements, « Annuler le reçu R-2026-00022 » (RASOANAIVO Fanja, 130 000 Ar), motif, confirmer", async () => {
    const { contexte, page: admin } = await ouvrirAdmin(browser, test.info().project.use.baseURL, 1300);
    try {
      await ouvrirPaiements(admin);
      await expect(admin.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      await ligne(admin, RECU).getByRole("button", { name: `Annuler le reçu ${RECU}` }).click();
      const dialogue = admin.getByRole("dialog", { name: `Annuler le reçu ${RECU}` });
      await dialogue.getByLabel("Motif de l'annulation").fill(MOTIF);
      await dialogue.getByRole("button", { name: `Annuler le reçu ${RECU}` }).click();
      await expect(dialogue).toBeHidden();
      await expect(ligne(admin, RECU)).toContainText("Annulé");
      await capture(admin, DOSSIER, "UC09-06-01-annulation-admin");
    } finally {
      await contexte.close();
    }
  });

  await test.step("2. Secrétariat : télécharger le relevé de Fanja", async () => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    const r = await releveDe(page, "RASOANAIVO Fanja", dossier);
    console.log(`PDF Fanja ${r.nomFichier} pages=${r.pages}`);
    expect(r.pages).toBe(2);

    expect(contientSuite(r.texte, ["Droits d'inscription", "100 000 Ar", "—", "100 000 Ar", "En retard"])).toBe(true);
    expect(contientSuite(r.texte, ["Octobre 2025", "80 000 Ar", "—", "80 000 Ar", "En retard"])).toBe(true);
    expect(contientSuite(r.texte, ["Sous-total 2025-2026", "900 000 Ar", "0 Ar", "900 000 Ar"])).toBe(true);
    pdfEnPng(r.fichier, 1, path.join(captures, "UC09-06-02-page-1.png"));

    expect(contientSuite(r.texte, ["TOTAL DÛ", "1 800 000 Ar", "TOTAL PAYÉ", "0 Ar", "RESTE À PAYER", "1 800 000 Ar"])).toBe(true);
    expect(contientSuite(r.texte, ["Paiements enregistrés", "0 reçu valide · 1 annulé"])).toBe(true);
    expect(contientSuite(r.texte, ["Total des paiements valides", "0 Ar"])).toBe(true);
    expect(r.texte).toContain(RECU);
    expect(r.texte).toContain(MOTIF);
    expect(r.texte).toContain("Annulé");
    pdfZonePng(r.fichier, 2, null, null, path.join(captures, "UC09-06-03-page-2-paiements.png"), 110);
  });
});
