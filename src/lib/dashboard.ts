// Indicateurs du tableau de bord. Pur : les agrégats viennent de la base, le jour est déjà appliqué.

/** Sous ce taux (en %), l'indicateur s'affiche en orange. 85 % exactement n'est pas « bas ». */
export const SEUIL_TAUX_BAS = 85;

function controlerMontant(n: number, nom: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${nom} invalide : ${n} (entier positif attendu).`);
}

/**
 * Encaissé échu / attendu à date, en %, arrondi à 0,1. null si rien n'est échu.
 * `payeEchu` est déjà plafonné au dû de chaque échéance : il ne peut pas dépasser `duEchu`.
 */
export function tauxRecouvrement(payeEchu: number, duEchu: number): number | null {
  controlerMontant(payeEchu, "Encaissé échu");
  controlerMontant(duEchu, "Attendu à date");
  if (payeEchu > duEchu) throw new RangeError(`Encaissé échu (${payeEchu}) supérieur à l'attendu à date (${duEchu}).`);
  if (duEchu === 0) return null;
  // Calcul en entiers (pour mille) : évite les arrondis flottants du type 0,8455 × 100.
  return Math.round((payeEchu * 1000) / duEchu) / 10;
}

export function estTauxBas(taux: number | null): boolean {
  return taux !== null && taux < SEUIL_TAUX_BAS;
}

/** Sommes brutes d'une classe (filière × niveau) ou d'un regroupement. */
export type Agregat = {
  /** Inscriptions de l'année hors abandon et exclusion. */
  effectif: number;
  /** Dû des échéances échues (attendu à date). */
  attendu: number;
  /** Payé sur ces échéances, plafonné au dû de chacune. */
  encaisse: number;
  /** Étudiants de l'effectif ayant au moins une échéance échue non soldée. */
  enRetard: number;
};

export type AgregatCalcule = Agregat & {
  /** attendu − encaissé : reste dû sur l'échu. */
  reste: number;
  taux: number | null;
  tauxBas: boolean;
};

export function calculer(a: Agregat): AgregatCalcule {
  const taux = tauxRecouvrement(a.encaisse, a.attendu);
  return { ...a, reste: a.attendu - a.encaisse, taux, tauxBas: estTauxBas(taux) };
}

const AGREGAT_NUL: Agregat = { effectif: 0, attendu: 0, encaisse: 0, enRetard: 0 };

function additionner(a: Agregat, b: Agregat): Agregat {
  return {
    effectif: a.effectif + b.effectif,
    attendu: a.attendu + b.attendu,
    encaisse: a.encaisse + b.encaisse,
    enRetard: a.enRetard + b.enRetard,
  };
}

/**
 * Sous-totaux par filière (dans l'ordre de première apparition) et total général ; le taux est recalculé
 * sur les sommes, jamais moyenné. Les effectifs s'additionnent sans doublon : une seule inscription
 * par étudiant et par année, et un étudiant n'a qu'une filière.
 */
export function totaliser<L extends Agregat & { filiereId: string }>(
  lignes: readonly L[],
): { parFiliere: (AgregatCalcule & { filiereId: string })[]; total: AgregatCalcule } {
  const parFiliere = new Map<string, Agregat>();
  let total = AGREGAT_NUL;
  for (const l of lignes) {
    parFiliere.set(l.filiereId, additionner(parFiliere.get(l.filiereId) ?? AGREGAT_NUL, l));
    total = additionner(total, l);
  }
  return {
    parFiliere: [...parFiliere].map(([filiereId, a]) => ({ filiereId, ...calculer(a) })),
    total: calculer(total),
  };
}
