import {
  bandeau,
  boutonEncaisser,
  carte,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  grandEcran,
  impressions,
  montantRecu,
  recuEnregistre,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect, SESSIONS } from "./outils";

const DOSSIER = "UC06-encaisser";
const E = ETUDIANTS.tiana;
const MESSAGE = "La situation de l'étudiant a changé (paiement saisi sur un autre poste). Vérifiez avant d'encaisser.";

test("UC06-07 : un autre poste a encaissé entre-temps, le second paiement est refusé (décision provisoire n° 22)", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { baseURL } = test.info().project.use;

  await test.step("1. Poste 1 : l'étudiant est ouvert, 180 000 Ar prêts à encaisser", async () => {
    await page.goto("/app/encaisser");
    await choisirEtudiant(page, E);
    await carte(page, "Novembre 2025").click();
    await expect(montantRecu(page)).toHaveValue(/^180\s000$/);
    await expect(page.getByText(/Reste à payer :\s*1\s800\s000\sAr/)).toBeVisible();
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-07-01-poste1-pret");
    await grandEcran(page, 900);
  });

  await test.step("2. Poste 2 : le même étudiant paie les mêmes mois", async () => {
    const poste2 = await browser.newContext({ baseURL, storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 1900 } });
    try {
      const p2 = await poste2.newPage();
      await p2.addInitScript(() => {
        window.print = () => {};
      });
      await p2.goto("/app/encaisser");
      await choisirEtudiant(p2, E);
      await carte(p2, "Novembre 2025").click();
      await boutonEncaisser(p2, 180_000).click();
      const r = await recuEnregistre(p2);
      await expect(r.zone).toContainText(/180\s000\sAr · Espèces · ANDRIANARISOA Tiana\. Reste à payer : 1\s620\s000\sAr\./);
      await capture(p2, DOSSIER, "UC06-07-02-poste2-enregistre");
    } finally {
      await poste2.close();
    }
  });

  await test.step("3. Poste 1 : « Encaisser » est refusé, la situation est rechargée", async () => {
    await boutonEncaisser(page, 180_000).click();
    const alerte = page.getByRole("alert").filter({ hasText: MESSAGE });
    await expect(alerte).toBeVisible();
    await expect(alerte).toContainText("La liste ci-dessous vient d'être mise à jour.");
    await expect(page.getByText(/Reste à payer :\s*1\s620\s000\sAr, dont 720\s000\sAr en retard/)).toBeVisible();
    await expect(carte(page, "Droits d'inscription")).toHaveCount(1);
    expect(await impressions(page)).toBe(0);
    await expect(page.getByRole("status").filter({ hasText: /Paiement enregistré/ })).toHaveCount(0);
    await grandEcran(page, 1900);
    await capture(page, DOSSIER, "UC06-07-03-poste1-refuse");
    await grandEcran(page, 900);
  });

  let numero = "";
  await test.step("4. Poste 1 : après vérification, novembre et décembre sont encaissés", async () => {
    await expect(page.getByText(/Reste à payer :\s*1\s620\s000\sAr/)).toBeVisible();
    await carte(page, "Janvier 2026").click();
    await expect(montantRecu(page)).toHaveValue(/^160\s000$/);
    await boutonEncaisser(page, 160_000).click();
    const r = await recuEnregistre(page);
    numero = r.numero;
    await expect(r.zone).toContainText(/Reste à payer : 1\s460\s000\sAr\./);
    const ticket = await ticketImprime(page, numero);
    await expect(ticket).toContainText("Novembre 2025");
    await expect(ticket).toContainText("Décembre 2025");
    await finImpression(page);
    await expect(bandeau(page)).toContainText("En ligne");
  });

  await test.step("5. Paiements : deux reçus pour cet étudiant, pas de troisième", async () => {
    await page.goto("/app/paiements");
    await expect(page.getByRole("row").filter({ hasText: E.nom })).toHaveCount(2);
    await expect(page.getByRole("row").filter({ hasText: E.nom }).filter({ hasText: "À vérifier" })).toHaveCount(0);
    await capture(page, DOSSIER, "UC06-07-05-paiements");
  });
});
