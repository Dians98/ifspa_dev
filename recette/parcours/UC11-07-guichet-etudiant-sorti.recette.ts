import { boutonEncaisser, choisirEtudiant, grandEcran, montantRecu, montantRegex, recuEnregistre, testPoste as test } from "./aides";
import { boutonSortie, cartesAnnee, DOSSIER_UC11 as DOSSIER, dontEnRetard, ouvrirFicheDe, resteAPayer, SECTION_H } from "./aides-sorties";
import { capture, expect } from "./outils";

const { hery } = SECTION_H;
const ENCAISSER_SANS_MONTANT = /^Encaisser( .*)? et imprimer le reçu$/;

// Après UC11-01 : Hery a abandonné, il doit encore les droits et octobre (180 000 Ar).
test("UC11-07 : un étudiant sorti reste encaissable au guichet tant qu'il doit", async ({ page }) => {
  test.setTimeout(120_000);

  await test.step("1. Secrétariat : Encaisser, chercher RAMAROSON : badge « Sorti · Abandon », 180 000 Ar à payer", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, hery);
    await expect(page.getByText("Hanitra RAKOTO", { exact: true })).toBeVisible();
    await expect(page.getByText(/Sorti · Abandon/).first()).toBeVisible();
    await expect(page.getByText(/Reste à payer :\s*180\s000\sAr/)).toBeVisible();
    await grandEcran(page, 1500);
    await capture(page, DOSSIER, "UC11-07-01-guichet-sorti");
  });

  await test.step("2. Seuls les droits et octobre sont proposés : aucune carte pour les mois « non dus »", async () => {
    await expect(page.getByRole("button", { name: /^Droits d'inscription,/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Octobre 2026,/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Novembre 2026,/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Juillet 2027,/ })).toHaveCount(0);
  });

  await test.step("3. 200 000 Ar : refusé, le trop-perçu se mesure sur ce qui est encore dû (180 000 Ar)", async () => {
    await montantRecu(page).fill("200000");
    await expect(montantRecu(page)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert").filter({ hasText: /dépasse ce que l'étudiant doit encore/ })).toContainText(
      /180\s000\sAr au plus, toutes années comprises/,
    );
    await expect(page.getByRole("button", { name: ENCAISSER_SANS_MONTANT })).toBeDisabled();
    await capture(page, DOSSIER, "UC11-07-03-trop-percu");
  });

  await test.step("4. 180 000 Ar : encaissé, l'étudiant sorti ne doit plus rien", async () => {
    await montantRecu(page).fill("180000");
    await expect(page.getByText("Ce paiement solde tout ce que l'étudiant doit.")).toBeVisible();
    await boutonEncaisser(page, 180_000).click();
    const r = await recuEnregistre(page);
    await expect(r.zone).toContainText(/180\s000\sAr · Espèces · RAMAROSON Hery\. Reste à payer : 0\sAr\./);
    await capture(page, DOSSIER, "UC11-07-04-encaisse");
  });

  await test.step("5. Sa fiche : « Rien à payer », plus de bouton Encaisser, le reçu est dans l'historique", async () => {
    await ouvrirFicheDe(page, hery.nom, hery.matricule);
    await expect(page.getByText(/Sorti · Abandon le \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await expect(resteAPayer(page)).toHaveText("Rien à payer");
    await expect(dontEnRetard(page)).toHaveText("Aucun retard");
    await expect(page.getByRole("region", { name: "Identité de l'étudiant" }).getByRole("link", { name: /^Encaisser/ })).toHaveCount(0);
    await expect(boutonSortie(page)).toHaveCount(0);
    const cartes = cartesAnnee(page, "Écolage 2026-2027 · 1re année");
    await expect(cartes.filter({ hasText: "Droits d'inscription" })).toContainText("Payé");
    await expect(cartes.filter({ hasText: "Octobre 2026" })).toContainText("Payé");
    await expect(cartes.filter({ hasText: "Non due (sortie)" })).toHaveCount(9);
    await expect(page.getByRole("tab", { name: "Paiements (1)" })).toBeVisible();
    await capture(page, DOSSIER, "UC11-07-05-fiche-soldee");
  });
});
