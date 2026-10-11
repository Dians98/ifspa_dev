import { z } from "zod";
import {
  DecisionAdmission,
  type StatutEtudiant,
  type StatutInscription,
} from "@/generated/prisma/enums";
import { dateDuJour, formaterJour, type Jour } from "@/lib/dates";
import { controleTranches, genererEcheances, type EcheanceGeneree, type TarifEcheances } from "@/lib/ecolage";
import { DUREE_MAX, libelleAnnee, libelleNiveau } from "@/lib/parametres";

// Passage en année supérieure, par classe (filière × niveau). Pur : ni base, ni horloge (jour injecté).

const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };

export const MESSAGE_CLASSE_CHANGEE =
  "La liste des étudiants de cette classe a changé depuis l'affichage : rechargez la page.";

/** Formulé pour les deux rôles : l'écran ajoute le lien vers les tarifs pour l'administrateur. */
export const MESSAGE_TARIFS = "il se saisit dans Paramètres › Tarifs (administrateur).";

export type AnneePassage = {
  id: string;
  libelle: string;
  anneeDebut: number;
  moisDebutEcolage: number;
  estCourante: boolean;
  cloturee: boolean;
};

export type AnneesPassage = {
  source: AnneePassage | null;
  cible: AnneePassage | null;
  /** « 2027-2028 », même si l'année n'existe pas encore ; null sans source. */
  libelleCible: string | null;
  /** Passage impossible sur toute l'école (pas d'année courante, cible absente ou clôturée…), sinon null. */
  refus: string | null;
};

/**
 * Source : la plus ancienne année non clôturée, jusqu'à la courante, qui a encore des inscriptions en cours
 * d'étudiants actifs ; sinon la courante. Cible : l'année qui suit, jamais créée ici.
 * `enCoursParAnnee` : nombre d'inscriptions EN_COURS d'étudiants ACTIF, par id d'année.
 */
export function anneesDuPassage(
  annees: readonly AnneePassage[],
  enCoursParAnnee: ReadonlyMap<string, number>,
): AnneesPassage {
  const courante = annees.find((a) => a.estCourante);
  if (!courante) {
    return {
      source: null,
      cible: null,
      libelleCible: null,
      refus: "Aucune année scolaire courante : l'administrateur la définit dans Paramètres › Années scolaires.",
    };
  }
  const candidates = annees
    .filter((a) => !a.cloturee && a.anneeDebut <= courante.anneeDebut && (enCoursParAnnee.get(a.id) ?? 0) > 0)
    .sort((a, b) => a.anneeDebut - b.anneeDebut);
  const source = candidates[0] ?? courante;
  const libelleCible = libelleAnnee(source.anneeDebut + 1);
  const cible = annees.find((a) => a.anneeDebut === source.anneeDebut + 1) ?? null;

  let refus: string | null = null;
  if (source.cloturee) {
    refus = `L'année ${source.libelle} est clôturée : son passage ne peut plus être fait, sauf réouverture par l'administrateur dans Paramètres › Années scolaires.`;
  } else if (!cible) {
    refus = `L'année ${libelleCible} n'existe pas encore : l'administrateur la crée, avec ses tarifs, dans Paramètres › Années scolaires.`;
  } else if (cible.cloturee) {
    refus = `L'année ${cible.libelle} est clôturée : aucune inscription n'y est possible, sauf réouverture par l'administrateur dans Paramètres › Années scolaires.`;
  }
  return { source, cible, libelleCible, refus };
}

export function estDerniereAnnee(niveau: number, dureeAnnees: number): boolean {
  return niveau >= dureeAnnees;
}

/** Décision par défaut en tête : la case cochée (« Passe en 2e année », ou « Diplômé(e) » en dernière année). */
export function decisionsPossibles(niveau: number, dureeAnnees: number): DecisionAdmission[] {
  return [estDerniereAnnee(niveau, dureeAnnees) ? "DIPLOME" : "ADMIS", "REDOUBLANT", "ABANDON"];
}

export function libelleDecision(decision: DecisionAdmission, niveau: number): string {
  switch (decision) {
    case "ADMIS":
      return `Passe en ${libelleNiveau(niveau + 1)}`;
    case "DIPLOME":
      return "Diplômé(e)";
    case "REDOUBLANT":
      return "Redouble";
    case "ABANDON":
      return "Abandon";
  }
}

