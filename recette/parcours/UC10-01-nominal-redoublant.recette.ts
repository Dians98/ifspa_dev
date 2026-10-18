import {
  barreResume,
  caseEtudiant,
  choisirClasse,
  choisirDecision,
  decocher,
  DOSSIER_UC10 as DOSSIER,
  ETUDIANTS_IF as IF,
  ETUDIANTS_SF as SF,
  ligneEtudiant,
  lienClasse,
  ouvrirAdmissions,
} from "./aides-admissions";
import { capture, expect, SESSIONS, test } from "./outils";

test.use({ storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1300 } });

test("UC10-01 : la classe Infirmier(e)s 1re année passe en 2e année, un redoublant décoché", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Ouvrir Passage en année supérieure par le menu", async () => {
    await page.goto("/app/encaisser");
    await page.getByRole("link", { name: "Passage en année supérieure" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Passage en année supérieure" })).toBeVisible();
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(page.getByText("Fin de l'année 2025-2026 : décidez, classe par classe, qui passe en 2026-2027.")).toBeVisible();
    await expect(page.getByText("0 classe validée sur 2")).toBeVisible();
    await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("À faire");
    await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("4 étudiants");
    await expect(lienClasse(page, "Sage-femmes", "1re année")).toContainText("2 étudiants");
    await expect(lienClasse(page, "Infirmier(e)s", "2e année")).toContainText("Aucun étudiant");
    await capture(page, DOSSIER, "UC10-01-01-ecran-classes");
  });

  await test.step("2. La classe Infirmier(e)s 1re année : quatre étudiants, tous cochés", async () => {
    await expect(page.getByRole("heading", { level: 2, name: "Infirmier(e)s 1re année" })).toBeVisible();
    await expect(page.getByText("4 étudiants · passage en 2e année pour 2026-2027")).toBeVisible();
    await expect(page.getByTestId("ligne-etudiant")).toHaveText([
      /ANDRIANARISOA Tiana/,
      /RAKOTOMALALA Voahirana/,
      /RANDRIAMAHEFA Solofo/,
      /RASOANAIVO Fanja/,
    ]);
    for (const nom of Object.values(IF)) {
      await expect(caseEtudiant(page, nom)).toBeChecked();
      await expect(ligneEtudiant(page, nom)).toContainText("900 000 Ar en retard");
      await expect(ligneEtudiant(page, nom)).toContainText("Passe en 2e année");
    }
    await expect(barreResume(page)).toHaveText(/4 passent en 2e année/);
    await expect(page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" })).toBeVisible();
    await capture(page, DOSSIER, "UC10-01-02-classe-tous-coches");
  });

  await test.step("3. Décocher RANDRIAMAHEFA Solofo : il redouble par défaut", async () => {
    await decocher(page, IF.solofo);
    const ligne = ligneEtudiant(page, IF.solofo);
    await expect(ligne.getByRole("radio", { name: "Redouble" })).toBeChecked();
    await expect(ligne.getByRole("radio", { name: "Abandon" })).not.toBeChecked();
    await expect(barreResume(page)).toHaveText(/3 passent en 2e année\s*·\s*1 redouble/);
    await expect(page.getByRole("button", { name: "Ne passent pas (1)" })).toBeVisible();
    await capture(page, DOSSIER, "UC10-01-03-solofo-redouble");
    await choisirDecision(page, IF.solofo, "Abandon");
    await expect(barreResume(page)).toHaveText(/3 passent en 2e année\s*·\s*1 abandon/);
    await capture(page, DOSSIER, "UC10-01-03-solofo-abandon-essai");
    await choisirDecision(page, IF.solofo, "Redouble");
    await expect(barreResume(page)).toHaveText(/3 passent en 2e année\s*·\s*1 redouble/);
  });

  await test.step("4. Chercher un étudiant dans la classe", async () => {
    await page.getByRole("searchbox", { name: "Chercher un étudiant de la classe" }).fill("fanja");
    await expect(page.getByTestId("ligne-etudiant")).toHaveCount(1);
    await expect(ligneEtudiant(page, IF.fanja)).toBeVisible();
    await capture(page, DOSSIER, "UC10-01-04-recherche");
    await page.getByRole("searchbox", { name: "Chercher un étudiant de la classe" }).fill("zzz");
    await expect(page.getByText("Aucun étudiant de la classe ne correspond à « zzz ».")).toBeVisible();
    await page.getByRole("searchbox", { name: "Chercher un étudiant de la classe" }).fill("");
    await expect(page.getByTestId("ligne-etudiant")).toHaveCount(4);
  });

  await test.step("5. Filtre « Ne passent pas (1) »", async () => {
    await page.getByRole("button", { name: "Ne passent pas (1)" }).click();
    await expect(page.getByTestId("ligne-etudiant")).toHaveCount(1);
    await expect(ligneEtudiant(page, IF.solofo)).toBeVisible();
    await capture(page, DOSSIER, "UC10-01-05-filtre-ne-passent-pas");
    await page.getByRole("button", { name: "Tous (4)" }).click();
    await expect(page.getByTestId("ligne-etudiant")).toHaveCount(4);
  });

  await test.step("6. Confirmation nominative", async () => {
    await page.getByRole("button", { name: "Valider les Infirmier(e)s 1re année" }).click();
    const dialogue = page.getByRole("dialog", { name: "Valider le passage des Infirmier(e)s 1re année ?" });
    await expect(dialogue).toContainText("4 étudiants · de 2025-2026 vers 2026-2027");
    await expect(dialogue).toContainText("Ne passent pas (1)");
    await expect(dialogue.getByRole("list", { name: "Étudiants qui ne passent pas" })).toContainText("RANDRIAMAHEFA Solofo · IF-2025-0004");
    await expect(dialogue.getByRole("list", { name: "Étudiants qui ne passent pas" })).toContainText("Redouble");
    await expect(dialogue).toContainText("4 inscriptions 2026-2027 seront créées, avec leurs mensualités.");
    await expect(dialogue).toContainText("4 étudiants ont des impayés 2025-2026 : ils restent dus sur cette année.");
    await expect(dialogue).toContainText("L'administrateur peut annuler ce passage tant qu'aucun reçu n'existe sur les nouvelles inscriptions.");
    await capture(page, DOSSIER, "UC10-01-06-confirmation", dialogue);
  });

  await test.step("7. Valider : la classe passe à « Validée », l'écran passe à la classe suivante", async () => {
    const dialogue = page.getByRole("dialog", { name: "Valider le passage des Infirmier(e)s 1re année ?" });
    await dialogue.getByRole("button", { name: "Valider le passage de 4 étudiants" }).click();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText("1 classe validée sur 2")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Sage-femmes 1re année" })).toBeVisible();
    await expect(lienClasse(page, "Infirmier(e)s", "1re année")).toContainText("Validée");
    await expect(lienClasse(page, "Sage-femmes", "1re année")).toContainText("À faire");
    await expect(caseEtudiant(page, SF.mialy)).toBeChecked();
    await capture(page, DOSSIER, "UC10-01-07-apres-validation");
  });

  await test.step("8. Rouvrir la classe validée : liste figée, décisions lisibles", async () => {
    await choisirClasse(page, "Infirmier(e)s", "1re année");
    await expect(page.getByText(/Classe validée le .+ à .+ par Hanitra RAKOTO : 3 passent en 2e année/)).toBeVisible();
    await expect(page.getByText("Liste figée : 4 étudiants, dont 1 ne passe pas.")).toBeVisible();
    const decisions = page.getByRole("list", { name: "Décisions du passage" });
    await expect(decisions).toContainText("RANDRIAMAHEFA Solofo");
    await expect(decisions).toContainText("Redouble");
    await expect(page.getByRole("button", { name: "Annuler ce passage" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC10-01-08-classe-validee");
  });
});
