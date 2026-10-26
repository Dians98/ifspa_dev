import { bandeau, boutonEncaisser, carte, choisirEtudiant, numeroDuTicket, ouvrirGuichetEnLigne } from "./aides";
import { DOSSIER, E, POSTE_GUICHET } from "./aides-az";
import { ouvrirPaiements, ligne } from "./aides-paiements";
import { capture, expect, SESSIONS, test } from "./outils";

// Acte 8 : encaisser sans Internet, puis tout part au retour du réseau. Sur le build seulement (le service worker n'existe pas en dev).
test.describe.configure({ mode: "serial" });

test.describe("Acte 8 : secrétariat", () => {
  test.use({ storageState: POSTE_GUICHET, viewport: { width: 1440, height: 1000 } });

  let numero = "";

  test("8.1 à 8.4 encaisser sans Internet puis synchroniser", async ({ page, context }) => {
    test.setTimeout(120_000);

    await test.step("8.1 Ouvrir Encaisser avec Internet : « En ligne · tout est synchronisé »", async () => {
      await ouvrirGuichetEnLigne(page);
      await expect(page.getByText("Hanitra RAKOTO", { exact: true }).first()).toBeVisible();
      await capture(page, DOSSIER, "AZ-8-1-en-ligne");
    });

    await test.step("8.2 Couper Internet et recharger : « Hors ligne · vous pouvez continuer à encaisser »", async () => {
      await context.setOffline(true);
      await page.reload();
      await expect(bandeau(page)).toContainText("Hors ligne · vous pouvez continuer à encaisser", { timeout: 20_000 });
      await capture(page, DOSSIER, "AZ-8-2-hors-ligne");
    });

    await test.step("8.3 Encaisser les droits de E (100 000 Ar) sans Internet", async () => {
      await choisirEtudiant(page, E);
      await carte(page, "Droits d'inscription").click();
      await boutonEncaisser(page, 100_000).click();
      numero = await numeroDuTicket(page);
      expect(numero).toBe("R-2026-00001");
      await expect(bandeau(page)).toContainText("1 paiement en attente");
      await page.setViewportSize({ width: 1440, height: 800 });
      await capture(page, DOSSIER, "AZ-8-3-ticket-en-attente");
      await page.setViewportSize({ width: 1440, height: 1000 });
    });

    await test.step("8.4 Rétablir Internet : le paiement part au serveur", async () => {
      await context.setOffline(false);
      await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 30_000 });
      await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
      await page.setViewportSize({ width: 1440, height: 800 });
      await capture(page, DOSSIER, "AZ-8-4-synchronise");
    });
  });

});

test.describe("Acte 8 : administrateur", () => {
  test.use({ storageState: SESSIONS.admin, viewport: { width: 1440, height: 1100 } });

  test("8.5 le paiement hors ligne apparaît dans Paiements", async ({ page }) => {
    await ouvrirPaiements(page);
    await expect(page.getByText("Administrateur IFSPA", { exact: true }).first()).toBeVisible();
    await expect(ligne(page, "R-2026-00001")).toContainText("RAKOTOARISOA Nirina");
    await expect(ligne(page, "R-2026-00001")).toContainText(/100\s000\sAr/);
    await expect(ligne(page, "R-2026-00001")).toContainText("Valide");
    await expect(page.getByText(/À vérifier/)).toHaveCount(0);
    await capture(page, DOSSIER, "AZ-8-5-paiements-admin");
  });
});
