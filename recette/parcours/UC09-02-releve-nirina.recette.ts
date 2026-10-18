import path from "node:path";
import { testPoste as test } from "./aides";
import { contientSuite, dossierCaptures, dossierTemporaire, DOSSIER_UC09 as DOSSIER, pdfZonePng, releveDe } from "./aides-impayes";
import { expect } from "./outils";

// Après 00e-preparation : NIRINA a payé 150 000 Ar (droits d'inscription et 50 000 Ar d'acompte sur octobre 2026).
test("UC09-02 : le relevé d'un étudiant de l'année en cours, avec un mois partiel et des mois à venir", async ({ page }) => {
  test.setTimeout(90_000);
  const captures = dossierCaptures(DOSSIER);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const r = await test.step("1. Télécharger le relevé de RAKOTOARISOA Nirina depuis sa fiche", async () => {
    const releve = await releveDe(page, "RAKOTOARISOA Nirina", dossierTemporaire("uc09-02"));
    console.log(`PDF ${releve.nomFichier} pages=${releve.pages} format=${releve.format}`);
    expect(releve.nomFichier).toBe("releve-IF-2026-0001.pdf");
    expect(releve.format).toBe("595 842");
    expect(releve.pages).toBe(1);
    return releve;
  });

  await test.step("2. Identité : étudiant masculin, « Actif », année d'entrée 2026-2027", async () => {
    expect(contientSuite(r.texte, ["RAKOTOARISOA Nirina", "MATRICULE", "IF-2026-0001", "FILIÈRE", "Infirmier(e)s", "STATUT", "Actif"])).toBe(true);
    expect(contientSuite(r.texte, ["NIVEAU ACTUEL", "1re année", "ANNÉE D'ENTRÉE", "2026-2027", "NÉ LE", "11/02/2006 à Toamasina", "TÉLÉPHONE", "034 00 000 07"])).toBe(true);
    pdfZonePng(r.fichier, 1, null, "Année 2026-2027 ·", path.join(captures, "UC09-02-01-en-tete-identite.png"));
  });

  await test.step("3. Grille 2026-2027 : droits Payé, octobre Partiel (30 000 Ar restants), les neuf autres mois À venir", async () => {
    expect(r.texte).toContain("Année 2026-2027 · 1re année");
    expect(contientSuite(r.texte, ["Droits d'inscription", "100 000 Ar", "100 000 Ar", "—", "Payé"])).toBe(true);
    expect(contientSuite(r.texte, ["Octobre 2026", "80 000 Ar", "50 000 Ar", "30 000 Ar", "Partiel"])).toBe(true);
    expect(contientSuite(r.texte, ["Novembre 2026", "80 000 Ar", "—", "80 000 Ar", "À venir"])).toBe(true);
    expect(contientSuite(r.texte, ["Juillet 2027", "80 000 Ar", "—", "80 000 Ar", "À venir"])).toBe(true);
    expect(contientSuite(r.texte, ["Sous-total 2026-2027", "900 000 Ar", "150 000 Ar", "750 000 Ar"])).toBe(true);
    expect(r.texte.match(/À venir/g)).toHaveLength(9);
    pdfZonePng(r.fichier, 1, "Année 2026-2027 ·", "Récapitulatif général", path.join(captures, "UC09-02-02-grille.png"));
  });

  await test.step("4. Récapitulatif : en retard « Néant » ; paiements : R-2026-00023 de 150 000 Ar", async () => {
    expect(contientSuite(r.texte, ["TOTAL DÛ", "900 000 Ar", "TOTAL PAYÉ", "150 000 Ar", "RESTE À PAYER", "750 000 Ar"])).toBe(true);
    expect(r.texte).toMatch(/EN RETARD AU \d{2}\/\d{2}\/\d{4}\nNéant/);
    expect(r.texte).not.toContain("mois de retard");
    expect(contientSuite(r.texte, ["R-2026-00023", "17/10/2026", "Espèces", "—", "150 000 Ar", "Valide"])).toBe(true);
    expect(r.texte).toContain("Page 1/1");
    pdfZonePng(r.fichier, 1, "Récapitulatif général", null, path.join(captures, "UC09-02-03-recapitulatif-paiements.png"));
  });
});
