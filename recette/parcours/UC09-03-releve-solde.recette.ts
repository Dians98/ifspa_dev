import path from "node:path";
import { testPoste as test } from "./aides";
import { contientSuite, dossierCaptures, dossierTemporaire, DOSSIER_UC09 as DOSSIER, pdfZonePng, releveDe } from "./aides-impayes";
import { expect } from "./outils";

// Après UC08-05 : ANDRIANARISOA Tiana a soldé ses 900 000 Ar (reçu R-2026-00024).
test("UC09-03 : le relevé d'un étudiant à jour, tout est payé", async ({ page }) => {
  test.setTimeout(90_000);
  const captures = dossierCaptures(DOSSIER);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const r = await test.step("1. Télécharger le relevé de ANDRIANARISOA Tiana", async () => {
    const releve = await releveDe(page, "ANDRIANARISOA Tiana", dossierTemporaire("uc09-03"));
    console.log(`PDF ${releve.nomFichier} pages=${releve.pages} format=${releve.format}`);
    expect(releve.nomFichier).toBe("releve-IF-2025-0003.pdf");
    expect(releve.pages).toBe(1);
    return releve;
  });

  await test.step("2. Les onze échéances sont « Payé », aucune « En retard »", async () => {
    expect(r.texte.match(/\nPayé\n/g)?.length).toBeGreaterThanOrEqual(11);
    expect(r.texte).not.toContain("En retard\n");
    expect(contientSuite(r.texte, ["Octobre 2025", "80 000 Ar", "80 000 Ar", "—", "Payé"])).toBe(true);
    expect(contientSuite(r.texte, ["Sous-total 2025-2026", "900 000 Ar", "900 000 Ar", "0 Ar"])).toBe(true);
    pdfZonePng(r.fichier, 1, "Année 2025-2026 ·", "Récapitulatif général", path.join(captures, "UC09-03-01-grille.png"));
  });

  await test.step("3. Récapitulatif : reste à payer 0 Ar, en retard « Néant » ; le reçu R-2026-00024 de 900 000 Ar", async () => {
    expect(contientSuite(r.texte, ["TOTAL DÛ", "900 000 Ar", "TOTAL PAYÉ", "900 000 Ar", "RESTE À PAYER", "0 Ar"])).toBe(true);
    expect(r.texte).toMatch(/EN RETARD AU \d{2}\/\d{2}\/\d{4}\nNéant/);
    expect(contientSuite(r.texte, ["R-2026-00024", "17/10/2026", "Espèces", "—", "900 000 Ar", "Valide"])).toBe(true);
    pdfZonePng(r.fichier, 1, "Récapitulatif général", null, path.join(captures, "UC09-03-02-recapitulatif-paiements.png"));
  });
});
