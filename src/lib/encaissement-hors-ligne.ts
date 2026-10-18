import { z } from "zod";
import { Sexe, StatutEtudiant, TypeEcheance } from "@/generated/prisma/enums";
import { anneeCivile, dateDuJour, jourMadagascar, lireJour, type Jour } from "@/lib/dates";
import {
  LIBELLE_STATUT_ECHEANCE,
  libelleEcheance,
  preselection,
  repartirPaiement,
  resteDuTotal,
  restesApres,
  situation,
  suivreEcheance,
  trierPourSolde,
  type EcheanceAPayer,
  type LigneRepartie,
  type StatutEcheance,
} from "@/lib/ecolage";
import {
  champsEncaissement,
  construireRecu,
  controleMobileMoney,
  estIdentifiantPoste,
  type DonneesRecu,
  type Encaissement,
} from "@/lib/encaissement";
import { libelleNiveauInscription, libelleStatutEtudiant, motsRecherche, texteRecherche } from "@/lib/etudiants";
import { libelleAnnee } from "@/lib/parametres";

// Guichet partagé par Encaisser en ligne (serveur) et hors ligne (poste) : situation, file locale, reçu, numéros.
// Isomorphe et pur : ni base, ni horloge ; le jour ou l'instant est toujours passé par l'appelant.

const DONNEES_INVALIDES = { error: "Données invalides. Rechargez la page puis réessayez." };

/** Numéros de reçu réservés d'un coup par un poste. */
export const TAILLE_BLOC = 20;
/** En dessous de ce nombre de numéros libres pour l'année, le poste redemande un bloc. */
export const SEUIL_RECHARGE = 10;
/** Numéros libres au plus par poste, utilisateur et année : borne les numéros perdus en fin d'année. */
export const PLAFOND_NUMEROS_LIBRES = 40;
/** Éléments envoyés au plus par synchronisation. */
export const MAX_ELEMENTS_SYNCHRO = 100;

// Situation du guichet

export type ResultatGuichet = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  filiereCode: string;
  /** « 2e année (redoublant) », null sans inscription */
  niveau: string | null;
  statut: StatutEtudiant;
  libelleStatut: string;
  /** Sorti (diplômé, abandon, exclu) : encaissable seulement pour solder ce qu'il doit encore. */
  sorti: boolean;
  resteEnRetard: number;
  resteDu: number;
};

export type EcheanceGuichet = {
  id: string;
  libelle: string;
  type: TypeEcheance;
  /** « 2026-10-01 » */
  mois: Jour;
  montantDu: number;
  paye: number;
  reste: number;
  echue: boolean;
  statut: StatutEcheance;
  libelleStatut: string;
};

export type SituationGuichet = {
  etudiant: ResultatGuichet & { filiereNom: string; anneeScolaire: string | null };
  jour: Jour;
  /** Message à afficher à la place du formulaire (rien à encaisser), sinon null. */
  refus: string | null;
  /** Par année scolaire, de la plus ancienne à la plus récente ; seulement les échéances non soldées. */
  annees: { anneeDebut: number; libelle: string; niveau: string | null; reste: number; resteEnRetard: number; echeances: EcheanceGuichet[] }[];
  /** Mêmes échéances, à plat, dans l'ordre de solde : base de `montantPourCases` et `repartirPaiement`. */
  echeances: EcheanceGuichet[];
  /** Cases cochées par défaut : les échéances en retard. */
  preselection: string[];
  /** À renvoyer tel quel dans `encaisser({ resteDuAffiche })`. */
  resteDuTotal: number;
  resteEnRetard: number;
  /** Année de l'inscription la plus récente, échéances soldées comprises ; null sans inscription. */
  anneeEnCours: { anneeDebut: number; libelle: string; du: number; paye: number; reste: number } | null;
};

const champJour = z.string(DONNEES_INVALIDES).refine((v) => {
  try {
    lireJour(v);
    return true;
  } catch {
    return false;
  }
}, DONNEES_INVALIDES.error);
const entierNaturel = z.number(DONNEES_INVALIDES).int(DONNEES_INVALIDES.error).min(0, DONNEES_INVALIDES.error);
const identifiant = z.string(DONNEES_INVALIDES).min(1, DONNEES_INVALIDES.error).max(40, DONNEES_INVALIDES.error);

