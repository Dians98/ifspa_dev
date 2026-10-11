import "server-only";
import { db } from "@/lib/db";
import {
  controleCloture,
  controleDefinirCourante,
  controleReouverture,
  controleSuppressionAnnee,
  controleSuppressionFiliere,
  DUREE_MIN,
  etatAnnee,
  grilleTarifs,
  jourISO,
  LIBELLE_ETAT_ANNEE,
  libelleNiveau,
  periodeAnnee,
  type CaseGrille,
  type EtatAnnee,
} from "@/lib/parametres";

// Lectures sans contrôle de rôle : la page appelle `requireAdminPage()`, et les filières/années
// serviront aussi aux écrans du secrétariat (inscription, encaissement).

export type FiliereParametre = {
  id: string;
  code: string;
  nom: string;
  dureeAnnees: number;
  actif: boolean;
  etudiantsActifs: number;
  etudiantsTotal: number;
  /** false dès qu'un étudiant existe dans la filière (le code fait partie du matricule). */
  codeModifiable: boolean;
  /** Durée minimale autorisée : le plus haut niveau déjà inscrit (au moins 1). */
  dureeMinimale: number;
  /** null si la filière peut être supprimée, sinon la raison affichable. */
  refusSuppression: string | null;
};

async function niveauxMaxParFiliere(): Promise<Map<string, number>> {
  const lignes = await db.$queryRaw<{ filiereId: string; niveauMax: number }[]>`
    SELECT e."filiereId" AS "filiereId", MAX(i.niveau)::int AS "niveauMax"
    FROM inscription i JOIN etudiant e ON e.id = i."etudiantId"
    GROUP BY e."filiereId"`;
  return new Map(lignes.map((l) => [l.filiereId, l.niveauMax]));
}

export async function lireFilieres(): Promise<FiliereParametre[]> {
  const [filieres, actifs, niveauxMax] = await Promise.all([
    db.filiere.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        nom: true,
        dureeAnnees: true,
        actif: true,
        _count: { select: { etudiants: true, admissions: true } },
      },
    }),
    db.etudiant.groupBy({ by: ["filiereId"], where: { statut: "ACTIF" }, _count: { _all: true } }),
    niveauxMaxParFiliere(),
  ]);
  const actifsParFiliere = new Map(actifs.map((a) => [a.filiereId, a._count._all]));

  return filieres.map((f) => ({
    id: f.id,
    code: f.code,
    nom: f.nom,
    dureeAnnees: f.dureeAnnees,
    actif: f.actif,
    etudiantsActifs: actifsParFiliere.get(f.id) ?? 0,
    etudiantsTotal: f._count.etudiants,
    codeModifiable: f._count.etudiants === 0,
    dureeMinimale: Math.max(DUREE_MIN, niveauxMax.get(f.id) ?? DUREE_MIN),
    refusSuppression: controleSuppressionFiliere({ etudiants: f._count.etudiants, admissions: f._count.admissions }),
  }));
}

export type AnneeParametre = {
  id: string;
  libelle: string;
  anneeDebut: number;
  moisDebutEcolage: number;
  /** « 2026-10-01 » */
  dateDebut: string;
  dateFin: string;
  /** « octobre 2026 → juillet 2027 » */
  periode: string;
  estCourante: boolean;
  cloturee: boolean;
  etat: EtatAnnee;
  libelleEtat: string;
  inscriptions: number;
  tarifs: number;
  /** Pour chaque action : null si permise, sinon la raison affichable. */
  refus: {
    definirCourante: string | null;
    cloturer: string | null;
    rouvrir: string | null;
    supprimer: string | null;
  };
};

