import { testPoste as test } from "./aides";
import fs from "node:fs";
import path from "node:path";
import { request } from "@playwright/test";
import { choisirFiltreImpayes, dossierTemporaire, DOSSIER_UC08 as DOSSIER, lireClasseur, ouvrirImpayes } from "./aides-impayes";
import { capture, expect } from "./outils";

// Après 00-preparation (A, B, C) et 00e-preparation (G), avant tout paiement de UC08-05 à UC08-07.

const ENTETES = [
  "Matricule",
  "Nom",
  "Prénoms",
  "Filière",
  "Niveau",
  "Téléphone",
  "Mois en retard",
  "Reste en retard (Ar)",
  "Reste dû total (Ar)",
  "Années concernées",
  "Dernier paiement",
  "Montant du dernier paiement (Ar)",
];

/** Les lignes du classeur, une par tableau de cellules ; la première est l'en-tête. */
function lignesDuClasseur(sortie: string): { feuilles: string; lignes: string[][] } {
  const [premiere, ...reste] = sortie.trim().split(/\r?\n/);
  return { feuilles: premiere, lignes: reste.map((l) => l.split(" | ")) };
}

/** Aperçu du fichier relu, rendu en tableau pour la capture (le contenu vient du fichier téléchargé). */
async function apercu(page: import("@playwright/test").Page, nomFichier: string, lignes: string[][]) {
  const corps = lignes
    .map((l, i) => `<tr>${l.map((c) => `<${i === 0 ? "th" : "td"}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`)
    .join("");
  await page.setContent(`<!doctype html><meta charset="utf-8"><title>${nomFichier}</title>
    <style>body{font:13px Calibri,Arial,sans-serif;margin:16px}h1{font-size:14px;margin:0 0 8px}
    table{border-collapse:collapse}*{caret-color:transparent}th,td{border:1px solid #bbb;padding:3px 8px;white-space:nowrap}th{background:#e8e8e8}
    td:nth-child(n+7):nth-child(-n+9),td:nth-child(12){text-align:right}</style>
    <div id="apercu" style="display:inline-block"><h1>Contenu du fichier ${nomFichier}, feuille « Impayés »</h1><table>${corps}</table></div>`);
}

test("UC08-04 : exporter la liste en Excel, avec ou sans filtre", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dossier = dossierTemporaire("uc08-04");
  const jour = new Date().toLocaleDateString("fr-CA", { timeZone: "Indian/Antananarivo" });
  const nomAttendu = `impayes-${jour}.xlsx`;

  await test.step("1. Ouvrir Impayés : le bouton « Exporter (Excel) » est en haut à droite", async () => {
    await ouvrirImpayes(page);
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toHaveAttribute("href", "/api/export/impayes");
    await capture(page, DOSSIER, "UC08-04-01-bouton-export");
  });

  await test.step("2. Cliquer « Exporter (Excel) » : le fichier impayes-AAAA-MM-JJ.xlsx est téléchargé", async () => {
    const [telechargement] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exporter (Excel)" }).click()]);
    expect(telechargement.suggestedFilename()).toBe(nomAttendu);
    const fichier = path.join(dossier, telechargement.suggestedFilename());
    await telechargement.saveAs(fichier);
    expect(fs.statSync(fichier).size).toBeGreaterThan(1000);
    console.log(`FICHIER ${telechargement.suggestedFilename()} ${fs.statSync(fichier).size} octets`);

    const { feuilles, lignes } = lignesDuClasseur(lireClasseur(fichier));
    console.log(`FEUILLES ${feuilles}`);
    console.log(`CLASSEUR\n${lignes.map((l) => l.join(" | ")).join("\n")}`);
    expect(feuilles).toContain("Impayés");
    expect(lignes[0]).toEqual(ENTETES);
    expect(lignes).toHaveLength(7);
    await apercu(page, nomAttendu, lignes);
    await capture(page, DOSSIER, "UC08-04-02-contenu-fichier", page.locator("#apercu"));
  });

  await test.step("3. Lire les montants : mêmes lignes et mêmes chiffres que l'écran, plus le reste dû total", async () => {
    const fichier = path.join(dossier, nomAttendu);
    const { lignes } = lignesDuClasseur(lireClasseur(fichier));
    const parMatricule = new Map(lignes.slice(1).map((l) => [l[0], l]));
    const fanja = parMatricule.get("IF-2025-0002");
    expect(fanja?.slice(1, 4)).toEqual(["RASOANAIVO", "Fanja", "Infirmier(e)s"]);
    expect(fanja?.[4]).toBe("1re année");
    expect(fanja?.[5]).toBe("034 00 000 02");
    expect(fanja?.slice(6, 9)).toEqual(["10", "770000", "770000"]);
    expect(fanja?.[9]).toBe("2025-2026");
    expect(fanja?.[11]).toBe("130000");
    const voahirana = parMatricule.get("IF-2025-0001");
    expect(voahirana?.slice(6, 9)).toEqual(["9", "720000", "720000"]);
    expect(voahirana?.[11]).toBe("180000");
    const tiana = parMatricule.get("IF-2025-0003");
    expect(tiana?.slice(6, 9)).toEqual(["10", "900000", "900000"]);
    expect(tiana?.[10]).toBe("");
    expect(tiana?.[11]).toBe("");
    expect(parMatricule.has("IF-2026-0001")).toBe(false);
    const total = lignes.slice(1).reduce((s, l) => s + Number(l[7]), 0);
    expect(total).toBe(5_090_000);
  });

  await test.step("4. Filtrer sur Sage-femmes : l'export reprend le filtre de l'écran", async () => {
    await ouvrirImpayes(page);
    await choisirFiltreImpayes(page, "Filière", "Sage-femmes");
    await expect(page).toHaveURL(/[?&]filiereId=/);
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toHaveAttribute("href", /^\/api\/export\/impayes\?filiereId=/);
    const [telechargement] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exporter (Excel)" }).click()]);
    expect(telechargement.suggestedFilename()).toBe(nomAttendu);
    const fichier = path.join(dossier, "filtre-sage-femmes.xlsx");
    await telechargement.saveAs(fichier);
    const { lignes } = lignesDuClasseur(lireClasseur(fichier));
    console.log(`CLASSEUR-SF\n${lignes.map((l) => l.join(" | ")).join("\n")}`);
    expect(lignes).toHaveLength(3);
    expect(lignes.slice(1).map((l) => l[0]).sort()).toEqual(["SF-2025-0001", "SF-2025-0002"]);
    await apercu(page, nomAttendu, lignes);
    await capture(page, DOSSIER, "UC08-04-03-contenu-fichier-filtre", page.locator("#apercu"));
  });

  await test.step("5. Sans session, l'adresse d'export est refusée", async () => {
    const anonyme = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const reponse = await anonyme.get("/api/export/impayes");
    expect(reponse.status()).toBe(401);
    expect(await reponse.text()).toBe("Session expirée : reconnectez-vous.");
    await anonyme.dispose();
  });
});
