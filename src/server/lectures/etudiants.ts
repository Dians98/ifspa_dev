import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { StatutEtudiant, type ModePaiement, type OperateurMobile, type Sexe, type StatutInscription, type TypeEcheance } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dateHeureMadagascar, formaterJour, jourDeDate, jourMadagascar, type Jour } from "@/lib/dates";
import {
  controleTranches,
  dateLimiteRetard,
  LIBELLE_STATUT_ECHEANCE,
  situation,
  suivreEcheance,
  TRANCHES_POSSIBLES,
  tranchesDroits,
  type NombreTranches,
  type StatutEcheance,
  type TotauxEcolage,
} from "@/lib/ecolage";
import { LIBELLE_MODE, LIBELLE_OPERATEUR } from "@/lib/encaissement";
import {
  controleTranchesModifiables,
  formaterTelephone,
  LIBELLE_SEXE,
  libelleNiveauInscription,
  libelleStatutEtudiant,
  libelleStatutInscription,
  motsRecherche,
} from "@/lib/etudiants";
import { cleCompteurMatricule, formaterMatricule } from "@/lib/matricule";
import type { EcheanceAvantSortie } from "@/lib/sorties";
import { DUREE_MAX, libelleNiveau, NOMS_MOIS, periodeAnnee, totalAnnuel } from "@/lib/parametres";
import { echeancesEtudiant, sqlDerniereInscription, sqlMotsRecherche, sqlRestes } from "@/server/ecolage";
import { aplatir, booleenOpt, entierOpt, idOpt, pageOpt, pagination, texteOpt, type Pagination, type ParamsRecherche } from "@/server/lectures/filtres";

// Lectures sans contrôle de rôle : chaque page appelle `exigerSessionPage()` avant de lire. Le jour est injectable pour les tests.

export const TAILLE_PAGE_ETUDIANTS = 25;

const schemaFiltresEtudiants = z.object({
  q: texteOpt,
  filiereId: idOpt,
  niveau: entierOpt(1, DUREE_MAX),
  anneeId: idOpt,
  statut: z.enum(StatutEtudiant).optional().catch(undefined),
  enRetard: booleenOpt,
  page: pageOpt,
});
export type FiltresEtudiants = z.output<typeof schemaFiltresEtudiants>;

export type LigneEtudiant = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  filiere: { code: string; nom: string };
  /** Inscription la plus récente ; null si l'étudiant n'en a aucune. */
  niveau: number | null;
  /** « 2e année (redoublant) » */
  libelleNiveau: string | null;
  anneeScolaire: string | null;
  statut: StatutEtudiant;
  libelleStatut: string;
  resteEnRetard: number;
  moisEnRetard: number;
  resteDu: number;
};

export type ListeEtudiants = Pagination & {
  lignes: LigneEtudiant[];
  /** Filtres reconnus, après nettoyage : à refléter dans les champs de l'écran. */
  filtres: FiltresEtudiants;
  options: {
    filieres: { id: string; code: string; nom: string; dureeAnnees: number }[];
    annees: { id: string; libelle: string; estCourante: boolean }[];
    niveauMax: number;
  };
};

type LigneSqlEtudiant = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  sexe: Sexe;
  statut: StatutEtudiant;
  filiereCode: string;
  filiereNom: string;
  niveau: number | null;
  redoublement: boolean | null;
  anneeLibelle: string | null;
  resteEnRetard: number;
  moisEnRetard: number;
  resteDu: number;
};

/**
 * Liste paginée côté serveur. `niveau` porte sur l'inscription de `anneeId` si elle est donnée,
 * sinon sur l'inscription la plus récente. « En retard » : au moins une échéance échue non soldée, toutes années.
 */
