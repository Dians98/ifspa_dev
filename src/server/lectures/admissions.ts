import "server-only";
import { cache } from "react";
import type { DecisionAdmission } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  compterDecisions,
  decisionsPossibles,
  estDerniereAnnee,
  etatClasse,
  LIBELLE_ETAT_CLASSE,
  libelleClasse,
  libelleDecision,
  MESSAGE_TARIFS,
  resumeDecisions,
  type ComptesDecisions,
  type EtatClasse,
} from "@/lib/admissions";
import { dateHeureMadagascar, jourMadagascar, type Jour } from "@/lib/dates";
import { dateLimiteRetard } from "@/lib/ecolage";
import { libelleNiveau } from "@/lib/parametres";
import { roleDe } from "@/lib/permissions";
import { exigerSession } from "@/server/acces";
import { dossiersAnnulation, passageCourant, type RecuBloquant } from "@/server/admissions";

type AnneeAffichee = { id: string; libelle: string };

export type OperationResume = {
  id: string;
  dateISO: string;
  /** « 11/10/2026 » et « 10:24 », heure de Madagascar */
  date: string;
  heure: string;
  par: string;
};

export type ClasseAdmission = {
  /** `${filiereId}:${niveau}` */
  cle: string;
  filiere: { id: string; code: string; nom: string; dureeAnnees: number; actif: boolean };
  niveau: number;
  /** « 1re année » */
  libelleNiveau: string;
  /** « Infirmier(e)s 1re année » */
  libelle: string;
  /** Inscriptions en cours d'étudiants actifs sur l'année source. */
  effectif: number;
  derniereAnnee: boolean;
  etat: EtatClasse;
  libelleEtat: string;
  /** Raison affichable pour « tarif manquant » ou « année suivante à créer », sinon null. */
  blocage: string | null;
  /** Tarif du même niveau absent de l'année cible : choisir « Redouble » sera refusé. */
  tarifRedoublementManquant: boolean;
  /** Dernière opération non annulée de la classe. */
  operation: OperationResume | null;
};

export type EcranAdmissions = {
  source: AnneeAffichee | null;
  /** null : l'année suivante n'existe pas encore. */
  cible: AnneeAffichee | null;
  /** « 2027-2028 », même si elle n'existe pas encore. */
  libelleCible: string | null;
  /** Passage impossible pour toutes les classes (message à afficher avec un lien vers Paramètres › Années), sinon null. */
  refus: string | null;
  /** Par code de filière puis niveau ; les classes « vide » sont incluses, à griser. */
  classes: ClasseAdmission[];
  /** « 2 classes validées sur 6 » (les classes vides ne comptent pas). */
  avancement: { validees: number; total: number; libelle: string };
};

function resumeOperation(o: { id: string; createdAt: Date; creePar: { name: string } }): OperationResume {
  const { date, heure } = dateHeureMadagascar(o.createdAt);
  return { id: o.id, dateISO: o.createdAt.toISOString(), date, heure, par: o.creePar.name };
}

function libelleAvancement(validees: number, total: number): string {
  return `${validees} classe${validees > 1 ? "s" : ""} validée${validees > 1 ? "s" : ""} sur ${total}`;
}

/**
 * Années du passage et liste des classes (filière × niveau) avec effectif, état et dernière opération.
 * Mémorisée par requête : le layout, la page et `lireClasse` la partagent.
 */
