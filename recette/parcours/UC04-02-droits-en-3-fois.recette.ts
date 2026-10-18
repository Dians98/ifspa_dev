import { envoyerInscription, INSCRITS, recapitulatif, remplirInscription } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { tiana } = INSCRITS;

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-02 : droits d'inscription payés en trois tranches", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Choisir « En 3 fois » : le formulaire annonce 34 000 + 33 000 + 33 000 Ar", async () => {
    await remplirInscription(page, tiana);
    await expect(page.getByText(/34\s000\sAr à l'inscription \(octobre\) · 33\s000\sAr en novembre · 33\s000\sAr en décembre/)).toBeVisible();
    await expect(recapitulatif(page)).toContainText("IF-2026-0003");
    await expect(recapitulatif(page)).toContainText(/Droits 1\/3\s*· octobre\s*34\s000\sAr/);
    await expect(recapitulatif(page)).toContainText(/Droits 2\/3\s*· novembre\s*33\s000\sAr/);
    await expect(recapitulatif(page)).toContainText(/Droits 3\/3\s*· décembre\s*33\s000\sAr/);
    await expect(recapitulatif(page)).toContainText(/Total de l'année\s*900\s000\sAr/);
    await capture(page, DOSSIER, "UC04-02-01-formulaire-3-fois");
  });

  await test.step("2. Inscrire : la fiche annonce la tranche 1 de 34 000 Ar et « Droits payés en 3 fois »", async () => {
    await envoyerInscription(page, tiana);
    await expect(page.getByText(/encaisser les droits d'inscription \(34\s000\sAr, tranche 1\)/)).toBeVisible();
    await expect(page.getByText("Droits payés en 3 fois")).toBeVisible();
    await capture(page, DOSSIER, "UC04-02-02-fiche");
  });

  await test.step("3. Treize échéances : trois tranches de droits et dix mensualités, 900 000 Ar au total", async () => {
    const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
    await expect(grille).toHaveCount(13);
    await expect(grille.filter({ hasText: "Droits — tranche 1/3" })).toContainText(/34\s000\sAr/);
    await expect(grille.filter({ hasText: "Droits — tranche 2/3" })).toContainText(/33\s000\sAr/);
    await expect(grille.filter({ hasText: "Droits — tranche 3/3" })).toContainText(/33\s000\sAr/);
    await expect(page.getByText(/Reste à payer/).first()).toBeVisible();
    await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
    await capture(page, DOSSIER, "UC04-02-03-grille", page.getByRole("heading", { name: "Écolage 2026-2027 · 1re année" }).locator("xpath=ancestor::section[1]"));
  });
});