/** « Infirmier(e)s 1re année » */
export function libelleClasse(filiereNom: string, niveau: number): string {
  return `${filiereNom} ${libelleNiveau(niveau)}`;
}

export type EtatClasse = "a_faire" | "validee" | "tarif_manquant" | "vide" | "cible_absente";

export const LIBELLE_ETAT_CLASSE: Record<EtatClasse, string> = {
  a_faire: "À faire",
  validee: "Validée",
  tarif_manquant: "Tarif manquant",
  vide: "Aucun étudiant",
  cible_absente: "Année suivante à créer",
};

/**
 * Une classe validée n'a plus d'inscription en cours ; s'il en reste malgré une opération (étudiant inscrit
 * après coup), elle redevient « à faire » pour un passage complémentaire.
 */
export function etatClasse(c: {
  effectif: number;
  operationActive: boolean;
  /** Année cible existante et ouverte. */
  cibleDisponible: boolean;
  /** Tarif niveau+1 de l'année cible (inutile en dernière année). */
  tarifRequisPresent: boolean;
}): EtatClasse {
  if (c.effectif === 0) return c.operationActive ? "validee" : "vide";
  if (!c.cibleDisponible) return "cible_absente";
  if (!c.tarifRequisPresent) return "tarif_manquant";
  return "a_faire";
}

const identifiant = (message: string) => z.string({ error: message }).min(1, message).max(40, message);

export const schemaValidationClasse = z
  .object(
    {
      anneeSourceId: identifiant("Année introuvable. Rechargez la page."),
      filiereId: identifiant("Filière introuvable. Rechargez la page."),
      niveau: z.number(DONNEES_INVALIDES).int(DONNEES_INVALIDES.error).min(1, DONNEES_INVALIDES.error).max(DUREE_MAX, DONNEES_INVALIDES.error),
      decisions: z
        .array(
          z.object(
            {
              inscriptionId: identifiant("Étudiant introuvable. Rechargez la page."),
              decision: z.enum(DecisionAdmission, "Choisissez une décision pour chaque étudiant."),
            },
            DONNEES_INVALIDES,
          ),
          DONNEES_INVALIDES,
        )
        .min(1, "Aucun étudiant à valider dans cette classe.")
        .max(1000, DONNEES_INVALIDES.error),
    },
    DONNEES_INVALIDES,
  )
  .superRefine((v, ctx) => {
    const vus = new Set<string>();
    for (const d of v.decisions) {
      if (vus.has(d.inscriptionId)) {
        ctx.addIssue({ code: "custom", path: ["decisions"], message: "Un étudiant apparaît deux fois : rechargez la page." });
        return;
      }
      vus.add(d.inscriptionId);
    }
  });
export type EntreeValidationClasse = z.input<typeof schemaValidationClasse>;

/** « A, B, C et 2 autres » */
export function listerNoms(noms: readonly string[], max = 5): string {
  if (noms.length <= max) return noms.join(", ");
  const reste = noms.length - max;
  return `${noms.slice(0, max).join(", ")} et ${reste} autre${reste > 1 ? "s" : ""}`;
}

/** Statut posé sur l'inscription source par chaque décision. */
export const STATUT_INSCRIPTION_SOURCE: Record<DecisionAdmission, StatutInscription> = {
  ADMIS: "ADMIS",
  REDOUBLANT: "REDOUBLE",
  DIPLOME: "DIPLOME",
  ABANDON: "ABANDON",
};

/** Statut posé sur l'étudiant ; null : inchangé (il reste actif). */
export function statutEtudiantApres(decision: DecisionAdmission): StatutEtudiant | null {
  if (decision === "DIPLOME") return "DIPLOME";
  if (decision === "ABANDON") return "ABANDON";
  return null;
}

export function creeInscription(decision: DecisionAdmission): boolean {
  return decision === "ADMIS" || decision === "REDOUBLANT";
}

export type InscriptionClasse = {
  inscriptionId: string;
  etudiantId: string;
  nom: string;
  prenoms: string;
  droitsEnTranches: number;
  statutInscription: StatutInscription;
  statutEtudiant: StatutEtudiant;
  dateSortie: Date | null;
  motifSortie: string | null;
};

