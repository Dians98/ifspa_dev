import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { SESSIONS, test as testDeBase } from "./outils";

// Gestes partagés par les parcours de recette. Tout passe par l'interface, jamais par la base.

export type EtudiantRecette = {
  nom: string;
  prenoms: string;
  sexe: "Féminin" | "Masculin";
  naissance: string;
  lieu: string;
  telephone: string;
  adresse: string;
  /** Code de filière : IF (Infirmier(e)s) ou SF (Sage-femmes). */
  filiere: "IF" | "SF";
  /** Année scolaire dans laquelle il est inscrit (l'année courante au moment de l'inscription). */
  annee: "2025-2026" | "2026-2027";
  matricule: string;
};

/** Étudiants communs aux scénarios, inscrits par 00-preparation dans cet ordre (d'où leurs matricules). */
export const ETUDIANTS = {
  voahirana: {
    nom: "RAKOTOMALALA",
    prenoms: "Voahirana",
    sexe: "Féminin",
    naissance: "2005-03-14",
    lieu: "Toamasina",
    telephone: "034 00 000 01",
    adresse: "Lot II B 12, Tanambao V, Toamasina",
    filiere: "IF",
    annee: "2025-2026",
    matricule: "IF-2025-0001",
  },
  fanja: {
    nom: "RASOANAIVO",
    prenoms: "Fanja",
    sexe: "Féminin",
    naissance: "2004-11-02",
    lieu: "Brickaville",
    telephone: "034 00 000 02",
    adresse: "Lot 45, Ampasimazava, Toamasina",
    filiere: "IF",
    annee: "2025-2026",
    matricule: "IF-2025-0002",
  },
  tiana: {
    nom: "ANDRIANARISOA",
    prenoms: "Tiana",
    sexe: "Masculin",
    naissance: "2005-07-21",
    lieu: "Fenerive-Est",
    telephone: "034 00 000 03",
    adresse: "Lot 8, Morarano, Toamasina",
    filiere: "IF",
    annee: "2025-2026",
    matricule: "IF-2025-0003",
  },
  mialy: {
    nom: "RAZAFINDRAKOTO",
    prenoms: "Mialy",
    sexe: "Féminin",
    naissance: "2005-01-30",
    lieu: "Toamasina",
    telephone: "034 00 000 04",
    adresse: "Lot 102, Ankirihiry, Toamasina",
    filiere: "SF",
    annee: "2025-2026",
    matricule: "SF-2025-0001",
  },
  lalaina: {
    nom: "RABEMANANJARA",
    prenoms: "Lalaina",
    sexe: "Féminin",
    naissance: "2004-09-09",
    lieu: "Vatomandry",
    telephone: "034 00 000 05",
    adresse: "Lot 27, Tanambao II, Toamasina",
    filiere: "SF",
    annee: "2025-2026",
    matricule: "SF-2025-0002",
  },
  solofo: {
    nom: "RANDRIAMAHEFA",
    prenoms: "Solofo",
    sexe: "Masculin",
    naissance: "2005-05-17",
    lieu: "Mahanoro",
    telephone: "034 00 000 06",
    adresse: "Lot 63, Ambohijafy, Toamasina",
    filiere: "IF",
    annee: "2025-2026",
    matricule: "IF-2025-0004",
  },
  nirina: {
    nom: "RAKOTOARISOA",
    prenoms: "Nirina",
    sexe: "Masculin",
    naissance: "2006-02-11",
    lieu: "Toamasina",
    telephone: "034 00 000 07",
    adresse: "Lot 19, Ampasimazava, Toamasina",
    filiere: "IF",
    annee: "2026-2027",
    matricule: "IF-2026-0001",
  },
} as const satisfies Record<string, EtudiantRecette>;

const NOM_FILIERE = { IF: /Infirmier\(e\)s/, SF: /Sage-femmes/ } as const;