export async function lireAnnees(
  aujourdhui: Date = new Date(),
): Promise<{ annees: AnneeParametre[]; anneeDebutProposee: number }> {
  const annees = await db.anneeScolaire.findMany({
    orderBy: { anneeDebut: "asc" },
    select: {
      id: true,
      libelle: true,
      anneeDebut: true,
      moisDebutEcolage: true,
      dateDebut: true,
      dateFin: true,
      estCourante: true,
      cloturee: true,
      _count: {
        select: { inscriptions: true, tarifs: true, etudiantsEntres: true, admissionsSource: true, admissionsCible: true },
      },
    },
  });

  const lignes = annees.map((a): AnneeParametre => {
    const etat = etatAnnee(a, aujourdhui);
    return {
      id: a.id,
      libelle: a.libelle,
      anneeDebut: a.anneeDebut,
      moisDebutEcolage: a.moisDebutEcolage,
      dateDebut: jourISO(a.dateDebut),
      dateFin: jourISO(a.dateFin),
      periode: periodeAnnee(a.anneeDebut, a.moisDebutEcolage),
      estCourante: a.estCourante,
      cloturee: a.cloturee,
      etat,
      libelleEtat: LIBELLE_ETAT_ANNEE[etat],
      inscriptions: a._count.inscriptions,
      tarifs: a._count.tarifs,
      refus: {
        definirCourante: controleDefinirCourante(a),
        cloturer: controleCloture(a),
        rouvrir: controleReouverture(a),
        supprimer: controleSuppressionAnnee(a, {
          inscriptions: a._count.inscriptions,
          etudiantsEntres: a._count.etudiantsEntres,
          admissions: a._count.admissionsSource + a._count.admissionsCible,
        }),
      },
    };
  });

  const derniere = annees.at(-1)?.anneeDebut;
  return { annees: lignes, anneeDebutProposee: derniere ? derniere + 1 : aujourdhui.getFullYear() };
}

export type OptionAnnee = { id: string; libelle: string; etat: EtatAnnee; libelleEtat: string };

export type CaseTarif = CaseGrille & {
  /** « 1re année » */
  libelleNiveau: string;
  /** Étudiants déjà inscrits dans cette classe : ils gardent le montant copié à leur inscription. */
  inscrits: number;
};

export type GrilleTarifsParametre = {
  annees: OptionAnnee[];
  /** null : aucune année en base, ou `anneeId` inconnu. */
  annee: (OptionAnnee & { cloturee: boolean }) | null;
  cases: CaseTarif[];
  manquants: number;
};

/** Grille de l'année demandée, sinon de l'année courante, sinon de la plus récente. */
export async function lireGrilleTarifs(
  anneeId?: string,
  aujourdhui: Date = new Date(),
): Promise<GrilleTarifsParametre> {
  const toutes = await db.anneeScolaire.findMany({
    orderBy: { anneeDebut: "asc" },
    select: { id: true, libelle: true, estCourante: true, cloturee: true, dateDebut: true },
  });
  const annees = toutes.map((a) => {
    const etat = etatAnnee(a, aujourdhui);
    return { id: a.id, libelle: a.libelle, etat, libelleEtat: LIBELLE_ETAT_ANNEE[etat], cloturee: a.cloturee };
  });
  const options: OptionAnnee[] = annees.map((a) => ({
    id: a.id,
    libelle: a.libelle,
    etat: a.etat,
    libelleEtat: a.libelleEtat,
  }));

  const choisie = anneeId
    ? annees.find((a) => a.id === anneeId)
    : (annees.find((a) => a.etat === "courante") ?? annees.at(-1));
  if (!choisie) return { annees: options, annee: null, cases: [], manquants: 0 };

  const [filieres, tarifs, inscrits] = await Promise.all([
    db.filiere.findMany({ select: { id: true, code: true, nom: true, dureeAnnees: true, actif: true } }),
    db.tarif.findMany({
      where: { anneeScolaireId: choisie.id },
      select: { filiereId: true, niveau: true, droitsInscription: true, montantMensuel: true, nombreMois: true },
    }),
    db.$queryRaw<{ filiereId: string; niveau: number; n: number }[]>`
      SELECT e."filiereId" AS "filiereId", i.niveau AS niveau, COUNT(*)::int AS n
      FROM inscription i JOIN etudiant e ON e.id = i."etudiantId"
      WHERE i."anneeScolaireId" = ${choisie.id}
      GROUP BY e."filiereId", i.niveau`,
  ]);
  const inscritsParCase = new Map(inscrits.map((l) => [`${l.filiereId}:${l.niveau}`, l.n]));
  const grille = grilleTarifs(filieres, tarifs);

  return {
    annees: options,
    annee: choisie,
    cases: grille.cases.map((c) => ({
      ...c,
      libelleNiveau: libelleNiveau(c.niveau),
      inscrits: inscritsParCase.get(`${c.filiereId}:${c.niveau}`) ?? 0,
    })),
    manquants: grille.manquants,
  };
}