export type ContextePassage = {
  jour: Jour;
  anneeSource: { libelle: string; anneeDebut: number; cloturee: boolean };
  anneeCible: { libelle: string; anneeDebut: number; moisDebutEcolage: number; cloturee: boolean } | null;
  filiere: { nom: string; dureeAnnees: number };
  niveau: number;
  /** Inscriptions de la classe sur l'année source, relues sous verrou ; seules les EN_COURS d'étudiants ACTIF comptent. */
  inscriptions: readonly InscriptionClasse[];
  decisions: readonly { inscriptionId: string; decision: DecisionAdmission }[];
  tarifs: { niveauSuivant: TarifEcheances | null; memeNiveau: TarifEcheances | null };
};

export type ComptesDecisions = { admis: number; redoublants: number; diplomes: number; abandons: number };

export type InscriptionACreer = {
  etudiantId: string;
  inscriptionSourceId: string;
  niveau: number;
  redoublement: boolean;
  droitsEnTranches: number;
  echeances: EcheanceGeneree[];
};

export type LignePassage = {
  etudiantId: string;
  decision: DecisionAdmission;
  inscriptionSourceId: string;
  ancienStatutInscription: StatutInscription;
  ancienStatutEtudiant: StatutEtudiant;
  ancienneDateSortie: Date | null;
  ancienMotifSortie: string | null;
};

export type PlanPassage = {
  inscriptions: InscriptionACreer[];
  inscriptionsSource: { id: string; statut: StatutInscription }[];
  /** Diplômés et abandons seulement : les admis et redoublants restent actifs. */
  etudiants: { id: string; statut: StatutEtudiant; dateSortie: Date; motifSortie: string | null }[];
  lignes: LignePassage[];
  comptes: ComptesDecisions;
};

export type ResultatPassage =
  | { ok: true; plan: PlanPassage }
  | { ok: false; erreur: string; raison?: "classe_changee" };

export function compterDecisions(decisions: readonly { decision: DecisionAdmission }[]): ComptesDecisions {
  const c: ComptesDecisions = { admis: 0, redoublants: 0, diplomes: 0, abandons: 0 };
  for (const d of decisions) {
    if (d.decision === "ADMIS") c.admis++;
    else if (d.decision === "REDOUBLANT") c.redoublants++;
    else if (d.decision === "DIPLOME") c.diplomes++;
    else c.abandons++;
  }
  return c;
}

