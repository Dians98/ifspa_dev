import { z } from "zod";
import type { StatutEtudiant } from "@/generated/prisma/enums";
import { formaterJour, lireJour, type Jour } from "@/lib/dates";
import { LIBELLE_STATUT_ETUDIANT } from "@/lib/etudiants";

// Sortie d'un étudiant en cours d'année (abandon, exclusion). Pur : le jour est injecté.

const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };

export const TYPES_SORTIE = ["ABANDON", "EXCLU"] as const;
export type TypeSortie = (typeof TYPES_SORTIE)[number];

export const LIBELLE_TYPE_SORTIE: Record<TypeSortie, string> = { ABANDON: "Abandon", EXCLU: "Exclusion" };

export const schemaSortie = z.object(
  {
    etudiantId: z.string({ error: "Étudiant introuvable. Rechargez la page." }).min(1, "Étudiant introuvable. Rechargez la page.").max(40),
    type: z.enum(TYPES_SORTIE, "Choisissez le type de sortie : abandon ou exclusion."),
    date: z
      .string({ error: "Indiquez la date de sortie." })
      .trim()
      .refine((v) => {
        try {
          lireJour(v);
          return true;
        } catch {
          return false;
        }
      }, "Indiquez une date de sortie valide."),
    motif: z
      .string({ error: "Indiquez le motif de la sortie." })
      .trim()
      .min(3, "Indiquez le motif de la sortie (3 caractères au moins).")
      .max(500, "Motif trop long (500 caractères maximum)."),
  },
  DONNEES_INVALIDES,
);
export type EntreeSortie = z.input<typeof schemaSortie>;

/**
 * Plus petite date de sortie acceptée : début de l'année de l'inscription en cours ; si cette année n'a pas
 * encore commencé (passage déjà fait pour la rentrée), début de la dernière année commencée. null : pas de borne.
 */
export function borneDebutSortie(
  inscriptions: readonly { enCours: boolean; debut: Jour }[],
  jour: Jour,
): Jour | null {
  const enCours = inscriptions.filter((i) => i.enCours).map((i) => i.debut).sort();
  const debutEnCours = enCours[0];
  if (debutEnCours && debutEnCours <= jour) return debutEnCours;
  const commencees = inscriptions.map((i) => i.debut).filter((d) => d <= jour).sort();
  return commencees.at(-1) ?? debutEnCours ?? null;
}

export function controleSortie(c: {
  statutEtudiant: StatutEtudiant;
  date: Jour;
  jour: Jour;
  borneDebut: Jour | null;
}): { message: string; champ?: "date" } | null {
  if (c.statutEtudiant !== "ACTIF") {
    return {
      message: `Cet étudiant n'est plus actif (${LIBELLE_STATUT_ETUDIANT[c.statutEtudiant].toLowerCase()}) : sa sortie est déjà enregistrée.`,
    };
  }
  lireJour(c.date);
  if (c.date > c.jour) return { message: "La date de sortie ne peut pas être dans le futur.", champ: "date" };
  if (c.borneDebut && c.date < c.borneDebut) {
    return {
      message: `La date de sortie ne peut pas précéder le début de son année en cours (${formaterJour(c.borneDebut)}).`,
      champ: "date",
    };
  }
  return null;
}

/**
 * Échéances qui ne seront plus dues : mois strictement postérieur au mois de sortie, et aucune ligne de
 * paiement non annulé dessus. Le mois de sortie et ce qui est échu restent dus.
 */
export function echeancesNonDuesApresSortie(
  echeances: readonly { id: string; mois: Date; nonDueSortie: boolean; lignesNonAnnulees: number }[],
  date: Jour,
): string[] {
  const { annee, mois } = lireJour(date);
  const indexSortie = annee * 12 + (mois - 1);
  return echeances
    .filter((e) => !e.nonDueSortie && e.lignesNonAnnulees === 0)
    .filter((e) => e.mois.getUTCFullYear() * 12 + e.mois.getUTCMonth() > indexSortie)
    .map((e) => e.id);
}
