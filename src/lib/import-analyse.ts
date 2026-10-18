import { createHash } from "node:crypto";
import type { StatutEtudiant } from "@/generated/prisma/enums";
import { anneeCivile, dateDuJour, debutJourMadagascar, jourDeDate, type Jour } from "@/lib/dates";
import {
  controleTranches,
  genererEcheances,
  repartirPaiement,
  resteDuTotal,
  trierPourSolde,
  type EcheancePayee,
  type TarifEcheances,
} from "@/lib/ecolage";
import { estDoublon, LIBELLE_STATUT_ETUDIANT, normaliserRecherche } from "@/lib/etudiants";
import { lireDate, normaliserRecuPapier, validerEtudiants, validerPaiements, type EtudiantImport, type PaiementImport } from "@/lib/import";
import { messageImport, type LieuMessage, type MessageImport, type RepriseLue } from "@/lib/import-lecture";
import { COLONNES_ETUDIANTS, COLONNES_PAIEMENTS, FEUILLE_ETUDIANTS, FEUILLE_PAIEMENTS, type CleEtudiant, type ClePaiement } from "@/lib/import-modele";
import { formaterNumeroRecu, SEQUENCE_RECU_MAX } from "@/lib/matricule";
import { formaterAriary } from "@/lib/montant";
import { libelleAnnee, libelleNiveau } from "@/lib/parametres";

// Analyse de la reprise sans rien écrire : contrôles globaux, étudiants (nouveaux, déjà en base, refusés),
// paiements simulés comme au guichet. Pur (ni base, ni horloge) ; node:crypto pour les clés : serveur seulement,
// un composant client n'importe d'ici que des types.

export type FiliereReprise = { id: string; code: string; nom: string; dureeAnnees: number; actif: boolean };
export type AnneeReprise = { id: string; anneeDebut: number; libelle: string; cloturee: boolean };
export type AnneeCouranteReprise = AnneeReprise & { moisDebutEcolage: number; dateDebut: Jour };
export type TarifReprise = TarifEcheances & { filiereId: string; niveau: number };

/** Étudiant en base né un jour cité par le fichier : candidat au doublon (`estDoublon`). */
export type EtudiantEnBase = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  /** Colonne `@db.Date`, minuit UTC. */
  dateNaissance: Date;
  filiereId: string;
  /** `anneeDebut` de son année d'entrée. */
  anneeEntree: number;
  statut: StatutEtudiant;
  /** Inscription sur l'année courante, null s'il n'en a pas. */
  inscriptionCourante: { niveau: number; redoublement: boolean; droitsEnTranches: number } | null;
  /** Toutes années, payé = lignes des paiements non annulés ; celles « non dues » après une sortie sont ignorées. */
  echeances: EcheancePayee[];
  /** Paiements non annulés saisis hors reprise (guichet) : le fichier ne doit pas les reprendre une seconde fois. */
  paiementsHorsReprise: number;
};

export type ContexteReprise = {
  anneeCourante: AnneeCouranteReprise | null;
  filieres: FiliereReprise[];
  /** Toutes les années en base, courante comprise. */
  annees: AnneeReprise[];
  /** Tarifs de l'année courante. */
  tarifs: TarifReprise[];
  etudiantsEnBase: EtudiantEnBase[];
  /** `Paiement.idClient` commençant par `PREFIXE_CLE_REPRISE` (paiements déjà importés, annulés compris). */
  clesReprise: ReadonlySet<string>;
  /** Valeur des compteurs `RECU:{année}` des années civiles des paiements du fichier : { 2026: 42 }. */
  compteursRecu: Readonly<Record<number, number>>;
};

export type StatutEtudiantReprise = "nouveau" | "existant" | "refuse";
export type StatutPaiementReprise = "a_importer" | "deja_importe" | "refuse";

export type EtudiantPlan = {
  ligne: number;
  numero: string | null;
  statut: StatutEtudiantReprise;
  /** Lu et validé ; null si la ligne a une erreur de saisie. */
  donnees: EtudiantImport | null;
  /** Nouveau : filière et année d'entrée en base, tarif copié dans ses échéances. */
  filiereId: string | null;
  anneeEntreeId: string | null;
  tarif: TarifEcheances | null;
  /** Nouveau : total des échéances de l'année courante. */
  duAnnee: number | null;
  /** Étudiant déjà en base (statut « existant », ou refusé pour une différence avec la base). */
  existant: { id: string; matricule: string } | null;
};

