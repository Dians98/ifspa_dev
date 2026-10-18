import { choisirEtudiant, grandEcran } from "./aides";
import { envoyerInscription, INSCRITS, recapitulatif, remplirInscription } from "./aides-inscription";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";
const { voahirana, fanja, mialy } = INSCRITS;

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1300 } });

test("UC04-01 : trois inscriptions, une séquence de matricule par filière", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. La liste des étudiants est vide, puis ouvrir « Nouvel étudiant »", async () => {
    await page.goto("/app/etudiants");
    await expect(page.getByRole("heading", { level: 1, name: "Étudiants" })).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO")).toBeVisible();
    await capture(page, DOSSIER, "UC04-01-01-liste-vide");
    await page.getByRole("link", { name: "Nouvel étudiant" }).first().click();
    await page.waitForURL("**/app/etudiants/nouveau");
    await expect(page.getByText("Choisissez une filière", { exact: true })).toBeVisible();
    await capture(page, DOSSIER, "UC04-01-02-formulaire-vierge");
  });

  await test.step("2. Remplir RAKOTOMALALA Voahirana en Infirmier(e)s : le récapitulatif annonce IF-2026-0001", async () => {
    await remplirInscription(page, voahirana);
    await expect(recapitulatif(page)).toContainText("Matricule (indicatif)");
    await expect(recapitulatif(page)).toContainText("IF-2026-0001");
    await expect(recapitulatif(page)).toContainText("Écolage 2026-2027");
    await expect(recapitulatif(page)).toContainText(/Droits d'inscription\s*· octobre\s*100\s000\sAr/);
    await expect(recapitulatif(page)).toContainText(/10 mensualités de\s*80\s000\sAr/);
    await expect(recapitulatif(page)).toContainText(/Total de l'année\s*900\s000\sAr/);
    await capture(page, DOSSIER, "UC04-01-03-formulaire-rempli");
  });

  await test.step("3. Inscrire l'étudiante : la fiche s'ouvre, 900 000 Ar à payer, aucun retard", async () => {
    await envoyerInscription(page, voahirana);
    await expect(page.getByText("Aucun retard")).toBeVisible();
    await expect(page.getByText(/900\s000\sAr/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Écolage 2026-2027 · 1re année" })).toBeVisible();
    await capture(page, DOSSIER, "UC04-01-04-fiche-if-0001");
  });

  await test.step("4. Les 11 échéances : droits en octobre puis 10 mensualités d'octobre 2026 à juillet 2027", async () => {
    const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
    await expect(grille).toHaveCount(11);
    const mois = ["Octobre 2026", "Novembre 2026", "Décembre 2026", "Janvier 2027", "Février 2027", "Mars 2027", "Avril 2027", "Mai 2027", "Juin 2027", "Juillet 2027"];
    for (const m of mois) await expect(grille.filter({ hasText: m })).toHaveCount(1);
    await expect(grille.filter({ hasText: "Droits d'inscription" })).toHaveCount(1);
    await expect(grille.filter({ hasText: /80\s000\sAr/ })).toHaveCount(10);
    await capture(page, DOSSIER, "UC04-01-05-grille-echeances", page.getByRole("heading", { name: "Écolage 2026-2027 · 1re année" }).locator("xpath=ancestor::section[1]"));
  });

  await test.step("5. Inscrire RASOANAIVO Fanja (IF) : IF-2026-0002", async () => {
    await remplirInscription(page, fanja);
    await expect(recapitulatif(page)).toContainText("IF-2026-0002");
    await capture(page, DOSSIER, "UC04-01-06-formulaire-if-0002");
    await envoyerInscription(page, fanja);
  });

  await test.step("6. Inscrire RAZAFINDRAKOTO Mialy (SF) : la séquence des Sage-femmes repart à SF-2026-0001", async () => {
    await remplirInscription(page, mialy);
    await expect(recapitulatif(page)).toContainText("SF-2026-0001");
    await capture(page, DOSSIER, "UC04-01-07-formulaire-sf");
    await envoyerInscription(page, mialy);
    await capture(page, DOSSIER, "UC04-01-08-fiche-sf-0001");
  });

  await test.step("7. La liste des étudiants montre les trois matricules", async () => {
    await page.goto("/app/etudiants");
    for (const e of [voahirana, fanja, mialy]) await expect(page.getByText(e.matricule, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/3 étudiants/).first()).toBeVisible();
    await capture(page, DOSSIER, "UC04-01-09-liste-trois");
  });

  await test.step("8. Au guichet, l'étudiante inscrite apparaît avec 900 000 Ar à payer", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, voahirana);
    await expect(page.getByText(/Reste à payer :/)).toContainText(/900\s000\sAr/);
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC04-01-10-guichet");
  });
});