export async function lireEtudiants(
  params?: ParamsRecherche,
  jour: Jour = jourMadagascar(new Date()),
): Promise<ListeEtudiants> {
  const f = schemaFiltresEtudiants.parse(aplatir(params));
  const limite = dateLimiteRetard(jour);

  const conditions: Prisma.Sql[] = sqlMotsRecherche(motsRecherche(f.q ?? ""));
  if (f.filiereId) conditions.push(Prisma.sql`e."filiereId" = ${f.filiereId}`);
  if (f.statut) conditions.push(Prisma.sql`e.statut = ${f.statut}::"StatutEtudiant"`);
  if (f.anneeId) {
    const niveau = f.niveau ? Prisma.sql`AND i.niveau = ${f.niveau}` : Prisma.empty;
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM inscription i WHERE i."etudiantId" = e.id AND i."anneeScolaireId" = ${f.anneeId} ${niveau})`);
  } else if (f.niveau) {
    conditions.push(Prisma.sql`ins.niveau = ${f.niveau}`);
  }
  if (f.enRetard) conditions.push(Prisma.sql`COALESCE(r."resteEnRetard", 0) > 0`);
  const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

  const depuis = Prisma.sql`
    FROM etudiant e
    JOIN filiere f ON f.id = e."filiereId"
    ${sqlDerniereInscription}
    LEFT JOIN (${sqlRestes(limite, null)}) r ON r."etudiantId" = e.id
    ${where}`;

  const [[{ total }], filieres, annees] = await Promise.all([
    db.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${depuis}`,
    db.filiere.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nom: true, dureeAnnees: true } }),
    db.anneeScolaire.findMany({ orderBy: { anneeDebut: "desc" }, select: { id: true, libelle: true, estCourante: true } }),
  ]);
  const pages = pagination(total, f.page, TAILLE_PAGE_ETUDIANTS);
  const page = Math.min(f.page, pages.pages);

  const lignes = await db.$queryRaw<LigneSqlEtudiant[]>`
    SELECT e.id, e.matricule, e.nom, e.prenoms, e.sexe::text AS sexe, e.statut::text AS statut,
      f.code AS "filiereCode", f.nom AS "filiereNom", ins.niveau, ins.redoublement, ins."anneeLibelle",
      COALESCE(r."resteEnRetard", 0)::int AS "resteEnRetard",
      COALESCE(r."moisEnRetard", 0)::int AS "moisEnRetard",
      COALESCE(r."resteDu", 0)::int AS "resteDu"
    ${depuis}
    ORDER BY e.nom, e.prenoms, e.matricule
    LIMIT ${TAILLE_PAGE_ETUDIANTS} OFFSET ${(page - 1) * TAILLE_PAGE_ETUDIANTS}`;

  return {
    ...pages,
    page,
    filtres: { ...f, page },
    lignes: lignes.map((l) => ({
      id: l.id,
      matricule: l.matricule,
      nom: l.nom,
      prenoms: l.prenoms,
      filiere: { code: l.filiereCode, nom: l.filiereNom },
      niveau: l.niveau,
      libelleNiveau: l.niveau === null ? null : libelleNiveauInscription(l.niveau, l.redoublement ?? false),
      anneeScolaire: l.anneeLibelle,
      statut: l.statut,
      libelleStatut: libelleStatutEtudiant(l.statut, l.sexe),
      resteEnRetard: l.resteEnRetard,
      moisEnRetard: l.moisEnRetard,
      resteDu: l.resteDu,
    })),
    options: {
      filieres,
      annees,
      niveauMax: Math.max(1, ...filieres.map((x) => x.dureeAnnees)),
    },
  };
}

export type EcheanceFiche = {
  id: string;
  /** « Droits — tranche 2/3 », « Octobre 2026 » */
  libelle: string;
  type: TypeEcheance;
  tranche: number | null;
  /** 1er du mois d'exigibilité, « 2026-10-01 » */
  mois: Jour;
  montantDu: number;
  paye: number;
  reste: number;
  echue: boolean;
  statut: StatutEcheance;
  libelleStatut: string;
  /** Plus due après une sortie : affichée pour mémoire (reste 0, statut « à venir », libellé « Non due (sortie) »), hors totaux. */
  nonDue: boolean;
};

export const LIBELLE_NON_DUE = "Non due (sortie)";

