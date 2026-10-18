import { montantRegex } from "./aides";
import { cartesAnnee, DOSSIER_UC05 as DOSSIER, dontEnRetard, ouvrirFicheDe, resteAPayer } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1800 } });

test("UC05-04 : un acompte se lit sur la fiche, « Partiel » dans le mois en cours, « En retard » sur un mois échu", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. RAKOTOARISOA Nirina (2026-2027) a versé 150 000 Ar : droits payés, octobre « Partiel »", async () => {
    await ouvrirFicheDe(page, "RAKOTOARISOA", "IF-2026-0001");
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(750_000));
    await expect(dontEnRetard(page)).toHaveText("Aucun retard");
    await expect(page.locator("dt", { hasText: "Déjà payé" }).locator("xpath=following-sibling::dd[1]")).toHaveText(montantRegex(150_000));
    const cartes = cartesAnnee(page, "Écolage 2026-2027 · 1re année");
    await expect(cartes.filter({ hasText: "Droits d'inscription" })).toContainText("Payé");
    const octobre = cartes.filter({ hasText: "Octobre 2026" });
    await expect(octobre).toContainText("Partiel");
    await expect(octobre).toContainText(/Payé\s*50\s000\sAr/);
    await expect(octobre).toContainText(/Reste\s*30\s000\sAr/);
    await expect(octobre).toContainText("Mois en cours");
    await expect(cartes.filter({ hasText: "Novembre 2026" })).toContainText("À venir");
    await capture(page, DOSSIER, "UC05-04-01-nirina-partiel");
  });

  await test.step("2. RASOANAIVO Fanja (2025-2026) a versé 130 000 Ar : octobre 2025 reste « En retard » avec 30 000 Ar payés", async () => {
    await ouvrirFicheDe(page, "RASOANAIVO", "IF-2025-0002");
    await expect(resteAPayer(page)).toHaveText(montantRegex(1_670_000));
    await expect(dontEnRetard(page)).toHaveText(montantRegex(770_000));
    await expect(page.getByText("10 mois impayés")).toBeVisible();
    const cartes = cartesAnnee(page, "Écolage 2025-2026 · 1re année");
    await expect(cartes.filter({ hasText: "Droits d'inscription" })).toContainText("Payé");
    const octobre = cartes.filter({ hasText: "Octobre 2025" });
    await expect(octobre).toContainText("En retard");
    await expect(octobre).not.toContainText("Partiel");
    await expect(octobre).toContainText(/Payé\s*30\s000\sAr/);
    await expect(octobre).toContainText(/Reste\s*50\s000\sAr/);
    await capture(page, DOSSIER, "UC05-04-02-fanja-acompte-en-retard");
  });
});
