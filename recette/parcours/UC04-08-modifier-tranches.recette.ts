import { boutonEncaisser, carte, montantRecu, recuEnregistre } from "./aides";
import { capture, expect, SESSIONS, test } from "./outils";

const DOSSIER = "UC04-inscrire";

test.use({ storageState: SESSIONS.secretariat });
test.use({ viewport: { width: 1440, height: 1500 } });

test("UC04-08 : redécouper les droits tant que rien n'est payé, plus après un paiement", async ({ page }) => {
  test.setTimeout(120_000);
  const grille = page.getByRole("listitem").filter({ hasText: "Reste" });
  const modifier = page.getByRole("button", { name: "Modifier le paiement des droits 2026-2027" });

  async function redecouper(n: 1 | 3) {
    await modifier.click();
    const dialogue = page.getByRole("dialog", { name: "Droits d'inscription 2026-2027" });
    await dialogue.getByRole("radio", { name: `En ${n} fois` }).click();
    await dialogue.getByRole("button", { name: `Payer les droits en ${n} fois` }).click();
    await expect(dialogue).toBeHidden();
  }

  await test.step("1. Ouvrir la fiche de ANDRIANARISOA Tiana (droits en 3 fois) puis « Modifier » les droits", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /ANDRIANARISOA Tiana/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ANDRIANARISOA Tiana");
    await expect(page.getByText("Droits payés en 3 fois")).toBeVisible();
    await expect(grille).toHaveCount(13);
    await modifier.click();
    const dialogue = page.getByRole("dialog", { name: "Droits d'inscription 2026-2027" });
    await expect(dialogue).toContainText("Choisissez en combien de fois les droits sont payés. Possible tant qu'aucun paiement n'a été enregistré dessus.");
    await expect(dialogue.getByRole("button", { name: "Choisissez un autre découpage" })).toBeDisabled();
    await capture(page, DOSSIER, "UC04-08-01-dialogue-droits", dialogue);
  });

  await test.step("2. Choisir « En 1 fois » : les droits redeviennent une seule échéance de 100 000 Ar", async () => {
    const dialogue = page.getByRole("dialog", { name: "Droits d'inscription 2026-2027" });
    await dialogue.getByRole("radio", { name: "En 1 fois" }).click();
    await dialogue.getByRole("button", { name: "Payer les droits en 1 fois" }).click();
    await expect(page.getByText("Droits 2026-2027 payables en une fois.")).toBeVisible();
    await expect(dialogue).toBeHidden();
    await expect(page.getByText("Droits payés en une fois")).toBeVisible();
    await expect(grille).toHaveCount(11);
    await expect(grille.filter({ hasText: "Droits d'inscription" })).toContainText(/100\s000\sAr/);
    await expect(page.getByText(/Reste à payer/).locator("xpath=..")).toContainText(/900\s000\sAr/);
    await capture(page, DOSSIER, "UC04-08-02-droits-en-1-fois");
  });

  await test.step("3. Revenir à « En 3 fois » : 34 000 + 33 000 + 33 000 Ar, 900 000 Ar au total", async () => {
    await redecouper(3);
    await expect(page.getByText("Droits payés en 3 fois")).toBeVisible();
    await expect(grille).toHaveCount(13);
    await expect(grille.filter({ hasText: "Droits — tranche 1/3" })).toContainText(/34\s000\sAr/);
    await expect(page.getByText(/Reste à payer/).locator("xpath=..")).toContainText(/900\s000\sAr/);
    await capture(page, DOSSIER, "UC04-08-03-retour-3-fois");
  });

  await test.step("4. Encaisser la tranche 1 (34 000 Ar) au guichet", async () => {
    await page.getByRole("main").getByRole("link", { name: "Encaisser", exact: true }).click();
    await page.waitForURL(/\/app\/encaisser\?etudiant=/);
    await carte(page, "Droits — tranche 1/3").click();
    await expect(montantRecu(page)).toHaveValue(/^34\s000$/);
    await boutonEncaisser(page, 34_000).click();
    await recuEnregistre(page);
  });

  await test.step("5. De retour sur la fiche : plus de bouton « Modifier » sur les droits, un motif à la place", async () => {
    await page.goto("/app/etudiants");
    await page.getByRole("link", { name: /ANDRIANARISOA Tiana/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ANDRIANARISOA Tiana");
    await expect(page.getByRole("tab", { name: /Paiements \(1\)/ })).toBeVisible();
    await expect(modifier).toHaveCount(0);
    await expect(grille.filter({ hasText: "Droits — tranche 1/3" })).toContainText("Payé");
    await capture(page, DOSSIER, "UC04-08-04-fiche-apres-paiement");
  });

  await test.step("6. L'icône d'information donne la raison du refus", async () => {
    await page.getByRole("button", { name: "Pourquoi certaines actions ne sont pas proposées" }).click();
    const motif = page.getByText(
      "Le paiement des droits ne peut plus être redécoupé : des paiements ont déjà été enregistrés sur cette année, même annulés.",
    );
    await expect(motif).toBeVisible();
    await capture(page, DOSSIER, "UC04-08-05-motif-refus");
  });
});