export type PaiementPlan = {
  ligne: number;
  numeroEtudiant: string | null;
  /** Ligne de l'étudiant dans la feuille Étudiants, null si son N° est inconnu ou en double. */
  ligneEtudiant: number | null;
  statut: StatutPaiementReprise;
  donnees: PaiementImport | null;
  /** Futur `Paiement.idClient` : un second import du même paiement est reconnu. */
  cle: string | null;
  /** Reste dû simulé de l'étudiant (toutes années) juste avant / après ce paiement ; null s'il n'est pas importé. */
  resteDuAvant: number | null;
  resteDuApres: number | null;
  /** Année du reçu `R-{année}` qui sera émis. */
  anneeRecu: number | null;
};

export type TotauxReprise = {
  etudiants: { lus: number; nouveaux: number; existants: number; refuses: number };
  paiements: { lus: number; aImporter: number; dejaImportes: number; refuses: number; montantAImporter: number };
  erreurs: number;
  avertissements: number;
};

export type RapportReprise = {
  /** Une erreur au moins : rien ne peut être importé. */
  bloquant: boolean;
  annee: { id: string; libelle: string } | null;
  /** Globaux d'abord, puis Étudiants et Paiements par ligne ; erreurs avant avertissements. */
  messages: MessageImport[];
  /** Ordre d'import : filière, année d'entrée, N° (c'est l'ordre des matricules) ; lignes illisibles à la fin. */
  etudiants: EtudiantPlan[];
  /** Ordre d'import : date puis ligne (c'est l'ordre des reçus) ; lignes illisibles à la fin. */
  paiements: PaiementPlan[];
  totaux: TotauxReprise;
  /** Tout ce qui sera écrit, une ligne JSON par élément ; sa signature lie la confirmation au plan affiché. */
  canonique: string;
};

/** Étudiant du plan tel que l'écran l'affiche. */
export type EtudiantRapport = {
  ligne: number;
  numero: string | null;
  statut: StatutEtudiantReprise;
  /** Null si la ligne est illisible (erreur de saisie). */
  nom: string | null;
  prenoms: string | null;
  filiere: string | null;
  niveau: number | null;
  /** Déjà en base. */
  matricule: string | null;
  /** Nouveau : total des échéances de l'année courante. */
  duAnnee: number | null;
};

export type PaiementRefuseRapport = {
  ligne: number;
  numeroEtudiant: string | null;
  jour: Jour | null;
  montant: number | null;
};

/** Paiements du fichier pour un étudiant accepté. */
export type RecapPaiementsEtudiant = {
  ligneEtudiant: number;
  numero: string;
  aImporter: number;
  montantAImporter: number;
  dejaImportes: number;
  refuses: number;
  /** Reste dû toutes années après le dernier paiement importé ; null si aucun n'est importé. */
  resteApres: number | null;
};

/** Ce que l'action renvoie à l'écran : pas les 10 000 lignes de paiements, seulement les refusées et un récapitulatif. */
export type RapportRepriseAllege = {
  bloquant: boolean;
  annee: RapportReprise["annee"];
  messages: MessageImport[];
  etudiants: EtudiantRapport[];
  paiementsRefuses: PaiementRefuseRapport[];
  recapPaiements: RecapPaiementsEtudiant[];
  totaux: TotauxReprise;
};

export function allegerRapport(r: RapportReprise): RapportRepriseAllege {
  const recaps = new Map<number, RecapPaiementsEtudiant>();
  const ligneParNumero = new Map(r.etudiants.flatMap((e) => (e.statut !== "refuse" && e.numero ? [[e.numero, e.ligne] as const] : [])));
  for (const p of r.paiements) {
    const ligneEtudiant = p.numeroEtudiant ? ligneParNumero.get(p.numeroEtudiant) : undefined;
    if (ligneEtudiant === undefined || !p.numeroEtudiant) continue;
    const recap = recaps.get(ligneEtudiant) ?? {
      ligneEtudiant, numero: p.numeroEtudiant, aImporter: 0, montantAImporter: 0, dejaImportes: 0, refuses: 0, resteApres: null,
    };
    if (p.statut === "a_importer") {
      recap.aImporter++;
      recap.montantAImporter += p.donnees?.montant ?? 0;
      recap.resteApres = p.resteDuApres;
    } else if (p.statut === "deja_importe") recap.dejaImportes++;
    else recap.refuses++;
    recaps.set(ligneEtudiant, recap);
  }
  return {
    bloquant: r.bloquant,
    annee: r.annee,
    messages: r.messages,
    etudiants: r.etudiants.map((e) => ({
      ligne: e.ligne,
      numero: e.numero,
      statut: e.statut,
      nom: e.donnees?.nom ?? null,
      prenoms: e.donnees?.prenoms ?? null,
      filiere: e.donnees?.filiere ?? null,
      niveau: e.donnees?.niveau ?? null,
      matricule: e.existant?.matricule ?? null,
      duAnnee: e.duAnnee,
    })),
    paiementsRefuses: r.paiements
      .filter((p) => p.statut === "refuse")
      .map((p) => ({ ligne: p.ligne, numeroEtudiant: p.numeroEtudiant, jour: p.donnees?.jour ?? null, montant: p.donnees?.montant ?? null })),
    recapPaiements: r.etudiants.flatMap((e) => (recaps.has(e.ligne) ? [recaps.get(e.ligne)!] : [])),
    totaux: r.totaux,
  };
}