export type InscriptionFiche = {
  id: string;
  anneeScolaireId: string;
  annee: string;
  anneeDebut: number;
  anneeCloturee: boolean;
  niveau: number;
  /** « 2e année (redoublant) » */
  libelleNiveau: string;
  redoublement: boolean;
  statut: StatutInscription;
  libelleStatut: string;
  droitsEnTranches: number;
  tranchesModifiables: boolean;
  /** Raison affichable quand les tranches ne sont plus modifiables. */
  refusTranches: string | null;
  totaux: TotauxEcolage;
  /** Dans l'ordre de solde : pour chaque mois, la tranche de droits puis la mensualité. */
  echeances: EcheanceFiche[];
};

export type PaiementFiche = {
  id: string;
  numeroRecu: string;
  dateISO: string;
  /** « 11/10/2026 » et « 10:24 », heure de Madagascar */
  date: string;
  heure: string;
  montant: number;
  mode: ModePaiement;
  modeLibelle: string;
  operateur: OperateurMobile | null;
  operateurLibelle: string | null;
  reference: string | null;
  observation: string | null;
  caissier: string;
  annule: boolean;
  annulation: { date: string; par: string; motif: string } | null;
  aVerifier: boolean;
  /** Pourquoi il est à vérifier (hors ligne : situation changée, surplus, ticket remplacé, heure du poste). */
  noteVerification: string | null;
  /** Marqué vérifié par l'admin ; la note reste lisible. */
  verification: { date: string; par: string } | null;
};

export type DossierEtudiant = {
  id: string;
  matricule: string;
  nom: string;
  prenoms: string;
  sexe: Sexe;
  libelleSexe: string;
  dateNaissance: Jour;
  /** « 01/01/2005 » */
  dateNaissanceAffichee: string;
  lieuNaissance: string;
  cin: string | null;
  telephone: string | null;
  /** « 034 12 345 67 » */
  telephoneAffiche: string | null;
  email: string | null;
  adresse: string | null;
  filiere: { id: string; code: string; nom: string; dureeAnnees: number };
  anneeEntree: string;
  statut: StatutEtudiant;
  libelleStatut: string;
  sortie: { date: Jour | null; motif: string | null } | null;
  creePar: string | null;
  /** De la plus ancienne à la plus récente. */
  parcours: InscriptionFiche[];
  /** Toutes années confondues. */
  situation: TotauxEcolage;
  /** Somme des paiements non annulés, toutes années (montants des reçus, pas des échéances). */
  totalEncaisse: number;
  /** Du plus récent au plus ancien, annulés compris. */
  paiements: PaiementFiche[];
  /** Pour l'aperçu de la fenêtre de sortie (`apercuSortie`) ; vide si l'étudiant est déjà sorti. */
  echeancesSortie: EcheanceAvantSortie[];
  jour: Jour;
};

export function paiementAffiche(p: {
  id: string;
  numeroRecu: string;
  date: Date;
  montant: number;
  mode: ModePaiement;
  operateur: OperateurMobile | null;
  reference: string | null;
  observation: string | null;
  annule: boolean;
  aVerifier: boolean;
  dateAnnulation: Date | null;
  motifAnnulation: string | null;
  saisiPar: { name: string };
  annulePar: { name: string } | null;
  noteVerification: string | null;
  dateVerification: Date | null;
  verifiePar: { name: string } | null;
}): PaiementFiche {
  const { date, heure } = dateHeureMadagascar(p.date);
  return {
    id: p.id,
    numeroRecu: p.numeroRecu,
    dateISO: p.date.toISOString(),
    date,
    heure,
    montant: p.montant,
    mode: p.mode,
    modeLibelle: LIBELLE_MODE[p.mode],
    operateur: p.operateur,
    operateurLibelle: p.operateur ? LIBELLE_OPERATEUR[p.operateur] : null,
    reference: p.reference,
    observation: p.observation,
    caissier: p.saisiPar.name,
    annule: p.annule,
    annulation: p.annule
      ? {
          date: p.dateAnnulation ? dateHeureMadagascar(p.dateAnnulation).date : "",
          par: p.annulePar?.name ?? "",
          motif: p.motifAnnulation ?? "",
        }
      : null,
    aVerifier: p.aVerifier,
    noteVerification: p.noteVerification,
    verification:
      p.dateVerification && p.verifiePar
        ? { date: dateHeureMadagascar(p.dateVerification).date, par: p.verifiePar.name }
        : null,
  };
}