const schemaInscriptionCopie = z.object({
  anneeDebut: entierNaturel,
  /** « 2026-2027 » */
  libelle: z.string(DONNEES_INVALIDES),
  niveau: entierNaturel,
  redoublement: z.boolean(DONNEES_INVALIDES),
});
export type InscriptionCopie = z.output<typeof schemaInscriptionCopie>;

const schemaEcheanceCopie = z.object({
  id: identifiant,
  anneeDebut: entierNaturel,
  anneeLibelle: z.string(DONNEES_INVALIDES),
  type: z.enum(TypeEcheance, DONNEES_INVALIDES),
  tranche: entierNaturel.nullable(),
  droitsEnTranches: entierNaturel,
  /** 1er du mois d'exigibilité, « 2026-10-01 ». */
  mois: champJour,
  ordre: entierNaturel,
  montantDu: entierNaturel,
  /** Somme des lignes de paiements non annulés, au moment de la copie. */
  paye: entierNaturel,
});
/** Échéance due (jamais « non due après sortie »), telle que la copie du poste la garde. */
export type EcheanceCopie = z.output<typeof schemaEcheanceCopie>;

const schemaEtudiantCopie = z.object({
  id: identifiant,
  matricule: z.string(DONNEES_INVALIDES),
  nom: z.string(DONNEES_INVALIDES),
  prenoms: z.string(DONNEES_INVALIDES),
  // Facultatif : les copies faites avant l'ajout du sexe restent lisibles (statut au masculin jusqu'à la prochaine synchronisation).
  sexe: z.enum(Sexe, DONNEES_INVALIDES).optional(),
  statut: z.enum(StatutEtudiant, DONNEES_INVALIDES),
  filiereCode: z.string(DONNEES_INVALIDES),
  filiereNom: z.string(DONNEES_INVALIDES),
  // Ni téléphone ni adresse : le guichet ne les affiche pas, la copie reste sur un poste partagé.
  /** Dans n'importe quel ordre. */
  inscriptions: z.array(schemaInscriptionCopie),
  echeances: z.array(schemaEcheanceCopie),
});
export type EtudiantCopie = z.output<typeof schemaEtudiantCopie>;
/** Ce que `construireSituationGuichet` lit de l'étudiant ; les échéances sont passées à part. */
export type EtudiantGuichetSource = Omit<EtudiantCopie, "echeances">;

/** Copie légère du guichet (IndexedDB) : les encaissables, sans tarifs (décisions 38 et 39). */
export const schemaCopieGuichet = z.object(
  {
    /** Instant du serveur à la génération : sert au poste à mesurer le décalage de son horloge. */
    genereeLeISO: z.iso.datetime({ offset: true, error: DONNEES_INVALIDES.error }),
    etudiants: z.array(schemaEtudiantCopie),
  },
  DONNEES_INVALIDES,
);
export type CopieGuichet = z.output<typeof schemaCopieGuichet>;

/** Encaissables : les actifs, et les sortis qui doivent encore quelque chose (décision 20). */
export function encaissable(e: { statut: StatutEtudiant }, resteDu: number): boolean {
  return e.statut === "ACTIF" || resteDu > 0;
}

function inscriptionsRecentesDabord(inscriptions: readonly InscriptionCopie[]): InscriptionCopie[] {
  return [...inscriptions].sort((a, b) => b.anneeDebut - a.anneeDebut);
}

type EcheanceDatee = Omit<EcheanceCopie, "mois"> & { mois: Date; jourMois: Jour };

function dater(echeances: readonly EcheanceCopie[]): EcheanceDatee[] {
  return trierPourSolde(echeances.map((e) => ({ ...e, mois: dateDuJour(e.mois), jourMois: e.mois })));
}