export const PREFIXE_CLE_REPRISE = "reprise:";

const HEURE_REPRISE_MS = 12 * 60 * 60 * 1000;

/** Instant enregistré pour un paiement repris : le jour du fichier à 12:00, heure de Madagascar. */
export function instantReprise(jour: Jour): Date {
  return new Date(debutJourMadagascar(jour).getTime() + HEURE_REPRISE_MS);
}

/** `Paiement.observation` d'un paiement repris. */
export function observationReprise(recuPapier: string | null): string {
  return recuPapier ? `Reprise des données · reçu papier n° ${recuPapier}` : "Reprise des données";
}

export type ElementsClePaiement = {
  nom: string;
  prenoms: string;
  dateNaissance: Jour;
  jour: Jour;
  montant: number;
  mode: string;
  operateur: string | null;
  reference: string | null;
  recuPapier: string | null;
  /** 1 pour le premier de plusieurs paiements identiques du même étudiant, 2 pour le suivant… */
  rang: number;
};

/** Clé déterministe d'un paiement repris : l'étudiant y figure par son identité, présente avant comme après sa création. */
export function cleReprisePaiement(p: ElementsClePaiement): string {
  const elements = [
    normaliserRecherche(p.nom),
    normaliserRecherche(p.prenoms),
    p.dateNaissance,
    p.jour,
    p.montant,
    p.mode,
    p.operateur ?? "",
    (p.reference ?? "").replace(/\s+/g, "").toUpperCase(),
    p.recuPapier ? normaliserRecuPapier(p.recuPapier) : "",
    p.rang,
  ];
  return PREFIXE_CLE_REPRISE + createHash("sha256").update(JSON.stringify(elements)).digest("hex").slice(0, 40);
}

/** Signature du plan, à renvoyer avec la confirmation : l'import refuse un plan qui a changé depuis le rapport. */
export function signatureReprise(canonique: string): string {
  return createHash("sha256").update(canonique).digest("hex");
}

/** Jours de naissance lisibles du fichier : le contexte ne charge que les étudiants nés ces jours-là. */
export function joursNaissanceCites(lu: RepriseLue): Jour[] {
  const jours = new Set<Jour>();
  for (const l of lu.etudiants.lignes) {
    const d = lireDate(l.cellules.dateNaissance);
    if (d.ok) jours.add(d.valeur);
  }
  return [...jours].sort();
}

/** Années civiles des paiements du fichier : compteurs `RECU:{année}` à lire. */
export function anneesPaiementsCitees(lu: RepriseLue): number[] {
  const annees = new Set<number>();
  for (const l of lu.paiements.lignes) {
    const d = lireDate(l.cellules.date);
    if (d.ok) annees.add(anneeCivile(d.valeur));
  }
  return [...annees].sort((a, b) => a - b);
}

const LIGNES_CITEES_MAX = 15;

function lignesCitees(lignes: number[]): string {
  const triees = [...new Set(lignes)].sort((a, b) => a - b);
  if (triees.length === 1) return `ligne ${triees[0]}`;
  const vues = triees.slice(0, LIGNES_CITEES_MAX).join(", ");
  return triees.length > LIGNES_CITEES_MAX ? `lignes ${vues} et ${triees.length - LIGNES_CITEES_MAX} autres` : `lignes ${vues}`;
}

const colonneEtudiant = (cle: CleEtudiant) => COLONNES_ETUDIANTS.find((c) => c.cle === cle)!.entete;
const colonnePaiement = (cle: ClePaiement) => COLONNES_PAIEMENTS.find((c) => c.cle === cle)!.entete;

function comparerNumeros(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", "fr", { numeric: true });
}

function identite(e: { nom: string; prenoms: string; dateNaissance: Jour }): string {
  return `${normaliserRecherche(e.nom)}|${normaliserRecherche(e.prenoms)}|${e.dateNaissance}`;
}

type EcheanceSimulee = { id: string; reste: number; anneeDebut: number };

type Suivi = {
  plan: EtudiantPlan;
  donnees: EtudiantImport;
  echeances: EcheanceSimulee[];
  /** Existant : reste dû sur les années antérieures à l'année courante. */
  impayesAnterieurs: number;
  paiementsHorsReprise: number;
};

const GRAVITE_ORDRE = { erreur: 0, avertissement: 1 } as const;
const FEUILLE_ORDRE = (f: MessageImport["feuille"]) => (f === null ? 0 : f === FEUILLE_ETUDIANTS ? 1 : 2);