/** Remplit le formulaire d'inscription et l'envoie ; rend la fiche ouverte (matricule attendu vérifié). */
export async function inscrire(page: Page, e: EtudiantRecette, avantEnvoi?: () => Promise<void>) {
  await page.goto("/app/etudiants/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill(e.nom);
  await page.getByLabel("Prénoms").fill(e.prenoms);
  await page.getByRole("radio", { name: e.sexe }).click();
  await page.getByLabel("Date de naissance").fill(e.naissance);
  await page.getByLabel("Lieu de naissance").fill(e.lieu);
  await page.getByLabel("Téléphone").fill(e.telephone);
  await page.getByLabel("Adresse").fill(e.adresse);
  await page.getByRole("radio", { name: NOM_FILIERE[e.filiere] }).click();
  await expect(page.getByText("Matricule (indicatif)")).toBeVisible();
  await expect(page.getByText(e.matricule, { exact: true }).first()).toBeVisible();
  if (avantEnvoi) await avantEnvoi();
  await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();
  await page.waitForURL(/\/app\/etudiants\/[^/]+\?nouveau=1/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(e.nom);
  await expect(page.getByText(e.matricule, { exact: true }).first()).toBeVisible();
}

/** « 160 000 Ar » : les montants s'affichent avec des espaces insécables (fines ou non) selon l'endroit. */
export function montantRegex(montant: number): RegExp {
  const groupes = String(montant).replace(/[\s  ]/g, "");
  const avecEspaces = groupes.replace(/\B(?=(\d{3})+(?!\d))/g, "\\s");
  return new RegExp(`${avecEspaces}\\sAr`);
}

// UC13 : le guichet sans Internet

/** Un seul navigateur pour tout UC13, comme le poste du guichet : mêmes blocs de numéros, même file, même copie locale. */
export const testPoste = testDeBase.extend<object, { poste: BrowserContext }>({
  poste: [
    async ({ browser }, fournir, workerInfo) => {
      const { baseURL, viewport, locale, timezoneId, isMobile, hasTouch, userAgent, deviceScaleFactor } = workerInfo.project.use;
      const contexte = await browser.newContext({
        baseURL,
        viewport,
        locale,
        timezoneId,
        isMobile,
        hasTouch,
        userAgent,
        deviceScaleFactor,
        storageState: SESSIONS.secretariat,
      });
      await fournir(contexte);
      await contexte.close();
    },
    { scope: "worker" },
  ],
  page: async ({ poste }, fournir) => {
    const page = await poste.newPage();
    await page.addInitScript(() => {
      const fenetre = window as unknown as { __impressions: number };
      fenetre.__impressions = 0;
      window.print = () => {
        fenetre.__impressions += 1;
      };
    });
    await fournir(page);
    // Le poste ne doit jamais rester coupé pour le cas suivant.
    await poste.setOffline(false);
    await page.close();
  },
});

export const bandeau = (page: Page): Locator => page.getByRole("region", { name: "Connexion et synchronisation" });

/** Écran haut : la capture pleine page ne déforme pas la barre latérale collante. */
export const grandEcran = (page: Page, hauteur = 1500) => page.setViewportSize({ width: 1440, height: hauteur });

/** Ouvre Encaisser avec Internet, attend la pastille verte et que le service worker contrôle la page. */
export async function ouvrirGuichetEnLigne(page: Page) {
  await page.goto("/app/encaisser");
  await expect(bandeau(page)).toContainText("En ligne · tout est synchronisé", { timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);
}

export async function recharger(page: Page, attendu: string) {
  await page.reload();
  await expect(bandeau(page)).toContainText(attendu, { timeout: 20_000 });
}

/** Tape le nom, valide avec Entrée ; la situation de l'étudiant s'affiche. */
export async function choisirEtudiant(page: Page, e: { nom: string }) {
  const recherche = page.getByRole("combobox", { name: /Rechercher l'étudiant/ });
  await recherche.fill(e.nom);
  await expect(page.getByRole("option", { name: new RegExp(e.nom) })).toBeVisible();
  await recherche.press("Enter");
  await expect(page.getByText(/Reste à payer :/)).toBeVisible();
}

export function boutonEncaisser(page: Page, montant: number): Locator {
  const groupes = String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s");
  return page.getByRole("button", { name: new RegExp(`^Encaisser ${groupes}\\sAr et imprimer le reçu$`) });
}

export async function numeroDuTicket(page: Page): Promise<string> {
  const succes = page.getByRole("status").filter({ hasText: /Ticket R-\d{4}-\d{5} remis/ });
  await expect(succes).toBeVisible();
  return (await succes.textContent())?.match(/R-\d{4}-\d{5}/)?.[0] ?? "";
}

export const impressions = (page: Page) => page.evaluate(() => (window as unknown as { __impressions: number }).__impressions);

/** Montre ce qui sort de l'imprimante : le ticket (sans son double, toujours imprimé après lui), en média « impression ». */
export async function ticketImprime(page: Page, numero: string): Promise<Locator> {
  await page.emulateMedia({ media: "print" });
  const ticket = page.getByRole("article", { name: new RegExp(`^Reçu ${numero}(, annulé)?$`) });
  await expect(ticket).toBeVisible();
  return ticket;
}

export const finImpression = (page: Page) => page.emulateMedia({ media: null });

/** Le logo du ticket est chargé (une image absente du cache hors ligne reste cassée, largeur naturelle nulle). */
export async function logoAffiche(ticket: Locator): Promise<boolean> {
  return ticket.locator("img").evaluate((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0);
}

// UC06 : le guichet avec Internet

/** Le message de succès en ligne : « Paiement enregistré : reçu R-2026-00021. » */
export async function recuEnregistre(page: Page): Promise<{ numero: string; zone: Locator }> {
  const zone = page.getByRole("status").filter({ hasText: /Paiement enregistré : reçu R-\d{4}-\d{5}/ });
  await expect(zone).toBeVisible();
  return { numero: (await zone.textContent())?.match(/R-\d{4}-\d{5}/)?.[0] ?? "", zone };
}

export const montantRecu = (page: Page): Locator => page.getByLabel("Montant reçu");

/** Carte d'échéance du guichet, par son libellé (« Octobre 2025 », « Droits d'inscription »). */
export const carte = (page: Page, libelle: string): Locator =>
  page.getByRole("button", { name: new RegExp(`^${libelle.replace(/[()]/g, "\$&")},`) });