/** « 40 passent en 2e année · 1 redouble · 1 abandon » ; les décisions absentes sont omises. */
export function resumeDecisions(c: ComptesDecisions, niveau: number): string {
  const parts: string[] = [];
  if (c.admis) parts.push(`${c.admis} ${c.admis > 1 ? "passent" : "passe"} en ${libelleNiveau(niveau + 1)}`);
  if (c.diplomes) parts.push(`${c.diplomes} diplômé(e)${c.diplomes > 1 ? "s" : ""}`);
  if (c.redoublants) parts.push(`${c.redoublants} ${c.redoublants > 1 ? "redoublent" : "redouble"}`);
  if (c.abandons) parts.push(`${c.abandons} abandon${c.abandons > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

const nomComplet = (i: { nom: string; prenoms: string }) => `${i.nom} ${i.prenoms}`;

/** Ce que la validation d'une classe crée et modifie, ou la raison du refus. Aucun compteur n'est touché. */
export function planifierPassage(c: ContextePassage): ResultatPassage {
  const { anneeSource: source, anneeCible: cible, filiere, niveau } = c;
  if (source.cloturee) {
    return { ok: false, erreur: `L'année ${source.libelle} est clôturée : son passage ne peut plus être fait.` };
  }
  if (!cible) {
    return {
      ok: false,
      erreur: `L'année ${libelleAnnee(source.anneeDebut + 1)} n'existe pas encore : l'administrateur la crée, avec ses tarifs, dans Paramètres › Années scolaires.`,
    };
  }
  if (cible.anneeDebut !== source.anneeDebut + 1) throw new RangeError("Année cible incohérente avec l'année source.");
  if (cible.cloturee) {
    return { ok: false, erreur: `L'année ${cible.libelle} est clôturée : aucune inscription n'y est possible.` };
  }

  const attendues = new Map(
    c.inscriptions
      .filter((i) => i.statutInscription === "EN_COURS" && i.statutEtudiant === "ACTIF")
      .map((i) => [i.inscriptionId, i]),
  );
  if (c.decisions.length !== attendues.size || c.decisions.some((d) => !attendues.has(d.inscriptionId))) {
    return { ok: false, erreur: MESSAGE_CLASSE_CHANGEE, raison: "classe_changee" };
  }
  const suivies = c.decisions.map((d) => ({ ...d, inscription: attendues.get(d.inscriptionId)! }));
  const noms = (decision: DecisionAdmission) =>
    suivies.filter((s) => s.decision === decision).map((s) => nomComplet(s.inscription));

  const derniere = estDerniereAnnee(niveau, filiere.dureeAnnees);
  if (derniere && noms("ADMIS").length) {
    return {
      ok: false,
      erreur: `${listerNoms(noms("ADMIS"))} : la filière ${filiere.nom} dure ${filiere.dureeAnnees} ans, pas de ${libelleNiveau(niveau + 1)}. Choisissez Diplômé(e), Redouble ou Abandon.`,
    };
  }
  if (!derniere && noms("DIPLOME").length) {
    return {
      ok: false,
      erreur: `${listerNoms(noms("DIPLOME"))} : le diplôme se décide en ${libelleNiveau(filiere.dureeAnnees)}. Choisissez ${libelleDecision("ADMIS", niveau)}, Redouble ou Abandon.`,
    };
  }
  if (noms("ADMIS").length && !c.tarifs.niveauSuivant) {
    return {
      ok: false,
      erreur: `Tarif manquant pour ${libelleClasse(filiere.nom, niveau + 1)} en ${cible.libelle} : ${MESSAGE_TARIFS}`,
    };
  }
  if (noms("REDOUBLANT").length && !c.tarifs.memeNiveau) {
    return {
      ok: false,
      erreur: `Tarif manquant pour ${libelleClasse(filiere.nom, niveau)} en ${cible.libelle}, nécessaire aux redoublants (${listerNoms(noms("REDOUBLANT"))}) : ${MESSAGE_TARIFS}`,
    };
  }

  const tarifDe = (decision: DecisionAdmission) =>
    decision === "ADMIS" ? c.tarifs.niveauSuivant! : c.tarifs.memeNiveau!;
  const tranchesImpossibles = suivies.filter(
    (s) => creeInscription(s.decision) && controleTranches(tarifDe(s.decision).droitsInscription, s.inscription.droitsEnTranches),
  );
  if (tranchesImpossibles.length) {
    const premier = tranchesImpossibles[0];
    const raison = controleTranches(tarifDe(premier.decision).droitsInscription, premier.inscription.droitsEnTranches);
    return {
      ok: false,
      erreur: `${listerNoms(tranchesImpossibles.map((s) => nomComplet(s.inscription)))} : ${raison} Modifiez d'abord le paiement des droits sur sa fiche, ou le tarif.`,
    };
  }

  const dateSortie = dateDuJour(c.jour);
  const motifAbandon = `Ne poursuit pas en ${cible.libelle} (passage du ${formaterJour(c.jour)})`;
  const plan: PlanPassage = { inscriptions: [], inscriptionsSource: [], etudiants: [], lignes: [], comptes: compterDecisions(c.decisions) };

  for (const s of suivies) {
    const i = s.inscription;
    plan.inscriptionsSource.push({ id: i.inscriptionId, statut: STATUT_INSCRIPTION_SOURCE[s.decision] });
    plan.lignes.push({
      etudiantId: i.etudiantId,
      decision: s.decision,
      inscriptionSourceId: i.inscriptionId,
      ancienStatutInscription: i.statutInscription,
      ancienStatutEtudiant: i.statutEtudiant,
      ancienneDateSortie: i.dateSortie,
      ancienMotifSortie: i.motifSortie,
    });
    if (creeInscription(s.decision)) {
      const redouble = s.decision === "REDOUBLANT";
      plan.inscriptions.push({
        etudiantId: i.etudiantId,
        inscriptionSourceId: i.inscriptionId,
        niveau: redouble ? niveau : niveau + 1,
        redoublement: redouble,
        droitsEnTranches: i.droitsEnTranches,
        echeances: genererEcheances(tarifDe(s.decision), cible, i.droitsEnTranches),
      });
    }
    const statut = statutEtudiantApres(s.decision);
    if (statut) {
      plan.etudiants.push({
        id: i.etudiantId,
        statut,
        dateSortie,
        motifSortie: s.decision === "ABANDON" ? motifAbandon : null,
      });
    }
  }
  return { ok: true, plan };
}