export function resultatGuichet(
  e: Pick<EtudiantGuichetSource, "id" | "matricule" | "nom" | "prenoms" | "sexe" | "statut" | "filiereCode" | "inscriptions">,
  restes: { resteDu: number; resteEnRetard: number },
): ResultatGuichet {
  const ins = inscriptionsRecentesDabord(e.inscriptions)[0];
  return {
    id: e.id,
    matricule: e.matricule,
    nom: e.nom,
    prenoms: e.prenoms,
    filiereCode: e.filiereCode,
    niveau: ins ? libelleNiveauInscription(ins.niveau, ins.redoublement) : null,
    statut: e.statut,
    libelleStatut: libelleStatutEtudiant(e.statut, e.sexe),
    sorti: e.statut !== "ACTIF",
    resteEnRetard: restes.resteEnRetard,
    resteDu: restes.resteDu,
  };
}

/** Reste dû et reste en retard, mêmes règles que `sqlRestes` côté serveur. */
export function restesLocaux(echeances: readonly EcheanceCopie[], jour: Jour): { resteDu: number; resteEnRetard: number } {
  let resteDu = 0;
  let resteEnRetard = 0;
  for (const e of dater(echeances)) {
    const s = suivreEcheance(e, jour);
    resteDu += s.reste;
    if (s.echue) resteEnRetard += s.reste;
  }
  return { resteDu, resteEnRetard };
}

/**
 * Ce que le guichet affiche pour un étudiant : échéances non soldées toutes années, cases présélectionnées.
 * `echeances` : toutes les échéances dues (soldées comprises pour l'année la plus récente, cf. `elaguerPourCopie`).
 */
export function construireSituationGuichet(
  etudiant: EtudiantGuichetSource,
  echeances: readonly EcheanceCopie[],
  jour: Jour,
): SituationGuichet {
  const toutes = dater(echeances);
  const nonSoldees = toutes.map((x) => suivreEcheance(x, jour)).filter((x) => x.reste > 0);
  const inscriptions = inscriptionsRecentesDabord(etudiant.inscriptions);
  const derniere = inscriptions[0];
  const totauxDerniere = derniere
    ? situation(toutes, jour).parAnnee.find((a) => a.anneeDebut === derniere.anneeDebut)
    : undefined;
  const lignes: EcheanceGuichet[] = nonSoldees.map((x) => ({
    id: x.id,
    libelle: libelleEcheance(x, x.droitsEnTranches),
    type: x.type,
    mois: x.jourMois,
    montantDu: x.montantDu,
    paye: x.paye,
    reste: x.reste,
    echue: x.echue,
    statut: x.statut,
    libelleStatut: LIBELLE_STATUT_ECHEANCE[x.statut],
  }));
  const total = resteDuTotal(nonSoldees);
  const retard = nonSoldees.filter((x) => x.echue).reduce((s, x) => s + x.reste, 0);

  const annees = [...new Set(nonSoldees.map((x) => x.anneeDebut))].map((anneeDebut) => {
    const ins = inscriptions.find((i) => i.anneeDebut === anneeDebut);
    const ech = nonSoldees.filter((x) => x.anneeDebut === anneeDebut);
    return {
      anneeDebut,
      libelle: ins?.libelle ?? libelleAnnee(anneeDebut),
      niveau: ins ? libelleNiveauInscription(ins.niveau, ins.redoublement) : null,
      reste: resteDuTotal(ech),
      resteEnRetard: ech.filter((x) => x.echue).reduce((s, x) => s + x.reste, 0),
      echeances: lignes.filter((x) => ech.some((y) => y.id === x.id)),
    };
  });

  return {
    etudiant: {
      ...resultatGuichet(etudiant, { resteDu: total, resteEnRetard: retard }),
      filiereNom: etudiant.filiereNom,
      anneeScolaire: derniere?.libelle ?? null,
    },
    jour,
    refus: total === 0 ? "Rien à encaisser : toutes les échéances de cet étudiant sont soldées." : null,
    annees,
    echeances: lignes,
    preselection: preselection(nonSoldees, jour),
    resteDuTotal: total,
    resteEnRetard: retard,
    anneeEnCours: derniere
      ? {
          anneeDebut: derniere.anneeDebut,
          libelle: derniere.libelle,
          du: totauxDerniere?.du ?? 0,
          paye: totauxDerniere?.paye ?? 0,
          reste: totauxDerniere?.reste ?? 0,
        }
      : null,
  };
}

