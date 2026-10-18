import { boutonEncaisser, carte, choisirEtudiant, ETUDIANTS, grandEcran, montantRecu, recuEnregistre } from "./aides";
import { ADMIN, ligneParametre, ouvrirAnnees, ouvrirTarifs, saisirTarif } from "./aides-parametres";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC02-parametres";
const VOAHIRANA = ETUDIANTS.voahirana;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 1300 } });

test.describe("UC02-04 : clôturer 2025-2026 — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("la clôture verrouille les tarifs, pas l'encaissement", async ({ page }) => {
    // Page restée ouverte sur les tarifs 2025-2026 avant la clôture (étape 5).
    const ancienne = await page.context().newPage();

    await test.step("1. Une année non courante avec des inscrits : « Clôturer » est proposé, « Supprimer » ne l'est pas", async () => {
      await ouvrirAnnees(page);
      await expect(page.getByText(ADMIN)).toBeVisible();
      const ligne = ligneParametre(page, /^2025-2026/);
      await expect(ligne.getByRole("button", { name: "Clôturer l'année 2025-2026" })).toBeVisible();
      await expect(ligne.getByRole("button", { name: "Supprimer l'année 2025-2026" })).toHaveCount(0);
      await ligne.getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" }).click();
      await expect(page.getByText("Cette année ne peut pas être supprimée : 6 étudiants y sont inscrits. Clôturez-la plutôt.")).toBeVisible();
      await capture(page, DOSSIER, "UC02-04-01-motif-suppression");
      await page.keyboard.press("Escape");
    });

    await test.step("2. Un second onglet ouvre les tarifs 2025-2026 et y commence une modification", async () => {
      await ouvrirTarifs(ancienne, "2025-2026");
      await saisirTarif(ancienne, "IF 1re année", { mensualite: "82 000" });
      await expect(ancienne.getByText("1 classe modifiée, pas encore enregistrée.")).toBeVisible();
    });

    await test.step("3. Clôturer 2025-2026 : la confirmation annonce que les impayés restent encaissables", async () => {
      await page.getByRole("button", { name: "Clôturer l'année 2025-2026" }).click();
      const confirmation = page.getByRole("alertdialog");
      await expect(confirmation).toContainText("Clôturer l'année 2025-2026 ?");
      await expect(confirmation).toContainText(
        "Ses tarifs ne pourront plus être modifiés. Les impayés de cette année restent encaissables, et vous pouvez la rouvrir à tout moment.",
      );
      await capture(page, DOSSIER, "UC02-04-02-confirmer-cloture");
      await confirmation.getByRole("button", { name: "Clôturer l'année" }).click();
      await expect(page.getByText("Année 2025-2026 clôturée. Ses impayés restent encaissables.")).toBeVisible();
      const ligne = ligneParametre(page, /^2025-2026/);
      await expect(ligne).toContainText("Clôturée");
      await expect(ligne.getByRole("button", { name: "Rouvrir l'année 2025-2026" })).toBeVisible();
      await expect(ligne.getByRole("button", { name: "Définir 2025-2026 comme année courante" })).toHaveCount(0);
      await expect(ligne.getByRole("button", { name: "Clôturer l'année 2025-2026" })).toHaveCount(0);
      await capture(page, DOSSIER, "UC02-04-03-annee-cloturee");
    });

    await test.step("4. Les tarifs 2025-2026 sont en lecture seule", async () => {
      await page.getByRole("link", { name: "Tarifs de l'année 2025-2026" }).click();
      await page.waitForURL("**/app/parametres/tarifs?annee=*");
      await expect(page.getByText(/L'année 2025-2026 est clôturée : ses tarifs sont en lecture seule\./)).toBeVisible();
      await expect(page.getByLabel("Droits d'inscription, IF 1re année")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
      await capture(page, DOSSIER, "UC02-04-04-tarifs-lecture-seule");
    });

    await test.step("5. Le serveur refuse l'enregistrement fait depuis l'onglet resté ouvert avant la clôture", async () => {
      await ancienne.getByRole("button", { name: "Enregistrer" }).click();
      const zone = ancienne.getByRole("main").getByRole("alert");
      await expect(zone).toContainText("L'année 2025-2026 est clôturée : ses tarifs ne peuvent plus être modifiés. Rouvrez-la d'abord.");
      await ancienne.setViewportSize({ width: 1440, height: 1300 });
      await capture(ancienne, DOSSIER, "UC02-04-05-refus-serveur-tarifs");
      await ancienne.close();
    });
  });
});

test.describe("UC02-04 : un parent paie une année clôturée — secrétariat", () => {
  test.use({ storageState: SESSIONS.secretariat });

  test("100 000 Ar sur les droits 2025-2026 de RAKOTOMALALA Voahirana", async ({ page }) => {
    await test.step("6. Encaisser : l'impayé de 2025-2026 est toujours proposé et encaissable", async () => {
      await page.goto("/app/encaisser");
      await choisirEtudiant(page, VOAHIRANA);
      await expect(page.getByText(/Reste à payer :\s*900\s000\sAr, dont 900\s000\sAr en retard/)).toBeVisible();
      await expect(page.getByRole("group", { name: /Année 2025-2026/ })).toBeVisible();
      await expect(carte(page, "Droits d'inscription")).toHaveAttribute("aria-pressed", "true");
      await montantRecu(page).fill("100000");
      await expect(page.getByText(/Après ce paiement, il restera\s*800\s000\sAr à payer\./)).toBeVisible();
      await grandEcran(page, 2000);
      await capture(page, DOSSIER, "UC02-04-06-guichet-annee-cloturee");
    });

    await test.step("7. Encaisser 100 000 Ar : le reçu est enregistré", async () => {
      await boutonEncaisser(page, 100_000).click();
      const { numero, zone } = await recuEnregistre(page);
      expect(numero).toMatch(/^R-2026-\d{5}$/);
      await expect(zone).toContainText(/Paiement enregistré : reçu R-2026-\d{5}/);
      await capture(page, DOSSIER, "UC02-04-07-paiement-enregistre");
    });
  });
});

test.describe("UC02-04 : rouvrir 2025-2026 — administrateur", () => {
  test.use({ storageState: SESSIONS.admin });

  test("la réouverture rend les tarifs modifiables", async ({ page }) => {
    await test.step("8. Rouvrir 2025-2026", async () => {
      await ouvrirAnnees(page);
      await page.getByRole("button", { name: "Rouvrir l'année 2025-2026" }).click();
      await expect(page.getByText("Année 2025-2026 rouverte : ses tarifs sont de nouveau modifiables.")).toBeVisible();
      await expect(ligneParametre(page, /^2025-2026/)).toContainText("Ouverte · à clôturer");
      await expect(ligneParametre(page, /^2025-2026/).getByRole("button", { name: "Clôturer l'année 2025-2026" })).toBeVisible();
      await capture(page, DOSSIER, "UC02-04-08-annee-rouverte");
    });

    await test.step("9. Ses tarifs sont de nouveau saisissables, sans trace de la modification refusée à l'étape 5", async () => {
      await ouvrirTarifs(page, "2025-2026");
      await expect(page.getByLabel("Mensualité, IF 1re année")).toHaveValue(/^80\s000$/);
      await expect(page.getByRole("button", { name: "Enregistrer" })).toBeVisible();
      await capture(page, DOSSIER, "UC02-04-09-tarifs-rouverts");
    });
  });
});