export type LigneAnnulation = {
  etudiantId: string;
  nom: string;
  prenoms: string;
  decision: DecisionAdmission;
  ancienStatutEtudiant: StatutEtudiant;
  inscriptionCibleId: string | null;
  statutEtudiantActuel: StatutEtudiant;
  /** null : inscription introuvable. */
  statutInscriptionSourceActuel: StatutInscription | null;
  statutInscriptionCibleActuel: StatutInscription | null;
};

export type ContexteAnnulation = {
  annulee: boolean;
  lignes: readonly LigneAnnulation[];
  /** Reçus ayant une ligne sur les échéances créées, paiements annulés compris. */
  recus: readonly string[];
  /** Inscriptions cibles devenues source d'une opération non annulée. */
  ciblesReprises: ReadonlySet<string>;
};

/** null si l'opération peut être annulée, sinon la raison affichable. */
export function controleAnnulation(c: ContexteAnnulation): string | null {
  if (c.annulee) return "Ce passage est déjà annulé.";
  if (c.recus.length) {
    return `Ce passage ne peut plus être annulé : des paiements ont été enregistrés sur les inscriptions qu'il a créées (reçus ${listerNoms(c.recus, 8)}). Un reçu reste lié à ses échéances même s'il est annulé : ce blocage est définitif.`;
  }
  const reprises = c.lignes.filter((l) => l.inscriptionCibleId && c.ciblesReprises.has(l.inscriptionCibleId));
  if (reprises.length) {
    return `Annulation impossible : le passage suivant a déjà été validé pour ${listerNoms(reprises.map(nomComplet))}. Annulez d'abord ce passage-là.`;
  }
  const derives = c.lignes.filter((l) => {
    const etudiantAttendu = statutEtudiantApres(l.decision) ?? l.ancienStatutEtudiant;
    if (l.statutEtudiantActuel !== etudiantAttendu) return true;
    if (l.statutInscriptionSourceActuel !== STATUT_INSCRIPTION_SOURCE[l.decision]) return true;
    if (creeInscription(l.decision)) return l.statutInscriptionCibleActuel !== "EN_COURS";
    return false;
  });
  if (derives.length) {
    return `Annulation impossible : la situation de ${listerNoms(derives.map(nomComplet))} a changé depuis ce passage (sortie ou nouvelle inscription).`;
  }
  return null;
}

export type LigneRestauration = {
  etudiantId: string;
  decision: DecisionAdmission;
  inscriptionSourceId: string;
  inscriptionCibleId: string | null;
  ancienStatutInscription: StatutInscription;
  ancienStatutEtudiant: StatutEtudiant;
  ancienneDateSortie: Date | null;
  ancienMotifSortie: string | null;
};

export type PlanRestauration = {
  /** Supprimées avec leurs échéances : seul cas de suppression physique, et seulement sans aucune ligne de paiement. */
  inscriptionsASupprimer: string[];
  inscriptionsSource: { id: string; statut: StatutInscription }[];
  /** Seulement les étudiants que le passage avait modifiés (diplômés, abandons). */
  etudiants: { id: string; statut: StatutEtudiant; dateSortie: Date | null; motifSortie: string | null }[];
};

export function planifierRestauration(lignes: readonly LigneRestauration[]): PlanRestauration {
  return {
    inscriptionsASupprimer: lignes.flatMap((l) => (l.inscriptionCibleId ? [l.inscriptionCibleId] : [])),
    inscriptionsSource: lignes.map((l) => ({ id: l.inscriptionSourceId, statut: l.ancienStatutInscription })),
    etudiants: lignes
      .filter((l) => statutEtudiantApres(l.decision) !== null)
      .map((l) => ({
        id: l.etudiantId,
        statut: l.ancienStatutEtudiant,
        dateSortie: l.ancienneDateSortie,
        motifSortie: l.ancienMotifSortie,
      })),
  };
}
