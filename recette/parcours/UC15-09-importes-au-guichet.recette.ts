import { bandeau, boutonEncaisser, carte, choisirEtudiant, recuEnregistre } from "./aides";
import { captureHaute, DOSSIER_UC15 as DOSSIER } from "./aides-reprise";
import { expect, SESSIONS, test } from "./outils";

test.describe.configure({ mode: "serial" });
test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 900 } });

test("UC15-09. Les étudiants importés se retrouvent au guichet avec leur reste dû", async ({ page }) => {
  await test.step("1. Encaisser : RANAIVOSOA, 130 000 Ar repris, une échéance partielle", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, { nom: "RANAIVOSOA" });
    await expect(page.getByText("SF-2025-0002 · Sage-femmes · 1re année (redoublant)")).toBeVisible();
    await expect(page.getByText(/Reste à payer :\s*770\s000\sAr/)).toBeVisible();
    await expect(page.getByText(/Déjà payé sur 2026-2027 :\s*130\s000\sAr sur 900\s000\sAr/)).toBeVisible();
    await expect(carte(page, "Octobre 2026")).toContainText("Partiel");
    await captureHaute(page, DOSSIER, "UC15-09-01-partiel");
  });

  await test.step("2. Encaisser : RAKOTONDRAZAFY, 180 000 Ar repris", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, { nom: "RAKOTONDRAZAFY" });
    await expect(page.getByText(/Reste à payer :\s*720\s000\sAr/)).toBeVisible();
    await expect(page.getByText(/Déjà payé sur 2026-2027 :\s*180\s000\sAr sur 900\s000\sAr/)).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-09-02-rakotondrazafy");
  });

  await test.step("3. Encaisser les droits d'ANDRIANTSOA, que le fichier n'a pas fait payer", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, { nom: "ANDRIANTSOA" });
    await expect(page.getByText(/Reste à payer :\s*900\s000\sAr/)).toBeVisible();
    await carte(page, "Droits d'inscription").click();
    await boutonEncaisser(page, 100_000).click();
    const { numero } = await recuEnregistre(page);
    expect(numero).toMatch(/^R-2026-\d{5}$/);
    await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await expect(page.getByText(/Reste à payer : 800\s000\sAr/).first()).toBeVisible();
    await captureHaute(page, DOSSIER, "UC15-09-03-encaisse");
  });
});