export const lireEcranAdmissions = cache(async (): Promise<EcranAdmissions> => {
  await exigerSession();
  const passage = await passageCourant(db);
  const { source, cible } = passage;
  if (!source) {
    return {
      source: null,
      cible: null,
      libelleCible: null,
      refus: passage.refus,
      classes: [],
      avancement: { validees: 0, total: 0, libelle: libelleAvancement(0, 0) },
    };
  }

  const [filieres, effectifs, operations, tarifs] = await Promise.all([
    db.filiere.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nom: true, dureeAnnees: true, actif: true } }),
    db.$queryRaw<{ filiereId: string; niveau: number; n: number }[]>`
      SELECT e."filiereId", i.niveau, COUNT(*)::int AS n
      FROM inscription i JOIN etudiant e ON e.id = i."etudiantId"
      WHERE i."anneeScolaireId" = ${source.id} AND i.statut = 'EN_COURS' AND e.statut = 'ACTIF'
      GROUP BY e."filiereId", i.niveau`,
    db.operationAdmission.findMany({
      where: { anneeSourceId: source.id, annulee: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, filiereId: true, niveauSource: true, createdAt: true, creePar: { select: { name: true } } },
    }),
    cible
      ? db.tarif.findMany({ where: { anneeScolaireId: cible.id }, select: { filiereId: true, niveau: true } })
      : Promise.resolve([]),
  ]);
  const effectifDe = new Map(effectifs.map((e) => [`${e.filiereId}:${e.niveau}`, e.n]));
  const tarifPresent = new Set(tarifs.map((t) => `${t.filiereId}:${t.niveau}`));
  const cibleDisponible = passage.refus === null && cible !== null;

  const classes: ClasseAdmission[] = [];
  for (const f of filieres) {
    const niveauxInscrits = effectifs.filter((e) => e.filiereId === f.id).map((e) => e.niveau);
    const opsFiliere = operations.filter((o) => o.filiereId === f.id);
    // Une filière désactivée garde ses classes tant qu'il lui reste des inscrits ou une opération.
    if (!f.actif && niveauxInscrits.length === 0 && opsFiliere.length === 0) continue;
    const niveauMax = Math.max(f.dureeAnnees, ...niveauxInscrits);
    for (let niveau = 1; niveau <= niveauMax; niveau++) {
      const cle = `${f.id}:${niveau}`;
      const effectif = effectifDe.get(cle) ?? 0;
      const derniere = estDerniereAnnee(niveau, f.dureeAnnees);
      const derniereOp = opsFiliere.find((o) => o.niveauSource === niveau) ?? null;
      const tarifRequisPresent = derniere || tarifPresent.has(`${f.id}:${niveau + 1}`);
      const etat = etatClasse({ effectif, operationActive: derniereOp !== null, cibleDisponible, tarifRequisPresent });
      let blocage: string | null = null;
      if (etat === "cible_absente") blocage = passage.refus;
      if (etat === "tarif_manquant") {
        blocage = `Tarif manquant pour ${libelleClasse(f.nom, niveau + 1)} en ${cible?.libelle ?? passage.libelleCible} : ${MESSAGE_TARIFS}`;
      }
      classes.push({
        cle,
        filiere: f,
        niveau,
        libelleNiveau: libelleNiveau(niveau),
        libelle: libelleClasse(f.nom, niveau),
        effectif,
        derniereAnnee: derniere,
        etat,
        libelleEtat: LIBELLE_ETAT_CLASSE[etat],
        blocage,
        tarifRedoublementManquant: cible !== null && !tarifPresent.has(cle),
        operation: derniereOp ? resumeOperation(derniereOp) : null,
      });
    }
  }

  const comptees = classes.filter((c) => c.etat !== "vide");
  const validees = comptees.filter((c) => c.etat === "validee").length;
  return {
    source: { id: source.id, libelle: source.libelle },
    cible: cible ? { id: cible.id, libelle: cible.libelle } : null,
    libelleCible: passage.libelleCible,
    refus: passage.refus,
    classes,
    avancement: { validees, total: comptees.length, libelle: libelleAvancement(validees, comptees.length) },
  };
});

export type EtudiantClasse = {
  inscriptionId: string;
  etudiantId: string;
  matricule: string;
  nom: string;
  prenoms: string;
  /** Pour information : reste en retard sur l'année source, qui reste dû sur cette année. */
  impayeEnRetard: number;
  moisEnRetard: number;
};

export type LigneOperationClasse = {
  etudiantId: string;
  matricule: string;
  nom: string;
  prenoms: string;
  decision: DecisionAdmission;
  /** « Passe en 2e année », « Diplômé(e) », « Redouble », « Abandon » */
  libelleDecision: string;
};

