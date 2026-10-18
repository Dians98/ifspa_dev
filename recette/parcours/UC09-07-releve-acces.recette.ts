import path from "node:path";
import { testPoste as test } from "./aides";
import { ouvrirAdmin } from "./aides-paiements";
import { contientSuite, dossierCaptures, dossierTemporaire, DOSSIER_UC09 as DOSSIER, lireReleve, ouvrirFiche, pdfZonePng } from "./aides-impayes";
import { capture, expect } from "./outils";
import fs from "node:fs";

// Après UC09-06 : qui peut ouvrir le relevé, et ce que répond l'adresse quand on n'y a pas droit.
test("UC09-07 : le relevé est réservé aux utilisateurs connectés ; adresse inconnue, message clair", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const dossier = dossierTemporaire("uc09-07");
  const captures = dossierCaptures(DOSSIER);
  await page.setViewportSize({ width: 1440, height: 700 });
  await ouvrirFiche(page, "RAKOTOARISOA Nirina");
  const id = new URL(page.url()).pathname.split("/").pop() as string;
  const adresse = `/api/pdf/releve/${id}`;

  await test.step("1. Sans être connecté, l'adresse du relevé répond « Session expirée : reconnectez-vous. »", async () => {
    const anonyme = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, viewport: { width: 900, height: 300 } });
    try {
      const p = await anonyme.newPage();
      const reponse = await p.goto(adresse);
      expect(reponse?.status()).toBe(401);
      await expect(p.getByText("Session expirée : reconnectez-vous.")).toBeVisible();
      await capture(p, DOSSIER, "UC09-07-01-sans-session");
    } finally {
      await anonyme.close();
    }
  });

  await test.step("2. Connecté, une adresse d'étudiant inexistante répond « Étudiant introuvable. »", async () => {
    const reponse = await page.goto("/api/pdf/releve/inexistant");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByText("Étudiant introuvable.")).toBeVisible();
    await capture(page, DOSSIER, "UC09-07-02-etudiant-introuvable");
  });

  await test.step("3. Secrétariat : le relevé s'ouvre dans le navigateur (inline), « ?telecharger=1 » le télécharge (attachment)", async () => {
    const ouvert = await page.request.get(adresse);
    expect(ouvert.status()).toBe(200);
    expect(ouvert.headers()["content-type"]).toBe("application/pdf");
    expect(ouvert.headers()["content-disposition"]).toBe('inline; filename="releve-IF-2026-0001.pdf"');
    const telecharge = await page.request.get(`${adresse}?telecharger=1`);
    expect(telecharge.status()).toBe(200);
    expect(telecharge.headers()["content-disposition"]).toBe('attachment; filename="releve-IF-2026-0001.pdf"');
    const fichier = path.join(dossier, "secretariat.pdf");
    fs.writeFileSync(fichier, await ouvert.body());
    const r = lireReleve(fichier);
    expect(r.format).toBe("595 842");
    expect(r.texte).toMatch(/Édité le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Hanitra RAKOTO/);
    pdfZonePng(fichier, 1, "Récapitulatif général", null, path.join(captures, "UC09-07-03-pied-secretariat.png"), 100);
  });

  await test.step("4. Administrateur : le même relevé, avec son nom en pied de page", async () => {
    const { contexte, page: admin } = await ouvrirAdmin(browser, baseURL, 700);
    try {
      await admin.goto("/app/etudiants");
      await expect(admin.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
      const reponse = await admin.request.get(adresse);
      expect(reponse.status()).toBe(200);
      expect(reponse.headers()["content-type"]).toBe("application/pdf");
      const fichier = path.join(dossier, "admin.pdf");
      fs.writeFileSync(fichier, await reponse.body());
      const r = lireReleve(fichier);
      expect(r.texte).toMatch(/Édité le \d{2}\/\d{2}\/\d{4} à \d{2}:\d{2} par Administrateur IFSPA/);
      expect(contientSuite(r.texte, ["RAKOTOARISOA Nirina", "MATRICULE", "IF-2026-0001"])).toBe(true);
      pdfZonePng(fichier, 1, "Récapitulatif général", null, path.join(captures, "UC09-07-04-pied-admin.png"), 100);
    } finally {
      await contexte.close();
    }
  });
});