/**
 * Garde ce dont `construireSituationGuichet` a besoin : les échéances non soldées, plus toutes celles
 * de l'année la plus récente (pour `anneeEnCours`). Le résultat affiché est identique à celui de l'échéancier complet.
 */
export function elaguerPourCopie(etudiant: EtudiantCopie): EtudiantCopie {
  const derniere = inscriptionsRecentesDabord(etudiant.inscriptions)[0]?.anneeDebut;
  return {
    ...etudiant,
    echeances: etudiant.echeances.filter((e) => e.paye < e.montantDu || e.anneeDebut === derniere),
  };
}

// File d'attente du poste

/** Impute jusqu'au reste dû, sans jamais refuser : ce qui dépasse est rendu en `surplus` (paiement hors ligne). */
export function imputerJusquAuReste(
  nonSoldees: readonly EcheanceAPayer[],
  montant: number,
): { lignes: LigneRepartie[]; impute: number; surplus: number } {
  if (!Number.isInteger(montant) || montant <= 0) throw new RangeError(`Montant invalide : ${montant}.`);
  const impute = Math.min(montant, resteDuTotal(nonSoldees));
  if (impute === 0) return { lignes: [], impute: 0, surplus: montant };
  const r = repartirPaiement(nonSoldees, impute);
  if (!r.ok) throw new RangeError(r.erreur);
  return { lignes: r.lignes, impute, surplus: montant - impute };
}

function aPayer(echeances: readonly EcheanceCopie[]): (EcheanceAPayer & EcheanceDatee)[] {
  return dater(echeances)
    .map((e) => ({ ...e, reste: Math.max(0, e.montantDu - e.paye) }))
    .filter((e) => e.reste > 0);
}

/**
 * Copie vue par le poste une fois les paiements encore en file imputés, dans l'ordre de la file :
 * un 2e paiement hors ligne du même étudiant part des restes déjà diminués.
 */
export function appliquerFile(
  copie: CopieGuichet,
  enAttente: readonly Pick<ElementFile, "etudiantId" | "montant">[],
): CopieGuichet {
  const parId = new Map(copie.etudiants.map((e) => [e.id, e]));
  for (const p of enAttente) {
    const e = parId.get(p.etudiantId);
    if (!e || !Number.isInteger(p.montant) || p.montant <= 0) continue;
    const { lignes } = imputerJusquAuReste(aPayer(e.echeances), p.montant);
    const impute = new Map(lignes.map((l) => [l.echeanceId, l.montant]));
    parId.set(e.id, {
      ...e,
      echeances: e.echeances.map((x) => (impute.has(x.id) ? { ...x, paye: x.paye + (impute.get(x.id) ?? 0) } : x)),
    });
  }
  return { ...copie, etudiants: copie.etudiants.map((e) => parId.get(e.id) ?? e) };
}

/** Recherche du guichet sur la copie : mêmes mots que le serveur (accents ignorés), 10 résultats, actifs d'abord. */
export function rechercheLocale(copie: CopieGuichet, q: string, jour: Jour): ResultatGuichet[] {
  const mots = motsRecherche(q);
  if (mots.length === 0) return [];
  return copie.etudiants
    .filter((e) => {
      const texte = texteRecherche(e);
      return mots.every((m) => texte.includes(m));
    })
    .map((e) => ({ e, restes: restesLocaux(e.echeances, jour) }))
    .filter(({ e, restes }) => encaissable(e, restes.resteDu))
    .sort(
      (a, b) =>
        Number(b.e.statut === "ACTIF") - Number(a.e.statut === "ACTIF") ||
        a.e.nom.localeCompare(b.e.nom, "fr") ||
        a.e.prenoms.localeCompare(b.e.prenoms, "fr"),
    )
    .slice(0, 10)
    .map(({ e, restes }) => resultatGuichet(e, restes));
}

export type SaisieHorsLigne = Pick<Encaissement, "montant" | "mode" | "operateur" | "reference"> & {
  /** Étudiant de la copie, file déjà appliquée (`appliquerFile`). */
  etudiant: EtudiantCopie;
  numeroRecu: string;
  /** Instant corrigé du poste (`instantCorrige`). */
  instant: Date;
  /** Nom de l'utilisateur connecté sur le poste. */
  caissier: string;
};