function trierMessages(messages: MessageImport[]): MessageImport[] {
  return messages
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        FEUILLE_ORDRE(a.m.feuille) - FEUILLE_ORDRE(b.m.feuille) ||
        (a.m.ligne ?? 0) - (b.m.ligne ?? 0) ||
        GRAVITE_ORDRE[a.m.gravite] - GRAVITE_ORDRE[b.m.gravite] ||
        a.i - b.i,
    )
    .map((x) => x.m);
}

function totaux(etudiants: EtudiantPlan[], paiements: PaiementPlan[], messages: MessageImport[]): TotauxReprise {
  const compter = <T extends { statut: string }>(l: T[], s: T["statut"]) => l.filter((x) => x.statut === s).length;
  return {
    etudiants: {
      lus: etudiants.length,
      nouveaux: compter(etudiants, "nouveau"),
      existants: compter(etudiants, "existant"),
      refuses: compter(etudiants, "refuse"),
    },
    paiements: {
      lus: paiements.length,
      aImporter: compter(paiements, "a_importer"),
      dejaImportes: compter(paiements, "deja_importe"),
      refuses: compter(paiements, "refuse"),
      montantAImporter: paiements.filter((p) => p.statut === "a_importer").reduce((s, p) => s + (p.donnees?.montant ?? 0), 0),
    },
    erreurs: messages.filter((m) => m.gravite === "erreur").length,
    avertissements: messages.filter((m) => m.gravite === "avertissement").length,
  };
}

function canonique(annee: { id: string; libelle: string }, etudiants: EtudiantPlan[], paiements: PaiementPlan[]): string {
  const lignes: unknown[][] = [["annee", annee.id, annee.libelle]];
  for (const e of etudiants) {
    const d = e.donnees;
    if (e.statut === "nouveau" && d && e.tarif) {
      lignes.push([
        "nouveau", e.ligne, e.numero, d.nom, d.prenoms, d.sexe, d.dateNaissance, d.lieuNaissance, d.cin, d.telephone, d.adresse,
        e.filiereId, e.anneeEntreeId, d.anneeEntree, d.niveau, d.redoublant, d.droitsEnTranches,
        e.tarif.droitsInscription, e.tarif.montantMensuel, e.tarif.nombreMois,
      ]);
    } else if (e.statut === "existant" && e.existant) {
      lignes.push(["existant", e.ligne, e.numero, e.existant.id]);
    }
  }
  for (const p of paiements) {
    const d = p.donnees;
    if (p.statut !== "a_importer" || !d) continue;
    lignes.push(["paiement", p.ligne, p.cle, p.ligneEtudiant, d.jour, d.montant, d.mode, d.operateur, d.reference, d.recuPapier, p.resteDuAvant]);
  }
  return lignes.map((l) => JSON.stringify(l)).join("\n");
}

function sansPlan(lu: RepriseLue, messages: MessageImport[], annee: RapportReprise["annee"]): RapportReprise {
  const tries = trierMessages(messages);
  return {
    bloquant: true,
    annee,
    messages: tries,
    etudiants: [],
    paiements: [],
    totaux: {
      ...totaux([], [], tries),
      etudiants: { lus: lu.etudiants.lignes.length, nouveaux: 0, existants: 0, refuses: 0 },
      paiements: { lus: lu.paiements.lignes.length, aImporter: 0, dejaImportes: 0, refuses: 0, montantAImporter: 0 },
    },
    canonique: "",
  };
}

/**
 * Rapport et plan d'import, sans rien écrire. `jour` : jour de l'analyse à Madagascar.
 * Un fichier avec une seule erreur n'importe rien (`bloquant`) ; le plan reste détaillé pour la corriger.
 */
