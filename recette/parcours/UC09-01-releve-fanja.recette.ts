import path from "node:path";
import { testPoste as test } from "./aides";
import {
  contientSuite,
  dossierCaptures,
  dossierTemporaire,
  DOSSIER_UC09 as DOSSIER,
  imprimerReleve,
  lireReleve,
  ouvrirFiche,
  pdfEnPng,
  pdfZonePng,
  telechargerReleve,
} from "./aides-impayes";
import { capture, expect } from "./outils";

// Après 00-preparation (A, B, C), 00e-preparation (G) et UC08-05 à UC08-07 (voir 00-PREPARATION.md, section G).
test("UC09-01 : le relevé de RASOANAIVO Fanja, remis à sa mère pour la relance", async ({ page }) => {
  test.setTimeout(90_000);
  const dossier = dossierTemporaire("uc09-01");
  const captures = dossierCaptures(DOSSIER);
  let fichier = "";
  let texte = "";

  await test.step("1. Ouvrir la fiche de Fanja : « Imprimer le relevé » et « Télécharger » sont sous son nom", async () => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await ouvrirFiche(page, "RASOANAIVO Fanja");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Imprimer le relevé" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Télécharger le relevé d'écolage en PDF" })).toBeVisible();
    await capture(page, DOSSIER, "UC09-01-01-fiche-boutons", page.getByRole("region", { name: "Identité de l'étudiant" }));
  });

  await test.step("2. « Imprimer le relevé » : le PDF est chargé pour l'imprimante, sans message d'erreur", async () => {
    const disposition = await imprimerReleve(page);
    console.log(`IMPRIMER ${disposition}`);
    await capture(page, DOSSIER, "UC09-01-02-apres-imprimer", page.getByRole("region", { name: "Identité de l'étudiant" }));
  });

  await test.step("3. « Télécharger » : le fichier releve-IF-2025-0002.pdf, une page A4", async () => {
    const telecharge = await telechargerReleve(page, dossier);
    expect(telecharge.nom).toBe("releve-IF-2025-0002.pdf");
    fichier = telecharge.fichier;
    const releve = lireReleve(fichier);
    texte = releve.texte;
    console.log(`PDF ${telecharge.nom} pages=${releve.pages} format=${releve.format}`);
    expect(releve.format).toBe("595 842");
    expect(releve.pages).toBe(1);
    pdfEnPng(fichier, 1, path.join(captures, "UC09-01-03-page-1.png"));
  });

  await test.step("4. En-tête : logo, nom de l'institut, arrêtés, titre « RELEVÉ D'ÉCOLAGE » et date d'édition", async () => {
    expect(texte).toContain("Institut de Formation Supérieur des Paramédicaux");
    expect(texte).toContain("Atsinanana");
    expect(texte).toContain("IFSPA · Toamasina, Madagascar");
    expect(texte).toContain("Arrêtés n° 04460/2011-MESupRes et n° 15482/2011-MESupRES · Renouvellement n° 056/2024");
    expect(texte).toContain("RELEVÉ D'ÉCOLAGE");
    expect(texte).toMatch(/Édité le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}/);
    pdfZonePng(fichier, 1, null, "Année 2025-2026 ·", path.join(captures, "UC09-01-04-en-tete-identite.png"));
  });

  await test.step("5. Identité : matricule, filière, statut, niveau, année d'entrée, naissance, téléphone", async () => {
    expect(contientSuite(texte, ["RASOANAIVO Fanja", "MATRICULE", "IF-2025-0002", "FILIÈRE", "Infirmier(e)s", "STATUT", "Active"])).toBe(true);
    expect(contientSuite(texte, ["NIVEAU ACTUEL", "1re année", "ANNÉE D'ENTRÉE", "2025-2026", "NÉE LE", "02/11/2004 à Brickaville", "TÉLÉPHONE", "034 00 000 02"])).toBe(true);
  });

  await test.step("6. Grille 2025-2026 : droits Payé, octobre 30 000 Ar payés et 50 000 Ar restants, les autres mois En retard, sous-total", async () => {
    expect(texte).toContain("Année 2025-2026 · 1re année");
    expect(texte).toContain("Situation au");
    expect(contientSuite(texte, ["ÉCHÉANCE", "DÛ", "PAYÉ", "RESTE", "STATUT"])).toBe(true);
    expect(contientSuite(texte, ["Droits d'inscription", "100 000 Ar", "100 000 Ar", "—", "Payé"])).toBe(true);
    expect(contientSuite(texte, ["Octobre 2025", "80 000 Ar", "30 000 Ar", "50 000 Ar", "En retard"])).toBe(true);
    expect(contientSuite(texte, ["Novembre 2025", "80 000 Ar", "—", "80 000 Ar", "En retard"])).toBe(true);
    expect(contientSuite(texte, ["Juillet 2026", "80 000 Ar", "—", "80 000 Ar", "En retard"])).toBe(true);
    expect(contientSuite(texte, ["Sous-total 2025-2026", "900 000 Ar", "130 000 Ar", "770 000 Ar"])).toBe(true);
    pdfZonePng(fichier, 1, "Année 2025-2026 ·", "Récapitulatif général", path.join(captures, "UC09-01-05-grille.png"));
  });

  await test.step("7. Récapitulatif : total dû 900 000 Ar, payé 130 000 Ar, reste 770 000 Ar, en retard 770 000 Ar (10 mois)", async () => {
    expect(contientSuite(texte, ["TOTAL DÛ", "900 000 Ar", "TOTAL PAYÉ", "130 000 Ar", "RESTE À PAYER", "770 000 Ar"])).toBe(true);
    expect(texte).toMatch(/EN RETARD AU \d{2}\/\d{2}\/\d{4}\n770 000 Ar\n10 mois de retard/);
    expect(texte).toContain("Parcours 2025-2026");
  });

  await test.step("8. Paiements : le reçu R-2026-00022 de 130 000 Ar en espèces ; pied de page avec la date, l'éditeur et Page 1/1", async () => {
    expect(contientSuite(texte, ["Paiements enregistrés", "1 reçu valide"])).toBe(true);
    expect(contientSuite(texte, ["R-2026-00022", "17/10/2026", "Espèces", "—", "130 000 Ar", "Valide"])).toBe(true);
    expect(contientSuite(texte, ["Total des paiements valides", "130 000 Ar"])).toBe(true);
    expect(texte).toMatch(/Édité le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Hanitra RAKOTO/);
    expect(texte).toContain("Document généré par l'application IFSPA");
    expect(texte).toContain("Page 1/1");
    pdfZonePng(fichier, 1, "Récapitulatif général", null, path.join(captures, "UC09-01-06-recapitulatif-paiements-pied.png"));
  });
});
