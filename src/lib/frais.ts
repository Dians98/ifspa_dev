import { z } from "zod";
import type { StatutEtudiant } from "@/generated/prisma/enums";
import { lireJour, type Jour } from "@/lib/dates";
import { libelleMois } from "@/lib/ecolage";
import { formaterAriary } from "@/lib/montant";
import { champMontant, DUREE_MAX, jourISO, NOMBRE_MOIS_ECOLAGE, NOMS_MOIS } from "@/lib/parametres";

// Frais en cours d'année (Paramètres › Frais, admin). Pur : ni base, ni horloge.

export const LIBELLE_FRAIS_MAX = 80;

/** Étudiants sortis : un nouveau frais ne leur est pas appliqué, ni à la création ni plus tard. */
export const STATUTS_SANS_NOUVEAU_FRAIS = ["ABANDON", "EXCLU", "DIPLOME"] as const satisfies readonly StatutEtudiant[];

const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };
const identifiant = (message: string) => z.string({ error: message }).min(1, message);

const champLibelle = z
  .string({ error: "Indiquez le libellé du frais." })
  .trim()
  .min(2, "Indiquez le libellé du frais (ex. Frais de stage).")
  .max(LIBELLE_FRAIS_MAX, `Libellé trop long (${LIBELLE_FRAIS_MAX} caractères maximum).`);

/** « 2027-03 » ou « 2027-03-01 » → « 2027-03-01 ». */
const champMois = z
  .string({ error: "Choisissez le mois d'exigibilité." })
  .regex(/^\d{4}-\d{2}(-01)?$/, "Choisissez le mois d'exigibilité.")
  .transform((v, ctx) => {
    const jour = v.length === 7 ? `${v}-01` : v;
    try {
      lireJour(jour);
      return jour;
    } catch {
      ctx.addIssue({ code: "custom", message: "Choisissez le mois d'exigibilité." });
      return z.NEVER;
    }
  });

const schemaClasse = z.object(
  {
    filiereId: identifiant("Filière introuvable. Rechargez la page."),
    niveau: z.number({ error: "Niveau invalide." }).int("Niveau invalide.").min(1, "Niveau invalide.").max(DUREE_MAX, "Niveau invalide."),
  },
  DONNEES_INVALIDES,
);
export type ClasseFrais = z.output<typeof schemaClasse>;

const champClasses = z
  .array(schemaClasse, { error: "Choisissez au moins une classe." })
  .min(1, "Choisissez au moins une classe.")
  .max(60, "Trop de classes en une fois.")
  .refine(
    (classes) => new Set(classes.map((c) => `${c.filiereId}:${c.niveau}`)).size === classes.length,
    "Une classe est choisie deux fois.",
  );

export const schemaApercuFrais = z.object(
  {
    anneeScolaireId: identifiant("Choisissez une année scolaire."),
    montant: champMontant,
    mois: champMois,
    classes: champClasses,
  },
  DONNEES_INVALIDES,
);
export type EntreeApercuFrais = z.input<typeof schemaApercuFrais>;

export const schemaCreationFrais = schemaApercuFrais.extend({ libelle: champLibelle });
export type EntreeCreationFrais = z.input<typeof schemaCreationFrais>;

/** Les classes d'un frais ne changent pas : on supprime et on recrée tant qu'il n'est pas payé. */
export const schemaModificationFrais = z.object(
  {
    id: identifiant("Frais introuvable. Rechargez la page."),
    libelle: champLibelle,
    montant: champMontant,
    mois: champMois,
  },
  DONNEES_INVALIDES,
);
export type EntreeModificationFrais = z.input<typeof schemaModificationFrais>;

export const schemaSuppressionFrais = z.object({ id: identifiant("Frais introuvable. Rechargez la page.") }, DONNEES_INVALIDES);
export type EntreeSuppressionFrais = z.input<typeof schemaSuppressionFrais>;

type AnneeFrais = { anneeDebut: number; moisDebutEcolage: number };

/** Les 10 mois de l'écolage de l'année (octobre à juillet par défaut), « 2026-10-01 ». */
export function moisDeLAnnee(annee: AnneeFrais): Jour[] {
  return Array.from({ length: NOMBRE_MOIS_ECOLAGE }, (_, i) =>
    jourISO(new Date(Date.UTC(annee.anneeDebut, annee.moisDebutEcolage - 1 + i, 1))),
  );
}

/** Mois proposables pour un frais : ceux de l'année scolaire, à partir du mois en cours. */
export function moisPossiblesFrais(annee: AnneeFrais, jour: Jour): { valeur: Jour; libelle: string }[] {
  const { annee: a, mois: m } = lireJour(jour);
  const courant = jourISO(new Date(Date.UTC(a, m - 1, 1)));
  return moisDeLAnnee(annee)
    .filter((v) => v >= courant)
    .map((v) => ({ valeur: v, libelle: libelleMois(new Date(`${v}T00:00:00Z`)) }));
}

/** Mois d'exigibilité refusé : hors de l'année scolaire, ou déjà passé. */
export function controleMoisFrais(mois: Jour, annee: AnneeFrais & { libelle: string }, jour: Jour): string | null {
  const mois10 = moisDeLAnnee(annee);
  if (!mois10.includes(mois)) {
    const debut = NOMS_MOIS[(annee.moisDebutEcolage - 1) % 12];
    const fin = NOMS_MOIS[(annee.moisDebutEcolage - 1 + NOMBRE_MOIS_ECOLAGE - 1) % 12];
    return `Choisissez un mois de l'année ${annee.libelle}, de ${debut} à ${fin}.`;
  }
  const { annee: a, mois: m } = lireJour(jour);
  if (mois < jourISO(new Date(Date.UTC(a, m - 1, 1)))) {
    return "Ce mois est déjà passé : choisissez le mois en cours ou un mois à venir.";
  }
  return null;
}

/** Rien ne se crée, ne se modifie ni ne se supprime sur une année clôturée. */
export function controleAnneeFrais(annee: { libelle: string; cloturee: boolean }): string | null {
  return annee.cloturee ? `L'année ${annee.libelle} est clôturée : ses frais ne se modifient plus.` : null;
}

/** Une ligne de paiement annulé compte aussi : elle référence les échéances du frais. */
export function controleModificationFrais(c: { lignesPaiement: number; montantOuMoisChange: boolean }): string | null {
  if (c.lignesPaiement > 0 && c.montantOuMoisChange) {
    return "Ce frais a déjà été payé, même en partie ou par un paiement annulé : seul son libellé peut encore changer.";
  }
  return null;
}

export function controleSuppressionFrais(lignesPaiement: number): string | null {
  if (lignesPaiement > 0) {
    return "Ce frais a déjà été payé, même en partie ou par un paiement annulé : il ne peut plus être supprimé.";
  }
  return null;
}

/** « 42 étudiants recevront 15 000 Ar, exigibles en mars 2027. » */
export function phraseRecapitulatifFrais(c: { nombre: number; montant: number; mois: Jour }): string {
  const mois = libelleMois(new Date(`${c.mois}T00:00:00Z`)).toLowerCase();
  if (c.nombre === 0) {
    return `Aucun étudiant n'est inscrit dans ces classes pour l'instant : ceux inscrits plus tard recevront ${formaterAriary(c.montant)}, exigibles en ${mois}.`;
  }
  const qui = c.nombre === 1 ? "1 étudiant recevra" : `${c.nombre} étudiants recevront`;
  return `${qui} ${formaterAriary(c.montant)}, exigibles en ${mois}.`;
}