/**
 * Ticket imprimé hors ligne, construit comme à la réimpression (`construireRecu`).
 * Mêmes refus qu'en ligne (montant nul, au-delà du reste dû) ; `resteDuAvant` va dans `resteDuAffiche`.
 */
export function recuHorsLigne(
  s: SaisieHorsLigne,
): { ok: true; recu: DonneesRecu; resteDuAvant: number; lignes: LigneRepartie[] } | { ok: false; erreur: string } {
  const jour = jourMadagascar(s.instant);
  const nonSoldees = aPayer(s.etudiant.echeances);
  const repartition = repartirPaiement(nonSoldees, s.montant);
  if (!repartition.ok) return { ok: false, erreur: repartition.erreur };
  const { resteApres, retardApres } = restesApres(nonSoldees, repartition.lignes, jour);

  const parId = new Map(nonSoldees.map((e) => [e.id, e]));
  const payees = repartition.lignes.map((l) => ({ l, e: parId.get(l.echeanceId)! }));
  // Même choix qu'à la réimpression : niveau et année de l'inscription la plus récente payée.
  const anneePlusRecente = Math.max(...payees.map((x) => x.e.anneeDebut));
  const ins = s.etudiant.inscriptions.find((i) => i.anneeDebut === anneePlusRecente);

  const recu = construireRecu({
    paiementId: null,
    numero: s.numeroRecu,
    instant: s.instant,
    etudiant: { matricule: s.etudiant.matricule, nom: s.etudiant.nom, prenoms: s.etudiant.prenoms, filiere: s.etudiant.filiereNom },
    inscription: ins
      ? { niveau: ins.niveau, redoublement: ins.redoublement, anneeLibelle: ins.libelle }
      : { niveau: 1, redoublement: false, anneeLibelle: "" },
    lignes: payees.map(({ l, e }) => ({
      montant: l.montant,
      resteEcheanceApres: l.resteEcheance,
      echeance: {
        type: e.type,
        tranche: e.tranche,
        mois: e.mois,
        ordre: e.ordre,
        droitsEnTranches: e.droitsEnTranches,
        anneeDebut: e.anneeDebut,
        anneeLibelle: e.anneeLibelle,
      },
    })),
    montant: s.montant,
    mode: s.mode,
    operateur: s.operateur,
    reference: s.reference,
    resteApres,
    retardApres,
    caissier: s.caissier,
    annulation: null,
  });
  return { ok: true, recu, resteDuAvant: resteDuTotal(nonSoldees), lignes: repartition.lignes };
}

// Numéros et horloge

/** Années pour lesquelles le poste doit détenir des numéros : l'année civile, plus la suivante dès le 1er décembre. */
export function anneesABloquer(jour: Jour): number[] {
  const { annee, mois } = lireJour(jour);
  return mois === 12 ? [annee, annee + 1] : [annee];
}

/** Année du numéro de reçu à prendre pour un paiement saisi à cet instant (heure de Madagascar). */
export function anneeDuRecu(instant: Date): number {
  return anneeCivile(jourMadagascar(instant));
}

/** `decalage` = heure du serveur moins heure du poste, en ms, mesuré à la dernière synchronisation. */
export function instantCorrige(maintenant: Date, decalage: number): Date {
  return new Date(maintenant.getTime() + (Number.isFinite(decalage) ? decalage : 0));
}

/** Heure du poste antérieure à la dernière synchronisation : l'horloge a reculé, la saisie hors ligne est bloquée. */
export function horlogeIncoherente(maintenant: Date, derniereSynchro: Date | null): boolean {
  return derniereSynchro !== null && maintenant.getTime() < derniereSynchro.getTime();
}

// Échanges poste ↔ serveur

const schemaPoste = z
  .string(DONNEES_INVALIDES)
  .refine(estIdentifiantPoste, "Identifiant de poste invalide. Rechargez la page.");

/** Le serveur choisit lui-même les années (`anneesABloquer` sur son propre jour). */
export const schemaDemandeBlocs = z.object({ poste: schemaPoste }, DONNEES_INVALIDES);
export type DemandeBlocs = z.output<typeof schemaDemandeBlocs>;

