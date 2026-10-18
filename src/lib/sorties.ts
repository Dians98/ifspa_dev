import { z } from "zod";
import type { StatutEtudiant } from "@/generated/prisma/enums";
import type { Sexe } from "@/generated/prisma/enums";
import { dateDuJour, formaterJour, lireJour, type Jour } from "@/lib/dates";
import { libelleStatutEtudiant } from "@/lib/etudiants";

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
  sexe?: Sexe | null;
  date: Jour;
  jour: Jour;
  borneDebut: Jour | null;
}): { message: string; champ?: "date" } | null {
  if (c.statutEtudiant !== "ACTIF") {
    const statut = libelleStatutEtudiant(c.statutEtudiant, c.sexe).toLowerCase();
    return {
      message:
        c.sexe === "F"
          ? `Cette étudiante n'est plus active (${statut}) : sa sortie est déjà enregistrée.`
          : `Cet étudiant n'est plus actif (${statut}) : sa sortie est déjà enregistrée.`,
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

/** Échéance telle que la fenêtre de sortie la reçoit : tout ce qu'il faut pour rejouer `echeancesNonDuesApresSortie`. */
export type EcheanceAvantSortie = {
  id: string;
  /** 1er du mois d'exigibilité, « 2026-10-01 » */
  mois: Jour;
  montantDu: number;
  paye: number;
  nonDueSortie: boolean;
  lignesNonAnnulees: number;
};

export type ApercuSortie = {
  /** Reste dû total, toutes années, une fois la sortie enregistrée à cette date. */
  resteApres: number;
  /** Échéances qui deviendront « Non due (sortie) ». */
  nonDues: { nombre: number; montant: number };
};

/** Effet d'une sortie à la date donnée, avant de l'enregistrer : même règle que l'action (décision n° 33). */
export function apercuSortie(echeances: readonly EcheanceAvantSortie[], date: Jour): ApercuSortie {
  const retirees = new Set(
    echeancesNonDuesApresSortie(
      echeances.map((e) => ({ ...e, mois: dateDuJour(e.mois) })),
      date,
    ),
  );
  let resteApres = 0;
  let montant = 0;
  for (const e of echeances) {
    if (e.nonDueSortie) continue;
    const reste = Math.max(0, e.montantDu - e.paye);
    if (retirees.has(e.id)) montant += reste;
    else resteApres += reste;
  }
  return { resteApres, nonDues: { nombre: retirees.size, montant } };
}

/** « 6 échéances ne seront plus dues (480 000 Ar) ; il restera 420 000 Ar à payer. » */
export function messageApercuSortie(a: ApercuSortie, formater: (n: number) => string): string {
  const n = a.nonDues.nombre;
  const effet =
    n === 0
      ? "Aucune échéance ne devient non due : tout reste dû"
      : `${n} échéance${n > 1 ? "s" : ""} ne ${n > 1 ? "seront" : "sera"} plus due${n > 1 ? "s" : ""} (${formater(a.nonDues.montant)})`;
  const reste = a.resteApres > 0 ? `il restera ${formater(a.resteApres)} à payer` : "il ne restera rien à payer";
  return `${effet} ; ${reste}.`;
}