export const SELECT_PAIEMENT_AFFICHE = {
  id: true,
  numeroRecu: true,
  date: true,
  montant: true,
  mode: true,
  operateur: true,
  reference: true,
  observation: true,
  annule: true,
  aVerifier: true,
  dateAnnulation: true,
  motifAnnulation: true,
  saisiPar: { select: { name: true } },
  annulePar: { select: { name: true } },
  noteVerification: true,
  dateVerification: true,
  verifiePar: { select: { name: true } },
} as const satisfies Prisma.PaiementSelect;

function totauxSeuls(t: TotauxEcolage | undefined): TotauxEcolage {
  return {
    du: t?.du ?? 0,
    paye: t?.paye ?? 0,
    reste: t?.reste ?? 0,
    resteEnRetard: t?.resteEnRetard ?? 0,
    moisEnRetard: t?.moisEnRetard ?? 0,
    duEchu: t?.duEchu ?? 0,
    payeEchu: t?.payeEchu ?? 0,
  };
}

/** Tout ce que montrent la fiche et le relevé : identité, parcours, échéances suivies, paiements. */
export async function lireDossierEtudiant(id: string, jour: Jour): Promise<DossierEtudiant | null> {
  const e = await db.etudiant.findUnique({
    where: { id },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenoms: true,
      sexe: true,
      dateNaissance: true,
      lieuNaissance: true,
      cin: true,
      telephone: true,
      email: true,
      adresse: true,
      statut: true,
      dateSortie: true,
      motifSortie: true,
      filiere: { select: { id: true, code: true, nom: true, dureeAnnees: true } },
      anneeEntree: { select: { libelle: true } },
      creePar: { select: { name: true } },
      inscriptions: {
        orderBy: { anneeScolaire: { anneeDebut: "asc" } },
        select: {
          id: true,
          niveau: true,
          redoublement: true,
          droitsEnTranches: true,
          statut: true,
          anneeScolaire: { select: { id: true, libelle: true, anneeDebut: true, cloturee: true } },
        },
      },
      paiements: { orderBy: { date: "desc" }, select: SELECT_PAIEMENT_AFFICHE },
    },
  });
  if (!e) return null;

  const [echeances, lignesDroits] = await Promise.all([
    echeancesEtudiant(db, id, { avecNonDues: true }),
    // Lignes annulées comprises : elles bloquent aussi le redécoupage des droits.
    db.$queryRaw<{ inscriptionId: string; n: number }[]>`
      SELECT ec."inscriptionId", COUNT(*)::int AS n
      FROM paiement_ligne pl JOIN echeance ec ON ec.id = pl."echeanceId" JOIN inscription i ON i.id = ec."inscriptionId"
      WHERE i."etudiantId" = ${id} AND ec.type = 'DROITS'
      GROUP BY ec."inscriptionId"`,
  ]);
  const lignesParInscription = new Map(lignesDroits.map((l) => [l.inscriptionId, l.n]));
  const sit = situation(echeances, jour);
  const parAnnee = sit.parAnnee;

  const parcours = e.inscriptions.map((i): InscriptionFiche => {
    const refusTranches = controleTranchesModifiables({
      lignesPaiementDroits: lignesParInscription.get(i.id) ?? 0,
      anneeLibelle: i.anneeScolaire.libelle,
      anneeCloturee: i.anneeScolaire.cloturee,
    });
    const totauxAnnee = parAnnee.find((a) => a.anneeDebut === i.anneeScolaire.anneeDebut);
    return {
      id: i.id,
      anneeScolaireId: i.anneeScolaire.id,
      annee: i.anneeScolaire.libelle,
      anneeDebut: i.anneeScolaire.anneeDebut,
      anneeCloturee: i.anneeScolaire.cloturee,
      niveau: i.niveau,
      libelleNiveau: libelleNiveauInscription(i.niveau, i.redoublement),
      redoublement: i.redoublement,
      statut: i.statut,
      libelleStatut: libelleStatutInscription(i.statut, e.sexe),
      droitsEnTranches: i.droitsEnTranches,
      tranchesModifiables: refusTranches === null,
      refusTranches,
      totaux: totauxSeuls(totauxAnnee),
      echeances: echeances
        .filter((x) => x.inscriptionId === i.id)
        .map((x) => {
          const s = suivreEcheance(x, jour);
          return {
            id: x.id,
            libelle: x.libelle,
            type: x.type,
            // Droits en une fois : pas de numéro de tranche à afficher.
            tranche: i.droitsEnTranches > 1 ? x.tranche : null,
            mois: jourDeDate(x.mois),
            montantDu: x.montantDu,
            paye: x.paye,
            reste: x.nonDueSortie ? 0 : s.reste,
            echue: x.nonDueSortie ? false : s.echue,
            statut: x.nonDueSortie ? "a_venir" : s.statut,
            libelleStatut: x.nonDueSortie ? LIBELLE_NON_DUE : LIBELLE_STATUT_ECHEANCE[s.statut],
            nonDue: x.nonDueSortie,
          };
        }),
    };
  });

  const dateNaissance = jourDeDate(e.dateNaissance);
  return {
    id: e.id,
    matricule: e.matricule,
    nom: e.nom,
    prenoms: e.prenoms,
    sexe: e.sexe,
    libelleSexe: LIBELLE_SEXE[e.sexe],
    dateNaissance,
    dateNaissanceAffichee: formaterJour(dateNaissance),
    lieuNaissance: e.lieuNaissance,
    cin: e.cin,
    telephone: e.telephone,
    telephoneAffiche: e.telephone ? formaterTelephone(e.telephone) : null,
    email: e.email,
    adresse: e.adresse,
    filiere: e.filiere,
    anneeEntree: e.anneeEntree.libelle,
    statut: e.statut,
    libelleStatut: libelleStatutEtudiant(e.statut, e.sexe),
    sortie:
      e.statut === "ACTIF"
        ? null
        : { date: e.dateSortie ? jourDeDate(e.dateSortie) : null, motif: e.motifSortie },
    creePar: e.creePar?.name ?? null,
    parcours,
    situation: totauxSeuls(sit),
    totalEncaisse: e.paiements.reduce((s, p) => (p.annule ? s : s + p.montant), 0),
    paiements: e.paiements.map(paiementAffiche),
    echeancesSortie:
      e.statut === "ACTIF"
        ? echeances.map((x) => ({
            id: x.id,
            mois: jourDeDate(x.mois),
            montantDu: x.montantDu,
            paye: x.paye,
            nonDueSortie: x.nonDueSortie,
            lignesNonAnnulees: x.lignesNonAnnulees,
          }))
        : [],
    jour,
  };
}

