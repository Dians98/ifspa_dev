import path from "node:path";
import { testPoste as test } from "./aides";
import { contientSuite, dossierCaptures, dossierTemporaire, DOSSIER_UC09 as DOSSIER, pdfZonePng, releveDe } from "./aides-impayes";
import { expect } from "./outils";

// Après UC08-07 : RABEMANANJARA Lalaina a abandonné (17/10/2026), sans jamais payer.
test("UC09-04 : le relevé d'une étudiante sortie (abandon), sans aucun paiement", async ({ page }) => {
  test.setTimeout(90_000);
  const captures = dossierCaptures(DOSSIER);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const r = await test.step("1. Télécharger le relevé de RABEMANANJARA Lalaina", async () => {
    const releve = await releveDe(page, "RABEMANANJARA Lalaina", dossierTemporaire("uc09-04"));
    console.log(`PDF ${releve.nomFichier} pages=${releve.pages} format=${releve.format}`);
    expect(releve.nomFichier).toBe("releve-SF-2025-0002.pdf");
    expect(releve.pages).toBe(1);
    return releve;
  });

  await test.step("2. Identité : statut « Abandon le … », « Niveau de sortie », filière Sage-femmes", async () => {
    expect(contientSuite(r.texte, ["RABEMANANJARA Lalaina", "MATRICULE", "SF-2025-0002", "FILIÈRE", "Sage-femmes"])).toBe(true);
    expect(r.texte).toMatch(/STATUT\nAbandon le \d{2}\/\d{2}\/\d{4}/);
    expect(contientSuite(r.texte, ["NIVEAU DE SORTIE", "1re année"])).toBe(true);
    pdfZonePng(r.fichier, 1, null, "Année 2025-2026 ·", path.join(captures, "UC09-04-01-en-tete-identite.png"));
  });

  await test.step("3. Grille : rien n'est payé, les onze échéances restent dues et « En retard »", async () => {
    expect(contientSuite(r.texte, ["Droits d'inscription", "100 000 Ar", "—", "100 000 Ar", "En retard"])).toBe(true);
    expect(r.texte.match(/En retard\n/g)).toHaveLength(11);
    expect(contientSuite(r.texte, ["Sous-total 2025-2026", "900 000 Ar", "0 Ar", "900 000 Ar"])).toBe(true);
    pdfZonePng(r.fichier, 1, "Année 2025-2026 ·", "Récapitulatif général", path.join(captures, "UC09-04-02-grille.png"));
  });

  await test.step("4. Récapitulatif et paiements : « Aucun paiement enregistré pour cet étudiant. »", async () => {
    expect(contientSuite(r.texte, ["TOTAL DÛ", "900 000 Ar", "TOTAL PAYÉ", "0 Ar", "RESTE À PAYER", "900 000 Ar"])).toBe(true);
    expect(r.texte).toMatch(/EN RETARD AU \d{2}\/\d{2}\/\d{4}\n900 000 Ar\n10 mois de retard/);
    // Le point final est rendu à l'écran mais extrait « 5 » du PDF (voir le rapport) : on ne compare pas le point.
    expect(r.texte).toContain("Aucun paiement enregistré pour cet étudiant");
    pdfZonePng(r.fichier, 1, "Récapitulatif général", null, path.join(captures, "UC09-04-03-recapitulatif-paiements.png"));
  });
});
