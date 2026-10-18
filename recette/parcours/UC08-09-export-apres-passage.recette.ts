import fs from "node:fs";
import path from "node:path";
import { testPoste as test } from "./aides";
import { dossierTemporaire, DOSSIER_UC08 as DOSSIER, lireClasseur, ouvrirImpayes, verifierSynthese } from "./aides-impayes";
import { capture, expect } from "./outils";

// À lancer après UC09-06 (passage IF 1re année fait, reçu de Fanja annulé) : « Reste dû total » dépasse « Reste en retard ».
test("UC08-09 : après le passage, l'export distingue le retard du reste dû total", async ({ page }) => {
  const dossier = dossierTemporaire("uc08-09");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await test.step("1. Impayés : quatre étudiants, 2 920 000 Ar à recouvrer ; niveaux actuels (redoublant, 2e année)", async () => {
    await ouvrirImpayes(page);
    await verifierSynthese(page, 4, 2_920_000);
    await expect(page.getByRole("row").filter({ hasText: "RASOANAIVO Fanja" })).toContainText("1re année (redoublant)");
    await expect(page.getByRole("row").filter({ hasText: "RAKOTOMALALA Voahirana" })).toContainText("2e année");
    await expect(page.getByRole("row").filter({ hasText: "RAKOTOMALALA Voahirana" })).toContainText("Année 2025-2026");
    await capture(page, DOSSIER, "UC08-09-01-liste-apres-passage");
  });

  await test.step("2. Exporter : « Reste dû total » compte aussi 2026-2027, « Reste en retard » seulement 2025-2026", async () => {
    const [telechargement] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exporter (Excel)" }).click()]);
    const fichier = path.join(dossier, telechargement.suggestedFilename());
    await telechargement.saveAs(fichier);
    const lignes = lireClasseur(fichier).trim().split(/\r?\n/).slice(1).map((l) => l.split(" | "));
    console.log(`CLASSEUR\n${lignes.map((l) => l.join(" | ")).join("\n")}`);
    expect(lignes).toHaveLength(5);
    const par = new Map(lignes.slice(1).map((l) => [l[0], l]));
    expect(par.get("SF-2025-0001")?.slice(4, 10)).toEqual(["1re année", "034 00 000 04", "10", "900000", "900000", "2025-2026"]);
    expect(par.get("IF-2025-0002")?.slice(4, 10)).toEqual(["1re année (redoublant)", "034 00 000 02", "10", "900000", "1800000", "2025-2026"]);
    expect(par.get("IF-2025-0001")?.slice(4, 10)).toEqual(["2e année", "034 00 000 01", "9", "720000", "1620000", "2025-2026"]);
    expect(par.get("IF-2025-0004")?.slice(4, 10)).toEqual(["1re année (redoublant)", "034 00 000 06", "5", "400000", "1300000", "2025-2026"]);
    expect(fs.existsSync(fichier)).toBe(true);
    const corps = lignes
      .map((l, i) => `<tr>${l.map((c) => `<${i === 0 ? "th" : "td"}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`)
      .join("");
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{font:13px Calibri,Arial,sans-serif;margin:16px}h1{font-size:14px;margin:0 0 8px}*{caret-color:transparent}table{border-collapse:collapse}th,td{border:1px solid #bbb;padding:3px 8px;white-space:nowrap}th{background:#e8e8e8}</style><div id="apercu" style="display:inline-block"><h1>Contenu du fichier ${telechargement.suggestedFilename()}, feuille « Impayés »</h1><table>${corps}</table></div>`);
    await capture(page, DOSSIER, "UC08-09-02-contenu-fichier", page.locator("#apercu"));
  });
});
