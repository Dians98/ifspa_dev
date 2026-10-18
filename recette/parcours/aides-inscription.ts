import { expect, type Page } from "@playwright/test";
import type { EtudiantRecette } from "./aides";

// Gestes d'UC04 : l'inscription pas à pas, sur une base fraîche (seed seul, sans la préparation 00).

export type Inscrit = Omit<EtudiantRecette, "annee" | "filiere"> & {
  /** KN : filière ajoutée par UC04-09 (Kinésithérapeutes). */
  filiere: "IF" | "SF" | "KN";
  niveau?: 1 | 2 | 3;
  tranches?: 1 | 2 | 3;
};

/** Étudiants d'UC04, inscrits dans cet ordre par les cas (d'où leurs matricules). */
export const INSCRITS = {
  voahirana: {
    nom: "RAKOTOMALALA",
    prenoms: "Voahirana",
    sexe: "Féminin",
    naissance: "2005-03-14",
    lieu: "Toamasina",
    telephone: "034 00 000 01",
    adresse: "Lot II B 12, Tanambao V, Toamasina",
    filiere: "IF",
    matricule: "IF-2026-0001",
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
    matricule: "IF-2026-0002",
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
    matricule: "SF-2026-0001",
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
    matricule: "IF-2026-0003",
    tranches: 3,
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
    matricule: "SF-2026-0002",
    tranches: 2,
  },
  solofo: {
    nom: "RANDRIAMAHEFA",
    prenoms: "Solofo",
    sexe: "Masculin",
    naissance: "2003-05-17",
    lieu: "Mahanoro",
    telephone: "034 00 000 06",
    adresse: "Lot 63, Ambohijafy, Toamasina",
    filiere: "IF",
    matricule: "IF-2026-0005",
    niveau: 2,
  },
  hasina: {
    nom: "RANAIVOSON",
    prenoms: "Hasina",
    sexe: "Masculin",
    naissance: "2005-12-03",
    lieu: "Toamasina",
    telephone: "034 00 000 09",
    adresse: "Lot 14, Ankirihiry, Toamasina",
    filiere: "KN",
    matricule: "KN-2026-0001",
  },
  haingo: {
    nom: "RAJAONARISON",
    prenoms: "Haingo",
    sexe: "Masculin",
    naissance: "2006-06-08",
    lieu: "Toamasina",
    telephone: "034 00 000 08",
    adresse: "Lot 31, Tanambao V, Toamasina",
    filiere: "IF",
    matricule: "IF-2026-0006",
  },
} as const satisfies Record<string, Inscrit>;

const NOM_FILIERE = { IF: /Infirmier\(e\)s/, SF: /Sage-femmes/, KN: /Kinésithérapeutes/ } as const;
const LIBELLE_NIVEAU = { 1: "1re année", 2: "2e année", 3: "3e année" } as const;

/** Remplit l'identité sans choisir la filière. */
export async function remplirIdentite(page: Page, e: Inscrit) {
  await page.getByLabel("Nom", { exact: true }).fill(e.nom);
  await page.getByLabel("Prénoms").fill(e.prenoms);
  await page.getByRole("radio", { name: e.sexe }).click();
  await page.getByLabel("Date de naissance").fill(e.naissance);
  await page.getByLabel("Lieu de naissance").fill(e.lieu);
  await page.getByLabel("Téléphone").fill(e.telephone);
  await page.getByLabel("Adresse").fill(e.adresse);
}

/** Ouvre le formulaire, le remplit jusqu'à la filière, le niveau et les tranches choisis ; ne l'envoie pas. */
export async function remplirInscription(page: Page, e: Inscrit) {
  await page.goto("/app/etudiants/nouveau");
  await expect(page.getByRole("heading", { level: 1, name: "Nouvel étudiant" })).toBeVisible();
  await remplirIdentite(page, e);
  await page.getByRole("radio", { name: NOM_FILIERE[e.filiere] }).click();
  if (e.niveau && e.niveau > 1) {
    await page.getByRole("combobox", { name: "Niveau" }).click();
    await page.getByRole("option", { name: new RegExp(`^${LIBELLE_NIVEAU[e.niveau]}`) }).click();
  }
  if (e.tranches && e.tranches > 1) await page.getByRole("radio", { name: `En ${e.tranches} fois` }).click();
}

/** Envoie le formulaire rempli ; rend la fiche ouverte, matricule attendu vérifié. */
export async function envoyerInscription(page: Page, e: Inscrit) {
  await page.getByRole("button", { name: "Inscrire l'étudiant" }).click();
  await page.waitForURL(/\/app\/etudiants\/[^/]+\?nouveau=1/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(e.nom);
  await expect(page.getByText(`Étudiant inscrit sous le matricule ${e.matricule}`)).toBeVisible();
}

export const recapitulatif = (page: Page) => page.getByRole("complementary", { name: "Récapitulatif" });
