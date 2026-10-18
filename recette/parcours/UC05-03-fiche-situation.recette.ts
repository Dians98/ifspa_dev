import { montantRegex } from "./aides";
import { dossierTemporaire, imprimerReleve, telechargerReleve } from "./aides-impayes";
import { boutonSortie, cartesAnnee, DOSSIER_UC05 as DOSSIER, dontEnRetard, ouvrirFicheDe, ouvrirListe, resteAPayer } from "./aides-sorties";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1800 } });

const T26 = "Écolage 2026-2027 · 2e année";
const T25 = "Écolage 2025-2026 · 1re année";

test("UC05-03 : lire la situation d'un étudiant qui a deux années à suivre", async ({ page }) => {
  test.setTimeout(150_000);

  await test.step("1. Secrétariat : depuis la liste, ouvrir RAKOTOMALALA Voahirana : identité, matricule, boutons", async () => {
    await ouvrirListe(page);
    await page.getByRole("link", { name: "RAKOTOMALALA Voahirana" }).click();
    await page.waitForURL(/\/app\/etudiants\/[^/?]+$/);
    const entete = page.getByRole("region", { name: "Identité de l'étudiant" });
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(entete.getByRole("heading", { level: 1 })).toHaveText("RAKOTOMALALA Voahirana");
    await expect(entete).toContainText("Matricule IF-2025-0001");
    await expect(entete.getByText("Infirmier(e)s", { exact: true })).toBeVisible();
    await expect(entete.getByText("2e année · 2026-2027")).toBeVisible();
    await expect(entete.getByText("Actif", { exact: true })).toBeVisible();
    await expect(entete.getByRole("link", { name: /^Encaisser 720\s000\sAr$/ })).toBeVisible();
    await expect(entete.getByRole("button", { name: "Imprimer le relevé" })).toBeVisible();
    await expect(entete.getByRole("link", { name: "Télécharger le relevé d'écolage en PDF" })).toBeVisible();
    await expect(entete.getByRole("link", { name: "Modifier" })).toBeVisible();
    await expect(boutonSortie(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Étudiants", exact: true }).first()).toBeVisible();
    await capture(page, DOSSIER, "UC05-03-01-fiche");
  });

  await test.step("2. L'onglet Écolage : 1 620 000 Ar à payer, dont 720 000 Ar en retard (9 mois), 180 000 Ar déjà payés", async () => {
    await expect(page.getByRole("tab", { name: "Écolage", selected: true })).toBeVisible();
    await expect(resteAPayer(page)).toHaveText(montantRegex(1_620_000));
    await expect(page.getByText("Toutes années confondues")).toBeVisible();
    await expect(dontEnRetard(page)).toHaveText(montantRegex(720_000));
    await expect(page.getByText("9 mois impayés")).toBeVisible();
    await expect(page.locator("dt", { hasText: "Déjà payé" }).locator("xpath=following-sibling::dd[1]")).toHaveText(montantRegex(180_000));
    await expect(page.getByText(/Sur 1\s800\s000\sAr dus au total/)).toBeVisible();
    await expect(page.getByText(/Total encaissé : 180\s000\sAr/)).toBeVisible();
    await expect(page.getByText("Un paiement solde d'abord l'échéance la plus ancienne ; le surplus passe en acompte sur la suivante.")).toBeVisible();
    await capture(page, DOSSIER, "UC05-03-02-resume", page.getByRole("region", { name: "Situation de l'écolage, toutes années" }));
  });

  await test.step("3. Une grille par année, la plus récente d'abord : 2026-2027 « À venir » avec « Mois en cours »", async () => {
    const titres = page.getByRole("heading", { level: 3 });
    await expect(titres).toHaveText([T26, T25]);
    await expect(page.getByText(/Dû 900\s000\sAr · Payé 0\sAr · Reste 900\s000\sAr/)).toBeVisible();
    const cartes = cartesAnnee(page, T26);
    await expect(cartes).toHaveCount(11);
    await expect(cartes.filter({ hasText: "À venir" })).toHaveCount(11);
    await expect(cartes.filter({ hasText: "Octobre 2026" })).toContainText("Mois en cours");
    await capture(page, DOSSIER, "UC05-03-03-annee-2026", page.getByRole("heading", { name: T26 }).locator("xpath=ancestor::section[1]"));
  });

  await test.step("4. 2025-2026 : droits et octobre « Payé », les neuf mois suivants « En retard », reste 720 000 Ar", async () => {
    await expect(page.getByText(/Dû 900\s000\sAr · Payé 180\s000\sAr · Reste 720\s000\sAr/)).toBeVisible();
    const cartes = cartesAnnee(page, T25);
    await expect(cartes).toHaveCount(11);
    await expect(cartes.filter({ hasText: "Droits d'inscription" })).toContainText("Payé");
    await expect(cartes.filter({ hasText: "Octobre 2025" })).toContainText("Payé");
    await expect(cartes.filter({ hasText: "En retard" })).toHaveCount(9);
    await expect(cartes.filter({ hasText: "Juillet 2026" })).toContainText("En retard");
    await capture(page, DOSSIER, "UC05-03-04-annee-2025", page.getByRole("heading", { name: T25 }).locator("xpath=ancestor::*[self::details][1]"));
  });

  await test.step("5. L'onglet Parcours : une ligne par année", async () => {
    await page.getByRole("tab", { name: "Parcours" }).click();
    const parcours = page.getByRole("tabpanel", { name: "Parcours" });
    await expect(parcours).toContainText("Entrée en 2025-2026. Le matricule IF-2025-0001 reste le même pendant toute la scolarité.");
    const lignes = parcours.getByRole("listitem");
    await expect(lignes).toHaveCount(2);
    await expect(lignes.nth(0)).toContainText("2026-2027");
    await expect(lignes.nth(0)).toContainText("2e année");
    await expect(lignes.nth(0)).toContainText("En cours");
    await expect(lignes.nth(1)).toContainText("2025-2026");
    await expect(lignes.nth(1)).toContainText("1re année");
    await expect(lignes.nth(1)).toContainText("Admis");
    await capture(page, DOSSIER, "UC05-03-05-parcours");
  });

  await test.step("6. « Imprimer le relevé » charge le PDF ; « Télécharger » enregistre releve-IF-2025-0001.pdf", async () => {
    const { nom } = await telechargerReleve(page, dossierTemporaire("uc05"));
    expect(nom).toBe("releve-IF-2025-0001.pdf");
    await imprimerReleve(page);
  });

  await test.step("7. « Encaisser 720 000 Ar » ouvre le guichet sur cet étudiant, les mois en retard cochés", async () => {
    await page.getByRole("tab", { name: "Écolage" }).click();
    await page.getByRole("region", { name: "Identité de l'étudiant" }).getByRole("link", { name: /^Encaisser 720\s000\sAr$/ }).click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await expect(page.getByText("RAKOTOMALALA Voahirana").first()).toBeVisible();
    await expect(page.getByText(/Reste à payer :\s*1\s620\s000\sAr, dont 720\s000\sAr en retard/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Novembre 2025,/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Connexion et synchronisation" })).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
    await page.setViewportSize({ width: 1440, height: 2500 });
    await capture(page, DOSSIER, "UC05-03-07-guichet");
  });
});
