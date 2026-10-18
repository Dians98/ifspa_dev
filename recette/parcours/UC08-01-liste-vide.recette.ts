import { DOSSIER_UC08 as DOSSIER, ouvrirImpayes } from "./aides-impayes";
import { capture, expect, SESSIONS, test } from "./outils";

// À lancer sur la base fraîche, avant 00-preparation : aucun étudiant n'est inscrit.
test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 900 } });

test("UC08-01 : aucun retard, la liste le dit et l'export n'est pas proposé", async ({ page }) => {
  await test.step("1. Ouvrir Impayés par le menu", async () => {
    await page.goto("/app/dashboard");
    await page.getByRole("link", { name: "Impayés", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants en retard de paiement" })).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Secrétariat", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Situation au \d{2}\/\d{2}\/\d{4} : échéances échues et non soldées, toutes années\.$/)).toBeVisible();
    await expect(page.getByText("0 étudiant en retard")).toBeVisible();
    await expect(page.getByText("Aucun étudiant n'est en retard de paiement : tout est à jour.")).toBeVisible();
    await capture(page, DOSSIER, "UC08-01-01-tout-est-a-jour");
  });

  await test.step("2. Pas de bouton d'export quand la liste est vide", async () => {
    await expect(page.getByRole("link", { name: "Exporter (Excel)" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Effacer les filtres" })).toHaveCount(0);
    await ouvrirImpayes(page);
  });
});
