import {
  bandeau,
  boutonEncaisser,
  choisirEtudiant,
  ETUDIANTS,
  finImpression,
  impressions,
  logoAffiche,
  numeroDuTicket,
  ouvrirGuichetEnLigne,
  recharger,
  testPoste as test,
  ticketImprime,
} from "./aides";
import { capture, expect, SESSIONS } from "./outils";

const DOSSIER = "UC13-hors-ligne";
const E = ETUDIANTS.voahirana;

// Poste neuf : contrôle strict du logo, sans qu'un ticket ait été affiché en ligne avant la coupure.
// Même `test` que 01 à 08 : un autre les ferait passer après lui (Playwright groupe les fichiers par fixtures de worker).
test("UC13-09 : poste neuf, premier ticket sans Internet, le ticket porte le logo", async ({ browser }) => {
  test.setTimeout(150_000);
  const { baseURL } = test.info().project.use;
  const contexte = await browser.newContext({ baseURL, storageState: SESSIONS.secretariat, viewport: { width: 1440, height: 900 } });
  const page = await contexte.newPage();
  await page.addInitScript(() => {
    const fenetre = window as unknown as { __impressions: number };
    fenetre.__impressions = 0;
    window.print = () => {
      fenetre.__impressions += 1;
    };
  });

  let logoPresent = false;
  try {
    await test.step("1. Poste neuf : ouvrir Encaisser avec Internet", async () => {
      await ouvrirGuichetEnLigne(page);
      const cache = await page.evaluate(async () => {
        const noms = await caches.keys();
        const urls: string[] = [];
        for (const n of noms) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
        return urls;
      });
      console.log(`UC13-09 : logo du ticket dans le cache du poste : ${cache.includes("/brand/logo-ifspa.png") ? "oui" : "non"}.`);
      await capture(page, DOSSIER, "UC13-09-01-poste-neuf");
    });

    await test.step("2. Couper Internet, recharger, chercher l'étudiante", async () => {
      await contexte.setOffline(true);
      await recharger(page, "Hors ligne · vous pouvez continuer à encaisser");
      await choisirEtudiant(page, E);
      await expect(page.getByText(/Reste à payer :\s*720\s000\sAr/)).toBeVisible();
    });

    let numero = "";
    await test.step("3. Garder novembre 2025 seul et encaisser 80 000 Ar", async () => {
      await page.getByRole("button", { name: /^Décembre 2025,/ }).click();
      await expect(page.getByLabel("Montant reçu")).toHaveValue(/^80\s000$/);
      await boutonEncaisser(page, 80_000).click();
      numero = await numeroDuTicket(page);
      await expect.poll(() => impressions(page)).toBe(1);
      await capture(page, DOSSIER, "UC13-09-03-ticket-remis");
    });

    await test.step("4. Le ticket imprimé", async () => {
      const ticket = await ticketImprime(page, numero);
      await expect(ticket).toContainText("quatre-vingt mille ariary");
      await expect(ticket).toContainText(/Reste à payer\s*640\s000\sAr/);
      await capture(page, DOSSIER, "UC13-09-04-ticket-imprime", ticket);
      logoPresent = await logoAffiche(ticket);
      await finImpression(page);
    });

    await test.step("5. Internet revient : le paiement part", async () => {
      await contexte.setOffline(false);
      await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
      await expect(bandeau(page)).toContainText("1 paiement envoyé au serveur");
      await capture(page, DOSSIER, "UC13-09-05-synchronise", bandeau(page));
    });
  } finally {
    await contexte.close();
  }

  expect(logoPresent, "Le logo du ticket doit s'afficher même sur un poste qui n'a jamais imprimé en ligne.").toBe(true);
});
