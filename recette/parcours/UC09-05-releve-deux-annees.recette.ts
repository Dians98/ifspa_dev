import path from "node:path";
import { testPoste as test } from "./aides";
import { barreResume, choisirClasse, decocher, ouvrirAdmissions } from "./aides-admissions";
import {
  contientSuite,
  dossierCaptures,
  dossierTemporaire,
  DOSSIER_UC09 as DOSSIER,
  pdfEnPng,
  releveDe,
} from "./aides-impayes";
import { capture, expect } from "./outils";

// Après UC09-04 : la classe IF 1re année passe en 2e année, Fanja et Solofo redoublent.
test("UC09-05 : après le passage, le relevé a une grille par année et la mention « redoublant »", async ({ page }) => {
  test.setTimeout(150_000);
  const dossier = dossierTemporaire("uc09-05");
  const captures = dossierCaptures(DOSSIER);
  await page.setViewportSize({ width: 1440, height: 1500 });

  await test.step("1. Passage en année supérieure : IF 1re année, décocher RASOANAIVO Fanja et RANDRIAMAHEFA Solofo, valider", async () => {
    await ouvrirAdmissions(page);
    await choisirClasse(page, "Infirmier(e)s", "1re année");
    await decocher(page, "RASOANAIVO Fanja");
    await decocher(page, "RANDRIAMAHEFA Solofo");
    await expect(barreResume(page)).toContainText(/2 passent en 2e année\s*·?\s*2 redoublent/);
    await page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" }).click();
    const dialogue = page.getByRole("dialog", { name: /Valider le passage/ });
    await dialogue.getByRole("button", { name: "Valider le passage de 4 étudiants" }).click();
    await expect(page.getByText(/validée : 2 passent en 2e année\s*·?\s*2 redoublent/)).toBeVisible();
    await capture(page, DOSSIER, "UC09-05-01-passage-valide");
  });

  await test.step("2. Télécharger le relevé de RASOANAIVO Fanja (redoublante) : deux pages A4", async () => {
    const r = await releveDe(page, "RASOANAIVO Fanja", dossier);
    console.log(`PDF Fanja ${r.nomFichier} pages=${r.pages} format=${r.format}`);
    expect(r.nomFichier).toBe("releve-IF-2025-0002.pdf");
    expect(r.format).toBe("595 842");
    expect(r.pages).toBe(2);
    expect(contientSuite(r.texte, ["NIVEAU ACTUEL", "1re année (redoublante)"])).toBe(true);
    expect(r.texte).toContain("Année 2025-2026 · 1re année");
    expect(r.texte).toMatch(/Année 2026-2027 · 1re année\s+redoublante/);
    expect(contientSuite(r.texte, ["Sous-total 2025-2026", "900 000 Ar", "130 000 Ar", "770 000 Ar"])).toBe(true);
    expect(contientSuite(r.texte, ["Sous-total 2026-2027", "900 000 Ar", "0 Ar", "900 000 Ar"])).toBe(true);
    expect(contientSuite(r.texte, ["TOTAL DÛ", "1 800 000 Ar", "TOTAL PAYÉ", "130 000 Ar", "RESTE À PAYER", "1 670 000 Ar"])).toBe(true);
    expect(contientSuite(r.texte, ["dont échéances à venir :", "900 000 Ar"])).toBe(true);
    expect(r.texte).toMatch(/EN RETARD AU \d{2}\/\d{2}\/\d{4}\n770 000 Ar\n10 mois de retard/);
    expect(r.texte).toContain("Parcours 2025-2027");
    expect(r.texte).toContain("Page 1/2");
    expect(r.texte).toContain("Page 2/2");
    pdfEnPng(r.fichier, 1, path.join(captures, "UC09-05-02-fanja-page-1.png"));
    pdfEnPng(r.fichier, 2, path.join(captures, "UC09-05-03-fanja-page-2.png"));
  });

  await test.step("3. Télécharger le relevé de RANDRIAMAHEFA Solofo : « redoublant » au masculin", async () => {
    const r = await releveDe(page, "RANDRIAMAHEFA Solofo", dossier);
    console.log(`PDF Solofo ${r.nomFichier} pages=${r.pages}`);
    expect(r.nomFichier).toBe("releve-IF-2025-0004.pdf");
    expect(contientSuite(r.texte, ["NIVEAU ACTUEL", "1re année (redoublant)"])).toBe(true);
    expect(r.texte).toMatch(/Année 2026-2027 · 1re année\s+redoublant\n/);
    expect(contientSuite(r.texte, ["NÉ LE", "17/05/2005 à Mahanoro"])).toBe(true);
    expect(contientSuite(r.texte, ["Sous-total 2025-2026", "900 000 Ar", "500 000 Ar", "400 000 Ar"])).toBe(true);
    expect(contientSuite(r.texte, ["TOTAL DÛ", "1 800 000 Ar", "TOTAL PAYÉ", "500 000 Ar", "RESTE À PAYER", "1 300 000 Ar"])).toBe(true);
    pdfEnPng(r.fichier, 1, path.join(captures, "UC09-05-04-solofo-page-1.png"));
  });

  await test.step("4. Télécharger le relevé de RAKOTOMALALA Voahirana (passée en 2e année)", async () => {
    const r = await releveDe(page, "RAKOTOMALALA Voahirana", dossier);
    console.log(`PDF Voahirana ${r.nomFichier} pages=${r.pages}`);
    expect(r.nomFichier).toBe("releve-IF-2025-0001.pdf");
    expect(contientSuite(r.texte, ["NIVEAU ACTUEL", "2e année"])).toBe(true);
    expect(r.texte).toContain("Année 2025-2026 · 1re année");
    expect(r.texte).toContain("Année 2026-2027 · 2e année");
    expect(r.texte).not.toContain("redoublant");
    expect(contientSuite(r.texte, ["TOTAL DÛ", "1 800 000 Ar", "TOTAL PAYÉ", "180 000 Ar", "RESTE À PAYER", "1 620 000 Ar"])).toBe(true);
    pdfEnPng(r.fichier, 1, path.join(captures, "UC09-05-05-voahirana-page-1.png"));
  });
});
