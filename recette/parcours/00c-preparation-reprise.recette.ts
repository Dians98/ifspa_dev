import { capture, expect, SESSIONS, test } from "./outils";

// Préparation propre à UC15, sur une base fraîche (sans 00-preparation) : l'année d'entrée 2025-2026, créée puis clôturée.
const DOSSIER = "00-preparation";

test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1100 } });

test("E. créer l'année 2025-2026 sans tarifs, puis la clôturer", async ({ page }) => {
  await test.step("E1. Paramètres › Années scolaires : une seule année, 2026-2027", async () => {
    await page.goto("/app/parametres/annees");
    await expect(page.getByRole("button", { name: "Définir 2025-2026 comme année courante" })).toHaveCount(0);
    await expect(page.getByText("2026-2027").first()).toBeVisible();
    await capture(page, DOSSIER, "E-01-annees-seed");
  });

  await test.step("E2. Nouvelle année 2025", async () => {
    await page.getByRole("button", { name: "Nouvelle année" }).click();
    const dialogue = page.getByRole("dialog", { name: "Nouvelle année scolaire" });
    await dialogue.getByLabel("Année de début").fill("2025");
    await expect(dialogue.getByText(/Année 2025-2026 : mensualités de/)).toBeVisible();
    await dialogue.getByRole("button", { name: "Créer l'année" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByRole("button", { name: "Clôturer l'année 2025-2026" })).toBeVisible();
  });

  await test.step("E3. Clôturer 2025-2026", async () => {
    await page.getByRole("button", { name: "Clôturer l'année 2025-2026" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Clôturer l'année 2025-2026 ?");
    await capture(page, DOSSIER, "E-02-confirmer-cloture", confirmation);
    await confirmation.getByRole("button", { name: "Clôturer l'année" }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole("button", { name: "Rouvrir l'année 2025-2026" })).toBeVisible();
    await capture(page, DOSSIER, "E-03-annees-cloturee");
  });
});
