import { boutonEncaisser, choisirEtudiant, montantRecu, recuEnregistre } from "./aides";
import { B, DOSSIER, E, inscrireAZ, ouvrirFiche, POSTE_GUICHET, resume } from "./aides-az";
import { capture, expect, test } from "./outils";

// Acte 7 : rentrée 2026-2027. Le secrétariat inscrit E, puis encaisse B, dont l'impayé de 2025-2026 est soldé en premier.
test.use({ storageState: POSTE_GUICHET, viewport: { width: 1440, height: 1900 } });

test("Acte 7 : inscrire E, encaisser B sur son plus ancien impayé", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("7.1 Inscrire E : RAKOTOARISOA Nirina, IF-2026-0001", async () => {
    await inscrireAZ(page, E);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 1re année" })).toBeVisible();
    await expect(resume(page, "Reste à payer")).toContainText("900 000 Ar");
    await expect(resume(page, "Dont en retard")).toContainText("Aucun retard");
    await capture(page, DOSSIER, "AZ-7-1-fiche-e");
  });

  await test.step("7.2 Guichet : B voit tout son impayé, 2025-2026 compris", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, B);
    await expect(page.getByText(/Reste à payer :\s*1\s560\s000\sAr, dont 600\s000\sAr en retard/)).toBeVisible();
    await expect(page.getByText("Année 2025-2026 · 1re année")).toBeVisible();
    await expect(page.getByText("Année 2026-2027 · 2e année")).toBeVisible();
    await capture(page, DOSSIER, "AZ-7-2-guichet-b");
  });

  await test.step("7.3 B apporte 100 000 Ar : décembre 2025 d'abord, le reste en acompte sur janvier", async () => {
    await montantRecu(page).fill("100000");
    await expect(page.getByText("Décembre 2025 → Janvier 2026 · 1 échéance soldée · 1 acompte · Espèces")).toBeVisible();
    await boutonEncaisser(page, 100_000).click();
    const r = await recuEnregistre(page);
    expect(r.numero).toBe("R-2026-00025");
    await expect(r.zone).toContainText(/100\s000\sAr · Espèces · RASOANAIVO Fanja\. Reste à payer : 1\s460\s000\sAr\./);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, DOSSIER, "AZ-7-3-b-enregistre");
    await page.setViewportSize({ width: 1440, height: 1900 });
  });

  await test.step("7.4 La fiche de B : 2025-2026 avance, 2026-2027 est intact", async () => {
    await ouvrirFiche(page, B);
    await expect(resume(page, "Reste à payer")).toContainText("1 460 000 Ar");
    await expect(resume(page, "Dont en retard")).toContainText("500 000 Ar");
    await expect(resume(page, "Déjà payé")).toContainText("400 000 Ar");
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 2e année" })).toBeVisible();
    await capture(page, DOSSIER, "AZ-7-4-fiche-b");
  });
});
