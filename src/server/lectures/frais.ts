import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { jourDeDate, jourMadagascar, type Jour } from "@/lib/dates";
import { libelleMois } from "@/lib/ecolage";
import { controleAnneeFrais, moisPossiblesFrais } from "@/lib/frais";
import { libelleNiveau } from "@/lib/parametres";

// Lecture de Paramètres › Frais, sans contrôle de rôle : la page et le layout refusent le non-admin avant de lire.

export type ClasseOption = {
  filiereId: string;
  codeFiliere: string;
  nomFiliere: string;
  niveau: number;
  /** « IF 2e année » */
  libelle: string;
};

export type FraisLigne = {
  id: string;
  libelle: string;
  montant: number;
  /** « 2027-03-01 » */
  mois: Jour;
  /** « Mars 2027 » */
  libelleMois: string;
  classes: ClasseOption[];
  /** Étudiants qui ont reçu le frais (échéances), non dues après sortie comprises. */
  etudiants: number;
  /** Somme due (échéances encore dues) et payée (paiements non annulés). */
  du: number;
  paye: number;
  /** Une ligne de paiement, même annulée : montant et mois figés, suppression impossible. */
  verrouille: boolean;
  /** Raison affichable du verrou (payé ou année clôturée), null sinon. */
  raisonVerrou: string | null;
  /** Libellé seul modifiable (payé), ou rien (année clôturée). */
  modifiable: { libelle: boolean; montantEtMois: boolean };
  supprimable: boolean;
};

export type PageFrais = {
  annees: { id: string; libelle: string; estCourante: boolean; cloturee: boolean }[];
  /** Année affichée : celle demandée, sinon la courante ; null s'il n'y a aucune année. */
  annee: { id: string; libelle: string; cloturee: boolean } | null;
  /** Création impossible (année clôturée ou plus aucun mois à venir), message à afficher. */
  refusCreation: string | null;
  /** Mois proposables : ceux de l'année à partir du mois en cours. */
  moisPossibles: { valeur: Jour; libelle: string }[];
  /** Filières actives × niveaux. */
  classes: ClasseOption[];
  /** Par ordre de création. */
  frais: FraisLigne[];
  jour: Jour;
};

const MESSAGE_PAYE = "Déjà payé par au moins un étudiant (même en partie ou par un paiement annulé) : seul le libellé peut changer.";

export async function lirePageFrais(anneeId: string | null, jour: Jour = jourMadagascar(new Date())): Promise<PageFrais> {
  const annees = await db.anneeScolaire.findMany({
    orderBy: { anneeDebut: "desc" },
    select: { id: true, libelle: true, anneeDebut: true, moisDebutEcolage: true, estCourante: true, cloturee: true },
  });
  const annee = annees.find((a) => a.id === anneeId) ?? annees.find((a) => a.estCourante) ?? annees[0] ?? null;
  const listeAnnees = annees.map((a) => ({ id: a.id, libelle: a.libelle, estCourante: a.estCourante, cloturee: a.cloturee }));
  if (!annee) return { annees: listeAnnees, annee: null, refusCreation: "Créez d'abord une année scolaire.", moisPossibles: [], classes: [], frais: [], jour };

  const [filieres, frais] = await Promise.all([
    db.filiere.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nom: true, dureeAnnees: true, actif: true } }),
    db.frais.findMany({
      where: { anneeScolaireId: annee.id },
      orderBy: { rang: "asc" },
      select: {
        id: true,
        libelle: true,
        montant: true,
        mois: true,
        classes: { select: { filiereId: true, niveau: true } },
        _count: { select: { echeances: true } },
      },
    }),
  ]);
  const ids = frais.map((f) => f.id);
  const sommes = ids.length
    ? await db.$queryRaw<{ fraisId: string; du: number; paye: number; lignes: number }[]>`
        SELECT ec."fraisId",
          COALESCE(SUM(ec."montantDu") FILTER (WHERE NOT ec."nonDueSortie"), 0)::int AS du,
          COALESCE(SUM(l.paye), 0)::int AS paye,
          COALESCE(SUM(l.lignes), 0)::int AS lignes
        FROM echeance ec
        LEFT JOIN (
          SELECT pl."echeanceId", SUM(pl.montant) FILTER (WHERE NOT p.annule) AS paye, COUNT(*) AS lignes
          FROM paiement_ligne pl JOIN paiement p ON p.id = pl."paiementId" GROUP BY pl."echeanceId"
        ) l ON l."echeanceId" = ec.id
        WHERE ec."fraisId" IN (${Prisma.join(ids)})
        GROUP BY ec."fraisId"`
    : [];
  const parFrais = new Map(sommes.map((s) => [s.fraisId, s]));

  const parFiliere = new Map(filieres.map((f) => [f.id, f]));
  const option = (filiereId: string, niveau: number): ClasseOption => {
    const f = parFiliere.get(filiereId);
    return {
      filiereId,
      codeFiliere: f?.code ?? "?",
      nomFiliere: f?.nom ?? "",
      niveau,
      libelle: `${f?.code ?? "?"} ${libelleNiveau(niveau)}`,
    };
  };
  const refusAnnee = controleAnneeFrais(annee);
  const moisPossibles = refusAnnee ? [] : moisPossiblesFrais(annee, jour);

  return {
    annees: listeAnnees,
    annee: { id: annee.id, libelle: annee.libelle, cloturee: annee.cloturee },
    refusCreation:
      refusAnnee ?? (moisPossibles.length === 0 ? `L'année ${annee.libelle} est terminée : plus aucun mois à venir pour un frais.` : null),
    moisPossibles,
    classes: filieres
      .filter((f) => f.actif)
      .flatMap((f) => Array.from({ length: f.dureeAnnees }, (_, k) => option(f.id, k + 1))),
    frais: frais.map((f): FraisLigne => {
      const s = parFrais.get(f.id);
      const paye = (s?.lignes ?? 0) > 0;
      return {
        id: f.id,
        libelle: f.libelle,
        montant: f.montant,
        mois: jourDeDate(f.mois),
        libelleMois: libelleMois(f.mois),
        classes: f.classes
          .map((c) => option(c.filiereId, c.niveau))
          .sort((a, b) => a.codeFiliere.localeCompare(b.codeFiliere) || a.niveau - b.niveau),
        etudiants: f._count.echeances,
        du: s?.du ?? 0,
        paye: s?.paye ?? 0,
        verrouille: paye,
        raisonVerrou: refusAnnee ?? (paye ? MESSAGE_PAYE : null),
        modifiable: { libelle: !refusAnnee, montantEtMois: !refusAnnee && !paye },
        supprimable: !refusAnnee && !paye,
      };
    }),
    jour,
  };
}