/** Fiche étudiant ; null si l'identifiant est inconnu (la page appelle `notFound()`). */
export async function lireFicheEtudiant(
  id: string,
  jour: Jour = jourMadagascar(new Date()),
): Promise<DossierEtudiant | null> {
  return lireDossierEtudiant(id, jour);
}

export type OptionTranches = {
  n: NombreTranches;
  /** Montant de chaque tranche, la 1re portant l'arrondi ; null si le découpage est impossible. */
  montants: number[] | null;
  refus: string | null;
};

export type NiveauInscription = {
  niveau: number;
  libelle: string;
  /** null : tarif manquant, l'inscription dans cette classe est bloquée. */
  tarif: { droitsInscription: number; montantMensuel: number; nombreMois: number; total: number; tranches: OptionTranches[] } | null;
};

export type ContexteInscription = {
  annee: {
    id: string;
    libelle: string;
    anneeDebut: number;
    /** « octobre 2026 → juillet 2027 » */
    periode: string;
    /** 10 = octobre */
    moisDebutEcolage: number;
    /** « octobre » */
    libelleMoisDebut: string;
    /** Mois d'exigibilité des tranches 1, 2 et 3 des droits : « octobre », « novembre », « décembre ». */
    moisTranches: string[];
  } | null;
  /** Inscription impossible (pas d'année courante, année clôturée) : message à afficher à la place du formulaire. */
  refus: string | null;
  filieres: {
    id: string;
    code: string;
    nom: string;
    dureeAnnees: number;
    /** Indicatif : le numéro définitif est attribué à l'enregistrement. */
    matriculeSuivant: string | null;
    niveaux: NiveauInscription[];
  }[];
};