export type OperationClasse = OperationResume & {
  comptes: ComptesDecisions;
  /** « 40 passent en 2e année · 1 redouble · 1 abandon » */
  resume: string;
  /** Par ordre alphabétique. */
  lignes: LigneOperationClasse[];
  annulable: boolean;
  refusAnnulation: string | null;
};

export type ClasseDetail = {
  source: AnneeAffichee;
  cible: AnneeAffichee | null;
  classe: ClasseAdmission;
  /** Décision par défaut en tête (case cochée), puis Redouble et Abandon. */
  decisions: { decision: DecisionAdmission; libelle: string }[];
  /** Étudiants à valider (inscriptions en cours d'étudiants actifs), par ordre alphabétique. */
  etudiants: EtudiantClasse[];
  /** Opérations non annulées de la classe, de la plus récente à la plus ancienne. */
  operations: OperationClasse[];
  /** Rôle admin : bouton « Annuler le passage ». */
  peutAnnuler: boolean;
  jour: Jour;
};

const parNom = (a: { nom: string; prenoms: string }, b: { nom: string; prenoms: string }) =>
  a.nom.localeCompare(b.nom, "fr") || a.prenoms.localeCompare(b.prenoms, "fr");

/** Détail d'une classe de l'année source ; null si la classe n'existe pas dans le passage en cours. */
export async function lireClasse(
  filiereId: string,
  niveau: number,
  jour: Jour = jourMadagascar(new Date()),
): Promise<ClasseDetail | null> {
  const session = await exigerSession();
  const ecran = await lireEcranAdmissions();
  const classe = ecran.classes.find((c) => c.filiere.id === filiereId && c.niveau === niveau);
  if (!ecran.source || !classe) return null;
  const sourceId = ecran.source.id;

  const [inscriptions, operations] = await Promise.all([
    db.inscription.findMany({
      where: { anneeScolaireId: sourceId, niveau, statut: "EN_COURS", etudiant: { filiereId, statut: "ACTIF" } },
      select: { id: true, etudiant: { select: { id: true, matricule: true, nom: true, prenoms: true } } },
    }),
    db.operationAdmission.findMany({
      where: { anneeSourceId: sourceId, filiereId, niveauSource: niveau, annulee: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        creePar: { select: { name: true } },
        lignes: { select: { decision: true, etudiant: { select: { id: true, matricule: true, nom: true, prenoms: true } } } },
      },
    }),
  ]);
  const ids = inscriptions.map((i) => i.id);
  const jourLimite = dateLimiteRetard(jour).toISOString().slice(0, 10);
  const [retards, dossiers] = await Promise.all([
    ids.length
      ? db.$queryRaw<{ inscriptionId: string; reste: number; mois: number }[]>`
          SELECT x."inscriptionId", COALESCE(SUM(x.reste), 0)::int AS reste, COUNT(DISTINCT x.mois)::int AS mois
          FROM (
            SELECT ec."inscriptionId", ec.mois,
              ec."montantDu" - COALESCE(SUM(pl.montant) FILTER (WHERE NOT p.annule), 0) AS reste
            FROM echeance ec
            LEFT JOIN paiement_ligne pl ON pl."echeanceId" = ec.id
            LEFT JOIN paiement p ON p.id = pl."paiementId"
            WHERE ec."inscriptionId" = ANY(${ids}) AND NOT ec."nonDueSortie" AND ec.mois < ${jourLimite}::date
            GROUP BY ec.id
          ) x
          WHERE x.reste > 0
          GROUP BY x."inscriptionId"`
      : Promise.resolve([]),
    dossiersAnnulation(db, operations.map((o) => o.id)),
  ]);
  const retardDe = new Map(retards.map((r) => [r.inscriptionId, r]));

  return {
    source: ecran.source,
    cible: ecran.cible,
    classe,
    decisions: decisionsPossibles(niveau, classe.filiere.dureeAnnees).map((d) => ({ decision: d, libelle: libelleDecision(d, niveau) })),
    etudiants: inscriptions
      .map((i) => ({
        inscriptionId: i.id,
        etudiantId: i.etudiant.id,
        matricule: i.etudiant.matricule,
        nom: i.etudiant.nom,
        prenoms: i.etudiant.prenoms,
        impayeEnRetard: retardDe.get(i.id)?.reste ?? 0,
        moisEnRetard: retardDe.get(i.id)?.mois ?? 0,
      }))
      .sort(parNom),
    operations: operations.map((o) => {
      const comptes = compterDecisions(o.lignes);
      const dossier = dossiers.get(o.id);
      const refus = dossier ? dossier.refus : "Opération introuvable. Rechargez la page.";
      return {
        ...resumeOperation(o),
        comptes,
        resume: resumeDecisions(comptes, niveau),
        lignes: o.lignes
          .map((l) => ({
            etudiantId: l.etudiant.id,
            matricule: l.etudiant.matricule,
            nom: l.etudiant.nom,
            prenoms: l.etudiant.prenoms,
            decision: l.decision,
            libelleDecision: libelleDecision(l.decision, niveau),
          }))
          .sort(parNom),
        annulable: refus === null,
        refusAnnulation: refus,
      };
    }),
    peutAnnuler: roleDe(session) === "admin",
    jour,
  };
}