const schemaBlocRecus = z.object({
  id: identifiant,
  annee: entierNaturel,
  /** « RECU:2027 » */
  cle: z.string(DONNEES_INVALIDES),
  premier: entierNaturel,
  dernier: entierNaturel,
  /** Numéros du bloc sans paiement au serveur (ceux encore en file sur le poste y figurent). */
  libres: z.array(entierNaturel),
});
export type BlocRecus = z.output<typeof schemaBlocRecus>;

export const schemaEtatBlocs = z.object(
  {
    poste: schemaPoste,
    annees: z.array(z.object({ annee: entierNaturel, cle: z.string(DONNEES_INVALIDES), libres: entierNaturel, blocs: z.array(schemaBlocRecus) })),
  },
  DONNEES_INVALIDES,
);
export type EtatBlocsPoste = z.output<typeof schemaEtatBlocs>;

/** Paiement saisi hors ligne, tel que la file du poste le garde et l'envoie. */
export const schemaElementFile = z
  .object(
    {
      ...champsEncaissement,
      poste: schemaPoste,
      // Pas de contrôle de format ici : un numéro refusé est remplacé au serveur, le paiement n'est jamais bloqué (décision 40).
      numeroRecu: z.string(DONNEES_INVALIDES).trim().min(1, "Numéro de reçu manquant.").max(30, "Numéro de reçu invalide."),
      /** Instant corrigé du poste au moment de la saisie. */
      instantSaisie: z.iso.datetime({ offset: true, error: "Heure de saisie invalide." }),
      /** Auteur : seule sa session peut envoyer ce paiement (décision 36). */
      saisiParId: identifiant,
    },
    DONNEES_INVALIDES,
  )
  .superRefine(controleMobileMoney);
export type EntreeElementFile = z.input<typeof schemaElementFile>;
export type ElementFile = z.output<typeof schemaElementFile>;

export const schemaSynchronisation = z.object(
  {
    poste: schemaPoste,
    // Chaque élément est validé à part (`schemaElementFile`) : un élément invalide ne bloque pas les autres.
    elements: z
      .array(z.unknown())
      .min(1, "Aucun paiement à synchroniser.")
      .max(MAX_ELEMENTS_SYNCHRO, `Au plus ${MAX_ELEMENTS_SYNCHRO} paiements par synchronisation.`),
  },
  DONNEES_INVALIDES,
);

/**
 * Refus d'un élément (il reste dans la file du poste) : INVALIDE élément mal formé, AUTEUR saisi par un autre compte
 * (décision 36), INTROUVABLE étudiant supprimé, ERREUR incident serveur (réessayer plus tard).
 */
export type CodeRefusSynchro = "INVALIDE" | "AUTEUR" | "INTROUVABLE" | "ERREUR";

/**
 * Issue d'un élément synchronisé, identifié par `idClient`.
 * `numeroRemplace` non null : le ticket remis portait ce numéro, refusé ; le reçu définitif est `numeroRecu`.
 */
export type ResultatElementSynchro =
  | {
      idClient: string;
      statut: "enregistre" | "deja";
      paiementId: string;
      numeroRecu: string;
      numeroRemplace: string | null;
      aVerifier: boolean;
      message: string;
    }
  | { idClient: string; statut: "refuse"; message: string; code: CodeRefusSynchro };

/** Réponse de `POST /api/encaissement/synchroniser`. */
export type ReponseSynchronisation = { resultats: ResultatElementSynchro[]; serveurISO: string };

/** Réponse de `GET /api/encaissement/copie`. */
export const schemaReponseCopie = schemaCopieGuichet.extend({
  utilisateur: z.object({ id: identifiant, nom: z.string(DONNEES_INVALIDES) }, DONNEES_INVALIDES),
});
export type ReponseCopie = z.output<typeof schemaReponseCopie>;

/** Réponse de `POST /api/encaissement/blocs`. */
export type ReponseBlocs = EtatBlocsPoste & { serveurISO: string };

/** Corps des réponses d'erreur des routes JSON (401, 403, 400, 409, 500). */
export type ErreurApi = { erreur: string; code: "SESSION" | "INTERDIT" | "INVALIDE" | "NUMEROS_EPUISES" | "ERREUR" };
