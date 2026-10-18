import { envoyerInscription, remplirInscription } from "./aides-inscription";
import { SECTION_H } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

// Section H de 00-PREPARATION.md, à lancer après 00-preparation (sections A à C) pour UC11 et UC05.
const DOSSIER = "00-preparation";

test.use({ viewport: { width: 1440, height: 1300 }, storageState: SESSIONS.secretariat });

test("H. trois étudiants de 2026-2027 : Hery, Hélène (droits en 3 fois) et Faly", async ({ page }) => {
  test.setTimeout(90_000);

  for (const [cle, e] of Object.entries(SECTION_H)) {
    await test.step(`H. Secrétariat : inscrire ${e.nom} ${e.prenoms} (${e.matricule})`, async () => {
      await remplirInscription(page, e);
      await envoyerInscription(page, e);
      await expect(page.getByText(/Reste à payer/).first()).toBeVisible();
      if (cle === "helene") await capture(page, DOSSIER, "H-01-fiche-helene");
    });
  }

  await test.step("H. Contrôle : dix étudiants dans la liste", async () => {
    await page.goto("/app/etudiants");
    await expect(page.getByRole("status").filter({ hasText: "10 étudiants inscrits" })).toBeVisible();
    await capture(page, DOSSIER, "H-02-liste-dix-etudiants");
  });
});