/** Données du formulaire « Nouvel étudiant » : année courante, filières actives, tarifs, matricule pressenti. */
export async function contexteInscription(): Promise<ContexteInscription> {
  const annee = await db.anneeScolaire.findFirst({
    where: { estCourante: true },
    select: { id: true, libelle: true, anneeDebut: true, moisDebutEcolage: true, cloturee: true },
  });
  if (!annee) {
    return {
      annee: null,
      refus: "Aucune année scolaire courante : demandez à l'administrateur de la définir dans Paramètres › Années scolaires.",
      filieres: [],
    };
  }
  const [filieres, tarifs, compteurs] = await Promise.all([
    db.filiere.findMany({
      where: { actif: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nom: true, dureeAnnees: true },
    }),
    db.tarif.findMany({
      where: { anneeScolaireId: annee.id },
      select: { filiereId: true, niveau: true, droitsInscription: true, montantMensuel: true, nombreMois: true },
    }),
    db.compteur.findMany({ where: { cle: { startsWith: "MATRICULE:" } } }),
  ]);
  const valeurs = new Map(compteurs.map((c) => [c.cle, c.valeur]));
  // Même calendrier que `genererEcheances` : tranche k au k-ième mois à partir du début de l'écolage.
  const nomMoisDecale = (k: number) => NOMS_MOIS[(annee.moisDebutEcolage - 1 + k) % 12];

  return {
    annee: {
      id: annee.id,
      libelle: annee.libelle,
      anneeDebut: annee.anneeDebut,
      periode: periodeAnnee(annee.anneeDebut, annee.moisDebutEcolage),
      moisDebutEcolage: annee.moisDebutEcolage,
      libelleMoisDebut: nomMoisDecale(0),
      moisTranches: TRANCHES_POSSIBLES.map((_, k) => nomMoisDecale(k)),
    },
    refus: annee.cloturee
      ? `L'année ${annee.libelle} est clôturée : aucune inscription n'est possible. Demandez à l'administrateur de définir l'année courante.`
      : null,
    filieres: filieres.map((f) => ({
      ...f,
      matriculeSuivant: matriculePressenti(f.code, annee.anneeDebut, valeurs),
      niveaux: Array.from({ length: f.dureeAnnees }, (_, k) => {
        const niveau = k + 1;
        const t = tarifs.find((x) => x.filiereId === f.id && x.niveau === niveau);
        return {
          niveau,
          libelle: libelleNiveau(niveau),
          tarif: t
            ? {
                droitsInscription: t.droitsInscription,
                montantMensuel: t.montantMensuel,
                nombreMois: t.nombreMois,
                total: totalAnnuel(t),
                tranches: TRANCHES_POSSIBLES.map((n) => {
                  const refus = controleTranches(t.droitsInscription, n);
                  return { n, montants: refus ? null : tranchesDroits(t.droitsInscription, n), refus };
                }),
              }
            : null,
        };
      }),
    })),
  };
}

function matriculePressenti(code: string, anneeDebut: number, valeurs: Map<string, number>): string | null {
  try {
    return formaterMatricule(code, anneeDebut, (valeurs.get(cleCompteurMatricule(code, anneeDebut)) ?? 0) + 1);
  } catch {
    return null;
  }
}

/** Prochain matricule de la filière sur l'année courante, sans rien réserver ; null si indéterminable. */
export async function apercuMatricule(filiereId: string): Promise<string | null> {
  const [filiere, annee] = await Promise.all([
    db.filiere.findUnique({ where: { id: filiereId }, select: { code: true } }),
    db.anneeScolaire.findFirst({ where: { estCourante: true }, select: { anneeDebut: true } }),
  ]);
  if (!filiere || !annee) return null;
  const cle = cleCompteurMatricule(filiere.code, annee.anneeDebut);
  const compteur = await db.compteur.findUnique({ where: { cle } });
  return matriculePressenti(filiere.code, annee.anneeDebut, new Map([[cle, compteur?.valeur ?? 0]]));
}
