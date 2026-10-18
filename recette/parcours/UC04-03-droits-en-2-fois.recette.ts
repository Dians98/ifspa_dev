import { envoyerInscription, INSCRITS, recapitulatif, remplirInscription } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { lalaina } = INSCRITS;

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-03 : droits d'inscription payés en deux tranches", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Choisir « En 2 fois » : 50 000 Ar en octobre, 50 000 Ar en novembre", async () => {
    await remplirInscription(page, lalaina);
    await expect(page.getByText(/50\s000\sAr à l'inscription \(octobre\) · 50\s000\sAr en novembre/)).toBeVisible();
    await expect(recapitulatif(page)).toContainText("SF-2026-0002");
    await expect(recapitulatif(page)).toContainText(/Droits 1\/2\s*· octobre\s*50\s000\sAr/);
    await expect(recapitulatif(page)).toContainText(/Droits 2\/2\s*· novembre\s*50\s000\sAr/);
    await capture(page, DOSSIER, "UC04-03-01-formulaire-2-fois");
  });

  await test.step("2. Inscrire : la fiche montre « Droits payés en 2 fois » et douze échéances", async () => {
    await envoyerInscription(page, lalaina);
    await expect(page.getByText(/encaisser les droits d'inscription \(50\s000\sAr, tranche 1\)/)).toBeVisible();
    await expect(page.getByText("Droits payés en 2 fois")).toBeVisible();
    const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
    await expect(grille).toHaveCount(12);
    await expect(grille.filter({ hasText: "Droits — tranche 1/2" })).toContainText(/50\s000\sAr/);
    await expect(grille.filter({ hasText: "Droits — tranche 2/2" })).toContainText(/50\s000\sAr/);
    await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
    await capture(page, DOSSIER, "UC04-03-02-fiche");
  });
});
