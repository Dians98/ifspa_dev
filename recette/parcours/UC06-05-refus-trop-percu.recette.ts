import {
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  grandEcran,
  impressions,
  montantRecu,
  recuEnregistre,
  testPoste as test,
} from "./aides";
import { capture, expect } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.solofo;
const ENCAISSER_SANS_MONTANT = /^Encaisser( .*)? et imprimer le reçu$/;

test("UC06-05 : un montant au-delà de ce que l'étudiant doit, ou nul, est refusé", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("1. L'étudiant doit 1 800 000 Ar sur deux années", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, E);
    await expect(page.getByText(/Reste à payer :\s*1\s800\s000\sAr, dont 900\s000\sAr en retard/)).toBeVisible();
  });

  await test.step("2. Saisir 2 000 000 Ar : refusé", async () => {
    await montantRecu(page).fill("2000000");
    await expect(montantRecu(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert").filter({ hasText: /dépasse ce que l'étudiant doit encore/ })).toContainText(
      /1\s800\s000\sAr au plus, toutes années comprises/,
    );
    await expect(page.getByRole("button", { name: ENCAISSER_SANS_MONTANT })).toBeDisabled();
    await expect(page.getByText("Corrigez le montant reçu pour encaisser.")).toBeVisible();
    await grandEcran(page, 2500);
    await capture(page, DOSSIER, "UC06-05-02-trop-percu");
    await grandEcran(page, 900);
  });

  await test.step("3. Saisir 0 : refusé", async () => {
    await montantRecu(page).fill("0");
    await expect(montantRecu(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: ENCAISSER_SANS_MONTANT })).toBeDisabled();
    await expect(page.getByText("Le montant doit être supérieur à 0.")).toBeVisible();
    await grandEcran(page, 2500);
    await capture(page, DOSSIER, "UC06-05-03-montant-nul");
    await grandEcran(page, 900);
  });

  await test.step("4. Rien n'a été enregistré", async () => {
    expect(await impressions(page)).toBe(0);
    await expect(page.getByRole("status").filter({ hasText: /Paiement enregistré/ })).toHaveCount(0);
  });

  await test.step("5. Exactement 1 800 000 Ar : accepté, l'étudiant ne doit plus rien", async () => {
    await montantRecu(page).fill("1800000");
    await expect(page.getByText("Ce paiement solde tout ce que l'étudiant doit.")).toBeVisible();
    await boutonEncaisser(page, 1_800_000).click();
    const r = await recuEnregistre(page);
    await expect(r.zone).toContainText(/1\s800\s000\sAr · Espèces · RANDRIAMAHEFA Solofo\. Reste à payer : 0\sAr\./);
    await capture(page, DOSSIER, "UC06-05-05-solde-accepte");
  });
});