export function analyserReprise(lu: RepriseLue, ctx: ContexteReprise, jour: Jour): RapportReprise {
  const messages: MessageImport[] = [...lu.messages];
  const ajouter = (gravite: MessageImport["gravite"], raison: string, lieu: LieuMessage = {}) =>
    messages.push(messageImport(gravite, raison, lieu));

  const annee = ctx.anneeCourante;
  if (!annee) {
    ajouter("erreur", "Aucune année scolaire courante : définissez-la dans Paramètres › Années avant d'importer.");
    return sansPlan(lu, messages, null);
  }
  const anneeRapport = { id: annee.id, libelle: annee.libelle };
  if (annee.cloturee) {
    ajouter("erreur", `L'année ${annee.libelle} est clôturée : aucune inscription n'est possible. Définissez l'année courante dans Paramètres › Années.`);
    return sansPlan(lu, messages, anneeRapport);
  }
  if (messages.some((m) => m.gravite === "erreur")) return sansPlan(lu, messages, anneeRapport);

  const enteteNiveau = lu.etudiants.entetes.niveau ?? colonneEtudiant("niveau");
  if (lu.anneeNiveau !== annee.libelle) {
    ajouter(
      "erreur",
      lu.anneeNiveau
        ? `cet en-tête ne correspond pas à l'année courante ${annee.libelle} : téléchargez le modèle de ${annee.libelle} et recopiez-y vos données.`
        : `l'en-tête doit dire l'année : « Niveau ${annee.libelle} ». Téléchargez le modèle de l'année courante.`,
      { feuille: FEUILLE_ETUDIANTS, ligne: lu.etudiants.ligneEntetes, colonne: enteteNiveau },
    );
  }
  if (lu.etudiants.lignes.length === 0) ajouter("erreur", "la feuille ne contient aucun étudiant.", { feuille: FEUILLE_ETUDIANTS });

  const cadre = { jour, dateDebutAnnee: annee.dateDebut };
  const ve = validerEtudiants(lu.etudiants, cadre);
  const numerosLus = new Set([...ve.valides.map((e) => e.numero), ...ve.refusees.flatMap((r) => (r.numero ? [r.numero] : []))]);
  const vp = validerPaiements(lu.paiements, numerosLus, cadre);
  messages.push(...ve.messages, ...vp.messages);

  const filiereParCode = new Map(ctx.filieres.map((f) => [f.code.toUpperCase(), f]));
  const filiereParId = new Map(ctx.filieres.map((f) => [f.id, f]));
  const anneeParDebut = new Map(ctx.annees.map((a) => [a.anneeDebut, a]));
  const tarifs = new Map(ctx.tarifs.map((t) => [`${t.filiereId}:${t.niveau}`, t]));
  const candidatsParJour = new Map<Jour, EtudiantEnBase[]>();
  for (const e of ctx.etudiantsEnBase) {
    const j = jourDeDate(e.dateNaissance);
    candidatsParJour.set(j, [...(candidatsParJour.get(j) ?? []), e]);
  }
  const parIdentite = new Map<string, number[]>();
  for (const e of ve.valides) parIdentite.set(identite(e), [...(parIdentite.get(identite(e)) ?? []), e.ligne]);

  const etudiants: EtudiantPlan[] = [];
  const suivis = new Map<string, Suivi>();
  const anneesManquantes = new Map<number, number[]>();
  const tarifsManquants = new Map<string, { filiere: FiliereReprise; niveau: number; lignes: number[] }>();

  for (const e of ve.valides) {
    const plan: EtudiantPlan = {
      ligne: e.ligne, numero: e.numero, statut: "refuse", donnees: e,
      filiereId: null, anneeEntreeId: null, tarif: null, duAnnee: null, existant: null,
    };
    etudiants.push(plan);
    let refuse = false;
    const ici = (gravite: MessageImport["gravite"], cle: CleEtudiant | null, raison: string, valeur: string | null = null) => {
      if (gravite === "erreur") refuse = true;
      ajouter(gravite, raison, { feuille: FEUILLE_ETUDIANTS, ligne: e.ligne, colonne: cle ? colonneEtudiant(cle) : null, valeur });
    };

    const memes = parIdentite.get(identite(e))!;
    if (memes.length > 1) {
      ici("erreur", "nom", `même nom, prénoms et date de naissance qu'à la ${lignesCitees(memes.filter((l) => l !== e.ligne))} : un étudiant ne figure qu'une fois.`, e.nom);
      continue;
    }

    const naissance = dateDuJour(e.dateNaissance);
    const candidats = (candidatsParJour.get(e.dateNaissance) ?? []).filter((c) =>
      estDoublon(c, { nom: e.nom, prenoms: e.prenoms, dateNaissance: naissance }),
    );
    if (candidats.length > 1) {
      ici("erreur", "nom", `plusieurs étudiants en base portent ce nom, ces prénoms et cette date de naissance (${candidats.map((c) => c.matricule).join(", ")}) : l'import ne sait pas lequel compléter.`, e.nom);
      continue;
    }

    if (candidats.length === 1) {
      const c = candidats[0];
      plan.existant = { id: c.id, matricule: c.matricule };
      const filiereBase = filiereParId.get(c.filiereId);
      if (filiereBase?.code.toUpperCase() !== e.filiere) {
        ici("erreur", "filiere", `étudiant déjà en base (${c.matricule}) en filière ${filiereBase?.code ?? "inconnue"} : la filière d'un étudiant ne change pas, corrigez le fichier.`, e.filiere);
      }
      const insc = c.inscriptionCourante;
      if (!insc) {
        ici("erreur", "niveau", `étudiant déjà en base (${c.matricule}) sans inscription en ${annee.libelle} : inscrivez-le (Admissions) ou retirez la ligne du fichier.`, String(e.niveau));
      } else if (insc.niveau !== e.niveau) {
        ici("erreur", "niveau", `étudiant déjà en base (${c.matricule}), inscrit en ${libelleNiveau(insc.niveau)} en ${annee.libelle} : corrigez le niveau du fichier.`, String(e.niveau));
      }
      if (refuse) continue;
      plan.statut = "existant";
      ici("avertissement", "nom", `déjà en base sous le matricule ${c.matricule} : il n'est pas recréé, ses paiements sont rattachés à sa fiche.`, e.nom);
      if (insc && insc.redoublement !== e.redoublant) {
        ici("avertissement", "redoublant", `la base l'indique ${insc.redoublement ? "redoublant" : "non redoublant"} : la base fait foi.`, e.redoublant ? "oui" : "non");
      }
      if (insc && insc.droitsEnTranches !== e.droitsEnTranches) {
        ici("avertissement", "droitsEnTranches", `droits en ${insc.droitsEnTranches} fois dans la base : la base fait foi.`, String(e.droitsEnTranches));
      }
      if (c.anneeEntree !== e.anneeEntree) {
        ici("avertissement", "anneeEntree", `année d'entrée ${c.anneeEntree} dans la base : le matricule ${c.matricule} est conservé.`, String(e.anneeEntree));
      }
      if (c.statut !== "ACTIF") {
        ici("avertissement", "nom", `étudiant sorti (${LIBELLE_STATUT_ETUDIANT[c.statut]}) : ses paiements sont imputés quand même.`, e.nom);
      }
      const echeances = trierPourSolde(c.echeances.filter((x) => !x.nonDueSortie)).map((x) => ({
        id: x.id,
        reste: Math.max(0, x.montantDu - x.paye),
        anneeDebut: x.anneeDebut,
      }));
      suivis.set(e.numero, {
        plan,
        donnees: e,
        echeances,
        impayesAnterieurs: echeances.filter((x) => x.anneeDebut < annee.anneeDebut).reduce((s, x) => s + x.reste, 0),
        paiementsHorsReprise: c.paiementsHorsReprise,
      });
      continue;
    }

    const filiere = filiereParCode.get(e.filiere);
    if (!filiere) {
      const codes = ctx.filieres.filter((f) => f.actif).map((f) => f.code).join(", ");
      ici("erreur", "filiere", `filière inconnue${codes ? ` (filières : ${codes})` : ""} : corrigez le code ou créez la filière dans Paramètres › Filières.`, e.filiere);
    } else if (!filiere.actif) {
      ici("erreur", "filiere", `la filière ${filiere.code} est désactivée : elle n'accepte plus d'inscription.`, e.filiere);
    } else if (e.niveau > filiere.dureeAnnees) {
      ici("erreur", "niveau", `la filière ${filiere.code} dure ${filiere.dureeAnnees} ans : pas de ${libelleNiveau(e.niveau)}.`, String(e.niveau));
    }

    const anneeEntree = anneeParDebut.get(e.anneeEntree);
    if (e.anneeEntree > annee.anneeDebut) {
      ici("erreur", "anneeEntree", `année d'entrée postérieure à l'année courante ${annee.libelle}.`, String(e.anneeEntree));
    } else if (!anneeEntree) {
      refuse = true;
      anneesManquantes.set(e.anneeEntree, [...(anneesManquantes.get(e.anneeEntree) ?? []), e.ligne]);
    } else {
      const attendu = annee.anneeDebut - e.anneeEntree + 1;
      if (e.redoublant && e.anneeEntree === annee.anneeDebut) {
        ici("avertissement", "redoublant", `redoublant, mais entré cette année (${e.anneeEntree}) : vérifiez l'année d'entrée.`, "oui");
      } else if (e.niveau > attendu) {
        ici("avertissement", "niveau", `${libelleNiveau(e.niveau)} pour une entrée en ${e.anneeEntree} : inscription directe dans ce niveau ? Sinon, corrigez l'année d'entrée.`, String(e.niveau));
      } else if (e.niveau < attendu && !e.redoublant) {
        ici("avertissement", "niveau", `entré en ${e.anneeEntree}, il serait en ${libelleNiveau(attendu)} : indiquez « oui » dans Redoublant, ou corrigez l'année d'entrée.`, String(e.niveau));
      }
    }

    if (filiere && filiere.actif && e.niveau <= filiere.dureeAnnees) {
      const tarif = tarifs.get(`${filiere.id}:${e.niveau}`);
      if (!tarif) {
        refuse = true;
        const cle = `${filiere.id}:${e.niveau}`;
        const groupe = tarifsManquants.get(cle) ?? { filiere, niveau: e.niveau, lignes: [] };
        groupe.lignes.push(e.ligne);
        tarifsManquants.set(cle, groupe);
      } else {
        const refusTranches = controleTranches(tarif.droitsInscription, e.droitsEnTranches);
        if (refusTranches) ici("erreur", "droitsEnTranches", refusTranches, String(e.droitsEnTranches));
        else if (!refuse && anneeEntree) {
          const montants = { droitsInscription: tarif.droitsInscription, montantMensuel: tarif.montantMensuel, nombreMois: tarif.nombreMois };
          try {
            const generees = genererEcheances(montants, annee, e.droitsEnTranches);
            plan.statut = "nouveau";
            plan.filiereId = filiere.id;
            plan.anneeEntreeId = anneeEntree.id;
            plan.tarif = montants;
            plan.duAnnee = generees.reduce((s, g) => s + g.montantDu, 0);
            suivis.set(e.numero, {
              plan,
              donnees: e,
              echeances: generees.map((g) => ({ id: `ligne${e.ligne}:${g.ordre}`, reste: g.montantDu, anneeDebut: annee.anneeDebut })),
              impayesAnterieurs: 0,
              paiementsHorsReprise: 0,
            });
          } catch (err) {
            if (!(err instanceof RangeError)) throw err;
            ici("erreur", "niveau", err.message, String(e.niveau));
          }
        }
      }
    }
  }

  for (const [debut, lignes] of [...anneesManquantes].sort((a, b) => a[0] - b[0])) {
    ajouter("erreur", `l'année ${libelleAnnee(debut)} n'existe pas (${lignesCitees(lignes)}) : créez l'année ${libelleAnnee(debut)} dans Paramètres › Années, puis clôturez-la.`, {
      feuille: FEUILLE_ETUDIANTS,
      colonne: colonneEtudiant("anneeEntree"),
      valeur: String(debut),
    });
  }
  for (const g of tarifsManquants.values()) {
    ajouter("erreur", `tarif manquant pour ${g.filiere.nom} ${libelleNiveau(g.niveau)} en ${annee.libelle} (${lignesCitees(g.lignes)}) : saisissez-le dans Paramètres › Tarifs.`, {
      feuille: FEUILLE_ETUDIANTS,
      colonne: colonneEtudiant("niveau"),
    });
  }

  for (const r of ve.refusees) {
    etudiants.push({
      ligne: r.ligne, numero: r.numero, statut: "refuse", donnees: null,
      filiereId: null, anneeEntreeId: null, tarif: null, duAnnee: null, existant: null,
    });
  }

  const lignesRefuseesParNumero = new Map<string, number[]>();
  for (const r of ve.refusees) if (r.numero) lignesRefuseesParNumero.set(r.numero, [...(lignesRefuseesParNumero.get(r.numero) ?? []), r.ligne]);
  for (const e of etudiants) {
    if (e.statut === "refuse" && e.donnees) lignesRefuseesParNumero.set(e.donnees.numero, [e.ligne]);
  }

  const paiements: PaiementPlan[] = [];
  const parEtudiant = new Map<string, PaiementImport[]>();
  for (const p of vp.valides) {
    const suivi = suivis.get(p.numeroEtudiant);
    if (!suivi) {
      const lignes = lignesRefuseesParNumero.get(p.numeroEtudiant) ?? [];
      paiements.push({
        ligne: p.ligne, numeroEtudiant: p.numeroEtudiant, ligneEtudiant: lignes.length === 1 ? lignes[0] : null, statut: "refuse",
        donnees: p, cle: null, resteDuAvant: null, resteDuApres: null, anneeRecu: null,
      });
      ajouter("erreur", `refusé car l'étudiant de ce N° est refusé (Étudiants, ${lignesCitees(lignes)}) : corrigez d'abord cet étudiant.`, {
        feuille: FEUILLE_PAIEMENTS,
        ligne: p.ligne,
        colonne: colonnePaiement("numeroEtudiant"),
        valeur: p.numeroEtudiant,
      });
      continue;
    }
    parEtudiant.set(p.numeroEtudiant, [...(parEtudiant.get(p.numeroEtudiant) ?? []), p]);
  }

  for (const [numero, liste] of parEtudiant) {
    const suivi = suivis.get(numero)!;
    const ordonnes = [...liste].sort((a, b) => a.jour.localeCompare(b.jour) || a.ligne - b.ligne);
    const rangs = new Map<string, number>();
    let importes = 0;
    for (const p of ordonnes) {
      const elements = {
        nom: suivi.donnees.nom, prenoms: suivi.donnees.prenoms, dateNaissance: suivi.donnees.dateNaissance,
        jour: p.jour, montant: p.montant, mode: p.mode, operateur: p.operateur, reference: p.reference, recuPapier: p.recuPapier,
      };
      const signature = JSON.stringify(elements);
      const rang = (rangs.get(signature) ?? 0) + 1;
      rangs.set(signature, rang);
      const cle = cleReprisePaiement({ ...elements, rang });
      const plan: PaiementPlan = {
        ligne: p.ligne, numeroEtudiant: numero, ligneEtudiant: suivi.plan.ligne, statut: "refuse",
        donnees: p, cle, resteDuAvant: null, resteDuApres: null, anneeRecu: null,
      };
      paiements.push(plan);
      if (ctx.clesReprise.has(cle)) {
        plan.statut = "deja_importe";
        continue;
      }
      const nonSoldees = suivi.echeances.filter((x) => x.reste > 0);
      const avant = resteDuTotal(nonSoldees);
      const repartition = repartirPaiement(nonSoldees, p.montant);
      if (!repartition.ok) {
        ajouter(
          "erreur",
          avant === 0
            ? `l'étudiant n° ${numero} n'a plus rien à payer après les paiements précédents : trop-perçu refusé.`
            : `${formaterAriary(p.montant)} dépasse le reste dû de l'étudiant n° ${numero} (${formaterAriary(avant)} après les paiements précédents) : trop-perçu refusé.`,
          { feuille: FEUILLE_PAIEMENTS, ligne: p.ligne, colonne: colonnePaiement("montant"), valeur: String(p.montant) },
        );
        continue;
      }
      const restes = new Map(repartition.lignes.map((l) => [l.echeanceId, l.resteEcheance]));
      for (const x of suivi.echeances) if (restes.has(x.id)) x.reste = restes.get(x.id)!;
      plan.statut = "a_importer";
      plan.resteDuAvant = avant;
      plan.resteDuApres = repartition.resteDuApres;
      plan.anneeRecu = anneeCivile(p.jour);
      importes++;
    }
    if (importes > 0 && suivi.plan.statut === "existant") {
      const lieu = { feuille: FEUILLE_ETUDIANTS, ligne: suivi.plan.ligne, colonne: colonneEtudiant("nom"), valeur: suivi.donnees.nom } as const;
      if (suivi.impayesAnterieurs > 0) {
        ajouter("avertissement", `ses impayés des années précédentes (${formaterAriary(suivi.impayesAnterieurs)}) seront soldés en premier par les paiements repris, comme au guichet.`, lieu);
      }
      const n = suivi.paiementsHorsReprise;
      if (n > 0) {
        ajouter(
          "avertissement",
          n === 1
            ? "1 paiement déjà saisi au guichet : vérifiez que le fichier ne le reprend pas une seconde fois."
            : `${n} paiements déjà saisis au guichet : vérifiez que le fichier ne les reprend pas une seconde fois.`,
          lieu,
        );
      }
    }
  }

  for (const r of vp.refusees) {
    paiements.push({
      ligne: r.ligne, numeroEtudiant: r.numero, ligneEtudiant: null, statut: "refuse",
      donnees: null, cle: null, resteDuAvant: null, resteDuApres: null, anneeRecu: null,
    });
  }

  const anneesRecus = [...new Set(paiements.flatMap((p) => (p.anneeRecu !== null ? [p.anneeRecu] : [])))].sort();
  for (const a of anneesRecus) {
    const valeur = ctx.compteursRecu[a] ?? 0;
    if (valeur > 0) {
      ajouter(
        "avertissement",
        `des reçus ${a} existent déjà (jusqu'à ${formaterNumeroRecu(a, Math.min(valeur, SEQUENCE_RECU_MAX))}) : les reçus de reprise prendront les numéros suivants et ne suivront plus l'ordre des dates.`,
        { feuille: FEUILLE_PAIEMENTS },
      );
    }
  }

  etudiants.sort((a, b) => {
    if (!a.donnees || !b.donnees) return a.donnees ? -1 : b.donnees ? 1 : a.ligne - b.ligne;
    return (
      a.donnees.filiere.localeCompare(b.donnees.filiere) ||
      a.donnees.anneeEntree - b.donnees.anneeEntree ||
      comparerNumeros(a.numero, b.numero) ||
      a.ligne - b.ligne
    );
  });
  paiements.sort((a, b) => {
    if (!a.donnees || !b.donnees) return a.donnees ? -1 : b.donnees ? 1 : a.ligne - b.ligne;
    return a.donnees.jour.localeCompare(b.donnees.jour) || a.ligne - b.ligne;
  });

  const aEcrire = etudiants.some((e) => e.statut === "nouveau") || paiements.some((p) => p.statut === "a_importer");
  if (!aEcrire && !messages.some((m) => m.gravite === "erreur")) {
    ajouter("avertissement", "Rien à importer : les étudiants et les paiements du fichier sont déjà en base.");
  }

  const tries = trierMessages(messages);
  return {
    bloquant: tries.some((m) => m.gravite === "erreur"),
    annee: anneeRapport,
    messages: tries,
    etudiants,
    paiements,
    totaux: totaux(etudiants, paiements, tries),
    canonique: canonique(anneeRapport, etudiants, paiements),
  };
}