export type OperationHistorique = OperationResume & {
  classe: string;
  filiereCode: string;
  niveau: number;
  anneeSource: string;
  anneeCible: string;
  comptes: ComptesDecisions;
  resume: string;
  annulee: boolean;
  annulation: { date: string; heure: string; par: string } | null;
  /** Annulable par l'admin ; false pour une opération déjà annulée. */
  annulable: boolean;
  refusAnnulation: string | null;
};

export const TAILLE_HISTORIQUE = 200;

/** Opérations de passage, de la plus récente à la plus ancienne, annulées comprises. */
export async function lireHistorique(): Promise<{ operations: OperationHistorique[]; peutAnnuler: boolean }> {
  const session = await exigerSession();
  const operations = await db.operationAdmission.findMany({
    orderBy: { createdAt: "desc" },
    take: TAILLE_HISTORIQUE,
    select: {
      id: true,
      createdAt: true,
      niveauSource: true,
      annulee: true,
      dateAnnulation: true,
      creePar: { select: { name: true } },
      annuleePar: { select: { name: true } },
      filiere: { select: { code: true, nom: true } },
      anneeSource: { select: { libelle: true } },
      anneeCible: { select: { libelle: true } },
      lignes: { select: { decision: true } },
    },
  });
  const dossiers = await dossiersAnnulation(
    db,
    operations.filter((o) => !o.annulee).map((o) => o.id),
  );

  return {
    peutAnnuler: roleDe(session) === "admin",
    operations: operations.map((o) => {
      const comptes = compterDecisions(o.lignes);
      const refus = o.annulee ? "Ce passage est déjà annulé." : (dossiers.get(o.id)?.refus ?? null);
      const annulation = o.annulee && o.dateAnnulation ? dateHeureMadagascar(o.dateAnnulation) : null;
      return {
        ...resumeOperation(o),
        classe: libelleClasse(o.filiere.nom, o.niveauSource),
        filiereCode: o.filiere.code,
        niveau: o.niveauSource,
        anneeSource: o.anneeSource.libelle,
        anneeCible: o.anneeCible.libelle,
        comptes,
        resume: resumeDecisions(comptes, o.niveauSource),
        annulee: o.annulee,
        annulation: annulation ? { date: annulation.date, heure: annulation.heure, par: o.annuleePar?.name ?? "" } : null,
        annulable: refus === null,
        refusAnnulation: refus,
      };
    }),
  };
}

export type BlocageAnnulation = {
  annulable: boolean;
  refus: string | null;
  /** Reçus qui bloquent l'annulation, pour en faire des liens vers `/app/paiements/<id>/recu`. */
  recusBloquants: RecuBloquant[];
};

/** Pour la boîte de confirmation : null si l'opération n'existe pas. */
export async function lireBlocageAnnulation(operationId: string): Promise<BlocageAnnulation | null> {
  await exigerSession();
  const dossier = (await dossiersAnnulation(db, [operationId])).get(operationId);
  if (!dossier) return null;
  return { annulable: dossier.refus === null, refus: dossier.refus, recusBloquants: dossier.recusBloquants };
}
